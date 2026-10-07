import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ITINERARY_SHEET_PARAMS } from '@/components/itinerary/itinerarySheet'

// Which place sheet is open lives in the URL (`#/places?place=<id>&view=edit`), so any page — the map,
// the dashboard, Quick add — can open one, links can be shared, and the phone's Back button closes it.
export type PlaceSheetMode =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'detail' | 'edit' | 'pin'; id: string }

export function usePlaceSheet() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  // Set when *we* pushed the sheet onto history, so closing can simply go back (no duplicate entries).
  const pushedBySheet = Boolean((location.state as { placeSheet?: boolean } | null)?.placeSheet)
  const id = params.get('place')
  const view = params.get('view')
  const isNew = params.get('new') === '1'

  const mode = useMemo<PlaceSheetMode>(() => {
    if (isNew) return { kind: 'new' }
    if (!id) return { kind: 'none' }
    return { kind: view === 'edit' ? 'edit' : view === 'pin' ? 'pin' : 'detail', id }
  }, [id, view, isNew])

  const update = useCallback(
    (change: (p: URLSearchParams) => void, replace: boolean) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          // One sheet at a time: opening a place closes any itinerary sheet.
          for (const key of ITINERARY_SHEET_PARAMS) next.delete(key)
          change(next)
          return next
        },
        // A replace keeps whatever history state we had; only a push marks the entry as ours.
        { replace, state: replace ? { placeSheet: pushedBySheet } : { placeSheet: true } },
      ),
    [setParams, pushedBySheet],
  )

  return useMemo(() => {
    const show = (placeId: string, v: 'detail' | 'edit' | 'pin', replace: boolean) =>
      update((p) => {
        p.delete('new')
        p.set('place', placeId)
        if (v === 'detail') p.delete('view')
        else p.set('view', v)
      }, replace)
    return {
      mode,
      openPlace: (placeId: string) => show(placeId, 'detail', mode.kind !== 'none'),
      showDetail: (placeId: string) => show(placeId, 'detail', true),
      editPlace: (placeId: string) => show(placeId, 'edit', true),
      editPin: (placeId: string) => show(placeId, 'pin', true),
      createPlace: () => update((p) => { p.delete('place'); p.delete('view'); p.set('new', '1') }, false),
      close: () => {
        if (pushedBySheet) navigate(-1)
        else setParams((prev) => {
          const next = new URLSearchParams(prev)
          next.delete('place')
          next.delete('view')
          next.delete('new')
          return next
        }, { replace: true })
      },
    }
  }, [mode, update, pushedBySheet, navigate, setParams])
}
