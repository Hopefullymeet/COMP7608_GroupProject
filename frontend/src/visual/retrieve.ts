import { createStore, get, set } from 'idb-keyval'
import type { Client } from '../api/contract'
import type { PdfObject } from '../api/reader'

const cache = createStore('papertrace-figure-clip-v1', 'vectors')
let encoder: Worker | undefined
let nextId = 0
let queue: Promise<unknown> = Promise.resolve()
function encode(input: { text?: string; pixels?: Float32Array }): Promise<Float32Array> {
  const run = queue.then(() => new Promise<Float32Array>((resolve, reject) => {
    encoder ??= new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' })
    const id = ++nextId
    encoder.onmessage = ({ data }) => {
      if (data.id === id) data.error ? reject(new Error(data.error)) : resolve(data.vector)
    }
    encoder.onerror = error => { encoder?.terminate(); encoder = undefined; reject(new Error(error.message)) }
    encoder.postMessage({ id, ...input }, input.pixels ? [input.pixels.buffer] : [])
  }))
  queue = run.catch(() => {})
  return run
}
async function pixels(image: string) {
  const img = new Image()
  img.src = 'data:image/png;base64,' + image
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 224
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, 224, 224)
  const rgb = ctx.getImageData(0, 0, 224, 224).data
  const plane = 224 * 224
  const result = new Float32Array(3 * plane)
  const mean = [0.48145466, 0.4578275, 0.40821073], std = [0.26862954, 0.26130258, 0.27577711]
  for (let c = 0; c < 3; c++) for (let i = 0; i < plane; i++)
    result[c * plane + i] = (rgb[i * 4 + c] / 255 - mean[c]) / std[c]
  return result
}

const pending = new Map<string, Promise<Float32Array>>()
function vector(api: Client, topic: string, item: PdfObject) {
  const key = item.object_id + '/' + item.rect.join(',')
  const active = pending.get(key)
  if (active) return active
  const job = (async () => {
    const stored = await get<Float32Array>(key, cache)
    if (stored) return stored
    const crop = await api.call('visual.crop', { topic_id: topic, source_version_id: item.source_version_id, page: item.page, rect: item.rect })
    const embedding = await encode({ pixels: await pixels(crop.image) })
    await set(key, embedding, cache)
    return embedding
  })().finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}

export async function indexFigures(api: Client, topic: string, version: string) {
  const { items } = await api.call('visual.objects', { topic_id: topic, source_version_id: version })
  const figures = items.filter(item => item.kind === 'figure')
  for (const item of figures) await vector(api, topic, item)
  return figures
}

export function requestsFigure(text: string) {
  return /(?:图片|插图|图表|示意图|架构图|流程图|图\s*\d+)|(?:有没?有|有无|哪|找|看|展示|给|显示|相关|说明|示意|流程|对比|架构|画|讲|这个|这种|对应|类似).{0,60}图(?!像|论|书|神经网络)|(?:图|插画)(?:里|中|在哪|讲了|显示|示了)|(?:看看|看一下|有没有|找).{0,45}(?:长什么样|可视化|效果对比|连线的例子|示例画面)|\b(?:fig(?:ure)?\.?\s*\d+|figures?|diagram|illustration|plots?|flowchart)\b/i.test(text)
}

export async function retrieveFigures(api: Client, topic: string, versions: string[], query: string, limit = 3) {
  const text = await encode({ text: query })
  const ranked: { item: PdfObject; score: number }[] = []
  let skipped = 0
  for (const version of new Set(versions)) {
    try {
      const items = await indexFigures(api, topic, version)
      const { items: lexical } = await api.call('visual.search', { topic_id: topic, source_versions: [version], query: query.slice(0, 400) })
      for (const item of items) {
        const v = await vector(api, topic, item)
        const cosine = v.reduce((s, n, i) => s + n * text[i], 0)
        const pos = lexical.findIndex(x => x.object_id === item.object_id)
        if (cosine >= 0.18 || pos >= 0) ranked.push({ item, score: cosine + (pos >= 0 ? .055 / (1 + pos) : 0) })
      }
    } catch { skipped++ }
  }
  if (versions.length && skipped === new Set(versions).size) throw new Error('Figure index unavailable')
  ranked.sort((a, b) => b.score - a.score)
  return { items: ranked.slice(0, limit).map(x => x.item), skipped }
}
