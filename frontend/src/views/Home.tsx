import { useLanguage } from '../i18n'
import { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../data/store'
import { DEFAULT_QUESTION, DEMO_TOPIC } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { Disclosure } from '../components/Disclosure'
import { PaperImportDialog, usePdfDrop } from './PaperImportDialog'

export function Home() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const [importing, setImporting] = useState<(File | string)[]>()
  const desktop = Boolean(state.mainline && !state.mainline.demo)
  usePdfDrop(desktop && !importing ? setImporting : undefined)
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
  const canDemo = !state.mainline ? state.topics.some((t) => t.id === DEMO_TOPIC) : state.mainline.demo

  const canSubmit = !!text.trim() || state.dropped.length > 0
  const submit = () => { if (canSubmit) act.startFromHome(text) }
  const addFiles = (files: FileList | null) => {
    if (desktop && files?.length) { setImporting(Array.from(files)); return }
    if (state.mainline) { state.mainline.attachFiles?.(Array.from(files??[]));return }
    const names = Array.from(files ?? []).map((f) => f.name)
    if (names.length) act.drop(names)
  }

  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="home-title"><Logo size={38} /><span>{tr('What are you researching today?')}</span></h1>

        <div
          className={`composer big ${state.mainline ? 'with-attachments' : ''} ${expanded ? 'has-content' : ''} ${over ? 'over' : ''}`}
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
              placeholder={state.mainline ? tr('Ask a research question…') : tr('Ask a research question, or drop PDFs here…')}
              rows={1}
              aria-label={tr('Research question')}
            />
            <textarea ref={measureRef} className="composer-measure" value={text} rows={1} readOnly tabIndex={-1} aria-hidden="true" />
          </div>
          {state.dropped.length > 0 && (
            <div className="dropped">
              {state.dropped.map((n, i) => <span key={i} className="chip"><Icon name="file" size={13} />{n}</span>)}
              <small>{state.mainline?tr('Review the import scope after creating the topic.'):tr('Files are listed but not read in this prototype.')}</small>
            </div>
          )}
          <div className="home-actions">
            <div className="home-actions-inner">
              <div className="composer-bar">
                <button className="ghost-btn sm home-attach" aria-label={tr('Add papers')} title={expanded ? undefined : tr('Add papers')}
                  disabled={!expanded && !state.mainline}
                  onClick={() => desktop ? setImporting([]) : state.mainline ? state.mainline.attachFiles?.() : fileRef.current?.click()}>
                  <Icon name="paperclip" size={15} />
                  <span className="home-attach-label" aria-hidden="true">{tr('Add papers')}</span>
                </button>
              </div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.bib" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button className="send" disabled={!canSubmit} onClick={submit} aria-label={tr('Start research')}><Icon name="arrowUp" size={17} /></button>
        </div>
        {importing && <PaperImportDialog topics={state.topics} initialFiles={importing}
          onClose={() => setImporting(undefined)} onOpenTopic={(id) => act.openTopic(id, 'synthesis')} />}

        {(!state.mainline || state.mainline.demo) && <button className="suggestion" disabled={!canDemo} title={canDemo ? undefined : tr('Refresh to restore the demo topic')} onClick={() => act.startDemo()}>
          <Icon name="compass" size={15} />
          <span><small>{tr('Try the demo')}</small>{tr(state.mainline ? 'Which scientific QA datasets use paper abstracts?' : DEFAULT_QUESTION)}</span>
          <Icon name="arrowRight" size={14} />
        </button>}
        {!!state.mainline?.activity?.length && (
          <Disclosure className="activity-list" icon="clock" title={<>{tr('Research updates')}{' '}<span className="tag">{state.mainline.activity.length}</span></>}>
            <ul className="activity-items scroll">
              {state.mainline.activity.map((a) => (
                <li key={a.id}>
                  <button onClick={a.open} className="activity-item">
                    <span className="grow"><strong>{tr(a.title)}</strong><small>{tr(a.detail)}</small></span>
                    <Icon name="arrowRight" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </div>
    </div>
  )
}
