import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { gateCardClass, GateLayout } from '@/components/GateLayout'
import { Button } from '@/components/ui/Button'
import { Field, FormMessage } from '@/components/ui/Field'
import { useAuth } from '@/lib/auth'
import { friendlyError, PASSWORD_MIN, validatePassword } from '@/lib/join'
import { supabase } from '@/lib/supabase'

/** Shown after opening a password-reset link (signed in, in "recovery"): choose a new password, then carry on. */
export default function ResetPassword() {
  const { session, finishRecovery } = useAuth()
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
    <GateLayout subtitle="Choose a new password.">
      {done ? (
        <div className={gateCardClass}>
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-ok-bg text-ok-fg">
            <CheckCircle2 className="size-7" aria-hidden />
          </span>
          <h2 className="text-center text-lg font-extrabold">Password changed</h2>
          <p role="status" className="mt-2 text-center text-sm text-muted">Use it next time you sign in.</p>
          <Button className="mt-4 w-full justify-center" onClick={finishRecovery}>Continue to Tabi</Button>
        </div>
      ) : (
        <form onSubmit={submit} className={gateCardClass} noValidate>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
            <KeyRound className="size-5 text-accent-text" aria-hidden />
            New password
          </h2>
          <p className="mb-4 text-sm text-muted break-all">For {session?.user.email}</p>
          <div className="grid gap-3.5">
            {/* Lets password managers file the new password under the right account. */}
            <input type="email" autoComplete="username" value={session?.user.email ?? ''} readOnly hidden />
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              hint={`At least ${PASSWORD_MIN} characters.`}
              error={errors.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
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
            <Button type="submit" className="w-full justify-center" disabled={busy || !password}>
              {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
              Save new password
            </Button>
          </div>
        </form>
      )}
    </GateLayout>
  )
}
