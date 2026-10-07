import { groupNotifications, safeAppLink, type AppNotification } from './notifications'

const n = (id: string, created_at: string): AppNotification => ({
  id, created_at, user_id: 'me', kind: 'place_added', title: id, body: null, link: null, actor_id: null, read_at: null,
})

describe('groupNotifications', () => {
  it('groups by Today / Yesterday / Earlier, newest first', () => {
    const now = new Date('2026-11-24T15:00:00')
    const groups = groupNotifications(
      [
        n('old', new Date('2026-11-20T09:00:00').toISOString()),
        n('morning', new Date('2026-11-24T08:00:00').toISOString()),
        n('yesterday', new Date('2026-11-23T22:00:00').toISOString()),
        n('noon', new Date('2026-11-24T12:00:00').toISOString()),
      ],
      now,
    )
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['noon', 'morning']],
      ['Yesterday', ['yesterday']],
      ['Earlier', ['old']],
    ])
  })

  it('leaves out empty groups', () => {
    expect(groupNotifications([], new Date())).toEqual([])
  })
})

describe('safeAppLink', () => {
  it.each([
    ['/voting?place=5b0c2b9e-1111-4222-8333-944445555666', true],
    ['/itinerary?item=abc-123', true],
    ['/itinerary', true],
    ['https://evil.example', false],
    ['//evil.example/x', false],
    ['javascript:alert(1)', false],
    ['/places?place=<script>', false],
  ])('%s → %s', (link, ok) => expect(safeAppLink(link) !== null).toBe(ok))

  it('handles a missing link', () => expect(safeAppLink(null)).toBeNull())
})
