import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { clearJoinIntent } from './join'
import { outbox } from './outboxRuntime'
import { claimCache, clearPersistedCache } from './queryPersist'
import { isSupabaseConfigured, supabase } from './supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  /** Signed in through a password-reset link: the app asks for a new password first. */
  recovering: boolean
  finishRecovery: () => void
  signOut: () => Promise<void>
}

// Registered at import time, in the same tick the Supabase client is created: the reset link's `?code=` is exchanged
// while the client initializes, and its PASSWORD_RECOVERY event could otherwise fire before React subscribes.
let recoveryPending = false
const recoveryListeners = new Set<() => void>()
function setRecoveryPending(value: boolean) {
  recoveryPending = value
  for (const listener of recoveryListeners) listener()
}
const recovery = {
  subscribe(listener: () => void) {
    recoveryListeners.add(listener)
    return () => void recoveryListeners.delete(listener)
  },
  get: () => recoveryPending,
}
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true)
  })
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const recovering = useSyncExternalStore(recovery.subscribe, recovery.get, recovery.get)
  const finishRecovery = useCallback(() => setRecoveryPending(false), [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    // The saved session (localStorage) is restored here, so returning users skip the gate.
    // Never let one account's cached data or unsent changes (memory or IndexedDB) leak into the next sign-in on a
    // shared device.
    const forget = () => Promise.all([clearPersistedCache(queryClient), outbox.clear()])
    const adopt = (next: Session | null) => {
      if (next && claimCache(next.user.id)) void forget().then(() => claimCache(next.user.id))
      setSession(next)
    }
    supabase.auth.getSession().then(({ data }) => {
      adopt(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        void forget()
        finishRecovery()
      }
      adopt(next)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient, finishRecovery])

  const signOut = useCallback(async () => {
    clearJoinIntent()
    const { error } = await supabase.auth.signOut()
    // If the server can't be reached, still forget the session on this device.
    if (error) await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const value = useMemo(
    () => ({ session, loading, recovering, finishRecovery, signOut }),
    [session, loading, recovering, finishRecovery, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
