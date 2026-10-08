import { ArrowLeftRight, Banknote } from 'lucide-react'
import { useId, useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { inputClass } from '@/components/ui/Field'
import { formatYen, parseDateOnly } from '@/lib/format'
import { jpyToUsd, parseMoney, useFxRate, usdToJpy } from '@/lib/fx'

type Side = 'jpy' | 'usd'

const wholeYen = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const cents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/**
 * Yen ⇄ dollars. Type in either box and the other one follows. Uses the same cached ECB rate as place prices
 * (lib/fx), so it works offline with the last rate this device saw.
 */
export function CurrencyConverter() {
  const rate = useFxRate()
  const ids = { jpy: useId(), usd: useId(), rate: useId() }
  // Only what was typed is state; the other box is worked out from it (and from the rate, once it arrives).
  const [typed, setTyped] = useState<{ side: Side; text: string }>({ side: 'jpy', text: '1,000' })

  const amount = parseMoney(typed.text)
  const other = rate && amount != null
    ? typed.side === 'jpy'
      ? cents.format(jpyToUsd(amount, rate.usdPerJpy))
      : wholeYen.format(usdToJpy(amount, rate.usdPerJpy))
    : ''
  const value = (side: Side) => (typed.side === side ? typed.text : other)

  const yen = typed.side === 'jpy' ? amount : rate && amount != null ? usdToJpy(amount, rate.usdPerJpy) : null
  const usd = typed.side === 'usd' ? amount : rate && amount != null ? jpyToUsd(amount, rate.usdPerJpy) : null
  const summary = rate && yen != null && usd != null ? `${formatYen(yen)} is about ${dollars.format(usd)}` : ''
  const rateDate = rate ? parseDateOnly(rate.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  const box = (side: Side) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={ids[side]} className="mb-1.5 block text-sm font-extrabold">
        {side === 'jpy' ? 'Japanese yen' : 'US dollars'}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">
          {side === 'jpy' ? '¥' : '$'}
        </span>
        <input
          id={ids[side]}
          inputMode={side === 'jpy' ? 'numeric' : 'decimal'}
          autoComplete="off"
          disabled={!rate}
          value={value(side)}
          placeholder="0"
          aria-describedby={ids.rate}
          onChange={(e) => setTyped({ side, text: e.target.value })}
          onFocus={(e) => e.target.select()}
          className={`${inputClass} pl-9 text-lg font-bold tabular-nums`}
        />
      </div>
    </div>
  )

  return (
    <Card className="animate-rise">
      <CardHeader title="Yen ⇄ Dollars" icon={<Banknote className="size-4" />} />
      <div className="flex items-end gap-2">
        {box('jpy')}
        <ArrowLeftRight aria-hidden className="mb-3.5 size-5 shrink-0 text-muted" />
        {box('usd')}
      </div>
      <p id={ids.rate} className="mt-2.5 text-sm text-muted">
        {rate
          ? `$1 ≈ ${formatYen(usdToJpy(1, rate.usdPerJpy))} · rate from ${rateDate}`
          : 'The exchange rate loads the first time you’re online.'}
      </p>
      <p role="status" className="sr-only">{summary}</p>
    </Card>
  )
}
