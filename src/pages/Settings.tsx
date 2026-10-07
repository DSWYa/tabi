import { clsx } from 'clsx'
import { Bell, Camera, ChevronRight, KeyRound, Loader2, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun, Trash2, UserRound } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/PageHeader'
import { PinColorPicker } from '@/components/PinColorPicker'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, FormMessage } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { SkeletonCard } from '@/components/ui/States'
import { useAuth } from '@/lib/auth'
import { NOTIFICATION_KINDS, type NotificationKind } from '@/lib/constants'
import { checkAvatarFile, processAvatar } from '@/lib/image'
import { friendlyError, NAME_MAX, PASSWORD_MIN, validateDisplayName, validatePassword } from '@/lib/join'
import { useMe, useSyncedTheme, useUpdateMyProfile } from '@/lib/members'
import { useOutbox } from '@/lib/outboxRuntime'
import { supabase, type Profile } from '@/lib/supabase'
import type { ThemePreference } from '@/lib/theme'

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export default function Settings() {
  const { me, isAdmin } = useMe()

  return (
    <>
      <PageHeader title="Profile & Settings" subtitle="Make Tabi yours." />
      {!me ? (
        <SkeletonCard lines={4} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ProfileCard me={me} />
          <AppearanceCard />
          <Card className="animate-rise lg:col-span-2">
            <CardHeader title="Map pin color" icon={<span aria-hidden className="size-3 rounded-full bg-accent-bright" />} />
            <p className="mb-3 text-sm text-muted">Your pins on the map use this color. Each color belongs to one person.</p>
            <PinColorPicker />
          </Card>
          <NotificationsCard me={me} />
          <AccountCard isAdmin={isAdmin} />
        </div>
      )}
    </>
  )
}

function ProfileCard({ me }: { me: Profile }) {
  const update = useUpdateMyProfile()
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(me.display_name)
  const [nameError, setNameError] = useState('')
  const [photo, setPhoto] = useState<{ busy: boolean; error: string; ok: string }>({ busy: false, error: '', ok: '' })
  const [nameSaved, setNameSaved] = useState(false)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    const problem = validateDisplayName(name)
    setNameError(problem ?? '')
    setNameSaved(false)
    if (problem) return
    try {
      await update.mutateAsync({ display_name: name.trim() })
      setNameSaved(true)
    } catch (error) {
      setNameError(friendlyError(error as Error))
    }
  }

  async function changePhoto(file: File | undefined) {
    if (!file) return
    const problem = checkAvatarFile(file)
    if (problem) return setPhoto({ busy: false, error: problem, ok: '' })
    setPhoto({ busy: true, error: '', ok: '' })
    try {
      const { blob, ext } = await processAvatar(file)
      const path = `${me.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
      if (uploadError) throw uploadError
      const old = me.avatar_path
      await update.mutateAsync({ avatar_path: path })
      if (old) await supabase.storage.from('avatars').remove([old]) // best effort
      setPhoto({ busy: false, error: '', ok: 'Photo updated.' })
    } catch (error) {
      setPhoto({ busy: false, error: friendlyError(error as Error), ok: '' })
    }
  }

  async function removePhoto() {
    const old = me.avatar_path
    if (!old) return
    setPhoto({ busy: true, error: '', ok: '' })
    try {
      await update.mutateAsync({ avatar_path: null })
      await supabase.storage.from('avatars').remove([old])
      setPhoto({ busy: false, error: '', ok: 'Photo removed.' })
    } catch (error) {
      setPhoto({ busy: false, error: friendlyError(error as Error), ok: '' })
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader title="Profile" icon={<UserRound className="size-4" />} />
      <div className="mb-4 flex items-center gap-4">
        <div className="relative">
          <Avatar profile={me} className="size-20 text-2xl" />
          {photo.busy && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-bg/70">
              <Loader2 className="size-6 animate-spin text-accent-text" aria-hidden />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void changePhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button variant="secondary" size="sm" className="min-h-11" disabled={photo.busy} onClick={() => fileInput.current?.click()}>
            <Camera className="size-4" aria-hidden />
            {me.avatar_path ? 'Change photo' : 'Add photo'}
          </Button>
          {me.avatar_path && (
            <Button variant="ghost" size="sm" className="min-h-11" disabled={photo.busy} onClick={() => void removePhoto()}>
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="-mt-2 mb-3 text-xs text-muted">Up to 10 MB. We crop it square and shrink it on your device.</p>
      {photo.busy && <p role="status" className="sr-only">Uploading photo…</p>}
      <FormMessage tone="error" className="mb-3">{photo.error}</FormMessage>
      <FormMessage tone="success" className="mb-3">{photo.ok}</FormMessage>

      <form onSubmit={saveName} className="flex items-start gap-2" noValidate>
        <Field
          label="Display name"
          className="min-w-0 flex-1"
          error={nameError}
          hint={nameSaved ? 'Saved.' : undefined}
          value={name}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          onChange={(e) => {
            setName(e.target.value)
            setNameSaved(false)
          }}
        />
        <Button type="submit" className="mt-[1.625rem] min-h-12" disabled={update.isPending || name.trim() === me.display_name}>
          Save
        </Button>
      </form>
    </Card>
  )
}

function AppearanceCard() {
  const { preference, setPreference } = useSyncedTheme()
  return (
    <Card className="animate-rise">
      <CardHeader title="Appearance" icon={<Palette className="size-4" />} />
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-1.5">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = preference === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(value)}
              className={clsx(
                'flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition',
                selected ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Saved to your profile, so it follows you to every device.</p>
    </Card>
  )
}

/** Missing keys fall back to each kind's default (see NOTIFICATION_KINDS). */
function prefValue(prefs: unknown, kind: NotificationKind, fallback: boolean): boolean {
  const value = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>)[kind] : undefined
  return typeof value === 'boolean' ? value : fallback
}

function NotificationsCard({ me }: { me: Profile }) {
  const update = useUpdateMyProfile()
  const [error, setError] = useState('')

  function toggle(kind: NotificationKind, next: boolean) {
    setError('')
    const current = me.notification_prefs && typeof me.notification_prefs === 'object' ? me.notification_prefs : {}
    update.mutate(
      { notification_prefs: { ...(current as Record<string, boolean>), [kind]: next } },
      { onError: (e) => setError(friendlyError(e)) },
    )
  }

  return (
    <Card className="animate-rise">
      <CardHeader title="Notifications" icon={<Bell className="size-4" />} />
      <p className="mb-2 text-sm text-muted">Choose what Tabi tells you about.</p>
      <ul className="divide-y divide-border">
        {NOTIFICATION_KINDS.map((kind) => {
          const on = prefValue(me.notification_prefs, kind.key, kind.default)
          return (
            <li key={kind.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(kind.key, !on)}
                className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left text-sm font-bold"
              >
                <span className="flex-1">{kind.label}</span>
                <span className={clsx('text-xs font-bold', on ? 'text-ok-fg' : 'text-muted')}>{on ? 'On' : 'Off'}</span>
                <span
                  aria-hidden
                  className={clsx('relative h-7 w-12 shrink-0 rounded-full transition', on ? 'bg-accent' : 'bg-surface-2 ring-1 ring-border')}
                >
                  <span className={clsx('absolute top-1 size-5 rounded-full bg-surface shadow-card transition-all', on ? 'left-6' : 'left-1')} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <FormMessage tone="error" className="mt-2">{error}</FormMessage>
    </Card>
  )
}

function AccountCard({ isAdmin }: { isAdmin: boolean }) {
  const { session, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const unsent = useOutbox().ops.filter((o) => o.userId === session?.user.id).length
  const doSignOut = async () => {
    setBusy(true)
    await signOut()
  }
  return (
    <Card className="animate-rise">
      <CardHeader title="Account" icon={<UserRound className="size-4" />} />
      <p className="text-sm text-muted">Signed in as</p>
      <p className="mb-4 font-bold break-all">{session?.user.email}</p>
      {isAdmin && (
        <Link
          to="/admin"
          className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-bg px-3.5 font-bold hover:bg-surface-2"
        >
          <ShieldCheck className="size-5 text-accent-text" aria-hidden />
          <span className="flex-1">Family admin</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setChangingPassword(true)}>
          <KeyRound className="size-4" aria-hidden />
          Change password
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => (unsent ? setConfirmSignOut(true) : void doSignOut())}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
      <Sheet open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Sign out with unsent changes?">
        <p className="text-sm text-muted">
          {unsent === 1 ? '1 change you made offline hasn’t' : `${unsent} changes you made offline haven’t`} been sent yet.
          Signing out deletes {unsent === 1 ? 'it' : 'them'} from this device. Wait until you’re back online to keep {unsent === 1 ? 'it' : 'them'}.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmSignOut(false)}>Stay signed in</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void doSignOut()}>
            <LogOut className="size-4" aria-hidden />
            Sign out anyway
          </Button>
        </div>
      </Sheet>
      {changingPassword && <ChangePasswordSheet email={session?.user.email ?? ''} onClose={() => setChangingPassword(false)} />}
    </Card>
  )
}

function ChangePasswordSheet({ email, onClose }: { email: string; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = {
      password: validatePassword(password) ?? undefined,
      confirm: password && confirm !== password ? "The two passwords don't match." : undefined,
    }
    setErrors(next)
    if (next.password || next.confirm) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErrors({ form: friendlyError(error) })
    setDone(true)
  }

  return (
    <Sheet open onClose={onClose} title="Change password">
      {done ? (
        <>
          <FormMessage tone="success">Password changed. Use the new one next time you sign in.</FormMessage>
          <Button className="mt-4" onClick={onClose}>Done</Button>
        </>
      ) : (
        <form onSubmit={submit} className="grid gap-3.5" noValidate>
          {/* Lets password managers file the new password under the right account. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters.`}
            error={errors.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Type it again"
            type="password"
            autoComplete="new-password"
            error={errors.confirm}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <FormMessage tone="error">{errors.form}</FormMessage>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !password}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save password
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
