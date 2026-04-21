export type LeafletFitBoundsPadding = [number, number]

interface LeafletViewportSize {
  x: number
  y: number
}

interface LeafletViewportContainer {
  clientHeight?: number
  clientWidth?: number
  getBoundingClientRect?: () => { height?: number; width?: number }
}

export function resolveLeafletViewportSize(
  size: LeafletViewportSize | null | undefined,
  container?: LeafletViewportContainer | null
): LeafletViewportSize {
  const rect = container?.getBoundingClientRect?.()
  const width = Math.round(rect?.width ?? 0) || container?.clientWidth || size?.x || 0
  const height = Math.round(rect?.height ?? 0) || container?.clientHeight || size?.y || 0

  return { x: width, y: height }
}

export function resolveLeafletFitBoundsPadding(
  size: LeafletViewportSize | null | undefined,
  fallbackPadding: LeafletFitBoundsPadding,
  paddingRatio?: number
): LeafletFitBoundsPadding {
  if (paddingRatio == null || paddingRatio <= 0) {
    return fallbackPadding
  }

  const width = size?.x ?? 0
  const height = size?.y ?? 0

  if (width <= 0 || height <= 0) {
    return fallbackPadding
  }

  return [Math.round(width * paddingRatio), Math.round(height * paddingRatio)]
}
