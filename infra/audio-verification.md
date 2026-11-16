# Popcorn Room - Audio Verification & Quality Protocol

This document outlines the testing methodology to verify the **Sound Requirement (Section 2)**:
> *"The shared sound must come through exactly as it plays, and voices must never touch it."*

---

## 1. Acceptance Targets

| Metric | Target | Failure Condition |
| :--- | :--- | :--- |
| **Channel Count** | Discrete Stereo (2 channels) | Collapsing to Mono |
| **Sampling Rate** | 48.0 kHz | Resampling down to 44.1 or 16 kHz |
| **Audio Bitrate** | 192 - 256 kbps (transparent Opus) | Dropping below 160 kbps |
| **Dynamic Range / Pumping** | 0.0 dB fluctuation when voice active | Any audible ducking or gate pumping |
| **Loudness delta** | Within ±1 LUFS of original | Altered volume by AGC |
| **Loss tolerance** | Clean playback up to 5% packet loss | Clicks/dropouts (prevented by RED/FEC) |
| **DTX Behavior** | Off (continuous silent stream) | Gate clipping on quiet/whisper movie scenes |

---

## 2. Testing Procedure

### Test 1: Full-Frequency Sine Sweep (20 Hz - 20 kHz)
1. **Source**: Play a calibrated 20 Hz to 20,000 Hz logarithmic sweep through a shared browser tab at -14 LUFS.
2. **Viewer Recording**: Capture the output from the viewer's `ScreenShareAudio` GainNode using WebAudio `MediaStreamDestination` or Virtual Audio Cable into Audacity/Reaper.
3. **Spectrogram Analysis**:
   - Verify linear frequency response up to 20 kHz without low-pass cutoff (Opus fullband mode).
   - Ensure High-Pass Voice Filters (standard 80 Hz speech filter) are **NOT** active.

### Test 2: Voice Independence & Dual-Track Separation
1. **Source**: Play a dynamic orchestral soundtrack with quiet string passages and loud brass peaks.
2. **Sender Action**: Have a participant speak loudly or continuously into the microphone.
3. **Viewer Verification**:
   - Verify the orchestral track maintains constant amplitude (no ducking, AGC compression, or sidechain pumping).
   - Verify the viewer can independently mute or reduce the friend's volume to 0% while the music plays at 100% volume with bit-identical waveform characteristics.

### Test 3: Simulated Packet Loss (WebRTC RED & FEC Verification)
1. In Chrome DevTools Network conditions or Chrome WebRTC Internals (`chrome://webrtc-internals`), introduce 5% packet loss on the inbound WebRTC connection.
2. **Target**: RED (RFC 2198) and in-band Forward Error Correction (FEC) reconstruct dropped Opus packets without audible robotic glitching.

---

## 3. Code-Level Enforcement

In `apps/web/src/room/controller.ts`:
```ts
// SCREEN AUDIO CONSTRAINTS
audio: {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
  sampleRate: 48000,
}

// PUBLISH SETTINGS
publish: {
  audioPreset: { maxBitrate: 256_000 },
  forceStereo: true,
  dtx: false,
  red: true,
}
```

In `apps/web/src/store/room.ts`:
```ts
// RECEIVER GAIN NODE ROUTING
remoteParticipant.setVolume(friendsVolume * perPerson, Track.Source.Microphone);
remoteParticipant.setVolume(streamVolume * duck, Track.Source.ScreenShareAudio);
```
Voices travel via their own track and are connected to a distinct WebAudio GainNode on the client, ensuring mathematical separation before the audio hardware.
