import { ChevronRight, Loader2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CategoryBadge } from '@/components/badges'
import { PageHeader } from '@/components/PageHeader'
import { AddedBy, MemberVotes, PriceText, PriorityStars, VoteCounts } from '@/components/places/bits'
import { Chip } from '@/components/places/FilterChips'
import { usePlaceSheet } from '@/components/places/placeSheet'
import { StatusActions } from '@/components/places/StatusActions'
import { VoteControl } from '@/components/places/VoteControl'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormMessage } from '@/components/ui/Field'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import type { PlaceStatus } from '@/lib/constants'
import { usePlaceBoard } from '@/lib/placeBoard'
import { placeErrorMessage, useSetPlaceStatus, type Place } from '@/lib/places'
import { compareForVoting, CONSENSUS_LABELS, consensus } from '@/lib/votes'

type Decision = { placeId: string; name: string; from: PlaceStatus; text: string }

export default function Voting() {
  const board = usePlaceBoard()
  const sheet = usePlaceSheet()
  const [onlyMine, setOnlyMine] = useState(false)
  const [decided, setDecided] = useState<Decision | null>(null)
  const [failure, setFailure] = useState('')
  const undo = useSetPlaceStatus()
  const meId = board.me?.id

  const open = useMemo(
    () =>
      (board.places ?? [])
        .filter((p) => p.status === 'awaiting')
        .sort((a, b) => compareForVoting(a, b, board.tallies, meId)),
    [board.places, board.tallies, meId],
  )
  const needsMe = open.filter((p) => meId && !board.tallies.get(p.id)?.byMember.has(meId))
  const shown = onlyMine ? needsMe : open

  return (
    <>
      <PageHeader title="Voting" subtitle="Yes, maybe or no — decide together." />

      <div aria-live="polite">
        {decided && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-ok-bg px-3.5 py-2 text-sm font-bold text-ok-fg animate-rise">
            <span className="flex-1">{decided.text}</span>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 text-ok-fg"
              disabled={undo.isPending}
              onClick={() =>
                undo.mutate(
                  { id: decided.placeId, status: decided.from },
                  { onSuccess: () => setDecided(null), onError: (e) => setFailure(placeErrorMessage(e)) },
                )
              }
            >
              {undo.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Undo2 className="size-4" aria-hidden />}
              Undo
            </Button>
          </div>
        )}
      </div>
      <FormMessage tone="error" className="mb-4">{failure}</FormMessage>

      {board.isPending ? (
        <div className="grid gap-3">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : board.isError ? (
        <Card>
          <ErrorState message="Couldn't load the votes." onRetry={() => void board.refetch()} />
        </Card>
      ) : open.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to vote on"
            message="New places show up here until the admin decides. Add one and the family can weigh in."
            action={<Button onClick={sheet.createPlace}>Add a place</Button>}
          />
        </Card>
      ) : (
        <>
          <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-2">
            <Chip pressed={!onlyMine} onClick={() => setOnlyMine(false)} count={open.length}>All open</Chip>
            <Chip pressed={onlyMine} onClick={() => setOnlyMine(true)} count={needsMe.length}>Needs my vote</Chip>
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState title="You're all caught up" message="You've voted on every open place. Nice!" />
            </Card>
          ) : (
            <ul className="grid gap-4">
              {shown.map((place) => (
                <li key={place.id}>
                  <VotingCard
                    place={place}
                    onOpen={() => sheet.openPlace(place.id)}
                    onDecided={(d) => {
                      setFailure('')
                      setDecided(d)
                    }}
                    onFailed={setFailure}
                    board={board}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 text-center text-sm text-muted">
            Decided places move to <Link to="/plans" className="font-bold text-accent-text underline-offset-2 hover:underline">Current Plans</Link>{' '}
            or out of the list.
          </p>
        </>
      )}
    </>
  )
}

function VotingCard({ place, onOpen, onDecided, onFailed, board }: {
  place: Place
  onOpen: () => void
  onDecided: (d: Decision) => void
  onFailed: (message: string) => void
  board: ReturnType<typeof usePlaceBoard>
}) {
  const tally = board.tallyOf(place.id)
  const myVote = board.me ? tally.byMember.get(board.me.id) : undefined
  const waiting = tally.waitingOn.length

  return (
    <Card className="animate-rise">
      <button type="button" onClick={onOpen} className="-m-1 mb-2 flex w-full items-start gap-2 rounded-2xl p-1 text-left hover:bg-surface-2/60">
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold break-words">{place.name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CategoryBadge category={place.category} />
            <PriorityStars priority={place.priority} />
            <PriceText jpy={place.price_jpy} />
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Open details</span>
      </button>
      <AddedBy member={place.added_by ? board.memberById.get(place.added_by) : undefined} />

      <div className="mt-4">
        <VoteControl placeId={place.id} placeName={place.name} myVote={myVote} />
      </div>

      <div className="mt-4">
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-extrabold">{CONSENSUS_LABELS[consensus(tally)]}</span>
          <VoteCounts tally={tally} />
          {waiting > 0 && <span className="text-muted">· waiting on {waiting}</span>}
        </p>
        <MemberVotes tally={tally} members={board.members} meId={board.me?.id} />
      </div>

      {board.isAdmin && (
        <div className="mt-4 border-t border-border pt-4">
          <StatusActions place={place} onDone={onDecided} onFailed={onFailed} />
        </div>
      )}
    </Card>
  )
}
