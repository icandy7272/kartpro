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

async function readBytes(file: File, offset: number, length: number): Promise<DataView> {
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
          let sampleSizes: number[] = []
          let chunkOffsets: number[] = []
          let samplesToChunks: Array<{ firstChunk: number; samplesPerChunk: number }> = []

          for await (const box of iterateFileAtoms(file, stblAtom.dataOffset, stblEnd)) {
            if (box.type === 'stsz') {
              // Read sample sizes — may be large, read in chunks
              const headerView = await readBytes(file, box.dataOffset, 12)
              const uniformSize = getU32(headerView, 4)
              const count = getU32(headerView, 8)
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
              const dataView = await readBytes(file, box.dataOffset + 8, count * 12)
              for (let i = 0; i < count; i++) {
                samplesToChunks.push({
                  firstChunk: getU32(dataView, i * 12) - 1,
                  samplesPerChunk: getU32(dataView, i * 12 + 4),
                })
              }
            }
          }

          if (sampleSizes.length > 0 && chunkOffsets.length > 0) {
            // Success — compute sample offsets and read GPMF data
            const trackInfo: GpmfTrackInfo = {
              timescale: trackTimescale,
              duration: trackDuration,
              sampleSizes,
              chunkOffsets,
              samplesToChunks: samplesToChunks.length > 0 ? samplesToChunks : [{ firstChunk: 0, samplesPerChunk: 1 }],
            }

            return await readGpmfSamples(file, trackInfo, onProgress)
          }
        }
      }
    }
  }

  throw new Error('未找到 GoPro GPMF 元数据轨道。请确认这是 GoPro 录制的视频。')
}

/**
 * Read GPMF samples from file using computed offsets.
 */
async function readGpmfSamples(
  file: File,
  info: GpmfTrackInfo,
  onProgress?: ProgressCallback,
): Promise<{ rawData: ArrayBuffer; timing: { start: Date; duration: number } }> {
  const { sampleSizes, chunkOffsets, samplesToChunks, timescale, duration } = info

  // Compute file offset for each sample
  const samples: Array<{ offset: number; size: number }> = []
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
      samples.push({ offset, size: sampleSizes[sampleIdx] })
      offset += sampleSizes[sampleIdx]
      sampleIdx++
    }
  }

  const totalBytes = samples.reduce((s, l) => s + l.size, 0)
  onProgress?.(`读取 ${samples.length} 个 GPMF 数据块 (${(totalBytes / 1024).toFixed(0)}KB)...`)

  // Read samples in batches
  const rawParts: Uint8Array[] = []
  const batchSize = 50
  for (let i = 0; i < samples.length; i += batchSize) {
    const batch = samples.slice(i, i + batchSize)
    const promises = batch.map(s => file.slice(s.offset, s.offset + s.size).arrayBuffer())
    const buffers = await Promise.all(promises)
    for (const buf of buffers) {
      rawParts.push(new Uint8Array(buf))
    }
    const pct = Math.min(100, ((i + batch.length) / samples.length * 100))
    onProgress?.(`读取 GPMF 数据... ${pct.toFixed(0)}%`)
  }

  // Concatenate
  const totalSize = rawParts.reduce((s, p) => s + p.byteLength, 0)
  const combined = new Uint8Array(totalSize)
  let off = 0
  for (const part of rawParts) {
    combined.set(part, off)
    off += part.byteLength
  }

  const durationMs = (duration / timescale) * 1000

  onProgress?.(`GPMF 提取完成 (${(totalSize / 1024).toFixed(0)}KB, ${(durationMs / 1000).toFixed(0)}秒)`)

  return {
    rawData: combined.buffer,
    timing: { start: new Date(0), duration: durationMs },
  }
}
