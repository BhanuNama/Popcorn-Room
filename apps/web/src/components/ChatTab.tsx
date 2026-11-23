import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Smile,
  Image as ImageIcon,
  Reply,
  X,
  EyeOff,
  Search,
  Copy,
  Check,
  ArrowDown,
  Clock,
} from 'lucide-react';
import { formatTime } from '@popcorn/shared';
import { timeOfDay, cn } from '@/lib/utils';
import { controller } from '@/room/controller';
import { useRoom } from '@/store/room';
import { Avatar } from './ui';
import type { ChatGif, ChatReply } from '@popcorn/shared';
import { api } from '@/lib/api';

const QUICK_REACTIONS = ['😂', '🔥', '🍿', '👏', '😱', '😮', '😭', '🎉', '👀', '💯'];
const TEXT_EMOJIS = [
  '😂', '🥹', '😭', '😍', '🤯', '😱', '🔥', '🍿', '🎬', '🎧',
  '👏', '🙌', '👀', '💯', '✨', '🚀', '😎', '🤝', '🫶', '🫡',
  '😴', '🤔', '🤣', '😅',
];
const GIF_TAGS = ['Trending', 'Popcorn', 'Laugh', 'Shocked', 'Clap', 'Love', 'Dance'];

export function ChatTab() {
  const chat = useRoom((s) => s.chat);
  const me = useRoom((s) => s.me);
  const playhead = useRoom((s) => s.playhead);
  const mode = useRoom((s) => s.mode);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReply | null>(null);
  const [gifSearchOpen, setGifSearchOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto scroll to bottom when near bottom or new message from me arrives
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const last = chat[chat.length - 1];
    if (distanceFromBottom < 140 || last?.from === me?.identity) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollBottom(false);
    } else if (chat.length > 0) {
      setShowScrollBottom(true);
    }
  }, [chat, me?.identity]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distance > 120);
  };

  const scrollToBottom = () => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void controller.sendChat(text, replyTo ?? undefined);
    setText('');
    setReplyTo(null);
    setEmojiPickerOpen(false);
  };

  const handleSendGif = (gif: ChatGif) => {
    void controller.sendChat('', replyTo ?? undefined, gif);
    setGifSearchOpen(false);
    setReplyTo(null);
  };

  const insertEmoji = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`);
    inputRef.current?.focus();
  };

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyText = (id: string, body: string) => {
    void navigator.clipboard?.writeText(body).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    });
  };

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden">
      {/* Messages list */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3.5 py-3 space-y-1.5 scroll-thin"
      >
        {chat.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-white/45 px-4">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10 text-xl">
              🍿
            </div>
            <p className="text-xs font-semibold text-white/75">Room chat is ready</p>
            <p className="text-[11px] mt-1 text-white/40 max-w-[200px]">
              Drop a message, GIF, or live reaction — spoiler protection stays active automatically.
            </p>
          </div>
        )}

        {chat.map((msg, idx) => {
          if (msg.system) {
            return (
              <div key={msg.id} className="text-center text-[11px] text-white/40 italic py-1.5">
                {msg.text}
              </div>
            );
          }

          const isMe = msg.from === me?.identity;
          const prev = idx > 0 ? chat[idx - 1] : null;
          const grouped =
            !!prev &&
            !prev.system &&
            prev.from === msg.from &&
            msg.at - prev.at < 120_000;

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
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className={cn(
                'flex items-start gap-2',
                isMe ? 'flex-row-reverse' : 'flex-row',
                grouped ? 'mt-0.5' : 'mt-3',
              )}
            >
              {!isMe && (
                <div className="w-7 shrink-0">
                  {!grouped && <Avatar name={msg.fromName} hue={msg.hue} size={28} className="mt-0.5" />}
                </div>
              )}

              <div className={cn('flex flex-col max-w-[84%]', isMe ? 'items-end' : 'items-start')}>
                {/* Name & Time */}
                {!grouped && (
                  <div className="flex items-center gap-1.5 px-1 mb-1 text-[11px] text-white/45">
                    <span className="font-semibold text-white/85">{isMe ? 'You' : msg.fromName}</span>
                    <span>·</span>
                    <span className="tabular-nums">{timeOfDay(msg.at)}</span>
                    {msg.vt && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-white/8 px-1.5 py-0.2 text-[9px] font-medium text-white/60 tabular-nums">
                        <Clock size={9} /> {formatTime(msg.vt.time)}
                      </span>
                    )}
                    {msg.pending && <span className="text-white/30">(sending…)</span>}
                  </div>
                )}

                {/* Reply quote box if any */}
                {msg.replyTo && (
                  <div className="mb-1 rounded-xl bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/65 border-l-2 border-coral-400 max-w-full">
                    <span className="font-semibold text-white/85">{msg.replyTo.name}: </span>
                    <span className="truncate">{msg.replyTo.text}</span>
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={cn(
                    'group relative rounded-2xl text-[13px] leading-relaxed text-white transition',
                    msg.gif && !msg.text ? 'p-1 bg-transparent' : 'px-3.5 py-2',
                    isMe && !(msg.gif && !msg.text)
                      ? 'bg-coral-500 text-white shadow-sm'
                      : !(msg.gif && !msg.text)
                        ? 'bg-white/[0.08] ring-1 ring-white/[0.08]'
                        : '',
                  )}
                >
                  {/* Spoiler blur overlay */}
                  {isSpoiler && !revealed ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-xs text-amber-300 font-medium flex items-center gap-1">
                        <EyeOff size={13} /> Spoiler ({formatTime(msg.vt?.time ?? 0)})
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
                      {msg.text && <p className="break-words select-text whitespace-pre-wrap">{msg.text}</p>}
                      {msg.gif && (
                        <div
                          className={cn(
                            'overflow-hidden rounded-xl bg-black/30 ring-1 ring-white/10',
                            msg.text && 'mt-1.5',
                          )}
                        >
                          <img
                            src={msg.gif.url}
                            alt={msg.gif.title || 'GIF'}
                            className="max-h-56 w-auto max-w-full object-contain"
                            loading="lazy"
                          />
                        </div>
                      )}
                      {isSpoiler && revealed && (
                        <button
                          onClick={() => toggleSpoiler(msg.id)}
                          className="mt-1.5 block text-[10px] text-white/55 hover:underline"
                        >
                          Hide spoiler
                        </button>
                      )}
                    </>
                  )}

                  {/* Quick hover actions (Reply & Copy) */}
                  <div
                    className={cn(
                      'absolute -top-3 hidden items-center gap-0.5 rounded-full bg-ink-900/95 p-0.5 shadow-lg ring-1 ring-white/15 group-hover:flex z-10',
                      isMe ? 'left-1' : 'right-1',
                    )}
                  >
                    <button
                      onClick={() => {
                        setReplyTo({ id: msg.id, name: msg.fromName, text: msg.text || 'GIF' });
                        inputRef.current?.focus();
                      }}
                      className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white transition"
                      title="Reply"
                    >
                      <Reply size={11} />
                    </button>
                    {msg.text && (
                      <button
                        onClick={() => copyText(msg.id, msg.text)}
                        className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white transition"
                        title="Copy text"
                      >
                        {copiedId === msg.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={listEndRef} />
      </div>

      {/* Scroll to latest pill */}
      <AnimatePresence>
        {showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={scrollToBottom}
            className="butter-btn absolute bottom-32 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-coral-500 px-3 py-1 text-[11px] font-semibold text-white shadow-float"
          >
            <ArrowDown size={12} /> Jump to latest
          </motion.button>
        )}
      </AnimatePresence>

      {/* Live Floating Screen Reaction Bar */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-1.5 bg-black/20">
        <div className="flex items-center gap-0.5 overflow-x-auto scroll-thin py-0.5">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => controller.react(emoji)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm transition-transform hover:scale-125 active:scale-90 hover:bg-white/10"
              title={`Send live ${emoji} reaction`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Inline Text Emoji Tray */}
      <AnimatePresence>
        {emojiPickerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/10 bg-ink-900/95 p-2.5 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Insert Emoji
              </span>
              <button onClick={() => setEmojiPickerOpen(false)} className="text-white/45 hover:text-white">
                <X size={13} />
              </button>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {TEXT_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => insertEmoji(em)}
                  className="grid h-8 place-items-center rounded-lg text-base hover:bg-white/10 active:scale-90 transition"
                >
                  {em}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large Uncropped GIF Picker Tray */}
      <AnimatePresence>
        {gifSearchOpen && (
          <GifPicker onSelect={handleSendGif} onClose={() => setGifSearchOpen(false)} />
        )}
      </AnimatePresence>

      {/* Reply bar if active */}
      {replyTo && (
        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs text-white/75">
          <div className="flex items-center gap-1.5 truncate">
            <Reply size={13} className="text-coral-400 shrink-0" />
            <span className="truncate">
              Replying to <b className="text-white">{replyTo.name}</b>: {replyTo.text}
            </span>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="rounded p-0.5 text-white/50 hover:text-white shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-2.5 border-t border-white/10 bg-black/25">
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.06] p-1.5 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-coral-500/70 transition-shadow">
          <button
            type="button"
            onClick={() => {
              setGifSearchOpen((v) => !v);
              setEmojiPickerOpen(false);
            }}
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition',
              gifSearchOpen
                ? 'bg-coral-500/25 text-coral-300 ring-1 ring-coral-500/40'
                : 'text-white/60 hover:bg-white/10 hover:text-white',
            )}
            title="Search full-size GIFs"
          >
            <ImageIcon size={17} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEmojiPickerOpen((v) => !v);
              setGifSearchOpen(false);
            }}
            className={cn(
              'grid h-9 w-8 shrink-0 place-items-center rounded-xl transition',
              emojiPickerOpen
                ? 'bg-coral-500/25 text-coral-300'
                : 'text-white/60 hover:bg-white/10 hover:text-white',
            )}
            title="Emoji keyboard"
          >
            <Smile size={17} />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the room…"
            maxLength={500}
            className="w-full bg-transparent px-1.5 text-sm text-white outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="butter-btn grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-500 text-white shadow-md hover:bg-coral-600 disabled:opacity-30"
            title="Send message"
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
    }, 280);

    return () => {
      cancel = true;
      clearTimeout(debounce);
    };
  }, [query]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 370, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col border-t border-white/15 bg-ink-950/95 backdrop-blur-xl overflow-hidden"
    >
      {/* Search + Close */}
      <div className="flex items-center justify-between p-2.5 border-b border-white/10">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-1.5 text-xs ring-1 ring-white/10 focus-within:ring-coral-400">
          <Search size={14} className="text-white/45" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIPHY…"
            className="w-full bg-transparent text-white outline-none placeholder:text-white/35"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-white/40 hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 grid h-7 w-7 place-items-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white"
          title="Close GIF picker"
        >
          <X size={16} />
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-2.5 py-2 border-b border-white/[0.06] scroll-thin shrink-0">
        {GIF_TAGS.map((tag) => {
          const val = tag === 'Trending' ? '' : tag;
          const active = query.toLowerCase() === val.toLowerCase();
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setQuery(val)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition',
                active
                  ? 'bg-coral-500 text-white'
                  : 'bg-white/[0.07] text-white/65 hover:bg-white/15 hover:text-white',
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* Full-Frame Uncropped GIF Masonry Grid */}
      <div className="flex-1 overflow-y-auto p-2.5 scroll-thin">
        {loading && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-32 w-full rounded-xl" />
            ))}
          </div>
        )}
        {!loading && gifs.length === 0 && (
          <div className="py-12 text-center text-xs text-white/45">
            {query ? 'No GIFs found for that search' : 'GIFs powered by GIPHY'}
          </div>
        )}
        {!loading && gifs.length > 0 && (
          <div className="columns-2 gap-2 space-y-2">
            {gifs.map((g, i) => (
              <button
                key={`${g.url}-${i}`}
                type="button"
                onClick={() => onSelect(g)}
                className="group relative block w-full break-inside-avoid overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10 hover:ring-2 hover:ring-coral-400 transition-all"
                title={g.title || 'Click to send GIF'}
              >
                <img
                  src={g.url || g.preview}
                  alt={g.title || 'GIF'}
                  style={
                    g.width && g.height
                      ? { aspectRatio: `${g.width} / ${g.height}` }
                      : undefined
                  }
                  className="w-full h-auto min-h-[88px] object-contain bg-black/25 transition-transform duration-200 group-hover:scale-[1.03]"
                  loading="lazy"
                />
                {g.title && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity truncate text-left">
                    {g.title}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
