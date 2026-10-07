import { CalendarDays, ChevronRight, Clock, MapPin, Plane, Sparkles, Ticket, Vote } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { CategoryBadge, ReservationBadge, StatusBadge } from '@/components/badges'
import { PageHeader } from '@/components/PageHeader'
import { AddedBy } from '@/components/places/bits'
import { usePlaceSheet } from '@/components/places/placeSheet'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/States'
import { daysBetween, formatDateRange, parseDateOnly, tripCountdown } from '@/lib/format'
import { formatItemWhen, nextItem, nextReservation, tripNowKey, useItineraryItems, type ItineraryItem } from '@/lib/itinerary'
import { useMe } from '@/lib/members'
import { usePlaceBoard } from '@/lib/placeBoard'
import { useTrip } from '@/lib/trip'

// Every card is live: realtime invalidates the trip, places, votes and itinerary queries.
function Stat({ label, value, icon, to }: { label: string; value: string; icon: React.ReactNode; to?: string }) {
  const body = (
    <>
      <span className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted">
        {icon}
        {label}
      </span>
      <span className="text-2xl font-black">{value}</span>
    </>
  )
  return to ? (
    <Link to={to} className="block rounded-2xl bg-surface-2 p-3.5 transition hover:brightness-95">{body}</Link>
  ) : (
    <div className="rounded-2xl bg-surface-2 p-3.5">{body}</div>
  )
}

function EmptyLine({ children, to, cta }: { children: React.ReactNode; to?: string; cta?: string }) {
  return (
    <p className="text-sm text-muted">
      {children}{' '}
      {to && cta && (
        <Link to={to} className="font-bold text-accent-text underline-offset-2 hover:underline">
          {cta}
        </Link>
      )}
    </p>
  )
}

function CountdownBody() {
  const { data: trip, isPending } = useTrip()
  const { isAdmin } = useMe()
  if (isPending) return <Skeleton className="h-12 w-40" />
  const c = tripCountdown(trip?.start_date ?? null, trip?.end_date ?? null, new Date())
  const dates = trip?.start_date && trip.end_date ? formatDateRange(trip.start_date, trip.end_date) : null
  const big = 'text-4xl font-black tracking-tight sm:text-5xl'

  if (c.kind === 'unset') {
    return (
      <>
        <p className={big}>— days</p>
        <p className="mt-1 text-sm text-muted">
          Trip dates haven't been set yet.{' '}
          {isAdmin ? (
            <Link to="/admin" className="font-bold text-accent-text underline-offset-2 hover:underline">Set the dates</Link>
          ) : (
            'The admin will add them soon.'
          )}
        </p>
      </>
    )
  }
  return (
    <>
      <p className={big}>
        {c.kind === 'before' && (c.days === 1 ? '1 day to go' : `${c.days} days to go`)}
        {c.kind === 'during' && (c.of ? `Day ${c.day} of ${c.of}` : `Day ${c.day}`)}
        {c.kind === 'after' && 'Okaerinasai!'}
      </p>
      <p className="mt-1 text-sm text-muted">
        {c.kind === 'after' ? 'The trip is over — welcome home. ' : ''}
        {dates ?? ''}
      </p>
    </>
  )
}

export default function Dashboard() {
  const { data: trip } = useTrip()
  return (
    <>
      <PageHeader title="Okaeri! 👋" subtitle={`Here's where ${trip?.name ?? 'the trip'} stands.`} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="relative overflow-hidden md:col-span-2 animate-rise">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-accent-bright/20 blur-2xl"
          />
          <CardHeader title="Countdown to Tokyo" icon={<Plane className="size-4" />} />
          <CountdownBody />
        </Card>

        <UpcomingCards />
        <GlanceCard />
        <RecentCard />
      </div>
    </>
  )
}

function useItemName() {
  const { places } = usePlaceBoard()
  return useMemo(() => {
    const byId = new Map((places ?? []).map((p) => [p.id, p]))
    return (item: ItineraryItem) => item.title ?? (item.place_id ? byId.get(item.place_id)?.name : undefined) ?? 'Untitled stop'
  }, [places])
}

function UpcomingCards() {
  const { data: trip } = useTrip()
  const itinerary = useItineraryItems()
  const nameOf = useItemName()
  const nowKey = tripNowKey(new Date(), trip?.timezone ?? 'Asia/Tokyo')
  const items = itinerary.data ?? []
  const next = nextItem(items, nowKey)
  const reservation = nextReservation(items, nowKey)
  const loading = itinerary.isPending

  return (
    <>
      <Card className="animate-rise">
        <CardHeader title="Up next" icon={<Clock className="size-4" />} />
        {loading ? (
          <Skeleton className="h-12 w-3/4" />
        ) : next ? (
          <Link to="/itinerary" className="group block rounded-xl">
            <p className="text-lg font-extrabold group-hover:underline">{nameOf(next)}</p>
            <p className="text-sm text-muted">{formatItemWhen(next)}</p>
          </Link>
        ) : (
          <EmptyLine to="/itinerary" cta="Open itinerary">
            {items.length ? 'Nothing else on the itinerary.' : 'Nothing scheduled yet.'}
          </EmptyLine>
        )}
      </Card>

      <Card className="animate-rise">
        <CardHeader title="Next reservation" icon={<Ticket className="size-4" />} />
        {loading ? (
          <Skeleton className="h-12 w-3/4" />
        ) : reservation ? (
          <div>
            <p className="text-lg font-extrabold">{nameOf(reservation)}</p>
            <p className="mb-2 text-sm text-muted">
              {formatItemWhen(reservation)}
              {reservation.reservation_ref && (
                <> · Ref <span className="font-mono font-bold text-text">{reservation.reservation_ref}</span></>
              )}
            </p>
            <ReservationBadge status={reservation.reservation_status} />
          </div>
        ) : (
          <EmptyLine>No upcoming reservations.</EmptyLine>
        )}
      </Card>
    </>
  )
}

function GlanceCard() {
  const { data: trip } = useTrip()
  const board = usePlaceBoard()
  const places = board.places ?? []
  const meId = board.me?.id
  const planned = places.filter((p) => p.status === 'in_plan').length
  const toVote = places.filter((p) => p.status === 'awaiting' && meId && !board.tallies.get(p.id)?.byMember.has(meId)).length
  const days = trip?.start_date && trip.end_date ? daysBetween(parseDateOnly(trip.start_date), parseDateOnly(trip.end_date)) + 1 : null
  const loading = board.isPending

  return (
    <Card className="animate-rise">
      <CardHeader title="Trip at a glance" icon={<Sparkles className="size-4" />} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Planned" value={loading ? '…' : String(planned)} to="/plans" icon={<MapPin className="size-3.5" aria-hidden />} />
        <Stat label="To vote" value={loading ? '…' : String(toVote)} to="/voting" icon={<Vote className="size-3.5" aria-hidden />} />
        <Stat label="Days" value={days ? String(days) : '—'} icon={<CalendarDays className="size-3.5" aria-hidden />} />
      </div>
      {toVote > 0 && (
        <p className="mt-3 text-sm text-muted">
          {toVote === 1 ? 'One place is' : `${toVote} places are`} waiting for your vote.{' '}
          <Link to="/voting" className="font-bold text-accent-text underline-offset-2 hover:underline">Vote now</Link>
        </p>
      )}
    </Card>
  )
}

function RecentCard() {
  const board = usePlaceBoard()
  const sheet = usePlaceSheet()
  const recent = (board.places ?? []).slice(0, 4) // already newest first

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Recently added"
        icon={<MapPin className="size-4" />}
        action={
          recent.length ? (
            <Link to="/places" className="text-sm font-bold text-accent-text underline-offset-2 hover:underline">All places</Link>
          ) : undefined
        }
      />
      {board.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : recent.length === 0 ? (
        <EmptyLine to="/places?new=1" cta="Add the first place">No places added yet.</EmptyLine>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {recent.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => sheet.openPlace(p.id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{p.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={p.category} />
                    <StatusBadge status={p.status} />
                  </span>
                  <AddedBy member={p.added_by ? board.memberById.get(p.added_by) : undefined} className="mt-1" />
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
