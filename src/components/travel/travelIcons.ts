import {
  BookOpen, CalendarDays, HeartPulse, Hotel, Info, Luggage, Map, Phone, Plane, Receipt, ShoppingBag, Siren, Sparkles,
  TrainFront, Utensils, Wallet, Wifi, type LucideIcon,
} from 'lucide-react'
import type { TravelIconKey } from '@/lib/constants'

export const travelIcons: Record<TravelIconKey, LucideIcon> = {
  plane: Plane,
  hotel: Hotel,
  train: TrainFront,
  map: Map,
  receipt: Receipt,
  wallet: Wallet,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  phone: Phone,
  wifi: Wifi,
  luggage: Luggage,
  calendar: CalendarDays,
  'heart-pulse': HeartPulse,
  siren: Siren,
  info: Info,
  sparkles: Sparkles,
}

export function travelIcon(key: TravelIconKey | null): LucideIcon {
  return key ? travelIcons[key] : BookOpen
}
