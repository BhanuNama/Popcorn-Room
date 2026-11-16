import { motion, AnimatePresence } from 'motion/react';
import { useRoom } from '@/store/room';

export function ReactionsOverlay() {
  const floating = useRoom((s) => s.floating);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <AnimatePresence>
        {floating.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 40, scale: 0.6 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: -240,
              scale: [0.6, 1.25, 1, 0.9],
              x: [0, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.8, ease: 'easeOut' }}
            style={{ left: `${f.x}%`, bottom: '20px' }}
            className="absolute flex flex-col items-center"
          >
            <span className="text-4xl drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] sm:text-5xl select-none">
              {f.emoji}
            </span>
            <span className="mt-1 rounded-full bg-ink-950/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm shadow-sm select-none">
              {f.name}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
