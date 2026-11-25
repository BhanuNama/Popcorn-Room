import type { Room } from 'livekit-client';

/**
 * Injects x-google-start-bitrate & min-bitrate hints into the LiveKit publisher SDP
 * so Chromium starts screen sharing at ~5 Mbps immediately instead of ramping slowly from 300 kbps.
 */
export function patchPublisherBitrateSdp(room: Room, startKbps = 5000, minKbps = 2000, maxKbps = 10000): void {
  try {
    const engine = (room as unknown as {
      engine?: { pcManager?: { publisher?: { _pc?: RTCPeerConnection } } };
    }).engine;
    const pc = engine?.pcManager?.publisher?._pc;
    if (!pc || (pc as RTCPeerConnection & { __orbitSdpPatched?: boolean }).__orbitSdpPatched) return;
    (pc as RTCPeerConnection & { __orbitSdpPatched?: boolean }).__orbitSdpPatched = true;

    const origSetLocal = pc.setLocalDescription.bind(pc);
    pc.setLocalDescription = (desc?: RTCLocalSessionDescriptionInit) => {
      if (desc?.sdp && desc.type === 'offer') {
        desc = { ...desc, sdp: mungeVideoBitrate(desc.sdp, startKbps, minKbps, maxKbps) };
      }
      return origSetLocal(desc);
    };
  } catch {
    // Safe fallback if LiveKit internal transport layout differs
  }
}

export function mungeVideoBitrate(sdp: string, startKbps: number, minKbps: number, maxKbps: number): string {
  const lines = sdp.split('\r\n');
  let inVideo = false;
  const videoPayloads = new Set<string>();
  const existingFmtp = new Set<string>();

  for (const line of lines) {
    if (line.startsWith('m=')) {
      inVideo = line.startsWith('m=video ');
      if (inVideo) {
        line
          .split(' ')
          .slice(3)
          .forEach((p) => videoPayloads.add(p));
      }
    } else if (inVideo && line.startsWith('a=fmtp:')) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx > 7) existingFmtp.add(line.slice(7, spaceIdx));
    }
  }

  inVideo = false;
  const bitrateParams = `x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps};x-google-max-bitrate=${maxKbps}`;
  const out: string[] = [];

  for (const line of lines) {
    if (line.startsWith('m=')) {
      inVideo = line.startsWith('m=video ');
      out.push(line);
      if (inVideo) {
        out.push(`b=AS:${maxKbps}`);
      }
      continue;
    }

    if (inVideo && line.startsWith('b=AS:')) {
      continue; // replaced with our ceiling above
    }

    if (inVideo && line.startsWith('a=rtpmap:')) {
      out.push(line);
      const spaceIdx = line.indexOf(' ');
      const payload = spaceIdx > 9 ? line.slice(9, spaceIdx) : '';
      if (videoPayloads.has(payload) && !existingFmtp.has(payload)) {
        const codec = line.slice(spaceIdx + 1).toUpperCase();
        if (codec.startsWith('VP8/') || codec.startsWith('VP9/') || codec.startsWith('H264/') || codec.startsWith('AV1/')) {
          out.push(`a=fmtp:${payload} ${bitrateParams}`);
        }
      }
      continue;
    }

    if (inVideo && line.startsWith('a=fmtp:')) {
      const spaceIdx = line.indexOf(' ');
      const payload = spaceIdx > 7 ? line.slice(7, spaceIdx) : '';
      if (videoPayloads.has(payload) && !line.includes('x-google-start-bitrate')) {
        out.push(`${line};${bitrateParams}`);
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\r\n');
}

/**
 * Monitors RTCRtpSender stats every 4s and dynamically adjusts maxBitrate to ~75% of real
 * availableOutgoingBitrate (avoiding Wi-Fi router bufferbloat while maximizing clean clarity).
 */
export function startBitrateAutopilot(
  sender: RTCRtpSender,
  targetCeilingBps: number,
  targetFps: number,
): () => void {
  let lastLost = 0;
  let lastSent = 0;
  let currentCap = targetCeilingBps;
  let ticks = 0;
  let lowStreak = 0;

  const timer = setInterval(async () => {
    ticks++;
    try {
      const stats = await sender.getStats();
      let availBps = 0;
      let lost = 0;
      let sent = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.nominated && typeof report.availableOutgoingBitrate === 'number') {
          availBps = report.availableOutgoingBitrate;
        }
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          sent = report.packetsSent ?? sent;
        }
        if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
          lost = report.packetsLost ?? lost;
        }
      });

      const dSent = Math.max(1, sent - lastSent);
      const dLost = Math.max(0, lost - lastLost);
      lastSent = sent;
      lastLost = lost;
      const lossRate = dLost / dSent;

      // Give WebRTC BWE 8s (2 ticks) to ramp up before throttling down
      if (ticks <= 2 && lossRate <= 0.03) return;

      let nextCap = currentCap;
      if (availBps > 0 && availBps < currentCap * 0.72) {
        lowStreak++;
        if (lowStreak >= 2) {
          nextCap = Math.max(3_500_000, Math.min(targetCeilingBps, Math.round(availBps * 0.82)));
        }
      } else {
        lowStreak = 0;
        if (availBps > currentCap * 1.15) {
          nextCap = Math.min(targetCeilingBps, Math.round(availBps * 0.82));
        }
      }
      if (lossRate > 0.03) {
        nextCap = Math.max(3_000_000, Math.round(nextCap * 0.85));
      }

      if (Math.abs(nextCap - currentCap) > 500_000) {
        currentCap = nextCap;
        const params = sender.getParameters();
        if (params.encodings?.length) {
          params.encodings[0].maxBitrate = currentCap;
          params.encodings[0].maxFramerate = targetFps;
          params.degradationPreference = 'maintain-framerate';
          await sender.setParameters(params);
        }
      }
    } catch {
      // ignore transient stats / renegotiation errors
    }
  }, 4000);

  return () => clearInterval(timer);
}
