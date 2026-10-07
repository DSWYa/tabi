import { clsx } from 'clsx'
import { Bell } from 'lucide-react'
import { NavLink } from 'react-router'
import { useUnreadCount } from '@/lib/notifications'

/** Bell with the unread count; opens the notification center. */
export function NotificationBell({ className }: { className?: string }) {
  const unread = useUnreadCount()
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'
  return (
    <NavLink
      to="/notifications"
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        clsx(
          'relative grid size-11 place-items-center rounded-full hover:bg-surface-2 hover:text-text',
          isActive ? 'bg-accent-soft text-accent-text' : 'text-muted',
          className,
        )
      }
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] leading-none font-black text-accent-fg ring-2 ring-bg"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </NavLink>
  )
}
