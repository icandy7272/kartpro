import { useState, useMemo, useCallback, useRef } from 'react'
import type { TrainingSession, AIConfig, Corner, LapAnalysis, Lap, GPSPoint, TrackProfile, BrakeThrottlePoint } from '../types'
import { analyzeRacingLine } from '../lib/analysis/racing-line-analysis'
import { getLapColor } from '../lib/lap-colors'
import { getTrackProfiles, deleteTrackProfile } from '../lib/track-profiles'
import { parseGeoJSONFile, parseGPSFromFile } from '../lib/gps-parser'
import { parseVBO } from '../lib/vbo-parser'
import { detectLaps } from '../lib/analysis/lap-detection'
import { exportToPDF } from '../lib/pdf-export'
import TrackMap from './TrackMap'
import LapList from './LapList'
import SpeedChart from './SpeedChart'
import CornerTable from './CornerTable'
import AICoach from './AICoach'
import ComparisonReport from './ComparisonReport'

interface LayoutProps {
  session: TrainingSession
  aiConfig: AIConfig | null
  onAiConfigChange: (config: AIConfig | null) => void
  onNewSession: () => void
  onUpdateSession: (session: TrainingSession) => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
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

function reanalyzeLap(lap: Lap, corners: Corner[], refPoints: GPSPoint[]): LapAnalysis {
  const lapCorners: Corner[] = corners.map((c, ci) => {
    const lapPoints = lap.points
    const refMidIdx = Math.min(Math.floor((c.startIndex + c.endIndex) / 2), refPoints.length - 1)
    const refPoint = refPoints[refMidIdx]

    let bestStart = 0
    let bestDist = Infinity
    for (let i = 0; i < lapPoints.length; i++) {
      const d = haversineDistance(lapPoints[i], refPoint)
      if (d < bestDist) { bestDist = d; bestStart = i }
    }
    const halfLen = Math.floor((c.endIndex - c.startIndex) / 2)
    const start = Math.max(0, bestStart - halfLen)
    const end = Math.min(lapPoints.length - 1, bestStart + halfLen)
    let minSpd = Infinity
    for (let i = start; i <= end; i++) minSpd = Math.min(minSpd, lapPoints[i].speed)
    const entryIdx = Math.max(0, start - 3)
    const exitIdx = Math.min(lapPoints.length - 1, end + 3)
    return {
      ...c,
      startIndex: start,
      endIndex: end,
      entrySpeed: lapPoints[entryIdx].speed * 3.6,
      minSpeed: minSpd * 3.6,
      exitSpeed: lapPoints[exitIdx].speed * 3.6,
      duration: 0, // will be recalculated below
    }
  })

  // Sector timing: from previous corner exit to this corner exit
  for (let i = 0; i < lapCorners.length; i++) {
    const lapPoints = lap.points
    const sectorStart = i === 0 ? 0 : lapCorners[i - 1].endIndex
    const sectorEnd = lapCorners[i].endIndex
    if (sectorStart < lapPoints.length && sectorEnd < lapPoints.length) {
      lapCorners[i].duration = (lapPoints[sectorEnd].time - lapPoints[sectorStart].time) / 1000
    }
  }

  return { lap, corners: lapCorners, sectorTimes: lapCorners.map((c) => c.duration) }
}

export default function Layout({ session, aiConfig, onAiConfigChange, onNewSession, onUpdateSession }: LayoutProps) {
  const fastestLap = useMemo(
    () => session.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), session.laps[0]),
    [session.laps]
  )

  const [selectedLapIds, setSelectedLapIds] = useState<number[]>([fastestLap.id])
  const [isAddingCorner, setIsAddingCorner] = useState(false)
  const [hoverPointIndex, setHoverPointIndex] = useState<number | null>(null)
  const [showProfileManager, setShowProfileManager] = useState(false)
  const [savedProfiles, setSavedProfiles] = useState<TrackProfile[]>(() => getTrackProfiles())
  const [comparisonMode, setComparisonMode] = useState(false)
  const [comparisonLaps, setComparisonLaps] = useState<[number, number] | null>(null)

  // Cross-file comparison state
  const [secondaryLaps, setSecondaryLaps] = useState<Lap[] | null>(null)
  const [secondaryAnalyses, setSecondaryAnalyses] = useState<LapAnalysis[] | null>(null)
  const [secondaryFilename, setSecondaryFilename] = useState<string>('')
  const [showLapPicker, setShowLapPicker] = useState(false)
  const [secondaryProcessing, setSecondaryProcessing] = useState(false)
  const [secondaryError, setSecondaryError] = useState<string | null>(null)
  const [crossFileComparison, setCrossFileComparison] = useState<{ lap: Lap; analysis: LapAnalysis } | null>(null)
  const secondaryFileInputRef = useRef<HTMLInputElement>(null)

  const handleDeleteProfile = useCallback((id: string) => {
    deleteTrackProfile(id)
    setSavedProfiles(getTrackProfiles())
  }, [])

  // Colors are now managed by shared getLapColor utility

  const allCorners = useMemo(() => {
    const fastest = session.analyses.find((a) => a.lap.id === fastestLap.id)
    return fastest?.corners ?? []
  }, [session.analyses, fastestLap.id])

  const handleAddCorner = useCallback((lat: number, lng: number) => {
    const fastLap = session.laps.find(l => l.id === fastestLap.id)
    if (!fastLap) return

    // Find closest point on the fastest lap
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < fastLap.points.length; i++) {
      const d = haversineDistance(fastLap.points[i], { lat, lng, speed: 0, time: 0, altitude: 0 })
      if (d < closestDist) { closestDist = d; closestIdx = i }
    }

    // Create corner region: ±8 points around the click
    const halfSize = 8
    const startIdx = Math.max(0, closestIdx - halfSize)
    const endIdx = Math.min(fastLap.points.length - 1, closestIdx + halfSize)
    const cornerPoints = fastLap.points.slice(startIdx, endIdx + 1)
    const speeds = cornerPoints.map(p => p.speed)
    const minSpd = Math.min(...speeds)
    const entryIdx = Math.max(0, startIdx - 1)
    const exitIdx = Math.min(fastLap.points.length - 1, endIdx + 1)

    // Insert into correct position (sorted by startIndex)
    const newCorners = [...session.corners]
    const newCorner: Corner = {
      id: 0, // will be reassigned
      name: '',
      startIndex: startIdx,
      endIndex: endIdx,
      entrySpeed: fastLap.points[entryIdx].speed * 3.6,
      minSpeed: minSpd * 3.6,
      exitSpeed: fastLap.points[exitIdx].speed * 3.6,
      duration: (fastLap.points[endIdx].time - fastLap.points[startIdx].time) / 1000,
    }
    newCorners.push(newCorner)
    newCorners.sort((a, b) => a.startIndex - b.startIndex)

    // Renumber
    newCorners.forEach((c, i) => { c.id = i + 1; c.name = `T${i + 1}` })

    // Re-analyze all laps
    const analyses = session.laps.map(lap => reanalyzeLap(lap, newCorners, fastestLap.points))
    onUpdateSession({ ...session, corners: newCorners, analyses })
    setIsAddingCorner(false)
  }, [session, fastestLap.id, onUpdateSession])

  const handleDeleteCorner = useCallback((cornerId: number) => {
    const newCorners = session.corners.filter(c => c.id !== cornerId)
    newCorners.forEach((c, i) => { c.id = i + 1; c.name = `T${i + 1}` })
    const analyses = session.laps.map(lap => reanalyzeLap(lap, newCorners, fastestLap.points))
    onUpdateSession({ ...session, corners: newCorners, analyses })
  }, [session, onUpdateSession])

  const handleCompare = useCallback((lap1Id: number, lap2Id: number) => {
    setComparisonLaps([lap1Id, lap2Id])
    setComparisonMode(true)
  }, [])

  const handleCloseComparison = useCallback(() => {
    setComparisonMode(false)
    setComparisonLaps(null)
    setCrossFileComparison(null)
  }, [])

  // Process secondary file for cross-file comparison
  const handleSecondaryFile = useCallback(async (file: File) => {
    if (!session.startFinishLine) {
      setSecondaryError('当前会话没有起终线数据，无法进行跨文件对比')
      return
    }

    setSecondaryProcessing(true)
    setSecondaryError(null)

    try {
      const nameLower = file.name.toLowerCase()
      const isGeoJSON = nameLower.endsWith('.geojson') || nameLower.endsWith('.json')
      const isVBO = nameLower.endsWith('.vbo')

      let points: GPSPoint[]
      if (isVBO) {
        const text = await file.text()
        const vboResult = parseVBO(text)
        points = vboResult.points
      } else if (isGeoJSON) {
        points = await parseGeoJSONFile(file)
      } else {
        points = await parseGPSFromFile(file)
      }

      // Smooth the data (same as App.tsx smoothPoints)
      const windowSize = 5
      const half = Math.floor(windowSize / 2)
      const smooth = points.map((p, i) => {
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
        return { ...p, lat: sumLat / count, lng: sumLng / count, speed: sumSpeed / count, altitude: sumAlt / count }
      })

      // Detect laps using the SAME start/finish line
      const laps = detectLaps(smooth, session.startFinishLine)

      if (laps.length === 0) {
        setSecondaryError('未在该文件中检测到有效圈数。请确保文件数据来自同一赛道。')
        setSecondaryProcessing(false)
        return
      }

      // Get reference points from the current session's fastest lap for corner mapping
      const refFastestLap = session.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), session.laps[0])
      const refPoints = refFastestLap.points

      // Analyze each lap using the current session's corners
      const analyses = laps.map(lap => reanalyzeLap(lap, session.corners, refPoints))

      setSecondaryLaps(laps)
      setSecondaryAnalyses(analyses)
      setSecondaryFilename(file.name)
      setShowLapPicker(true)
      setSecondaryProcessing(false)
    } catch (err) {
      setSecondaryError(err instanceof Error ? err.message : '处理对比文件失败')
      setSecondaryProcessing(false)
    }
  }, [session])

  // Handle selecting a lap from the secondary file for cross-file comparison
  const handleSelectSecondaryLap = useCallback((lapId: number) => {
    if (selectedLapIds.length !== 1) {
      setSecondaryError('请先在圈列表中选择一圈作为基准')
      return
    }

    if (!secondaryLaps || !secondaryAnalyses) return

    const secLap = secondaryLaps.find(l => l.id === lapId)
    const secAnalysis = secondaryAnalyses.find(a => a.lap.id === lapId)
    if (!secLap || !secAnalysis) return

    setCrossFileComparison({ lap: secLap, analysis: secAnalysis })
    setShowLapPicker(false)

    // Enter comparison mode
    setComparisonMode(true)
    setComparisonLaps(null) // null signals cross-file mode
  }, [selectedLapIds, secondaryLaps, secondaryAnalyses])

  // Get hover positions for ALL selected laps
  const hoverPositions = useMemo(() => {
    if (hoverPointIndex === null) return null
    const positions: Array<{ lat: number; lng: number; color: string }> = []
    const selected = session.laps.filter(l => selectedLapIds.includes(l.id))
    selected.forEach((lap, idx) => {
      if (hoverPointIndex < lap.points.length) {
        const p = lap.points[hoverPointIndex]
        const color = getLapColor(lap.id, selectedLapIds, fastestLap.id)
        positions.push({ lat: p.lat, lng: p.lng, color })
      }
    })
    return positions.length > 0 ? positions : null
  }, [hoverPointIndex, session.laps, selectedLapIds, fastestLap.id])

  // Compute brake/throttle points for the selected lap's racing line analysis
  const { brakePoints, throttlePoints } = useMemo(() => {
    // Only show when exactly 1 non-fastest lap is selected, or when fastest + 1 other is selected
    const nonFastestSelected = selectedLapIds.filter(id => id !== fastestLap.id)
    if (nonFastestSelected.length !== 1) return { brakePoints: undefined, throttlePoints: undefined }

    const compLapId = nonFastestSelected[0]
    const compLap = session.laps.find(l => l.id === compLapId)
    const compAnalysis = session.analyses.find(a => a.lap.id === compLapId)
    const refAnalysis = session.analyses.find(a => a.lap.id === fastestLap.id)

    if (!compLap || !compAnalysis || !refAnalysis) return { brakePoints: undefined, throttlePoints: undefined }

    const rla = analyzeRacingLine(fastestLap, compLap, refAnalysis, compAnalysis, session.corners)

    const brakePts: BrakeThrottlePoint[] = []
    const throttlePts: BrakeThrottlePoint[] = []
    for (const c of rla.corners) {
      if (c.brakePoint) brakePts.push(c.brakePoint)
      if (c.throttlePoint) throttlePts.push(c.throttlePoint)
      if (c.refBrakePoint) brakePts.push(c.refBrakePoint)
      if (c.refThrottlePoint) throttlePts.push(c.refThrottlePoint)
    }

    return {
      brakePoints: brakePts.length > 0 ? brakePts : undefined,
      throttlePoints: throttlePts.length > 0 ? throttlePts : undefined,
    }
  }, [selectedLapIds, fastestLap, session])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-purple-400">KartPro</h1>
          <div className="h-5 w-px bg-gray-700" />
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>{session.filename}</span>
            <span>{session.date.toLocaleDateString()}</span>
            <span>{session.laps.length} 圈</span>
            <span className="text-purple-400 font-medium">
              最快: {formatTime(fastestLap.duration)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!comparisonMode && (
            <>
              <input
                ref={secondaryFileInputRef}
                type="file"
                accept=".mp4,.geojson,.vbo"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleSecondaryFile(file)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => secondaryFileInputRef.current?.click()}
                disabled={secondaryProcessing}
                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {secondaryProcessing ? '处理中...' : '导入对比'}
              </button>
            </>
          )}
          <button
            onClick={() => {
              exportToPDF({
                filename: `KartPro_${session.filename.replace(/\.[^.]+$/, '')}`,
                title: session.filename,
                date: session.date.toLocaleDateString(),
              })
            }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            导出PDF
          </button>
          <button
            onClick={() => { setSavedProfiles(getTrackProfiles()); setShowProfileManager(true) }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            赛道
          </button>
          <button
            onClick={onNewSession}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            新建
          </button>
        </div>
      </div>

      {/* Track Profile Manager Modal */}
      {showProfileManager && (
        <div className="fixed inset-0 z-[10000] bg-gray-950/80 flex items-center justify-center" onClick={() => setShowProfileManager(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100">已保存的赛道配置</h3>
              <button onClick={() => setShowProfileManager(false)} className="text-gray-400 hover:text-gray-200">x</button>
            </div>
            {savedProfiles.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">暂无已保存的赛道配置。完成赛道设置后将自动保存。</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {savedProfiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-200">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.corners.length} 个弯道 · 保存于 {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteProfile(p.id)}
                      className="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded transition-colors"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-600 mt-4">上传相同赛道的数据时，将自动加载已保存的起终线和弯道配置。</p>
          </div>
        </div>
      )}

      {/* Secondary file error toast */}
      {secondaryError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10001] bg-red-900/90 border border-red-700 text-red-100 px-6 py-3 rounded-lg shadow-lg max-w-lg">
          <div className="flex items-center gap-3">
            <span className="text-red-400 font-bold">错误</span>
            <span className="text-sm">{secondaryError}</span>
            <button
              onClick={() => setSecondaryError(null)}
              className="ml-auto text-red-300 hover:text-red-100"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* Lap picker modal for secondary file */}
      {showLapPicker && secondaryLaps && secondaryLaps.length > 0 && (
        <div className="fixed inset-0 z-[10000] bg-gray-950/80 flex items-center justify-center" onClick={() => setShowLapPicker(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100">选择对比圈 — {secondaryFilename}</h3>
              <button onClick={() => setShowLapPicker(false)} className="text-gray-400 hover:text-gray-200">x</button>
            </div>
            <p className="text-xs text-yellow-400 mb-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
              请先在左侧圈列表中选择一圈作为基准
            </p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {(() => {
                const fastestSecLap = secondaryLaps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), secondaryLaps[0])
                return secondaryLaps.map((lap) => {
                  const isFastest = lap.id === fastestSecLap.id
                  return (
                    <div
                      key={lap.id}
                      className="flex items-center justify-between bg-gray-800 hover:bg-gray-750 rounded-lg px-4 py-3 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-200">
                          第 {lap.id} 圈
                        </span>
                        {isFastest && <span className="text-yellow-400 text-xs">★</span>}
                        <span className="text-sm font-mono text-gray-400">
                          {formatTime(lap.duration)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleSelectSecondaryLap(lap.id)}
                        className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                      >
                        选择
                      </button>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel (60%) */}
        <div className="w-3/5 flex flex-col overflow-hidden border-r border-gray-800">
          {/* Map */}
          <div className="h-1/2 p-3 pb-1.5">
            <div className="h-full rounded-lg overflow-hidden border border-gray-800 relative">
              <TrackMap
                laps={session.laps}
                selectedLapIds={selectedLapIds}
                corners={allCorners}
                fastestLapId={fastestLap.id}
                isAddingCorner={isAddingCorner}
                onAddCorner={handleAddCorner}
                onDeleteCorner={handleDeleteCorner}
                hoverPositions={hoverPositions}
                startFinishLine={session.startFinishLine}
                brakePoints={brakePoints}
                throttlePoints={throttlePoints}
              />
              {/* Corner editing toolbar */}
              <div className="absolute top-2 right-2 z-[1000] flex gap-2">
                <button
                  onClick={() => setIsAddingCorner(!isAddingCorner)}
                  className={`px-3 py-1.5 text-xs rounded-lg shadow-lg transition-colors ${
                    isAddingCorner
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
                  }`}
                >
                  {isAddingCorner ? '点击地图添加弯道...' : '+ 添加弯道'}
                </button>
                {isAddingCorner && (
                  <button
                    onClick={() => setIsAddingCorner(false)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-800/90 text-gray-400 hover:bg-gray-700/90"
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom section: LapList + Charts */}
          <div className="h-1/2 flex overflow-hidden p-3 pt-1.5 gap-3">
            {/* Lap list */}
            <div className="w-1/3 overflow-y-auto bg-gray-900 rounded-lg border border-gray-800" data-pdf-section="lap-list">
              <LapList
                laps={session.laps}
                fastestLapId={fastestLap.id}
                selectedLapIds={selectedLapIds}
                onSelectionChange={setSelectedLapIds}
                onCompare={handleCompare}
              />
            </div>

            {/* Charts */}
            <div className="w-2/3 flex flex-col gap-3 overflow-hidden">
              <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden" data-pdf-section="speed-chart">
                <SpeedChart
                  analyses={session.analyses}
                  selectedLapIds={selectedLapIds}
                  fastestLapId={fastestLap.id}
                  onHoverIndex={setHoverPointIndex}
                />
              </div>
              <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 overflow-y-auto" data-pdf-section="corner-table">
                <CornerTable
                  analyses={session.analyses}
                  selectedLapIds={selectedLapIds}
                  fastestLapId={fastestLap.id}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right panel (40%) */}
        <div className="w-2/5 overflow-hidden" data-pdf-section="analysis">
          {comparisonMode && comparisonLaps ? (() => {
            // Same-file comparison
            const lap1 = session.laps.find(l => l.id === comparisonLaps[0])
            const lap2 = session.laps.find(l => l.id === comparisonLaps[1])
            const analysis1 = session.analyses.find(a => a.lap.id === comparisonLaps[0])
            const analysis2 = session.analyses.find(a => a.lap.id === comparisonLaps[1])
            if (lap1 && lap2 && analysis1 && analysis2) {
              return (
                <ComparisonReport
                  lap1={lap1}
                  lap2={lap2}
                  analysis1={analysis1}
                  analysis2={analysis2}
                  corners={allCorners}
                  onClose={handleCloseComparison}
                />
              )
            }
            return null
          })() : comparisonMode && crossFileComparison ? (() => {
            // Cross-file comparison
            const primaryLapId = selectedLapIds[0]
            const lap1 = session.laps.find(l => l.id === primaryLapId)
            const analysis1 = session.analyses.find(a => a.lap.id === primaryLapId)
            if (lap1 && analysis1) {
              return (
                <ComparisonReport
                  lap1={lap1}
                  lap2={crossFileComparison.lap}
                  analysis1={analysis1}
                  analysis2={crossFileComparison.analysis}
                  corners={allCorners}
                  onClose={handleCloseComparison}
                />
              )
            }
            return null
          })() : (
            <AICoach
              analyses={session.analyses}
              aiConfig={aiConfig}
              onConfigChange={onAiConfigChange}
            />
          )}
        </div>
      </div>
    </div>
  )
}
