import { clsx } from 'clsx'
import { useState } from 'react'
import { FormMessage } from '@/components/ui/Field'
import { VOTES, type VoteValue } from '@/lib/constants'
import { useOnline, usePendingSync } from '@/lib/outboxRuntime'
import { placeErrorMessage, useCastVote } from '@/lib/places'
import { voteIcons } from './voteStyle'

const selectedStyle: Record<VoteValue, string> = {
  yes: 'bg-ok-bg text-ok-fg ring-2 ring-ok-fg/40',
  maybe: 'bg-warn-bg text-warn-fg ring-2 ring-warn-fg/40',
  no: 'bg-bad-bg text-bad-fg ring-2 ring-bad-fg/40',
}

/** Yes / Maybe / No for the signed-in member. Tapping your current choice again withdraws the vote. */
export function VoteControl({ placeId, placeName, myVote }: { placeId: string; placeName: string; myVote: VoteValue | undefined }) {
  const cast = useCastVote()
  const [error, setError] = useState('')
  const waiting = usePendingSync().votes.has(placeId)
  const online = useOnline()

  function choose(vote: VoteValue) {
    setError('')
    cast.mutate(
      { placeId, vote: vote === myVote ? null : vote },
      { onError: (e) => setError(placeErrorMessage(e)) },
    )
  }

  return (
    <div>
      <div role="radiogroup" aria-label={`Your vote on ${placeName}`} className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-1.5">
        {VOTES.map(({ key, label }) => {
          const Icon = voteIcons[key]
          const selected = myVote === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(key)}
              title={selected ? 'Tap again to take your vote back' : undefined}
              className={clsx(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition active:scale-[0.97]',
                selected ? selectedStyle[key] : 'text-muted hover:bg-surface hover:text-text',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
      {waiting && !online && (
        <p role="status" className="mt-2 text-xs font-bold text-muted">Saved on this device — it’s sent when you’re back online.</p>
      )}
      <FormMessage tone="error" className="mt-2">{error}</FormMessage>
    </div>
  )
}
