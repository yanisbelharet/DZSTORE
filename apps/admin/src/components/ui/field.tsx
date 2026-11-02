import { Label as RadixLabel } from 'radix-ui';
import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';

export function Label({ className, ...props }: ComponentProps<typeof RadixLabel.Root>) {
  return (
    <RadixLabel.Root className={cn('text-sm font-medium text-slate-800', className)} {...props} />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-indigo-600 focus:outline-2 focus:outline-indigo-600/30 disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-indigo-600 focus:outline-2 focus:outline-indigo-600/30',
        className,
      )}
      {...props}
    />
  );
}

/** Label + control + hint, wired for accessibility. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id, hintId)}
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: ComponentProps<'input'> & { label: string }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm text-slate-800', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
