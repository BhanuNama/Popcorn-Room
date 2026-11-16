import { useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  Hand,
  Monitor,
  MoreVertical,
  Wifi,
  WifiOff,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { controller } from '@/room/controller';
import { useRoom, type PersonVM, type Quality } from '@/store/room';
import { Avatar, Slider } from './ui';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export function PeopleTab() {
  const people = useRoom((s) => s.people);
  const me = useRoom((s) => s.me);
  const knocks = useRoom((s) => s.knocks);
  const perPerson = useRoom((s) => s.perPerson);
  const localMuted = useRoom((s) => s.localMuted);

  const isHost = me?.role === 'host';
  const isCoHost = me?.role === 'cohost';
  const canAdmin = isHost || isCoHost;

  const setPersonVolume = (identity: string, vol: number) => {
    useRoom.setState((s) => ({
      perPerson: { ...s.perPerson, [identity]: vol },
    }));
  };

  const togglePersonMute = (identity: string) => {
    useRoom.setState((s) => ({
      localMuted: { ...s.localMuted, [identity]: !s.localMuted[identity] },
    }));
  };

  const handleMuteEverywhere = async (identity: string) => {
    try {
      await api.muteParticipant(controller.roomId, identity, controller.hostAuth());
      toast.success('Participant muted for everyone');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleRoleChange = async (identity: string, newRole: 'cohost' | 'viewer') => {
    try {
      await api.updateParticipant(
        controller.roomId,
        identity,
        { role: newRole },
        controller.hostAuth(),
      );
      toast.success(`Updated role to ${newRole}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handlePresenterChange = async (identity: string, presenter: boolean) => {
    try {
      await api.updateParticipant(
        controller.roomId,
        identity,
        { presenter },
        controller.hostAuth(),
      );
      toast.success(presenter ? 'Granted presenter permissions' : 'Revoked presenter permissions');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleRemove = async (identity: string, ban: boolean) => {
    try {
      await api.removeParticipant(controller.roomId, identity, ban, controller.hostAuth());
      toast.success(ban ? 'Banned from room' : 'Removed from room');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 space-y-5 scroll-thin">
      {/* Pending Knocks Section (if any and user is host/cohost) */}
      {canAdmin && knocks.length > 0 && (
        <div className="rounded-2xl bg-coral-500/10 p-3.5 ring-1 ring-coral-500/20">
          <div className="flex items-center justify-between text-xs font-semibold text-coral-300">
            <span>Knocking to Enter ({knocks.length})</span>
          </div>
          <div className="mt-2.5 space-y-2">
            {knocks.map((k) => (
              <div
                key={k.requestId}
                className="flex items-center justify-between rounded-xl bg-ink-950/60 p-2.5 text-xs text-white"
              >
                <span className="font-semibold">{k.name}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => controller.decideKnock(k.requestId, true)}
                    className="flex h-7 items-center gap-1 rounded-lg bg-emerald-500 px-2.5 font-semibold text-white transition hover:bg-emerald-600"
                  >
                    <Check size={13} /> Admit
                  </button>
                  <button
                    onClick={() => controller.decideKnock(k.requestId, false)}
                    className="flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-white/70 transition hover:bg-white/20"
                  >
                    <X size={13} /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* People List */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
          <span>In the Room ({people.length})</span>
        </div>

        <div className="space-y-2.5">
          {people.map((p) => {
            const isLocal = p.isLocal;
            const vol = perPerson[p.identity] ?? 1;
            const isMutedLocally = localMuted[p.identity];

            return (
              <div
                key={p.identity}
                className="group flex flex-col rounded-2xl bg-white/5 p-3 ring-1 ring-white/5 transition hover:bg-white/[0.07]"
              >
                {/* Person Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={p.name}
                      hue={p.hue}
                      size={34}
                      speaking={p.speaking}
                    />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                        <span>{p.name}</span>
                        {isLocal && <span className="text-xs text-white/40 font-normal">(You)</span>}
                        {p.role === 'host' && (
                          <span className="rounded bg-coral-500/20 px-1.5 py-0.2 text-[10px] font-bold text-coral-300 ring-1 ring-coral-500/30">
                            Host
                          </span>
                        )}
                        {p.role === 'cohost' && (
                          <span className="rounded bg-peri-500/20 px-1.5 py-0.2 text-[10px] font-bold text-peri-300 ring-1 ring-peri-500/30">
                            Co-Host
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-white/50">
                        <QualityBadge quality={p.quality} />
                        {p.presenter && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Monitor size={10} /> Presenter
                          </span>
                        )}
                        {p.hand && (
                          <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            <Hand size={11} className="fill-current" /> Hand Raised
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Status / Mute indicator */}
                  <div className="flex items-center gap-1.5">
                    {p.micOn ? (
                      <span className="grid h-7 w-7 place-items-center text-emerald-400" title="Microphone Active">
                        <Mic size={15} />
                      </span>
                    ) : (
                      <span className="grid h-7 w-7 place-items-center text-white/30" title="Microphone Muted">
                        <MicOff size={15} />
                      </span>
                    )}

                    {/* Admin Dropdown Actions for non-local participants */}
                    {canAdmin && !isLocal && (
                      <AdminMenu
                        person={p}
                        isHost={isHost}
                        onRoleChange={(r) => handleRoleChange(p.identity, r)}
                        onPresenterChange={(pr) => handlePresenterChange(p.identity, pr)}
                        onMute={() => handleMuteEverywhere(p.identity)}
                        onRemove={(ban) => handleRemove(p.identity, ban)}
                      />
                    )}
                  </div>
                </div>

                {/* Per-Person Local Volume Slider (for other participants only) */}
                {!isLocal && (
                  <div className="mt-3 flex items-center gap-2.5 pt-2 border-t border-white/5">
                    <button
                      onClick={() => togglePersonMute(p.identity)}
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-lg text-white/50 transition hover:text-white',
                        isMutedLocally && 'text-red-400',
                      )}
                      title={isMutedLocally ? 'Unmute for me' : 'Mute for me'}
                    >
                      {isMutedLocally ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <div className="flex-1">
                      <Slider
                        value={isMutedLocally ? 0 : vol}
                        onChange={(v) => {
                          if (isMutedLocally) togglePersonMute(p.identity);
                          setPersonVolume(p.identity, v);
                        }}
                        label={`Volume for ${p.name}`}
                        tone="peri"
                      />
                    </div>
                    <span className="text-[10px] text-white/40 w-7 text-right">
                      {isMutedLocally ? '0%' : `${Math.round(vol * 100)}%`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QualityBadge({ quality }: { quality: Quality }) {
  if (quality === 'excellent' || quality === 'good') {
    return (
      <span className="flex items-center gap-1 text-emerald-400">
        <Wifi size={10} /> Good
      </span>
    );
  }
  if (quality === 'poor') {
    return (
      <span className="flex items-center gap-1 text-amber-400">
        <Wifi size={10} /> Fair
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-400">
      <WifiOff size={10} /> Poor
    </span>
  );
}

function AdminMenu({
  person,
  isHost,
  onRoleChange,
  onPresenterChange,
  onMute,
  onRemove,
}: {
  person: PersonVM;
  isHost: boolean;
  onRoleChange: (r: 'cohost' | 'viewer') => void;
  onPresenterChange: (p: boolean) => void;
  onMute: () => void;
  onRemove: (ban: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="grid h-7 w-7 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
        title="Admin Options"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-40 w-48 rounded-2xl bg-ink-900 p-1.5 shadow-float ring-1 ring-white/10 text-xs text-white">
            {/* Host only: role change */}
            {isHost && (
              <>
                {person.role !== 'cohost' ? (
                  <button
                    onClick={() => {
                      onRoleChange('cohost');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-white/10 text-left"
                  >
                    <Shield size={14} className="text-peri-400" /> Make Co-Host
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onRoleChange('viewer');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-white/10 text-left"
                  >
                    <UserCheck size={14} className="text-white/60" /> Demote to Viewer
                  </button>
                )}
              </>
            )}

            {/* Presenter toggle */}
            <button
              onClick={() => {
                onPresenterChange(!person.presenter);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-white/10 text-left"
            >
              <Monitor size={14} className="text-emerald-400" />
              {person.presenter ? 'Revoke Presenter' : 'Allow Presenting'}
            </button>

            {/* Mute mic for everyone */}
            {person.micOn && (
              <button
                onClick={() => {
                  onMute();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-white/10 text-left"
              >
                <MicOff size={14} className="text-amber-400" /> Mute Microphone
              </button>
            )}

            <div className="my-1 border-t border-white/5" />

            {/* Remove / Kick */}
            <button
              onClick={() => {
                onRemove(false);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-red-400 hover:bg-red-500/10 text-left"
            >
              <UserX size={14} /> Remove from Room
            </button>

            {/* Ban */}
            <button
              onClick={() => {
                onRemove(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-red-400 hover:bg-red-500/10 text-left"
            >
              <ShieldAlert size={14} /> Ban Participant
            </button>
          </div>
        </>
      )}
    </div>
  );
}
