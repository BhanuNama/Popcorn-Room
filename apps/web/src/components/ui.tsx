import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

export const spring = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 28 } as const;

/* ------------------------------ Button ------------------------------ */

type Variant = 'primary' | 'ink' | 'ghost' | 'glass' | 'danger' | 'light' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-lg';

const variants: Record<Variant, string> = {
  primary: 'bg-coral-500 text-white hover:bg-coral-600 shadow-[0_8px_24px_-8px_rgb(255_92_138/0.7)]',
  ink: 'bg-ink-800 text-white hover:bg-ink-700 shadow-[0_8px_20px_-8px_rgb(28_31_74/0.6)]',
  ghost: 'text-white/80 hover:bg-white/10 hover:text-white',
  glass: 'bg-white/[0.07] text-white ring-1 ring-white/10 hover:bg-white/[0.12]',
  danger: 'bg-red-500/90 text-white hover:bg-red-500',
  light: 'bg-white text-ink-800 ring-1 ring-ink-800/10 hover:bg-ink-50',
  outline: 'text-ink-800 ring-1 ring-ink-800/15 hover:bg-white/70',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-2xl gap-2',
  icon: 'h-10 w-10 rounded-xl',
  'icon-lg': 'h-12 w-12 rounded-2xl',
};

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        whileTap={reduce || props.disabled ? undefined : { scale: 0.95 }}
        transition={spring}
        className={cn(
          'inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-45',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

/* ------------------------------ Tooltip ------------------------------ */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ label, children, side = 'top' }: { label: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className="z-[80] rounded-lg bg-ink-900/95 px-2.5 py-1.5 text-xs font-medium text-white shadow-float ring-1 ring-white/10 data-[state=delayed-open]:animate-in"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------------ Slider ------------------------------ */

export function Slider({
  value,
  onChange,
  max = 1,
  step = 0.01,
  label,
  className,
  tone = 'coral',
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
  label: string;
  className?: string;
  tone?: 'coral' | 'peri';
}) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}
      aria-label={label}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/15">
        <SliderPrimitive.Range className={cn('absolute h-full rounded-full', tone === 'coral' ? 'bg-coral-500' : 'bg-peri-500')} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block h-4 w-4 rounded-full bg-white shadow-md ring-2 ring-coral-500/40 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4"
      />
    </SliderPrimitive.Root>
  );
}

/* ------------------------------ Switch ------------------------------ */

export function Switch({ checked, onChange, label, light }: { checked: boolean; onChange: (v: boolean) => void; label: string; light?: boolean }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-coral-500' : light ? 'bg-ink-200' : 'bg-white/15',
      )}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

/* ------------------------------ Dialog ------------------------------ */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  light,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  light?: boolean;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-ink-950/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </DialogPrimitive.Overlay>
            <div className="fixed inset-0 z-[61] grid place-items-center p-4 pointer-events-none">
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={softSpring}
                  className={cn(
                    'pointer-events-auto relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl p-6 shadow-float scroll-thin',
                    light ? 'bg-white text-ink-800' : 'glass-strong text-white',
                    className,
                  )}
                >
                  <DialogPrimitive.Title className="pr-8 font-display text-lg font-bold">{title}</DialogPrimitive.Title>
                  {description ? (
                    <DialogPrimitive.Description className={cn('mt-1 text-sm', light ? 'text-ink-500' : 'text-white/60')}>
                      {description}
                    </DialogPrimitive.Description>
                  ) : (
                    <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>
                  )}
                  <div className="mt-5">{children}</div>
                  <DialogPrimitive.Close
                    className={cn(
                      'absolute right-4 top-4 rounded-lg p-1.5 transition-colors',
                      light ? 'text-ink-400 hover:bg-ink-50' : 'text-white/60 hover:bg-white/10',
                    )}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </DialogPrimitive.Close>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------ Avatar ------------------------------ */

export function Avatar({ name, hue, size = 36, speaking, className }: { name: string; hue: number; size?: number; speaking?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      {speaking && (
        <span
          aria-hidden
          className="absolute inset-[-4px] rounded-full bg-coral-500/40 animate-pulse-soft"
        />
      )}
      <span
        className={cn('relative grid h-full w-full place-items-center rounded-full font-semibold text-white', speaking && 'ring-2 ring-coral-400')}
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 75% 62%), hsl(${(hue + 40) % 360} 70% 50%))`,
          fontSize: size * 0.36,
        }}
      >
        {initials(name)}
      </span>
    </span>
  );
}

/* ------------------------------ Field ------------------------------ */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { light?: boolean }>(
  ({ className, light, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl px-3.5 text-sm outline-none transition-shadow',
        light
          ? 'bg-ink-50 text-ink-800 ring-1 ring-ink-800/10 placeholder:text-ink-300 focus:ring-2 focus:ring-coral-400'
          : 'bg-white/[0.06] text-white ring-1 ring-white/10 placeholder:text-white/35 focus:ring-2 focus:ring-coral-500/70',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
