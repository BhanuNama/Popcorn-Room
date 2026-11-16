import { useEffect, useRef } from 'react';

/**
 * Ambient Glow: Samples colors from the active video or YouTube player preview
 * onto a tiny canvas (16x9) at low frequency (4 fps) and paints a soft blurred glow
 * behind the video stage, matching the cinematic look.
 */
export function AmbientGlow({
  videoEl,
  active,
}: {
  videoEl: HTMLVideoElement | null;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active || !videoEl) return;

    let animId: number;
    let lastTime = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const render = (time: number) => {
      // 4-5 fps is plenty for a smooth, high-performance ambient glow
      if (time - lastTime > 220) {
        lastTime = time;
        if (videoEl.readyState >= 2 && !videoEl.paused && !videoEl.ended) {
          try {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          } catch {
            // cross-origin video safety
          }
        }
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [videoEl, active]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-6 sm:-inset-12 -z-10 overflow-hidden transition-opacity duration-700"
      style={{ opacity: active ? 0.75 : 0 }}
    >
      <canvas
        ref={canvasRef}
        width={16}
        height={9}
        className="h-full w-full scale-125 blur-3xl saturate-150"
      />
    </div>
  );
}
