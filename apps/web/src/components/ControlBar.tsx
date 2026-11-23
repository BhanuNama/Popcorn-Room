import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  PhoneOff,
  MessageCircle,
  Users,
  ListVideo,
  SmilePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { cn, isTypingTarget } from '@/lib/utils';
import { Tip } from './ui';

const CHEER_EMOJIS = ['🍿', '🔥', '😂', '👏', '😱', '✨'];

export function ControlBar() {
  const local = useRoom((s) => s.local);
  const audio = useRoom((s) => s.audio);
  const ui = useRoom((s) => s.ui);
  const unread = useRoom((s) => s.unread);
  const peopleCount = useRoom((s) => s.people.length);
  const queueCount = useRoom((s) => s.queue.length);
  const isLocalSpeaking = useRoom((s) => s.people.find((p) => p.isLocal)?.speaking ?? false);

  const [cheerOpen, setCheerOpen] = useState(false);
  const cheerRef = useRef<HTMLDivElement | null>(null);

  // Close reaction popover when clicking anywhere outside
  useEffect(() => {
    if (!cheerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (cheerRef.current && !cheerRef.current.contains(e.target as Node)) {
        setCheerOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [cheerOpen]);

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

  const togglePanel = (tab: 'chat' | 'people' | 'queue') => {
    if (ui.panelOpen && ui.tab === tab) {
      useRoom.getState().setUi({ panelOpen: false });
    } else {
      useRoom.getState().setUi({ panelOpen: true, tab });
    }
  };

  return (
    <nav
      aria-label="Room controls"
      className="relative z-30 flex items-center justify-between gap-2 sm:gap-3 rounded-2xl sm:rounded-3xl glass-strong border border-white/10 px-2.5 sm:px-3.5 py-1.5 sm:py-2 shadow-float max-w-2xl mx-auto"
    >
      {/* Left Cluster: Voice & Video */}
      <div className="flex items-center gap-1.5">
        {/* Mic Toggle */}
        <Tip label={audio.pushToTalk ? 'Push to talk (Hold Space)' : local.micOn ? 'Mute Mic' : 'Unmute Mic'}>
          <button
            onClick={() => controller.toggleMic()}
            className={cn(
              'butter-btn relative flex h-10 items-center gap-2 rounded-xl sm:rounded-2xl px-3 sm:px-3.5 text-xs font-semibold',
              local.micOn
                ? isLocalSpeaking
                  ? 'bg-emerald-500/25 text-emerald-200 ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                  : 'bg-emerald-500/18 text-emerald-300 ring-1 ring-emerald-500/35 hover:bg-emerald-500/28'
                : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white',
              local.pttHeld && 'ring-2 ring-emerald-400 bg-emerald-500/40 text-white',
            )}
          >
            {local.micOn ? (
              isLocalSpeaking ? (
                <span className="flex items-end gap-0.5 h-3.5 w-4 justify-center" aria-hidden>
                  <span className="w-0.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
                  <span className="w-0.5 h-3.5 rounded-full bg-emerald-300 animate-pulse [animation-delay:120ms]" />
                  <span className="w-0.5 h-2 rounded-full bg-emerald-300 animate-pulse [animation-delay:240ms]" />
                </span>
              ) : (
                <Mic size={16} />
              )
            ) : (
              <MicOff size={16} className="text-red-400" />
            )}
            <span className="hidden sm:inline">
              {audio.pushToTalk && local.micOn
                ? isLocalSpeaking || local.pttHeld
                  ? 'Speaking…'
                  : 'Hold Space'
                : local.micOn
                  ? isLocalSpeaking
                    ? 'Speaking…'
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
              'butter-btn flex h-10 items-center gap-2 rounded-xl sm:rounded-2xl px-3 sm:px-3.5 text-xs font-semibold',
              local.camOn
                ? 'bg-coral-500/25 text-coral-200 ring-1 ring-coral-400/45 hover:bg-coral-500/35'
                : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white',
            )}
          >
            {local.camOn ? <Video size={16} /> : <VideoOff size={16} />}
            <span className="hidden sm:inline">{local.camOn ? 'Camera' : 'Cam Off'}</span>
          </button>
        </Tip>
      </div>

      <span aria-hidden className="hidden sm:block h-5 w-px bg-white/10" />

      {/* Center Cluster: Live Cheers & Hand Raise */}
      <div className="relative flex items-center gap-1.5">
        <div ref={cheerRef} className="relative">
          <Tip label="Send live screen reaction">
            <button
              onClick={() => setCheerOpen((v) => !v)}
              className={cn(
                'butter-btn flex h-10 items-center gap-1.5 rounded-xl sm:rounded-2xl px-2.5 sm:px-3 text-xs font-semibold',
                cheerOpen
                  ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/45'
                  : 'bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white',
              )}
            >
              <SmilePlus size={16} className="text-amber-300" />
              <span className="hidden md:inline">React</span>
            </button>
          </Tip>

          <AnimatePresence>
            {cheerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.92 }}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-2xl glass-strong p-1.5 shadow-float ring-1 ring-white/15"
              >
                {CHEER_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => controller.react(em)}
                    className="grid h-9 w-9 place-items-center rounded-xl text-lg transition-transform hover:-translate-y-0.5 hover:scale-125 active:scale-90 hover:bg-white/10"
                    title={`Cheer ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Tip label={local.hand ? 'Lower Hand' : 'Raise Hand'}>
          <button
            onClick={() => controller.setHand(!local.hand)}
            className={cn(
              'butter-btn flex h-10 items-center gap-1.5 rounded-xl sm:rounded-2xl px-2.5 sm:px-3 text-xs font-semibold',
              local.hand
                ? 'bg-amber-400 text-ink-950 font-bold shadow-md'
                : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white',
            )}
          >
            <Hand size={16} className={local.hand ? 'fill-current' : ''} />
            <span className="hidden lg:inline">{local.hand ? 'Lower' : 'Hand'}</span>
          </button>
        </Tip>
      </div>

      <span aria-hidden className="hidden sm:block h-5 w-px bg-white/10" />

      {/* Right Cluster: Panels (Chat / People / Queue) & Leave */}
      <div className="flex items-center gap-1.5">
        <Tip label="Chat">
          <button
            onClick={() => togglePanel('chat')}
            className={cn(
              'butter-btn relative grid h-10 w-10 place-items-center rounded-xl sm:rounded-2xl',
              ui.panelOpen && ui.tab === 'chat'
                ? 'bg-coral-500/25 text-coral-200 ring-1 ring-coral-400/45'
                : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white',
            )}
          >
            <MessageCircle size={17} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-coral-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
                {unread}
              </span>
            )}
          </button>
        </Tip>

        <Tip label="People">
          <button
            onClick={() => togglePanel('people')}
            className={cn(
              'butter-btn relative grid h-10 w-10 place-items-center rounded-xl sm:rounded-2xl',
              ui.panelOpen && ui.tab === 'people'
                ? 'bg-coral-500/25 text-coral-200 ring-1 ring-coral-400/45'
                : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white',
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

        <Tip label="Queue">
          <button
            onClick={() => togglePanel('queue')}
            className={cn(
              'butter-btn relative hidden sm:grid h-10 w-10 place-items-center rounded-xl sm:rounded-2xl',
              ui.panelOpen && ui.tab === 'queue'
                ? 'bg-coral-500/25 text-coral-200 ring-1 ring-coral-400/45'
                : 'bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white',
            )}
          >
            <ListVideo size={17} />
            {queueCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-ink-950">
                {queueCount}
              </span>
            )}
          </button>
        </Tip>

        <Tip label="Leave Room">
          <button
            onClick={() => controller.disconnect()}
            className="butter-btn flex h-10 items-center gap-1.5 rounded-xl sm:rounded-2xl bg-red-500/20 px-3 sm:px-3.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/30 hover:bg-red-500 hover:text-white"
          >
            <PhoneOff size={15} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </Tip>
      </div>
    </nav>
  );
}
