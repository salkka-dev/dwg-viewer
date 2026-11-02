// Copies the CAD engine's worker scripts and LibreDWG wasm into public/workers
// so Vite serves them in dev and ships them in the build (and the service
// worker can precache them for offline use).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'workers')
mkdirSync(outDir, { recursive: true })

const assets = [
  'node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js',
  'node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js',
  'node_modules/@mlightcad/libredwg-converter/dist/libredwg-web.wasm'
]

for (const rel of assets) {
  const src = join(root, rel)
  const dest = join(outDir, rel.split('/').pop())
  copyFileSync(src, dest)
  console.log(`copied ${rel.split('/').pop()}`)
}
