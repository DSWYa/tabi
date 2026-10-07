import { clsx } from 'clsx'
import { Hourglass, Loader2, MapPin, MapPinOff, Star, type LucideIcon } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { Badge, type Tone } from '@/components/ui/Badge'
import { PRIORITY_LABELS, voteByKey, type GeocodeStatus } from '@/lib/constants'
import { formatPrice } from '@/lib/format'
import { useUsdPerJpy } from '@/lib/fx'
import type { Profile } from '@/lib/supabase'
import type { VoteTally } from '@/lib/votes'
import { voteIcons, voteTones } from './voteStyle'

// Small display pieces shared by Places, Voting, Plans, the map and the dashboard.

export function PriorityStars({ priority, className }: { priority: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Priority ${priority} of 5: ${PRIORITY_LABELS[priority] ?? ''}`}
      title={PRIORITY_LABELS[priority]}
      className={clsx('inline-flex items-center gap-px text-accent-text', className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={clsx('size-3.5', n <= priority ? 'fill-current' : 'opacity-30')} />
      ))}
    </span>
  )
}

/** "¥2,500 / ~$16" with the cached exchange rate. */
export function PriceText({ jpy, className }: { jpy: number | null; className?: string }) {
  const rate = useUsdPerJpy()
  if (jpy == null) return null
  return <span className={clsx('text-sm font-bold', className)}>{formatPrice(jpy, rate)}</span>
}

export function AddedBy({ member, className }: { member: Profile | undefined; className?: string }) {
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5 text-xs text-muted', className)}>
      {member ? <Avatar profile={member} className="size-5 text-[10px]" /> : null}
      <span className="truncate">Added by {member?.display_name ?? 'a former member'}</span>
    </span>
  )
}

const pinStatus: Record<GeocodeStatus, { icon: LucideIcon; text: string; tone: Tone }> = {
  pending: { icon: Loader2, text: 'Finding on map…', tone: 'neutral' },
  found: { icon: MapPin, text: 'On the map', tone: 'neutral' },
  manual: { icon: MapPin, text: 'Pin set by hand', tone: 'neutral' },
  not_found: { icon: MapPinOff, text: 'Not on map yet', tone: 'warn' },
}

/** Only the states worth calling out on a card (a normal pin is unremarkable). */
export function PinStatusBadge({ status, always }: { status: GeocodeStatus; always?: boolean }) {
  if (!always && (status === 'found' || status === 'manual')) return null
  const { icon: Icon, text, tone } = pinStatus[status]
  return (
    <Badge tone={tone} icon={<Icon className={clsx('size-3.5', status === 'pending' && 'animate-spin')} aria-hidden />}>
      {text}
    </Badge>
  )
}

/** "3 yes · 1 maybe · 0 no" as icon pills. */
export function VoteCounts({ tally, className }: { tally: VoteTally; className?: string }) {
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1', className)}>
      {(['yes', 'maybe', 'no'] as const).map((v) => {
        const Icon = voteIcons[v]
        return (
          <Badge key={v} tone={tally[v] > 0 ? voteTones[v] : 'neutral'} icon={<Icon className="size-3.5" aria-hidden />}>
            {tally[v]} {voteByKey[v].label.toLowerCase()}
          </Badge>
        )
      })}
    </span>
  )
}

/** Each member with their vote (or "waiting"). */
export function MemberVotes({ tally, members, meId }: { tally: VoteTally; members: Profile[]; meId?: string }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {members.map((m) => {
        const vote = tally.byMember.get(m.id)
        const Icon = vote ? voteIcons[vote] : Hourglass
        return (
          <li key={m.id} className="flex min-h-9 items-center gap-2 rounded-2xl bg-surface-2 py-1 pr-2 pl-1">
            <Avatar profile={m} className="size-7 text-xs" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {m.display_name}
              {m.id === meId && <span className="font-normal text-muted"> (you)</span>}
            </span>
            <Badge tone={vote ? voteTones[vote] : 'neutral'} icon={<Icon className="size-3.5" aria-hidden />}>
              {vote ? voteByKey[vote].label : 'Waiting'}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
