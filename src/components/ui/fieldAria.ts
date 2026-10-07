import type { ReactNode } from 'react'

/** aria props for a control inside <FieldShell id={id}>, matching its error/hint ids. */
export function describedBy(id: string, error?: ReactNode, hint?: ReactNode) {
  return {
    'aria-invalid': Boolean(error) || undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  }
}
