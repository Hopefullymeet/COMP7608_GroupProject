import { useLanguage } from '../i18n'
import { useRef, useState } from 'react'
import { useStore } from '../data/store'
import { DEFAULT_QUESTION, DEMO_TOPIC } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { Disclosure } from '../components/Disclosure'
import { PaperImportDialog, usePdfDrop } from './PaperImportDialog'

export function Home() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [over, setOver] = useState(false)
  const [importing, setImporting] = useState<(File | string)[]>()
  const desktop = Boolean(state.mainline && !state.mainline.demo)
  usePdfDrop(desktop && !importing ? setImporting : undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const canDemo = !state.mainline ? state.topics.some((t) => t.id === DEMO_TOPIC) : state.mainline.demo

  const canSubmit = !!name.trim() || !!question.trim() || state.dropped.length > 0
  const submit = () => { if (canSubmit) act.startFromHome(name, question) }
  const addFiles = (files: FileList | null) => {
    if (desktop && files?.length) { setImporting(Array.from(files)); return }
    if (state.mainline) { state.mainline.attachFiles?.(Array.from(files??[]));return }
    const names = Array.from(files ?? []).map((f) => f.name)
    if (names.length) act.drop(names)
  }
  const pickFiles = () => desktop ? setImporting([]) : state.mainline ? state.mainline.attachFiles?.() : fileRef.current?.click()

  return (
    <div className="home">
      <div className="home-inner">
        <form className="topic-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <header className="topic-form-head">
            <span className="topic-form-icon" aria-hidden="true"><Icon name="library" size={20} /></span>
            <div>
              <h1>{tr('New research topic')}</h1>
              <p>{tr('A topic keeps its papers, sessions, Wiki and citation checks together.')}</p>
            </div>
          </header>

          <label className="topic-field">
            <span>{tr('Topic name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder={tr('e.g. Scientific QA datasets')} />
          </label>

          <div className="topic-field">
            <label htmlFor="home-question">{tr('Starting question')} <small>{tr('Optional')}</small></label>
            <textarea id="home-question" aria-describedby="home-question-hint" value={question} rows={2} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              placeholder={tr('e.g. Which scientific QA datasets use paper abstracts?')} />
            <small id="home-question-hint" className="topic-field-hint">{tr('Opens as the first search in Discover.')}</small>
          </div>

          <div className="topic-field" role="group" aria-labelledby="home-papers">
            <span id="home-papers">{tr('Starting papers')} <small>{tr('Optional')}</small></span>
            <button type="button" className={`topic-drop ${over ? 'over' : ''}`} onClick={pickFiles}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}>
              <Icon name="paperclip" size={16} />
              <span>{tr('Drop PDF or .bib files here, or click to choose')}</span>
            </button>
            {state.dropped.length > 0 && (
              <div className="dropped">
                {state.dropped.map((n, i) => <span key={i} className="chip"><Icon name="file" size={13} />{n}</span>)}
                <small>{state.mainline?tr('Review the import scope after creating the topic.'):tr('Files are listed but not read in this prototype.')}</small>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.bib" multiple hidden onChange={(e) => addFiles(e.target.files)} />

          <footer className="topic-form-foot">
            <button type="submit" className="primary" disabled={!canSubmit}>
              {tr('Create topic')}<Icon name="arrowRight" size={15} />
            </button>
          </footer>
        </form>
        {importing && <PaperImportDialog topics={[]} initialTitle={name.trim() || question.trim()} initialFiles={importing}
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
