import { useLanguage } from '../i18n'
import { useStore } from '../data/store'
import { Icon } from './Icon'

export function TopicChooser({ onSelect, wiki }: { wiki?:boolean; onSelect: (id: string) => void }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  return <>
        <h2>{tr('Choose a topic to begin')}</h2>
        <div className="audit-options">{state.topics.map(t => <button key={t.id}
          className="audit-option" onClick={() => onSelect(t.id)}>
          <Icon name="book" size={19}/><span>{t.title}</span>{wiki && t.wikiUnread && <i className="wiki-unread" aria-label={tr('Unread')}/>}<span aria-hidden="true">›</span>
        </button>)}</div>
        {!state.topics.length && <button className="ghost-btn" onClick={() => act.newTopic()}>{tr('New topic')}</button>}
  </>
}
