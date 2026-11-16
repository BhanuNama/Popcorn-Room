import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight,
  AudioLines,
  Check,
  Headphones,
  Link2,
  ListVideo,
  MessageCircle,
  MonitorUp,
  MousePointer2,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { YoutubeIcon } from '@/components/YoutubeIcon';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import { Button, Dialog, Input, Switch, softSpring } from '@/components/ui';
import { api } from '@/lib/api';
import { session } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function Landing() {
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const join = (e: FormEvent) => {
    e.preventDefault();
    const m = code.trim().match(/(?:\/r\/)?([a-z0-9]{6,16})\/?$/i);
    if (!m) return toast.error('Paste a room link or code');
    navigate(`/r/${m[1].toLowerCase()}`);
  };

  return (
    <div className="min-h-full bg-pastel text-ink-800">
      <div className="pointer-events-none fixed inset-0 dot-grid opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <Nav onCreate={() => setCreateOpen(true)} />

      <main className="relative">
        {/* ------------------------------ Hero ------------------------------ */}
        <section className="mx-auto max-w-5xl px-5 pt-36 text-center sm:pt-44">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-[13px] font-medium shadow-card ring-1 ring-ink-800/5"
          >
            <Sparkles size={14} className="text-coral-500" /> Free watch parties with studio-clean sound
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.05 }}
            className="mt-6 font-display text-[44px] leading-[1.04] font-bold tracking-[-0.03em] sm:text-7xl"
          >
            Watch together,
            <br />
            hear it <span className="text-gradient">exactly</span>.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.1 }}
            className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-500"
          >
            Share a tab, a window or your whole screen, or sync a YouTube video for everyone. Chat, react and talk, while
            your friends' voices never touch the movie's sound.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.15 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button variant="ink" size="lg" onClick={() => setCreateOpen(true)} data-testid="hero-create">
              Start a room, it's free <ArrowRight size={18} />
            </Button>
            <form onSubmit={join} className="flex h-12 items-center rounded-2xl bg-white/80 p-1 pl-4 shadow-card ring-1 ring-ink-800/5">
              <Link2 size={16} className="text-ink-300" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste a link or code"
                aria-label="Room link or code"
                className="w-44 bg-transparent px-2 text-sm outline-none placeholder:text-ink-300"
              />
              <Button type="submit" variant="light" size="sm" className="h-10 rounded-xl">
                Join
              </Button>
            </form>
          </motion.div>
          <p className="mt-4 text-xs text-ink-400">No account needed. Join with just a name in under 30 seconds.</p>
        </section>

        <HeroShowcase />
        <Features />
        <SoundSection />
        <HowItWorks onCreate={() => setCreateOpen(true)} />
        <Browsers />
        <Footer onCreate={() => setCreateOpen(true)} />
      </main>

      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

/* ------------------------------ Nav ------------------------------ */

function Nav({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="fixed inset-x-0 top-4 z-40 px-4">
      <nav className="mx-auto flex h-16 max-w-4xl items-center justify-between rounded-2xl bg-white/90 pl-5 pr-2.5 shadow-card ring-1 ring-ink-800/5 backdrop-blur-xl">
        <a href="/" aria-label="Popcorn Room home">
          <Logo />
        </a>
        <div className="hidden items-center gap-8 text-[15px] text-ink-600 md:flex">
          <a href="#features" className="hover:text-ink-800">Features</a>
          <a href="#sound" className="hover:text-ink-800">Sound</a>
          <a href="#how" className="hover:text-ink-800">How it works</a>
          <a href="#browsers" className="hover:text-ink-800">Browsers</a>
        </div>
        <Button variant="ink" onClick={onCreate} className="h-11 rounded-xl px-5">
          Start a room
        </Button>
      </nav>
    </header>
  );
}

/* ------------------------------ Showcase (tilted cards) ------------------------------ */

function HeroShowcase() {
  const { scrollY } = useScroll();
  const yL = useTransform(scrollY, [0, 600], [0, -40]);
  const yR = useTransform(scrollY, [0, 600], [0, -70]);
  const heat = [3, 5, 4, 9, 6, 4, 12, 7, 5, 8, 10, 6];

  return (
    <section className="relative mx-auto mt-20 max-w-6xl px-5 pb-10">
      {/* Main app preview */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...softSpring, delay: 0.2 }}
        className="relative mx-auto max-w-4xl rounded-[28px] bg-white/60 p-2.5 shadow-float ring-1 ring-white backdrop-blur"
      >
        <div className="overflow-hidden rounded-[22px] bg-[#0d0c18] ring-1 ring-ink-800/10">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-coral-500" /> Friday Movie Night
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Good</span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white">Invite</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[1fr_220px]">
            <div className="relative aspect-video overflow-hidden rounded-2xl">
              <div className="absolute -inset-8 bg-[radial-gradient(circle_at_30%_40%,#8b7bff_0,transparent_45%),radial-gradient(circle_at_75%_60%,#ff5c8a_0,transparent_45%)] opacity-60 blur-2xl" />
              <div className="absolute inset-3 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#2a1f4f,#5b2a55_45%,#ff7a59)]">
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(to_top,#120d22,transparent)]" />
                <div className="absolute left-[12%] top-[22%] h-24 w-24 rounded-full bg-[#ffd29a] opacity-90 blur-[2px]" />
                <div className="absolute bottom-[18%] left-0 right-0 h-[30%] bg-[#1a1230] [clip-path:polygon(0_60%,15%_30%,28%_55%,45%_15%,62%_50%,78%_25%,100%_55%,100%_100%,0_100%)]" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/90">
                    <Play size={12} className="ml-0.5 fill-ink-800 text-ink-800" />
                  </span>
                  <div className="h-1 flex-1 rounded-full bg-white/20">
                    <div className="h-full w-2/5 rounded-full bg-coral-500" />
                  </div>
                  <span className="text-[10px] text-white/80">48:12</span>
                </div>
              </div>
              {['😂', '🔥', '😱', '❤️'].map((e, i) => (
                <motion.span
                  key={e}
                  className="absolute bottom-10 text-xl"
                  style={{ left: `${20 + i * 18}%` }}
                  animate={{ y: [0, -70], opacity: [0, 1, 0] }}
                  transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
                >
                  {e}
                </motion.span>
              ))}
            </div>
            <div className="hidden flex-col gap-2 sm:flex">
              <div className="flex gap-1 rounded-xl bg-white/5 p-1 text-[11px] text-white/60">
                <span className="flex-1 rounded-lg bg-white/10 py-1 text-center text-white">Chat</span>
                <span className="flex-1 py-1 text-center">People</span>
                <span className="flex-1 py-1 text-center">Queue</span>
              </div>
              {[
                ['Maya', 'that sunset shot 😍', 330],
                ['Aarav', 'sound is so clean wow', 200],
                ['Lena', 'popcorn break after this?', 20],
              ].map(([n, t, h]) => (
                <div key={n as string} className="rounded-xl bg-white/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                    <span className="h-4 w-4 rounded-full" style={{ background: `hsl(${h} 75% 62%)` }} /> {n}
                  </div>
                  <div className="mt-1 text-[11px] text-white/70">{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Multiplayer cursors (from the inspiration) */}
        <Cursor name="Maya" className="left-[18%] top-[30%]" delay={0.2} />
        <Cursor name="Aarav" className="right-[30%] top-[62%]" delay={1.1} />
      </motion.div>

      {/* Left tilted card: reaction heatmap */}
      <motion.div
        style={{ y: yL }}
        initial={{ opacity: 0, rotate: -14, x: -30 }}
        animate={{ opacity: 1, rotate: -8, x: 0 }}
        transition={{ ...softSpring, delay: 0.35 }}
        className="card absolute -left-2 top-24 hidden w-60 p-4 lg:block"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Reaction recap</span>
          <span className="rounded-full bg-blush-100 px-2 py-0.5 text-[11px] font-medium text-coral-600">48 new</span>
        </div>
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {heat.map((h, i) => (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ ...softSpring, delay: 0.5 + i * 0.04 }}
              style={{ height: `${(h / 12) * 100}%`, originY: 1 }}
              className={cn('flex-1 rounded-md', h === 12 ? 'bg-coral-500' : 'bg-blush-200')}
            />
          ))}
        </div>
        <div className="mt-2 text-[11px] text-ink-400">Biggest laugh at 1:02:44 😂</div>
      </motion.div>

      {/* Right tilted card: mixer */}
      <motion.div
        style={{ y: yR }}
        initial={{ opacity: 0, rotate: 14, x: 30 }}
        animate={{ opacity: 1, rotate: 7, x: 0 }}
        transition={{ ...softSpring, delay: 0.45 }}
        className="card absolute -right-2 top-40 hidden w-60 p-4 lg:block"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Your mix</span>
          <Headphones size={16} className="text-ink-300" />
        </div>
        {[
          ['Stream', 92, 'Stereo · 256 kbps'],
          ['Friends', 64, 'Voice · separate track'],
        ].map(([l, v, sub]) => (
          <div key={l as string} className="mt-4">
            <div className="flex justify-between text-xs">
              <span className="font-medium">{l}</span>
              <span className="text-ink-400">{v}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-gradient-to-r from-peri-500 to-coral-500" style={{ width: `${v}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-ink-400">{sub}</div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

function Cursor({ name, className, delay }: { name: string; className: string; delay: number }) {
  return (
    <motion.div
      className={cn('pointer-events-none absolute hidden sm:block', className)}
      animate={{ x: [0, 18, -6, 0], y: [0, -10, 8, 0] }}
      transition={{ duration: 7, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      <MousePointer2 size={18} className="fill-ink-800 text-ink-800" />
      <span className="ml-4 inline-block rounded-lg bg-ink-800 px-2.5 py-1 text-xs font-medium text-white shadow-float">{name}</span>
    </motion.div>
  );
}

/* ------------------------------ Features ------------------------------ */

const FEATURES = [
  { icon: MonitorUp, title: 'Share anything', text: 'A tab, a window or your whole screen in 1080p with its own high-quality stereo audio.' },
  { icon: YoutubeIcon, title: 'Synced YouTube', text: 'Paste a link. Everyone plays the original from YouTube, kept within 0.3 s of each other.' },
  { icon: AudioLines, title: 'Voices never touch the movie', text: 'Voice and stream travel as separate tracks. You mix them yourself with two sliders.' },
  { icon: MessageCircle, title: 'Chat & reactions', text: 'Replies, GIFs, floating emoji and spoiler-safe messages that wait for your playback.' },
  { icon: Users, title: 'Teams-style people panel', text: 'Speaking glow, raise hand, per-person volume, pin, roles and connection badges.' },
  { icon: ListVideo, title: 'Queue with votes', text: 'Friends add what is next and vote it up. "Everyone ready?" then a 3-2-1 countdown.' },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
      <SectionHead eyebrow="Features" title="Everything a movie night needs" sub="Built for friends, free forever, no installs." />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ ...softSpring, delay: (i % 3) * 0.06 }}
            whileHover={{ y: -4 }}
            className="card p-6"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blush-100 text-coral-600">
              <f.icon size={20} />
            </span>
            <h3 className="mt-5 font-display text-lg font-bold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="text-center">
      <span className="inline-block rounded-full bg-white/80 px-3.5 py-1 text-xs font-semibold text-ink-600 ring-1 ring-ink-800/5">{eyebrow}</span>
      <h2 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-xl text-ink-500">{sub}</p>
    </div>
  );
}

/* ------------------------------ Sound ------------------------------ */

function SoundSection() {
  const stream = ['Stereo, 48 kHz, never downmixed', 'Opus at 256 kbps (transparent)', 'Echo cancel, noise suppression, AGC: OFF', 'DTX off, quiet scenes keep playing', 'RED redundancy hides packet loss'];
  const voice = ['Mono, ~40 kbps', 'Echo cancel, noise suppression, AGC: ON', 'Optional push-to-talk', 'Its own volume per friend'];
  return (
    <section id="sound" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
      <SectionHead
        eyebrow="The one rule"
        title="The movie sounds like the movie"
        sub="Live streams are always compressed, so bit-perfect is impossible. We run Opus so high, in stereo, with every voice filter off, that you can't tell it from the source."
      />
      <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
        <TrackCard title="Stream track" tag="Shared screen audio" items={stream} accent />
        <div className="hidden flex-col items-center justify-center gap-2 lg:flex">
          <div className="h-16 w-px bg-ink-800/15" />
          <span className="rounded-full bg-ink-800 px-3 py-1.5 text-xs font-semibold text-white">never mixed</span>
          <div className="h-16 w-px bg-ink-800/15" />
        </div>
        <TrackCard title="Voice track" tag="Your microphone" items={voice} />
      </div>
      <div className="card mx-auto mt-5 flex max-w-3xl flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink-800 text-white">
          <Headphones size={22} />
        </span>
        <p className="text-sm leading-relaxed text-ink-600">
          <b className="text-ink-800">Each viewer mixes locally.</b> Two sliders, Stream and Friends, on separate audio nodes. No ducking unless you switch on
          "Smart duck". And for YouTube, nothing is re-encoded at all: everyone hears exactly what YouTube serves.
        </p>
      </div>
    </section>
  );
}

function TrackCard({ title, tag, items, accent }: { title: string; tag: string; items: string[]; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={softSpring}
      className={cn('card p-7', accent && 'ring-2 ring-coral-300')}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-bold">{title}</h3>
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', accent ? 'bg-blush-100 text-coral-600' : 'bg-ink-50 text-ink-500')}>{tag}</span>
      </div>
      <div className="mt-5 flex h-10 items-center gap-[3px]">
        {Array.from({ length: 48 }, (_, i) => (
          <span
            key={i}
            className={cn('flex-1 rounded-full', accent ? 'bg-gradient-to-t from-peri-500 to-coral-500' : 'bg-ink-200')}
            style={{ height: `${20 + Math.abs(Math.sin(i * (accent ? 0.55 : 1.3)) * (accent ? 80 : 50))}%` }}
          />
        ))}
      </div>
      <ul className="mt-5 space-y-2.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-sm text-ink-600">
            <Check size={16} className="mt-0.5 shrink-0 text-coral-500" /> {t}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ------------------------------ How it works ------------------------------ */

function HowItWorks({ onCreate }: { onCreate: () => void }) {
  const steps = [
    ['Create a room', 'One click. Add a password or "knock to enter" if you like.'],
    ['Share the link', 'Friends join with just a name. No accounts, no installs.'],
    ['Press play', 'Share your screen or paste a YouTube link. Everyone sees the same moment.'],
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
      <SectionHead eyebrow="How it works" title="From link to watching in 30 seconds" sub="Three steps. That's it." />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {steps.map(([t, d], i) => (
          <div key={t} className="card relative overflow-hidden p-7">
            <span className="font-display text-6xl font-extrabold text-blush-200">{i + 1}</span>
            <h3 className="mt-2 font-display text-lg font-bold">{t}</h3>
            <p className="mt-2 text-sm text-ink-500">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Button variant="ink" size="lg" onClick={onCreate}>
          Start your room <ArrowRight size={18} />
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------ Browsers ------------------------------ */

function Browsers() {
  const rows: [string, boolean | string, boolean | string, boolean | string][] = [
    ['Chrome / Edge on Windows', true, 'Tab + full system audio', true],
    ['Chrome / Edge on macOS', true, 'Tab audio only (macOS limit)', true],
    ['Firefox / Safari', true, false, true],
    ['Phones & tablets', false, false, true],
  ];
  const cell = (v: boolean | string) =>
    v === true ? <Check size={18} className="mx-auto text-emerald-500" /> : v === false ? <X size={18} className="mx-auto text-ink-300" /> : <span className="text-xs text-ink-600">{v}</span>;
  return (
    <section id="browsers" className="mx-auto max-w-4xl scroll-mt-28 px-5 py-24">
      <SectionHead eyebrow="Browsers" title="Honest about the limits" sub="Browsers decide what can be captured. Here is what works where." />
      <div className="card mt-12 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-ink-800/5 text-xs uppercase tracking-wide text-ink-400">
              <th className="p-4 text-left font-semibold">Browser</th>
              <th className="p-4 font-semibold">Share screen</th>
              <th className="p-4 font-semibold">Share audio</th>
              <th className="p-4 font-semibold">Watch & YouTube</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-ink-800/5 last:border-0">
                <td className="p-4 font-medium">{r[0]}</td>
                <td className="p-4 text-center">{cell(r[1])}</td>
                <td className="p-4 text-center">{cell(r[2])}</td>
                <td className="p-4 text-center">{cell(r[3])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center text-xs text-ink-400">
        DRM services (Netflix, Prime and similar) may share a black picture. Popcorn Room detects it and tells the host.
      </p>
    </section>
  );
}

function Footer({ onCreate }: { onCreate: () => void }) {
  return (
    <footer className="px-5 pb-10">
      <div className="mx-auto max-w-5xl rounded-[28px] bg-ink-800 px-8 py-14 text-center text-white shadow-float">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">Grab the popcorn.</h2>
        <p className="mx-auto mt-3 max-w-md text-white/70">Free, private, no recording. For entertainment between friends.</p>
        <Button size="lg" className="mt-8" onClick={onCreate}>
          Start a room <ArrowRight size={18} />
        </Button>
      </div>
      <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center justify-between gap-3 text-xs text-ink-400 sm:flex-row">
        <Logo className="scale-90" />
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={14} /> Streams are never recorded or stored. Please respect copyright and platform terms.
        </span>
      </div>
    </footer>
  );
}

/* ------------------------------ Create room ------------------------------ */

function CreateRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(session.displayName || '');
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [knock, setKnock] = useState(false);
  const [anyone, setAnyone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Add your name');
    setBusy(true);
    try {
      const { room, hostKey } = await api.createRoom({
        hostName: name.trim(),
        name: roomName.trim() || undefined,
        password: password || undefined,
        knock,
        anyoneCanPresent: anyone,
      });
      session.displayName = name.trim();
      session.set(room.id, { hostKey, password: password || undefined });
      navigate(`/r/${room.id}`, { state: { autoJoin: true } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} light title="Start a room" description="You'll be the host. Share the link with friends.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-600">Your name</span>
          <Input light autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bhanu" data-testid="create-name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-600">Room name (optional)</span>
          <Input light value={roomName} maxLength={48} onChange={(e) => setRoomName(e.target.value)} placeholder="Friday Movie Night" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-600">Password (optional)</span>
          <Input light type="password" value={password} maxLength={64} onChange={(e) => setPassword(e.target.value)} placeholder="Leave empty for an open room" />
        </label>
        <div className="space-y-3 rounded-2xl bg-ink-50 p-4">
          <Toggle label="Knock to enter" sub="You admit each guest" checked={knock} onChange={setKnock} />
          <Toggle label="Anyone can present" sub="Everyone may share their screen" checked={anyone} onChange={setAnyone} />
        </div>
        <Button type="submit" variant="ink" size="lg" className="w-full" disabled={busy} data-testid="create-submit">
          {busy ? 'Creating…' : 'Create room'} <ArrowRight size={18} />
        </Button>
      </form>
    </Dialog>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-ink-400">{sub}</div>
      </div>
      <Switch light checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
