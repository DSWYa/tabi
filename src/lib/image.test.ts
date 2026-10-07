import { checkAvatarFile, squareCrop } from './image'

it('rejects non-images and files over 10 MB before processing', () => {
  expect(checkAvatarFile({ type: 'application/pdf', size: 1000 })).toMatch(/isn't an image/)
  expect(checkAvatarFile({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })).toMatch(/10\.0 MB.*limit is 10 MB/)
  expect(checkAvatarFile({ type: 'image/png', size: 6 * 1024 * 1024 })).toBeNull() // a typical phone photo
})

it('center-crops to a square', () => {
  expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 })
  expect(squareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 })
})
