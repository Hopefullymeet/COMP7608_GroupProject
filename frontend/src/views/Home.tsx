import { useLanguage } from '../i18n'
import { useState } from 'react'
import { useStore } from '../data/store'
import { DEFAULT_QUESTION, DEMO_TOPIC } from '../data/fixtures'
import { Icon } from '../components/Icon'
import { Dialog } from '../components/PageHead'
import { NewTopicEntry } from '../components/NewTopicEntry'
import { Disclosure } from '../components/Disclosure'

export function Home() {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [open, setOpen] = useState(state.route.view === 'home' && !!state.route.create)
  const canDemo = !state.mainline ? state.topics.some((t) => t.id === DEMO_TOPIC) : state.mainline.demo

  const canSubmit = !!name.trim()
  const submit = () => { if (canSubmit) act.startFromHome(name.trim(), question.trim()) }

  return (
    <div className="home">
      <div className="home-inner">
        <NewTopicEntry paused={open} onOpen={() => setOpen(true)} />
        {open && <Dialog title={tr('New topic')} onClose={() => setOpen(false)}>
          <form className="topic-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="topic-field">
            <span>{tr('Topic name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={160}
              placeholder={tr('e.g. Scientific QA datasets')} />
          </label>

          <div className="topic-field">
            <label htmlFor="home-question">{tr('Starting question')} <small>{tr('Optional')}</small></label>
            <textarea id="home-question" aria-describedby="home-question-hint" value={question} rows={2} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              placeholder={tr('e.g. Which scientific QA datasets use paper abstracts?')} />
            <small id="home-question-hint" className="topic-field-hint">{tr('Opens as the first search in Discover.')}</small>
          </div>

          <footer className="topic-form-foot">
            <button type="submit" className="primary" disabled={!canSubmit}>
              {tr('Create topic')}<Icon name="arrowRight" size={15} />
            </button>
          </footer>
          </form>
        </Dialog>}

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
