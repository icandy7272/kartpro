import type { MapMode } from './map-modes'

export interface MapTileConfig {
  attribution: string
  maxZoom?: number
  subdomains?: string[]
  url: string
}

export interface LeafletTileLayerProps {
  attribution: string
  maxZoom?: number
  subdomains?: string[]
  url: string
}

export type MapModeProvider =
  | {
      kind: 'leaflet-raster'
      tileConfig: MapTileConfig
    }
  | {
      kind: 'amap-jsapi'
      key: string
    }

export const MAP_TILE_CONFIG_BY_MODE: Record<MapMode, MapTileConfig> = {
  align: {
    attribution:
      '&copy; <a href="https://www.esri.com/">Esri</a> & contributors',
    maxZoom: 19,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
  training: {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: ['a', 'b', 'c', 'd'],
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  },
  satellite: {
    attribution:
      '&copy; <a href="https://www.esri.com/">Esri</a> & contributors',
    maxZoom: 19,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
}

export function getLeafletTileLayerProps(config: MapTileConfig): LeafletTileLayerProps {
  const props: LeafletTileLayerProps = {
    attribution: config.attribution,
    url: config.url,
  }

  if (config.maxZoom !== undefined) {
    props.maxZoom = config.maxZoom
  }

  if (config.subdomains !== undefined) {
    props.subdomains = config.subdomains
  }

  return props
}

export function resolveMapModeProvider(
  mode: MapMode,
  options?: { amapJsApiKey?: string | null }
): MapModeProvider {
  if (mode === 'satellite' && options?.amapJsApiKey) {
    return {
      kind: 'amap-jsapi',
      key: options.amapJsApiKey,
    }
  }

  return {
    kind: 'leaflet-raster',
    tileConfig: MAP_TILE_CONFIG_BY_MODE[mode],
  }
}
