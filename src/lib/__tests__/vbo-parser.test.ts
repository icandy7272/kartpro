import { describe, expect, it } from 'vitest'
import { parseVBO } from '../vbo-parser'

describe('parseVBO', () => {
  it('parses VBO files that use CRCRLF line endings', () => {
    const text = [
      'File created on 20/04/2026 at 02:28:25',
      '',
      '[session data]',
      'name test2',
      '',
      '[column names]',
      'sats time lat long velocity heading height',
      '',
      '[data]',
      '012 022825.600 +02400.35259 -06987.51022 004.011 359.14 +00047.90',
      '012 022825.878 +02400.35276 -06987.51022 003.528 357.69 +00047.70',
      '',
      '[laptiming]',
      'Start -06987.51022 +02400.35259 -06987.51023 +02400.35280',
    ].join('\r\r\n')

    const result = parseVBO(text)

    expect(result.sessionName).toBe('test2')
    expect(result.points).toHaveLength(2)
    expect(result.points[0].lat).toBeCloseTo(40.0058765, 6)
    expect(result.points[0].lng).toBeCloseTo(116.4585037, 6)
    expect(result.points[0].speed).toBeCloseTo(1.1141667, 6)
    expect(result.points[0].altitude).toBeCloseTo(47.9, 6)
    expect(result.startFinishLine).toBeDefined()
    expect(result.startFinishLine?.lat1).toBeCloseTo(40.0058765, 6)
    expect(result.startFinishLine?.lng1).toBeCloseTo(116.45850366666666, 6)
    expect(result.startFinishLine?.lat2).toBeCloseTo(40.00588, 6)
    expect(result.startFinishLine?.lng2).toBeCloseTo(116.45850383333334, 6)
    expect(result.date.getFullYear()).toBe(2026)
    expect(result.date.getMonth()).toBe(3)
    expect(result.date.getDate()).toBe(20)
    expect(result.date.getHours()).toBe(2)
    expect(result.date.getMinutes()).toBe(28)
    expect(result.date.getSeconds()).toBe(25)
  })

  it('parses KartGPS laptiming start lines that store latitude before longitude', () => {
    const text = [
      '[column names]',
      'sats time lat long velocity heading height',
      '',
      '[data]',
      '012 022825.600 +02400.35259 -06987.51022 004.011 359.14 +00047.90',
      '012 022825.878 +02400.35276 -06987.51022 003.528 357.69 +00047.70',
      '',
      '[laptiming]',
      'Start  +02400.35234 -06987.50658 +02400.35267 -06987.51371 Start / Finish',
    ].join('\n')

    const result = parseVBO(text)

    expect(result.startFinishLine).toBeDefined()
    expect(result.startFinishLine?.lat1).toBeCloseTo(40.00587233333333, 6)
    expect(result.startFinishLine?.lng1).toBeCloseTo(116.458443, 6)
    expect(result.startFinishLine?.lat2).toBeCloseTo(40.00587783333334, 6)
    expect(result.startFinishLine?.lng2).toBeCloseTo(116.45856183333333, 6)
  })
})
