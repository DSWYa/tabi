import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '@/lib/auth'
import { readJoinIntent, saveJoinIntent } from '@/lib/join'
import { ThemeProvider } from '@/lib/theme'
import JoinFamily from './JoinFamily'

const api = vi.hoisted(() => ({ rpc: vi.fn(), metadata: {} as Record<string, unknown> }))

vi.mock('@/lib/supabase', () => {
  const session = () => ({ user: { id: 'u1', email: 'casey@example.com', user_metadata: api.metadata } })
  return {
    isSupabaseConfigured: true,
    supabase: {
      rpc: api.rpc,
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
      auth: {
        getSession: async () => ({ data: { session: session() } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({ error: null }),
      },
    },
  }
})

// <JoinFamily> only renders once a session exists; mimic that.
function Ready() {
  const { session } = useAuth()
  return session ? <JoinFamily /> : null
}

function renderJoin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>
          <Ready />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  api.metadata = {}
})

it('joins automatically right after sign-up', async () => {
  saveJoinIntent({ code: 'TOKYO-DEV', displayName: 'Casey' })
  api.rpc.mockResolvedValueOnce({ data: { id: 'u1' }, error: null })
  renderJoin()
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith('join_family', { code: 'TOKYO-DEV', display_name: 'Casey' }))
  await waitFor(() => expect(readJoinIntent()).toBeNull())
  expect(api.rpc).toHaveBeenCalledTimes(1)
})

it('uses the name saved at sign-up after the email confirmation round trip', async () => {
  saveJoinIntent({ code: 'TOKYO-DEV' })
  api.metadata = { display_name: 'Riley' }
  api.rpc.mockResolvedValueOnce({ data: { id: 'u1' }, error: null })
  renderJoin()
  await waitFor(() => expect(api.rpc).toHaveBeenCalledWith('join_family', { code: 'TOKYO-DEV', display_name: 'Riley' }))
})

it('asks for the code when it is unknown, and explains a bad one', async () => {
  api.metadata = { display_name: 'Jamie' }
  renderJoin()
  const user = userEvent.setup()
  const code = await screen.findByLabelText(/family code/i)
  expect(screen.getByLabelText(/your name/i)).toHaveValue('Jamie')
  expect(api.rpc).not.toHaveBeenCalled()

  api.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'That family code is not valid' } })
  await user.type(code, 'OLD-CODE')
  await user.click(screen.getByRole('button', { name: /^join$/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/doesn.t match/i)
  expect(screen.getByText('casey@example.com')).toBeInTheDocument()
})
