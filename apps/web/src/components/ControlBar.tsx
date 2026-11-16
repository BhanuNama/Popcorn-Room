import { useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  PhoneOff,
  MessageCircle,
  Users,
} from 'lucide-react';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { cn, isTypingTarget } from '@/lib/utils';
import { Tip } from './ui';

export function ControlBar() {
  const local = useRoom((s) => s.local);
  const audio = useRoom((s) => s.audio);
  const ui = useRoom((s) => s.ui);
  const unread = useRoom((s) => s.unread);
  const peopleCount = useRoom((s) => s.people.length);
  const isLocalSpeaking = useRoom((s) => s.people.find((p) => p.isLocal)?.speaking ?? false);

  // Push to talk keyboard listener (Space bar)
  useEffect(() => {
    if (!audio.pushToTalk) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(e.target)) {
        e.preventDefault();
        void controller.setPttHeld(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        void controller.setPttHeld(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [audio.pushToTalk]);

  const togglePanel = (tab: 'chat' | 'people') => {
    if (ui.panelOpen && ui.tab === tab) {
      useRoom.getState().setUi({ panelOpen: false });
    } else {
      useRoom.getState().setUi({ panelOpen: true, tab });
    }
  };

  return (
    <nav
      aria-label="Room controls"
      className="relative z-30 flex items-center justify-between gap-3 sm:gap-6 rounded-2xl sm:rounded-3xl glass-strong border border-white/10 px-3.5 py-1.5 sm:py-2 shadow-float max-w-2xl mx-auto"
    >
      {/* Left: Mic & Camera */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mic Toggle */}
        <Tip label={audio.pushToTalk ? 'Push to talk (Hold Space)' : local.micOn ? 'Mute Mic' : 'Unmute Mic'}>
          <button
            onClick={() => controller.toggleMic()}
            className={cn(
              'relative flex h-10 items-center gap-2 rounded-xl sm:rounded-2xl px-3 sm:px-3.5 text-xs font-semibold transition',
              local.micOn
                ? isLocalSpeaking
                  ? 'bg-coral-500/25 text-coral-300 ring-2 ring-coral-400 shadow-glow'
                  : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
              local.pttHeld && 'ring-2 ring-emerald-400 bg-emerald-500/40 text-white',
            )}
          >
            {local.micOn ? (
              <Mic size={16} className={cn(isLocalSpeaking && 'animate-pulse text-coral-400')} />
            ) : (
              <MicOff size={16} className="text-red-400" />
            )}
            <span className="hidden sm:inline">
              {audio.pushToTalk && local.micOn
                ? isLocalSpeaking || local.pttHeld
                  ? 'Speaking...'
                  : 'Hold Space'
                : local.micOn
                  ? isLocalSpeaking
                    ? 'Speaking...'
                    : 'Mute'
                  : 'Unmute'}
            </span>
          </button>
        </Tip>

        {/* Camera Toggle */}
        <Tip label={local.camOn ? 'Turn Camera Off' : 'Turn Camera On'}>
          <button
            onClick={() => controller.toggleCamera()}
            className={cn(
              'flex h-10 items-center gap-2 rounded-xl sm:rounded-2xl px-3 sm:px-3.5 text-xs font-semibold transition',
              local.camOn
                ? 'bg-peri-500/20 text-peri-300 ring-1 ring-peri-500/40 hover:bg-peri-500/30'
                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
            )}
          >
            {local.camOn ? <Video size={16} /> : <VideoOff size={16} />}
            <span className="hidden sm:inline">{local.camOn ? 'Camera' : 'Off'}</span>
          </button>
        </Tip>
      </div>

      {/* Center: Hand Raise */}
      <div className="flex items-center gap-2">
        <Tip label={local.hand ? 'Lower Hand' : 'Raise Hand'}>
          <button
            onClick={() => controller.setHand(!local.hand)}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-xl sm:rounded-2xl px-3 text-xs font-semibold transition',
              local.hand
                ? 'bg-amber-400 text-ink-950 font-bold shadow-md'
                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
            )}
          >
            <Hand size={16} className={local.hand ? 'fill-current' : ''} />
            <span className="hidden md:inline">{local.hand ? 'Lower' : 'Raise Hand'}</span>
          </button>
        </Tip>
      </div>

      {/* Right: Panels & Leave */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Toggle Chat */}
        <Tip label="Chat">
          <button
            onClick={() => togglePanel('chat')}
            className={cn(
              'relative grid h-10 w-10 place-items-center rounded-xl sm:rounded-2xl transition',
              ui.panelOpen && ui.tab === 'chat'
                ? 'bg-white/25 text-white ring-1 ring-white/30'
                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
            )}
          >
            <MessageCircle size={17} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-coral-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
                {unread}
              </span>
            )}
          </button>
        </Tip>

        {/* Toggle People */}
        <Tip label="People">
          <button
            onClick={() => togglePanel('people')}
            className={cn(
              'relative grid h-10 w-10 place-items-center rounded-xl sm:rounded-2xl transition',
              ui.panelOpen && ui.tab === 'people'
                ? 'bg-white/25 text-white ring-1 ring-white/30'
                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
            )}
          >
            <Users size={17} />
            {peopleCount > 1 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-ink-800 text-[9px] font-bold text-white ring-1 ring-white/20">
                {peopleCount}
              </span>
            )}
          </button>
        </Tip>

        {/* Leave Room Button */}
        <Tip label="Leave Room">
          <button
            onClick={() => controller.disconnect()}
            className="flex h-10 items-center gap-1.5 rounded-xl sm:rounded-2xl bg-red-500/20 px-3 sm:px-3.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/30 hover:bg-red-500 hover:text-white transition"
          >
            <PhoneOff size={15} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </Tip>
      </div>
    </nav>
  );
}
