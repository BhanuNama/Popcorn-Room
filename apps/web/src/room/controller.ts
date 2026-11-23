import {
  BackupCodecPolicy,
  ConnectionQuality,
  DisconnectReason,
  LocalTrackPublication,
  type Participant,
  ParticipantEvent,
  RemoteParticipant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type TrackPublishOptions,
  type ScreenShareCaptureOptions,
  type AudioCaptureOptions,
  VideoPresets,
  VideoQuality,
} from 'livekit-client';
import { toast } from 'sonner';
import {
  DATA_TOPIC,
  EMPTY_SYNC,
  LIMITS,
  decodeMessage,
  encodeMessage,
  expectedPosition,
  msUntilStart,
  parseMeta,
  sortQueue,
  type ChatGif,
  type ChatReply,
  type DataMessage,
  type JoinResponse,
  type QueueItem,
  type ReactionMark,
  type RoomSettings,
  type RoomTheme,
  type StageMode,
  type SyncState,
} from '@popcorn/shared';
import { api, type HostAuth } from '@/lib/api';
import { caps } from '@/lib/browser';
import { clock } from '@/lib/clock';
import { loadPref, savePref, session } from '@/lib/session';
import { uid } from '@/lib/utils';
import { canControl, roleRank, useRoom, type ChatMsg, type ChatToastItem, type PersonVM, type Quality } from '@/store/room';

type JoinOk = Extract<JoinResponse, { status: 'ok' }>;

/* -------------------------------------------------------------------------- */
/*  Audio rules (blueprint 2.2)                                                */
/* -------------------------------------------------------------------------- */

/** Voice: raw studio capture with all voice isolation, echo cancellation and gain pumping OFF. */
const VOICE_CAPTURE: AudioCaptureOptions = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
  channelCount: 1,
};

/** Shared content audio: stereo 48 kHz, ALL voice processing and isolation strictly OFF. */
const SCREEN_AUDIO_CAPTURE: AudioCaptureOptions = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
  channelCount: 2,
  sampleRate: 48000,
  googEchoCancellation: false,
  googAutoGainControl: false,
  googNoiseSuppression: false,
  googHighpassFilter: false,
} as AudioCaptureOptions;

const SMART_DUCK_LEVEL = 0.7; // about -3 dB, gentle

/** Per-sender sliding-window rate limit. */
class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string) {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

export interface YtBridge {
  getTime(): number;
  getDuration(): number;
}

class RoomController {
  room: Room | null = null;
  roomId = '';
  yt: YtBridge | null = null;

  private audioHost: HTMLDivElement | null = null;
  private presence = new Map<string, { hand: boolean; ready: boolean; buffering: boolean }>();
  private chatSendLimit = new RateLimiter(LIMITS.chatBurst, LIMITS.chatWindowMs);
  private chatRecvLimit = new RateLimiter(LIMITS.chatBurst * 2, LIMITS.chatWindowMs);
  private reactLimit = new RateLimiter(8, 2000);
  private reactRecvLimit = new RateLimiter(16, 2000);
  private duckTimer: ReturnType<typeof setInterval> | null = null;
  private duckTarget = 1;
  private blackTimer: ReturnType<typeof setInterval> | null = null;
  private knockTimer: ReturnType<typeof setInterval> | null = null;
  private bufferTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pausedForBuffer = false;
  private gotSnapshot = false;
  private unsubStore: (() => void) | null = null;
  private seenKnocks = new Set<string>();
  private uploadTested = false;

  /* Real-time local speech detector & transmitter check */
  private localAudioMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private localSpeaking = false;
  private localSilenceFrames = 0;
  private localAudioLevel = 0;
  private localAudioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAnalyserBuf: Uint8Array<ArrayBuffer> | null = null;
  private localMovieTracks: MediaStreamTrack[] = [];
  private localMovieStreamEl: HTMLVideoElement | null = null;

  /* ------------------------------ lifecycle ------------------------------ */

  async connect(roomId: string, join: JoinOk, name: string, hostKey?: string) {
    const s = useRoom.getState();
    s.reset();
    this.roomId = roomId;
    this.presence.clear();
    this.gotSnapshot = false;
    this.pausedForBuffer = false;
    useRoom.setState({
      connection: 'connecting',
      roomInfo: join.room,
      me: { identity: join.identity, identitySig: join.identitySig, role: join.role, name, hostKey },
      sessionStart: Date.now(),
    });
    session.set(roomId, { identity: join.identity, identitySig: join.identitySig });

    clock.start();
    void clock.sync().then(() => {
      if (!this.gotSnapshot && useRoom.getState().sessionStart) useRoom.setState({ sessionStart: clock.now() });
    });

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      // Use native HTML5 Audio elements for each track: eliminates WebAudio downmix/clipping
      // while allowing independent per-track volume control via track.setVolume()
      webAudioMix: false,
      audioCaptureDefaults: VOICE_CAPTURE,
      videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
      publishDefaults: {
        dtx: false,
        red: true,
        audioPreset: { maxBitrate: 40_000 },
        forceStereo: false,
        videoCodec: 'vp9',
        backupCodec: true,
      },
    });
    this.room = room;
    this.audioHost = document.createElement('div');
    this.audioHost.style.display = 'none';
    document.body.appendChild(this.audioHost);

    this.wire(room);
    await room.connect(join.url, join.token, { autoSubscribe: true });
    useRoom.setState({ connection: 'connected' });
    this.refreshPeople();
    // Ask existing members for the room state; the authority will answer.
    this.send({ t: 'hello' });
    // If we are alone, we are the authority already.
    setTimeout(() => {
      if (!this.gotSnapshot && this.isAuthority()) this.gotSnapshot = true;
    }, 1500);

    this.unsubStore = useRoom.subscribe((st, prev) => {
      if (st.audio !== prev.audio || st.perPerson !== prev.perPerson || st.localMuted !== prev.localMuted || st.duck !== prev.duck)
        this.applyVolumes();
      if (st.audio.smartDuck !== prev.audio.smartDuck) this.updateDuck();
      if (st.me?.role !== prev.me?.role || st.roomInfo?.knock !== prev.roomInfo?.knock) this.setupKnockPolling();
    });
    this.setupKnockPolling();
    if (!room.canPlaybackAudio) useRoom.getState().setWarnings({ needsAudioUnlock: true });
  }

  async disconnect() {
    this.stopLocalAudioMonitor();
    this.stopBlackFrameDetector();
    await this.stopLocalMovieStream();
    if (this.knockTimer) clearInterval(this.knockTimer);
    if (this.duckTimer) clearInterval(this.duckTimer);
    this.bufferTimers.forEach((t) => clearTimeout(t));
    this.bufferTimers.clear();
    this.unsubStore?.();
    this.unsubStore = null;
    clock.stop();
    const r = this.room;
    this.room = null;
    await r?.disconnect();
    this.audioHost?.remove();
    this.audioHost = null;
  }

  private wire(room: Room) {
    const refresh = () => this.refreshPeople();
    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        this.onParticipantJoined(p);
        refresh();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        this.presence.delete(p.identity);
        this.onBufferingChanged(p.identity, false);
        refresh();
      })
      .on(RoomEvent.TrackSubscribed, (track, pub, p) => {
        this.attachAudio(track);
        this.applyVolumesFor(p);
        if (pub.source === Track.Source.ScreenShare) {
          pub.setVideoQuality(VideoQuality.HIGH);
        }
        if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
          // Lock tight 120ms playout delay on BOTH screen video & stereo audio so neither builds 1s+ lag or drifts out of sync
          try {
            track.setPlayoutDelay(0.12);
          } catch {}
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        refresh();
      })
      .on(RoomEvent.TrackMuted, (pub, p) => {
        if (p.isLocal && pub.source === Track.Source.Microphone && !useRoom.getState().audio.pushToTalk) {
          if (useRoom.getState().local.micOn) toast('You were muted by a host');
          useRoom.getState().setLocal({ micOn: false });
        }
        if (p.isLocal && pub.source === Track.Source.Camera) {
          useRoom.getState().setLocal({ camOn: false });
        }
        refresh();
      })
      .on(RoomEvent.TrackUnmuted, (pub, p) => {
        if (p.isLocal && pub.source === Track.Source.Camera) {
          useRoom.getState().setLocal({ camOn: true });
        }
        refresh();
      })
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.Camera) {
          useRoom.getState().setLocal({ camOn: true });
        }
        refresh();
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) this.onLocalShareEnded();
        if (pub.source === Track.Source.Camera) {
          useRoom.getState().setLocal({ camOn: false });
        }
        refresh();
      })
      .on(RoomEvent.ActiveSpeakersChanged, () => {
        this.updateDuck();
        refresh();
      })
      .on(RoomEvent.ConnectionQualityChanged, refresh)
      .on(RoomEvent.ParticipantMetadataChanged, (_old, p) => {
        if (p.isLocal) this.onLocalMetaChanged();
        refresh();
      })
      .on(RoomEvent.ParticipantNameChanged, refresh)
      .on(RoomEvent.DataReceived, (payload, p, _kind, topic) => {
        if (topic && topic !== DATA_TOPIC) return;
        const msg = decodeMessage(payload);
        if (msg && p) this.handle(msg, p);
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        useRoom.getState().setWarnings({ needsAudioUnlock: !room.canPlaybackAudio });
      })
      .on(RoomEvent.Reconnecting, () => useRoom.setState({ connection: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => {
        useRoom.setState({ connection: 'connected' });
        this.send({ t: 'hello' });
      })
      .on(RoomEvent.Disconnected, (reason) => {
        const why =
          reason === DisconnectReason.PARTICIPANT_REMOVED
            ? 'You were removed from the room by a host.'
            : reason === DisconnectReason.DUPLICATE_IDENTITY
              ? 'You joined this room from another tab.'
              : reason === DisconnectReason.ROOM_DELETED
                ? 'The room was closed.'
                : reason === DisconnectReason.CLIENT_INITIATED
                  ? null
                  : 'Connection lost.';
        useRoom.setState({ connection: 'disconnected', disconnectReason: why });
        this.stopBlackFrameDetector();
      });

    room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, refresh);
  }

  /* ------------------------------ people ------------------------------ */

  private allParticipants(): Participant[] {
    if (!this.room) return [];
    return [this.room.localParticipant, ...this.room.remoteParticipants.values()];
  }

  refreshPeople() {
    const room = this.room;
    if (!room) return;
    const people: PersonVM[] = this.allParticipants().map((p) => {
      const meta = parseMeta(p.metadata);
      const pres = p.isLocal ? useRoom.getState().local : this.presence.get(p.identity);
      const mic = p.getTrackPublication(Track.Source.Microphone);
      const cam = p.getTrackPublication(Track.Source.Camera);
      return {
        identity: p.identity,
        name: p.name || p.identity,
        isLocal: p.isLocal,
        role: meta.role,
        presenter: meta.presenter,
        hue: meta.avatarHue,
        speaking: (p.isLocal ? (this.localSpeaking || p.isSpeaking) : p.isSpeaking) || (p.isLocal && useRoom.getState().local.pttHeld),
        audioLevel: p.isLocal ? this.localAudioLevel : p.audioLevel,
        micOn: !!mic && !mic.isMuted,
        camOn: !!cam && !cam.isMuted && cam.track?.mediaStreamTrack?.readyState !== 'ended',
        camTrackId: cam?.track
          ? cam.track.mediaStreamTrack?.id || cam.track.sid || cam.trackSid || 'ready'
          : undefined,
        sharing: !!p.getTrackPublication(Track.Source.ScreenShare),
        quality: qualityOf(p.connectionQuality),
        hand: !!pres?.hand,
        ready: !!pres?.ready,
        buffering: !!(pres && 'buffering' in pres && pres.buffering),
        joinedAt: p.joinedAt?.getTime() ?? 0,
      };
    });
    people.sort((a, b) => roleRank[b.role] - roleRank[a.role] || a.joinedAt - b.joinedAt);
    useRoom.setState({ people });
  }

  participant(identity: string): Participant | undefined {
    if (!this.room) return;
    if (this.room.localParticipant.identity === identity) return this.room.localParticipant;
    return this.room.remoteParticipants.get(identity);
  }

  /** The member who answers "hello" and runs room-wide automation. */
  isAuthority(): boolean {
    const list = this.allParticipants();
    if (!list.length) return false;
    const ranked = [...list].sort((a, b) => {
      const ra = roleRank[parseMeta(a.metadata).role];
      const rb = roleRank[parseMeta(b.metadata).role];
      return rb - ra || (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0) || a.identity.localeCompare(b.identity);
    });
    return ranked[0].isLocal;
  }

  private senderCanControl(p: Participant) {
    return parseMeta(p.metadata).role !== 'viewer' || useRoom.getState().settings.openControl;
  }

  private onParticipantJoined(p: RemoteParticipant) {
    const { local } = useRoom.getState();
    this.send({ t: 'presence', hand: local.hand, ready: local.ready, buffering: false }, [p.identity]);
    if (this.isAuthority()) this.send(this.snapshot(), [p.identity]);
  }

  private onLocalMetaChanged() {
    const meta = parseMeta(this.room?.localParticipant.metadata);
    const me = useRoom.getState().me;
    if (!me) return;
    if (me.role !== meta.role) {
      toast.success(meta.role === 'cohost' ? 'You are now a co-host' : meta.role === 'host' ? 'You are the host' : 'You are now a viewer');
      useRoom.setState({ me: { ...me, role: meta.role } });
    }
    if (!meta.presenter && useRoom.getState().local.sharing) void this.stopShare();
  }

  hostAuth(): HostAuth {
    const me = useRoom.getState().me;
    if (!me) return {};
    return me.hostKey ? { hostKey: me.hostKey } : { identity: me.identity, identitySig: me.identitySig };
  }

  /* ------------------------------ messaging ------------------------------ */

  send(msg: DataMessage, to?: string[], reliable = true) {
    const lp = this.room?.localParticipant;
    if (!lp || useRoom.getState().connection === 'disconnected') return Promise.resolve();
    return lp.publishData(encodeMessage(msg), { reliable, topic: DATA_TOPIC, destinationIdentities: to }).catch(() => {});
  }

  private snapshot(): DataMessage {
    const s = useRoom.getState();
    return {
      t: 'snapshot',
      mode: s.mode,
      sync: s.sync,
      queue: s.queue,
      settings: s.settings,
      sessionStart: s.sessionStart,
      reactions: s.reactions.slice(-500),
    };
  }

  private handle(m: DataMessage, p: Participant) {
    const st = useRoom.getState();
    const meta = parseMeta(p.metadata);
    switch (m.t) {
      case 'hello':
        if (this.isAuthority()) this.send(this.snapshot(), [p.identity]);
        break;
      case 'snapshot': {
        const first = !this.gotSnapshot;
        this.gotSnapshot = true;
        if (first) {
          useRoom.setState({
            mode: m.mode,
            queue: m.queue,
            settings: m.settings,
            sessionStart: m.sessionStart,
            reactions: m.reactions,
          });
        }
        this.applySync(m.sync, first);
        break;
      }
      case 'sync':
        if (this.senderCanControl(p)) this.applySync(m.state, false);
        break;
      case 'mode':
        if (this.senderCanControl(p) || (meta.presenter && m.mode !== 'youtube')) useRoom.setState({ mode: m.mode });
        break;
      case 'settings':
        if (meta.role !== 'viewer') useRoom.setState({ settings: m.settings });
        break;
      case 'chat': {
        if (!this.chatRecvLimit.allow(p.identity)) return;
        const text = String(m.text ?? '').slice(0, LIMITS.chatMaxLength);
        if (!text && !m.gif) return;
        this.pushChat({
          id: m.id,
          from: p.identity,
          fromName: p.name || p.identity,
          hue: meta.avatarHue,
          text,
          at: m.at,
          replyTo: m.replyTo,
          gif: m.gif,
          vt: m.vt,
        });
        break;
      }
      case 'reaction':
        if (!this.reactRecvLimit.allow(p.identity)) return;
        this.showReaction(m.emoji, p.name || p.identity, m.mark);
        break;
      case 'presence':
        this.presence.set(p.identity, { hand: m.hand, ready: m.ready, buffering: m.buffering });
        this.onBufferingChanged(p.identity, m.buffering);
        this.refreshPeople();
        break;
      case 'ready-check':
        if (meta.role === 'viewer') return;
        useRoom.setState({ readyCheck: m.active });
        if (!m.active) this.setReady(false);
        break;
      case 'countdown':
        if (this.senderCanControl(p)) useRoom.setState({ countdownAt: m.at });
        break;
      case 'waiting':
        if (meta.role !== 'viewer' || this.senderCanControl(p)) useRoom.setState({ waitingFor: m.names });
        break;
      case 'queue-add':
        if (!this.chatRecvLimit.allow(`q:${p.identity}`)) return;
        if (st.queue.some((q) => q.id === m.item.id)) return;
        useRoom.setState({
          queue: sortQueue([...st.queue, { ...m.item, addedBy: p.identity, addedByName: p.name || p.identity, votes: [p.identity] }]),
        });
        break;
      case 'queue-vote':
        useRoom.setState({
          queue: sortQueue(
            st.queue.map((q) =>
              q.id !== m.id
                ? q
                : { ...q, votes: m.up ? [...new Set([...q.votes, p.identity])] : q.votes.filter((v) => v !== p.identity) },
            ),
          ),
        });
        break;
      case 'queue-remove': {
        const item = st.queue.find((q) => q.id === m.id);
        if (item && (item.addedBy === p.identity || this.senderCanControl(p)))
          useRoom.setState({ queue: st.queue.filter((q) => q.id !== m.id) });
        break;
      }
      case 'theme':
        if (this.senderCanControl(p)) {
          useRoom.getState().setUi({ theme: m.theme });
        }
        break;
      case 'local-meta':
        useRoom.getState().setLocalMovie({
          fileName: m.fileName,
          fileSize: m.fileSize ?? null,
          duration: m.duration ?? null,
        });
        break;
    }
  }

  /* ------------------------------ chat & reactions ------------------------------ */

  private pushChat(msg: ChatMsg) {
    useRoom.setState((s) => {
      if (s.chat.some((c) => c.id === msg.id)) return {};
      const visible = (s.ui.panelOpen || s.ui.sheetOpen) && s.ui.tab === 'chat';
      const isFromMe = msg.from === s.me?.identity;
      const isSystem = msg.system;

      let nextToasts = s.chatToasts;
      if (!visible && !isFromMe && !isSystem) {
        const toastItem: ChatToastItem = {
          id: uid(),
          msgId: msg.id,
          from: msg.from,
          fromName: msg.fromName,
          hue: msg.hue,
          text: msg.text,
          gif: msg.gif,
          at: msg.at,
        };
        nextToasts = [...s.chatToasts.slice(-2), toastItem];
      }

      return {
        chat: [...s.chat.slice(-299), msg],
        unread: visible || isFromMe ? s.unread : s.unread + 1,
        chatToasts: nextToasts,
      };
    });
  }

  systemMessage(text: string) {
    this.pushChat({ id: uid(), from: 'system', fromName: 'The Orbit', hue: 0, text, at: Date.now(), system: true });
  }

  async sendChat(text: string, replyTo?: ChatReply, gif?: ChatGif) {
    const s = useRoom.getState();
    if (!s.me) return;
    text = text.trim().slice(0, LIMITS.chatMaxLength);
    if (!text && !gif) return;
    if (!this.chatSendLimit.allow('me')) {
      toast.warning('Slow down a little - too many messages.');
      return;
    }
    const vt =
      s.mode === 'youtube' && s.sync.videoId ? { videoId: s.sync.videoId, time: s.playhead.time } : undefined;
    const msg: ChatMsg = {
      id: uid(),
      from: s.me.identity,
      fromName: s.me.name,
      hue: parseMeta(this.room?.localParticipant.metadata).avatarHue,
      text,
      at: Date.now(),
      replyTo,
      gif,
      vt,
      pending: true,
    };
    this.pushChat(msg); // optimistic
    await this.send({ t: 'chat', id: msg.id, text, at: msg.at, replyTo, gif, vt });
    useRoom.setState((st) => ({ chat: st.chat.map((c) => (c.id === msg.id ? { ...c, pending: false } : c)) }));
  }

  currentMark(): ReactionMark {
    const s = useRoom.getState();
    if (s.mode === 'youtube' && s.sync.videoId)
      return { emoji: '', time: s.playhead.time, mode: 'youtube', videoId: s.sync.videoId };
    return { emoji: '', time: Math.max(0, (clock.now() - s.sessionStart) / 1000), mode: s.mode };
  }

  react(emoji: string) {
    const s = useRoom.getState();
    if (!s.me || !this.reactLimit.allow('me')) return;
    const mark = { ...this.currentMark(), emoji };
    this.showReaction(emoji, s.me.name, mark);
    void this.send({ t: 'reaction', emoji, mark }, undefined, true);
  }

  private showReaction(emoji: string, name: string, mark: ReactionMark) {
    const id = uid();
    useRoom.setState((s) => ({
      floating: [...s.floating.slice(-40), { id, emoji: emoji.slice(0, 8), name, x: 8 + Math.random() * 84 }],
      reactions: [...s.reactions.slice(-1999), { ...mark, emoji: emoji.slice(0, 8) }],
    }));
    setTimeout(() => useRoom.setState((s) => ({ floating: s.floating.filter((f) => f.id !== id) })), 3200);
  }

  /* ------------------------------ presence ------------------------------ */

  private broadcastPresence(buffering = false) {
    const l = useRoom.getState().local;
    void this.send({ t: 'presence', hand: l.hand, ready: l.ready, buffering });
    this.refreshPeople();
  }

  setHand(hand: boolean) {
    useRoom.getState().setLocal({ hand });
    this.broadcastPresence();
  }

  setReady(ready: boolean) {
    useRoom.getState().setLocal({ ready });
    this.broadcastPresence();
  }

  /** Called by the YouTube player on buffering changes. */
  setLocalBuffering(buffering: boolean) {
    const me = useRoom.getState().me;
    if (!me) return;
    const l = useRoom.getState().local;
    void this.send({ t: 'presence', hand: l.hand, ready: l.ready, buffering });
    this.onBufferingChanged(me.identity, buffering);
  }

  /** Authority only: pause everyone when someone buffers for more than 3 s. */
  private localBuffering = new Set<string>();
  private onBufferingChanged(identity: string, buffering: boolean) {
    if (buffering) this.localBuffering.add(identity);
    else this.localBuffering.delete(identity);

    const t = this.bufferTimers.get(identity);
    if (t) clearTimeout(t);
    this.bufferTimers.delete(identity);
    if (!this.isAuthority()) return;
    const s = useRoom.getState();
    if (buffering && s.settings.autoPauseOnBuffer && s.mode === 'youtube' && s.sync.status === 'playing') {
      this.bufferTimers.set(
        identity,
        setTimeout(() => {
          const st = useRoom.getState();
          if (!this.localBuffering.has(identity) || st.sync.status !== 'playing') return;
          const names = [...this.localBuffering].map((id) => this.participant(id)?.name || id);
          this.pausedForBuffer = true;
          this.pause();
          useRoom.setState({ waitingFor: names });
          void this.send({ t: 'waiting', names });
        }, 3000),
      );
    }
    if (!buffering && this.pausedForBuffer && this.localBuffering.size === 0) {
      this.pausedForBuffer = false;
      useRoom.setState({ waitingFor: [] });
      void this.send({ t: 'waiting', names: [] });
      this.play();
    }
  }

  /* ------------------------------ YouTube sync ------------------------------ */

  private applySync(state: SyncState, force: boolean) {
    const cur = useRoom.getState().sync;
    // Allow video switches (e.g. from local file name or after host reload) even if version counter reset
    const videoChanged = Boolean(state.videoId && state.videoId !== cur.videoId && state.serverTime >= cur.serverTime - 3000);
    const newer =
      state.version > cur.version ||
      (state.version === cur.version && state.serverTime > cur.serverTime) ||
      videoChanged;
    if (!force && !newer) return;
    const patch: Partial<ReturnType<typeof useRoom.getState>> = { sync: state };
    if (msUntilStart(state, clock.offsetMs) > 0) patch.countdownAt = state.serverTime;
    useRoom.setState(patch);
  }

  private commitSync(partial: Partial<SyncState>) {
    const s = useRoom.getState();
    if (!canControl(s)) {
      toast('Only hosts can control playback', { description: 'Ask a host to let everyone control it.' });
      return;
    }
    const next: SyncState = {
      ...s.sync,
      ...partial,
      version: s.sync.version + 1,
      by: s.me?.identity,
    };
    useRoom.setState({ sync: next });
    if (msUntilStart(next, clock.offsetMs) > 0) useRoom.setState({ countdownAt: next.serverTime });
    void this.send({ t: 'sync', state: next });
  }

  private livePosition() {
    const s = useRoom.getState();
    const yt = this.yt?.getTime();
    if (typeof yt === 'number' && isFinite(yt) && s.mode === 'youtube' && s.sync.videoId) {
      return yt;
    }
    if (s.mode === 'local' && s.playhead.videoId === s.sync.videoId && typeof s.playhead.time === 'number' && isFinite(s.playhead.time)) {
      return s.playhead.time;
    }
    return expectedPosition(s.sync, clock.offsetMs);
  }

  setMode(mode: StageMode) {
    if (mode !== 'local') {
      void this.stopLocalMovieStream();
    }
    useRoom.setState({ mode });
    void this.send({ t: 'mode', mode });
  }

  loadVideo(videoId: string, start = 0) {
    if (!canControl(useRoom.getState())) {
      toast('Only hosts can change the video', { description: 'You can add it to the queue instead.' });
      return false;
    }
    void this.stopLocalMovieStream();
    this.setMode('youtube');
    // Small lead time so every player has the video loaded when it starts.
    this.commitSync({ videoId, status: 'playing', position: start, rate: 1, serverTime: clock.now() + 900 });
    return true;
  }

  loadLocalMovie(fileName: string, fileSize?: number, duration?: number) {
    this.setMode('local');
    this.setLocalMovieMeta(fileName, fileSize, duration);
    if (canControl(useRoom.getState())) {
      this.commitSync({ videoId: fileName, status: 'paused', position: 0, rate: 1, serverTime: clock.now() });
    }
    return true;
  }

  setTheme(theme: RoomTheme) {
    useRoom.getState().setUi({ theme });
    void this.send({ t: 'theme', theme });
  }

  setLocalMovieMeta(fileName: string, fileSize?: number, duration?: number) {
    useRoom.getState().setLocalMovie({ fileName, fileSize, duration });
    void this.send({ t: 'local-meta', fileName, fileSize, duration });
  }

  play(currentPos?: number) {
    const s = useRoom.getState();
    if (!s.sync.videoId) return;
    const pos = typeof currentPos === 'number' && isFinite(currentPos) ? currentPos : this.livePosition();
    useRoom.setState({
      playhead: { ...s.playhead, time: pos },
    });
    // Local movie files start instantaneously (0ms lead) so audio/video never lag behind clock and trigger speed-up
    const leadTime = s.mode === 'local' ? 0 : 250;
    this.commitSync({ status: 'playing', position: pos, rate: 1, serverTime: clock.now() + leadTime });
  }

  pause(currentPos?: number) {
    const s = useRoom.getState();
    const pos = typeof currentPos === 'number' && isFinite(currentPos) ? currentPos : this.livePosition();
    useRoom.setState({
      playhead: { ...s.playhead, time: pos },
    });
    this.commitSync({ status: 'paused', position: pos, serverTime: clock.now() });
  }

  seek(position: number) {
    const s = useRoom.getState();
    const pos = Math.max(0, position);
    useRoom.setState({
      playhead: { ...s.playhead, time: pos },
    });
    const leadTime = s.mode === 'youtube' && s.sync.status === 'playing' ? 300 : 0;
    this.commitSync({ position: pos, serverTime: clock.now() + leadTime });
  }

  setRate(rate: number) {
    this.commitSync({ rate, position: this.livePosition(), serverTime: clock.now() });
  }

  /** Everyone ready -> 3-2-1 -> play. */
  startCountdown() {
    const s = useRoom.getState();
    const at = clock.now() + 3600;
    if ((s.mode === 'youtube' || s.mode === 'local') && s.sync.videoId) {
      this.commitSync({ status: 'playing', position: this.livePosition(), serverTime: at });
    } else {
      useRoom.setState({ countdownAt: at });
      void this.send({ t: 'countdown', at });
    }
    this.setReadyCheck(false);
  }

  setReadyCheck(active: boolean) {
    useRoom.setState({ readyCheck: active });
    void this.send({ t: 'ready-check', active });
    if (active) this.setReady(false);
    else if (useRoom.getState().local.ready) this.setReady(false);
  }

  updateRoomSettings(patch: Partial<RoomSettings>) {
    const settings = { ...useRoom.getState().settings, ...patch };
    useRoom.setState({ settings });
    void this.send({ t: 'settings', settings });
  }

  onVideoEnded() {
    if (!this.isAuthority()) return;
    const next = sortQueue(useRoom.getState().queue)[0];
    if (next) this.playFromQueue(next);
    else this.commitSync({ status: 'paused', position: this.yt?.getDuration() ?? 0, serverTime: clock.now() });
  }

  /* ------------------------------ queue ------------------------------ */

  async queueAdd(videoId: string, start = 0) {
    const s = useRoom.getState();
    if (!s.me) return;
    let title = 'YouTube video';
    let author: string | undefined;
    try {
      const o = await api.oembed(videoId);
      title = o.title;
      author = o.author;
    } catch {
      /* keep defaults */
    }
    const item: QueueItem = {
      id: uid(),
      videoId,
      title,
      author,
      start,
      addedBy: s.me.identity,
      addedByName: s.me.name,
      votes: [s.me.identity],
      addedAt: clock.now(),
    };
    useRoom.setState({ queue: sortQueue([...useRoom.getState().queue, item]) });
    void this.send({ t: 'queue-add', item });
    toast.success('Added to queue', { description: title });
  }

  queueVote(id: string) {
    const s = useRoom.getState();
    const me = s.me?.identity;
    if (!me) return;
    const item = s.queue.find((q) => q.id === id);
    if (!item) return;
    const up = !item.votes.includes(me);
    useRoom.setState({
      queue: sortQueue(
        s.queue.map((q) => (q.id !== id ? q : { ...q, votes: up ? [...q.votes, me] : q.votes.filter((v) => v !== me) })),
      ),
    });
    void this.send({ t: 'queue-vote', id, up });
  }

  queueRemove(id: string) {
    useRoom.setState((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
    void this.send({ t: 'queue-remove', id });
  }

  playFromQueue(item: QueueItem) {
    if (this.loadVideo(item.videoId, item.start ?? 0)) this.queueRemove(item.id);
  }

  /* ------------------------------ media: mic / camera ------------------------------ */

  private async consent(kind: 'mic' | 'camera' | 'screen'): Promise<boolean> {
    if (loadPref(`consent:${kind}`, false)) return true;
    const ok = await new Promise<boolean>((resolve) => useRoom.setState({ consent: { kind, resolve } }));
    useRoom.setState({ consent: null });
    if (ok) savePref(`consent:${kind}`, true);
    return ok;
  }

  async toggleMic() {
    const lp = this.room?.localParticipant;
    if (!lp) return;
    const s = useRoom.getState();
    const on = !s.local.micOn;
    if (on && !(await this.consent('mic'))) return;
    try {
      if (on) {
        let chosenDeviceId = s.audio.micDeviceId;
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          try {
            let devs = await navigator.mediaDevices.enumerateDevices();
            let inputs = devs.filter((d) => d.kind === 'audioinput');

            // If device labels are blank because getUserMedia hasn't been probed yet, unlock them
            if (inputs.length > 0 && !inputs[0].label) {
              try {
                const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
                temp.getTracks().forEach((t) => t.stop());
                devs = await navigator.mediaDevices.enumerateDevices();
                inputs = devs.filter((d) => d.kind === 'audioinput');
              } catch {}
            }

            // Auto-select a clean non-Bluetooth microphone so Windows/phones don't drop movie audio into 8kHz phone-call DSP
            const isBtOrVirtual = (label: string, id: string) =>
              id === 'communications' ||
              /headset|bluetooth|buds|airpods|hands-free|handsfree|hfp|sco|ag audio|telephony/i.test(label);

            if (!chosenDeviceId) {
              const preferredInternal = inputs.find(
                (d) =>
                  !isBtOrVirtual(d.label, d.deviceId) &&
                  /array|realtek|built-in|internal|intel|amd|integrated|conexant|synaptics|macbook|iphone|pixel/i.test(d.label),
              );
              const anySafeNonBt = inputs.find(
                (d) => d.deviceId && d.deviceId !== 'default' && !isBtOrVirtual(d.label, d.deviceId),
              );
              const picked = preferredInternal ?? anySafeNonBt;
              if (picked?.deviceId) {
                chosenDeviceId = picked.deviceId;
                useRoom.getState().setAudio({ micDeviceId: chosenDeviceId });
              }
            }
          } catch {
            // ignore
          }
        }

        const captureOpts: AudioCaptureOptions = {
          echoCancellation: s.audio.echoCancellation,
          noiseSuppression: s.audio.echoCancellation,
          autoGainControl: false,
          voiceIsolation: false,
          channelCount: 1,
        };
        if (chosenDeviceId) {
          captureOpts.deviceId = { exact: chosenDeviceId };
        }
        (captureOpts as Record<string, unknown>).googEchoCancellation = s.audio.echoCancellation;
        (captureOpts as Record<string, unknown>).googAutoGainControl = false;
        (captureOpts as Record<string, unknown>).googNoiseSuppression = s.audio.echoCancellation;
        (captureOpts as Record<string, unknown>).googHighpassFilter = false;
        (captureOpts as Record<string, unknown>).googAudioMirroring = false;
        (captureOpts as Record<string, unknown>).voiceIsolation = false;

        const pub = await lp.setMicrophoneEnabled(true, captureOpts, {
          audioPreset: { maxBitrate: 40_000 },
          dtx: false,
          red: true,
          forceStereo: false,
        });

        // Re-assert raw stereo constraints on active screen share audio so WebRTC never applies voice DSP to the movie
        const shareAudioPub = lp.getTrackPublication(Track.Source.ScreenShareAudio);
        if (shareAudioPub?.track?.mediaStreamTrack) {
          void shareAudioPub.track.mediaStreamTrack
            .applyConstraints({
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            } as MediaTrackConstraints)
            .catch(() => {});
        }

        // Ensure microphone track is UNMUTED so the user can speak immediately
        if (pub?.track && pub.track.isMuted) {
          await pub.track.unmute();
        }

        const activeMicLabel = pub?.track?.mediaStreamTrack?.label || '';
        if (/hands-free|handsfree|hfp|sco|ag audio|bluetooth|buds|airpods/i.test(activeMicLabel)) {
          toast.warning('Bluetooth headset mic active', {
            description: 'Bluetooth switches movie sound to 8kHz mono when its mic is used. Pick your laptop mic in Mixer for hi-fi stereo.',
            duration: 9000,
          });
        }

        // Start live local speech & audio transmission monitor
        this.startLocalAudioMonitor();

        if (!loadPref('headphonesTip', false)) {
          savePref('headphonesTip', true);
          toast('Studio Voice Active 🎙️', {
            description: 'Microphone is unmuted. Background music will stay clean and transparent.',
            duration: 8000,
          });
        }
      } else {
        this.stopLocalAudioMonitor();
        // Fully stop and release the hardware recording session so Windows Bluetooth returns to high-quality Stereo
        const pub = lp.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
        if (pub?.track) {
          try {
            pub.track.mediaStreamTrack.stop();
          } catch {}
          try {
            await lp.unpublishTrack(pub.track, true);
          } catch {}
        }
        await lp.setMicrophoneEnabled(false);
      }
      s.setLocal({ micOn: on, pttHeld: false });
    } catch (e) {
      toast.error('Microphone unavailable', { description: (e as Error).message });
    }
    this.refreshPeople();
  }

  async switchMicrophone(deviceId: string) {
    useRoom.getState().setAudio({ micDeviceId: deviceId });
    if (this.room && useRoom.getState().local.micOn) {
      try {
        await this.room.switchActiveDevice('audioinput', deviceId, true);
        this.startLocalAudioMonitor();
        toast.success('Microphone changed');
      } catch {
        await this.toggleMic();
        await this.toggleMic();
      }
    }
    this.refreshPeople();
  }

  private micTrack() {
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    return pub?.track;
  }

  /** Push-to-talk: hold spacebar to talk. */
  async setPttHeld(held: boolean) {
    const s = useRoom.getState();
    if (s.local.pttHeld === held) return;
    s.setLocal({ pttHeld: held });
    const lp = this.room?.localParticipant;
    if (!lp) return;

    if (held) {
      if (!s.local.micOn) {
        await this.toggleMic();
      } else {
        const t = this.micTrack();
        if (t && t.isMuted) await t.unmute();
        this.startLocalAudioMonitor();
      }
    } else {
      if (s.audio.pushToTalk) {
        const t = this.micTrack();
        if (t && !t.isMuted) await t.mute();
        this.stopLocalAudioMonitor();
      }
    }
    this.refreshPeople();
  }

  /** Isolated, zero-output WebAudio local volume monitor for speaking UI blinking */
  private startLocalAudioMonitor() {
    this.stopLocalAudioMonitor();
    const lp = this.room?.localParticipant;
    if (!lp) return;
    const pub = lp.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    const track = pub?.audioTrack;
    if (!track?.mediaStreamTrack) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let ctx: AudioContext;
      try {
        ctx = new AudioCtx({ sinkId: { type: 'none' } } as unknown as AudioContextOptions);
      } catch {
        ctx = new AudioCtx();
      }
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const src = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.2;
      src.connect(analyser);

      this.localAudioCtx = ctx;
      this.localAnalyser = analyser;
      this.localAnalyserBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      // AudioContext unavailable or restricted
    }

    this.localSpeaking = false;
    this.localSilenceFrames = 0;
    this.localAudioLevel = 0;

    this.localAudioMonitorTimer = setInterval(() => {
      const st = useRoom.getState();
      if (!st.local.micOn || !pub || pub.isMuted) {
        if (this.localSpeaking) {
          this.localSpeaking = false;
          this.localAudioLevel = 0;
          useRoom.setState({ local: { ...st.local, micLevel: 0 } });
          this.refreshPeople();
        }
        return;
      }

      if (this.localAudioCtx && this.localAudioCtx.state === 'suspended') {
        void this.localAudioCtx.resume();
      }

      let currentVol = 0;
      if (this.localAnalyser && this.localAnalyserBuf) {
        this.localAnalyser.getByteFrequencyData(this.localAnalyserBuf);
        let sum = 0;
        for (let i = 0; i < this.localAnalyserBuf.length; i++) {
          sum += this.localAnalyserBuf[i];
        }
        currentVol = sum / (this.localAnalyserBuf.length * 255);
      }

      this.localAudioLevel = currentVol;
      useRoom.setState({ local: { ...useRoom.getState().local, micLevel: currentVol } });

      // Threshold: 0.012 for audible human speech on raw unamplified mic
      const isVoice = currentVol > 0.012;

      if (isVoice) {
        this.localSilenceFrames = 0;
        if (!this.localSpeaking) {
          this.localSpeaking = true;
          this.refreshPeople();
        }
      } else {
        this.localSilenceFrames++;
        if (this.localSilenceFrames >= 4 && this.localSpeaking) {
          this.localSpeaking = false;
          this.refreshPeople();
        }
      }
    }, 60);
  }

  private stopLocalAudioMonitor() {
    if (this.localAudioMonitorTimer) {
      clearInterval(this.localAudioMonitorTimer);
      this.localAudioMonitorTimer = null;
    }
    if (this.localAudioCtx) {
      try {
        void this.localAudioCtx.close();
      } catch {}
      this.localAudioCtx = null;
      this.localAnalyser = null;
      this.localAnalyserBuf = null;
    }
    if (this.localSpeaking) {
      this.localSpeaking = false;
      this.localAudioLevel = 0;
      useRoom.setState({ local: { ...useRoom.getState().local, micLevel: 0 } });
      this.refreshPeople();
    }
  }

  async setPushToTalk(on: boolean) {
    useRoom.getState().setAudio({ pushToTalk: on });
    const t = this.micTrack();
    if (!t || !useRoom.getState().local.micOn) return;
    if (on) await t.mute();
    else await t.unmute();
    this.refreshPeople();
  }

  private camToggling = false;

  async toggleCamera() {
    const lp = this.room?.localParticipant;
    if (!lp || this.camToggling) return;
    const pub = lp.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    const currentlyLive = !!pub && !pub.isMuted && pub.track?.mediaStreamTrack?.readyState !== 'ended';
    const on = !(useRoom.getState().local.camOn || currentlyLive);

    if (on && !(await this.consent('camera'))) return;

    this.camToggling = true;
    try {
      if (on) {
        // Clear any leftover muted/ended camera publication so turning ON always opens a fresh live stream
        if (pub?.track) {
          try {
            pub.track.mediaStreamTrack.stop();
          } catch {}
          try {
            await lp.unpublishTrack(pub.track, true);
          } catch {}
        }
        const newPub = await lp.setCameraEnabled(
          true,
          { resolution: VideoPresets.h360.resolution },
          { simulcast: true },
        );
        if (newPub?.track?.isMuted) {
          await newPub.track.unmute();
        }
        useRoom.getState().setLocal({ camOn: true });
      } else {
        // Stop webcam hardware cleanly & unpublish so LED turns off and next ON toggle restarts cleanly
        if (pub?.track) {
          try {
            pub.track.mediaStreamTrack.stop();
          } catch {}
          try {
            await lp.unpublishTrack(pub.track, true);
          } catch {}
        }
        await lp.setCameraEnabled(false).catch(() => {});
        useRoom.getState().setLocal({ camOn: false });
      }
    } catch (e) {
      const actualPub = lp.getTrackPublication(Track.Source.Camera);
      const actualOn = !!actualPub && !actualPub.isMuted;
      useRoom.getState().setLocal({ camOn: actualOn });
      toast.error('Camera unavailable', { description: (e as Error).message });
    } finally {
      this.camToggling = false;
      this.refreshPeople();
    }
  }

  /* ------------------------------ media: screen share ------------------------------ */

  async toggleShare() {
    if (useRoom.getState().local.sharing) return this.stopShare();
    return this.startShare();
  }

  async startShare() {
    const lp = this.room?.localParticipant;
    if (!lp) return;
    await this.stopLocalMovieStream();
    if (!caps.canShareScreen) {
      toast.error('Screen sharing is not available on this device', { description: 'Use Chrome or Edge on a desktop.' });
      return;
    }
    if (!parseMeta(lp.metadata).presenter) {
      toast('Ask a host for presenter rights first');
      return;
    }
    if (!(await this.consent('screen'))) return;
    const share60 = useRoom.getState().audio.share60;

    if (!this.uploadTested) {
      this.uploadTested = true;
      void api
        .uploadMbps()
        .then((mbps) => useRoom.getState().setWarnings({ slowUpload: mbps < (share60 ? 8 : 5) ? Math.round(mbps * 10) / 10 : null }))
        .catch(() => {});
    }

    const targetBitrate = share60 ? 6_000_000 : 4_500_000;
    const targetFps = share60 ? 60 : 30;
    const capture: ScreenShareCaptureOptions = {
      audio: SCREEN_AUDIO_CAPTURE,
      resolution: { width: 1920, height: 1080, frameRate: targetFps },
      contentHint: 'motion', // smooth movie playback without text-palette frame stalling
      systemAudio: 'include',
      // Keep local playback so the host hears it too.
      suppressLocalAudioPlayback: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    };
    const publish: TrackPublishOptions = {
      audioPreset: { maxBitrate: 256_000 }, // pure transparent 256kbps stereo Opus
      forceStereo: true,
      dtx: false, // never stop sending in quiet scenes
      red: false, // RED must be disabled for stereo music
      simulcast: false, // single clean stream
      videoCodec: 'vp8', // Fastest sub-50ms hardware/libvpx encode across Windows, Mac, Android & iOS (zero OpenH264/VP9 lag)
      backupCodec: false,
      screenShareEncoding: { maxBitrate: targetBitrate, maxFramerate: targetFps, priority: 'high' },
      degradationPreference: 'balanced', // keeps video tightly synced with audio instead of stalling frames
    };

    try {
      await lp.setScreenShareEnabled(true, capture, publish);
      const pub = lp.getTrackPublication(Track.Source.ScreenShare);
      const mst = pub?.track?.mediaStreamTrack;
      if (mst) {
        mst.contentHint = 'motion';
      }
      const capWidth = mst?.getSettings().width ?? 1920;
      const scaleDown = capWidth > 1920 ? Math.min(2.5, Math.round((capWidth / 1920) * 100) / 100) : 1;
      const sender = pub?.track?.sender;
      if (sender) {
        try {
          const params = sender.getParameters();
          if (params.encodings?.length) {
            params.encodings[0].scaleResolutionDownBy = scaleDown;
            params.encodings[0].maxBitrate = targetBitrate;
            params.encodings[0].maxFramerate = targetFps;
            params.encodings[0].priority = 'high';
            params.degradationPreference = 'balanced';
            await sender.setParameters(params);
          }
        } catch {
          // Some browsers disallow mutating certain sender fields; safe to ignore
        }
      }
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'NotAllowedError') toast.error('Could not start screen share', { description: err.message });
      return;
    }
    useRoom.getState().setLocal({ sharing: true });
    this.setMode('screen');

    const hasAudio = !!lp.getTrackPublication(Track.Source.ScreenShareAudio);
    useRoom.getState().setWarnings({ noShareAudio: !hasAudio, blackFrame: false });
    if (!hasAudio) {
      toast.warning('No sound is being shared', {
        description: caps.canShareAudio
          ? 'Stop and share again, then tick "Also share tab audio" (or "Share system audio") in the picker.'
          : 'This browser cannot share audio. Use Chrome or Edge.',
        duration: 10000,
      });
    }
    this.startBlackFrameDetector();
    this.refreshPeople();
  }

  async stopShare() {
    await this.room?.localParticipant.setScreenShareEnabled(false);
    this.onLocalShareEnded();
  }

  /** Capture and stream the host's local <video> element live at native FPS and full clarity with parallel hardware H.264 + A/V lock. */
  async startLocalMovieStream(videoEl: HTMLVideoElement) {
    const lp = this.room?.localParticipant;
    if (!lp || !parseMeta(lp.metadata).presenter) return;
    if (this.localMovieStreamEl === videoEl && this.localMovieTracks.length > 0) return;

    await this.stopLocalMovieStream();
    if (useRoom.getState().local.sharing) {
      await this.stopShare();
    }

    const capFn =
      (videoEl as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream })
        .captureStream ||
      (videoEl as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
    if (typeof capFn !== 'function') return;

    let stream: MediaStream;
    try {
      // Uncapped native frame rate (preserves exact 24fps/30fps/60fps motion without 3:2 judder)
      stream = capFn.call(videoEl);
    } catch {
      return;
    }
    this.localMovieStreamEl = videoEl;

    // Encode up to 1080p native resolution at 7.5 Mbps single-stream hardware H.264 (zero bufferbloat, sharp clarity)
    const scaleDown = videoEl.videoWidth > 1920 ? Math.min(2.5, Math.round((videoEl.videoWidth / 1920) * 100) / 100) : 1;
    const movieBitrate = 7_500_000;

    const publishVideoTrack = async (track: MediaStreamTrack) => {
      if (this.localMovieStreamEl !== videoEl || this.localMovieTracks.includes(track)) return;
      this.localMovieTracks.push(track);
      try {
        const pub = await lp.publishTrack(track, {
          name: 'local-movie-video',
          source: Track.Source.ScreenShare,
          stream: 'local-movie',
          simulcast: false,
          videoCodec: 'h264', // Hardware GPU encode/decode supported on desktop & mobile (zero dual-simulcast upload)
          backupCodec: false,
          screenShareEncoding: { maxBitrate: movieBitrate, maxFramerate: 60, priority: 'high' },
          degradationPreference: 'maintain-resolution',
        });

        const sender = pub.track?.sender;
        if (sender) {
          try {
            const params = sender.getParameters();
            if (params.encodings?.length) {
              params.encodings[0].scaleResolutionDownBy = scaleDown;
              params.encodings[0].maxBitrate = movieBitrate;
              params.encodings[0].maxFramerate = 60;
              params.encodings[0].priority = 'high';
              params.degradationPreference = 'maintain-resolution';
              await sender.setParameters(params);
            }
          } catch {}
        }
      } catch {
        // ignore duplicate or disconnected publish errors
      }
    };

    const publishAudioTrack = async (track: MediaStreamTrack) => {
      if (this.localMovieStreamEl !== videoEl || this.localMovieTracks.includes(track)) return;
      this.localMovieTracks.push(track);
      // Ensure Chromium APM (AEC/NS/AGC) stays strictly off on local movie music track
      try {
        await track.applyConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints);
      } catch {}
      try {
        await lp.publishTrack(track, {
          name: 'local-movie-audio',
          source: Track.Source.ScreenShareAudio,
          stream: 'local-movie',
          audioPreset: { maxBitrate: 256_000 },
          forceStereo: true,
          dtx: false,
          red: false, // Must be false on stereo Opus music tracks to avoid distortion/dropouts
        });
      } catch {
        // ignore
      }
    };

    const vTrack = stream.getVideoTracks()[0];
    const aTrack = stream.getAudioTracks()[0];
    const pubJobs: Promise<void>[] = [];
    if (vTrack) {
      vTrack.contentHint = 'motion';
      pubJobs.push(publishVideoTrack(vTrack));
    }
    if (aTrack) {
      pubJobs.push(publishAudioTrack(aTrack));
    }
    // Publish video & audio together in parallel so WebRTC locks lip-sync timestamps from frame 1
    await Promise.all(pubJobs);

    // Handle audio track added slightly after play() begins
    stream.addEventListener('addtrack', (ev) => {
      if (this.localMovieStreamEl !== videoEl) return;
      if (ev.track.kind === 'video') {
        ev.track.contentHint = 'motion';
        void publishVideoTrack(ev.track);
      } else if (ev.track.kind === 'audio') {
        void publishAudioTrack(ev.track);
      }
    });
  }

  async stopLocalMovieStream() {
    this.localMovieStreamEl = null;
    const lp = this.room?.localParticipant;
    const tracks = this.localMovieTracks.splice(0);
    if (!lp || tracks.length === 0) return;
    for (const t of tracks) {
      try {
        await lp.unpublishTrack(t, false);
      } catch {}
    }
  }

  private onLocalShareEnded() {
    const s = useRoom.getState();
    if (!s.local.sharing) return;
    s.setLocal({ sharing: false });
    s.setWarnings({ noShareAudio: false, blackFrame: false, slowUpload: null });
    this.stopBlackFrameDetector();
    const others = [...(this.room?.remoteParticipants.values() ?? [])].some((p) => p.isScreenShareEnabled);
    if (s.mode === 'screen' && !others) this.setMode(s.sync.videoId ? 'youtube' : 'idle');
  }

  /** DRM sites often produce a black picture: sample the outgoing frames and warn the host. */
  private startBlackFrameDetector() {
    this.stopBlackFrameDetector();
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const mst = pub?.track?.mediaStreamTrack;
    if (!mst) return;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([mst]);
    void video.play().catch(() => {});
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let darkCount = 0;
    this.blackTimer = setInterval(() => {
      if (!ctx || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      darkCount = max < 10 ? darkCount + 1 : 0;
      const black = darkCount >= 3;
      if (black !== useRoom.getState().warnings.blackFrame) useRoom.getState().setWarnings({ blackFrame: black });
    }, 2000);
    (this.blackTimer as unknown as { video?: HTMLVideoElement }).video = video;
  }

  private stopBlackFrameDetector() {
    if (this.blackTimer) clearInterval(this.blackTimer);
    this.blackTimer = null;
  }

  /* ------------------------------ receiver-side mixing ------------------------------ */

  private attachAudio(track: RemoteTrack) {
    if (track.kind !== Track.Kind.Audio || !this.audioHost) return;
    // ScreenShareAudio attaches directly onto the <video> element in LocalStage/ScreenStage for hardware A/V lip-sync
    if (track.source === Track.Source.ScreenShareAudio) return;
    const el = track.attach();
    this.audioHost.appendChild(el);
  }

  private applyVolumesFor(p: Participant) {
    if (!(p instanceof RemoteParticipant)) return;
    const s = useRoom.getState();
    const per = s.perPerson[p.identity] ?? 1;
    const muted = s.localMuted[p.identity];
    // Two independent gain paths. The stream is never boosted above unity (no clipping).
    p.setVolume(muted ? 0 : s.audio.friendsVolume * per, Track.Source.Microphone);
    p.setVolume(Math.min(1, s.audio.streamVolume * s.duck), Track.Source.ScreenShareAudio);
  }

  applyVolumes() {
    this.room?.remoteParticipants.forEach((p) => this.applyVolumesFor(p));
  }

  /** Optional "Smart duck": lower the stream slightly while a friend talks. Off by default. */
  private updateDuck() {
    const s = useRoom.getState();
    const talking = !!this.room?.activeSpeakers.some((p) => !p.isLocal && p.isMicrophoneEnabled);
    this.duckTarget = s.audio.smartDuck && talking ? SMART_DUCK_LEVEL : 1;
    if (this.duckTimer) return;
    this.duckTimer = setInterval(() => {
      const cur = useRoom.getState().duck;
      const step = this.duckTarget < cur ? 0.06 : 0.03; // duck faster than release
      const next = Math.abs(this.duckTarget - cur) <= step ? this.duckTarget : cur + Math.sign(this.duckTarget - cur) * step;
      useRoom.setState({ duck: next });
      if (next === this.duckTarget && this.duckTimer) {
        clearInterval(this.duckTimer);
        this.duckTimer = null;
      }
    }, 40);
  }

  async unlockAudio() {
    await this.room?.startAudio();
    useRoom.getState().setWarnings({ needsAudioUnlock: !this.room?.canPlaybackAudio });
  }

  /* ------------------------------ knock to enter ------------------------------ */

  private setupKnockPolling() {
    if (this.knockTimer) clearInterval(this.knockTimer);
    this.knockTimer = null;
    const s = useRoom.getState();
    if (!s.me || s.me.role === 'viewer' || !s.roomInfo?.knock) {
      useRoom.setState({ knocks: [] });
      return;
    }
    const poll = async () => {
      try {
        const list = await api.listKnocks(this.roomId, this.hostAuth());
        useRoom.setState({ knocks: list });
        for (const k of list) {
          if (this.seenKnocks.has(k.requestId)) continue;
          this.seenKnocks.add(k.requestId);
          toast(`${k.name} wants to join`, {
            duration: 15000,
            action: { label: 'Admit', onClick: () => void this.decideKnock(k.requestId, true) },
            cancel: { label: 'Deny', onClick: () => void this.decideKnock(k.requestId, false) },
          });
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    this.knockTimer = setInterval(poll, 3000);
  }

  async decideKnock(requestId: string, approve: boolean) {
    try {
      await api.decideKnock(this.roomId, requestId, approve, this.hostAuth());
      useRoom.setState((s) => ({ knocks: s.knocks.filter((k) => k.requestId !== requestId) }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
}

function qualityOf(q: ConnectionQuality): Quality {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'excellent';
    case ConnectionQuality.Good:
      return 'good';
    case ConnectionQuality.Poor:
      return 'poor';
    case ConnectionQuality.Lost:
      return 'lost';
    default:
      return 'unknown';
  }
}

export const controller = new RoomController();
export { EMPTY_SYNC };
