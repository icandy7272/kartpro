import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SatelliteCalibrationControl from '../SatelliteCalibrationControl'

describe('SatelliteCalibrationControl', () => {
  it('stays collapsed by default and expands to reveal shared satellite alignment controls', () => {
    const handleAdjust = vi.fn()
    const handleReset = vi.fn()

    render(
      <SatelliteCalibrationControl
        calibration={{ eastMeters: 1, northMeters: -3 }}
        onAdjust={handleAdjust}
        onReset={handleReset}
      />
    )

    const expandButton = screen.getByRole('button', { name: '展开卫星微调' })
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '向北微调' })).not.toBeInTheDocument()

    fireEvent.click(expandButton)

    expect(screen.getByRole('button', { name: '收起卫星微调' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('北 -3m / 东 +1m')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '向北微调' }))
    fireEvent.click(screen.getByRole('button', { name: '重置卫星校准' }))

    expect(handleAdjust).toHaveBeenCalledWith('north')
    expect(handleReset).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '收起卫星微调' }))

    expect(screen.getByRole('button', { name: '展开卫星微调' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '向北微调' })).not.toBeInTheDocument()
  })
})
