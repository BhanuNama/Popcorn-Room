import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  AudioLines,
  Check,
  Film,
  Headphones,
  Link2,
  ListVideo,
  MessageCircle,
  MonitorUp,
  Orbit as OrbitIcon,
  Palette,
  Play,
  Radio,
  ShieldCheck,
  Smartphone,
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
    <div className="min-h-full bg-pastel text-ink-800 selection:bg-coral-500/15 selection:text-coral-700 overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 dot-grid opacity-65 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <Nav onCreate={() => setCreateOpen(true)} />

      <main className="relative">
        {/* ------------------------------ Orbital Hero ------------------------------ */}
        <section className="relative mx-auto max-w-5xl px-5 pt-24 text-center sm:pt-28">
          {/* Concentric rotating background orbital rings */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 -z-10">
            <div className="relative h-[520px] w-[520px] sm:h-[740px] sm:w-[740px] opacity-65">
              {/* Outer orbit ring */}
              <div className="animate-orbit-slow absolute inset-0 rounded-full border border-indigo-400/20">
                <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.75)]" />
                <span className="hidden sm:flex items-center gap-1.5 absolute bottom-12 right-12 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink-700 shadow-card ring-1 ring-ink-800/8 animate-orbit-rev">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Maya joined
                </span>
              </div>

              {/* Middle orbit ring */}
              <div className="animate-orbit-rev absolute inset-14 sm:inset-24 rounded-full border border-dashed border-sky-400/25">
                <span className="absolute top-1/4 -left-1.5 h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.7)]" />
                <span className="hidden sm:flex items-center gap-1.5 absolute top-8 left-12 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink-700 shadow-card ring-1 ring-ink-800/8 animate-orbit-slow">
                  🍿 Aarav reacted
                </span>
              </div>

              {/* Inner orbit ring */}
              <div className="animate-orbit-med absolute inset-28 sm:inset-48 rounded-full border border-indigo-500/15">
                <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.7)]" />
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={softSpring}
            className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-1.5 text-[12.5px] font-medium text-ink-600 shadow-card ring-1 ring-ink-800/[0.06] backdrop-blur-md"
          >
            <OrbitIcon size={14} className="text-coral-500 animate-spin [animation-duration:12s]" />
            <span>The Orbit · Private Watch Parties · Free Forever</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.05 }}
            className="mt-5 font-display text-[38px] leading-[1.03] font-extrabold tracking-[-0.035em] text-ink-900 sm:text-6xl lg:text-[68px]"
          >
            One screen at the center.
            <br />
            Everyone in <span className="text-gradient">orbit</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-500 sm:text-[17px]"
          >
            Stream 4K local films, sync YouTube in lockstep, or share any screen in rich stereo. Talk and react together while voices stay cleanly separated from the film.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.14 }}
            className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row"
          >
            <Button
              variant="ink"
              size="lg"
              onClick={() => setCreateOpen(true)}
              className="w-full sm:w-auto px-7 shadow-lg shadow-ink-900/15"
              data-testid="hero-create"
            >
              Start a Room, it's free <ArrowRight size={18} />
            </Button>

            <form
              onSubmit={join}
              className="flex h-12 w-full sm:w-auto items-center rounded-2xl bg-white/95 p-1 pl-4 shadow-card ring-1 ring-ink-800/[0.07] backdrop-blur transition-shadow focus-within:ring-2 focus-within:ring-coral-500/50"
            >
              <Link2 size={16} className="text-ink-300 shrink-0" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste room link or code"
                aria-label="Room link or code"
                className="flex-1 sm:w-48 bg-transparent px-2.5 text-sm text-ink-800 outline-none placeholder:text-ink-300"
              />
              <Button type="submit" variant="primary" size="sm" className="h-10 rounded-xl px-4">
                Join
              </Button>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mt-3.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-ink-400"
          >
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-emerald-500" /> No sign-up required
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-emerald-500" /> Laptop & phone synced
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-emerald-500" /> Zero stream recording
            </span>
          </motion.div>
        </section>

        <HeroShowcase />
        <OrbitArchitecture />
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
    <header className="fixed inset-x-0 top-3 sm:top-4 z-40 px-3 sm:px-4">
      <nav className="mx-auto flex h-14 sm:h-16 max-w-4xl items-center justify-between rounded-2xl bg-white/85 pl-4 sm:pl-5 pr-2 sm:pr-2.5 shadow-card ring-1 ring-ink-800/[0.06] backdrop-blur-xl">
        <a href="/" aria-label="The Orbit home" className="shrink-0">
          <Logo />
        </a>
        <div className="hidden items-center gap-7 text-[14px] font-medium text-ink-500 md:flex">
          <a href="#orbit" className="hover:text-ink-900 transition-colors">Orbit Rings</a>
          <a href="#features" className="hover:text-ink-900 transition-colors">Features</a>
          <a href="#sound" className="hover:text-ink-900 transition-colors">Audio</a>
          <a href="#how" className="hover:text-ink-900 transition-colors">How it works</a>
        </div>
        <Button variant="ink" onClick={onCreate} className="h-10 sm:h-11 rounded-xl px-4 sm:px-5 text-xs sm:text-sm">
          Start a Room
        </Button>
      </nav>
    </header>
  );
}

/* ------------------------------ Interactive Orbit Stage Preview ------------------------------ */

const DEMO_THEMES = [
  { id: 'midnight', label: 'Midnight', bg: '#070a12', glow: 'rgba(99, 102, 241, 0.5)', accent: '#6366f1' },
  { id: 'retro', label: 'Retro 80s', bg: '#140e08', glow: 'rgba(245, 158, 11, 0.5)', accent: '#f59e0b' },
  { id: 'cyber', label: 'Azure Neon', bg: '#040814', glow: 'rgba(56, 189, 248, 0.5)', accent: '#38bdf8' },
  { id: 'nordic', label: 'Nordic', bg: '#05110c', glow: 'rgba(52, 211, 153, 0.5)', accent: '#34d399' },
];

const DEMO_MODES = [
  { id: 'local', label: '4K Local Film', badge: 'Interstellar_4K.mp4 · Subtitles ON' },
  { id: 'youtube', label: 'YouTube Sync', badge: 'Locked within 0.1s' },
  { id: 'screen', label: 'Screen Share', badge: '1080p 60fps Stereo' },
];

function HeroShowcase() {
  const { scrollY } = useScroll();
  const yL = useTransform(scrollY, [0, 650], [0, -40]);
  const yR = useTransform(scrollY, [0, 650], [0, -68]);
  const heat = [3, 5, 4, 9, 6, 4, 12, 7, 5, 8, 10, 6];

  const [demoTheme, setDemoTheme] = useState(DEMO_THEMES[0]);
  const [demoMode, setDemoMode] = useState(DEMO_MODES[0]);

  return (
    <section className="relative mx-auto mt-8 sm:mt-10 max-w-6xl px-4 sm:px-5 pb-10">
      {/* Main interactive theater */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...softSpring, delay: 0.18 }}
        className="relative mx-auto max-w-4xl rounded-[30px] bg-white/85 p-2 sm:p-2.5 shadow-float ring-1 ring-white backdrop-blur-xl"
      >
        <div
          className="overflow-hidden rounded-[22px] ring-1 ring-white/10 transition-colors duration-500"
          style={{ backgroundColor: demoTheme.bg }}
        >
          {/* Room Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-white">
              <span
                className="h-2.5 w-2.5 rounded-full animate-pulse transition-colors duration-300"
                style={{ backgroundColor: demoTheme.accent }}
              />
              <span>Friday Screening · 4 in Orbit</span>
            </div>

            {/* Mode Switcher */}
            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-white/[0.06] p-1">
              {DEMO_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setDemoMode(m)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                    demoMode.id === m.id
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-white/55 hover:text-white',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Theme Dots */}
            <div className="flex items-center gap-1.5">
              <span className="hidden md:inline text-[10px] font-medium text-white/45 mr-1">
                Vibe:
              </span>
              {DEMO_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDemoTheme(t)}
                  title={t.label}
                  className={cn(
                    'h-4 w-4 rounded-full border transition-transform hover:scale-125',
                    demoTheme.id === t.id ? 'border-white scale-110 ring-2 ring-white/30' : 'border-white/30',
                  )}
                  style={{ backgroundColor: t.accent }}
                />
              ))}
            </div>
          </div>

          {/* Stage + Lounge */}
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[1fr_230px]">
            <div className="relative aspect-video overflow-hidden rounded-2xl p-2 flex items-center justify-center">
              {/* Live Dynamic Ambilight Backdrop */}
              <div
                className="absolute -inset-6 blur-2xl opacity-85 transition-all duration-700"
                style={{
                  background: `radial-gradient(circle at 32% 40%, ${demoTheme.glow}, transparent 60%), radial-gradient(circle at 75% 65%, rgba(251, 191, 36, 0.35), transparent 55%)`,
                }}
              />

              {/* Central Film Viewport */}
              <div className="relative h-full w-full overflow-hidden rounded-xl bg-[linear-gradient(145deg,#090f24,#172554_48%,#1e1b4b)] ring-1 ring-white/15 shadow-2xl">
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(to_top,#04060e,transparent)]" />
                {/* Glowing orbital eclipse horizon inside preview */}
                <div className="absolute left-[18%] top-[18%] h-24 w-24 rounded-full bg-amber-200/80 blur-[3px]" />
                <div className="absolute left-[22%] top-[22%] h-16 w-16 rounded-full bg-indigo-950/90" />
                <div className="animate-orbit-slow absolute left-[10%] top-[10%] h-36 w-36 rounded-full border border-white/15" />

                {/* Floating mode chip */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={demoMode.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white/95 backdrop-blur-md ring-1 ring-white/10"
                  >
                    <Sparkles size={11} style={{ color: demoTheme.accent }} />
                    <span>{demoMode.badge}</span>
                  </motion.div>
                </AnimatePresence>

                {/* Friends in orbit pills */}
                <div className="absolute top-3 right-3 flex -space-x-1.5">
                  {[220, 38, 165].map((h, idx) => (
                    <span
                      key={idx}
                      className="h-5 w-5 rounded-full ring-2 ring-black/60 shadow"
                      style={{ background: `hsl(${h} 75% 58%)` }}
                    />
                  ))}
                </div>

                {demoMode.id === 'local' && (
                  <div className="hidden sm:block absolute bottom-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-3 py-1 text-[11px] font-semibold text-white shadow">
                    "We used to look up at the sky and wonder."
                  </div>
                )}

                {/* Player timeline */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white shadow">
                    <Play size={12} className="ml-0.5 fill-ink-900 text-ink-900" />
                  </span>
                  <div className="h-1.5 flex-1 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full w-2/5 rounded-full transition-colors duration-300"
                      style={{ backgroundColor: demoTheme.accent }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-white/85 tabular-nums">1:14:08</span>
                </div>
              </div>

              {['🍿', '🔥', '😂', '✨'].map((e, i) => (
                <motion.span
                  key={e}
                  className="pointer-events-none absolute bottom-10 text-xl"
                  style={{ left: `${20 + i * 18}%` }}
                  animate={{ y: [0, -78], opacity: [0, 1, 0] }}
                  transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
                >
                  {e}
                </motion.span>
              ))}
            </div>

            {/* Watch Party Chat Preview */}
            <div className="hidden flex-col gap-2 sm:flex">
              <div className="flex gap-1 rounded-xl bg-white/[0.06] p-1 text-[11px] text-white/60">
                <span className="flex-1 rounded-lg bg-white/12 py-1 text-center font-medium text-white">Chat</span>
                <span className="flex-1 py-1 text-center">People</span>
                <span className="flex-1 py-1 text-center">Queue</span>
              </div>
              {[
                ['Maya', 'that organ score gives me chills 🎧', 220],
                ['Aarav', 'the wall glow matches the frame!', 38],
                ['Lena', 'zero lag on my phone too ✨', 165],
              ].map(([n, t, h]) => (
                <div key={n as string} className="rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                    <span className="h-4 w-4 rounded-full" style={{ background: `hsl(${h} 72% 58%)` }} /> {n}
                  </div>
                  <div className="mt-1 text-[11px] text-white/75">{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Left parallax card: Live cheers (positioned high so visible immediately above fold) */}
      <motion.div
        style={{ y: yL }}
        initial={{ opacity: 0, rotate: -10, x: -24 }}
        animate={{ opacity: 1, rotate: -5, x: 0 }}
        transition={{ ...softSpring, delay: 0.3 }}
        className="card absolute -left-2 top-6 hidden w-56 p-4 lg:block"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-800">Live reactions</span>
          <span className="rounded-full bg-blush-100 px-2 py-0.5 text-[11px] font-semibold text-coral-600">48 cheers</span>
        </div>
        <div className="mt-3.5 flex h-20 items-end gap-1.5">
          {heat.map((h, i) => (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ ...softSpring, delay: 0.45 + i * 0.04 }}
              style={{ height: `${(h / 12) * 100}%`, originY: 1 }}
              className={cn('flex-1 rounded-md', h === 12 ? 'bg-coral-500' : 'bg-blush-200')}
            />
          ))}
        </div>
        <div className="mt-2 text-[11px] text-ink-400">Biggest gasp at 1:14:08 ✨</div>
      </motion.div>

      {/* Right parallax card: Audio Isolation (positioned high so visible immediately above fold) */}
      <motion.div
        style={{ y: yR }}
        initial={{ opacity: 0, rotate: 10, x: 24 }}
        animate={{ opacity: 1, rotate: 5, x: 0 }}
        transition={{ ...softSpring, delay: 0.38 }}
        className="card absolute -right-2 top-16 hidden w-56 p-4 lg:block"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-800">Audio balance</span>
          <Headphones size={16} className="text-ink-300" />
        </div>
        {[
          ['Film Sound', 95, 'Stereo · 256 kbps'],
          ['Friends', 68, 'Separate track'],
        ].map(([l, v, sub]) => (
          <div key={l as string} className="mt-3.5">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-ink-800">{l}</span>
              <span className="text-ink-400 tabular-nums">{v}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-ink-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-coral-500 to-peri-400" style={{ width: `${v}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-ink-400">{sub}</div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

/* ------------------------------ Orbit Architecture Diagram ------------------------------ */

function OrbitArchitecture() {
  return (
    <section id="orbit" className="mx-auto max-w-5xl scroll-mt-28 px-5 py-16 sm:py-24">
      <SectionHead
        eyebrow="The Orbit system"
        title="Built like a solar system for movie night"
        sub="Your film stays fixed in the center while sync clocks, voice tracks, reactions, and Ambilight revolve smoothly around it."
      />

      <div className="mt-12 card p-6 sm:p-10 relative overflow-hidden">
        <div className="grid items-center gap-10 lg:grid-cols-[320px_1fr]">
          {/* Animated Solar Diagram */}
          <div className="relative mx-auto flex h-64 w-64 sm:h-72 sm:w-72 items-center justify-center">
            {/* Outer voice & lounge ring */}
            <div className="animate-orbit-slow absolute inset-0 rounded-full border border-dashed border-ink-800/15">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-ink-700 shadow ring-1 ring-ink-800/10">
                🎙️ Voice
              </div>
              <div className="animate-orbit-rev absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-ink-700 shadow ring-1 ring-ink-800/10">
                💬 Chat & GIFs
              </div>
            </div>

            {/* Middle clock-sync ring */}
            <div className="animate-orbit-rev absolute inset-9 rounded-full border border-coral-400/35">
              <div className="absolute top-1/2 -right-3 -translate-y-1/2 h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
              <div className="absolute top-1/2 -left-3 -translate-y-1/2 h-3 w-3 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]" />
            </div>

            {/* Central Screen Core */}
            <div className="animate-float-gentle relative flex h-28 w-28 flex-col items-center justify-center rounded-full bg-ink-900 text-white shadow-float ring-4 ring-coral-500/20">
              <Radio size={22} className="text-coral-400 mb-1" />
              <span className="font-display text-xs font-bold">Core Stage</span>
              <span className="text-[9px] text-white/60">4K / Stereo</span>
            </div>
          </div>

          {/* Explanation pillars */}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: '1. Center Gravity Screen',
                desc: 'Play 4K movies straight from your drive, paste a YouTube link, or share any browser tab at 60 fps.',
              },
              {
                title: '2. Instant Sync Lock',
                desc: 'Shared clock alignment keeps every timeline locked—scrubbing and 3-2-1 countdowns move in unison.',
              },
              {
                title: '3. Isolated Voice Ring',
                desc: 'Voices ride on dedicated channels with automatic Bluetooth safeguard so soundtracks stay rich and wide.',
              },
              {
                title: '4. Dynamic Ambilight Halo',
                desc: 'Live edge sampling spills frame colors softly onto the room walls across 6 curated cinema vibes.',
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                whileHover={{ y: -2 }}
                className="rounded-2xl bg-ink-50/90 p-4 ring-1 ring-ink-800/[0.06]"
              >
                <div className="text-sm font-bold text-ink-900">{item.title}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Features ------------------------------ */

const FEATURES = [
  {
    icon: Film,
    title: '4K Local Movie Drop',
    text: 'Drop .mp4, .mkv, or .webm files straight from your computer with .srt/.vtt subtitles and zero compression.',
  },
  {
    icon: YoutubeIcon,
    title: 'Synced YouTube',
    text: 'Paste any link or queue up a playlist. Everyone plays natively from YouTube, timed down to the beat.',
  },
  {
    icon: AudioLines,
    title: 'Voices Never Touch the Film',
    text: 'Friend chat and movie audio stay strictly apart—with automatic Bluetooth protection so music never turns hollow.',
  },
  {
    icon: Palette,
    title: 'Ambilight & 6 Cinema Vibes',
    text: 'Live 4-zone bias light glows onto your walls alongside Midnight, True OLED Black, Retro 80s, and Nordic.',
  },
  {
    icon: MessageCircle,
    title: 'Room Chat, GIFs & Toasts',
    text: 'Full-frame GIPHY search, spoiler-guarded timestamps, emoji picker, replies, and toast alerts when chat is hidden.',
  },
  {
    icon: Smartphone,
    title: 'Built for Laptop & Phone',
    text: 'Sleek bottom chat drawers and adaptive camera strips keep the movie large and unobstructed on any screen.',
  },
];

function Features() {
  const badges = ['Zero upload', '< 0.2 s sync', '48 kHz raw', '4-zone halo', 'Spoiler lock', 'Mobile sheet'];
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-20 sm:py-24">
      <SectionHead
        eyebrow="Capabilities"
        title="Everything a watch party needs"
        sub="Each feature orbits smoothly around a lightweight, distraction-free stage."
      />
      <div className="mt-12 grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ ...softSpring, delay: (i % 3) * 0.06 }}
            whileHover={{ y: -5 }}
            className="card group relative overflow-hidden p-6 transition-shadow hover:shadow-float"
          >
            {/* Subtle top orbital light sweep on hover */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-coral-400/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <div className="flex items-center justify-between">
              <motion.span
                whileHover={{ rotate: [0, -8, 8, 0] }}
                transition={{ duration: 0.4 }}
                className="grid h-11 w-11 place-items-center rounded-2xl bg-blush-100 text-coral-600 ring-1 ring-coral-500/10"
              >
                <f.icon size={20} />
              </motion.span>
              <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[10px] font-semibold text-ink-500 transition-colors group-hover:bg-blush-100 group-hover:text-coral-600">
                {badges[i]}
              </span>
            </div>
            <h3 className="mt-5 font-display text-lg font-bold text-ink-900">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={softSpring}
      className="text-center"
    >
      <span className="inline-block rounded-full bg-white/95 px-3.5 py-1 text-xs font-semibold text-coral-600 ring-1 ring-ink-800/[0.06] shadow-sm">
        {eyebrow}
      </span>
      <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
        {title}
      </h2>
      <p className="mx-auto mt-3.5 max-w-xl text-sm sm:text-base text-ink-500">{sub}</p>
    </motion.div>
  );
}

/* ------------------------------ Sound ------------------------------ */

function SoundSection() {
  const [filmLevel, setFilmLevel] = useState(0.92);
  const [voiceLevel, setVoiceLevel] = useState(0.75);
  const [smartDuckDemo, setSmartDuckDemo] = useState(false);

  const effectiveFilm = smartDuckDemo && voiceLevel > 0.2 ? filmLevel * 0.7 : filmLevel;

  const stream = [
    'Full 48 kHz stereo—never flattened to mono',
    'High-bitrate 256 kbps Opus soundtrack fidelity',
    'Noise filters & gain pumping turned strictly off',
    'Quiet dialogue & ambient scores never clip out',
    'Automatic Bluetooth headset guard preserves music',
  ];
  const voice = [
    'Separate dedicated channel for friend mics',
    'Optional echo cancellation & smart ducking',
    'Hands-free or Push-to-talk (Hold Spacebar)',
    'Individual volume slider for every guest',
  ];

  return (
    <section id="sound" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-20 sm:py-24">
      <SectionHead
        eyebrow="Acoustic isolation"
        title="The movie sounds like the movie"
        sub="Turning on your mic never crushes the film's soundtrack—test the dual-track mix live below."
      />
      <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
        <TrackCard
          title="Movie Audio Track"
          tag="Shared screen audio"
          items={stream}
          level={effectiveFilm}
          accent
        />
        <div className="hidden flex-col items-center justify-center gap-2 lg:flex">
          <div className="h-16 w-px bg-ink-800/12" />
          <motion.span
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-float ring-2 ring-coral-400/30"
          >
            never mixed
          </motion.span>
          <div className="h-16 w-px bg-ink-800/12" />
        </div>
        <TrackCard
          title="Voice Mic Track"
          tag="Your microphone"
          items={voice}
          level={voiceLevel}
        />
      </div>

      {/* Interactive Local Mix Simulator Card */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={softSpring}
        className="card mx-auto mt-6 max-w-4xl p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5 max-w-md">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-900 text-white shadow">
              <Headphones size={20} />
            </span>
            <div>
              <h4 className="text-sm font-bold text-ink-900">Try the interactive Orbit mixer</h4>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Film audio and friend voices ride on separate audio elements—drag either fader to watch how cleanly they scale without interfering.
              </p>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 items-center">
            <div className="rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-800/5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-ink-700 mb-1.5">
                <span>Film Audio</span>
                <span className="tabular-nums text-coral-600">{Math.round(effectiveFilm * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(filmLevel * 100)}
                onChange={(e) => setFilmLevel(Number(e.target.value) / 100)}
                aria-label="Simulate film volume"
                className="w-full accent-coral-500 cursor-pointer"
              />
            </div>

            <div className="rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-800/5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-ink-700 mb-1.5">
                <span>Friends' Voices</span>
                <span className="tabular-nums text-peri-500">{Math.round(voiceLevel * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(voiceLevel * 100)}
                onChange={(e) => setVoiceLevel(Number(e.target.value) / 100)}
                aria-label="Simulate friends voice volume"
                className="w-full accent-peri-500 cursor-pointer"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-ink-50/70 px-3 py-2 ring-1 ring-ink-800/5">
              <span className="text-xs font-medium text-ink-600">
                Optional <b>Smart Duck</b> (gently lowers film by 30% only when a friend speaks)
              </span>
              <Switch light checked={smartDuckDemo} onChange={setSmartDuckDemo} label="Demo Smart Duck" />
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function TrackCard({
  title,
  tag,
  items,
  level,
  accent,
}: {
  title: string;
  tag: string;
  items: string[];
  level: number;
  accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={softSpring}
      className={cn('card p-7 transition-all', accent && 'ring-2 ring-coral-400/50')}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl font-bold text-ink-900">{title}</h3>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold',
            accent ? 'bg-blush-100 text-coral-600' : 'bg-ink-100 text-ink-500',
          )}
        >
          {tag}
        </span>
      </div>

      {/* Live Animated Audio Equalizer */}
      <div className="mt-5 flex h-12 items-end gap-[3px] overflow-hidden rounded-xl bg-ink-50/80 px-2 py-1.5 ring-1 ring-ink-800/[0.04]">
        {Array.from({ length: 42 }, (_, i) => {
          const base = 0.25 + Math.abs(Math.sin(i * (accent ? 0.55 : 1.25))) * (accent ? 0.72 : 0.52);
          const scaled = Math.max(0.08, base * level);
          return (
            <motion.span
              key={i}
              animate={{
                scaleY: [scaled, Math.min(1, scaled * 1.28), Math.max(0.1, scaled * 0.72), scaled],
              }}
              transition={{
                duration: accent ? 1.4 + (i % 5) * 0.18 : 0.9 + (i % 4) * 0.15,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: (i % 8) * 0.07,
              }}
              style={{ originY: 1, height: '100%' }}
              className={cn(
                'flex-1 rounded-full',
                accent ? 'bg-gradient-to-t from-coral-500 to-peri-400' : 'bg-ink-300',
              )}
            />
          );
        })}
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
    {
      num: '01',
      title: 'Launch your Orbit',
      desc: 'One click spins up a private room. Add an optional passcode or knock-to-enter lobby.',
      pill: 'orbit-friday · Ready',
    },
    {
      num: '02',
      title: 'Share the trajectory',
      desc: 'Copy one invite link. Friends join instantly from laptop or phone with just their name.',
      pill: '3 friends entering orbit',
    },
    {
      num: '03',
      title: 'Lock sync & press play',
      desc: 'Drop a 4K video, queue YouTube, or share a tab—3-2-1 countdown starts everyone together.',
      pill: '3 · 2 · 1 · In Sync',
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-20 sm:py-24">
      <SectionHead
        eyebrow="Simple launch"
        title="Into orbit in 20 seconds"
        sub="Three kinetic steps from opening the tab to movie night."
      />

      {/* Animated Orbital Trajectory Connector */}
      <div className="relative mt-12">
        <div aria-hidden className="pointer-events-none hidden md:block absolute top-11 left-[14%] right-[14%] h-px bg-gradient-to-r from-transparent via-coral-400/50 to-transparent">
          <motion.span
            animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-1 h-2.5 w-2.5 rounded-full bg-coral-500 shadow-[0_0_14px_rgba(99,102,241,0.9)]"
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ ...softSpring, delay: i * 0.1 }}
              whileHover={{ y: -5 }}
              className="card group relative overflow-hidden p-7"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink-900 font-display text-sm font-bold text-white shadow group-hover:bg-coral-500 transition-colors">
                  {s.num}
                </span>
                <span className="rounded-full bg-blush-100 px-2.5 py-0.5 text-[10px] font-semibold text-coral-600 ring-1 ring-coral-500/15">
                  {s.pill}
                </span>
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-ink-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-10 text-center">
        <Button variant="ink" size="lg" onClick={onCreate} className="px-8 shadow-lg shadow-ink-900/15">
          Launch an Orbit <ArrowRight size={18} />
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
    ['iOS & Android Phones', 'Watch & Host', 'YouTube & 4K Local Sync', true],
  ];
  const cell = (v: boolean | string) =>
    v === true ? (
      <span className="mx-auto inline-grid h-7 w-7 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
        <Check size={15} />
      </span>
    ) : v === false ? (
      <span className="mx-auto inline-grid h-7 w-7 place-items-center rounded-full bg-ink-100 text-ink-300">
        <X size={15} />
      </span>
    ) : (
      <span className="inline-block rounded-full bg-blush-100 px-2.5 py-0.5 text-xs font-semibold text-coral-700">
        {v}
      </span>
    );
  return (
    <section id="browsers" className="mx-auto max-w-4xl scroll-mt-28 px-5 py-20 sm:py-24">
      <SectionHead
        eyebrow="Compatibility"
        title="Ready across platforms"
        sub="What every browser and mobile device supports cleanly."
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={softSpring}
        className="card mt-10 overflow-x-auto"
      >
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-ink-800/5 text-xs uppercase tracking-wide text-ink-400">
              <th className="p-4 text-left font-semibold">Platform</th>
              <th className="p-4 font-semibold">Screen Share</th>
              <th className="p-4 font-semibold">Audio & Sync</th>
              <th className="p-4 font-semibold">YouTube & Chat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={r[0]}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="border-b border-ink-800/5 last:border-0 hover:bg-ink-50/70 transition-colors"
              >
                <td className="p-4 font-semibold text-ink-800">{r[0]}</td>
                <td className="p-4 text-center">{cell(r[1])}</td>
                <td className="p-4 text-center">{cell(r[2])}</td>
                <td className="p-4 text-center">{cell(r[3])}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
      <p className="mt-4 text-center text-xs text-ink-400">
        DRM platforms (Netflix, Prime) block browser capture with a black frame. Use 4K Local Movie Drop for downloaded files.
      </p>
    </section>
  );
}

function Footer({ onCreate }: { onCreate: () => void }) {
  return (
    <footer className="px-5 pb-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={softSpring}
        className="mx-auto max-w-5xl rounded-[32px] bg-ink-900 px-8 py-16 text-center text-white shadow-float relative overflow-hidden"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-56 w-[520px] rounded-full bg-coral-500/25 blur-3xl"
        />
        <div className="animate-orbit-slow pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 sm:h-[420px] sm:w-[420px] rounded-full border border-white/[0.08]">
          <span className="absolute -top-1.5 left-1/2 h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.9)]" />
        </div>
        <div className="animate-orbit-rev pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-56 w-56 sm:h-72 sm:w-72 rounded-full border border-dashed border-sky-400/20">
          <span className="absolute bottom-0 left-1/2 h-2 w-2 rounded-full bg-sky-400" />
        </div>

        <h2 className="relative font-display text-3xl font-extrabold sm:text-5xl">Enter The Orbit.</h2>
        <p className="relative mx-auto mt-3 max-w-md text-sm sm:text-base text-white/70">
          Free, private, lightweight. Gather around one screen from anywhere.
        </p>
        <Button size="lg" variant="primary" className="relative mt-8 px-8 shadow-lg shadow-coral-500/30" onClick={onCreate}>
          Launch your Orbit <ArrowRight size={18} />
        </Button>
      </motion.div>
      <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center justify-between gap-3 text-xs text-ink-400 sm:flex-row">
        <Logo className="scale-90" />
        <span className="flex items-center gap-1.5 text-center">
          <ShieldCheck size={14} className="shrink-0" /> Streams are never recorded or stored.
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
    <Dialog open={open} onOpenChange={onOpenChange} light title="Start a Room" description="You'll be the host. Share the room link with friends.">
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
        <div className="space-y-3 rounded-2xl bg-ink-50 p-4 ring-1 ring-ink-800/5">
          <Toggle label="Knock to enter" sub="You admit each guest" checked={knock} onChange={setKnock} />
          <Toggle label="Anyone can present" sub="Everyone may share their screen" checked={anyone} onChange={setAnyone} />
        </div>
        <Button type="submit" variant="ink" size="lg" className="w-full" disabled={busy} data-testid="create-submit">
          {busy ? 'Creating…' : 'Create Room'} <ArrowRight size={18} />
        </Button>
      </form>
    </Dialog>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-semibold text-ink-800">{label}</div>
        <div className="text-xs text-ink-400">{sub}</div>
      </div>
      <Switch light checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
