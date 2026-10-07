import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormMessage } from '@/components/ui/Field'
import { DAY_SLOTS, type DaySlot } from '@/lib/constants'
import {
  formatDay, groupKey, itineraryErrorMessage, parseGroupKey, slotItems, slotLabel, stepTarget, useMoveItem,
  type ItineraryItem, type MoveTarget,
} from '@/lib/itinerary'
import type { Place } from '@/lib/places'
import { DragHandle, ItemCard } from './ItemCard'
import { slotIcons } from './slots'

export interface TimelineProps {
  items: ItineraryItem[]
  days: string[]
  numberOf: (day: string) => number | null
  placeById: Map<string, Place>
  nameOf: (item: ItineraryItem) => string
  isAdmin: boolean
  onOpen: (id: string) => void
  onAdd: (day: string, slot: DaySlot) => void
}

type Containers = Record<string, string[]>

function containersFor(items: ItineraryItem[], days: string[]): Containers {
  const out: Containers = {}
  for (const day of days) for (const { key } of DAY_SLOTS) out[groupKey(day, key)] = slotItems(items, day, key).map((i) => i.id)
  return out
}

export function DayHeading({ day, number, id }: { day: string; number: number | null; id?: string }) {
  return (
    <h2 id={id} className="flex flex-wrap items-baseline gap-x-2 text-lg font-black">
      {number ? <span className="text-accent-text">Day {number}</span> : null}
      <span>{formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
    </h2>
  )
}

function SlotHeading({ slot, onAdd, label }: { slot: DaySlot; onAdd?: () => void; label: string }) {
  const Icon = slotIcons[slot]
  return (
    <div className="mb-1.5 flex min-h-11 items-center gap-2">
      <Icon className="size-4 text-accent-text" aria-hidden />
      <h3 className="flex-1 text-sm font-extrabold tracking-wide text-muted uppercase">{slotLabel(slot)}</h3>
      {onAdd && (
        <button type="button" onClick={onAdd} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold text-accent-text hover:bg-surface-2">
          <Plus className="size-4" aria-hidden />
          Add<span className="sr-only"> to {label}</span>
        </button>
      )}
    </div>
  )
}

function SortableItem({ id, children }: { id: string; children: (handle: { setNode: (el: HTMLElement | null) => void; props: object }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={clsx(isDragging && 'opacity-40')}>
      {children({ setNode: setActivatorNodeRef, props: { ...attributes, ...listeners } })}
    </li>
  )
}

function DroppableSlot({ id, isEmpty, children }: { id: string; isEmpty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <ul
      ref={setNodeRef}
      className={clsx(
        'grid gap-2 rounded-2xl transition',
        isEmpty && 'min-h-14 place-items-center border-2 border-dashed border-border text-sm text-muted',
        isOver && isEmpty && 'border-accent bg-accent-soft',
      )}
    >
      {isEmpty ? <li aria-hidden>Drop here</li> : children}
    </ul>
  )
}

/** Day by day, morning → evening. Admins drag entries by the handle (or use the arrows); members just read. */
export function Timeline(props: TimelineProps) {
  return props.isAdmin ? <AdminTimeline {...props} /> : <ReadTimeline {...props} />
}

function ReadTimeline({ items, days, numberOf, placeById, nameOf, onOpen }: TimelineProps) {
  return (
    <div className="grid gap-6">
      {days.map((day) => {
        const slots = DAY_SLOTS.map((s) => ({ slot: s.key as DaySlot, list: slotItems(items, day, s.key) })).filter((s) => s.list.length)
        return (
          <section key={day} id={`day-${day}`} aria-labelledby={`day-${day}-h`} className="scroll-mt-20 animate-rise">
            <DayHeading day={day} number={numberOf(day)} id={`day-${day}-h`} />
            {slots.length === 0 ? (
              <p className="mt-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Nothing planned yet — a free day so far.</p>
            ) : (
              <div className="mt-2 grid gap-3">
                {slots.map(({ slot, list }) => (
                  <div key={slot}>
                    <SlotHeading slot={slot} label={`${slotLabel(slot)}, ${formatDay(day)}`} />
                    <ul className="grid gap-2">
                      {list.map((item) => (
                        <li key={item.id}>
                          <ItemCard item={item} name={nameOf(item)} place={item.place_id ? placeById.get(item.place_id) : undefined} onOpen={() => onOpen(item.id)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function AdminTimeline({ items, days, numberOf, placeById, nameOf, onOpen, onAdd }: TimelineProps) {
  const move = useMoveItem()
  const [draft, setDraft] = useState<Containers | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const base = useMemo(() => containersFor(items, days), [items, days])
  const containers = draft ?? base
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findContainer = (id: UniqueIdentifier, from: Containers = containers) =>
    String(id) in from ? String(id) : Object.keys(from).find((key) => from[key].includes(String(id)))

  const describe = (id: UniqueIdentifier | undefined) => {
    if (!id) return 'nowhere'
    const group = parseGroupKey(String(id)) ?? parseGroupKey(findContainer(id) ?? '')
    return group ? `${slotLabel(group.slot)}, ${formatDay(group.day)}` : 'the itinerary'
  }
  const name = (id: UniqueIdentifier) => {
    const item = byId.get(String(id))
    return item ? nameOf(item) : 'Entry'
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}. Use the arrow keys to move it, space to drop.`,
    onDragOver: ({ active, over }) => `${name(active.id)} is in ${describe(over?.id)}.`,
    onDragEnd: ({ active, over }) => (over ? `${name(active.id)} dropped in ${describe(over.id)}.` : `${name(active.id)} put back.`),
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  }

  async function commit(id: string, target: MoveTarget) {
    setError('')
    try {
      await move.mutateAsync({ id, target })
    } catch (e) {
      setError(itineraryErrorMessage(e as Error))
    }
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setDraft(base)
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    setDraft((prev) => {
      const current = prev ?? base
      const from = findContainer(active.id, current)
      const to = findContainer(over.id, current)
      if (!from || !to || from === to) return current
      const target = current[to]
      const overIndex = target.indexOf(String(over.id))
      const below = active.rect.current.translated ? active.rect.current.translated.top > over.rect.top + over.rect.height / 2 : false
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length
      return {
        ...current,
        [from]: current[from].filter((x) => x !== String(active.id)),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      }
    })
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id)
    setActiveId(null)
    const current = draft ?? base
    const container = findContainer(id, current)
    const group = container ? parseGroupKey(container) : null
    if (!container || !group || !over) {
      setDraft(null)
      return
    }
    let list = current[container]
    const overIndex = list.indexOf(String(over.id))
    const activeIndex = list.indexOf(id)
    if (overIndex >= 0 && overIndex !== activeIndex) list = arrayMove(list, activeIndex, overIndex)
    const index = list.indexOf(id)
    setDraft({ ...current, [container]: list })
    const original = byId.get(id)
    const unchanged = original && groupKey(original.day, original.slot) === container && base[container].indexOf(id) === index
    if (!unchanged) await commit(id, { day: group.day, slot: group.slot, index })
    // Keep the dragged order on screen until the optimistic cache update has landed.
    setDraft(null)
  }

  const active = activeId ? byId.get(activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => { setActiveId(null); setDraft(null) }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To move an entry, press space or enter on its handle, use the arrow keys, then press space again to drop. Escape cancels. The move earlier and move later buttons do the same thing one step at a time.',
        },
      }}
    >
      <FormMessage tone="error" className="mb-3">{error}</FormMessage>
      <div className="grid gap-6">
        {days.map((day) => (
          <section key={day} id={`day-${day}`} aria-labelledby={`day-${day}-h`} className="scroll-mt-20">
            <DayHeading day={day} number={numberOf(day)} id={`day-${day}-h`} />
            <div className="mt-1 grid gap-2">
              {DAY_SLOTS.map(({ key: slot }) => {
                const key = groupKey(day, slot)
                const ids = containers[key] ?? []
                return (
                  <div key={slot}>
                    <SlotHeading slot={slot} label={`${slotLabel(slot)}, ${formatDay(day)}`} onAdd={() => onAdd(day, slot)} />
                    <SortableContext id={key} items={ids} strategy={verticalListSortingStrategy}>
                      <DroppableSlot id={key} isEmpty={ids.length === 0}>
                        {ids.map((itemId) => {
                          const item = byId.get(itemId)
                          if (!item) return null
                          const up = stepTarget(items, days, itemId, -1)
                          const down = stepTarget(items, days, itemId, 1)
                          const busy = move.isPending && move.variables?.id === itemId
                          return (
                            <SortableItem key={itemId} id={itemId}>
                              {(handle) => (
                                <ItemCard
                                  item={item}
                                  name={nameOf(item)}
                                  place={item.place_id ? placeById.get(item.place_id) : undefined}
                                  onOpen={() => onOpen(itemId)}
                                  controls={{
                                    handle: <DragHandle label={nameOf(item)} setNode={handle.setNode} props={handle.props} />,
                                    onUp: up ? () => void commit(itemId, up) : undefined,
                                    onDown: down ? () => void commit(itemId, down) : undefined,
                                    busy,
                                  }}
                                />
                              )}
                            </SortableItem>
                          )
                        })}
                      </DroppableSlot>
                    </SortableContext>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <DragOverlay>
        {active ? <ItemCard item={active} name={nameOf(active)} place={active.place_id ? placeById.get(active.place_id) : undefined} onOpen={() => {}} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
