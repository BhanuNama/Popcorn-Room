import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Track } from 'livekit-client';
import {
  MonitorUp,
  AlertTriangle,
  VolumeX,
  Volume2,
  Maximize,
  Minimize,
  Sparkles,
  WifiOff,
  Film,
  Upload,
} from 'lucide-react';
import { YoutubeIcon } from './YoutubeIcon';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { AmbientGlow } from './AmbientGlow';
import { Button } from './ui';
import { toggleRoomFullscreen } from '@/lib/fullscreen';

export function ScreenStage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const localSharing = useRoom((s) => s.local.sharing);
  const warnings = useRoom((s) => s.warnings);
  const [sharerName, setSharerName] = useState<string>('');
  const [hasVideo, setHasVideo] = useState(false);

  // Find who has an active screen share track
  useEffect(() => {
    const room = controller.room;
    if (!room) return;

    let attachedTrack: Track | null = null;
    const videoEl = videoRef.current;

    const attachSharer = () => {
      // 1. Check local participant
      if (room.localParticipant.isScreenShareEnabled) {
        const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (pub && pub.track && videoEl) {
          pub.track.attach(videoEl);
          attachedTrack = pub.track;
          setSharerName('You (Presenting)');
          setHasVideo(true);
          return;
        }
      }

      // 2. Check remote participants
      for (const p of room.remoteParticipants.values()) {
        if (p.isScreenShareEnabled) {
          const pub = p.getTrackPublication(Track.Source.ScreenShare);
          if (pub && pub.track && videoEl) {
            pub.track.attach(videoEl);
            attachedTrack = pub.track;
            setSharerName(p.name || p.identity);
            setHasVideo(true);
            return;
          }
        }
      }

      setSharerName('');
      setHasVideo(false);
    };

    attachSharer();

    // LiveKit events for track changes
    const onTrackSubscribed = (track: Track) => {
      if (track.source === Track.Source.ScreenShare && videoEl) {
        track.attach(videoEl);
        attachedTrack = track;
        setHasVideo(true);
      }
    };
    const onTrackUnsubscribed = (track: Track) => {
      if (track === attachedTrack) {
        attachSharer();
      }
    };

    room.on('trackSubscribed', onTrackSubscribed);
    room.on('trackUnsubscribed', onTrackUnsubscribed);
    room.on('localTrackPublished', attachSharer);
    room.on('localTrackUnpublished', attachSharer);

    return () => {
      room.off('trackSubscribed', onTrackSubscribed);
      room.off('trackUnsubscribed', onTrackUnsubscribed);
      room.off('localTrackPublished', attachSharer);
      room.off('localTrackUnpublished', attachSharer);
      if (attachedTrack && videoEl) {
        attachedTrack.detach(videoEl);
      }
    };
  }, [localSharing]);

  const fullscreen = useRoom((s) => s.ui.fullscreen);
  const toggleFullscreen = () => {
    void toggleRoomFullscreen();
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const video = files.find(
      (f) => f.type.startsWith('video/') || /\.(mp4|m4v|mkv|webm|mov|avi|ts|flv|wmv)$/i.test(f.name),
    );
    if (video) {
      const url = URL.createObjectURL(video);
      useRoom.getState().setLocalMovie({
        file: video,
        url,
        fileName: video.name,
        fileSize: video.size,
      });
      controller.loadLocalMovie(video.name, video.size);
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
    >
      {/* Ambient Glow behind video */}
      <AmbientGlow videoEl={videoRef.current} active={hasVideo} />

      {/* Actual video element */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted // Muted locally so presenter hears their original or remote audio through WebAudio gain node
        className={`h-full w-full object-contain ${!hasVideo ? 'hidden' : 'block'}`}
      />

      {/* Screen Sharer Pill */}
      {hasVideo && sharerName && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full bg-ink-950/80 px-3.5 py-1.5 text-xs font-semibold text-white shadow-float ring-1 ring-white/10 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-coral-500 animate-pulse" />
          <span>{sharerName}</span>
        </div>
      )}

      {/* Fullscreen Button */}
      {hasVideo && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-20 grid h-9 w-9 place-items-center rounded-xl bg-ink-950/70 text-white opacity-0 shadow-float ring-1 ring-white/10 backdrop-blur-md transition-opacity group-hover:opacity-100 hover:bg-ink-900"
          title={fullscreen ? 'Exit Fullscreen (Esc / F)' : 'Fullscreen (F)'}
        >
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      )}

      {/* Warning Banners */}
      <div className="absolute top-16 left-4 right-4 z-20 flex flex-col items-center gap-2 pointer-events-none">
        {/* DRM Black frame warning */}
        <AnimatePresence>
          {warnings.blackFrame && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl bg-amber-500/95 p-3.5 text-xs font-medium text-ink-950 shadow-float"
            >
              <AlertTriangle size={20} className="shrink-0" />
              <div className="flex-1">
                <span className="font-bold">Black picture detected!</span> DRM services (Netflix,
                Disney+, Prime) block browser capture. Try turning off hardware acceleration in
                browser settings or sharing another tab.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No audio warning */}
        <AnimatePresence>
          {warnings.noShareAudio && localSharing && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl bg-blue-600/95 p-3.5 text-xs font-medium text-white shadow-float"
            >
              <VolumeX size={20} className="shrink-0 text-amber-300" />
              <div className="flex-1">
                <span className="font-bold">No tab audio shared.</span> When starting screen share,
                ensure you check <b>"Also share tab audio"</b> in the Chrome/Edge picker so friends
                hear the movie in high-res stereo.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Slow upload warning */}
        <AnimatePresence>
          {warnings.slowUpload !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-red-600/90 px-4 py-2 text-xs font-medium text-white shadow-float"
            >
              <WifiOff size={16} />
              <span>
                Upload speed is low ({warnings.slowUpload} Mbps). 1080p stream may experience
                buffering.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Empty State / Stage Placeholder when nothing is being shared */}
      {!hasVideo && (
        <div className="flex flex-col items-center justify-center p-8 text-center text-white/80">
          <div className="relative mb-6">
            <div className="absolute -inset-4 rounded-full bg-coral-500/20 blur-xl" />
            <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/15 backdrop-blur-xl">
              <MonitorUp size={36} className="text-coral-400" />
            </div>
          </div>
          <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Stage is ready
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/60">
            Share a browser tab, an application or your whole screen with stereo audio, or paste a
            YouTube link to watch together.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => controller.startShare()}
              className="gap-2"
            >
              <MonitorUp size={16} /> Share Screen
            </Button>
            <Button
              variant="glass"
              size="md"
              onClick={() => useRoom.getState().setUi({ youtubeDialog: true })}
              className="gap-2"
            >
              <YoutubeIcon size={16} className="text-red-400" /> YouTube Mode
            </Button>
            <Button
              variant="glass"
              size="md"
              onClick={() => controller.setMode('local')}
              className="gap-2"
            >
              <Film size={16} className="text-coral-400" /> Play Local Movie (4K Drop)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
