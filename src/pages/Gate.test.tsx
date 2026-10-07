import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readJoinIntent } from '@/lib/join'
import Gate from './Gate'

const api = vi.hoisted(() => ({
  rpc: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: api.rpc,
    auth: { signUp: api.signUp, signInWithPassword: api.signInWithPassword, resetPasswordForEmail: api.resetPasswordForEmail },
  },
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

async function enterCode(code: string, valid: boolean) {
  api.rpc.mockResolvedValueOnce({ data: valid, error: null })
  const user = userEvent.setup()
  render(<Gate />)
  await user.type(screen.getByLabelText(/family code/i), code)
  await user.click(screen.getByRole('button', { name: /continue/i }))
  return user
}

async function fillSignUp(user: ReturnType<typeof userEvent.setup>, name: string, email: string, password: string) {
  if (name) await user.type(await screen.findByLabelText(/your name/i), name)
  await user.type(await screen.findByLabelText(/^email/i), email)
  await user.type(screen.getByLabelText(/^password/i), password)
  await user.click(screen.getByRole('button', { name: /create account/i }))
}

it('rejects a wrong family code without revealing anything', async () => {
  await enterCode('nope', false)
  expect(api.rpc).toHaveBeenCalledWith('check_family_code', { code: 'nope' })
  expect(await screen.findByText(/doesn.t work/i)).toBeInTheDocument()
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
})

it('code → sign up remembers the code and name for join_family', async () => {
  const user = await enterCode('TOKYO-DEV', true)
  expect(await screen.findByText(/family code accepted/i)).toBeInTheDocument()
  api.signUp.mockResolvedValueOnce({ data: { user: { identities: [{}] }, session: { access_token: 'x' } }, error: null })

  await fillSignUp(user, ' Casey ', 'casey@example.com', 'long-enough-pw')

  expect(api.signUp).toHaveBeenCalledWith(expect.objectContaining({
    email: 'casey@example.com',
    password: 'long-enough-pw',
    options: expect.objectContaining({ data: { display_name: 'Casey' } }),
  }))
  // <JoinFamily> picks this up as soon as the session exists.
  expect(readJoinIntent()).toEqual({ code: 'TOKYO-DEV', displayName: 'Casey' })
})

it('validates name and password before calling the server', async () => {
  const user = await enterCode('TOKYO-DEV', true)
  await fillSignUp(user, '', 'a@b.co', 'short')
  expect(screen.getByText(/enter the name/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/^password/i)).toHaveAttribute('aria-invalid', 'true')
  expect(api.signUp).not.toHaveBeenCalled()
})

it('asks to confirm the email when the server requires it', async () => {
  const user = await enterCode('TOKYO-DEV', true)
  api.signUp.mockResolvedValueOnce({ data: { user: { identities: [{}] }, session: null }, error: null })
  await fillSignUp(user, 'Riley', 'riley@example.com', 'long-enough-pw')
  expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
  expect(screen.getByText('riley@example.com')).toBeInTheDocument()
})

it('sends an existing account to sign in, keeping the code', async () => {
  const user = await enterCode('TOKYO-DEV', true)
  api.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'User already registered' } })
  await fillSignUp(user, 'Jamie', 'jamie@example.com', 'long-enough-pw')

  expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  expect(screen.getByText(/already has an account/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/^email/i)).toHaveValue('jamie@example.com')

  api.signInWithPassword.mockResolvedValueOnce({ data: {}, error: null })
  await user.type(screen.getByLabelText(/^password/i), 'long-enough-pw')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
  expect(api.signInWithPassword).toHaveBeenCalledWith({ email: 'jamie@example.com', password: 'long-enough-pw' })
  expect(readJoinIntent()?.code).toBe('TOKYO-DEV')
})

it('returning members can sign in without the code and see friendly errors', async () => {
  const user = userEvent.setup()
  render(<Gate />)
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
  api.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
  await user.type(screen.getByLabelText(/^email/i), 'morgan@example.com')
  await user.type(screen.getByLabelText(/^password/i), 'wrong-password')
  await user.click(screen.getByRole('button', { name: /^sign in$/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/don.t match/i)
  expect(readJoinIntent()).toBeNull()
})

it('sends a password reset link without saying whether the account exists', async () => {
  api.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null })
  const user = userEvent.setup()
  render(<Gate />)
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  await user.click(screen.getByRole('button', { name: /forgot password/i }))
  await user.type(screen.getByLabelText(/^email/i), ' casey@example.com ')
  await user.click(screen.getByRole('button', { name: /send reset link/i }))

  expect(api.resetPasswordForEmail).toHaveBeenCalledWith('casey@example.com', { redirectTo: expect.stringMatching(/^http/) })
  expect(await screen.findByRole('status')).toHaveTextContent(/if casey@example.com has a tabi account/i)
  await user.click(screen.getByRole('button', { name: /back to sign in/i }))
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
})
