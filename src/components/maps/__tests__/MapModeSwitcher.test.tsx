import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MapModeSwitcher from '../MapModeSwitcher'

describe('MapModeSwitcher', () => {
  it('renders the three shared map modes, highlights the active mode, and switches on click', () => {
    const handleChange = vi.fn()

    render(<MapModeSwitcher value="align" onChange={handleChange} />)

    const alignButton = screen.getByRole('button', { name: '对齐模式' })
    const trainingButton = screen.getByRole('button', { name: '训练模式' })
    const satelliteButton = screen.getByRole('button', { name: '卫星模式' })

    expect(alignButton).toHaveAttribute('aria-pressed', 'true')
    expect(trainingButton).toHaveAttribute('aria-pressed', 'false')
    expect(satelliteButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(trainingButton)

    expect(handleChange).toHaveBeenCalledWith('training')
  })
})
