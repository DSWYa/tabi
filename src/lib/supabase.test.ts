import { normalizeSupabaseUrl } from './supabase'

describe('normalizeSupabaseUrl', () => {
  it.each([
    ['https://abc.supabase.co', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1', 'https://abc.supabase.co'],
    ['  https://abc.supabase.co  ', 'https://abc.supabase.co'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
  ])('%s → %s', (input, expected) => expect(normalizeSupabaseUrl(input)).toBe(expected))

  it('treats a missing or blank value as not configured', () => {
    expect(normalizeSupabaseUrl(undefined)).toBeUndefined()
    expect(normalizeSupabaseUrl('   ')).toBeUndefined()
  })
})
