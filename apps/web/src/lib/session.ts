/** Small localStorage helpers for per-room secrets and preferences. */

interface RoomSession {
  hostKey?: string;
  identity?: string;
  identitySig?: string;
  password?: string;
}

const key = (id: string) => `popcorn:room:${id}`;

export const session = {
  get(id: string): RoomSession {
    try {
      return JSON.parse(localStorage.getItem(key(id)) || '{}');
    } catch {
      return {};
    }
  },
  set(id: string, patch: RoomSession) {
    localStorage.setItem(key(id), JSON.stringify({ ...session.get(id), ...patch }));
  },
  get displayName() {
    return localStorage.getItem('popcorn:name') || '';
  },
  set displayName(v: string) {
    localStorage.setItem('popcorn:name', v);
  },
};

export function loadPref<T>(name: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`popcorn:pref:${name}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function savePref(name: string, value: unknown) {
  localStorage.setItem(`popcorn:pref:${name}`, JSON.stringify(value));
}
