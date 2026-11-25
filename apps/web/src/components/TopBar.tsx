import { useState } from 'react';
import {
  Share2,
  Check,
  Settings,
  Maximize2,
  Minimize2,
  Tv,
  BarChart3,
  Wifi,
  MonitorUp,
  MonitorOff,
  Film,
  Music,
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from './Logo';
import { YoutubeIcon } from './YoutubeIcon';
import { MixerPopover } from './MixerPopover';
import { ThemeSelector } from './ThemeSelector';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { Tip } from './ui';
import { cn } from '@/lib/utils';
import { caps } from '@/lib/browser';
import { toggleRoomFullscreen } from '@/lib/fullscreen';

export function TopBar() {
  const roomInfo = useRoom((s) => s.roomInfo);
  const me = useRoom((s) => s.me);
  const people = useRoom((s) => s.people);
  const mode = useRoom((s) => s.mode);
  const local = useRoom((s) => s.local);
  const theatre = useRoom((s) => s.ui.theatre);
  const fullscreen = useRoom((s) => s.ui.fullscreen);
  const [copied, setCopied] = useState(false);

  const myPerson = people.find((p) => p.isLocal);
  const quality = myPerson?.quality ?? 'good';

  const toggleTheatre = () => {
    useRoom.getState().setUi({ theatre: !theatre, panelOpen: theatre });
  };

  const copyInvite = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(
      () => {
        toast.success('Room link copied to clipboard!');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => toast.error('Could not copy link'),
    );
  };

  return (
    <header className="relative z-30 flex h-12 sm:h-14 items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-4">
      {/* Left: Brand, Room Name (sm+) & Watching Badge */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
        <Logo dark className="scale-80 sm:scale-90 origin-left shrink-0 [&>span]:hidden sm:[&>span]:inline" />
        <span className="h-4 w-px bg-white/10 hidden sm:block shrink-0" />
        <div className="hidden sm:flex items-center gap-1.5 min-w-0">
          <span className="font-display text-sm font-bold text-white truncate max-w-[140px] lg:max-w-xs">
            {roomInfo?.name || 'The Orbit'}
          </span>
          {people.length > 0 && (
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[10px] font-medium text-white/75 ring-1 ring-white/10 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {people.length} watching
            </span>
          )}
          {me?.role === 'host' && (
            <span className="hidden lg:inline-flex rounded-md bg-coral-500/20 px-1.5 py-0.5 text-[10px] font-bold text-coral-300 ring-1 ring-coral-500/30 shrink-0">
              Host
            </span>
          )}
        </div>
      </div>

      {/* Center: Unified Stage Mode Switcher Dock + Audio Mixer */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
        <div className="flex items-center gap-0.5 rounded-2xl bg-white/[0.06] p-0.5 sm:p-1 ring-1 ring-white/10 backdrop-blur-md">
          {/* Screen Share */}
          {caps.canShareScreen && (
            <Tip label={local.sharing ? 'Stop Sharing Screen' : 'Share Screen with Stereo Audio'}>
              <button
                onClick={() => controller.toggleShare()}
                className={cn(
                  'butter-btn flex h-8 items-center gap-1.5 rounded-xl px-2 sm:px-3 text-xs font-semibold',
                  local.sharing
                    ? 'bg-coral-500 text-white shadow-glow hover:bg-coral-600'
                    : mode === 'screen'
                      ? 'bg-white/12 text-white ring-1 ring-white/15'
                      : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                {local.sharing ? <MonitorOff size={14} /> : <MonitorUp size={14} />}
                <span className="hidden md:inline">
                  {local.sharing ? 'Stop Share' : 'Share Screen'}
                </span>
              </button>
            </Tip>
          )}

          {/* YouTube Mode */}
          <Tip label="Synced YouTube Mode">
            <button
              onClick={() => useRoom.getState().setUi({ youtubeDialog: true })}
              className={cn(
                'butter-btn flex h-8 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs font-semibold',
                mode === 'youtube'
                  ? 'bg-red-500/25 text-red-200 ring-1 ring-red-400/40'
                  : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <YoutubeIcon size={15} className="text-red-400" />
              <span className="hidden md:inline">YouTube</span>
            </button>
          </Tip>

          {/* Local Video File Sync Mode */}
          <Tip label="Local 4K Movie Drop + Subtitles">
            <button
              onClick={() => controller.setMode('local')}
              className={cn(
                'butter-btn flex h-8 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs font-semibold',
                mode === 'local'
                  ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/40'
                  : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <Film size={14} className="text-amber-300" />
              <span className="hidden md:inline">Local Movie</span>
            </button>
          </Tip>

          {/* Listen Together Music Lounge Mode */}
          <Tip label="Music Lounge · Hi-Fi Drop & Lo-Fi">
            <button
              onClick={() => controller.setMode('music')}
              className={cn(
                'butter-btn flex h-8 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs font-semibold',
                mode === 'music'
                  ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40'
                  : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <Music size={14} className="text-emerald-300" />
              <span className="hidden md:inline">Music</span>
            </button>
          </Tip>
        </div>

        {/* Sound Mixer */}
        <MixerPopover />
      </div>

      {/* Right: Connection Quality, Stage Layout, Themes, Invite & Settings */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Connection Quality indicator */}
        <div
          className="hidden xl:flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-xs text-white/70 ring-1 ring-white/10"
          title={`Connection: ${quality}`}
        >
          <Wifi
            size={13}
            className={
              quality === 'excellent' || quality === 'good'
                ? 'text-emerald-400'
                : quality === 'poor'
                  ? 'text-amber-400'
                  : 'text-red-400'
            }
          />
          <span className="capitalize text-[11px] font-medium">{quality}</span>
        </div>

        {/* Grouped Fullscreen + Theatre View Pill */}
        <div className="hidden sm:flex items-center gap-0.5 rounded-xl bg-white/[0.06] p-0.5 ring-1 ring-white/10">
          <Tip label={fullscreen ? 'Exit Fullscreen (Esc / F)' : 'Fullscreen (F)'}>
            <button
              onClick={() => toggleRoomFullscreen()}
              className={cn(
                'butter-btn grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white',
                fullscreen && 'bg-coral-500/25 text-coral-200 ring-1 ring-coral-400/40',
              )}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </Tip>

          <Tip label={theatre ? 'Exit Theatre Mode (Esc / T)' : 'Theatre Mode (T)'}>
            <button
              onClick={toggleTheatre}
              className={cn(
                'butter-btn grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white',
                theatre && 'bg-coral-500/25 text-coral-200 ring-1 ring-coral-400/40',
              )}
            >
              <Tv size={15} className={theatre ? 'text-coral-300' : ''} />
            </button>
          </Tip>
        </div>

        {/* Reaction Recap Heatmap Button */}
        <Tip label="Session Recap & Reaction Heatmap">
          <button
            onClick={() => useRoom.getState().setUi({ recapDialog: true })}
            className="butter-btn hidden md:flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.07] px-2.5 sm:px-3 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur hover:bg-white/[0.13]"
          >
            <BarChart3 size={14} className="text-amber-300" />
            <span className="hidden lg:inline">Recap</span>
          </button>
        </Tip>

        {/* Cinema Themes & Dynamic Wall Ambilight */}
        <ThemeSelector />

        {/* Invite Button */}
        <button
          onClick={copyInvite}
          className={cn(
            'butter-btn flex h-9 items-center gap-1.5 rounded-xl px-2.5 sm:px-3.5 text-xs font-semibold text-white shadow-md transition',
            copied ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-coral-500 hover:bg-coral-600',
          )}
          title="Copy room invite link"
        >
          {copied ? <Check size={14} /> : <Share2 size={14} />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Invite'}</span>
        </button>

        {/* Settings Dialog */}
        <Tip label="Room Settings">
          <button
            onClick={() => useRoom.getState().setUi({ settingsDialog: true })}
            className="butter-btn grid h-9 w-9 place-items-center rounded-xl bg-white/[0.07] text-white ring-1 ring-white/10 backdrop-blur hover:bg-white/[0.13]"
          >
            <Settings size={15} />
          </button>
        </Tip>
      </div>
    </header>
  );
}
