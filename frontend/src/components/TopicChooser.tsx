import { useState } from 'react'
import { useLanguage } from '../i18n'
import { useStore } from '../data/store'
import { Icon } from './Icon'

export function TopicChooser({ onSelect, wiki }: { wiki?:boolean; onSelect: (id: string) => void }) {
  const { tr } = useLanguage()
  const { state, act } = useStore()
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const topics = search ? state.topics.filter(topic => topic.title.toLowerCase().includes(search)) : state.topics
  return <div className="illustrated-chooser">
    <img className="chooser-otter" alt="" src={import.meta.env.BASE_URL + 'otters/' + (wiki ? 'scientist' : 'detective') + '.webp'}/>
    <div className="chooser-topics">
        <h2>{tr('Choose a topic to begin')}</h2>
        {state.topics.length > 0 && <label className="field-search">
          <Icon name="search" size={15}/>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder={tr('Search topics…')} aria-label={tr('Search topics…')}/>
        </label>}
        {topics.length > 0 && <div className="audit-options">{topics.map(t => <button key={t.id}
          className="audit-option" onClick={() => onSelect(t.id)}>
          <Icon name="book" size={19}/><span>{t.title}</span>{wiki && t.wikiUnread && <i className="wiki-unread" aria-label={tr('Unread')}/>}<span aria-hidden="true">›</span>
        </button>)}</div>}
        {search && !topics.length && <p className="topic-picker-empty" role="status">{tr('No matching topics.')}</p>}
        {!state.topics.length && <button className="ghost-btn" onClick={() => act.newTopic()}>{tr('New topic')}</button>}
    </div>
  </div>
}
