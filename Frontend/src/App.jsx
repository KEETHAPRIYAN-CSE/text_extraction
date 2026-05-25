import { useMemo, useState, useCallback } from 'react'

// ─── Radio Pill ───────────────────────────────────────────────────────────────
const PILL_BASE =
  'group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 cursor-pointer'
const PILL_ACTIVE = 'border-sky-400 ring-2 ring-sky-200'

const RadioPill = ({ name, value, checked, onChange, label }) => {
  const id = `${name}-${value}`
  return (
    <label htmlFor={id} className={checked ? `${PILL_BASE} ${PILL_ACTIVE}` : PILL_BASE}>
      <input
        id={id}
        name={name}
        type="radio"
        className="h-4 w-4 accent-sky-500"
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span className="text-sm font-semibold text-slate-800">{label}</span>
    </label>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    idle: ['bg-slate-100 text-slate-500', 'Ready'],
    uploading: ['bg-yellow-100 text-yellow-700', 'Processing…'],
    success: ['bg-green-100 text-green-700', 'Done ✓'],
    error: ['bg-red-100 text-red-700', 'Error'],
  }
  const [cls, label] = map[status] ?? map.idle
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-full ${cls}`}>{label}</span>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
  </svg>
)

// ─── App ──────────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8000'

export default function App() {
  const [penType, setPenType] = useState('Ballpoint')
  const [writingQuality, setWritingQuality] = useState('Neat')
  const [lighting, setLighting] = useState('Bright')

  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null)

  const [status, setStatus] = useState('idle')   // idle | uploading | success | error
  const [ocrText, setOcrText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [pageCount, setPageCount] = useState(0)

  const penTypeOptions = useMemo(() => ['Ballpoint', 'Gel', 'Marker', 'Other'], [])
  const writingOptions = useMemo(() => ['Neat', 'Average', 'Messy'], [])
  const lightingOptions = useMemo(() => ['Bright', 'Dim', 'Mixed'], [])

  // ── File selection ──────────────────────────────────────────────────────────
  const handleUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) {
      alert('Only PDF, JPG, and PNG files are allowed.')
      return
    }

    setUploadedFile(file)
    setUploadPreviewUrl(URL.createObjectURL(file))
    setOcrText('')
    setStatus('idle')
    setErrorMsg('')
  }, [])

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const fakeEvent = { target: { files: [file] } }
      handleUpload(fakeEvent)
    }
  }, [handleUpload])

  // ── Call backend: preview (get text) ────────────────────────────────────────
  const handleRecognize = useCallback(async () => {
    if (!uploadedFile) {
      alert('Please select a file first.')
      return
    }

    setStatus('uploading')
    setOcrText('')
    setErrorMsg('')

    const formData = new FormData()
    formData.append('file', uploadedFile)

    try {
      const res = await fetch(`${API_BASE}/ocr/preview`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Server error')
      }

      const data = await res.json()
      setOcrText(data.full_text)
      setPageCount(data.pages)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }, [uploadedFile])

  // ── Call backend: download typed PDF ────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!uploadedFile) return

    const formData = new FormData()
    formData.append('file', uploadedFile)

    try {
      const res = await fetch(`${API_BASE}/ocr`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Download failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ocr_result.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
  }, [uploadedFile])

  const isPDF = uploadedFile?.type === 'application/pdf'

  return (
    <div
      className="min-h-screen bg-[#f3f3f7] flex items-center justify-center px-4 py-10"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-4xl text-center">

        {/* ── Title ── */}
        <div className="flex items-center justify-center gap-4 mb-2">
          <h1 className="text-5xl md:text-6xl font-black text-slate-800 uppercase">
            Handwriting Recognition
          </h1>
          <StatusBadge status={status} />
        </div>

        <p className="mt-3 text-xl text-slate-700 font-medium">
          Upload your handwriting — get back typed text as a PDF.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Powered by Microsoft TrOCR · Supports JPG · PNG · PDF
        </p>

        {/* ── Upload Zone ── */}
        <div className="mt-10 flex flex-col items-center">
          <label className="cursor-pointer w-full flex justify-center">
            <div className="bg-red-500 hover:bg-red-600 active:scale-95 transition-all rounded-2xl px-16 py-10 shadow-xl w-[450px] max-w-full">
              <div className="text-white text-3xl font-bold">Select File</div>
              <div className="mt-2 text-red-100 text-sm font-medium">PDF · JPG · PNG</div>
            </div>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={handleUpload}
            />
          </label>

          <div className="mt-4 text-slate-400 text-sm">or drop file here</div>

          {/* File name */}
          {uploadedFile && (
            <div className="mt-4 flex items-center gap-2 text-slate-700 font-semibold text-sm bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <span>📄</span>
              <span>{uploadedFile.name}</span>
              <span className="text-slate-400 font-normal">
                ({(uploadedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}

          {/* Preview */}
          {uploadPreviewUrl && (
            <div className="mt-6 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              {isPDF ? (
                <iframe
                  title="PDF Preview"
                  src={uploadPreviewUrl}
                  className="h-[500px] w-full"
                />
              ) : (
                <img
                  src={uploadPreviewUrl}
                  alt="Preview"
                  className="max-h-[500px] w-full object-contain bg-white"
                />
              )}
            </div>
          )}
        </div>

        {/* ── Options Row ── */}
        <div className="mt-12 grid gap-7 md:grid-cols-3 text-left">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-3">
              Pen Type Used
            </div>
            <div className="grid gap-2">
              {penTypeOptions.map((opt) => (
                <RadioPill
                  key={opt} name="penType" value={opt}
                  checked={penType === opt} onChange={setPenType} label={opt}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-3">
              Writing Quality
            </div>
            <div className="grid gap-2">
              {writingOptions.map((opt) => (
                <RadioPill
                  key={opt} name="writingQuality" value={opt}
                  checked={writingQuality === opt} onChange={setWritingQuality} label={opt}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-3">
              Lighting Conditions
            </div>
            <div className="grid gap-2">
              {lightingOptions.map((opt) => (
                <RadioPill
                  key={opt} name="lighting" value={opt}
                  checked={lighting === opt} onChange={setLighting} label={opt}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <button
            onClick={handleRecognize}
            disabled={!uploadedFile || status === 'uploading'}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition text-white font-bold px-8 py-3 rounded-2xl shadow-lg"
          >
            {status === 'uploading' ? (
              <>
                <Spinner />
                <span>Recognizing…</span>
              </>
            ) : (
              'Start Recognition'
            )}
          </button>

          {status === 'success' && (
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 transition text-white font-bold px-8 py-3 rounded-2xl shadow-lg"
            >
              ⬇ Download as PDF
            </button>
          )}
        </div>

        {/* ── Error Message ── */}
        {status === 'error' && (
          <div className="mt-6 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-6 py-4 text-sm font-medium">
            ❌ {errorMsg}
          </div>
        )}

        {/* ── OCR Result Preview ── */}
        {ocrText && status === 'success' && (
          <div className="mt-8 text-left bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800 text-lg">Recognized Text</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {pageCount} page{pageCount !== 1 ? 's' : ''} processed
                </p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(ocrText)}
                className="text-xs text-sky-600 hover:text-sky-800 font-semibold border border-sky-200 hover:border-sky-400 px-3 py-1.5 rounded-lg transition"
              >
                Copy Text
              </button>
            </div>
            <pre className="px-6 py-5 text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
              {ocrText}
            </pre>
          </div>
        )}

      </div>
    </div>
  )
}
