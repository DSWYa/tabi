import { CalendarDays, CalendarPlus, List, MessageSquarePlus, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useItinerarySheet } from '@/components/itinerary/itinerarySheet'
import { CalendarView } from '@/components/itinerary/CalendarView'
import { SuggestionsPanel } from '@/components/itinerary/SuggestionsPanel'
import { Timeline } from '@/components/itinerary/Timeline'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Segmented'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import { formatDay, itemName, tripNowKey, useItineraryItems, useTripDays, type ItineraryItem } from '@/lib/itinerary'
import { useMe } from '@/lib/members'
import { usePlaces } from '@/lib/places'
import { useSuggestions } from '@/lib/suggestions'
import { useTrip } from '@/lib/trip'

type Layout = 'timeline' | 'calendar'

export default function Itinerary() {
  const [params, setParams] = useSearchParams()
  const layout: Layout = params.get('layout') === 'calendar' ? 'calendar' : 'timeline'
  const sheet = useItinerarySheet()
  const { me, isAdmin, data: members = [] } = useMe()
  const trip = useTrip()
  const itinerary = useItineraryItems()
  const places = usePlaces()
  const suggestions = useSuggestions()
  const { days, numberOf } = useTripDays()

  const items = useMemo(() => itinerary.data ?? [], [itinerary.data])
  const placeById = useMemo(() => new Map((places.data ?? []).map((p) => [p.id, p])), [places.data])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const placeName = useMemo(() => (id: string) => placeById.get(id)?.name, [placeById])
  const nameOf = useMemo(() => (item: ItineraryItem) => itemName(item, placeName), [placeName])
  const today = tripNowKey(new Date(), trip.data?.timezone ?? 'Asia/Tokyo').slice(0, 10)

  const setLayout = (next: Layout) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next === 'calendar') p.set('layout', 'calendar')
      else p.delete('layout')
      return p
    }, { replace: true })

  const onAdd = (day: string, slot: ItineraryItem['slot']) => (isAdmin ? sheet.newItem({ day, slot }) : sheet.suggest({ day, slot }))
  const loading = itinerary.isPending || places.isPending || trip.isPending

  return (
    <>
      <PageHeader
        title="Itinerary"
        subtitle="Day by day, morning to night."
        actions={
          isAdmin ? (
            <Button onClick={() => sheet.newItem()}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => sheet.suggest()}>
              <MessageSquarePlus className="size-4" aria-hidden />
              Suggest
            </Button>
          )
        }
      />

      <div className="grid gap-4">
        {suggestions.data && (
          <SuggestionsPanel
            suggestions={suggestions.data}
            items={items}
            placeName={placeName}
            memberById={memberById}
            meId={me?.id}
            isAdmin={isAdmin}
            onSuggest={() => sheet.suggest()}
          />
        )}

        {isAdmin && !trip.data?.start_date && !trip.isPending && (
          <p className="rounded-2xl bg-info-bg px-4 py-3 text-sm text-info-fg">
            Set the trip dates in <Link to="/admin" className="font-bold underline">Family admin</Link> to see every day here, even empty ones.
          </p>
        )}

        {loading ? (
          <div className="grid gap-3">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        ) : itinerary.isError && !itinerary.data ? (
          <Card>
            <ErrorState message="Couldn't load the itinerary." onRetry={() => void itinerary.refetch()} />
          </Card>
        ) : days.length === 0 ? (
          <Card>
            <EmptyState
              title="The itinerary is empty"
              message={isAdmin
                ? 'Add the first stop, or schedule something from Current Plans.'
                : 'Scheduled places and reservations will appear here, grouped by day. Got an idea? Suggest it.'}
              action={
                isAdmin ? (
                  <Button onClick={() => sheet.newItem()}>
                    <CalendarPlus className="size-4" aria-hidden />
                    Add a stop
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => sheet.suggest()}>Suggest a change</Button>
                )
              }
            />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                legend="View"
                hideLegend
                name="itinerary-layout"
                value={layout}
                onChange={setLayout}
                className="w-full sm:w-72"
                options={[
                  { key: 'timeline', label: 'Timeline', icon: <List className="size-4" aria-hidden /> },
                  { key: 'calendar', label: 'Calendar', icon: <CalendarDays className="size-4" aria-hidden /> },
                ]}
              />
              {isAdmin && layout === 'timeline' && (
                <p className="text-sm text-muted">Drag the handle, or use the arrows, to rearrange.</p>
              )}
            </div>

            {layout === 'timeline' && days.length > 1 && (
              <nav aria-label="Jump to a day" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
                <ul className="flex gap-1.5 pb-1">
                  {days.map((day) => (
                    <li key={day}>
                      <button
                        type="button"
                        onClick={() => document.getElementById(`day-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="flex min-h-11 flex-col items-center justify-center rounded-2xl border border-border bg-surface px-3 text-xs leading-tight font-bold whitespace-nowrap hover:bg-surface-2"
                      >
                        <span className="text-accent-text">{numberOf(day) ? `Day ${numberOf(day)}` : formatDay(day, { weekday: 'short' })}</span>
                        <span className="text-muted">{formatDay(day, { month: 'short', day: 'numeric' })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {layout === 'timeline' ? (
              <Timeline
                items={items}
                days={days}
                numberOf={numberOf}
                placeById={placeById}
                nameOf={nameOf}
                isAdmin={isAdmin}
                onOpen={sheet.openItem}
                onAdd={onAdd}
              />
            ) : (
              <CalendarView
                items={items}
                days={days}
                numberOf={numberOf}
                placeById={placeById}
                nameOf={nameOf}
                isAdmin={isAdmin}
                onOpen={sheet.openItem}
                onAdd={onAdd}
                today={today}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}
