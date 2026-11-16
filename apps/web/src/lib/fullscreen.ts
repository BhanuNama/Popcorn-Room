import { useRoom } from '@/store/room';

export async function toggleRoomFullscreen(target?: HTMLElement | null) {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      const el = target || document.getElementById('room-stage-root') || document.documentElement;
      if (el && el.requestFullscreen) {
        await el.requestFullscreen();
      }
    }
  } catch (err) {
    console.error('Fullscreen toggle failed', err);
  }
}

export function initFullscreenListener() {
  const handler = () => {
    useRoom.getState().setUi({ fullscreen: !!document.fullscreenElement });
  };
  document.addEventListener('fullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
  };
}
