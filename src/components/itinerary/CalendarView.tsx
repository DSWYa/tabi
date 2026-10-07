import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DAY_SLOTS, type DaySlot } from '@/lib/constants'
import { addDays, formatDay, slotItems, slotLabel, type ItineraryItem } from '@/lib/itinerary'
import { ItemCard } from './ItemCard'
import { slotIcons } from './slots'
import { DayHeading, type TimelineProps } from './Timeline'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Month grids for the trip; pick a day to see its morning / afternoon / evening below. */
export function CalendarView({ items, days, numberOf, placeById, nameOf, isAdmin, onOpen, onAdd, today }: TimelineProps & { today: string }) {
  const daySet = useMemo(() => new Set(days), [days])
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked && daySet.has(picked) ? picked : daySet.has(today) ? today : days.find((d) => items.some((i) => i.day === d)) ?? days[0]

  const months = useMemo(() => [...new Set(days.map((d) => d.slice(0, 7)))], [days])
  const countByDay = useMemo(() => {
    const map = new Map<string, Record<DaySlot, number>>()
    for (const item of items) {
      const entry = map.get(item.day) ?? { morning: 0, afternoon: 0, evening: 0 }
      entry[item.slot]++
      map.set(item.day, entry)
    }
    return map
  }, [items])

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid gap-4">
        {months.map((month) => {
          const first = `${month}-01`
          const lead = new Date(`${first}T00:00:00Z`).getUTCDay()
          const cells: (string | null)[] = Array.from({ length: lead }, () => null)
          for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d)
          return (
            <section key={month} aria-label={formatDay(first, { month: 'long', year: 'numeric' })} className="rounded-card border border-border bg-surface p-3 shadow-card sm:p-4">
              <h2 className="mb-2 px-1 font-black">{formatDay(first, { month: 'long', year: 'numeric' })}</h2>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w) => (
                  <div key={w} aria-hidden className="pb-1 text-[11px] font-bold text-muted">{w}</div>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <div key={`blank-${i}`} aria-hidden />
                  const inTrip = daySet.has(day)
                  const counts = countByDay.get(day)
                  const total = counts ? counts.morning + counts.afternoon + counts.evening : 0
                  const isSelected = day === selected
                  const names = items.filter((it) => it.day === day).slice(0, 2).map(nameOf)
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!inTrip}
                      aria-pressed={isSelected}
                      onClick={() => setPicked(day)}
                      className={clsx(
                        'flex min-h-14 flex-col items-center gap-1 rounded-xl p-1 text-sm transition sm:min-h-20 sm:items-stretch',
                        !inTrip && 'text-muted/50',
                        inTrip && !isSelected && 'bg-surface-2 font-bold hover:brightness-95',
                        isSelected && 'bg-accent font-black text-accent-fg',
                        day === today && !isSelected && 'ring-2 ring-accent',
                      )}
                    >
                      {/* The full description is the button's name (no aria-label, so the visible number stays part of it). */}
                      <span className="sr-only">
                        {`${formatDay(day, { weekday: 'long', month: 'long', day: 'numeric' })}${numberOf(day) ? `, day ${numberOf(day)}` : ''}: ${total === 0 ? 'nothing planned' : `${total} ${total === 1 ? 'stop' : 'stops'}`}`}
                      </span>
                      <span className="sm:self-start sm:px-1" aria-hidden>{Number(day.slice(8))}</span>
                      {counts && (
                        <span className="flex justify-center gap-0.5 sm:hidden" aria-hidden>
                          {DAY_SLOTS.map((s) => counts[s.key] > 0 && <span key={s.key} className={clsx('size-1.5 rounded-full', isSelected ? 'bg-accent-fg' : 'bg-accent')} />)}
                        </span>
                      )}
                      <span className="hidden min-w-0 flex-col gap-0.5 text-left text-[11px] leading-tight font-semibold sm:flex" aria-hidden>
                        {names.map((n, j) => <span key={j} className="truncate">{n}</span>)}
                        {total > names.length && <span className="opacity-75">+{total - names.length} more</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {selected && (
        <section aria-labelledby="calendar-day" className="grid gap-3 rounded-card border border-border bg-surface p-4 shadow-card lg:sticky lg:top-8" aria-live="polite">
          <DayHeading day={selected} number={numberOf(selected)} id="calendar-day" />
          {DAY_SLOTS.map(({ key: slot }) => {
            const list = slotItems(items, selected, slot)
            const Icon = slotIcons[slot]
            if (!list.length && !isAdmin) return null
            return (
              <div key={slot}>
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-extrabold tracking-wide text-muted uppercase">
                  <Icon className="size-4 text-accent-text" aria-hidden />
                  {slotLabel(slot)}
                </h3>
                {list.length ? (
                  <ul className="grid gap-2">
                    {list.map((item: ItineraryItem) => (
                      <li key={item.id}>
                        <ItemCard item={item} name={nameOf(item)} place={item.place_id ? placeById.get(item.place_id) : undefined} onOpen={() => onOpen(item.id)} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Button variant="ghost" size="sm" className="min-h-11 text-accent-text" onClick={() => onAdd(selected, slot)}>
                    <Plus className="size-4" aria-hidden />
                    Add to {slotLabel(slot).toLowerCase()}
                  </Button>
                )}
              </div>
            )
          })}
          {!isAdmin && !items.some((i) => i.day === selected) && <p className="text-sm text-muted">Nothing planned yet — a free day so far.</p>}
        </section>
      )}
    </div>
  )
}
