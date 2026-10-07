import { Bell, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { safeAppLink, useMarkRead, useNotificationAnnouncements, type AppNotification } from '@/lib/notifications'
import { notificationIcons } from './kindIcons'

const SHOW_MS = 7000

/** A brief, polite heads-up when a notification arrives while the app is open. */
export function NotificationToaster() {
  // Remembers the page it arrived on: moving to another page dismisses it.
  const [toast, setToast] = useState<{ n: AppNotification; at: string } | null>(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const markRead = useMarkRead()

  const show = useCallback(
    (n: AppNotification) => {
      // Already looking at the list: no need for the heads-up.
      if (pathname !== '/notifications') setToast({ n, at: pathname })
    },
    [pathname],
  )
  useNotificationAnnouncements(show)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), SHOW_MS)
    return () => clearTimeout(t)
  }, [toast])

  const current = toast && toast.at === pathname ? toast.n : null
  const Icon = current ? notificationIcons[current.kind] ?? Bell : Bell
  const link = current ? safeAppLink(current.link) : null

  return (
    // The live region always exists so screen readers pick up what's put into it.
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 flex justify-center px-4 lg:top-4 lg:right-4 lg:left-auto">
      {current && (
        <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card animate-rise">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
            <Icon className="size-5" aria-hidden />
          </span>
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 text-left"
            onClick={() => {
              setToast(null)
              void markRead.mutateAsync([current.id]).catch(() => undefined)
              navigate(link ?? '/notifications')
            }}
          >
            <span className="block text-sm font-extrabold break-words">{current.title}</span>
            {current.body && <span className="line-clamp-2 block text-xs text-muted">{current.body}</span>}
          </button>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="-m-1 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
