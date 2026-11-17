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
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [countdownNum, setCountdownNum] = useState<number | null>(null);

  // Sync volume with user's stream volume slider and smart ducking
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const effectiveDuck = smartDuck ? (duck < 0.95 ? 0.7 : 1) : 1;
    v.volume = localMuted ? 0 : Math.max(0, Math.min(1, streamVolume * effectiveDuck));
  }, [streamVolume, duck, smartDuck, localMuted]);

  // Handle local video file selection
  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('video/') && !/\.(mp4|mkv|webm|mov|avi)$/i.test(file.name)) {
        return;
      }
      const url = URL.createObjectURL(file);
      setLocalMovie({
        file,
        url,
        fileName: file.name,
        fileSize: file.size,
      });

      if (isController) {
        controller.loadLocalMovie(file.name, file.size);
      }
    },
    [isController, setLocalMovie],
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
    const video = files.find((f) => f.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi)$/i.test(f.name));
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
    // If sync has a position, seek to expected position
    const exp = expectedPosition(sync, clock.offsetMs);
    v.currentTime = exp;
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    useRoom.setState({
      playhead: {
        time: v.currentTime,
        duration: v.duration || 0,
        videoId: localMovie.fileName,
      },
    });
  };

  // Sync loop: executes every 1.5s to correct drift and respond to sync commands
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !localMovie.url) return;

    const tick = () => {
      const vTime = v.currentTime;
      const vRate = v.playbackRate;
      const until = msUntilStart(sync, clock.offsetMs);

      // Countdown in progress (future timestamp)
      if (until > 0) {
        setCountdownNum(Math.ceil(until / 1000));
        if (!v.paused) v.pause();
        if (Math.abs(vTime - sync.position) > 0.4) {
          v.currentTime = sync.position;
        }
        return;
      } else {
        setCountdownNum(null);
      }

      if (sync.status === 'paused') {
        if (!v.paused) v.pause();
        if (Math.abs(vTime - sync.position) > 0.4) {
          v.currentTime = sync.position;
        }
        return;
      }

      if (sync.status === 'playing') {
        if (v.paused) {
          v.play().catch(() => {
            // Autoplay might require interaction
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
  }, [sync, localMovie.url]);

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
        accept="video/*,.mp4,.mkv,.webm,.mov,.avi"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
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
        }}
      />

      {/* Drop overlay animation */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-popcorn-primary/20 backdrop-blur-md border-4 border-dashed border-popcorn-primary rounded-xl"
          >
            <Upload className="h-16 w-16 text-popcorn-primary animate-bounce mb-3" />
            <h3 className="text-2xl font-bold text-white">Drop Movie or Subtitles Here</h3>
            <p className="text-sm text-popcorn-primary font-medium mt-1">
              Supports .mp4, .mkv, .webm video & .srt, .vtt subtitles
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Case 1: No local file loaded yet */}
      {!localMovie.url ? (
        <div className="z-10 flex max-w-lg flex-col items-center justify-center p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 border border-white/10 shadow-2xl mb-6 backdrop-blur">
            <Film className="h-10 w-10 text-popcorn-primary" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            Local Video File Sync
          </h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
            Watch any video together in <strong className="text-white">100% native 4K quality</strong> with zero server compression. Everyone loads their local copy and playback stays perfectly synchronized.
          </p>

          {/* If the host already announced a movie */}
          {sync.videoId && (
            <div className="mb-6 w-full rounded-xl border border-popcorn-primary/30 bg-popcorn-primary/10 p-4 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-popcorn-primary mb-1">
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
              className="flex items-center gap-2 rounded-xl bg-popcorn-primary px-5 py-3 text-sm font-semibold text-black transition-all hover:bg-popcorn-primary/90 shadow-lg hover:shadow-popcorn-primary/20 active:scale-95"
            >
              <Upload className="h-4 w-4" />
              Choose Movie File
            </button>
            <button
              onClick={() => subInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10 active:scale-95"
            >
              <SubtitlesIcon className="h-4 w-4" />
              Add Subtitle (.srt / .vtt)
            </button>
          </div>
        </div>
      ) : (
        /* Case 2: Video file loaded */
        <div className="relative flex h-full w-full items-center justify-center">
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
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-popcorn-primary bg-black/80 shadow-2xl backdrop-blur">
                  <span className="text-6xl font-black text-popcorn-primary">
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
                      value={[duration ? (currentTime / duration) * 100 : 0]}
                      max={100}
                      step={0.1}
                      onValueChange={(val) => {
                        if (!duration) return;
                        const target = (val[0] / 100) * duration;
                        if (isController) {
                          controller.seek(target);
                        } else if (videoRef.current) {
                          videoRef.current.currentTime = target;
                        }
                      }}
                      className="cursor-pointer"
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
                      onClick={() => {
                        if (isController) {
                          if (sync.status === 'playing') controller.pause();
                          else controller.play();
                        } else if (videoRef.current) {
                          if (videoRef.current.paused) videoRef.current.play();
                          else videoRef.current.pause();
                        }
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95"
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
                      onClick={() => {
                        const target = Math.max(0, currentTime - 10);
                        if (isController) controller.seek(target);
                        else if (videoRef.current) videoRef.current.currentTime = target;
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
                      title="Rewind 10s"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        const target = Math.min(duration, currentTime + 10);
                        if (isController) controller.seek(target);
                        else if (videoRef.current) videoRef.current.currentTime = target;
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
                      title="Forward 10s"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>

                    {/* Volume Mute Toggle */}
                    <button
                      onClick={() => setLocalMuted(!localMuted)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
                      title={localMuted ? 'Unmute' : 'Mute'}
                    >
                      {localMuted || streamVolume === 0 ? (
                        <VolumeX className="h-4 w-4 text-red-400" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>

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
