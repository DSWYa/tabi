import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinColorPicker } from './PinColorPicker'

type Member = { id: string; display_name: string; pin_color: string | null }

const state = vi.hoisted(() => ({
  members: [] as Member[],
  afterRefetch: [] as Member[],
  mutateAsync: vi.fn(),
}))

vi.mock('@/lib/members', () => ({
  useMe: () => ({
    data: state.members,
    me: state.members.find((m) => m.id === 'me') ?? null,
    refetch: async () => ({ data: state.afterRefetch }),
  }),
  useUpdateMyProfile: () => ({ mutateAsync: state.mutateAsync }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.members = [
    { id: 'me', display_name: 'Morgan', pin_color: 'tangerine' },
    { id: 'r', display_name: 'Riley', pin_color: 'violet' },
    { id: 'c', display_name: 'Casey', pin_color: null },
  ]
  state.afterRefetch = state.members
})

it('shows taken colors disabled and labelled with the owner', async () => {
  render(<PinColorPicker />)
  const violet = screen.getByRole('radio', { name: /violet — taken by riley/i })
  expect(violet).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('radio', { name: /tangerine — yours/i })).toHaveAttribute('aria-checked', 'true')

  await userEvent.click(violet)
  expect(state.mutateAsync).not.toHaveBeenCalled()
})

it('claims a free color', async () => {
  state.mutateAsync.mockResolvedValueOnce(undefined)
  render(<PinColorPicker />)
  await userEvent.click(screen.getByRole('radio', { name: /sky — available/i }))
  expect(state.mutateAsync).toHaveBeenCalledWith({ pin_color: 'sky' })
  expect(await screen.findByRole('status')).toHaveTextContent(/sky is yours/i)
})

it('explains kindly when someone grabbed the same color a moment earlier', async () => {
  state.mutateAsync.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint' })
  state.afterRefetch = state.members.map((m) => (m.id === 'c' ? { ...m, pin_color: 'sky' } : m))
  render(<PinColorPicker />)
  await userEvent.click(screen.getByRole('radio', { name: /sky — available/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Casey grabbed Sky a moment before you did — pick another color.')
})
