import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { target_directory: targetDirectory } = JSON.parse(execFileSync(
  'cargo', ['metadata', '--format-version', '1', '--no-deps'],
  { cwd: fileURLToPath(new URL('../src-tauri/', import.meta.url)), encoding: 'utf8' },
))
const releaseDirectory = fileURLToPath(new URL('../../release/', import.meta.url))
const destination = join(releaseDirectory, 'papertrace.exe')
const executable = join(targetDirectory, 'release', 'papertrace.exe')
if (executable !== destination) {
  mkdirSync(releaseDirectory, { recursive: true })
  copyFileSync(executable, destination)
}
console.log(`Windows portable EXE: ${destination}`)
