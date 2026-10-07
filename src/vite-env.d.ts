/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface Window {
  /** Where Excalidraw loads its fonts from (set by the whiteboard page; self-hosted). */
  EXCALIDRAW_ASSET_PATH?: string | string[]
}
