import { describe, expect, it } from 'vitest'
import {
  getLeafletTileLayerProps,
  MAP_TILE_CONFIG_BY_MODE,
  resolveMapModeProvider,
} from '../map-tile-config'

describe('getLeafletTileLayerProps', () => {
  it('omits undefined optional props so Leaflet does not crash on non-training modes', () => {
    const alignProps = getLeafletTileLayerProps(MAP_TILE_CONFIG_BY_MODE.align)
    const satelliteProps = getLeafletTileLayerProps(MAP_TILE_CONFIG_BY_MODE.satellite)

    expect(alignProps).not.toHaveProperty('subdomains')
    expect(satelliteProps).not.toHaveProperty('subdomains')
    expect(alignProps).not.toHaveProperty('maxZoom', undefined)
    expect(satelliteProps).not.toHaveProperty('maxZoom', undefined)
  })

  it('preserves subdomains for training mode tiles', () => {
    const trainingProps = getLeafletTileLayerProps(MAP_TILE_CONFIG_BY_MODE.training)

    expect(trainingProps).toHaveProperty('subdomains', ['a', 'b', 'c', 'd'])
  })
})

describe('resolveMapModeProvider', () => {
  it('uses the AMap JSAPI provider for satellite mode when a key is configured', () => {
    expect(resolveMapModeProvider('satellite', { amapJsApiKey: 'demo-key' })).toEqual({
      key: 'demo-key',
      kind: 'amap-jsapi',
    })
  })

  it('falls back to the shared raster provider when satellite mode has no AMap key', () => {
    expect(resolveMapModeProvider('satellite')).toEqual({
      kind: 'leaflet-raster',
      tileConfig: MAP_TILE_CONFIG_BY_MODE.satellite,
    })
  })

  it('keeps align and training modes on the shared Leaflet provider path', () => {
    expect(resolveMapModeProvider('align', { amapJsApiKey: 'demo-key' })).toEqual({
      kind: 'leaflet-raster',
      tileConfig: MAP_TILE_CONFIG_BY_MODE.align,
    })

    expect(resolveMapModeProvider('training', { amapJsApiKey: 'demo-key' })).toEqual({
      kind: 'leaflet-raster',
      tileConfig: MAP_TILE_CONFIG_BY_MODE.training,
    })
  })
})
