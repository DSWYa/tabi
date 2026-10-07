import { LIMITS } from './constants'

// Pure sync rules for the shared whiteboard (no Excalidraw import, so they're cheap to unit test).
//
// Every Excalidraw element carries `version` (bumped on each edit) and a random `versionNonce`. Two copies of a
// scene merge element by element: the higher version wins; on a tie the lower nonce wins (Excalidraw's own rule,
// so every client converges on the same answer). Deleted elements stay as tombstones (`isDeleted: true`) so a
// delete beats an older copy elsewhere; very old tombstones are pruned when saving.

export interface SceneElement {
  id: string
  version: number
  versionNonce: number
  isDeleted?: boolean
  /** Fractional z-order key (Excalidraw ≥ 0.17); strings compare in order. */
  index?: string | null
  /** Last-edit timestamp (ms). */
  updated?: number
  type?: string
  fileId?: string | null
}

export interface StoredFile {
  path: string
  mimeType: string
}
export type FileMap = Record<string, StoredFile>

/** Keep our copy? Same rule as Excalidraw's reconcile, plus "never yank what this user is editing right now". */
export function keepLocal(local: SceneElement, remote: SceneElement, editingIds: ReadonlySet<string>): boolean {
  return (
    editingIds.has(local.id)
    || local.version > remote.version
    || (local.version === remote.version && local.versionNonce <= remote.versionNonce)
  )
}

/** Order by fractional index when every element has one; otherwise keep the merged order (Excalidraw repairs it). */
export function orderByIndex<T extends SceneElement>(elements: T[]): T[] {
  if (!elements.every((e) => typeof e.index === 'string')) return elements
  return [...elements].sort((a, b) => (a.index! < b.index! ? -1 : a.index! > b.index! ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Merge remote elements into the local scene.
 * `adopted` are the remote elements that won (callers mark them as already shared, so they aren't echoed back).
 */
export function reconcileElements<T extends SceneElement>(
  local: readonly T[],
  remote: readonly T[],
  editingIds: ReadonlySet<string> = new Set(),
): { elements: T[]; adopted: T[]; changed: boolean } {
  const merged = new Map<string, T>()
  for (const el of local) merged.set(el.id, el)
  const adopted: T[] = []
  for (const el of remote) {
    const mine = merged.get(el.id)
    if (mine && keepLocal(mine, el, editingIds)) continue
    merged.set(el.id, el) // an existing key keeps its position
    adopted.push(el)
  }
  return { elements: orderByIndex([...merged.values()]), adopted, changed: adopted.length > 0 }
}

/** Elements whose version differs from what we last shared (sent or received). */
export function changedSince<T extends SceneElement>(elements: readonly T[], shared: ReadonlyMap<string, number>): T[] {
  return elements.filter((e) => shared.get(e.id) !== e.version)
}

export function markShared(shared: Map<string, number>, elements: readonly SceneElement[]): void {
  for (const e of elements) shared.set(e.id, e.version)
}

/** Changes whenever any element changes (versions only ever go up). */
export function sceneHash(elements: readonly SceneElement[]): string {
  let sum = 0
  for (const e of elements) sum += e.version
  return `${elements.length}:${sum}`
}

export const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000

/** Drop deleted elements nobody has touched for a day: long enough for every device to have seen the delete. */
export function pruneTombstones<T extends SceneElement>(elements: readonly T[], now: number, ttl = TOMBSTONE_TTL_MS): T[] {
  return elements.filter((e) => !(e.isDeleted && typeof e.updated === 'number' && now - e.updated > ttl))
}

/** The stored-file entries still referenced by an image element (deleted ones included, so undo still works). */
export function filesFor(elements: readonly SceneElement[], known: FileMap): FileMap {
  const out: FileMap = {}
  for (const e of elements) {
    if (e.type === 'image' && e.fileId && known[e.fileId]) out[e.fileId] = known[e.fileId]
  }
  return out
}

const IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'webp' | 'gif'> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
}

export function imageExtension(mimeType: string): 'png' | 'jpg' | 'webp' | 'gif' | null {
  return IMAGE_TYPES[mimeType] ?? null
}

/** Friendly problem with an image before upload, or null when it's fine (the bucket re-checks both). */
export function checkWhiteboardImage(file: { type: string; size: number }): string | null {
  if (!imageExtension(file.type)) return 'Only JPG, PNG, WebP or GIF images can go on the whiteboard.'
  if (file.size > LIMITS.whiteboardImageBytes) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the whiteboard limit is 5 MB. Try a smaller copy or a screenshot.`
  }
  return null
}

/**
 * Split elements into broadcast-sized batches (Realtime messages have a size cap). An element too big for any
 * batch (a huge freehand stroke) is returned in `oversized`; it reaches others through the saved row instead.
 */
export function batchesFor<T extends SceneElement>(elements: readonly T[], maxBytes: number): { batches: T[][]; oversized: T[] } {
  const batches: T[][] = []
  const oversized: T[] = []
  let current: T[] = []
  let size = 0
  for (const el of elements) {
    const bytes = JSON.stringify(el).length
    if (bytes > maxBytes) {
      oversized.push(el)
      continue
    }
    if (size + bytes > maxBytes && current.length) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(el)
    size += bytes
  }
  if (current.length) batches.push(current)
  return { batches, oversized }
}
