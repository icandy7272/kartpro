import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TrackAlignmentLayer from '../TrackAlignmentLayer'

vi.mock('react-leaflet', () => ({
  Pane: ({
    children,
    name,
    style,
  }: {
    children: React.ReactNode
    name: string
    style?: { zIndex?: number }
  }) => (
    <div data-testid="alignment-pane" data-name={name} data-z-index={String(style?.zIndex ?? '')}>
      {children}
    </div>
  ),
  Polyline: ({
    pathOptions,
    positions,
  }: {
    pathOptions?: { opacity?: number; weight?: number }
    positions: Array<[number, number]>
  }) => (
    <div
      data-testid="alignment-line"
      data-opacity={String(pathOptions?.opacity ?? '')}
      data-positions={JSON.stringify(positions)}
      data-weight={String(pathOptions?.weight ?? '')}
    />
  ),
}))

describe('TrackAlignmentLayer', () => {
  const points = [
    { lat: 31.279, lng: 121.493, speed: 10, time: 0, altitude: 5 },
    { lat: 31.280, lng: 121.494, speed: 11, time: 100, altitude: 5 },
    { lat: 31.281, lng: 121.495, speed: 12, time: 200, altitude: 5 },
  ]

  it('renders only in align mode and keeps a lower visual layer than the main racing line', () => {
    const { rerender } = render(<TrackAlignmentLayer mode="training" points={points} />)

    expect(screen.queryByTestId('alignment-pane')).not.toBeInTheDocument()

    rerender(<TrackAlignmentLayer mode="align" points={points} />)

    const pane = screen.getByTestId('alignment-pane')
    const lines = screen.getAllByTestId('alignment-line')

    expect(pane).toHaveAttribute('data-z-index', '350')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute(
      'data-positions',
      JSON.stringify([
        [31.279, 121.493],
        [31.28, 121.494],
        [31.281, 121.495],
      ])
    )
    expect(Number(lines[0].getAttribute('data-opacity'))).toBeLessThan(0.5)
  })
})
