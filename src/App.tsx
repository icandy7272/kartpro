import { useState, useCallback, useEffect } from 'react'
import type { TrainingSession, AIConfig, LapAnalysis, Lap, Corner, GPSPoint } from './types'
import { parseGPSFromFile } from './lib/gps-parser'
import FileUpload from './components/FileUpload'
import Layout from './components/Layout'
import StartFinishPicker from './components/StartFinishPicker'

function smoothPoints(points: GPSPoint[], windowSize = 5): GPSPoint[] {
  if (points.length < windowSize) return points
  const half = Math.floor(windowSize / 2)
  return points.map((p, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(points.length - 1, i + half)
    let sumLat = 0, sumLng = 0, sumSpeed = 0, sumAlt = 0, count = 0
    for (let j = start; j <= end; j++) {
      sumLat += points[j].lat
      sumLng += points[j].lng
      sumSpeed += points[j].speed
      sumAlt += points[j].altitude
      count++
    }
    return {
      ...p,
      lat: sumLat / count,
      lng: sumLng / count,
      speed: sumSpeed / count,
      altitude: sumAlt / count,
    }
  })
}

function haversineDistance(a: GPSPoint, b: GPSPoint): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function detectStartFinishLine(points: GPSPoint[]): { lat1: number; lng1: number; lat2: number; lng2: number } | null {
  if (points.length < 100) return null

  // Find slowest section in first 20% of track as likely start area
  const searchEnd = Math.floor(points.length * 0.2)
  let minSpeed = Infinity
  let minIdx = 0
  for (let i = 0; i < searchEnd; i++) {
    if (points[i].speed < minSpeed) {
      minSpeed = points[i].speed
      minIdx = i
    }
  }

  const center = points[minIdx]
  const offset = 0.00005 // ~5m offset perpendicular to track

  // Get track direction at this point
  const prev = points[Math.max(0, minIdx - 3)]
  const next = points[Math.min(points.length - 1, minIdx + 3)]
  const dx = next.lng - prev.lng
  const dy = next.lat - prev.lat
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len === 0) return null

  // Perpendicular direction
  const px = -dy / len
  const py = dx / len

  return {
    lat1: center.lat + px * offset,
    lng1: center.lng + py * offset,
    lat2: center.lat - px * offset,
    lng2: center.lng - py * offset,
  }
}

function lineSegmentIntersects(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number },
  p3: { lat: number; lng: number },
  p4: { lat: number; lng: number }
): boolean {
  const d1x = p2.lng - p1.lng
  const d1y = p2.lat - p1.lat
  const d2x = p4.lng - p3.lng
  const d2y = p4.lat - p3.lat
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-12) return false
  const t = ((p3.lng - p1.lng) * d2y - (p3.lat - p1.lat) * d2x) / cross
  const u = ((p3.lng - p1.lng) * d1y - (p3.lat - p1.lat) * d1x) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function detectLaps(
  points: GPSPoint[],
  startFinish: { lat1: number; lng1: number; lat2: number; lng2: number }
): Lap[] {
  const sfLine = {
    p1: { lat: startFinish.lat1, lng: startFinish.lng1 },
    p2: { lat: startFinish.lat2, lng: startFinish.lng2 },
  }

  // Find crossing points
  const crossings: number[] = []
  for (let i = 1; i < points.length; i++) {
    if (
      lineSegmentIntersects(
        { lat: points[i - 1].lat, lng: points[i - 1].lng },
        { lat: points[i].lat, lng: points[i].lng },
        sfLine.p1,
        sfLine.p2
      )
    ) {
      // Debounce: must be at least 10 seconds apart
      if (crossings.length === 0 || points[i].time - points[crossings[crossings.length - 1]].time > 10000) {
        crossings.push(i)
      }
    }
  }

  const laps: Lap[] = []
  for (let c = 0; c < crossings.length - 1; c++) {
    const startIdx = crossings[c]
    const endIdx = crossings[c + 1]
    const lapPoints = points.slice(startIdx, endIdx + 1)

    if (lapPoints.length < 20) continue

    let distance = 0
    let maxSpeed = 0
    let totalSpeed = 0
    for (let i = 1; i < lapPoints.length; i++) {
      distance += haversineDistance(lapPoints[i - 1], lapPoints[i])
      maxSpeed = Math.max(maxSpeed, lapPoints[i].speed)
      totalSpeed += lapPoints[i].speed
    }

    laps.push({
      id: laps.length + 1,
      points: lapPoints,
      startTime: lapPoints[0].time,
      endTime: lapPoints[lapPoints.length - 1].time,
      duration: (lapPoints[lapPoints.length - 1].time - lapPoints[0].time) / 1000,
      distance,
      maxSpeed,
      avgSpeed: totalSpeed / (lapPoints.length - 1),
    })
  }

  return laps
}

function detectCorners(points: GPSPoint[]): Corner[] {
  if (points.length < 20) return []

  const corners: Corner[] = []
  const windowSize = 10
  let inCorner = false
  let cornerStart = 0
  let minSpeed = Infinity
  let minSpeedIdx = 0

  // Detect speed dips as corners
  const avgSpeed = points.reduce((s, p) => s + p.speed, 0) / points.length
  const threshold = avgSpeed * 0.7

  for (let i = windowSize; i < points.length - windowSize; i++) {
    const localAvg =
      points.slice(i - windowSize, i + windowSize).reduce((s, p) => s + p.speed, 0) /
      (windowSize * 2)

    if (localAvg < threshold && !inCorner) {
      inCorner = true
      cornerStart = i
      minSpeed = points[i].speed
      minSpeedIdx = i
    } else if (inCorner && localAvg < threshold) {
      if (points[i].speed < minSpeed) {
        minSpeed = points[i].speed
        minSpeedIdx = i
      }
    } else if (inCorner && localAvg >= threshold) {
      inCorner = false
      const cornerEnd = i

      if (cornerEnd - cornerStart > 5) {
        const entryIdx = Math.max(0, cornerStart - 3)
        const exitIdx = Math.min(points.length - 1, cornerEnd + 3)

        corners.push({
          id: corners.length + 1,
          name: `T${corners.length + 1}`,
          startIndex: cornerStart,
          endIndex: cornerEnd,
          entrySpeed: points[entryIdx].speed * 3.6,
          minSpeed: minSpeed * 3.6,
          exitSpeed: points[exitIdx].speed * 3.6,
          duration: (points[cornerEnd].time - points[cornerStart].time) / 1000,
        })
      }

      minSpeed = Infinity
    }
  }

  return corners
}

function analyzeLap(lap: Lap, corners: Corner[]): LapAnalysis {
  const lapCorners: Corner[] = corners.map((c) => {
    // Remap corner indices relative to this lap's points
    const lapPoints = lap.points
    let bestStart = 0
    let bestDist = Infinity

    // Find closest point to corner apex in this lap
    const refIdx = Math.floor((c.startIndex + c.endIndex) / 2)
    if (refIdx >= lapPoints.length) return c

    for (let i = 0; i < lapPoints.length; i++) {
      const d = haversineDistance(lapPoints[i], lapPoints[Math.min(refIdx, lapPoints.length - 1)])
      if (d < bestDist) {
        bestDist = d
        bestStart = i
      }
    }

    const halfLen = Math.floor((c.endIndex - c.startIndex) / 2)
    const start = Math.max(0, bestStart - halfLen)
    const end = Math.min(lapPoints.length - 1, bestStart + halfLen)

    let minSpd = Infinity
    for (let i = start; i <= end; i++) {
      minSpd = Math.min(minSpd, lapPoints[i].speed)
    }

    const entryIdx = Math.max(0, start - 3)
    const exitIdx = Math.min(lapPoints.length - 1, end + 3)

    return {
      ...c,
      startIndex: start,
      endIndex: end,
      entrySpeed: lapPoints[entryIdx].speed * 3.6,
      minSpeed: minSpd * 3.6,
      exitSpeed: lapPoints[exitIdx].speed * 3.6,
      duration: (lapPoints[end].time - lapPoints[start].time) / 1000,
    }
  })

  const sectorTimes = lapCorners.map((c) => c.duration)

  return { lap, corners: lapCorners, sectorTimes }
}

type ProcessingStage = 'idle' | 'parsing' | 'smoothing' | 'detecting-sf' | 'picking-sf' | 'detecting-laps' | 'detecting-corners' | 'analyzing' | 'done'

function App() {
  const [currentSession, setCurrentSession] = useState<TrainingSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(() => {
    try {
      const saved = localStorage.getItem('kartpro-ai-config')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle')
  const [rawPoints, setRawPoints] = useState<GPSPoint[]>([])
  const [smoothedPoints, setSmoothedPoints] = useState<GPSPoint[]>([])
  const [autoDetectedSF, setAutoDetectedSF] = useState<{ lat1: number; lng1: number; lat2: number; lng2: number } | null>(null)

  useEffect(() => {
    if (aiConfig) {
      localStorage.setItem('kartpro-ai-config', JSON.stringify(aiConfig))
    } else {
      localStorage.removeItem('kartpro-ai-config')
    }
  }, [aiConfig])

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null)
    setIsLoading(true)
    setCurrentSession(null)

    try {
      setLoadingStage('Extracting GPS data from video...')
      setProcessingStage('parsing')
      const points = await parseGPSFromFile(file)
      setRawPoints(points)

      setLoadingStage('Smoothing GPS track...')
      setProcessingStage('smoothing')
      const smooth = smoothPoints(points)
      setSmoothedPoints(smooth)

      setLoadingStage('Detecting start/finish line...')
      setProcessingStage('detecting-sf')
      const sf = detectStartFinishLine(smooth)
      setAutoDetectedSF(sf)

      // Show the start/finish picker
      setProcessingStage('picking-sf')
      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file')
      setIsLoading(false)
      setProcessingStage('idle')
    }
  }, [])

  const handleStartFinishConfirm = useCallback(
    (sf: { lat1: number; lng1: number; lat2: number; lng2: number }) => {
      setIsLoading(true)

      setLoadingStage('Detecting laps...')
      setProcessingStage('detecting-laps')
      const laps = detectLaps(smoothedPoints, sf)

      if (laps.length === 0) {
        setError('No laps detected. Try adjusting the start/finish line position.')
        setIsLoading(false)
        setProcessingStage('picking-sf')
        return
      }

      setLoadingStage('Detecting corners...')
      setProcessingStage('detecting-corners')
      // Use the fastest lap to detect corners
      const fastestLap = laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), laps[0])
      const corners = detectCorners(fastestLap.points)

      setLoadingStage('Analyzing laps...')
      setProcessingStage('analyzing')
      const analyses: LapAnalysis[] = laps.map((lap) => analyzeLap(lap, corners))

      const session: TrainingSession = {
        id: crypto.randomUUID(),
        filename: 'session',
        date: new Date(laps[0].startTime),
        laps,
        analyses,
        startFinishLine: sf,
      }

      setCurrentSession(session)
      setIsLoading(false)
      setLoadingStage('')
      setProcessingStage('done')
    },
    [smoothedPoints]
  )

  const handleNewSession = useCallback(() => {
    setCurrentSession(null)
    setIsLoading(false)
    setLoadingStage('')
    setError(null)
    setProcessingStage('idle')
    setRawPoints([])
    setSmoothedPoints([])
    setAutoDetectedSF(null)
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 text-red-100 px-6 py-3 rounded-lg shadow-lg max-w-lg">
          <div className="flex items-center gap-3">
            <span className="text-red-400 font-bold">Error</span>
            <span className="text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-300 hover:text-red-100"
            >
              x
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-40 bg-gray-950/80 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300 text-sm">{loadingStage}</p>
          </div>
        </div>
      )}

      {processingStage === 'picking-sf' && !isLoading && (
        <StartFinishPicker
          points={smoothedPoints}
          autoDetected={autoDetectedSF}
          onConfirm={handleStartFinishConfirm}
        />
      )}

      {processingStage === 'idle' && !currentSession && !isLoading && (
        <FileUpload onFileSelect={handleFileSelect} />
      )}

      {currentSession && (
        <Layout
          session={currentSession}
          aiConfig={aiConfig}
          onAiConfigChange={setAiConfig}
          onNewSession={handleNewSession}
        />
      )}
    </div>
  )
}

export default App
