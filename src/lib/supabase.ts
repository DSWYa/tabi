import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

// The publishable key is public by design; Postgres RLS is what protects data.
// PKCE: email links come back as `?code=…`, which doesn't collide with the hash router's `#/…`.
export const supabase = createClient<Database>(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tabi.auth', flowType: 'pkce' },
})

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Profile = Tables<'profiles'>
export type Trip = Tables<'trip'>

/** Public URL for an object in a public bucket (paths are unguessable; see ARCHITECTURE.md). */
export function publicUrl(bucket: 'avatars' | 'whiteboard', path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
