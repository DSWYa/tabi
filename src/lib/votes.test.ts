import { compareForVoting, consensus, tallyByPlace, tallyFor, tallyVotes, type VoteRow } from './votes'

const members = ['morgan', 'casey', 'riley', 'jamie']
const v = (place_id: string, user_id: string, vote: VoteRow['vote']): VoteRow => ({ place_id, user_id, vote })

describe('tallyVotes', () => {
  it('counts each member once and lists who is still to vote, in member order', () => {
    const t = tallyVotes([v('p', 'casey', 'yes'), v('p', 'jamie', 'maybe')], members)
    expect([t.yes, t.maybe, t.no, t.cast]).toEqual([1, 1, 0, 2])
    expect(t.waitingOn).toEqual(['morgan', 'riley'])
    expect(t.byMember.get('jamie')).toBe('maybe')
    expect(t.score).toBe(3)
  })

  it('ignores votes from people who are no longer members', () => {
    const t = tallyVotes([v('p', 'casey', 'yes'), v('p', 'removed', 'no')], members)
    expect([t.yes, t.no, t.cast]).toEqual([1, 0, 1])
  })

  it('handles no votes', () => {
    const t = tallyVotes([], members)
    expect(t.cast).toBe(0)
    expect(t.waitingOn).toEqual(members)
    expect(consensus(t)).toBe('no-votes')
  })
})

describe('tallyByPlace', () => {
  it('groups votes per place and gives empty tallies for places without votes', () => {
    const tallies = tallyByPlace([v('a', 'morgan', 'yes'), v('a', 'casey', 'no'), v('b', 'riley', 'maybe')], members)
    expect(tallies.get('a')).toMatchObject({ yes: 1, no: 1, cast: 2 })
    expect(tallies.get('b')).toMatchObject({ maybe: 1, cast: 1 })
    expect(tallyFor(tallies, 'c', members)).toMatchObject({ cast: 0, waitingOn: members })
  })
})

describe('consensus', () => {
  const read = (...votes: VoteRow['vote'][]) => consensus(tallyVotes(votes.map((vote, i) => v('p', members[i], vote)), members))
  it.each([
    [['yes', 'yes', 'yes', 'yes'], 'all-yes'],
    [['yes', 'yes', 'yes', 'maybe'], 'leaning-yes'],
    [['yes', 'no'], 'split'],
    [['yes', 'maybe', 'no'], 'split'],
    [['maybe', 'no'], 'leaning-no'],
    [['no', 'no'], 'all-no'],
  ] as const)('%j → %s', (votes, expected) => {
    expect(read(...votes)).toBe(expected)
  })
})

describe('compareForVoting', () => {
  it('puts places I have not voted on first, then the keenest, then the newest', () => {
    const places = [
      { id: 'voted-keen', created_at: '2026-10-01' },
      { id: 'open-meh', created_at: '2026-10-02' },
      { id: 'open-keen', created_at: '2026-10-01' },
      { id: 'open-new', created_at: '2026-10-03' },
    ]
    const tallies = tallyByPlace(
      [
        v('voted-keen', 'morgan', 'yes'), v('voted-keen', 'casey', 'yes'),
        v('open-keen', 'casey', 'yes'), v('open-keen', 'riley', 'yes'),
        v('open-meh', 'casey', 'maybe'),
      ],
      members,
    )
    const order = [...places].sort((a, b) => compareForVoting(a, b, tallies, 'morgan')).map((p) => p.id)
    expect(order).toEqual(['open-keen', 'open-meh', 'open-new', 'voted-keen'])
  })
})
