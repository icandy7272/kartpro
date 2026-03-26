import Dexie, { type EntityTable } from 'dexie'
import type { TrainingSession } from '../types'

interface SessionRecord {
  id: string
  filename: string
  date: Date
  data: string // JSON-serialized TrainingSession (Dexie handles structured clone but GPS arrays can be large)
}

const db = new Dexie('KartProDB') as Dexie & {
  sessions: EntityTable<SessionRecord, 'id'>
}

db.version(1).stores({
  sessions: 'id, filename, date',
})

export { db }

export async function saveSession(session: TrainingSession): Promise<void> {
  const record: SessionRecord = {
    id: session.id,
    filename: session.filename,
    date: session.date,
    data: JSON.stringify(session),
  }
  await db.sessions.put(record)
}

export async function getSessions(): Promise<TrainingSession[]> {
  const records = await db.sessions.orderBy('date').reverse().toArray()
  return records.map((r) => {
    const parsed = JSON.parse(r.data) as TrainingSession
    parsed.date = new Date(parsed.date)
    return parsed
  })
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
