import { clsx } from 'clsx'
import { Check, Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { FormMessage } from '@/components/ui/Field'
import { readableTextOn } from '@/lib/color'
import { friendlyError } from '@/lib/join'
import { useMe, useUpdateMyProfile } from '@/lib/members'
import { isPinConflict, pinColorOptions, pinConflictMessage, type PinColorOption } from '@/lib/pinColors'

/**
 * Each preset belongs to at most one member (UNIQUE in the DB). Taken colors are disabled and say who
 * has them; the list stays live via realtime. If two people click the same free color at the same
 * moment, the database accepts one and we explain it kindly to the other.
 */
export function PinColorPicker() {
  const { data: members = [], me, refetch } = useMe()
  const update = useUpdateMyProfile()
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const options = pinColorOptions(members, me?.id)

  async function pick(option: PinColorOption) {
    if (option.mine || option.takenBy || pending) return
    setPending(option.key)
    setMessage(null)
    try {
      await update.mutateAsync({ pin_color: option.key })
      setMessage({ tone: 'success', text: `${option.label} is yours. Your map pins will use it.` })
    } catch (error) {
      if (isPinConflict(error)) {
        const { data } = await refetch()
        const winner = data?.find((m) => m.pin_color === option.key && m.id !== me?.id) ?? null
        setMessage({ tone: 'error', text: pinConflictMessage(option.label, winner) })
      } else {
        setMessage({ tone: 'error', text: friendlyError(error as Error) })
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Map pin color" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {options.map((option) => {
          const busy = pending === option.key
          const status = option.mine ? 'Yours' : option.takenBy ? `Taken by ${option.takenBy.display_name}` : 'Available'
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={option.mine}
              aria-disabled={Boolean(option.takenBy) || undefined}
              aria-label={`${option.label} — ${status}`}
              onClick={() => void pick(option)}
              className={clsx(
                'flex min-h-14 items-center gap-2.5 rounded-2xl border-2 p-2 text-left transition',
                option.mine ? 'border-accent bg-accent-soft' : 'border-border bg-bg',
                option.takenBy ? 'cursor-not-allowed' : !option.mine && 'hover:border-accent/60',
              )}
            >
              <span
                aria-hidden
                className={clsx('grid size-9 shrink-0 place-items-center rounded-full shadow-card', option.takenBy && 'opacity-45 saturate-[.3]')}
                style={{ background: option.hex, color: readableTextOn(option.hex) }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : option.mine ? <Check className="size-5" strokeWidth={3} /> : option.takenBy ? <Lock className="size-3.5" /> : null}
              </span>
              <span className="min-w-0">
                <span className={clsx('block text-sm font-extrabold', option.takenBy && 'text-muted')}>{option.label}</span>
                <span className={clsx('block truncate text-xs', option.mine ? 'font-bold text-accent-text' : 'text-muted')}>
                  {option.takenBy ? option.takenBy.display_name : option.mine ? 'Yours' : 'Available'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 empty:hidden">
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      </div>
    </div>
  )
}
