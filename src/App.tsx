import { lazy, useEffect, useRef } from 'react'
import { createHashRouter, Navigate, Outlet } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Logo } from '@/components/Brand'
import { ErrorState } from '@/components/ui/States'
import { AppShell } from '@/layout/AppShell'
import { useAuth } from '@/lib/auth'
import { useGeocodePendingPlaces } from '@/lib/geocodeWorker'
import { accessFor, clearJoinIntent } from '@/lib/join'
import { useMe } from '@/lib/members'
import { useCoreRealtime } from '@/lib/realtime'
import { useTheme } from '@/lib/theme'
import Admin from '@/pages/Admin'
import Dashboard from '@/pages/Dashboard'
import Gate from '@/pages/Gate'
import Itinerary from '@/pages/Itinerary'
import JoinFamily from '@/pages/JoinFamily'
import Places from '@/pages/Places'
import Plans from '@/pages/Plans'
import Settings from '@/pages/Settings'
import TravelInfo from '@/pages/TravelInfo'
import Voting from '@/pages/Voting'

// Heavy features are split into their own chunks.
const MapPage = lazy(() => import('@/pages/MapPage'))
const Whiteboard = lazy(() => import('@/pages/Whiteboard'))

function Splash() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-dvh place-items-center">
      <Logo className="size-16 animate-shimmer" />
    </div>
  )
}

/** Per-member background work: live data, pinning new places, and applying the theme saved on the profile. */
function MemberRuntime({ theme }: { theme: string }) {
  useCoreRealtime()
  useGeocodePendingPlaces()
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
  const { session, loading, signOut } = useAuth()
  const { me, isPending, isError, refetch } = useMe()
  const access = accessFor({ authLoading: loading, hasSession: Boolean(session), profileLoading: isPending, hasProfile: Boolean(me) })

  if (access === 'loading') return <Splash />
  if (access === 'signed-out') return <Gate />
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
          { path: 'settings', element: <Settings /> },
          { path: 'admin', element: <Admin /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
