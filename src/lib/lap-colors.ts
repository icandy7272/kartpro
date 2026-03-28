export const LAP_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

/**
 * Get a consistent color for a lap based on its position in the selected list.
 * Fastest lap always gets red (#ef4444).
 */
export function getLapColor(lapId: number, selectedLapIds: number[], fastestLapId: number): string {
  if (lapId === fastestLapId) return LAP_COLORS[0] // red for fastest

  // Non-fastest laps get colors by their order in the selected list (skipping red)
  const nonFastestSelected = selectedLapIds.filter(id => id !== fastestLapId)
  const idx = nonFastestSelected.indexOf(lapId)
  if (idx === -1) return LAP_COLORS[1]
  return LAP_COLORS[(idx % (LAP_COLORS.length - 1)) + 1]
}
