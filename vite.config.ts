/// <reference types="vitest/config" />
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Self-host Excalidraw's fonts (otherwise it fetches them from esm.sh): copied into the build as
 * `excalidraw-assets/fonts/…`. In dev the whiteboard points at node_modules directly (see pages/Whiteboard.tsx).
 */
function excalidrawFonts(): Plugin {
  const source = fileURLToPath(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url))
  return {
    name: 'tabi-excalidraw-fonts',
    apply: 'build',
    writeBundle(options) {
      if (options.dir) cpSync(source, join(options.dir, 'excalidraw-assets', 'fonts'), { recursive: true })
    },
  }
}

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/tabi/"). Local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), excalidrawFonts()],
  // Main chunk is React + Supabase + router + pages (~170 kB gzip after Phase 4). Map/Leaflet and the whiteboard are
  // lazy chunks: Excalidraw is ~1.1 MB raw (365 kB gzip) plus a ~1.8 MB font-subsetting worker only used on export,
  // hence the high limit. Check the main chunk's size in the build output at the end of each phase.
  build: { chunkSizeWarningLimit: 2000 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
