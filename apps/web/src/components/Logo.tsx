import { cn } from '@/lib/utils';

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display font-bold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <defs>
          <linearGradient id="lg-pop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b7bff" />
            <stop offset="1" stopColor="#ff5c8a" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={dark ? '#ffffff' : '#1c1f4a'} fillOpacity={dark ? 0.08 : 1} />
        <path d="M16 26h32l-4 26H20z" fill="url(#lg-pop)" />
        <path d="M18 30h4l1 18h-3zM30 30h4v18h-4zM42 30h4l-2 18h-3z" fill="#fff" opacity=".55" />
        <circle cx="22" cy="22" r="6" fill="#fff" />
        <circle cx="32" cy="18" r="7" fill="#fff" />
        <circle cx="42" cy="22" r="6" fill="#fff" />
      </svg>
      <span className={cn('text-[17px]', dark ? 'text-white' : 'text-ink-800')}>Popcorn Room</span>
    </span>
  );
}
