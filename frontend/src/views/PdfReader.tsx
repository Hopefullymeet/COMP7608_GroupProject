import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import { useRead, useWorkspace } from '../data/WorkspaceProvider'
import { useLanguage } from '../i18n'
import type { Mark, Point, Rect, Selection } from '../api/reader'

GlobalWorkerOptions.workerSrc = workerUrl

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

export default function PdfReader({ topic, version, page, target, onPage, onAsk, onFind, onWiki }: {
  topic: string; version: string; page: number; target?: Rect; onPage: (page: number, rect?: Rect) => void
  onAsk: (selection: Selection) => void; onFind: () => void; onWiki: () => void
}) {
  const { tr } = useLanguage()
  const workspace = useWorkspace()
  const scope = { topic_id: topic, source_version_id: version }
  const content = useRead('reader.pdf', scope)?.content
  const marks = useRead('reader.marks', scope)?.items ?? []
  const [document, setDocument] = useState<PDFDocumentProxy>()
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const fallback = useRead('source.page', { ...scope, page }, Boolean(error))
  const [tool, setTool] = useState<'select' | 'region' | 'ink'>('select')
  const [color, setColor] = useState<Mark['color']>('amber')
  const [selection, setSelection] = useState<Selection>()
  const [editor, edit] = useState<{ value: string; mark?: Mark }>()
  const [history, setHistory] = useState<{ undo: Mark[]; redo: Mark[] }>({ undo: [], redo: [] })
  const [drawing, setDrawing] = useState<Point[]>([])
  const frame = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const strokes = useRef<Point[]>([])
  const drawingPointer = useRef<number>()

  useEffect(() => {
    if (!frame.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    setDocument(undefined)
    if (!content) return
    let live = true
    const loading = getDocument({ data: Uint8Array.from(atob(content), (v) => v.charCodeAt(0)) })
    void loading.promise.then((pdf) => { if (live) setDocument(pdf) })
      .catch(() => { if (live) setError('The PDF could not be opened.') })
    return () => { live = false; void loading.destroy().catch(() => undefined) }
  }, [content])
  useEffect(() => {
    if (!document || !width || !canvas.current || !layer.current) return
    const raster = canvas.current
    const overlay = layer.current
    let active = true
    let cancelRaster: (() => void) | undefined
    let cancelText: (() => void) | undefined
    setReady(false)
    void document.getPage(page).then(async (pdfPage) => {
      if (!active) return
      const viewport = pdfPage.getViewport({ scale: width * zoom / pdfPage.getViewport({ scale: 1 }).width })
      setSize({ width: viewport.width, height: viewport.height })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      raster.width = Math.ceil(viewport.width * ratio)
      raster.height = Math.ceil(viewport.height * ratio)
      overlay.replaceChildren()
      overlay.style.setProperty('--total-scale-factor', String(viewport.scale))
      const rendering = pdfPage.render({ canvas: raster, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
      cancelRaster = () => rendering.cancel()
      const text = new TextLayer({ textContentSource: await pdfPage.getTextContent(), container: overlay, viewport })
      if (!active) return
      cancelText = () => text.cancel()
      await Promise.all([rendering.promise, text.render()])
      if (active) setReady(true)
    }).catch(() => { if (active) setError('This PDF page could not be rendered.') })
    return () => { active = false; cancelRaster?.(); cancelText?.() }
  }, [document, page, width, zoom])
  useEffect(() => { setSelection(undefined); edit(undefined); setError('') }, [page])
  useEffect(() => {
    if (ready && frame.current)
      frame.current.scrollTo({ top: target ? Math.max(0, target[1] * size.height - 24) : 0,
        left: target ? Math.max(0, target[0] * size.width - 24) : 0 })
  }, [page, ready, target, size])

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
    if (!ready || tool === 'select' || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingPointer.current = event.pointerId
    strokes.current = [position(event)]
    setDrawing(strokes.current)
    setSelection(undefined)
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
      if (points.length > 2) void save('ink', [], points, '', '')
      return
    }
    const rect = bounds(points[0], points[points.length - 1])
    if (rect[2] - rect[0] > .004 && rect[3] - rect[1] > .004) {
      setSelection({ page, rect, rects: [rect], quote: '', medium: 'image' })
      setTool('select')
    }
  }
  async function save(kind: Mark['kind'], rects: Rect[], points: Point[], quote: string, note: string, previous?: Mark) {
    try {
      const mark = await workspace.write('reader.mark_save', { ...scope, page: previous?.page ?? page, kind, rects, points, quote,
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

  return <div className="pt-reader">
    <div className="lib-tools" aria-label={tr('PDF tools')}>
      <button className="ghost-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>{tr('Previous page')}</button>
      <span>{tr('PDF page {0}', page)}{document && ' / ' + document.numPages}</span>
      <button className="ghost-btn" disabled={!document || page >= document.numPages} onClick={() => onPage(page + 1)}>{tr('Next page')}</button>
      <button className="link-btn" onClick={() => setZoom((z) => z > 1 ? 1 : 1.5)}>{zoom === 1 ? '150%' : '100%'}</button>
    </div>
    <div className="lib-tools">
      <button className="ghost-btn" aria-pressed={tool === 'region'} onClick={() => setTool(tool === 'region' ? 'select' : 'region')}>{tr('Select region')}</button>
      <button className="ghost-btn" aria-pressed={tool === 'ink'} onClick={() => setTool(tool === 'ink' ? 'select' : 'ink')}>{tr('Draw')}</button>
      <button className="link-btn" onClick={onFind}>{tr('Find a figure')}</button>
      <button className="link-btn" disabled={workspace.busy} onClick={() => void save('bookmark', [], [], '', '')}>{tr('Bookmark page')}</button>
    </div>
    {error && <p role="alert">{tr(error)}</p>}
    {fallback && <img className="evidence-pdf-page" alt={tr('Original PDF page {0}', page)}
      src={'data:image/png;base64,' + fallback.png} />}
    <div className="pt-reader-frame" ref={frame}>
      <div className={'pt-reader-page ' + (tool !== 'select' ? 'pt-reader-drawing' : '')} ref={surface}
        style={size} onPointerDown={start} onPointerMove={move}
        onPointerUp={(e) => { end(e); if (tool === 'select') window.requestAnimationFrame(captureText) }}
        onPointerCancel={() => { drawingPointer.current = undefined; strokes.current = []; setDrawing([]) }}
        onKeyUp={captureText}>
        <canvas ref={canvas} aria-label={tr('Original PDF page {0}', page)} role="img" />
        <div className="pt-reader-marks" aria-hidden="true">
          {ready && marks.filter((m) => m.page === page).flatMap((m) => m.rects.map((rect, i) =>
            <span key={m.mark_id + i} className={'pt-mark-' + m.kind} style={{ ...boxStyle(rect), color: colors[m.color] }} />))}
          {ready && target && <span className="pt-target" style={boxStyle(target)} />}
          {selection?.medium === 'image' && <span className="pt-target" style={boxStyle(selection.rect)} />}
          {tool === 'region' && drawing.length > 1 && <span className="pt-target" style={boxStyle(bounds(drawing[0], drawing[1]))} />}
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {ready && marks.filter((m) => m.page === page && m.kind === 'ink').map((m) =>
              <polyline key={m.mark_id} stroke={colors[m.color]} points={m.points.map(([x,y]) => `${x * 1000},${y * 1000}`).join(' ')} />)}
            {tool === 'ink' && <polyline stroke={colors[color]} points={drawing.map(([x,y]) => `${x * 1000},${y * 1000}`).join(' ')} />}
          </svg>
        </div>
        <div className="textLayer" ref={layer} tabIndex={0} aria-label={tr('Selectable PDF text')} />
      </div>
    </div>
    {selection && <div className="lib-tools pt-selection-actions" role="group" aria-label={tr('Selection actions')}>
      {selection.medium === 'text' && <>
        <button className="ghost-btn" disabled={workspace.busy} onClick={() => void save('highlight', selection.rects, [], selection.quote, '')}>{tr('Highlight')}</button>
        <button className="ghost-btn" disabled={workspace.busy} onClick={() => void save('underline', selection.rects, [], selection.quote, '')}>{tr('Underline')}</button>
        <button className="link-btn" onClick={() => void navigator.clipboard.writeText(selection.quote).catch(workspace.report)}>{tr('Copy')}</button>
      </>}
      <button className="ghost-btn" onClick={() => edit({ value: '' })}>{tr('Add annotation')}</button>
      <button className="primary" onClick={() => onAsk(selection)}>{tr('Ask AI')}</button>
      <select aria-label={tr('Annotation color')} value={color} onChange={(e) => setColor(e.target.value as Mark['color'])}>
        {Object.keys(colors).map((value) => <option key={value} value={value}>{tr(value)}</option>)}
      </select>
    </div>}
    {editor && <form className="pt-reader-note" onSubmit={(e) => {
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
      <button className="primary" disabled={workspace.busy || !editor.value.trim()}>{tr('Save annotation')}</button>
      <button type="button" className="link-btn" onClick={() => edit(undefined)}>{tr('Cancel')}</button>
    </form>}
    {marks.length > 0 && <details className="pt-annotation-list">
      <summary>{tr('Annotations')} ({marks.length})</summary>
      {marks.map((m) => <article key={m.mark_id} className="synthesis-claim">
        <button className="link-btn" onClick={() => onPage(m.page, m.rects.length ? union(m.rects) : undefined)}>{tr('PDF page {0}', m.page)}</button>
        <p>{m.note || m.quote || tr(m.kind)}</p>
        <button className="link-btn" onClick={() => edit({ value: m.note, mark: m })}>{tr('Edit')}</button>
        <button className="link-btn" disabled={workspace.busy} onClick={() => void remove(m)}>{tr('Delete')}</button>
        {m.rects.length > 0 && <button className="link-btn" onClick={() => onAsk({ page: m.page, rect: union(m.rects),
          rects: m.rects, quote: m.quote, medium: m.kind === 'region' ? 'image' : 'text' })}>{tr('Ask AI')}</button>}
        {m.rects.length > 0 && (m.note || m.quote) && <button className="link-btn" disabled={workspace.busy}
          onClick={() => void workspace.write('reader.mark_to_wiki', { ...scope, mark_id: m.mark_id }).then(onWiki).catch(workspace.report)}>
          {tr('Save annotation to Topic Wiki')}
        </button>}
      </article>)}
    </details>}
    <div className="lib-tools">
      <button className="link-btn" disabled={workspace.busy || !history.undo.length} onClick={() => void undo()}>{tr('Undo mark')}</button>
      <button className="link-btn" disabled={workspace.busy || !history.redo.length} onClick={() => void redo()}>{tr('Redo mark')}</button>
      <button className="link-btn" disabled={!marks.length} onClick={() => void exportCopy()}>{tr('Export annotated PDF')}</button>
    </div>
  </div>
}
