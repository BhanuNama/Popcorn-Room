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
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { session } from '@/lib/session';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { TopBar } from '@/components/TopBar';
import { ScreenStage } from '@/components/ScreenStage';
import { YouTubeStage } from '@/components/YouTubeStage';
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
import type { PublicRoomInfo } from '@popcorn/shared';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const roomContainerRef = useRef<HTMLDivElement>(null);

  const connection = useRoom((s) => s.connection);
  const disconnectReason = useRoom((s) => s.disconnectReason);
  const mode = useRoom((s) => s.mode);
  const theatre = useRoom((s) => s.ui.theatre);
  const fullscreen = useRoom((s) => s.ui.fullscreen);
  const cameraLayout = useRoom((s) => s.ui.cameraLayout);
  const people = useRoom((s) => s.people);
  const needsAudioUnlock = useRoom((s) => s.warnings.needsAudioUnlock);

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
        className={cn(
          'relative flex h-full w-full flex-col bg-stage text-white overflow-hidden select-none',
          isImmersive && 'bg-black',
        )}
      >
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

        {/* Center Main Stage + Right Panel */}
        <main
          className={cn(
            'relative flex flex-1 overflow-hidden transition-all',
            isImmersive ? 'p-0 gap-0' : 'p-2 sm:p-2.5 gap-2.5',
          )}
        >
          {/* Main Content Area: Video Stage + Camera Shelf (Non-overlapping) */}
          <section
            aria-label="Watch party stage"
            className={cn(
              'relative flex flex-1 overflow-hidden min-w-0 transition-all',
              cameraLayout === 'bottom' ? 'flex-col' : 'flex-row',
              isImmersive ? 'rounded-none p-0 bg-black' : 'rounded-2xl sm:rounded-3xl glass p-1.5 gap-1.5',
            )}
          >
            {/* The Video Stage: YouTube or Screen Share (100% UNTOUCHED, ZERO OVERLAP) */}
            <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden rounded-xl sm:rounded-2xl bg-black flex items-center justify-center">
              {mode === 'youtube' ? <YouTubeStage /> : <ScreenStage />}
              <ReactionsOverlay />

              {/* Show Members button when hidden */}
              {cameraLayout === 'hidden' && people.length > 0 && (
                <button
                  onClick={() => useRoom.getState().setUi({ cameraLayout: 'side' })}
                  className="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-ink-950/80 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md ring-1 ring-white/10 hover:bg-ink-900 shadow-float transition"
                  title="Show member cameras"
                >
                  <Users size={13} className="text-coral-400" />
                  <span>Show Members ({people.length})</span>
                </button>
              )}
            </div>

            {/* Member Cameras: Side Column OR Bottom Shelf (never cuts or covers the video!) */}
            {cameraLayout !== 'hidden' && (
              <CameraStrip layout={cameraLayout} />
            )}
          </section>

          {/* Right Panel (Chat, People, Queue) - Auto-resizes stage width */}
          <RightPanel />
        </main>

        {/* Bottom Control Bar in Normal View */}
        {!isImmersive && (
          <footer className="px-3 pb-2 pt-0">
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

  // Pre-join / Loading / Error Screens
  return (
    <div className="relative flex min-h-full items-center justify-center bg-pastel p-4">
      <div className="pointer-events-none fixed inset-0 dot-grid opacity-60" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={softSpring}
        className="card relative w-full max-w-md p-7 sm:p-8 shadow-float ring-1 ring-ink-800/10 text-ink-800"
      >
        <div className="flex items-center justify-between border-b border-ink-800/5 pb-4">
          <Logo />
          <button
            onClick={() => navigate('/')}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 transition"
            title="Home"
          >
            <Home size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-ink-400">
            <Loader2 size={32} className="animate-spin text-coral-500 mb-3" />
            <p className="text-sm font-medium">Entering room...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-100 text-red-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Could not join room</h3>
              <p className="mt-1 text-xs text-ink-500">{error}</p>
            </div>
            <Button variant="ink" size="md" className="w-full" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        ) : knockingId ? (
          /* Knocking State */
          <div className="py-8 text-center space-y-4">
            <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-blush-100 text-coral-600">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Knocking to enter...</h3>
              <p className="mt-1 text-xs text-ink-500 max-w-xs mx-auto">
                The host has been notified. You will join automatically as soon as they let you in.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKnockingId(null)}
              className="mt-2"
            >
              Cancel
            </Button>
          </div>
        ) : disconnectReason ? (
          /* Disconnected State */
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Disconnected</h3>
              <p className="mt-1 text-xs text-ink-500">{disconnectReason}</p>
            </div>
            <Button
              variant="ink"
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blush-100 px-3 py-1 text-xs font-semibold text-coral-600">
                <Sparkles size={12} /> Watch Party Room
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold">{roomInfo?.name}</h2>
              <p className="mt-1 text-xs text-ink-400">
                Studio-clean shared sound · Synced YouTube · Chat & Reactions
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-600">
                  Your Display Name
                </span>
                <Input
                  light
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
                  <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-ink-600">
                    <span className="flex items-center gap-1">
                      <Lock size={12} /> Room Password
                    </span>
                    <span className="text-[10px] text-coral-500 font-normal">Required</span>
                  </span>
                  <Input
                    light
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
              variant="ink"
              size="lg"
              className="w-full mt-2"
              disabled={joining || !name.trim()}
            >
              {joining ? 'Connecting…' : roomInfo?.knock ? 'Knock to Enter' : 'Join Room'}
              <ArrowRight size={17} />
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
