import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader2, MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { gateCardClass, GateLayout, TextButton } from '@/components/GateLayout'
import { Button } from '@/components/ui/Button'
import { Field, FormMessage } from '@/components/ui/Field'
import {
  friendlyError, isExistingAccountSignup, PASSWORD_MIN, readJoinIntent, saveJoinIntent,
  validateDisplayName, validatePassword,
} from '@/lib/join'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

type Step = 'code' | 'signup' | 'signin' | 'check-email' | 'forgot'

/**
 * The only screen a visitor without a session sees. It reveals nothing about the trip.
 * A valid code only unlocks the account forms; membership is granted server-side by join_family()
 * (run by <JoinFamily> once a session exists).
 */
export default function Gate() {
  const [step, setStep] = useState<Step>('code')
  const [code, setCode] = useState(() => readJoinIntent()?.code ?? '')
  const [codeOk, setCodeOk] = useState(false)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')

  const goSignIn = (message = '') => {
    setNotice(message)
    setStep('signin')
  }

  return (
    <GateLayout>
      {step === 'code' && (
        <CodeStep
          code={code}
          setCode={setCode}
          onValid={() => {
            setCodeOk(true)
            setNotice('')
            setStep('signup')
          }}
          onSignIn={() => goSignIn()}
        />
      )}
      {step === 'signup' && (
        <SignUpStep
          code={code}
          email={email}
          setEmail={setEmail}
          onConfirmEmail={() => setStep('check-email')}
          onExistingAccount={() => goSignIn('That email already has an account — sign in instead.')}
          onSignIn={() => goSignIn()}
          onBack={() => setStep('code')}
        />
      )}
      {step === 'signin' && (
        <SignInStep
          code={codeOk ? code : ''}
          email={email}
          setEmail={setEmail}
          notice={notice}
          onCreate={() => {
            setNotice('')
            setStep(codeOk ? 'signup' : 'code')
          }}
          onForgot={() => setStep('forgot')}
        />
      )}
      {step === 'forgot' && <ForgotStep email={email} setEmail={setEmail} onBack={() => goSignIn()} />}
      {step === 'check-email' && (
        <div className={gateCardClass}>
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-ok-bg text-ok-fg">
            <MailCheck className="size-7" aria-hidden />
          </span>
          <h2 className="text-center text-lg font-extrabold">Check your email</h2>
          <p className="mt-2 text-center text-sm text-muted">
            We sent a confirmation link to <span className="font-bold text-text">{email}</span>. Open it{' '}
            <span className="font-bold text-text">on this device</span> and you'll land straight in the family.
          </p>
          <p className="mt-4 text-center text-sm">
            <TextButton onClick={() => goSignIn()}>Already confirmed? Sign in</TextButton>
          </p>
        </div>
      )}

      {!isSupabaseConfigured && (
        <p role="alert" className="mt-4 rounded-2xl bg-warn-bg p-3 text-center text-sm font-bold text-warn-fg">
          Backend not configured. Copy .env.example to .env.local and add your Supabase URL and publishable key.
        </p>
      )}
    </GateLayout>
  )
}

function CodeStep({ code, setCode, onValid, onSignIn }: {
  code: string
  setCode: (code: string) => void
  onValid: () => void
  onSignIn: () => void
}) {
  const [state, setState] = useState<'idle' | 'checking' | 'invalid' | 'error'>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setState('checking')
    const { data, error } = await supabase.rpc('check_family_code', { code })
    if (error) return setState('error')
    if (!data) return setState('invalid')
    setState('idle')
    onValid()
  }

  return (
    <form onSubmit={submit} className={gateCardClass} noValidate>
      <label htmlFor="family-code" className="mb-2 flex items-center gap-2 text-sm font-extrabold">
        <KeyRound className="size-4 text-accent-text" aria-hidden />
        Family Code
      </label>
      <input
        id="family-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value)
          if (state !== 'checking') setState('idle')
        }}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXXX-XXXXX"
        aria-invalid={state === 'invalid'}
        aria-describedby="family-code-help"
        className="h-13 w-full rounded-2xl border-2 border-border bg-bg px-4 text-center font-mono text-lg font-bold tracking-[0.2em] uppercase placeholder:text-muted/50 focus:border-accent focus:outline-none"
      />
      <p id="family-code-help" aria-live="polite" className="mt-2 min-h-5 text-center text-sm">
        {state === 'invalid' && <span className="font-bold text-bad-fg">That code doesn't work. Check with the trip organizer — joining may be closed.</span>}
        {state === 'error' && <span className="font-bold text-bad-fg">Couldn't reach the server. Check your connection and try again.</span>}
        {(state === 'idle' || state === 'checking') && <span className="text-muted">Ask the trip organizer for the code.</span>}
      </p>
      <Button type="submit" className="mt-3 w-full justify-center" disabled={!isSupabaseConfigured || state === 'checking' || !code.trim()}>
        {state === 'checking' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
        Continue
        {state !== 'checking' && <ArrowRight className="size-5" aria-hidden />}
      </Button>
      <p className="mt-3 text-center text-sm text-muted">
        Already joined? <TextButton onClick={onSignIn}>Sign in</TextButton>
      </p>
    </form>
  )
}

function CodeAccepted({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl bg-ok-bg px-3 py-1.5 text-sm font-bold text-ok-fg">
      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">Family code accepted</span>
      <button type="button" onClick={onBack} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 underline-offset-2 hover:underline">
        <ArrowLeft className="size-3.5" aria-hidden />
        Change
      </button>
    </div>
  )
}

function SignUpStep({ code, email, setEmail, onConfirmEmail, onExistingAccount, onSignIn, onBack }: {
  code: string
  email: string
  setEmail: (email: string) => void
  onConfirmEmail: () => void
  onExistingAccount: () => void
  onSignIn: () => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = { name: validateDisplayName(name) ?? undefined, password: validatePassword(password) ?? undefined }
    setErrors(next)
    if (next.name || next.password) return

    setBusy(true)
    // Remember the code + name first: <JoinFamily> finishes the join as soon as a session exists,
    // including after the "confirm your email" round trip.
    const displayName = name.trim()
    saveJoinIntent({ code, displayName })
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    })
    setBusy(false)

    if (error) {
      if (error.code === 'user_already_exists' || error.code === 'email_exists') return onExistingAccount()
      return setErrors({ form: friendlyError(error) })
    }
    if (isExistingAccountSignup(data.user)) return onExistingAccount()
    if (!data.session) onConfirmEmail()
    // With a session, the auth listener swaps this screen for <JoinFamily> automatically.
  }

  return (
    <form onSubmit={submit} className={gateCardClass} noValidate>
      <CodeAccepted onBack={onBack} />
      <h2 className="mb-4 text-lg font-extrabold">Create your account</h2>
      <div className="grid gap-3.5">
        <Field
          label="Your name"
          hint="What the family calls you. You can change it later."
          error={errors.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
          maxLength={40}
          required
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
        <Field
          label="Password"
          type="password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errors.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <FormMessage tone="error">{errors.form}</FormMessage>
        <Button type="submit" className="w-full justify-center" disabled={busy || !email.trim()}>
          {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Create account &amp; join
        </Button>
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        Already have an account? <TextButton onClick={onSignIn}>Sign in</TextButton>
      </p>
    </form>
  )
}

function SignInStep({ code, email, setEmail, notice, onCreate, onForgot }: {
  code: string
  email: string
  setEmail: (email: string) => void
  notice: string
  onCreate: () => void
  onForgot: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    // Keep a freshly-entered code so a signed-in account without a profile can still join.
    if (code) saveJoinIntent({ code, displayName: readJoinIntent()?.displayName })
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(friendlyError(error))
  }

  return (
    <form onSubmit={submit} className={gateCardClass} noValidate>
      <h2 className="mb-4 text-lg font-extrabold">Welcome back</h2>
      <div className="grid gap-3.5">
        <FormMessage tone="info">{notice}</FormMessage>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <p className="-mt-2 text-right text-sm">
          <TextButton onClick={onForgot}>Forgot password?</TextButton>
        </p>
        <FormMessage tone="error">{error}</FormMessage>
        <Button type="submit" className="w-full justify-center" disabled={busy || !email.trim() || !password}>
          {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Sign in
        </Button>
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        New here? <TextButton onClick={onCreate}>{code ? 'Create an account' : 'Enter the family code'}</TextButton>
      </p>
    </form>
  )
}

/** Sends a reset link. The answer never says whether an account exists for that address. */
function ForgotStep({ email, setEmail, onBack }: { email: string; setEmail: (email: string) => void; onBack: () => void }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setState('sending')
    // PKCE: the link comes back as `?code=…` to this page, in this browser, and opens the "new password" screen.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    })
    if (error) {
      setState('idle')
      return setError(friendlyError(error))
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <div className={gateCardClass}>
        <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-ok-bg text-ok-fg">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <h2 className="text-center text-lg font-extrabold">Check your email</h2>
        <p role="status" className="mt-2 text-center text-sm text-muted">
          If <span className="font-bold text-text">{email.trim()}</span> has a Tabi account, a link to set a new password is on its
          way. Open it <span className="font-bold text-text">on this device, in this browser</span>.
        </p>
        <p className="mt-4 text-center text-sm">
          <TextButton onClick={onBack}>Back to sign in</TextButton>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className={gateCardClass} noValidate>
      <h2 className="mb-1 text-lg font-extrabold">Reset your password</h2>
      <p className="mb-4 text-sm text-muted">We'll email you a link to choose a new one.</p>
      <div className="grid gap-3.5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
        <FormMessage tone="error">{error}</FormMessage>
        <Button type="submit" className="w-full justify-center" disabled={state === 'sending' || !email.trim()}>
          {state === 'sending' && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Send reset link
        </Button>
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        <TextButton onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" aria-hidden />
          Back to sign in
        </TextButton>
      </p>
    </form>
  )
}
