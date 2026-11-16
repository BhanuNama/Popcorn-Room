import {
  Share2,
  Settings,
  Maximize2,
  Minimize2,
  Tv,
  BarChart3,
  Wifi,
  MonitorUp,
  MonitorOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from './Logo';
import { YoutubeIcon } from './YoutubeIcon';
import { MixerPopover } from './MixerPopover';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { Tip } from './ui';
import { cn } from '@/lib/utils';
import { toggleRoomFullscreen } from '@/lib/fullscreen';

export function TopBar() {
  const roomInfo = useRoom((s) => s.roomInfo);
  const me = useRoom((s) => s.me);
  const people = useRoom((s) => s.people);
  const mode = useRoom((s) => s.mode);
  const local = useRoom((s) => s.local);
  const theatre = useRoom((s) => s.ui.theatre);
  const fullscreen = useRoom((s) => s.ui.fullscreen);

  const myPerson = people.find((p) => p.isLocal);
  const quality = myPerson?.quality ?? 'good';

  const toggleTheatre = () => {
    useRoom.getState().setUi({ theatre: !theatre, panelOpen: theatre });
  };

  const copyInvite = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Room link copied to clipboard!'),
      () => toast.error('Could not copy link'),
    );
  };

  return (
    <header className="relative z-30 flex h-14 items-center justify-between px-3 sm:px-6">
      {/* Left: Brand & Room title */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <Logo dark className="scale-90" />
        <span className="h-4 w-px bg-white/10 hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="font-display text-xs sm:text-sm font-bold text-white truncate max-w-[110px] sm:max-w-xs">
            {roomInfo?.name || 'Popcorn Room'}
          </span>
          {me?.role === 'host' && (
            <span className="rounded bg-coral-500/20 px-1.5 py-0.5 text-[10px] font-bold text-coral-300 ring-1 ring-coral-500/30">
              Host
            </span>
          )}
        </div>
      </div>

      {/* Center: Stage & Content Tools (Screen Share, YouTube, Sound Mixer) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Screen Share */}
        <Tip label={local.sharing ? 'Stop Sharing Screen' : 'Share Screen with Discrete Stereo Audio'}>
          <button
            onClick={() => controller.toggleShare()}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs font-semibold transition shadow-sm',
              local.sharing
                ? 'bg-coral-500 text-white shadow-glow hover:bg-coral-600'
                : 'bg-white/10 text-white/90 hover:bg-white/15 hover:text-white',
            )}
          >
            {local.sharing ? <MonitorOff size={15} /> : <MonitorUp size={15} />}
            <span className="hidden md:inline">
              {local.sharing ? 'Stop Share' : 'Share Screen'}
            </span>
          </button>
        </Tip>

        {/* YouTube Mode */}
        <Tip label="Synced YouTube Mode">
          <button
            onClick={() => useRoom.getState().setUi({ youtubeDialog: true })}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs font-semibold transition',
              mode === 'youtube'
                ? 'bg-red-500/25 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/35'
                : 'bg-white/10 text-white/90 hover:bg-white/15 hover:text-white',
            )}
          >
            <YoutubeIcon size={16} className="text-red-400" />
            <span className="hidden md:inline">YouTube</span>
          </button>
        </Tip>

        {/* Sound Mixer */}
        <MixerPopover />
      </div>

      {/* Right: Actions, Fullscreen, Theatre & Indicators */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Connection Quality indicator */}
        <div
          className="hidden lg:flex items-center gap-1.5 rounded-xl bg-white/5 px-2.5 py-1 text-xs text-white/70 ring-1 ring-white/10"
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

        {/* Fullscreen Toggle */}
        <Tip label={fullscreen ? 'Exit Fullscreen (Esc / F)' : 'Fullscreen (F)'}>
          <button
            onClick={() => toggleRoomFullscreen()}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/15',
              fullscreen && 'bg-coral-500/25 text-coral-300 ring-1 ring-coral-500/40',
            )}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </Tip>

        {/* Theatre Mode Toggle */}
        <Tip label={theatre ? 'Exit Theatre Mode (Esc / T)' : 'Theatre Mode (T)'}>
          <button
            onClick={toggleTheatre}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/15',
              theatre && 'bg-coral-500/25 text-coral-300 ring-1 ring-coral-500/40',
            )}
          >
            <Tv size={16} className={theatre ? 'text-coral-400' : ''} />
          </button>
        </Tip>

        {/* Reaction Recap Heatmap Button */}
        <Tip label="Session Recap & Reaction Heatmap">
          <button
            onClick={() => useRoom.getState().setUi({ recapDialog: true })}
            className="hidden sm:flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 sm:px-3 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/15"
          >
            <BarChart3 size={15} className="text-coral-400" />
            <span className="hidden md:inline">Recap</span>
          </button>
        </Tip>

        {/* Invite Button */}
        <button
          onClick={copyInvite}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-coral-500 px-3 sm:px-3.5 text-xs font-semibold text-white shadow-md transition hover:bg-coral-600"
        >
          <Share2 size={14} />
          <span className="hidden sm:inline">Invite</span>
        </button>

        {/* Settings Dialog (Host & Room prefs) */}
        <Tip label="Room Settings">
          <button
            onClick={() => useRoom.getState().setUi({ settingsDialog: true })}
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/15"
          >
            <Settings size={16} />
          </button>
        </Tip>
      </div>
    </header>
  );
}
