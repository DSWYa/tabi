import { CheckCircle2, Footprints, Loader2, RotateCcw, XCircle, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/Field'
import type { PlaceStatus } from '@/lib/constants'
import { useMe } from '@/lib/members'
import { placeErrorMessage, useSetPlaceStatus, type Place } from '@/lib/places'

interface Action {
  to: PlaceStatus
  label: string
  icon: LucideIcon
  variant: ButtonProps['variant']
  /** Past tense for the confirmation line. */
  done: string
}

const ACTIONS: Record<PlaceStatus, Action[]> = {
  awaiting: [
    { to: 'in_plan', label: 'Add to Plan', icon: CheckCircle2, variant: 'primary', done: 'added to the plan' },
    { to: 'rejected', label: 'Reject', icon: XCircle, variant: 'danger', done: 'rejected' },
  ],
  in_plan: [
    { to: 'visited', label: 'Mark visited', icon: Footprints, variant: 'secondary', done: 'marked as visited' },
    { to: 'awaiting', label: 'Back to voting', icon: RotateCcw, variant: 'ghost', done: 'sent back to voting' },
  ],
  rejected: [{ to: 'awaiting', label: 'Reopen voting', icon: RotateCcw, variant: 'secondary', done: 'reopened for voting' }],
  visited: [{ to: 'in_plan', label: 'Not visited yet', icon: RotateCcw, variant: 'ghost', done: 'moved back to the plan' }],
}

/**
 * Admin-only status buttons (hidden for members; the places_guard trigger enforces it).
 * `onDone` lets lists show "Shibuya Sky added to the plan · Undo" after the card disappears.
 */
export function StatusActions({ place, size = 'md', onDone, onFailed }: {
  place: Pick<Place, 'id' | 'name' | 'status'>
  size?: ButtonProps['size']
  onDone?: (result: { placeId: string; name: string; from: PlaceStatus; text: string }) => void
  /** For lists where this card may have unmounted (and remounted) by the time the error arrives. */
  onFailed?: (message: string) => void
}) {
  const { isAdmin } = useMe()
  const setStatus = useSetPlaceStatus()
  const [error, setError] = useState('')
  if (!isAdmin) return null

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS[place.status].map(({ to, label, icon: Icon, variant, done }) => {
          const busy = setStatus.isPending && setStatus.variables?.status === to
          return (
            <Button
              key={to}
              variant={variant}
              size={size}
              className={size === 'sm' ? 'min-h-11' : undefined}
              disabled={setStatus.isPending}
              onClick={async () => {
                setError('')
                const from = place.status
                // mutateAsync, not mutate(…, callbacks): the card may unmount as soon as the optimistic update lands.
                try {
                  await setStatus.mutateAsync({ id: place.id, status: to })
                  onDone?.({ placeId: place.id, name: place.name, from, text: `${place.name} ${done}.` })
                } catch (e) {
                  const message = placeErrorMessage(e as Error)
                  setError(message)
                  onFailed?.(message)
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
              {label}
            </Button>
          )
        })}
      </div>
      <FormMessage tone="error" className="mt-2">{error}</FormMessage>
    </div>
  )
}
