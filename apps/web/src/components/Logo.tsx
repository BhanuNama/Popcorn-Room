import { cn } from '@/lib/utils';

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display font-bold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8 drop-shadow-sm" aria-hidden>
        <defs>
          <linearGradient id="lg-orbit-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
          <radialGradient id="lg-orbit-core" cx="35%" cy="30%" r="70%">
            <stop offset="0" stopColor="#a5b4fc" />
            <stop offset="55%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#312e81" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={dark ? '#ffffff' : '#0b1120'} fillOpacity={dark ? 0.08 : 1} />
        <ellipse
          cx="32"
          cy="32"
          rx="22"
          ry="9.5"
          transform="rotate(-24 32 32)"
          fill="none"
          stroke="url(#lg-orbit-ring)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="32" cy="32" r="10.5" fill="url(#lg-orbit-core)" />
        <circle cx="28.5" cy="28.5" r="2.8" fill="#ffffff" opacity="0.45" />
        <circle cx="50.5" cy="22" r="3.4" fill="#fbbf24" />
      </svg>
      <span className={cn('text-[17px] tracking-[-0.02em]', dark ? 'text-white' : 'text-ink-900')}>
        The Orbit
      </span>
    </span>
  );
}
