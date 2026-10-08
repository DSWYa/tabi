import {
  CalendarDays, Home, Info, ListChecks, Map, MapPin, PenTool, Settings, ShieldCheck, Vote, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the phone bottom bar; everything else lives in the "More" sheet. */
  primary?: boolean
  /** Bottom-bar label when `label` is too long for a 360 px phone. */
  short?: string
  /** Only listed for admins (the page itself is still guarded, and Postgres enforces the rules). */
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, primary: true },
  { to: '/places', label: 'Places', icon: MapPin, primary: true },
  { to: '/voting', label: 'Voting', icon: Vote },
  { to: '/plans', label: 'Current Plans', icon: ListChecks },
  { to: '/itinerary', label: 'Itinerary', icon: CalendarDays, primary: true },
  { to: '/map', label: 'Map', icon: Map, primary: true },
  { to: '/whiteboard', label: 'Whiteboard', short: 'Board', icon: PenTool, primary: true },
  { to: '/info', label: 'Travel Info', icon: Info },
  { to: '/settings', label: 'Profile & Settings', icon: Settings },
  { to: '/admin', label: 'Family admin', icon: ShieldCheck, adminOnly: true },
]

export function navFor(isAdmin: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly)
}
