import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ParticipantEvent, Track } from 'livekit-client';
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
  Crown,
  FlipHorizontal2,
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

  // Keep pinned participant anchored first for effortless spotlighting
  const orderedPeople = useMemo(() => {
    if (!pinned) return people;
    return [...people].sort((a, b) => (a.identity === pinned ? -1 : b.identity === pinned ? 1 : 0));
  }, [people, pinned]);

  if (people.length === 0 || activeLayout === 'hidden') return null;

  return (
    <aside
      aria-label="People in room"
      className={cn(
        'z-20 select-none flex transition-all',
        activeLayout === 'side'
          ? 'w-full md:w-52 flex-col md:h-full rounded-xl sm:rounded-2xl bg-white/[0.04] border border-white/10 p-2 backdrop-blur-xl shrink-0'
          : 'w-full flex-col rounded-xl sm:rounded-2xl bg-white/[0.04] border border-white/10 p-2 backdrop-blur-xl shrink-0',
        className,
      )}
    >
      {/* Header Toolbar — balanced so "People" & count badge never clip */}
      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-white/[0.08] text-white/75 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users size={13} className="text-coral-400 shrink-0" />
          <span className="text-[11px] font-bold tracking-tight text-white truncate">People</span>
          <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] font-semibold text-white/80">
            {people.length}
          </span>
        </div>

        {/* 1-Click Layout Quick-Switch Pill */}
        <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.06] p-0.5 ring-1 ring-white/[0.06] shrink-0">
          <button
            onClick={() => useRoom.getState().setUi({ cameraLayout: 'side' })}
            className={cn(
              'hidden md:flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-semibold transition',
              activeLayout === 'side'
                ? 'bg-coral-500 text-white shadow-sm'
                : 'text-white/55 hover:text-white hover:bg-white/5',
            )}
            title="Side Column (Zero video overlap)"
            aria-label="Side Column layout"
          >
            <Columns size={11} />
            {activeLayout === 'bottom' && <span>Side</span>}
          </button>
          <button
            onClick={() => useRoom.getState().setUi({ cameraLayout: 'bottom' })}
            className={cn(
              'hidden md:flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-semibold transition',
              activeLayout === 'bottom'
                ? 'bg-coral-500 text-white shadow-sm'
                : 'text-white/55 hover:text-white hover:bg-white/5',
            )}
            title="Bottom Shelf (Below video)"
            aria-label="Bottom Shelf layout"
          >
            <Rows size={11} />
            {activeLayout === 'bottom' && <span>Bottom</span>}
          </button>
          <button
            onClick={() => useRoom.getState().setUi({ cameraLayout: 'hidden' })}
            className="flex items-center gap-1 p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition"
            title="Hide People strip (Cinema Focus)"
            aria-label="Hide People strip"
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
            ? 'flex flex-row md:flex-col md:flex-1 overflow-x-auto md:overflow-y-auto scroll-thin pr-0.5 py-0.5 md:py-0'
            : 'flex flex-row overflow-x-auto scroll-thin py-0.5',
        )}
      >
        {orderedPeople.map((p) => (
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
  // Windows/mobile front cameras need horizontal inversion (-scale-x-100) so local & remote views match identically
  const [flipped, setFlipped] = useState(true);

  // Attach participant camera track immediately and handle first-time subscribe / unmute events cleanly
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !person.camOn) return;

    const p = controller.participant(person.identity);
    if (!p) return;

    let attachedTrack: Track | null = null;

    const tryAttach = () => {
      const pub = p.getTrackPublication(Track.Source.Camera);
      if (pub?.track && !pub.isMuted && pub.track !== attachedTrack) {
        if (attachedTrack) attachedTrack.detach(videoEl);
        attachedTrack = pub.track;
        pub.track.attach(videoEl);
        void videoEl.play().catch(() => {});
      }
    };

    tryAttach();

    const onSubOrUnmute = () => tryAttach();
    p.on(ParticipantEvent.TrackSubscribed, onSubOrUnmute);
    p.on(ParticipantEvent.TrackUnmuted, onSubOrUnmute);
    p.on(ParticipantEvent.LocalTrackPublished, onSubOrUnmute);

    return () => {
      p.off(ParticipantEvent.TrackSubscribed, onSubOrUnmute);
      p.off(ParticipantEvent.TrackUnmuted, onSubOrUnmute);
      p.off(ParticipantEvent.LocalTrackPublished, onSubOrUnmute);
      if (attachedTrack && videoEl) {
        attachedTrack.detach(videoEl);
      }
    };
  }, [person.camOn, person.camTrackId, person.identity]);

  const togglePin = () => {
    const current = useRoom.getState().ui.pinned;
    useRoom.getState().setUi({ pinned: current === person.identity ? null : person.identity });
  };

  return (
    <motion.div
      layout
      className={cn(
        'group relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-950/90 ring-1 transition-all',
        person.speaking
          ? 'ring-2 ring-emerald-400 shadow-[0_0_22px_rgba(16,185,129,0.28)]'
          : isPinned
            ? 'ring-2 ring-coral-400/70'
            : 'ring-white/10 hover:ring-white/25',
        layout === 'side' ? 'w-28 md:w-full h-20 md:h-28' : 'w-28 sm:w-40 h-20 sm:h-26',
      )}
    >
      {/* Subtle hue-tinted backdrop when camera is off */}
      {!person.camOn && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 42%, hsla(${person.hue}, 70%, 55%, 0.16), transparent 72%)`,
          }}
        />
      )}

      {/* Video element when camera is ON (matches exact orientation seen by everyone; optional Flip toggle on hover) */}
      {person.camOn ? (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={cn('h-full w-full object-cover', flipped && '-scale-x-100')}
        />
      ) : (
        /* Avatar fallback when camera is OFF */
        <div className="relative z-10 flex flex-col items-center justify-center pb-3">
          <Avatar
            name={person.name}
            hue={person.hue}
            size={layout === 'side' ? 40 : 34}
            speaking={person.speaking}
          />
        </div>
      )}

      {/* Speaking border pulse animation */}
      {person.speaking && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-emerald-400/5 animate-pulse" />
      )}

      {/* Top-Left Badges (Hand Raised or Host Crown) */}
      <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
        {person.hand && (
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-ink-950 shadow-md"
            title="Hand Raised"
          >
            <Hand size={11} className="fill-current" />
          </div>
        )}
        {person.role === 'host' && (
          <div
            className="flex h-5 items-center gap-0.5 rounded-full bg-black/55 px-1.5 text-[9px] font-bold text-amber-300 ring-1 ring-amber-400/30 backdrop-blur-sm"
            title="Room Host"
          >
            <Crown size={9} />
            <span className="hidden sm:inline">Host</span>
          </div>
        )}
      </div>

      {/* Flip + Pin controls */}
      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
        {person.camOn && (
          <button
            onClick={() => setFlipped((v) => !v)}
            className={cn(
              'grid h-6 w-6 place-items-center rounded-lg bg-black/60 text-white backdrop-blur transition-opacity',
              !flipped ? 'opacity-100 text-coral-300 ring-1 ring-coral-400/40' : 'opacity-0 group-hover:opacity-100',
            )}
            title={flipped ? 'Unflip camera view' : 'Flip camera horizontally'}
          >
            <FlipHorizontal2 size={11} />
          </button>
        )}
        <button
          onClick={togglePin}
          className={cn(
            'grid h-6 w-6 place-items-center rounded-lg bg-black/60 text-white backdrop-blur transition-opacity',
            isPinned ? 'opacity-100 text-coral-300 ring-1 ring-coral-400/40' : 'opacity-0 group-hover:opacity-100',
          )}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
        </button>
      </div>

      {/* Bottom Name & Mic status bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2.5 py-1.5 text-[11px] font-medium text-white">
        <span className="min-w-0 flex-1 truncate">
          {person.isLocal ? `${person.name} · You` : person.name}
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {person.speaking ? (
            <span className="flex items-end gap-0.5 h-3" aria-label="Speaking">
              <span className="w-0.5 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="w-0.5 h-3 rounded-full bg-emerald-400 animate-pulse [animation-delay:120ms]" />
              <span className="w-0.5 h-1.5 rounded-full bg-emerald-400 animate-pulse [animation-delay:240ms]" />
            </span>
          ) : person.micOn ? (
            <Mic size={11} className="text-emerald-400" />
          ) : (
            <MicOff size={11} className="text-red-400/90" />
          )}
        </span>
      </div>
    </motion.div>
  );
}
