import { useState, useCallback, useRef } from 'react'
import type { SessionSummary } from '../lib/storage'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  historySessions?: SessionSummary[]
  onLoadSession?: (id: string) => void
  onDeleteSession?: (id: string) => void
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `${mins}:${secs.toFixed(3).padStart(6, '0')}` : `${secs.toFixed(3)}s`
}

function formatDate(date: Date): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function FileUpload({ onFileSelect, historySessions, onLoadSession, onDeleteSession }: FileUploadProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [fileSizeWarning, setFileSizeWarning] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setFileSizeWarning(null)
      const sizeGB = file.size / (1024 * 1024 * 1024)
      if (sizeGB > 1) {
        setFileSizeWarning(
          `文件大小 ${sizeGB.toFixed(1)} GB，大文件处理可能较慢，请耐心等待。`
        )
      }
      onFileSelect(file)
    },
    [onFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        const file = files[0]
        const name = file.name.toLowerCase()
        if (name.endsWith('.mp4') || name.endsWith('.geojson') || name.endsWith('.json') || name.endsWith('.vbo')) {
          handleFile(file)
        }
      }
    },
    [handleFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFile(files[0])
      }
    },
    [handleFile]
  )

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8 gap-8"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`w-full max-w-2xl rounded-2xl border-2 border-dashed p-16 text-center transition-all duration-200 ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10 scale-105'
            : 'border-gray-700 bg-gray-900 hover:border-gray-600'
        }`}
      >
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-500/20 mb-6">
            <svg
              className="w-10 h-10 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">KartPro</h1>
          <p className="text-lg text-purple-400 mb-6">卡丁车圈速分析</p>
          <p className="text-gray-400 mb-2">
            拖拽文件到这里
          </p>
          <p className="text-gray-500 text-sm">支持 .mp4（GoPro 视频）、.geojson（GPS 轨迹）或 .vbo（RaceChrono / VBOX）文件</p>
        </div>

        <div className="flex items-center gap-4 justify-center mb-6">
          <div className="h-px bg-gray-700 flex-1" />
          <span className="text-gray-500 text-sm">或</span>
          <div className="h-px bg-gray-700 flex-1" />
        </div>

        <button
          onClick={() => inputRef.current?.click()}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          浏览文件
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.MP4,.geojson,.json,.vbo,.VBO,text/plain,application/octet-stream,*/*"
          onChange={handleInputChange}
          className="hidden"
        />

        {fileSizeWarning && (
          <div className="mt-6 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
            <p className="text-yellow-400 text-sm">{fileSizeWarning}</p>
          </div>
        )}
      </div>

      {historySessions && historySessions.length > 0 && (
        <div className="w-full max-w-2xl mt-8">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">历史记录</h2>
          <div className="space-y-2">
            {historySessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 bg-gray-900 border border-gray-700 rounded-lg px-5 py-3 hover:border-purple-500/50 transition-colors cursor-pointer group"
                onClick={() => onLoadSession?.(s.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-100 font-medium truncate">{s.filename}</span>
                    <span className="text-gray-500 text-xs shrink-0">{formatDate(s.date)}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                    <span>{s.lapCount} 圈</span>
                    <span>最快 {formatLapTime(s.fastestLap)}</span>
                  </div>
                </div>
                {deletingId === s.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSession?.(s.id)
                        setDeletingId(null)
                      }}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                    >
                      确认删除
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingId(null)
                      }}
                      className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingId(s.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 transition-all"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
