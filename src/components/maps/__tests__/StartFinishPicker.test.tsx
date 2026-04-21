import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StartFinishPicker from '../../StartFinishPicker'
import { MAP_TILE_CONFIG_BY_MODE } from '../../../lib/map/map-tile-config'

type MockAmapProps = {
  htmlMarkers?: Array<{ id: string; includeInFit?: boolean }>
  polylines?: Array<{ id: string; includeInFit?: boolean }>
  fitViewMaxZoom?: number
  fitViewPaddingRatio?: number
  fitViewPadding?: [number, number, number, number]
  satelliteCalibration?: { eastMeters: number; northMeters: number }
}

let latestAmapProps: MockAmapProps | null = null
const fitBoundsMock = vi.fn()
const leafletContainerMock = {
  clientWidth: 1000,
  clientHeight: 800,
  getBoundingClientRect: () => ({ width: 1000, height: 800 }),
}

function currentAmapProps(): MockAmapProps {
  if (!latestAmapProps) {
    throw new Error('Expected AMap props to be captured')
  }

  return latestAmapProps
}

vi.mock('../AmapSatelliteMap', () => ({
  default: (props: MockAmapProps) => {
    latestAmapProps = props
    return <div data-testid="amap-satellite-map" />
  },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  Marker: () => <div data-testid="marker" />,
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
  Polyline: ({ positions }: { positions: Array<[number, number]> }) => (
    <div data-testid="polyline" data-positions={JSON.stringify(positions)} />
  ),
  TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
  useMap: () => ({
    fitBounds: fitBoundsMock,
    getContainer: () => leafletContainerMock,
    getSize: () => ({ x: 0, y: 0 }),
  }),
  useMapEvents: () => null,
}))

describe('StartFinishPicker shared map modes', () => {
  const points = [
    { lat: 31.279, lng: 121.493, speed: 20, time: 0, altitude: 5 },
    { lat: 31.28, lng: 121.494, speed: 22, time: 100, altitude: 5 },
    { lat: 31.281, lng: 121.495, speed: 24, time: 200, altitude: 5 },
  ]

  it('defaults to satellite mode and keeps manual start-finish workflow available after switching modes', () => {
    latestAmapProps = null
    fitBoundsMock.mockClear()
    render(
      <StartFinishPicker
        autoDetected={{ lat1: 31.279, lng1: 121.493, lat2: 31.28, lng2: 121.494 }}
        onConfirm={vi.fn()}
        points={points}
      />
    )

    expect(screen.getByRole('button', { name: '卫星模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('amap-satellite-map')).toBeInTheDocument()
    expect(screen.queryByTestId('alignment-pane')).not.toBeInTheDocument()
    expect(currentAmapProps().satelliteCalibration).toEqual({ eastMeters: 0, northMeters: -3 })
    expect(currentAmapProps().fitViewPaddingRatio).toBe(0.075)
    expect(currentAmapProps().fitViewMaxZoom).toBe(20)
    expect(currentAmapProps().htmlMarkers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'auto-start', includeInFit: false }),
        expect.objectContaining({ id: 'auto-end', includeInFit: false }),
      ])
    )
    expect(currentAmapProps().polylines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'start-finish-line', includeInFit: false }),
      ])
    )
    expect(screen.getByRole('button', { name: '展开卫星微调' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '向北微调' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '对齐模式' }))

    expect(screen.getByRole('button', { name: '对齐模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tile-layer')).toHaveAttribute(
      'data-url',
      MAP_TILE_CONFIG_BY_MODE.align.url
    )
    expect(screen.getByTestId('alignment-pane')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '卫星模式' }))

    expect(screen.getByRole('button', { name: '卫星模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('amap-satellite-map')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开卫星微调' }))

    expect(screen.getByRole('button', { name: '向北微调' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '手动标记' }))

    expect(screen.getByText('点击地图放置第 1 个点（共 2 个）')).toBeInTheDocument()
  })

  it('uses ratio-based fit padding for align and training modes so the trajectory fills the leaflet viewport', () => {
    latestAmapProps = null
    fitBoundsMock.mockClear()
    render(
      <StartFinishPicker
        autoDetected={{ lat1: 31.279, lng1: 121.493, lat2: 31.28, lng2: 121.494 }}
        onConfirm={vi.fn()}
        points={points}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '对齐模式' }))

    expect(fitBoundsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [75, 60] })
    )

    fitBoundsMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '卫星模式' }))
    fireEvent.click(screen.getByRole('button', { name: '训练模式' }))

    expect(fitBoundsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [75, 60] })
    )
  })
})
