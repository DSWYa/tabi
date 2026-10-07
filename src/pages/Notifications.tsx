import { clsx } from 'clsx'
import { Bell, CheckCheck, ChevronRight, Settings2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '@/components/Avatar'
import { notificationIcons } from '@/components/notifications/kindIcons'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormMessage } from '@/components/ui/Field'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import { timeAgo } from '@/lib/format'
import { friendlyError } from '@/lib/join'
import { useMembers } from '@/lib/members'
import {
  groupNotifications, safeAppLink, useDeleteNotifications, useMarkRead, useNotifications, type AppNotification,
} from '@/lib/notifications'

/** The notification center: newest first, tap to open what it's about. */
export default function Notifications() {
  const list = useNotifications()
  const markRead = useMarkRead()
  const remove = useDeleteNotifications()
  const [error, setError] = useState('')
  const rows = list.data ?? []
  const unread = rows.filter((n) => !n.read_at).length
  const read = rows.length - unread

  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
    } catch (e) {
      setError(friendlyError(e as Error))
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} new` : 'What the family has been up to.'}
        actions={
          unread > 0 && (
            <Button variant="secondary" onClick={() => void run(() => markRead.mutateAsync('all'))}>
              <CheckCheck className="size-4" aria-hidden />
              Mark all read
            </Button>
          )
        }
      />
      <FormMessage tone="error" className="mb-3">{error}</FormMessage>

      {list.isPending ? (
        <SkeletonCard lines={4} />
      ) : list.isError && !list.data ? (
        <Card>
          <ErrorState message="Couldn't load your notifications." onRetry={() => void list.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            mood="sleepy"
            title="You're all caught up"
            message="New places, decisions, itinerary changes and suggestions show up here."
            action={<PrefsLink />}
          />
        </Card>
      ) : (
        <div className="grid gap-5">
          {groupNotifications(rows).map((group) => (
            <section key={group.label} aria-labelledby={`notif-${group.label}`}>
              <h2 id={`notif-${group.label}`} className="mb-2 px-1 text-sm font-extrabold text-muted">{group.label}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card">
                {group.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    onOpen={() => (!n.read_at ? markRead.mutateAsync([n.id]).catch(() => undefined) : undefined)}
                    onRemove={() => void run(() => remove.mutateAsync(n.id))}
                  />
                ))}
              </ul>
            </section>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PrefsLink />
            {read > 0 && (
              <Button variant="ghost" onClick={() => void run(() => remove.mutateAsync('read'))}>
                <Trash2 className="size-4" aria-hidden />
                Clear read ({read})
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function PrefsLink() {
  return (
    <Link to="/settings" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-accent-text hover:bg-surface-2">
      <Settings2 className="size-4" aria-hidden />
      Choose what you're told about
    </Link>
  )
}

function NotificationRow({ n, onOpen, onRemove }: { n: AppNotification; onOpen: () => void; onRemove: () => void }) {
  const navigate = useNavigate()
  const { data: members = [] } = useMembers()
  const actor = members.find((m) => m.id === n.actor_id)
  const Icon = notificationIcons[n.kind] ?? Bell
  const link = safeAppLink(n.link)
  const unread = !n.read_at

  const body = (
    <>
      <span className="relative shrink-0">
        {actor ? (
          <Avatar profile={actor} className="size-10 text-sm" />
        ) : (
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent-text">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        {actor && (
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-surface text-accent-text ring-2 ring-surface">
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={clsx('break-words', unread ? 'font-extrabold' : 'font-bold text-muted')}>{n.title}</span>
          {unread && <Badge tone="accent">New</Badge>}
        </span>
        {n.body && <span className="mt-0.5 block text-sm break-words text-muted">{n.body}</span>}
        <span className="mt-1 block text-xs text-muted">
          <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
        </span>
      </span>
    </>
  )

  return (
    <li className={clsx('flex items-stretch', unread && 'bg-accent-soft/40')}>
      {link ? (
        <button
          type="button"
          onClick={() => {
            onOpen()
            navigate(link)
          }}
          className="flex min-h-16 min-w-0 flex-1 items-start gap-3 p-3.5 text-left hover:bg-surface-2/60"
        >
          {body}
          <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted" aria-hidden />
        </button>
      ) : (
        <div className="flex min-h-16 min-w-0 flex-1 items-start gap-3 p-3.5">{body}</div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove notification: ${n.title}`}
        className="grid w-12 shrink-0 place-items-center text-muted hover:bg-surface-2 hover:text-text"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  )
}
