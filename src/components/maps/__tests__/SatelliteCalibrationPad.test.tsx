import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SatelliteCalibrationPad from '../SatelliteCalibrationPad'

describe('SatelliteCalibrationPad', () => {
  it('renders directional controls and reset for manual satellite alignment', () => {
    const handleAdjust = vi.fn()
    const handleReset = vi.fn()

    render(
      <SatelliteCalibrationPad
        calibration={{ eastMeters: 1, northMeters: -3 }}
        onAdjust={handleAdjust}
        onReset={handleReset}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '向北微调' }))
    fireEvent.click(screen.getByRole('button', { name: '向南微调' }))
    fireEvent.click(screen.getByRole('button', { name: '向西微调' }))
    fireEvent.click(screen.getByRole('button', { name: '向东微调' }))
    fireEvent.click(screen.getByRole('button', { name: '重置卫星校准' }))

    expect(handleAdjust).toHaveBeenNthCalledWith(1, 'north')
    expect(handleAdjust).toHaveBeenNthCalledWith(2, 'south')
    expect(handleAdjust).toHaveBeenNthCalledWith(3, 'west')
    expect(handleAdjust).toHaveBeenNthCalledWith(4, 'east')
    expect(handleReset).toHaveBeenCalledTimes(1)
    expect(screen.getByText('北 -3m / 东 +1m')).toBeInTheDocument()
  })
})
