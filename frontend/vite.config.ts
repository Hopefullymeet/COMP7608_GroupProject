import { defineConfig, type Plugin } from 'vite'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

function bundleOcrModels(): Plugin {
  const models = new Map(['eng', 'chi_sim'].map(lang => [
    '/ocr/' + lang + '.traineddata.gz',
    require.resolve('@tesseract.js-data/' + lang + '/4.0.0_best_int/' + lang + '.traineddata.gz'),
  ]))
  return {
    name: 'bundle-ocr-models',
    generateBundle() {
      for (const [url, path] of models) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: readFileSync(path) })
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = models.get(req.url ?? '')
        if (!path) return next()
        res.setHeader('Content-Type', 'application/octet-stream')
        res.end(readFileSync(path))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), bundleOcrModels()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    port: 5174, strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})

