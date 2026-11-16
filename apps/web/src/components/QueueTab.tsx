import { useState, type FormEvent } from 'react';
import {
  ListVideo,
  Plus,
  ThumbsUp,
  Play,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseYouTubeId, parseYouTubeStart, ytThumb } from '@popcorn/shared';
import { controller } from '@/room/controller';
import { canControl, useRoom } from '@/store/room';
import { Button } from './ui';
import { cn } from '@/lib/utils';

export function QueueTab() {
  const queue = useRoom((s) => s.queue);
  const me = useRoom((s) => s.me);
  const isController = useRoom(canControl);
  const readyCheck = useRoom((s) => s.readyCheck);
  const people = useRoom((s) => s.people);

  const [inputUrl, setInputUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(inputUrl);
    if (!id) {
      toast.error('Invalid YouTube link or ID');
      return;
    }
    const start = parseYouTubeStart(inputUrl);
    setAdding(true);
    try {
      await controller.queueAdd(id, start);
      setInputUrl('');
    } finally {
      setAdding(false);
    }
  };

  const readyCount = people.filter((p) => p.ready).length;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 space-y-5 scroll-thin">
      {/* Ready Check Card */}
      <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-coral-400" />
            <span className="text-xs font-semibold text-white">Everyone Ready?</span>
          </div>
          <span className="text-xs text-white/50">
            {readyCount} of {people.length} ready
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {readyCheck ? (
            <>
              <button
                onClick={() => controller.setReady(!useRoom.getState().local.ready)}
                className={cn(
                  'flex-1 h-9 rounded-xl text-xs font-semibold transition',
                  useRoom.getState().local.ready
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20',
                )}
              >
                {useRoom.getState().local.ready ? '✓ You are Ready' : 'I am Ready!'}
              </button>
              {isController && (
                <button
                  onClick={() => controller.startCountdown()}
                  className="h-9 px-3 rounded-xl bg-coral-500 text-white text-xs font-semibold hover:bg-coral-600"
                  title="Start 3-2-1 Countdown"
                >
                  3-2-1 Start
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => controller.setReadyCheck(true)}
              disabled={!isController}
              className="w-full h-9 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
            >
              Start Ready Check
            </button>
          )}
        </div>
      </div>

      {/* Add to Queue Input */}
      <form onSubmit={handleAdd} className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Add Video
        </span>
        <div className="flex items-center gap-2 rounded-2xl bg-white/5 p-1.5 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-coral-500/70">
          <input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste YouTube link or ID..."
            className="w-full bg-transparent px-2.5 text-xs text-white outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={adding || !inputUrl.trim()}
            className="flex h-8 items-center gap-1 rounded-xl bg-coral-500 px-3 text-xs font-semibold text-white shadow transition hover:bg-coral-600 disabled:opacity-30"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </form>

      {/* Queue items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/40">
          <span>Up Next ({queue.length})</span>
        </div>

        {queue.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center text-white/40">
            <ListVideo size={32} className="mb-2 text-white/20" />
            <p className="text-xs">Queue is empty</p>
            <p className="text-[11px] text-white/30 mt-0.5">
              Paste a YouTube link above to queue the next video.
            </p>
          </div>
        )}

        {queue.map((item, index) => {
          const hasVoted = me ? item.votes.includes(me.identity) : false;
          const canDelete = item.addedBy === me?.identity || isController;

          return (
            <div
              key={item.id}
              className="group flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/5 transition hover:bg-white/[0.08]"
            >
              {/* Order number */}
              <span className="text-xs font-bold text-white/30 w-4 text-center">
                {index + 1}
              </span>

              {/* Thumbnail */}
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-black">
                <img
                  src={ytThumb(item.videoId)}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
                {isController && (
                  <button
                    onClick={() => controller.playFromQueue(item)}
                    className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                    title="Play now"
                  >
                    <Play size={18} className="fill-current" />
                  </button>
                )}
              </div>

              {/* Title & info */}
              <div className="flex-1 min-w-0">
                <h4 className="truncate text-xs font-semibold text-white" title={item.title}>
                  {item.title}
                </h4>
                <p className="truncate text-[11px] text-white/40 mt-0.5">
                  Added by {item.addedByName}
                </p>
              </div>

              {/* Voting and actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => controller.queueVote(item.id)}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition',
                    hasVoted
                      ? 'bg-coral-500/20 text-coral-400 ring-1 ring-coral-500/40'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
                  )}
                  title={hasVoted ? 'Remove vote' : 'Vote for this'}
                >
                  <ThumbsUp size={12} className={hasVoted ? 'fill-current' : ''} />
                  <span>{item.votes.length}</span>
                </button>

                {canDelete && (
                  <button
                    onClick={() => controller.queueRemove(item.id)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-white/30 hover:bg-white/10 hover:text-red-400 transition"
                    title="Remove from queue"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
