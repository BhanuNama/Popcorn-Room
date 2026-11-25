import { createFile, type ISOFile, type Movie, type MP4BoxBuffer } from 'mp4box';
import type { DataMessage } from '@popcorn/shared';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CHUNK_PAYLOAD_BYTES = 32 * 1024; // 32 KB safe SCTP chunk size
const HEADER_BYTES = 13; // [1B type][4B trackId][4B msgId][2B chunkIdx][2B totalChunks]
const FILE_READ_BYTES = 1024 * 1024; // 1 MB progressive slice
const DC_HIGH_WATER = 8 * 1024 * 1024;
const DC_LOW_WATER = 2 * 1024 * 1024;
const BUFFER_AHEAD_HIGH_S = 22;
const BUFFER_AHEAD_LOW_S = 14;
const EVICT_BEHIND_S = 28;
const EVICT_KEEP_S = 22;
const P2P_CONNECT_TIMEOUT_MS = 4500;

const MSG_CONTROL = 0x01;
const MSG_INIT = 0x02;
const MSG_MEDIA = 0x03;

type TrackMeta = {
  id: number;
  type: 'video' | 'audio';
  mime: string;
};

type ControlPayload =
  | { kind: 'tracks'; tracks: TrackMeta[]; duration: number }
  | { kind: 'seek'; time: number }
  | { kind: 'flow'; pause: boolean }
  | { kind: 'eof' }
  | { kind: 'unsupported' };

interface HostPeer {
  id: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pausedByGuest: boolean;
  initSent: boolean;
  pendingIce: RTCIceCandidateInit[];
}

export interface P2PMovieCallbacks {
  send: (msg: DataMessage, to?: string) => void;
  getGuestIds: () => string[];
  onHostFallback: () => void;
  onGuestFallback: () => void;
  onGuestStateChange: (active: boolean) => void;
}

export function isP2PMovieCandidate(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.mp4') ||
    name.endsWith('.m4v') ||
    name.endsWith('.mov') ||
    file.type === 'video/mp4' ||
    file.type === 'video/quicktime'
  );
}

/**
 * Manages direct WebRTC RTCDataChannel fMP4 streaming for Local Movie Drop:
 * - Host progressively parses an MP4/MOV via mp4box.js without loading it all into RAM.
 * - Guests receive init + media segments into a MediaSource (MSE) buffer (~15-22s lookahead)
 *   and automatically evict watched buffer behind the playhead.
 * - Falls back seamlessly to LiveKit captureStream() if container/codec or NAT blocks P2P.
 */
export class P2PMovieManager {
  private cb: P2PMovieCallbacks;

  // Host state
  private hostFile: File | null = null;
  private mp4: ISOFile | null = null;
  private hostTracks: TrackMeta[] = [];
  private hostInitBuffers = new Map<number, ArrayBuffer>();
  private hostDuration = 0;
  private hostOffset = 0;
  private hostSeekGen = 0;
  private hostSeekedInOnReady = false;
  private hostStartedSegmentation = false;
  private hostReading = false;
  private hostEof = false;
  private hostFallbackTriggered = false;
  private hostPeers = new Map<string, HostPeer>();
  private nextMsgId = 1;
  private readPumpTimer: number | null = null;

  // Guest state
  private guestPc: RTCPeerConnection | null = null;
  private guestDc: RTCDataChannel | null = null;
  private guestPendingIce: RTCIceCandidateInit[] = [];
  private guestVideo: HTMLVideoElement | null = null;
  private mediaSource: MediaSource | null = null;
  private objectUrl: string | null = null;
  private sourceBuffers = new Map<number, SourceBuffer>();
  private appendQueues = new Map<number, ArrayBuffer[]>();
  private reassembly = new Map<number, { total: number; received: number; parts: Uint8Array[] }>();
  private guestFlowPaused = false;
  private guestTimeoutTimer: number | null = null;
  private guestFallbackTriggered = false;
  private guestActive = false;
  private guestTimeUpdateHandler: (() => void) | null = null;

  constructor(callbacks: P2PMovieCallbacks) {
    this.cb = callbacks;
  }

  isHostActive(): boolean {
    return this.hostFile !== null && !this.hostFallbackTriggered;
  }

  isGuestActive(): boolean {
    return this.guestActive;
  }

  // ---------------------------------------------------------------------------
  // Host API
  // ---------------------------------------------------------------------------

  hostStart(file: File): boolean {
    this.stopHost();

    if (!isP2PMovieCandidate(file)) {
      console.info('[P2P Movie] Host skipped P2P (non-MP4/MOV):', file.name, file.type);
      this.hostFallbackTriggered = true;
      this.cb.send({ t: 'p2p-fallback' });
      this.cb.onHostFallback();
      return false;
    }

    this.hostFile = file;
    this.hostFallbackTriggered = false;
    this.hostOffset = 0;
    this.hostSeekedInOnReady = false;
    this.hostStartedSegmentation = false;
    this.hostEof = false;
    this.hostTracks = [];
    this.hostInitBuffers.clear();

    const mp4 = createFile();
    this.mp4 = mp4;

    mp4.onError = (e: unknown) => {
      console.warn('[P2P Movie] mp4box error, falling back:', e);
      this.triggerHostFallback();
    };

    mp4.onReady = (info: Movie) => {
      if (this.mp4 !== mp4 || this.hostFallbackTriggered) return;

      const vTrack = info.videoTracks[0];
      const aTrack = info.audioTracks[0];
      if (!vTrack) {
        this.triggerHostFallback();
        return;
      }

      this.hostDuration = info.timescale > 0 ? info.duration / info.timescale : 0;
      const segOpts = { nbSamples: 30, rapAlignement: true };
      const candidateTracks: TrackMeta[] = [
        { id: vTrack.id, type: 'video', mime: `video/mp4; codecs="${vTrack.codec}"` },
      ];
      mp4.setSegmentOptions(vTrack.id, null, segOpts);

      if (aTrack) {
        candidateTracks.push({ id: aTrack.id, type: 'audio', mime: `audio/mp4; codecs="${aTrack.codec}"` });
        mp4.setSegmentOptions(aTrack.id, null, segOpts);
      }

      const initSegs = mp4.initializeSegmentation('per-track');
      for (const seg of initSegs) {
        this.hostInitBuffers.set(seg.id, seg.buffer);
      }
      this.hostTracks = candidateTracks.filter((t) => this.hostInitBuffers.has(t.id));
      if (this.hostTracks.length === 0) {
        this.triggerHostFallback();
        return;
      }
      console.info('[P2P Movie] Host mp4 ready:', this.hostTracks, 'guests:', this.cb.getGuestIds());

      // Reset read cursor to sample 0's mdat offset so moov-at-end or pre-moov mdat
      // is never skipped, and defer mp4.start() until a peer DataChannel opens.
      const seekRes = mp4.seek(0, true);
      this.hostOffset = seekRes.offset;
      this.hostEof = false;
      this.hostSeekedInOnReady = true;

      this.cb.send({
        t: 'p2p-ready',
        fileName: file.name,
        fileSize: file.size,
        duration: this.hostDuration,
      });

      for (const peerId of this.cb.getGuestIds()) {
        void this.connectPeer(peerId);
      }
    };

    mp4.onSegment = (id: number, _user: unknown, buffer: ArrayBuffer) => {
      if (this.mp4 !== mp4 || this.hostFallbackTriggered) return;
      this.broadcastBinaryFrame(MSG_MEDIA, id, buffer);
    };

    // Kick off initial header parse
    void this.pumpHostFileRead();
    return true;
  }

  async connectPeer(peerId: string): Promise<void> {
    if (!this.hostFile || this.hostFallbackTriggered) return;
    if (this.hostPeers.has(peerId)) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: HostPeer = {
      id: peerId,
      pc,
      dc: null,
      pausedByGuest: false,
      initSent: false,
      pendingIce: [],
    };
    this.hostPeers.set(peerId, peer);

    const dc = pc.createDataChannel('orbit-movie', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = DC_LOW_WATER;
    peer.dc = dc;

    dc.onopen = () => {
      console.info('[P2P Movie] Host DataChannel open to', peerId);
      this.sendInitToPeer(peer);
      if (this.mp4 && !this.hostStartedSegmentation) {
        this.hostStartedSegmentation = true;
        const seekRes = this.mp4.seek(0, true);
        this.hostOffset = seekRes.offset;
        this.hostEof = false;
        this.mp4.start();
      }
      this.schedulePump();
    };
    dc.onbufferedamountlow = () => {
      this.schedulePump();
    };
    dc.onmessage = (ev) => {
      if (typeof ev.data === 'string') return;
      const bytes = new Uint8Array(ev.data as ArrayBuffer);
      if (bytes[0] !== MSG_CONTROL) return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(bytes.subarray(1))) as ControlPayload;
        if (msg.kind === 'flow') {
          peer.pausedByGuest = msg.pause;
          if (!msg.pause) this.schedulePump();
        } else if (msg.kind === 'unsupported') {
          this.triggerHostFallback();
        }
      } catch {
        // Ignore malformed control payload
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.cb.send(
          {
            t: 'p2p-ice',
            to: peerId,
            candidate: ev.candidate.toJSON(),
          },
          peerId,
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.warn('[P2P Movie] Host PC state:', pc.connectionState, peerId);
        this.closeHostPeer(peerId);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!offer.sdp || this.hostFallbackTriggered) return;
      this.cb.send(
        {
          t: 'p2p-offer',
          to: peerId,
          sdp: offer.sdp,
          fileName: this.hostFile.name,
          fileSize: this.hostFile.size,
        },
        peerId,
      );
    } catch {
      this.triggerHostFallback();
    }
  }

  hostSeek(timeSec: number): void {
    if (!this.mp4 || !this.hostFile || this.hostFallbackTriggered) return;
    this.hostSeekGen++;
    this.mp4.stop();
    const res = this.mp4.seek(Math.max(0, timeSec), true);
    this.hostOffset = res.offset;
    this.hostEof = false;

    for (const peer of this.hostPeers.values()) {
      peer.pausedByGuest = false;
    }
    this.broadcastControl({ kind: 'seek', time: timeSec });
    if (this.hostStartedSegmentation) {
      this.mp4.start();
    }
    this.schedulePump();
  }

  stopHost(): void {
    if (this.readPumpTimer !== null) {
      window.clearTimeout(this.readPumpTimer);
      this.readPumpTimer = null;
    }
    for (const id of [...this.hostPeers.keys()]) {
      this.closeHostPeer(id);
    }
    this.hostPeers.clear();
    if (this.mp4) {
      try {
        this.mp4.stop();
      } catch {
        // Ignore
      }
      this.mp4 = null;
    }
    this.hostFile = null;
    this.hostTracks = [];
    this.hostInitBuffers.clear();
    this.hostOffset = 0;
    this.hostSeekGen++;
    this.hostSeekedInOnReady = false;
    this.hostStartedSegmentation = false;
    this.hostReading = false;
    this.hostEof = false;
    this.hostFallbackTriggered = false;
  }

  private closeHostPeer(peerId: string): void {
    const peer = this.hostPeers.get(peerId);
    if (!peer) return;
    this.hostPeers.delete(peerId);
    try {
      peer.dc?.close();
    } catch {
      // Ignore
    }
    try {
      peer.pc.close();
    } catch {
      // Ignore
    }
  }

  private sendInitToPeer(peer: HostPeer): void {
    if (peer.initSent || !peer.dc || peer.dc.readyState !== 'open') return;
    if (this.hostTracks.length === 0) return;

    peer.initSent = true;
    this.sendControlToPeer(peer, {
      kind: 'tracks',
      tracks: this.hostTracks,
      duration: this.hostDuration,
    });
    for (const track of this.hostTracks) {
      const buf = this.hostInitBuffers.get(track.id);
      if (buf) {
        this.sendBinaryFrameToPeer(peer, MSG_INIT, track.id, buf);
      }
    }
  }

  private triggerHostFallback(): void {
    if (this.hostFallbackTriggered) return;
    this.hostFallbackTriggered = true;
    this.stopHost();
    this.hostFallbackTriggered = true; // keep flag set after stopHost
    this.cb.send({ t: 'p2p-fallback' });
    this.cb.onHostFallback();
  }

  private canPumpMore(): boolean {
    if (this.hostEof || !this.hostFile || !this.mp4 || this.hostFallbackTriggered) return false;
    // Before moov is parsed, keep reading headers
    if (this.hostTracks.length === 0) return true;
    if (this.hostPeers.size === 0) return false;

    for (const peer of this.hostPeers.values()) {
      if (
        peer.dc?.readyState === 'open' &&
        !peer.pausedByGuest &&
        peer.dc.bufferedAmount < DC_HIGH_WATER
      ) {
        return true;
      }
    }
    return false;
  }

  private schedulePump(): void {
    if (this.readPumpTimer !== null || this.hostReading) return;
    if (!this.canPumpMore()) return;
    this.readPumpTimer = window.setTimeout(() => {
      this.readPumpTimer = null;
      void this.pumpHostFileRead();
    }, 0);
  }

  private async pumpHostFileRead(): Promise<void> {
    if (this.hostReading || !this.hostFile || !this.mp4 || this.hostFallbackTriggered) return;
    if (!this.canPumpMore()) return;

    this.hostReading = true;
    const gen = this.hostSeekGen;
    try {
      while (
        this.canPumpMore() &&
        this.hostFile &&
        this.mp4 &&
        !this.hostFallbackTriggered &&
        gen === this.hostSeekGen
      ) {
        if (this.hostOffset >= this.hostFile.size) {
          this.hostEof = true;
          this.mp4.flush();
          this.broadcastControl({ kind: 'eof' });
          break;
        }

        const end = Math.min(this.hostOffset + FILE_READ_BYTES, this.hostFile.size);
        const ab = await this.hostFile.slice(this.hostOffset, end).arrayBuffer();
        if (!this.mp4 || this.hostFallbackTriggered || gen !== this.hostSeekGen) break;

        const mp4Buf = ab as MP4BoxBuffer;
        mp4Buf.fileStart = this.hostOffset;
        this.hostSeekedInOnReady = false;
        const nextOffset = this.mp4.appendBuffer(mp4Buf);
        if (!this.hostSeekedInOnReady) {
          this.hostOffset = nextOffset > this.hostOffset ? nextOffset : end;
        }
        this.hostSeekedInOnReady = false;

        // Yield between slices so DataChannel & UI stay responsive
        await new Promise((r) => window.setTimeout(r, 4));
      }
    } catch {
      this.triggerHostFallback();
    } finally {
      this.hostReading = false;
      if (gen !== this.hostSeekGen && !this.hostFallbackTriggered) {
        this.schedulePump();
      }
    }
  }

  private sendControlToPeer(peer: HostPeer, payload: ControlPayload): void {
    if (!peer.dc || peer.dc.readyState !== 'open') return;
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const pkt = new Uint8Array(1 + json.length);
    pkt[0] = MSG_CONTROL;
    pkt.set(json, 1);
    try {
      peer.dc.send(pkt);
    } catch {
      // Ignore closed channel
    }
  }

  private broadcastControl(payload: ControlPayload): void {
    for (const peer of this.hostPeers.values()) {
      this.sendControlToPeer(peer, payload);
    }
  }

  private sendBinaryFrameToPeer(
    peer: HostPeer,
    msgType: number,
    trackId: number,
    buffer: ArrayBuffer,
  ): void {
    if (!peer.dc || peer.dc.readyState !== 'open') return;
    const src = new Uint8Array(buffer);
    const totalChunks = Math.max(1, Math.ceil(src.byteLength / CHUNK_PAYLOAD_BYTES));
    const msgId = this.nextMsgId++ >>> 0;

    for (let idx = 0; idx < totalChunks; idx++) {
      const start = idx * CHUNK_PAYLOAD_BYTES;
      const end = Math.min(start + CHUNK_PAYLOAD_BYTES, src.byteLength);
      const slice = src.subarray(start, end);
      const pkt = new Uint8Array(HEADER_BYTES + slice.byteLength);
      const view = new DataView(pkt.buffer);
      pkt[0] = msgType;
      view.setUint32(1, trackId, false);
      view.setUint32(5, msgId, false);
      view.setUint16(9, idx, false);
      view.setUint16(11, totalChunks, false);
      pkt.set(slice, HEADER_BYTES);
      try {
        peer.dc.send(pkt);
      } catch {
        break;
      }
    }
  }

  private broadcastBinaryFrame(msgType: number, trackId: number, buffer: ArrayBuffer): void {
    for (const peer of this.hostPeers.values()) {
      if (!peer.initSent) this.sendInitToPeer(peer);
      this.sendBinaryFrameToPeer(peer, msgType, trackId, buffer);
    }
  }

  // ---------------------------------------------------------------------------
  // Guest API & Signaling
  // ---------------------------------------------------------------------------

  attachGuestVideo(video: HTMLVideoElement | null): void {
    if (this.guestVideo === video) return;
    if (this.guestVideo && this.guestTimeUpdateHandler) {
      this.guestVideo.removeEventListener('timeupdate', this.guestTimeUpdateHandler);
    }
    this.guestVideo = video;
    if (video && this.objectUrl) {
      video.src = this.objectUrl;
    }
    if (video) {
      this.guestTimeUpdateHandler = () => this.onGuestTimeUpdate();
      video.addEventListener('timeupdate', this.guestTimeUpdateHandler);
    } else {
      this.guestTimeUpdateHandler = null;
    }
  }

  async handleSignal(fromId: string, msg: DataMessage): Promise<void> {
    switch (msg.t) {
      case 'p2p-ready': {
        this.resetGuest();
        if (typeof MediaSource === 'undefined') {
          this.triggerGuestFallback();
          return;
        }
        this.startGuestTimeout();
        break;
      }
      case 'p2p-offer': {
        await this.handleGuestOffer(fromId, msg.sdp);
        break;
      }
      case 'p2p-answer': {
        const peer = this.hostPeers.get(fromId);
        if (!peer) return;
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        for (const cand of peer.pendingIce) {
          await peer.pc.addIceCandidate(cand);
        }
        peer.pendingIce = [];
        break;
      }
      case 'p2p-ice': {
        const peer = this.hostPeers.get(fromId);
        if (peer) {
          if (peer.pc.remoteDescription) {
            await peer.pc.addIceCandidate(msg.candidate);
          } else {
            peer.pendingIce.push(msg.candidate);
          }
        } else if (this.guestPc) {
          if (this.guestPc.remoteDescription) {
            await this.guestPc.addIceCandidate(msg.candidate);
          } else {
            this.guestPendingIce.push(msg.candidate);
          }
        }
        break;
      }
      case 'p2p-fallback': {
        if (this.isHostActive()) {
          this.triggerHostFallback();
        } else {
          this.resetGuest();
          this.cb.onGuestFallback();
        }
        break;
      }
    }
  }

  private startGuestTimeout(): void {
    if (this.guestTimeoutTimer !== null) {
      window.clearTimeout(this.guestTimeoutTimer);
    }
    this.guestTimeoutTimer = window.setTimeout(() => {
      this.guestTimeoutTimer = null;
      if (!this.guestActive && !this.guestFallbackTriggered) {
        console.warn('[P2P Movie] Guest P2P timed out after 4.5s, falling back');
        this.triggerGuestFallback();
      }
    }, P2P_CONNECT_TIMEOUT_MS);
  }

  private async handleGuestOffer(hostId: string, sdp: string): Promise<void> {
    if (this.guestPc) {
      this.resetGuest();
    }
    if (typeof MediaSource === 'undefined') {
      this.triggerGuestFallback();
      return;
    }
    this.startGuestTimeout();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.guestPc = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.cb.send(
          {
            t: 'p2p-ice',
            to: hostId,
            candidate: ev.candidate.toJSON(),
          },
          hostId,
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.triggerGuestFallback();
      }
    };

    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dc.binaryType = 'arraybuffer';
      this.guestDc = dc;

      dc.onmessage = (msgEv) => {
        if (typeof msgEv.data === 'string') return;
        this.handleGuestPacket(new Uint8Array(msgEv.data as ArrayBuffer));
      };
      dc.onclose = () => {
        if (!this.guestFallbackTriggered && this.guestActive) {
          this.setGuestActive(false);
        }
      };
    };

    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      for (const cand of this.guestPendingIce) {
        await pc.addIceCandidate(cand);
      }
      this.guestPendingIce = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (answer.sdp) {
        this.cb.send({ t: 'p2p-answer', to: hostId, sdp: answer.sdp }, hostId);
      }
    } catch {
      this.triggerGuestFallback();
    }
  }

  private handleGuestPacket(pkt: Uint8Array): void {
    if (pkt.byteLength < 1) return;
    const type = pkt[0];

    if (type === MSG_CONTROL) {
      try {
        const msg = JSON.parse(new TextDecoder().decode(pkt.subarray(1))) as ControlPayload;
        this.handleGuestControl(msg);
      } catch {
        // Ignore
      }
      return;
    }

    if ((type === MSG_INIT || type === MSG_MEDIA) && pkt.byteLength >= HEADER_BYTES) {
      const view = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
      const trackId = view.getUint32(1, false);
      const msgId = view.getUint32(5, false);
      const chunkIdx = view.getUint16(9, false);
      const totalChunks = view.getUint16(11, false);
      const payload = pkt.subarray(HEADER_BYTES);

      if (totalChunks <= 1) {
        const copy = new Uint8Array(payload.byteLength);
        copy.set(payload);
        this.enqueueTrackSegment(trackId, copy.buffer);
        return;
      }

      let entry = this.reassembly.get(msgId);
      if (!entry) {
        entry = { total: totalChunks, received: 0, parts: new Array<Uint8Array>(totalChunks) };
        this.reassembly.set(msgId, entry);
      }
      if (!entry.parts[chunkIdx]) {
        const copy = new Uint8Array(payload.byteLength);
        copy.set(payload);
        entry.parts[chunkIdx] = copy;
        entry.received++;
      }
      if (entry.received === entry.total) {
        this.reassembly.delete(msgId);
        let totalLen = 0;
        for (const part of entry.parts) totalLen += part.byteLength;
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const part of entry.parts) {
          merged.set(part, offset);
          offset += part.byteLength;
        }
        this.enqueueTrackSegment(trackId, merged.buffer);
      }
    }
  }

  private handleGuestControl(msg: ControlPayload): void {
    switch (msg.kind) {
      case 'tracks': {
        console.info('[P2P Movie] Guest received tracks:', msg.tracks);
        for (const t of msg.tracks) {
          if (!MediaSource.isTypeSupported(t.mime)) {
            console.warn('[P2P Movie] Unsupported MSE codec, falling back:', t.mime);
            this.sendGuestControl({ kind: 'unsupported' });
            this.triggerGuestFallback();
            return;
          }
        }
        this.setupMediaSource(msg.tracks, msg.duration);
        break;
      }
      case 'seek': {
        this.flushGuestBuffers();
        if (this.guestVideo) {
          this.guestVideo.currentTime = msg.time;
        }
        this.guestFlowPaused = false;
        this.sendGuestControl({ kind: 'flow', pause: false });
        break;
      }
      case 'eof': {
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
          const anyUpdating = [...this.sourceBuffers.values()].some((sb) => sb.updating);
          if (!anyUpdating) {
            try {
              this.mediaSource.endOfStream();
            } catch {
              // Ignore if buffers still busy
            }
          }
        }
        break;
      }
    }
  }

  private setupMediaSource(tracks: TrackMeta[], duration: number): void {
    if (this.guestTimeoutTimer !== null) {
      window.clearTimeout(this.guestTimeoutTimer);
      this.guestTimeoutTimer = null;
    }

    const ms = new MediaSource();
    this.mediaSource = ms;
    const url = URL.createObjectURL(ms);
    this.objectUrl = url;

    ms.addEventListener(
      'sourceopen',
      () => {
        if (this.mediaSource !== ms) return;
        console.info('[P2P Movie] Guest MediaSource opened, tracks:', tracks.length);
        if (duration > 0 && Number.isFinite(duration)) {
          try {
            ms.duration = duration;
          } catch {
            // Ignore
          }
        }
        for (const t of tracks) {
          try {
            const sb = ms.addSourceBuffer(t.mime);
            this.sourceBuffers.set(t.id, sb);
            if (!this.appendQueues.has(t.id)) {
              this.appendQueues.set(t.id, []);
            }
            sb.addEventListener('updateend', () => {
              this.evictOldBuffer(sb);
              this.drainAppendQueue(t.id);
              this.checkGuestBackpressure();
            });
            this.drainAppendQueue(t.id);
          } catch (err) {
            console.warn('[P2P Movie] addSourceBuffer failed:', t.mime, err);
            this.sendGuestControl({ kind: 'unsupported' });
            this.triggerGuestFallback();
            return;
          }
        }
        this.setGuestActive(true);
      },
      { once: true },
    );

    if (this.guestVideo) {
      this.guestVideo.src = url;
    } else {
      this.setGuestActive(true);
    }
  }

  private enqueueTrackSegment(trackId: number, buffer: ArrayBuffer): void {
    let queue = this.appendQueues.get(trackId);
    if (!queue) {
      queue = [];
      this.appendQueues.set(trackId, queue);
    }
    queue.push(buffer);
    this.drainAppendQueue(trackId);
  }

  private drainAppendQueue(trackId: number): void {
    const sb = this.sourceBuffers.get(trackId);
    const queue = this.appendQueues.get(trackId);
    if (!sb || !queue || queue.length === 0 || sb.updating) return;
    if (!this.mediaSource || this.mediaSource.readyState !== 'open') return;

    const next = queue.shift()!;
    try {
      sb.appendBuffer(next);
    } catch {
      // QuotaExceededError -> evict aggressively and retry once
      this.evictOldBuffer(sb, true);
      queue.unshift(next);
    }
  }

  private flushGuestBuffers(): void {
    this.reassembly.clear();
    for (const [trackId, sb] of this.sourceBuffers) {
      this.appendQueues.set(trackId, []);
      try {
        if (sb.updating) sb.abort();
        if (sb.buffered.length > 0 && this.mediaSource?.readyState === 'open') {
          sb.remove(0, Infinity);
        }
      } catch {
        // Ignore
      }
    }
  }

  private evictOldBuffer(sb: SourceBuffer, aggressive = false): void {
    if (sb.updating || !this.guestVideo || sb.buffered.length === 0) return;
    const now = this.guestVideo.currentTime;
    const start = sb.buffered.start(0);
    const threshold = aggressive ? 8 : EVICT_BEHIND_S;
    const keep = aggressive ? 4 : EVICT_KEEP_S;
    if (now - start > threshold) {
      try {
        sb.remove(0, Math.max(0, now - keep));
      } catch {
        // Ignore
      }
    }
  }

  private onGuestTimeUpdate(): void {
    this.checkGuestBackpressure();
    for (const sb of this.sourceBuffers.values()) {
      this.evictOldBuffer(sb);
    }
  }

  private checkGuestBackpressure(): void {
    if (!this.guestVideo || this.sourceBuffers.size === 0) return;
    const now = this.guestVideo.currentTime;
    let minAhead = Infinity;
    for (const sb of this.sourceBuffers.values()) {
      let sbAhead = 0;
      for (let i = 0; i < sb.buffered.length; i++) {
        const s = sb.buffered.start(i);
        const e = sb.buffered.end(i);
        if (now >= s - 1 && now <= e) {
          sbAhead = Math.max(0, e - now);
          break;
        }
      }
      minAhead = Math.min(minAhead, sbAhead);
    }
    if (!Number.isFinite(minAhead)) return;

    if (!this.guestFlowPaused && minAhead >= BUFFER_AHEAD_HIGH_S) {
      this.guestFlowPaused = true;
      this.sendGuestControl({ kind: 'flow', pause: true });
    } else if (this.guestFlowPaused && minAhead <= BUFFER_AHEAD_LOW_S) {
      this.guestFlowPaused = false;
      this.sendGuestControl({ kind: 'flow', pause: false });
    }
  }

  private sendGuestControl(payload: ControlPayload): void {
    if (!this.guestDc || this.guestDc.readyState !== 'open') return;
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const pkt = new Uint8Array(1 + json.length);
    pkt[0] = MSG_CONTROL;
    pkt.set(json, 1);
    try {
      this.guestDc.send(pkt);
    } catch {
      // Ignore
    }
  }

  private setGuestActive(active: boolean): void {
    if (this.guestActive === active) return;
    this.guestActive = active;
    this.cb.onGuestStateChange(active);
  }

  private triggerGuestFallback(): void {
    if (this.guestFallbackTriggered) return;
    this.guestFallbackTriggered = true;
    this.resetGuest();
    this.guestFallbackTriggered = true;
    this.cb.send({ t: 'p2p-fallback' });
    this.cb.onGuestFallback();
  }

  resetGuest(): void {
    if (this.guestTimeoutTimer !== null) {
      window.clearTimeout(this.guestTimeoutTimer);
      this.guestTimeoutTimer = null;
    }
    this.guestFallbackTriggered = false;
    this.guestFlowPaused = false;
    this.reassembly.clear();
    this.appendQueues.clear();
    this.sourceBuffers.clear();
    this.guestPendingIce = [];

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    if (this.guestVideo && this.guestVideo.src.startsWith('blob:')) {
      this.guestVideo.removeAttribute('src');
      this.guestVideo.load();
    }
    try {
      this.guestDc?.close();
    } catch {
      // Ignore
    }
    this.guestDc = null;
    try {
      this.guestPc?.close();
    } catch {
      // Ignore
    }
    this.guestPc = null;
    this.setGuestActive(false);
  }

  destroy(): void {
    this.stopHost();
    this.resetGuest();
    this.attachGuestVideo(null);
  }
}
