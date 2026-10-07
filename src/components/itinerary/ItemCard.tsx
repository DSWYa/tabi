import { clsx } from 'clsx'
import { ChevronDown, ChevronUp, GripVertical, Loader2, StickyNote } from 'lucide-react'
import type { ReactNode } from 'react'
import { categoryIcons } from '@/components/categoryIcons'
import { ReservationBadge } from '@/components/badges'
import { categoryByKey } from '@/lib/constants'
import { formatTimeRange, type ItineraryItem } from '@/lib/itinerary'
import type { Place } from '@/lib/places'

export interface ItemControls {
  /** The drag handle (rendered by the sortable wrapper, which owns its ref). */
  handle?: ReactNode
  onUp?: () => void
  onDown?: () => void
  busy?: boolean
}

const iconButton =
  'grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35'

/** Grip button for drag and drop (pointer, touch and keyboard via dnd-kit). */
export function DragHandle({ label, setNode, props }: { label: string; setNode: (el: HTMLElement | null) => void; props: object }) {
  return (
    <button
      type="button"
      ref={setNode}
      {...props}
      aria-label={`Drag ${label}`}
      className={clsx(iconButton, 'my-auto ml-0.5 cursor-grab touch-none active:cursor-grabbing')}
    >
      <GripVertical className="size-5" aria-hidden />
    </button>
  )
}

/** One itinerary entry on the timeline / calendar agenda. Tapping it opens the detail sheet. */
export function ItemCard({ item, name, place, onOpen, controls, overlay, className, extra }: {
  item: ItineraryItem
  name: string
  place?: Place
  onOpen: () => void
  /** Admin-only reorder controls (drag handle + move up/down). */
  controls?: ItemControls
  /** Rendered in the drag overlay (lifted look, no buttons). */
  overlay?: boolean
  className?: string
  extra?: ReactNode
}) {
  const time = formatTimeRange(item)
  const category = place ? categoryByKey[place.category] : null
  const Icon = place ? categoryIcons[place.category] : StickyNote

  return (
    <div
      className={clsx(
        'flex items-stretch gap-1 rounded-2xl border border-border bg-surface shadow-card',
        overlay && 'rotate-1 ring-2 ring-accent',
        className,
      )}
    >
      {controls?.handle}
      <button type="button" onClick={onOpen} className={clsx('flex min-w-0 flex-1 items-start gap-3 rounded-2xl py-3 text-left', controls?.handle ? 'pr-2' : 'px-3')}>
        <span
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: category?.color ?? 'var(--muted)' }}
          aria-hidden
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            {time && <span className="font-mono text-sm font-bold text-accent-text">{time}</span>}
            <span className="font-extrabold break-words">{name}</span>
          </span>
          {category && <span className="sr-only">, {category.label}</span>}
          {(item.reservation_status !== 'none' || extra) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {item.reservation_status !== 'none' && <ReservationBadge status={item.reservation_status} />}
              {item.reservation_ref && <span className="font-mono text-xs font-bold text-muted">#{item.reservation_ref}</span>}
              {extra}
            </span>
          )}
          {item.notes && <span className="mt-1 line-clamp-2 block text-sm text-muted">{item.notes}</span>}
        </span>
      </button>
      {controls && !overlay && (controls.onUp || controls.onDown) && (
        <span className="flex shrink-0 flex-col justify-center pr-0.5">
          {controls.busy ? (
            <span className="grid size-11 place-items-center" role="status" aria-label="Saving">
              <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
            </span>
          ) : (
            <>
              <button type="button" className={iconButton} onClick={controls.onUp} disabled={!controls.onUp} aria-label={`Move ${name} earlier`}>
                <ChevronUp className="size-5" aria-hidden />
              </button>
              <button type="button" className={iconButton} onClick={controls.onDown} disabled={!controls.onDown} aria-label={`Move ${name} later`}>
                <ChevronDown className="size-5" aria-hidden />
              </button>
            </>
          )}
        </span>
      )}
    </div>
  )
}
