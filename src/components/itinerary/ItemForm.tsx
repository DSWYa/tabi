import { clsx } from 'clsx'
import { CalendarCheck, CalendarClock, CalendarX, Loader2, type LucideIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { describedBy } from '@/components/ui/fieldAria'
import { Field, FieldShell, FormMessage, inputClass } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { LIMITS, RESERVATION_STATUSES, type ReservationStatus } from '@/lib/constants'
import { formatDay, itineraryErrorMessage, type ItemInput } from '@/lib/itinerary'
import { formToItemInput, validateItemForm, type ItemFormErrors, type ItemFormValues } from '@/lib/itineraryForm'
import type { Place } from '@/lib/places'
import { SLOT_OPTIONS } from './slots'

const reservationIcons: Record<ReservationStatus, LucideIcon> = { required: CalendarClock, booked: CalendarCheck, none: CalendarX }
const reservationShort: Record<ReservationStatus, string> = { required: 'Needed', booked: 'Booked', none: 'None' }

/** Day picker: the trip's days when known (fast on a phone), otherwise a plain date input. */
export function DayPicker({ value, days, numberOf, onChange, error }: {
  value: string
  days: string[]
  numberOf: (day: string) => number | null
  onChange: (day: string) => void
  error?: string
}) {
  const id = useId()
  const options = value && !days.includes(value) ? [...days, value].sort() : days
  return (
    <FieldShell id={id} label="Day" error={error}>
      {options.length > 0 ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...describedBy(id, error)}>
          {!value && <option value="">Pick a day…</option>}
          {options.map((day) => (
            <option key={day} value={day}>
              {numberOf(day) ? `Day ${numberOf(day)} · ` : ''}
              {formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' })}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...describedBy(id, error)} />
      )}
    </FieldShell>
  )
}

/** Admin create/edit form for an itinerary entry. Validation mirrors the DB; Postgres re-checks everything. */
export function ItemForm({ initial, places, days, numberOf, submitLabel, onSubmit, onCancel }: {
  initial: ItemFormValues
  numberOf: (day: string) => number | null
  /** Places that can be scheduled (in the plan / visited, plus whatever is already selected). */
  places: Place[]
  days: string[]
  submitLabel: string
  onSubmit: (input: ItemInput) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<ItemFormErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const ids = { place: useId(), notes: useId() }
  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const selected = places.find((p) => p.id === values.placeId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const found = validateItemForm(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      ;(e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    setSaving(true)
    try {
      await onSubmit(formToItemInput(values))
    } catch (error) {
      setFormError(itineraryErrorMessage(error as Error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FieldShell id={ids.place} label="Place" hint="Or leave it as “Something else” for a free-form stop (lunch, hotel check-in…).">
        <select id={ids.place} value={values.placeId} onChange={(e) => set('placeId', e.target.value)} className={inputClass} {...describedBy(ids.place, undefined, true)}>
          <option value="">Something else (no place)</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.status === 'visited' ? ' (visited)' : ''}</option>
          ))}
        </select>
      </FieldShell>

      <Field
        label={values.placeId ? 'Title (optional)' : 'Title'}
        value={values.title}
        maxLength={LIMITS.itemTitle}
        autoComplete="off"
        placeholder={selected ? selected.name : 'e.g. Lunch near the station'}
        hint={values.placeId ? 'Leave blank to use the place’s name.' : undefined}
        error={errors.title}
        onChange={(e) => set('title', e.target.value)}
      />

      <DayPicker value={values.day} days={days} numberOf={numberOf} onChange={(day) => set('day', day)} error={errors.day} />

      <Segmented legend="Part of the day" name="slot" value={values.slot} options={SLOT_OPTIONS} onChange={(slot) => set('slot', slot)} error={errors.slot} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" type="time" value={values.start} error={errors.start} onChange={(e) => set('start', e.target.value)} />
        <Field label="Ends" type="time" value={values.end} error={errors.end} disabled={!values.start} onChange={(e) => set('end', e.target.value)} />
      </div>

      <Segmented
        legend="Reservation"
        name="reservation"
        value={values.reservation}
        onChange={(r) => set('reservation', r)}
        error={errors.reservation}
        options={RESERVATION_STATUSES.map((r) => {
          const Icon = reservationIcons[r.key]
          return { key: r.key, label: reservationShort[r.key], icon: <Icon className="size-4" aria-hidden /> }
        })}
      />

      {values.reservation !== 'none' && (
        <div className={clsx('grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-surface-2 p-3', 'animate-rise')}>
          <Field
            label="Booking reference"
            value={values.reservationRef}
            maxLength={LIMITS.reservationRef}
            autoComplete="off"
            placeholder={values.reservation === 'booked' ? 'e.g. TLP-48213' : 'Add it once booked'}
            error={errors.reservationRef}
            onChange={(e) => set('reservationRef', e.target.value)}
          />
          <Field label="Time" type="time" value={values.reservationTime} error={errors.reservationTime} onChange={(e) => set('reservationTime', e.target.value)} className="w-32" />
        </div>
      )}

      <FieldShell id={ids.notes} label="Notes" error={errors.notes} hint="Meeting point, what to bring, tickets…">
        <textarea
          id={ids.notes}
          rows={3}
          value={values.notes}
          maxLength={LIMITS.itemNotes}
          onChange={(e) => set('notes', e.target.value)}
          className={clsx(inputClass, 'h-auto min-h-24 py-3')}
          {...describedBy(ids.notes, errors.notes, true)}
        />
      </FieldShell>

      <FormMessage tone="error">{formError}</FormMessage>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
