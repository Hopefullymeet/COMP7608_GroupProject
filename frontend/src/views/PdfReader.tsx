import { bindPdfPinch } from './pdfPinch'
import { usePreferences } from '../data/preferences'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pdfQuoteRange } from '../components/quoteRange'
import { Icon } from '../components/Icon'
import { Dialog } from '../components/PageHead'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import type { ReadingPosition } from '../api/library'
import { useLanguage } from '../i18n'
import type { Mark, Point, Rect, Selection } from '../api/reader'

GlobalWorkerOptions.workerSrc = workerUrl

const minZoom = .5
const maxZoom = 2
const clampZoom = (scale: number) => Math.max(minZoom, Math.min(maxZoom, scale))

const colors: Record<Mark['color'], string> = { amber: '#f7bc39', rose: '#d45d86', blue: '#5987cd', green: '#4ba583' }

function bounds(a: Point, b: Point): Rect {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}

function union(rects: Rect[]): Rect {
  return [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))]
}

function boxStyle(rect: Rect) {
  return { left: rect[0] * 100 + '%', top: rect[1] * 100 + '%', width: (rect[2] - rect[0]) * 100 + '%',
    height: (rect[3] - rect[1]) * 100 + '%' }
}

function clamp(v: number) { return Math.min(1, Math.max(0, v)) }

type CitationTarget = { quote: string; passage?: string; anchor: string; onMissing: () => void }

type Tool = 'select' | 'region' | 'ink'

function PdfSheet({ document, scope, page, width, zoom, rasterZoom, aspectRatio, marks, target, citation, selection, tool,
  onMeasure, setSelection, onRegion, onInk }: {
  document: PDFDocumentProxy; scope: { topic_id: string; source_version_id: string; draft_id?: string }
  page: number; width: number; zoom: number; rasterZoom: number; aspectRatio: number; marks: Mark[]; target?: Rect; citation?: CitationTarget
  selection?: Selection; tool: Tool; onMeasure: (page: number, ratio: number) => void
  setSelection: (selection?: Selection) => void; onRegion: () => void; onInk: (page: number, points: Point[]) => void
}) {
  const { tr } = useLanguage()
  const color = 'amber'
  const [size, setSize] = useState<{ width: number; height: number }>()
  const [ready, setReady] = useState(false)
  const [rasterFailed, setRasterFailed] = useState(false)
  const [textFailed, setTextFailed] = useState(false)
  const sourceFallback = useRead('source.page', { ...scope, page }, Boolean(rasterFailed && !scope.draft_id))
  const draftFallback = useRead('draft.page', { topic_id: scope.topic_id, draft_id: scope.draft_id ?? '', version_id: scope.source_version_id, page }, Boolean(rasterFailed && scope.draft_id))
  const fallback = draftFallback ?? sourceFallback
  const [drawing, setDrawing] = useState<Point[]>([])
  const surface = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const strokes = useRef<Point[]>([])
  const drawingPointer = useRef<number>()

  useEffect(() => {
    const overlay = layer.current
    if (!width || !overlay) return
    let active = true
    let text: TextLayer | undefined
    setReady(false)
    setTextFailed(false)
    void document.getPage(page).then(async pdfPage => {
      if (!active) return
      const original = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: width / original.width })
      setSize({ width: viewport.width, height: viewport.height })
      onMeasure(page, original.width / original.height)
      const textContentSource = await pdfPage.getTextContent()
      if (!active) return
      overlay.replaceChildren()
      overlay.style.setProperty('--total-scale-factor', String(viewport.scale))
      text = new TextLayer({ textContentSource, container: overlay, viewport })
      await text.render()
      if (active) setReady(true)
    }).catch(() => { if (active) setTextFailed(true) })
    return () => { active = false; text?.cancel() }
  }, [document, page, width, onMeasure])

  useEffect(() => {
    const visible = canvas.current
    if (!width || !visible) return
    let active = true
    let cancel: (() => void) | undefined
    void document.getPage(page).then(async pdfPage => {
      if (!active) return
      const viewport = pdfPage.getViewport({ scale: width * rasterZoom / pdfPage.getViewport({ scale: 1 }).width })
      const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_194_304 / (viewport.width * viewport.height)))
      const buffer = visible.ownerDocument.createElement('canvas')
      buffer.width = Math.ceil(viewport.width * density)
      buffer.height = Math.ceil(viewport.height * density)
      try {
        const render = pdfPage.render({ canvas: buffer, viewport, transform: [density, 0, 0, density, 0, 0] })
        cancel = () => render.cancel()
        await render.promise
        if (!active) return
        const context = visible.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        visible.width = buffer.width
        visible.height = buffer.height
        context.drawImage(buffer, 0, 0)
        setRasterFailed(false)
      } finally {
        buffer.width = buffer.height = 0
      }
    }).catch(() => { if (active) setRasterFailed(true) })
    return () => { active = false; cancel?.() }
  }, [document, page, width, rasterZoom])
  const [citationBox, setCitationBox] = useState<Rect>()
  useLayoutEffect(() => {
    setCitationBox(undefined)
    if (!citation) return
    if (textFailed) { citation.onMissing(); return }
    if (!ready || !layer.current || !surface.current) return
    const range = pdfQuoteRange(layer.current, citation.quote, citation.passage)
    const bounds = range?.getBoundingClientRect()
    if (!range || !bounds?.width || !bounds.height) { citation.onMissing(); return }
    const box = surface.current.getBoundingClientRect()
    setCitationBox([(bounds.left - box.left) / box.width, (bounds.top - box.top) / box.height,
      (bounds.right - box.left) / box.width, (bounds.bottom - box.top) / box.height])
    const selected = window.getSelection()
    selected?.removeAllRanges()
    selected?.addRange(range)
    return () => {
      if (selected?.rangeCount && selected.getRangeAt(0) === range) selected.removeAllRanges()
    }
  }, [ready, textFailed, citation])
  function position(event: ReactPointerEvent): Point {
    const box = surface.current!.getBoundingClientRect()
    return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)]
  }
  function captureText() {
    if (tool !== 'select' || !surface.current || !layer.current) return
    const selected = window.getSelection()
    if (!selected || selected.isCollapsed || !selected.rangeCount) return
    const range = selected.getRangeAt(0)
    if (!layer.current.contains(range.startContainer) || !layer.current.contains(range.endContainer)) return
    const box = surface.current.getBoundingClientRect()
    const rects: Rect[] = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => [clamp((r.left - box.left) / box.width), clamp((r.top - box.top) / box.height),
        clamp((r.right - box.left) / box.width), clamp((r.bottom - box.top) / box.height)])
      .filter((r) => r[2] > r[0] && r[3] > r[1]) as Rect[]
    const quote = selected.toString().trim().slice(0, 3500)
    if (rects.length && rects.length <= 150 && quote) setSelection({ page, rect: union(rects), rects, quote, medium: 'text' })
  }
  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (!ready || event.button !== 0) return
    setSelection(undefined)
    if (tool === 'select') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingPointer.current = event.pointerId
    strokes.current = [position(event)]
    setDrawing(strokes.current)
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drawingPointer.current) return
    const next = position(event)
    strokes.current = tool === 'region' ? [strokes.current[0], next] : [...strokes.current.slice(0, 1199), next]
    setDrawing(strokes.current)
  }
  function end(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drawingPointer.current) return
    const points = [...strokes.current.slice(0, 1199), position(event)]
    drawingPointer.current = undefined
    strokes.current = []
    setDrawing([])
    if (tool === 'ink') {
      if (points.length > 2) onInk(page, points)
      return
    }
    const rect = bounds(points[0], points[points.length - 1])
    if (rect[2] - rect[0] > .004 && rect[3] - rect[1] > .004) {
      setSelection({ page, rect, rects: [rect], quote: '', medium: 'image' })
      onRegion()
    }
  }
  return (
      <div className={'pt-reader-page ' + (tool !== 'select' ? 'pt-reader-drawing' : '')} ref={surface}
        style={{ ...(size ?? { width, aspectRatio }), transformOrigin: 'top left', transform: `scale(${zoom})` }} onPointerDown={start} onPointerMove={move}
        onPointerUp={(e) => { end(e); if (tool === 'select') window.requestAnimationFrame(captureText) }}
        onPointerCancel={() => { drawingPointer.current = undefined; strokes.current = []; setDrawing([]) }}
        onKeyUp={captureText}>
        {rasterFailed && !fallback && <p className="pt-pdf-loading" role="status">{tr('This PDF page could not be rendered.')}</p>}
        {fallback && <img className="evidence-pdf-page" alt={tr('Original PDF page {0}', page)}
          src={'data:image/png;base64,' + fallback.png} />}
        <canvas hidden={Boolean(fallback)} ref={canvas} aria-label={tr('Original PDF page {0}', page)} role="img" />
        <div className="pt-reader-marks" aria-hidden="true">
          {ready && marks.flatMap((m) => m.rects.map((rect, i) =>
            <span key={m.mark_id + i} className={'pt-mark-' + m.kind} style={{ ...boxStyle(rect), color: colors[m.color] }} />))}
          {citation && citationBox && <span data-ev-anchor={citation.anchor} style={boxStyle(citationBox)} />}
          {ready && !citation && target && <span className="pt-target" style={boxStyle(target)} />}
          {selection?.medium === 'image' && <span className="pt-target" style={boxStyle(selection.rect)} />}
          {tool === 'region' && drawing.length > 1 && <span className="pt-target" style={boxStyle(bounds(drawing[0], drawing[1]))} />}
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {ready && marks.filter((m) => m.kind === 'ink').map((m) =>
              <polyline key={m.mark_id} stroke={colors[m.color]} points={m.points.map(([x,y]) => `${x * 1000},${y * 1000}`).join(' ')} />)}
            {tool === 'ink' && <polyline stroke={colors[color]} points={drawing.map(([x,y]) => `${x * 1000},${y * 1000}`).join(' ')} />}
          </svg>
        </div>
        <div className="textLayer" ref={layer} tabIndex={0} aria-label={tr('Selectable PDF text')} />
      </div>
  )
}

type PageLink = { title: string; page: number; depth: number }
type FindHit = { page: number; text: string; rect?: Rect }

async function readOutline(pdf: PDFDocumentProxy) {
  const result: PageLink[] = []
  type Outline = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>
  async function visit(items: Outline, depth: number) {
    for (const item of items) {
      if (result.length >= 300) return
      try {
        const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
        if (destination?.length) {
          const first = destination[0]
          const page = (typeof first === 'number' ? first : await pdf.getPageIndex(first)) + 1
          if (page < 1 || page > pdf.numPages) continue
          result.push({ title: item.title, page, depth })
        }
      } catch { /* This entry has no internal destination. */ }
      await visit(item.items, depth + 1)
    }
  }
  await visit(await pdf.getOutline() ?? [], 0)
  return result
}

export default function PdfReader({ topic, version, page, target, citation, onAsk, onFind, onWiki, onPaperInfo, session, resume, draft, pageOverlay, onPage }: {
  topic: string; version: string; page?: number; target?: Rect; citation?: CitationTarget
  draft?: string; pageOverlay?: (page: number) => React.ReactNode; onPage?: (page: number) => void
  session?: string; resume?: boolean
  onAsk?: (selection: Selection) => void; onFind?: () => void; onWiki?: () => void; onPaperInfo?: (mode: 'scan' | 'analysis') => void
}) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const scope = { topic_id: topic, source_version_id: version, ...(draft && { draft_id: draft }) }
  const { api } = workspace
  const marks = useRead('reader.marks', scope)?.items ?? []
  const [document, setDocument] = useState<PDFDocumentProxy>()
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rasterZoom, setRasterZoom] = useState(1)
  useEffect(() => {
    const timer = window.setTimeout(() => setRasterZoom(zoom), 200)
    return () => window.clearTimeout(timer)
  }, [zoom])
  const [aspectRatio, setAspectRatio] = useState(0)
  const [ratios, setRatios] = useState<Record<number, number>>({})
  const [ocrText, setOcrText] = useState<string>()
  const [ocrBusy, setOcrBusy] = useState(false)
  const ocrRun = useRef(0)
  useEffect(() => {
    setOcrText(undefined)
    setOcrBusy(false)
    return () => { ocrRun.current++ }
  }, [version])
  async function recognize(page: number, rect?: Rect) {
    if (!document || ocrBusy) return
    const run = ++ocrRun.current
    setOcrBusy(true)
    setOcrText(tr('Reading image text…'))
    try {
      const {readImageText} = await import('./paperOcr')
      const result = await readImageText(document, page, rect)
      if (run === ocrRun.current) setOcrText(result || tr('No text recognized'))
    } catch { if (run === ocrRun.current) setOcrText(tr('Image recognition failed')) }
    finally { if (run === ocrRun.current) setOcrBusy(false) }
  }
  const [current, setCurrent] = useState(page ?? 1)
  useEffect(() => { onPage?.(current) }, [current, onPage])
  const [renderRange, setRenderRange] = useState([1, 3])
  const [jumpValue, setJumpValue] = useState<string>()
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [highlight, setHighlight] = useState<{ page: number; rect: Rect }>()
  const [error, setError] = useState('')
  const [outline, setOutline] = useState<PageLink[]>()
  const [outlineOpen, showOutline] = useState(false)
  const [findOpen, showFind] = useState(false)
  const [term, setTerm] = useState('')
  const [matches, setMatches] = useState<FindHit[]>()
  const [match, setMatch] = useState(0)
  const findInput = useRef<HTMLInputElement>(null)
  const textCache = useRef(new Map<number, FindHit[]>())
  const bookmark = useRef<{ page: number; zoom: number; offset: number }>()
  const bookmarkTimer = useRef<ReturnType<typeof setTimeout>>()
  const restoringPosition = useRef(false)
  const [restored, setRestored] = useState(false)
  const [savedPosition, setSavedPosition] = useState<ReadingPosition>()
  useEffect(() => {
    if (!session || !resume || restored) return
    let live = true
    void api.call('reader.position', { topic_id: topic, source_version_id: version, session_id: session })
      .then((value) => { if (live) setSavedPosition(value) })
      .catch(() => { if (live) setSavedPosition({}) })
    return () => { live = false }
  }, [api, topic, version, session, resume, restored])
  const initialJump = useRef<{ page?: number; target?: Rect; citation?: CitationTarget }>()
  const more = useRef<HTMLDetailsElement>(null)
  const pageList = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const color: Mark['color'] = 'amber'
  const [selection, setSelection] = useState<Selection>()
  const popup = useRef<HTMLDivElement>(null)
  const [editor, edit] = useState<{ value: string; mark?: Mark }>()
  const [history, setHistory] = useState<{ undo: Mark[]; redo: Mark[] }>({ undo: [], redo: [] })
  const frame = useRef<HTMLDivElement>(null)
  const resizeAnchor = useRef<{ page: number; offset: number }>()

  useEffect(() => {
    const scroller = frame.current
    if (!scroller) return
    let previousWidth = 0
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width
      if (!nextWidth || nextWidth === previousWidth) return
      const top = scroller.scrollTop
      const page = pageAt(top)
      const sheet = pageElement(page)
      resizeAnchor.current = top > 0 && sheet?.offsetHeight
        ? { page, offset: (top - sheet.offsetTop) / sheet.offsetHeight }
        : undefined
      previousWidth = nextWidth
      setWidth(nextWidth)
    })
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let live = true
    let loading: ReturnType<typeof getDocument> | undefined
    void api.call('reader.pdf', { topic_id: topic, source_version_id: version, ...(draft && { draft_id: draft }) }).then(async ({ content }) => {
      if (!live) return
      loading = getDocument({ data: Uint8Array.from(atob(content), (v) => v.charCodeAt(0)) })
      const pdf = await loading.promise
      if (!live) return
      const first = await pdf.getPage(1)
      const viewport = first.getViewport({ scale: 1 })
      if (live) {
        setAspectRatio(viewport.width / viewport.height)
        setDocument(pdf)
      }
    }).catch(() => { if (live) setError('The PDF could not be opened.') })
    return () => { live = false; void loading?.destroy().catch(() => undefined) }
  }, [api, topic, version, draft])
  useEffect(() => {
    if (error && citation) citation.onMissing()
  }, [error, citation])
  const measure = useCallback((number: number, ratio: number) => {
    setRatios((previous) => previous[number] === ratio ? previous : { ...previous, [number]: ratio })
  }, [])

  function pageElement(number: number) { return pageList.current?.children.item(number - 1) as HTMLElement | undefined }

  function pageAt(position: number) {
    let first = 1
    let last = pageList.current?.children.length ?? 0
    while (first < last) {
      const middle = Math.floor((first + last + 1) / 2)
      if (pageElement(middle)!.offsetTop <= position) first = middle
      else last = middle - 1
    }
    return first
  }

  const windowFrame = useRef(0)
  useEffect(() => () => {
    cancelAnimationFrame(windowFrame.current)
    windowFrame.current = 0
  }, [])
  function syncPageWindow(scroller: HTMLDivElement) {
    if (!document || windowFrame.current) return
    // Resize, zoom and scroll can all invalidate the same layout in a single frame.
    windowFrame.current = requestAnimationFrame(() => {
      windowFrame.current = 0
      updatePageWindow(scroller)
    })
  }

  function updatePageWindow(scroller: HTMLDivElement) {
    if (!document || !pageList.current) return
    const top = scroller.scrollTop
    const total = pageList.current.children.length
    if (!total) return
    setCurrent(pageAt(top + Math.min(120, scroller.clientHeight * .25)))
    const range = [Math.max(1, pageAt(top) - 1), Math.min(total, pageAt(top + scroller.clientHeight) + 1)]
    setRenderRange((old) => old[0] === range[0] && old[1] === range[1] ? old : range)
  }

  function jump(number: number, rect?: Rect, offset = 0) {
    const scroller = frame.current
    const sheet = pageElement(number)
    if (!scroller || !sheet) return
    const top = sheet.offsetTop + (rect ? Math.max(0, rect[1] * sheet.offsetHeight - 24) : offset * sheet.offsetHeight)
    scroller.scrollTo({ top, left: rect ? Math.max(0, rect[0] * sheet.offsetWidth - 16) : 0 })
    setSelection(undefined)
    setHighlight(rect ? { page: number, rect } : undefined)
    syncPageWindow(scroller)
  }

  useLayoutEffect(() => {
    if (!document || !width || !frame.current) return
    const anchor = resizeAnchor.current
    resizeAnchor.current = undefined
    if (page !== undefined && (initialJump.current?.page !== page || initialJump.current?.target !== target || initialJump.current?.citation !== citation)) {
      initialJump.current = { page, target, citation }
      jump(Math.max(1, Math.min(document.numPages, page)), target)
      if (session) setRestored(true)
      return
    }
    if (page === undefined && initialJump.current?.page !== undefined) {
      initialJump.current = undefined
      setHighlight(undefined)
    }
    if (session && resume && !restored) {
      if (!savedPosition) return
      if (savedPosition.page) {
        restoringPosition.current = true
        const restore = { page, target }
        initialJump.current = restore
        setZoom(clampZoom(savedPosition.zoom ?? 1))
        requestAnimationFrame(() => {
          if (initialJump.current === restore) jump(Math.min(document.numPages, savedPosition.page!), undefined, savedPosition.offset)
          requestAnimationFrame(() => { restoringPosition.current = false })
        })
      }
      setRestored(true)
      return
    }
    if (anchor) {
      const sheet = pageElement(anchor.page)
      if (sheet) frame.current.scrollTop = sheet.offsetTop + anchor.offset * sheet.offsetHeight
    }
    syncPageWindow(frame.current)
  }, [document, page, target, citation, width, session, resume, restored, savedPosition])

  useLayoutEffect(() => {
    if (frame.current) syncPageWindow(frame.current)
  }, [zoom, ratios])

  const saveBookmark = useCallback(() => {
    if (!session || !bookmark.current) return
    const position = bookmark.current
    bookmark.current = undefined
    void api.call('reader.bookmark', { topic_id: topic, source_version_id: version, session_id: session,
      operation_id: crypto.randomUUID(), ...position }).catch(workspace.report)
  }, [api, topic, version, session, workspace.report])
  useEffect(() => () => { clearTimeout(bookmarkTimer.current); saveBookmark() }, [saveBookmark])

  function queueBookmark(scroller: HTMLDivElement, scale = zoom) {
    if (!session || !resume || !restored || restoringPosition.current || !pageList.current) return
    const top = scroller.scrollTop
    let page = current
    while (page > 1 && (pageElement(page)?.offsetTop ?? 0) > top) page--
    while (page < pageList.current.children.length && (pageElement(page + 1)?.offsetTop ?? Infinity) <= top) page++
    const sheet = pageElement(page)
    if (!sheet) return
    bookmark.current = { page, zoom: scale, offset: Math.max(0, Math.min(1,
      (top - sheet.offsetTop) / Math.max(1, sheet.offsetHeight))) }
    clearTimeout(bookmarkTimer.current)
    bookmarkTimer.current = setTimeout(saveBookmark, 450)
  }

  const {findKey} = usePreferences()
  function openFind() {
    showFind(true)
    requestAnimationFrame(() => findInput.current?.focus())
  }

  useEffect(() => {
    if (!document) return
    function findShortcut(e: KeyboardEvent) {
      if (frame.current?.closest('[hidden]')) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === findKey &&
          (frame.current?.parentElement?.contains(window.document.activeElement) || window.document.activeElement === window.document.body)) {
        e.preventDefault()
        openFind()
      }
    }
    window.addEventListener('keydown', findShortcut)
    return () => window.removeEventListener('keydown', findShortcut)
  }, [document,findKey])

  useEffect(() => {
    if (!document || !findOpen || !term.trim()) { setMatches(undefined); return }
    let live = true
    setMatches(undefined)
    const needle = term.trim().normalize('NFKC').toLocaleLowerCase()
    const scan = async () => {
      const found: FindHit[] = []
      const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase()
      for (let page = 1; live && page <= document.numPages; page++) {
        if (!textCache.current.has(page)) {
          const sheet = await document.getPage(page)
          const viewport = sheet.getViewport({ scale: 1 })
          const content = await sheet.getTextContent()
          textCache.current.set(page, content.items.flatMap((item) => {
            if (!('str' in item) || !item.str.trim()) return []
            const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
            const clamp = (value: number) => Math.max(0, Math.min(1, value))
            const rect: Rect = [clamp(x / viewport.width), clamp((y - item.height) / viewport.height),
              clamp((x + item.width) / viewport.width), clamp((y + 2) / viewport.height)]
            return [{ page, text: item.str, rect }]
          }))
        }
        const items = textCache.current.get(page) ?? []
        const local = items.filter((item) => normalize(item.text).includes(needle))
        if (local.length) found.push(...local)
        else if (normalize(items.map((item) => item.text).join(' ')).includes(needle)) {
          found.push({ page, text: term.trim() })
        }
      }
      if (live) { setMatches(found); setMatch(0); if (found[0]) jump(found[0].page, found[0].rect) }
    }
    const timer = setTimeout(() => void scan().catch(() => { if (live) setMatches([]) }), 250)
    return () => { live = false; clearTimeout(timer) }
  }, [document, findOpen, term])

  useLayoutEffect(() => {
    const menu = popup.current
    const paper = selection ? pageElement(selection.page) : undefined
    const scroller = frame.current
    if (!selection || !menu || !paper || !scroller) return
    function place() {
      if (!menu || !paper || !scroller || !selection) return
      const box = paper.getBoundingClientRect()
      const visible = scroller.getBoundingClientRect()
      const top = box.top + selection.rect[1] * box.height
      const bottom = box.top + selection.rect[3] * box.height
      const center = box.left + (selection.rect[0] + selection.rect[2]) * box.width / 2
      const menuTop = top - menu.offsetHeight - 8
      menu.hidden = bottom < visible.top || top > visible.bottom
      menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, center - menu.offsetWidth / 2)) + 'px'
      menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8,
        menuTop >= Math.max(visible.top, 8) ? menuTop : bottom + 8)) + 'px'
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [selection, editor, width, zoom, ratios, tr])

  useEffect(() => {
    if (!selection) return
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape' && !editor) {
        setSelection(undefined)
        window.getSelection()?.removeAllRanges()
        pageElement(selection!.page)?.querySelector<HTMLElement>('.textLayer')?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [selection, editor])

  async function save(kind: Mark['kind'], rects: Rect[], points: Point[], quote: string, note: string, previous?: Mark, markPage = selection?.page ?? current) {
    try {
      const mark = await workspace.write('reader.mark_save', { ...scope, page: previous?.page ?? markPage, kind, rects, points, quote,
        note, color: previous?.color ?? color, ...(previous && { mark_id: previous.mark_id, base_revision: previous.revision }) })
      if (!previous) setHistory((old) => ({ undo: [...old.undo, mark], redo: [] }))
      else setHistory((old) => ({ undo: old.undo.map((item) => item.mark_id === mark.mark_id ? mark : item), redo: [] }))
      setSelection(undefined)
      edit(undefined)
      window.getSelection()?.removeAllRanges()
    } catch (problem) { workspace.report(problem) }
  }
  async function remove(mark: Mark) {
    try {
      await workspace.write('reader.mark_delete', { ...scope, mark_id: mark.mark_id, base_revision: mark.revision })
      setHistory((old) => ({ undo: old.undo.filter((m) => m.mark_id !== mark.mark_id), redo: [] }))
      edit(undefined)
    } catch (problem) { workspace.report(problem) }
  }
  async function undo() {
    const mark = history.undo.at(-1)
    if (!mark) return
    try {
      await workspace.write('reader.mark_delete', { ...scope, mark_id: mark.mark_id, base_revision: mark.revision })
      setHistory((old) => ({ undo: old.undo.slice(0, -1), redo: [...old.redo, mark] }))
    } catch (problem) { workspace.report(problem) }
  }
  async function redo() {
    const mark = history.redo.at(-1)
    if (!mark) return
    try {
      const { mark_id, revision, ...values } = mark
      const saved = await workspace.write('reader.mark_save', { ...scope, ...values })
      setHistory((old) => ({ undo: [...old.undo, saved], redo: old.redo.slice(0, -1) }))
    } catch (problem) { workspace.report(problem) }
  }
  async function exportCopy() {
    try {
      const copy = await workspace.api.call('reader.export', scope)
      const bytes = Uint8Array.from(atob(copy.content), (v) => v.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const link = window.document.createElement('a')
      link.href = url
      link.download = copy.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (problem) { workspace.report(problem) }
  }

  const requestedZoom = useRef(zoom)
  const anchor = useRef<{ sheet: HTMLElement; x: number; y: number; clientX: number; clientY: number }>()
  function adjustZoom(value: number, clientX?: number, clientY?: number) {
    const scroller = frame.current
    const next = clampZoom(value)
    if (!scroller || !Number.isFinite(next) || requestedZoom.current === next) return
    const bounds = scroller.getBoundingClientRect()
    const x = clientX ?? bounds.left + scroller.clientWidth / 2
    const y = clientY ?? bounds.top + scroller.clientHeight / 2
    const first = pageElement(1)
    if (!first) return
    const position = y - first.getBoundingClientRect().top + first.offsetTop
    const sheet = pageElement(pageAt(position))
    if (!sheet) return
    const box = sheet.getBoundingClientRect()
    if (!box.width || !box.height) return
    anchor.current = { sheet, x: (x - box.left) / box.width, y: (y - box.top) / box.height, clientX: x, clientY: y }
    requestedZoom.current = next
    setZoom(next)
  }
  useLayoutEffect(() => {
    requestedZoom.current = zoom
    const point = anchor.current
    anchor.current = undefined
    if (!point || !frame.current) return
    const box = point.sheet.getBoundingClientRect()
    frame.current.scrollBy(box.left + point.x * box.width - point.clientX, box.top + point.y * box.height - point.clientY)
    queueBookmark(frame.current, zoom)
  }, [zoom])
  useEffect(() => {
    if (!frame.current || !document) return
    return bindPdfPinch(frame.current, (factor, x, y) => adjustZoom(requestedZoom.current * factor, x, y))
  }, [document])

  const pageInset = 12
  return <div className="pt-reader">
    <div className="pt-reader-frame" ref={frame} tabIndex={0} aria-label={tr('PDF document')}
      onPointerDown={() => { if (more.current) more.current.open = false }}
      onScroll={(event) => { syncPageWindow(event.currentTarget); queueBookmark(event.currentTarget) }}>
      {error && <p role="alert" className="pt-pdf-loading">{tr(error)}</p>}
      {!document && !error && <p className="pt-pdf-loading" role="status">{tr('Opening PDF…')}</p>}
      <div className="pt-reader-pages" ref={pageList} style={{ paddingInline: pageInset }}>
        {document && width > 0 && Array.from({ length: document.numPages }, (_, index) => {
          const number = index + 1
          const ratio = ratios[number] ?? aspectRatio
          const baseWidth = Math.max(1, width - 2 * pageInset)
          const pageWidth = baseWidth * zoom
          return <div className="pt-pdf-sheet" key={number} style={{ width: pageWidth, height: ratio > 0 ? pageWidth / ratio : undefined }}>
            {(number >= renderRange[0] && number <= renderRange[1]) &&
              <PdfSheet document={document} scope={scope} page={number} width={baseWidth} zoom={zoom} rasterZoom={rasterZoom} aspectRatio={ratio}
                citation={page === number ? citation : undefined} marks={marks.filter((mark) => mark.page === number)} target={highlight?.page === number ? highlight.rect : undefined}
                selection={selection?.page === number ? selection : undefined} tool={tool} onMeasure={measure}
                setSelection={setSelection} onRegion={() => setTool('select')}
                onInk={(number, points) => void save('ink', [], points, '', '', undefined, number)} />}
            {tool === 'select' && number >= renderRange[0] && number <= renderRange[1] && pageOverlay?.(number)}
          </div>
        })}
      </div>
    </div>
    <div className="pt-pdf-rail" aria-label={tr('PDF tools')}>
      <div className="pt-pdf-cluster">
        <button className="pt-round" disabled={!document || zoom >= maxZoom} title={tr('Zoom in')}
          aria-label={tr('Zoom in')} onClick={() => adjustZoom(zoom + .25)}><Icon name="zoomIn" size={17} /></button>
        <button className="pt-round" disabled={!document || zoom <= minZoom} title={tr('Zoom out')}
          aria-label={tr('Zoom out')} onClick={() => adjustZoom(zoom - .25)}><Icon name="zoomOut" size={17} /></button>
      </div>
      {tool !== 'select' && <button className="pt-round" onClick={() => setTool('select')}
        title={tr(tool === 'region' ? 'Cancel region selection' : 'Finish drawing')}
        aria-label={tr(tool === 'region' ? 'Cancel region selection' : 'Finish drawing')}><Icon name="x" size={17} /></button>}
      <details ref={more} className="pt-pdf-options" onKeyDown={(e) => {
        if (e.key === 'Escape' && e.currentTarget.open) { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); e.stopPropagation() }
      }}>
        <summary className="pt-round" title={tr('Paper actions')} aria-label={tr('Paper actions')}><Icon name="more" size={18} /></summary>
        <div className="pt-pdf-menu" onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) e.currentTarget.closest('details')!.open = false
        }}>
          {onPaperInfo && <>
            <button onClick={() => onPaperInfo('scan')}>{tr('Paper details')}</button>
            <button onClick={() => onPaperInfo('analysis')}>{tr('Paper references')}</button>
          </>}
          <button disabled={!document || ocrBusy} onClick={() => void recognize(current)}>{tr('Read page text (OCR)')}</button>
          {onFind && <button onClick={onFind}>{tr('Find a figure')}</button>}
          <button disabled={!document} onClick={openFind}>{tr('Find in PDF')}</button>
          <button disabled={!document} onClick={() => {
            showOutline(true)
            if (!outline && document) void readOutline(document).then(setOutline).catch(() => setOutline([]))
          }}>{tr('PDF outline')}</button>
          <button onClick={() => setTool('region')}>{tr('Select region')}</button>
          <button onClick={() => setTool('ink')}>{tr('Draw')}</button>
          <button disabled={!marks.length} onClick={() => setAnnotationsOpen(true)}>{tr('Annotations')}</button>
          <button disabled={workspace.busy} onClick={() => void save('bookmark', [], [], '', '', undefined, current)}>{tr('Bookmark page')}</button>
          <button disabled={workspace.busy || !history.undo.length} onClick={() => void undo()}>{tr('Undo mark')}</button>
          <button disabled={workspace.busy || !history.redo.length} onClick={() => void redo()}>{tr('Redo mark')}</button>
          <button disabled={!marks.length} onClick={() => void exportCopy()}>{tr('Export annotated PDF')}</button>
        </div>
      </details>
      {document && <div className="pt-pdf-cluster pt-page-controls">
        <button className="pt-round" disabled={current <= 1} onClick={() => jump(current - 1)}
          aria-label={tr('Previous page')} title={tr('Previous page')}><Icon name="arrowUp" size={15} /></button>
        <button className="pt-round pt-page-count" aria-haspopup="dialog"
          title={tr('PDF page {0}', current)} aria-label={tr('PDF page {0}', current)}
          onClick={() => setJumpValue(String(current))}>{current}<small>/ {document.numPages}</small></button>
        <button className="pt-round" disabled={current >= document.numPages} onClick={() => jump(current + 1)}
          aria-label={tr('Next page')} title={tr('Next page')}><Icon name="arrowDown" size={15} /></button>
      </div>}

    </div>
    {findOpen && <div className="pt-pdf-find" role="search" onKeyDown={(event) => {
      if (event.key === 'Escape') { showFind(false); setHighlight(undefined); frame.current?.focus() }
      if (event.key === 'Enter' && event.target === findInput.current && matches?.length) {
        event.preventDefault()
        const index = (match + (event.shiftKey ? -1 : 1) + matches.length) % matches.length
        setMatch(index); jump(matches[index].page, matches[index].rect)
      }
    }}>
      <input ref={findInput} className="text-field" aria-label={tr('Find in PDF')} placeholder={tr('Find in PDF')}
        value={term} onChange={(e) => setTerm(e.currentTarget.value)} />
      <small role="status">{!term.trim() ? '' : !matches ? tr('Searching…') : matches.length ? `${match + 1} / ${matches.length}` : tr('No matching text')}</small>
      {[-1, 1].map((delta) => <button key={delta} className="link-btn" disabled={!matches?.length}
        aria-label={tr(delta < 0 ? 'Previous match' : 'Next match')} onClick={() => {
          if (!matches?.length) return
          const index = (match + delta + matches.length) % matches.length
          setMatch(index); jump(matches[index].page, matches[index].rect)
        }}>{delta < 0 ? '↑' : '↓'}</button>)}
      <button className="link-btn" onClick={() => { showFind(false); setHighlight(undefined) }} aria-label={tr('Close')}>×</button>
    </div>}
    {outlineOpen && <Dialog title={tr('PDF outline')} onClose={() => showOutline(false)}>
      {outline?.length ? outline.map((section, i) => <button className="link-btn pt-outline-link" key={i}
        style={{ paddingInlineStart: Math.min(5, section.depth) * 14 }}
        onClick={() => { jump(section.page); showOutline(false) }}>{section.title} · {section.page}</button>)
        : <p>{tr(outline ? 'This PDF has no embedded outline.' : 'Loading…')}</p>}
    </Dialog>}
    {document && jumpValue !== undefined && <Dialog title={tr('Go to page')} onClose={() => setJumpValue(undefined)}>
      <form onSubmit={(e) => { e.preventDefault(); jump(Number(jumpValue)); setJumpValue(undefined) }}>
        <label className="rename-field">{tr('Page number')}
          <input type="number" min={1} max={document.numPages} required autoFocus
            value={jumpValue} onChange={(e) => setJumpValue(e.currentTarget.value)} />
        </label>
        <div className="dialog-actions"><button className="primary">{tr('Go to page')}</button></div>
      </form>
    </Dialog>}
    {selection && !editor && createPortal(
      <div ref={popup} className="pt-selection-actions" role="group" aria-label={tr('Selection actions')}>
        {selection.medium === 'text' && <>
          <button disabled={workspace.busy} onClick={() => void save('highlight', selection.rects, [], selection.quote, '')}>{tr('Highlight')}</button>
          <button disabled={workspace.busy} onClick={() => void save('underline', selection.rects, [], selection.quote, '')}>{tr('Underline')}</button>
        </>}
        {selection.medium === 'image' && <button disabled={ocrBusy} onClick={() => void recognize(selection.page, selection.rect)}>OCR</button>}
        <button onClick={() => edit({ value: '' })}>{tr('Add annotation')}</button>
        {onAsk && <button onClick={() => { onAsk(selection); setSelection(undefined); window.getSelection()?.removeAllRanges() }}>{tr('Ask AI')}</button>}
      </div>, window.document.body)}
    {ocrText !== undefined && <Dialog title="OCR" onClose={() => { ocrRun.current++; setOcrText(undefined); setOcrBusy(false) }}>
      <div style={{whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto'}}>{ocrText}</div>
    </Dialog>}
    {editor && <Dialog title={tr('Annotation')} onClose={() => edit(undefined)}>
      <form className="pt-reader-note" onSubmit={(e) => {
        e.preventDefault()
        if (editor.mark) {
          const m = editor.mark
          void save(m.kind, m.rects, m.points, m.quote, editor.value, m)
        } else if (selection) {
          void save(selection.medium === 'text' ? 'note' : 'region', selection.rects, [], selection.quote, editor.value)
        }
      }}>
        <textarea aria-label={tr('Annotation')} value={editor.value} maxLength={5000} autoFocus
          onChange={(e) => edit({ ...editor, value: e.target.value })} />
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" onClick={() => edit(undefined)}>{tr('Cancel')}</button>
          <button className="primary" disabled={workspace.busy || !editor.value.trim()}>{tr('Save annotation')}</button>
        </div>
      </form>
    </Dialog>}
    {annotationsOpen && <Dialog title={tr('Annotations')} onClose={() => setAnnotationsOpen(false)}>
      {marks.map((m) => <article key={m.mark_id} className="synthesis-claim">
        <button className="link-btn" onClick={() => { jump(m.page, m.rects.length ? union(m.rects) : undefined); setAnnotationsOpen(false) }}>{tr('PDF page {0}', m.page)}</button>
        <p>{m.note || m.quote || tr(m.kind)}</p>
        <button className="link-btn" onClick={() => { setAnnotationsOpen(false); edit({ value: m.note, mark: m }) }}>{tr('Edit')}</button>
        <button className="link-btn" disabled={workspace.busy} onClick={() => void remove(m)}>{tr('Delete')}</button>
        {onAsk && m.rects.length > 0 && <button className="link-btn" onClick={() => { setAnnotationsOpen(false); onAsk({ page: m.page, rect: union(m.rects),
          rects: m.rects, quote: m.quote, medium: m.kind === 'region' ? 'image' : 'text' }) }}>{tr('Ask AI')}</button>}
        {onWiki && m.rects.length > 0 && (m.note || m.quote) && <button className="link-btn" disabled={workspace.busy}
          onClick={() => void workspace.write('reader.mark_to_wiki', { ...scope, mark_id: m.mark_id }).then(onWiki).catch(workspace.report)}>
          {tr('Save annotation to the Wiki')}
        </button>}
      </article>)}
    </Dialog>}
  </div>
}
