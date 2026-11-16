import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Track } from 'livekit-client';
import {
  Mic,
  MicOff,
  Hand,
  Pin,
  PinOff,
  Users,
  EyeOff,
  Columns,
  Rows,
} from 'lucide-react';
import { controller } from '@/room/controller';
import { useRoom, type PersonVM } from '@/store/room';
import { Avatar } from './ui';
import { cn } from '@/lib/utils';

export function CameraStrip({
  layout,
  className,
}: {
  layout?: 'side' | 'bottom' | 'hidden';
  className?: string;
}) {
  const people = useRoom((s) => s.people);
  const currentLayout = useRoom((s) => s.ui.cameraLayout);
  const pinned = useRoom((s) => s.ui.pinned);

  const activeLayout = layout || currentLayout;

  if (people.length === 0 || activeLayout === 'hidden') return null;

  return (
    <aside
      aria-label="Member cameras"
      className={cn(
        'z-20 select-none flex transition-all',
        activeLayout === 'side'
          ? 'w-36 sm:w-44 flex-col h-full rounded-xl sm:rounded-2xl bg-ink-950/70 border border-white/10 p-2 backdrop-blur-md shrink-0'
          : 'w-full flex-col rounded-xl sm:rounded-2xl bg-ink-950/70 border border-white/10 p-2 backdrop-blur-md shrink-0',
        className,
      )}
    >
      {/* Quick-Switch Header Toolbar */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-white/70 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-white truncate">
          <Users size={12} className="text-coral-400 shrink-0" />
          <span className="truncate">Members ({people.length})</span>
        </div>

        {/* 1-Click Layout Quick-Switch Buttons */}
        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => useRoom.getState().setUi({ cameraLayout: 'side' })}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition',
              activeLayout === 'side'
                ? 'bg-coral-500 text-white shadow-sm'
                : 'text-white/60 hover:text-white',
            )}
            title="Side Column (Zero video overlap)"
          >
            <Columns size={10} />
            <span className="hidden sm:inline">Side</span>
          </button>
          <button
            onClick={() => useRoom.getState().setUi({ cameraLayout: 'bottom' })}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition',
              activeLayout === 'bottom'
                ? 'bg-coral-500 text-white shadow-sm'
                : 'text-white/60 hover:text-white',
            )}
            title="Bottom Shelf (Below video)"
          >
            <Rows size={10} />
            <span className="hidden sm:inline">Bottom</span>
          </button>
          <button
            onClick={() => useRoom.getState().setUi({ cameraLayout: 'hidden' })}
            className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition"
            title="Hide cameras (Focus Mode)"
          >
            <EyeOff size={11} />
          </button>
        </div>
      </div>

      {/* Member Tiles List */}
      <div
        className={cn(
          'gap-2',
          activeLayout === 'side'
            ? 'flex flex-col flex-1 overflow-y-auto scroll-thin pr-0.5'
            : 'flex flex-row overflow-x-auto scroll-thin py-0.5',
        )}
      >
        {people.map((p) => (
          <CameraTile
            key={p.identity}
            person={p}
            isPinned={pinned === p.identity}
            layout={activeLayout}
          />
        ))}
      </div>
    </aside>
  );
}

function CameraTile({
  person,
  isPinned,
  layout,
}: {
  person: PersonVM;
  isPinned: boolean;
  layout: 'side' | 'bottom';
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach participant camera track if on
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !person.camOn) return;

    const p = controller.participant(person.identity);
    if (!p) return;

    const pub = p.getTrackPublication(Track.Source.Camera);
    if (pub && pub.track) {
      pub.track.attach(videoEl);
    }

    return () => {
      if (pub && pub.track && videoEl) {
        pub.track.detach(videoEl);
      }
    };
  }, [person.camOn, person.identity]);

  const togglePin = () => {
    const current = useRoom.getState().ui.pinned;
    useRoom.getState().setUi({ pinned: current === person.identity ? null : person.identity });
  };

  return (
    <motion.div
      layout
      className={cn(
        'group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-900 ring-1 transition-all',
        person.speaking ? 'ring-2 ring-coral-400 shadow-glow' : 'ring-white/10',
        layout === 'side' ? 'w-full h-24 sm:h-28' : 'w-32 sm:w-36 h-20 sm:h-24',
      )}
    >
      {/* Video element when camera is ON */}
      {person.camOn ? (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="h-full w-full object-cover"
        />
      ) : (
        /* Avatar fallback when camera is OFF */
        <div className="flex flex-col items-center justify-center p-2">
          <Avatar
            name={person.name}
            hue={person.hue}
            size={layout === 'side' ? 36 : 32}
            speaking={person.speaking}
          />
        </div>
      )}

      {/* Speaking border pulse animation */}
      {person.speaking && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-coral-400 animate-pulse-soft" />
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-coral-400/10 animate-pulse" />
        </>
      )}

      {/* Hand Raised Icon */}
      {person.hand && (
        <div className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-ink-950 shadow-md">
          <Hand size={11} className="fill-current" />
        </div>
      )}

      {/* Pin button */}
      <button
        onClick={togglePin}
        className={cn(
          'absolute top-1.5 right-1.5 z-10 grid h-6 w-6 place-items-center rounded-lg bg-black/60 text-white backdrop-blur transition-opacity',
          isPinned ? 'opacity-100 text-coral-400' : 'opacity-0 group-hover:opacity-100',
        )}
        title={isPinned ? 'Unpin' : 'Pin to focus'}
      >
        {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
      </button>

      {/* Bottom Name & Mic status bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 py-1 text-[10px] font-medium text-white">
        <span className="truncate max-w-[70%]">
          {person.isLocal ? `${person.name} (You)` : person.name}
        </span>
        <span className="shrink-0 text-white/80 flex items-center gap-1">
          {person.speaking && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-coral-400" />
            </span>
          )}
          {person.micOn ? (
            <Mic size={11} className={cn(person.speaking ? 'text-coral-400' : 'text-emerald-400')} />
          ) : (
            <MicOff size={11} className="text-red-400" />
          )}
        </span>
      </div>
    </motion.div>
  );
}
