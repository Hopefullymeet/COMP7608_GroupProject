import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n'
import { Icon } from './Icon'

const greetings = {
  'zh-CN': ['今天想研究什么？', '哪篇论文让你好奇？', '顺着这条引用，会读到什么？', '夜深了，再读一页？'],
  en: ['What would you like to explore today?', 'Which paper caught your eye?', 'Where might this citation lead?', 'One more page tonight?'],
}

export function NewTopicEntry({ paused, onOpen }: { paused: boolean; onOpen: () => void }) {
  const { language, tr } = useLanguage()
  const lines = greetings[language]
  const [text, setText] = useState('')
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: number
    function restart() {
      window.clearTimeout(timer)
      if (paused || document.hidden || motion.matches) {
        setText(lines[0])
        return
      }
      let line = 0
      let length = 0
      let erasing = false
      function tick() {
        length += erasing ? -1 : 1
        setText(lines[line].slice(0, length))
        let delay = erasing ? 42 : 115
        if (length === lines[line].length) {
          erasing = true
          delay = 4000
        } else if (length === 0) {
          const hour = new Date().getHours()
          line = (line + 1) % (hour >= 20 || hour < 5 ? 4 : 3)
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
  }, [lines, paused])
  return <section className="new-topic-entry">
    <h1 aria-label={lines[0]}><span aria-hidden="true">{text}<i /></span></h1>
    <button type="button" onClick={onOpen} aria-haspopup="dialog">
      <Icon name="plus" size={18} /><span>{tr('New topic')}</span><Icon name="arrowRight" size={17} />
    </button>
  </section>
}
