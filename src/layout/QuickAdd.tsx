import { CalendarPlus, Lightbulb, MapPinPlus, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Sheet } from '@/components/ui/Sheet'

const ACTIONS = [
  { label: 'Add Place', hint: 'Suggest somewhere to go', icon: MapPinPlus, to: '/places?new=1' },
  { label: 'Add Whiteboard Idea', hint: 'Sketch or jot something down', icon: Lightbulb, to: '/whiteboard?idea=1' },
  { label: 'Suggest Itinerary Change', hint: 'Propose a day and time', icon: CalendarPlus, to: '/itinerary?suggest=1' },
]

/** Floating "+" — the fastest way to capture something while walking around. */
export function QuickAdd() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick add"
        aria-haspopup="dialog"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 grid size-14 place-items-center rounded-full bg-accent text-accent-fg shadow-card transition hover:brightness-110 active:scale-95 lg:right-8 lg:bottom-8"
      >
        <Plus className="size-7" strokeWidth={2.5} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Quick add">
        <ul className="flex flex-col gap-2">
          {ACTIONS.map(({ label, hint, icon: Icon, to }) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate(to)
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-bg p-3 text-left hover:bg-surface-2"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-muted">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
