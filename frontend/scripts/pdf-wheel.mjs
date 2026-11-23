import { createHash } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
const [target, output] = process.argv.slice(2)
const catalog = JSON.parse(await readFile(new URL('./pdf-wheels.json', import.meta.url)))
if (!catalog[target]) throw new Error('No bundled PDF engine for ' + target)
const [url, expected] = catalog[target]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
if (hash(await readFile(output).catch(() => Buffer.alloc(0))) !== expected) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('PDF engine download failed: ' + response.status)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (hash(bytes) !== expected) throw new Error('PDF engine checksum mismatch')
  await writeFile(output + '.tmp', bytes)
  await rename(output + '.tmp', output)
}
