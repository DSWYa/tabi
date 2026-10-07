import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from './auth'
import type { NotificationKind } from './constants'
import { ensureAffected } from './places'
import { supabase, type Tables } from './supabase'

// Notifications are written by database triggers, one row per recipient, only for kinds the member left switched on
// (see the Phase 5 migration). Here we read them, mark them read and clear them. RLS shows each member only theirs.
// Realtime (useCoreRealtime) invalidates the list and announces new ones (NotificationToaster).

export const notificationsKey = (uid: string | undefined) => ['notifications', uid] as const

export type AppNotification = Omit<Tables<'notifications'>, 'kind'> & { kind: NotificationKind }

const LIMIT = 100

export function useNotifications() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useQuery({
    queryKey: notificationsKey(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(LIMIT)
      if (error) throw error
      return data as AppNotification[]
    },
  })
}

export function useUnreadCount(): number {
  const { data = [] } = useNotifications()
  return data.filter((n) => !n.read_at).length
}

/** Today / Yesterday / Earlier, newest first inside each group. */
export function groupNotifications(list: AppNotification[], now: Date = new Date()): { label: string; items: AppNotification[] }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const groups: Record<string, AppNotification[]> = { Today: [], Yesterday: [], Earlier: [] }
  for (const n of [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const t = new Date(n.created_at).getTime()
    groups[t >= startOfToday ? 'Today' : t >= startOfToday - 86_400_000 ? 'Yesterday' : 'Earlier'].push(n)
  }
  return Object.entries(groups).filter(([, items]) => items.length).map(([label, items]) => ({ label, items }))
}

/** Only in-app paths ("/places?place=…"); anything else is ignored rather than followed. */
export function safeAppLink(link: string | null): string | null {
  return link && /^\/(?!\/)[\w\-/?=&.%]*$/.test(link) ? link : null
}

function useNotificationsCache() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const key = notificationsKey(session?.user.id)
  return {
    key,
    async patch(change: (rows: AppNotification[]) => AppNotification[]) {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AppNotification[]>(key)
      queryClient.setQueryData<AppNotification[]>(key, (rows) => (rows ? change(rows) : rows))
      return { previous }
    },
    restore(context: { previous?: AppNotification[] } | undefined) {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    invalidate: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}

/** Mark some (or, with `ids: 'all'`, every unread) notification as read. Optimistic. */
export function useMarkRead() {
  const cache = useNotificationsCache()
  return useMutation({
    mutationFn: async (ids: string[] | 'all') => {
      const query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
      const { error } = ids === 'all' ? await query : await query.in('id', ids)
      if (error) throw error
    },
    onMutate: (ids) => {
      const now = new Date().toISOString()
      return cache.patch((rows) => rows.map((n) => (!n.read_at && (ids === 'all' || ids.includes(n.id)) ? { ...n, read_at: now } : n)))
    },
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

/** Delete one notification, or (with 'read') everything already read. */
export function useDeleteNotifications() {
  const cache = useNotificationsCache()
  return useMutation({
    mutationFn: async (target: string | 'read') => {
      if (target === 'read') {
        const { error } = await supabase.from('notifications').delete().not('read_at', 'is', null)
        if (error) throw error
        return
      }
      const { data, error } = await supabase.from('notifications').delete().eq('id', target).select('id')
      if (error) throw error
      ensureAffected(data, 'remove this notification')
    },
    onMutate: (target) => cache.patch((rows) => rows.filter((n) => (target === 'read' ? !n.read_at : n.id !== target))),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

// ---- new-notification announcements -----------------------------------------------------------

type Listener = (n: AppNotification) => void
const listeners = new Set<Listener>()

/** Called by the realtime channel for each new notification row. */
export function announceNotification(n: AppNotification) {
  for (const listener of listeners) listener(n)
}

export function useNotificationAnnouncements(listener: Listener) {
  useEffect(() => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }, [listener])
}

// ---- reservation reminders ----------------------------------------------------------------------

const REMINDER_KEY = 'tabi.remindersCheckedAt'
const REMINDER_EVERY_MS = 60 * 60 * 1000

/**
 * Reservation reminders need no server scheduler: any member's app asks the database (at most hourly per device)
 * to announce reservations happening today or tomorrow; the database sends each one only once.
 */
export function useReservationReminders() {
  const { session } = useAuth()
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    const run = () => {
      if (navigator.onLine === false) return
      try {
        const last = Number(localStorage.getItem(REMINDER_KEY) ?? 0)
        if (Date.now() - last < REMINDER_EVERY_MS) return
        localStorage.setItem(REMINDER_KEY, String(Date.now()))
      } catch {
        // storage unavailable: still fine to ask (the database dedupes)
      }
      void supabase.rpc('send_reservation_reminders')
    }
    run()
    const timer = setInterval(run, REMINDER_EVERY_MS)
    return () => clearInterval(timer)
  }, [uid])
}
