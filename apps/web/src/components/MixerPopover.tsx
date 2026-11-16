import { useState, useEffect } from 'react';
import { Sliders, Volume2, Users, Sparkles, Mic, AlertCircle } from 'lucide-react';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { Slider, Switch, Dialog } from './ui';
import { cn } from '@/lib/utils';

const isHeadset = (label: string) =>
  /headset|bluetooth|buds|airpods|hands-free|handsfree|bose|sony|boat|realme|oneplus|jbl/i.test(label);

export function MixerPopover() {
  const [open, setOpen] = useState(false);
  const audio = useRoom((s) => s.audio);
  const setAudio = useRoom((s) => s.setAudio);
  const isLocalSpeaking = useRoom((s) => s.people.find((p) => p.isLocal)?.speaking ?? false);
  const localAudioLevel = useRoom((s) => s.people.find((p) => p.isLocal)?.audioLevel ?? 0);
  const micOn = useRoom((s) => s.local.micOn);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        let all = await navigator.mediaDevices.enumerateDevices();
        let inputs = all.filter((d) => d.kind === 'audioinput');

        // If labels are blank, probe to unlock
        if (inputs.length > 0 && !inputs[0].label) {
          try {
            const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
            temp.getTracks().forEach((t) => t.stop());
            all = await navigator.mediaDevices.enumerateDevices();
            inputs = all.filter((d) => d.kind === 'audioinput');
          } catch {}
        }
        setDevices(inputs);

        // Auto-select laptop array mic if bluetooth headset is detected and no device chosen yet
        const currentSelected = useRoom.getState().audio.micDeviceId;
        if (!currentSelected && inputs.length > 0) {
          const internalMic = inputs.find(
            (d) =>
              /array|realtek|built-in|internal|intel|integrated|conexant|synaptics/i.test(d.label) &&
              !/headset|bluetooth|buds|airpods|hands-free|handsfree|bose|sony|boat|realme|oneplus|jbl/i.test(d.label),
          );
          if (internalMic && internalMic.deviceId) {
            useRoom.getState().setAudio({ micDeviceId: internalMic.deviceId });
          }
        }
      } catch {
        // ignore
      }
    };
    void loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices);
    };
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-2 rounded-2xl bg-white/10 px-3.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/15"
        title="Audio Mixer & Settings"
      >
        <Sliders size={15} className="text-coral-400" />
        <span className="hidden sm:inline">Mixer</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-coral-400" />
            <span>Studio Sound Mixer</span>
          </div>
        }
        description="Fine-tune movie audio, friends' voices, and microphone input."
        className="max-w-lg max-h-[85vh] p-5 sm:p-6"
      >
        <div className="space-y-4">
          {/* Stream Volume Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-white/90">
                <Volume2 size={14} className="text-coral-400" /> Stream / Movie
              </span>
              <span className="text-white/50">{Math.round(audio.streamVolume * 100)}%</span>
            </div>
            <Slider
              value={audio.streamVolume}
              onChange={(v) => setAudio({ streamVolume: v })}
              label="Stream Volume"
              tone="coral"
            />
            <span className="text-[10px] text-white/40 mt-1 block">
              Stereo 48 kHz · 256 kbps transparent Opus
            </span>
          </div>

          {/* Friends Volume Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-white/90">
                <Users size={14} className="text-peri-400" /> Friends' Voices
              </span>
              <span className="text-white/50">{Math.round(audio.friendsVolume * 100)}%</span>
            </div>
            <Slider
              value={audio.friendsVolume}
              onChange={(v) => setAudio({ friendsVolume: v })}
              label="Friends Volume"
              tone="peri"
            />
            <span className="text-[10px] text-white/40 mt-1 block">
              Separate audio track · never mixed into the stream
            </span>
          </div>

          {/* Microphone Input Selector */}
          <div className="border-t border-white/10 pt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-semibold text-white/90">
                <Mic size={14} className="text-emerald-400" /> Microphone Input
              </span>
            </div>
            <select
              value={audio.micDeviceId || ''}
              onChange={(e) => void controller.switchMicrophone(e.target.value)}
              className="w-full rounded-xl bg-ink-900/90 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-coral-400 truncate"
            >
              <option value="">Default Microphone</option>
              {devices.map((d, i) => {
                const isBt = isHeadset(d.label);
                const isInternal = /array|realtek|built-in|internal|intel|integrated/i.test(d.label);
                let label = d.label || `Microphone ${i + 1}`;
                if (isInternal) {
                  label = `🌟 ${label} (Recommended - Studio Stereo)`;
                } else if (isBt) {
                  label = `⚠️ ${label} (Bluetooth - causes Windows 8kHz phone mode)`;
                }
                return (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {label}
                  </option>
                );
              })}
            </select>

            {/* Live Voice Meter */}
            <div className="mt-2.5 rounded-xl bg-ink-950/60 p-2.5 ring-1 ring-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/60">Voice Detection Meter</span>
                <span className={cn('text-[10px] font-semibold', !micOn ? 'text-white/40' : isLocalSpeaking ? 'text-emerald-400' : 'text-amber-300')}>
                  {!micOn ? 'Mic Off' : isLocalSpeaking ? '🎙️ Transmitting Voice' : 'Listening...'}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-900 ring-1 ring-white/10">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-coral-400 to-coral-500 transition-all duration-75 ease-out rounded-full"
                  style={{ width: `${micOn ? Math.min(100, Math.round(localAudioLevel * 300)) : 0}%` }}
                />
              </div>
            </div>

            {/* Headset warning if bluetooth headset is in use */}
            {devices.some((d) => isHeadset(d.label)) && (
              <div className="mt-2.5 rounded-xl bg-amber-500/15 p-2.5 ring-1 ring-amber-500/30 text-amber-200 text-[11px] space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                  <AlertCircle size={13} className="shrink-0" /> Windows Bluetooth Notice
                </div>
                <p className="leading-snug text-white/80">
                  Windows automatically drops Bluetooth headsets into low-quality 8kHz phone-call sound when using their mic.
                </p>
                <p className="font-medium text-emerald-300">
                  ✅ <strong>Recommended:</strong> Keep <strong>Microphone Array</strong> selected above. Your friends hear your voice, and you hear full 48kHz stereo YouTube & movies in your headset!
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-3 space-y-3">
            {/* Smart Duck Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" /> Smart Duck
                </div>
                <div className="text-[10px] text-white/40">
                  Lower stream slightly while someone speaks
                </div>
              </div>
              <Switch
                checked={audio.smartDuck}
                onChange={(v) => setAudio({ smartDuck: v })}
                label="Smart Ducking"
              />
            </div>

            {/* Push-to-Talk Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Mic size={13} className="text-emerald-400" /> Push-to-Talk
                </div>
                <div className="text-[10px] text-white/40">Hold Spacebar to speak</div>
              </div>
              <Switch
                checked={audio.pushToTalk}
                onChange={(v) => setAudio({ pushToTalk: v })}
                label="Push-to-Talk"
              />
            </div>

            {/* Echo Cancellation Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Browser Echo Cancellation</div>
                <div className="text-[10px] text-white/40">
                  Off = Studio Sound (Windows won't duck movie)
                </div>
              </div>
              <Switch
                checked={audio.echoCancellation}
                onChange={(v) => setAudio({ echoCancellation: v })}
                label="Echo Cancellation"
              />
            </div>

            {/* 60 fps share toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">60 fps Screen Share</div>
                <div className="text-[10px] text-white/40">Requires higher upload (~8 Mbps)</div>
              </div>
              <Switch
                checked={audio.share60}
                onChange={(v) => setAudio({ share60: v })}
                label="60 fps Share"
              />
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
