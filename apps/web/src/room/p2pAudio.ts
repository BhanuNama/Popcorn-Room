import type { DataMessage } from '@popcorn/shared';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CHUNK_SIZE = 32 * 1024;
const RELAY_CHUNK_BYTES = 9 * 1024; // ~12 KB base64 JSON — safely under LiveKit publishData 15 KB limit
const DC_HIGH_WATER = 4 * 1024 * 1024;
const DC_LOW_WATER = 512 * 1024;
const P2P_AUDIO_TIMEOUT_MS = 3500;

export interface P2PAudioCallbacks {
  send: (msg: DataMessage, to?: string) => void;
  getGuestIds: () => string[];
  onGuestAudioReady: (trackId: string, url: string) => void;
  onGuestProgress: (trackId: string, pct: number) => void;
}

interface OutboundPeer {
  id: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  sendingTrackId: string | null;
  connectTimer: number | null;
  fellBackToRelay: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x2000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Streams lossless/Hi-Fi audio files (.mp3, .flac, .wav, .m4a, .ogg) peer-to-peer over
 * ordered WebRTC DataChannels, with automatic LiveKit SFU reliable chunk-relay fallback
 * when NAT/carrier firewalls block direct ICE.
 */
export class P2PAudioManager {
  private cb: P2PAudioCallbacks;
  private hostFiles = new Map<string, { file: File; mime: string }>();
  private activeHostTrackId: string | null = null;
  private hostPeers = new Map<string, OutboundPeer>();
  private hostPeerRelayGen = new Map<string, number>();
  private activeRelays = new Map<string, string>();
  private hostSendGen = 0;

  // Guest state (shared by P2P & LiveKit SFU fallback relay)
  private guestPc: RTCPeerConnection | null = null;
  private guestDc: RTCDataChannel | null = null;
  private guestHostId: string | null = null;
  private guestPendingIce: RTCIceCandidateInit[] = [];
  private guestTrackId: string | null = null;
  private guestExpectedSize = 0;
  private guestReceivedSize = 0;
  private guestMime = 'audio/mpeg';
  private guestChunks: Uint8Array<ArrayBuffer>[] = [];
  private guestBlobUrls = new Map<string, string>();
  private guestReceivingMode: 'p2p' | 'relay' | null = null;

  constructor(callbacks: P2PAudioCallbacks) {
    this.cb = callbacks;
  }

  registerHostFile(trackId: string, file: File): string {
    const mime = file.type || guessAudioMime(file.name);
    this.hostFiles.set(trackId, { file, mime });
    return mime;
  }

  hasHostFile(trackId: string): boolean {
    return this.hostFiles.has(trackId);
  }

  getCachedGuestUrl(trackId: string): string | null {
    return this.guestBlobUrls.get(trackId) ?? null;
  }

  async broadcastTrack(trackId: string): Promise<void> {
    const entry = this.hostFiles.get(trackId);
    if (!entry) return;
    this.activeHostTrackId = trackId;
    this.hostSendGen++;

    const guests = this.cb.getGuestIds();
    await Promise.all(guests.map((peerId) => this.sendTrackToPeer(peerId, trackId, entry.file, entry.mime)));
  }

  async sendActiveToNewPeer(peerId: string): Promise<void> {
    if (!this.activeHostTrackId) return;
    await this.sendTrackByIdToPeer(peerId, this.activeHostTrackId);
  }

  async sendTrackByIdToPeer(peerId: string, trackId: string): Promise<void> {
    const entry = this.hostFiles.get(trackId);
    if (!entry) return;
    // Avoid resetting an active P2P or SFU relay transfer for the exact same peer & track
    const existing = this.hostPeers.get(peerId);
    if (existing && existing.sendingTrackId === trackId) return;
    if (this.activeRelays.get(peerId) === trackId) return;
    await this.sendTrackToPeer(peerId, trackId, entry.file, entry.mime);
  }

  private async sendTrackToPeer(peerId: string, trackId: string, file: File, mime: string): Promise<void> {
    this.closeHostPeer(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: OutboundPeer = {
      id: peerId,
      pc,
      dc: null,
      pendingIce: [],
      sendingTrackId: trackId,
      connectTimer: null,
      fellBackToRelay: false,
    };
    this.hostPeers.set(peerId, peer);

    const dc = pc.createDataChannel('orbit-music', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = DC_LOW_WATER;
    peer.dc = dc;

    const gen = this.hostSendGen;

    const fallbackToSfuRelay = () => {
      if (peer.fellBackToRelay || this.hostPeers.get(peerId) !== peer || gen !== this.hostSendGen) return;
      peer.fellBackToRelay = true;
      if (peer.connectTimer !== null) {
        window.clearTimeout(peer.connectTimer);
        peer.connectTimer = null;
      }
      this.closeHostPeer(peerId);
      void this.relayTrackViaSfu(peerId, trackId, file, mime, gen);
    };

    peer.connectTimer = window.setTimeout(() => {
      peer.connectTimer = null;
      if (dc.readyState !== 'open') {
        fallbackToSfuRelay();
      }
    }, P2P_AUDIO_TIMEOUT_MS);

    dc.onopen = () => {
      if (peer.connectTimer !== null) {
        window.clearTimeout(peer.connectTimer);
        peer.connectTimer = null;
      }
      if (!peer.fellBackToRelay) {
        void this.pumpFile(peer, trackId, file, gen);
      }
    };
    dc.onerror = () => fallbackToSfuRelay();
    pc.onicecandidate = (ev) => {
      if (ev.candidate && !peer.fellBackToRelay) {
        this.cb.send({ t: 'music-p2p-ice', to: peerId, candidate: ev.candidate.toJSON() }, peerId);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        fallbackToSfuRelay();
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!offer.sdp || this.hostPeers.get(peerId) !== peer || peer.fellBackToRelay) return;
      this.cb.send(
        {
          t: 'music-p2p-offer',
          to: peerId,
          sdp: offer.sdp,
          trackId,
          fileName: file.name,
          fileSize: file.size,
          mime,
        },
        peerId,
      );
    } catch {
      fallbackToSfuRelay();
    }
  }

  private async pumpFile(peer: OutboundPeer, trackId: string, file: File, gen: number): Promise<void> {
    const dc = peer.dc;
    if (!dc || dc.readyState !== 'open') return;
    let offset = 0;

    while (offset < file.size && gen === this.hostSendGen && dc.readyState === 'open' && !peer.fellBackToRelay) {
      if (dc.bufferedAmount > DC_HIGH_WATER) {
        await new Promise<void>((resolve) => {
          const onLow = () => {
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          dc.addEventListener('bufferedamountlow', onLow);
          window.setTimeout(onLow, 100);
        });
        continue;
      }

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const buf = await file.slice(offset, end).arrayBuffer();
      if (gen !== this.hostSendGen || dc.readyState !== 'open' || peer.fellBackToRelay) return;
      try {
        dc.send(buf);
      } catch {
        return;
      }
      offset = end;
    }

    if (gen === this.hostSendGen && dc.readyState === 'open' && peer.sendingTrackId === trackId && !peer.fellBackToRelay) {
      try {
        dc.send(JSON.stringify({ kind: 'eof', trackId }));
      } catch {}
    }
  }

  /**
   * Automatic LiveKit SFU reliable chunk-relay fallback when direct WebRTC P2P is blocked by NAT/firewalls.
   */
  private async relayTrackViaSfu(
    peerId: string,
    trackId: string,
    file: File,
    mime: string,
    gen: number,
  ): Promise<void> {
    const relayToken = (this.hostPeerRelayGen.get(peerId) ?? 0) + 1;
    this.hostPeerRelayGen.set(peerId, relayToken);
    this.activeRelays.set(peerId, trackId);

    try {
      this.cb.send(
        {
          t: 'music-relay-start',
          to: peerId,
          trackId,
          fileName: file.name,
          fileSize: file.size,
          mime,
        },
        peerId,
      );

      let offset = 0;
      let seq = 0;
      while (
        offset < file.size &&
        gen === this.hostSendGen &&
        this.hostPeerRelayGen.get(peerId) === relayToken
      ) {
        const end = Math.min(offset + RELAY_CHUNK_BYTES, file.size);
        const ab = await file.slice(offset, end).arrayBuffer();
        if (gen !== this.hostSendGen || this.hostPeerRelayGen.get(peerId) !== relayToken) return;

        this.cb.send(
          {
            t: 'music-relay-chunk',
            to: peerId,
            trackId,
            seq,
            data: bytesToBase64(new Uint8Array(ab)),
          },
          peerId,
        );

        offset = end;
        seq++;
        // Pace gently every 4 packets (~36 KB) so LiveKit SFU voice & chat remain silky-smooth
        if (seq % 4 === 0) {
          await new Promise((r) => window.setTimeout(r, 14));
        }
      }

      if (gen === this.hostSendGen && this.hostPeerRelayGen.get(peerId) === relayToken) {
        this.cb.send({ t: 'music-relay-eof', to: peerId, trackId }, peerId);
      }
    } finally {
      if (this.hostPeerRelayGen.get(peerId) === relayToken) {
        this.activeRelays.delete(peerId);
      }
    }
  }

  async handleSignal(fromId: string, msg: DataMessage): Promise<void> {
    switch (msg.t) {
      case 'music-p2p-offer': {
        if (this.guestBlobUrls.has(msg.trackId)) {
          this.cb.onGuestAudioReady(msg.trackId, this.guestBlobUrls.get(msg.trackId)!);
          return;
        }
        await this.startGuestReceive(fromId, msg.sdp, msg.trackId, msg.fileSize, msg.mime);
        break;
      }
      case 'music-p2p-answer': {
        const peer = this.hostPeers.get(fromId);
        if (!peer) return;
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        for (const c of peer.pendingIce) {
          await peer.pc.addIceCandidate(c);
        }
        peer.pendingIce = [];
        break;
      }
      case 'music-p2p-ice': {
        const peer = this.hostPeers.get(fromId);
        if (peer) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(msg.candidate);
          else peer.pendingIce.push(msg.candidate);
        } else if (this.guestPc && fromId === this.guestHostId) {
          if (this.guestPc.remoteDescription) await this.guestPc.addIceCandidate(msg.candidate);
          else this.guestPendingIce.push(msg.candidate);
        }
        break;
      }
      case 'music-relay-start': {
        if (this.guestBlobUrls.has(msg.trackId)) {
          this.cb.onGuestAudioReady(msg.trackId, this.guestBlobUrls.get(msg.trackId)!);
          return;
        }
        // Ignore stale P2P channel once host switches this track to reliable SFU relay
        this.resetGuestReceiver();
        this.guestReceivingMode = 'relay';
        this.guestHostId = fromId;
        this.guestTrackId = msg.trackId;
        this.guestExpectedSize = Math.max(1, msg.fileSize);
        this.guestReceivedSize = 0;
        this.guestMime = msg.mime;
        this.guestChunks = [];
        this.cb.onGuestProgress(msg.trackId, 1);
        break;
      }
      case 'music-relay-chunk': {
        if (this.guestReceivingMode !== 'relay' || this.guestTrackId !== msg.trackId) return;
        const bytes = base64ToBytes(msg.data);
        this.guestChunks.push(bytes);
        this.guestReceivedSize += bytes.byteLength;
        this.cb.onGuestProgress(
          msg.trackId,
          Math.min(99, Math.round((this.guestReceivedSize / this.guestExpectedSize) * 100)),
        );
        if (this.guestReceivedSize >= this.guestExpectedSize) {
          this.finalizeGuestTrack();
        }
        break;
      }
      case 'music-relay-eof': {
        if (this.guestReceivingMode === 'relay' && this.guestTrackId === msg.trackId) {
          this.finalizeGuestTrack();
        }
        break;
      }
    }
  }

  private async startGuestReceive(
    hostId: string,
    sdp: string,
    trackId: string,
    fileSize: number,
    mime: string,
  ): Promise<void> {
    this.resetGuestReceiver();
    this.guestReceivingMode = 'p2p';
    this.guestHostId = hostId;
    this.guestTrackId = trackId;
    this.guestExpectedSize = Math.max(1, fileSize);
    this.guestReceivedSize = 0;
    this.guestMime = mime;
    this.guestChunks = [];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.guestPc = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.cb.send({ t: 'music-p2p-ice', to: hostId, candidate: ev.candidate.toJSON() }, hostId);
      }
    };
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dc.binaryType = 'arraybuffer';
      this.guestDc = dc;
      dc.onmessage = (m) => {
        if (this.guestReceivingMode !== 'p2p' || this.guestTrackId !== trackId) return;
        if (typeof m.data === 'string') {
          try {
            const ctrl = JSON.parse(m.data) as { kind: string; trackId?: string };
            if (ctrl.kind === 'eof' && this.guestTrackId) {
              this.finalizeGuestTrack();
            }
          } catch {}
          return;
        }
        const ab = m.data as ArrayBuffer;
        const copy = new Uint8Array(new ArrayBuffer(ab.byteLength));
        copy.set(new Uint8Array(ab));
        this.guestChunks.push(copy);
        this.guestReceivedSize += copy.byteLength;
        if (this.guestTrackId) {
          this.cb.onGuestProgress(
            this.guestTrackId,
            Math.min(99, Math.round((this.guestReceivedSize / this.guestExpectedSize) * 100)),
          );
        }
        if (this.guestReceivedSize >= this.guestExpectedSize && this.guestTrackId) {
          this.finalizeGuestTrack();
        }
      };
    };

    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      for (const c of this.guestPendingIce) {
        await pc.addIceCandidate(c);
      }
      this.guestPendingIce = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (answer.sdp) {
        this.cb.send({ t: 'music-p2p-answer', to: hostId, sdp: answer.sdp }, hostId);
      }
    } catch {
      this.resetGuestReceiver();
    }
  }

  private finalizeGuestTrack(): void {
    const trackId = this.guestTrackId;
    if (!trackId || this.guestChunks.length === 0) return;
    if (this.guestBlobUrls.has(trackId)) return;
    const blob = new Blob(this.guestChunks, { type: this.guestMime });
    const url = URL.createObjectURL(blob);
    this.guestBlobUrls.set(trackId, url);
    this.guestChunks = [];
    this.cb.onGuestProgress(trackId, 100);
    this.cb.onGuestAudioReady(trackId, url);
  }

  private closeHostPeer(peerId: string): void {
    const peer = this.hostPeers.get(peerId);
    if (!peer) return;
    this.hostPeers.delete(peerId);
    if (peer.connectTimer !== null) {
      window.clearTimeout(peer.connectTimer);
      peer.connectTimer = null;
    }
    try { peer.dc?.close(); } catch {}
    try { peer.pc.close(); } catch {}
  }

  private resetGuestReceiver(): void {
    this.guestReceivingMode = null;
    try { this.guestDc?.close(); } catch {}
    this.guestDc = null;
    try { this.guestPc?.close(); } catch {}
    this.guestPc = null;
    this.guestHostId = null;
    this.guestPendingIce = [];
    this.guestChunks = [];
  }

  destroy(): void {
    this.hostSendGen++;
    for (const id of [...this.hostPeers.keys()]) this.closeHostPeer(id);
    this.hostPeers.clear();
    this.hostPeerRelayGen.clear();
    this.activeRelays.clear();
    this.hostFiles.clear();
    this.activeHostTrackId = null;
    this.resetGuestReceiver();
    for (const url of this.guestBlobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.guestBlobUrls.clear();
  }
}

export function isAudioDropCandidate(file: File): boolean {
  return (
    file.type.startsWith('audio/') ||
    /\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$/i.test(file.name)
  );
}

function guessAudioMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg';
  return 'audio/mpeg';
}
