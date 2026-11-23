import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { Icon } from './Icon'

import { dreamFrame, greetingsAt } from '../data/greetings'

export function NewTopicEntry({ paused, onOpen }: { paused: boolean; onOpen: () => void }) {
  const { language, tr } = useLanguage()
  const [lines, setLines] = useState(() => greetingsAt(new Date().getHours()))
  useEffect(() => {
    const sync = () => setLines(greetingsAt(new Date().getHours()))
    const timer = window.setInterval(sync, 15000)
    document.addEventListener('visibilitychange', sync)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [])
  const [dream, setDream] = useState<number | null>(null)
  const variant = useRef(0)
  const greeting = useRef<HTMLButtonElement>(null)
  const dreaming = dream !== null
  useEffect(() => {
    if (!dreaming) return
    function dismiss(event: PointerEvent) {
      if (!greeting.current?.contains(event.target as Node)) setDream(null)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setDream(null)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [dreaming])
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
      if (paused || dreaming || document.hidden || motion.matches) {
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
  }, [language, lines, paused, dreaming])
  return <section className="new-topic-entry">
    <h1><button className="dream-trigger" ref={greeting} type="button" aria-label={full} aria-expanded={dreaming}
      onClick={() => setDream(dreaming ? null : dreamFrame(new Date().getHours(), variant.current++))}>
      <span aria-hidden="true">{text}<i /></span>
      {dream !== null && <span className="dream-bubble" role="img" aria-label={language === 'en' ? 'A little otter in a dream bubble' : '梦境气泡中的小水獭'}>
        <svg viewBox="0 0 148 128" aria-hidden="true">
          <g fill="var(--surface)" stroke="var(--ink-4)" strokeWidth="1.1">
            <circle cx="6" cy="121" r="3.5"/><circle cx="18" cy="108" r="6.5"/>
            <path d="M28 89C9 88 4 69 14 57C6 43 16 27 33 26C38 10 57 8 68 14C81 0 105 5 111 19C129 16 141 29 136 45C152 58 145 79 133 83C130 101 108 105 95 99C81 111 61 106 54 99C43 104 31 100 28 89Z"/>
          </g>
        </svg>
        <span className="dream-pose" style={{ backgroundPosition: `${(dream % 4) * 100 / 3}% ${Math.floor(dream / 4) * 50}%` }} />
      </span>}
    </button></h1>
    <div className="greeting-source">{source}</div>
    <button type="button" onClick={() => { setDream(null); onOpen() }} aria-haspopup="dialog">
      <Icon name="plus" size={18} /><span>{tr('New topic')}</span><Icon name="arrowRight" size={17} />
    </button>
  </section>
}
