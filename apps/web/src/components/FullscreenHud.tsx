import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  MessageCircle,
  Minimize2,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { MixerPopover } from './MixerPopover';
import { toggleRoomFullscreen } from '@/lib/fullscreen';
import { cn } from '@/lib/utils';
import { Tip } from './ui';

export function FullscreenHud() {
  const local = useRoom((s) => s.local);
  const audio = useRoom((s) => s.audio);
  const ui = useRoom((s) => s.ui);
  const unread = useRoom((s) => s.unread);
  const isLocalSpeaking = useRoom((s) => s.people.find((p) => p.isLocal)?.speaking ?? false);

  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide after 3.5s of no mouse movement
  useEffect(() => {
    const showAndScheduleHide = () => {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 3500);
    };

    window.addEventListener('mousemove', showAndScheduleHide);
    return () => {
      window.removeEventListener('mousemove', showAndScheduleHide);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const toggleChat = () => {
    if (ui.panelOpen && ui.tab === 'chat') {
      useRoom.getState().setUi({ panelOpen: false });
    } else {
      useRoom.getState().setUi({ panelOpen: true, tab: 'chat' });
    }
  };

  const exitView = () => {
    if (ui.fullscreen) {
      void toggleRoomFullscreen();
    }
    if (ui.theatre) {
      useRoom.getState().setUi({ theatre: false });
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          onMouseEnter={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
          }}
          onMouseLeave={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setVisible(false), 2500);
          }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl bg-ink-950/85 border border-white/15 px-3 py-1.5 shadow-float backdrop-blur-xl"
        >
          {/* Mic */}
          <Tip label={audio.pushToTalk ? 'Push to talk (Hold Space)' : local.micOn ? 'Mute Mic' : 'Unmute Mic'}>
            <button
              onClick={() => controller.toggleMic()}
              className={cn(
                'relative flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition',
                local.micOn
                  ? isLocalSpeaking
                    ? 'bg-coral-500/30 text-coral-300 ring-2 ring-coral-400 shadow-glow'
                    : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
              )}
            >
              {local.micOn ? (
                <Mic size={15} className={cn(isLocalSpeaking && 'animate-pulse text-coral-400')} />
              ) : (
                <MicOff size={15} className="text-red-400" />
              )}
              <span className="hidden sm:inline">
                {local.micOn ? (isLocalSpeaking ? 'Speaking' : 'Mute') : 'Unmute'}
              </span>
            </button>
          </Tip>

          {/* Camera */}
          <Tip label={local.camOn ? 'Turn Camera Off' : 'Turn Camera On'}>
            <button
              onClick={() => controller.toggleCamera()}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition',
                local.camOn
                  ? 'bg-peri-500/20 text-peri-300 ring-1 ring-peri-500/40 hover:bg-peri-500/30'
                  : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
              )}
            >
              {local.camOn ? <Video size={15} /> : <VideoOff size={15} />}
              <span className="hidden sm:inline">{local.camOn ? 'Cam On' : 'Cam Off'}</span>
            </button>
          </Tip>

          {/* Sound Mixer */}
          <MixerPopover />

          {/* Camera Layout Quick-Toggle */}
          <Tip
            label={
              ui.cameraLayout === 'side'
                ? 'Cameras: Side Column (Click for Bottom)'
                : ui.cameraLayout === 'bottom'
                  ? 'Cameras: Bottom Shelf (Click to Hide)'
                  : 'Cameras: Hidden (Click to Show)'
            }
          >
            <button
              onClick={() => {
                const next =
                  ui.cameraLayout === 'side'
                    ? 'bottom'
                    : ui.cameraLayout === 'bottom'
                      ? 'hidden'
                      : 'side';
                useRoom.getState().setUi({ cameraLayout: next });
              }}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition',
                ui.cameraLayout !== 'hidden'
                  ? 'bg-white/15 text-white ring-1 ring-white/20'
                  : 'bg-white/10 text-white/60 hover:bg-white/15 hover:text-white',
              )}
            >
              <Users size={15} />
              <span className="hidden md:inline">
                {ui.cameraLayout === 'side'
                  ? 'Side Cams'
                  : ui.cameraLayout === 'bottom'
                    ? 'Bottom Cams'
                    : 'Cams Off'}
              </span>
            </button>
          </Tip>

          {/* Raise Hand */}
          <Tip label={local.hand ? 'Lower Hand' : 'Raise Hand'}>
            <button
              onClick={() => controller.setHand(!local.hand)}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold transition',
                local.hand
                  ? 'bg-amber-400 text-ink-950 font-bold'
                  : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white',
              )}
            >
              <Hand size={15} className={local.hand ? 'fill-current' : ''} />
            </button>
          </Tip>

          {/* Chat Toggle */}
          <Tip label="Toggle Chat Drawer">
            <button
              onClick={toggleChat}
              className={cn(
                'relative flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition',
                ui.panelOpen && ui.tab === 'chat'
                  ? 'bg-white/25 text-white ring-1 ring-white/30'
                  : 'bg-white/10 text-white/80 hover:bg-white/15 hover:text-white',
              )}
            >
              <MessageCircle size={15} />
              <span className="hidden sm:inline">Chat</span>
              {unread > 0 && (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-coral-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
                  {unread}
                </span>
              )}
            </button>
          </Tip>

          <span className="h-4 w-px bg-white/20" />

          {/* Exit View (Fullscreen or Theatre) */}
          <button
            onClick={exitView}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-coral-500/20 px-3 text-xs font-semibold text-coral-300 ring-1 ring-coral-500/40 hover:bg-coral-500 hover:text-white transition"
            title="Exit (Esc)"
          >
            <Minimize2 size={15} />
            <span>Exit {ui.fullscreen ? 'Fullscreen' : 'Theatre'}</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
