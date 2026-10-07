import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from './auth'
import { itineraryKey } from './itinerary'
import { announceNotification, notificationsKey, type AppNotification } from './notifications'
import { placesKey, votesKey } from './places'
import { suggestionsKey } from './suggestions'
import { supabase } from './supabase'
import { travelKey } from './travelInfo'
import { tripKey } from './trip'

/**
 * Keeps members, trip, places, votes, the itinerary, suggestions, Travel Info, my notifications and (for admins) the
 * family invite live (the whiteboard has its own channel). Realtime respects RLS; any change simply refetches the
 * (tiny) query, so we never have to merge partial payloads by hand.
 */
export function useCoreRealtime() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const uid = session?.user.id

  useEffect(() => {
    if (!uid) return
    let connectedBefore = false
    const channel = supabase
      .channel('core-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['profiles'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip' }, () => {
        queryClient.invalidateQueries({ queryKey: tripKey })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'places' }, () => {
        queryClient.invalidateQueries({ queryKey: placesKey })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        queryClient.invalidateQueries({ queryKey: votesKey })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_items' }, () => {
        queryClient.invalidateQueries({ queryKey: itineraryKey })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_suggestions' }, () => {
        queryClient.invalidateQueries({ queryKey: suggestionsKey })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'travel_sections' }, () => {
        queryClient.invalidateQueries({ queryKey: travelKey })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload) => {
        queryClient.invalidateQueries({ queryKey: notificationsKey(uid) })
        if (payload.eventType === 'INSERT') announceNotification(payload.new as AppNotification)
      })
      // Only admins can read the invite row, so only they get these events.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_invite' }, () => {
        queryClient.invalidateQueries({ queryKey: ['family_invite'] })
      })
      .subscribe((status) => {
        // After a dropped connection we may have missed events: refetch everything once we're back.
        if (status === 'SUBSCRIBED' && connectedBefore) void queryClient.invalidateQueries()
        if (status === 'SUBSCRIBED') connectedBefore = true
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [uid, queryClient])
}
