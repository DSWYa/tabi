import '@excalidraw/excalidraw/index.css'
import { convertToExcalidrawElements, Excalidraw, MainMenu, viewportCoordsToSceneCoords, WelcomeScreen } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, Check, CloudOff, Eye, Lightbulb, Loader2, Radio, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { ErrorState } from '@/components/ui/States'
import { IdeaForm } from '@/components/whiteboard/IdeaForm'
import { NOTE_COLORS, type NoteColor } from '@/components/whiteboard/notes'
import { WhiteboardSession, type Presence, type SyncStatus } from '@/components/whiteboard/session'
import { pinColorByKey } from '@/lib/constants'
import { useMe, useSyncedTheme } from '@/lib/members'
import { timeAgo } from '@/lib/format'
import { useOnline } from '@/lib/outboxRuntime'
import { blobToDataUrl, loadWhiteboard, whiteboardImageUrl } from '@/lib/whiteboard'

// Lazy-loaded route: Excalidraw (~1 MB) is only downloaded when someone opens the board.
// Fonts are self-hosted (copied into the build by vite.config.ts) instead of coming from a CDN.
window.EXCALIDRAW_ASSET_PATH = import.meta.env.DEV
  ? '/node_modules/@excalidraw/excalidraw/dist/prod/'
  : `${import.meta.env.BASE_URL}excalidraw-assets/`

const STATUS: Record<SyncStatus, { text: string; icon: LucideIcon; tone: string; spin?: boolean }> = {
  connecting: { text: 'Connecting…', icon: Loader2, tone: 'bg-surface-2 text-muted', spin: true },
  live: { text: 'Live', icon: Radio, tone: 'bg-ok-bg text-ok-fg' },
  saving: { text: 'Saving…', icon: Loader2, tone: 'bg-surface-2 text-muted', spin: true },
  saved: { text: 'Saved', icon: Check, tone: 'bg-ok-bg text-ok-fg' },
  offline: { text: 'Offline — will sync when you’re back', icon: CloudOff, tone: 'bg-warn-bg text-warn-fg' },
  error: { text: 'Couldn’t save — retrying', icon: AlertTriangle, tone: 'bg-bad-bg text-bad-fg' },
}

export default function Whiteboard() {
  const { me, data: members = [] } = useMe()
  const { resolved } = useSyncedTheme()
  const [params, setParams] = useSearchParams()
  // Loaded once per visit; after that the session keeps the scene in sync (broadcast + saved row).
  // Offline, this is the copy saved on this device (`offline: true`), shown read-only until the connection is back.
  const row = useQuery({ queryKey: ['whiteboard'], queryFn: loadWhiteboard, staleTime: Infinity, gcTime: 0, refetchOnReconnect: false })
  const readOnly = Boolean(row.data?.offline)
  const online = useOnline()
  // The editor instance, tagged with the mode it was created for: switching between the offline copy and the live
  // board remounts Excalidraw, and nothing may keep talking to the old instance meanwhile.
  const [editor, setEditor] = useState<{ api: ExcalidrawImperativeAPI; readOnly: boolean } | null>(null)
  const api = editor && editor.readOnly === readOnly ? editor.api : null
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const [notice, setNotice] = useState('')
  const [peers, setPeers] = useState<Presence[]>([])
  const session = useRef<WhiteboardSession | null>(null)
  const meId = me?.id
  const meName = me?.display_name ?? 'Someone'
  const meColor = (me?.pin_color && pinColorByKey[me.pin_color as keyof typeof pinColorByKey]?.hex) || '#c44e0a'
  const ideaOpen = params.get('idea') === '1'

  // Back online after showing the offline copy: load the live board (Excalidraw remounts, see its key).
  const { refetch } = row
  useEffect(() => {
    if (readOnly && online) void refetch()
  }, [readOnly, online, refetch])

  // Offline copy: show the images this device has seen before (the service worker keeps them).
  useEffect(() => {
    if (!api || !readOnly || !row.data) return
    let cancelled = false
    void Promise.all(
      Object.entries(row.data.files).map(async ([id, f]) => {
        try {
          const response = await fetch(whiteboardImageUrl(f.path))
          if (!response.ok) return null
          return { id, mimeType: f.mimeType, dataURL: await blobToDataUrl(await response.blob()), created: Date.now() }
        } catch {
          return null
        }
      }),
    ).then((files) => {
      const ok = files.filter((f) => f !== null)
      if (!cancelled && ok.length) api.addFiles(ok as never)
    })
    return () => {
      cancelled = true
    }
  }, [api, readOnly, row.data])

  useEffect(() => {
    if (!api || !row.data || !meId || readOnly) return
    const s = new WhiteboardSession({
      api,
      row: row.data,
      me: { id: meId, name: meName, color: meColor },
      onStatus: setStatus,
      onNotice: setNotice,
      onPeers: setPeers,
    })
    session.current = s
    s.attach()
    return () => {
      s.stop()
      session.current = null
    }
    // The session reads name/color once; a rename mid-session only affects the cursor label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, row.data, meId, readOnly])

  // Excalidraw's hamburger menu button has no accessible name; give it one once the editor has rendered.
  useEffect(() => {
    if (!api) return
    const t = setTimeout(() => {
      document.querySelector('.excalidraw .main-menu-trigger:not([aria-label])')?.setAttribute('aria-label', 'Board menu')
    }, 0)
    return () => clearTimeout(t)
  }, [api])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 8000)
    return () => clearTimeout(t)
  }, [notice])

  const closeIdea = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('idea')
      return next
    }, { replace: true })

  function addIdea(text: string, color: NoteColor) {
    if (!api || !session.current) return
    const appState = api.getAppState()
    const center = viewportCoordsToSceneCoords(
      { clientX: appState.offsetLeft + appState.width / 2, clientY: appState.offsetTop + appState.height / 2 },
      appState,
    )
    // A little jitter so several ideas added in a row don't stack exactly on top of each other.
    const jitter = () => Math.round((Math.random() - 0.5) * 60)
    const elements = convertToExcalidrawElements([
      {
        type: 'rectangle',
        x: center.x - 120 + jitter(),
        y: center.y - 80 + jitter(),
        width: 240,
        height: 160,
        backgroundColor: NOTE_COLORS.find((c) => c.key === color)!.fill,
        fillStyle: 'solid',
        strokeColor: '#1e1e1e',
        roughness: 1,
        roundness: { type: 3 },
        label: { text, fontSize: 20 },
        customData: { addedBy: meId },
      },
    ])
    session.current.addElements(elements)
    closeIdea()
  }

  const s = STATUS[status]
  const others = peers.map((p) => members.find((m) => m.id === p.id)).filter((m) => m !== undefined)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg px-3 py-1.5 sm:px-4">
        <h1 className="text-lg font-black tracking-tight">Whiteboard</h1>
        {readOnly && row.data ? (
          <span role="status" className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-bold text-warn-fg">
            <Eye className="size-3.5" aria-hidden />
            Offline — view only, as of {timeAgo(row.data.updated_at)}
          </span>
        ) : (
          <span role="status" className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold', s.tone)}>
            <s.icon className={clsx('size-3.5', s.spin && 'animate-spin')} aria-hidden />
            {s.text}
          </span>
        )}
        {others.length > 0 && (
          <span className="flex items-center gap-1" aria-label={`Also here: ${others.map((m) => m.display_name).join(', ')}`}>
            <span className="flex -space-x-1.5" aria-hidden>
              {others.slice(0, 4).map((m) => <Avatar key={m.id} profile={m} className="size-7 text-[10px] ring-2 ring-bg" />)}
            </span>
            <span className="hidden text-xs text-muted sm:inline">here now</span>
          </span>
        )}
        <Button size="sm" className="ml-auto min-h-11" disabled={!api || !row.data || readOnly} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('idea', '1'); return n })}>
          <Lightbulb className="size-4" aria-hidden />
          Add idea
        </Button>
      </div>
      {notice && <FormMessage tone="error" className="m-2">{notice}</FormMessage>}

      <div className="relative min-h-0 flex-1">
        {row.isError && !row.data ? (
          <ErrorState message="Couldn't load the whiteboard." onRetry={() => void row.refetch()} />
        ) : !row.data ? (
          <div role="status" aria-label="Loading the whiteboard" className="grid h-full place-items-center">
            <Loader2 className="size-8 animate-spin text-muted" aria-hidden />
          </div>
        ) : (
          <Excalidraw
            key={readOnly ? 'offline-copy' : 'live'}
            excalidrawAPI={(instance) => setEditor({ api: instance, readOnly })}
            viewModeEnabled={readOnly}
            initialData={{ elements: row.data.elements as never, scrollToContent: true }}
            onChange={(elements, appState, files) => session.current?.handleChange(elements, appState, files)}
            onPointerUpdate={(p) => session.current?.handlePointer(p)}
            theme={resolved === 'dark' ? 'dark' : 'light'}
            isCollaborating={peers.length > 0}
            langCode="en"
            name="Tabi whiteboard"
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, clearCanvas: false, export: false, toggleTheme: false },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Heading>One big board for the whole family</WelcomeScreen.Center.Heading>
                <p className="mt-2 max-w-sm text-center text-sm">
                  Draw, drop sticky notes and paste photos (up to 5 MB). Everyone sees changes live, and they’re saved for the trip.
                </p>
              </WelcomeScreen.Center>
              <WelcomeScreen.Hints.ToolbarHint />
              <WelcomeScreen.Hints.MenuHint />
            </WelcomeScreen>
          </Excalidraw>
        )}
      </div>

      <Sheet open={ideaOpen && Boolean(api && row.data) && !readOnly} onClose={closeIdea} title="Add a whiteboard idea">
        <IdeaForm onSubmit={addIdea} onCancel={closeIdea} />
      </Sheet>
    </div>
  )
}
