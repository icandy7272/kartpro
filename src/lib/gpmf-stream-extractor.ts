/**
 * Smart GPMF extractor for GoPro videos of ANY size.
 *
 * Uses File.slice() for ALL reads — never loads more than a few KB at a time
 * (except for individual GPMF data samples which are ~1KB each).
 *
 * Total memory: <10MB regardless of video size (even 11GB+).
 */

type ProgressCallback = (msg: string) => void

// ---- Low-level helpers ----

const MAX_READ = 10 * 1024 * 1024 // 10MB safety limit per read

async function readBytes(file: File, offset: number, length: number): Promise<DataView> {
  if (length > MAX_READ) {
    throw new Error(`读取请求过大: ${(length / 1024 / 1024).toFixed(1)}MB @ offset ${offset}. 可能是文件结构异常。`)
  }
  if (offset < 0 || offset + length > file.size) {
    throw new Error(`读取越界: offset=${offset}, length=${length}, fileSize=${file.size}`)
  }
  const buf = await file.slice(offset, offset + length).arrayBuffer()
  return new DataView(buf)
}

function getU32(view: DataView, off: number): number {
  return view.getUint32(off, false)
}

function getU64(view: DataView, off: number): number {
  return getU32(view, off) * 0x100000000 + getU32(view, off + 4)
}

function getStr(view: DataView, off: number, len: number = 4): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i))
  return s
}

// ---- Atom header reading (from file, not buffer) ----

interface AtomInfo {
  type: string
  fileOffset: number  // position in file
  dataOffset: number  // where content starts (after header)
  size: number        // total atom size
  headerSize: number  // 8 or 16
}

async function readAtomAt(file: File, fileOffset: number): Promise<AtomInfo | null> {
  if (fileOffset + 8 > file.size) return null
  const view = await readBytes(file, fileOffset, 16)
  let size = getU32(view, 0)
  const type = getStr(view, 4)
  let headerSize = 8

  if (size === 1) {
    size = getU64(view, 8)
    headerSize = 16
  } else if (size === 0) {
    size = file.size - fileOffset
  }

  if (size < headerSize) return null
  return { type, fileOffset, dataOffset: fileOffset + headerSize, size, headerSize }
}

/** Iterate child atoms within a container range in the file */
async function* iterateFileAtoms(file: File, start: number, end: number): AsyncGenerator<AtomInfo> {
  let pos = start
  while (pos < end - 8) {
    const atom = await readAtomAt(file, pos)
    if (!atom || atom.size < 8) break
    yield atom
    pos += atom.size
  }
}

// ---- GPMF Track info ----

interface GpmfTrackInfo {
  timescale: number
  duration: number
  sampleSizes: number[]
  chunkOffsets: number[]
  samplesToChunks: Array<{ firstChunk: number; samplesPerChunk: number }>
}

// ---- Main extraction ----

export async function extractGPSFromVideo(
  file: File,
  onProgress?: ProgressCallback,
): Promise<GPSPoint[]> {
  const fileSize = file.size
  const sizeMB = fileSize / (1024 * 1024)

  onProgress?.(`视频 ${sizeMB > 1024 ? (sizeMB / 1024).toFixed(1) + 'GB' : sizeMB.toFixed(0) + 'MB'}，正在扫描文件结构...`)

  // Step 1: Find moov atom by scanning top-level atoms
  let moovOffset = -1
  let moovSize = 0

  for await (const atom of iterateFileAtoms(file, 0, fileSize)) {
    onProgress?.(`扫描: ${atom.type} @ ${(atom.fileOffset / 1024 / 1024).toFixed(0)}MB (${(atom.fileOffset / fileSize * 100).toFixed(0)}%)`)
    if (atom.type === 'moov') {
      moovOffset = atom.fileOffset
      moovSize = atom.size
      break
    }
  }

  if (moovOffset < 0) {
    throw new Error('未找到 moov 元数据。文件可能不是有效的 MP4/GoPro 视频。')
  }

  const moovDataStart = moovOffset + 8
  const moovEnd = moovOffset + moovSize

  onProgress?.(`找到 moov (${(moovSize / 1024 / 1024).toFixed(1)}MB)，正在搜索 GPMF 轨道...`)

  // Step 2: Scan trak atoms inside moov (all via File.slice, no big buffer)
  let movieTimescale = 1

  // Read mvhd for timescale
  for await (const atom of iterateFileAtoms(file, moovDataStart, moovEnd)) {
    if (atom.type === 'mvhd') {
      const mvhdView = await readBytes(file, atom.dataOffset, Math.min(32, atom.size - atom.headerSize))
      const version = mvhdView.getUint8(0)
      movieTimescale = version === 0 ? getU32(mvhdView, 12) : getU32(mvhdView, 20)
      break
    }
  }

  // Find GPMF trak
  let trackNum = 0
  for await (const trakAtom of iterateFileAtoms(file, moovDataStart, moovEnd)) {
    if (trakAtom.type !== 'trak') continue
    trackNum++
    onProgress?.(`检查轨道 ${trackNum}...`)

    const trakEnd = trakAtom.fileOffset + trakAtom.size

    // Find mdia inside trak
    for await (const mdiaAtom of iterateFileAtoms(file, trakAtom.dataOffset, trakEnd)) {
      if (mdiaAtom.type !== 'mdia') continue

      const mdiaEnd = mdiaAtom.fileOffset + mdiaAtom.size
      let isGpmfTrack = false
      let trackTimescale = movieTimescale
      let trackDuration = 0

      // Check hdlr and mdhd
      for await (const child of iterateFileAtoms(file, mdiaAtom.dataOffset, mdiaEnd)) {
        if (child.type === 'hdlr') {
          const hdlrView = await readBytes(file, child.dataOffset, Math.min(40, child.size - child.headerSize))
          const handlerType = getStr(hdlrView, 8)
          if (handlerType === 'meta' || handlerType === 'tmcd') {
            isGpmfTrack = true
          }
          // Check name field for "GoPro"
          if (child.size - child.headerSize > 24) {
            const nameView = await readBytes(file, child.dataOffset + 24, Math.min(20, child.size - child.headerSize - 24))
            const name = getStr(nameView, 0, Math.min(20, nameView.byteLength))
            if (name.includes('GoPro') || name.includes('gpmd')) {
              isGpmfTrack = true
            }
          }
        }
        if (child.type === 'mdhd') {
          const mdhdView = await readBytes(file, child.dataOffset, Math.min(36, child.size - child.headerSize))
          const ver = mdhdView.getUint8(0)
          if (ver === 0) {
            trackTimescale = getU32(mdhdView, 12)
            trackDuration = getU32(mdhdView, 16)
          } else {
            trackTimescale = getU32(mdhdView, 20)
            trackDuration = getU64(mdhdView, 24)
          }
        }
      }

      if (!isGpmfTrack) continue

      onProgress?.('找到 GPMF 轨道，正在读取样本表...')

      // Find minf -> stbl
      for await (const minfAtom of iterateFileAtoms(file, mdiaAtom.dataOffset, mdiaEnd)) {
        if (minfAtom.type !== 'minf') continue

        for await (const stblAtom of iterateFileAtoms(file, minfAtom.dataOffset, minfAtom.fileOffset + minfAtom.size)) {
          if (stblAtom.type !== 'stbl') continue

          const stblEnd = stblAtom.fileOffset + stblAtom.size

          // FIRST: check stsd for 'gpmd' codec before reading anything else
          let confirmedGpmd = false
          for await (const box of iterateFileAtoms(file, stblAtom.dataOffset, stblEnd)) {
            if (box.type === 'stsd') {
              const stsdView = await readBytes(file, box.dataOffset, Math.min(20, box.size - box.headerSize))
              if (stsdView.byteLength >= 12) {
                const codec = getStr(stsdView, 12)
                if (codec === 'gpmd') confirmedGpmd = true
              }
              break
            }
          }

          if (!confirmedGpmd) {
            onProgress?.(`轨道 ${trackNum} 不是 GPMF (codec != gpmd)，跳过`)
            continue
          }

          onProgress?.(`轨道 ${trackNum} 确认为 GPMF (gpmd)，读取样本表...`)

          let sampleSizes: number[] = []
          let chunkOffsets: number[] = []
          let samplesToChunks: Array<{ firstChunk: number; samplesPerChunk: number }> = []

          for await (const box of iterateFileAtoms(file, stblAtom.dataOffset, stblEnd)) {
            if (box.type === 'stsz') {
              const headerView = await readBytes(file, box.dataOffset, 12)
              const uniformSize = getU32(headerView, 4)
              const count = getU32(headerView, 8)
              if (count > 500000) {
                onProgress?.(`样本数量异常 (${count})，跳过...`)
                break
              }
              onProgress?.(`找到 ${count} 个 GPMF 样本`)

              if (uniformSize > 0) {
                sampleSizes = new Array(count).fill(uniformSize)
              } else {
                // Read sample size table in 4KB batches
                const batchEntries = 1024
                for (let i = 0; i < count; i += batchEntries) {
                  const batchCount = Math.min(batchEntries, count - i)
                  const batchView = await readBytes(file, box.dataOffset + 12 + i * 4, batchCount * 4)
                  for (let j = 0; j < batchCount; j++) {
                    sampleSizes.push(getU32(batchView, j * 4))
                  }
                }
              }
            }

            if (box.type === 'stco') {
              const headerView = await readBytes(file, box.dataOffset, 8)
              const count = getU32(headerView, 4)
              const batchEntries = 1024
              for (let i = 0; i < count; i += batchEntries) {
                const batchCount = Math.min(batchEntries, count - i)
                const batchView = await readBytes(file, box.dataOffset + 8 + i * 4, batchCount * 4)
                for (let j = 0; j < batchCount; j++) {
                  chunkOffsets.push(getU32(batchView, j * 4))
                }
              }
            }

            if (box.type === 'co64') {
              const headerView = await readBytes(file, box.dataOffset, 8)
              const count = getU32(headerView, 4)
              const batchEntries = 512
              for (let i = 0; i < count; i += batchEntries) {
                const batchCount = Math.min(batchEntries, count - i)
                const batchView = await readBytes(file, box.dataOffset + 8 + i * 8, batchCount * 8)
                for (let j = 0; j < batchCount; j++) {
                  chunkOffsets.push(getU64(batchView, j * 8))
                }
              }
            }

            if (box.type === 'stsc') {
              const headerView = await readBytes(file, box.dataOffset, 8)
              const count = getU32(headerView, 4)
              if (count > 100000) continue // sanity check
              const batchEntries = 1024
              for (let i = 0; i < count; i += batchEntries) {
                const batchCount = Math.min(batchEntries, count - i)
                const batchView = await readBytes(file, box.dataOffset + 8 + i * 12, batchCount * 12)
                for (let j = 0; j < batchCount; j++) {
                  samplesToChunks.push({
                    firstChunk: getU32(batchView, j * 12) - 1,
                    samplesPerChunk: getU32(batchView, j * 12 + 4),
                  })
                }
              }
            }
          }

          if (sampleSizes.length > 0 && chunkOffsets.length > 0) {
            const trackInfo: GpmfTrackInfo = {
              timescale: trackTimescale,
              duration: trackDuration,
              sampleSizes,
              chunkOffsets,
              samplesToChunks: samplesToChunks.length > 0 ? samplesToChunks : [{ firstChunk: 0, samplesPerChunk: 1 }],
            }

            return await readAndParseGpmfSamples(file, trackInfo, onProgress)
          }
        }
      }
    }
  }

  throw new Error('未找到 GoPro GPMF 元数据轨道。请确认这是 GoPro 录制的视频。')
}

// ---- GPMF KLV parser ----

interface GPSPoint {
  lat: number; lng: number; altitude: number; speed: number; time: number
}

/**
 * Parse GPS data (GPS5 or GPS9) from a single GPMF sample buffer.
 */
function parseGPSFromGpmfSample(view: DataView, start: number, end: number): GPSPoint[] {
  const points: GPSPoint[] = []
  parseKLV(view, start, end, null, points)
  return points
}

function parseKLV(
  view: DataView, start: number, end: number,
  currentScale: number[] | null, points: GPSPoint[]
): void {
  let pos = start
  while (pos < end - 8) {
    const key = getStr(view, pos)
    const type = view.getUint8(pos + 4)
    const structSize = view.getUint8(pos + 5)
    const repeat = view.getUint16(pos + 6, false)
    const dataSize = structSize * repeat
    const paddedSize = (dataSize + 3) & ~3

    if (type === 0 && paddedSize > 0) {
      // Container — recurse
      parseKLV(view, pos + 8, Math.min(pos + 8 + paddedSize, end), null, points)
    } else if (key === 'SCAL' && structSize === 4) {
      currentScale = []
      for (let i = 0; i < repeat; i++) {
        currentScale.push(view.getInt32(pos + 8 + i * 4, false))
      }
    } else if (key === 'GPS5' && structSize === 20 && currentScale && currentScale.length >= 5) {
      // GPS5: lat, lng, alt, speed2d, speed3d (5 x int32)
      const s = currentScale
      for (let i = 0; i < repeat; i++) {
        const off = pos + 8 + i * 20
        if (off + 20 > end) break
        const lat = view.getInt32(off, false) / s[0]
        const lng = view.getInt32(off + 4, false) / s[1]
        const alt = view.getInt32(off + 8, false) / s[2]
        const speed2d = view.getInt32(off + 12, false) / s[3]
        if (lat !== 0 && lng !== 0) {
          points.push({ lat, lng, altitude: alt, speed: speed2d, time: 0 })
        }
      }
    } else if (key === 'GPS9' && structSize === 32 && currentScale && currentScale.length >= 8) {
      // GPS9: lat, lng, alt, speed2d, speed3d, days, seconds, dop (8 x int32)
      const s = currentScale
      const baseDate = new Date(2000, 0, 1).getTime()
      for (let i = 0; i < repeat; i++) {
        const off = pos + 8 + i * 32
        if (off + 32 > end) break
        const lat = view.getInt32(off, false) / s[0]
        const lng = view.getInt32(off + 4, false) / s[1]
        const alt = view.getInt32(off + 8, false) / s[2]
        const speed2d = view.getInt32(off + 12, false) / s[3]
        const days = view.getInt32(off + 20, false) / s[5]
        const secs = view.getInt32(off + 24, false) / s[6]
        const time = baseDate + days * 86400000 + secs * 1000
        if (lat !== 0 && lng !== 0) {
          points.push({ lat, lng, altitude: alt, speed: speed2d, time })
        }
      }
    }

    pos += 8 + paddedSize
    if (pos > end) break
  }
}

/**
 * Read GPMF samples and parse GPS data directly.
 * No dependency on gpmf-extract or gopro-telemetry.
 */
async function readAndParseGpmfSamples(
  file: File,
  info: GpmfTrackInfo,
  onProgress?: ProgressCallback,
): Promise<GPSPoint[]> {
  const { sampleSizes, chunkOffsets, samplesToChunks } = info

  // Compute file offset for each sample
  const sampleLocs: Array<{ offset: number; size: number }> = []
  let sampleIdx = 0
  for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
    let samplesInChunk = 1
    for (let s = samplesToChunks.length - 1; s >= 0; s--) {
      if (chunkIdx >= samplesToChunks[s].firstChunk) {
        samplesInChunk = samplesToChunks[s].samplesPerChunk
        break
      }
    }
    let offset = chunkOffsets[chunkIdx]
    for (let i = 0; i < samplesInChunk && sampleIdx < sampleSizes.length; i++) {
      sampleLocs.push({ offset, size: sampleSizes[sampleIdx] })
      offset += sampleSizes[sampleIdx]
      sampleIdx++
    }
  }

  onProgress?.(`读取并解析 ${sampleLocs.length} 个 GPMF 数据块...`)

  // Read and parse each sample individually — no concatenation needed
  const allPoints: GPSPoint[] = []
  for (let i = 0; i < sampleLocs.length; i++) {
    const loc = sampleLocs[i]
    if (loc.size > 1024 * 1024 || loc.offset + loc.size > file.size) continue

    const buf = await file.slice(loc.offset, loc.offset + loc.size).arrayBuffer()
    const view = new DataView(buf)
    const points = parseGPSFromGpmfSample(view, 0, buf.byteLength)
    allPoints.push(...points)

    if (i % 50 === 0 || i === sampleLocs.length - 1) {
      onProgress?.(`解析 GPS 数据... ${Math.round((i + 1) / sampleLocs.length * 100)}% (${allPoints.length} 点)`)
    }
  }

  // Assign timestamps for GPS5 (which doesn't have per-point timestamps)
  // Use even spacing based on sample order
  if (allPoints.length > 0 && allPoints[0].time === 0) {
    // GPS5 mode: assign timestamps based on sample index
    const interval = 100 // ~10Hz GPS, 100ms between points
    for (let i = 0; i < allPoints.length; i++) {
      allPoints[i].time = i * interval
    }
  }

  onProgress?.(`GPS 提取完成：${allPoints.length} 个点`)
  return allPoints
}
