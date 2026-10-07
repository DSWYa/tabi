import type { ReactNode } from 'react'
import { Logo } from '@/components/Brand'

/** Shared frame for the screens a non-member can see. Deliberately reveals nothing about the trip. */
export function GateLayout({ subtitle = 'A private trip planner for one family.', children }: {
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent-bright/15 blur-3xl" />
      <main className="relative w-full max-w-sm animate-rise">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-4 size-20 drop-shadow-md" />
          <h1 className="text-3xl font-black tracking-tight">Tabi</h1>
          <p className="mt-1 text-muted">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  )
}

export const gateCardClass = 'rounded-card border border-border bg-surface p-5 shadow-card'

export function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center font-bold text-accent-text underline-offset-2 hover:underline"
    >
      {children}
    </button>
  )
}
