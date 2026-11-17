import { useState, useEffect, type FormEvent } from 'react';
import {
  Settings,
  BarChart3,
  ShieldCheck,
  Sparkles,
  Link2,
  Lock,
  Users,
  Monitor,
  Flame,
  Palette,
} from 'lucide-react';
import { YoutubeIcon } from './YoutubeIcon';
import { ROOM_THEMES } from './ThemeSelector';
import { toast } from 'sonner';
import { parseYouTubeId, parseYouTubeStart, ytThumb, formatTime } from '@popcorn/shared';
import { api } from '@/lib/api';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { Dialog, Button, Input, Switch } from './ui';
import { cn } from '@/lib/utils';

export function RoomDialogs() {
  const ui = useRoom((s) => s.ui);
  const consent = useRoom((s) => s.consent);

  return (
    <>
      <YouTubeDialog
        open={ui.youtubeDialog}
        onOpenChange={(o) => useRoom.getState().setUi({ youtubeDialog: o })}
      />
      <SettingsDialog
        open={ui.settingsDialog}
        onOpenChange={(o) => useRoom.getState().setUi({ settingsDialog: o })}
      />
      <RecapDialog
        open={ui.recapDialog}
        onOpenChange={(o) => useRoom.getState().setUi({ recapDialog: o })}
      />
      {consent && <ConsentModal consent={consent} />}
    </>
  );
}

/* ------------------------------ YouTube Dialog ------------------------------ */

function YouTubeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<{ title: string; id: string; start: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = parseYouTubeId(url);
    if (!id) {
      setPreview(null);
      return;
    }
    const start = parseYouTubeStart(url);
    let cancel = false;
    setLoading(true);

    api
      .oembed(id)
      .then((data) => {
        if (!cancel) setPreview({ title: data.title, id, start });
      })
      .catch(() => {
        if (!cancel) setPreview({ title: 'YouTube Video', id, start });
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [url]);

  const handlePlayNow = (e: FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    controller.loadVideo(preview.id, preview.start);
    onOpenChange(false);
    setUrl('');
  };

  const handleAddToQueue = () => {
    if (!preview) return;
    void controller.queueAdd(preview.id, preview.start);
    onOpenChange(false);
    setUrl('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Play YouTube Video"
      description="Everyone watches the original audio & video from YouTube, synchronized in real-time."
    >
      <form onSubmit={handlePlayNow} className="space-y-4">
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-white/70">
            YouTube Link or Video ID
          </span>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            autoFocus
          />
        </div>

        {/* Video Preview Card */}
        {preview && (
          <div className="flex gap-3 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
            <img
              src={ytThumb(preview.id)}
              alt={preview.title}
              className="h-16 w-28 rounded-xl object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h4 className="truncate text-xs font-semibold text-white">{preview.title}</h4>
              <p className="text-[11px] text-white/40 mt-1">ID: {preview.id}</p>
              {preview.start > 0 && (
                <span className="text-[10px] text-coral-400">
                  Starts at {formatTime(preview.start)}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="flex-1"
            disabled={!preview || loading}
          >
            Play Now For Everyone
          </Button>
          <Button
            type="button"
            variant="glass"
            size="md"
            onClick={handleAddToQueue}
            disabled={!preview || loading}
          >
            Add to Queue
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------ Settings Dialog ------------------------------ */

function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const roomInfo = useRoom((s) => s.roomInfo);
  const me = useRoom((s) => s.me);
  const settings = useRoom((s) => s.settings);
  const cameraLayout = useRoom((s) => s.ui.cameraLayout);
  const theme = useRoom((s) => s.ui.theme);
  const ambilight = useRoom((s) => s.ui.ambilight);

  const isHost = me?.role === 'host';

  const [anyoneCanPresent, setAnyoneCanPresent] = useState(roomInfo?.anyoneCanPresent ?? false);
  const [knock, setKnock] = useState(roomInfo?.knock ?? false);

  const handleUpdateHostSettings = async () => {
    try {
      await api.updateSettings(
        controller.roomId,
        { anyoneCanPresent, knock },
        controller.hostAuth(),
      );
      toast.success('Room settings saved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Room Settings"
      description="Configure playback permissions and layout options."
    >
      <div className="space-y-4">
        {/* Host Section */}
        {isHost && (
          <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-coral-400">
              Host Controls
            </span>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Anyone Can Present</div>
                <div className="text-[10px] text-white/40">
                  Allow viewers to share their screen without permission
                </div>
              </div>
              <Switch
                checked={anyoneCanPresent}
                onChange={(v) => {
                  setAnyoneCanPresent(v);
                  void api.updateSettings(
                    controller.roomId,
                    { anyoneCanPresent: v },
                    controller.hostAuth(),
                  );
                }}
                label="Anyone can present"
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <div>
                <div className="text-xs font-semibold text-white">Knock to Enter</div>
                <div className="text-[10px] text-white/40">Hosts must admit new guests</div>
              </div>
              <Switch
                checked={knock}
                onChange={(v) => {
                  setKnock(v);
                  void api.updateSettings(controller.roomId, { knock: v }, controller.hostAuth());
                }}
                label="Knock to enter"
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <div>
                <div className="text-xs font-semibold text-white">Open Playback Control</div>
                <div className="text-[10px] text-white/40">
                  Allow anyone in the room to play, pause and seek
                </div>
              </div>
              <Switch
                checked={settings.openControl}
                onChange={(v) => controller.updateRoomSettings({ openControl: v })}
                label="Open Control"
              />
            </div>
          </div>
        )}

        {/* Local View Settings */}
        <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <span className="text-xs font-bold uppercase tracking-wider text-peri-400">
            Camera Layout
          </span>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Camera Strip Layout</div>
              <div className="text-[10px] text-white/40">
                {cameraLayout === 'side'
                  ? 'Side column (zero video overlap)'
                  : cameraLayout === 'bottom'
                    ? 'Bottom shelf below video'
                    : 'Hidden (focus mode)'}
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-ink-950 p-1">
              <button
                onClick={() => useRoom.getState().setUi({ cameraLayout: 'side' })}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  cameraLayout === 'side' ? 'bg-coral-500 text-white' : 'text-white/40',
                )}
              >
                Side
              </button>
              <button
                onClick={() => useRoom.getState().setUi({ cameraLayout: 'bottom' })}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  cameraLayout === 'bottom' ? 'bg-coral-500 text-white' : 'text-white/40',
                )}
              >
                Bottom
              </button>
              <button
                onClick={() => useRoom.getState().setUi({ cameraLayout: 'hidden' })}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  cameraLayout === 'hidden' ? 'bg-coral-500 text-white' : 'text-white/40',
                )}
              >
                Hidden
              </button>
            </div>
          </div>
        </div>

        {/* Room Theme & Dynamic Ambilight */}
        <div className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <span className="text-xs font-bold uppercase tracking-wider text-popcorn-primary flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Room Theme & Vibes
          </span>

          <div className="grid grid-cols-2 gap-2">
            {ROOM_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (isHost) controller.setTheme(t.id);
                  else useRoom.getState().setUi({ theme: t.id });
                }}
                className={cn(
                  'flex items-center gap-2 rounded-xl border p-2 text-left transition',
                  theme === t.id
                    ? 'border-popcorn-primary bg-popcorn-primary/10 text-white'
                    : 'border-white/5 bg-white/[0.02] text-zinc-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <div className="flex -space-x-1">
                  {t.colors.map((c, i) => (
                    <div
                      key={i}
                      className="h-3 w-3 rounded-full border border-white/20"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="truncate text-xs font-semibold">{t.name}</div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3">
            <div>
              <div className="text-xs font-semibold text-white">Dynamic Wall Ambilight</div>
              <div className="text-[10px] text-white/40">
                Samples video frame edges and casts real-time cinema glow
              </div>
            </div>
            <Switch
              checked={ambilight && theme !== 'oled'}
              onChange={(v) => useRoom.getState().setUi({ ambilight: v })}
              disabled={theme === 'oled'}
              label="Dynamic Ambilight"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------ Recap Dialog ------------------------------ */

function RecapDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const reactions = useRoom((s) => s.reactions);
  const playhead = useRoom((s) => s.playhead);

  // Group reactions into 12 timeline bins
  const bins = Array.from({ length: 12 }, () => 0);
  const maxTime = Math.max(playhead.duration || 1, 60);

  reactions.forEach((r) => {
    const idx = Math.min(11, Math.floor((r.time / maxTime) * 12));
    bins[idx]++;
  });

  const maxCount = Math.max(...bins, 1);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Session Reaction Recap"
      description="Heatmap of funny, surprising and exciting moments during the party."
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between text-xs font-semibold text-white/80 mb-3">
            <span>Reaction Activity Along Timeline</span>
            <span className="text-coral-400">{reactions.length} total reactions</span>
          </div>

          {/* Heatmap Bars */}
          <div className="flex h-32 items-end gap-2 pt-4">
            {bins.map((count, i) => {
              const h = (count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <div
                    style={{ height: `${Math.max(6, h)}%` }}
                    className={cn(
                      'w-full rounded-t-lg transition-all',
                      count === maxCount && count > 0
                        ? 'bg-gradient-to-t from-coral-600 to-coral-400 shadow-glow'
                        : count > 0
                          ? 'bg-peri-500/70'
                          : 'bg-white/5',
                    )}
                  />
                  <span className="text-[9px] text-white/30">
                    {Math.round((i / 12) * (maxTime / 60))}m
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reaction Breakdown */}
        <div className="rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10">
          <span className="text-xs font-semibold text-white/70 block mb-2">Most Used Reactions</span>
          <div className="flex flex-wrap gap-2">
            {['😂', '❤️', '🔥', '🍿', '👏', '😱'].map((emoji) => {
              const count = reactions.filter((r) => r.emoji === emoji).length;
              return (
                <div
                  key={emoji}
                  className="flex items-center gap-1.5 rounded-xl bg-white/5 px-2.5 py-1 text-xs text-white"
                >
                  <span className="text-base">{emoji}</span>
                  <span className="font-semibold text-white/60">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------ Consent Dialog ------------------------------ */

function ConsentModal({
  consent,
}: {
  consent: { kind: 'mic' | 'camera' | 'screen'; resolve: (ok: boolean) => void };
}) {
  const titles = {
    mic: 'Enable Microphone',
    camera: 'Enable Camera',
    screen: 'Share Your Screen',
  };

  const descriptions = {
    mic: "Popcorn Room needs microphone access so your friends can hear you. Your voice travels as a separate track and will never distort the movie's audio.",
    camera: 'Popcorn Room needs camera access to display your live video tile beside the movie.',
    screen:
      'Popcorn Room captures your selected tab or window along with high-definition stereo audio (256 kbps transparent Opus) for the party.',
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(o) => {
        if (!o) consent.resolve(false);
      }}
      title={titles[consent.kind]}
      description={descriptions[consent.kind]}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-300 ring-1 ring-emerald-500/20">
          <ShieldCheck size={16} className="shrink-0" />
          <span>Streams and voice calls are private and never recorded or stored.</span>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => consent.resolve(true)}
          >
            Allow & Proceed
          </Button>
          <Button variant="glass" size="md" onClick={() => consent.resolve(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
