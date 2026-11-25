import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  EMPTY_SYNC,
  type ChatGif,
  type ChatReply,
  type KnockRequestInfo,
  type PublicRoomInfo,
  type QueueItem,
  type ReactionMark,
  type Role,
  type RoomSettings,
  type RoomTheme,
  type StageMode,
  type SyncState,
} from '@popcorn/shared';
import { loadPref, savePref } from '@/lib/session';

export type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface PersonVM {
  identity: string;
  name: string;
  isLocal: boolean;
  role: Role;
  presenter: boolean;
  hue: number;
  speaking: boolean;
  audioLevel: number;
  micOn: boolean;
  camOn: boolean;
  camTrackId?: string;
  sharing: boolean;
  quality: Quality;
  hand: boolean;
  ready: boolean;
  buffering: boolean;
  joinedAt: number;
}

export interface ChatMsg {
  id: string;
  from: string;
  fromName: string;
  hue: number;
  text: string;
  at: number;
  replyTo?: ChatReply;
  gif?: ChatGif;
  vt?: { videoId: string; time: number };
  pending?: boolean;
  system?: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  name: string;
}

export interface ChatToastItem {
  id: string;
  msgId: string;
  from: string;
  fromName: string;
  hue: number;
  text: string;
  gif?: ChatGif;
  at: number;
}

export interface LocalMovieState {
  file: File | null;
  url: string | null;
  fileName: string | null;
  fileSize: number | null;
  duration: number | null;
  subtitles: {
    name: string;
    url: string;
    rawVtt: string;
    offsetSec: number;
    fontSize: 'sm' | 'md' | 'lg' | 'xl';
    enabled: boolean;
  } | null;
}

export interface AmbientColors {
  top: string;
  bottom: string;
  left: string;
  right: string;
  center: string;
}

export type PanelTab = 'chat' | 'people' | 'queue';

interface AudioPrefs {
  streamVolume: number;
  friendsVolume: number;
  smartDuck: boolean;
  pushToTalk: boolean;
  share60: boolean;
  echoCancellation: boolean;
  micDeviceId: string;
}

export interface RoomState {
  connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  disconnectReason: string | null;
  roomInfo: PublicRoomInfo | null;
  me: { identity: string; identitySig: string; role: Role; name: string; hostKey?: string } | null;

  people: PersonVM[];
  mode: StageMode;
  sync: SyncState;
  queue: QueueItem[];
  settings: RoomSettings;
  sessionStart: number;
  reactions: ReactionMark[];
  floating: FloatingReaction[];
  chat: ChatMsg[];
  unread: number;
  chatToasts: ChatToastItem[];
  dismissChatToast: (id: string) => void;
  countdownAt: number | null;
  readyCheck: boolean;
  waitingFor: string[];
  playhead: { time: number; duration: number; videoId: string | null };
  ytTitle: string;

  audio: AudioPrefs;
  perPerson: Record<string, number>;
  localMuted: Record<string, boolean>;

  local: { micOn: boolean; camOn: boolean; sharing: boolean; pttHeld: boolean; hand: boolean; ready: boolean; micLevel?: number };

  ui: {
    panelOpen: boolean;
    tab: PanelTab;
    theatre: boolean;
    fullscreen: boolean;
    pinned: string | null;
    cameraLayout: 'side' | 'bottom' | 'hidden';
    theme: RoomTheme;
    ambilight: boolean;
    sheetOpen: boolean;
    youtubeDialog: boolean;
    settingsDialog: boolean;
    inviteDialog: boolean;
    recapDialog: boolean;
  };
  warnings: { blackFrame: boolean; noShareAudio: boolean; needsAudioUnlock: boolean; slowUpload: number | null };
  knocks: KnockRequestInfo[];
  /** Current smart-duck multiplier for the stream (1 = no ducking). */
  duck: number;
  consent: { kind: 'mic' | 'camera' | 'screen'; resolve: (ok: boolean) => void } | null;
  localMovie: LocalMovieState;
  ambient: AmbientColors | null;

  set: (p: Partial<RoomState>) => void;
  setUi: (p: Partial<RoomState['ui']>) => void;
  setAudio: (p: Partial<AudioPrefs>) => void;
  setLocal: (p: Partial<RoomState['local']>) => void;
  setLocalMovie: (p: Partial<LocalMovieState>) => void;
  setWarnings: (p: Partial<RoomState['warnings']>) => void;
  reset: () => void;
}

const audioDefaults: AudioPrefs = {
  streamVolume: loadPref('streamVolume', 1),
  friendsVolume: loadPref('friendsVolume', 0.9),
  smartDuck: loadPref('smartDuck', false),
  pushToTalk: loadPref('pushToTalk', false),
  share60: loadPref('share60', true),
  echoCancellation: loadPref('echoCancellation', true),
  micDeviceId: loadPref('micDeviceId', ''),
};

const initial = () => ({
  connection: 'idle' as const,
  disconnectReason: null,
  roomInfo: null,
  me: null,
  people: [],
  mode: 'idle' as StageMode,
  sync: EMPTY_SYNC,
  queue: [],
  settings: DEFAULT_SETTINGS,
  sessionStart: Date.now(),
  reactions: [],
  floating: [],
  chat: [],
  unread: 0,
  chatToasts: [],
  countdownAt: null,
  readyCheck: false,
  waitingFor: [],
  playhead: { time: 0, duration: 0, videoId: null },
  ytTitle: '',
  perPerson: {},
  localMuted: {},
  local: { micOn: false, camOn: false, sharing: false, pttHeld: false, hand: false, ready: false, micLevel: 0 },
  ui: {
    panelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
    tab: 'chat' as PanelTab,
    theatre: false,
    fullscreen: false,
    pinned: null,
    cameraLayout: loadPref<'side' | 'bottom' | 'hidden'>(
      'cameraLayout',
      typeof window !== 'undefined' && window.innerWidth < 768 ? 'bottom' : 'side',
    ),
    theme: loadPref<RoomTheme>('theme', 'midnight'),
    ambilight: loadPref<boolean>('ambilight', true),
    sheetOpen: false,
    youtubeDialog: false,
    settingsDialog: false,
    inviteDialog: false,
    recapDialog: false,
  },
  warnings: { blackFrame: false, noShareAudio: false, needsAudioUnlock: false, slowUpload: null },
  knocks: [],
  duck: 1,
  consent: null,
  localMovie: {
    file: null,
    url: null,
    fileName: null,
    fileSize: null,
    duration: null,
    subtitles: null,
  },
  ambient: null,
});

export const useRoom = create<RoomState>((set) => ({
  ...initial(),
  audio: audioDefaults,
  set: (p) => set(p),
  setUi: (p) =>
    set((s) => {
      if (p.cameraLayout) savePref('cameraLayout', p.cameraLayout);
      if (p.theme) savePref('theme', p.theme);
      if (p.ambilight !== undefined) savePref('ambilight', p.ambilight);
      const ui = { ...s.ui, ...p };
      const chatOpen = (ui.panelOpen || ui.sheetOpen) && ui.tab === 'chat';
      const unread = chatOpen ? 0 : s.unread;
      const chatToasts = chatOpen ? [] : s.chatToasts;
      return { ui, unread, chatToasts };
    }),
  dismissChatToast: (id) =>
    set((s) => ({ chatToasts: s.chatToasts.filter((t) => t.id !== id) })),
  setLocalMovie: (p) =>
    set((s) => ({ localMovie: { ...s.localMovie, ...p } })),
  setAudio: (p) =>
    set((s) => {
      for (const [k, v] of Object.entries(p)) savePref(k, v);
      return { audio: { ...s.audio, ...p } };
    }),
  setLocal: (p) => set((s) => ({ local: { ...s.local, ...p } })),
  setWarnings: (p) => set((s) => ({ warnings: { ...s.warnings, ...p } })),
  reset: () => set({ ...initial() }),
}));

export const roleRank: Record<Role, number> = { host: 3, cohost: 2, viewer: 1 };

export function canControl(s: Pick<RoomState, 'me' | 'settings'>) {
  return !!s.me && (s.me.role !== 'viewer' || s.settings.openControl);
}
