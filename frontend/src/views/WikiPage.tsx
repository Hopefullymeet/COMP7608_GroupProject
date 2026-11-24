import { useAnswerScroll } from '../components/useAnswerScroll'
import { confirmAction } from '../components/confirmAction'
import { useLanguage, type Translate } from '../i18n'
import { lazy, Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useStore } from '../data/store'
import { usePreferences } from '../data/preferences'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { errorText } from '../api/contract'
import type { Wiki, WikiEdit, WikiEntry, WikiKind, WikiMessage, WikiMethods, WikiOrigin } from '../api/wiki'
import { AnswerText } from '../components/AnswerText'
import { Icon, Spinner } from '../components/Icon'
import { Disclosure } from '../components/Disclosure'
import { TopicChooser } from '../components/TopicChooser'
import { Dialog, HeaderContext, PageHead } from '../components/PageHead'
import { WikiDirectory } from './WikiDirectory'
import { EvidenceLink } from './Notes'

type WithoutOperation<T> = T extends unknown ? Omit<T, 'operation_id'> : never
type Params<M extends keyof WikiMethods> = WithoutOperation<WikiMethods[M][0]>
/** Where the Wiki page reads and writes: the workspace RPC client or the scripted demo store. */
export type WikiSource = {
  call: <M extends keyof WikiMethods>(method: M, params: Params<M>) => Promise<Wiki>
  access?: "read" | "edit"
  settingsAvailable?: boolean
  tick: number
  Source: (props: { id: string; label: string; anchor: string }) => ReactNode
}
const WikiSourceContext = createContext<WikiSource | null>(null)
export const WikiSourceProvider = WikiSourceContext.Provider

export function WorkspaceWikiSource({ children }: { children: ReactNode }) {
  const profile = useRead("profile.get", {})
  const { api, write, tick } = useWorkspace()
  const call = useCallback(<M extends keyof WikiMethods>(method: M, params: Params<M>): Promise<Wiki> =>
    method === 'wiki.get' ? api.call('wiki.get', params as Params<'wiki.get'>)
      : (write as (m: string, p: unknown) => Promise<Wiki>)(method, params), [api, write])
  const Source = useCallback(({ id, label }: { id: string; label: string }) => <EvidenceLink id={id} label={label} />, [])
  return <WikiSourceProvider value={{ call, tick, Source, access: profile && (profile.wiki_access ?? "edit"), settingsAvailable: true }}>{children}</WikiSourceProvider>
}

const PdfReader = lazy(() => import("./PdfReader"))
const topicDrafts = new Map<string,string>()
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
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(undefined)
            }
          }} />
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
          onClick={async () => { if (await confirmAction(tr('Delete this Wiki entry?'), tr('Cancel'), tr('Delete'))) void onEdit({ action: 'remove', entry_id: entry.entry_id }) }}><Icon name="trash" size={13} /></button>
      </div>
    </li>
  )
}

function Message({ message, wiki, Source }: { message: WikiMessage; wiki: Wiki; Source: WikiSource["Source"] }) {
  const { tr } = useLanguage()
  const [reader,setReader] = useState<{version:string;page:number;title:string}>()
  if (message.role === 'user') return <div className="msg user" data-answer-id={message.message_id}><p>{message.text}</p></div>
  const answer = /①.*②/s.test(message.text) ? message.text.replace(/([^\n])([①-⑳])/g, '$1\n$2 ') : message.text
  return (
    <div className="msg agent" data-answer-id={message.message_id}>
      <AnswerText text={answer}/>
      {message.anchor_ids?.map(id => {
        const source = wiki.map_sources?.[id]
        return source && <details key={id} className="wiki-answer-source"><summary><Icon name="quote" size={13}/><span>{source.title}{source.page ? ' · p. ' + source.page : ''}</span><Icon name="chevronDown" size={12}/></summary>
          <blockquote>{source.quote}</blockquote>{source.source_version_id && source.page ? <button className="link-btn" onClick={()=>setReader({version:source.source_version_id!,page:source.page!,title:source.title})}>{tr('Open in reader')}</button> : <Source id={id} label={tr('Source')} anchor={message.message_id + id}/>}</details>
      })}
      {reader && <Dialog title={reader.title} panelClass="wiki-source-reader" onClose={()=>setReader(undefined)}>
        <Suspense fallback={<p>{tr('Opening PDF…')}</p>}><PdfReader topic={wiki.topic_id} version={reader.version} page={reader.page}/></Suspense>
      </Dialog>}
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

function TopicWiki({ topicId, title, unread }: { topicId: string; title:string; unread?:boolean }) {
  const { tr } = useLanguage()
  const source = useContext(WikiSourceContext)!
  const { call, tick, Source, access } = source
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(()=>topicDrafts.get(topicId) ?? '')
  useEffect(()=>{if(draft) topicDrafts.set(topicId,draft); else topicDrafts.delete(topicId)},[draft,topicId])
  const composer = useRef<HTMLTextAreaElement>(null)
  const prefs = usePreferences()
  const { language } = useLanguage()
  const t = (zh:string,en:string) => language === 'zh-CN' ? zh : en
  function suggest(question:string) {
    setOpen(true)
    setDraft(question)
    requestAnimationFrame(() => composer.current?.focus())
  }
  const [wiki, setWiki] = useState<Wiki>()
  const [error, setError] = useState('')
  const [adding, setAdding] = useState<string>()
  const [working, setWorking] = useState(false)
  const autoRefreshed = useRef(false)
  const scope = { topic_id: topicId }

  const load = useCallback(() => call('wiki.get', { topic_id: topicId }).then(setWiki, (e) => setError(errorText(e))),
    [call, topicId])
  useEffect(() => { void load() }, [load, tick])
  useEffect(() => {
    if (wiki?.map_nodes && unread) void call('wiki.edit', {topic_id:topicId,action:'map_seen',entry_id:''}).catch(e=>setError(errorText(e)))
  }, [call, topicId, unread, !!wiki?.map_nodes])
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
  const latest = wiki?.thread.at(-1)
  const question = latest?.role === 'user' ? latest : wiki?.thread.at(-2)
  const scroll = useAnswerScroll(topicId, wiki?.pending_reply ? question?.message_id : undefined,
    latest?.role === 'assistant' ? question?.message_id : undefined, latest?.message_id, '')

  if (!wiki) return <div className="wiki-scroll">{error ? <p className="wiki-issue" role="alert">{error}</p>
    : <FlippingBook label={tr('Opening the Wiki…')} />}</div>

  const issue = wiki.issue && tr(ISSUE_TEXT[wiki.issue.reason] ?? 'The Wiki could not finish. Try again.')
  const generating = wiki.status === 'generating'
  const summarized = !!wiki.revision
  const directory = Boolean(wiki.map_nodes)
  const filedAnchors = new Set(Object.values(wiki.map_nodes ?? {}).flatMap(n => n.anchors))
  const notes = wiki.entries.filter(e => !directory || e.pinned || ['user','chat','note','finding'].includes(e.origin) ||
    ['preference','open_question'].includes(e.kind) ||
    (e.kind !== 'focus' && (!e.anchor_ids.length || e.anchor_ids.some(id => !filedAnchors.has(id)))) ||
    Boolean(wiki.pending_removals?.[e.entry_id]))
  const groups = KIND_ORDER.map((kind) => [kind, notes.filter((e) => e.kind === kind)] as const)
  const { papers, notes: noteCount, answers, findings } = wiki.sources
  const plural = (n: number, one: string, many: string) => tr(n === 1 ? one : many, n)
  const counts = [plural(papers, '{0} paper', '{0} papers'), plural(noteCount, '{0} note', '{0} notes'),
    plural(answers, '{0} question', '{0} questions'), plural(findings, '{0} finding', '{0} findings')].join(' · ')

  const toggle = <button className="ghost-btn sm" aria-expanded={open} onClick={()=>setOpen(!open)}><Icon name="message" size={14}/>{t('问 Wiki','Ask Wiki')}</button>
  async function send() {
    const question = draft.trim()
    if (!question || busy || working || !access) return
    if (await run(() => call('wiki.chat',{...scope,text:question}))) setDraft(current=>current === draft ? '' : current)
  }
  return <div className="wiki-split">
    <div className="wiki-scroll">
      <div className="wiki-column">
        {error && <p className="wiki-issue" role="alert">{error}</p>}
        {!directory && <header className="wiki-fallback-title"><h2>{title}</h2>{toggle}</header>}
        {wiki.map_nodes && <WikiDirectory assistant={toggle} ask={suggest} wiki={wiki} title={title} edit={edit} Source={Source} refresh={()=>void refresh()} busy={busy || working}/>}
        {directory && issue && <p className="wiki-issue" role="alert">{issue}</p>}
        {wiki.map_nodes && !!Object.keys(wiki.pending_removals ?? {}).length && <p>{tr('Pending deletion')} · {Object.values(wiki.pending_removals!).join(' / ')}</p>}
        {!!wiki.integrity_issues?.length && <Disclosure panel icon="alert" title={tr('Links to review')}>
          <ul>{wiki.integrity_issues.map((label,i)=><li key={i}>{label}</li>)}</ul>
        </Disclosure>}
        {!!wiki.history?.length && <Disclosure panel icon="clock" title={tr('Update history')}>{wiki.history.map((event,i)=><section key={i}>
          <time>{new Date(event.created).toLocaleString()}</time><div className="wiki-history-columns">{[false,true].map(removed=><div key={String(removed)}>
            <h4>{tr(removed?'Removed':'Added or updated')}</h4>
            <ul>{event.changes.filter(c=>(c.op==='remove')===removed).map(c=><li key={c.id}>{c.title}</li>)}</ul>
          </div>)}</div>
        </section>)}</Disclosure>}
        <Disclosure panel open={!wiki.map_nodes} icon="note" title={tr(directory ? 'Notes and open questions' : 'Topic overview')}>
        {!directory && (generating ? <FlippingBook label={tr('Generating')} />
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
          </article>)}

        {!generating && notes.length > 0 && <div className="wiki-entries">
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
            onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setAdding(undefined)
              }
            }} />
          <div className="wiki-entry-actions shown">
            <button type="button" className="ghost-btn sm" onClick={() => setAdding(undefined)}>{tr('Cancel')}</button>
            <button className="primary sm" disabled={working || !adding.trim()}>{tr('Remember')}</button>
          </div>
        </form>)}

        </Disclosure>
      </div>
    </div>
    {open && <aside className="wiki-assistant" aria-label={t('Wiki 助手','Wiki assistant')}>
      <header><strong>{t('Wiki 助手','Wiki assistant')}</strong><small>{title}</small>
        {!!wiki.thread.length && !wiki.pending_reply && <button className="icon-btn" disabled={working} title={tr('Clear conversation')} aria-label={tr('Clear conversation')} onClick={async ()=>{if(await confirmAction(tr('Clear conversation'),tr('Cancel'),tr('Clear conversation'))) void run(()=>call('wiki.clear_chat',scope))}}><Icon name="trash" size={14}/></button>}
        <button className="icon-btn" aria-label={tr('Close')} onClick={()=>setOpen(false)}><Icon name="x" size={16}/></button></header>
      <div className="wiki-assistant-scroll" ref={scroll.panel} onScroll={scroll.onScroll}>
        {error && <p role="alert" className="wiki-issue">{error}</p>}
        {(wiki.thread.length > 0 || wiki.pending_reply) && <section className="wiki-thread" aria-label={tr('Conversation with the Wiki')}>
          {wiki.thread.map((m) => <Message key={m.message_id} message={m} wiki={wiki} Source={Source} />)}
          {wiki.pending_reply && <div className="msg-who" role="status">
            <span className="working"><Spinner/>{tr('Thinking…')}</span>
          </div>}
          {issue && !generating && wiki.thread.at(-1)?.role === 'user' && <p className="wiki-issue" role="alert">{issue}</p>}
        </section>}
        <div ref={scroll.space} aria-hidden="true" />
      </div>
      <footer>
        {!wiki.thread.length && <div className="suggest-row">{[t('这个主题有哪些研究要点？','What are the main findings?'), t('哪些问题还有待核实？','Which questions remain open?')].map(q=><button className="chip-btn" key={q} onClick={()=>suggest(q)}>{q}</button>)}</div>}
        {generating && <small role="status">{t('正在整理 Wiki…','Updating Wiki…')}</small>}
        <form className="composer" onSubmit={e=>{e.preventDefault(); void send()}}>
          <textarea ref={composer} rows={1} maxLength={2000} value={draft} aria-label={t('向 Wiki 提问','Ask Wiki')} placeholder={access==='edit' ? t(`询问 ${title}，或告诉我需要记住什么…`,`Ask about ${title}, or tell me what to remember…`) : t(`询问 ${title} 主题…`,`Ask about ${title}…`)} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (prefs.send==='enter' || e.ctrlKey || e.metaKey)){e.preventDefault();void send()}}}/>
          <div className="composer-bar"><span className="grow"/><button className="send" disabled={!draft.trim() || busy || working || !access} aria-label={tr('Send')}><Icon name="arrowUp" size={16}/></button></div>
        </form>
        <button className="wiki-mode" disabled={!source.settingsAvailable} onClick={()=>window.dispatchEvent(new Event('papertrace:wiki-permission'))}>{!access ? t('正在读取权限…','Loading permission…') : access==='edit' ? t('当前模式：允许修改 Wiki 记忆','Current mode: Wiki memory edits allowed') : t('当前模式：仅回答，不修改记忆','Current mode: answer only')}</button>
      </footer>
    </aside>}
  </div>
}

export function WikiPage() {
  const { tr } = useLanguage()
  const { state } = useStore()
  const routed = state.route.view === 'wiki' ? state.route.topicId : undefined
  const [selected, select] = useState(routed ?? '')
  const topic = state.topics.find(t => t.id === selected)
  return (
    <div className="page wiki-page">
      <PageHead trace icon="wiki" title={tr('Wiki')} sub={tr('Long-term memory for the whole topic')}
        onBack={topic ? () => select('') : undefined}>
        {topic && <HeaderContext text={topic.title} />}
      </PageHead>
      {topic ? <TopicWiki key={topic.id} topicId={topic.id} title={topic.title} unread={topic.wikiUnread} />
        : <div className="page-body scroll"><section className="audit-chooser"><TopicChooser wiki onSelect={select} /></section></div>}
    </div>
  )
}
