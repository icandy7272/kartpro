/**
 * Smart GPMF extractor for GoPro videos of ANY size.
 *
 * Instead of loading the entire video file (which OOMs on 4GB+ files),
 * this parser reads the MP4 container structure to locate the GPMF metadata
 * track, then uses File.slice() to read only the metadata samples.
 *
 * Total memory: ~5-20MB regardless of video size.
 *
 * MP4 structure:
 *   ftyp - file type
 *   mdat - media data (huge, we SKIP this)
 *   moov - metadata container
 *     mvhd - movie header (timescale, duration)
 *     trak[] - one per track (video, audio, GPMF metadata)
 *       tkhd - track header
 *       mdia
 *         hdlr - handler (identifies GPMF track)
 *         minf
 *           stbl - sample table
 *             stsd - sample descriptions (codec: 'gpmd')
 *             stsz - sample sizes
 *             stco/co64 - chunk offsets
 *             stsc - sample-to-chunk mapping
 */

type ProgressCallback = (msg: string) => void

// ---- Low-level MP4 reading ----

function readU32(view: DataView, off: number): number {
  return view.getUint32(off, false) // big-endian
}

function readStr(view: DataView, off: number, len: number = 4): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i))
  return s
}

function readU64(view: DataView, off: number): number {
  return readU32(view, off) * 0x100000000 + readU32(view, off + 4)
}

// ---- Atom iteration ----

interface Atom {
  type: string
  offset: number  // position in file/buffer
  size: number    // total atom size including header
  headerSize: number // 8 or 16
}

function parseAtomHeader(view: DataView, off: number, maxLen: number): Atom | null {
  if (off + 8 > maxLen) return null
  let size = readU32(view, off)
  const type = readStr(view, off + 4)
  let headerSize = 8

  if (size === 1) {
    // 64-bit extended size
    if (off + 16 > maxLen) return null
    size = readU64(view, off + 8)
    headerSize = 16
  } else if (size === 0) {
    // Atom extends to end of file/container
    size = maxLen - off
  }

  if (size < headerSize) return null
  return { type, offset: off, size, headerSize }
}

/** Iterate child atoms within a container atom */
function* iterateAtoms(view: DataView, start: number, end: number): Generator<Atom> {
  let pos = start
  while (pos < end - 8) {
    const atom = parseAtomHeader(view, pos, end)
    if (!atom || atom.size < 8) break
    yield atom
    pos += atom.size
  }
}

// ---- GPMF Track Detection ----

interface GpmfTrackInfo {
  timescale: number
  duration: number
  sampleSizes: number[]
  chunkOffsets: number[]
  samplesToChunks: Array<{ firstChunk: number; samplesPerChunk: number }>
}

/**
 * Parse the moov atom to find the GPMF metadata track and extract its sample table.
 */
function findGpmfTrack(moovBuf: ArrayBuffer, onProgress?: ProgressCallback): GpmfTrackInfo | null {
  const view = new DataView(moovBuf)
  const len = moovBuf.byteLength

  // Get movie timescale from mvhd
  let movieTimescale = 1

  for (const atom of iterateAtoms(view, 0, len)) {
    if (atom.type === 'mvhd') {
      const version = view.getUint8(atom.offset + atom.headerSize)
      if (version === 0) {
        movieTimescale = readU32(view, atom.offset + atom.headerSize + 12)
      } else {
        movieTimescale = readU32(view, atom.offset + atom.headerSize + 20)
      }
    }
  }

  // Find trak atoms
  let trackNum = 0
  for (const trakAtom of iterateAtoms(view, 0, len)) {
    if (trakAtom.type !== 'trak') continue
    trackNum++
    onProgress?.(`检查轨道 ${trackNum}...`)

    const trakStart = trakAtom.offset + trakAtom.headerSize
    const trakEnd = trakAtom.offset + trakAtom.size

    // Find mdia inside trak
    for (const mdiaAtom of iterateAtoms(view, trakStart, trakEnd)) {
      if (mdiaAtom.type !== 'mdia') continue

      const mdiaStart = mdiaAtom.offset + mdiaAtom.headerSize
      const mdiaEnd = mdiaAtom.offset + mdiaAtom.size

      // Check hdlr for GPMF handler
      let isGpmfTrack = false
      let trackTimescale = movieTimescale
      let trackDuration = 0

      for (const child of iterateAtoms(view, mdiaStart, mdiaEnd)) {
        if (child.type === 'hdlr') {
          // hdlr: version(4) + handler_type(4)
          const handlerType = readStr(view, child.offset + child.headerSize + 8)
          // GoPro metadata handler is typically 'meta' or 'tmcd'
          // But we also check stsd for 'gpmd' codec below
          if (handlerType === 'meta' || handlerType === 'tmcd') {
            isGpmfTrack = true
          }
          // Check component name for "GoPro" (some firmwares use 'camm' handler)
          const nameStart = child.offset + child.headerSize + 24
          if (nameStart + 5 < child.offset + child.size) {
            const name = readStr(view, nameStart, Math.min(20, child.offset + child.size - nameStart))
            if (name.includes('GoPro') || name.includes('gpmd')) {
              isGpmfTrack = true
            }
          }
        }
        if (child.type === 'mdhd') {
          const ver = view.getUint8(child.offset + child.headerSize)
          if (ver === 0) {
            trackTimescale = readU32(view, child.offset + child.headerSize + 12)
            trackDuration = readU32(view, child.offset + child.headerSize + 16)
          } else {
            trackTimescale = readU32(view, child.offset + child.headerSize + 20)
            trackDuration = readU64(view, child.offset + child.headerSize + 24)
          }
        }
      }

      if (!isGpmfTrack) continue

      // Find minf -> stbl
      for (const minfAtom of iterateAtoms(view, mdiaStart, mdiaEnd)) {
        if (minfAtom.type !== 'minf') continue
        const minfStart = minfAtom.offset + minfAtom.headerSize
        const minfEnd = minfAtom.offset + minfAtom.size

        for (const stblAtom of iterateAtoms(view, minfStart, minfEnd)) {
          if (stblAtom.type !== 'stbl') continue
          const stblStart = stblAtom.offset + stblAtom.headerSize
          const stblEnd = stblAtom.offset + stblAtom.size

          // Verify this is GPMF by checking stsd for 'gpmd' codec
          let confirmedGpmd = false
          let sampleSizes: number[] = []
          let chunkOffsets: number[] = []
          let samplesToChunks: Array<{ firstChunk: number; samplesPerChunk: number }> = []

          for (const box of iterateAtoms(view, stblStart, stblEnd)) {
            if (box.type === 'stsd') {
              // Check codec in first sample entry
              const entryStart = box.offset + box.headerSize + 8 // skip version+flags + entry_count
              if (entryStart + 12 < box.offset + box.size) {
                const codec = readStr(view, entryStart + 4)
                if (codec === 'gpmd') confirmedGpmd = true
              }
            }

            if (box.type === 'stsz') {
              // Sample size table
              const off = box.offset + box.headerSize
              const sampleSize = readU32(view, off + 4) // uniform size (0 = variable)
              const count = readU32(view, off + 8)
              onProgress?.(`找到 ${count} 个 GPMF 样本`)
              if (sampleSize > 0) {
                sampleSizes = new Array(count).fill(sampleSize)
              } else {
                for (let i = 0; i < count; i++) {
                  sampleSizes.push(readU32(view, off + 12 + i * 4))
                }
              }
            }

            if (box.type === 'stco') {
              // 32-bit chunk offsets
              const off = box.offset + box.headerSize
              const count = readU32(view, off + 4)
              for (let i = 0; i < count; i++) {
                chunkOffsets.push(readU32(view, off + 8 + i * 4))
              }
            }

            if (box.type === 'co64') {
              // 64-bit chunk offsets (for files > 4GB)
              const off = box.offset + box.headerSize
              const count = readU32(view, off + 4)
              for (let i = 0; i < count; i++) {
                chunkOffsets.push(readU64(view, off + 8 + i * 8))
              }
            }

            if (box.type === 'stsc') {
              // Sample-to-chunk mapping
              const off = box.offset + box.headerSize
              const count = readU32(view, off + 4)
              for (let i = 0; i < count; i++) {
                const base = off + 8 + i * 12
                samplesToChunks.push({
                  firstChunk: readU32(view, base) - 1, // convert to 0-based
                  samplesPerChunk: readU32(view, base + 4),
                })
              }
            }
          }

          // If we found stsd with gpmd, or handler was meta with sample data, proceed
          if ((confirmedGpmd || isGpmfTrack) && sampleSizes.length > 0 && chunkOffsets.length > 0) {
            return {
              timescale: trackTimescale,
              duration: trackDuration,
              sampleSizes,
              chunkOffsets,
              samplesToChunks: samplesToChunks.length > 0 ? samplesToChunks : [{ firstChunk: 0, samplesPerChunk: 1 }],
            }
          }
        }
      }
    }
  }

  return null
}

/**
 * Given the sample table info, compute the file offset for each sample.
 */
function computeSampleOffsets(info: GpmfTrackInfo): Array<{ offset: number; size: number }> {
  const { sampleSizes, chunkOffsets, samplesToChunks } = info
  const result: Array<{ offset: number; size: number }> = []

  // Build per-chunk samples-per-chunk lookup
  let sampleIdx = 0
  for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
    // Find which stsc entry applies to this chunk
    let samplesInChunk = 1
    for (let s = samplesToChunks.length - 1; s >= 0; s--) {
      if (chunkIdx >= samplesToChunks[s].firstChunk) {
        samplesInChunk = samplesToChunks[s].samplesPerChunk
        break
      }
    }

    let offset = chunkOffsets[chunkIdx]
    for (let i = 0; i < samplesInChunk && sampleIdx < sampleSizes.length; i++) {
      result.push({ offset, size: sampleSizes[sampleIdx] })
      offset += sampleSizes[sampleIdx]
      sampleIdx++
    }
  }

  return result
}

// ---- Main export ----

/**
 * Extract raw GPMF data from a GoPro MP4 file of any size.
 * Only reads the moov atom + individual GPMF samples via File.slice().
 * Returns the concatenated raw GPMF buffer + timing info.
 */
export async function extractGpmfFromFile(
  file: File,
  onProgress?: ProgressCallback,
): Promise<{ rawData: ArrayBuffer; timing: { start: Date; duration: number } }> {
  const fileSize = file.size
  const sizeMB = fileSize / (1024 * 1024)

  onProgress?.(`视频 ${sizeMB > 1024 ? (sizeMB / 1024).toFixed(1) + 'GB' : sizeMB.toFixed(0) + 'MB'}，正在扫描文件结构...`)

  // Step 1: Find moov atom by scanning top-level atoms
  let moovOffset = -1
  let moovSize = 0
  let pos = 0

  while (pos < fileSize) {
    const headerBuf = await file.slice(pos, Math.min(pos + 16, fileSize)).arrayBuffer()
    const hv = new DataView(headerBuf)
    let atomSize = readU32(hv, 0)
    const atomType = readStr(hv, 4)

    if (atomSize === 1 && headerBuf.byteLength >= 16) {
      atomSize = readU64(hv, 8)
    }
    if (atomSize < 8) break

    onProgress?.(`扫描: ${atomType} @ ${(pos / 1024 / 1024).toFixed(0)}MB (${(pos / fileSize * 100).toFixed(0)}%)`)

    if (atomType === 'moov') {
      moovOffset = pos
      moovSize = atomSize
      break
    }
    pos += atomSize
  }

  if (moovOffset < 0) {
    throw new Error('未找到 moov 元数据。文件可能不是有效的 MP4/GoPro 视频。')
  }

  onProgress?.(`找到 moov (${(moovSize / 1024 / 1024).toFixed(1)}MB)，正在读取...`)

  // Step 2: Read the entire moov atom into memory (~2-30MB)
  const moovBuf = await file.slice(moovOffset + 8, moovOffset + moovSize).arrayBuffer()

  onProgress?.('正在解析 GPMF 轨道...')

  // Step 3: Parse moov to find the GPMF track's sample table
  const trackInfo = findGpmfTrack(moovBuf, onProgress)
  if (!trackInfo) {
    throw new Error('未找到 GoPro GPMF 元数据轨道。请确认这是 GoPro 录制的视频。')
  }

  // Step 4: Compute file offsets for each GPMF sample
  const sampleLocations = computeSampleOffsets(trackInfo)
  const totalSampleBytes = sampleLocations.reduce((s, l) => s + l.size, 0)

  onProgress?.(`找到 ${sampleLocations.length} 个 GPMF 数据块 (${(totalSampleBytes / 1024).toFixed(0)}KB)，正在读取...`)

  // Step 5: Read each sample from the file using File.slice()
  // Batch reads for efficiency (read in 1MB chunks)
  const rawParts: Uint8Array[] = []
  const batchSize = 50 // read 50 samples at a time
  for (let i = 0; i < sampleLocations.length; i += batchSize) {
    const batch = sampleLocations.slice(i, i + batchSize)
    const promises = batch.map(loc =>
      file.slice(loc.offset, loc.offset + loc.size).arrayBuffer()
    )
    const buffers = await Promise.all(promises)
    for (const buf of buffers) {
      rawParts.push(new Uint8Array(buf))
    }

    const progress = Math.min(100, ((i + batch.length) / sampleLocations.length * 100))
    onProgress?.(`读取 GPMF 数据... ${progress.toFixed(0)}%`)
  }

  // Step 6: Concatenate all samples
  const totalSize = rawParts.reduce((s, p) => s + p.byteLength, 0)
  const combined = new Uint8Array(totalSize)
  let offset = 0
  for (const part of rawParts) {
    combined.set(part, offset)
    offset += part.byteLength
  }

  // Compute timing from track timescale
  const durationSeconds = trackInfo.duration / trackInfo.timescale

  onProgress?.(`GPMF 提取完成 (${(totalSize / 1024).toFixed(0)}KB, ${durationSeconds.toFixed(0)}秒)`)

  return {
    rawData: combined.buffer,
    timing: {
      start: new Date(0), // will be refined by gopro-telemetry
      duration: durationSeconds * 1000, // ms
    },
  }
}
