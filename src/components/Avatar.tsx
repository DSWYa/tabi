import { clsx } from 'clsx'
import { useState } from 'react'
import { readableTextOn } from '@/lib/color'
import { pinColorByKey, type PinColorKey } from '@/lib/constants'
import { initials } from '@/lib/format'
import { publicUrl } from '@/lib/supabase'

type AvatarProfile = { display_name: string; avatar_path: string | null; pin_color: string | null }

/** Photo if there is one, otherwise initials on the member's pin color. Decorative: show the name nearby. */
export function Avatar({ profile, className }: { profile: AvatarProfile; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const pin = profile.pin_color ? pinColorByKey[profile.pin_color as PinColorKey] : undefined
  const src = profile.avatar_path && failed !== profile.avatar_path ? publicUrl('avatars', profile.avatar_path) : null

  return (
    <span
      aria-hidden
      className={clsx('relative inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-full font-extrabold', !pin && 'bg-surface-2 text-text', className)}
      style={pin ? { background: pin.hex, color: readableTextOn(pin.hex) } : undefined}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(profile.avatar_path)} />
      ) : (
        <span className="text-[0.85em]">{initials(profile.display_name)}</span>
      )}
    </span>
  )
}
