import { CalendarDays, CalendarPlus, ExternalLink, Globe, Loader2, Map as MapIcon, MapPin, MessageSquarePlus, Navigation, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CategoryBadge, PendingSyncBadge, StatusBadge } from '@/components/badges'
import { useItinerarySheet } from '@/components/itinerary/itinerarySheet'
import { Button } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/Field'
import { formatItemWhen, type ItineraryItem } from '@/lib/itinerary'
import { directionsUrl, safeWebsite } from '@/lib/maps'
import { useMe } from '@/lib/members'
import { usePendingSync } from '@/lib/outboxRuntime'
import { canEditPlace, placeErrorMessage, useDeletePlace, type Place } from '@/lib/places'
import { CONSENSUS_LABELS, consensus, type VoteTally } from '@/lib/votes'
import { AddedBy, MemberVotes, PinStatusBadge, PriceText, PriorityStars, VoteCounts } from './bits'
import { StatusActions } from './StatusActions'
import { VoteControl } from './VoteControl'

const linkButton =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-bold hover:bg-surface-2'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-extrabold">{title}</h3>
      {children}
    </section>
  )
}

export function PlaceDetail({ place, tally, scheduled, onEdit, onEditPin, onDeleted }: {
  place: Place
  tally: VoteTally
  scheduled: ItineraryItem[]
  onEdit: () => void
  onEditPin: () => void
  onDeleted: () => void
}) {
  const { me, isAdmin, data: members = [] } = useMe()
  const itinerarySheet = useItinerarySheet()
  const remove = useDeletePlace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const canEdit = canEditPlace(place, me)
  const website = safeWebsite(place.website)
  const addedBy = members.find((m) => m.id === place.added_by)
  const hasPin = place.lat != null && place.lng != null
  // On the map the pin is already right there, so "Show on map" would do nothing.
  const onMap = useLocation().pathname.startsWith('/map')
  const pendingSync = usePendingSync().places.has(place.id)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={place.status} />
        {pendingSync && <PendingSyncBadge />}
        <CategoryBadge category={place.category} />
        <PriorityStars priority={place.priority} />
        <PriceText jpy={place.price_jpy} />
      </div>

      {(place.address || website) && (
        <div className="grid gap-1.5 text-sm">
          {place.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="select-text">{place.address}</span>
            </p>
          )}
          {website && (
            <p className="flex items-start gap-2">
              <Globe className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <a href={website} target="_blank" rel="noopener noreferrer" className="font-bold break-all text-accent-text underline-offset-2 hover:underline">
                {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" className={linkButton}>
          <Navigation className="size-4" aria-hidden />
          Directions
          <ExternalLink className="size-3.5 text-muted" aria-hidden />
          <span className="sr-only"> in Google Maps (opens in a new tab)</span>
        </a>
        {hasPin && !onMap && (
          <Link to={`/map?focus=${place.id}`} className={linkButton}>
            <MapIcon className="size-4" aria-hidden />
            Show on map
          </Link>
        )}
      </div>

      {place.notes && <p className="rounded-2xl bg-surface-2 p-3.5 text-sm whitespace-pre-wrap">{place.notes}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <PinStatusBadge status={place.geocode_status} always />
        {canEdit && (
          <Button variant="ghost" size="sm" className="min-h-11" onClick={onEditPin}>
            <MapPin className="size-4" aria-hidden />
            {hasPin ? 'Adjust pin' : 'Set pin'}
          </Button>
        )}
      </div>

      {(scheduled.length > 0 || place.status === 'in_plan' || (!isAdmin && place.status === 'awaiting')) && (
        <Section title="In the itinerary">
          {scheduled.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {scheduled.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => itinerarySheet.openItem(item.id)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-info-bg px-3 text-xs font-bold text-info-fg hover:brightness-95"
                  >
                    <CalendarDays className="size-3.5" aria-hidden />
                    {formatItemWhen(item)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-sm text-muted">Not on the itinerary yet.</p>
          )}
          {isAdmin ? (
            (place.status === 'in_plan' || place.status === 'visited') && (
              <Button size="sm" className="min-h-11" onClick={() => itinerarySheet.schedulePlace(place.id)}>
                <CalendarPlus className="size-4" aria-hidden />
                {scheduled.length ? 'Schedule again…' : 'Schedule…'}
              </Button>
            )
          ) : (
            (place.status === 'in_plan' || place.status === 'awaiting') && (
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => itinerarySheet.suggest({ placeId: place.id })}>
                <MessageSquarePlus className="size-4" aria-hidden />
                Suggest a time
              </Button>
            )
          )}
        </Section>
      )}

      <Section title={place.status === 'awaiting' ? 'Votes' : 'How the family voted'}>
        {place.status === 'awaiting' && me && (
          <div className="mb-3">
            <VoteControl placeId={place.id} placeName={place.name} myVote={tally.byMember.get(me.id)} />
          </div>
        )}
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold">{CONSENSUS_LABELS[consensus(tally)]}</span>
          <VoteCounts tally={tally} />
        </p>
        <MemberVotes tally={tally} members={members} meId={me?.id} />
      </Section>

      <StatusActions place={place} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <AddedBy member={addedBy} className="mr-auto" />
        {canEdit && !confirmDelete && (
          <>
            <Button variant="secondary" size="sm" className="min-h-11" onClick={onEdit}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>
            <Button variant="danger" size="sm" className="min-h-11" onClick={() => { setError(''); setConfirmDelete(true) }}>
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="rounded-2xl bg-bad-bg p-3.5 text-bad-fg" role="group" aria-label="Confirm delete">
          <p className="text-sm font-bold">Delete {place.name}?</p>
          <p className="mt-1 text-sm">
            Its votes go too. {scheduled.length > 0 ? 'Itinerary entries stay, named after the place.' : ''} This can't be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={remove.isPending}
              onClick={async () => {
                // mutateAsync: this sheet unmounts as soon as the place leaves the cache.
                try {
                  await remove.mutateAsync(place.id)
                  onDeleted()
                } catch (e) {
                  setError(placeErrorMessage(e as Error))
                }
              }}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              Yes, delete
            </Button>
          </div>
        </div>
      )}
      <FormMessage tone="error">{error}</FormMessage>
    </div>
  )
}
