import OpenAI from 'openai'
import type { LapAnalysis, AIConfig, AIMessage } from '../types'

/**
 * Generate a structured training report string from lap analyses.
 * Summarizes per-lap and per-corner performance for use in AI prompts.
 */
export function generateTrainingReport(analyses: LapAnalysis[]): string {
  if (analyses.length === 0) return 'No lap data available.'

  const lines: string[] = []
  lines.push(`=== TRAINING SESSION REPORT ===`)
  lines.push(`Total laps analyzed: ${analyses.length}`)
  lines.push('')

  // Overall stats
  const lapTimes = analyses.map((a) => a.lap.duration)
  const bestLap = Math.min(...lapTimes)
  const worstLap = Math.max(...lapTimes)
  const avgLap = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length

  lines.push(`Best lap: ${bestLap.toFixed(3)}s`)
  lines.push(`Worst lap: ${worstLap.toFixed(3)}s`)
  lines.push(`Average lap: ${avgLap.toFixed(3)}s`)
  lines.push(`Consistency (std dev): ${standardDeviation(lapTimes).toFixed(3)}s`)
  lines.push('')

  // Per-lap breakdown
  for (const analysis of analyses) {
    const lap = analysis.lap
    lines.push(`--- Lap ${lap.id} ---`)
    lines.push(`  Time: ${lap.duration.toFixed(3)}s`)
    lines.push(`  Distance: ${lap.distance.toFixed(1)}m`)
    lines.push(`  Max speed: ${(lap.maxSpeed * 3.6).toFixed(1)} km/h`)
    lines.push(`  Avg speed: ${(lap.avgSpeed * 3.6).toFixed(1)} km/h`)

    if (analysis.corners.length > 0) {
      lines.push(`  Corners:`)
      for (const corner of analysis.corners) {
        lines.push(
          `    ${corner.name}: entry=${(corner.entrySpeed * 3.6).toFixed(1)}km/h, ` +
            `min=${(corner.minSpeed * 3.6).toFixed(1)}km/h, ` +
            `exit=${(corner.exitSpeed * 3.6).toFixed(1)}km/h, ` +
            `time=${corner.duration.toFixed(3)}s`
        )
      }
    }

    if (analysis.sectorTimes.length > 0) {
      lines.push(`  Sector times: ${analysis.sectorTimes.map((t) => t.toFixed(3) + 's').join(', ')}`)
    }
    lines.push('')
  }

  // Identify weakest corners (highest average time compared to best time)
  const cornerCount = analyses[0]?.corners.length ?? 0
  if (cornerCount > 0 && analyses.every((a) => a.corners.length === cornerCount)) {
    lines.push(`=== CORNER ANALYSIS ===`)
    for (let c = 0; c < cornerCount; c++) {
      const times = analyses.map((a) => a.corners[c].duration)
      const bestTime = Math.min(...times)
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      const timeLoss = avgTime - bestTime

      const entrySpeeds = analyses.map((a) => a.corners[c].entrySpeed * 3.6)
      const minSpeeds = analyses.map((a) => a.corners[c].minSpeed * 3.6)
      const exitSpeeds = analyses.map((a) => a.corners[c].exitSpeed * 3.6)

      lines.push(`Corner ${analyses[0].corners[c].name}:`)
      lines.push(`  Best time: ${bestTime.toFixed(3)}s, Avg time: ${avgTime.toFixed(3)}s, Avg loss: ${timeLoss.toFixed(3)}s`)
      lines.push(`  Entry speed: best=${Math.max(...entrySpeeds).toFixed(1)}, avg=${(entrySpeeds.reduce((a, b) => a + b, 0) / entrySpeeds.length).toFixed(1)} km/h`)
      lines.push(`  Min speed: best=${Math.max(...minSpeeds).toFixed(1)}, avg=${(minSpeeds.reduce((a, b) => a + b, 0) / minSpeeds.length).toFixed(1)} km/h`)
      lines.push(`  Exit speed: best=${Math.max(...exitSpeeds).toFixed(1)}, avg=${(exitSpeeds.reduce((a, b) => a + b, 0) / exitSpeeds.length).toFixed(1)} km/h`)
    }

    // Rank corners by time loss
    const cornerLoss: Array<{ name: string; loss: number }> = []
    for (let c = 0; c < cornerCount; c++) {
      const times = analyses.map((a) => a.corners[c].duration)
      const bestTime = Math.min(...times)
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      cornerLoss.push({ name: analyses[0].corners[c].name, loss: avgTime - bestTime })
    }
    cornerLoss.sort((a, b) => b.loss - a.loss)

    lines.push('')
    lines.push(`Weakest corners (by avg time loss):`)
    for (const cl of cornerLoss) {
      lines.push(`  ${cl.name}: ${cl.loss.toFixed(3)}s average time loss`)
    }
  }

  return lines.join('\n')
}

/**
 * Build the system prompt for the AI coach, including all telemetry data.
 */
export function buildSystemPrompt(analyses: LapAnalysis[]): string {
  const report = generateTrainingReport(analyses)

  return `You are an expert karting coach and data analyst. You have access to the following telemetry data from a karting session. Use this data to provide specific, actionable driving advice.

Focus on:
1. Identifying the weakest corners where the most time is being lost
2. Comparing corner entry speeds, minimum speeds, and exit speeds across laps
3. Suggesting specific technique improvements (braking points, turn-in, throttle application)
4. Highlighting consistency issues
5. Recognizing what the driver is doing well

When discussing speeds, always use km/h. When discussing times, use seconds with 3 decimal places.

Be specific and reference the actual data. Avoid generic advice. If a corner shows high entry speed but low exit speed, that suggests early apex and poor exit. If minimum speed is low but entry is good, suggest later braking and a later apex.

Here is the session telemetry:

${report}`
}

/**
 * Send messages to an OpenAI-compatible API endpoint.
 */
export async function sendToAI(
  config: AIConfig,
  messages: AIMessage[]
): Promise<string> {
  const client = new OpenAI({
    baseURL: config.endpoint,
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  })

  const response = await client.chat.completions.create({
    model: config.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: 0.7,
    max_tokens: 2000,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('AI returned an empty response.')
  }

  return content
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const squareDiffs = values.map((v) => (v - avg) ** 2)
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / (values.length - 1))
}
