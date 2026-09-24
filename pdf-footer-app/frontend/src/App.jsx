import { useState, useRef, useCallback } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : 'https://footerforge.onrender.com')

const SUPPORTED_EXTS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.png', '.jpg', '.jpeg', '.webp']

function getFileTypeInfo(filename) {
  const ext = (filename || '').slice((filename || '').lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return { label: 'PDF', icon: '📕', badgeClass: 'badge-pdf', isPdf: true }
  if (['.docx', '.doc'].includes(ext)) return { label: 'WORD', icon: '📘', badgeClass: 'badge-docx', isPdf: false }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return { label: 'IMAGE', icon: '🖼️', badgeClass: 'badge-img', isPdf: false }
  if (['.txt', '.md', '.rtf'].includes(ext)) return { label: 'TEXT', icon: '📃', badgeClass: 'badge-txt', isPdf: false }
  return { label: 'DOC', icon: '📄', badgeClass: 'badge-other', isPdf: false }
}

export default function App() {
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [enrollment, setEnrollment] = useState('')
  const [semester, setSemester] = useState('')
  const [isCustomSem, setIsCustomSem] = useState(false)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('')
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [downloadName, setDownloadName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const handleFile = useCallback((f) => {
    if (!f) return

    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    const mime = (f.type || '').toLowerCase()
    const isAllowed = SUPPORTED_EXTS.includes(ext) ||
      mime.includes('pdf') ||
      mime.includes('word') ||
      mime.startsWith('image/') ||
      mime.startsWith('text/')

    if (!isAllowed) {
      setErrorMsg('Unsupported format. Please upload a Word document (.docx, .doc), PDF (.pdf), Text file (.txt, .md), or Image (.png, .jpg, .webp).')
      setStatus('error')
      return
    }

    if (f.size > 25 * 1024 * 1024) {
      setErrorMsg('File size exceeds the 25 MB limit.')
      setStatus('error')
      return
    }

    setFile(f)
    setStatus('idle')
    setErrorMsg('')
    setDownloadUrl(null)
  }, [])

  const onFileChange = (e) => handleFile(e.target.files?.[0])
  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]) }
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  const removeFile = () => {
    setFile(null); setDownloadUrl(null); setStatus('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { setErrorMsg('Please upload a document or PDF file.'); setStatus('error'); return }
    if (!name.trim()) { setErrorMsg('Please enter your name.'); setStatus('error'); return }
    if (!enrollment.trim()) { setErrorMsg('Please enter your enrollment number.'); setStatus('error'); return }
    if (!semester.trim()) { setErrorMsg('Please select or enter your semester.'); setStatus('error'); return }

    setStatus('loading'); setErrorMsg('')

    const formData = new FormData()
    // Append as both 'file' and 'pdf' for 100% backend compatibility
    formData.append('file', file)
    formData.append('pdf', file)
    formData.append('name', name.trim())
    formData.append('enrollmentNumber', enrollment.trim())
    formData.append('semester', semester.trim())

    try {
      const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error: ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const dName = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || `${file.name.replace(/\.[^/.]+$/, '')}_modified.pdf`
      setDownloadUrl(url); setDownloadName(dName); setStatus('success')
    } catch (err) {
      setErrorMsg(err.message); setStatus('error')
    }
  }

  const reset = () => {
    setFile(null); setName(''); setEnrollment(''); setSemester(''); setIsCustomSem(false)
    setStatus('idle'); setErrorMsg(''); setDownloadUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isLoading = status === 'loading'
  const fileInfo = file ? getFileTypeInfo(file.name) : null

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⬚</span>
            <span className="logo-text">Footer Changer</span>
          </div>
          <p className="header-tagline">Universal Document to PDF Footer Stamper</p>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h1 className="hero-title">Replace Document Footers<br /><em>in seconds.</em></h1>
          <p className="hero-sub">Upload any Word (DOCX/DOC), PDF, Text, or Image. We'll automatically convert it to PDF and stamp your custom footer: Name (Left), Enrollment No. (Middle), and Semester (Right).</p>
        </section>

        <div className="card">
          {status === 'success' ? (
            <SuccessPanel
              downloadUrl={downloadUrl} downloadName={downloadName}
              onReset={reset} name={name} enrollment={enrollment} semester={semester}
              fileName={file?.name} fileInfo={fileInfo}
            />
          ) : (
            <form className="form" onSubmit={handleSubmit} noValidate>
              {/* Drop Zone */}
              <div
                className={`drop-zone${isDragging ? ' dragging' : ''}${file ? ' has-file' : ''}`}
                onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/*"
                  onChange={onFileChange}
                  className="hidden-input"
                />
                {file ? (
                  <div className="file-info">
                    <span className="file-icon">{fileInfo.icon}</span>
                    <div className="file-details">
                      <div className="file-name-row">
                        <span className="file-name">{file.name}</span>
                        <span className={`file-badge ${fileInfo.badgeClass}`}>{fileInfo.label}</span>
                      </div>
                      <div className="file-meta">
                        <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                        {!fileInfo.isPdf && (
                          <span className="convert-badge">⚡ Auto-converts to PDF</span>
                        )}
                      </div>
                    </div>
                    <button type="button" className="remove-btn"
                      onClick={(e) => { e.stopPropagation(); removeFile() }}>✕</button>
                  </div>
                ) : (
                  <div className="drop-prompt">
                    <span className="drop-icon">⬆</span>
                    <p className="drop-text"><strong>Drop your Word DOCX, PDF, or Image here</strong><br />or click to browse</p>
                    <div className="format-chips">
                      <span className="format-chip">Word .docx</span>
                      <span className="format-chip">PDF</span>
                      <span className="format-chip">Images</span>
                      <span className="format-chip">Text .txt</span>
                    </div>
                    <span className="drop-limit">Word · PDF · PNG/JPG · Text · Max 25 MB</span>
                  </div>
                )}
              </div>

              {/* Fields */}
              <div className="fields">
                <div className="field">
                  <div className="field-label-row">
                    <label className="label" htmlFor="name">Full Name</label>
                  </div>
                  <input
                    id="name"
                    type="text"
                    className="input"
                    placeholder="e.g. Arjun Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>

                <div className="field">
                  <div className="field-label-row">
                    <label className="label" htmlFor="enrollment">Enrollment Number</label>
                  </div>
                  <input
                    id="enrollment"
                    type="text"
                    className="input mono"
                    placeholder="e.g. 21CS10045"
                    value={enrollment}
                    onChange={(e) => setEnrollment(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="field">
                  <div className="field-label-row">
                    <label className="label" htmlFor="semester">Semester</label>
                    <button
                      type="button"
                      className="sem-toggle-btn"
                      onClick={() => {
                        setIsCustomSem((prev) => !prev)
                        setSemester('')
                      }}
                      disabled={isLoading}
                    >
                      {isCustomSem ? 'Choose list' : 'Type custom'}
                    </button>
                  </div>
                  {isCustomSem ? (
                    <input
                      id="semester"
                      type="text"
                      className="input"
                      placeholder="e.g. 5th Sem, Trimester 2"
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                      disabled={isLoading}
                      autoFocus
                    />
                  ) : (
                    <select
                      id="semester"
                      className="input select-input"
                      value={semester}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomSem(true)
                          setSemester('')
                        } else {
                          setSemester(e.target.value)
                        }
                      }}
                      disabled={isLoading}
                    >
                      <option value="">Select Semester</option>
                      <option value="Semester 1">Semester 1</option>
                      <option value="Semester 2">Semester 2</option>
                      <option value="Semester 3">Semester 3</option>
                      <option value="Semester 4">Semester 4</option>
                      <option value="Semester 5">Semester 5</option>
                      <option value="Semester 6">Semester 6</option>
                      <option value="Semester 7">Semester 7</option>
                      <option value="Semester 8">Semester 8</option>
                      <option value="__custom__">Other / Type manually…</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Footer preview */}
              {(name || enrollment || semester) && (
                <div className="preview-container">
                  <div className="preview-header">
                    <span className="preview-label">Live Footer Preview</span>
                    <span className="preview-hint">Stamped at the bottom of every page</span>
                  </div>
                  <div className="preview-bar mono">
                    <div className="preview-col preview-left">
                      <span className="preview-tag">Left</span>
                      <span className="preview-value">
                        Name: {name.trim() || '—'}
                      </span>
                    </div>
                    <div className="preview-col preview-center">
                      <span className="preview-tag">Middle</span>
                      <span className="preview-value">
                        Enrollment No: {enrollment.trim() || '—'}
                      </span>
                    </div>
                    <div className="preview-col preview-right">
                      <span className="preview-tag">Right</span>
                      <span className="preview-value">
                        Semester: {semester.trim() ? semester.trim().replace(/^(?:semester|sem)[\s:-]*/i, '') : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {status === 'error' && (
                <div className="alert alert-error"><span>⚠</span> {errorMsg}</div>
              )}

              {/* Submit */}
              <button type="submit" className={`btn-primary${isLoading ? ' loading' : ''}`} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="spinner" />
                    {fileInfo && !fileInfo.isPdf
                      ? 'Converting to PDF & Stamping Footer…'
                      : 'Stamping PDF Footer…'}
                  </>
                ) : (
                  <>
                    <span>⬦</span>
                    {fileInfo && !fileInfo.isPdf
                      ? 'Convert to PDF & Stamp Footer'
                      : 'Stamp Footer'}
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Steps */}
        <section className="steps">
          {[
            { num: '01', title: 'Upload Any Document', desc: 'Drop Word (.docx), PDF, Text, or Images up to 25 MB' },
            { num: '02', title: 'Fill Details', desc: 'Enter name, enrollment number & semester' },
            { num: '03', title: 'Convert & Stamp', desc: 'Auto-converts to PDF & applies your stamped footer instantly' },
          ].map((s) => (
            <div className="step" key={s.num}>
              <span className="step-num">{s.num}</span>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="site-footer">
        <p>Footer Changer · Universal Document Engine · pdf-lib · Express · React · Vite</p>
      </footer>
    </div>
  )
}

function SuccessPanel({ downloadUrl, downloadName, onReset, name, enrollment, semester, fileName, fileInfo }) {
  const semDisplay = semester ? semester.replace(/^(?:semester|sem)[\s:-]*/i, '') : ''
  const wasConverted = fileInfo && !fileInfo.isPdf

  return (
    <div className="success-panel">
      <div className="success-icon">✓</div>
      <h2 className="success-title">{wasConverted ? 'Document Converted & Stamped!' : 'PDF Ready!'}</h2>
      <p className="success-sub">
        {wasConverted ? (
          <>Converted <strong>{fileName}</strong> to PDF with custom footer applied</>
        ) : (
          <>Footer stamped on <strong>{fileName}</strong></>
        )}
      </p>
      <div className="success-footer-preview mono">
        <div className="success-preview-item">
          <span className="preview-tag">Left</span>
          <span><strong>Name:</strong> {name}</span>
        </div>
        <div className="success-preview-item">
          <span className="preview-tag">Middle</span>
          <span><strong>Enrollment No:</strong> {enrollment}</span>
        </div>
        <div className="success-preview-item">
          <span className="preview-tag">Right</span>
          <span><strong>Semester:</strong> {semDisplay || semester}</span>
        </div>
      </div>
      <a href={downloadUrl} download={downloadName} className="btn-primary download-btn">
        ⬇ Download Stamped PDF
      </a>
      <button className="btn-ghost" onClick={onReset}>Process another document</button>
    </div>
  )
}
