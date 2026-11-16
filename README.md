# 🍿 Popcorn Room (SyncRoom)

> **A free, entertainment-only watch party site with real-time screen sharing, synchronized YouTube playback, chat, reactions, and a Teams-style people panel.**
>
> Built around one unshakeable rule: **The shared sound must come through exactly as it plays, and voices must never touch it.**

---

## ✨ Features

- **Studio-Clean Shared Sound**: Separate stereo 48 kHz WebRTC audio track at 256 kbps transparent Opus with all voice processing (AEC, ANS, AGC) turned **OFF**.
- **Voices Never Touch the Movie**: Voice travels on its own mono track (~40 kbps with voice processing). Receiver mixes locally with independent volume sliders. No unwanted ducking or sidechain compression.
- **Synced YouTube Mode**: Paste any YouTube link. Audio and video play from YouTube's official player with NTP-style clock sync and continuous micro-drift correction (under 0.3 s offset).
- **Interactive Stage**:
  - Live tab, window, or full-screen sharing with 1080p30 / 1080p60 options.
  - Ambient color glow dynamically sampled from video frames.
  - Floating emoji reactions with real-time particle physics.
  - DRM black-frame detection (warns if Netflix / Prime blocks capture).
  - Audio sharing checklist warning for desktop browsers.
- **Teams-Style People Panel**:
  - Live video camera tiles with gentle speaking glow.
  - Per-person volume sliders and local mute toggles.
  - Connection quality indicators (good, fair, poor).
  - Host / Co-Host / Viewer role management and presenter delegation.
  - "Knock to enter" admission workflow.
- **Chat & Fun**:
  - Real-time chat with timestamping, replies, and GIPHY GIF search.
  - **Spoiler-Safe messages** (hidden in YouTube mode until your playback reaches that timestamp).
  - **Session Reaction Recap**: Interactive heatmap visualizer of the funniest and peak moments along the timeline.
- **Shared Queue with Voting**:
  - Friends paste links and vote up the next video.
  - "Everyone ready?" readiness check and a 3-2-1 synchronized countdown.
- **100% Free Stack**: Zero mandatory paid services. Runs on free tiers (LiveKit Cloud, Cloudflare Pages, MongoDB Atlas).

---

## 🎧 The Sound Architecture

```
[ Sender Device ]
  │
  ├──► Tab / Screen Audio ──► [Stereo 48kHz, 256kbps Opus] ────────┐
  │                           echoCancellation: false              │ (Track 1: Untouched)
  │                           noiseSuppression: false              │
  │                           autoGainControl: false               │
  │                                                                ▼
  └──► Microphone Voice   ──► [Mono 40kbps Opus] ───────────► [ LiveKit SFU ]
                              echoCancellation: true               │ (Track 2: Voice Only)
                              noiseSuppression: true               │
                              autoGainControl: true                │
                                                                   ▼
[ Receiver Device ] ◄──────────────────────────────────────────────┘
  │
  ├──► GainNode 1 (Stream Volume Slider) ──┐
  │                                        ├──► Local Audio Destination (Speakers/Headphones)
  └──► GainNode 2 (Friends Volume Slider) ─┘
```

1. **Two Separate Audio Tracks**: Voice and screen audio never touch each other on the sender.
2. **Transparent Opus**: 256 kbps, stereo, 48 kHz.
3. **No Ducking by Default**: An optional "Smart duck" toggle is provided for users who prefer it.
4. **Local Mixing**: Each viewer controls their own balance between movie sound and voice chat.

---

## ⏱️ YouTube Sync Algorithm

1. **NTP Clock Offset**: Client polls `/api/time` to measure round-trip time ($RTT$) and clock offset ($\Delta t$):
   $$\text{offset} = t_{\text{server}} - \left(t_0 + \frac{RTT}{2}\right)$$
2. **Expected Position**:
   $$\text{expected} = \text{position} + (\text{now} + \text{offset} - \text{serverTime}) \times \text{rate}$$
3. **Drift Correction Matrix**:
   - **$< 0.3 \text{ s}$**: In sync. Do nothing.
   - **$0.3 \text{ s} - 2.0 \text{ s}$**: Micro-nudge playback rate ($0.95\times$ or $1.05\times$) until aligned.
   - **$> 2.0 \text{ s}$**: Hard seek directly to expected position.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: v20 or higher
- **npm** (included with Node.js)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/popcorn-room.git
cd "popcorn-room"
npm install
```

### 2. Configure Environment
```bash
# In apps/api/.env
cp apps/api/.env.example apps/api/.env
```
*(Default settings connect to `ws://localhost:7880` or you can paste your free [LiveKit Cloud](https://cloud.livekit.io) credentials).*

### 3. Run Development Servers
```bash
npm run dev
```
- **Web App**: [http://localhost:5173](http://localhost:5173)
- **API Server**: [http://localhost:8787](http://localhost:8787)

---

## 🧪 Testing

```bash
# Run shared unit tests (sync math, clock offset, YouTube parser, queue sorting)
npm test

# Typecheck all workspaces (zero errors)
npm run typecheck

# Build web production bundle
npm run build
```

---

## 🌐 Free Tier Deployment

See [`infra/DEPLOYMENT.md`](infra/DEPLOYMENT.md) for full instructions:
- **Frontend**: Deploy `apps/web` to **Cloudflare Pages** or **Vercel** (Free).
- **Backend**: Deploy `apps/api` to **Render**, **Railway**, or **Fly.io** (Free).
- **Media SFU**: Use **LiveKit Cloud Free Tier** (50 GB/mo free) or self-host via Docker on an **Oracle Cloud Always Free VM**.
- **Database**: Optional **MongoDB Atlas M0 Free Tier** (in-memory works out of the box).

---

## 📜 Privacy & Security

- End-to-end ephemeral tokens minted by API with signed HMAC identities.
- No media is ever recorded or stored on disk.
- Designed strictly for private entertainment between friends. Respect platform terms and copyright.
