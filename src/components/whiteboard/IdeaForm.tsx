import { clsx } from 'clsx'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { describedBy } from '@/components/ui/fieldAria'
import { FieldShell, inputClass } from '@/components/ui/Field'
import { NOTE_COLORS, type NoteColor } from './notes'

/** Quick "sticky note" form: easier than typing on the canvas with a phone keyboard. */
export function IdeaForm({ onSubmit, onCancel }: { onSubmit: (text: string, color: NoteColor) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [color, setColor] = useState<NoteColor>('yellow')
  const [error, setError] = useState('')
  const id = useId()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) {
      setError('Write something for the note.')
      return
    }
    onSubmit(text.trim(), color)
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FieldShell id={id} label="Your idea" error={error} hint="It lands as a sticky note in the middle of the board. Move it wherever you like.">
        <textarea
          id={id}
          rows={4}
          autoFocus
          maxLength={500}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          placeholder="e.g. Day trip to Kamakura? 🍡"
          className={clsx(inputClass, 'h-auto min-h-28 py-3')}
          {...describedBy(id, error, true)}
        />
      </FieldShell>
      <fieldset>
        <legend className="mb-1.5 text-sm font-extrabold">Note color</legend>
        <div className="flex flex-wrap gap-2">
          {NOTE_COLORS.map((c) => (
            <label
              key={c.key}
              className={clsx(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border-2 px-3 text-sm font-bold',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring',
                color === c.key ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
              )}
            >
              <input type="radio" name="note-color" value={c.key} checked={color === c.key} onChange={() => setColor(c.key)} className="sr-only" />
              <span aria-hidden className="size-5 rounded-md border border-black/10" style={{ background: c.fill }} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Add to board</Button>
      </div>
    </form>
  )
}
