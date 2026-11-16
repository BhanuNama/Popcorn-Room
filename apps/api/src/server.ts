import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { customAlphabet, nanoid } from 'nanoid';
import { z } from 'zod';
import { LIMITS, type JoinResponse, type KnockRequestInfo, type KnockStatusResponse } from '@popcorn/shared';
import { config } from './config';
import {
  createStore,
  hashPassword,
  safeEqualHex,
  sha256,
  signIdentity,
  toPublic,
  verifyIdentity,
  verifyPassword,
  type RoomRecord,
} from './store';
import { applyParticipantState, applyToAll, mintToken, muteMic, roleFor, roomService } from './livekit';

const roomCode = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);

const app = Fastify({ logger: { level: config.isProd ? 'info' : 'warn' }, trustProxy: true, bodyLimit: 64 * 1024 });
const { store, kind: storeKind } = await createStore();

await app.register(cors, { origin: config.corsOrigins, credentials: false });
await app.register(rateLimit, { global: true, max: 240, timeWindow: '1 minute' });

/* ---------------- helpers ---------------- */

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
  if (err instanceof z.ZodError) return reply.status(400).send({ error: err.issues[0]?.message ?? 'Invalid input' });
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  return reply.status(status).send({ error: status >= 500 ? 'Something went wrong' : (err as Error).message });
});

async function loadRoom(id: string): Promise<RoomRecord> {
  const r = await store.get(id);
  if (!r) throw new HttpError(404, 'Room not found');
  return r;
}

const name = z.string().trim().min(1, 'Name is required').max(LIMITS.nameMaxLength);

const authBody = z.object({
  hostKey: z.string().optional(),
  identity: z.string().optional(),
  identitySig: z.string().optional(),
});

type Auth = { level: 'host' | 'cohost' };

/** Host proves itself with the hostKey; co-hosts with their signed identity. */
function authorize(r: RoomRecord, body: unknown, need: 'host' | 'cohost'): Auth {
  const b = authBody.parse(body ?? {});
  if (b.hostKey && safeEqualHex(sha256(b.hostKey), r.hostKeyHash)) return { level: 'host' };
  if (
    need === 'cohost' &&
    b.identity &&
    r.cohosts.includes(b.identity) &&
    verifyIdentity(r.id, b.identity, b.identitySig)
  )
    return { level: 'cohost' };
  throw new HttpError(403, need === 'host' ? 'Only the host can do that' : 'Only hosts can do that');
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 16) || 'guest'
  );
}

async function issue(r: RoomRecord, displayName: string, identity: string, isHost: boolean): Promise<JoinResponse> {
  const role = roleFor(r, identity, isHost);
  const token = await mintToken(r, identity, displayName, role);
  await store.update(r.id, { lastActiveAt: Date.now() });
  return {
    status: 'ok',
    token,
    url: config.livekit.url,
    identity,
    identitySig: signIdentity(r.id, identity),
    role,
    room: toPublic(r),
  };
}

/* ---------------- knock to enter (ephemeral) ---------------- */
interface Knock {
  requestId: string;
  roomId: string;
  name: string;
  identity: string;
  ip: string;
  at: number;
  state: 'pending' | 'approved' | 'denied';
}
const knocks = new Map<string, Knock>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of knocks) if (v.at < cutoff) knocks.delete(k);
}, 60_000).unref();

/* ---------------- routes ---------------- */

app.get('/api/health', async () => ({ ok: true, store: storeKind, livekitUrl: config.livekit.url, gifs: !!config.giphyKey }));

/** NTP-style clock endpoint. Kept tiny and un-rate-limited-ish for accurate sampling. */
app.get('/api/time', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (_req, reply) => {
  reply.header('cache-control', 'no-store');
  return { t: Date.now() };
});

/** Upload speed probe used before screen sharing (1080p30 needs ~4-6 Mbps up). */
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_r, body, done) =>
  done(null, body),
);
app.post('/api/speedtest', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
  const len = (req.body as Buffer | undefined)?.length ?? 0;
  return { received: len, t: Date.now() };
});

app.post('/api/rooms', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
  const b = z
    .object({
      name: z.string().trim().max(LIMITS.roomNameMaxLength).optional(),
      hostName: name,
      password: z.string().max(64).optional(),
      knock: z.boolean().optional(),
      anyoneCanPresent: z.boolean().optional(),
    })
    .parse(req.body);
  const hostKey = nanoid(32);
  const now = Date.now();
  const r: RoomRecord = {
    id: roomCode(),
    name: b.name || `${b.hostName}'s room`,
    passwordHash: b.password ? hashPassword(b.password) : undefined,
    knock: !!b.knock,
    anyoneCanPresent: !!b.anyoneCanPresent,
    hostKeyHash: sha256(hostKey),
    cohosts: [],
    presenters: [],
    bannedIdentities: [],
    bannedIps: [],
    createdAt: now,
    lastActiveAt: now,
  };
  await store.create(r);
  return { room: toPublic(r), hostKey };
});

app.get<{ Params: { id: string } }>('/api/rooms/:id', async (req) => toPublic(await loadRoom(req.params.id)));

app.post<{ Params: { id: string } }>(
  '/api/rooms/:id/join',
  { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
  async (req): Promise<JoinResponse> => {
    const r = await loadRoom(req.params.id);
    const b = z
      .object({
        name,
        password: z.string().max(64).optional(),
        hostKey: z.string().optional(),
        identity: z.string().max(64).optional(),
        identitySig: z.string().optional(),
      })
      .parse(req.body);

    const isHost = !!b.hostKey && safeEqualHex(sha256(b.hostKey), r.hostKeyHash);
    const reuse = b.identity && verifyIdentity(r.id, b.identity, b.identitySig) ? b.identity : undefined;
    const identity = isHost ? (r.hostIdentity ?? reuse ?? `${slug(b.name)}-${nanoid(6)}`) : (reuse ?? `${slug(b.name)}-${nanoid(6)}`);

    if (isHost) {
      if (!r.hostIdentity) await store.update(r.id, { hostIdentity: identity });
      return issue({ ...r, hostIdentity: identity }, b.name, identity, true);
    }

    if (r.bannedIps.includes(req.ip) || r.bannedIdentities.includes(identity))
      throw new HttpError(403, 'You were removed from this room by the host');

    if (r.passwordHash && !(b.password && verifyPassword(b.password, r.passwordHash)))
      throw new HttpError(401, b.password ? 'Wrong password' : 'This room needs a password');

    // Rejoining with a signed identity skips the knock (they were already let in).
    if (r.knock && !reuse) {
      const requestId = nanoid(16);
      knocks.set(requestId, { requestId, roomId: r.id, name: b.name, identity, ip: req.ip, at: Date.now(), state: 'pending' });
      return { status: 'knocking', requestId };
    }
    return issue(r, b.name, identity, false);
  },
);

/** Guest polls its knock. */
app.get<{ Params: { id: string; rid: string } }>(
  '/api/rooms/:id/knocks/:rid',
  { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
  async (req): Promise<KnockStatusResponse> => {
    const k = knocks.get(req.params.rid);
    if (!k || k.roomId !== req.params.id) throw new HttpError(404, 'Request expired');
    if (k.state === 'pending') return { status: 'pending' };
    if (k.state === 'denied') return { status: 'denied' };
    knocks.delete(k.requestId);
    return issue(await loadRoom(k.roomId), k.name, k.identity, false);
  },
);

/** Hosts list pending knocks. (POST so the key stays out of URLs and logs.) */
app.post<{ Params: { id: string } }>('/api/rooms/:id/knocks', async (req): Promise<KnockRequestInfo[]> => {
  const r = await loadRoom(req.params.id);
  authorize(r, req.body, 'cohost');
  return [...knocks.values()]
    .filter((k) => k.roomId === r.id && k.state === 'pending')
    .map((k) => ({ requestId: k.requestId, name: k.name, at: k.at }));
});

app.post<{ Params: { id: string; rid: string } }>('/api/rooms/:id/knocks/:rid/decide', async (req) => {
  const r = await loadRoom(req.params.id);
  authorize(r, req.body, 'cohost');
  const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
  const k = knocks.get(req.params.rid);
  if (!k || k.roomId !== r.id) throw new HttpError(404, 'Request expired');
  k.state = approve ? 'approved' : 'denied';
  return { ok: true };
});

/** Host: room settings (presenting rules). */
app.patch<{ Params: { id: string } }>('/api/rooms/:id/settings', async (req) => {
  const r = await loadRoom(req.params.id);
  authorize(r, req.body, 'host');
  const b = z
    .object({
      anyoneCanPresent: z.boolean().optional(),
      knock: z.boolean().optional(),
      password: z.string().max(64).nullable().optional(),
    })
    .parse(req.body);
  const patch: Partial<RoomRecord> = {};
  if (b.anyoneCanPresent !== undefined) patch.anyoneCanPresent = b.anyoneCanPresent;
  if (b.knock !== undefined) patch.knock = b.knock;
  if (b.password !== undefined) patch.passwordHash = b.password ? hashPassword(b.password) : undefined;
  const updated = (await store.update(r.id, patch))!;
  if (b.anyoneCanPresent !== undefined) await applyToAll(updated);
  return toPublic(updated);
});

/** Host: change someone's role or presenter right. */
app.patch<{ Params: { id: string; identity: string } }>('/api/rooms/:id/participants/:identity', async (req) => {
  const r = await loadRoom(req.params.id);
  authorize(r, req.body, 'host');
  const target = req.params.identity;
  const b = z.object({ role: z.enum(['cohost', 'viewer']).optional(), presenter: z.boolean().optional() }).parse(req.body);
  if (target === r.hostIdentity) throw new HttpError(400, 'The host role cannot be changed');
  const cohosts = new Set(r.cohosts);
  const presenters = new Set(r.presenters);
  if (b.role === 'cohost') cohosts.add(target);
  if (b.role === 'viewer') cohosts.delete(target);
  if (b.presenter === true) presenters.add(target);
  if (b.presenter === false) presenters.delete(target);
  const updated = (await store.update(r.id, { cohosts: [...cohosts], presenters: [...presenters] }))!;
  await applyParticipantState(updated, target).catch((e) => {
    throw new HttpError(502, `Media server: ${(e as Error).message}`);
  });
  return { ok: true };
});

/** Host / co-host: mute someone's microphone for everyone. */
app.post<{ Params: { id: string; identity: string } }>('/api/rooms/:id/participants/:identity/mute', async (req) => {
  const r = await loadRoom(req.params.id);
  authorize(r, req.body, 'cohost');
  await muteMic(r.id, req.params.identity);
  return { ok: true };
});

/** Host / co-host: remove (and optionally ban) someone. */
app.post<{ Params: { id: string; identity: string } }>('/api/rooms/:id/participants/:identity/remove', async (req) => {
  const r = await loadRoom(req.params.id);
  const auth = authorize(r, req.body, 'cohost');
  const target = req.params.identity;
  if (target === r.hostIdentity) throw new HttpError(400, 'The host cannot be removed');
  if (auth.level === 'cohost' && r.cohosts.includes(target)) throw new HttpError(403, 'Co-hosts cannot remove co-hosts');
  const { ban } = z.object({ ban: z.boolean().optional() }).parse(req.body);
  if (ban) {
    await store.update(r.id, {
      bannedIdentities: [...new Set([...r.bannedIdentities, target])],
      cohosts: r.cohosts.filter((c) => c !== target),
    });
  }
  await roomService.removeParticipant(r.id, target).catch(() => {});
  return { ok: true };
});

/** YouTube title lookup via oEmbed (no API key needed). */
const oembedCache = new Map<string, { title: string; author: string }>();
app.get<{ Querystring: { id?: string } }>('/api/oembed', async (req) => {
  const id = z.string().regex(/^[\w-]{11}$/).parse(req.query.id);
  const hit = oembedCache.get(id);
  if (hit) return hit;
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
  if (!res.ok) throw new HttpError(404, 'Video not found or not embeddable');
  const j = (await res.json()) as { title: string; author_name: string };
  const out = { title: j.title, author: j.author_name };
  oembedCache.set(id, out);
  return out;
});

/** GIF search proxy (GIPHY free key) so the key never reaches the browser. */
app.get<{ Querystring: { q?: string } }>(
  '/api/gifs',
  { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
  async (req) => {
    if (!config.giphyKey) throw new HttpError(501, 'GIF search is not configured (set GIPHY_API_KEY)');
    const q = (req.query.q || '').slice(0, 64);
    const url = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${config.giphyKey}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${config.giphyKey}&limit=24&rating=pg-13`;
    const res = await fetch(url);
    if (!res.ok) throw new HttpError(502, 'GIF provider error');
    const j = (await res.json()) as {
      data: { title: string; images: Record<string, { url: string; width: string; height: string }> }[];
    };
    return j.data.map((g) => ({
      title: g.title,
      url: g.images.fixed_height.url,
      preview: (g.images.fixed_height_small ?? g.images.fixed_height).url,
      width: Number(g.images.fixed_height.width),
      height: Number(g.images.fixed_height.height),
    }));
  },
);

app.setNotFoundHandler((_req: FastifyRequest, reply) => reply.status(404).send({ error: 'Not found' }));

await app.listen({ port: config.port, host: config.host });
console.log(`🍿 Popcorn Room API on http://localhost:${config.port}  (store: ${storeKind}, livekit: ${config.livekit.url})`);
