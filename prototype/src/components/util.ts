/** Scroll `el` into view inside its own scroll container only (scrollIntoView would also shift overflow:hidden ancestors). */
export function scrollWithin(el: HTMLElement | null, containerSelector: string, block: 'start' | 'center' | 'end') {
  const box = el?.closest<HTMLElement>(containerSelector)
  if (!el || !box) return
  const offset = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
  const target = block === 'start' ? offset - 8 : block === 'end' ? offset - box.clientHeight + el.offsetHeight : offset - box.clientHeight / 2
  box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
