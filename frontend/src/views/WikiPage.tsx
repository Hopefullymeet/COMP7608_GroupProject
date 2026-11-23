import { useLanguage, type Translate } from '../i18n'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useStore } from '../data/store'
import { useWorkspace } from '../data/WorkspaceProvider'
import { errorText } from '../api/contract'
import type { Wiki, WikiEdit, WikiEntry, WikiKind, WikiMessage, WikiMethods, WikiOrigin } from '../api/wiki'
import { Icon } from '../components/Icon'
import { PageHead } from '../components/PageHead'
import { EvidenceLink } from './Notes'

type Params<M extends keyof WikiMethods> = Omit<WikiMethods[M][0], 'operation_id'>
/** Where the Wiki page reads and writes: the workspace RPC client or the scripted demo store. */
export type WikiSource = {
  call: <M extends keyof WikiMethods>(method: M, params: Params<M>) => Promise<Wiki>
  tick: number
  Source: (props: { id: string; label: string; anchor: string }) => ReactNode
}
const WikiSourceContext = createContext<WikiSource | null>(null)
export const WikiSourceProvider = WikiSourceContext.Provider

export function WorkspaceWikiSource({ children }: { children: ReactNode }) {
  const { api, write, tick } = useWorkspace()
  const call = useCallback(<M extends keyof WikiMethods>(method: M, params: Params<M>): Promise<Wiki> =>
    method === 'wiki.get' ? api.call('wiki.get', params as Params<'wiki.get'>)
      : (write as (m: string, p: unknown) => Promise<Wiki>)(method, params), [api, write])
  const Source = useCallback(({ id, label }: { id: string; label: string }) => <EvidenceLink id={id} label={label} />, [])
  return <WikiSourceProvider value={{ call, tick, Source }}>{children}</WikiSourceProvider>
}

const POLL_MS = 1200
const KIND_ORDER: WikiKind[] = ['focus', 'paper', 'finding', 'preference', 'open_question']
const KIND_LABEL: Record<WikiKind, string> = {
  focus: 'Research focus', paper: 'Papers in this topic', finding: 'What we have learned',
  preference: 'Your preferences', open_question: 'Open questions',
}
const ORIGIN_LABEL: Partial<Record<WikiOrigin, string>> = {
  qa: 'From Q&A', pdf: 'From the PDF', paper: 'From the abstract', note: 'From a note', finding: 'From a saved finding',
  chat: 'From Wiki chat', user: 'Added by you',
}
const ISSUE_TEXT: Record<string, string> = {
  PROCESS_INTERRUPTED: 'The app closed before the Wiki finished. Try again.',
  SERVICE_AUTH_FAILED: 'The model rejected the API key. Check Models & services.',
  SERVICE_QUOTA_EXHAUSTED: 'The model quota is used up. Check Models & services.',
  SERVICE_RATE_LIMITED: 'The model is busy. Try again in a moment.',
  MODEL_OUTPUT_INVALID: 'The model returned an unreadable summary. Try again.',
  TASK_TIMEOUT: 'The model did not respond in time. Try again.',
}

function ago(tr: Translate, iso?: string) {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 1) return tr('Updated just now')
  if (minutes < 60) return tr('Updated {0} min ago', minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return tr('Updated {0} h ago', hours)
  return tr('Updated {0}', new Date(iso).toLocaleDateString())
}

/** An open book whose right page keeps turning while the Wiki is being written. */
function FlippingBook({ label }: { label: string }) {
  return (
    <div className="wiki-generating" role="status" aria-live="polite">
      <div className="wiki-book" aria-hidden="true">
        <span className="wiki-book-page left" />
        <span className="wiki-book-page right" />
        <span className="wiki-book-leaf" />
        <span className="wiki-book-leaf late" />
      </div>
      <p>{label}</p>
    </div>
  )
}

function EntryRow({ entry, onEdit, disabled, Source }: {
  entry: WikiEntry; onEdit: (edit: WikiEdit) => Promise<unknown>; disabled: boolean; Source: WikiSource['Source']
}) {
  const { tr } = useLanguage()
  const [draft, setDraft] = useState<string>()
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft?.trim()) return
    await onEdit({ action: 'update', entry_id: entry.entry_id, text: draft.trim() })
    setDraft(undefined)
  }
  if (draft !== undefined) return (
    <li className="wiki-entry editing">
      <form onSubmit={(e) => void save(e)}>
        <textarea aria-label={tr('Edit Wiki entry')} value={draft} maxLength={400} autoFocus rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setDraft(undefined) }} />
        <div className="wiki-entry-actions shown">
          <button type="button" className="ghost-btn sm" onClick={() => setDraft(undefined)}>{tr('Cancel')}</button>
          <button className="primary sm" disabled={disabled || !draft.trim()}>{tr('Save')}</button>
        </div>
      </form>
    </li>
  )
  const origin = ORIGIN_LABEL[entry.origin]
  return (
    <li className={'wiki-entry' + (entry.pinned ? ' pinned' : '')}>
      <div className="grow">
        <p>{entry.text}</p>
        {(entry.anchor_ids.length > 0 || origin) && <div className="wiki-entry-meta">
          {origin && <span className="wiki-origin">{tr(origin)}</span>}
          {entry.anchor_ids.map((id, i) => <Source key={id} id={id} anchor={'wiki-' + entry.entry_id + '-' + id}
            label={entry.anchor_ids.length > 1 ? tr('Source {0}', i + 1) : tr('Source')} />)}
        </div>}
      </div>
      <div className="wiki-entry-actions">
        <button className={'icon-btn sm' + (entry.pinned ? ' on' : '')} disabled={disabled}
          title={tr(entry.pinned ? 'Unpin: may change on the next summary' : 'Pin: keep through future summaries')}
          aria-label={tr(entry.pinned ? 'Unpin entry' : 'Pin entry')} aria-pressed={entry.pinned}
          onClick={() => void onEdit({ action: entry.pinned ? 'unpin' : 'pin', entry_id: entry.entry_id })}>
          <Icon name="flag" size={13} />
        </button>
        <button className="icon-btn sm" disabled={disabled} aria-label={tr('Edit Wiki entry')} title={tr('Edit')}
          onClick={() => setDraft(entry.text)}><Icon name="edit" size={13} /></button>
        <button className="icon-btn sm" disabled={disabled} aria-label={tr('Forget this entry')} title={tr('Forget')}
          onClick={() => void onEdit({ action: 'remove', entry_id: entry.entry_id })}><Icon name="trash" size={13} /></button>
      </div>
    </li>
  )
}

function Message({ message }: { message: WikiMessage }) {
  const { tr } = useLanguage()
  return (
    <div className={'wiki-msg ' + message.role}>
      <div className="wiki-bubble">{message.text}</div>
      {!!message.changes?.length && <ul className="wiki-changes" aria-label={tr('Wiki updated')}>
        <li className="wiki-changes-head"><Icon name="book" size={12} />{' '}{tr('Wiki updated')}</li>
        {message.changes.map((change) => <li key={change.entry_id + change.op} className={change.op}>
          <span aria-hidden="true">{change.op === 'add' ? '+' : change.op === 'remove' ? '−' : '~'}</span>
          {change.op === 'remove' ? <s>{change.text}</s> : change.text}
        </li>)}
      </ul>}
    </div>
  )
}

function TopicWiki({ topicId }: { topicId: string }) {
  const { tr } = useLanguage()
  const source = useContext(WikiSourceContext)!
  const { call, tick, Source } = source
  const [wiki, setWiki] = useState<Wiki>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [adding, setAdding] = useState<string>()
  const [working, setWorking] = useState(false)
  const autoRefreshed = useRef(false)
  const threadEnd = useRef<HTMLDivElement>(null)
  const scope = { topic_id: topicId }

  const load = useCallback(() => call('wiki.get', { topic_id: topicId }).then(setWiki, (e) => setError(errorText(e))),
    [call, topicId])
  useEffect(() => { void load() }, [load, tick])
  const busy = wiki?.status === 'generating' || !!wiki?.pending_reply
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [busy, load])

  async function run(action: () => Promise<Wiki>) {
    setError('')
    setWorking(true)
    try {
      setWiki(await action())
      return true
    } catch (cause) {
      setError(errorText(cause))
      return false
    } finally { setWorking(false) }
  }
  const refresh = () => run(() => call('wiki.refresh', scope))
  const edit = (change: WikiEdit) => run(() => call('wiki.edit', { ...scope, ...change }))

  // Reopening a stale summary refreshes locally or through its previously selected endpoint.
  useEffect(() => {
    if (!wiki || autoRefreshed.current || busy) return
    if (wiki.status === 'ready' && wiki.stale && (!wiki.transfer ||
      (wiki.generator.kind === 'model' && wiki.generator.endpoint === wiki.transfer.endpoint))) {
      autoRefreshed.current = true
      void refresh()
    }
  })
  const threadLength = wiki?.thread.length ?? 0
  const scrolled = useRef(false)
  useEffect(() => {
    if (!scrolled.current) { scrolled.current = threadLength > 0; return }
    threadEnd.current?.scrollIntoView({ block: 'end' })
  }, [threadLength, wiki?.pending_reply])

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = message.trim()
    if (!text) return
    if (await run(() => call('wiki.chat', { ...scope, text }))) setMessage('')
  }

  if (!wiki) return <div className="wiki-scroll">{error ? <p className="wiki-issue" role="alert">{error}</p>
    : <FlippingBook label={tr('Opening the Wiki…')} />}</div>

  const issue = wiki.issue && tr(ISSUE_TEXT[wiki.issue.reason] ?? 'The Wiki could not finish. Try again.')
  const generating = wiki.status === 'generating'
  const summarized = !!wiki.revision
  const groups = KIND_ORDER.map((kind) => [kind, wiki.entries.filter((e) => e.kind === kind)] as const)
  const { papers, notes, answers, findings } = wiki.sources
  const plural = (n: number, one: string, many: string) => tr(n === 1 ? one : many, n)
  const counts = [plural(papers, '{0} paper', '{0} papers'), plural(notes, '{0} note', '{0} notes'),
    plural(answers, '{0} question', '{0} questions'), plural(findings, '{0} finding', '{0} findings')].join(' · ')

  return <>
    <div className="wiki-scroll">
      <div className="wiki-column">
        {generating ? <FlippingBook label={tr('Generating')} />
          : !summarized ? <section className="wiki-empty">
            <span className="wiki-empty-icon" aria-hidden="true"><Icon name="book" size={30} /></span>
            <h2>{tr(wiki.entries.length ? 'Ready to summarize' : 'Nothing in this Wiki yet')}</h2>
            <p>{tr('The Wiki is this topic’s long-term memory. It collects what you learn across all papers and conversations here: answers, parsed PDF passages, notes and saved findings, and turns them into a summary you can talk to.')}</p>
            <p className="wiki-sources">{counts}{wiki.entries.length > 0 && ' · ' + plural(wiki.entries.length, '{0} entry collected', '{0} entries collected')}</p>
            {issue && <p className="wiki-issue" role="alert">{issue}</p>}
            <button className="primary" disabled={working} onClick={() => void refresh()}>
              <Icon name="book" size={15} />{' '}{tr('Summarize this topic')}
            </button>
            {wiki.transfer && <p className="fine">{tr('Sends {0} to {1}.', wiki.transfer.data_categories.map((c) => tr(c).replace(/^(?!Wiki)\w/, (x) => x.toLowerCase())).join(', '), wiki.transfer.endpoint)}</p>}
          </section>
          : <article className="wiki-summary">
            <p className="wiki-meta">
              <span>{ago(tr, wiki.generated_at)}</span>
              <span>{counts}</span>
              <span>{wiki.generator.kind === 'model' ? wiki.generator.model : tr('Local summary')}</span>
            </p>
            {issue && !wiki.pending_reply && <p className="wiki-issue" role="alert">{issue}</p>}
            {(wiki.stale || wiki.new_since_summary > 0) && <p className="wiki-stale">
              {wiki.new_since_summary > 0 ? plural(wiki.new_since_summary, '{0} new entry since this summary.', '{0} new entries since this summary.') : tr('There is new activity since this summary.')}{' '}
              <button className="link-btn" onClick={() => void refresh()}>{tr('Update now')}</button></p>}
            <h2 className="wiki-headline">{wiki.headline}</h2>
            {wiki.summary.map((paragraph, i) => <p key={i} className="wiki-paragraph">{paragraph}</p>)}
            {wiki.transfer && (wiki.generator.kind === 'local' || wiki.generator.endpoint !== wiki.transfer.endpoint) && <div>
              <button className="link-btn" disabled={working || busy} onClick={() => void refresh()}>{tr('Summarize this topic')}</button>
              <p className="fine">{tr('Sends {0} to {1}.', wiki.transfer.data_categories.map((category) => tr(category)).join(', '), wiki.transfer.endpoint)}</p>
            </div>}
            {wiki.generator.kind === 'local' && !wiki.transfer && <p className="fine">{tr('Connect a model in Models & services for a fuller, written summary.')}</p>}
          </article>}

        {!generating && wiki.entries.length > 0 && <div className="wiki-entries">
          {groups.map(([kind, entries]) => entries.length > 0 && <section key={kind} className="wiki-group">
            <h3>{tr(KIND_LABEL[kind])}</h3>
            <ul>{entries.map((entry) => <EntryRow key={entry.entry_id} entry={entry} onEdit={edit} disabled={working || busy} Source={Source} />)}</ul>
          </section>)}
        </div>}
        {!generating && (summarized || wiki.entries.length > 0) && (adding === undefined ? <button className="link-btn wiki-add" onClick={() => setAdding('')}>
          <Icon name="plus" size={13} />{' '}{tr('Add an entry')}
        </button> : <form className="wiki-add-form" onSubmit={(e) => {
          e.preventDefault()
          if (adding.trim()) void edit({ action: 'add', kind: 'preference', text: adding.trim() }).then((ok) => { if (ok) setAdding(undefined) })
        }}>
          <textarea aria-label={tr('New Wiki entry')} value={adding} maxLength={400} rows={2} autoFocus
            placeholder={tr('For example: I only need results on biomedical datasets.')}
            onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setAdding(undefined) }} />
          <div className="wiki-entry-actions shown">
            <button type="button" className="ghost-btn sm" onClick={() => setAdding(undefined)}>{tr('Cancel')}</button>
            <button className="primary sm" disabled={working || !adding.trim()}>{tr('Remember')}</button>
          </div>
        </form>)}

        {(wiki.thread.length > 0 || wiki.pending_reply) && <section className="wiki-thread" aria-label={tr('Conversation with the Wiki')}>
          {wiki.thread.map((m) => <Message key={m.message_id} message={m} />)}
          {wiki.pending_reply && <div className="wiki-msg assistant" role="status" aria-label={tr('Thinking…')}>
            <div className="wiki-bubble wiki-typing"><span /><span /><span /></div>
          </div>}
          {issue && !generating && wiki.thread.at(-1)?.role === 'user' && <p className="wiki-issue" role="alert">{issue}</p>}
        </section>}
        <div ref={threadEnd} />
      </div>
    </div>

    <form className="wiki-composer" onSubmit={(e) => void send(e)}>
      {error && <p className="wiki-issue" role="alert">{error}</p>}
      <div className="wiki-input">
        <textarea aria-label={tr('Message the Wiki')} value={message} maxLength={2000} rows={1}
          placeholder={summarized ? tr('Ask what this topic’s Wiki knows, or say “remember…” / “forget…”') : tr('Summarize the topic first to start a conversation.')}
          disabled={!summarized}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} />
        <button className="wiki-send" aria-label={tr('Send')} disabled={!summarized || busy || working || !message.trim()}>
          <Icon name="arrowUp" size={16} />
        </button>
      </div>
      <p className="wiki-hint">
        {wiki.transfer ? tr('Messages and this topic’s Wiki are sent to {0}.', wiki.transfer.endpoint) : tr('Replies use this topic’s Wiki on this device.')}
        {wiki.thread.length > 0 && !wiki.pending_reply && <>{' '}<button type="button" className="link-btn quiet"
          onClick={() => void run(() => call('wiki.clear_chat', scope))}>{tr('Clear conversation')}</button></>}
      </p>
    </form>
  </>
}

export function WikiPage() {
  const { tr } = useLanguage()
  const { state } = useStore()
  const routed = state.route.view === 'wiki' ? state.route.topicId : undefined
  const [selected, select] = useState('')
  const topic = state.topics.find((t) => t.id === (selected || routed))?.id ?? state.topics[0]?.id
  return (
    <div className="page wiki-page">
      <PageHead icon="book" title={tr('Wiki')} sub={tr('Long-term memory for the whole topic')}>
        {topic && <select className="lib-select" aria-label={tr('Research topic')} value={topic}
          onChange={(e) => select(e.currentTarget.value)}>
          {state.topics.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>}
      </PageHead>
      {topic ? <TopicWiki key={topic} topicId={topic} />
        : <div className="wiki-scroll"><section className="wiki-empty">
          <span className="wiki-empty-icon" aria-hidden="true"><Icon name="book" size={30} /></span>
          <h2>{tr('Create a topic to start its Wiki.')}</h2>
        </section></div>}
    </div>
  )
}
