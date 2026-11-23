import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { Icon } from './Icon'

import { greetingsAt } from '../data/greetings'

export function NewTopicEntry({ paused, onOpen }: { paused: boolean; onOpen: () => void }) {
  const { language, tr } = useLanguage()
  const [lines, setLines] = useState(() => greetingsAt(new Date().getHours()))
  useEffect(() => {
    const sync = () => setLines(greetingsAt(new Date().getHours()))
    const timer = window.setInterval(sync, 15000)
    document.addEventListener('visibilitychange', sync)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [])
  const cursor = useRef({ pool: lines, line: 0 })
  const [frame, setFrame] = useState({ line: 0, length: 0 })
  const entry = lines[frame.line % lines.length]
  const full = entry[language]
  const text = full.slice(0, frame.length)
  const source = text === full ? entry.source?.[language] : ''
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const typingDelay = language === 'en' ? 38 : 115
    const eraseDelay = language === 'en' ? 14 : 42
    let timer: number
    function restart() {
      window.clearTimeout(timer)
      if (cursor.current.pool !== lines) cursor.current = { pool: lines, line: 0 }
      let line = cursor.current.line
      if (paused || document.hidden || motion.matches) {
        setFrame({ line, length: lines[line][language].length })
        return
      }
      let length = 0
      let erasing = false
      function tick() {
        length += erasing ? -1 : 1
        const entry = lines[line]
        const full = entry[language]
        cursor.current.line = line
        setFrame({ line, length })
        let delay = erasing ? eraseDelay : typingDelay
        if (length === full.length) {
          erasing = true
          delay = entry.source ? 6000 : 4000
        } else if (length === 0) {
          line = (line + 1) % lines.length
          erasing = false
          delay = 250
        }
        timer = window.setTimeout(tick, delay)
      }
      tick()
    }
    restart()
    motion.addEventListener('change', restart)
    document.addEventListener('visibilitychange', restart)
    return () => {
      window.clearTimeout(timer)
      motion.removeEventListener('change', restart)
      document.removeEventListener('visibilitychange', restart)
    }
  }, [language, lines, paused])
  return <section className="new-topic-entry">
    <h1 aria-label={lines[0][language]}><span aria-hidden="true">{text}<i /></span></h1>
    <div className="greeting-source">{source}</div>
    <button type="button" onClick={onOpen} aria-haspopup="dialog">
      <Icon name="plus" size={18} /><span>{tr('New topic')}</span><Icon name="arrowRight" size={17} />
    </button>
  </section>
}
