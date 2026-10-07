import { linkify } from './linkify'

const kinds = (text: string) => linkify(text).map((p) => (p.kind === 'text' ? p.text : `[${p.kind}:${p.text}→${p.href}]`)).join('')

it('links web addresses without swallowing trailing punctuation', () => {
  expect(kinds('See https://www.ghibli-museum.jp/en/. Book early')).toBe('See [url:https://www.ghibli-museum.jp/en/→https://www.ghibli-museum.jp/en/]. Book early')
})

it('links Japanese, international and emergency phone numbers', () => {
  expect(kinds('Hotline: 050-3816-2787')).toBe('Hotline: [phone:050-3816-2787→tel:05038162787]')
  expect(kinds('Hotel +81 3-1234-5678')).toBe('Hotel [phone:+81 3-1234-5678→tel:+81312345678]')
  expect(kinds('Police: 110, Fire: 119')).toBe('Police: [phone:110→tel:110], Fire: [phone:119→tel:119]')
})

it('leaves dates, times, prices and addresses alone', () => {
  const text = 'Nov 19 2026-11-20, departs 11:05. ¥5,000 at 1-2-3 Nishishinjuku. XX 123'
  expect(linkify(text)).toEqual([{ kind: 'text', text }])
})

it('never treats javascript: or other schemes as links', () => {
  expect(linkify('javascript:alert(1)')).toEqual([{ kind: 'text', text: 'javascript:alert(1)' }])
})
