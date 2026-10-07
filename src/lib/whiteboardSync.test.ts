import {
  batchesFor, changedSince, checkWhiteboardImage, filesFor, imageExtension, markShared, orderByIndex, pruneTombstones,
  reconcileElements, sceneHash, TOMBSTONE_TTL_MS, type SceneElement,
} from './whiteboardSync'

const el = (id: string, version: number, versionNonce = 100, extra: Partial<SceneElement> = {}): SceneElement => ({
  id, version, versionNonce, isDeleted: false, index: null, updated: 0, ...extra,
})
const ids = (list: SceneElement[]) => list.map((e) => `${e.id}@${e.version}`)

describe('reconcileElements', () => {
  it('takes the higher version of each element', () => {
    const { elements, adopted } = reconcileElements([el('a', 3), el('b', 1)], [el('a', 2), el('b', 4)])
    expect(ids(elements)).toEqual(['a@3', 'b@4'])
    expect(ids(adopted)).toEqual(['b@4'])
  })
  it('breaks a version tie with the lower nonce, so every client agrees', () => {
    const mine = el('a', 5, 900)
    const theirs = el('a', 5, 100)
    expect(reconcileElements([mine], [theirs]).elements[0]).toBe(theirs)
    // …and the other client keeps the same winner.
    expect(reconcileElements([theirs], [mine]).elements[0]).toBe(theirs)
    expect(reconcileElements([theirs], [theirs]).changed).toBe(false)
  })
  it('lets a newer delete (tombstone) win over an older copy', () => {
    const { elements } = reconcileElements([el('a', 2)], [el('a', 3, 1, { isDeleted: true })])
    expect(elements[0].isDeleted).toBe(true)
    // An older remote copy can't resurrect it.
    expect(reconcileElements(elements, [el('a', 2)]).elements[0].isDeleted).toBe(true)
  })
  it('never replaces what this user is editing right now', () => {
    const { elements, changed } = reconcileElements([el('text', 1)], [el('text', 9)], new Set(['text']))
    expect(ids(elements)).toEqual(['text@1'])
    expect(changed).toBe(false)
  })
  it('adds remote-only elements and keeps local-only ones', () => {
    expect(ids(reconcileElements([el('mine', 1)], [el('theirs', 1)]).elements)).toEqual(['mine@1', 'theirs@1'])
  })
  it('orders by fractional index when every element has one', () => {
    const local = [el('b', 1, 1, { index: 'a1' }), el('c', 1, 1, { index: 'a2' })]
    const remote = [el('a', 1, 1, { index: 'a0' }), el('c', 2, 1, { index: 'Zz' })]
    expect(reconcileElements(local, remote).elements.map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
  it('keeps merged order when some indices are missing (Excalidraw repairs them)', () => {
    expect(orderByIndex([el('b', 1, 1, { index: 'a1' }), el('a', 1)]).map((e) => e.id)).toEqual(['b', 'a'])
  })
  it('is order-independent: merging both ways gives the same scene', () => {
    const left = [el('a', 2, 5), el('b', 1), el('c', 3, 1, { isDeleted: true })]
    const right = [el('a', 2, 3), el('b', 2), el('d', 1)]
    const lr = reconcileElements(left, right).elements
    const rl = reconcileElements(right, left).elements
    const byId = (list: SceneElement[]) => Object.fromEntries(list.map((e) => [e.id, `${e.version}/${e.versionNonce}/${e.isDeleted}`]))
    expect(byId(lr)).toEqual(byId(rl))
  })
})

describe('change tracking', () => {
  it('only re-sends elements whose version moved past what was shared', () => {
    const shared = new Map<string, number>()
    markShared(shared, [el('a', 1), el('b', 1)])
    expect(changedSince([el('a', 1), el('b', 2), el('c', 1)], shared).map((e) => e.id)).toEqual(['b', 'c'])
  })
  it('scene hash changes on any edit, add or delete', () => {
    const base = sceneHash([el('a', 1), el('b', 1)])
    expect(sceneHash([el('a', 1), el('b', 2)])).not.toBe(base)
    expect(sceneHash([el('a', 1)])).not.toBe(base)
    expect(sceneHash([el('a', 1), el('b', 1)])).toBe(base)
  })
})

describe('saving', () => {
  it('prunes only tombstones older than a day', () => {
    const now = 10 * TOMBSTONE_TTL_MS
    const list = [
      el('live', 1, 1, { updated: 0 }),
      el('fresh-delete', 2, 1, { isDeleted: true, updated: now - 1000 }),
      el('old-delete', 2, 1, { isDeleted: true, updated: now - TOMBSTONE_TTL_MS - 1 }),
    ]
    expect(pruneTombstones(list, now).map((e) => e.id)).toEqual(['live', 'fresh-delete'])
  })
  it('stores only the files still referenced by image elements', () => {
    const known = { f1: { path: 'a.png', mimeType: 'image/png' }, f2: { path: 'b.png', mimeType: 'image/png' } }
    const scene = [el('img', 1, 1, { type: 'image', fileId: 'f1' }), el('rect', 1, 1, { type: 'rectangle' }), el('img2', 1, 1, { type: 'image', fileId: 'missing' })]
    expect(filesFor(scene, known)).toEqual({ f1: known.f1 })
  })
})

describe('images', () => {
  it('accepts JPG/PNG/WebP/GIF up to 5 MB', () => {
    expect(checkWhiteboardImage({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull()
    expect(checkWhiteboardImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
    expect(checkWhiteboardImage({ type: 'image/svg+xml', size: 10 })).toMatch(/JPG, PNG/)
    expect(imageExtension('image/jpeg')).toBe('jpg')
    expect(imageExtension('application/pdf')).toBeNull()
  })
})

it('splits broadcasts into size-capped batches and sets aside oversized elements', () => {
  const small = (id: string) => el(id, 1)
  const huge = el('huge', 1, 1, { type: 'x'.repeat(5000) })
  const size = JSON.stringify(small('a')).length
  const { batches, oversized } = batchesFor([small('a'), small('b'), huge, small('c')], size * 2)
  expect(batches.map((b) => b.map((e) => e.id))).toEqual([['a', 'b'], ['c']])
  expect(oversized.map((e) => e.id)).toEqual(['huge'])
})
