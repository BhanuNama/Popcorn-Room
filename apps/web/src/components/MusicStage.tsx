import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Disc3,
  ListMusic,
  Mic2,
  Music,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { expectedPosition, formatTime } from '@popcorn/shared';
import { parseLrc } from '@/lib/audioTags';
import { clock } from '@/lib/clock';
import { controller } from '@/room/controller';
import { isAudioDropCandidate } from '@/room/p2pAudio';
import { canControl, useRoom } from '@/store/room';
import { Slider } from './ui';
import { toast } from 'sonner';

const analyserCache = new WeakMap<
  HTMLAudioElement,
  { ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }
>();

export function MusicStage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const ytReadyRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pulseAuraRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lrcInputRef = useRef<HTMLInputElement | null>(null);

  const sync = useRoom((s) => s.sync);
  const musicQueue = useRoom((s) => s.musicQueue);
  const musicActiveId = useRoom((s) => s.musicActiveId);
  const musicLocalUrls = useRoom((s) => s.musicLocalUrls);
  const musicProgress = useRoom((s) => s.musicProgress);
  const streamVolume = useRoom((s) => s.audio.streamVolume);
  const duck = useRoom((s) => s.duck);
  const smartDuck = useRoom((s) => s.audio.smartDuck);
  const isController = useRoom(canControl);

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'queue' | 'lyrics'>('queue');
  const [ytInput, setYtInput] = useState('');
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);

  const activeTrack = useMemo(
    () => musicQueue.find((t) => t.id === musicActiveId) ?? musicQueue[0] ?? null,
    [musicQueue, musicActiveId],
  );
  const activeLocalUrl = activeTrack?.source === 'local' ? musicLocalUrls[activeTrack.id] ?? null : null;
  const activeProgress = activeTrack ? musicProgress[activeTrack.id] : undefined;
  const parsedLyrics = useMemo(() => (activeTrack?.lrc ? parseLrc(activeTrack.lrc) : []), [activeTrack?.lrc]);
  const isPlaying = sync.status === 'playing' && Boolean(activeTrack);

  const activeLyricIdx = useMemo(() => {
    if (parsedLyrics.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (currentTime >= parsedLyrics[i].time) idx = i;
      else break;
    }
    return idx;
  }, [parsedLyrics, currentTime]);

  const ensureAnalyser = (el: HTMLAudioElement) => {
    if (analyserCache.has(el)) {
      const cached = analyserCache.get(el)!;
      if (cached.ctx.state === 'suspended') void cached.ctx.resume().catch(() => {});
      return cached;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      // NEVER connect createMediaElementSource while AudioContext is suspended —
      // otherwise Chrome routes <audio> into a silent suspended graph even when el.play() resolves!
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      if (ctx.state !== 'running') {
        void ctx.close().catch(() => {});
        return null;
      }
      const src = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      const bundle = { ctx, analyser, data };
      analyserCache.set(el, bundle);
      return bundle;
    } catch {
      return null;
    }
  };

  // Self-healing guest fetch: if an active local track has arrived via metadata/queue without audio yet, request it
  useEffect(() => {
    if (!activeTrack || activeTrack.source !== 'local' || activeLocalUrl) return;
    if (controller.p2pAudio.hasHostFile(activeTrack.id)) return;
    controller.requestMusicTrack(activeTrack.id);
    const timer = window.setInterval(() => {
      if (!useRoom.getState().musicLocalUrls[activeTrack.id]) {
        controller.requestMusicTrack(activeTrack.id);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeTrack?.id, activeTrack?.source, activeLocalUrl]);

  useEffect(() => {
    const effectiveDuck = smartDuck ? (duck < 0.95 ? 0.7 : 1) : 1;
    const vol = muted ? 0 : Math.max(0, Math.min(1, streamVolume * effectiveDuck));
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = muted;
    }
    const yt = ytPlayerRef.current;
    if (yt && ytReadyRef.current && typeof yt.setVolume === 'function') {
      if (muted) yt.mute();
      else yt.unMute();
      yt.setVolume(Math.round(vol * 100));
    }
  }, [streamVolume, duck, smartDuck, muted, activeTrack?.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || activeTrack?.source !== 'local' || !activeLocalUrl) return;
    if (el.src !== activeLocalUrl) {
      el.src = activeLocalUrl;
    }

    const tick = () => {
      const st = useRoom.getState().sync;
      if (st.status === 'paused') {
        if (!el.paused) el.pause();
        if (el.readyState >= 1 && Math.abs(el.currentTime - st.position) > 0.35) {
          el.currentTime = st.position;
        }
        return;
      }
      if (st.status === 'playing') {
        const exp = expectedPosition(st, clock.offsetMs);
        if (el.paused) {
          if (el.readyState >= 1 && Math.abs(el.currentTime - exp) > 0.35) el.currentTime = exp;
          void el
            .play()
            .then(() => {
              setAudioBlocked(false);
            })
            .catch((err) => {
              if (err?.name === 'NotAllowedError') {
                setAudioBlocked(true);
              }
            });
        } else if (el.readyState >= 2 && Math.abs(el.currentTime - exp) > 0.65) {
          el.currentTime = exp;
        }
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    el.addEventListener('canplay', tick);
    el.addEventListener('loadeddata', tick);
    return () => {
      window.clearInterval(timer);
      el.removeEventListener('canplay', tick);
      el.removeEventListener('loadeddata', tick);
    };
  }, [activeTrack?.id, activeTrack?.source, activeLocalUrl, sync]);

  useEffect(() => {
    if (activeTrack?.source !== 'youtube' || !activeTrack.ytId) {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
      }
      return;
    }

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }

    let cancelled = false;
    const mountYt = () => {
      if (cancelled || !ytContainerRef.current) return;
      if (ytPlayerRef.current && ytReadyRef.current) {
        ytPlayerRef.current.loadVideoById(activeTrack.ytId!, expectedPosition(useRoom.getState().sync, clock.offsetMs));
        return;
      }
      if (!window.YT?.Player) {
        const tag = document.querySelector('script[src*="youtube.com/iframe_api"]') as HTMLScriptElement | null;
        if (!tag) {
          const s = document.createElement('script');
          s.src = 'https://www.youtube.com/iframe_api';
          s.async = true;
          document.head.appendChild(s);
        }
        window.setTimeout(mountYt, 250);
        return;
      }

      ytContainerRef.current.innerHTML = '';
      const hostEl = document.createElement('div');
      ytContainerRef.current.appendChild(hostEl);
      ytPlayerRef.current = new window.YT.Player(hostEl, {
        videoId: activeTrack.ytId,
        width: '1',
        height: '1',
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (e) => {
            ytReadyRef.current = true;
            const d = e.target.getDuration();
            if (Number.isFinite(d) && d > 0) setDuration(d);
          },
          onStateChange: (e) => {
            if (e.data === 0 && isController) {
              controller.stepMusicTrack(1);
            }
          },
        },
      });
    };

    mountYt();

    let unstartedTicks = 0;
    const syncYt = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current || typeof p.getCurrentTime !== 'function') return;
      const st = useRoom.getState().sync;
      const d = p.getDuration();
      if (Number.isFinite(d) && d > 0) setDuration(d);
      const cur = p.getCurrentTime();
      if (Number.isFinite(cur)) setCurrentTime(cur);

      if (st.status === 'paused') {
        unstartedTicks = 0;
        if (p.getPlayerState() === 1) p.pauseVideo();
        if (Math.abs(cur - st.position) > 1.2) p.seekTo(st.position, true);
      } else if (st.status === 'playing') {
        const exp = expectedPosition(st, clock.offsetMs);
        const state = p.getPlayerState();
        if (state === 1) {
          unstartedTicks = 0;
        } else {
          p.playVideo();
          if (state !== 3) unstartedTicks++;
          if (unstartedTicks === 2) {
            p.mute();
            p.playVideo();
            setAudioBlocked(true);
          }
        }
        if (Math.abs(cur - exp) > 1.5) p.seekTo(exp, true);
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(syncYt);
    };
  }, [activeTrack?.id, activeTrack?.source, activeTrack?.ytId, isController]);

  // Clean monochrome reactive waveform + subtle poster aura breath
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const bars = 48;
    const heights = new Float32Array(bars);
    let smoothBass = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const playingNow = useRoom.getState().sync.status === 'playing' && Boolean(activeTrack);
      const el = audioRef.current;
      const bundle = el ? analyserCache.get(el) : undefined;
      let bassEnergy = 0;

      if (bundle && playingNow && activeTrack?.source === 'local') {
        bundle.analyser.getByteFrequencyData(bundle.data);
        for (let b = 0; b < 6; b++) bassEnergy += bundle.data[b] ?? 0;
        bassEnergy /= 6 * 255;
      } else if (playingNow) {
        bassEnergy = 0.22 + 0.16 * Math.abs(Math.sin(t * 0.0045));
      }

      smoothBass += (bassEnergy - smoothBass) * 0.16;
      if (pulseAuraRef.current) {
        pulseAuraRef.current.style.transform = `scale(${(1 + smoothBass * 0.08).toFixed(3)})`;
        pulseAuraRef.current.style.opacity = `${(0.22 + smoothBass * 0.35).toFixed(2)}`;
      }

      const barW = Math.max(2, w / bars - 5);
      const gap = (w - bars * barW) / Math.max(1, bars - 1);
      const midY = h / 2;

      for (let i = 0; i < bars; i++) {
        const centerDist = Math.abs(i - bars / 2) / (bars / 2);
        let target = 0.08;
        if (playingNow) {
          if (bundle && activeTrack?.source === 'local') {
            const bin = Math.min(bundle.data.length - 1, Math.floor(centerDist * bundle.data.length * 0.65));
            target = Math.max(0.1, bundle.data[bin] / 255);
          } else {
            target =
              0.16 +
              0.26 * Math.abs(Math.sin(t * 0.004 + i * 0.3)) +
              0.18 * Math.abs(Math.cos(t * 0.006 - i * 0.22));
          }
        }
        heights[i] += (target - heights[i]) * 0.22;
        const barH = Math.max(3, heights[i] * (h - 6));
        const x = i * (barW + gap);
        const y = midY - barH / 2;
        const alpha = 0.25 + (1 - centerDist) * 0.55;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [activeTrack?.id, activeTrack?.source]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter(isAudioDropCandidate);
    const lrcFile = files.find((f) => f.name.toLowerCase().endsWith('.lrc'));
    if (audioFiles.length > 0) {
      void controller.addLocalMusicFiles(audioFiles);
    }
    if (lrcFile && activeTrack) {
      void lrcFile.text().then((txt) => controller.setMusicLrc(activeTrack.id, txt));
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      ensureAnalyser(audioRef.current);
    }
    if (!isController) {
      if (activeTrack?.source === 'local' && audioRef.current) {
        audioRef.current.muted = false;
        setAudioBlocked(false);
        const exp = expectedPosition(useRoom.getState().sync, clock.offsetMs);
        if (audioRef.current.readyState >= 1 && Math.abs(audioRef.current.currentTime - exp) > 0.35) {
          audioRef.current.currentTime = exp;
        }
        void audioRef.current.play().catch(() => {});
      } else if (activeTrack?.source === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
        setAudioBlocked(false);
        ytPlayerRef.current.unMute();
        ytPlayerRef.current.playVideo();
      }
      return;
    }
    if (sync.status === 'playing') controller.pause(currentTime);
    else controller.play(currentTime);
  };

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(duration || sec, sec));
    setCurrentTime(clamped);
    if (audioRef.current && activeTrack?.source === 'local') {
      audioRef.current.currentTime = clamped;
    }
    if (isController) controller.seek(clamped);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPointerDownCapture={() => {
        if (audioRef.current && !audioRef.current.paused) ensureAnalyser(audioRef.current);
      }}
      className="relative flex h-full w-full flex-col lg:flex-row overflow-y-auto lg:overflow-hidden rounded-2xl bg-[#090a0f] text-white"
    >
      <audio
        ref={audioRef}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          if (isController) controller.stepMusicTrack(1);
        }}
        className="hidden"
      />
      <div ref={ytContainerRef} className="pointer-events-none fixed bottom-0 right-0 h-16 w-16 opacity-0" />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus"
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          if (list.length > 0) void controller.addLocalMusicFiles(list);
          e.target.value = '';
        }}
      />
      <input
        ref={lrcInputRef}
        type="file"
        accept=".lrc,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && activeTrack) {
            void f.text().then((txt) => {
              controller.setMusicLrc(activeTrack.id, txt);
              setRightTab('lyrics');
            });
          }
          e.target.value = '';
        }}
      />

      {/* Subtle soft ambient wash from poster cover (clean & restrained) */}
      <AnimatePresence mode="wait">
        {activeTrack?.coverDataUrl && (
          <motion.img
            key={activeTrack.id}
            src={activeTrack.coverDataUrl}
            alt=""
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.16 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-3xl saturate-125"
          />
        )}
      </AnimatePresence>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/75" />

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-black/80 backdrop-blur-md"
          >
            <Music className="mb-3 h-12 w-12 animate-bounce text-white/90" />
            <p className="text-base sm:text-lg font-semibold text-white">Drop Music (.mp3, .flac, .wav, .m4a) or .lrc</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Stage */}
      <div className="relative z-10 flex flex-1 min-h-0 flex-col justify-between p-4 sm:p-6 min-w-0">
        {/* Top Minimal Pill Bar */}
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/75 backdrop-blur-md">
            <span className={`h-1.5 w-1.5 rounded-full ${isPlaying ? 'bg-white animate-pulse' : 'bg-white/35'}`} />
            <span>{activeTrack?.source === 'local' ? 'Hi-Fi P2P Audio' : activeTrack ? 'YouTube Sync' : 'Music Lounge'}</span>
          </div>

          <div className="flex items-center gap-2">
            {audioBlocked && (
              <button
                type="button"
                onClick={togglePlay}
                className="rounded-full bg-white px-3.5 py-1 text-[11px] font-semibold text-black shadow animate-bounce cursor-pointer"
              >
                Enable Sound
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] px-2.5 py-1.5 text-[11px] font-medium text-white/75 transition cursor-pointer"
            >
              {drawerOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              <span className="hidden sm:inline">{drawerOpen ? 'Hide Queue' : `Queue (${musicQueue.length})`}</span>
            </button>
          </div>
        </div>

        {/* Center Vinyl-Sleeve Poster Showcase */}
        <div className="my-2 flex flex-1 min-h-0 flex-col items-center justify-center">
          <div className="relative flex items-center justify-center pr-8 sm:pr-12">
            {/* Soft breathing glow */}
            <div
              ref={pulseAuraRef}
              aria-hidden
              className="pointer-events-none absolute -inset-4 rounded-3xl bg-white/[0.06] blur-2xl transition-transform duration-75"
            />

            {/* Peeking Vinyl Disc sliding out smoothly when playing */}
            <motion.div
              animate={{ x: isPlaying ? 46 : 24 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="relative z-0 flex h-32 w-32 sm:h-44 sm:w-44 xl:h-48 xl:w-48 items-center justify-center rounded-full bg-zinc-950 shadow-2xl ring-1 ring-white/15"
              style={{
                backgroundImage:
                  'conic-gradient(from 0deg, rgba(255,255,255,0.08), transparent 22%, rgba(255,255,255,0.06) 50%, transparent 72%, rgba(255,255,255,0.08)), repeating-radial-gradient(circle at center, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)',
              }}
            >
              <div
                className={`flex h-full w-full items-center justify-center rounded-full ${
                  isPlaying ? 'animate-[spin_7s_linear_infinite]' : ''
                }`}
              >
                <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center overflow-hidden rounded-full border-2 border-zinc-800 bg-zinc-900">
                  {activeTrack?.coverDataUrl ? (
                    <img src={activeTrack.coverDataUrl} alt="" className="h-full w-full object-cover opacity-85" />
                  ) : (
                    <Disc3 className="h-6 w-6 text-white/40" />
                  )}
                </div>
                <span className="absolute h-2.5 w-2.5 rounded-full bg-[#090a0f] ring-1 ring-white/40" />
              </div>
            </motion.div>

            {/* Foreground Crisp Poster Sleeve */}
            <motion.div
              key={activeTrack?.id ?? 'empty'}
              initial={{ opacity: 0.6, scale: 0.96 }}
              animate={{ opacity: 1, scale: isPlaying ? 1.02 : 1 }}
              transition={{ duration: 0.35 }}
              className="relative z-10 -ml-24 sm:-ml-32 h-36 w-36 sm:h-48 sm:w-48 xl:h-52 xl:w-52 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-md"
            >
              {activeTrack?.coverDataUrl ? (
                <img
                  src={activeTrack.coverDataUrl}
                  alt={activeTrack.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/35">
                  <Music className="h-10 w-10 sm:h-12 sm:w-12 stroke-[1.5]" />
                  <span className="text-[10px] uppercase tracking-widest text-white/30">Hi-Fi Lounge</span>
                </div>
              )}
            </motion.div>
          </div>

          {/* Track Title & Subtitle */}
          <div className="mt-4 max-w-md text-center px-2">
            <h2 className="truncate font-display text-base sm:text-xl font-semibold tracking-tight text-white">
              {activeTrack ? activeTrack.title : 'Drop a Song or Paste a Link'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-white/50">
              {activeTrack
                ? `${activeTrack.artist} · ${activeTrack.addedByName}`
                : 'Supports .mp3, .flac, .wav, .m4a & YouTube Music'}
            </p>
            {!activeTrack && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black shadow-lg transition hover:bg-white/90 active:scale-95 cursor-pointer"
                >
                  <Upload size={14} /> Choose Audio Files
                </button>
              </div>
            )}
            {activeTrack?.source === 'local' && !activeLocalUrl && (
              <div className="mt-1.5 text-[11px] font-medium text-white/60">
                {activeProgress !== undefined && activeProgress > 0 && activeProgress < 100
                  ? `Receiving lossless audio… ${activeProgress}%`
                  : 'Syncing track from host…'}
              </div>
            )}
            {audioBlocked && (
              <div className="mt-2.5 flex justify-center">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black shadow-lg animate-pulse hover:bg-white/90 cursor-pointer"
                >
                  <Volume2 size={14} /> Tap to Enable Sound
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Clean Frosted Player Dock */}
        <div className="mx-auto w-full max-w-xl shrink-0 space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
          <canvas ref={canvasRef} width={520} height={40} className="h-8 sm:h-10 w-full" />

          <div className="flex items-center gap-2.5">
            <span className="min-w-[36px] text-[11px] tabular-nums text-white/55">{formatTime(currentTime)}</span>
            <div className="flex-1">
              <Slider
                value={duration > 0 ? currentTime / duration : 0}
                onChange={(pct) => seekTo(pct * duration)}
                label="Seek track"
                tone="coral"
              />
            </div>
            <span className="min-w-[36px] text-right text-[11px] tabular-nums text-white/40">{formatTime(duration)}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white cursor-pointer"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted || streamVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <div className="w-16 sm:w-20">
                <Slider
                  value={muted ? 0 : streamVolume}
                  onChange={(v) => {
                    setMuted(false);
                    useRoom.getState().setAudio({ streamVolume: v });
                  }}
                  label="Music volume"
                  tone="coral"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => isController && controller.stepMusicTrack(-1)}
                disabled={!isController || musicQueue.length === 0}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white/70 hover:bg-white/[0.08] hover:text-white disabled:opacity-35 cursor-pointer"
                title="Previous"
              >
                <SkipBack size={16} />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={() => isController && controller.stepMusicTrack(1)}
                disabled={!isController || musicQueue.length === 0}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white/70 hover:bg-white/[0.08] hover:text-white disabled:opacity-35 cursor-pointer"
                title="Next"
              >
                <SkipForward size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/[0.12] cursor-pointer"
            >
              <Upload size={13} />
              <span>Add Audio</span>
            </button>
          </div>
        </div>
      </div>

      {/* Minimal Collapsible Queue / Lyrics Drawer */}
      {drawerOpen && (
        <div className="relative z-10 flex w-full max-h-[40%] lg:max-h-none lg:w-80 shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-black/35 backdrop-blur-xl">
          <div className="flex items-center gap-1 border-b border-white/[0.08] p-2">
            <button
              type="button"
              onClick={() => setRightTab('queue')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium transition cursor-pointer ${
                rightTab === 'queue' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'
              }`}
            >
              <ListMusic size={14} /> Queue ({musicQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setRightTab('lyrics')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium transition cursor-pointer ${
                rightTab === 'lyrics' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'
              }`}
            >
              <Mic2 size={14} /> Lyrics
            </button>
          </div>

          {rightTab === 'queue' ? (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2.5">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!ytInput.trim()) return;
                  const ok = await controller.addYouTubeMusicTrack(ytInput);
                  if (!ok) toast.error('Paste a valid YouTube or YouTube Music URL');
                  else setYtInput('');
                }}
                className="mb-2.5 flex gap-1.5"
              >
                <input
                  value={ytInput}
                  onChange={(e) => setYtInput(e.target.value)}
                  placeholder="Paste YouTube / Lo-Fi link..."
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                />
                <button
                  type="submit"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-black hover:bg-white/90 cursor-pointer"
                  title="Add link"
                >
                  <Plus size={14} />
                </button>
              </form>

              <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                {musicQueue.length === 0 ? (
                  <div className="flex h-28 flex-col items-center justify-center text-center text-xs text-white/35">
                    <Music className="mb-1.5 h-6 w-6 opacity-40" />
                    No tracks yet. Drop audio files or paste a link.
                  </div>
                ) : (
                  musicQueue.map((item) => {
                    const isActive = item.id === activeTrack?.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => isController && void controller.playMusicTrack(item.id)}
                        className={`group flex items-center gap-2.5 rounded-xl p-2 transition ${
                          isActive ? 'bg-white/[0.11] ring-1 ring-white/20' : 'bg-white/[0.03] hover:bg-white/[0.07]'
                        } ${isController ? 'cursor-pointer' : ''}`}
                      >
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white/[0.06]">
                          {item.coverDataUrl ? (
                            <img src={item.coverDataUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-white/35">
                              <Disc3 size={15} />
                            </div>
                          )}
                          {isActive && isPlaying && (
                            <div className="absolute inset-0 flex items-end justify-center gap-0.5 bg-black/50 pb-1">
                              <span className="h-2.5 w-0.5 animate-pulse rounded bg-white" />
                              <span className="h-3.5 w-0.5 animate-bounce rounded bg-white" />
                              <span className="h-2 w-0.5 animate-pulse rounded bg-white" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-white">{item.title}</div>
                          <div className="truncate text-[10px] text-white/45">
                            {item.artist} · {item.source === 'local' ? 'Hi-Fi' : 'YT'}
                          </div>
                        </div>
                        {isController && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              controller.removeMusicTrack(item.id);
                            }}
                            className="rounded-lg p-1 text-white/30 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] text-white/45">Synced .lrc Lyrics</span>
                {activeTrack && (
                  <button
                    type="button"
                    onClick={() => lrcInputRef.current?.click()}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/85 hover:bg-white/[0.12] cursor-pointer"
                  >
                    Load .lrc
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1 text-center">
                {parsedLyrics.length === 0 ? (
                  <div className="flex h-28 flex-col items-center justify-center text-xs text-white/35">
                    Drop or load a .lrc file for synced lyrics.
                  </div>
                ) : (
                  parsedLyrics.map((line, i) => (
                    <p
                      key={`${line.time}-${i}`}
                      onClick={() => seekTo(line.time)}
                      className={`cursor-pointer rounded-lg px-2 py-1 text-xs transition ${
                        i === activeLyricIdx
                          ? 'scale-105 bg-white/[0.08] font-semibold text-white'
                          : i < activeLyricIdx
                            ? 'text-white/30'
                            : 'text-white/55 hover:text-white/90'
                      }`}
                    >
                      {line.text}
                    </p>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
