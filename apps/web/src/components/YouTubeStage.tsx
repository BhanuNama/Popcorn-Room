import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, AlertCircle } from 'lucide-react';
import { decideDrift, expectedPosition, formatTime, msUntilStart } from '@popcorn/shared';
import { clock } from '@/lib/clock';
import { controller } from '@/room/controller';
import { canControl, useRoom } from '@/store/room';
import { Slider } from './ui';
import { toggleRoomFullscreen } from '@/lib/fullscreen';

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiLoading = false;
const ytReadyCallbacks: (() => void)[] = [];

function loadYouTubeApi(cb: () => void) {
  if (window.YT && window.YT.Player) {
    cb();
    return;
  }
  ytReadyCallbacks.push(cb);
  if (ytApiLoading) return;
  ytApiLoading = true;

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  window.onYouTubeIframeAPIReady = () => {
    while (ytReadyCallbacks.length) {
      ytReadyCallbacks.shift()?.();
    }
  };
  document.head.appendChild(tag);
}

export function YouTubeStage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const driftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sync = useRoom((s) => s.sync);
  const streamVolume = useRoom((s) => s.audio.streamVolume);
  const duck = useRoom((s) => s.duck);
  const smartDuck = useRoom((s) => s.audio.smartDuck);
  const peopleCount = useRoom((s) => s.people.length);
  const isController = useRoom(canControl);
  const waitingFor = useRoom((s) => s.waitingFor);
  const countdownAt = useRoom((s) => s.countdownAt);
  const fullscreen = useRoom((s) => s.ui.fullscreen);

  const [ready, setReady] = useState(false);
  const [localMuted, setLocalMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [countdownNum, setCountdownNum] = useState<number | null>(null);

  // Sync volume with user's stream volume slider and ducking factor
  const lastVolRef = useRef<number>(-1);
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready || typeof p.setVolume !== 'function') return;
    // Ducking only applies if smartDuck is explicitly enabled by the user in the mixer.
    // When enabled, step smoothly to 70% level to avoid hammering setVolume() 25x/sec.
    const effectiveDuck = smartDuck ? (duck < 0.95 ? 0.7 : 1) : 1;
    const vol = localMuted ? 0 : Math.round(streamVolume * effectiveDuck * 100);
    if (Math.abs(vol - lastVolRef.current) >= 2) {
      lastVolRef.current = vol;
      p.setVolume(vol);
    }
  }, [streamVolume, duck, smartDuck, localMuted, ready]);

  // Countdown timer calculation
  useEffect(() => {
    if (!countdownAt) {
      setCountdownNum(null);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = countdownAt - clock.now();
      if (remainingMs <= 0) {
        setCountdownNum(null);
        useRoom.setState({ countdownAt: null });
      } else {
        setCountdownNum(Math.ceil(remainingMs / 1000));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);
    return () => clearInterval(interval);
  }, [countdownAt]);

  // Initialize YT Player
  useEffect(() => {
    let unmounted = false;

    loadYouTubeApi(() => {
      if (unmounted || !containerRef.current || playerRef.current) return;

      const playerDiv = document.createElement('div');
      containerRef.current.appendChild(playerDiv);

      const p = new window.YT!.Player(playerDiv, {
        height: '100%',
        width: '100%',
        videoId: sync.videoId || undefined,
        playerVars: {
          autoplay: 1,
          controls: 0, // Custom controls to maintain cinematic UI and prevent unsynced manual seeks
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (unmounted) return;
            playerRef.current = p;
            setReady(true);
            const vol = Math.round(useRoom.getState().audio.streamVolume * 100);
            p.setVolume(vol);

            // Register bridge on controller so chat timestamps and session recap know playhead
            controller.yt = {
              getTime: () => {
                try {
                  return p.getCurrentTime() || 0;
                } catch {
                  return 0;
                }
              },
              getDuration: () => {
                try {
                  return p.getDuration() || 0;
                } catch {
                  return 0;
                }
              },
            };
          },
          onStateChange: (e) => {
            if (unmounted) return;
            const state = e.data;
            if (state === window.YT!.PlayerState.BUFFERING) {
              controller.setLocalBuffering(true);
            } else {
              controller.setLocalBuffering(false);
            }

            if (state === window.YT!.PlayerState.ENDED) {
              controller.onVideoEnded();
            }
          },
          onError: () => {
            controller.setLocalBuffering(false);
          },
        },
      });
    });

    return () => {
      unmounted = true;
      controller.yt = null;
      if (driftTimerRef.current) clearInterval(driftTimerRef.current);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, []);

  // React to sync state changes (video ID changed)
  const currentVideoId = useRef<string | null>(null);
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready || !sync.videoId) return;

    if (currentVideoId.current !== sync.videoId) {
      currentVideoId.current = sync.videoId;
      p.loadVideoById({
        videoId: sync.videoId,
        startSeconds: sync.position || 0,
      });
      // Fetch oembed for room display
      useRoom.setState({ ytTitle: 'Loading title...' });
      fetch(`/api/oembed?id=${sync.videoId}`)
        .then((r) => r.json())
        .then((data: { title?: string }) => {
          if (data.title) useRoom.setState({ ytTitle: data.title });
        })
        .catch(() => {
          useRoom.setState({ ytTitle: 'YouTube Video' });
        });
    }
  }, [sync.videoId, ready]);

  // Section 6: Drift correction loop every 2 seconds
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready || !sync.videoId) return;

    const tick = () => {
      try {
        const playerTime = p.getCurrentTime() || 0;
        const playerRate = p.getPlaybackRate() || 1;
        const dur = p.getDuration() || 0;
        setLocalTime(playerTime);
        setDuration(dur);
        useRoom.setState({
          playhead: { time: playerTime, duration: dur, videoId: sync.videoId },
        });

        const until = msUntilStart(sync, clock.offsetMs);
        if (until > 0) {
          // Scheduled countdown in progress; pause or seek to start
          if (p.getPlayerState() === window.YT!.PlayerState.PLAYING) {
            p.pauseVideo();
          }
          if (Math.abs(playerTime - sync.position) > 0.5) {
            p.seekTo(sync.position, true);
          }
          return;
        }

        if (sync.status === 'paused') {
          if (p.getPlayerState() === window.YT!.PlayerState.PLAYING) {
            p.pauseVideo();
          }
          if (Math.abs(playerTime - sync.position) > 0.4) {
            p.seekTo(sync.position, true);
          }
          return;
        }

        if (sync.status === 'playing') {
          if (p.getPlayerState() !== window.YT!.PlayerState.PLAYING) {
            p.playVideo();
          }

          // Decide drift based on NTP clock offset
          const action = decideDrift(playerTime, playerRate, sync, clock.offsetMs);
          if (action.kind === 'seek') {
            p.seekTo(action.to, true);
          } else if (action.kind === 'rate') {
            // NOTE: YouTube iframe API audio engine distorts when setPlaybackRate() is called with arbitrary
            // fractional rates like 0.96/1.04. For video watching, if drift is moderate (> 1.8s), seek to target.
            // If drift is minor (< 1.8s), keep standard 1.0x rate so audio stays 100% studio-clean without warbling.
            if (Math.abs(action.drift) > 1.8) {
              p.seekTo(expectedPosition(sync, clock.offsetMs), true);
            }
            if (playerRate !== 1) {
              p.setPlaybackRate(1);
            }
          } else if (action.kind === 'restoreRate') {
            if (playerRate !== 1) {
              p.setPlaybackRate(1);
            }
          }
        }
      } catch {
        // Player might be re-buffering or unready
      }
    };

    tick();
    driftTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (driftTimerRef.current) clearInterval(driftTimerRef.current);
    };
  }, [sync, ready]);

  // Handle controls hover auto-fade
  const resetControlsTimeout = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      if (sync.status === 'playing') {
        setControlsVisible(false);
      }
    }, 3000);
  }, [sync.status]);

  const handleSeek = (pos: number) => {
    if (!isController) return;
    controller.seek(pos);
  };

  const togglePlay = () => {
    if (!isController) return;
    if (sync.status === 'playing') {
      controller.pause();
    } else {
      controller.play();
    }
  };

  return (
    <div
      className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => sync.status === 'playing' && setControlsVisible(false)}
      onClick={resetControlsTimeout}
    >
      {/* Container where the YouTube iframe is attached */}
      <div
        ref={containerRef}
        className="yt-frame pointer-events-none h-full w-full select-none"
      />

      {/* Floating local mute reminder */}
      {localMuted && (
        <button
          onClick={() => setLocalMuted(false)}
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-red-500 hover:scale-105 active:scale-95"
          title="Click to restore sound"
        >
          <VolumeX size={14} /> Muted locally (Click to unmute)
        </button>
      )}

      {/* Countdown 3-2-1 Overlay */}
      <AnimatePresence>
        {countdownNum !== null && countdownNum > 0 && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            key={countdownNum}
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <span className="font-display text-8xl font-black text-coral-500 drop-shadow-2xl">
              {countdownNum}
            </span>
            <span className="mt-4 text-base font-semibold text-white/90">
              Starting together...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting for participant buffer overlay */}
      <AnimatePresence>
        {waitingFor.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pointer-events-none absolute top-6 z-30 flex items-center gap-2.5 rounded-full bg-ink-950/85 px-4 py-2 text-xs font-medium text-white shadow-float ring-1 ring-white/10 backdrop-blur-md"
          >
            <div className="h-2 w-2 animate-ping rounded-full bg-coral-500" />
            <span>Waiting for {waitingFor.join(', ')} to catch up...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Clean Overlay Controls */}
      <AnimatePresence>
        {(controlsVisible || sync.status !== 'playing') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-t from-black/80 via-transparent to-black/40 p-4 transition-all sm:p-6"
          >
            {/* Top Bar inside Video */}
            <div className="flex items-center justify-between text-white drop-shadow">
              <div className="flex items-center gap-2 truncate">
                <span className="flex items-center gap-1.5 rounded-md bg-coral-500/20 px-2 py-0.5 text-[11px] font-semibold text-coral-300 ring-1 ring-coral-500/40">
                  YouTube Sync
                </span>
                <span className="truncate text-sm font-semibold opacity-90">
                  {useRoom.getState().ytTitle || 'YouTube Mode'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {sync.rate !== 1 && (
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80">
                    {sync.rate}x
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="space-y-3">
              {/* Progress Slider */}
              <div className="flex items-center gap-3 text-xs text-white/90">
                <span>{formatTime(localTime)}</span>
                <div className="flex-1">
                  <Slider
                    value={duration > 0 ? localTime / duration : 0}
                    onChange={(v) => handleSeek(v * duration)}
                    label="Seek video"
                    tone="coral"
                  />
                </div>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    disabled={!isController}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white text-ink-900 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                    title={
                      !isController
                        ? 'Host controls playback'
                        : sync.status === 'playing'
                          ? 'Pause'
                          : 'Play'
                    }
                  >
                    {sync.status === 'playing' ? (
                      <Pause size={18} className="fill-current" />
                    ) : (
                      <Play size={18} className="ml-0.5 fill-current" />
                    )}
                  </button>

                  <button
                    onClick={() => setLocalMuted(!localMuted)}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
                    title={localMuted ? 'Unmute' : 'Mute'}
                  >
                    {localMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>

                  {isController && (
                    <button
                      onClick={() => controller.startCountdown()}
                      className="flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/20"
                      title="Ready check and 3-2-1 countdown"
                    >
                      <RotateCcw size={14} /> 3-2-1 Sync
                    </button>
                  )}

                  {peopleCount > 1 && (
                    <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-2.5 py-2 text-[11px] text-amber-200 ring-1 ring-amber-500/30">
                      <AlertCircle size={13} className="shrink-0 text-amber-400" />
                      <span>Testing on 1 laptop? Mute one tab to prevent speaker echo</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!isController && (
                    <div className="flex items-center gap-1.5 text-xs text-white/60 mr-1">
                      <AlertCircle size={14} />
                      <span className="hidden sm:inline">Host controls playback</span>
                    </div>
                  )}

                  <button
                    onClick={() => toggleRoomFullscreen()}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
                    title={fullscreen ? 'Exit Fullscreen (Esc / F)' : 'Fullscreen (F)'}
                  >
                    {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
