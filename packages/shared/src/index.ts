/**
 * @popcorn/shared
 * Types and pure logic shared by the web app and the API:
 * roles, room info, data-channel messages and the YouTube sync algorithm.
 */

export * from './sync';
export * from './messages';
export * from './youtube';

export type Role = 'host' | 'cohost' | 'viewer';

/** Stored in LiveKit participant metadata (set by the API only). */
export interface ParticipantMeta {
  role: Role;
  /** Can publish the screen share (presenter). */
  presenter: boolean;
  avatarHue: number;
}

export interface PublicRoomInfo {
  id: string;
  name: string;
  hasPassword: boolean;
  knock: boolean;
  anyoneCanPresent: boolean;
  createdAt: number;
}

export interface CreateRoomRequest {
  name?: string;
  hostName: string;
  password?: string;
  knock?: boolean;
  anyoneCanPresent?: boolean;
}

export interface CreateRoomResponse {
  room: PublicRoomInfo;
  /** Secret that proves host-ship to the API. Kept in the host's localStorage. */
  hostKey: string;
}

export interface JoinRequest {
  name: string;
  password?: string;
  hostKey?: string;
  /** Re-use a previous identity (reconnects). Must come with its signature. */
  identity?: string;
  identitySig?: string;
}

export type JoinResponse =
  | {
      status: 'ok';
      token: string;
      url: string;
      identity: string;
      /** HMAC of the identity, lets the client rejoin with the same identity (and role). */
      identitySig: string;
      role: Role;
      room: PublicRoomInfo;
    }
  | { status: 'knocking'; requestId: string };

export type KnockStatusResponse = JoinResponse | { status: 'pending' } | { status: 'denied' };

export interface KnockRequestInfo {
  requestId: string;
  name: string;
  at: number;
}

export const LIMITS = {
  chatMaxLength: 500,
  /** Max chat messages per sender in the window below. */
  chatBurst: 6,
  chatWindowMs: 10_000,
  nameMaxLength: 32,
  roomNameMaxLength: 48,
} as const;

/** Stable pleasant hue for an avatar from a string. */
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function parseMeta(raw: string | undefined | null): ParticipantMeta {
  try {
    const m = JSON.parse(raw || '{}');
    return {
      role: m.role === 'host' || m.role === 'cohost' ? m.role : 'viewer',
      presenter: !!m.presenter,
      avatarHue: typeof m.avatarHue === 'number' ? m.avatarHue : 260,
    };
  } catch {
    return { role: 'viewer', presenter: false, avatarHue: 260 };
  }
}
