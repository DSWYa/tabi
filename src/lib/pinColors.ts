import { PIN_COLORS } from './constants'

type Member = { id: string; display_name: string; pin_color: string | null }

export interface PinColorOption {
  key: (typeof PIN_COLORS)[number]['key']
  label: string
  hex: string
  /** Someone else who owns this color, if any. */
  takenBy: Member | null
  mine: boolean
}

/** All presets annotated with who owns them, from the live member list. */
export function pinColorOptions(members: readonly Member[], myId: string | undefined): PinColorOption[] {
  const owner = new Map(members.filter((m) => m.pin_color).map((m) => [m.pin_color!, m]))
  return PIN_COLORS.map((c) => {
    const holder = owner.get(c.key) ?? null
    const mine = holder?.id === myId
    return { ...c, takenBy: mine ? null : holder, mine }
  })
}

/** Postgres unique_violation: someone claimed the color between our render and our write. */
export function isPinConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505')
}

/** The friendly sentence shown when two people pick the same color at once. */
export function pinConflictMessage(colorLabel: string, winner: Pick<Member, 'display_name'> | null): string {
  const who = winner ? winner.display_name : 'Someone'
  return `${who} grabbed ${colorLabel} a moment before you did — pick another color.`
}
