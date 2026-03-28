import Dexie, { type EntityTable } from 'dexie'
import type { TrainingSession } from '../types'

export interface SessionSummary {
  id: string
  filename: string
  date: Date
  lapCount: number
  fastestLap: number // seconds
  trackName?: string
}

interface SessionRecord {
  id: string
  filename: string
  date: Date
  lapCount: number
  fastestLap: number
  trackName: string
  data: string // JSON-serialized TrainingSession
}

const db = new Dexie('KartProDB') as Dexie & {
  sessions: EntityTable<SessionRecord, 'id'>
}

db.version(1).stores({
  sessions: 'id, filename, date',
})

export { db }

export async function saveSession(session: TrainingSession): Promise<void> {
  const fastestLap = session.laps.reduce((best, lap) => Math.min(best, lap.duration), Infinity)
  const record: SessionRecord = {
    id: session.id,
    filename: session.filename,
    date: session.date,
    lapCount: session.laps.length,
    fastestLap,
    trackName: session.filename.replace(/\.[^.]+$/, ''),
    data: JSON.stringify(session),
  }
  await db.sessions.put(record)
}

export async function getSessionSummaries(): Promise<SessionSummary[]> {
  const records = await db.sessions.orderBy('date').reverse().toArray()
  return records.map((r) => ({
    id: r.id,
    filename: r.filename,
    date: new Date(r.date),
    lapCount: r.lapCount ?? 0,
    fastestLap: r.fastestLap ?? 0,
    trackName: r.trackName,
  }))
}

export async function getSession(id: string): Promise<TrainingSession | undefined> {
  const record = await db.sessions.get(id)
  if (!record) return undefined
  const parsed = JSON.parse(record.data) as TrainingSession
  parsed.date = new Date(parsed.date)
  return parsed
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}
