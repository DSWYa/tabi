import { clsx } from 'clsx'
import { Ellipsis, Moon, Sun } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Avatar } from '@/components/Avatar'
import { Wordmark } from '@/components/Brand'
import { ItinerarySheetHost } from '@/components/itinerary/ItinerarySheetHost'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { NotificationToaster } from '@/components/notifications/NotificationToaster'
import { PlaceSheetHost } from '@/components/places/PlaceSheetHost'
import { SyncIndicator } from '@/components/sync/SyncIndicator'
import { SkeletonCard } from '@/components/ui/States'
import { Sheet } from '@/components/ui/Sheet'
import { useMe, useSyncedTheme } from '@/lib/members'
import { navFor } from './nav'
import { QuickAdd } from './QuickAdd'

function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPreference } = useSyncedTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} mode`}
      className={clsx('grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text', className)}
    >
      {resolved === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  )
}

function MeLink({ compact }: { compact?: boolean }) {
  const { me } = useMe()
  if (!me) return null
  return (
    <Link
      to="/settings"
      aria-label={compact ? `Your profile (${me.display_name})` : undefined}
      className={clsx('flex min-h-11 items-center gap-2.5 rounded-full hover:bg-surface-2', compact ? 'size-11 justify-center' : 'min-w-0 flex-1 pr-3 pl-1')}
    >
      <Avatar profile={me} className={compact ? 'size-8 text-sm' : 'size-9 text-sm'} />
      {!compact && <span className="truncate text-sm font-extrabold">{me.display_name}</span>}
    </Link>
  )
}

function Sidebar() {
  const { isAdmin } = useMe()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/60 px-4 py-5 lg:flex">
      <div className="mb-6 flex items-center justify-between gap-2 pl-2">
        <Wordmark />
        <NotificationBell />
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {navFor(isAdmin).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold transition',
                isActive ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-text',
              )
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <SyncIndicator className="mb-3 self-start" />
      <div className="flex items-center gap-1 border-t border-border pt-3">
        <MeLink />
        <ThemeToggle />
      </div>
    </aside>
  )
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation()
  const { isAdmin } = useMe()
  const items = navFor(isAdmin)
  const inMore = items.some((item) => !item.primary && pathname.startsWith(item.to) && item.to !== '/')
  const tab = 'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-bold transition'
  const pill = 'grid h-8 w-14 place-items-center rounded-full transition'

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-lg">
        {items.filter((item) => item.primary).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => clsx(tab, isActive ? 'text-accent-text' : 'text-muted')}>
            {({ isActive }) => (
              <>
                <span className={clsx(pill, isActive && 'bg-accent-soft')}>
                  <Icon className="size-[22px]" aria-hidden />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} className={clsx(tab, inMore ? 'text-accent-text' : 'text-muted')} aria-haspopup="dialog">
          <span className={clsx(pill, inMore && 'bg-accent-soft')}>
            <Ellipsis className="size-[22px]" aria-hidden />
          </span>
          More
        </button>
      </div>
    </nav>
  )
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { isAdmin } = useMe()
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <div className="grid grid-cols-2 gap-3">
        {navFor(isAdmin).filter((item) => !item.primary).map(({ to, label, icon: Icon }) => (
          <button
            key={to}
            type="button"
            onClick={() => {
              onClose()
              navigate(to)
            }}
            className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-border bg-bg p-3.5 text-left font-bold hover:bg-surface-2"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text">
              <Icon className="size-5" aria-hidden />
            </span>
            {label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function AppShell() {
  const [moreOpen, setMoreOpen] = useState(false)
  // The whiteboard is a full-screen canvas: no page padding, no scrolling page, no floating "+" over its toolbar.
  const fullBleed = useLocation().pathname.startsWith('/whiteboard')

  return (
    <div className={clsx('flex', fullBleed ? 'h-dvh' : 'min-h-dvh')}>
      <a href="#main" className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <div className="py-2.5">
            <Wordmark />
          </div>
          <div className="flex items-center gap-0.5">
            <SyncIndicator compact />
            <NotificationBell />
            <ThemeToggle />
            <MeLink compact />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className={clsx(
            'w-full flex-1 outline-none',
            fullBleed
              ? 'relative min-h-0 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0'
              : 'mx-auto max-w-5xl px-4 pt-5 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16',
          )}
        >
          <Suspense fallback={<SkeletonCard lines={5} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {!fullBleed && <QuickAdd />}
      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <PlaceSheetHost />
      <ItinerarySheetHost />
      <NotificationToaster />
    </div>
  )
}
