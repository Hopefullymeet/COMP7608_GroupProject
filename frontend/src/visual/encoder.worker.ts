import * as ort from 'onnxruntime-web/wasm'

ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = new URL('/vision/', self.location.href).href
let model: Promise<ort.InferenceSession> | undefined
let dictionary: Promise<Map<string, number>> | undefined

async function tokens(text: string) {
  dictionary ??= fetch('/vision/vocab.txt').then(async response => {
    if (!response.ok) throw new Error('Figure vocabulary unavailable')
    return new Map((await response.text()).trimEnd().split(/\r?\n/).map((word, i) => [word, i]))
  })
  const vocab = await dictionary
  const ids = [101]
  const parts = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/\p{Script=Han}|[a-z0-9]+|[^\s]/gu) ?? []
  for (const part of parts) {
    const pieces: number[] = []
    let start = 0
    while (start < part.length) {
      let end = part.length
      while (end > start && !vocab.has((start ? '##' : '') + part.slice(start, end))) end--
      if (end === start) { pieces.splice(0, pieces.length, 100); break }
      pieces.push(vocab.get((start ? '##' : '') + part.slice(start, end))!)
      start = end
    }
    ids.push(...pieces)
    if (ids.length >= 51) break
  }
  return [...ids.slice(0, 51), 102]
}

self.onmessage = async (event: MessageEvent<{ id: number; text?: string; pixels?: Float32Array }>) => {
  const { id, text, pixels } = event.data
  try {
    model ??= ort.InferenceSession.create('/vision/model.onnx', { executionProviders: ['wasm'] })
    const session = await model
    const ids = await tokens(text ?? '')
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      attention_mask: new ort.Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length]),
      pixel_values: new ort.Tensor('float32', pixels ?? new Float32Array(3 * 224 * 224), [1, 3, 224, 224]),
    }
    const name = pixels ? 'image_embeds' : 'text_embeds'
    const output = await session.run(feeds, [name])
    self.postMessage({ id, vector: output[name].data })
  } catch (error) {
    model = undefined
    self.postMessage({ id, error: String(error) })
  }
}
