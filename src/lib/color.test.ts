import { PIN_COLORS } from './constants'
import { luminance, readableTextOn } from './color'

it('computes luminance at the extremes', () => {
  expect(luminance('#000000')).toBe(0)
  expect(luminance('#ffffff')).toBeCloseTo(1)
})

it('picks readable initials for every pin color', () => {
  expect(readableTextOn('#F4C430')).toBe('#1f1a14') // sunflower → dark text
  expect(readableTextOn('#8E3B66')).toBe('#ffffff') // plum → white text
  for (const c of PIN_COLORS) expect(['#1f1a14', '#ffffff']).toContain(readableTextOn(c.hex))
})
