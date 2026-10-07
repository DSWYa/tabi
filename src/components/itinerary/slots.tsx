import { Moon, Sun, Sunrise, type LucideIcon } from 'lucide-react'
import { DAY_SLOTS, type DaySlot } from '@/lib/constants'

export const slotIcons: Record<DaySlot, LucideIcon> = { morning: Sunrise, afternoon: Sun, evening: Moon }

/** Morning / Afternoon / Evening options for <Segmented>. */
export const SLOT_OPTIONS = DAY_SLOTS.map((s) => {
  const Icon = slotIcons[s.key]
  return { key: s.key, label: s.label, icon: <Icon className="size-4" aria-hidden /> }
})
