import { clsx } from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

export const inputClass =
  'h-12 w-full rounded-2xl border-2 border-border bg-bg px-4 text-[16px] placeholder:text-muted/60 focus:border-accent focus:outline-none aria-invalid:border-bad-fg disabled:opacity-60'

/** Labelled text input with an optional hint and error, wired up for screen readers. */
export function Field({ label, hint, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold">
        {label}
      </label>
      <input id={id} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy} className={inputClass} {...props} />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-bold text-bad-fg">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** A form-level message (errors announced immediately, successes politely). */
export function FormMessage({ tone, children, className }: { tone: 'error' | 'success' | 'info'; children: ReactNode; className?: string }) {
  if (!children) return null
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-2xl px-3.5 py-2.5 text-sm font-bold',
        tone === 'error' && 'bg-bad-bg text-bad-fg',
        tone === 'success' && 'bg-ok-bg text-ok-fg',
        tone === 'info' && 'bg-info-bg text-info-fg',
        className,
      )}
    >
      {children}
    </p>
  )
}

/** Label + hint/error wrapper for controls `Field` doesn't cover (select, textarea). Pass the same `id` to the control. */
export function FieldShell({ id, label, hint, error, children, className }: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-bold text-bad-fg">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

