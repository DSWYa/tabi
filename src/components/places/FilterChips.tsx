import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { categoryIcons } from '@/components/categoryIcons'
import { Avatar } from '@/components/Avatar'
import { CATEGORIES, PLACE_STATUSES, type CategoryKey, type PlaceStatus } from '@/lib/constants'
import { toggle } from '@/lib/placeFilters'
import type { Profile } from '@/lib/supabase'

/** Toggle chip; pressed state is shown by a check mark as well as color. */
export function Chip({ pressed, onClick, children, count }: { pressed: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition active:scale-[0.97]',
        pressed ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-surface text-muted hover:text-text',
      )}
    >
      {pressed && <Check className="size-4" aria-hidden />}
      {children}
      {count != null && <span className="text-xs opacity-75">{count}</span>}
    </button>
  )
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {children}
    </div>
  )
}

export function StatusChips({ value, onChange, counts, only }: {
  value: PlaceStatus[]
  onChange: (next: PlaceStatus[]) => void
  counts?: Partial<Record<PlaceStatus, number>>
  only?: PlaceStatus[]
}) {
  return (
    <ChipRow label="Filter by status">
      {PLACE_STATUSES.filter((s) => !only || only.includes(s.key)).map(({ key, label }) => (
        <Chip key={key} pressed={value.includes(key)} onClick={() => onChange(toggle(value, key))} count={counts?.[key]}>
          {label}
        </Chip>
      ))}
    </ChipRow>
  )
}

export function CategoryChips({ value, onChange }: { value: CategoryKey[]; onChange: (next: CategoryKey[]) => void }) {
  return (
    <ChipRow label="Filter by category">
      {CATEGORIES.map(({ key, label, color }) => {
        const Icon = categoryIcons[key]
        return (
          <Chip key={key} pressed={value.includes(key)} onClick={() => onChange(toggle(value, key))}>
            <span className="grid size-5 place-items-center rounded-full text-white" style={{ background: color }}>
              <Icon className="size-3" aria-hidden />
            </span>
            {label}
          </Chip>
        )
      })}
    </ChipRow>
  )
}

export function MemberChips({ members, value, onChange }: { members: Profile[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <ChipRow label="Filter by who added it">
      {members.map((m) => (
        <Chip key={m.id} pressed={value.includes(m.id)} onClick={() => onChange(toggle(value, m.id))}>
          <Avatar profile={m} className="size-6 text-[10px]" />
          {m.display_name}
        </Chip>
      ))}
    </ChipRow>
  )
}
