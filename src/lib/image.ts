import { LIMITS } from './constants'

export const AVATAR_PIXELS = 256
const ACCEPTED = /^image\//

/** Checks run *before* any processing. Returns a friendly problem, or null if the file is fine. */
export function checkAvatarFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ACCEPTED.test(file.type)) return 'That file isn\'t an image. Choose a JPG, PNG or WebP photo.'
  if (file.size > LIMITS.avatarSourceBytes) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `That photo is ${mb} MB — the limit is 10 MB. Try a smaller copy or a screenshot.`
  }
  return null
}

/** Center-crop rectangle that makes a w×h image square. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height)
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side }
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall back to <img> (older Safari)
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Resize + compress in the browser: square center crop, 256×256, WebP (JPEG where WebP encoding
 * isn't supported). A multi-MB phone photo becomes ~10–30 kB.
 */
export async function processAvatar(file: File): Promise<{ blob: Blob; ext: 'webp' | 'jpg' }> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    throw new Error('We couldn\'t read that image. Try a JPG or PNG.')
  }
  const { sx, sy, side } = squareCrop(source.width, source.height)
  const size = Math.min(AVATAR_PIXELS, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser can\'t process images here.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size)
  if ('close' in source) source.close()

  const webp = await toBlob(canvas, 'image/webp', 0.85)
  if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp' }
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85)
  if (!jpeg) throw new Error('We couldn\'t compress that image.')
  return { blob: jpeg, ext: 'jpg' }
}
