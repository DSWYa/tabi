import { clsx } from 'clsx'
import { Loader2, Star } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { categoryIcons } from '@/components/categoryIcons'
import { Button } from '@/components/ui/Button'
import { Field, FormMessage, inputClass } from '@/components/ui/Field'
import { CATEGORIES, LIMITS, PRIORITY_LABELS } from '@/lib/constants'
import { formatUsd } from '@/lib/format'
import { jpyToUsd, useUsdPerJpy } from '@/lib/fx'
import { formToInput, parseYen, validatePlaceForm, type PlaceFormErrors, type PlaceFormValues } from '@/lib/placeForm'
import { placeErrorMessage, type PlaceInput } from '@/lib/places'

function FieldShell({ label, hint, error, children, id }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-bold text-bad-fg">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** Create/edit form. Validation mirrors the DB constraints; Postgres re-checks everything. */
export function PlaceForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: PlaceFormValues
  submitLabel: string
  onSubmit: (input: PlaceInput) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<PlaceFormErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const rate = useUsdPerJpy()
  const ids = { notes: useId(), price: useId() }
  const set = <K extends keyof PlaceFormValues>(key: K, value: PlaceFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const price = parseYen(values.price)
  const usdHint = price && !Number.isNaN(price) && rate ? `About ${formatUsd(jpyToUsd(price, rate)).slice(1)} at today's rate.` : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const found = validatePlaceForm(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      // Move focus to the first problem so screen-reader and keyboard users land on it.
      const first = (e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')
      first?.focus()
      return
    }
    setSaving(true)
    try {
      await onSubmit(formToInput(values))
    } catch (error) {
      setFormError(placeErrorMessage(error as Error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field
        label="Name"
        value={values.name}
        maxLength={LIMITS.placeName}
        autoComplete="off"
        placeholder="e.g. teamLab Planets"
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
      />

      <fieldset>
        <legend className="mb-1.5 text-sm font-extrabold">Category</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map(({ key, label, color }) => {
            const Icon = categoryIcons[key]
            return (
              <label
                key={key}
                className={clsx(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border-2 px-2.5 text-sm font-bold transition',
                  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring',
                  values.category === key ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={key}
                  checked={values.category === key}
                  onChange={() => set('category', key)}
                  className="sr-only"
                />
                <span className="grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ background: color }}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="leading-tight">{label}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-extrabold">Priority</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              title={PRIORITY_LABELS[n]}
              className="grid size-11 cursor-pointer place-items-center rounded-full text-accent-text hover:bg-surface-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="priority"
                value={n}
                checked={values.priority === n}
                onChange={() => set('priority', n)}
                className="sr-only"
                aria-label={`${n} — ${PRIORITY_LABELS[n]}`}
              />
              <Star aria-hidden className={clsx('size-7', n <= values.priority ? 'fill-current' : 'opacity-35')} />
            </label>
          ))}
          <span className="ml-2 text-sm font-bold text-muted" aria-hidden>{PRIORITY_LABELS[values.priority]}</span>
        </div>
      </fieldset>

      <FieldShell id={ids.price} label="Price per person (¥)" error={errors.price} hint={usdHint ?? 'Optional. 0 means free.'}>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">¥</span>
          <input
            id={ids.price}
            inputMode="numeric"
            autoComplete="off"
            placeholder="2500"
            value={values.price}
            aria-invalid={Boolean(errors.price) || undefined}
            aria-describedby={errors.price ? `${ids.price}-error` : `${ids.price}-hint`}
            onChange={(e) => set('price', e.target.value)}
            className={clsx(inputClass, 'pl-9')}
          />
        </div>
      </FieldShell>

      <Field
        label="Address"
        value={values.address}
        maxLength={LIMITS.placeAddress}
        autoComplete="off"
        placeholder="e.g. 6-1-16 Toyosu, Koto City, Tokyo"
        hint="We'll pin it on the map automatically. You can move the pin afterwards."
        error={errors.address}
        onChange={(e) => set('address', e.target.value)}
      />

      <Field
        label="Website"
        type="url"
        inputMode="url"
        autoComplete="off"
        value={values.website}
        maxLength={LIMITS.placeWebsite}
        placeholder="https://…"
        error={errors.website}
        onChange={(e) => set('website', e.target.value)}
      />

      <FieldShell id={ids.notes} label="Notes" error={errors.notes} hint="Opening hours, what to order, booking tips…">
        <textarea
          id={ids.notes}
          rows={3}
          value={values.notes}
          maxLength={LIMITS.placeNotes}
          aria-invalid={Boolean(errors.notes) || undefined}
          aria-describedby={errors.notes ? `${ids.notes}-error` : `${ids.notes}-hint`}
          onChange={(e) => set('notes', e.target.value)}
          className={clsx(inputClass, 'h-auto min-h-24 py-3')}
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
