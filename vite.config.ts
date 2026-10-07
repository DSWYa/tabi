/// <reference types="vitest/config" />
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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

/**
 * The JS/CSS the app itself can reach: the entry plus our own lazy routes/components (map, whiteboard, pin picker…)
 * and everything they import statically. Excalidraw's optional extras (Mermaid, KaTeX, export worker — several MB)
 * are left out of the precache and cached the first time they're used instead.
 */
function appShellChunks(): { plugin: Plugin; files: Set<string> } {
  const files = new Set<string>()
  const plugin: Plugin = {
    name: 'tabi-app-shell-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      files.clear()
      const chunks = new Map(
        Object.values(bundle).flatMap((item) => (item.type === 'chunk' ? [[item.fileName, item] as const] : [])),
      )
      const ours = (id: string | null) => Boolean(id && /\/src\//.test(id) && !id.includes('node_modules'))
      const queue = [...chunks.values()].filter((c) => c.isEntry || (c.isDynamicEntry && ours(c.facadeModuleId)))
      while (queue.length) {
        const chunk = queue.pop()!
        if (files.has(chunk.fileName)) continue
        files.add(chunk.fileName)
        for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(css)
        for (const dep of chunk.imports) {
          const next = chunks.get(dep)
          if (next) queue.push(next)
        }
        // Our own lazy imports (routes, the pin picker) — not Excalidraw's internal ones.
        for (const dep of chunk.dynamicImports) {
          const next = chunks.get(dep)
          if (next && ours(next.facadeModuleId)) queue.push(next)
        }
      }
    },
  }
  return { plugin, files }
}

/**
 * Installable PWA. The service worker precaches the app shell (HTML, JS, CSS, icons, the Latin Excalidraw fonts) so
 * the app opens offline; data comes from the TanStack Query cache persisted in IndexedDB (src/lib/queryPersist.ts),
 * never from the service worker. Everything is relative to Vite's `base`, so it works under the Pages subpath.
 */
function pwa(shell: Set<string>) {
  return VitePWA({
    // We show our own "New version — reload" banner (UpdatePrompt) instead of reloading under someone's fingers.
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      name: 'Tabi — Family Trip Planner',
      short_name: 'Tabi',
      description: 'Our private family trip planner.',
      lang: 'en',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#FBF6EE',
      theme_color: '#F28A3C',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'excalidraw-assets/fonts/{Assistant,Cascadia,ComicShanns,Excalifont,Liberation,Lilita,Nunito,Virgil}/*'],
      // The CJK font (~13 MB of subsets) and Excalidraw's export-only font-subsetting worker are fetched on demand.
      globIgnores: ['excalidraw-assets/fonts/Xiaolai/**', '**/subset-worker*.js', '**/subset-shared*.js'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      manifestTransforms: [
        async (entries) => ({
          manifest: entries.filter((e) => !/(^|\/)assets\/[^/]+\.(js|css)$/.test(e.url) || shell.has(e.url.replace(/^.*?(assets\/)/, '$1'))),
          warnings: [],
        }),
      ],
      // Hash routing: every navigation (incl. email links that come back as `?code=…`) is index.html.
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // CJK whiteboard font subsets and anything else Excalidraw loads lazily from our own origin.
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/excalidraw-assets/'),
          handler: 'CacheFirst',
          options: { cacheName: 'tabi-excalidraw', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 } },
        },
        {
          // Lazy chunks Workbox didn't precache (export worker).
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/assets/'),
          handler: 'CacheFirst',
          options: { cacheName: 'tabi-assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
        },
        {
          // Avatars and whiteboard images: unguessable, never rewritten paths, so cache-first is safe.
          urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'tabi-images',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
          },
        },
        {
          // Map tiles you've already looked at stay viewable offline (OSM's policy allows caching tiles).
          urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'tabi-tiles',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 },
          },
        },
      ],
    },
  })
}

const shell = appShellChunks()

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/tabi/"). Local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), excalidrawFonts(), shell.plugin, pwa(shell.files)],
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
