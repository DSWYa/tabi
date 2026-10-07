import {
  CalendarCheck, CalendarClock, CalendarX, CheckCircle2, CloudUpload, Footprints, Hourglass, XCircle, type LucideIcon,
} from 'lucide-react'
import {
  categoryByKey, placeStatusByKey, reservationByKey,
  type CategoryKey, type PlaceStatus, type ReservationStatus,
} from '@/lib/constants'
import { categoryIcons } from './categoryIcons'
import { Badge } from './ui/Badge'

export function CategoryBadge({ category }: { category: CategoryKey }) {
  const { label, color } = categoryByKey[category]
  const Icon = categoryIcons[category]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-1 text-xs font-bold">
      <span className="grid size-5 place-items-center rounded-full text-white" style={{ background: color }}>
        <Icon className="size-3" aria-hidden />
      </span>
      {label}
    </span>
  )
}

const statusIcons: Record<PlaceStatus, LucideIcon> = {
  awaiting: Hourglass,
  in_plan: CheckCircle2,
  rejected: XCircle,
  visited: Footprints,
}

export function StatusBadge({ status }: { status: PlaceStatus }) {
  const { label, tone } = placeStatusByKey[status]
  const Icon = statusIcons[status]
  return <Badge tone={tone} icon={<Icon className="size-3.5" aria-hidden />}>{label}</Badge>
}

const reservationIcons: Record<ReservationStatus, LucideIcon> = {
  required: CalendarClock,
  booked: CalendarCheck,
  none: CalendarX,
}

export function ReservationBadge({ status }: { status: ReservationStatus }) {
  const { label, tone } = reservationByKey[status]
  const Icon = reservationIcons[status]
  return <Badge tone={tone} icon={<Icon className="size-3.5" aria-hidden />}>{label}</Badge>
}

/** Saved on this device, not on the server yet (offline, or about to be sent). */
export function PendingSyncBadge() {
  return (
    <Badge tone="warn" icon={<CloudUpload className="size-3.5" aria-hidden />}>
      Pending sync
    </Badge>
  )
}
