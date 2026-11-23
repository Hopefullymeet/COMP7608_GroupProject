import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const cache = fileURLToPath(new URL('../.figure-model/', import.meta.url))
const base = 'https://huggingface.co/Xenova/chinese-clip-vit-base-patch16/resolve/f26904860903e70e050b8f48255e5f48401816e9'
const files = [
  ['model.onnx', 'onnx/model_quantized.onnx', 'a2c2849329eafb24100acec5a9421a39f8cb445296444c5c98855b69e5e7a751'],
  ['vocab.txt', 'vocab.txt', '45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c'],
]
async function assets() {
  const result = new Map()
  await mkdir(cache, { recursive: true })
  for (const [name, remote, hash] of files) {
    const target = join(cache, name)
    let bytes = await readFile(target).catch(() => undefined)
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== hash) {
      const response = await fetch(base + '/' + remote)
      if (!response.ok) throw new Error('Figure model download failed: ' + response.status)
      bytes = Buffer.from(await response.arrayBuffer())
      if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Figure model checksum mismatch')
      const temp = target + '.' + process.pid
      await writeFile(temp, bytes)
      await rename(temp, target)
    }
    result.set('vision/' + name, bytes)
  }
  const dist = dirname(require.resolve('onnxruntime-web'))
  for (const ext of ['mjs', 'wasm']) {
    const name = 'ort-wasm-simd-threaded.' + ext
    result.set('vision/' + name, await readFile(join(dist, name)))
  }
  return result
}
export function figureAssets() {
  let ready
  const load = () => ready ??= assets()
  return {
    name: 'paper-figure-assets',
    async generateBundle() {
      for (const [fileName, source] of await load()) this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      server.middlewares.use('/vision', async (req, res, next) => {
        try {
          const key = 'vision' + req.url
          const bytes = (await load()).get(key)
          if (!bytes) return next()
          res.setHeader('Content-Type', key.endsWith('.mjs') ? 'application/javascript' : key.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
          res.end(bytes)
        } catch (error) { next(error) }
      })
    },
  }
}
