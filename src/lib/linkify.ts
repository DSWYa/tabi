// Turn web addresses and phone numbers in plain text (Travel Info) into tappable links. Nothing else is
// interpreted: the text is never rendered as HTML.

export type TextPart =
  | { kind: 'text'; text: string }
  | { kind: 'url'; text: string; href: string }
  | { kind: 'phone'; text: string; href: string }

// http(s) URLs, or phone numbers: Japanese style (03-1234-5678, 050-3816-2787, 0120-123-456), international
// (+81 3-1234-5678) and the 110 / 119 emergency numbers. Must start with 0 or +, so dates and addresses stay text.
const PATTERN = /(https?:\/\/[^\s<>"]+)|((?:\+\d{1,3}[\s-]?\d{1,4}|\b0\d{1,4})(?:[\s-]\d{2,4}){1,3}\b|\b11[09]\b)/g
// Trailing punctuation usually belongs to the sentence, not the link.
const TRAILING = /[.,;:!?)\]]+$/

export function linkify(input: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of input.matchAll(PATTERN)) {
    let text = match[0]
    const start = match.index ?? 0
    if (match[1]) {
      const trail = text.match(TRAILING)?.[0] ?? ''
      text = text.slice(0, text.length - trail.length)
    }
    if (start > last) parts.push({ kind: 'text', text: input.slice(last, start) })
    if (match[1]) parts.push({ kind: 'url', text, href: text })
    else parts.push({ kind: 'phone', text, href: `tel:${text.replace(/[\s-]/g, '')}` })
    last = start + text.length
  }
  if (last < input.length) parts.push({ kind: 'text', text: input.slice(last) })
  return parts
}
