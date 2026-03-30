import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { LapAnalysis, AIConfig, AIMessage } from '../types'
import Settings from './Settings'
import { generateFullAnalysis } from '../lib/analysis/full-analysis'
import { analyzeRacingLine } from '../lib/analysis/racing-line-analysis'
import type { RacingLineAnalysis } from '../types'
import AnalysisReport from './AnalysisReport'
import RacingLineReport from './RacingLineReport'

interface AICoachProps {
  analyses: LapAnalysis[]
  aiConfig: AIConfig | null
  onConfigChange: (config: AIConfig | null) => void
}

function generateReport(analyses: LapAnalysis[]): string {
  if (analyses.length === 0) return '暂无圈速数据可供分析。'

  const laps = analyses.map((a) => a.lap)
  const fastest = laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), laps[0])
  const slowest = laps.reduce((worst, lap) => (lap.duration > worst.duration ? lap : worst), laps[0])

  const fastestAnalysis = analyses.find((a) => a.lap.id === fastest.id)

  const times = laps.map((l) => l.duration)
  const mean = times.reduce((s, t) => s + t, 0) / times.length
  const variance = times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length
  const stdDev = Math.sqrt(variance)
  const consistency = stdDev < 0.5 ? '优秀' : stdDev < 1 ? '良好' : stdDev < 2 ? '一般' : '需改进'
  const topSpeed = Math.max(...laps.map((l) => l.maxSpeed)) * 3.6

  // Stat cards (rendered as custom HTML)
  let report = '<STAT_CARDS>'
  report += JSON.stringify({
    laps: laps.length,
    fastest: { lap: fastest.id, time: formatDuration(fastest.duration) },
    slowest: { lap: slowest.id, time: formatDuration(slowest.duration) },
    gap: (slowest.duration - fastest.duration).toFixed(3),
    avg: formatDuration(mean),
    stdDev: stdDev.toFixed(3),
    consistency,
    topSpeed: topSpeed.toFixed(1),
  })
  report += '</STAT_CARDS>\n\n'

  if (fastestAnalysis && fastestAnalysis.corners.length > 0) {
    report += '## 弯道分析（最快圈）\n\n'
    report += '<TABLE_CORNERS>'
    // Build corner data for table rendering
    const cornerTableData: Array<{ name: string; direction: string; type: string; angle: number; entry: number; min: number; exit: number }> = []
    for (const corner of fastestAnalysis.corners) {
      cornerTableData.push({
        name: corner.name,
        direction: corner.direction === 'left' ? '左' : '右',
        type: corner.type,
        angle: Math.round(corner.angle),
        entry: Math.round(corner.entrySpeed),
        min: Math.round(corner.minSpeed),
        exit: Math.round(corner.exitSpeed),
      })
    }
    // Encode as JSON for table renderer
    report += JSON.stringify(cornerTableData)
    report += '</TABLE_CORNERS>\n\n'

    // Improvement ranking
    report += '## 改进优先级\n\n每个弯道相比最快圈的平均掉时，越长 = 越值得优化：\n\n'
    const cornerDeltas: Array<{ name: string; avgDelta: number; worstLap: number; worstDelta: number }> = []
    for (let ci = 0; ci < fastestAnalysis.corners.length; ci++) {
      const bestTime = fastestAnalysis.corners[ci].duration
      let totalDelta = 0
      let count = 0
      let worstDelta = 0
      let worstLap = 0
      for (const a of analyses) {
        if (a.lap.id === fastest.id) continue
        if (a.corners[ci]) {
          const delta = a.corners[ci].duration - bestTime
          totalDelta += delta
          count++
          if (delta > worstDelta) { worstDelta = delta; worstLap = a.lap.id }
        }
      }
      if (count > 0) {
        cornerDeltas.push({ name: fastestAnalysis.corners[ci].name, avgDelta: totalDelta / count, worstLap, worstDelta })
      }
    }
    cornerDeltas.sort((a, b) => b.avgDelta - a.avgDelta)

    report += '<TABLE_IMPROVE>'
    report += JSON.stringify(cornerDeltas)
    report += '</TABLE_IMPROVE>\n\n'

    // Per-lap corner data as expandable tables
    report += '## 每圈弯道数据\n\n'
    report += '<TABLE_LAPS>'
    const lapTableData = analyses.map(analysis => {
      const lap = analysis.lap
      const isFastest = lap.id === fastest.id
      return {
        lapId: lap.id,
        time: formatDuration(lap.duration),
        delta: isFastest ? null : (lap.duration - fastest.duration).toFixed(3),
        isFastest,
        corners: analysis.corners.map((c, ci) => {
          const bestCorner = fastestAnalysis!.corners[ci]
          const timeDelta = bestCorner ? (c.duration - bestCorner.duration) : 0
          return {
            name: c.name,
            entry: Math.round(c.entrySpeed),
            min: Math.round(c.minSpeed),
            exit: Math.round(c.exitSpeed),
            time: c.duration.toFixed(3),
            delta: isFastest ? null : (timeDelta >= 0 ? `+${timeDelta.toFixed(3)}` : timeDelta.toFixed(3)),
          }
        }),
      }
    })
    report += JSON.stringify(lapTableData)
    report += '</TABLE_LAPS>\n\n'
  }

  return report
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

function renderCornerTable(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr) as Array<{ name: string; direction: string; type: string; angle: number; entry: number; min: number; exit: number }>
    let html = '<table class="w-full text-xs mt-1 mb-2 border-collapse"><thead>'
    html += '<tr class="text-gray-500 border-b border-gray-800">'
    html += '<th class="text-left py-1 pr-2">弯道</th>'
    html += '<th class="text-left py-1 pr-2">类型</th>'
    html += '<th class="text-right py-1 pr-2">角度</th>'
    html += '<th class="text-right py-1 pr-2">入弯</th>'
    html += '<th class="text-right py-1 pr-2">最低</th>'
    html += '<th class="text-right py-1">出弯</th>'
    html += '</tr></thead><tbody>'
    for (const c of data) {
      html += `<tr class="text-gray-400 border-b border-gray-800/50">`
      html += `<td class="py-1 pr-2 font-medium text-gray-200">${c.name}</td>`
      html += `<td class="py-1 pr-2">${c.direction} ${c.type}</td>`
      html += `<td class="text-right py-1 pr-2">${c.angle}°</td>`
      html += `<td class="text-right py-1 pr-2">${c.entry}</td>`
      html += `<td class="text-right py-1 pr-2">${c.min}</td>`
      html += `<td class="text-right py-1">${c.exit}</td>`
      html += '</tr>'
    }
    html += '</tbody></table>'
    return html
  } catch {
    return '<p class="text-gray-500 text-xs">表格数据解析失败</p>'
  }
}

function renderStatCards(jsonStr: string): string {
  try {
    const d = JSON.parse(jsonStr) as { laps: number; fastest: { lap: number; time: string }; slowest: { lap: number; time: string }; gap: string; avg: string; stdDev: string; consistency: string; topSpeed: string }
    const consistencyColor = d.consistency === '优秀' ? '#22c55e' : d.consistency === '良好' ? '#3b82f6' : d.consistency === '一般' ? '#f59e0b' : '#ef4444'
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;">
      <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:#9ca3af;">🏁 最快圈</div>
        <div style="font-size:18px;font-weight:bold;color:#a78bfa;">第${d.fastest.lap}圈 ${d.fastest.time}</div>
      </div>
      <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:#9ca3af;">📊 平均圈速</div>
        <div style="font-size:18px;font-weight:bold;color:#60a5fa;">${d.avg}</div>
      </div>
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:#9ca3af;">🎯 一致性</div>
        <div style="font-size:14px;font-weight:bold;color:${consistencyColor};">${d.consistency} <span style="font-size:11px;color:#6b7280;">(${d.stdDev}s)</span></div>
      </div>
      <div style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);border-radius:8px;padding:10px;">
        <div style="font-size:10px;color:#9ca3af;">⚡ 最高速度</div>
        <div style="font-size:14px;font-weight:bold;color:#fb923c;">${d.topSpeed} km/h</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;font-size:11px;color:#6b7280;margin:4px 0 8px;">
      <span>🔄 共 ${d.laps} 圈</span>
      <span>📉 最慢第${d.slowest.lap}圈 ${d.slowest.time}</span>
      <span>📐 圈速差 ${d.gap}s</span>
    </div>`
  } catch {
    return ''
  }
}

function renderImproveTable(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr) as Array<{ name: string; avgDelta: number; worstLap: number; worstDelta: number }>
    if (data.length === 0) return '<p class="text-gray-500 text-xs">所有弯道表现均匀</p>'
    // Show top 5 with bar visualization
    const top = data.slice(0, 5)
    const maxDelta = top[0]?.avgDelta || 0.1
    let html = '<div style="margin:4px 0 8px;">'
    for (const w of top) {
      const barWidth = Math.min(100, (w.avgDelta / maxDelta) * 100)
      const barColor = w.avgDelta > 0.1 ? '#ef4444' : w.avgDelta > 0.05 ? '#f59e0b' : '#22c55e'
      html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px;">
        <span style="width:28px;font-weight:bold;color:#e5e7eb;">${w.name}</span>
        <div style="flex:1;height:14px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;">
          <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:3px;"></div>
        </div>
        <span style="width:55px;text-align:right;color:#9ca3af;">${w.avgDelta >= 0 ? '+' : ''}${w.avgDelta.toFixed(3)}s</span>
      </div>`
    }
    html += '</div>'
    return html
  } catch {
    return ''
  }
}

function renderLapTables(jsonStr: string): string {
  try {
    const laps = JSON.parse(jsonStr) as Array<{
      lapId: number; time: string; delta: string | null; isFastest: boolean
      corners: Array<{ name: string; entry: number; min: number; exit: number; time: string; delta: string | null }>
    }>

    let html = ''
    for (const lap of laps) {
      const label = lap.isFastest ? `<span style="color:#a78bfa;">第${lap.lapId}圈 ${lap.time} ★</span>` : `第${lap.lapId}圈 ${lap.time} <span style="color:#ef4444;">+${lap.delta}s</span>`
      html += `<details style="margin:2px 0;"><summary style="cursor:pointer;font-size:12px;font-weight:600;color:#d1d5db;padding:4px 0;">${label}</summary>`
      html += '<table class="w-full text-xs mb-2 border-collapse"><thead>'
      html += '<tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-0.5 pr-1">弯</th><th class="text-right py-0.5 pr-1">入弯</th><th class="text-right py-0.5 pr-1">最低</th><th class="text-right py-0.5 pr-1">出弯</th><th class="text-right py-0.5 pr-1">耗时</th><th class="text-right py-0.5">差</th></tr></thead><tbody>'
      for (const c of lap.corners) {
        const deltaColor = c.delta === null ? '' : (c.delta.startsWith('+') ? 'color:#ef4444;' : 'color:#22c55e;')
        html += `<tr class="border-b border-gray-800/30"><td class="py-0.5 pr-1 text-gray-300">${c.name}</td><td class="text-right py-0.5 pr-1 text-gray-400">${c.entry}</td><td class="text-right py-0.5 pr-1 text-gray-400">${c.min}</td><td class="text-right py-0.5 pr-1 text-gray-400">${c.exit}</td><td class="text-right py-0.5 pr-1 text-gray-400">${c.time}</td><td class="text-right py-0.5" style="${deltaColor}">${c.delta ?? '—'}</td></tr>`
      }
      html += '</tbody></table></details>'
    }
    return html
  } catch {
    return ''
  }
}

function renderMarkdown(text: string): string {
  // Handle all custom tags first
  let processed = text
    .replace(/<STAT_CARDS>([\s\S]*?)<\/STAT_CARDS>/g, (_, json) => renderStatCards(json.trim()))
    .replace(/<TABLE_CORNERS>([\s\S]*?)<\/TABLE_CORNERS>/g, (_, json) => renderCornerTable(json.trim()))
    .replace(/<TABLE_IMPROVE>([\s\S]*?)<\/TABLE_IMPROVE>/g, (_, json) => renderImproveTable(json.trim()))
    .replace(/<TABLE_LAPS>([\s\S]*?)<\/TABLE_LAPS>/g, (_, json) => renderLapTables(json.trim()))

  const lines = processed.split('\n')
  const htmlLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip lines that contain table HTML (already rendered)
    if (trimmed.startsWith('<table') || trimmed.startsWith('<tr') || trimmed.startsWith('<th') || trimmed.startsWith('<td') || trimmed.startsWith('</t')) {
      htmlLines.push(trimmed)
      continue
    }
    if (!trimmed) {
      htmlLines.push('<div class="h-2"></div>')
    } else if (trimmed.startsWith('### ')) {
      htmlLines.push(`<h4 class="text-sm font-bold text-gray-200 mt-3 mb-1">${trimmed.slice(4)}</h4>`)
    } else if (trimmed.startsWith('## ')) {
      htmlLines.push(`<h3 class="text-sm font-bold text-purple-400 mt-4 mb-1">${trimmed.slice(3)}</h3>`)
    } else if (trimmed.startsWith('# ')) {
      htmlLines.push(`<h3 class="text-base font-bold text-gray-100 mt-4 mb-1">${trimmed.slice(2)}</h3>`)
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const content = trimmed.slice(2)
      htmlLines.push(`<div class="ml-3 text-gray-400 before:content-['•'] before:mr-2 before:text-purple-400">${formatInline(content)}</div>`)
    } else if (trimmed === '---') {
      htmlLines.push('<hr class="border-gray-700 my-2"/>')
    } else {
      htmlLines.push(`<p class="text-gray-400 leading-relaxed">${formatInline(trimmed)}</p>`)
    }
  }

  return htmlLines.join('')
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-200">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1 rounded text-purple-300 text-[11px]">$1</code>')
}

export default function AICoach({ analyses, aiConfig, onConfigChange }: AICoachProps) {
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const report = useMemo(() => generateReport(analyses), [analyses])

  const fullAnalysis = useMemo(() => {
    const laps = analyses.map((a) => a.lap)
    const corners = analyses[0]?.corners ?? []
    return generateFullAnalysis(laps, corners, analyses)
  }, [analyses])

  const racingLineAnalyses = useMemo((): RacingLineAnalysis[] => {
    if (analyses.length < 2) return []
    const laps = analyses.map((a) => a.lap)
    const corners = analyses[0]?.corners ?? []
    const fastestLap = laps.reduce((best, lap) => lap.duration < best.duration ? lap : best, laps[0])
    const fastestAnalysis = analyses.find((a) => a.lap.id === fastestLap.id)!
    return analyses
      .filter((a) => a.lap.id !== fastestLap.id)
      .map((a) => analyzeRacingLine(fastestLap, a.lap, fastestAnalysis, a, corners))
  }, [analyses])

  const fastestLapId = useMemo(() => {
    const laps = analyses.map((a) => a.lap)
    return laps.reduce((best, lap) => lap.duration < best.duration ? lap : best, laps[0]).id
  }, [analyses])

  // Track corner count — clear chat when corners change
  const cornerCount = analyses[0]?.corners?.length ?? 0
  const prevCornerCountRef = useRef(cornerCount)
  useEffect(() => {
    if (prevCornerCountRef.current !== cornerCount && messages.length > 0) {
      setMessages([{
        role: 'assistant',
        content: `弯道已更新（${prevCornerCountRef.current} → ${cornerCount} 个），数据已刷新。你可以继续提问，我会基于最新的弯道配置来分析。`,
      }])
    }
    prevCornerCountRef.current = cornerCount
  }, [cornerCount])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const systemPrompt = useMemo(() => `你是 KartPro AI 教练，一位专业的卡丁车教练和数据分析师。

严格要求：
1. 必须使用完整的弯道编号，如"T2"、"T8"，绝对不能省略编号
2. 所有速度必须带完整单位"km/h"，如"36 km/h"，不能写"36/h"或省略单位
3. 引用数据时必须准确，直接从下方遥测数据中读取数值
4. 每个弯道建议格式：先说弯道编号和类型，再说数据发现，最后给具体建议
5. 用简洁清晰的中文回答，不要使用 Markdown 格式

回答原则：
1. 先从整条赛道的角度分析，再谈单弯。考虑弯道之间的关系：出弯接直道的弯要强调出弯速度，组合弯要当整体来走。
2. 抓主因：每个弯道找到一个最核心的问题（出弯减速 > 不稳定 > 重刹 > 出弯加速弱），不要堆砌多个建议。
3. 用快圈组 vs 慢圈组的对比数据来佐证，而不是只看最快圈。

回答示例格式：
"T2（右弯发卡弯，约263°）：入弯速度 55 km/h，最低速 36 km/h，出弯速度 43 km/h。入弯到弯心速度下降了 19 km/h，说明刹车太晚或太猛。建议提前 3-5 米开始轻刹，入弯速度控制在 50 km/h 左右，保持弯心速度在 40 km/h 以上。"

以下是本次训练的遥测数据：

${report}`, [report])

  const sendMessageWithContent = useCallback(async (content: string, showAsUser = true) => {
    if (!aiConfig) return

    if (showAsUser) {
      setMessages((prev) => [...prev, { role: 'user', content }])
    }
    setIsThinking(true)

    try {
      const response = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content },
          ],
          max_tokens: 4096,
          stream: true,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`API ${response.status}: ${body.slice(0, 200)}`)
      }

      // Parse SSE streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let fullContent = ''

      // Add an empty assistant message that we'll update as chunks arrive
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      setIsThinking(false)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              fullContent += delta
              const current = fullContent
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: current }
                return updated
              })
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      if (!fullContent) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: '未收到回复。' }
          return updated
        })
      }
    } catch (err) {
      setMessages((prev) => {
        // If last message is an empty assistant placeholder, update it
        if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].content) {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `错误: ${err instanceof Error ? err.message : '请求失败'}`,
          }
          return updated
        }
        return [...prev, { role: 'assistant', content: `错误: ${err instanceof Error ? err.message : '请求失败'}` }]
      })
    } finally {
      setIsThinking(false)
    }
  }, [aiConfig, messages, systemPrompt])

  const sendMessage = useCallback(() => {
    if (!input.trim()) return
    const content = input.trim()
    setInput('')
    sendMessageWithContent(content)
  }, [input, sendMessageWithContent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {showSettings && (
        <Settings
          config={aiConfig}
          onSave={(config) => {
            onConfigChange(config)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-bold text-gray-200">AI 教练</h2>
        <button
          onClick={() => setShowSettings(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {aiConfig ? '设置' : '配置 AI'}
        </button>
      </div>

      {/* Analysis Report + Chat */}
      <div className="overflow-y-auto flex-1 min-h-0">
        <div className="px-4 py-3 border-b border-gray-800">
          <AnalysisReport analysis={fullAnalysis} />
          {racingLineAnalyses.length > 0 && (
            <div className="mt-2">
              <RacingLineReport analyses={racingLineAnalyses} fastestLapId={fastestLapId} />
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="px-4 py-2 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-gray-200'
                  : 'text-gray-400'
              }`}
            >
              {msg.role === 'user' && (
                <span className="text-[10px] text-purple-400 font-medium block mb-1">你</span>
              )}
              {msg.role === 'assistant' && (
                <span className="text-[10px] text-green-400 font-medium block mb-1">教练</span>
              )}
              <div
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(msg.content),
                }}
              />
            </div>
          ))}

          {isThinking && (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span>分析中...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-800 shrink-0">
        {!aiConfig ? (
          <button
            onClick={() => setShowSettings(true)}
            className="w-full py-2.5 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-lg text-sm hover:bg-purple-600/30 transition-colors"
          >
            配置 AI 开始对话
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="向 AI 教练提问..."
              disabled={isThinking}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isThinking || !input.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
            >
              发送
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
