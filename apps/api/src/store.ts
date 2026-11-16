import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { MongoClient, type Collection } from 'mongodb';
import type { PublicRoomInfo } from '@popcorn/shared';
import { config } from './config';

export interface RoomRecord {
  id: string;
  name: string;
  passwordHash?: string;
  knock: boolean;
  anyoneCanPresent: boolean;
  hostKeyHash: string;
  hostIdentity?: string;
  cohosts: string[];
  presenters: string[];
  bannedIdentities: string[];
  bannedIps: string[];
  createdAt: number;
  lastActiveAt: number;
}

export interface RoomStore {
  create(r: RoomRecord): Promise<void>;
  get(id: string): Promise<RoomRecord | null>;
  update(id: string, patch: Partial<RoomRecord>): Promise<RoomRecord | null>;
}

/* ---------- in-memory store (default, zero setup) ---------- */
class MemoryStore implements RoomStore {
  private rooms = new Map<string, RoomRecord>();
  async create(r: RoomRecord) {
    this.rooms.set(r.id, r);
  }
  async get(id: string) {
    return this.rooms.get(id) ?? null;
  }
  async update(id: string, patch: Partial<RoomRecord>) {
    const r = this.rooms.get(id);
    if (!r) return null;
    Object.assign(r, patch);
    return r;
  }
}

/* ---------- MongoDB Atlas store (set MONGODB_URI) ---------- */
class MongoStore implements RoomStore {
  constructor(private col: Collection<RoomRecord>) {}
  async create(r: RoomRecord) {
    await this.col.insertOne({ ...r });
  }
  async get(id: string) {
    return this.col.findOne({ id }, { projection: { _id: 0 } });
  }
  async update(id: string, patch: Partial<RoomRecord>) {
    return this.col.findOneAndUpdate({ id }, { $set: patch }, { returnDocument: 'after', projection: { _id: 0 } });
  }
}

export async function createStore(): Promise<{ store: RoomStore; kind: string }> {
  if (!config.mongoUri) return { store: new MemoryStore(), kind: 'memory' };
  try {
    const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const col = client.db(client.options.dbName || 'popcorn').collection<RoomRecord>('rooms');
    await col.createIndex({ id: 1 }, { unique: true });
    return { store: new MongoStore(col), kind: 'mongodb' };
  } catch (err) {
    console.warn(`⚠️ MongoDB connection issue (${(err as Error).message}). Using in-memory store fallback.`);
    return { store: new MemoryStore(), kind: 'memory (fallback)' };
  }
}

/* ---------- crypto helpers ---------- */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${h}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function signIdentity(roomId: string, identity: string): string {
  return createHmac('sha256', config.identitySecret).update(`${roomId}:${identity}`).digest('hex');
}

export function verifyIdentity(roomId: string, identity: string, sig: string | undefined): boolean {
  if (!sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return safeEqualHex(signIdentity(roomId, identity), sig);
}

export function toPublic(r: RoomRecord): PublicRoomInfo {
  return {
    id: r.id,
    name: r.name,
    hasPassword: !!r.passwordHash,
    knock: r.knock,
    anyoneCanPresent: r.anyoneCanPresent,
    createdAt: r.createdAt,
  };
}
