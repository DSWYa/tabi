import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { CACHE_MAX_AGE, persistOptions } from './lib/queryPersist'
import { ThemeProvider } from './lib/theme'
import './index.css'

// After a deploy, a tab that was already open still asks for the old lazy chunks (map, whiteboard), which no longer
// exist. Reload once to pick up the new build; the flag stops a reload loop if the files really are unreachable.
const RELOAD_FLAG = 'tabi.reloadedForChunk'
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})
setTimeout(() => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    // storage unavailable — nothing to clear
  }
}, 10_000)

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime ≥ the persisted cache's max age, or restored-but-unused queries would be dropped before they're needed.
    queries: { staleTime: 30_000, gcTime: CACHE_MAX_AGE, retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Restores the last cached data from IndexedDB before queries run, so the app opens offline. */}
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
