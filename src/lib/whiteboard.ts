import type { Json } from './database.types'
import { publicUrl, supabase } from './supabase'
import { imageExtension, type FileMap, type SceneElement } from './whiteboardSync'

// Data access for the single shared whiteboard row (id = 1) and its images in the `whiteboard` bucket.
// Saves use optimistic concurrency on `version` (bumped by the whiteboard_touch trigger): a save only lands if
// nobody saved in between; otherwise the caller merges the newer row and tries again — no lost strokes.

export interface WhiteboardRow {
  elements: SceneElement[]
  files: FileMap
  version: number
  updated_at: string
  updated_by: string | null
}

export async function fetchWhiteboard(): Promise<WhiteboardRow> {
  const { data, error } = await supabase.from('whiteboard').select('elements, files, version, updated_at, updated_by').eq('id', 1).single()
  if (error) throw error
  return {
    elements: Array.isArray(data.elements) ? (data.elements as unknown as SceneElement[]) : [],
    files: data.files && typeof data.files === 'object' && !Array.isArray(data.files) ? (data.files as unknown as FileMap) : {},
    version: data.version,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  }
}

/** The new version, or null when someone else saved first (or RLS refused the write). */
export async function saveWhiteboard(elements: readonly SceneElement[], files: FileMap, baseVersion: number): Promise<number | null> {
  const { data, error } = await supabase
    .from('whiteboard')
    .update({ elements: elements as unknown as NonNullable<Json>, files: files as unknown as NonNullable<Json> })
    .eq('id', 1)
    .eq('version', baseVersion)
    .select('version')
  if (error) throw error
  return data.length ? data[0].version : null
}

/** Upload an image as `<uuid>.<ext>` (the only names the bucket policy accepts). */
export async function uploadWhiteboardImage(blob: Blob, mimeType: string): Promise<{ path: string; mimeType: string }> {
  const ext = imageExtension(mimeType)
  if (!ext) throw new Error('Only JPG, PNG, WebP or GIF images can go on the whiteboard.')
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('whiteboard').upload(path, blob, { contentType: mimeType, cacheControl: '31536000', upsert: false })
  if (error) throw error
  return { path, mimeType }
}

export function whiteboardImageUrl(path: string): string {
  return publicUrl('whiteboard', path)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'))
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}
