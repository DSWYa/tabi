import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { SectionForm } from '@/components/travel/SectionForm'
import { travelIcon } from '@/components/travel/travelIcons'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormMessage } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import { linkify } from '@/lib/linkify'
import { useMe } from '@/lib/members'
import { stepIndex } from '@/lib/reorder'
import {
  travelErrorMessage, useDeleteSection, useMoveSection, useSaveSection, useTravelSections, type TravelSection,
} from '@/lib/travelInfo'

function Body({ text }: { text: string }) {
  return (
    <p className="text-[15px] leading-relaxed whitespace-pre-wrap select-text">
      {linkify(text).map((part, i) =>
        part.kind === 'text' ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : (
          <a
            key={i}
            href={part.href}
            {...(part.kind === 'url' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="font-bold break-all text-accent-text underline underline-offset-2"
          >
            {part.text}
            {part.kind === 'url' && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        ),
      )}
    </p>
  )
}

type Editing = { kind: 'new' } | { kind: 'edit'; section: TravelSection } | null

const anchorId = (id: string) => `info-${id}`

export default function TravelInfo() {
  const { isAdmin } = useMe()
  const sections = useTravelSections()
  const save = useSaveSection()
  const remove = useDeleteSection()
  const move = useMoveSection()
  const [editing, setEditing] = useState<Editing>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState('')
  const list = sections.data ?? []
  const ids = list.map((s) => s.id)

  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (e) {
      setError(travelErrorMessage(e as Error))
    }
  }

  return (
    <>
      <PageHeader
        title="Travel Info"
        subtitle="Flights, hotel, transport and the useful stuff."
        actions={
          isAdmin ? (
            <Button onClick={() => setEditing({ kind: 'new' })}>
              <Plus className="size-4" aria-hidden />
              Add section
            </Button>
          ) : undefined
        }
      />

      {isAdmin && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Everyone in the family can read this page. Keep passport, card and bank numbers out of it.
        </p>
      )}
      <FormMessage tone="error" className="mb-4">{error}</FormMessage>

      {sections.isPending ? (
        <div className="grid gap-3">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : sections.isError && !sections.data ? (
        <Card>
          <ErrorState message="Couldn't load Travel Info." onRetry={() => void sections.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="No travel info yet"
            message={isAdmin
              ? 'Add sections like Flights, Hotel and Emergency Information.'
              : 'The admin will add sections like Flights, Hotel and Emergency Information.'}
            action={isAdmin ? <Button onClick={() => setEditing({ kind: 'new' })}>Add the first section</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          {list.length > 2 && (
            <nav aria-label="Sections" className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
              <ul className="flex gap-1.5 pb-1">
                {list.map((s) => {
                  const Icon = travelIcon(s.icon)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => document.getElementById(anchorId(s.id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-bold whitespace-nowrap hover:bg-surface-2"
                      >
                        <Icon className="size-4 text-accent-text" aria-hidden />
                        {s.title}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {list.map((s) => {
              const Icon = travelIcon(s.icon)
              const up = stepIndex(ids, s.id, -1)
              const down = stepIndex(ids, s.id, 1)
              const busy = move.isPending && move.variables?.id === s.id
              return (
                <Card key={s.id} id={anchorId(s.id)} className="scroll-mt-20 animate-rise">
                  <section aria-labelledby={`${anchorId(s.id)}-h`}>
                    <div className="mb-3 flex items-start gap-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <h2 id={`${anchorId(s.id)}-h`} className="min-w-0 flex-1 self-center text-lg font-extrabold break-words">{s.title}</h2>
                      {isAdmin && (
                        <div className="-my-1 flex shrink-0">
                          {busy ? (
                            <span className="grid size-11 place-items-center" role="status" aria-label="Saving">
                              <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
                            </span>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" disabled={up === null || move.isPending} aria-label={`Move ${s.title} up`} onClick={() => up !== null && void run(() => move.mutateAsync({ id: s.id, index: up }))}>
                                <ChevronUp className="size-5" aria-hidden />
                              </Button>
                              <Button variant="ghost" size="icon" disabled={down === null || move.isPending} aria-label={`Move ${s.title} down`} onClick={() => down !== null && void run(() => move.mutateAsync({ id: s.id, index: down }))}>
                                <ChevronDown className="size-5" aria-hidden />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {s.body ? <Body text={s.body} /> : <p className="text-sm text-muted">Nothing here yet.</p>}

                    {isAdmin && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        {confirming === s.id ? (
                          <div className="w-full rounded-2xl bg-bad-bg p-3 text-bad-fg" role="group" aria-label="Confirm delete">
                            <p className="text-sm font-bold">Delete “{s.title}” for everyone?</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setConfirming(null)}>Keep it</Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="min-h-11"
                                disabled={remove.isPending}
                                onClick={() => void run(async () => { await remove.mutateAsync(s.id); setConfirming(null) })}
                              >
                                <Trash2 className="size-4" aria-hidden />
                                Yes, delete
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setEditing({ kind: 'edit', section: s })}>
                              <Pencil className="size-4" aria-hidden />
                              Edit
                            </Button>
                            <Button variant="danger" size="sm" className="min-h-11" onClick={() => setConfirming(s.id)}>
                              <Trash2 className="size-4" aria-hidden />
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'edit' ? `Edit ${editing.section.title}` : 'New section'}
        size="xl"
      >
        {editing && (
          <SectionForm
            key={editing.kind === 'edit' ? editing.section.id : 'new'}
            initial={editing.kind === 'edit'
              ? { title: editing.section.title, icon: editing.section.icon ?? '', body: editing.section.body }
              : { title: '', icon: 'info', body: '' }}
            submitLabel={editing.kind === 'edit' ? 'Save section' : 'Add section'}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await save.mutateAsync({ id: editing.kind === 'edit' ? editing.section.id : undefined, input })
              setEditing(null)
            }}
          />
        )}
      </Sheet>
    </>
  )
}
