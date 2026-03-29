import gpmfExtract from 'gpmf-extract'
import goProTelemetry from 'gopro-telemetry'
import type { GPSPoint } from '../types'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function parseGeoJSONFile(file: File): Promise<GPSPoint[]> {
  const text = await file.text()
  const data = JSON.parse(text)

  // Support both single Feature (geometry.coordinates) and FeatureCollection (features[])
  let coords: number[][] | undefined
  let timestamps: number[] | undefined
  let relativeTimestamps: number[] | undefined
  let perPointSpeeds: number[] | undefined

  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    // First: check if any feature is a LineString (track data)
    const trackFeat = data.features.find((f: any) =>
      f.geometry?.type === 'LineString' && f.properties?.kind === 'track'
    ) || data.features.find((f: any) => f.geometry?.type === 'LineString')

    if (trackFeat) {
      // LineString track: coordinates are an array of [lng, lat, alt]
      coords = trackFeat.geometry.coordinates
      timestamps = trackFeat.properties?.AbsoluteUtcMicroSec
      relativeTimestamps = trackFeat.properties?.RelativeMicroSec
      perPointSpeeds = trackFeat.properties?.Speed2DMps
      if (Array.isArray(timestamps) && timestamps.length === 0) timestamps = undefined
      if (Array.isArray(perPointSpeeds) && perPointSpeeds.length === 0) perPointSpeeds = undefined
    } else {
      // FeatureCollection of Points: each feature is one GPS point
      coords = data.features.map((f: any) => f.geometry?.coordinates).filter(Boolean)
      timestamps = data.features.map((f: any) => f.properties?.AbsoluteUtcMicroSec).filter((v: any) => v !== undefined)
      perPointSpeeds = data.features.map((f: any) => f.properties?.speed_ms).filter((v: any) => v !== undefined)
      if (timestamps!.length !== coords!.length) timestamps = undefined
      if (perPointSpeeds && perPointSpeeds.length !== coords!.length) perPointSpeeds = undefined
    }
  } else {
    // Single Feature with LineString or array of coordinates
    coords = data.geometry?.coordinates
    timestamps = data.properties?.AbsoluteUtcMicroSec
    relativeTimestamps = data.properties?.RelativeMicroSec
  }

  if (!coords || coords.length === 0) {
    throw new Error('GeoJSON file has no coordinates.')
  }

  // Detect timestamp unit: if values are > 1e15, they're microseconds; > 1e12, milliseconds
  if (timestamps && timestamps.length > 0) {
    const sample = timestamps[0]
    if (sample > 1e15) {
      // Microseconds → convert to milliseconds
      timestamps = timestamps.map((t: number) => Math.round(t / 1000))
    }
    // else if > 1e12, already milliseconds (our standard)
    // else if < 1e12, could be seconds → convert to milliseconds
    else if (sample < 1e10) {
      timestamps = timestamps.map((t: number) => Math.round(t * 1000))
    }
  }

  const points: GPSPoint[] = []
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, alt = 0] = coords[i]

    let time: number
    if (timestamps && timestamps[i] !== undefined) {
      time = timestamps[i]
    } else if (relativeTimestamps && relativeTimestamps[i] !== undefined) {
      time = relativeTimestamps[i] / 1000 // microseconds to milliseconds
    } else {
      time = i * 100
    }

    // Use per-point speed if available (from GPS sensor), otherwise derive from position
    let speed = 0
    if (perPointSpeeds && perPointSpeeds[i] !== undefined) {
      speed = perPointSpeeds[i] // already in m/s
    } else if (i > 0) {
      const prevCoord = coords[i - 1]
      const prevTime = timestamps
        ? timestamps[i - 1]
        : relativeTimestamps
          ? relativeTimestamps[i - 1]
          : (i - 1) * 100
      const dt = (time - prevTime) / 1000
      if (dt > 0) {
        const dist = haversineDistance(prevCoord[1], prevCoord[0], lat, lng)
        speed = dist / dt
      }
    }

    if (isNaN(lat) || isNaN(lng)) continue

    points.push({ lat, lng, speed, time, altitude: alt })
  }

  if (points.length === 0) {
    throw new Error('No valid GPS points found in GeoJSON file.')
  }

  // Smooth speed to reduce noise from position-derived calculation
  const windowSize = 5
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(points.length - 1, i + Math.floor(windowSize / 2))
    let sum = 0, count = 0
    for (let j = start; j <= end; j++) {
      sum += points[j].speed
      count++
    }
    points[i].speed = sum / count
  }

  return points
}

/**
 * Read a 32-bit big-endian unsigned integer from a DataView.
 */
function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

/**
 * Read 4 ASCII characters from a DataView.
 */
function readType(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1),
    view.getUint8(offset + 2), view.getUint8(offset + 3)
  )
}

/**
 * Scan the MP4 file to find the moov atom location without loading the entire file.
 * Only reads 8-byte atom headers, skipping the massive mdat atom.
 * Returns { offset, size } of the moov atom.
 */
async function findMoovAtom(file: File, onProgress?: (msg: string) => void): Promise<{ offset: number; size: number }> {
  let pos = 0
  const fileSize = file.size

  while (pos < fileSize) {
    // Read atom header (8 bytes: 4 size + 4 type)
    const headerBuf = await file.slice(pos, pos + 16).arrayBuffer()
    const view = new DataView(headerBuf)
    let atomSize = readU32(view, 0)
    const atomType = readType(view, 4)

    // Handle 64-bit extended size
    if (atomSize === 1 && headerBuf.byteLength >= 16) {
      // 64-bit size: read next 8 bytes as big-endian uint64
      const hi = readU32(view, 8)
      const lo = readU32(view, 12)
      atomSize = hi * 0x100000000 + lo
    }

    if (atomSize < 8) break // invalid atom

    onProgress?.(`扫描 MP4 结构... ${atomType} (${(pos / 1024 / 1024).toFixed(0)}MB / ${(fileSize / 1024 / 1024).toFixed(0)}MB)`)

    if (atomType === 'moov') {
      return { offset: pos, size: atomSize }
    }

    pos += atomSize
  }

  throw new Error('未找到 moov 元数据。文件可能不是有效的 MP4/GoPro 视频。')
}

/**
 * Extract GPS from a video file by reading ONLY the moov atom (metadata).
 * This works with any file size because it never loads the video stream (mdat) into memory.
 * Typically reads ~2-10MB regardless of whether the video is 1GB or 8GB.
 */
export async function parseGPSFromFile(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<GPSPoint[]> {
  const sizeMB = file.size / (1024 * 1024)
  const isLargeFile = sizeMB > 500

  if (isLargeFile) {
    onProgress?.(`视频 ${(sizeMB / 1024).toFixed(1)}GB，正在扫描元数据位置（不会加载整个视频）...`)
  }

  // Step 1: Find the moov atom without loading the whole file
  const moovInfo = await findMoovAtom(file, onProgress)
  onProgress?.(`找到元数据区 (${(moovInfo.size / 1024 / 1024).toFixed(1)}MB)，正在读取...`)

  // Step 2: Read only the moov atom + ftyp header into a minimal buffer
  // gpmf-extract needs a valid MP4 structure, so we build: ftyp + moov (no mdat)
  const ftypSize = Math.min(moovInfo.offset, 1024) // ftyp is usually the first atom, ~32 bytes
  const ftypBuf = await file.slice(0, ftypSize).arrayBuffer()
  const moovBuf = await file.slice(moovInfo.offset, moovInfo.offset + moovInfo.size).arrayBuffer()

  // Combine into a single minimal MP4 buffer
  const combined = new Uint8Array(ftypBuf.byteLength + moovBuf.byteLength)
  combined.set(new Uint8Array(ftypBuf), 0)
  combined.set(new Uint8Array(moovBuf), ftypBuf.byteLength)

  onProgress?.('正在解析 GoPro 元数据（GPMF）...')

  // Step 3: Pass the minimal buffer to gpmf-extract
  // Create a Blob that looks like a File to gpmf-extract
  const minimalFile = new File([combined], file.name, { type: 'video/mp4' })

  let extracted: any
  try {
    extracted = await gpmfExtract(minimalFile, { browserMode: true } as any)
  } catch {
    // Fallback: if minimal buffer doesn't work, try with original file (small files only)
    if (sizeMB < 500) {
      onProgress?.('元数据精简提取失败，使用完整文件重试...')
      extracted = await gpmfExtract(file, { browserMode: true } as any)
    } else {
      throw new Error(
        '无法从视频中提取 GPS 元数据。\n\n' +
        '建议：在电脑上运行以下命令提取 GPS 数据，然后上传生成的 .geojson 文件：\n' +
        `python3 tools/extract-gps.py "${file.name}"`
      )
    }
  }

  if (!extracted?.rawData) {
    throw new Error('未找到 GPMF 元数据。请确认这是 GoPro 录制的视频文件。')
  }

  onProgress?.('正在转换 GPS 坐标...')

  let telemetry: Record<string, unknown>
  try {
    telemetry = await (goProTelemetry as any)(
      { rawData: extracted.rawData, timing: extracted.timing },
      { stream: ['GPS5'], smooth: 3, GPS: { fix: 2 } }
    ) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      `GPS 数据转换失败: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const points: GPSPoint[] = []

  for (const deviceKey of Object.keys(telemetry)) {
    const device = telemetry[deviceKey] as Record<string, unknown>
    if (!device || typeof device !== 'object') continue

    const streams = device.streams as Record<string, unknown> | undefined
    if (!streams) continue

    const gps5 = streams['GPS5'] as { samples?: Array<Record<string, unknown>> } | undefined
    if (!gps5?.samples) continue

    for (const sample of gps5.samples) {
      const value = sample.value as number[] | undefined
      const date = sample.date as string | undefined
      if (!value || value.length < 5 || !date) continue

      const [lat, lng, altitude, speed2d] = value
      const time = new Date(date).getTime()

      if (isNaN(lat) || isNaN(lng) || isNaN(time)) continue

      points.push({ lat, lng, speed: speed2d, time, altitude })
    }
  }

  if (points.length === 0) {
    throw new Error('视频中未找到 GPS 数据。请确认拍摄时已开启 GoPro GPS 功能。')
  }

  points.sort((a, b) => a.time - b.time)
  onProgress?.(`成功提取 ${points.length} 个 GPS 点`)

  return points
}
