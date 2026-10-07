// The join flow: family code → sign up / sign in → join_family().
// Pure helpers live here so they can be unit-tested without a browser or server.

const INTENT_KEY = 'tabi.join'

/**
 * What the visitor typed on the gate, kept until join_family() succeeds. It survives a reload and the
 * "confirm your email" round trip (same browser), so nobody has to retype the code.
 */
export interface JoinIntent {
  code: string
  displayName?: string
}

export function saveJoinIntent(intent: JoinIntent): void {
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify(intent))
  } catch {
    // storage unavailable — the join screen will simply ask again
  }
}

export function readJoinIntent(): JoinIntent | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof (parsed as JoinIntent).code === 'string') {
      const { code, displayName } = parsed as JoinIntent
      return { code, displayName: typeof displayName === 'string' ? displayName : undefined }
    }
  } catch {
    // corrupt or unavailable — ignore
  }
  return null
}

export function clearJoinIntent(): void {
  try {
    localStorage.removeItem(INTENT_KEY)
  } catch {
    // ignore
  }
}

/** Where a signed-in user stands. Membership = having a profile row (granted only by join_family). */
export type Access = 'loading' | 'signed-out' | 'needs-join' | 'member'

export function accessFor(state: {
  authLoading: boolean
  hasSession: boolean
  profileLoading: boolean
  hasProfile: boolean
}): Access {
  if (state.authLoading) return 'loading'
  if (!state.hasSession) return 'signed-out'
  if (state.profileLoading) return 'loading'
  return state.hasProfile ? 'member' : 'needs-join'
}

/** Everything needed to call join_family() without asking again, or null if we must ask. */
export function autoJoinArgs(intent: JoinIntent | null, metadataName: unknown): { code: string; displayName: string } | null {
  const code = intent?.code.trim()
  const name = (intent?.displayName ?? (typeof metadataName === 'string' ? metadataName : '')).trim()
  return code && name ? { code, displayName: name } : null
}

export const NAME_MAX = 40
export const PASSWORD_MIN = 8

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter the name your family knows you by.'
  if (trimmed.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`
  return null
}

export function validatePassword(password: string): string | null {
  return password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : null
}

interface ErrorLike {
  message?: string
  code?: string
  status?: number
  name?: string
}

/** Turn Supabase Auth / RPC errors into friendly, non-technical sentences. */
export function friendlyError(error: ErrorLike | null | undefined): string {
  if (!error) return ''
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network/i.test(message)) {
    return "Couldn't reach the server. Check your connection and try again."
  }
  switch (code) {
    case 'invalid_credentials':
      return "That email and password don't match. Try again."
    case 'user_already_exists':
    case 'email_exists':
      return 'That email already has an account — sign in instead.'
    case 'email_not_confirmed':
      return 'Please confirm your email first — check your inbox for the link.'
    case 'same_password':
      return "That's already your password. Choose a different one."
    case 'reauthentication_needed':
    case 'session_expired':
    case 'session_not_found':
      return 'For security, sign out and sign back in, then try again.'
    case 'weak_password':
      return `That password is too weak. Use at least ${PASSWORD_MIN} characters.`
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.'
    case 'signup_disabled':
      return 'New accounts are switched off right now. Ask the trip organizer.'
    case 'validation_failed':
      return 'Check the email address and try again.'
    case '23505':
      return 'Someone else just took that. Pick another one.'
    case '42501':
      return /family code/i.test(message)
        ? "That family code doesn't match. Check with the trip organizer — they may have closed joining."
        : "You don't have permission to do that."
  }
  return message || 'Something went wrong. Please try again.'
}

/** Is this the "email already registered" signal? With email confirmation on, Supabase hides it. */
export function isExistingAccountSignup(user: { identities?: unknown[] } | null | undefined): boolean {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0)
}
