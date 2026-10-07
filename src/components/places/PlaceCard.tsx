import { clsx } from 'clsx'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { CategoryBadge, StatusBadge } from '@/components/badges'
import type { Place } from '@/lib/places'
import type { Profile } from '@/lib/supabase'
import type { VoteTally } from '@/lib/votes'
import { AddedBy, PinStatusBadge, PriceText, PriorityStars, VoteCounts } from './bits'

/** One place in a list. The whole card opens the detail sheet. */
export function PlaceCard({ place, addedBy, tally, onOpen, extra, className }: {
  place: Place
  addedBy: Profile | undefined
  tally?: VoteTally
  onOpen: () => void
  /** Rendered under the card body (outside the button), e.g. scheduled days. */
  extra?: ReactNode
  className?: string
}) {
  return (
    <article className={clsx('rounded-card border border-border bg-surface shadow-card animate-rise', className)}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-2 rounded-card p-4 text-left transition hover:bg-surface-2/50"
      >
        <span className="block min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-base font-extrabold break-words">{place.name}</span>
            <StatusBadge status={place.status} />
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CategoryBadge category={place.category} />
            <PriorityStars priority={place.priority} />
            <PriceText jpy={place.price_jpy} />
          </span>
          {place.address && <span className="mt-1.5 line-clamp-1 text-sm text-muted">{place.address}</span>}
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <AddedBy member={addedBy} />
            {tally && place.status === 'awaiting' && <VoteCounts tally={tally} />}
            <PinStatusBadge status={place.geocode_status} />
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
      </button>
      {extra && <div className="border-t border-border px-4 py-2.5">{extra}</div>}
    </article>
  )
}
