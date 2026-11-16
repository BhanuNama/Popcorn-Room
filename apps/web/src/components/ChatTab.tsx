import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Smile,
  Image as ImageIcon,
  Reply,
  X,
  Eye,
  EyeOff,
  CheckCheck,
  Search,
} from 'lucide-react';
import { timeOfDay, cn } from '@/lib/utils';
import { controller } from '@/room/controller';
import { useRoom, type ChatMsg } from '@/store/room';
import { Avatar, Button, Input } from './ui';
import type { ChatGif, ChatReply } from '@popcorn/shared';
import { api } from '@/lib/api';

const EMOJIS = ['😂', '❤️', '🔥', '🍿', '👏', '😱', '😮', '😭', '🎉', '👀'];

export function ChatTab() {
  const chat = useRoom((s) => s.chat);
  const me = useRoom((s) => s.me);
  const playhead = useRoom((s) => s.playhead);
  const mode = useRoom((s) => s.mode);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReply | null>(null);
  const [gifSearchOpen, setGifSearchOpen] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  const listEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length]);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void controller.sendChat(text, replyTo ?? undefined);
    setText('');
    setReplyTo(null);
  };

  const handleSendGif = (gif: ChatGif) => {
    void controller.sendChat('', replyTo ?? undefined, gif);
    setGifSearchOpen(false);
    setReplyTo(null);
  };

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-thin">
        {chat.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-white/40">
            <p className="text-xs">No messages yet.</p>
            <p className="text-[11px] mt-1 text-white/30">Say hi to the room!</p>
          </div>
        )}

        {chat.map((msg) => {
          if (msg.system) {
            return (
              <div key={msg.id} className="text-center text-[11px] text-white/40 italic py-1">
                {msg.text}
              </div>
            );
          }

          const isMe = msg.from === me?.identity;

          // Spoiler check for YouTube mode: if msg.vt exists, and current playhead < msg.vt.time, hide by default
          const isSpoiler =
            mode === 'youtube' &&
            msg.vt &&
            playhead.videoId === msg.vt.videoId &&
            playhead.time < msg.vt.time - 2;
          const revealed = revealedSpoilers[msg.id];

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('flex items-start gap-2.5', isMe ? 'flex-row-reverse' : 'flex-row')}
            >
              {!isMe && <Avatar name={msg.fromName} hue={msg.hue} size={28} className="mt-0.5" />}

              <div className={cn('flex flex-col max-w-[82%]', isMe ? 'items-end' : 'items-start')}>
                {/* Name & Time */}
                <div className="flex items-center gap-1.5 px-1 mb-1 text-[11px] text-white/40">
                  <span className="font-semibold text-white/80">{msg.fromName}</span>
                  <span>•</span>
                  <span>{timeOfDay(msg.at)}</span>
                  {msg.pending && <span className="text-white/30">(sending...)</span>}
                </div>

                {/* Reply quote box if any */}
                {msg.replyTo && (
                  <div className="mb-1 rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/60 border-l-2 border-coral-500">
                    <span className="font-semibold text-white/80">{msg.replyTo.name}: </span>
                    <span className="truncate">{msg.replyTo.text}</span>
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={cn(
                    'group relative rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-white',
                    isMe
                      ? 'bg-gradient-to-r from-coral-600 to-coral-500 rounded-tr-none'
                      : 'bg-white/10 ring-1 ring-white/10 rounded-tl-none',
                  )}
                >
                  {/* Spoiler blur overlay */}
                  {isSpoiler && !revealed ? (
                    <div className="flex items-center gap-2 py-1">
                      <span className="text-xs text-amber-300 font-medium flex items-center gap-1">
                        <EyeOff size={13} /> Spoiler message
                      </span>
                      <button
                        onClick={() => toggleSpoiler(msg.id)}
                        className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-semibold hover:bg-white/30"
                      >
                        Reveal
                      </button>
                    </div>
                  ) : (
                    <>
                      {msg.text && <p className="break-words select-text">{msg.text}</p>}
                      {msg.gif && (
                        <div className="mt-1.5 overflow-hidden rounded-xl">
                          <img
                            src={msg.gif.url}
                            alt={msg.gif.title || 'GIF'}
                            className="max-h-48 w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                      {isSpoiler && revealed && (
                        <button
                          onClick={() => toggleSpoiler(msg.id)}
                          className="mt-1.5 block text-[10px] text-white/50 hover:underline"
                        >
                          Hide spoiler
                        </button>
                      )}
                    </>
                  )}

                  {/* Quick reply button on hover */}
                  <button
                    onClick={() =>
                      setReplyTo({ id: msg.id, name: msg.fromName, text: msg.text || 'GIF' })
                    }
                    className="absolute -bottom-2 right-2 hidden rounded-full bg-ink-900 p-1 text-white/60 shadow-sm ring-1 ring-white/10 hover:text-white group-hover:block"
                    title="Reply"
                  >
                    <Reply size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={listEndRef} />
      </div>

      {/* Floating Emoji Bar */}
      <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 bg-ink-950/40">
        <div className="flex items-center gap-1 overflow-x-auto scroll-thin py-0.5">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => controller.react(emoji)}
              className="grid h-7 w-7 place-items-center rounded-lg text-sm transition hover:scale-125 active:scale-95 hover:bg-white/10"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* GIF Picker modal / tray */}
      <AnimatePresence>
        {gifSearchOpen && (
          <GifPicker onSelect={handleSendGif} onClose={() => setGifSearchOpen(false)} />
        )}
      </AnimatePresence>

      {/* Reply bar if active */}
      {replyTo && (
        <div className="flex items-center justify-between border-t border-white/5 bg-white/5 px-4 py-1.5 text-xs text-white/70">
          <div className="flex items-center gap-1.5 truncate">
            <Reply size={13} className="text-coral-400" />
            <span>
              Replying to <b className="text-white">{replyTo.name}</b>: {replyTo.text}
            </span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="rounded p-0.5 text-white/50 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-ink-950/80">
        <div className="flex items-center gap-2 rounded-2xl bg-white/5 p-1.5 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-coral-500/70">
          <button
            type="button"
            onClick={() => setGifSearchOpen(!gifSearchOpen)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
            title="Search GIFs"
          >
            <ImageIcon size={18} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            className="w-full bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-500 text-white shadow-md transition hover:bg-coral-600 disabled:opacity-30"
            title="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (g: ChatGif) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<ChatGif[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const debounce = setTimeout(() => {
      api
        .gifs(query)
        .then((res) => {
          if (!cancel) setGifs(res);
        })
        .catch(() => {
          if (!cancel) setGifs([]);
        })
        .finally(() => {
          if (!cancel) setLoading(false);
        });
    }, 300);

    return () => {
      cancel = true;
      clearTimeout(debounce);
    };
  }, [query]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 260, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="flex flex-col border-t border-white/10 bg-ink-900 overflow-hidden"
    >
      <div className="flex items-center justify-between p-2.5 border-b border-white/5">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1 text-xs">
          <Search size={14} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIPHY..."
            className="w-full bg-transparent text-white outline-none placeholder:text-white/30"
            autoFocus
          />
        </div>
        <button onClick={onClose} className="ml-2 p-1 text-white/50 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 scroll-thin">
        {loading && (
          <div className="col-span-2 py-8 text-center text-xs text-white/40">Loading GIFs...</div>
        )}
        {!loading && gifs.length === 0 && (
          <div className="col-span-2 py-8 text-center text-xs text-white/40">
            {query ? 'No GIFs found' : 'GIFs powered by GIPHY'}
          </div>
        )}
        {gifs.map((g, i) => (
          <button
            key={i}
            onClick={() => onSelect(g)}
            className="overflow-hidden rounded-lg bg-white/5 hover:ring-2 hover:ring-coral-400 transition"
          >
            <img src={g.preview} alt={g.title} className="h-24 w-full object-cover" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
