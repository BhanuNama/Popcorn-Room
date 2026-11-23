import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sparkles, Check, SunMedium } from 'lucide-react';
import { toast } from 'sonner';
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
}

export const ROOM_THEMES: ThemeOption[] = [
  {
    id: 'midnight',
    name: 'Midnight Theater',
    subtitle: 'Crisp slate charcoal & subtle sky-indigo ambiance',
    colors: ['#070a12', '#0e1422', '#6366f1'],
  },
  {
    id: 'oled',
    name: 'True OLED Pitch Black',
    subtitle: '100% pure black (#000) for OLED screens with zero glare',
    colors: ['#000000', '#0a0a0c', '#e2e8f0'],
  },
  {
    id: 'retro',
    name: 'Retro 80s Drive-in',
    subtitle: 'Warm amber gold & nostalgic vintage cinema vibe',
    colors: ['#140e08', '#24160b', '#f59e0b'],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Azure',
    subtitle: 'High-contrast deep obsidian & electric sky cyan',
    colors: ['#040814', '#08122a', '#38bdf8'],
  },
  {
    id: 'nordic',
    name: 'Nordic Woods',
    subtitle: 'Calm evergreen pine & fresh emerald serenity',
    colors: ['#05110c', '#0a2016', '#34d399'],
  },
  {
    id: 'sunset',
    name: 'Golden Hour Dusk',
    subtitle: 'Twilight indigo & warm golden tangerine glow',
    colors: ['#110b18', '#1c1129', '#fb923c'],
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

  const selectTheme = (themeOpt: ThemeOption) => {
    if (isController) {
      controller.setTheme(themeOpt.id);
    } else {
      useRoom.getState().setUi({ theme: themeOpt.id });
    }
    toast.success(`Theme: ${themeOpt.name}`);
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
            'butter-btn flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.08] text-white backdrop-blur hover:bg-white/[0.14]',
            open && 'bg-coral-500/25 text-coral-300 ring-1 ring-coral-500/40',
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
            transition={{ duration: 0.16 }}
            className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-11 z-50 w-[calc(100vw-1rem)] max-w-80 rounded-2xl border border-white/12 bg-ink-950/95 p-4 shadow-2xl backdrop-blur-2xl ring-1 ring-black/50"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-coral-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Cinema Themes
                </span>
              </div>
              {isController && (
                <span className="text-[10px] font-semibold text-coral-300 bg-coral-500/15 px-2 py-0.5 rounded-full border border-coral-500/25">
                  Room Host
                </span>
              )}
            </div>

            {/* Theme list */}
            <div className="space-y-1.5 mb-4 max-h-[280px] overflow-y-auto pr-1 scroll-thin">
              {ROOM_THEMES.map((theme) => {
                const active = currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => selectTheme(theme)}
                    className={cn(
                      'butter-btn group flex w-full items-center justify-between rounded-xl p-2.5 text-left border',
                      active
                        ? 'border-coral-500/60 bg-coral-500/12 shadow-sm'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15',
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Color dots preview */}
                      <div className="flex -space-x-1 shrink-0">
                        {theme.colors.map((c, idx) => (
                          <div
                            key={idx}
                            className="h-4 w-4 rounded-full border border-white/25 shadow-sm"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <div className="min-w-0">
                        <div
                          className={cn(
                            'text-xs font-semibold tracking-wide transition-colors truncate',
                            active ? 'text-white' : 'text-zinc-300 group-hover:text-white',
                          )}
                        >
                          {theme.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 line-clamp-1">
                          {theme.subtitle}
                        </div>
                      </div>
                    </div>

                    {active && <Check className="h-4 w-4 text-coral-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            {/* Dynamic 4-zone Ambilight Bias Lighting Toggle */}
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SunMedium className="h-4 w-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-white">Dynamic Ambilight</div>
                    <div className="text-[10px] text-zinc-400">
                      Live color projection onto room walls
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
                  <Sparkles className="h-3 w-3 text-coral-300 shrink-0" />
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
