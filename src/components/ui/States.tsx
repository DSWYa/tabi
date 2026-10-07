import { clsx } from 'clsx'
import { CloudOff, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Mascot } from '@/components/Brand'
import { Button } from './Button'

export function EmptyState({ title, message, action, mood = 'happy', className }: {
  title: string
  message?: ReactNode
  action?: ReactNode
  mood?: 'happy' | 'sleepy'
  className?: string
}) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-10 text-center animate-rise', className)}>
      <Mascot mood={mood} className="mb-4 size-20" />
      <h3 className="text-lg font-extrabold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, offline }: {
  title?: string
  message?: ReactNode
  onRetry?: () => void
  offline?: boolean
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center animate-rise">
      <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-bad-bg text-bad-fg">
        <CloudOff aria-hidden className="size-7" />
      </span>
      <h3 className="text-lg font-extrabold">{offline ? "You're offline" : title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" /> Try again
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('rounded-xl bg-surface-2 animate-shimmer', className)} />
}

/** A card-shaped loading placeholder with an accessible label. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Loading" className="rounded-card border border-border bg-surface p-5">
      <Skeleton className="mb-4 h-5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={clsx('mb-2 h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
