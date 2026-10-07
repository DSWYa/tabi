import { lazy, Suspense, useMemo } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, SkeletonCard } from '@/components/ui/States'
import { itemsByPlace, useItineraryItems } from '@/lib/itinerary'
import { useMe } from '@/lib/members'
import { emptyPlaceForm, placeToForm } from '@/lib/placeForm'
import { canEditPlace, geocodeResetFor, useCreatePlace, usePlaces, useUpdatePlace, useVotes } from '@/lib/places'
import { tallyVotes } from '@/lib/votes'
import { PlaceDetail } from './PlaceDetail'
import { PlaceForm } from './PlaceForm'
import { usePlaceSheet } from './placeSheet'

// Leaflet only loads when someone actually opens the pin editor.
const PinPicker = lazy(() => import('@/components/map/PinPicker'))

/** The one place sheet for the whole app (mounted in AppShell); driven by the URL — see usePlaceSheet. */
export function PlaceSheetHost() {
  const sheet = usePlaceSheet()
  const { mode } = sheet
  const places = usePlaces()
  const { data: votes = [] } = useVotes()
  const { data: items = [] } = useItineraryItems()
  const { me, data: members = [] } = useMe()
  const create = useCreatePlace()
  const update = useUpdatePlace()

  const place = mode.kind === 'detail' || mode.kind === 'edit' || mode.kind === 'pin' ? places.data?.find((p) => p.id === mode.id) : undefined
  const memberIds = useMemo(() => members.map((m) => m.id), [members])
  const tally = useMemo(
    () => tallyVotes(place ? votes.filter((v) => v.place_id === place.id) : [], memberIds),
    [votes, place, memberIds],
  )
  const scheduled = useMemo(() => (place ? itemsByPlace(items).get(place.id) ?? [] : []), [items, place])

  if (mode.kind === 'none') return null

  const title =
    mode.kind === 'new' ? 'Add a place'
      : !place ? 'Place'
        : mode.kind === 'edit' ? `Edit ${place.name}`
          : mode.kind === 'pin' ? `Pin for ${place.name}`
            : place.name

  let body: React.ReactNode
  if (mode.kind === 'new') {
    body = (
      <PlaceForm
        initial={emptyPlaceForm()}
        submitLabel="Add place"
        onCancel={sheet.close}
        onSubmit={async (input) => {
          const { place } = await create.mutateAsync(input)
          sheet.showDetail(place.id)
        }}
      />
    )
  } else if (places.isPending) {
    body = <SkeletonCard lines={4} />
  } else if (!place) {
    body = <EmptyState mood="sleepy" title="This place is gone" message="It may have been deleted by its creator or the admin." />
  } else if (mode.kind === 'edit' && canEditPlace(place, me)) {
    body = (
      <PlaceForm
        key={place.id}
        initial={placeToForm(place)}
        submitLabel="Save changes"
        onCancel={() => sheet.showDetail(place.id)}
        onSubmit={async (input) => {
          await update.mutateAsync({ id: place.id, patch: { ...input, ...geocodeResetFor(place, input) } })
          sheet.showDetail(place.id)
        }}
      />
    )
  } else if (mode.kind === 'pin' && canEditPlace(place, me)) {
    body = (
      <Suspense fallback={<SkeletonCard lines={6} />}>
        <PinPicker place={place} onDone={() => sheet.showDetail(place.id)} onCancel={() => sheet.showDetail(place.id)} />
      </Suspense>
    )
  } else {
    body = (
      <PlaceDetail
        place={place}
        tally={tally}
        scheduled={scheduled}
        onEdit={() => sheet.editPlace(place.id)}
        onEditPin={() => sheet.editPin(place.id)}
        onDeleted={sheet.close}
      />
    )
  }

  return (
    <Sheet open onClose={sheet.close} title={title} size={mode.kind === 'pin' ? 'xl' : 'lg'}>
      {body}
    </Sheet>
  )
}
