import type { VoteValue } from './constants'

export interface VoteRow {
  place_id: string
  user_id: string
  vote: VoteValue
}

export interface VoteTally {
  yes: number
  maybe: number
  no: number
  /** Votes cast by current members. */
  cast: number
  /** Member id → their vote. */
  byMember: Map<string, VoteValue>
  /** Members who haven't voted yet (in member order). */
  waitingOn: string[]
  /** yes = +2, maybe = +1, no = −2: a simple "how keen is the family" number for sorting. */
  score: number
}

export type Consensus = 'no-votes' | 'all-yes' | 'leaning-yes' | 'split' | 'leaning-no' | 'all-no'

const WEIGHT: Record<VoteValue, number> = { yes: 2, maybe: 1, no: -2 }

/** Tally one place's votes. Votes from people who are no longer members are ignored. */
export function tallyVotes(votes: readonly VoteRow[], memberIds: readonly string[]): VoteTally {
  const members = new Set(memberIds)
  const byMember = new Map<string, VoteValue>()
  for (const v of votes) if (members.has(v.user_id)) byMember.set(v.user_id, v.vote)
  const tally: VoteTally = { yes: 0, maybe: 0, no: 0, cast: byMember.size, byMember, waitingOn: [], score: 0 }
  for (const vote of byMember.values()) {
    tally[vote]++
    tally.score += WEIGHT[vote]
  }
  tally.waitingOn = memberIds.filter((id) => !byMember.has(id))
  return tally
}

/** Tallies for every place that has votes; use `tallyFor` to get an empty tally for the rest. */
export function tallyByPlace(votes: readonly VoteRow[], memberIds: readonly string[]): Map<string, VoteTally> {
  const grouped = new Map<string, VoteRow[]>()
  for (const v of votes) {
    const list = grouped.get(v.place_id)
    if (list) list.push(v)
    else grouped.set(v.place_id, [v])
  }
  return new Map([...grouped].map(([placeId, rows]) => [placeId, tallyVotes(rows, memberIds)]))
}

export function tallyFor(tallies: Map<string, VoteTally>, placeId: string, memberIds: readonly string[]): VoteTally {
  return tallies.get(placeId) ?? tallyVotes([], memberIds)
}

/** A one-word read of the room, for the admin deciding and for sorting. */
export function consensus(t: VoteTally): Consensus {
  if (t.cast === 0) return 'no-votes'
  if (t.yes === t.cast) return 'all-yes'
  if (t.no === t.cast) return 'all-no'
  const keen = t.yes + t.maybe / 2
  const against = t.no + t.maybe / 2
  if (keen > against) return 'leaning-yes'
  if (against > keen) return 'leaning-no'
  return 'split'
}

export const CONSENSUS_LABELS: Record<Consensus, string> = {
  'no-votes': 'No votes yet',
  'all-yes': 'Everyone says yes',
  'leaning-yes': 'Leaning yes',
  split: 'Split decision',
  'leaning-no': 'Leaning no',
  'all-no': 'Everyone says no',
}

/** Voting order: places I still need to vote on first, then the keenest, then newest. */
export function compareForVoting(
  a: { id: string; created_at: string },
  b: { id: string; created_at: string },
  tallies: Map<string, VoteTally>,
  myId: string | undefined,
): number {
  const mine = (id: string) => (myId && tallies.get(id)?.byMember.has(myId) ? 1 : 0)
  const score = (id: string) => tallies.get(id)?.score ?? 0
  return mine(a.id) - mine(b.id) || score(b.id) - score(a.id) || b.created_at.localeCompare(a.created_at)
}
