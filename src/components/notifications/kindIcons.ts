import { CalendarClock, CalendarDays, CheckCircle2, Lightbulb, MapPinPlus, MessageSquareReply, Vote, type LucideIcon } from 'lucide-react'
import type { NotificationKind } from '@/lib/constants'

export const notificationIcons: Record<NotificationKind, LucideIcon> = {
  place_added: MapPinPlus,
  vote_cast: Vote,
  status_changed: CheckCircle2,
  itinerary_changed: CalendarDays,
  suggestion_submitted: Lightbulb,
  suggestion_reviewed: MessageSquareReply,
  reservation_upcoming: CalendarClock,
}
