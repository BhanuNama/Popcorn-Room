import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { decideDrift, expectedPosition, formatTime, msUntilStart } from '@popcorn/shared';
import { clock } from '@/lib/clock';
import { api } from '@/lib/api';
import { controller } from '@/room/controller';
import { canControl, useRoom } from '@/store/room';
import { Slider } from './ui';
import { YoutubeIcon } from './YoutubeIcon';
import { toggleRoomFullscreen } from '@/lib/fullscreen';
import { AmbientGlow } from './AmbientGlow';

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiLoading = false;
const ytReadyCallbacks: (() => void)[] = [];

function flushYtCallbacks() {
  while (ytReadyCallbacks.length) {
    ytReadyCallbacks.shift()?.();
  }
}

function loadYouTubeApi(cb: () => void) {
  if (window.YT && window.YT.Player) {
    cb();
    return;
  }
  ytReadyCallbacks.push(cb);
  if (ytApiLoading) return;
  ytApiLoading = true;

  const prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    try {
      prevReady?.();
    } catch {}
    flushYtCallbacks();
  };

  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }

  // Fallback poll in case iframe_api finished loading before hook attached
  const start = Date.now();
  const poll = setInterval(() => {
    if (window.YT && window.YT.Player) {
      clearInterval(poll);
      flushYtCallbacks();
    } else if (Date.now() - start > 15_000) {
      clearInterval(poll);
      ytApiLoading = false;
    }
  }, 150);
}

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function YouTubeStage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const driftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoplayCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = useRoom((s) => s.sync);
  const streamVolume = useRoom((s) => s.audio.streamVolume);
  const duck = useRoom((s) => s.duck);
  const smartDuck = useRoom((s) => s.audio.smartDuck);
  const peopleCount = useRoom((s) => s.people.length);
  const ytTitle = useRoom((s) => s.ytTitle);
  const isController = useRoom(canControl);
  const waitingFor = useRoom((s) => s.waitingFor);
  const countdownAt = useRoom((s) => s.countdownAt);
  const fullscreen = useRoom((s) => s.ui.fullscreen);

  // Ignore non-YouTube IDs (e.g. a leftover local .mp4 filename when switching modes)
  const ytVideoId = sync.videoId && YT_ID_RE.test(sync.videoId) ? sync.videoId : null;

  const [ready, setReady] = useState(false);
  const [localMuted, setLocalMuted] = useState(false);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [needsGesturePlay, setNeedsGesturePlay] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [countdownNum, setCountdownNum] = useState<number | null>(null);

  // Fetch video title cleanly via API client
  const fetchTitle = useCallback((videoId: string) => {
    useRoom.setState({ ytTitle: 'Loading title...' });
    api
      .oembed(videoId)
      .then((data) => {
        if (data?.title) useRoom.setState({ ytTitle: data.title });
      })
      .catch(() => {
        useRoom.setState({ ytTitle: 'YouTube Video' });
      });
  }, []);

  // Sync volume with user's stream volume slider and ducking factor
  const lastVolRef = useRef<number>(-1);
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready || typeof p.setVolume !== 'function') return;
    if (autoplayMuted) return;
    const effectiveDuck = smartDuck ? (duck < 0.95 ? 0.7 : 1) : 1;
    const vol = localMuted ? 0 : Math.round(streamVolume * effectiveDuck * 100);
    if (localMuted && typeof p.mute === 'function') {
      p.mute();
    } else if (!localMuted && typeof p.unMute === 'function') {
      p.unMute();
    }
    if (Math.abs(vol - lastVolRef.current) >= 2) {
      lastVolRef.current = vol;
      p.setVolume(vol);
    }
  }, [streamVolume, duck, smartDuck, localMuted, autoplayMuted, ready]);

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

  // Initialize / recreate YT Player cleanly whenever a valid ytVideoId arrives or changes
  useEffect(() => {
    if (!ytVideoId) {
      setReady(false);
      return;
    }

    let unmounted = false;
    setReady(false);
    setEmbedError(null);
    setAutoplayMuted(false);
    setNeedsGesturePlay(false);
    lastVolRef.current = -1;
    fetchTitle(ytVideoId);

    const initialSync = useRoom.getState().sync;
    const initialPos = Math.max(0, expectedPosition(initialSync, clock.offsetMs));

    loadYouTubeApi(() => {
      if (unmounted || !containerRef.current) return;

      containerRef.current.innerHTML = '';
      const playerDiv = document.createElement('div');
      playerDiv.style.width = '100%';
      playerDiv.style.height = '100%';
      containerRef.current.appendChild(playerDiv);

      const p = new window.YT!.Player(playerDiv, {
        height: '100%',
        width: '100%',
        videoId: ytVideoId,
        playerVars: {
          autoplay: initialSync.status === 'playing' ? 1 : 0,
          start: Math.floor(initialPos),
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: window.location.origin,
        } as YT.PlayerVars,
        events: {
          onReady: () => {
            if (unmounted) return;
            playerRef.current = p;
            setReady(true);
            setEmbedError(null);
            const stNow = useRoom.getState();
            const vol = Math.round(stNow.audio.streamVolume * 100);
            try {
              p.setVolume(vol);
              const exp = expectedPosition(stNow.sync, clock.offsetMs);
              if (exp > 1) p.seekTo(exp, true);
              if (stNow.sync.status === 'playing' && msUntilStart(stNow.sync, clock.offsetMs) <= 0) {
                p.playVideo();
              }
            } catch {}

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
            if (state === window.YT!.PlayerState.PLAYING) {
              setEmbedError(null);
              setNeedsGesturePlay(false);
              controller.setLocalBuffering(false);
            } else if (state === window.YT!.PlayerState.BUFFERING) {
              controller.setLocalBuffering(true);
            } else {
              controller.setLocalBuffering(false);
            }

            if (state === window.YT!.PlayerState.ENDED) {
              controller.onVideoEnded();
            }
          },
          onError: (e) => {
            controller.setLocalBuffering(false);
            const code = e?.data;
            if (code === 101 || code === 150) {
              setEmbedError('The video owner disabled embedded playback outside youtube.com.');
            } else if (code === 100) {
              setEmbedError('This video is private or unavailable.');
            } else if (code === 2 || code === 5) {
              setEmbedError('Could not load this YouTube video in the browser.');
            }
          },
        },
      });
    });

    return () => {
      unmounted = true;
      controller.yt = null;
      if (driftTimerRef.current) clearInterval(driftTimerRef.current);
      if (autoplayCheckRef.current) clearTimeout(autoplayCheckRef.current);
      if (gestureCheckRef.current) clearTimeout(gestureCheckRef.current);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [ytVideoId, fetchTitle]);

  // Drift correction & mobile/guest autoplay recovery loop
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !ready || !ytVideoId) return;

    const tick = () => {
      try {
        const playerTime = p.getCurrentTime() || 0;
        const playerRate = p.getPlaybackRate() || 1;
        const dur = p.getDuration() || 0;
        const st = p.getPlayerState();
        setLocalTime(playerTime);
        setDuration(dur);
        useRoom.setState({
          playhead: { time: playerTime, duration: dur, videoId: ytVideoId },
        });

        const until = msUntilStart(sync, clock.offsetMs);
        if (until > 0) {
          if (st === window.YT!.PlayerState.PLAYING) {
            p.pauseVideo();
          }
          if (Math.abs(playerTime - sync.position) > 0.5) {
            p.seekTo(sync.position, true);
          }
          return;
        }

        if (sync.status === 'paused') {
          setNeedsGesturePlay(false);
          if (st === window.YT!.PlayerState.PLAYING) {
            p.pauseVideo();
          }
          if (Math.abs(playerTime - sync.position) > 0.4) {
            p.seekTo(sync.position, true);
          }
          return;
        }

        if (sync.status === 'playing') {
          if (st !== window.YT!.PlayerState.PLAYING && st !== window.YT!.PlayerState.BUFFERING) {
            p.playVideo();

            // Check after 850ms if browser autoplay policy blocked unmuted playback
            if (!autoplayCheckRef.current) {
              autoplayCheckRef.current = setTimeout(() => {
                autoplayCheckRef.current = null;
                try {
                  const cur = p.getPlayerState();
                  if (
                    useRoom.getState().sync.status === 'playing' &&
                    cur !== window.YT!.PlayerState.PLAYING &&
                    cur !== window.YT!.PlayerState.BUFFERING
                  ) {
                    p.mute();
                    p.playVideo();
                    setAutoplayMuted(true);

                    // If even muted autoplay was blocked (strict mobile Safari/Chrome), show explicit tap button
                    if (!gestureCheckRef.current) {
                      gestureCheckRef.current = setTimeout(() => {
                        gestureCheckRef.current = null;
                        try {
                          const cur2 = p.getPlayerState();
                          if (
                            useRoom.getState().sync.status === 'playing' &&
                            cur2 !== window.YT!.PlayerState.PLAYING &&
                            cur2 !== window.YT!.PlayerState.BUFFERING
                          ) {
                            setNeedsGesturePlay(true);
                          }
                        } catch {}
                      }, 800);
                    }
                  }
                } catch {}
              }, 850);
            }
          }

          const action = decideDrift(playerTime, playerRate, sync, clock.offsetMs);
          if (action.kind === 'seek') {
            p.seekTo(action.to, true);
          } else if (action.kind === 'rate') {
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
  }, [sync, ready, ytVideoId]);

  const startAndUnmuteFromTap = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.unMute();
      const vol = Math.round(useRoom.getState().audio.streamVolume * 100) || 100;
      p.setVolume(vol);
      const exp = expectedPosition(useRoom.getState().sync, clock.offsetMs);
      if (exp > 0) p.seekTo(exp, true);
      p.playVideo();
      setLocalMuted(false);
      setAutoplayMuted(false);
      setNeedsGesturePlay(false);
    } catch {}
  }, []);

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
    setLocalTime(pos);
    controller.seek(pos);
  };

  const togglePlay = () => {
    if (autoplayMuted || needsGesturePlay) startAndUnmuteFromTap();
    if (!isController) return;
    if (sync.status === 'playing') {
      controller.pause();
    } else {
      controller.play();
    }
  };

  // Waiting state before Host loads any valid YouTube link
  if (!ytVideoId) {
    return (
      <div className="relative flex h-full min-h-[240px] w-full flex-col items-center justify-center p-6 text-center text-white">
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
          <YoutubeIcon size={28} />
        </div>
        <h3 className="font-display text-xl font-bold text-white">YouTube Sync Mode</h3>
        <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-white/55">
          {isController
            ? 'Paste any YouTube link to start playing together in real-time sync.'
            : 'Waiting for the host to pick a YouTube video…'}
        </p>
        {isController && (
          <button
            onClick={() => useRoom.getState().setUi({ youtubeDialog: true })}
            className="butter-btn mt-5 rounded-xl bg-coral-500 hover:bg-coral-600 px-5 py-2.5 text-xs font-semibold text-white shadow-glow"
          >
            Choose YouTube Video
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="group relative flex h-full min-h-[220px] w-full items-center justify-center overflow-hidden rounded-2xl p-1 sm:p-3"
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => sync.status === 'playing' && setControlsVisible(false)}
      onClick={resetControlsTimeout}
    >
      {/* Subtle cinema Ambilight backdrop synced with room theme */}
      <AmbientGlow active={Boolean(ytVideoId)} softFallback />

      {/* Container where the YouTube iframe is attached */}
      <div
        ref={containerRef}
        className="yt-frame relative z-10 h-full w-full min-h-[210px] select-none overflow-hidden rounded-xl bg-black shadow-2xl"
      />

      {/* Loading indicator before YT iframe fires onReady */}
      {!ready && !embedError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 text-white/75">
          <Loader2 size={28} className="animate-spin text-coral-400 mb-2" />
          <span className="text-xs font-medium">Loading YouTube player…</span>
        </div>
      )}

      {/* Mobile / strict browser tap-to-play gesture unlock overlay */}
      {needsGesturePlay && !embedError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm">
          <button
            onClick={(e) => {
              e.stopPropagation();
              startAndUnmuteFromTap();
            }}
            className="butter-btn flex items-center gap-2.5 rounded-2xl bg-coral-500 hover:bg-coral-600 px-6 py-3.5 text-sm font-bold text-white shadow-2xl ring-2 ring-white/20"
          >
            <Play size={18} className="fill-current" />
            Tap to Watch &amp; Unmute YouTube
          </button>
        </div>
      )}

      {/* Embed error card */}
      {embedError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-6 text-center backdrop-blur-md">
          <div className="max-w-sm space-y-3 rounded-2xl glass-strong p-5 ring-1 ring-white/15">
            <AlertCircle size={28} className="mx-auto text-amber-400" />
            <h3 className="font-display text-base font-bold text-white">YouTube Embed Restricted</h3>
            <p className="text-xs leading-relaxed text-white/70">{embedError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <a
                href={`https://www.youtube.com/watch?v=${ytVideoId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                <ExternalLink size={13} /> Open on YouTube
              </a>
              {isController && (
                <button
                  onClick={() => useRoom.getState().setUi({ youtubeDialog: true })}
                  className="rounded-xl bg-coral-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-coral-600"
                >
                  Pick Another Video
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Autoplay / Local mute prompt */}
      {(localMuted || autoplayMuted) && !needsGesturePlay && !embedError && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (autoplayMuted) startAndUnmuteFromTap();
            else setLocalMuted(false);
          }}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-coral-500 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur animate-bounce transition hover:bg-coral-600 active:scale-95"
          title="Click to restore sound"
        >
          <Volume2 size={14} /> Tap to Unmute YouTube Sound
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
            <span className="font-display text-8xl font-black text-coral-400 drop-shadow-2xl">
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
            <div className="h-2 w-2 animate-ping rounded-full bg-coral-400" />
            <span>Waiting for {waitingFor.join(', ')} to catch up...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Clean Overlay Controls */}
      <AnimatePresence>
        {(controlsVisible || sync.status !== 'playing') && !embedError && !needsGesturePlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-t from-black/85 via-transparent to-black/45 p-4 transition-all sm:p-6"
          >
            {/* Top Bar inside Video */}
            <div className="flex items-center justify-between text-white drop-shadow">
              <div className="flex items-center gap-2 truncate">
                <span className="flex items-center gap-1.5 rounded-md bg-coral-500/20 px-2 py-0.5 text-[11px] font-semibold text-coral-300 ring-1 ring-coral-500/40">
                  YouTube Sync
                </span>
                <span className="truncate text-sm font-semibold opacity-90">
                  {ytTitle || 'YouTube Mode'}
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
              <div className="flex items-center gap-3 text-xs text-white/90 tabular-nums">
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
                    className="butter-btn grid h-10 w-10 place-items-center rounded-xl bg-white text-ink-900 shadow-md disabled:opacity-50"
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
                    onClick={() => {
                      if (autoplayMuted) startAndUnmuteFromTap();
                      else setLocalMuted(!localMuted);
                    }}
                    className="butter-btn grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur hover:bg-white/20"
                    title={localMuted || autoplayMuted ? 'Unmute' : 'Mute'}
                  >
                    {localMuted || autoplayMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>

                  {isController && (
                    <button
                      onClick={() => controller.startCountdown()}
                      className="butter-btn flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
                      title="Ready check and 3-2-1 countdown"
                    >
                      <RotateCcw size={14} /> 3-2-1 Sync
                    </button>
                  )}

                  {peopleCount > 1 && (
                    <div className="hidden md:flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-2.5 py-2 text-[11px] text-amber-200 ring-1 ring-amber-500/25">
                      <AlertCircle size={13} className="shrink-0 text-amber-400" />
                      <span>Testing 2 tabs on 1 laptop? Mute one tab to prevent speaker echo</span>
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
                    className="butter-btn grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white backdrop-blur hover:bg-white/20"
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
