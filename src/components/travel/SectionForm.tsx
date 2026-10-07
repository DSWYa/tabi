import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { describedBy } from '@/components/ui/fieldAria'
import { Field, FieldShell, FormMessage, inputClass } from '@/components/ui/Field'
import { LIMITS, TRAVEL_ICONS } from '@/lib/constants'
import { sectionInput, travelErrorMessage, validateSection, type SectionFormValues, type SectionInput } from '@/lib/travelInfo'
import { travelIcons } from './travelIcons'

/** Admin create/rename/edit form for a Travel Info section. */
export function SectionForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: SectionFormValues
  submitLabel: string
  onSubmit: (input: SectionInput) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<ReturnType<typeof validateSection>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const bodyId = useId()
  const set = <K extends keyof SectionFormValues>(key: K, value: SectionFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const found = validateSection(values)
    setErrors(found)
    if (Object.keys(found).length) {
      ;(e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    setSaving(true)
    try {
      await onSubmit(sectionInput(values))
    } catch (error) {
      setFormError(travelErrorMessage(error as Error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field
        label="Title"
        value={values.title}
        maxLength={LIMITS.travelTitle}
        autoComplete="off"
        placeholder="e.g. Hotel / Accommodation"
        error={errors.title}
        onChange={(e) => set('title', e.target.value)}
      />

      <fieldset>
        <legend className="mb-1.5 text-sm font-extrabold">Icon</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {TRAVEL_ICONS.map(({ key, label }) => {
            const Icon = travelIcons[key]
            return (
              <label
                key={key}
                title={label}
                className={clsx(
                  'grid min-h-11 cursor-pointer place-items-center rounded-2xl border-2 transition',
                  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring',
                  values.icon === key ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:bg-surface-2',
                )}
              >
                <input type="radio" name="travel-icon" value={key} checked={values.icon === key} onChange={() => set('icon', key)} className="sr-only" aria-label={label} />
                <Icon className="size-5" aria-hidden />
              </label>
            )
          })}
        </div>
      </fieldset>

      <FieldShell
        id={bodyId}
        label="Details"
        error={errors.body}
        hint="Plain text. Web links and phone numbers become tappable. Don’t store passport, card or bank numbers here."
      >
        <textarea
          id={bodyId}
          rows={9}
          value={values.body}
          maxLength={LIMITS.travelBody}
          onChange={(e) => set('body', e.target.value)}
          className={clsx(inputClass, 'h-auto min-h-48 py-3 leading-relaxed')}
          {...describedBy(bodyId, errors.body, true)}
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
