import type { SemanticConfirmation, SemanticTagType } from '../lib/analysis/semantic-types'

const TAG_LABELS: Record<SemanticTagType, string> = {
  'must-hit-exit': '关键出弯',
  'compound-corner': '组合弯',
  'setup-corner': '铺垫弯',
  'sacrifice-entry': '牺牲入弯',
}

interface SemanticConfirmationPanelProps {
  confirmations: SemanticConfirmation[]
  onConfirm: (id: string) => void
  onReject: (id: string) => void
  onOverride: (id: string, tagType: SemanticTagType) => void
  onSkip: (id: string) => void
}

export default function SemanticConfirmationPanel({
  confirmations,
  onConfirm,
  onReject,
  onOverride,
  onSkip,
}: SemanticConfirmationPanelProps) {
  if (confirmations.length === 0) {
    return null
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800/50 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-gray-200">教练待确认语义</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            仅展示中等置信度判断，确认后会立刻影响教练点评。
          </p>
        </div>
        <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
          {confirmations.length} 项待处理
        </span>
      </div>

      <div className="p-2 space-y-2">
        {confirmations.map((confirmation) => (
          <div
            key={confirmation.id}
            className="rounded-lg border border-gray-800 bg-gray-950/70 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded-full px-2 py-0.5">
                    {TAG_LABELS[confirmation.tagType]}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    T{confirmation.targetCornerIds.join(' → T')}
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 mt-2 leading-relaxed">
                  {confirmation.prompt}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-gray-500">置信度</div>
                <div className="text-sm font-bold text-amber-300">
                  {(confirmation.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-500">
                  {confirmation.recommendation === 'confirm' ? '建议确认' : '建议复核'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onConfirm(confirmation.id)}
                className="px-2.5 py-1 text-[11px] rounded-md bg-green-600/90 text-white hover:bg-green-500"
              >
                确认
              </button>
              <button
                onClick={() => onReject(confirmation.id)}
                className="px-2.5 py-1 text-[11px] rounded-md bg-red-600/90 text-white hover:bg-red-500"
              >
                驳回
              </button>
              <button
                onClick={() => onSkip(confirmation.id)}
                className="px-2.5 py-1 text-[11px] rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700"
              >
                跳过
              </button>
            </div>

            <div className="pt-1 border-t border-gray-800/70">
              <div className="text-[10px] text-gray-500 mb-1">如果标签类型不对，可直接改判为：</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(TAG_LABELS) as Array<[SemanticTagType, string]>)
                  .filter(([tagType]) => tagType !== confirmation.tagType)
                  .map(([tagType, label]) => (
                    <button
                      key={tagType}
                      onClick={() => onOverride(confirmation.id, tagType)}
                      className="px-2 py-1 text-[10px] rounded-md bg-gray-900 text-gray-400 border border-gray-700 hover:border-purple-500/50 hover:text-purple-300"
                    >
                      改为{label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
