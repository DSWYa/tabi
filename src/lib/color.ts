/** Relative luminance (WCAG) of a #rrggbb color. */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Black or white, whichever reads better on top of `hex` (for initials on pin-colored avatars). */
export function readableTextOn(hex: string): '#1f1a14' | '#ffffff' {
  const l = luminance(hex)
  const onWhite = 1.05 / (l + 0.05)
  const onDark = (l + 0.05) / (luminance('#1f1a14') + 0.05)
  return onDark >= onWhite ? '#1f1a14' : '#ffffff'
}
