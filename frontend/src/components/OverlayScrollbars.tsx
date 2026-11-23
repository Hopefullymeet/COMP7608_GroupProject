import { useEffect, useRef } from 'react'

/** The native element still scrolls. Only the two draggable thumbs live outside its layout. */
export function OverlayScrollbars() {
  const vertical = useRef<HTMLDivElement>(null)
  const horizontal = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bars = [vertical.current!, horizontal.current!]
    let owner: HTMLElement | undefined
    let drag: { index: number; pointer: number; start: number; scroll: number; ratio: number } | undefined
    let timeout: number
    const ratios = [0, 0]

    function hide() {
      if (drag) return
      owner = undefined
      bars.forEach(bar => { bar.hidden = true })
    }

    function draw() {
      if (!owner?.isConnected) { hide(); return }
      const rect = owner.getBoundingClientRect()
      const style = getComputedStyle(owner)
      bars.forEach((bar, i) => {
        const height = i === 0
        const size = height ? owner!.clientHeight : owner!.clientWidth
        const total = height ? owner!.scrollHeight : owner!.scrollWidth
        const overflow = height ? style.overflowY : style.overflowX
        bar.hidden = total <= size || !/auto|scroll|overlay/.test(overflow) || size < 24
        if (bar.hidden) return
        const track = size - 4
        const thumb = Math.min(track, Math.max(24, track * size / total))
        const travel = track - thumb
        ratios[i] = travel > 0 ? (total - size) / travel : 0
        const scroll = height ? owner!.scrollTop : owner!.scrollLeft
        const offset = 2 + (ratios[i] ? scroll / ratios[i] : 0)
        const left = rect.left + owner!.clientLeft
        const top = rect.top + owner!.clientTop
        Object.assign(bar.style, {
          left: (height ? left + owner!.clientWidth - 10 : left + offset) + 'px',
          top: (height ? top + offset : top + owner!.clientHeight - 10) + 'px',
          width: (height ? 10 : thumb) + 'px', height: (height ? thumb : 10) + 'px',
        })
      })
    }

    function reveal(event: Event) {
      if (drag || bars.includes(event.target as HTMLDivElement)) return
      let el = event.target instanceof Element ? event.target : null
      while (el) {
        if (el instanceof HTMLElement && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
          const css = getComputedStyle(el)
          if ((el.scrollHeight > el.clientHeight && /auto|scroll|overlay/.test(css.overflowY)) ||
              (el.scrollWidth > el.clientWidth && /auto|scroll|overlay/.test(css.overflowX))) break
        }
        el = el.parentElement
      }
      if (!(el instanceof HTMLElement)) { hide(); return }
      owner = el
      draw()
      window.clearTimeout(timeout)
      timeout = window.setTimeout(hide, 1200)
    }

    function start(event: PointerEvent) {
      if (!owner || event.button !== 0) return
      const bar = event.currentTarget as HTMLDivElement
      const index = bars.indexOf(bar)
      drag = { index, pointer: event.pointerId, start: index ? event.clientX : event.clientY,
        scroll: index ? owner.scrollLeft : owner.scrollTop, ratio: ratios[index] }
      event.preventDefault()
      bar.setPointerCapture(event.pointerId)
    }
    function move(event: PointerEvent) {
      if (!owner || !drag || drag.pointer !== event.pointerId) return
      const next = drag.scroll + ((drag.index ? event.clientX : event.clientY) - drag.start) * drag.ratio
      if (drag.index) owner.scrollLeft = next
      else owner.scrollTop = next
      draw()
    }
    function wheel(event: WheelEvent) {
      if (!owner || event.ctrlKey) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? owner.clientHeight : 1
      owner.scrollBy(event.deltaX * unit, event.deltaY * unit)
    }
    function end() { drag = undefined; hide() }
    const events = ['pointermove', 'focusin', 'scroll']
    events.forEach(type => document.addEventListener(type, reveal, true))
    window.addEventListener('resize', hide)
    bars.forEach(bar => {
      bar.addEventListener('wheel', wheel, { passive: false })
      bar.addEventListener('pointerdown', start)
      bar.addEventListener('pointermove', move)
      bar.addEventListener('lostpointercapture', end)
    })
    return () => {
      window.clearTimeout(timeout)
      events.forEach(type => document.removeEventListener(type, reveal, true))
      window.removeEventListener('resize', hide)
      bars.forEach(bar => {
        bar.removeEventListener('wheel', wheel)
        bar.removeEventListener('pointerdown', start)
        bar.removeEventListener('pointermove', move)
        bar.removeEventListener('lostpointercapture', end)
      })
    }
  }, [])

  return <><div ref={vertical} className="overlay-thumb" aria-hidden="true" hidden />
    <div ref={horizontal} className="overlay-thumb" aria-hidden="true" hidden /></>
}
