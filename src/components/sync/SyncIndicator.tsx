import { clsx } from 'clsx'
import { AlertTriangle, CloudOff, CloudUpload, Loader2, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useAuth } from '@/lib/auth'
import { timeAgo } from '@/lib/format'
import { outbox, useOnline, useOutbox, useOutboxSyncing } from '@/lib/outboxRuntime'

/**
 * "Offline" / "Pending sync" / "Couldn't sync" chip for the header and sidebar. Hidden when everything is sent.
 * Opens a sheet listing what's waiting and anything the server refused.
 */
export function SyncIndicator({ compact, className }: { compact?: boolean; className?: string }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const { ops, failures } = useOutbox()
  const online = useOnline()
  const syncing = useOutboxSyncing()
  const [open, setOpen] = useState(false)
  const mine = ops.filter((o) => o.userId === uid)

  if (online && mine.length === 0 && failures.length === 0) return null

  const state = failures.length ? 'failed' : mine.length ? 'pending' : 'offline'
  const Icon = state === 'failed' ? AlertTriangle : state === 'pending' ? (syncing && online ? Loader2 : CloudUpload) : CloudOff
  const text = state === 'failed' ? 'Sync problem' : state === 'pending' ? `Pending sync · ${mine.length}` : 'Offline'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={compact ? text : undefined}
        title={compact ? text : undefined}
        className={clsx(
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-extrabold whitespace-nowrap',
          state === 'failed' ? 'bg-bad-bg text-bad-fg' : state === 'pending' ? 'bg-warn-bg text-warn-fg' : 'bg-surface-2 text-muted',
          className,
        )}
      >
        <Icon className={clsx('size-4', Icon === Loader2 && 'animate-spin')} aria-hidden />
        {compact ? state === 'pending' && <span aria-hidden>{mine.length}</span> : text}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sync">
        <p role="status" className="mb-4 text-sm text-muted">
          {!online
            ? 'You’re offline. Tabi shows what it saved last time, and changes you make are kept on this device and sent automatically when you’re back.'
            : mine.length
              ? syncing ? 'Sending your changes…' : 'These changes are waiting to be sent.'
              : 'Everything you changed has been sent.'}
        </p>

        {mine.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-sm font-extrabold">Waiting to sync ({mine.length})</h3>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {mine.map((op) => (
                <li key={op.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <CloudUpload className="size-4 shrink-0 text-warn-fg" aria-hidden />
                  <span className="min-w-0 flex-1 font-bold break-words">{op.label}</span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(op.queuedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {failures.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-sm font-extrabold">Couldn’t be saved</h3>
            <ul className="grid gap-2">
              {failures.map((f) => (
                <li key={f.id} className="flex items-start gap-3 rounded-2xl bg-bad-bg p-3 text-sm text-bad-fg">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold break-words">{f.label}</span>
                    <span className="block">{f.message}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void outbox.dismissFailure(f.id)}
                    aria-label={`Dismiss: ${f.label}`}
                    className="-m-1.5 grid size-11 shrink-0 place-items-center rounded-full hover:bg-bad-fg/10"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {mine.length > 0 && (
            <Button variant="secondary" disabled={!online || syncing || !uid} onClick={() => uid && void outbox.flush(uid)}>
              <RefreshCw className={clsx('size-4', syncing && 'animate-spin')} aria-hidden />
              Sync now
            </Button>
          )}
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </Sheet>
    </>
  )
}
