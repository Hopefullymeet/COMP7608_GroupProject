import { useLayoutEffect, useRef } from 'react'

/** Keep scrolling inside the conversation. A completed turn can have a different
 * message id from its preview, so track the task until its saved answer arrives. */
export function useAnswerScroll(session: string | undefined, running: string | undefined, finished: string | undefined, answerId: string | undefined, text: string) {
  const panel = useRef<HTMLDivElement>(null)
  const space = useRef<HTMLDivElement>(null)
  const pending = useRef<string>()
  const following = useRef(true)
  useLayoutEffect(() => {
    pending.current = undefined
    following.current = true
    if (space.current) space.current.style.height = '0'
  }, [session])
  useLayoutEffect(() => {
    const box = panel.current
    const spacer = space.current
    if (!box || !spacer) return
    if (running) {
      if (pending.current !== running) following.current = true
      pending.current = running
      spacer.style.height = '0'
      if (following.current) box.scrollTop = box.scrollHeight
    } else if (finished && pending.current === finished && answerId) {
      pending.current = undefined
      if (!following.current) return
      const answer = box.querySelector<HTMLElement>('[data-answer-id="' + CSS.escape(answerId) + '"]')
      if (!answer) return
      const inset = parseFloat(getComputedStyle(box).paddingTop) || 0
      const top = answer.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - inset
      spacer.style.height = Math.ceil(Math.max(0, top + box.clientHeight - box.scrollHeight)) + 'px'
      box.scrollTop = top
    }
  }, [session, running, finished, answerId, text])
  function onScroll() {
    const box = panel.current
    if (box && running) following.current = box.scrollHeight - box.clientHeight - box.scrollTop <= 24
  }
  return { panel, space, onScroll }
}
