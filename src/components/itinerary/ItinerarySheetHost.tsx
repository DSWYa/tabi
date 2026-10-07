import { CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, SkeletonCard } from '@/components/ui/States'
import {
  editPatch, itemName, newItemArgs, useCreateItem, useItineraryItems, useTripDays, useUpdateItem,
} from '@/lib/itinerary'
import { emptyItemForm, emptySuggestionForm, itemToForm, moveSuggestionForm } from '@/lib/itineraryForm'
import { useMe } from '@/lib/members'
import { usePlaces, type Place } from '@/lib/places'
import { suggestablePlaces, useCreateSuggestion } from '@/lib/suggestions'
import { ItemDetail } from './ItemDetail'
import { ItemForm } from './ItemForm'
import { useItinerarySheet } from './itinerarySheet'
import { SuggestionForm } from './SuggestionForm'

/** Places the admin can put on the itinerary: the plan (and visited), plus whatever is already picked. */
function schedulablePlaces(places: Place[], selectedId?: string | null): Place[] {
  return places
    .filter((p) => p.status === 'in_plan' || p.status === 'visited' || p.id === selectedId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

const OFFLINE_NOTE = 'You’re offline, so it’s saved on this device and will be sent as soon as you’re back online.'

/** The one itinerary sheet for the whole app (mounted in AppShell); driven by the URL — see useItinerarySheet. */
export function ItinerarySheetHost() {
  const sheet = useItinerarySheet()
  const { mode } = sheet
  const { isAdmin } = useMe()
  const places = usePlaces()
  const itinerary = useItineraryItems()
  const { days, numberOf } = useTripDays()
  const create = useCreateItem()
  const update = useUpdateItem()
  const suggest = useCreateSuggestion()
  // "Thanks" screen after sending a suggestion (reset whenever the sheet changes).
  const [sent, setSent] = useState<string | null>(null)
  const sheetKey = JSON.stringify(mode)
  const [sentFor, setSentFor] = useState(sheetKey)
  if (sentFor !== sheetKey) {
    setSentFor(sheetKey)
    setSent(null)
  }

  const allPlaces = useMemo(() => places.data ?? [], [places.data])
  const placeName = useMemo(() => {
    const byId = new Map(allPlaces.map((p) => [p.id, p.name]))
    return (id: string) => byId.get(id)
  }, [allPlaces])
  const items = itinerary.data ?? []

  if (mode.kind === 'none') return null
  const item = 'id' in mode ? items.find((i) => i.id === mode.id) : undefined
  const loading = itinerary.isPending || places.isPending
  const defaultDay = (day?: string) => day ?? days[0] ?? ''

  let title = 'Itinerary'
  let body: React.ReactNode

  if (sent) {
    title = 'Suggestion sent'
    body = (
      <div className="flex flex-col items-center gap-3 py-6 text-center animate-rise">
        <span className="grid size-14 place-items-center rounded-2xl bg-ok-bg text-ok-fg">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <p className="font-extrabold">Thanks! The admin will take a look.</p>
        <p className="max-w-sm text-sm text-muted">{sent}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link to="/itinerary" className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-bold hover:bg-surface-2">
            See all suggestions
          </Link>
          <Button onClick={sheet.close}>Done</Button>
        </div>
      </div>
    )
  } else if (loading) {
    body = <SkeletonCard lines={4} />
  } else if (mode.kind === 'new') {
    const place = mode.placeId ? allPlaces.find((p) => p.id === mode.placeId) : undefined
    title = place ? `Schedule ${place.name}` : 'Add to the itinerary'
    body = !isAdmin ? (
      <EmptyState
        title="Only the admin edits the itinerary"
        message="You can suggest a day and time instead — the admin gets to approve it."
        action={<Button onClick={() => sheet.suggest({ placeId: mode.placeId, day: mode.day, slot: mode.slot })}>Suggest a time</Button>}
      />
    ) : (
      <ItemForm
        initial={emptyItemForm({ placeId: place?.id, day: defaultDay(mode.day), slot: mode.slot })}
        places={schedulablePlaces(allPlaces, place?.id)}
        days={days}
        numberOf={numberOf}
        submitLabel="Add to itinerary"
        onCancel={sheet.close}
        onSubmit={async (input) => {
          await create.mutateAsync(newItemArgs(items, input))
          sheet.close()
        }}
      />
    )
  } else if (mode.kind === 'suggest') {
    title = 'Suggest an itinerary change'
    body = (
      <SuggestionForm
        initial={emptySuggestionForm({ placeId: mode.placeId ?? '', day: defaultDay(mode.day), slot: mode.slot ?? 'morning' })}
        places={suggestablePlaces(allPlaces)}
        days={days}
        numberOf={numberOf}
        onCancel={sheet.close}
        onSubmit={async (input) => {
          const what = (input.place_id && placeName(input.place_id)) || input.title || 'a stop'
          const { queued } = await suggest.mutateAsync({ input, label: `Suggest “${what}”` })
          setSent(queued ? OFFLINE_NOTE : 'It shows up under “Suggestions” on the itinerary until it’s reviewed.')
        }}
      />
    )
  } else if (!item) {
    body = <EmptyState mood="sleepy" title="This entry is gone" message="The admin may have removed or replaced it." />
  } else {
    const name = itemName(item, placeName)
    const place = item.place_id ? allPlaces.find((p) => p.id === item.place_id) : undefined
    if (mode.kind === 'edit' && isAdmin) {
      title = `Edit ${name}`
      body = (
        <ItemForm
          key={item.id}
          initial={itemToForm(item)}
          places={schedulablePlaces(allPlaces, item.place_id)}
          days={days}
          numberOf={numberOf}
          submitLabel="Save changes"
          onCancel={() => sheet.openItem(item.id)}
          onSubmit={async (input) => {
            await update.mutateAsync({ id: item.id, patch: editPatch(items, item, input) })
            sheet.openItem(item.id)
          }}
        />
      )
    } else if (mode.kind === 'suggest-move') {
      title = `Suggest a change to ${name}`
      body = (
        <SuggestionForm
          initial={moveSuggestionForm(item)}
          places={[]}
          current={item}
          currentName={name}
          days={days}
          numberOf={numberOf}
          onCancel={() => sheet.openItem(item.id)}
          onSubmit={async (input) => {
            const { queued } = await suggest.mutateAsync({ input, label: `Suggest a new time for “${name}”` })
            setSent(queued ? OFFLINE_NOTE : `You suggested a new time for ${name}.`)
          }}
        />
      )
    } else {
      title = name
      body = (
        <ItemDetail
          item={item}
          place={place}
          dayNumber={numberOf(item.day)}
          onEdit={() => sheet.editItem(item.id)}
          onSuggest={() => sheet.suggestMove(item.id)}
          onDeleted={sheet.close}
        />
      )
    }
  }

  return (
    <Sheet open onClose={sheet.close} title={title} size="lg">
      {body}
    </Sheet>
  )
}
