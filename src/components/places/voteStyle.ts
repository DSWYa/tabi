import { Meh, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/components/ui/Badge'
import type { VoteValue } from '@/lib/constants'

/** Votes are always shown as icon + word, never color alone. */
export const voteIcons: Record<VoteValue, LucideIcon> = { yes: ThumbsUp, maybe: Meh, no: ThumbsDown }
export const voteTones: Record<VoteValue, Tone> = { yes: 'ok', maybe: 'warn', no: 'bad' }
