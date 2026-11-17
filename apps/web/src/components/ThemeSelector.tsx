import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sparkles, Check, Radio, SunMedium, Tv } from 'lucide-react';
import { type RoomTheme } from '@popcorn/shared';
import { controller } from '@/room/controller';
import { canControl, useRoom } from '@/store/room';
import { Switch, Tip } from './ui';
import { cn } from '@/lib/utils';

export interface ThemeOption {
  id: RoomTheme;
  name: string;
  subtitle: string;
  colors: string[];
  borderGlow?: string;
}

export const ROOM_THEMES: ThemeOption[] = [
  {
    id: 'midnight',
    name: 'Midnight Theater',
    subtitle: 'Classic cinema ambiance with deep charcoal tones',
    colors: ['#09090b', '#18181b', '#f97316'],
  },
  {
    id: 'oled',
    name: 'True OLED Pitch Black',
    subtitle: '100% pure black (#000) for OLED panels with zero reflections',
    colors: ['#000000', '#0a0a0a', '#ffffff'],
  },
  {
    id: 'retro',
    name: 'Retro 80s Drive-in',
    subtitle: 'Warm amber glow & nostalgic vintage film vibe',
    colors: ['#120c08', '#24140e', '#f59e0b'],
    borderGlow: 'rgba(245, 158, 11, 0.3)',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Cinema',
    subtitle: 'High contrast electric neon cyan & hot magenta',
    colors: ['#070b14', '#0f172a', '#06b6d4'],
    borderGlow: 'rgba(6, 182, 212, 0.4)',
  },
  {
    id: 'nordic',
    name: 'Nordic Woods',
    subtitle: 'Calm evergreen forest & deep alpine serenity',
    colors: ['#06120d', '#0d2218', '#10b981'],
    borderGlow: 'rgba(16, 185, 129, 0.3)',
  },
  {
    id: 'sunset',
    name: 'Sunset Boulevard',
    subtitle: 'Twilight dusky violet & warm rose gold',
    colors: ['#140818', '#281030', '#f43f5e'],
    borderGlow: 'rgba(244, 63, 94, 0.3)',
  },
];

export function ThemeSelector() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentTheme = useRoom((s) => s.ui.theme);
  const ambilight = useRoom((s) => s.ui.ambilight);
  const isController = useRoom(canControl);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const selectTheme = (theme: RoomTheme) => {
    if (isController) {
      controller.setTheme(theme);
    } else {
      useRoom.getState().setUi({ theme });
    }
  };

  const toggleAmbilight = (enabled: boolean) => {
    useRoom.getState().setUi({ ambilight: enabled });
  };

  return (
    <div ref={containerRef} className="relative">
      <Tip label="Cinema Themes & Wall Ambilight">
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/15',
            open && 'bg-popcorn-primary/25 text-popcorn-primary ring-1 ring-popcorn-primary/40',
          )}
        >
          <Palette size={16} />
        </button>
      </Tip>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-2xl ring-1 ring-black/50"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-popcorn-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Cinema Themes & Vibes
                </span>
              </div>
              {isController && (
                <span className="text-[10px] font-semibold text-popcorn-primary bg-popcorn-primary/10 px-2 py-0.5 rounded-full border border-popcorn-primary/20">
                  Room Host
                </span>
              )}
            </div>

            {/* Theme list */}
            <div className="space-y-1.5 mb-4 max-h-[280px] overflow-y-auto pr-1">
              {ROOM_THEMES.map((theme) => {
                const active = currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => selectTheme(theme.id)}
                    className={cn(
                      'group flex w-full items-center justify-between rounded-xl p-2.5 text-left transition-all border',
                      active
                        ? 'border-popcorn-primary/60 bg-popcorn-primary/10 shadow-sm'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/15',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Color dots preview */}
                      <div className="flex -space-x-1">
                        {theme.colors.map((c, idx) => (
                          <div
                            key={idx}
                            className="h-4 w-4 rounded-full border border-white/20 shadow-sm"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <div>
                        <div className={cn(
                          'text-xs font-semibold tracking-wide transition-colors',
                          active ? 'text-white' : 'text-zinc-300 group-hover:text-white',
                        )}>
                          {theme.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 line-clamp-1">
                          {theme.subtitle}
                        </div>
                      </div>
                    </div>

                    {active && (
                      <Check className="h-4 w-4 text-popcorn-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dynamic 4-zone Ambilight Bias Lighting Toggle */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SunMedium className="h-4 w-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-semibold text-white">Dynamic Ambilight</div>
                    <div className="text-[10px] text-zinc-400">
                      Real-time video edge glow onto backdrop
                    </div>
                  </div>
                </div>
                <Switch
                  checked={ambilight && currentTheme !== 'oled'}
                  onChange={toggleAmbilight}
                  disabled={currentTheme === 'oled'}
                  label="Dynamic Ambilight Backlight"
                />
              </div>

              {currentTheme === 'oled' && (
                <div className="text-[10px] text-zinc-400 mt-2 italic flex items-center gap-1.5 border-t border-white/5 pt-2">
                  <Sparkles className="h-3 w-3 text-popcorn-primary shrink-0" />
                  Auto-disabled in True OLED mode for 100% black pixels.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
