// Bib colours a manager can assign to teams. `key` maps to the `colors`
// translation namespace; `emoji` makes the colour obvious in WhatsApp.
export const BIB_COLORS = [
  { hex: '#EF4444', key: 'red',    emoji: '🔴' },
  { hex: '#EAB308', key: 'yellow', emoji: '🟡' },
  { hex: '#3B82F6', key: 'blue',   emoji: '🔵' },
  { hex: '#22C55E', key: 'green',  emoji: '🟢' },
  { hex: '#F5F5F5', key: 'white',  emoji: '⚪' },
  { hex: '#3F3F46', key: 'black',  emoji: '⚫' },
  { hex: '#F97316', key: 'orange', emoji: '🟠' },
  { hex: '#EC4899', key: 'pink',   emoji: '🩷' },
] as const

export type BibColor = (typeof BIB_COLORS)[number]

export function findBibColor(hex: string | null | undefined): BibColor | null {
  if (!hex) return null
  return BIB_COLORS.find(c => c.hex.toLowerCase() === hex.toLowerCase()) ?? null
}
