import { useState, useCallback } from 'react'
import type { AIConfig } from '../types'

interface SettingsProps {
  config: AIConfig | null
  onSave: (config: AIConfig) => void
  onClose: () => void
}

export default function Settings({ config, onSave, onClose }: SettingsProps) {
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? 'https://api.openai.com/v1/chat/completions')
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '')
  const [model, setModel] = useState(config?.model ?? 'gpt-4o-mini')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const handleTestConnection = useCallback(async () => {
    if (!endpoint || !apiKey || !model) return

    setTestStatus('testing')
    setTestError('')

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
          max_tokens: 10,
          stream: true,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
      }

      // For streaming, just verify we got a 200 response
      response.body?.cancel()
      setTestStatus('success')
    } catch (err) {
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : 'Connection failed')
    }
  }, [endpoint, apiKey, model])

  const handleSave = useCallback(() => {
    if (!endpoint || !apiKey || !model) return
    onSave({ endpoint, apiKey, model })
  }, [endpoint, apiKey, model, onSave])

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-gray-100">AI 设置</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              API 接口地址
            </label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              API 密钥
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              模型
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Test connection */}
          <div>
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'testing' || !endpoint || !apiKey || !model}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
            >
              {testStatus === 'testing' ? '测试中...' : '测试连接'}
            </button>

            {testStatus === 'success' && (
              <p className="text-green-400 text-xs mt-2">连接成功。</p>
            )}
            {testStatus === 'error' && (
              <p className="text-red-400 text-xs mt-2">{testError}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!endpoint || !apiKey || !model}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
