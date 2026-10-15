import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Toggle chip used across the style builder. Exposes state via aria-pressed. */
export function Chip({
  selected,
  onToggle,
  children,
  className,
  disabled,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Selects one value from a list of chips. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} selected={value === o.value} onToggle={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
