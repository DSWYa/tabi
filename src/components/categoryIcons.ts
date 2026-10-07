import {
  CircleHelp, Coffee, Drama, Gamepad2, Landmark, Martini, ShoppingBag, Sparkles, Ticket, Trees, Utensils, type LucideIcon,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { CategoryKey } from '@/lib/constants'
import { ToriiIcon } from './Brand'

type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>

export const categoryIcons: Record<CategoryKey, IconComponent> = {
  food: Utensils,
  cafe: Coffee,
  shopping: ShoppingBag,
  anime: Gamepad2,
  attraction: Ticket,
  museum: Landmark,
  shrine: ToriiIcon,
  park: Trees,
  entertainment: Drama,
  nightlife: Martini,
  relaxation: Sparkles,
  other: CircleHelp,
}

