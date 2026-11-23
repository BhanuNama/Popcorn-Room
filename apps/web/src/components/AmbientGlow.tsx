import { useEffect, useRef, useState } from 'react';
import { useRoom, type AmbientColors } from '@/store/room';

const DEFAULT_EDGES: AmbientColors = {
  top: 'rgba(99, 102, 241, 0.38)',
  bottom: 'rgba(56, 189, 248, 0.35)',
  left: 'rgba(99, 102, 241, 0.32)',
  right: 'rgba(245, 158, 11, 0.30)',
  center: 'rgba(56, 189, 248, 0.25)',
};

const THEME_AMBIENT: Record<string, AmbientColors> = {
  midnight: DEFAULT_EDGES,
  retro: {
    top: 'rgba(245, 158, 11, 0.42)',
    bottom: 'rgba(217, 119, 6, 0.35)',
    left: 'rgba(251, 191, 36, 0.32)',
    right: 'rgba(234, 88, 12, 0.35)',
    center: 'rgba(245, 158, 11, 0.24)',
  },
  cyberpunk: {
    top: 'rgba(56, 189, 248, 0.45)',
    bottom: 'rgba(99, 102, 241, 0.4)',
    left: 'rgba(6, 182, 212, 0.4)',
    right: 'rgba(59, 130, 246, 0.4)',
    center: 'rgba(14, 165, 233, 0.28)',
  },
  nordic: {
    top: 'rgba(52, 211, 153, 0.4)',
    bottom: 'rgba(16, 185, 129, 0.32)',
    left: 'rgba(52, 211, 153, 0.3)',
    right: 'rgba(56, 189, 248, 0.28)',
    center: 'rgba(16, 185, 129, 0.22)',
  },
  sunset: {
    top: 'rgba(251, 146, 60, 0.42)',
    bottom: 'rgba(139, 92, 246, 0.36)',
    left: 'rgba(249, 115, 22, 0.34)',
    right: 'rgba(168, 85, 247, 0.34)',
    center: 'rgba(251, 146, 60, 0.24)',
  },
};

/**
 * Synchronized 4-Zone Ambilight Dynamic Backlight Engine.
 * Samples video frame edges at ~12 fps onto an offscreen canvas, projects directional
 * bias light behind the video frame AND broadcasts edge colors to the room backdrop.
 */
export function AmbientGlow({
  videoEl,
  active,
  softFallback = false,
}: {
  videoEl?: HTMLVideoElement | null;
  active: boolean;
  /** Used for cross-origin iframes (like YouTube) where pixel sampling isn't allowed. */
  softFallback?: boolean;
}) {
  const ambilight = useRoom((s) => s.ui.ambilight);
  const theme = useRoom((s) => s.ui.theme);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [colors, setColors] = useState<AmbientColors>(THEME_AMBIENT[theme] ?? DEFAULT_EDGES);

  // In OLED mode, turn off ambient backlight for true 100% pitch black
  const isEnabled = active && ambilight && theme !== 'oled';

  useEffect(() => {
    if (!isEnabled) {
      useRoom.setState({ ambient: null });
      return;
    }

    const base = THEME_AMBIENT[theme] ?? DEFAULT_EDGES;
    setColors(base);
    useRoom.setState({ ambient: base });

    if (!videoEl || softFallback) {
      return () => {
        useRoom.setState({ ambient: null });
      };
    }

    let animId: number;
    let lastSampleTime = 0;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.width = 32;
    canvas.height = 18;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const sample = (time: number) => {
      if (time - lastSampleTime > 85) {
        lastSampleTime = time;

        if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
          try {
            ctx.drawImage(videoEl, 0, 0, 32, 18);
            const imgData = ctx.getImageData(0, 0, 32, 18).data;

            const getRgb = (x0: number, y0: number, x1: number, y1: number, alpha = 0.72) => {
              let r = 0,
                g = 0,
                b = 0,
                count = 0;
              for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                  const idx = (y * 32 + x) * 4;
                  r += imgData[idx];
                  g += imgData[idx + 1];
                  b += imgData[idx + 2];
                  count++;
                }
              }
              if (count === 0) return 'rgba(0,0,0,0)';
              r = Math.round(r / count);
              g = Math.round(g / count);
              b = Math.round(b / count);

              // Saturation & brightness boost so bias lighting stays vivid even in dark scenes
              const avg = (r + g + b) / 3;
              const boost = (c: number) => {
                const saturated = avg + (c - avg) * 1.45;
                return Math.min(255, Math.max(0, Math.round(saturated * 1.15)));
              };

              return `rgba(${boost(r)}, ${boost(g)}, ${boost(b)}, ${alpha})`;
            };

            const next: AmbientColors = {
              top: getRgb(0, 0, 31, 3, 0.75),
              bottom: getRgb(0, 14, 31, 17, 0.75),
              left: getRgb(0, 0, 4, 17, 0.75),
              right: getRgb(27, 0, 31, 17, 0.75),
              center: getRgb(8, 4, 23, 13, 0.45),
            };

            setColors(next);
            useRoom.setState({ ambient: next });
          } catch {
            // Cross-origin safety
          }
        }
      }
      animId = requestAnimationFrame(sample);
    };

    animId = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(animId);
      useRoom.setState({ ambient: null });
    };
  }, [videoEl, isEnabled, softFallback, theme]);

  if (!isEnabled) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-700 select-none"
    >
      {/* Top Edge Bias Light */}
      <div
        className="absolute inset-x-0 -top-6 h-1/2 blur-3xl opacity-90 transition-all duration-300"
        style={{
          background: `radial-gradient(ellipse 85% 55% at 50% 0%, ${colors.top}, transparent 80%)`,
        }}
      />

      {/* Bottom Edge Bias Light */}
      <div
        className="absolute inset-x-0 -bottom-6 h-1/2 blur-3xl opacity-90 transition-all duration-300"
        style={{
          background: `radial-gradient(ellipse 85% 55% at 50% 100%, ${colors.bottom}, transparent 80%)`,
        }}
      />

      {/* Left Edge Bias Light */}
      <div
        className="absolute inset-y-0 -left-6 w-1/2 blur-3xl opacity-90 transition-all duration-300"
        style={{
          background: `radial-gradient(ellipse 55% 85% at 0% 50%, ${colors.left}, transparent 80%)`,
        }}
      />

      {/* Right Edge Bias Light */}
      <div
        className="absolute inset-y-0 -right-6 w-1/2 blur-3xl opacity-90 transition-all duration-300"
        style={{
          background: `radial-gradient(ellipse 55% 85% at 100% 50%, ${colors.right}, transparent 80%)`,
        }}
      />

      {/* Center Soft Halo */}
      <div
        className="absolute inset-4 blur-3xl opacity-75 transition-all duration-300"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${colors.center}, transparent 72%)`,
        }}
      />
    </div>
  );
}
