import React, { useMemo, useState } from 'react'

const RADIO_GROUP_STYLES =
  'group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300'

const RadioPill = ({
  name,
  value,
  checked,
  onChange,
  label,
}) => {
  const id = `${name}-${value}`

  return (
    <label
      htmlFor={id}
      className={
        checked
          ? `${RADIO_GROUP_STYLES} border-sky-400 ring-2 ring-sky-200`
          : RADIO_GROUP_STYLES
      }
    >
      <input
        id={id}
        name={name}
        type="radio"
        className="h-4 w-4"
        checked={checked}
        onChange={() => onChange(value)}
      />

      <span className="text-sm font-semibold text-slate-800">
        {label}
      </span>
    </label>
  )
}

const App = () => {
  const [penType, setPenType] = useState('Ballpoint')
  const [writingQuality, setWritingQuality] = useState('Neat')
  const [lighting, setLighting] = useState('Bright')

  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null)
  const [uploadFileName, setUploadFileName] = useState('')

  const handleUpload = (e) => {
    const file = e.target.files?.[0]

    if (!file) return

    const ok =
      file.type === 'application/pdf' ||
      ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)

    if (!ok) {
      alert('Only PDF, JPG, JPEG and PNG files are allowed')
      return
    }

    const url = URL.createObjectURL(file)

    setUploadPreviewUrl(url)
    setUploadFileName(file.name)
  }

  const penTypeOptions = useMemo(
    () => ['Ballpoint', 'Gel', 'Marker', 'Other'],
    [],
  )

  const writingOptions = useMemo(
    () => ['Neat', 'Average', 'Messy'],
    [],
  )

  const lightingOptions = useMemo(
    () => ['Bright', 'Dim', 'Mixed'],
    [],
  )

  return (
    <div className="min-h-screen bg-[#f3f3f7] flex items-center justify-center px-4 py-10">

      <div className="w-full max-w-4xl text-center">

        {/* TITLE */}
        <h1 className="text-5xl md:text-6xl font-black text-slate-800 uppercase">
          Handwriting Recognition
        </h1>

        <p className="mt-5 text-2xl text-slate-700 font-medium">
          Upload your handwriting files for recognition.
        </p>

        <p className="mt-2 text-lg text-slate-500">
          Powered by AI Recognition System.
        </p>

        {/* UPLOAD SECTION */}
        <div className="mt-14 flex flex-col items-center">

          <label className="cursor-pointer w-full flex justify-center">

            <div className="bg-red-500 hover:bg-red-600 transition rounded-2xl px-16 py-10 shadow-xl w-[450px] max-w-full">

              <div className="text-white text-3xl font-bold">
                Select File
              </div>

              <div className="mt-3 text-red-100 text-sm font-medium">
                PDF / JPG / PNG
              </div>

            </div>

            <input
              type="file"
              accept="application/pdf,image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={handleUpload}
            />

          </label>

          <div className="mt-5 text-slate-500 text-lg">
            or drop file here
          </div>

          {/* FILE NAME */}
          {uploadFileName && (
            <div className="mt-6 text-slate-700 font-semibold text-sm">
              Selected File: {uploadFileName}
            </div>
          )}

          {/* PREVIEW */}
          {uploadPreviewUrl && (
            <div className="mt-8 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

              {uploadFileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  title="Uploaded PDF Preview"
                  src={uploadPreviewUrl}
                  className="h-[600px] w-full"
                />
              ) : (
                <img
                  src={uploadPreviewUrl}
                  alt="Preview"
                  className="max-h-[600px] w-full object-contain bg-white"
                />
              )}

            </div>
          )}

        </div>

        {/* BELOW SECTION */}
        <div className="mt-14 grid gap-7 md:grid-cols-3 text-left">

          {/* PEN TYPE */}
          <div>

            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              Pen Type Used
            </div>

            <div className="mt-3 grid gap-2">

              {penTypeOptions.map((opt) => (
                <RadioPill
                  key={opt}
                  name="penType"
                  value={opt}
                  checked={penType === opt}
                  onChange={setPenType}
                  label={opt}
                />
              ))}

            </div>

          </div>

          {/* WRITING QUALITY */}
          <div>

            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              Writing Quality
            </div>

            <div className="mt-3 grid gap-2">

              {writingOptions.map((opt) => (
                <RadioPill
                  key={opt}
                  name="writingQuality"
                  value={opt}
                  checked={writingQuality === opt}
                  onChange={setWritingQuality}
                  label={opt}
                />
              ))}

            </div>

          </div>

          {/* LIGHTING */}
          <div>

            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              Lighting Conditions
            </div>

            <div className="mt-3 grid gap-2">

              {lightingOptions.map((opt) => (
                <RadioPill
                  key={opt}
                  name="lighting"
                  value={opt}
                  checked={lighting === opt}
                  onChange={setLighting}
                  label={opt}
                />
              ))}

            </div>

          </div>

        </div>

        {/* BUTTON */}
        <div className="mt-12">

          <button
            className="bg-slate-900 hover:bg-slate-800 transition text-white font-bold px-8 py-3 rounded-2xl shadow-lg"
          >
            Start Recognition
          </button>

        </div>

      </div>

    </div>
  )
}

export default App