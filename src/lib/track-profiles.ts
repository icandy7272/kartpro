import type { GPSPoint, TrackProfile } from '../types'

const STORAGE_KEY = 'kartpro-track-profiles'

/**
 * Calculate haversine distance between two lat/lng points in meters.
 */
function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
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

/**
 * Calculate the centroid of a set of GPS points.
 */
export function calculateCenter(points: GPSPoint[]): { lat: number; lng: number } {
  if (points.length === 0) return { lat: 0, lng: 0 }
  let sumLat = 0
  let sumLng = 0
  for (const p of points) {
    sumLat += p.lat
    sumLng += p.lng
  }
  return { lat: sumLat / points.length, lng: sumLng / points.length }
}

/**
 * Get all saved track profiles from localStorage.
 */
export function getTrackProfiles(): TrackProfile[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * Save or update a track profile in localStorage.
 */
export function saveTrackProfile(profile: TrackProfile): void {
  const profiles = getTrackProfiles()
  const existingIndex = profiles.findIndex((p) => p.id === profile.id)
  if (existingIndex >= 0) {
    profiles[existingIndex] = { ...profile, updatedAt: Date.now() }
  } else {
    profiles.push(profile)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

/**
 * Delete a track profile by ID.
 */
export function deleteTrackProfile(id: string): void {
  const profiles = getTrackProfiles().filter((p) => p.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

/**
 * Find a matching track profile by comparing center of GPS points
 * with saved profile centers. Match threshold: 500 meters.
 */
export function findMatchingProfile(points: GPSPoint[]): TrackProfile | null {
  if (points.length === 0) return null
  const center = calculateCenter(points)
  const profiles = getTrackProfiles()

  let bestMatch: TrackProfile | null = null
  let bestDist = Infinity

  for (const profile of profiles) {
    const dist = haversineDistance(center, { lat: profile.centerLat, lng: profile.centerLng })
    if (dist < 500 && dist < bestDist) {
      bestDist = dist
      bestMatch = profile
    }
  }

  return bestMatch
}
