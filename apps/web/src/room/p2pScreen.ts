import type { DataMessage } from '@popcorn/shared';
import { mungeVideoBitrate, startBitrateAutopilot } from './bitrate';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const DIRECT_CONNECT_TIMEOUT_MS = 3800;

export interface DirectScreenCallbacks {
  send: (msg: DataMessage, to?: string) => void;
  onHostStreamChange: (stream: MediaStream | null) => void;
  onHostPromoteToSfu: (stream: MediaStream) => void;
  onGuestStreamChange: (stream: MediaStream | null, sharerId: string) => void;
}

/**
 * 2-Person Direct P2P Screen Share Fast-Path:
 * - Bypasses LiveKit Cloud SFU when only 1 guest is in the room (~10-20ms LAN/P2P latency).
 * - Automatically promotes the already-captured MediaStream to LiveKit SFU (with Simulcast)
 *   if a 3rd person joins mid-share or if direct ICE fails — zero second picker prompt.
 */
export class DirectScreenShareManager {
  private cb: DirectScreenCallbacks;

  // Host state
  private hostPc: RTCPeerConnection | null = null;
  private hostTargetId: string | null = null;
  private hostStream: MediaStream | null = null;
  private hostPendingIce: RTCIceCandidateInit[] = [];
  private hostAutopilotStop: (() => void) | null = null;
  private hostConnectTimer: number | null = null;
  private hostPromoted = false;

  // Guest state
  private guestPc: RTCPeerConnection | null = null;
  private guestSharerId: string | null = null;
  private guestStream: MediaStream | null = null;
  private guestPendingIce: RTCIceCandidateInit[] = [];

  constructor(callbacks: DirectScreenCallbacks) {
    this.cb = callbacks;
  }

  isHostActive(): boolean {
    return this.hostStream !== null && !this.hostPromoted;
  }

  getHostStream(): MediaStream | null {
    return this.hostStream;
  }

  getGuestStream(): { stream: MediaStream; sharerId: string } | null {
    if (!this.guestStream || !this.guestSharerId) return null;
    return { stream: this.guestStream, sharerId: this.guestSharerId };
  }

  async startHost(
    stream: MediaStream,
    targetPeerId: string,
    opts: { targetBitrate: number; targetFps: number },
  ): Promise<void> {
    this.stopHost(false);
    this.hostStream = stream;
    this.hostTargetId = targetPeerId;
    this.hostPromoted = false;
    this.hostPendingIce = [];
    this.cb.onHostStreamChange(stream);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.hostPc = pc;

    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (params.encodings?.length) {
            params.encodings[0].maxBitrate = opts.targetBitrate;
            params.encodings[0].maxFramerate = opts.targetFps;
            params.encodings[0].priority = 'high';
            params.degradationPreference = 'maintain-framerate';
            await sender.setParameters(params);
          }
        } catch {
          // Safe fallback if browser restricts sender mutations
        }
        this.hostAutopilotStop?.();
        this.hostAutopilotStop = startBitrateAutopilot(sender, opts.targetBitrate, opts.targetFps);
      }
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.hostTargetId) {
        this.cb.send(
          { t: 'p2p-screen-ice', to: this.hostTargetId, candidate: ev.candidate.toJSON() },
          this.hostTargetId,
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (this.hostConnectTimer !== null) {
          window.clearTimeout(this.hostConnectTimer);
          this.hostConnectTimer = null;
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.promoteHostToSfu();
      }
    };

    this.hostConnectTimer = window.setTimeout(() => {
      this.hostConnectTimer = null;
      if (this.hostPc === pc && pc.connectionState !== 'connected') {
        this.promoteHostToSfu();
      }
    }, DIRECT_CONNECT_TIMEOUT_MS);

    try {
      const offer = await pc.createOffer();
      const mungedSdp = offer.sdp ? mungeVideoBitrate(offer.sdp, 6000, 2500, 12000) : '';
      await pc.setLocalDescription({ type: 'offer', sdp: mungedSdp });
      if (!mungedSdp || !this.hostTargetId || this.hostPromoted) return;
      this.cb.send(
        { t: 'p2p-screen-offer', to: this.hostTargetId, sdp: mungedSdp },
        this.hostTargetId,
      );
    } catch {
      this.promoteHostToSfu();
    }
  }

  /**
   * Seamless upgrade from 2-person P2P to LiveKit SFU (preserving the active capture stream
   * when a 3rd participant joins or direct ICE fails).
   */
  promoteHostToSfu(): void {
    const stream = this.hostStream;
    if (!stream || this.hostPromoted) return;
    this.hostPromoted = true;
    const target = this.hostTargetId;
    this.cleanupHostPeer();
    this.hostStream = null;
    this.cb.onHostStreamChange(null);
    if (target) {
      this.cb.send({ t: 'p2p-screen-fallback' }, target);
    }
    this.cb.onHostPromoteToSfu(stream);
  }

  stopHost(stopTracks = true): void {
    const hadStream = this.hostStream !== null;
    const target = this.hostTargetId;
    const stream = this.hostStream;
    this.cleanupHostPeer();
    this.hostStream = null;
    this.hostPromoted = false;
    if (hadStream) {
      this.cb.onHostStreamChange(null);
      if (target) this.cb.send({ t: 'p2p-screen-stop' }, target);
    }
    if (stopTracks && stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    }
  }

  private cleanupHostPeer(): void {
    if (this.hostConnectTimer !== null) {
      window.clearTimeout(this.hostConnectTimer);
      this.hostConnectTimer = null;
    }
    this.hostAutopilotStop?.();
    this.hostAutopilotStop = null;
    try {
      this.hostPc?.close();
    } catch {}
    this.hostPc = null;
    this.hostTargetId = null;
    this.hostPendingIce = [];
  }

  async handleSignal(fromId: string, msg: DataMessage): Promise<void> {
    switch (msg.t) {
      case 'p2p-screen-offer':
        await this.handleGuestOffer(fromId, msg.sdp);
        break;
      case 'p2p-screen-answer': {
        if (!this.hostPc || fromId !== this.hostTargetId) return;
        await this.hostPc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        for (const c of this.hostPendingIce) {
          await this.hostPc.addIceCandidate(c);
        }
        this.hostPendingIce = [];
        break;
      }
      case 'p2p-screen-ice': {
        if (this.hostPc && fromId === this.hostTargetId) {
          if (this.hostPc.remoteDescription) {
            await this.hostPc.addIceCandidate(msg.candidate);
          } else {
            this.hostPendingIce.push(msg.candidate);
          }
        } else if (this.guestPc && fromId === this.guestSharerId) {
          if (this.guestPc.remoteDescription) {
            await this.guestPc.addIceCandidate(msg.candidate);
          } else {
            this.guestPendingIce.push(msg.candidate);
          }
        }
        break;
      }
      case 'p2p-screen-stop':
      case 'p2p-screen-fallback':
        this.resetGuest();
        break;
    }
  }

  private async handleGuestOffer(sharerId: string, sdp: string): Promise<void> {
    this.resetGuest();
    this.guestSharerId = sharerId;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.guestPc = pc;
    const assembled = new MediaStream();

    pc.ontrack = (ev) => {
      if (!assembled.getTracks().includes(ev.track)) {
        assembled.addTrack(ev.track);
      }
      this.guestStream = assembled;
      this.cb.onGuestStreamChange(assembled, sharerId);
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.cb.send(
          { t: 'p2p-screen-ice', to: sharerId, candidate: ev.candidate.toJSON() },
          sharerId,
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.resetGuest();
      }
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
        this.cb.send({ t: 'p2p-screen-answer', to: sharerId, sdp: answer.sdp }, sharerId);
      }
    } catch {
      this.resetGuest();
    }
  }

  resetGuest(): void {
    const hadStream = this.guestStream !== null;
    this.guestPendingIce = [];
    this.guestSharerId = null;
    this.guestStream = null;
    try {
      this.guestPc?.close();
    } catch {}
    this.guestPc = null;
    if (hadStream) {
      this.cb.onGuestStreamChange(null, '');
    }
  }

  destroy(): void {
    this.stopHost(true);
    this.resetGuest();
  }
}
