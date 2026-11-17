import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Film,
  Upload,
  Subtitles as SubtitlesIcon,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Clock,
  Sparkles,
} from 'lucide-react';
import { decideDrift, expectedPosition, formatTime, msUntilStart } from '@popcorn/shared';
import { clock } from '@/lib/clock';
import { controller } from '@/room/controller';
import { canControl, useRoom } from '@/store/room';
import { Slider } from './ui';
import { toggleRoomFullscreen } from '@/lib/fullscreen';
import { AmbientGlow } from './AmbientGlow';
import { createSubtitleTrack, shiftVtt } from '@/lib/subtitles';
import { toast } from 'sonner';
import { isTypingTarget } from '@/lib/utils';

export function LocalStage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const subInputRef = useRef<HTMLInputElement | null>(null);
  const driftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = useRoom((s) => s.sync);
  const streamVolume = useRoom((s) => s.audio.streamVolume);
  const duck = useRoom((s) => s.duck);
  const smartDuck = useRoom((s) => s.audio.smartDuck);
  const isController = useRoom(canControl);
  const fullscreen = useRoom((s) => s.ui.fullscreen);
  const ambilight = useRoom((s) => s.ui.ambilight);
  const localMovie = useRoom((s) => s.localMovie);
  const setLocalMovie = useRoom((s) => s.setLocalMovie);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [localMuted, setLocalMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [needsAudioInteraction, setNeedsAudioInteraction] = useState(false);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [countdownNum, setCountdownNum] = useState<number | null>(null);

  // Sync volume & muted property with user's stream volume slider and smart ducking
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const effectiveDuck = smartDuck ? (duck < 0.95 ? 0.7 : 1) : 1;
    const targetVol = localMuted ? 0 : Math.max(0, Math.min(1, streamVolume * effectiveDuck));
    v.volume = targetVol;
    v.muted = localMuted || targetVol === 0;
  }, [streamVolume, duck, smartDuck, localMuted]);

  // Unmute audio handler
  const unmuteVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = streamVolume > 0 ? streamVolume : 1;
    setLocalMuted(false);
    setNeedsAudioInteraction(false);
    if (v.paused && sync.status === 'playing') {
      v.play().catch(() => {});
    }
  }, [streamVolume, sync.status]);

  // Handle local video file selection
  const handleFile = useCallback(
    (file: File) => {
      const isVideo =
        file.type.startsWith('video/') ||
        /\.(mp4|m4v|mkv|webm|mov|avi|ts|flv|wmv)$/i.test(file.name);
      if (!isVideo) {
        toast.error('Please select a video file (.mp4, .mkv, .webm, .mov)');
        return;
      }
      try {
        const url = URL.createObjectURL(file);
        setLocalMovie({
          file,
          url,
          fileName: file.name,
          fileSize: file.size,
        });

        controller.loadLocalMovie(file.name, file.size);
        toast.success(`Loaded "${file.name}"`);
      } catch (err) {
        console.error('Failed to create object URL', err);
        toast.error('Failed to open video file');
      }
    },
    [setLocalMovie],
  );

  // Handle subtitle file selection
  const handleSubtitleFile = useCallback(
    async (file: File) => {
      try {
        const { url, rawVtt, name } = await createSubtitleTrack(file, 0);
        setLocalMovie({
          subtitles: {
            name,
            url,
            rawVtt,
            offsetSec: 0,
            fontSize: 'md',
            enabled: true,
          },
        });
      } catch (err) {
        console.error('Failed to load subtitle file', err);
      }
    },
    [setLocalMovie],
  );

  // Subtitle offset adjustment (+/- 0.5s)
  const adjustSubOffset = useCallback(
    (deltaSec: number) => {
      const subs = localMovie.subtitles;
      if (!subs) return;
      const nextOffset = Math.round((subs.offsetSec + deltaSec) * 10) / 10;
      const shifted = shiftVtt(subs.rawVtt, nextOffset);
      const blob = new Blob([shifted], { type: 'text/vtt' });
      if (subs.url) URL.revokeObjectURL(subs.url);
      const newUrl = URL.createObjectURL(blob);
      setLocalMovie({
        subtitles: {
          ...subs,
          url: newUrl,
          offsetSec: nextOffset,
        },
      });
    },
    [localMovie.subtitles, setLocalMovie],
  );

  // Set subtitle font size
  const setSubFontSize = useCallback(
    (fontSize: 'sm' | 'md' | 'lg' | 'xl') => {
      if (!localMovie.subtitles) return;
      setLocalMovie({
        subtitles: {
          ...localMovie.subtitles,
          fontSize,
        },
      });
    },
    [localMovie.subtitles, setLocalMovie],
  );

  // Toggle subtitles visibility
  const toggleSubtitles = useCallback(() => {
    if (!localMovie.subtitles) return;
    setLocalMovie({
      subtitles: {
        ...localMovie.subtitles,
        enabled: !localMovie.subtitles.enabled,
      },
    });
  }, [localMovie.subtitles, setLocalMovie],
  );

  // Drag and drop event handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const video = files.find(
      (f) => f.type.startsWith('video/') || /\.(mp4|m4v|mkv|webm|mov|avi|ts|flv|wmv)$/i.test(f.name),
    );
    const sub = files.find((f) => /\.(srt|vtt)$/i.test(f.name));

    if (video) handleFile(video);
    if (sub) void handleSubtitleFile(sub);
  };

  // Keep track of duration and time
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setLocalMovie({ duration: v.duration || 0 });
    v.muted = false;
    v.volume = streamVolume > 0 ? streamVolume : 1;
    // If sync has a position, seek to expected position
    const exp = expectedPosition(sync, clock.offsetMs);
    v.currentTime = exp;
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!isScrubbing) {
      setCurrentTime(v.currentTime);
    }
    useRoom.setState({
      playhead: {
        time: v.currentTime,
        duration: v.duration || 0,
        videoId: localMovie.fileName,
      },
    });
  };

  // Seek timeline forward or backward
  const handleSeek = (targetSec: number) => {
    if (!duration) return;
    const target = Math.max(0, Math.min(duration, targetSec));
    setCurrentTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    if (isController) {
      controller.seek(target);
    }
  };

  // Jump by delta seconds (+/- 10s)
  const skip = (deltaSec: number) => {
    const v = videoRef.current;
    const cur = v ? v.currentTime : currentTime;
    const target = Math.max(0, Math.min(duration, cur + deltaSec));
    setCurrentTime(target);
    if (v) {
      v.currentTime = target;
    }
    if (isController) {
      controller.seek(target);
    }
  };

  // Play / Pause toggle with latest time guarantee
  const togglePlay = () => {
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      v.volume = streamVolume > 0 ? streamVolume : 1;
    }
    const cur = v ? v.currentTime : currentTime;
    if (needsAudioInteraction) {
      unmuteVideo();
    }
    if (isController) {
      if (sync.status === 'playing') {
        controller.pause(cur);
      } else {
        controller.play(cur);
      }
    } else if (v) {
      if (v.paused) {
        v.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            v.muted = true;
            v.play().then(() => setNeedsAudioInteraction(true)).catch(() => {});
          }
        });
      } else {
        v.pause();
      }
    }
  };

  // Keyboard shortcuts (Space = Play/Pause, ArrowLeft = -10s, ArrowRight = +10s, M = Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skip(-10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skip(10);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setLocalMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, skip]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !localMovie.url) return;

    const tick = () => {
      if (isScrubbing) return;

      const vTime = v.currentTime;
      const vRate = v.playbackRate;
      const until = msUntilStart(sync, clock.offsetMs);

      // Countdown in progress (future timestamp)
      if (until > 0) {
        setCountdownNum(Math.ceil(until / 1000));
        if (!v.paused) v.pause();
        if (Math.abs(vTime - sync.position) > 0.5) {
          v.currentTime = sync.position;
        }
        return;
      } else {
        setCountdownNum(null);
      }

      if (sync.status === 'paused') {
        if (!v.paused) v.pause();
        if (Math.abs(vTime - sync.position) > 0.5) {
          v.currentTime = sync.position;
        }
        return;
      }

      if (sync.status === 'playing') {
        if (v.paused) {
          v.play().catch((err) => {
            if (err.name === 'NotAllowedError') {
              v.muted = true;
              v.play().then(() => setNeedsAudioInteraction(true)).catch(() => {});
            }
          });
        }

        const action = decideDrift(vTime, vRate, sync, clock.offsetMs);
        if (action.kind === 'seek') {
          v.currentTime = action.to;
          v.playbackRate = sync.rate;
        } else if (action.kind === 'rate') {
          v.playbackRate = action.rate;
        } else if (action.kind === 'restoreRate') {
          v.playbackRate = action.rate;
        }
      }
    };

    tick();
    driftTimerRef.current = setInterval(tick, 1500);
    return () => {
      if (driftTimerRef.current) clearInterval(driftTimerRef.current);
    };
  }, [sync, localMovie.url, isScrubbing]);

  // Auto-hide controls when mouse is inactive
  const handleMouseMove = () => {
    setControlsVisible(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      if (sync.status === 'playing') setControlsVisible(false);
    }, 3200);
  };

  // Check if current file matches host's required file
  const isMatchingFile = useMemo(() => {
    if (!sync.videoId || !localMovie.fileName) return true;
    return sync.videoId.toLowerCase() === localMovie.fileName.toLowerCase();
  }, [sync.videoId, localMovie.fileName]);

  const cueClass = localMovie.subtitles?.fontSize
    ? `subtitles-${localMovie.subtitles.fontSize}`
    : 'subtitles-md';

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-black"
    >
      {/* Dynamic 4-zone edge Ambilight Bias Lighting */}
      <AmbientGlow
        videoEl={videoRef.current}
        active={Boolean(localMovie.url && ambilight)}
      />

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.m4v,.mkv,.webm,.mov,.avi,.ts"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={subInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleSubtitleFile(f);
          e.target.value = '';
        }}
      />

      {/* Drop overlay animation */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md border-4 border-dashed border-coral-500 rounded-xl"
          >
            <Upload className="h-16 w-16 text-coral-400 animate-bounce mb-3" />
            <h3 className="text-2xl font-bold text-white">Drop Movie or Subtitles Here</h3>
            <p className="text-sm text-coral-300 font-medium mt-1">
              Supports .mp4, .mkv, .webm video & .srt, .vtt subtitles
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Case 1: No local file loaded yet */}
      {!localMovie.url ? (
        <div className="z-10 flex max-w-lg flex-col items-center justify-center p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 border border-white/10 shadow-2xl mb-6 backdrop-blur">
            <Film className="h-10 w-10 text-coral-400" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            Local Video File Sync
          </h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
            Watch any video together in <strong className="text-white">100% native 4K quality</strong> with zero server compression. Everyone loads their local copy and playback stays perfectly synchronized.
          </p>

          {/* If the host already announced a movie */}
          {sync.videoId && (
            <div className="mb-6 w-full rounded-xl border border-coral-500/30 bg-coral-500/10 p-4 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-coral-400 mb-1">
                <Sparkles className="h-4 w-4" /> Room Movie Selected
              </div>
              <div className="truncate text-sm font-semibold text-white">
                {sync.videoId}
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Select or drop your copy of this video to join the synced party!
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-bold px-6 py-3.5 shadow-lg shadow-coral-500/25 transition-all active:scale-95 text-sm cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              Choose Movie File (.mp4, .mkv, .webm)
            </button>
            <button
              onClick={() => subInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 text-white font-medium px-5 py-3.5 transition-all active:scale-95 text-sm cursor-pointer"
            >
              <SubtitlesIcon className="h-4 w-4" />
              Add Subtitle (.srt / .vtt)
            </button>
          </div>
        </div>
      ) : (
        /* Case 2: Video file loaded */
        <div
          className="relative flex h-full w-full items-center justify-center cursor-pointer"
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === 'VIDEO' || e.target === e.currentTarget) {
              togglePlay();
            }
          }}
          onDoubleClick={toggleRoomFullscreen}
        >
          <video
            ref={videoRef}
            src={localMovie.url}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onEnded={() => controller.onVideoEnded()}
            className={`max-h-full max-w-full object-contain ${cueClass}`}
            playsInline
          >
            {localMovie.subtitles?.enabled && localMovie.subtitles.url && (
              <track
                key={localMovie.subtitles.url}
                default
                kind="subtitles"
                src={localMovie.subtitles.url}
                srcLang="en"
                label={localMovie.subtitles.name}
              />
            )}
          </video>

          {/* Autoplay unmuted banner */}
          {(needsAudioInteraction || localMuted || streamVolume === 0) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                unmuteVideo();
              }}
              className="absolute top-6 z-30 flex items-center gap-2 rounded-full bg-coral-500 hover:bg-coral-600 px-5 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur animate-bounce transition active:scale-95 cursor-pointer"
            >
              <Volume2 className="h-4 w-4" />
              Sound is Muted — Click to Enable Sound
            </button>
          )}

          {/* 3-2-1 Countdown Overlay */}
          <AnimatePresence>
            {countdownNum !== null && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="pointer-events-none absolute z-30 flex flex-col items-center justify-center"
              >
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-coral-500 bg-black/80 shadow-2xl backdrop-blur">
                  <span className="text-6xl font-black text-coral-400">
                    {countdownNum}
                  </span>
                </div>
                <div className="mt-4 text-sm font-bold tracking-widest uppercase text-white/90">
                  Starting in sync...
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Host Mismatch Warning Banner (if guest loaded a different movie name) */}
          {!isMatchingFile && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-200 backdrop-blur-md">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              <span>Host is playing: <strong className="text-white">{sync.videoId}</strong></span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="underline ml-1 hover:text-white"
              >
                Switch
              </button>
            </div>
          )}

          {/* Controls Bar */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-12"
              >
                {/* Seek Bar */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-300 min-w-[45px]">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-1">
                    <Slider
                      value={duration > 0 ? currentTime / duration : 0}
                      onChange={(pct) => handleSeek(pct * duration)}
                      label="Seek movie timeline"
                      tone="coral"
                    />
                  </div>
                  <span className="text-xs font-medium text-zinc-400 min-w-[45px]">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Control Buttons Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Play / Pause button */}
                    <button
                      onClick={togglePlay}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 cursor-pointer"
                      title={sync.status === 'playing' ? 'Pause' : 'Play'}
                    >
                      {sync.status === 'playing' ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5 ml-0.5" />
                      )}
                    </button>

                    {/* 10s Skip back / forward */}
                    <button
                      onClick={() => skip(-10)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white cursor-pointer"
                      title="Rewind 10s"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => skip(10)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white cursor-pointer"
                      title="Forward 10s"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>

                    {/* Volume Mute Toggle & Inline Volume Slider */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          if (localMuted || streamVolume === 0) {
                            unmuteVideo();
                          } else {
                            setLocalMuted(true);
                          }
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white cursor-pointer"
                        title={localMuted || streamVolume === 0 ? 'Unmute' : 'Mute'}
                      >
                        {localMuted || streamVolume === 0 ? (
                          <VolumeX className="h-4 w-4 text-red-400" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                      <div className="w-16 sm:w-20">
                        <Slider
                          value={localMuted ? 0 : streamVolume}
                          onChange={(v) => {
                            setLocalMuted(false);
                            useRoom.getState().setAudio({ streamVolume: v });
                            if (videoRef.current) {
                              videoRef.current.volume = v;
                              videoRef.current.muted = v === 0;
                            }
                          }}
                          label="Movie volume"
                          tone="coral"
                        />
                      </div>
                    </div>

                    {/* Movie title pill */}
                    <div className="hidden sm:flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 border border-white/10">
                      <FileVideo className="h-3.5 w-3.5 text-popcorn-primary" />
                      <span className="max-w-[200px] truncate text-xs font-medium text-white">
                        {localMovie.fileName}
                      </span>
                    </div>
                  </div>

                  {/* Right side controls: Subtitles & Fullscreen */}
                  <div className="flex items-center gap-2">
                    {/* Subtitles Menu Trigger */}
                    <div className="relative">
                      <button
                        onClick={() => setSubMenuOpen(!subMenuOpen)}
                        className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all ${
                          localMovie.subtitles?.enabled
                            ? 'bg-popcorn-primary/20 text-popcorn-primary border border-popcorn-primary/30'
                            : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                        }`}
                        title="Subtitles & Styling"
                      >
                        <SubtitlesIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          {localMovie.subtitles ? 'CC' : 'Add Subtitles'}
                        </span>
                      </button>

                      {/* Subtitles Popover Menu */}
                      <AnimatePresence>
                        {subMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute bottom-12 right-0 z-40 w-72 rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-xl"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                                Subtitles (.srt / .vtt)
                              </span>
                              {localMovie.subtitles && (
                                <button
                                  onClick={toggleSubtitles}
                                  className={`text-xs px-2 py-0.5 rounded font-semibold transition-all ${
                                    localMovie.subtitles.enabled
                                      ? 'bg-popcorn-primary text-black'
                                      : 'bg-white/10 text-zinc-400'
                                  }`}
                                >
                                  {localMovie.subtitles.enabled ? 'ON' : 'OFF'}
                                </button>
                              )}
                            </div>

                            {localMovie.subtitles ? (
                              <div className="space-y-3">
                                <div className="truncate text-xs text-zinc-300 font-medium bg-black/40 p-2 rounded-lg border border-white/5">
                                  {localMovie.subtitles.name}
                                </div>

                                {/* Font Size Selection */}
                                <div>
                                  <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                                    Subtitle Size
                                  </label>
                                  <div className="grid grid-cols-4 gap-1">
                                    {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                                      <button
                                        key={sz}
                                        onClick={() => setSubFontSize(sz)}
                                        className={`rounded-lg py-1 text-xs font-semibold uppercase transition-all ${
                                          localMovie.subtitles?.fontSize === sz
                                            ? 'bg-popcorn-primary text-black'
                                            : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                                        }`}
                                      >
                                        {sz}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Subtitle Sync Offset Stepper (+/- 0.5s) */}
                                <div>
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mb-1.5">
                                    <span>Sync Nudge</span>
                                    <span className="text-popcorn-primary">
                                      {localMovie.subtitles.offsetSec > 0 ? `+${localMovie.subtitles.offsetSec}s` : `${localMovie.subtitles.offsetSec}s`}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => adjustSubOffset(-0.5)}
                                      className="flex-1 rounded-lg bg-white/5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10 active:scale-95"
                                    >
                                      -0.5s
                                    </button>
                                    <button
                                      onClick={() => adjustSubOffset(0.5)}
                                      className="flex-1 rounded-lg bg-white/5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10 active:scale-95"
                                    >
                                      +0.5s
                                    </button>
                                    {localMovie.subtitles.offsetSec !== 0 && (
                                      <button
                                        onClick={() => adjustSubOffset(-localMovie.subtitles!.offsetSec)}
                                        className="rounded-lg bg-white/5 px-2 py-1 text-xs font-medium text-zinc-400 hover:text-white"
                                        title="Reset offset"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <button
                                  onClick={() => subInputRef.current?.click()}
                                  className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white transition-all mt-2"
                                >
                                  Load Another Subtitle
                                </button>
                              </div>
                            ) : (
                              <div className="text-center py-2">
                                <p className="text-xs text-zinc-400 mb-3">
                                  Drag and drop an .srt or .vtt subtitle file, or choose from your computer.
                                </p>
                                <button
                                  onClick={() => subInputRef.current?.click()}
                                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-popcorn-primary px-3 py-2 text-xs font-semibold text-black transition-all hover:bg-popcorn-primary/90"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  Browse Subtitle File
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Change movie file button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-white/5 px-2.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-all"
                      title="Switch Video File"
                    >
                      <Film className="h-4 w-4" />
                      <span className="hidden sm:inline">Change File</span>
                    </button>

                    {/* Fullscreen Button */}
                    <button
                      onClick={toggleRoomFullscreen}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
                      title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                    >
                      {fullscreen ? (
                        <Minimize className="h-4 w-4" />
                      ) : (
                        <Maximize className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
