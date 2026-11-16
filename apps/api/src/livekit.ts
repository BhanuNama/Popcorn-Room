import { AccessToken, RoomServiceClient, TrackSource, TrackType } from 'livekit-server-sdk';
import { hueFromString, type ParticipantMeta, type Role } from '@popcorn/shared';
import { config } from './config';
import type { RoomRecord } from './store';

export const roomService = new RoomServiceClient(config.livekit.host, config.livekit.apiKey, config.livekit.apiSecret);

export function roleFor(r: RoomRecord, identity: string, isHost: boolean): Role {
  if (isHost) return 'host';
  if (r.cohosts.includes(identity)) return 'cohost';
  return 'viewer';
}

export function canPresent(r: RoomRecord, identity: string, role: Role): boolean {
  return role !== 'viewer' || r.anyoneCanPresent || r.presenters.includes(identity);
}

export function sourcesFor(presenter: boolean): TrackSource[] {
  const s = [TrackSource.CAMERA, TrackSource.MICROPHONE];
  if (presenter) s.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  return s;
}

export function metaFor(identity: string, role: Role, presenter: boolean): ParticipantMeta {
  return { role, presenter, avatarHue: hueFromString(identity) };
}

/** Issue a short-lived, signed LiveKit join token. Only the API can mint these. */
export async function mintToken(r: RoomRecord, identity: string, name: string, role: Role): Promise<string> {
  const presenter = canPresent(r, identity, role);
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name,
    ttl: config.tokenTtl,
    metadata: JSON.stringify(metaFor(identity, role, presenter)),
  });
  at.addGrant({
    roomJoin: true,
    room: r.id,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canPublishSources: sourcesFor(presenter),
    // Participants must not be able to change their own role metadata.
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

/** Push a role / presenter change to a connected participant. */
export async function applyParticipantState(r: RoomRecord, identity: string) {
  const isHost = r.hostIdentity === identity;
  const role = roleFor(r, identity, isHost);
  const presenter = canPresent(r, identity, role);
  await roomService.updateParticipant(r.id, identity, {
    metadata: JSON.stringify(metaFor(identity, role, presenter)),
    permission: {
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canPublishSources: sourcesFor(presenter),
      canUpdateMetadata: false,
    },
  });
}

export async function applyToAll(r: RoomRecord) {
  const list = await roomService.listParticipants(r.id).catch(() => []);
  await Promise.allSettled(list.map((p) => applyParticipantState(r, p.identity)));
}

export async function muteMic(roomId: string, identity: string) {
  const p = await roomService.getParticipant(roomId, identity);
  const mic = p.tracks.find((t) => t.source === TrackSource.MICROPHONE && t.type === TrackType.AUDIO);
  if (mic) await roomService.mutePublishedTrack(roomId, identity, mic.sid, true);
}
