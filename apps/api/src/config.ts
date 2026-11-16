import { randomBytes } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

function req(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required env var ${name}`);
  return devDefault;
}

const livekitUrl = req('LIVEKIT_URL', 'ws://localhost:7880');

export const config = {
  isProd,
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  /** Comma separated list of allowed web origins (CORS). */
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  livekit: {
    /** URL the browser connects to (wss:// in production). */
    url: livekitUrl,
    /** URL the API uses for server-side calls (RoomService). */
    host: process.env.LIVEKIT_HOST || livekitUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://'),
    apiKey: req('LIVEKIT_API_KEY', 'devkey'),
    apiSecret: req('LIVEKIT_API_SECRET', 'secret'),
  },
  /** Secret for signing identities so reconnects keep their role. */
  identitySecret: process.env.IDENTITY_SECRET || randomBytes(32).toString('hex'),
  mongoUri: process.env.MONGODB_URI || '',
  giphyKey: process.env.GIPHY_API_KEY || '',
  tokenTtl: process.env.TOKEN_TTL || '15m',
};
