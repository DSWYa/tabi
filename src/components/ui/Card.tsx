import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('rounded-card border border-border bg-surface p-4 shadow-card sm:p-5', className)}
      {...props}
    />
  )
}

export function CardHeader({ title, icon, action }: { title: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</span>}
      <h2 className="flex-1 text-base font-extrabold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}
