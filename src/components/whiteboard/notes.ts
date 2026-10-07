// Sticky-note colors (whiteboard content, not UI chrome — these stay the same in light and dark mode,
// like Excalidraw's own palette).
export const NOTE_COLORS = [
  { key: 'yellow', label: 'Yellow', fill: '#ffec99' },
  { key: 'pink', label: 'Pink', fill: '#fcc2d7' },
  { key: 'blue', label: 'Blue', fill: '#a5d8ff' },
  { key: 'green', label: 'Green', fill: '#b2f2bb' },
] as const
export type NoteColor = (typeof NOTE_COLORS)[number]['key']
