import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuth } from './auth'
import { supabase, type Profile } from './supabase'
import { useTheme, type ThemePreference } from './theme'

// The whole family is four rows, so one query serves the member list *and* "who am I".
// RLS returns every profile to members and nothing to non-members.
export const membersKey = (uid: string | undefined) => ['profiles', uid] as const

export function useMembers() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useQuery({
    queryKey: membersKey(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useMe() {
  const { session } = useAuth()
  const query = useMembers()
  const me = query.data?.find((p) => p.id === session?.user.id) ?? null
  return { ...query, me, isAdmin: me?.role === 'admin' }
}

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'avatar_path' | 'pin_color' | 'theme' | 'notification_prefs'>>

/** Update the signed-in member's own row. Optimistic so toggles and pickers feel instant. */
export function useUpdateMyProfile() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const uid = session?.user.id
  const key = membersKey(uid)

  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (!uid) throw new Error('Not signed in')
      const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
      if (error) throw error
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Profile[]>(key)
      queryClient.setQueryData<Profile[]>(key, (rows) => rows?.map((p) => (p.id === uid ? { ...p, ...patch } : p)))
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

/** Theme preference that also follows the member across devices (saved on their profile). */
export function useSyncedTheme() {
  const theme = useTheme()
  const { me } = useMe()
  const update = useUpdateMyProfile()
  const { mutate } = update

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      theme.setPreference(pref)
      if (me && me.theme !== pref) mutate({ theme: pref })
    },
    [theme, me, mutate],
  )
  return { preference: theme.preference, resolved: theme.resolved, setPreference }
}
