import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRequest,
  JoinResponse,
  KnockRequestInfo,
  KnockStatusResponse,
  PublicRoomInfo,
  ChatGif,
} from '@popcorn/shared';

/** In production set VITE_API_URL to the API origin (e.g. https://api.popcorn.example). */
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: init?.json !== undefined ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  }).catch(() => {
    throw new ApiError(0, 'Cannot reach the Popcorn Room server. Is the API running?');
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export interface HostAuth {
  hostKey?: string;
  identity?: string;
  identitySig?: string;
}

export const api = {
  base: BASE,
  createRoom: (b: CreateRoomRequest) => call<CreateRoomResponse>('/api/rooms', { method: 'POST', json: b }),
  getRoom: (id: string) => call<PublicRoomInfo>(`/api/rooms/${encodeURIComponent(id)}`),
  join: (id: string, b: JoinRequest) => call<JoinResponse>(`/api/rooms/${id}/join`, { method: 'POST', json: b }),
  pollKnock: (id: string, rid: string) => call<KnockStatusResponse>(`/api/rooms/${id}/knocks/${rid}`),
  listKnocks: (id: string, auth: HostAuth) => call<KnockRequestInfo[]>(`/api/rooms/${id}/knocks`, { method: 'POST', json: auth }),
  decideKnock: (id: string, rid: string, approve: boolean, auth: HostAuth) =>
    call(`/api/rooms/${id}/knocks/${rid}/decide`, { method: 'POST', json: { ...auth, approve } }),
  updateSettings: (
    id: string,
    b: { anyoneCanPresent?: boolean; knock?: boolean; password?: string | null },
    auth: HostAuth,
  ) => call<PublicRoomInfo>(`/api/rooms/${id}/settings`, { method: 'PATCH', json: { ...auth, ...b } }),
  updateParticipant: (id: string, identity: string, b: { role?: 'cohost' | 'viewer'; presenter?: boolean }, auth: HostAuth) =>
    call(`/api/rooms/${id}/participants/${encodeURIComponent(identity)}`, { method: 'PATCH', json: { ...auth, ...b } }),
  muteParticipant: (id: string, identity: string, auth: HostAuth) =>
    call(`/api/rooms/${id}/participants/${encodeURIComponent(identity)}/mute`, { method: 'POST', json: auth }),
  removeParticipant: (id: string, identity: string, ban: boolean, auth: HostAuth) =>
    call(`/api/rooms/${id}/participants/${encodeURIComponent(identity)}/remove`, { method: 'POST', json: { ...auth, ban } }),
  time: () => call<{ t: number }>('/api/time', { cache: 'no-store' }),
  oembed: (videoId: string) => call<{ title: string; author: string }>(`/api/oembed?id=${videoId}`),
  gifs: (q: string) => call<ChatGif[]>(`/api/gifs?q=${encodeURIComponent(q)}`),

  /** Rough upload test: POST 2 MB and time it. Returns Mbps. */
  async uploadMbps(): Promise<number> {
    const bytes = 2 * 1024 * 1024;
    const blob = new Uint8Array(bytes);
    crypto.getRandomValues(blob.subarray(0, 65536));
    const t0 = performance.now();
    await call('/api/speedtest', { method: 'POST', body: blob, headers: { 'content-type': 'application/octet-stream' } });
    const sec = (performance.now() - t0) / 1000;
    return (bytes * 8) / sec / 1_000_000;
  },
};
