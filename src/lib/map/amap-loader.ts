export interface AMapLngLatLike {
  getLat(): number
  getLng(): number
}

export interface AMapMouseEventLike {
  lnglat: AMapLngLatLike
}

export interface AMapConvertFromResult {
  info?: string
  locations?: AMapLngLatLike[]
}

export interface AMapMapInstance {
  add(overlays: unknown[] | unknown): void
  clearMap(): void
  destroy(): void
  off(eventName: string, handler: (event: AMapMouseEventLike) => void): void
  on(eventName: string, handler: (event: AMapMouseEventLike) => void): void
  setCenter(center: [number, number]): void
  setFitView(
    overlays?: unknown[],
    immediately?: boolean,
    avoid?: [number, number, number, number],
    maxZoom?: number
  ): void
}

export interface AMapNamespace {
  CircleMarker: new (options: Record<string, unknown>) => unknown
  convertFrom?: (
    lnglats: Array<[number, number]>,
    type: 'gps',
    callback: (status: string, result: AMapConvertFromResult) => void
  ) => void
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMapInstance
  Marker: new (options: Record<string, unknown>) => unknown
  Pixel: new (x: number, y: number) => unknown
  Polyline: new (options: Record<string, unknown>) => unknown
  Text: new (options: Record<string, unknown>) => unknown
  TileLayer: {
    Satellite: new () => unknown
  }
}

let amapLoaderPromise: Promise<AMapNamespace> | null = null

export function loadAmapJsApi(key: string): Promise<AMapNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('AMap JSAPI can only be loaded in the browser.'))
  }

  const existing = (window as typeof window & { AMap?: AMapNamespace }).AMap
  if (existing) {
    return Promise.resolve(existing)
  }

  if (amapLoaderPromise) {
    return amapLoaderPromise
  }

  amapLoaderPromise = new Promise<AMapNamespace>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.async = true

    script.onload = () => {
      const loadedAmap = (window as typeof window & { AMap?: AMapNamespace }).AMap
      if (!loadedAmap) {
        reject(new Error('AMap JSAPI loaded, but window.AMap is unavailable.'))
        return
      }
      resolve(loadedAmap)
    }

    script.onerror = () => {
      reject(new Error('Failed to load AMap JSAPI script.'))
    }

    document.head.appendChild(script)
  })

  return amapLoaderPromise
}
