import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SemanticConfirmationPanel from '../SemanticConfirmationPanel'

describe('SemanticConfirmationPanel', () => {
  it('renders pending confirmations and routes confirm / reject actions', () => {
    const onConfirm = vi.fn()
    const onReject = vi.fn()

    render(
      <SemanticConfirmationPanel
        confirmations={[
          {
            id: 'cmp-1',
            tagType: 'compound-corner',
            targetCornerIds: [5, 6],
            confidence: 0.64,
            prompt: 'T5 和 T6 是否应该按组合弯处理？',
            recommendation: 'review',
          },
        ]}
        onConfirm={onConfirm}
        onReject={onReject}
        onOverride={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /确认/i }))
    expect(onConfirm).toHaveBeenCalledWith('cmp-1')

    fireEvent.click(screen.getByRole('button', { name: /驳回/i }))
    expect(onReject).toHaveBeenCalledWith('cmp-1')
  })
})
