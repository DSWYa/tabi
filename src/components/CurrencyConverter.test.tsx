import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurrencyConverter } from './CurrencyConverter'

const fx = vi.hoisted(() => ({ rate: null as null | { usdPerJpy: number; date: string; fetchedAt: number } }))

vi.mock('@/lib/fx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fx')>()),
  useFxRate: () => fx.rate,
}))

beforeEach(() => {
  fx.rate = { usdPerJpy: 0.0067, date: '2026-10-07', fetchedAt: Date.now() }
})

it('starts with ¥1,000 in dollars and shows the rate', () => {
  render(<CurrencyConverter />)
  expect(screen.getByLabelText('Japanese yen')).toHaveValue('1,000')
  expect(screen.getByLabelText('US dollars')).toHaveValue('6.70')
  expect(screen.getByText(/\$1 ≈ ¥149 · rate from Oct 7/)).toBeInTheDocument()
})

it('converts yen to dollars as you type', async () => {
  const user = userEvent.setup()
  render(<CurrencyConverter />)
  await user.clear(screen.getByLabelText('Japanese yen'))
  await user.type(screen.getByLabelText('Japanese yen'), '25000')
  expect(screen.getByLabelText('US dollars')).toHaveValue('167.50')
  expect(screen.getByRole('status')).toHaveTextContent('¥25,000 is about $167.50')
})

it('converts dollars to yen as you type', async () => {
  const user = userEvent.setup()
  render(<CurrencyConverter />)
  await user.clear(screen.getByLabelText('US dollars'))
  await user.type(screen.getByLabelText('US dollars'), '20')
  expect(screen.getByLabelText('Japanese yen')).toHaveValue('2,985')
})

it('leaves the other box empty for something that isn\'t an amount', async () => {
  const user = userEvent.setup()
  render(<CurrencyConverter />)
  await user.clear(screen.getByLabelText('Japanese yen'))
  await user.type(screen.getByLabelText('Japanese yen'), 'abc')
  expect(screen.getByLabelText('US dollars')).toHaveValue('')
})

it('waits for a rate before converting', () => {
  fx.rate = null
  render(<CurrencyConverter />)
  expect(screen.getByLabelText('US dollars')).toBeDisabled()
  expect(screen.getByText(/loads the first time you’re online/)).toBeInTheDocument()
})
