import { useState, useCallback, useEffect } from 'react'

// Polyfill for HTTP environments where crypto.randomUUID is unavailable
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
import type { TrainingSession, AIConfig, Lap, Corner, GPSPoint, TrackProfile } from './types'
import { parseGPSFromFile, parseGeoJSONFile } from './lib/gps-parser'
import { parseVBO } from './lib/vbo-parser'
import { detectCorners } from './lib/analysis/corner-detection'
import { analyzeTrack } from './lib/analysis/track-analysis'
import { rebuildSessionDerivedData } from './lib/analysis/session-derived-data'
import { findMatchingProfile, saveTrackProfile, calculateCenter } from './lib/track-profiles'
import { saveSession, getSessionSummaries, getSession, deleteSession, type SessionSummary } from './lib/storage'
import FileUpload from './components/FileUpload'
import Layout from './components/Layout'
import TrackSetup from './components/TrackSetup'

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

/** Remove consecutive duplicate GPS points (same lat, lng, time). */
function deduplicateConsecutivePoints(points: GPSPoint[]): GPSPoint[] {
  if (points.length <= 1) return points
  const result = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    if (curr.lat !== prev.lat || curr.lng !== prev.lng || curr.time !== prev.time) {
      result.push(curr)
    }
  }
  return result
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

// Use the interpolated lap detection from lap-detection.ts
// Re-exported here for compatibility with components that expect this signature
import { detectLaps as _detectLapsInterpolated } from './lib/analysis/lap-detection'

function detectLaps(
  points: GPSPoint[],
  startFinish: { lat1: number; lng1: number; lat2: number; lng2: number }
): Lap[] {
  return _detectLapsInterpolated(points, startFinish)
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
  const [, setRawPoints] = useState<GPSPoint[]>([])
  const [smoothedPoints, setSmoothedPoints] = useState<GPSPoint[]>([])
  const [autoDetectedSF, setAutoDetectedSF] = useState<{ lat1: number; lng1: number; lat2: number; lng2: number } | null>(null)
  const [currentFilename, setCurrentFilename] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [matchedProfile, setMatchedProfile] = useState<TrackProfile | null>(null)
  const [historySessions, setHistorySessions] = useState<SessionSummary[]>([])

  // Load history on mount
  useEffect(() => {
    getSessionSummaries().then(setHistorySessions).catch(() => {})
  }, [])

  const refreshHistory = useCallback(() => {
    getSessionSummaries().then(setHistorySessions).catch(() => {})
  }, [])

  const handleUpdateSession = useCallback((updated: TrainingSession | null) => {
    setCurrentSession(updated)
    if (updated) {
      saveSession(updated).then(refreshHistory).catch(() => {})
    }
  }, [refreshHistory])

  const handleLoadSession = useCallback(async (id: string) => {
    setIsLoading(true)
    setLoadingStage('正在加载历史数据...')
    try {
      const session = await getSession(id)
      if (session) {
        setCurrentSession(session)
        setProcessingStage('done')
      }
    } catch {
      setError('加载历史数据失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await deleteSession(id)
      refreshHistory()
    } catch {
      setError('删除历史数据失败')
    }
  }, [refreshHistory])

  useEffect(() => {
    if (aiConfig) {
      localStorage.setItem('kartpro-ai-config', JSON.stringify(aiConfig))
    } else {
      localStorage.removeItem('kartpro-ai-config')
    }
  }, [aiConfig])

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null)
    setIsLoading(true)
    setCurrentSession(null)

    try {
      setCurrentFilename(file.name)
      setLoadingStage('正在提取 GPS 数据...')
      setProcessingStage('parsing')

      // Yield to let React render the loading state
      await new Promise(r => setTimeout(r, 0))

      const nameLower = file.name.toLowerCase()
      const isGeoJSON = nameLower.endsWith('.geojson') || nameLower.endsWith('.json')
      const isVBO = nameLower.endsWith('.vbo')
      const isVideo = nameLower.endsWith('.mp4')

      let points: GPSPoint[]
      let vboStartFinishLine: { lat1: number; lng1: number; lat2: number; lng2: number } | undefined

      if (isVBO) {
        const text = await file.text()
        const vboResult = parseVBO(text)
        points = vboResult.points
        vboStartFinishLine = vboResult.startFinishLine

        // Remove duplicate consecutive points from flatMap lap junctions
        points = deduplicateConsecutivePoints(points)

        // VBO exported via laps.flatMap ends exactly at the last crossing index,
        // missing the point just past the S/F crossing. Extrapolate one data point
        // so the final crossing is detectable.
        if (vboStartFinishLine && points.length >= 2) {
          const last = points[points.length - 1]
          const prev = points[points.length - 2]
          const dt = last.time - prev.time
          if (dt > 0) {
            points = [...points, {
              lat: 2 * last.lat - prev.lat,
              lng: 2 * last.lng - prev.lng,
              speed: last.speed,
              time: last.time + dt,
              altitude: last.altitude,
            }]
          }
        }
      } else if (isGeoJSON) {
        points = await parseGeoJSONFile(file)
      } else if (isVideo) {
        // Video file — use smart extraction that only reads metadata (moov atom)
        // Works with any file size (4GB, 8GB, etc.) without loading the video stream
        const sizeMB = file.size / (1024 * 1024)
        setLoadingStage(`视频 ${sizeMB > 1024 ? (sizeMB / 1024).toFixed(1) + 'GB' : sizeMB.toFixed(0) + 'MB'}，正在提取 GPS 数据...`)
        await new Promise(r => setTimeout(r, 50))

        points = await parseGPSFromFile(file, (msg) => {
          setLoadingStage(msg)
        })

        setLoadingStage(`已提取 ${points.length} 个 GPS 点`)
        await new Promise(r => setTimeout(r, 50))
      } else {
        points = await parseGPSFromFile(file)
      }
      setRawPoints(points)

      setLoadingStage('正在平滑 GPS 轨迹...')
      setProcessingStage('smoothing')
      await new Promise(r => setTimeout(r, 0))

      // VBO data is already from a previous smooth pass; re-smoothing shifts
      // the first point across the S/F line, causing the first lap crossing to be missed.
      const smooth = isVBO ? points : smoothPoints(points)
      setSmoothedPoints(smooth)

      // Check for matching saved track profile
      const profile = findMatchingProfile(points)
      setMatchedProfile(profile)

      // Try automatic track analysis first
      setLoadingStage('正在自动分析赛道...')
      setProcessingStage('analyzing')
      await new Promise(r => setTimeout(r, 0))

      let autoAnalysisSucceeded = false
      try {
        const trackResult = analyzeTrack(points)

        // Use VBO start/finish line if available, then saved profile, then auto-detected
        const sf = vboStartFinishLine ?? (profile ? profile.startFinishLine : trackResult.startFinishLine)
        const laps = detectLaps(smooth, sf)

        if (laps.length > 0) {
          // Convert TrackAnalysisCorner[] to Corner[] using the fastest lap's points
          const fastestLap = laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), laps[0])
          const lapPts = fastestLap.points

          const classifyCorner = (angleDeg: number): string => {
            if (angleDeg >= 90) return '发卡弯'
            if (angleDeg >= 60) return '低速弯'
            if (angleDeg >= 30) return '中速弯'
            return '高速弯'
          }

          const corners: Corner[] = trackResult.corners.map((tc, idx) => {
            // Map track-analysis indices (relative to representative lap) to nearest lap points
            // by using arc distance ratios
            const ratio = tc.apexDistance / trackResult.trackLength
            const approxApexIdx = Math.round(ratio * (lapPts.length - 1))
            const cornerHalfLen = Math.max(5, Math.round(((tc.endIndex - tc.startIndex) / 2) * (lapPts.length / trackResult.trackLength * trackResult.sampleSpacing)))
            const startIdx = Math.max(0, approxApexIdx - cornerHalfLen)
            const endIdx = Math.min(lapPts.length - 1, approxApexIdx + cornerHalfLen)
            const apexIdx = Math.min(approxApexIdx, lapPts.length - 1)

            let minSpd = Infinity
            for (let i = startIdx; i <= endIdx; i++) {
              minSpd = Math.min(minSpd, lapPts[i].speed)
            }

            const entryIdx = Math.max(0, startIdx - 3)
            const exitIdx = Math.min(lapPts.length - 1, endIdx + 3)

            return {
              id: idx + 1,
              name: tc.name,
              startIndex: startIdx,
              endIndex: endIdx,
              midpointIndex: apexIdx,
              apexIndex: apexIdx,
              apexDistance: tc.apexDistance,
              direction: tc.direction,
              angle: tc.angleDeg,
              type: classifyCorner(tc.angleDeg),
              entrySpeed: lapPts[entryIdx].speed * 3.6,
              minSpeed: minSpd * 3.6,
              exitSpeed: lapPts[exitIdx].speed * 3.6,
              duration: (lapPts[Math.min(endIdx, lapPts.length - 1)].time - lapPts[startIdx].time) / 1000,
            }
          })

          const derived = rebuildSessionDerivedData({
            laps,
            corners,
            startFinishLine: { lat1: sf.lat1, lng1: sf.lng1, lat2: sf.lat2, lng2: sf.lng2 },
            filename: file.name,
            date: new Date(laps[0].startTime),
            trackId: profile?.id ?? file.name,
          })

          const session: TrainingSession = {
            id: generateId(),
            filename: file.name,
            date: new Date(laps[0].startTime),
            laps,
            analyses: derived.analyses,
            corners,
            startFinishLine: { lat1: sf.lat1, lng1: sf.lng1, lat2: sf.lat2, lng2: sf.lng2 },
            points: smooth,
            trackSemantics: derived.trackSemantics,
          }

          setCurrentSession(session)
          setProcessingStage('done')
          setIsLoading(false)
          autoAnalysisSucceeded = true

          // Save to history
          saveSession(session).then(refreshHistory).catch(() => {})

          // Save/update track profile
          const center = calculateCenter(points)
          const cornerPositions = corners.map((c) => ({
            lat: lapPts[Math.min(c.apexIndex ?? Math.floor((c.startIndex + c.endIndex) / 2), lapPts.length - 1)].lat,
            lng: lapPts[Math.min(c.apexIndex ?? Math.floor((c.startIndex + c.endIndex) / 2), lapPts.length - 1)].lng,
            name: c.name,
          }))
          const now = Date.now()
          saveTrackProfile({
            id: profile?.id ?? generateId(),
            name: profile?.name ?? file.name.replace(/\.[^.]+$/, ''),
            centerLat: center.lat,
            centerLng: center.lng,
            startFinishLine: sf,
            corners: cornerPositions,
            createdAt: profile?.createdAt ?? now,
            updatedAt: now,
          })

          if (profile) {
            setToast(`已识别赛道：${profile.name}，已自动加载起终线和弯道配置`)
          }
        }
      } catch {
        // Auto analysis failed, fall through to manual setup
      }

      if (!autoAnalysisSucceeded) {
        // Fall back to manual TrackSetup flow
        setLoadingStage('正在检测起终点线...')
        setProcessingStage('detecting-sf')
        await new Promise(r => setTimeout(r, 0))

        // Prefer VBO-embedded SF line, then saved profile, fall back to auto-detection
        const sf = vboStartFinishLine ?? (profile ? profile.startFinishLine : null) ?? detectStartFinishLine(smooth)
        setAutoDetectedSF(sf)

        if (profile) {
          setToast(`已识别赛道：${profile.name}，已自动加载起终线配置`)
        }

        setProcessingStage('picking-sf')
        setIsLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件处理失败')
      setIsLoading(false)
      setProcessingStage('idle')
    }
  }, [])

  const handleTrackSetupComplete = useCallback(
    (data: { startFinishLine: { lat1: number; lng1: number; lat2: number; lng2: number }; laps: Lap[]; corners: Corner[]; trackName?: string }) => {
      const derived = rebuildSessionDerivedData({
        laps: data.laps,
        corners: data.corners,
        startFinishLine: data.startFinishLine,
        filename: currentFilename,
        date: new Date(data.laps[0].startTime),
        trackId: matchedProfile?.id ?? data.trackName ?? currentFilename,
      })
      const fastestLap = data.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), data.laps[0])

      const session: TrainingSession = {
        id: generateId(),
        filename: currentFilename,
        date: new Date(data.laps[0].startTime),
        laps: data.laps,
        analyses: derived.analyses,
        corners: data.corners,
        startFinishLine: data.startFinishLine,
        points: smoothedPoints.length > 0 ? smoothedPoints : undefined,
        trackSemantics: derived.trackSemantics,
      }

      setCurrentSession(session)
      setProcessingStage('done')

      // Save to history
      saveSession(session).then(refreshHistory).catch(() => {})

      // Save track profile from manual setup
      const lapPts = fastestLap.points
      const center = calculateCenter(smoothedPoints.length > 0 ? smoothedPoints : lapPts)
      const cornerPositions = data.corners.map((c) => ({
        lat: lapPts[Math.min(c.apexIndex ?? Math.floor((c.startIndex + c.endIndex) / 2), lapPts.length - 1)].lat,
        lng: lapPts[Math.min(c.apexIndex ?? Math.floor((c.startIndex + c.endIndex) / 2), lapPts.length - 1)].lng,
        name: c.name,
      }))
      const now = Date.now()
      saveTrackProfile({
        id: matchedProfile?.id ?? generateId(),
        name: data.trackName ?? matchedProfile?.name ?? currentFilename.replace(/\.[^.]+$/, ''),
        centerLat: center.lat,
        centerLng: center.lng,
        startFinishLine: data.startFinishLine,
        corners: cornerPositions,
        createdAt: matchedProfile?.createdAt ?? now,
        updatedAt: now,
      })
    },
    [currentFilename, smoothedPoints, matchedProfile]
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
    setToast(null)
    setMatchedProfile(null)
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] bg-red-900/90 border border-red-700 text-red-100 px-6 py-3 rounded-lg shadow-lg max-w-lg">
          <div className="flex items-center gap-3">
            <span className="text-red-400 font-bold">错误</span>
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

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] bg-green-900/90 border border-green-700 text-green-100 px-6 py-3 rounded-lg shadow-lg max-w-lg">
          <div className="flex items-center gap-3">
            <span className="text-green-400 font-bold">赛道识别</span>
            <span className="text-sm">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-auto text-green-300 hover:text-green-100"
            >
              x
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[10000] bg-gray-950/80 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300 text-sm">{loadingStage}</p>
          </div>
        </div>
      )}

      {processingStage === 'picking-sf' && !isLoading && (
        <TrackSetup
          points={smoothedPoints}
          autoDetected={autoDetectedSF}
          onComplete={handleTrackSetupComplete}
          detectLaps={detectLaps}
          detectCorners={detectCorners}
          matchedProfile={matchedProfile}
          defaultTrackName={matchedProfile?.name ?? currentFilename.replace(/\.[^.]+$/, '')}
        />
      )}

      {processingStage === 'idle' && !currentSession && !isLoading && (
        <FileUpload
          onFileSelect={handleFileSelect}
          historySessions={historySessions}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
        />
      )}

      {currentSession && (
        <Layout
          session={currentSession}
          aiConfig={aiConfig}
          onAiConfigChange={setAiConfig}
          onNewSession={handleNewSession}
          onUpdateSession={handleUpdateSession}
        />
      )}
    </div>
  )
}

export default App
