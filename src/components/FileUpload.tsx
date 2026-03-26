import { useState, useCallback, useRef } from 'react'

interface FileUploadProps {
  onFileSelect: (file: File) => void
}

export default function FileUpload({ onFileSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [fileSizeWarning, setFileSizeWarning] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setFileSizeWarning(null)
      const sizeGB = file.size / (1024 * 1024 * 1024)
      if (sizeGB > 1) {
        setFileSizeWarning(
          `This file is ${sizeGB.toFixed(1)} GB. Large files may take a while to process and could cause browser performance issues.`
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
        if (file.name.toLowerCase().endsWith('.mp4')) {
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
      className="min-h-screen flex items-center justify-center p-8"
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
          <p className="text-lg text-purple-400 mb-6">Karting Lap Analysis</p>
          <p className="text-gray-400 mb-2">
            Drag and drop your GoPro video file here
          </p>
          <p className="text-gray-500 text-sm">Accepts .mp4 files with GPS telemetry data</p>
        </div>

        <div className="flex items-center gap-4 justify-center mb-6">
          <div className="h-px bg-gray-700 flex-1" />
          <span className="text-gray-500 text-sm">or</span>
          <div className="h-px bg-gray-700 flex-1" />
        </div>

        <button
          onClick={() => inputRef.current?.click()}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          Browse Files
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.MP4"
          onChange={handleInputChange}
          className="hidden"
        />

        {fileSizeWarning && (
          <div className="mt-6 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
            <p className="text-yellow-400 text-sm">{fileSizeWarning}</p>
          </div>
        )}
      </div>
    </div>
  )
}
