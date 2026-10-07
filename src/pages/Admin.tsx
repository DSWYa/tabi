import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { CalendarDays, Check, Copy, Crown, KeyRound, Loader2, RefreshCw, Settings2, ShieldCheck, UserMinus, UserRound, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, FormMessage } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/States'
import { pinColorByKey, type PinColorKey } from '@/lib/constants'
import { friendlyError } from '@/lib/join'
import { useMe } from '@/lib/members'
import { supabase, type Profile, type Trip } from '@/lib/supabase'
import { tripKey, useTrip } from '@/lib/trip'

// UX only: every action here is re-checked by Postgres (RLS + admin-only RPCs).
export default function Admin() {
  const { me, isAdmin } = useMe()
  if (!me) return <SkeletonCard lines={4} />
  if (!isAdmin) {
    return <EmptyState title="Admins only" message="Only the trip admin can change trip details and manage the family." />
  }
  return (
    <>
      <PageHeader title="Family admin" subtitle="Trip details, the family code and who's in." />
      <div className="grid gap-4 lg:grid-cols-2">
        <TripCard />
        <FamilyCodeCard />
        <MembersCard me={me} />
      </div>
    </>
  )
}

type Result = { tone: 'error' | 'success'; text: string } | null

function TripCard() {
  const trip = useTrip()
  // Lives outside the form so "Trip saved." survives the form re-mounting with the saved row.
  const [result, setResult] = useState<Result>(null)
  return (
    <Card className="animate-rise">
      <CardHeader title="Trip" icon={<CalendarDays className="size-4" />} />
      {trip.isPending ? (
        <SkeletonCard lines={3} />
      ) : trip.isError ? (
        <ErrorState message="Couldn't load the trip." onRetry={() => void trip.refetch()} />
      ) : (
        // Re-mount the form when the saved row changes (e.g. another admin edits it).
        <TripForm key={trip.data.updated_at} trip={trip.data} result={result} setResult={setResult} />
      )}
    </Card>
  )
}

function TripForm({ trip, result, setResult }: { trip: Trip; result: Result; setResult: (r: Result) => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(trip.name)
  const [start, setStart] = useState(trip.start_date ?? '')
  const [end, setEnd] = useState(trip.end_date ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('trip')
        .update({ name: name.trim(), start_date: start || null, end_date: end || null })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => {
      setResult({ tone: 'success', text: 'Trip saved.' })
      void queryClient.invalidateQueries({ queryKey: tripKey })
    },
    onError: (error) => setResult({ tone: 'error', text: friendlyError(error) }),
  })

  const nameError = name.trim() ? '' : 'Give the trip a name.'
  const dateError = start && end && end < start ? 'The trip has to end on or after the day it starts.' : ''

  function submit(e: FormEvent) {
    e.preventDefault()
    setResult(null)
    if (!nameError && !dateError) save.mutate()
  }

  return (
    <form onSubmit={submit} className="grid gap-3.5" noValidate>
      <Field label="Trip name" value={name} maxLength={80} error={nameError || undefined} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="First day" type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
        <Field label="Last day" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} error={dateError || undefined} />
      </div>
      {result && <FormMessage tone={result.tone}>{result.text}</FormMessage>}
      <Button type="submit" className="justify-self-start" disabled={save.isPending}>
        {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Save trip
      </Button>
    </form>
  )
}

const inviteKey = ['family_invite'] as const

function FamilyCodeCard() {
  const queryClient = useQueryClient()
  const invite = useQuery({
    queryKey: inviteKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('family_invite').select('code, enabled').eq('id', 1).single()
      if (error) throw error
      return data
    },
  })
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const rotate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('rotate_family_code')
      if (error) throw error
      return data
    },
    onSuccess: (code) => {
      queryClient.setQueryData(inviteKey, (old: { code: string; enabled: boolean } | undefined) => ({ enabled: old?.enabled ?? true, code }))
      setConfirming(false)
      setCopied(false)
    },
    onError: (e) => setError(friendlyError(e)),
  })

  async function copy() {
    if (!invite.data) return
    try {
      await navigator.clipboard.writeText(invite.data.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Copying is blocked here — select the code and copy it by hand.')
    }
  }

  return (
    <Card className="animate-rise">
      <CardHeader title="Family code" icon={<KeyRound className="size-4" />} />
      <p className="mb-3 text-sm text-muted">Share this with family so they can join. Anyone with the code can create a member account.</p>
      {invite.isPending ? (
        <SkeletonCard lines={1} />
      ) : invite.isError ? (
        <ErrorState message="Couldn't load the code." onRetry={() => void invite.refetch()} />
      ) : (
        <>
          <p className="mb-3 rounded-2xl bg-surface-2 px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.2em] break-all select-all">
            {invite.data.code}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? 'Copied!' : 'Copy code'}
            </Button>
            <Button variant="ghost" onClick={() => { setError(''); setConfirming(true) }}>
              <RefreshCw className="size-4" aria-hidden />
              New code
            </Button>
          </div>
          <span role="status" className="sr-only">{copied ? 'Code copied to clipboard' : ''}</span>
        </>
      )}
      <FormMessage tone="error" className="mt-3">{!confirming && error}</FormMessage>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Make a new family code?">
        <p className="text-sm text-muted">
          The current code stops working immediately. Everyone who already joined stays in — only new people need the new code.
        </p>
        <FormMessage tone="error" className="mt-3">{error}</FormMessage>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button onClick={() => rotate.mutate()} disabled={rotate.isPending}>
            {rotate.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            Make new code
          </Button>
        </div>
      </Sheet>
    </Card>
  )
}

function RoleBadge({ role }: { role: string }) {
  return role === 'admin' ? (
    <Badge tone="accent" icon={<Crown className="size-3.5" aria-hidden />}>Admin</Badge>
  ) : (
    <Badge tone="neutral" icon={<UserRound className="size-3.5" aria-hidden />}>Member</Badge>
  )
}

function MembersCard({ me }: { me: Profile }) {
  const { data: members = [] } = useMe()
  const [managing, setManaging] = useState<Profile | null>(null)
  // Keep the sheet in sync with live data (and close it if the member disappears).
  const current = managing ? members.find((m) => m.id === managing.id) ?? null : null

  return (
    <Card className="animate-rise lg:col-span-2">
      <CardHeader title={`Members (${members.length})`} icon={<Users className="size-4" />} />
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const pin = m.pin_color ? pinColorByKey[m.pin_color as PinColorKey] : null
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar profile={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">
                  {m.display_name}
                  {m.id === me.id && <span className="ml-1.5 text-sm font-bold text-muted">(you)</span>}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <RoleBadge role={m.role} />
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="size-2.5 rounded-full border border-border" style={pin ? { background: pin.hex } : undefined} />
                    {pin ? `${pin.label} pins` : 'No pin color yet'}
                  </span>
                </p>
              </div>
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setManaging(m)} aria-label={`Manage ${m.display_name}`}>
                <Settings2 className="size-4" aria-hidden />
                <span className="hidden sm:inline">Manage</span>
              </Button>
            </li>
          )
        })}
      </ul>
      {current && <ManageMemberSheet member={current} isSelf={current.id === me.id} onClose={() => setManaging(null)} />}
    </Card>
  )
}

function ManageMemberSheet({ member, isSelf, onClose }: { member: Profile; isSelf: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profiles'] })

  const setRole = useMutation({
    mutationFn: async (role: 'admin' | 'member') => {
      const { error } = await supabase.rpc('set_member_role', { target: member.id, new_role: role })
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => setError(e.message.includes('at least one admin') ? 'The family needs at least one admin. Make someone else admin first.' : friendlyError(e)),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('remove_member', { target: member.id })
      if (error) throw error
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: (e) => setError(friendlyError(e)),
  })

  return (
    <Sheet open onClose={onClose} title={isSelf ? 'You' : member.display_name}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar profile={member} className="size-12 text-lg" />
        <div>
          <p className="font-extrabold">{member.display_name}</p>
          <RoleBadge role={member.role} />
        </div>
      </div>

      <h3 className="mb-2 text-sm font-extrabold">Role</h3>
      <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1.5">
        {(['member', 'admin'] as const).map((role) => {
          const selected = member.role === role
          const Icon = role === 'admin' ? Crown : UserRound
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={setRole.isPending}
              onClick={() => {
                setError('')
                if (!selected) setRole.mutate(role)
              }}
              className={clsx(
                'flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition',
                selected ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
              )}
            >
              {setRole.isPending && setRole.variables === role ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
              {role === 'admin' ? 'Admin' : 'Member'}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        Admins set place status, edit the itinerary and Travel Info, review suggestions and manage the family.
        {isSelf && ' If you step down, you lose access to this page.'}
      </p>

      <FormMessage tone="error" className="mt-3">{error}</FormMessage>

      {!isSelf && (
        <div className="mt-5 border-t border-border pt-4">
          {!confirmRemove ? (
            <Button variant="danger" onClick={() => { setError(''); setConfirmRemove(true) }}>
              <UserMinus className="size-4" aria-hidden />
              Remove from family
            </Button>
          ) : (
            <div className="rounded-2xl bg-bad-bg p-3.5 text-bad-fg">
              <p className="text-sm font-bold">Remove {member.display_name}?</p>
              <p className="mt-1 text-sm">
                They lose access right away and their votes and suggestions are deleted; places they added stay.
                They could rejoin with the family code, so make a new code if that matters.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setConfirmRemove(false)}>Keep</Button>
                <Button variant="destructive" size="sm" className="min-h-11" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  {remove.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserMinus className="size-4" aria-hidden />}
                  Yes, remove
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {isSelf && (
        <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted">
          <ShieldCheck className="size-4" aria-hidden />
          You can't remove yourself.
        </p>
      )}
    </Sheet>
  )
}
