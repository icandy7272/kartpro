import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { LapAnalysis, AIConfig, AIMessage } from '../types'
import Settings from './Settings'

interface AICoachProps {
  analyses: LapAnalysis[]
  aiConfig: AIConfig | null
  onConfigChange: (config: AIConfig | null) => void
}

function generateReport(analyses: LapAnalysis[]): string {
  if (analyses.length === 0) return 'No lap data available for analysis.'

  const laps = analyses.map((a) => a.lap)
  const fastest = laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), laps[0])
  const slowest = laps.reduce((worst, lap) => (lap.duration > worst.duration ? lap : worst), laps[0])

  const fastestAnalysis = analyses.find((a) => a.lap.id === fastest.id)

  let report = '## Session Overview\n\n'
  report += `**Total Laps:** ${laps.length}\n`
  report += `**Fastest Lap:** Lap ${fastest.id} - ${formatDuration(fastest.duration)}\n`
  report += `**Slowest Lap:** Lap ${slowest.id} - ${formatDuration(slowest.duration)}\n`
  report += `**Time Spread:** ${(slowest.duration - fastest.duration).toFixed(3)}s\n`
  report += `**Avg Lap Time:** ${formatDuration(laps.reduce((s, l) => s + l.duration, 0) / laps.length)}\n\n`

  report += '## Consistency\n\n'
  const times = laps.map((l) => l.duration)
  const mean = times.reduce((s, t) => s + t, 0) / times.length
  const variance = times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length
  const stdDev = Math.sqrt(variance)
  const consistency = stdDev < 0.5 ? 'Excellent' : stdDev < 1 ? 'Good' : stdDev < 2 ? 'Fair' : 'Needs work'
  report += `**Std Deviation:** ${stdDev.toFixed(3)}s (${consistency})\n\n`

  if (fastestAnalysis && fastestAnalysis.corners.length > 0) {
    report += '## Corner Analysis (Fastest Lap)\n\n'
    for (const corner of fastestAnalysis.corners) {
      report += `**${corner.name}:** Entry ${corner.entrySpeed.toFixed(0)} km/h, `
      report += `Min ${corner.minSpeed.toFixed(0)} km/h, `
      report += `Exit ${corner.exitSpeed.toFixed(0)} km/h\n`
    }
    report += '\n'

    // Find biggest time loss corners across laps
    report += '## Areas for Improvement\n\n'
    const cornerDeltas: Array<{ name: string; avgDelta: number }> = []
    for (let ci = 0; ci < fastestAnalysis.corners.length; ci++) {
      const bestTime = fastestAnalysis.corners[ci].duration
      let totalDelta = 0
      let count = 0
      for (const a of analyses) {
        if (a.lap.id === fastest.id) continue
        if (a.corners[ci]) {
          totalDelta += a.corners[ci].duration - bestTime
          count++
        }
      }
      if (count > 0) {
        cornerDeltas.push({
          name: fastestAnalysis.corners[ci].name,
          avgDelta: totalDelta / count,
        })
      }
    }
    cornerDeltas.sort((a, b) => b.avgDelta - a.avgDelta)
    const worst = cornerDeltas.slice(0, 3)
    if (worst.length > 0) {
      for (const w of worst) {
        report += `- **${w.name}**: Average ${w.avgDelta.toFixed(3)}s lost vs fastest lap\n`
      }
    } else {
      report += 'Not enough data to determine improvement areas.\n'
    }
  }

  report += '\n## Top Speed\n\n'
  report += `**Session Max:** ${(Math.max(...laps.map((l) => l.maxSpeed)) * 3.6).toFixed(1)} km/h\n`
  report += `**Fastest Lap Max:** ${(fastest.maxSpeed * 3.6).toFixed(1)} km/h\n`

  return report
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/## (.+)/g, '<h3 class="text-sm font-bold text-gray-200 mt-4 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-200">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-gray-400">$1</li>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n/g, '<br/>')
  return html
}

export default function AICoach({ analyses, aiConfig, onConfigChange }: AICoachProps) {
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const report = useMemo(() => generateReport(analyses), [analyses])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !aiConfig) return

    const userMsg: AIMessage = { role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const systemPrompt = `You are KartPro AI Coach, an expert karting coach analyzing telemetry data. Here is the session report:\n\n${report}\n\nProvide concise, actionable advice based on the data. Focus on driving technique improvements.`

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
            { role: 'user', content: input.trim() },
          ],
          max_tokens: 1024,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const assistantContent =
        data.choices?.[0]?.message?.content ?? 'No response received.'

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantContent },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }, [input, aiConfig, messages, report])

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
        <h2 className="text-sm font-bold text-gray-200">AI Coach</h2>
        <button
          onClick={() => setShowSettings(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {aiConfig ? 'Settings' : 'Configure AI'}
        </button>
      </div>

      {/* Report */}
      <div className="overflow-y-auto flex-1 min-h-0">
        <div className="px-4 py-3 border-b border-gray-800">
          <div
            className="text-xs text-gray-400 leading-relaxed prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
          />
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
                <span className="text-[10px] text-purple-400 font-medium block mb-1">You</span>
              )}
              {msg.role === 'assistant' && (
                <span className="text-[10px] text-green-400 font-medium block mb-1">Coach</span>
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
              <span>Analyzing...</span>
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
            Configure AI to start chatting
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your AI coach..."
              disabled={isThinking}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isThinking || !input.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
