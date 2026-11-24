import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { Icon } from './Icon'

import { dreamFrame, greetingsAt } from '../data/greetings'

export function NewTopicEntry({ paused, onOpen }: { paused: boolean; onOpen: () => void }) {
  const { language, tr } = useLanguage()
  const [dream, setDream] = useState<number | null>(null)
  const variant = useRef(0)
  const greeting = useRef<HTMLButtonElement>(null)
  const dreaming = dream !== null
  const [lines, setLines] = useState(() => greetingsAt(new Date().getHours()))
  useEffect(() => {
    if (dreaming) return
    const sync = () => setLines(greetingsAt(new Date().getHours()))
    const timer = window.setInterval(sync, 15000)
    document.addEventListener('visibilitychange', sync)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [dreaming])
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
  const [frame, setFrame] = useState({ line: 0, length: 0 })
  const entry = lines[frame.line % lines.length]
  const full = entry[language]
  const text = full.slice(0, frame.length)
  const source = text === full ? entry.source?.[language] : ''
  const resumeAfterDream = useRef(false)
  const cursor = useRef({ pool: lines, language, line: 0, length: 0, erasing: false })
  useEffect(() => {
    if (dreaming) {
      resumeAfterDream.current = true
      return
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const typingDelay = language === 'en' ? 38 : 115
    const eraseDelay = language === 'en' ? 14 : 42
    if (cursor.current.pool !== lines || cursor.current.language !== language) {
      cursor.current = { pool: lines, language, line: 0, length: 0, erasing: false }
    }
    const position = cursor.current
    const show = () => setFrame({ line: position.line, length: position.length })
    const readingDelay = () => lines[position.line].source ? 6000 : 4000
    let timer: number
    function tick() {
      const size = lines[position.line][language].length
      position.length += position.erasing ? -1 : 1
      show()
      let delay = position.erasing ? eraseDelay : typingDelay
      if (position.length === size) {
        position.erasing = true
        delay = readingDelay()
      } else if (position.length === 0) {
        position.line = (position.line + 1) % lines.length
        position.erasing = false
        delay = 250
      }
      timer = window.setTimeout(tick, delay)
    }
    function restart() {
      window.clearTimeout(timer)
      if (paused || document.hidden || motion.matches) {
        position.length = lines[position.line][language].length
        position.erasing = true
        show()
      } else if (resumeAfterDream.current || position.length === lines[position.line][language].length) {
        timer = window.setTimeout(tick, readingDelay())
      } else {
        tick()
      }
      resumeAfterDream.current = false
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
