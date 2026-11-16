/** Parse a YouTube URL (or bare id) into a video id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return valid(u.pathname.slice(1).split('/')[0]);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return valid(u.searchParams.get('v')!);
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function valid(id: string): string | null {
  return /^[\w-]{11}$/.test(id) ? id : null;
}

/** Start time from ?t= / &start= in a link, in seconds. */
export function parseYouTubeStart(input: string): number {
  try {
    const u = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`);
    const t = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!m) return 0;
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  } catch {
    return 0;
  }
}

export function ytThumb(videoId: string, quality: 'default' | 'mqdefault' | 'hqdefault' = 'mqdefault') {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}
