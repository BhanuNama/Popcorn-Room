# Popcorn Room - Free Tier Deployment Guide

Popcorn Room is engineered from the ground up so that every component can run on 100% free open-source tools or generous free tiers.

---

## 1. Real-Time Media Server (LiveKit SFU)

You have two free choices:

### Option A: LiveKit Cloud (Easiest - 0 server setup)
- **Free Tier**: 50 GB/month egress bandwidth, unlimited rooms.
- Sign up at [cloud.livekit.io](https://cloud.livekit.io).
- Create a project and copy:
  - `WebSocket URL` (`wss://your-project.livekit.cloud`)
  - `API Key`
  - `API Secret`
- Set these in your API `.env`:
  ```bash
  LIVEKIT_URL=wss://your-project.livekit.cloud
  LIVEKIT_API_KEY=your_key
  LIVEKIT_API_SECRET=your_secret
  ```

### Option B: Self-Hosted on Free VPS (Unlimited bandwidth)
- **Oracle Cloud Always Free**: 2 AMD instances or 4-core 24GB ARM instance free forever.
- Open UDP ports `50000-60000` and TCP `7880-7881` in the security list.
- Run using docker compose:
  ```bash
  cd infra
  docker compose up -d
  ```

---

## 2. API Server (Node.js + Fastify)

Host on any free container or node runtime:
- **Render / Railway / Fly.io / VPS**:
  - Build command: `npm install`
  - Start command: `npm run start -w @popcorn/api`
  - Environment variables:
    - `PORT=8787`
    - `LIVEKIT_URL=wss://...`
    - `LIVEKIT_API_KEY=...`
    - `LIVEKIT_API_SECRET=...`
    - `IDENTITY_SECRET=<generate a random 64-char hex string>`
    - `CORS_ORIGINS=https://your-frontend.pages.dev`
    - Optional: `MONGODB_URI` (MongoDB Atlas M0 Free Cluster)
    - Optional: `GIPHY_API_KEY` (Free GIPHY Developers key for GIF search)

---

## 3. Frontend Web App (React + Vite)

Deploy to **Cloudflare Pages** or **Vercel** (both completely free):
- **Framework Preset**: Vite
- **Root Directory**: `apps/web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL=https://your-api.onrender.com`

---

## 4. YouTube Mode & Audio Note

- **YouTube Mode**: No video or audio passes through your servers or re-encoders. Each client plays directly from YouTube's official player with NTP clock sync and rate-nudge drift correction. This consumes **zero bandwidth** from your SFU quota.
- **Screen Sharing Audio**: Live stream uses transparent Opus 256 kbps in stereo with processing flags disabled, while voice channels use 40 kbps mono with echo cancellation enabled.
