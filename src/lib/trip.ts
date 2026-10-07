import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth'
import { supabase } from './supabase'

export const tripKey = ['trip'] as const

export function useTrip() {
  const { session } = useAuth()
  return useQuery({
    queryKey: tripKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('trip').select('*').eq('id', 1).single()
      if (error) throw error
      return data
    },
  })
}
