import { CalendarClock, Clock, ExternalLink, Loader2, MapPin, MessageSquarePlus, Navigation, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CategoryBadge, ReservationBadge, StatusBadge } from '@/components/badges'
import { usePlaceSheet } from '@/components/places/placeSheet'
import { Button } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/Field'
import { formatDay, formatTimeRange, itineraryErrorMessage, slotLabel, useDeleteItem, type ItineraryItem } from '@/lib/itinerary'
import { directionsUrl } from '@/lib/maps'
import { useMe } from '@/lib/members'
import type { Place } from '@/lib/places'
import { slotIcons } from './slots'

const linkButton =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-bold hover:bg-surface-2'

/** Read view of one entry. Admin: edit/delete. Members: suggest a change. */
export function ItemDetail({ item, place, dayNumber, onEdit, onSuggest, onDeleted }: {
  item: ItineraryItem
  place: Place | undefined
  dayNumber: number | null
  onEdit: () => void
  onSuggest: () => void
  onDeleted: () => void
}) {
  const { isAdmin } = useMe()
  const placeSheet = usePlaceSheet()
  const remove = useDeleteItem()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const SlotIcon = slotIcons[item.slot]
  const time = formatTimeRange(item)

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5 text-sm">
        <p className="flex items-center gap-2 font-bold">
          <SlotIcon className="size-4 text-accent-text" aria-hidden />
          {dayNumber ? `Day ${dayNumber} · ` : ''}
          {formatDay(item.day, { weekday: 'long', month: 'long', day: 'numeric' })} · {slotLabel(item.slot)}
        </p>
        {time && (
          <p className="flex items-center gap-2">
            <Clock className="size-4 text-muted" aria-hidden />
            {time}
          </p>
        )}
      </div>

      {place && (
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={place.category} />
          <StatusBadge status={place.status} />
        </div>
      )}

      {item.reservation_status !== 'none' && (
        <div className="rounded-2xl bg-surface-2 p-3.5">
          <ReservationBadge status={item.reservation_status} />
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {item.reservation_ref && (
              <>
                <dt className="text-muted">Reference</dt>
                <dd className="font-mono font-bold select-all">{item.reservation_ref}</dd>
              </>
            )}
            {item.reservation_time && (
              <>
                <dt className="text-muted">Reserved for</dt>
                <dd className="flex items-center gap-1.5 font-bold">
                  <CalendarClock className="size-4" aria-hidden />
                  {item.reservation_time.slice(0, 5)}
                </dd>
              </>
            )}
            {!item.reservation_ref && !item.reservation_time && (
              <dd className="col-span-2 text-muted">{item.reservation_status === 'required' ? 'Not booked yet.' : 'No details added.'}</dd>
            )}
          </dl>
        </div>
      )}

      {item.notes && <p className="rounded-2xl bg-surface-2 p-3.5 text-sm whitespace-pre-wrap select-text">{item.notes}</p>}

      {place && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={linkButton} onClick={() => placeSheet.openPlace(place.id)}>
            <MapPin className="size-4" aria-hidden />
            About {place.name}
          </button>
          <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" className={linkButton}>
            <Navigation className="size-4" aria-hidden />
            Directions
            <ExternalLink className="size-3.5 text-muted" aria-hidden />
            <span className="sr-only"> in Google Maps (opens in a new tab)</span>
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {isAdmin ? (
          !confirmDelete && (
            <>
              <Button variant="secondary" size="sm" className="min-h-11" onClick={onEdit}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </Button>
              <Button variant="danger" size="sm" className="min-h-11" onClick={() => { setError(''); setConfirmDelete(true) }}>
                <Trash2 className="size-4" aria-hidden />
                Remove
              </Button>
            </>
          )
        ) : (
          <Button variant="secondary" size="sm" className="min-h-11" onClick={onSuggest}>
            <MessageSquarePlus className="size-4" aria-hidden />
            Suggest a change
          </Button>
        )}
      </div>

      {confirmDelete && (
        <div className="rounded-2xl bg-bad-bg p-3.5 text-bad-fg" role="group" aria-label="Confirm remove">
          <p className="text-sm font-bold">Remove this from the itinerary?</p>
          <p className="mt-1 text-sm">{place ? `${place.name} stays in Places and the plan.` : 'This can’t be undone.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={remove.isPending}
              onClick={async () => {
                // mutateAsync: the sheet unmounts as soon as the entry leaves the cache.
                try {
                  await remove.mutateAsync(item.id)
                  onDeleted()
                } catch (e) {
                  setError(itineraryErrorMessage(e as Error))
                }
              }}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              Yes, remove
            </Button>
          </div>
        </div>
      )}
      <FormMessage tone="error">{error}</FormMessage>
    </div>
  )
}
