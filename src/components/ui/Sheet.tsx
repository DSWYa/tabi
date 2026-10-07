import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Modal built on native <dialog> (focus trap, Esc, inert background for free).
 * Renders as a bottom sheet on phones and a centered card from `sm` up.
 */
const widths = { md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' } as const

export function Sheet({ open, onClose, title, children, className, size = 'md' }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
  /** Width from `sm` up (phones always get a full-width bottom sheet). */
  size?: keyof typeof widths
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal?.()
    if (!open && dialog.open) dialog.close?.()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        'sheet m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] bg-surface p-0 text-text shadow-card',
        'sm:m-auto sm:rounded-card',
        widths[size],
        'open:animate-sheet',
        className,
      )}
    >
      <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <div className="mb-4 flex items-center gap-2">
          <h2 id={titleId} className="flex-1 text-lg font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
