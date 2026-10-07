import type { SVGProps } from 'react'

/** App mark: a torii gate in front of a rising sun. */
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden {...props}>
      <rect width="64" height="64" rx="18" fill="var(--accent-bright)" />
      <circle cx="32" cy="30" r="16" fill="#FFF4E6" />
      <g fill="#C44E0A">
        <rect x="15" y="22" width="34" height="5" rx="2.5" />
        <rect x="19" y="30" width="26" height="3.5" rx="1.75" />
        <rect x="22" y="25" width="4.5" height="25" rx="2" />
        <rect x="37.5" y="25" width="4.5" height="25" rx="2" />
      </g>
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo className="size-9 shrink-0" />
      <span className="leading-none">
        <span className="block text-lg font-black tracking-tight">Tabi</span>
        <span className="block text-[11px] font-bold text-muted">旅 · Tokyo</span>
      </span>
    </span>
  )
}

/** Onigiri mascot for empty/error states. Kept small and simple on purpose. */
export function Mascot({ mood = 'happy', className }: { mood?: 'happy' | 'sleepy'; className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden>
      <ellipse cx="40" cy="72" rx="22" ry="4" fill="var(--border)" />
      <path
        d="M40 8c7 0 12 5 17 13l12 21c5 9 2 22-10 25-6 2-13 2-19 2s-13 0-19-2C9 64 6 51 11 42l12-21C28 13 33 8 40 8Z"
        fill="#FFFDF8"
        stroke="var(--border)"
        strokeWidth="2"
      />
      <rect x="25" y="49" width="30" height="20" rx="4" fill="#24303A" />
      {mood === 'happy' ? (
        <>
          <circle cx="32" cy="38" r="2.6" fill="#2B2118" />
          <circle cx="48" cy="38" r="2.6" fill="#2B2118" />
          <path d="M36 43.5c2.4 2.2 5.6 2.2 8 0" stroke="#2B2118" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M29 38h6M45 38h6" stroke="#2B2118" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M37 44h6" stroke="#2B2118" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      <circle cx="27" cy="43" r="3" fill="#F7A8A0" opacity="0.7" />
      <circle cx="53" cy="43" r="3" fill="#F7A8A0" opacity="0.7" />
    </svg>
  )
}

/** Lucide has no torii; this matches its 24px stroke style for the Shrine category. */
export function ToriiIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M3 5c6 1.3 12 1.3 18 0" />
      <path d="M5 9h14" />
      <path d="M7 6.3V21M17 6.3V21" />
      <path d="M12 6.6V9" />
    </svg>
  )
}
