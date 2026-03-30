import { describe, expect, it } from 'vitest'
import { generateVBOText } from '../vbo-export'
import { parseVBO } from '../vbo-parser'
import type { GPSPoint } from '../../types'

const COORD_PRECISION = 5 // decimal degrees, ~1m accuracy

const points: GPSPoint[] = [
  { lat: 40.057313, lng: 116.273203, speed: 20.6, time: 81803500, altitude: 31.3 },
  { lat: 40.057313, lng: 116.273189, speed: 20.7, time: 81803600, altitude: 31.3 },
  { lat: 40.057312, lng: 116.273174, speed: 20.8, time: 81803700, altitude: 31.3 },
]

const startFinish = {
  lat1: 40.057300, lng1: 116.273100,
  lat2: 40.057400, lng2: 116.273300,
}

describe('VBO export → import roundtrip', () => {
  it('generates a parseable VBO file', () => {
    const text = generateVBOText(points, 'test.mp4')
    const result = parseVBO(text)
    expect(result.points).toHaveLength(points.length)
  })

  it('roundtrips latitude correctly', () => {
    const text = generateVBOText(points, 'test.mp4')
    const result = parseVBO(text)
    result.points.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(points[i].lat, COORD_PRECISION)
    })
  })

  it('roundtrips longitude correctly', () => {
    const text = generateVBOText(points, 'test.mp4')
    const result = parseVBO(text)
    result.points.forEach((p, i) => {
      expect(p.lng).toBeCloseTo(points[i].lng, COORD_PRECISION)
    })
  })

  it('roundtrips speed correctly', () => {
    const text = generateVBOText(points, 'test.mp4')
    const result = parseVBO(text)
    result.points.forEach((p, i) => {
      expect(p.speed).toBeCloseTo(points[i].speed, 1)
    })
  })

  it('roundtrips altitude correctly', () => {
    const text = generateVBOText(points, 'test.mp4')
    const result = parseVBO(text)
    result.points.forEach((p, i) => {
      expect(p.altitude).toBeCloseTo(points[i].altitude, 1)
    })
  })

  it('exported file has [column names] section', () => {
    const text = generateVBOText(points, 'test.mp4')
    expect(text).toContain('[column names]')
    expect(text).not.toContain('[header]')
  })
})

describe('VBO start/finish line roundtrip', () => {
  it('includes [laptiming] section when startFinish is provided', () => {
    const text = generateVBOText(points, 'test.mp4', startFinish)
    expect(text).toContain('[laptiming]')
    expect(text).toContain('Start ')
  })

  it('omits [laptiming] section when startFinish is not provided', () => {
    const text = generateVBOText(points, 'test.mp4')
    expect(text).not.toContain('[laptiming]')
  })

  it('roundtrips start/finish lat1/lng1 correctly', () => {
    const text = generateVBOText(points, 'test.mp4', startFinish)
    const result = parseVBO(text)
    expect(result.startFinishLine).toBeDefined()
    expect(result.startFinishLine!.lat1).toBeCloseTo(startFinish.lat1, COORD_PRECISION)
    expect(result.startFinishLine!.lng1).toBeCloseTo(startFinish.lng1, COORD_PRECISION)
  })

  it('roundtrips start/finish lat2/lng2 correctly', () => {
    const text = generateVBOText(points, 'test.mp4', startFinish)
    const result = parseVBO(text)
    expect(result.startFinishLine!.lat2).toBeCloseTo(startFinish.lat2, COORD_PRECISION)
    expect(result.startFinishLine!.lng2).toBeCloseTo(startFinish.lng2, COORD_PRECISION)
  })
})
