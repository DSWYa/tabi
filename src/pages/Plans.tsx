import { CalendarDays, CalendarPlus, Footprints, MessageSquarePlus, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useItinerarySheet } from '@/components/itinerary/itinerarySheet'
import { PageHeader } from '@/components/PageHeader'
import { PlaceCard } from '@/components/places/PlaceCard'
import { usePlaceSheet } from '@/components/places/placeSheet'
import { StatusActions } from '@/components/places/StatusActions'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import { formatPrice } from '@/lib/format'
import { useUsdPerJpy } from '@/lib/fx'
import { formatItemWhen, itemsByPlace, useItineraryItems, type ItineraryItem } from '@/lib/itinerary'
import { usePlaceBoard } from '@/lib/placeBoard'
import type { Place } from '@/lib/places'

export default function Plans() {
  const board = usePlaceBoard()
  const sheet = usePlaceSheet()
  const itinerarySheet = useItinerarySheet()
  const itinerary = useItineraryItems()
  const rate = useUsdPerJpy()
  const [showVisited, setShowVisited] = useState(false)

  const scheduledBy = useMemo(() => itemsByPlace(itinerary.data ?? []), [itinerary.data])
  const groups = useMemo(() => {
    const inPlan = (board.places ?? []).filter((p) => p.status === 'in_plan').sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    return {
      ready: inPlan.filter((p) => !scheduledBy.has(p.id)),
      // Scheduled = derived: an in-plan place with at least one itinerary entry. Ordered by first visit.
      scheduled: inPlan
        .filter((p) => scheduledBy.has(p.id))
        .sort((a, b) => firstKey(scheduledBy.get(a.id)!).localeCompare(firstKey(scheduledBy.get(b.id)!))),
      visited: (board.places ?? []).filter((p) => p.status === 'visited'),
    }
  }, [board.places, scheduledBy])

  const planned = [...groups.ready, ...groups.scheduled]
  const priced = planned.filter((p) => p.price_jpy != null)
  const total = priced.reduce((sum, p) => sum + (p.price_jpy ?? 0), 0)

  // Admin: "Schedule…" puts it straight on the itinerary. Members: suggest a time for the admin to approve.
  const scheduleButton = (place: Place) =>
    place.status !== 'in_plan' ? null : board.isAdmin ? (
      <Button size="sm" className="min-h-11" onClick={() => itinerarySheet.schedulePlace(place.id)}>
        <CalendarPlus className="size-4" aria-hidden />
        Schedule…
      </Button>
    ) : (
      <Button variant="secondary" size="sm" className="min-h-11" onClick={() => itinerarySheet.suggest({ placeId: place.id })}>
        <MessageSquarePlus className="size-4" aria-hidden />
        Suggest a time
      </Button>
    )

  const card = (place: Place, extra?: React.ReactNode) => (
    <li key={place.id}>
      <PlaceCard
        place={place}
        addedBy={place.added_by ? board.memberById.get(place.added_by) : undefined}
        onOpen={() => sheet.openPlace(place.id)}
        className="h-full"
        extra={
          extra || board.isAdmin || place.status === 'in_plan' ? (
            <div className="flex flex-wrap items-center gap-2">
              {extra}
              {scheduleButton(place)}
              <div className="ml-auto">
                <StatusActions place={place} size="sm" />
              </div>
            </div>
          ) : undefined
        }
      />
    </li>
  )

  return (
    <>
      <PageHeader title="Current Plans" subtitle="Places the family said yes to, and where they sit in the itinerary." />

      {board.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : board.isError ? (
        <Card>
          <ErrorState message="Couldn't load the plan." onRetry={() => void board.refetch()} />
        </Card>
      ) : planned.length === 0 && groups.visited.length === 0 ? (
        <Card>
          <EmptyState
            title="No accepted places yet"
            message={
              <>
                Once the admin adds a place to the plan, it lands here until it's scheduled.{' '}
                <Link to="/voting" className="font-bold text-accent-text underline-offset-2 hover:underline">Go vote</Link>
              </>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6">
          {priced.length > 0 && (
            <Card className="animate-rise">
              <CardHeader title="Estimated spend" icon={<Wallet className="size-4" />} />
              <p className="text-2xl font-black">{formatPrice(total, rate)}</p>
              <p className="mt-1 text-sm text-muted">
                Per person, adding up the listed prices of {priced.length} of {planned.length} planned{' '}
                {planned.length === 1 ? 'place' : 'places'}.
              </p>
            </Card>
          )}

          <section aria-labelledby="ready-heading">
            <h2 id="ready-heading" className="mb-3 flex items-center gap-2 text-lg font-extrabold">
              <CalendarPlus className="size-5 text-accent-text" aria-hidden />
              Ready to schedule <span className="text-sm font-bold text-muted">{groups.ready.length}</span>
            </h2>
            {groups.ready.length === 0 ? (
              <p className="text-sm text-muted">Everything in the plan has a spot in the itinerary.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">{groups.ready.map((p) => card(p))}</ul>
            )}
          </section>

          <section aria-labelledby="scheduled-heading">
            <h2 id="scheduled-heading" className="mb-3 flex items-center gap-2 text-lg font-extrabold">
              <CalendarDays className="size-5 text-accent-text" aria-hidden />
              Scheduled <span className="text-sm font-bold text-muted">{groups.scheduled.length}</span>
            </h2>
            {itinerary.isError ? (
              <ErrorState message="Couldn't load the itinerary." onRetry={() => void itinerary.refetch()} />
            ) : groups.scheduled.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing scheduled yet. <Link to="/itinerary" className="font-bold text-accent-text underline-offset-2 hover:underline">Open the itinerary</Link>
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {groups.scheduled.map((p) =>
                  card(
                    p,
                    <ul className="flex flex-wrap gap-1.5" aria-label="Scheduled for">
                      {scheduledBy.get(p.id)!.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => itinerarySheet.openItem(item.id)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-bold text-info-fg hover:brightness-95"
                          >
                            <CalendarDays className="size-3.5" aria-hidden />
                            {formatItemWhen(item)}
                          </button>
                        </li>
                      ))}
                    </ul>,
                  ),
                )}
              </ul>
            )}
          </section>

          {groups.visited.length > 0 && (
            <section aria-labelledby="visited-heading">
              <h2 id="visited-heading" className="mb-3 flex items-center gap-2 text-lg font-extrabold">
                <Footprints className="size-5 text-accent-text" aria-hidden />
                Visited <span className="text-sm font-bold text-muted">{groups.visited.length}</span>
                <button
                  type="button"
                  aria-expanded={showVisited}
                  onClick={() => setShowVisited((v) => !v)}
                  className="ml-auto min-h-11 text-sm font-bold text-accent-text"
                >
                  {showVisited ? 'Hide' : 'Show'}
                </button>
              </h2>
              {showVisited && <ul className="grid gap-3 md:grid-cols-2">{groups.visited.map((p) => card(p))}</ul>}
            </section>
          )}
        </div>
      )}
    </>
  )
}

function firstKey(items: ItineraryItem[]): string {
  return items.map((i) => `${i.day} ${i.start_time ?? ''}`).sort()[0] ?? ''
}
