// WebKit sends absolute gesture scales. Chromium trackpads send wheel deltas.
export function bindPdfPinch(frame: HTMLElement, resize: (factor: number, x: number, y: number) => void) {
  let pendingFactor = 1
  let animation = 0
  let centerX = 0
  let centerY = 0
  function accumulate(factor: number, x: number, y: number) {
    if (!Number.isFinite(factor) || factor <= 0) return
    pendingFactor *= factor ** 1.7
    centerX = x
    centerY = y
    if (animation) return
    animation = requestAnimationFrame(() => {
      animation = 0
      resize(pendingFactor, centerX, centerY)
      pendingFactor = 1
    })
  }
  let previousScale = 0
  let previousDistance = 0
  const listeners = new AbortController()
  const options = { passive: false, signal: listeners.signal }
  frame.addEventListener('wheel', event => {
    if (!event.ctrlKey) return
    event.preventDefault()
    if (previousScale || previousDistance) return
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1)
    accumulate(Math.exp(-pixels * .01), event.clientX, event.clientY)
  }, options)
  frame.addEventListener('gesturestart', event => {
    event.preventDefault()
    previousScale = 1
    previousDistance = 0
  }, options)
  frame.addEventListener('gesturechange', event => {
    event.preventDefault()
    const { scale, clientX, clientY } = event as MouseEvent & { scale: number }
    if (previousScale && scale > 0) accumulate(scale / previousScale, clientX, clientY)
    previousScale = scale
  }, options)
  frame.addEventListener('gestureend', event => { event.preventDefault(); previousScale = 0 }, options)
  function touch(event: TouchEvent) {
    if (event.touches.length !== 2 || previousScale) { previousDistance = 0; return }
    event.preventDefault()
    const [a, b] = Array.from(event.touches)
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (previousDistance && distance) accumulate(distance / previousDistance, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
    previousDistance = distance
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) frame.addEventListener(type, touch, options)
  return () => { listeners.abort(); cancelAnimationFrame(animation) }
}
