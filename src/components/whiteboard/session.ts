import { CaptureUpdateAction, newElementWith, restoreElements } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFileData, BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  blobToDataUrl, dataUrlToBlob, fetchWhiteboard, saveWhiteboard, uploadWhiteboardImage, whiteboardImageUrl, type WhiteboardRow,
} from '@/lib/whiteboard'
import {
  batchesFor, changedSince, checkWhiteboardImage, filesFor, markShared, pruneTombstones, reconcileElements, sceneHash,
  type FileMap, type SceneElement,
} from '@/lib/whiteboardSync'

// One live editing session on the shared board.
//  * Live: changed elements go out over a private Realtime broadcast channel (members only, see the Phase 4
//    migration) and are merged into everyone else's scene with element-version reconciliation.
//  * Durable: the scene is saved (debounced) to the whiteboard row with optimistic concurrency on `version`;
//    on a conflict we pull the newer row, merge, and save again. Others pick saves up via postgres_changes,
//    which also covers anything missed while offline or before joining.
//  * Images: uploaded once to the `whiteboard` bucket; only { fileId: { path, mimeType } } goes in the row.

export type SyncStatus = 'connecting' | 'live' | 'saving' | 'saved' | 'offline' | 'error'

export interface Presence {
  id: string
  name: string
  color: string
}

type Element = OrderedExcalidrawElement
type Remote = { id: string; name: string; color: string; pointer: { x: number; y: number; tool: 'pointer' | 'laser' }; button: 'up' | 'down' }

const CHANNEL = 'whiteboard'
const BROADCAST_EVERY_MS = 60
const POINTER_EVERY_MS = 60
const SAVE_DEBOUNCE_MS = 1500
const SAVE_MAX_WAIT_MS = 6000
const RETRY_SAVE_MS = 10_000
const MAX_BROADCAST_BYTES = 180_000
const CURSOR_STALE_MS = 30_000

// supabase.channel(topic) hands back an existing channel with that topic, even one that is still leaving, so a
// quick remount (StrictMode, or popping back to the board) must wait for the previous teardown to finish.
let previousTeardown: Promise<unknown> = Promise.resolve()

export class WhiteboardSession {
  private readonly api: ExcalidrawImperativeAPI
  private readonly me: Presence
  private readonly onStatus: (status: SyncStatus) => void
  private readonly onNotice: (message: string) => void
  private readonly onPeers: (peers: Presence[]) => void

  private channel: RealtimeChannel | null = null
  private started = false
  private stopped = false
  private connectedBefore = false
  /** element id → version that the others already have (sent or received). */
  private shared = new Map<string, number>()
  private version: number
  private files: FileMap
  private loadedFiles = new Set<string>()
  private uploading = new Set<string>()
  private savedHash: string
  private pendingBroadcast = new Map<string, Element>()
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private dirtySince: number | null = null
  private saving: Promise<void> | null = null
  private saveAgain = false
  private pulling: Promise<void> = Promise.resolve()
  private lastPointerAt = 0
  private peers = new Map<string, Remote & { seen: number }>()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private status: SyncStatus = 'connecting'

  constructor(opts: {
    api: ExcalidrawImperativeAPI
    row: WhiteboardRow
    me: Presence
    onStatus: (status: SyncStatus) => void
    onNotice: (message: string) => void
    onPeers: (peers: Presence[]) => void
  }) {
    this.api = opts.api
    this.me = opts.me
    this.onStatus = opts.onStatus
    this.onNotice = opts.onNotice
    this.onPeers = opts.onPeers
    this.version = opts.row.version
    this.files = { ...opts.row.files }
    markShared(this.shared, opts.row.elements)
    this.savedHash = sceneHash(opts.row.elements)
  }

  /** Called once Excalidraw has finished loading the initial scene (see handleChange). */
  private start(elements: readonly Element[]) {
    this.started = true
    this.savedHash = sceneHash(elements)
    void this.loadFiles(this.files)
    void previousTeardown.then(() => this.connect())
    this.sweepTimer = setInterval(() => this.sweepPeers(), 5000)
    window.addEventListener('pagehide', this.flush)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** Start now if Excalidraw already loaded the scene before this session existed. */
  attach() {
    if (!this.started && !this.api.getAppState().isLoading) this.start(this.scene())
  }

  private connect() {
    if (this.stopped) return
    this.channel = supabase
      .channel(CHANNEL, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'elements' }, ({ payload }) => this.receiveElements(payload?.elements))
      .on('broadcast', { event: 'files' }, ({ payload }) => this.receiveFiles(payload?.files))
      .on('broadcast', { event: 'pointer' }, ({ payload }) => this.receivePointer(payload as Remote))
      .on('broadcast', { event: 'leave' }, ({ payload }) => this.dropPeer(String(payload?.id ?? '')))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whiteboard' }, () => void this.pull())
      .subscribe((state) => {
        if (this.stopped) return
        if (state === 'SUBSCRIBED') {
          // Back after a drop: whatever we missed is in the saved row.
          if (this.connectedBefore) void this.pull()
          this.connectedBefore = true
          this.setStatus(this.dirtySince ? 'saving' : 'live')
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          this.setStatus('offline')
        }
      })
  }

  stop() {
    if (this.stopped) return
    if (this.started) this.flush()
    this.stopped = true
    window.removeEventListener('pagehide', this.flush)
    document.removeEventListener('visibilitychange', this.onVisibility)
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer)
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    const channel = this.channel
    if (channel) {
      void channel.send({ type: 'broadcast', event: 'leave', payload: { id: this.me.id } })
      previousTeardown = supabase.removeChannel(channel).catch(() => undefined)
    }
  }

  // ---- local edits ------------------------------------------------------------------

  /** Excalidraw's onChange (fires for every pointer move too, so keep it cheap). */
  handleChange(elements: readonly Element[], appState: AppState, files: BinaryFiles) {
    if (this.stopped) return
    if (!this.started) {
      if (appState.isLoading) return
      this.start(elements)
      return
    }
    for (const [id, file] of Object.entries(files)) {
      if (!this.files[id] && !this.uploading.has(id) && !this.loadedFiles.has(id)) void this.upload(id, file)
    }
    const changed = changedSince(elements, this.shared)
    if (changed.length) {
      for (const el of changed) this.pendingBroadcast.set(el.id, el)
      if (!this.broadcastTimer) this.broadcastTimer = setTimeout(() => this.broadcast(), BROADCAST_EVERY_MS)
    }
    if (sceneHash(elements) !== this.savedHash) this.scheduleSave()
  }

  handlePointer(payload: { pointer: { x: number; y: number; tool: 'pointer' | 'laser' }; button: 'up' | 'down' }) {
    const now = Date.now()
    if (!this.channel || now - this.lastPointerAt < POINTER_EVERY_MS) return
    this.lastPointerAt = now
    void this.channel.send({
      type: 'broadcast',
      event: 'pointer',
      payload: { id: this.me.id, name: this.me.name, color: this.me.color, pointer: payload.pointer, button: payload.button } satisfies Remote,
    })
  }

  /** Add elements made outside the editor (the "Add idea" form) as a normal, undoable edit. */
  addElements(elements: Element[]) {
    this.api.updateScene({ elements: [...this.scene(), ...elements], captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  }

  private broadcast() {
    this.broadcastTimer = null
    const elements = [...this.pendingBroadcast.values()]
    this.pendingBroadcast.clear()
    if (!elements.length || !this.channel) return
    const { batches, oversized } = batchesFor(elements as unknown as SceneElement[], MAX_BROADCAST_BYTES)
    for (const batch of batches) void this.channel.send({ type: 'broadcast', event: 'elements', payload: { elements: batch } })
    markShared(this.shared, elements)
    // Too big to broadcast (a huge freehand stroke): save soon; others get it from the row.
    if (oversized.length) this.scheduleSave(300)
  }

  // ---- remote edits -----------------------------------------------------------------

  private scene(): Element[] {
    return this.api.getSceneElementsIncludingDeleted() as Element[]
  }

  /** Never pull an element out from under the user while they're typing, resizing or drawing it. */
  private editingIds(): Set<string> {
    const s = this.api.getAppState()
    return new Set(
      [s.editingTextElement?.id, s.resizingElement?.id, s.newElement?.id, s.editingLinearElement?.elementId].filter(
        (id): id is string => Boolean(id),
      ),
    )
  }

  private receiveElements(raw: unknown) {
    if (this.stopped || !Array.isArray(raw)) return
    const remote = restoreElements(raw as Element[], null) as Element[]
    const { elements, adopted } = reconcileElements(this.scene(), remote, this.editingIds())
    if (!adopted.length) return
    markShared(this.shared, adopted)
    this.api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })
    void this.loadFiles(this.files)
  }

  private receiveFiles(raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const incoming = raw as FileMap
    let added = false
    for (const [id, file] of Object.entries(incoming)) {
      if (!this.files[id] && typeof file?.path === 'string') {
        this.files[id] = { path: file.path, mimeType: file.mimeType }
        added = true
      }
    }
    if (added) void this.loadFiles(this.files)
  }

  /** Fetch the saved row and merge it (after someone saved, or after reconnecting). Serialized. */
  private pull(): Promise<void> {
    this.pulling = this.pulling.then(async () => {
      if (this.stopped) return
      let row: WhiteboardRow
      try {
        row = await fetchWhiteboard()
      } catch {
        return // offline: the next reconnect pulls again
      }
      if (row.version <= this.version) return
      const cleanBefore = sceneHash(this.scene()) === this.savedHash
      this.version = row.version
      this.receiveFiles(row.files)
      this.receiveElements(row.elements)
      if (cleanBefore) this.savedHash = sceneHash(this.scene())
      else this.scheduleSave()
    })
    return this.pulling
  }

  private receivePointer(p: Remote) {
    if (!p?.id || p.id === this.me.id || !p.pointer) return
    this.peers.set(p.id, { ...p, seen: Date.now() })
    this.renderPeers()
  }

  private dropPeer(id: string) {
    if (this.peers.delete(id)) this.renderPeers()
  }

  private sweepPeers() {
    const now = Date.now()
    let changed = false
    for (const [id, p] of this.peers) if (now - p.seen > CURSOR_STALE_MS) changed = this.peers.delete(id) || changed
    if (changed) this.renderPeers()
  }

  private renderPeers() {
    if (this.stopped) return
    const collaborators = new Map<SocketId, Collaborator>()
    for (const p of this.peers.values()) {
      collaborators.set(p.id as SocketId, {
        id: p.id,
        username: p.name,
        pointer: p.pointer,
        button: p.button,
        color: { background: p.color, stroke: p.color },
      })
    }
    this.api.updateScene({ collaborators, captureUpdate: CaptureUpdateAction.NEVER })
    this.onPeers([...this.peers.values()].map(({ id, name, color }) => ({ id, name, color })))
  }

  // ---- saving -------------------------------------------------------------------------

  private scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (this.stopped) return
    const now = Date.now()
    this.dirtySince ??= now
    if (this.status !== 'offline' && this.status !== 'error') this.setStatus('saving')
    if (this.saveTimer) clearTimeout(this.saveTimer)
    const wait = Math.max(0, Math.min(delay, this.dirtySince + SAVE_MAX_WAIT_MS - now))
    this.saveTimer = setTimeout(() => void this.save(), wait)
  }

  private readonly flush = () => {
    if (this.saveTimer && !this.stopped) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      void this.save()
    }
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.flush()
  }

  private save(): Promise<void> {
    if (this.saving) {
      this.saveAgain = true
      return this.saving
    }
    this.saveTimer = null
    this.saving = (async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          const scene = this.scene()
          const hash = sceneHash(scene)
          const elements = pruneTombstones(scene as unknown as SceneElement[], Date.now())
          const next = await saveWhiteboard(elements, filesFor(elements, this.files), this.version)
          if (next !== null) {
            this.version = Math.max(this.version, next)
            this.savedHash = hash
            break
          }
          if (attempt >= 4) throw new Error('conflict')
          // Someone saved in between: merge their scene into ours, then try again.
          await this.pull()
        }
        this.dirtySince = null
        if (!this.stopped) this.setStatus(this.connectedBefore ? 'saved' : 'offline')
      } catch {
        if (this.stopped) return
        this.setStatus(navigator.onLine === false ? 'offline' : 'error')
        this.saveTimer = setTimeout(() => void this.save(), RETRY_SAVE_MS)
      } finally {
        this.saving = null
        if (this.saveAgain && !this.stopped) {
          this.saveAgain = false
          this.scheduleSave(300)
        }
      }
    })()
    return this.saving
  }

  private setStatus(status: SyncStatus) {
    this.status = status
    this.onStatus(status)
  }

  // ---- images -------------------------------------------------------------------------

  private async upload(id: string, file: BinaryFileData) {
    this.uploading.add(id)
    try {
      const blob = await dataUrlToBlob(file.dataURL)
      const problem = checkWhiteboardImage({ type: file.mimeType, size: blob.size })
      if (problem) {
        this.onNotice(problem)
        this.removeImage(id)
        return
      }
      const stored = await uploadWhiteboardImage(blob, file.mimeType)
      this.files[id] = stored
      this.loadedFiles.add(id)
      void this.channel?.send({ type: 'broadcast', event: 'files', payload: { files: { [id]: stored } } })
      this.scheduleSave(300)
    } catch {
      this.onNotice('That image couldn’t be uploaded. Check your connection and try again.')
      this.removeImage(id)
    } finally {
      this.uploading.delete(id)
    }
  }

  private removeImage(fileId: string) {
    const scene = this.scene()
    if (!scene.some((e) => e.type === 'image' && e.fileId === fileId && !e.isDeleted)) return
    this.api.updateScene({
      elements: scene.map((e) => (e.type === 'image' && e.fileId === fileId ? newElementWith(e, { isDeleted: true }) : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
  }

  /** Download stored images the scene needs and hand them to Excalidraw. */
  private async loadFiles(files: FileMap) {
    const needed = new Set(this.scene().filter((e) => e.type === 'image' && e.fileId).map((e) => (e as { fileId: string }).fileId))
    const toLoad = Object.entries(files).filter(([id]) => needed.has(id) && !this.loadedFiles.has(id))
    for (const [id] of toLoad) this.loadedFiles.add(id)
    const loaded = await Promise.all(
      toLoad.map(async ([id, f]) => {
        try {
          const response = await fetch(whiteboardImageUrl(f.path))
          if (!response.ok) throw new Error(String(response.status))
          const dataURL = await blobToDataUrl(await response.blob())
          return { id, mimeType: f.mimeType, dataURL, created: Date.now() } as unknown as BinaryFileData
        } catch {
          this.loadedFiles.delete(id) // try again on the next pull
          return null
        }
      }),
    )
    const ok = loaded.filter((f): f is BinaryFileData => f !== null)
    if (ok.length && !this.stopped) this.api.addFiles(ok)
  }
}
