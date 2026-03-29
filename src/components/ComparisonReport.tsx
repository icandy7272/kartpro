import { useState, useMemo } from 'react'
import type { Lap, LapAnalysis, Corner } from '../types'

interface ComparisonReportProps {
  lap1: Lap
  lap2: Lap
  analysis1: LapAnalysis
  analysis2: LapAnalysis
  corners: Corner[]
  onClose: () => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

function Section({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/80 transition-colors rounded-t-lg"
      >
        <span className="text-sm font-bold text-gray-200">
          {icon} {title}
        </span>
        <span className="text-gray-500 text-xs">{open ? '收起' : '展开'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}

type SortKey = 'corner' | 'delta' | 'pct'
type SortDir = 'asc' | 'desc'

function SortableCornerDeltaTable({
  cornerDeltas,
  totalAbsDelta,
  lap1Id,
  lap2Id,
}: {
  cornerDeltas: { name: string; time1: number; time2: number; delta: number; absDelta: number }[]
  totalAbsDelta: number
  lap1Id: number
  lap2Id: number
}) {
  const [sortKey, setSortKey] = useState<SortKey>('delta')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'corner' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    const list = [...cornerDeltas]
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'corner') {
        const numA = parseInt(a.name.replace(/\D/g, '')) || 0
        const numB = parseInt(b.name.replace(/\D/g, '')) || 0
        cmp = numA - numB
      } else if (sortKey === 'delta') {
        cmp = a.absDelta - b.absDelta
      } else if (sortKey === 'pct') {
        cmp = a.absDelta - b.absDelta
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [cornerDeltas, sortKey, sortDir])

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '↕'
    return sortDir === 'asc' ? '↑' : '↓'
  }

  return (
    <Section title="逐弯差距分解" icon="🔢" defaultOpen={true}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th
                className="text-left py-2 px-2 font-medium cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('corner')}
              >
                弯道 {sortIcon('corner')}
              </th>
              <th className="text-right py-2 px-1 font-medium">圈{lap1Id}耗时</th>
              <th className="text-right py-2 px-1 font-medium">圈{lap2Id}耗时</th>
              <th
                className="text-right py-2 px-1 font-medium cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('delta')}
              >
                差值 {sortIcon('delta')}
              </th>
              <th
                className="text-left py-2 px-2 font-medium w-24 cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('pct')}
              >
                占比 {sortIcon('pct')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const pct = totalAbsDelta > 0 ? (d.absDelta / totalAbsDelta) * 100 : 0
              const deltaColor = Math.abs(d.delta) < 0.01 ? 'text-gray-500' : d.delta < 0 ? 'text-green-400' : 'text-red-400'
              return (
                <tr key={d.name} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                  <td className="py-1.5 px-2 font-medium text-gray-300">{d.name}</td>
                  <td className="py-1.5 px-1 text-right font-mono text-gray-300">{d.time1.toFixed(3)}s</td>
                  <td className="py-1.5 px-1 text-right font-mono text-gray-300">{d.time2.toFixed(3)}s</td>
                  <td className={`py-1.5 px-1 text-right font-mono ${deltaColor}`}>
                    {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(3)}s
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${d.delta < 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 w-8 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] text-gray-600">
        差值颜色: <span className="text-green-400">绿色</span> = 圈{lap1Id}更快, <span className="text-red-400">红色</span> = 圈{lap1Id}更慢。点击表头排序。
      </div>
    </Section>
  )
}

export default function ComparisonReport({
  lap1,
  lap2,
  analysis1,
  analysis2,
  corners,
  onClose: _onClose,
}: ComparisonReportProps) {
  void _onClose // kept in props for Layout compatibility
  const totalDelta = lap1.duration - lap2.duration
  const lap1Faster = totalDelta < 0
  const fasterLabel = lap1Faster ? `圈${lap1.id}` : `圈${lap2.id}`

  // Corner-by-corner delta breakdown
  const cornerDeltas = useMemo(() => {
    return corners.map((corner, ci) => {
      const c1 = analysis1.corners[ci]
      const c2 = analysis2.corners[ci]
      if (!c1 || !c2) return null
      const delta = c1.duration - c2.duration // positive means lap1 slower
      return {
        name: corner.name,
        time1: c1.duration,
        time2: c2.duration,
        delta,
        absDelta: Math.abs(delta),
        entry1: c1.entrySpeed,
        entry2: c2.entrySpeed,
        min1: c1.minSpeed,
        min2: c2.minSpeed,
        exit1: c1.exitSpeed,
        exit2: c2.exitSpeed,
      }
    }).filter((d): d is NonNullable<typeof d> => d !== null)
  }, [corners, analysis1, analysis2])

  const totalAbsDelta = useMemo(
    () => cornerDeltas.reduce((sum, d) => sum + d.absDelta, 0),
    [cornerDeltas]
  )

  const sortedByDelta = useMemo(
    () => [...cornerDeltas].sort((a, b) => b.absDelta - a.absDelta),
    [cornerDeltas]
  )

  // Braking/acceleration pattern
  const brakingData = useMemo(() => {
    return corners.map((corner, ci) => {
      const c1 = analysis1.corners[ci]
      const c2 = analysis2.corners[ci]
      if (!c1 || !c2) return null
      const braking1 = c1.entrySpeed - c1.minSpeed
      const braking2 = c2.entrySpeed - c2.minSpeed
      const accel1 = c1.exitSpeed - c1.minSpeed
      const accel2 = c2.exitSpeed - c2.minSpeed
      return {
        name: corner.name,
        braking1,
        braking2,
        accel1,
        accel2,
        brakingDelta: braking1 - braking2,
        accelDelta: accel1 - accel2,
      }
    }).filter((d): d is NonNullable<typeof d> => d !== null)
  }, [corners, analysis1, analysis2])

  // Auto-generate key findings with detailed coaching advice
  const findings = useMemo(() => {
    interface Finding {
      title: string
      detail: string
      advice: string
      priority: 'high' | 'medium' | 'low'
    }
    const results: Finding[] = []

    // 1. Biggest time delta corner - deep analysis
    if (sortedByDelta.length > 0) {
      const biggest = sortedByDelta[0]
      const winner = biggest.delta > 0 ? `圈${lap2.id}` : `圈${lap1.id}`
      const loser = biggest.delta > 0 ? `圈${lap1.id}` : `圈${lap2.id}`
      const pct = totalAbsDelta > 0 ? ((biggest.absDelta / totalAbsDelta) * 100).toFixed(0) : '0'
      // Check why: entry, min, or exit speed difference?
      const entryDiff = biggest.entry1 - biggest.entry2
      const minDiff = biggest.min1 - biggest.min2
      const exitDiff = biggest.exit1 - biggest.exit2
      const maxFactor = [
        { label: '入弯速度', diff: Math.abs(entryDiff), raw: entryDiff },
        { label: '弯心速度', diff: Math.abs(minDiff), raw: minDiff },
        { label: '出弯速度', diff: Math.abs(exitDiff), raw: exitDiff },
      ].sort((a, b) => b.diff - a.diff)[0]

      let causeAdvice = ''
      if (maxFactor.label === '入弯速度') {
        causeAdvice = maxFactor.raw > 0
          ? `${loser}入弯速度偏慢${Math.abs(entryDiff).toFixed(1)}km/h。建议：推迟刹车点、或减轻刹车力度，用更高速度切入弯心。`
          : `${loser}入弯速度过高${Math.abs(entryDiff).toFixed(1)}km/h，导致弯中失速。建议：稍微提前刹车，保持弯心速度的流畅性。`
      } else if (maxFactor.label === '弯心速度') {
        causeAdvice = `${loser}弯心速度差${Math.abs(minDiff).toFixed(1)}km/h。建议：优化转向角度和油门控制，尽量保持弯心处的最低速度更高。`
      } else {
        causeAdvice = `${loser}出弯速度慢${Math.abs(exitDiff).toFixed(1)}km/h。建议：更早回正方向盘、更早踩油门，利用弯道出口的轨迹优势加速。`
      }

      results.push({
        title: `🔑 ${biggest.name}是最大提升点`,
        detail: `${winner}快了${biggest.absDelta.toFixed(2)}s，占总差距的${pct}%。主要差异来自${maxFactor.label}（差${maxFactor.diff.toFixed(1)}km/h）。`,
        advice: causeAdvice,
        priority: 'high',
      })
    }

    // 2. Second biggest corner if significant
    if (sortedByDelta.length > 1 && sortedByDelta[1].absDelta > 0.05) {
      const second = sortedByDelta[1]
      const winner = second.delta > 0 ? `圈${lap2.id}` : `圈${lap1.id}`
      const pct = totalAbsDelta > 0 ? ((second.absDelta / totalAbsDelta) * 100).toFixed(0) : '0'
      results.push({
        title: `📌 ${second.name}也值得关注`,
        detail: `${winner}快了${second.absDelta.toFixed(2)}s（占总差距${pct}%）。入弯速度差${Math.abs(second.entry1 - second.entry2).toFixed(1)}km/h，出弯差${Math.abs(second.exit1 - second.exit2).toFixed(1)}km/h。`,
        advice: `集中改善前两个弯道（${sortedByDelta[0].name}和${second.name}）即可挽回${((sortedByDelta[0].absDelta + second.absDelta) / totalAbsDelta * 100).toFixed(0)}%的时间差距。`,
        priority: 'high',
      })
    }

    // 3. Braking pattern analysis - find over-braking or under-braking
    const brakingDiffs = brakingData
      .map(d => ({ name: d.name, diff: d.brakingDelta, absDiff: Math.abs(d.brakingDelta), braking1: d.braking1, braking2: d.braking2 }))
      .sort((a, b) => b.absDiff - a.absDiff)

    if (brakingDiffs.length > 0 && brakingDiffs[0].absDiff > 3) {
      const b = brakingDiffs[0]
      const harderBraker = b.diff > 0 ? `圈${lap1.id}` : `圈${lap2.id}`
      const lighterBraker = b.diff > 0 ? `圈${lap2.id}` : `圈${lap1.id}`
      const overBrakingCorners = brakingDiffs.filter(d => d.absDiff > 3)
      results.push({
        title: `🛑 刹车力度差异分析`,
        detail: `${harderBraker}在${b.name}多减速了${b.absDiff.toFixed(1)}km/h（${harderBraker}减速${Math.max(b.braking1, b.braking2).toFixed(1)}km/h vs ${lighterBraker}减速${Math.min(b.braking1, b.braking2).toFixed(1)}km/h）。共${overBrakingCorners.length}个弯存在明显刹车差异。`,
        advice: `过重刹车会浪费时间且降低弯心速度。尝试用${lighterBraker}的刹车力度作为参考，逐步减轻刹车、提高弯心携带速度。`,
        priority: 'medium',
      })
    }

    // 4. Entry speed patterns across all corners
    const entryDiffs = cornerDeltas.map(d => ({
      name: d.name,
      diff: d.entry1 - d.entry2,
      absDiff: Math.abs(d.entry1 - d.entry2),
      entry1: d.entry1,
      entry2: d.entry2,
    })).sort((a, b) => b.absDiff - a.absDiff)

    const significantEntryDiffs = entryDiffs.filter(e => e.absDiff > 3)
    if (significantEntryDiffs.length > 0) {
      const top = significantEntryDiffs[0]
      const fasterEntry = top.diff > 0 ? `圈${lap1.id}` : `圈${lap2.id}`
      const slowerEntry = top.diff > 0 ? `圈${lap2.id}` : `圈${lap1.id}`
      results.push({
        title: `🏎️ 入弯速度差异`,
        detail: `${significantEntryDiffs.length}个弯道入弯速度差异超过3km/h。最大差异在${top.name}：${fasterEntry}以${Math.max(top.entry1, top.entry2).toFixed(1)}km/h入弯 vs ${slowerEntry}的${Math.min(top.entry1, top.entry2).toFixed(1)}km/h。`,
        advice: `${slowerEntry}可能刹车过早或过重。参考${fasterEntry}的刹车点，逐步推迟5-10米刹车距离，感受极限。`,
        priority: 'medium',
      })
    }

    // 5. Exit speed / acceleration patterns
    const exitDiffs = cornerDeltas.map(d => ({
      name: d.name,
      diff: d.exit1 - d.exit2,
      absDiff: Math.abs(d.exit1 - d.exit2),
      exit1: d.exit1,
      exit2: d.exit2,
    })).sort((a, b) => b.absDiff - a.absDiff)

    const significantExitDiffs = exitDiffs.filter(e => e.absDiff > 3)
    if (significantExitDiffs.length > 0) {
      const top = significantExitDiffs[0]
      const fasterExit = top.diff > 0 ? `圈${lap1.id}` : `圈${lap2.id}`
      const slowerExit = top.diff > 0 ? `圈${lap2.id}` : `圈${lap1.id}`
      results.push({
        title: `🚀 出弯加速差异`,
        detail: `${significantExitDiffs.length}个弯道出弯速度差异超过3km/h。最大在${top.name}：${fasterExit}出弯${Math.max(top.exit1, top.exit2).toFixed(1)}km/h vs ${slowerExit}的${Math.min(top.exit1, top.exit2).toFixed(1)}km/h（差${top.absDiff.toFixed(1)}km/h）。`,
        advice: `出弯速度影响整个直道的速度。${slowerExit}应更早开始加油、更早回正方向盘。"慢进快出"是关键原则。`,
        priority: 'medium',
      })
    }

    // 6. Overall consistency analysis
    const lap1FasterCount = cornerDeltas.filter(d => d.delta < -0.01).length
    const lap2FasterCount = cornerDeltas.filter(d => d.delta > 0.01).length
    const totalCorners = cornerDeltas.length
    if (lap1FasterCount > 0 && lap2FasterCount > 0) {
      const dominantLap = lap1FasterCount > lap2FasterCount ? lap1.id : lap2.id
      const dominantCount = Math.max(lap1FasterCount, lap2FasterCount)
      const minorLap = lap1FasterCount > lap2FasterCount ? lap2.id : lap1.id
      const minorCount = Math.min(lap1FasterCount, lap2FasterCount)
      // Find which corners the slower lap was actually faster
      const slowerLapAdvantages = cornerDeltas
        .filter(d => (dominantLap === lap1.id ? d.delta > 0.01 : d.delta < -0.01))
        .map(d => d.name)
      results.push({
        title: `📊 综合一致性分析`,
        detail: `圈${dominantLap}在${dominantCount}/${totalCorners}个弯更快，圈${minorLap}在${minorCount}个弯更快（${slowerLapAdvantages.join('、')}）。`,
        advice: `如果能将两圈各自的优势弯道合并，理论最优圈速可再提升。重点学习对方更快弯道的驾驶技巧。`,
        priority: 'low',
      })
    }

    // 7. Theoretical best combination
    if (cornerDeltas.length > 2) {
      const theoreticalGain = cornerDeltas.reduce((sum, d) => {
        return sum + (d.delta > 0 ? 0 : d.delta) // sum of all negative deltas (where lap1 is faster)
      }, 0)
      const theoreticalGain2 = cornerDeltas.reduce((sum, d) => {
        return sum + (d.delta < 0 ? 0 : d.delta) // sum of all positive deltas (where lap2 is faster)
      }, 0)
      const bestPossibleGain = Math.abs(theoreticalGain) + Math.abs(theoreticalGain2)
      if (bestPossibleGain > 0.1) {
        const fasterLapTime = Math.min(lap1.duration, lap2.duration)
        const theoreticalBest = fasterLapTime - Math.min(Math.abs(theoreticalGain), Math.abs(theoreticalGain2))
        results.push({
          title: `⚡ 理论最佳圈速`,
          detail: `取两圈每个弯道的最快用时组合，理论最佳圈速为${formatTime(theoreticalBest)}，比当前最快圈还能提升${Math.min(Math.abs(theoreticalGain), Math.abs(theoreticalGain2)).toFixed(3)}s。`,
          advice: `这说明单圈仍有明显提升空间。专注练习自己较弱的弯道，目标是每个弯都接近两圈中的最佳表现。`,
          priority: 'low',
        })
      }
    }

    return results.slice(0, 7)
  }, [sortedByDelta, cornerDeltas, brakingData, totalAbsDelta, lap1, lap2])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-900">
      {/* Header — no back button here, Layout already has one */}
      <div className="px-4 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-sm font-bold text-purple-400">对比分析 — 圈{lap1.id} vs 圈{lap2.id}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Section a: Overview cards */}
        <Section title="总览对比" icon="📊" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className={`p-3 rounded-lg border ${lap1Faster ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
              <div className="text-xs text-gray-400 mb-1">圈 {lap1.id}</div>
              <div className={`text-lg font-bold font-mono ${lap1Faster ? 'text-green-400' : 'text-red-400'}`}>
                {formatTime(lap1.duration)}
              </div>
              {lap1Faster && <div className="text-xs text-green-500 mt-1">更快</div>}
            </div>
            <div className={`p-3 rounded-lg border ${!lap1Faster ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
              <div className="text-xs text-gray-400 mb-1">圈 {lap2.id}</div>
              <div className={`text-lg font-bold font-mono ${!lap1Faster ? 'text-green-400' : 'text-red-400'}`}>
                {formatTime(lap2.duration)}
              </div>
              {!lap1Faster && <div className="text-xs text-green-500 mt-1">更快</div>}
            </div>
          </div>
          <div className="text-center p-2 bg-gray-800/50 rounded-lg">
            <span className="text-xs text-gray-400">差值: </span>
            <span className={`text-sm font-bold font-mono ${Math.abs(totalDelta) < 0.01 ? 'text-gray-300' : 'text-yellow-400'}`}>
              {Math.abs(totalDelta).toFixed(3)}s
            </span>
            <span className="text-xs text-gray-500 ml-1">({fasterLabel}更快)</span>
          </div>
        </Section>

        {/* Section b: Corner-by-corner delta */}
        <SortableCornerDeltaTable
          cornerDeltas={cornerDeltas}
          totalAbsDelta={totalAbsDelta}
          lap1Id={lap1.id}
          lap2Id={lap2.id}
        />

        {/* Section c: Speed comparison */}
        <Section title="速度对比表" icon="⚡" defaultOpen={true}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-1 font-medium" rowSpan={2}>弯道</th>
                  <th className="text-center py-1 px-1 font-medium" colSpan={3}>圈{lap1.id} (km/h)</th>
                  <th className="text-center py-1 px-1 font-medium" colSpan={3}>圈{lap2.id} (km/h)</th>
                  <th className="text-center py-1 px-1 font-medium" colSpan={3}>差值</th>
                </tr>
                <tr className="text-gray-600 border-b border-gray-700/50">
                  <th className="py-1 px-1 text-center text-[10px]">入弯</th>
                  <th className="py-1 px-1 text-center text-[10px]">弯心</th>
                  <th className="py-1 px-1 text-center text-[10px]">出弯</th>
                  <th className="py-1 px-1 text-center text-[10px]">入弯</th>
                  <th className="py-1 px-1 text-center text-[10px]">弯心</th>
                  <th className="py-1 px-1 text-center text-[10px]">出弯</th>
                  <th className="py-1 px-1 text-center text-[10px]">入弯</th>
                  <th className="py-1 px-1 text-center text-[10px]">弯心</th>
                  <th className="py-1 px-1 text-center text-[10px]">出弯</th>
                </tr>
              </thead>
              <tbody>
                {cornerDeltas.map((d) => {
                  const entryDelta = d.entry1 - d.entry2
                  const minDelta = d.min1 - d.min2
                  const exitDelta = d.exit1 - d.exit2
                  const maxAbsDelta = Math.max(Math.abs(entryDelta), Math.abs(minDelta), Math.abs(exitDelta))
                  const highlight = maxAbsDelta > 5

                  const deltaColor = (val: number) =>
                    Math.abs(val) < 1 ? 'text-gray-500' : val > 0 ? 'text-green-400' : 'text-red-400'

                  return (
                    <tr key={d.name} className={`border-b border-gray-800/30 ${highlight ? 'bg-yellow-900/10' : 'hover:bg-gray-800/30'}`}>
                      <td className="py-1.5 px-1 font-medium text-gray-300">{d.name}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.entry1.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.min1.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.exit1.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.entry2.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.min2.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.exit2.toFixed(1)}</td>
                      <td className={`py-1.5 px-1 text-center font-mono ${deltaColor(entryDelta)}`}>
                        {entryDelta >= 0 ? '+' : ''}{entryDelta.toFixed(1)}
                      </td>
                      <td className={`py-1.5 px-1 text-center font-mono ${deltaColor(minDelta)}`}>
                        {minDelta >= 0 ? '+' : ''}{minDelta.toFixed(1)}
                      </td>
                      <td className={`py-1.5 px-1 text-center font-mono ${deltaColor(exitDelta)}`}>
                        {exitDelta >= 0 ? '+' : ''}{exitDelta.toFixed(1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10px] text-gray-600">
            差值正数 = 圈{lap1.id}更快 | 高亮行 = 速度差异超过5km/h
          </div>
        </Section>

        {/* Section d: Braking/acceleration pattern */}
        <Section title="刹车/加速模式对比" icon="🛑" defaultOpen={true}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-1 font-medium">弯道</th>
                  <th className="text-center py-2 px-1 font-medium" colSpan={2}>刹车强度 (km/h)</th>
                  <th className="text-center py-2 px-1 font-medium" colSpan={2}>出弯加速 (km/h)</th>
                  <th className="text-center py-2 px-1 font-medium">标记</th>
                </tr>
                <tr className="text-gray-600 border-b border-gray-700/50">
                  <th className="py-1 px-1" />
                  <th className="py-1 px-1 text-center text-[10px]">圈{lap1.id}</th>
                  <th className="py-1 px-1 text-center text-[10px]">圈{lap2.id}</th>
                  <th className="py-1 px-1 text-center text-[10px]">圈{lap1.id}</th>
                  <th className="py-1 px-1 text-center text-[10px]">圈{lap2.id}</th>
                  <th className="py-1 px-1" />
                </tr>
              </thead>
              <tbody>
                {brakingData.map((d) => {
                  const flags: string[] = []
                  if (Math.abs(d.brakingDelta) > 5) {
                    flags.push(d.brakingDelta > 0 ? `圈${lap1.id}刹车更重` : `圈${lap2.id}刹车更重`)
                  }
                  if (Math.abs(d.accelDelta) > 3) {
                    flags.push(d.accelDelta > 0 ? `圈${lap1.id}加速更好` : `圈${lap2.id}加速更好`)
                  }

                  return (
                    <tr key={d.name} className={`border-b border-gray-800/30 ${flags.length > 0 ? 'bg-purple-900/10' : 'hover:bg-gray-800/30'}`}>
                      <td className="py-1.5 px-1 font-medium text-gray-300">{d.name}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.braking1.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.braking2.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.accel1.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center font-mono text-gray-300">{d.accel2.toFixed(1)}</td>
                      <td className="py-1.5 px-1 text-center">
                        {flags.length > 0 ? (
                          <div className="text-[10px] text-yellow-400">{flags.join(' / ')}</div>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10px] text-gray-600">
            刹车强度 = 入弯速度 - 最低速度 | 出弯加速 = 出弯速度 - 最低速度
          </div>
        </Section>

        {/* Section e: Key findings */}
        <Section title="关键发现与教练建议" icon="💡" defaultOpen={true}>
          {findings.length > 0 ? (
            <div className="space-y-3">
              {findings.map((finding, i) => (
                <div key={i} className={`rounded-lg border p-3 ${
                  finding.priority === 'high' ? 'bg-yellow-900/10 border-yellow-700/30' :
                  finding.priority === 'medium' ? 'bg-blue-900/10 border-blue-700/30' :
                  'bg-gray-800/30 border-gray-700/30'
                }`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-bold text-gray-200">{finding.title}</span>
                    {finding.priority === 'high' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-800/50 text-yellow-400 font-medium">重点</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed mb-2">{finding.detail}</p>
                  <div className="flex gap-1.5 items-start">
                    <span className="text-green-500 text-xs shrink-0 mt-0.5">💬</span>
                    <p className="text-xs text-green-400/90 leading-relaxed">{finding.advice}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">数据不足，无法生成分析。</p>
          )}
        </Section>
      </div>
    </div>
  )
}
