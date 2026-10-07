import { useEffect } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

// Unused files in Storage: a removed member's avatar, an avatar replaced while offline, whiteboard images nothing on
// the board uses any more. SQL can't delete Storage objects, so the database lists what is safe to delete
// (unused_storage_objects(): admins see everything, members only their own) and we remove it through the Storage
// API, where RLS checks every file again.

type Bucket = 'avatars' | 'whiteboard'
const BATCH = 100

export async function cleanUpUnusedFiles(): Promise<number> {
  const { data, error } = await supabase.rpc('unused_storage_objects')
  if (error) throw error
  const byBucket = new Map<Bucket, string[]>()
  for (const row of data ?? []) {
    if (row.bucket_id !== 'avatars' && row.bucket_id !== 'whiteboard') continue
    byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name])
  }
  let removed = 0
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += BATCH) {
      const { data: gone, error: removeError } = await supabase.storage.from(bucket).remove(names.slice(i, i + BATCH))
      if (removeError) throw removeError
      removed += gone?.length ?? 0
    }
  }
  return removed
}

const LAST_RUN_KEY = 'tabi.storageCleanupAt'
const EVERY_MS = 24 * 60 * 60 * 1000
const START_DELAY_MS = 15_000

/** Tidy up quietly once a day per device, a little after start-up so it never competes with loading the app. */
export function useStorageCleanup() {
  const { session } = useAuth()
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    const timer = setTimeout(() => {
      if (navigator.onLine === false) return
      try {
        if (Date.now() - Number(localStorage.getItem(LAST_RUN_KEY) ?? 0) < EVERY_MS) return
        localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
      } catch {
        return
      }
      void cleanUpUnusedFiles().catch(() => undefined) // best effort; tried again tomorrow
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [uid])
}
