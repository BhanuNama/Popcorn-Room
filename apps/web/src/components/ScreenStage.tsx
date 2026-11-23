import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Track } from 'livekit-client';
import {
  MonitorUp,
  MonitorOff,
  Eye,
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
import { caps } from '@/lib/browser';
import { useRoom } from '@/store/room';
import { AmbientGlow } from './AmbientGlow';
import { Button } from './ui';
import { toggleRoomFullscreen } from '@/lib/fullscreen';

export function ScreenStage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoElState, setVideoElState] = useState<HTMLVideoElement | null>(null);
  // Memoize ref callback so React doesn't invoke null/el on every re-render and trigger a detach/attach blink loop
  const setVideoNode = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoElState((prev) => (prev === el ? prev : el));
  }, []);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const localSharing = useRoom((s) => s.local.sharing);
  const warnings = useRoom((s) => s.warnings);
  const streamVolume = useRoom((s) => s.audio.streamVolume);
  const duck = useRoom((s) => s.duck);
  const [sharerName, setSharerName] = useState<string>('');
  const [hasVideo, setHasVideo] = useState(false);
  const [remoteAudioBlocked, setRemoteAudioBlocked] = useState(false);
  const [showHostPreview, setShowHostPreview] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || localSharing) return;
    el.volume = Math.max(0, Math.min(1, streamVolume * duck));
  }, [streamVolume, duck, localSharing, hasVideo]);

  // Attach ScreenShare video & ScreenShareAudio onto ONE <video> element for hardware A/V lip-sync
  useEffect(() => {
    const room = controller.room;
    if (!room) return;

    let attachedVideo: Track | null = null;
    let attachedAudio: Track | null = null;
    const videoEl = videoRef.current;

    const attachSharer = () => {
      if (!videoEl) return;

      // 1. Check local presenter preview (must stay muted so presenter hears original tab without echo)
      if (room.localParticipant.isScreenShareEnabled) {
        const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (pub && pub.track) {
          if (attachedAudio) {
            attachedAudio.detach(videoEl);
            attachedAudio = null;
          }
          videoEl.muted = true;
          if (attachedVideo !== pub.track) {
            if (attachedVideo) attachedVideo.detach(videoEl);
            attachedVideo = pub.track;
            pub.track.attach(videoEl);
          }
          setSharerName('You (Presenting)');
          setRemoteAudioBlocked(false);
          setHasVideo(true);
          return;
        }
      }

      // 2. Check remote presenter
      for (const p of room.remoteParticipants.values()) {
        if (p.isScreenShareEnabled) {
          const vPub = p.getTrackPublication(Track.Source.ScreenShare);
          const aPub = p.getTrackPublication(Track.Source.ScreenShareAudio);
          if (vPub && vPub.track) {
            if (attachedVideo !== vPub.track) {
              if (attachedVideo) attachedVideo.detach(videoEl);
              attachedVideo = vPub.track;
              vPub.track.attach(videoEl);
            }
            if (aPub?.track && attachedAudio !== aPub.track) {
              if (attachedAudio) attachedAudio.detach(videoEl);
              attachedAudio = aPub.track;
              videoEl.muted = false;
              videoEl.volume = Math.max(0, Math.min(1, useRoom.getState().audio.streamVolume * useRoom.getState().duck));
              aPub.track.attach(videoEl);
            } else if (!aPub?.track) {
              videoEl.muted = true;
            }
            if (videoEl.paused) {
              void videoEl.play().catch((err) => {
                if (err?.name === 'NotAllowedError') {
                  videoEl.muted = true;
                  setRemoteAudioBlocked(true);
                  void videoEl.play().catch(() => {});
                }
              });
            }
            setRemoteAudioBlocked(Boolean(aPub?.track && videoEl.muted));
            setSharerName(p.name || p.identity);
            setHasVideo(true);
            return;
          }
        }
      }

      if (attachedVideo) {
        attachedVideo.detach(videoEl);
        attachedVideo = null;
      }
      if (attachedAudio) {
        attachedAudio.detach(videoEl);
        attachedAudio = null;
      }
      setSharerName('');
      setRemoteAudioBlocked(false);
      setHasVideo(false);
    };

    attachSharer();

    // LiveKit events for track changes
    const onTrackSubscribed = (track: Track) => {
      if (track.source === Track.Source.ScreenShare || track.source === Track.Source.ScreenShareAudio) {
        attachSharer();
      }
    };
    const onTrackUnsubscribed = (track: Track) => {
      if (
        track === attachedVideo ||
        track === attachedAudio ||
        track.source === Track.Source.ScreenShare ||
        track.source === Track.Source.ScreenShareAudio
      ) {
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
      if (attachedVideo && videoEl) attachedVideo.detach(videoEl);
      if (attachedAudio && videoEl) attachedAudio.detach(videoEl);
    };
  }, [localSharing, videoElState]);

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
      className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl p-1 sm:p-2"
    >
      {/* Ambient Glow behind remote video (skip on presenter to keep 100% GPU free for screen encoding) */}
      <AmbientGlow videoEl={videoElState} active={hasVideo && !localSharing} />

      {/* Actual video element — attaches both video & audio on viewers for hardware A/V sync */}
      <video
        ref={setVideoNode}
        playsInline
        autoPlay
        onClick={() => {
          if (videoRef.current && remoteAudioBlocked && !localSharing) {
            videoRef.current.muted = false;
            videoRef.current.volume = Math.max(0, Math.min(1, streamVolume * duck)) || 1;
            void videoRef.current.play().catch(() => {});
            setRemoteAudioBlocked(false);
            void controller.unlockAudio();
          }
        }}
        className={`relative z-10 max-h-full max-w-full rounded-xl bg-black object-contain shadow-2xl ${
          !hasVideo || (localSharing && !showHostPreview) ? 'pointer-events-none absolute inset-0 opacity-0' : 'block'
        }`}
      />

      {/* Lightweight zero-GPU Presenter Screen Share Console (avoids hall-of-mirrors & GPU contention) */}
      {hasVideo && localSharing && !showHostPreview && (
        <div className="relative z-10 flex max-w-md flex-col items-center justify-center p-6 text-center text-white">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-coral-500/20 text-coral-300 ring-1 ring-coral-400/40 shadow-glow">
            <MonitorUp size={28} />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Screen &amp; Stereo Audio Active
          </div>
          <h3 className="font-display text-xl font-bold tracking-tight">You are sharing your screen</h3>
          <p className="mt-1.5 text-xs sm:text-sm text-white/55 leading-relaxed">
            Preview is paused on your screen to eliminate echo loops and dedicate maximum GPU speed to your viewers.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onClick={() => controller.stopShare()}
              className="butter-btn flex items-center gap-1.5 rounded-xl bg-red-500 hover:bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow"
            >
              <MonitorOff size={14} /> Stop Sharing
            </button>
            <button
              onClick={() => setShowHostPreview(true)}
              className="butter-btn flex items-center gap-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] px-4 py-2.5 text-xs font-semibold text-white/85 ring-1 ring-white/15"
            >
              <Eye size={14} /> Show Preview
            </button>
          </div>
        </div>
      )}

      {hasVideo && localSharing && showHostPreview && (
        <button
          onClick={() => setShowHostPreview(false)}
          className="butter-btn absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-xl bg-ink-950/85 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-md hover:bg-ink-900"
        >
          Hide Preview (Save GPU)
        </button>
      )}

      {hasVideo && !localSharing && remoteAudioBlocked && (
        <button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              videoRef.current.volume = Math.max(0, Math.min(1, streamVolume * duck)) || 1;
              void videoRef.current.play().catch(() => {});
            }
            setRemoteAudioBlocked(false);
            void controller.unlockAudio();
          }}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-coral-500 hover:bg-coral-600 px-5 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur animate-bounce"
        >
          <Volume2 className="h-4 w-4" /> Tap to Enable Screen Sound
        </button>
      )}

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

      {/* Atmospheric Orbital Screening Lounge Empty State */}
      {!hasVideo && (
        <div className="relative z-10 flex w-full max-w-2xl flex-col items-center justify-center p-5 sm:p-8 text-center text-white">
          {/* Concentric glowing orbital rings behind stage center */}
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="animate-orbit-slow h-72 w-72 sm:h-96 sm:w-96 rounded-full border border-white/[0.06]">
              <span className="absolute -top-1 left-1/2 h-2 w-2 rounded-full bg-amber-300/80 shadow-[0_0_12px_rgba(251,191,36,0.7)]" />
            </div>
            <div className="animate-orbit-rev absolute h-48 w-48 sm:h-64 sm:w-64 rounded-full border border-dashed border-coral-400/20">
              <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 rounded-full bg-coral-400" />
            </div>
          </div>

          <div className="relative mb-5">
            <div className="absolute -inset-4 rounded-full bg-coral-500/20 blur-2xl" />
            <div className="animate-float-gentle relative grid h-16 w-16 sm:h-20 sm:w-20 place-items-center rounded-3xl bg-white/[0.08] ring-1 ring-white/15 backdrop-blur-xl shadow-float">
              <MonitorUp size={30} className="text-coral-300" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1 text-[11px] font-medium text-white/70 ring-1 ring-white/10 mb-3">
            <Sparkles size={12} className="text-amber-300" />
            <span>The Orbit · Watch Together</span>
          </div>

          <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-3xl">
            Pick what everyone watches together
          </h2>
          <p className="mt-2 max-w-md text-xs sm:text-sm text-white/55 leading-relaxed">
            Share a browser tab in crisp stereo, watch YouTube in real-time lockstep, or drop any local video file straight onto the screen.
          </p>

          {/* 3-Card Interactive Launch Dock */}
          <div
            className={`mt-6 grid w-full grid-cols-1 gap-2.5 ${caps.canShareScreen ? 'sm:grid-cols-3' : 'sm:grid-cols-2 max-w-lg'}`}
          >
            {caps.canShareScreen && (
              <button
                onClick={() => controller.startShare()}
                className="butter-btn group flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 rounded-2xl bg-coral-500/20 hover:bg-coral-500/30 p-3.5 sm:p-4 text-left ring-1 ring-coral-400/40 backdrop-blur-md"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-500 text-white shadow">
                  <MonitorUp size={17} />
                </span>
                <div>
                  <div className="text-xs font-bold text-white">Share Screen</div>
                  <div className="text-[11px] text-white/60 mt-0.5">60 fps · Stereo audio</div>
                </div>
              </button>
            )}

            <button
              onClick={() => useRoom.getState().setUi({ youtubeDialog: true })}
              className="butter-btn group flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] p-3.5 sm:p-4 text-left ring-1 ring-white/10 backdrop-blur-md"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
                <YoutubeIcon size={17} />
              </span>
              <div>
                <div className="text-xs font-bold text-white">YouTube Sync</div>
                <div className="text-[11px] text-white/55 mt-0.5">Paste URL · Queue</div>
              </div>
            </button>

            <button
              onClick={() => controller.setMode('local')}
              className="butter-btn group flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] p-3.5 sm:p-4 text-left ring-1 ring-white/10 backdrop-blur-md"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30">
                <Film size={17} />
              </span>
              <div>
                <div className="text-xs font-bold text-white">Local 4K Drop</div>
                <div className="text-[11px] text-white/55 mt-0.5">.mp4 / .mkv + subtitles</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
