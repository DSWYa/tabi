import { act, render, screen } from '@testing-library/react'
import { resolveTheme, ThemeProvider, useTheme } from './theme'

it('resolves system preference', () => {
  expect(resolveTheme('system', true)).toBe('dark')
  expect(resolveTheme('system', false)).toBe('light')
  expect(resolveTheme('light', true)).toBe('light')
})

function Probe() {
  const { resolved, setPreference } = useTheme()
  return <button onClick={() => setPreference('dark')}>{resolved}</button>
}

it('applies and persists the chosen theme', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>)
  act(() => screen.getByRole('button').click())
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('tabi.theme')).toBe('dark')
})
