import { useEffect, useState, useRef, type FormEvent } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  Volume2,
  RefreshCw,
  Home,
  Minimize2,
  Users,
  Upload,
  Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { session } from '@/lib/session';
import { controller } from '@/room/controller';
import { isAudioDropCandidate } from '@/room/p2pAudio';
import { useRoom } from '@/store/room';
import { TopBar } from '@/components/TopBar';
import { ScreenStage } from '@/components/ScreenStage';
import { YouTubeStage } from '@/components/YouTubeStage';
import { LocalStage } from '@/components/LocalStage';
import { MusicStage } from '@/components/MusicStage';
import { CameraStrip } from '@/components/CameraStrip';
import { RightPanel } from '@/components/RightPanel';
import { ControlBar } from '@/components/ControlBar';
import { FullscreenHud } from '@/components/FullscreenHud';
import { ChatToastOverlay } from '@/components/ChatToastOverlay';
import { ReactionsOverlay } from '@/components/ReactionsOverlay';
import { RoomDialogs } from '@/components/RoomDialogs';
import { Button, Input, softSpring } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { cn, isTypingTarget } from '@/lib/utils';
import { initFullscreenListener, toggleRoomFullscreen } from '@/lib/fullscreen';
import { createSubtitleTrack } from '@/lib/subtitles';
import type { PublicRoomInfo } from '@popcorn/shared';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const roomContainerRef = useRef<HTMLDivElement>(null);

  const connection = useRoom((s) => s.connection);
  const disconnectReason = useRoom((s) => s.disconnectReason);
  const storeRoomInfo = useRoom((s) => s.roomInfo);
  const me = useRoom((s) => s.me);
  const mode = useRoom((s) => s.mode);
  const theatre = useRoom((s) => s.ui.theatre);
  const fullscreen = useRoom((s) => s.ui.fullscreen);
  const cameraLayout = useRoom((s) => s.ui.cameraLayout);
  const theme = useRoom((s) => s.ui.theme);
  const ambient = useRoom((s) => s.ambient);
  const ambilight = useRoom((s) => s.ui.ambilight);
  const people = useRoom((s) => s.people);
  const needsAudioUnlock = useRoom((s) => s.warnings.needsAudioUnlock);

  // Sync theme with document and body elements
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Global drag-and-drop for local movie & subtitle files
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const onGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setGlobalDragging(true);
    }
  };

  const onGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setGlobalDragging(false);
    }
  };

  const onGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onGlobalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setGlobalDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter(isAudioDropCandidate);
    const lrc = files.find((f) => f.name.toLowerCase().endsWith('.lrc'));
    const video = files.find(
      (f) => f.type.startsWith('video/') || /\.(mp4|m4v|mkv|webm|mov|avi|ts|flv|wmv)$/i.test(f.name),
    );
    const sub = files.find((f) => /\.(srt|vtt)$/i.test(f.name));

    if (audioFiles.length > 0) {
      void controller.addLocalMusicFiles(audioFiles);
      toast.success(
        audioFiles.length === 1
          ? `Added "${audioFiles[0].name}" to Music Lounge`
          : `Added ${audioFiles.length} tracks to Music Lounge`,
      );
    }

    if (lrc) {
      const activeId = useRoom.getState().musicActiveId;
      if (activeId) {
        void lrc.text().then((txt) => {
          controller.setMusicLrc(activeId, txt);
          toast.success(`Lyrics "${lrc.name}" attached`);
        });
      }
    }

    if (video) {
      const url = URL.createObjectURL(video);
      useRoom.getState().setLocalMovie({
        file: video,
        url,
        fileName: video.name,
        fileSize: video.size,
      });
      controller.loadLocalMovie(video.name, video.size);
      toast.success(`Playing "${video.name}" in 4K Sync`);
    }

    if (sub) {
      void createSubtitleTrack(sub, 0).then(({ url, rawVtt, name }) => {
        useRoom.getState().setLocalMovie({
          subtitles: {
            name,
            url,
            rawVtt,
            offsetSec: 0,
            fontSize: 'md',
            enabled: true,
          },
        });
        toast.success(`Subtitles "${name}" attached`);
      });
    }
  };

  const [roomInfo, setRoomInfo] = useState<PublicRoomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Join form state
  const [name, setName] = useState(session.displayName || '');
  const [password, setPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const [knockingId, setKnockingId] = useState<string | null>(null);

  // Fullscreen event listener
  useEffect(() => {
    return initFullscreenListener();
  }, []);

  // Global Keyboard Shortcuts (Escape to exit Theatre/Fullscreen, T for Theatre, F for Fullscreen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === 'Escape') {
        const ui = useRoom.getState().ui;
        if (ui.theatre) {
          e.preventDefault();
          useRoom.getState().setUi({ theatre: false });
        } else if (document.fullscreenElement) {
          e.preventDefault();
          void document.exitFullscreen();
        } else if (ui.panelOpen) {
          e.preventDefault();
          useRoom.getState().setUi({ panelOpen: false });
        }
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        const th = useRoom.getState().ui.theatre;
        useRoom.getState().setUi({ theatre: !th, panelOpen: th });
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void toggleRoomFullscreen();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Fetch room metadata
  useEffect(() => {
    if (!roomId) return;
    let cancel = false;
    setLoading(true);
    setError(null);

    api
      .getRoom(roomId)
      .then((info) => {
        if (!cancel) {
          setRoomInfo(info);
          setLoading(false);

          // Check if auto-join requested or previous session exists
          const saved = session.get(roomId);
          if (location.state?.autoJoin && session.displayName) {
            void performJoin(roomId, session.displayName, saved.password, saved.hostKey);
          }
        }
      })
      .catch((err) => {
        if (!cancel) {
          setError((err as Error).message || 'Room not found');
          setLoading(false);
        }
      });

    return () => {
      cancel = true;
    };
  }, [roomId]);

  // Knock polling loop
  useEffect(() => {
    if (!knockingId || !roomId) return;
    let cancel = false;

    const interval = setInterval(async () => {
      try {
        const res = await api.pollKnock(roomId, knockingId);
        if (cancel) return;
        if (res.status === 'ok') {
          setKnockingId(null);
          await controller.connect(roomId, res, name);
        } else if (res.status === 'denied') {
          setKnockingId(null);
          toast.error('The host declined your knock request.');
        }
      } catch {
        // keep polling
      }
    }, 2000);

    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, [knockingId, roomId, name]);

  const performJoin = async (id: string, joinName: string, pass?: string, hostKey?: string) => {
    setJoining(true);
    try {
      const saved = session.get(id);
      const res = await api.join(id, {
        name: joinName,
        password: pass || saved.password,
        hostKey: hostKey || saved.hostKey,
        identity: saved.identity,
        identitySig: saved.identitySig,
      });

      if (res.status === 'ok') {
        session.displayName = joinName;
        session.set(id, { password: pass });
        await controller.connect(id, res, joinName, hostKey || saved.hostKey);
      } else if (res.status === 'knocking') {
        setKnockingId(res.requestId);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!roomId) return;
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    void performJoin(roomId, name.trim(), password || undefined);
  };

  // If connected, render the active Room Stage!
  if (connection === 'connected' || connection === 'reconnecting') {
    const isImmersive = theatre || fullscreen;

    return (
      <div
        id="room-stage-root"
        ref={roomContainerRef}
        data-theme={theme}
        onDragEnter={onGlobalDragEnter}
        onDragLeave={onGlobalDragLeave}
        onDragOver={onGlobalDragOver}
        onDrop={onGlobalDrop}
        className={cn(
          'relative flex h-full w-full flex-col bg-stage text-white overflow-hidden select-none',
          isImmersive && 'bg-black',
        )}
      >
        {/* Room-Wide Dynamic Wall Ambilight Backdrop */}
        {ambient && ambilight && theme !== 'oled' && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-85 transition-opacity duration-700"
          >
            <div
              className="absolute -inset-12 blur-3xl transition-all duration-500"
              style={{
                background: `
                  radial-gradient(ellipse 75% 45% at 50% 0%, ${ambient.top}, transparent 75%),
                  radial-gradient(ellipse 75% 45% at 50% 100%, ${ambient.bottom}, transparent 75%),
                  radial-gradient(ellipse 45% 75% at 0% 50%, ${ambient.left}, transparent 75%),
                  radial-gradient(ellipse 45% 75% at 100% 50%, ${ambient.right}, transparent 75%)
                `,
              }}
            />
          </div>
        )}
        {/* Global Movie File Drag-and-Drop Overlay */}
        <AnimatePresence>
          {globalDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md border-4 border-dashed border-coral-500 m-4 rounded-3xl shadow-2xl"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-coral-500/20 text-coral-400 mb-4 animate-bounce">
                <Upload size={48} />
              </div>
              <h2 className="text-3xl font-extrabold text-white">Drop Movie File (.mp4, .mkv, .webm)</h2>
              <p className="mt-2 text-sm text-coral-300 font-medium">
                Release anywhere to start synchronized 4K native playback
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Audio Unlock Prompt (autoplay policy) */}
        <AnimatePresence>
          {needsAudioUnlock && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onClick={() => controller.unlockAudio()}
              className="z-50 flex cursor-pointer items-center justify-center gap-2 bg-gradient-to-r from-coral-600 to-peri-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110"
            >
              <Volume2 size={16} />
              <span>Click anywhere or click here to enable room sound</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Reconnecting Indicator */}
        <AnimatePresence>
          {connection === 'reconnecting' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-500/95 px-4 py-1.5 text-xs font-semibold text-ink-950 shadow-float backdrop-blur"
            >
              <Loader2 size={13} className="animate-spin" />
              <span>Reconnecting to room sync…</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prominent Floating "Exit Theatre" Button */}
        {theatre && (
          <button
            onClick={() => useRoom.getState().setUi({ theatre: false })}
            className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl bg-ink-950/90 px-4 py-2 text-xs font-semibold text-white shadow-float ring-1 ring-coral-500/60 backdrop-blur-xl hover:bg-coral-500 hover:text-white transition group"
            title="Exit Theatre Mode (Esc or T)"
          >
            <Minimize2 size={15} className="text-coral-400 group-hover:text-white transition" />
            <span>Exit Theatre</span>
            <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd>
          </button>
        )}

        {/* Top Bar (Shown in Normal View) */}
        {!isImmersive && <TopBar />}

        {/* Mobile-Only Room Identity Strip (keeps TopBar uncluttered while showing whose room this is) */}
        {!isImmersive && (storeRoomInfo?.name || roomInfo?.name) && (
          <div className="relative z-20 flex sm:hidden items-center justify-between gap-2 px-3 pb-1 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-display font-semibold text-white/90 truncate">
                {storeRoomInfo?.name || roomInfo?.name}
              </span>
              {me?.role === 'host' && (
                <span className="shrink-0 rounded bg-coral-500/20 px-1.5 py-0.5 text-[9px] font-bold text-coral-300 ring-1 ring-coral-500/30">
                  Host
                </span>
              )}
            </div>
            {people.length > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {people.length} watching
              </span>
            )}
          </div>
        )}

        {/* Center Main Stage + Right Panel */}
        <main
          className={cn(
            'relative flex flex-1 overflow-hidden transition-all',
            isImmersive ? 'p-0 gap-0' : 'px-2 sm:px-3 py-1.5 gap-2.5',
          )}
        >
          {/* Main Content Area: Video Stage + People Strip (Mobile always stacks below video; Desktop supports Side or Bottom) */}
          <section
            aria-label="Watch party stage"
            className={cn(
              'relative flex flex-1 overflow-hidden min-w-0 transition-all',
              cameraLayout === 'side' ? 'flex-col md:flex-row' : 'flex-col',
              isImmersive
                ? 'rounded-none p-0 bg-black'
                : 'rounded-2xl sm:rounded-3xl border border-white/[0.08] bg-ink-950/35 p-1.5 sm:p-2 gap-2 backdrop-blur-xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]',
            )}
          >
            {/* The Video Stage: YouTube, Local Movie File, Music, or Screen Share */}
            <div
              className={cn(
                'relative flex-1 min-w-0 min-h-[200px] overflow-hidden rounded-xl sm:rounded-2xl flex items-center justify-center ring-1 ring-white/[0.05]',
                (!ambilight || theme === 'oled') && 'bg-black',
              )}
            >
              {mode === 'youtube' ? (
                <YouTubeStage />
              ) : mode === 'local' ? (
                <LocalStage />
              ) : mode === 'music' ? (
                <MusicStage />
              ) : (
                <ScreenStage />
              )}
              <ReactionsOverlay />

              {/* Floating Top-Left "Show People" Pill when Camera Strip is hidden in Normal View (zero stage space taken) */}
              {cameraLayout === 'hidden' && !isImmersive && people.length > 0 && (
                <button
                  onClick={() =>
                    useRoom.getState().setUi({
                      cameraLayout: window.innerWidth < 768 ? 'bottom' : 'side',
                    })
                  }
                  className="butter-btn absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-full bg-ink-950/80 hover:bg-ink-900/95 px-3 py-1.5 text-[11px] font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur-md shadow-float transition"
                  title="Show People & cameras"
                >
                  <Users size={12} className="text-coral-400" />
                  <span>Show People ({people.length})</span>
                </button>
              )}
            </div>

            {/* Member Cameras: Bottom Shelf on Mobile (or Desktop Bottom), Side Column on Desktop */}
            {cameraLayout !== 'hidden' && <CameraStrip layout={cameraLayout} />}
          </section>

          {/* Right Panel (Chat, People, Queue) - Auto-resizes stage width */}
          <RightPanel />
        </main>

        {/* Bottom Control Bar in Normal View */}
        {!isImmersive && (
          <footer className="relative z-20 px-2 sm:px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0">
            <ControlBar />
          </footer>
        )}

        {/* Floating Controls HUD in Fullscreen or Theatre Mode */}
        {isImmersive && <FullscreenHud />}

        {/* Floating Incoming Chat Notification Toasts (Visible when Chat is hidden) */}
        <ChatToastOverlay />

        {/* Dialogs */}
        <RoomDialogs />
      </div>
    );
  }

  // Pre-join / Loading / Error Screens (matched to The Orbit dark glass aesthetic)
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#060913] p-4 text-white">
      {/* Subtle orbital rings & ambient nebula glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-[38rem] rounded-full bg-coral-500/12 blur-3xl" />
        <div className="animate-orbit-slow h-[34rem] w-[34rem] rounded-full border border-white/[0.04]" />
        <div className="animate-orbit-rev absolute h-[22rem] w-[22rem] rounded-full border border-dashed border-coral-400/15" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={softSpring}
        className="glass-strong relative w-full max-w-md rounded-3xl p-7 sm:p-8 shadow-float ring-1 ring-white/10 text-white"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <Logo dark />
          <button
            onClick={() => navigate('/')}
            className="grid h-8 w-8 place-items-center rounded-xl text-white/55 hover:bg-white/10 hover:text-white transition"
            title="Home"
          >
            <Home size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/55">
            <Loader2 size={32} className="animate-spin text-coral-400 mb-3" />
            <p className="text-sm font-medium">Entering room...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white">Could not join room</h3>
              <p className="mt-1 text-xs text-white/55">{error}</p>
            </div>
            <Button variant="primary" size="md" className="w-full" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        ) : knockingId ? (
          /* Knocking State */
          <div className="py-8 text-center space-y-4">
            <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-coral-500/20 text-coral-300 ring-1 ring-coral-400/30">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white">Knocking to enter...</h3>
              <p className="mt-1 text-xs text-white/55 max-w-xs mx-auto">
                The host has been notified. You will join automatically as soon as they let you in.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setKnockingId(null)}
              className="mt-2 ring-1 ring-white/15"
            >
              Cancel
            </Button>
          </div>
        ) : disconnectReason ? (
          /* Disconnected State */
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-white">Disconnected</h3>
              <p className="mt-1 text-xs text-white/55">{disconnectReason}</p>
            </div>
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => {
                useRoom.getState().reset();
                if (roomId && name) void performJoin(roomId, name, password);
              }}
            >
              <RefreshCw size={15} /> Rejoin
            </Button>
          </div>
        ) : (
          /* Join Form */
          <form onSubmit={handleJoinSubmit} className="mt-6 space-y-4">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-500/15 px-3 py-1 text-xs font-semibold text-coral-300 ring-1 ring-coral-400/25">
                <Sparkles size={12} /> Watch Party Room
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold text-white">{roomInfo?.name}</h2>
              <p className="mt-1 text-xs text-white/50">
                Studio-clean sound · Synced playback · Live chat & reactions
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-white/75">
                  Your Display Name
                </span>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maya"
                  maxLength={32}
                  required
                />
              </label>

              {roomInfo?.hasPassword && (
                <label className="block">
                  <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-white/75">
                    <span className="flex items-center gap-1">
                      <Lock size={12} /> Room Password
                    </span>
                    <span className="text-[10px] text-coral-300 font-normal">Required</span>
                  </span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    maxLength={64}
                    required
                  />
                </label>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2 shadow-glow"
              disabled={joining || !name.trim()}
            >
              {joining ? 'Joining…' : roomInfo?.knock ? 'Knock to Enter' : 'Join Room'}
              <ArrowRight size={17} />
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
