import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { DaySlot } from '@/lib/constants'

// Like the place sheet, the itinerary sheet lives in the URL so Quick add, Current Plans and the place sheet can
// open it from any page and the phone's Back button closes it:
//   ?schedule=<placeId>          admin: new entry for a place          ?newItem=1[&day=&slot=]  admin: new entry
//   ?item=<id>[&itemView=edit|suggest]  entry detail / edit / "suggest a change"
//   ?suggest=1[&placeId=&day=&slot=]    member suggestion
export const ITINERARY_SHEET_PARAMS = ['schedule', 'newItem', 'item', 'itemView', 'suggest', 'placeId', 'day', 'slot'] as const
/** The place sheet's params; one sheet at a time. */
const PLACE_SHEET_PARAMS = ['place', 'view', 'new'] as const

interface Defaults {
  placeId?: string
  day?: string
  slot?: DaySlot
}

export type ItinerarySheetMode =
  | { kind: 'none' }
  | ({ kind: 'new' | 'suggest' } & Defaults)
  | { kind: 'detail' | 'edit' | 'suggest-move'; id: string }

const SLOTS = new Set<string>(['morning', 'afternoon', 'evening'])

export function useItinerarySheet() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { sheet?: boolean; placeSheet?: boolean } | null
  // Set when a sheet pushed this history entry, so closing can simply go back.
  const pushed = Boolean(state?.sheet || state?.placeSheet)

  const schedule = params.get('schedule')
  const newItem = params.get('newItem')
  const item = params.get('item')
  const itemView = params.get('itemView')
  const suggest = params.get('suggest')
  const placeId = params.get('placeId')
  const day = params.get('day')
  const slot = params.get('slot')

  const mode = useMemo<ItinerarySheetMode>(() => {
    const defaults: Defaults = {
      placeId: placeId ?? undefined,
      day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined,
      slot: slot && SLOTS.has(slot) ? (slot as DaySlot) : undefined,
    }
    if (schedule) return { kind: 'new', ...defaults, placeId: schedule }
    if (newItem === '1') return { kind: 'new', ...defaults }
    if (suggest === '1') return { kind: 'suggest', ...defaults }
    if (item) return { kind: itemView === 'edit' ? 'edit' : itemView === 'suggest' ? 'suggest-move' : 'detail', id: item }
    return { kind: 'none' }
  }, [schedule, newItem, item, itemView, suggest, placeId, day, slot])

  const open = useCallback(
    (set: Record<string, string | undefined>) => {
      const replace = mode.kind !== 'none'
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const key of [...ITINERARY_SHEET_PARAMS, ...PLACE_SHEET_PARAMS]) next.delete(key)
          for (const [key, value] of Object.entries(set)) if (value) next.set(key, value)
          return next
        },
        { replace, state: replace ? { sheet: pushed } : { sheet: true } },
      )
    },
    [mode.kind, setParams, pushed],
  )

  return useMemo(
    () => ({
      mode,
      schedulePlace: (id: string, defaults: Omit<Defaults, 'placeId'> = {}) => open({ schedule: id, ...defaults }),
      newItem: (defaults: Defaults = {}) => open({ newItem: '1', ...defaults }),
      openItem: (id: string) => open({ item: id }),
      editItem: (id: string) => open({ item: id, itemView: 'edit' }),
      suggestMove: (id: string) => open({ item: id, itemView: 'suggest' }),
      suggest: (defaults: Defaults = {}) => open({ suggest: '1', ...defaults }),
      close: () => {
        if (pushed) navigate(-1)
        else setParams((prev) => {
          const next = new URLSearchParams(prev)
          for (const key of ITINERARY_SHEET_PARAMS) next.delete(key)
          return next
        }, { replace: true })
      },
    }),
    [mode, open, pushed, navigate, setParams],
  )
}
