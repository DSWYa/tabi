import { clsx } from 'clsx'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { describedBy } from '@/components/ui/fieldAria'
import { Field, FieldShell, FormMessage, inputClass } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { LIMITS } from '@/lib/constants'
import { formatItemWhen, itineraryErrorMessage, type ItineraryItem } from '@/lib/itinerary'
import {
  formToSuggestionInput, validateSuggestionForm, type SuggestionFormErrors, type SuggestionFormValues, type SuggestionInput,
} from '@/lib/itineraryForm'
import type { Place } from '@/lib/places'
import { DayPicker } from './ItemForm'
import { SLOT_OPTIONS } from './slots'

/** Member form: propose a new stop, or a new day/time for an existing entry ("move"). The admin reviews it. */
export function SuggestionForm({ initial, places, current, currentName, days, numberOf, onSubmit, onCancel }: {
  initial: SuggestionFormValues
  places: Place[]
  /** For a "move": the entry being changed. */
  current?: ItineraryItem
  currentName?: string
  days: string[]
  numberOf: (day: string) => number | null
  onSubmit: (input: SuggestionInput) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<SuggestionFormErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const ids = { place: useId(), note: useId() }
  const set = <K extends keyof SuggestionFormValues>(key: K, value: SuggestionFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const found = validateSuggestionForm(values, current)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      ;(e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      if (found.itemId) setFormError(found.itemId)
      return
    }
    setSaving(true)
    try {
      await onSubmit(formToSuggestionInput(values))
    } catch (error) {
      setFormError(itineraryErrorMessage(error as Error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {values.kind === 'move' && current ? (
        <div className="rounded-2xl bg-surface-2 p-3.5 text-sm">
          <p className="font-extrabold">{currentName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted">
            Now: {formatItemWhen(current)} <ArrowRight className="size-3.5" aria-hidden /> pick the new time below
          </p>
        </div>
      ) : (
        <>
          <FieldShell id={ids.place} label="Which place?" hint="Places still being voted on can be suggested too.">
            <select id={ids.place} value={values.placeId} onChange={(e) => set('placeId', e.target.value)} className={inputClass} {...describedBy(ids.place, undefined, true)}>
              <option value="">Something else…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.status === 'awaiting' ? ' (being voted on)' : ''}</option>
              ))}
            </select>
          </FieldShell>
          {!values.placeId && (
            <Field
              label="What do you have in mind?"
              value={values.title}
              maxLength={LIMITS.itemTitle}
              autoComplete="off"
              placeholder="e.g. Ramen lunch in Shinjuku"
              error={errors.title}
              onChange={(e) => set('title', e.target.value)}
            />
          )}
        </>
      )}

      <DayPicker value={values.day} days={days} numberOf={numberOf} onChange={(day) => set('day', day)} error={errors.day} />
      <Segmented legend="Part of the day" name="suggest-slot" value={values.slot} options={SLOT_OPTIONS} onChange={(slot) => set('slot', slot)} error={errors.slot} />
      <Field label="Time (optional)" type="time" value={values.start} error={errors.start} onChange={(e) => set('start', e.target.value)} className="max-w-48" />

      <FieldShell id={ids.note} label="Note for the admin" error={errors.note} hint="Why this works — opening hours, sunset, who wants it…">
        <textarea
          id={ids.note}
          rows={3}
          value={values.note}
          maxLength={LIMITS.suggestionNote}
          onChange={(e) => set('note', e.target.value)}
          className={clsx(inputClass, 'h-auto min-h-20 py-3')}
          {...describedBy(ids.note, errors.note, true)}
        />
      </FieldShell>

      <FormMessage tone="error">{formError}</FormMessage>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Send suggestion
        </Button>
      </div>
    </form>
  )
}
