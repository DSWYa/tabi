import { clsx } from 'clsx'
import { ArrowRight, Check, CheckCircle2, Hourglass, Loader2, MessageSquarePlus, Undo2, X, XCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { PendingSyncBadge } from '@/components/badges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { describedBy } from '@/components/ui/fieldAria'
import { FieldShell, FormMessage, inputClass } from '@/components/ui/Field'
import { LIMITS, suggestionStatusByKey, type SuggestionStatus } from '@/lib/constants'
import { itineraryErrorMessage, type ItineraryItem } from '@/lib/itinerary'
import { usePendingSync } from '@/lib/outboxRuntime'
import type { Profile } from '@/lib/supabase'
import { describeSuggestion, splitSuggestions, useReviewSuggestion, useWithdrawSuggestion, type Suggestion } from '@/lib/suggestions'

const statusIcons: Record<SuggestionStatus, typeof Check> = { pending: Hourglass, approved: CheckCircle2, rejected: XCircle }

function SuggestionStatusBadge({ status }: { status: SuggestionStatus }) {
  const { label, tone } = suggestionStatusByKey[status]
  const Icon = statusIcons[status]
  return <Badge tone={tone} icon={<Icon className="size-3.5" aria-hidden />}>{label}</Badge>
}

function Summary({ s, items, placeName }: { s: Suggestion; items: ItineraryItem[]; placeName: (id: string) => string | undefined }) {
  const d = describeSuggestion(s, items, placeName)
  return (
    <p className="text-sm">
      {d.kind === 'new' ? 'Add ' : 'Move '}
      <span className="font-extrabold">{d.what}</span>
      {d.kind === 'move' && d.from && (
        <span className="text-muted"> (now {d.from})</span>
      )}
      <span className="mx-1 inline-flex align-middle"><ArrowRight className="size-3.5" aria-label="to" /></span>
      <span className="font-bold">{d.when}</span>
    </p>
  )
}

function PendingRow({ s, items, placeName, author, meId, isAdmin, onResult }: {
  s: Suggestion
  items: ItineraryItem[]
  placeName: (id: string) => string | undefined
  author: Profile | undefined
  meId: string | undefined
  isAdmin: boolean
  onResult: (result: { tone: 'info' | 'error'; text: string }) => void
}) {
  const review = useReviewSuggestion()
  const withdraw = useWithdrawSuggestion()
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [error, setError] = useState('')
  const noteId = useId()
  const mine = s.suggested_by === meId
  // Sent from this device while offline and not on the server yet: nothing to review until it arrives.
  const unsent = usePendingSync().suggestions.has(s.id)
  const what = describeSuggestion(s, items, placeName).what

  async function decide(approve: boolean) {
    setError('')
    // mutateAsync: the row leaves the pending list as soon as the optimistic update lands.
    try {
      await review.mutateAsync({ suggestion: s, approve, note })
      onResult({ tone: 'info', text: approve ? `Approved — ${what} is on the itinerary.` : `Declined the suggestion for ${what}.` })
    } catch (e) {
      const message = itineraryErrorMessage(e as Error)
      setError(message)
      onResult({ tone: 'error', text: message })
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-bg p-3.5">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
        {author && <Avatar profile={author} className="size-6 text-[10px]" />}
        <span className="font-bold">{mine ? 'You' : author?.display_name ?? 'A former member'} suggested</span>
        {unsent && <PendingSyncBadge />}
      </div>
      <Summary s={s} items={items} placeName={placeName} />
      {s.note && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap">“{s.note}”</p>}

      {isAdmin && noteOpen && (
        <FieldShell id={noteId} label="Reply (optional)" className="mt-3">
          <textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={LIMITS.reviewNote}
            onChange={(e) => setNote(e.target.value)}
            className={clsx(inputClass, 'h-auto min-h-16 py-2.5')}
            placeholder="e.g. Great idea — moved dinner to 19:00"
            {...describedBy(noteId)}
          />
        </FieldShell>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isAdmin && !unsent && (
          <>
            <Button size="sm" className="min-h-11" disabled={review.isPending} onClick={() => void decide(true)}>
              {review.isPending && review.variables?.approve ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              Approve
            </Button>
            <Button variant="danger" size="sm" className="min-h-11" disabled={review.isPending} onClick={() => void decide(false)}>
              {review.isPending && !review.variables?.approve ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
              Reject
            </Button>
            {!noteOpen && (
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setNoteOpen(true)}>
                <MessageSquarePlus className="size-4" aria-hidden />
                Add a reply
              </Button>
            )}
          </>
        )}
        {mine && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto min-h-11"
            disabled={withdraw.isPending}
            onClick={async () => {
              setError('')
              try {
                await withdraw.mutateAsync(s.id)
              } catch (e) {
                setError(itineraryErrorMessage(e as Error))
              }
            }}
          >
            <Undo2 className="size-4" aria-hidden />
            Withdraw
          </Button>
        )}
      </div>
      <FormMessage tone="error" className="mt-2">{error}</FormMessage>
    </li>
  )
}

/** Pending suggestions (admin approves/rejects; authors can withdraw) and the reviewed history. */
export function SuggestionsPanel({ suggestions, items, placeName, memberById, meId, isAdmin, onSuggest }: {
  suggestions: Suggestion[]
  items: ItineraryItem[]
  placeName: (id: string) => string | undefined
  memberById: Map<string, Profile>
  meId: string | undefined
  isAdmin: boolean
  onSuggest: () => void
}) {
  const { pending, reviewed } = splitSuggestions(suggestions)
  const [showHistory, setShowHistory] = useState(false)
  // Lives here so "Approved — …" survives the row leaving the pending list.
  const [result, setResult] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  if (!pending.length && !reviewed.length && !result) {
    return isAdmin ? null : (
      <Card className="flex flex-wrap items-center gap-3 animate-rise">
        <p className="flex-1 text-sm text-muted">Have an idea for a day? Suggest it and the admin can add it.</p>
        <Button variant="secondary" size="sm" className="min-h-11" onClick={onSuggest}>
          <MessageSquarePlus className="size-4" aria-hidden />
          Suggest a change
        </Button>
      </Card>
    )
  }

  return (
    <Card className="animate-rise">
      <CardHeader
        title="Suggestions"
        icon={<MessageSquarePlus className="size-4" />}
        action={
          <span className="flex items-center gap-2">
            {pending.length > 0 && <Badge tone="warn" icon={<Hourglass className="size-3.5" aria-hidden />}>{pending.length} waiting</Badge>}
            <Button variant="ghost" size="sm" className="min-h-11" onClick={onSuggest}>
              Suggest<span className="sr-only"> a change</span>
            </Button>
          </span>
        }
      />
      {result && <FormMessage tone={result.tone} className="mb-3">{result.text}</FormMessage>}
      {pending.length === 0 ? (
        <p className="text-sm text-muted">{isAdmin ? 'Nothing to review right now.' : 'No suggestions waiting.'}</p>
      ) : (
        <ul className="grid gap-2.5">
          {pending.map((s) => (
            <PendingRow
              key={s.id}
              s={s}
              items={items}
              placeName={placeName}
              author={memberById.get(s.suggested_by)}
              meId={meId}
              isAdmin={isAdmin}
              onResult={setResult}
            />
          ))}
        </ul>
      )}

      {reviewed.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button type="button" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)} className="min-h-11 text-sm font-bold text-accent-text">
            {showHistory ? 'Hide' : 'Show'} reviewed ({reviewed.length})
          </button>
          {showHistory && (
            <ul className="mt-1 grid gap-2">
              {reviewed.map((s) => (
                <li key={s.id} className="rounded-2xl bg-surface-2 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <SuggestionStatusBadge status={s.status} />
                    <span>from {s.suggested_by === meId ? 'you' : memberById.get(s.suggested_by)?.display_name ?? 'a former member'}</span>
                  </div>
                  <Summary s={s} items={items} placeName={placeName} />
                  {s.review_note && <p className="mt-1.5 text-sm"><span className="font-bold">Admin:</span> {s.review_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
