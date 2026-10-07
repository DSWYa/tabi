import { RefreshCw, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/Button'

const CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * Registers the service worker (production builds only) and offers a reload when a new version is ready.
 * We never reload on our own: someone may be halfway through a form.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // An installed app can stay open for days; look for a new version every hour.
      if (registration) setInterval(() => void registration.update().catch(() => undefined), CHECK_EVERY_MS)
    },
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 6000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6">
      <div role="status" className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-3 pl-4 shadow-card animate-rise">
        {needRefresh ? (
          <>
            <RefreshCw className="size-5 shrink-0 text-accent-text" aria-hidden />
            <p className="flex-1 text-sm font-bold">A new version of Tabi is ready.</p>
            <Button
              size="sm"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void updateServiceWorker(true)
              }}
            >
              Reload
            </Button>
            <button type="button" onClick={() => setNeedRefresh(false)} aria-label="Later" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2">
              <X className="size-5" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <WifiOff className="size-5 shrink-0 text-ok-fg" aria-hidden />
            <p className="flex-1 text-sm font-bold">Tabi now opens even without a connection.</p>
          </>
        )}
      </div>
    </div>
  )
}
