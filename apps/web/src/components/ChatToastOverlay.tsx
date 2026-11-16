import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import { useRoom, type ChatToastItem } from '@/store/room';
import { Avatar } from './ui';
import { timeOfDay } from '@/lib/utils';

function playNotificationChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => {
      void ctx.close();
    }, 200);
  } catch {
    // AudioContext restricted or muted
  }
}

export function ChatToastOverlay() {
  const chatToasts = useRoom((s) => s.chatToasts);

  if (chatToasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-16 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full select-none"
    >
      <AnimatePresence mode="popLayout">
        {chatToasts.map((toast) => (
          <ChatToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ChatToastCard({ toast }: { toast: ChatToastItem }) {
  // Play subtle chime on arrival
  useEffect(() => {
    playNotificationChime();
  }, []);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      useRoom.getState().dismissChatToast(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const handleClick = () => {
    useRoom.getState().setUi({ panelOpen: true, tab: 'chat' });
    useRoom.getState().dismissChatToast(toast.id);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    useRoom.getState().dismissChatToast(toast.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 28, scale: 0.92 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className="pointer-events-auto cursor-pointer relative flex items-start gap-3 rounded-2xl bg-ink-950/92 border border-white/15 p-3 shadow-float backdrop-blur-xl ring-1 ring-white/10 hover:border-coral-500/50 hover:bg-ink-900 transition-all group"
    >
      {/* Sender Avatar */}
      <div className="shrink-0 mt-0.5">
        <Avatar name={toast.fromName} hue={toast.hue} size={36} />
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center justify-between gap-1">
          <span className="font-bold text-xs text-white truncate max-w-[170px]">
            {toast.fromName}
          </span>
          <span className="text-[10px] text-white/50 shrink-0">
            {timeOfDay(toast.at)}
          </span>
        </div>

        {toast.text && (
          <p className="mt-0.5 line-clamp-2 text-xs text-white/90 break-words leading-relaxed">
            {toast.text}
          </p>
        )}

        {toast.gif && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-coral-300">
            <span className="rounded bg-coral-500/20 px-1.5 py-0.5 text-[10px] font-bold">
              GIF
            </span>
            <span>Sent a GIF</span>
          </div>
        )}

        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-coral-400 group-hover:text-coral-300 transition-colors">
          <MessageCircle size={10} />
          <span>Click to open chat</span>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2.5 right-2.5 grid h-6 w-6 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition"
        title="Dismiss notification"
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}
