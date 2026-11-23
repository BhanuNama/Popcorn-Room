<div align="center">

# 🪐 The Orbit (`@popcorn/*`)

### **One screen at the center. Everyone in orbit.**

A 100% free, zero-account, cinema-grade real-time watch-party platform with **Hybrid 4K Local Movie Drop + Live WebRTC Streaming**, **60 fps Low-Latency Screen Share**, **NTP-Synced YouTube Lockstep Playback**, **Real-Time 4-Zone Canvas Ambilight**, and **Studio-Isolated Multi-Track Voice & Camera Chat** across laptop and mobile browsers.

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#13-local-development-testing--free-tier-deployment)
[![TypeScript](https://img.shields.io/badge/TypeScript-Monorepo-3178C6?style=flat-square&logo=typescript&logoColor=white)](#5-monorepo-workspace--complete-file-inventory)
[![LiveKit WebRTC](https://img.shields.io/badge/WebRTC-LiveKit_SFU-6366F1?style=flat-square)](#3-system-architecture--network-topology)
[![Zero Cost Stack](https://img.shields.io/badge/Cost-%240_Free_Tier_Native-10B981?style=flat-square)](#13-local-development-testing--free-tier-deployment)

</div>

---

## Table of Contents

1. [Core Agenda & Design Philosophy](#1-core-agenda--design-philosophy)
2. [How The Orbit Differs from Other Platforms](#2-how-the-orbit-differs-from-other-platforms)
3. [System Architecture & Network Topology](#3-system-architecture--network-topology)
4. [Connection, Auth, Knock-to-Enter & Authority Sync Flow](#4-connection-auth-knock-to-enter--authority-sync-flow)
5. [Monorepo Workspace & Complete File Inventory](#5-monorepo-workspace--complete-file-inventory)
6. [Audio & Video Systems Engineering (Deep Dive)](#6-audio--video-systems-engineering-deep-dive)
   - [6.1 Dual-Track Audio Isolation, RED Prevention & Bluetooth HFP Guard](#61-dual-track-audio-isolation-red-prevention--bluetooth-hfp-guard)
   - [6.2 Unified Single-Element Hardware A/V Lip-Sync & Playout Lock](#62-unified-single-element-hardware-av-lip-sync--playout-lock)
   - [6.3 Hybrid 4K Local Movie Drop & Live WebRTC Streaming](#63-hybrid-4k-local-movie-drop--live-webrtc-streaming)
   - [6.4 Low-Latency 60 fps Screen Share Pipeline & Diagnostics](#64-low-latency-60-fps-screen-share-pipeline--diagnostics)
   - [6.5 Client-Side Subtitle Engine (`.srt` → WebVTT + Dynamic Shifter)](#65-client-side-subtitle-engine-srt--webvtt--dynamic-shifter)
7. [Time Synchronization & YouTube Lockstep Algorithms](#7-time-synchronization--youtube-lockstep-algorithms)
   - [7.1 NTP Minimum-RTT Clock Offset Estimation (`ServerClock`)](#71-ntp-minimum-rtt-clock-offset-estimation-serverclock)
   - [7.2 YouTube Timeline Math, Drift Decision Matrix & Autoplay Recovery](#72-youtube-timeline-math-drift-decision-matrix--autoplay-recovery)
8. [Visual Immersion, Camera Engineering & Responsive UI](#8-visual-immersion-camera-engineering--responsive-ui)
   - [8.1 Dynamic 4-Zone Canvas Ambilight Engine (`AmbientGlow`)](#81-dynamic-4-zone-canvas-ambilight-engine-ambientglow)
   - [8.2 Six Non-Pink Cinema Themes (`[data-theme]` Palette Spec)](#82-six-non-pink-cinema-themes-data-theme-palette-spec)
   - [8.3 Camera Hardware Lifecycle, Orientation Parity & Mobile Layout](#83-camera-hardware-lifecycle-orientation-parity--mobile-layout)
   - [8.4 Landing Experience, Chat, Queue, Recap Heatmap & Keyboard Shortcuts](#84-landing-experience-chat-queue-recap-heatmap--keyboard-shortcuts)
9. [State Management Architecture (`useRoom` & `localStorage`)](#9-state-management-architecture-useroom--localstorage)
10. [Security Model, Cryptography, Roles & Rate Limiting](#10-security-model-cryptography-roles--rate-limiting)
11. [Complete REST API & LiveKit DataChannel Reference](#11-complete-rest-api--livekit-datachannel-reference)
12. [Hard-Won Engineering Fixes & Production Postmortems](#12-hard-won-engineering-fixes--production-postmortems)
13. [Local Development, Testing & Free-Tier Deployment](#13-local-development-testing--free-tier-deployment)

---

## 1. Core Agenda & Design Philosophy

Most watch-party and conferencing tools either compress audio like a phone call, require browser extensions/paid accounts, or break down when desktop and phone users watch together.

**The Orbit** is designed from first principles around four pillars:

> [!IMPORTANT]
> **The Unshakeable Sound Rule:** Movie and tab audio must travel as untouched **48 kHz stereo (256 kbps Opus)** with voice DSP strictly turned **OFF**, while participant voices travel on a separate channel and are mixed strictly locally on each viewer's device.

1. **Zero Friction Entry:** No accounts, logins, extensions, or downloads. Create a room in one click and share `/r/:roomId`.
2. **Three Stage Modes Under One Roof:** Seamlessly switch between **60 fps Screen Share**, **Synced YouTube**, and **4K Local Movie Drop** inside the same live session.
3. **Desktop & Phone Parity:** Adaptive layouts automatically move camera strips and chat drawers to non-overlapping bottom surfaces on phones while preserving desktop theatre columns.
4. **100% Free Infrastructure:** Zero paid SaaS dependencies—runs cleanly on free tiers (**Vercel** + **Render** + **LiveKit Cloud Free Tier** or self-hosted **Oracle Cloud Docker** + optional **MongoDB Atlas M0** & **GIPHY**).

---

## 2. How The Orbit Differs from Every Other Watch-Party App

| Feature / Engineering Layer | Teleparty / Extensions | Discord / Meet Screen Share | Virtual Browser Services | **The Orbit** |
| :--- | :--- | :--- | :--- | :--- |
| **Account & Install** | Extension + streaming login required | Account + desktop client for system audio | Account + wait queues | **Pure web URL, instant anonymous guest entry** |
| **Movie vs. Voice Audio** | Relies on external voice chat | Voice AEC/AGC often pumps music; Nitro needed for high quality | Encoded into single VM stream | **Independent stereo movie track (`red: false`) + mono voice track (`40 kbps`)** |
| **Bluetooth Headset Bug** | Unhandled by website | Opening headset mic forces OS 8 kHz HFP telephony mode | Unhandled | **Auto-excludes Bluetooth HFP mics, re-asserts stereo constraints & frees hardware on mute** |
| **A/V Lip-Sync** | Separate from voice overlay | Video & audio jitter buffers can drift apart | Single VM container | **Unified single `<video>` element + locked `120 ms` playout delay on both tracks** |
| **Local Movie Files** | Not supported | OS window capture only | Requires uploading full file | **Hybrid:** Native `blob:` playback + live WebRTC `H.264` stream to guests/phones OR local 4K copies |
| **Custom Subtitles** | Locked to platform captions | None | None | **Offline `.srt` → WebVTT parser + real-time `±0.5 s` offset shifter + 4 font scales** |
| **Theater Immersion** | None | Static dark theme | Plain iframe | **Real-time `32×18` edge-sampling 4-zone Ambilight + 6 non-pink cinema themes** |

---

## 3. System Architecture & Network Topology

**The Orbit** splits responsibilities cleanly across three layers so the API server never touches heavy video/audio traffic and browsers handle rendering, subtitle parsing, and local mixing natively:

```mermaid
flowchart LR
    subgraph Web["Frontend SPA (apps/web · React 19 + Vite + Zustand)"]
        Landing["Landing Page\nOrbital Showcase + Mixer Sim"]
        Room["Room Shell (RoomPage.tsx)\nTopBar + ControlBar + Panels"]
        Stages["Stage Engines\nScreenStage / LocalStage / YouTubeStage"]
        Fx["AmbientGlow Canvas\nServerClock + Subtitle Shifter"]
        Ctrl["RoomController Singleton\ncontroller.ts"]
        Landing --> Room
        Room --> Stages --> Fx
        Room <--> Ctrl
    end

    subgraph Api["Signaling & Auth Server (apps/api · Fastify)"]
        Rest["REST API Routes\nRooms / Knock / Roles / Time / oEmbed / GIFs"]
        Sec["Crypto & Grants\nscrypt / SHA-256 / HMAC / LiveKit JWT"]
        Store["RoomStore\nIn-Memory Map or MongoDB Atlas"]
        Rest <--> Sec
        Rest <--> Store
    end

    subgraph Media["LiveKit SFU Media & Data Mesh"]
        Tracks["Selective Forwarding Media\nScreenShare Video + Stereo Audio\nCamera h360 Simulcast + Mono Voice"]
        Data["LiveKit DataChannel\nTopic: 'popcorn'\nSync / Chat / Queue / Reactions / Snapshot"]
    end

    Ctrl -- "HTTPS JSON (VITE_API_URL)" --> Rest
    Api -- "RoomServiceClient + AccessToken" --> Media
    Ctrl <-- "WebRTC SRTP (WSS)" --> Tracks
    Ctrl <-- "Reliable & Lossy PubSub" --> Data
```

### Design Responsibility Split

| Layer | What It Handles | What It Deliberately Avoids |
| :--- | :--- | :--- |
| **`apps/web`** | WebRTC track capture/playback, NTP probing, YouTube IFrame API, `.srt` parsing, `32×18` canvas Ambilight, chat grouping/spoilers | Exposing GIPHY API keys, trusting client role claims without server JWTs |
| **`apps/api`** | Room creation, salted password verification, waiting-room knocks, signed identity HMACs, LiveKit JWT minting, oEmbed caching, GIPHY proxy | Touching any media bytes, transcoding video/audio, running heavy room timers |
| **`LiveKit SFU`** | Forwarding encrypted DTLS/SRTP media tracks, enforcing `canPublishSources` & `canUpdateOwnMetadata: false`, relaying `DATA_TOPIC` messages | Persistent storage or server-side media recording |

---

## 4. Connection, Auth, Knock-to-Enter & Authority Sync Flow

Every session enforces server-signed role permissions, optional waiting-room admission, minimum-RTT clock alignment, and seamless state catch-up for latecomers or refreshing tabs:

```mermaid
sequenceDiagram
    actor Host
    actor Guest
    participant API as Fastify API
    participant LK as LiveKit SFU

    Note over Host,API: 1. Room Creation & Host Authentication
    Host->>API: POST /api/rooms (hostName, password?, knock?, anyoneCanPresent?)
    API-->>Host: room (PublicRoomInfo) + hostKey (32-char secret)
    Host->>API: POST /api/rooms/:id/join (name, hostKey)
    API-->>Host: status='ok', LiveKit Host JWT, identity, identitySig

    Note over Guest,API: 2. Guest Join / Knock-to-Enter Workflow
    Guest->>API: GET /api/rooms/:id
    API-->>Guest: PublicRoomInfo (hasPassword, knock, anyoneCanPresent)
    Guest->>API: POST /api/rooms/:id/join (name, password?)
    alt knock == true and no valid identitySig
        API-->>Guest: status='knocking', requestId
        loop Poll every 3s on Host/Co-Host
            Host->>API: POST /api/rooms/:id/knocks (hostAuth)
            API-->>Host: Pending [{ requestId, name, at }]
            Host->>API: POST /api/rooms/:id/knocks/:rid/decide (approve: true)
        end
        Guest->>API: GET /api/rooms/:id/knocks/:rid -> status='ok', Viewer JWT, identitySig
    else Password Verified or Signed Reconnect
        API-->>Guest: status='ok', LiveKit JWT, role, identitySig
    end

    Note over Host,LK: 3. WebRTC Connect, Clock Sync & Room Snapshot
    Host->>LK: room.connect(url, token) + ServerClock.sync(8 samples)
    Guest->>LK: room.connect(url, token) + ServerClock.sync(8 samples)
    Guest->>LK: DataChannel -> { t: 'hello' }
    Host->>LK: isAuthority() == true -> { t: 'snapshot', mode, sync, queue, settings, reactions }
```

### Deterministic Authority Election (`controller.isAuthority()`)
Instead of maintaining stateful WebSocket room timers on the backend, peers elect one connected authority dynamically:
- Rank weights: `host = 2`, `cohost = 1`, `viewer = 0`.
- Sorted by highest `roleRank` → earliest LiveKit `joinedAt` timestamp → alphabetical `identity`.
- That elected authority responds to `hello` with full room `snapshot` state and coordinates `autoPauseOnBuffer` if any viewer stalls.

---

## 5. Monorepo Workspace & Complete File Inventory

```text
Popcorn Room/
├── package.json                  # npm workspaces root ("apps/*", "packages/*") & scripts
├── packages/
│   └── shared/                   # @popcorn/shared — pure TypeScript types, crypto-free helpers & algorithms
│       └── src/
│           ├── index.ts          # Role, ParticipantMeta, PublicRoomInfo, LIMITS, hueFromString, parseMeta
│           ├── messages.ts       # StageMode, RoomTheme, 18 DataMessage types, DATA_TOPIC='popcorn', sortQueue
│           ├── sync.ts           # SyncState, DRIFT, expectedPosition, msUntilStart, decideDrift, computeOffset
│           ├── youtube.ts        # parseYouTubeId, parseYouTubeStart, ytThumb
│           └── sync.test.ts      # 18 Vitest unit tests
├── apps/
│   ├── api/                      # @popcorn/api — Fastify REST & LiveKit token/moderation backend
│   │   ├── .env.example          # Port, CORS, LiveKit, Identity Secret, MongoDB & GIPHY templates
│   │   └── src/
│   │       ├── config.ts         # Production env assertions, CORS list parsing, WSS->HTTPS host derivation
│   │       ├── livekit.ts        # AccessToken builder, permission enforcement, muteMic, applyToAll
│   │       ├── server.ts         # 15 HTTP routes, rate limiters, 10-min knock reaper, YouTube oEmbed cache
│   │       └── store.ts          # MemoryStore, MongoStore, scryptSync passwords, SHA-256 & HMAC helpers
│   └── web/                      # @popcorn/web — React 19 + Vite + Tailwind CSS v4 + Motion + LiveKit Client
│       ├── index.html            # Mobile viewport meta, theme color #090d16, Plus Jakarta Sans & Inter fonts
│       ├── public/favicon.svg    # Vector Orbit planet & ring emblem
│       ├── vercel.json           # SPA fallback rewrite -> /index.html
│       └── src/
│           ├── index.css         # Tailwind tokens, orbital keyframes, 6 [data-theme] skins, .butter-btn
│           ├── main.tsx          # React Router & Sonner toast provider bootstrap
│           ├── pages/
│           │   ├── Landing.tsx   # Orbital hero showcase, live theme/mode preview, mixer simulator, CreateRoom
│           │   └── RoomPage.tsx  # Stage container, global file drop overlay, wall Ambilight, Dark Join gate
│           ├── room/
│           │   └── controller.ts # RoomController singleton managing WebRTC, media tracks, mixing & data bus
│           ├── store/
│           │   └── room.ts       # Zustand useRoom state store + localStorage audio/UI defaults
│           ├── lib/
│           │   ├── api.ts        # Fetch client with VITE_API_URL & 2 MB speedtest probe
│           │   ├── browser.ts    # Browser/OS matrix & screen-audio capability flags (caps)
│           │   ├── clock.ts      # ServerClock NTP poller
│           │   ├── fullscreen.ts # Cross-browser fullscreen helpers
│           │   ├── session.ts    # Per-room secrets & user prefs in localStorage
│           │   ├── subtitles.ts  # Offline .srt -> WEBVTT parser & cue time-shifter
│           │   └── utils.ts      # cn(), uid(), initials(), timeOfDay(), isTypingTarget()
│           └── components/       # UI modules: stages, strips, chat, queue, mixer, themes, dialogs, HUD
├── infra/
│   ├── DEPLOYMENT.md             # Free-tier deploy instructions
│   ├── Dockerfile.api            # Production Node API Docker build
│   ├── docker-compose.yml        # Self-hosted LiveKit SFU + Redis + API
│   └── livekit.yaml              # Self-hosted LiveKit port & dev credentials
└── tests/
    ├── playwright.config.ts      # Chromium test runner with fake media devices & dual local webServers
    └── room.spec.ts              # End-to-end tests for The Orbit Landing & 2-user Watch Party join
```

---

## 6. Audio & Video Systems Engineering (Deep Dive)

### 6.1 Dual-Track Audio Isolation, RED Prevention & Bluetooth HFP Guard

```mermaid
flowchart LR
    subgraph Sender["Sender Browser"]
        S_Mov["Tab / Movie Audio\n48 kHz · 2 ch · Raw PCM"] -->|"AEC/NS/AGC = OFF\nred = false · dtx = false"| P_Mov["Opus 256 kbps Stereo\nTrack.Source.ScreenShareAudio"]
        S_Mic["Non-BT Built-in Mic\n1 ch · Mono"] -->|"Bluetooth HFP Filter\nred = true · 40 kbps"| P_Mic["Opus 40 kbps Mono\nTrack.Source.Microphone"]
    end

    P_Mov --> SFU["LiveKit SFU"]
    P_Mic --> SFU

    subgraph Receiver["Receiver Browser (webAudioMix: false)"]
        SFU --> R_Mov["Stage video Element"]
        SFU --> R_Mic["audioHost Audio Tags"]
        R_Mov -->|"Gain = min(1, streamVolume * duck)"| Out["Speakers / Headphones"]
        R_Mic -->|"Gain = muted ? 0 : friendsVolume * perPerson"| Out
    end
```

1. **Opus `red: false` Fix for Stereo Music:** Inspecting `LocalParticipant.mjs` inside `livekit-client` confirmed that enabling RFC 2198 redundancy (`red: true`) on a `forceStereo: true` track conflicts with stereo Opus music encoding, causing distortion and cutouts. Both `ScreenShareAudio` and `local-movie-audio` explicitly override `publishDefaults` with **`red: false`**, **`dtx: false`**, and **`forceStereo: true`**.
2. **Bluetooth Hands-Free (HFP) Auto-Protection (`controller.toggleMic` & `MixerPopover`):**
   - `MixerPopover` intentionally avoids calling `getUserMedia({ audio: true })` on mount so opening settings never activates headset mics prematurely.
   - When `toggleMic()` turns ON, it enumerates devices and filters out `/headset|bluetooth|buds|airpods|hands-free|handsfree|hfp|sco|ag audio|telephony/i` or `communications`, selecting internal array/wired microphones first.
   - Immediately after opening the mic, it calls `.applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 })` on any active `ScreenShareAudio` track so WebRTC never applies voice DSP to the movie.
   - Turning the mic OFF calls `mediaStreamTrack.stop()` + `lp.unpublishTrack(pub.track, true)`, instantly releasing Windows/phone Bluetooth HFP locks back to hi-fi A2DP stereo.
3. **Zero-Output Local Speech Detector (`startLocalAudioMonitor`):** Polls a 128-bin `AnalyserNode` (created with `sinkId: { type: 'none' }` where supported) every `60 ms`, triggering `localSpeaking` above `0.012` average bin magnitude with a `4`-frame (`240 ms`) trailing release.
4. **Smooth Smart Ducking (`controller.updateDuck`):** Off by default (`smartDuck: false`). When enabled and a remote speaker is active, smoothly steps `duck` between `1.0` and `0.7` (`-3 dB`) every `40 ms` (`0.06` fast attack / `0.03` gentle release).

---

### 6.2 Unified Single-Element Hardware A/V Lip-Sync & Playout Lock

- **Shared `<video>` Clock:** `controller.attachAudio()` mounts **only** `Track.Source.Microphone` inside `#audioHost`. Both `ScreenStage.tsx` and `LocalStage.tsx` attach **both** `Track.Source.ScreenShare` (video) and `Track.Source.ScreenShareAudio` (audio) directly onto the same DOM `<video>` element, placing both tracks under one browser media timeline and preventing separate jitter-buffer drift.
- **Playout Delay Matching (`TrackSubscribed`):** For both `ScreenShare` and `ScreenShareAudio`, the client calls `track.setPlayoutDelay(0.12)` (`120 ms` synchronized jitter cap) and forces `pub.setVideoQuality(VideoQuality.HIGH)` on video tracks so mobile viewports never drop to low-resolution layers via `adaptiveStream`.

---

### 6.3 Hybrid 4K Local Movie Drop & Live WebRTC Streaming

**The Orbit** solves the classic local-file watch-party trade-off ("everyone must download the file" vs. "gigabyte server uploads") using a hybrid architecture:

```mermaid
flowchart TD
    Drop["Host Drops .mp4 / .mkv / .webm File"] --> Blob["URL.createObjectURL(file)\nPlays 100% Native on Host"]
    Blob --> Playing["onPlaying fires -> video.captureStream()\nUncapped native FPS + Stereo Audio"]
    Playing --> Pub["Promise.all Parallel Publish (stream: 'local-movie')\nVideo: H.264 single-stream @ 7.5 Mbps (backupCodec: false)\nAudio: Opus 256 kbps stereo (red: false, AEC/NS/AGC = false)"]
    Pub --> GuestCheck{"Does Guest have\nlocal file loaded?"}
    GuestCheck -- "No (Phone / Instant Join)" --> LiveStream["Auto-plays Host Stream on ONE video tag\n(Ambilight + Fullscreen + Mixer Volume)"]
    GuestCheck -- "Yes (Use Local 4K Copy)" --> LocalSync["True 1.0x Local File Sync\n0ms play lead · 1400ms startup grace · Seek if drift > 1.5s"]
```

- **Why Parallel `Promise.all` + `H.264`:** Publishing video first and audio sequentially introduced SDP round-trip drift, and dual-codec simulcast (`32 Mbps`) choked Wi-Fi. Publishing both tracks in parallel under `stream: 'local-movie'` with hardware-friendly `H.264` (`7.5 Mbps`, auto `scaleResolutionDownBy` above `1920px` for 4K files, `maintain-resolution`, `backupCodec: false`) keeps phones smooth and tightly synced.
- **Why True `1.0×` Local File Sync Has Zero Speed-Up:** `controller.play()` commits `leadTime = 0 ms` (`serverTime: clock.now()`). `LocalStage.tsx` locks `v.playbackRate = sync.rate || 1` on `loadedmetadata`, `pause`, and `play` (never calling rate-nudge `1.04×`/`0.96×`), preventing fast/chipmunk music after start or pause/resume. Only drifts `> 1.5 s` after a `1400 ms` startup grace window trigger a hard seek.

---

### 6.4 Low-Latency 60 fps Screen Share Pipeline & Diagnostics

Implemented in `controller.startShare()` and [ScreenStage.tsx](file:///d:/Projects/Popcorn%20Room/apps/web/src/components/ScreenStage.tsx):

- **Codec & Framerate:** Single-stream **`videoCodec: 'vp8'`** (`backupCodec: false`, `simulcast: false`, `contentHint: 'motion'`, `degradationPreference: 'balanced'`), avoiding Windows hybrid-GPU `OpenH264` CPU fallback stalls and `VP9` >1 s encoder queues. Defaults to **`share60 = true` (`1920×1080 @ 60 fps`, `6.0 Mbps`; switchable to `30 fps`, `4.5 Mbps` in Mixer)**.
- **HiDPI Scale Protection:** Checks `mst.getSettings().width`; if OS DPI scaling captures above `1920px`, applies `scaleResolutionDownBy` automatically on `RTCRtpSender`.
- **Upload Probe (`POST /api/speedtest`):** Sends a 2 MB binary buffer on first share to warn (`slowUpload`) if upload speed is under `8 Mbps` (60 fps) or `5 Mbps` (30 fps).
- **Audio & DRM Watchers:** Checks for missing `ScreenShareAudio` (`noShareAudio`) and runs a `32×18` canvas sampler every `2 s` (`startBlackFrameDetector`) to detect DRM black-frames (`maxLuminance < 10` for 3 ticks).
- **Host GPU Conservation & Ref Stability:** `setVideoNode` is memoized via `useCallback` to eliminate render-driven track detach/attach blinking loops; `AmbientGlow` skips on presenter self-preview, and hosts can toggle **Hide Preview (Save GPU)** at any time.

---

### 6.5 Client-Side Subtitle Parser & Real-Time Shifter (`.srt` / `.vtt`)

Implemented completely offline in [subtitles.ts](file:///d:/Projects/Popcorn%20Room/apps/web/src/lib/subtitles.ts):

1. **`srtToVtt()` Pipeline:** Strips UTF-8 BOM (`\uFEFF`), normalizes `\r\n`/`\r` line breaks to `\n`, converts SubRip comma timestamps (`00:01:20,500` → `00:01:20.500`), promotes shorthand timestamps (`01:20,500` → `00:01:20.500`), and prepends `WEBVTT\n\n`.
2. **Real-Time Offset Shifting (`shiftVtt`):** Supports `±0.5 s` live sync adjustments in `LocalStage`, parsing `-->` spans, clamping `>= 0`, formatting `HH:MM:SS.mmm`, regenerating a `Blob` (`text/vtt`), and revoking the previous `ObjectURL` to prevent memory leaks.
3. **Typography:** Supports toggleable `CC` and 4 size presets (`subtitles-sm`, `subtitles-md`, `subtitles-lg`, `subtitles-xl`).

---

## 7. Time Synchronization & YouTube Lockstep Algorithms

### 7.1 NTP Minimum-RTT Clock Offset Estimation (`ServerClock`)

Implemented in [clock.ts](file:///d:/Projects/Popcorn%20Room/apps/web/src/lib/clock.ts) and [sync.ts](file:///d:/Projects/Popcorn%20Room/packages/shared/src/sync.ts):

- On connection, runs **8** HTTP probes (`60 ms` apart) against uncached `GET /api/time` (`cache-control: no-store`), re-sampling (`5` probes) every `60 s`.
- Recording client send time $t_0$, server clock $t_s$, and client receive time $t_1$, `computeOffset()` picks the sample with the lowest round-trip time:

$$\text{RTT}_i = t_{1,i} - t_{0,i}, \qquad i^* = \arg\min_i \text{RTT}_i$$

$$\text{offsetMs} = t_{s,i^*} - \left(t_{0,i^*} + \frac{\text{RTT}_{i^*}}{2}\right), \qquad \text{clock.now()} = \text{Date.now()} + \text{offsetMs}$$

### 7.2 YouTube Timeline Math, Drift Decision Matrix & Autoplay Recovery

```text
expectedPosition(s, offsetMs, now) =
  (s.status !== 'playing')
    ? s.position
    : s.position + max(0, (now + offsetMs - s.serverTime) / 1000) * s.rate
```

| Measured Drift (`current - expected`) | Pure `decideDrift()` Action | `YouTubeStage.tsx` Behavior |
| :--- | :--- | :--- |
| **`\|drift\| <= 0.8 s`** (`DRIFT.ok`) | `'none'` (or `'restoreRate'` if `rate != 1`) | Keeps playback untouched at `1.0×` |
| **`0.8 s < \|drift\| <= 2.5 s`** | `'rate'` (`0.96×` ahead / `1.04×` behind) | Seeks cleanly if `> 1.8 s`, holds rate `1.0×` |
| **`\|drift\| > 2.5 s`** (`DRIFT.seek`) | `'seek'` to `expected` | Immediate `seekTo(expected, true)` |

- **Scheduled Starts (`msUntilStart`):** `controller.loadVideo()` schedules `serverTime = clock.now() + 900` (`+3600` for `startCountdown()`). While `msUntilStart > 0`, players stay paused at `sync.position` and count down `3-2-1` simultaneously.
- **Invalid ID & Version Reset Guard:** `YouTubeStage` enforces `YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/` so `.mp4` names in `sync.videoId` never corrupt `YT.Player`; `applySync()` accepts controller `videoId` changes even across host reload version resets.
- **Mobile Autoplay Recovery:** If YouTube isn't playing after `850 ms`, retries `mute() + playVideo()` + displays **Tap to Unmute YouTube Sound**; if strict mobile WebKit/Chrome still blocks playback after `800 ms`, displays a centered **Tap to Watch & Unmute YouTube** gesture button.
- **Auto-Pause on Buffering:** When `settings.autoPauseOnBuffer` is true and any member buffers `> 3 s`, the authority broadcasts pause (`waiting: names`) until all members finish buffering.

---

## 8. Visual Immersion, Camera Engineering & Responsive UI

### 8.1 Dynamic 4-Zone Canvas Ambilight Engine (`AmbientGlow`)

```mermaid
flowchart LR
    Vid["Active Stage Video Element"] -->|"85 ms rAF Throttle (~12 fps)"| Cvs["Offscreen 32x18 Canvas\nwillReadFrequently: true"]
    Cvs --> Zones["5 Spatial Region Averages\nTop (rows 0-3) · Bottom (14-17)\nLeft (cols 0-4) · Right (27-31) · Center"]
    Zones --> Boost["Vividness Amplification\nout = clamp((avg + (c - avg) * 1.45) * 1.15)"]
    Boost --> StageHalo["Stage Radial Blur Halos\n(behind bg-black video frame)"]
    Boost --> Wall["useRoom.ambient -> Fixed Viewport Wall Glow"]
```

- Keeps an opaque `bg-black` canvas strictly behind `<video>` elements so saturated halo gradients illuminate the theater walls and bezels **without washing out dark video pixels**.
- Disabled automatically in `oled` mode (`theme !== 'oled'`). For cross-origin YouTube embeds (`softFallback`), casts theme-synchronized ambient gradients smoothly around the player.

### 8.2 Six Non-Pink Cinema Themes (`[data-theme]` Palette Spec)

| Theme ID | Display Name | Stage Background (`--theme-bg`) | Accent (`--color-coral-500`) | Design Vibe |
| :--- | :--- | :--- | :--- | :--- |
| `midnight` | **Midnight Theater** | `#070a12` | `#6366f1` | Deep slate charcoal & crisp indigo glow |
| `oled` | **True OLED Pitch Black** | `#000000` | `#475569` | Pure pixel-off `#000` with Ambilight off |
| `retro` | **Retro 80s Drive-in** | `#140e08` | `#f59e0b` | Warm amber gold vintage marquee lighting |
| `cyberpunk` | **Cyberpunk Azure** | `#040814` | `#0ea5e9` | High-contrast dark obsidian & sky cyan |
| `nordic` | **Nordic Woods** | `#05110c` | `#10b981` | Calm evergreen pine & emerald ambiance |
| `sunset` | **Golden Hour Dusk** | `#110b18` | `#f97316` | Deep twilight violet & warm sunset tangerine |

### 8.3 Camera Hardware Lifecycle, Orientation Parity & Mobile Layout

- **Stop-and-Unpublish Lifecycle (`toggleCamera`):** Instead of LiveKit's `mute()`/`unmute()` track reuse (which fails `restartTrack()` on some laptop/phone drivers), turning the camera OFF stops the `MediaStreamTrack` hardware, calls `unpublishTrack(pub.track, true)`, and resets `camOn` under a `camToggling` lock. `camTrackId` reads `mediaStreamTrack.id` so `CameraTile` attaches new tracks instantaneously.
- **Exact Orientation Parity:** Front-facing laptop and mobile cameras produce mirrored raw streams; `CameraTile` defaults `flipped = true` (`-scale-x-100`) on **both** local and remote tiles so presenters and viewers see identical left-to-right framing, alongside hover **Flip** (`FlipHorizontal2`) and **Pin** spotlight sorting (with Host crown pill & animated 3-bar speaking indicator).
- **Responsive Stage Layout (`RoomPage.tsx` & `CameraStrip.tsx`):**

```mermaid
flowchart TD
    Root["RoomPage Stage Wrapper"] -->|Desktop >= 768px| Desk["Side Column (md:w-52) or Bottom Shelf\n+ RightPanel Docked (344-372px)"]
    Root -->|Mobile < 768px| Mob["Strict Vertical Stack (flex-col)\nVideo Top (min-h 200px)\nBottom Camera Shelf (w-28 h-20 tiles)\nRightPanel 62dvh Slide-Up Drawer"]
```

### 8.4 Landing Experience, Chat, Queue, Recap Heatmap & Keyboard Shortcuts

- **Landing Page (`Landing.tsx`):** Orbital ring hero lifted cleanly above the fold (`One screen at the center. Everyone in orbit.`), interactive Theater Showcase (mode + theme switcher + heatmap bars), animated **Orbit Architecture**, **6 Feature Cards**, live **Dual-Track Mixer Simulator** (interactive Movie/Voice sliders + `Smart Duck` toggle), horizontal trajectory **How it Works**, Browser Support badges, and `CreateRoomDialog`.
- **Chat (`ChatTab.tsx` & `ChatToastOverlay.tsx`):** 2-minute message grouping, quote replies, inline 24-emoji pad, uncropped 2-column masonry GIPHY search (`Trending`, `Popcorn`, `Laugh`, `Shocked`, `Clap`, `Love`, `Dance`), YouTube timeline **Spoiler Lock** (`vt` hides messages posted ahead of viewer's playhead until revealed or reached), copy button, jump-to-latest pill, and toast notifications when chat is closed.
- **Queue & Recap (`QueueTab.tsx` & `RecapDialog`):** Upvote-sorted YouTube queue (`votes.length` desc → `addedAt` asc), **Everyone Ready?** check, `3-2-1` countdown launch, and a **12-bin timeline reaction heatmap** summarizing peak party moments.
- **Keyboard Shortcuts:** `F` Fullscreen · `T` Theatre Mode · `Esc` Exit Theatre / Fullscreen / Collapse Panel · `Space` Local Play/Pause or Voice Push-to-Talk · `←`/`→` Local Skip ±10 s · `M` Local Mute.

---

## 9. State Management Architecture (`useRoom` & `localStorage`)

All reactive room state lives in the Zustand store (`apps/web/src/store/room.ts`), cleanly separated into domain slices:

- **Room & Sync:** `connection`, `disconnectReason`, `roomInfo`, `me` (`identity`, `identitySig`, `role`, `name`, `hostKey`), `mode`, `sync` (`EMPTY_SYNC`), `queue`, `settings`, `sessionStart`, `countdownAt`, `readyCheck`, `waitingFor`, `playhead`, `ytTitle`
- **Participants & Social:** `people` (`PersonVM[]`), `knocks` (`KnockRequestInfo[]`), `chat` (`<= 300`), `unread`, `chatToasts` (`<= 3`), `reactions` (`<= 2000`), `floating` (`<= 40`)
- **Audio, Local Media & Immersion:** `audio`, `perPerson`, `localMuted`, `duck`, `local` (`micOn`, `camOn`, `sharing`, `pttHeld`, `hand`, `ready`, `micLevel`), `localMovie` (handle, URL, subtitle state), `ambient`
- **UI & Diagnostics:** `ui` (`panelOpen`, `tab`, `theatre`, `fullscreen`, `pinned`, `cameraLayout`, `theme`, `ambilight`, dialog toggles), `warnings` (`blackFrame`, `noShareAudio`, `needsAudioUnlock`, `slowUpload`), `consent`
- **Persisted Keys (`session.ts`):** `popcorn:room:${id}` (secrets/credentials), `popcorn:name` (display name), and `popcorn:pref:${name}` (`streamVolume`, `friendsVolume`, `smartDuck`, `pushToTalk`, `share60`, `echoCancellation`, `micDeviceId`, `theme`, `ambilight`, `cameraLayout`, `consent:*`).

---

## 10. Security Model, Cryptography, Roles & Rate Limiting

| Role / Capability | Settings & Password | Knock Admit/Deny | Role / Presenter Admin | Mute Others' Mics | Remove / Ban | Playback Control | Share Screen / Local Drop |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`host`** | Yes | Yes | Yes | Yes | Yes (All except self) | Yes | Yes |
| **`cohost`** | Read-only | Yes | No | Yes | Viewers only | Yes | Yes |
| **`viewer`** (+ presenter) | Read-only | No | No | No | No | If `openControl` | Yes |
| **`viewer`** (default) | Read-only | No | No | No | No | If `openControl` | If `anyoneCanPresent` |

- **Cryptographic Helpers (`apps/api/src/store.ts` & `livekit.ts`):**
  - Room passwords salted with 16-byte `randomBytes` + hashed via `scryptSync(..., 32)` and verified with `timingSafeEqual`.
  - Host keys (32-char nanoid) verified via `sha256` + `safeEqualHex`.
  - Reconnect identity signatures use `HMAC-SHA256(IDENTITY_SECRET, "${roomId}:${identity}")`.
  - LiveKit JWTs explicitly set **`canUpdateOwnMetadata: false`** so clients cannot self-escalate roles or publishing permissions.
- **Persistence & Rate Limiting:** `MemoryStore` works out of the box and auto-upgrades to `MongoStore` (`MONGODB_URI`, 5 s connection timeout with automatic in-memory fallback). Fastify throttles all endpoints (`240/min` global, endpoint-specific windows down to `10–600/min`) alongside client sliding-window burst limiters (`6` chats / `10 s`, `8` outgoing cheers / `2 s`, `16` incoming cheers / `2 s`).

---

## 11. Complete REST API & LiveKit DataChannel Reference

### Fastify HTTP API (`apps/api/src/server.ts`)

| Endpoint | Request Payload / Params | Response / Side Effect |
| :--- | :--- | :--- |
| `GET /api/health` | — | `{ ok, store, livekitUrl, gifs }` |
| `GET /api/time` | — | `{ t: Date.now() }` (`cache-control: no-store`) |
| `POST /api/speedtest` | Raw `application/octet-stream` (`<= 8 MB`) | `{ received, t }` |
| `POST /api/rooms` | `{ hostName, name?, password?, knock?, anyoneCanPresent? }` | `{ room: PublicRoomInfo, hostKey }` |
| `GET /api/rooms/:id` | Path `id` | `PublicRoomInfo` (`404` if unknown) |
| `POST /api/rooms/:id/join` | `{ name, password?, hostKey?, identity?, identitySig? }` | `JoinResponse` (`{ status: 'ok', token, url, identity, identitySig, role, room }` or `{ status: 'knocking', requestId }`) |
| `GET /api/rooms/:id/knocks/:rid` | Path `id`, `rid` | `{ status: 'pending' \| 'denied' }` or `JoinOk` |
| `POST /api/rooms/:id/knocks` | Host/Co-Host auth (`hostKey` or signed `identity`) | `KnockRequestInfo[]` |
| `POST /api/rooms/:id/knocks/:rid/decide` | Host/Co-Host auth + `{ approve: boolean }` | `{ ok: true }` (updates knock state) |
| `PATCH /api/rooms/:id/settings` | Host auth + `{ anyoneCanPresent?, knock?, password? }` | Updated `PublicRoomInfo` + syncs connected LiveKit permissions (`applyToAll`) |
| `PATCH /api/rooms/:id/participants/:identity` | Host auth + `{ role?: 'cohost' \| 'viewer', presenter?: boolean }` | `{ ok: true }` + live updates participant JWT metadata/sources |
| `POST /api/rooms/:id/participants/:identity/mute` | Host/Co-Host auth | `{ ok: true }` + server-side `mutePublishedTrack` |
| `POST /api/rooms/:id/participants/:identity/remove` | Host/Co-Host auth + `{ ban?: boolean }` | `{ ok: true }` + removes from LiveKit SFU (+ optional IP/ID ban) |
| `GET /api/oembed?id=...` | `id` (`/^[\\w-]{11}$/`) | `{ title, author }` (in-memory cached) |
| `GET /api/gifs?q=...` | Optional search `q` (`<= 64` chars) | `ChatGif[]` via GIPHY API (`pg-13`, `limit=24`) |

### LiveKit DataChannel Protocol (`DATA_TOPIC = 'popcorn'`, `packages/shared/src/messages.ts`)

| `t` Tag | Payload Fields | Trigger & Receiver Behavior |
| :--- | :--- | :--- |
| `hello` | — | Broadcast on room connect; authority answers with `snapshot` |
| `snapshot` | `mode`, `sync`, `queue`, `settings`, `sessionStart`, `reactions` | Sets initial room state on joining peer |
| `sync` | `state: SyncState` | Updates play/pause/seek/video/rate/version from authorized controller |
| `mode` | `mode: StageMode` | Switches stage between `'idle'`, `'screen'`, `'youtube'`, `'local'` |
| `local-meta` | `fileName`, `fileSize?`, `duration?` | Announces host's local movie filename & metadata |
| `theme` | `theme: RoomTheme` | Syncs host-selected cinema theme across room |
| `settings` | `settings: RoomSettings` | Syncs `openControl` & `autoPauseOnBuffer` |
| `waiting` | `names: string[]` | Shows/clears buffering wait banner |
| `countdown` | `at: number` | Server-time target for synchronized `3-2-1` start |
| `chat` | `id`, `text`, `at`, `replyTo?`, `gif?`, `vt?` | Appends chat item, manages spoiler lock & hidden-drawer toast |
| `reaction` | `emoji`, `mark: ReactionMark` | Renders floating screen reaction & appends timeline mark |
| `presence` | `hand`, `ready`, `buffering` | Updates member hand/ready flags & triggers 3 s buffer monitor |
| `ready-check` | `active: boolean` | Opens/closes Queue ready poll |
| `queue-add` | `item: QueueItem` | Inserts item and runs `sortQueue()` |
| `queue-vote` | `id`, `up: boolean` | Toggles voter ID on queue item & re-sorts |
| `queue-remove` | `id` | Removes item if sender is uploader or controller |
| `host-mute` | — | Host moderation signal |

---

## 12. Hard-Won Engineering Fixes & Production Postmortems

1. **Opus `red: true` Music Corruption:** Disabling RED (`red: false`) on stereo tracks fixed metallic cutouts caused by voice-oriented redundant packet framing over stereo music.
2. **Multi-Codec Dual-Upload Overload (`32 Mbps`):** Eliminating `BackupCodecPolicy.SIMULCAST` (which uploaded 2 concurrent HD streams) stopped Wi-Fi bufferbloat, packet loss, and lagging audio/video.
3. **Un-memoized Ref Detach/Attach Blinking (`ScreenStage`):** Wrapping `setVideoNode` in `useCallback(..., [])` stopped React from firing `null`/`el` teardown on every render and triggering an infinite blank-screen flicker loop.
4. **Local File `1.04×` Fast-Playback Speedup:** Removing the `+50 ms` local play lead delay and locking `LocalStage` playback rate to `sync.rate || 1` eliminated pitch-shifted speedups after starting or unpausing movies.
5. **YouTube Blank Screen & Mobile Collapse:** Validating 11-char YouTube IDs against leftover `.mp4` names, accepting `videoId` switches across version resets, adding `min-h-[220px]` mobile stage bounds, and providing a **Tap to Watch & Unmute** fallback eliminated blank screens on guest phones.
6. **Camera Off/On Stuck Restart & Mirror Flip:** Stopping and unpublishing camera tracks on OFF instead of muting avoided stuck hardware webcam states; setting `flipped = true` (`-scale-x-100`) on both local and remote camera tiles ensured everyone sees the exact same right-way orientation.

---

## 13. Local Development, Testing & Free-Tier Deployment

### Prerequisites & Local Development
- **Node.js v20+** and **npm**

```bash
git clone https://github.com/BhanuNama/Popcorn-Room.git
cd "Popcorn Room"
npm install
cp apps/api/.env.example apps/api/.env
npm run dev                  # Vite web (:5173, proxies /api) + Fastify API (:8787)
```

### Verification Commands (`package.json`)
```bash
npm run typecheck            # Typechecks @popcorn/api, @popcorn/web, and @popcorn/shared
npm test                     # Executes 18 Vitest unit tests in packages/shared/src/sync.test.ts
npm run build                # Builds production Vite bundle + runs API typecheck
npm run test:e2e             # Runs Playwright Chromium E2E tests (tests/room.spec.ts)
```

### Production Hosting & Environment Configuration

| Tier | Host / Path | Required Variables & Notes |
| :--- | :--- | :--- |
| **Web Frontend** | **Vercel** (`apps/web`, output `dist`, SPA rewrite `vercel.json`) | `VITE_API_URL=https://popcorn-room.onrender.com` *(exact origin, no trailing `/`)* |
| **API Backend** | **Render** (`apps/api`, `npm run start -w @popcorn/api`) | `NODE_ENV=production` · `LIVEKIT_URL` · `LIVEKIT_API_KEY` · `LIVEKIT_API_SECRET` · `IDENTITY_SECRET` · `CORS_ORIGINS=https://the-orbit-room.vercel.app` *(exact origin(s), comma-separated, no trailing `/`)* · Optional: `MONGODB_URI`, `GIPHY_API_KEY` |
| **Media SFU** | **LiveKit Cloud** or **Oracle Cloud Docker** | [cloud.livekit.io](https://cloud.livekit.io) (`50 GB/mo` free) or self-host via [`infra/docker-compose.yml`](infra/docker-compose.yml) (see [`infra/DEPLOYMENT.md`](infra/DEPLOYMENT.md)) |

---

<div align="center">

*All voice, video, screen shares, and local movie streams travel directly over encrypted WebRTC (`DTLS/SRTP`) with zero server-side recording or storage.*

</div>
