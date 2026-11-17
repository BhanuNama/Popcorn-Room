/**
 * High-performance, client-side Subtitle Utility (.srt and .vtt parser & time-shifter).
 * Zero server dependencies, zero cost.
 */

export function srtToVtt(srtContent: string): string {
  // 1. Strip UTF-8 Byte Order Mark (BOM) if present
  let clean = srtContent.replace(/^\uFEFF/, '').trim();

  // 2. Normalize Windows/Mac line breaks to \n
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Convert SRT timestamp commas (00:01:20,500) to WebVTT periods (00:01:20.500)
  clean = clean.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );

  // 4. Also handle shorthand timestamps if present (01:20,500 -> 00:01:20.500)
  clean = clean.replace(
    /(^|\n)(\d{2}:\d{2}),(\d{3})/g,
    '$100:$2.$3',
  );

  return `WEBVTT\n\n${clean}`;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

function secondsToVttTime(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const secInt = Math.floor(seconds);
  const ms = Math.floor((seconds - secInt) * 1000);

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = secInt.toString().padStart(2, '0');
  const mss = ms.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mss}`;
}

/**
 * Adjusts all timestamps in a WebVTT string by an offset (+/- seconds).
 * Useful when audio and subtitles are slightly out of sync.
 */
export function shiftVtt(vttContent: string, offsetSec: number): string {
  if (Math.abs(offsetSec) < 0.001) return vttContent;

  return vttContent.replace(
    /(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/g,
    (_match, startStr, endStr) => {
      const start = timeToSeconds(startStr) + offsetSec;
      const end = timeToSeconds(endStr) + offsetSec;
      return `${secondsToVttTime(start)} --> ${secondsToVttTime(end)}`;
    },
  );
}

/**
 * Creates a browser object URL for a given subtitle file (.srt or .vtt).
 */
export async function createSubtitleTrack(
  file: File,
  offsetSec = 0,
): Promise<{ url: string; rawVtt: string; name: string }> {
  const text = await file.text();
  const isSrt = file.name.toLowerCase().endsWith('.srt');
  const vtt = isSrt ? srtToVtt(text) : (text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`);
  const shifted = shiftVtt(vtt, offsetSec);
  const blob = new Blob([shifted], { type: 'text/vtt' });
  const url = URL.createObjectURL(blob);
  return { url, rawVtt: vtt, name: file.name };
}
