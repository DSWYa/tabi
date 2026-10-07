import { useQueryClient } from '@tanstack/react-query'
import { Loader2, LogOut, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { gateCardClass, GateLayout } from '@/components/GateLayout'
import { Button } from '@/components/ui/Button'
import { Field, FormMessage } from '@/components/ui/Field'
import { useAuth } from '@/lib/auth'
import { autoJoinArgs, clearJoinIntent, friendlyError, readJoinIntent, validateDisplayName } from '@/lib/join'
import { membersKey } from '@/lib/members'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'

/**
 * Signed in, but no profile yet (just signed up, came back from the email link, or was removed).
 * Calls join_family() — automatically when we already know the code and name, otherwise via a short form.
 */
export default function JoinFamily() {
  const { session, signOut } = useAuth()
  const queryClient = useQueryClient()
  const { preference } = useTheme()
  const user = session!.user
  const [intent] = useState(readJoinIntent)
  const metadataName = user.user_metadata?.display_name
  const auto = autoJoinArgs(intent, metadataName)

  const [code, setCode] = useState(intent?.code ?? '')
  const [name, setName] = useState(intent?.displayName ?? (typeof metadataName === 'string' ? metadataName : ''))
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(Boolean(auto))
  const started = useRef(false)

  async function join(args: { code: string; displayName: string }) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('join_family', { code: args.code, display_name: args.displayName })
    if (error) {
      setBusy(false)
      setError(friendlyError(error))
      return
    }
    clearJoinIntent()
    // Carry over a theme chosen before joining, so the new profile matches what they see.
    if (preference !== 'system') await supabase.from('profiles').update({ theme: preference }).eq('id', user.id)
    await queryClient.refetchQueries({ queryKey: membersKey(user.id) })
  }

  useEffect(() => {
    if (!auto || started.current) return
    started.current = true
    void join(auto)
    // Run once on arrival; `join` is stable enough for this one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const problem = validateDisplayName(name)
    setNameError(problem ?? '')
    if (problem || !code.trim()) return
    void join({ code: code.trim(), displayName: name.trim() })
  }

  if (busy && !error) {
    return (
      <GateLayout subtitle="Joining the family…">
        <div role="status" className={`${gateCardClass} flex items-center justify-center gap-3 font-bold`}>
          <Loader2 className="size-5 animate-spin text-accent-text" aria-hidden />
          Setting up your profile…
        </div>
      </GateLayout>
    )
  }

  return (
    <GateLayout subtitle="One more step.">
      <form onSubmit={submit} className={gateCardClass} noValidate>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold">
          <Users className="size-5 text-accent-text" aria-hidden />
          Join the family
        </h2>
        <p className="mb-4 text-sm text-muted">
          Your account isn't part of the family yet. Enter the family code to join.
        </p>
        <div className="grid gap-3.5">
          <Field
            label="Family code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="[&_input]:font-mono [&_input]:uppercase [&_input]:tracking-widest"
            required
          />
          <Field
            label="Your name"
            error={nameError}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            maxLength={40}
            required
          />
          <FormMessage tone="error">{error}</FormMessage>
          <Button type="submit" className="w-full justify-center" disabled={busy || !code.trim()}>
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Join
          </Button>
        </div>
      </form>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-center text-sm text-muted">
        Signed in as <span className="font-bold text-text">{user.email}</span>
        <button type="button" onClick={() => void signOut()} className="inline-flex min-h-11 items-center gap-1 font-bold text-accent-text underline-offset-2 hover:underline">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </p>
    </GateLayout>
  )
}
