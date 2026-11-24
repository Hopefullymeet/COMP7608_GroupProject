import type { PDFDocumentProxy } from 'pdfjs-dist'
import { createWorker, OEM } from 'tesseract.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import type { Rect } from '../api/reader'

export async function readImageText(pdf: PDFDocumentProxy, number: number, rect: Rect = [0, 0, 1, 1]) {
  const page = await pdf.getPage(number)
  const unit = page.getViewport({ scale: 1 })
  const scale = Math.min(3, 2400 / Math.max(unit.width * (rect[2]-rect[0]), unit.height * (rect[3]-rect[1])))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width * (rect[2]-rect[0])))
  canvas.height = Math.max(1, Math.ceil(viewport.height * (rect[3]-rect[1])))
  await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -rect[0]*viewport.width, -rect[1]*viewport.height] }).promise
  const worker = await createWorker(['eng', 'chi_sim'], OEM.LSTM_ONLY, {
    workerPath, corePath, langPath: new URL('/ocr/', window.location.href).href, cacheMethod: 'none',
  })
  try { return (await worker.recognize(canvas)).data.text.trim() }
  finally { await worker.terminate() }
}
