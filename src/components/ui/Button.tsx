import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive'
type Size = 'md' | 'sm' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-card hover:brightness-110',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  danger: 'bg-bad-bg text-bad-fg hover:brightness-95',
  /** Final "yes, do it" for irreversible actions. */
  destructive: 'bg-bad-fg text-surface shadow-card hover:brightness-110',
}

const sizes: Record<Size, string> = {
  md: 'min-h-11 px-5 text-[15px]',
  sm: 'min-h-9 px-3.5 text-sm',
  icon: 'size-11 justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full font-bold transition active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
