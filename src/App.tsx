import { lazy, useEffect, useRef } from 'react'
import { createHashRouter, Navigate, Outlet } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Logo } from '@/components/Brand'
import { ErrorState } from '@/components/ui/States'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { AppShell } from '@/layout/AppShell'
import { useAuth } from '@/lib/auth'
import { useGeocodePendingPlaces } from '@/lib/geocodeWorker'
import { accessFor, clearJoinIntent } from '@/lib/join'
import { useMe } from '@/lib/members'
import { useReservationReminders } from '@/lib/notifications'
import { useOutboxSync } from '@/lib/outboxRuntime'
import { useCoreRealtime } from '@/lib/realtime'
import { useStorageCleanup } from '@/lib/storageCleanup'
import { useTheme } from '@/lib/theme'
import Dashboard from '@/pages/Dashboard'
import Gate from '@/pages/Gate'
import JoinFamily from '@/pages/JoinFamily'
import Places from '@/pages/Places'
import ResetPassword from '@/pages/ResetPassword'

// Heavy features are split into their own chunks, and so are the less-visited pages (keeps the first load small; the
// service worker precaches them all, so they still open offline).
const MapPage = lazy(() => import('@/pages/MapPage'))
const Whiteboard = lazy(() => import('@/pages/Whiteboard'))
const Itinerary = lazy(() => import('@/pages/Itinerary'))
const Voting = lazy(() => import('@/pages/Voting'))
const Plans = lazy(() => import('@/pages/Plans'))
const TravelInfo = lazy(() => import('@/pages/TravelInfo'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Settings = lazy(() => import('@/pages/Settings'))
const Admin = lazy(() => import('@/pages/Admin'))

function Splash() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-dvh place-items-center">
      <Logo className="size-16 animate-shimmer" />
    </div>
  )
}

/** Per-member background work: live data, sending queued offline changes, reservation reminders, pinning new places,
 * tidying unused files, and applying the theme saved on the profile. */
function MemberRuntime({ theme }: { theme: string }) {
  useCoreRealtime()
  useOutboxSync()
  useReservationReminders()
  useGeocodePendingPlaces()
  useStorageCleanup()
  const { setPreference } = useTheme()
  const applied = useRef<string | null>(null)

  useEffect(() => {
    clearJoinIntent()
  }, [])

  useEffect(() => {
    if (applied.current === theme) return
    applied.current = theme
    if (theme === 'light' || theme === 'dark' || theme === 'system') setPreference(theme)
  }, [theme, setPreference])

  return null
}

/** Nothing below this renders unless the visitor is signed in *and* a family member (has a profile). */
function RequireMember() {
  const { session, loading, recovering, signOut } = useAuth()
  const { me, isPending, isError, refetch } = useMe()
  const access = accessFor({ authLoading: loading, hasSession: Boolean(session), profileLoading: isPending, hasProfile: Boolean(me) })

  if (access === 'loading') return <Splash />
  if (access === 'signed-out') return <Gate />
  // Arrived through a password-reset link: set the new password before anything else.
  if (recovering) return <ResetPassword />
  // A failed *refetch* keeps the cached profile, so only a first-load failure lands here.
  if (access === 'needs-join' && isError) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div>
          <ErrorState message="We couldn't load your family profile." onRetry={() => void refetch()} />
          <button type="button" onClick={() => void signOut()} className="mx-auto block min-h-11 font-bold text-accent-text">
            Sign out
          </button>
        </div>
      </div>
    )
  }
  if (access === 'needs-join') return <JoinFamily />
  return (
    <>
      <MemberRuntime theme={me!.theme} />
      <Outlet />
    </>
  )
}

// Hash routing: GitHub Pages serves only index.html, so /#/places survives refreshes.
const router = createHashRouter([
  {
    element: <RequireMember />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'places', element: <Places /> },
          { path: 'voting', element: <Voting /> },
          { path: 'plans', element: <Plans /> },
          { path: 'itinerary', element: <Itinerary /> },
          { path: 'map', element: <MapPage /> },
          { path: 'whiteboard', element: <Whiteboard /> },
          { path: 'info', element: <TravelInfo /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'settings', element: <Settings /> },
          { path: 'admin', element: <Admin /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </>
  )
}
