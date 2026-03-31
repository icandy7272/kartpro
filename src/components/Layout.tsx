import { useState, useMemo, useCallback, useRef } from 'react'
import type { TrainingSession, AIConfig, Corner, LapAnalysis, Lap, GPSPoint, TrackProfile, BrakeThrottlePoint } from '../types'
import { analyzeRacingLine } from '../lib/analysis/racing-line-analysis'
import { generateFullAnalysis } from '../lib/analysis/full-analysis'
import { getLapColor } from '../lib/lap-colors'
import { getTrackProfiles, deleteTrackProfile } from '../lib/track-profiles'
import { parseGeoJSONFile, parseGPSFromFile } from '../lib/gps-parser'
import { parseVBO } from '../lib/vbo-parser'
import { detectLaps } from '../lib/analysis/lap-detection'
import { rebuildSessionDerivedData } from '../lib/analysis/session-derived-data'
import {
  confirmSemanticTag,
  overrideSemanticTag,
  rejectSemanticTag,
  skipSemanticTag,
} from '../lib/analysis/semantic-actions'
import { exportToPDF } from '../lib/pdf-export'
import { exportToVBO } from '../lib/vbo-export'
import TrackMap from './TrackMap'
import LapList from './LapList'
import SpeedChart from './SpeedChart'
import CornerTable from './CornerTable'
import AICoach from './AICoach'
import ComparisonReport from './ComparisonReport'
import AnalysisReport from './AnalysisReport'
import RacingLineReport from './RacingLineReport'
import SemanticConfirmationPanel from './SemanticConfirmationPanel'
import type { RacingLineAnalysis } from '../types'
import type { SemanticTagType, TrackSemanticModel } from '../lib/analysis/semantic-types'

/** Remove consecutive duplicate GPS points from flatMap lap junctions. */
function deduplicateForExport(points: GPSPoint[]): GPSPoint[] {
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

interface LayoutProps {
  session: TrainingSession
  aiConfig: AIConfig | null
  onAiConfigChange: (config: AIConfig | null) => void
  onNewSession: () => void
  onUpdateSession: (session: TrainingSession | null) => void
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
  const lapCorners: Corner[] = corners.map((c) => {
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
      duration: 0,
    }
  })
  for (let i = 0; i < lapCorners.length; i++) {
    const lapPoints = lap.points
    const sectorStart = i === 0 ? 0 : lapCorners[i - 1].startIndex
    const sectorEnd = lapCorners[i].startIndex
    if (sectorStart < lapPoints.length && sectorEnd < lapPoints.length) {
      lapCorners[i].duration = (lapPoints[sectorEnd].time - lapPoints[sectorStart].time) / 1000
    }
  }
  const lastCorner = lapCorners[lapCorners.length - 1]
  const lastStartIdx = lastCorner ? lastCorner.startIndex : 0
  const remainingTime = lastStartIdx < lap.points.length
    ? (lap.points[lap.points.length - 1].time - lap.points[lastStartIdx].time) / 1000
    : 0
  return { lap, corners: lapCorners, sectorTimes: lapCorners.map((c) => c.duration), remainingTime }
}

// Card wrapper component
function Card({ children, className = '', span = 1 }: { children: React.ReactNode; className?: string; span?: number }) {
  return (
    <div
      className={`bg-gray-900 rounded-lg border border-gray-800 overflow-hidden ${className}`}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      {children}
    </div>
  )
}

function CardHeader({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50">
      <h3 className="text-xs font-bold text-gray-300">{title}</h3>
      {extra}
    </div>
  )
}

export default function Layout({ session, aiConfig, onAiConfigChange, onNewSession, onUpdateSession }: LayoutProps) {
  const fastestLap = useMemo(
    () => session.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), session.laps[0]),
    [session.laps]
  )

  const [selectedLapIds, setSelectedLapIds] = useState<number[]>([fastestLap.id])
  // Comparison lap derived from lap list — only when user actively selected a non-fastest lap
  const comparisonLapId = useMemo(() => {
    const nonFastest = selectedLapIds.find(id => id !== fastestLap.id)
    return nonFastest ?? fastestLap.id // no fallback — stays as fastestLap.id if none selected
  }, [selectedLapIds, fastestLap.id])
  const [isAddingCorner, setIsAddingCorner] = useState(false)
  const [hoverPointIndex, setHoverPointIndex] = useState<number | null>(null)
  const [showProfileManager, setShowProfileManager] = useState(false)
  const [savedProfiles, setSavedProfiles] = useState<TrackProfile[]>(() => getTrackProfiles())
  const [comparisonMode, setComparisonMode] = useState(false)
  const [comparisonLaps, setComparisonLaps] = useState<[number, number] | null>(null)
  const [showAIChat, setShowAIChat] = useState(false)

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

  const allCorners = useMemo(() => {
    const fastest = session.analyses.find((a) => a.lap.id === fastestLap.id)
    return fastest?.corners ?? []
  }, [session.analyses, fastestLap.id])

  // Full analysis for dashboard cards
  // Racing line analysis for all laps vs fastest (computed first — used by fullAnalysis)
  const racingLineAnalyses = useMemo((): RacingLineAnalysis[] => {
    if (session.analyses.length < 2) return []
    const corners = session.analyses[0]?.corners ?? []
    const fastestAnalysis = session.analyses.find((a) => a.lap.id === fastestLap.id)!
    return session.analyses
      .filter((a) => a.lap.id !== fastestLap.id)
      .map((a) => analyzeRacingLine(fastestLap, a.lap, fastestAnalysis, a, corners))
  }, [session.analyses, fastestLap])

  const fullAnalysis = useMemo(() => {
    const laps = session.analyses.map((a) => a.lap)
    const corners = session.analyses[0]?.corners ?? []
    return generateFullAnalysis(
      laps,
      corners,
      session.analyses,
      session.trackSemantics,
      racingLineAnalyses,
    )
  }, [session.analyses, session.trackSemantics, racingLineAnalyses])

  // Current racing line analysis for selected comparison lap
  const currentRLA = useMemo(() => {
    return racingLineAnalyses.find(r => r.comparisonLapId === comparisonLapId) ?? null
  }, [racingLineAnalyses, comparisonLapId])

  const applySemanticModel = useCallback((nextTrackSemantics: TrackSemanticModel) => {
    onUpdateSession({
      ...session,
      trackSemantics: nextTrackSemantics,
    })
  }, [session, onUpdateSession])

  const handleConfirmSemantic = useCallback((confirmationId: string) => {
    if (!session.trackSemantics) return
    applySemanticModel(confirmSemanticTag(session.trackSemantics, confirmationId))
  }, [session.trackSemantics, applySemanticModel])

  const handleRejectSemantic = useCallback((confirmationId: string) => {
    if (!session.trackSemantics) return
    applySemanticModel(rejectSemanticTag(session.trackSemantics, confirmationId))
  }, [session.trackSemantics, applySemanticModel])

  const handleOverrideSemantic = useCallback((confirmationId: string, tagType: SemanticTagType) => {
    if (!session.trackSemantics) return
    applySemanticModel(overrideSemanticTag(session.trackSemantics, confirmationId, tagType))
  }, [session.trackSemantics, applySemanticModel])

  const handleSkipSemantic = useCallback((confirmationId: string) => {
    if (!session.trackSemantics) return
    applySemanticModel(skipSemanticTag(session.trackSemantics, confirmationId))
  }, [session.trackSemantics, applySemanticModel])

  const handleAddCorner = useCallback((lat: number, lng: number) => {
    const fastLap = session.laps.find(l => l.id === fastestLap.id)
    if (!fastLap) return
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < fastLap.points.length; i++) {
      const d = haversineDistance(fastLap.points[i], { lat, lng, speed: 0, time: 0, altitude: 0 })
      if (d < closestDist) { closestDist = d; closestIdx = i }
    }
    const halfSize = 8
    const startIdx = Math.max(0, closestIdx - halfSize)
    const endIdx = Math.min(fastLap.points.length - 1, closestIdx + halfSize)
    const cornerPoints = fastLap.points.slice(startIdx, endIdx + 1)
    const speeds = cornerPoints.map(p => p.speed)
    const minSpd = Math.min(...speeds)
    const entryIdx = Math.max(0, startIdx - 1)
    const exitIdx = Math.min(fastLap.points.length - 1, endIdx + 1)
    const newCorners = [...session.corners]
    const midIdx = Math.floor((startIdx + endIdx) / 2)
    const newCorner: Corner = {
      id: 0, name: '', startIndex: startIdx, endIndex: endIdx,
      midpointIndex: midIdx, apexIndex: midIdx,
      direction: 'right', angle: 90, type: '中速弯',
      entrySpeed: fastLap.points[entryIdx].speed * 3.6, minSpeed: minSpd * 3.6,
      exitSpeed: fastLap.points[exitIdx].speed * 3.6,
      duration: (fastLap.points[endIdx].time - fastLap.points[startIdx].time) / 1000,
    }
    newCorners.push(newCorner)
    newCorners.sort((a, b) => a.startIndex - b.startIndex)
    newCorners.forEach((c, i) => { c.id = i + 1; c.name = `T${i + 1}` })
    const derived = rebuildSessionDerivedData({
      laps: session.laps,
      corners: newCorners,
      startFinishLine: session.startFinishLine,
      filename: session.filename,
      date: session.date,
      trackId: session.trackSemantics?.trackId,
    })
    onUpdateSession({ ...session, corners: newCorners, analyses: derived.analyses, trackSemantics: derived.trackSemantics })
    setIsAddingCorner(false)
  }, [session, fastestLap.id, onUpdateSession])

  const handleDeleteCorner = useCallback((cornerId: number) => {
    const newCorners = session.corners.filter(c => c.id !== cornerId)
    newCorners.forEach((c, i) => { c.id = i + 1; c.name = `T${i + 1}` })
    const derived = rebuildSessionDerivedData({
      laps: session.laps,
      corners: newCorners,
      startFinishLine: session.startFinishLine,
      filename: session.filename,
      date: session.date,
      trackId: session.trackSemantics?.trackId,
    })
    onUpdateSession({ ...session, corners: newCorners, analyses: derived.analyses, trackSemantics: derived.trackSemantics })
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

  const handleSecondaryFile = useCallback(async (file: File) => {
    if (!session.startFinishLine) { setSecondaryError('当前会话没有起终线数据'); return }
    setSecondaryProcessing(true)
    setSecondaryError(null)
    try {
      const nameLower = file.name.toLowerCase()
      const isGeoJSON = nameLower.endsWith('.geojson') || nameLower.endsWith('.json')
      const isVBO = nameLower.endsWith('.vbo')
      let points: GPSPoint[]
      if (isVBO) { const text = await file.text(); const vboResult = parseVBO(text); points = vboResult.points }
      else if (isGeoJSON) { points = await parseGeoJSONFile(file) }
      else { points = await parseGPSFromFile(file) }
      const windowSize = 5; const half = Math.floor(windowSize / 2)
      const smooth = points.map((p, i) => {
        const start = Math.max(0, i - half); const end = Math.min(points.length - 1, i + half)
        let sumLat = 0, sumLng = 0, sumSpeed = 0, sumAlt = 0, count = 0
        for (let j = start; j <= end; j++) { sumLat += points[j].lat; sumLng += points[j].lng; sumSpeed += points[j].speed; sumAlt += points[j].altitude; count++ }
        return { ...p, lat: sumLat / count, lng: sumLng / count, speed: sumSpeed / count, altitude: sumAlt / count }
      })
      const laps = detectLaps(smooth, session.startFinishLine)
      if (laps.length === 0) { setSecondaryError('未检测到有效圈数'); setSecondaryProcessing(false); return }
      const refFastestLap = session.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), session.laps[0])
      const analyses = laps.map(lap => reanalyzeLap(lap, session.corners, refFastestLap.points))
      setSecondaryLaps(laps); setSecondaryAnalyses(analyses); setSecondaryFilename(file.name)
      setShowLapPicker(true); setSecondaryProcessing(false)
    } catch (err) { setSecondaryError(err instanceof Error ? err.message : '处理失败'); setSecondaryProcessing(false) }
  }, [session])

  const handleSelectSecondaryLap = useCallback((lapId: number) => {
    if (selectedLapIds.length !== 1) { setSecondaryError('请先选择一圈作为基准'); return }
    if (!secondaryLaps || !secondaryAnalyses) return
    const secLap = secondaryLaps.find(l => l.id === lapId)
    const secAnalysis = secondaryAnalyses.find(a => a.lap.id === lapId)
    if (!secLap || !secAnalysis) return
    setCrossFileComparison({ lap: secLap, analysis: secAnalysis })
    setShowLapPicker(false); setComparisonMode(true); setComparisonLaps(null)
  }, [selectedLapIds, secondaryLaps, secondaryAnalyses])

  const hoverPositions = useMemo(() => {
    if (hoverPointIndex === null) return null
    const positions: Array<{ lat: number; lng: number; color: string }> = []
    const selected = session.laps.filter(l => selectedLapIds.includes(l.id))
    selected.forEach((lap) => {
      if (hoverPointIndex < lap.points.length) {
        const p = lap.points[hoverPointIndex]
        const color = getLapColor(lap.id, selectedLapIds, fastestLap.id)
        positions.push({ lat: p.lat, lng: p.lng, color })
      }
    })
    return positions.length > 0 ? positions : null
  }, [hoverPointIndex, session.laps, selectedLapIds, fastestLap.id])

  // Brake/throttle points for map
  const { brakePoints, throttlePoints } = useMemo(() => {
    if (!currentRLA) return { brakePoints: undefined, throttlePoints: undefined }
    const brakePts: BrakeThrottlePoint[] = []
    const throttlePts: BrakeThrottlePoint[] = []
    for (const c of currentRLA.corners) {
      if (c.brakePoint) brakePts.push(c.brakePoint)
      if (c.throttlePoint) throttlePts.push(c.throttlePoint)
      if (c.refBrakePoint) brakePts.push(c.refBrakePoint)
      if (c.refThrottlePoint) throttlePts.push(c.refThrottlePoint)
    }
    return { brakePoints: brakePts.length > 0 ? brakePts : undefined, throttlePoints: throttlePts.length > 0 ? throttlePts : undefined }
  }, [currentRLA])

  // Theoretical best
  const theoreticalBest = fullAnalysis.theoreticalBest
  const hasComparison = comparisonLapId !== fastestLap.id

  // If in comparison mode, render the comparison report full-screen
  if (comparisonMode) {
    const renderComparison = () => {
      if (comparisonLaps) {
        const lap1 = session.laps.find(l => l.id === comparisonLaps[0])
        const lap2 = session.laps.find(l => l.id === comparisonLaps[1])
        const analysis1 = session.analyses.find(a => a.lap.id === comparisonLaps[0])
        const analysis2 = session.analyses.find(a => a.lap.id === comparisonLaps[1])
        if (lap1 && lap2 && analysis1 && analysis2) {
          return <ComparisonReport lap1={lap1} lap2={lap2} analysis1={analysis1} analysis2={analysis2} corners={allCorners} onClose={handleCloseComparison} />
        }
      } else if (crossFileComparison) {
        const primaryLapId = selectedLapIds[0]
        const lap1 = session.laps.find(l => l.id === primaryLapId)
        const analysis1 = session.analyses.find(a => a.lap.id === primaryLapId)
        if (lap1 && analysis1) {
          return <ComparisonReport lap1={lap1} lap2={crossFileComparison.lap} analysis1={analysis1} analysis2={crossFileComparison.analysis} corners={allCorners} onClose={handleCloseComparison} />
        }
      }
      return null
    }
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-purple-400">KartPro</h1>
            <span className="text-sm text-gray-400">圈对比</span>
          </div>
          <button onClick={handleCloseComparison} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg">返回</button>
        </div>
        <div className="flex-1 overflow-hidden">{renderComparison()}</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-bold text-purple-400">KartPro</h1>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-xs text-gray-400">{session.filename}</span>
          <span className="text-xs text-gray-500">{session.laps.length}圈</span>
          <span className="text-xs text-purple-400 font-medium">最快 {formatTime(fastestLap.duration)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!comparisonMode && (
            <>
              <input ref={secondaryFileInputRef} type="file" accept=".mp4,.geojson,.vbo,.VBO,text/plain,application/octet-stream,*/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleSecondaryFile(file); e.target.value = '' }} />
              <button onClick={() => secondaryFileInputRef.current?.click()} disabled={secondaryProcessing} className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 text-white text-[11px] rounded-md whitespace-nowrap shrink-0">{secondaryProcessing ? '...' : '导入对比'}</button>
            </>
          )}
          <button onClick={() => exportToPDF({ filename: `KartPro_${session.filename.replace(/\.[^.]+$/, '')}`, title: session.filename, date: session.date.toLocaleDateString() })} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] rounded-md whitespace-nowrap shrink-0">导出</button>
          <button onClick={() => { const allPoints = session.points ?? deduplicateForExport(session.laps.flatMap(l => l.points)); exportToVBO(allPoints, session.filename, session.startFinishLine) }} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-green-400 text-[11px] rounded-md whitespace-nowrap shrink-0">存VBO</button>
          <button onClick={() => { setSavedProfiles(getTrackProfiles()); setShowProfileManager(true) }} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] rounded-md whitespace-nowrap shrink-0">赛道</button>
          <button onClick={onNewSession} className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] rounded-md whitespace-nowrap shrink-0">新建</button>
        </div>
      </div>

      {/* Modals */}
      {showProfileManager && (
        <div className="fixed inset-0 z-[10000] bg-gray-950/80 flex items-center justify-center" onClick={() => setShowProfileManager(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-100">赛道配置</h3>
              <button onClick={() => setShowProfileManager(false)} className="text-gray-400 hover:text-gray-200">x</button>
            </div>
            {savedProfiles.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">暂无已保存的赛道配置。</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {savedProfiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-200">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.corners.length} 弯道 · {new Date(p.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => handleDeleteProfile(p.id)} className="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded">删除</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {secondaryError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10001] bg-red-900/90 border border-red-700 text-red-100 px-6 py-3 rounded-lg shadow-lg max-w-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm">{secondaryError}</span>
            <button onClick={() => setSecondaryError(null)} className="ml-auto text-red-300 hover:text-red-100">x</button>
          </div>
        </div>
      )}

      {showLapPicker && secondaryLaps && (
        <div className="fixed inset-0 z-[10000] bg-gray-950/80 flex items-center justify-center" onClick={() => setShowLapPicker(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-100 mb-4">选择对比圈 — {secondaryFilename}</h3>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {secondaryLaps.map((lap) => (
                <div key={lap.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                  <span className="text-sm text-gray-200">第{lap.id}圈 — {formatTime(lap.duration)}</span>
                  <button onClick={() => handleSelectSecondaryLap(lap.id)} className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg">选择</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Chat floating panel */}
      {showAIChat && (
        <div className="fixed inset-y-0 right-0 w-96 z-[9999] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-bold text-gray-200">AI 教练</span>
            <button onClick={() => setShowAIChat(false)} className="text-gray-400 hover:text-gray-200 text-lg">×</button>
          </div>
          <div className="flex-1 overflow-hidden">
            <AICoach analyses={session.analyses} aiConfig={aiConfig} onConfigChange={onAiConfigChange} />
          </div>
        </div>
      )}

      {/* Main layout: Left (map + speed chart) | Right (scrollable cards) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left panel — Lap sidebar + Map + Speed Chart */}
        <div className="w-full md:w-[45%] h-[50vh] md:h-auto flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-gray-800">
          {/* Top: Lap sidebar + Map side by side */}
          <div className="flex-1 flex min-h-0">
            {/* Narrow lap sidebar */}
            <div className="w-[160px] shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900/50">
              <LapList
                laps={session.laps}
                fastestLapId={fastestLap.id}
                selectedLapIds={selectedLapIds}
                onSelectionChange={setSelectedLapIds}
                onCompare={handleCompare}
                compact
              />
            </div>
            {/* Map */}
            <div className="flex-1 relative min-h-0">
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
              <div className="absolute top-2 right-2 z-[1000] flex gap-1">
                <button onClick={() => setIsAddingCorner(!isAddingCorner)} className={`px-2 py-1 text-[10px] rounded-md shadow-lg ${isAddingCorner ? 'bg-green-600 text-white' : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'}`}>
                  {isAddingCorner ? '点击添加...' : '+ 弯道'}
                </button>
                {isAddingCorner && <button onClick={() => setIsAddingCorner(false)} className="px-2 py-1 text-[10px] rounded-md bg-gray-800/90 text-gray-400">取消</button>}
              </div>
            </div>
          </div>
          {/* Speed chart */}
          <div className="h-[160px] shrink-0 border-t border-gray-800">
            <SpeedChart
              analyses={session.analyses}
              selectedLapIds={selectedLapIds}
              fastestLapId={fastestLap.id}
              onHoverIndex={setHoverPointIndex}
            />
          </div>
        </div>

        {/* Right panel — Scrollable card grid */}
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          <div className="grid grid-cols-2 gap-2" style={{ alignContent: 'start' }}>

            {/* Key metrics */}
            <Card>
              <CardHeader title="圈速概览" />
              <div className="p-2.5 space-y-2">
                <div className="flex items-baseline gap-3">
                  <div>
                    <div className="text-[9px] text-gray-500">最快圈 (第{fastestLap.id}圈)</div>
                    <div className="text-xl font-bold text-purple-400 font-mono">{formatTime(fastestLap.duration)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-gray-500">理论最佳</div>
                    <div className="text-base font-bold text-green-400 font-mono">{formatTime(theoreticalBest.time)}</div>
                    <div className="text-[10px] text-green-500">-{theoreticalBest.savings.toFixed(3)}s</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Corner priority */}
            <Card className="overflow-y-auto">
              <CardHeader title="提升优先级" extra={<span className="text-[9px] text-gray-500" title="每个弯道相比最快圈的平均掉时，排名越靠前优化收益越大">按掉时排序 ⓘ</span>} />
              <div className="p-2 space-y-1">
                {fullAnalysis.cornerPriority.map((c) => {
                  const maxDelta = fullAnalysis.cornerPriority[0]?.avgDelta || 0.1
                  const barWidth = Math.min(100, Math.abs(c.avgDelta) / Math.abs(maxDelta) * 100)
                  const barColor = c.avgDelta > 0.15 ? 'bg-red-500' : c.avgDelta > 0.05 ? 'bg-yellow-500' : 'bg-green-500'
                  return (
                    <div key={c.corner} className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-5 font-bold text-gray-300 shrink-0">{c.corner}</span>
                      <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                        <div className={`h-full ${barColor} rounded`} style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="w-14 text-right text-gray-400 shrink-0 font-mono">
                        {c.avgDelta >= 0 ? '+' : ''}{c.avgDelta.toFixed(3)}s
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Consistency */}
            <Card className="overflow-y-auto">
              <CardHeader title="一致性" />
              <div className="p-2">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-0.5">弯道</th>
                      <th className="text-right py-0.5">标准差</th>
                      <th className="text-center py-0.5">评级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullAnalysis.consistency.map((c) => {
                      const ratingColor = c.rating === '非常稳定' ? 'text-green-400' : c.rating === '稳定' ? 'text-blue-400' : c.rating === '波动' ? 'text-yellow-400' : 'text-red-400'
                      return (
                        <tr key={c.corner} className="border-b border-gray-800/30">
                          <td className="py-0.5 font-medium text-gray-300">{c.corner}</td>
                          <td className="text-right py-0.5 text-gray-400 font-mono">{c.stdDev.toFixed(3)}s</td>
                          <td className={`text-center py-0.5 ${ratingColor}`}>{c.rating}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Lap trend — compact bar chart */}
            {fullAnalysis.lapTrend.laps.length > 0 && (() => {
              const { laps: trendLaps, trend, peakRange, worstRange } = fullAnalysis.lapTrend
              const times = trendLaps.map(l => l.time)
              const minT = Math.min(...times)
              const maxT = Math.max(...times)
              const range = maxT - minT || 1
              const trendLabel = trend === 'improving' ? '持续进步' : trend === 'declining' ? '逐渐下降' : '波动'
              const trendColor = trend === 'improving' ? 'text-green-400' : trend === 'declining' ? 'text-red-400' : 'text-yellow-400'
              return (
                <Card>
                  <CardHeader title="圈速趋势" extra={<span className={`text-[9px] font-bold ${trendColor}`}>{trendLabel}</span>} />
                  <div className="p-2">
                    <div className="text-[9px] text-gray-500 mb-1">最佳: 第{peakRange[0]}-{peakRange[1]}圈 · 最差: 第{worstRange[0]}-{worstRange[1]}圈</div>
                    <div className="relative h-16">
                      <div className="absolute inset-0 flex items-end gap-px">
                        {trendLaps.map((lap) => {
                          const normalized = (lap.time - minT) / range
                          const barH = Math.max(8, Math.round((1 - normalized) * 100))
                          const inPeak = lap.lapNumber >= peakRange[0] && lap.lapNumber <= peakRange[1]
                          const inWorst = lap.lapNumber >= worstRange[0] && lap.lapNumber <= worstRange[1]
                          const bg = inPeak ? 'bg-green-500' : inWorst ? 'bg-red-500' : 'bg-purple-500'
                          return (
                            <div key={lap.lapNumber} className="flex-1 flex flex-col items-center justify-end h-full" title={`第${lap.lapNumber}圈: ${formatTime(lap.time)}`}>
                              <div className={`w-full ${bg} rounded-t`} style={{ height: `${barH}%` }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
                      {trendLaps.map(l => <span key={l.lapNumber} className="flex-1 text-center">{l.lapNumber}</span>)}
                    </div>
                  </div>
                </Card>
              )
            })()}

            {/* Corner performance table — full width */}
            <Card span={2} className="overflow-y-auto">
              <CornerTable
                analyses={session.analyses}
                selectedLapIds={selectedLapIds}
                fastestLapId={fastestLap.id}
              />
            </Card>

            {session.trackSemantics?.pendingConfirmations.length ? (
              <div className="col-span-2">
                <SemanticConfirmationPanel
                  confirmations={session.trackSemantics.pendingConfirmations}
                  onConfirm={handleConfirmSemantic}
                  onReject={handleRejectSemantic}
                  onOverride={handleOverrideSemantic}
                  onSkip={handleSkipSemantic}
                />
              </div>
            ) : null}

            {/* === Comparison cards — only shown when a non-fastest lap is selected === */}
            {hasComparison && currentRLA && (
              <>
                {/* Racing line deviations */}
                <Card className="overflow-y-auto">
                  <CardHeader title="走线偏差" extra={<span className="text-[9px] text-purple-400">第{comparisonLapId}圈 vs 第{fastestLap.id}圈</span>} />
                  <div className="p-2">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                          <th className="text-left py-0.5">弯道</th>
                          <th className="text-right py-0.5">偏差</th>
                          <th className="text-center py-0.5">一致性</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentRLA.corners.map((c) => {
                          const absM = Math.abs(c.meanDeviation)
                          const color = absM < 0.5 ? 'text-green-400' : absM < 1.5 ? 'text-yellow-400' : absM < 3 ? 'text-orange-400' : 'text-red-400'
                          const consColor = c.curvatureConsistency >= 85 ? 'text-green-400' : c.curvatureConsistency >= 65 ? 'text-yellow-400' : 'text-orange-400'
                          return (
                            <tr key={c.cornerName} className="border-b border-gray-800/30">
                              <td className="py-0.5 font-medium text-gray-300">{c.cornerName}</td>
                              <td className={`text-right py-0.5 ${color}`}>{c.meanDeviation >= 0 ? '+' : ''}{c.meanDeviation.toFixed(2)}m</td>
                              <td className={`text-center py-0.5 ${consColor}`}>{c.curvatureConsistency}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Brake/throttle card removed — info now in corner trajectory maps */}
              </>
            )}

            {/* Deep analysis — 2 columns */}
            <Card span={2}>
              <CardHeader title="深度分析" extra={<button onClick={() => setShowAIChat(true)} className="text-[10px] text-purple-400 hover:text-purple-300">AI 教练 →</button>} />
              <div className="p-3">
                <AnalysisReport analysis={fullAnalysis} />
                {racingLineAnalyses.length > 0 && (
                  <div className="mt-2">
                    <RacingLineReport analyses={racingLineAnalyses} fastestLapId={fastestLap.id} />
                  </div>
                )}
              </div>
            </Card>

          </div>
        </div>

      </div>
    </div>
  )
}
