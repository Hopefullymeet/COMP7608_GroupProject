/** Match extracted PDF text across span boundaries, ligatures and line wrapping. */
export function quoteOffsets(text: string, quote: string) {
  if (!quote.trim()) return
  const exact = text.indexOf(quote)
  if (exact >= 0) return [exact, exact + quote.length] as const

  function normalize(value: string, offsets?: number[]) {
    let result = ''
    let offset = 0
    for (const ch of value) {
      const normalized = ch.normalize('NFKC').replace(/[\s\u00ad]/gu, '')
      for (let i = 0; i < normalized.length; i++) offsets?.push(offset)
      result += normalized
      offset += ch.length
    }
    return result
  }
  const offsets: number[] = []
  const needle = normalize(quote)
  const at = normalize(text, offsets).indexOf(needle)
  if (!needle || at < 0) return
  const last = offsets[at + needle.length - 1]
  return [offsets[at], last + (text.codePointAt(last)! > 0xffff ? 2 : 1)] as const
}

export function pdfQuoteRange(layer: HTMLElement, quote: string, passage?: string) {
  const walker = layer.ownerDocument.createTreeWalker(layer, 4 /* NodeFilter.SHOW_TEXT */)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  const text = nodes.map(node => node.data).join('')
  const context = passage && quoteOffsets(text, passage)
  const start = context ? context[0] : 0
  const match = quoteOffsets(context ? text.slice(...context) : text, quote)
  if (!match) return
  const [from, to] = [start + match[0], start + match[1]]
  const range = layer.ownerDocument.createRange()
  let offset = 0
  for (const node of nodes) {
    const end = offset + node.length
    if (from >= offset && from < end) range.setStart(node, from - offset)
    if (to > offset && to <= end) {
      range.setEnd(node, to - offset)
      return range
    }
    offset = end
  }
}
