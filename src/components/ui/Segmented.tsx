import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export interface SegmentOption<K extends string> {
  key: K
  label: ReactNode
  icon?: ReactNode
}

/** A row of radio buttons styled as a segmented control (native radios: keyboard + screen readers for free). */
export function Segmented<K extends string>({ legend, name, value, options, onChange, error, className, hideLegend }: {
  legend: ReactNode
  name: string
  value: K
  options: readonly SegmentOption<K>[]
  onChange: (key: K) => void
  error?: ReactNode
  className?: string
  hideLegend?: boolean
}) {
  return (
    <fieldset className={className}>
      <legend className={clsx('mb-1.5 text-sm font-extrabold', hideLegend && 'sr-only')}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.key}
            className={clsx(
              'flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 px-3 text-sm font-bold whitespace-nowrap transition',
              'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring',
              value === option.key ? 'border-accent bg-accent-soft text-accent-text' : 'border-border hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={value === option.key}
              onChange={() => onChange(option.key)}
              className="sr-only"
            />
            {option.icon}
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1.5 text-sm font-bold text-bad-fg">{error}</p>}
    </fieldset>
  )
}
