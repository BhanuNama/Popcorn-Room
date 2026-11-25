export interface ParsedAudioTags {
  title: string;
  artist: string;
  coverDataUrl?: string;
}

export interface LrcLine {
  time: number;
  text: string;
}

function cleanNameFallback(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const dashIdx = base.indexOf(' - ');
  if (dashIdx > 0) {
    return {
      artist: base.slice(0, dashIdx).trim() || 'Unknown Artist',
      title: base.slice(dashIdx + 3).trim() || base,
    };
  }
  return { title: base || 'Untitled Track', artist: 'Local Audio' };
}

function decodeId3Text(bytes: Uint8Array): string {
  if (bytes.length <= 1) return '';
  const enc = bytes[0];
  const payload = bytes.subarray(1);
  try {
    if (enc === 0) return new TextDecoder('iso-8859-1').decode(payload).replace(/\0+$/, '').trim();
    if (enc === 1 || enc === 2) return new TextDecoder('utf-16').decode(payload).replace(/\0+$/, '').trim();
    return new TextDecoder('utf-8').decode(payload).replace(/\0+$/, '').trim();
  } catch {
    return '';
  }
}

function syncsafeToInt(b0: number, b1: number, b2: number, b3: number): number {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function readUint32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function readUint32LE(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

async function compressCoverBlob(blob: Blob): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    // Keep DataURL compact (< 9.5 KB) so LiveKit publishData packets never overflow SCTP/SFU caps
    for (const [size, quality] of [
      [224, 0.72],
      [176, 0.62],
      [128, 0.52],
    ] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= 9500 || size === 128) return out;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function parseId3v2(head: Uint8Array, fallback: { title: string; artist: string }): Promise<ParsedAudioTags> {
  const version = head[3];
  const tagSize = syncsafeToInt(head[6], head[7], head[8], head[9]);
  const limit = Math.min(head.length, 10 + tagSize);
  let pos = 10;
  if ((head[5] & 0x40) !== 0 && pos + 4 <= limit) {
    const extSize = version === 4 ? syncsafeToInt(head[pos], head[pos + 1], head[pos + 2], head[pos + 3]) : readUint32BE(head, pos);
    pos += version === 4 ? extSize : 4 + extSize;
  }

  let title = '';
  let artist = '';
  let coverDataUrl: string | undefined;

  while (pos + 10 <= limit && version >= 3) {
    const id = String.fromCharCode(head[pos], head[pos + 1], head[pos + 2], head[pos + 3]);
    if (id === '\0\0\0\0' || !/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = version === 4 ? syncsafeToInt(head[pos + 4], head[pos + 5], head[pos + 6], head[pos + 7]) : readUint32BE(head, pos + 4);
    pos += 10;
    if (frameSize <= 0 || pos + frameSize > limit) break;
    const body = head.subarray(pos, pos + frameSize);
    pos += frameSize;

    if (id === 'TIT2' && !title) title = decodeId3Text(body);
    else if (id === 'TPE1' && !artist) artist = decodeId3Text(body);
    else if (id === 'APIC' && !coverDataUrl && body.length > 4) {
      const enc = body[0];
      let p = 1;
      while (p < body.length && body[p] !== 0) p++;
      const rawMime = new TextDecoder('ascii').decode(body.subarray(1, p)).trim();
      const mime = rawMime.includes('/') ? rawMime : 'image/jpeg';
      p++; // skip null after mime
      p++; // skip picture type
      if (enc === 1 || enc === 2) {
        while (p + 1 < body.length && (body[p] !== 0 || body[p + 1] !== 0)) p += 2;
        p += 2;
      } else {
        while (p < body.length && body[p] !== 0) p++;
        p++;
      }
      if (p < body.length) {
        coverDataUrl = await compressCoverBlob(new Blob([body.slice(p)], { type: mime }));
      }
    }
  }

  return { title: title || fallback.title, artist: artist || fallback.artist, coverDataUrl };
}

async function parseFlac(head: Uint8Array, fallback: { title: string; artist: string }): Promise<ParsedAudioTags> {
  let pos = 4;
  let title = '';
  let artist = '';
  let coverDataUrl: string | undefined;

  while (pos + 4 <= head.length) {
    const header = head[pos];
    const isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const len = (head[pos + 1] << 16) | (head[pos + 2] << 8) | head[pos + 3];
    pos += 4;
    if (pos + len > head.length) break;
    const block = head.subarray(pos, pos + len);
    pos += len;

    if (type === 4 && block.length >= 8) {
      // VORBIS_COMMENT
      let p = 4 + readUint32LE(block, 0);
      if (p + 4 <= block.length) {
        const count = readUint32LE(block, p);
        p += 4;
        for (let i = 0; i < count && p + 4 <= block.length; i++) {
          const itemLen = readUint32LE(block, p);
          p += 4;
          if (p + itemLen > block.length) break;
          const entry = new TextDecoder('utf-8').decode(block.subarray(p, p + itemLen));
          p += itemLen;
          const eq = entry.indexOf('=');
          if (eq > 0) {
            const k = entry.slice(0, eq).toUpperCase();
            const v = entry.slice(eq + 1).trim();
            if (k === 'TITLE' && !title) title = v;
            else if (k === 'ARTIST' && !artist) artist = v;
          }
        }
      }
    } else if (type === 6 && !coverDataUrl && block.length > 32) {
      // PICTURE block
      let p = 4;
      const mimeLen = readUint32BE(block, p); p += 4;
      const mime = new TextDecoder('ascii').decode(block.subarray(p, p + mimeLen)) || 'image/jpeg';
      p += mimeLen;
      const descLen = readUint32BE(block, p); p += 4 + descLen + 16;
      if (p + 4 <= block.length) {
        const imgLen = readUint32BE(block, p); p += 4;
        if (p + imgLen <= block.length) {
          coverDataUrl = await compressCoverBlob(new Blob([block.slice(p, p + imgLen)], { type: mime }));
        }
      }
    }
    if (isLast) break;
  }

  return { title: title || fallback.title, artist: artist || fallback.artist, coverDataUrl };
}

async function parseMp4Audio(buf: Uint8Array, fallback: { title: string; artist: string }): Promise<ParsedAudioTags> {
  let title = '';
  let artist = '';
  let coverDataUrl: string | undefined;

  const findBox = (start: number, end: number, target: string): { s: number; e: number } | null => {
    let p = start;
    while (p + 8 <= end) {
      const size = readUint32BE(buf, p);
      if (size < 8 || p + size > end) break;
      const name = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      if (name === target) return { s: p + 8, e: p + size };
      p += size;
    }
    return null;
  };

  const moov = findBox(0, buf.length, 'moov');
  const udta = moov ? findBox(moov.s, moov.e, 'udta') : null;
  const meta = udta ? findBox(udta.s, udta.e, 'meta') : null;
  const ilst = meta && meta.s + 4 <= meta.e ? findBox(meta.s + 4, meta.e, 'ilst') : null;

  if (ilst) {
    let p = ilst.s;
    while (p + 8 <= ilst.e) {
      const size = readUint32BE(buf, p);
      if (size < 8 || p + size > ilst.e) break;
      const name = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      const dataBox = findBox(p + 8, p + size, 'data');
      if (dataBox && dataBox.s + 8 < dataBox.e) {
        const typeInd = readUint32BE(buf, dataBox.s);
        const payload = buf.subarray(dataBox.s + 8, dataBox.e);
        if (name === '\xa9nam' && !title) title = new TextDecoder('utf-8').decode(payload).trim();
        else if (name === '\xa9ART' && !artist) artist = new TextDecoder('utf-8').decode(payload).trim();
        else if (name === 'covr' && !coverDataUrl) {
          const mime = typeInd === 14 ? 'image/png' : 'image/jpeg';
          coverDataUrl = await compressCoverBlob(new Blob([payload.slice()], { type: mime }));
        }
      }
      p += size;
    }
  }

  return { title: title || fallback.title, artist: artist || fallback.artist, coverDataUrl };
}

/** Extracts title, artist, and album poster art cleanly from MP3 (ID3v2), FLAC, and M4A files. */
export async function extractAudioTags(file: File): Promise<ParsedAudioTags> {
  const fallback = cleanNameFallback(file.name);
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
    if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      return await parseId3v2(head, fallback);
    }
    if (head.length >= 8 && head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) {
      return await parseFlac(head, fallback);
    }
    if (head.length >= 12 && String.fromCharCode(head[4], head[5], head[6], head[7]) === 'ftyp') {
      // M4A metadata can sit in moov either at start or end of small audio files
      const full = file.size <= 16 * 1024 * 1024 ? new Uint8Array(await file.arrayBuffer()) : head;
      return await parseMp4Audio(full, fallback);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function parseLrc(raw: string): LrcLine[] {
  const out: LrcLine[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const matches = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (matches.length === 0) continue;
    const text = line.replace(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
    for (const m of matches) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      const time = min * 60 + sec + frac;
      if (Number.isFinite(time)) out.push({ time, text: text || '♪' });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
