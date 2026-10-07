import {
  accessFor, autoJoinArgs, clearJoinIntent, friendlyError, isExistingAccountSignup, readJoinIntent,
  saveJoinIntent, validateDisplayName, validatePassword,
} from './join'

beforeEach(() => localStorage.clear())

describe('join intent', () => {
  it('round-trips through storage and clears', () => {
    saveJoinIntent({ code: 'TOKYO-DEV', displayName: 'Casey' })
    expect(readJoinIntent()).toEqual({ code: 'TOKYO-DEV', displayName: 'Casey' })
    clearJoinIntent()
    expect(readJoinIntent()).toBeNull()
  })

  it('ignores corrupt or foreign values', () => {
    localStorage.setItem('tabi.join', '{not json')
    expect(readJoinIntent()).toBeNull()
    localStorage.setItem('tabi.join', JSON.stringify({ code: 42 }))
    expect(readJoinIntent()).toBeNull()
    localStorage.setItem('tabi.join', JSON.stringify({ code: 'X', displayName: 7 }))
    expect(readJoinIntent()).toEqual({ code: 'X', displayName: undefined })
  })
})

describe('accessFor', () => {
  const base = { authLoading: false, hasSession: true, profileLoading: false, hasProfile: true }
  it('walks loading → signed-out → needs-join → member', () => {
    expect(accessFor({ ...base, authLoading: true })).toBe('loading')
    expect(accessFor({ ...base, hasSession: false })).toBe('signed-out')
    expect(accessFor({ ...base, profileLoading: true })).toBe('loading')
    expect(accessFor({ ...base, hasProfile: false })).toBe('needs-join')
    expect(accessFor(base)).toBe('member')
  })
  it('a returning user with a saved session goes straight in', () => {
    expect(accessFor({ authLoading: false, hasSession: true, profileLoading: false, hasProfile: true })).toBe('member')
  })
})

describe('autoJoinArgs', () => {
  it('joins automatically when code and name are known', () => {
    expect(autoJoinArgs({ code: ' TOKYO-DEV ', displayName: ' Casey ' }, undefined)).toEqual({ code: 'TOKYO-DEV', displayName: 'Casey' })
  })
  it('falls back to the name saved at sign-up (email confirmation round trip)', () => {
    expect(autoJoinArgs({ code: 'TOKYO-DEV' }, 'Riley')).toEqual({ code: 'TOKYO-DEV', displayName: 'Riley' })
  })
  it('asks when anything is missing', () => {
    expect(autoJoinArgs(null, 'Riley')).toBeNull()
    expect(autoJoinArgs({ code: 'TOKYO-DEV' }, undefined)).toBeNull()
    expect(autoJoinArgs({ code: '  ', displayName: 'Jamie' }, undefined)).toBeNull()
  })
})

describe('validation', () => {
  it('display names', () => {
    expect(validateDisplayName('  ')).toMatch(/enter/i)
    expect(validateDisplayName('x'.repeat(41))).toMatch(/40/)
    expect(validateDisplayName(' Morgan ')).toBeNull()
  })
  it('passwords', () => {
    expect(validatePassword('short')).toMatch(/8/)
    expect(validatePassword('long-enough')).toBeNull()
  })
})

describe('friendlyError', () => {
  it.each([
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, /don't match/],
    [{ code: 'user_already_exists', message: 'User already registered' }, /sign in instead/],
    [{ code: 'email_not_confirmed' }, /confirm your email/],
    [{ code: '42501', message: 'That family code is not valid' }, /family code doesn't match/],
    [{ code: '42501', message: 'Admin only' }, /permission/],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, /connection/],
    [{ code: 'same_password', message: 'New password should be different' }, /already your password/],
    [{ code: 'reauthentication_needed' }, /sign back in/],
  ])('%o', (error, expected) => {
    expect(friendlyError(error)).toMatch(expected)
  })
  it('falls back to the server message', () => {
    expect(friendlyError({ message: 'Something odd' })).toBe('Something odd')
    expect(friendlyError(null)).toBe('')
  })
})

it('spots the hidden "email already registered" sign-up response', () => {
  expect(isExistingAccountSignup({ identities: [] })).toBe(true)
  expect(isExistingAccountSignup({ identities: [{}] })).toBe(false)
  expect(isExistingAccountSignup(null)).toBe(false)
})
