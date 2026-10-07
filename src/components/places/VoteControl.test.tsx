import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoteControl } from './VoteControl'

const state = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/lib/places', () => ({
  useCastVote: () => ({ mutate: state.mutate }),
  placeErrorMessage: (e: { message?: string }) => e.message ?? '',
}))

beforeEach(() => state.mutate.mockReset())

it('shows the current vote and changes it', async () => {
  render(<VoteControl placeId="p1" placeName="Shibuya Sky" myVote="maybe" />)
  expect(screen.getByRole('radiogroup', { name: 'Your vote on Shibuya Sky' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /maybe/i })).toHaveAttribute('aria-checked', 'true')

  await userEvent.click(screen.getByRole('radio', { name: /yes/i }))
  expect(state.mutate).toHaveBeenCalledWith({ placeId: 'p1', vote: 'yes' }, expect.anything())
})

it('withdraws the vote when the current choice is tapped again', async () => {
  render(<VoteControl placeId="p1" placeName="Shibuya Sky" myVote="no" />)
  await userEvent.click(screen.getByRole('radio', { name: /no/i }))
  expect(state.mutate).toHaveBeenCalledWith({ placeId: 'p1', vote: null }, expect.anything())
})

it('explains when voting has closed', async () => {
  state.mutate.mockImplementation((_vars: unknown, options?: { onError: (e: unknown) => void }) =>
    options?.onError({ message: 'Voting on this place has closed — the admin already decided.' }),
  )
  render(<VoteControl placeId="p1" placeName="Shibuya Sky" myVote={undefined} />)
  await userEvent.click(screen.getByRole('radio', { name: /yes/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Voting on this place has closed')
})
