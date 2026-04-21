import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TrackMap from '../../TrackMap'
import { MAP_TILE_CONFIG_BY_MODE } from '../../../lib/map/map-tile-config'

type MockAmapProps = {
  fitViewMaxZoom?: number
  fitViewPaddingRatio?: number
  fitViewPadding?: [number, number, number, number]
  htmlMarkers?: Array<{ draggable?: boolean; id: string; onDragEnd?: (lat: number, lng: number) => void }>
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
  CircleMarker: () => <div data-testid="circle-marker" />,
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

describe('TrackMap shared map modes', () => {
  const laps = [
    {
      id: 1,
      points: [
        { lat: 31.279, lng: 121.493, speed: 20, time: 0, altitude: 5 },
        { lat: 31.28, lng: 121.494, speed: 22, time: 100, altitude: 5 },
        { lat: 31.281, lng: 121.495, speed: 24, time: 200, altitude: 5 },
      ],
      startTime: 0,
      endTime: 200,
      duration: 61.417,
      distance: 1000,
      maxSpeed: 24,
      avgSpeed: 22,
    },
  ]

  it('defaults to satellite mode and still allows switching between all map modes', () => {
    latestAmapProps = null
    fitBoundsMock.mockClear()
    render(
      <TrackMap
        corners={[]}
        fastestLapId={1}
        laps={laps}
        selectedLapIds={[1]}
      />
    )

    expect(screen.getByRole('button', { name: '卫星模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('amap-satellite-map')).toBeInTheDocument()
    expect(currentAmapProps().satelliteCalibration).toEqual({ eastMeters: 0, northMeters: -3 })
    expect(screen.getByRole('button', { name: '展开卫星微调' })).toBeInTheDocument()
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '对齐模式' }))

    expect(screen.getByRole('button', { name: '对齐模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tile-layer')).toHaveAttribute(
      'data-url',
      MAP_TILE_CONFIG_BY_MODE.align.url
    )
    expect(screen.getByTestId('alignment-pane')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '训练模式' }))

    expect(screen.getByRole('button', { name: '训练模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tile-layer')).toHaveAttribute(
      'data-url',
      MAP_TILE_CONFIG_BY_MODE.training.url
    )
    expect(screen.queryByTestId('alignment-pane')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '卫星模式' }))

    expect(screen.getByRole('button', { name: '卫星模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('amap-satellite-map')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '向北微调' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开卫星微调' }))

    expect(screen.getByRole('button', { name: '向北微调' })).toBeInTheDocument()
  })

  it('passes draggable corner label markers to the satellite map', () => {
    latestAmapProps = null
    fitBoundsMock.mockClear()
    render(
      <TrackMap
        corners={[
          {
            angle: 80,
            apexIndex: 1,
            direction: 'left',
            duration: 1.2,
            endIndex: 2,
            entrySpeed: 40,
            exitSpeed: 44,
            id: 1,
            midpointIndex: 1,
            minSpeed: 32,
            name: 'T1',
            startIndex: 0,
            type: 'hairpin',
          },
        ]}
        fastestLapId={1}
        laps={laps}
        selectedLapIds={[1]}
      />
    )

    const cornerLabel = currentAmapProps().htmlMarkers?.find(
      (marker: { draggable?: boolean; id: string; onDragEnd?: (lat: number, lng: number) => void }) =>
        marker.id === 'corner-label-1'
    )
    expect(cornerLabel).toMatchObject({ draggable: true })
    expect(cornerLabel?.onDragEnd).toBeTypeOf('function')
  })

  it('uses a tighter satellite fit padding so the track fills more of the available map viewport', () => {
    latestAmapProps = null
    fitBoundsMock.mockClear()
    render(
      <TrackMap
        corners={[]}
        fastestLapId={1}
        laps={laps}
        selectedLapIds={[1]}
      />
    )

    expect(currentAmapProps().fitViewPaddingRatio).toBe(0.075)
    expect(currentAmapProps().fitViewMaxZoom).toBe(20)
  })

  it('uses ratio-based fit padding for align and training modes so the trajectory fills the leaflet viewport', () => {
    latestAmapProps = null
    fitBoundsMock.mockClear()
    render(
      <TrackMap
        corners={[]}
        fastestLapId={1}
        laps={laps}
        selectedLapIds={[1]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '对齐模式' }))

    expect(fitBoundsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [75, 60] })
    )

    fitBoundsMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '训练模式' }))

    expect(fitBoundsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [75, 60] })
    )
  })
})
