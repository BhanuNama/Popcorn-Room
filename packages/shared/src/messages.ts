import type { SyncState } from './sync';

/** What the centre stage shows. */
export type StageMode = 'idle' | 'screen' | 'youtube' | 'local';

export type RoomTheme = 'midnight' | 'oled' | 'retro' | 'cyberpunk' | 'nordic' | 'sunset';

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  author?: string;
  start?: number;
  addedBy: string;
  addedByName: string;
  votes: string[];
  addedAt: number;
}

export interface ChatReply {
  id: string;
  name: string;
  text: string;
}

export interface ChatGif {
  url: string;
  preview: string;
  width: number;
  height: number;
  title?: string;
}

export interface ReactionMark {
  emoji: string;
  /** seconds on the YouTube timeline (YouTube mode) or since session start (screen mode) */
  time: number;
  mode: StageMode;
  videoId?: string | null;
}

export interface RoomSettings {
  /** Anyone may control YouTube playback and the queue order. */
  openControl: boolean;
  /** Pause everyone when someone buffers for a while. */
  autoPauseOnBuffer: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = { openControl: false, autoPauseOnBuffer: true };

export type DataMessage =
  | {
      t: 'chat';
      id: string;
      text: string;
      at: number;
      replyTo?: ChatReply;
      gif?: ChatGif;
      /** YouTube video time when sent, for spoiler-safe display. */
      vt?: { videoId: string; time: number };
    }
  | { t: 'reaction'; emoji: string; mark: ReactionMark }
  | { t: 'sync'; state: SyncState }
  | { t: 'hello' }
  | {
      t: 'snapshot';
      mode: StageMode;
      sync: SyncState;
      queue: QueueItem[];
      settings: RoomSettings;
      sessionStart: number;
      reactions: ReactionMark[];
    }
  | { t: 'mode'; mode: StageMode }
  | { t: 'queue-add'; item: QueueItem }
  | { t: 'queue-vote'; id: string; up: boolean }
  | { t: 'queue-remove'; id: string }
  | { t: 'presence'; hand: boolean; ready: boolean; buffering: boolean }
  | { t: 'ready-check'; active: boolean }
  /** Server-time at which a 3-2-1 countdown ends (screen mode; YouTube uses a future sync state). */
  | { t: 'countdown'; at: number }
  | { t: 'waiting'; names: string[] }
  | { t: 'theme'; theme: RoomTheme }
  | { t: 'local-meta'; fileName: string; fileSize?: number; duration?: number }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'host-mute' }
  | { t: 'p2p-ready'; fileName: string; fileSize: number; duration?: number }
  | { t: 'p2p-offer'; to: string; sdp: string; fileName: string; fileSize: number }
  | { t: 'p2p-answer'; to: string; sdp: string }
  | { t: 'p2p-ice'; to: string; candidate: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } }
  | { t: 'p2p-fallback' };

export const DATA_TOPIC = 'popcorn';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeMessage(m: DataMessage): Uint8Array<ArrayBuffer> {
  return enc.encode(JSON.stringify(m));
}

export function decodeMessage(data: Uint8Array): DataMessage | null {
  try {
    const m = JSON.parse(dec.decode(data));
    return m && typeof m.t === 'string' ? (m as DataMessage) : null;
  } catch {
    return null;
  }
}

/** Queue sorted by votes (desc), then by time added. */
export function sortQueue(q: QueueItem[]): QueueItem[] {
  return [...q].sort((a, b) => b.votes.length - a.votes.length || a.addedAt - b.addedAt);
}
