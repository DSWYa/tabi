import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent'

const tones: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok-fg',
  warn: 'bg-warn-bg text-warn-fg',
  bad: 'bg-bad-bg text-bad-fg',
  info: 'bg-info-bg text-info-fg',
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent-text',
}

/** Small pill. Always pair color with an icon or text so meaning isn't color-only. */
export function Badge({ tone = 'neutral', icon, children, className }: {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
