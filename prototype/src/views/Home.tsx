import { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../data/store'
import { DEFAULT_QUESTION, DEMO_TOPIC } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'

export function Home() {
  const { state, act } = useStore()
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const expanded = text.length > 0 || state.dropped.length > 0
  const [inputHeight, setInputHeight] = useState(34)
  const measureRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const measure = measureRef.current
    if (!measure) return
    // Measure separately so shrinking and wrapping never interrupt the visible transition.
    const resize = () => {
      const height = expanded ? Math.max(48, measure.scrollHeight + 20) : 34
      setInputHeight(Math.min(height, 192))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [text, expanded])
  const fileRef = useRef<HTMLInputElement>(null)
  const canDemo = state.topics.some((t) => t.id === DEMO_TOPIC)

  const canSubmit = !!text.trim() || state.dropped.length > 0
  const submit = () => { if (canSubmit) act.startFromHome(text) }
  const addFiles = (files: FileList | null) => {
    const names = Array.from(files ?? []).map((f) => f.name)
    if (names.length) act.drop(names)
  }

  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="home-title"><Logo size={38} /><span>What are you researching today?</span></h1>

        <div
          className={`composer big ${expanded ? 'has-content' : ''} ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
        >
          <div className="home-input">
            <textarea
              value={text}
              style={{ height: inputHeight }}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              placeholder="Ask a research question, or drop PDFs here…"
              rows={1}
              aria-label="Research question"
            />
            <textarea ref={measureRef} className="composer-measure" value={text} rows={1} readOnly tabIndex={-1} aria-hidden="true" />
          </div>
          {state.dropped.length > 0 && (
            <div className="dropped">
              {state.dropped.map((n, i) => <span key={i} className="chip"><Icon name="file" size={13} />{n}</span>)}
              <small>Files are listed but not read in this prototype.</small>
            </div>
          )}
          <div className="home-actions">
            <div className="home-actions-inner">
              <div className="composer-bar">
                <button className="ghost-btn" disabled={!expanded} onClick={() => fileRef.current?.click()}>
                  <Icon name="paperclip" size={15} /> Add papers
                </button>
              </div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.bib" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button className="send" disabled={!canSubmit} onClick={submit} aria-label="Start research"><Icon name="arrowUp" size={17} /></button>
        </div>

        <button className="suggestion" disabled={!canDemo} title={canDemo ? undefined : "Refresh to restore the demo topic"} onClick={() => act.startDemo()}>
          <Icon name="compass" size={15} />
          <span><small>Try the demo</small>{DEFAULT_QUESTION}</span>
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </div>
  )
}
