// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Conservatively cover every visible wall pixel using the same tile algorithm
 * as the synthetic routing proof. This reads only bundled art. */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alphaWallSegments } from '../src/wall-alpha.ts'
const require = createRequire(import.meta.url), { PNG } = require('playwright-core/lib/utilsBundle')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), assets = join(root, 'assets')
const catalog = JSON.parse(readFileSync(join(assets, 'village-catalog.json'), 'utf8')), atlases = new Map(), result = {}
const names = new Set(Object.values(catalog.houses).flatMap(house => house.layers.filter(layer => layer.layer === 'back' || layer.layer === 'front').map(layer => layer.sprite)))
for (const name of [...names].sort()) {
  const frame = catalog.sprites[name]
  if (!frame) throw Error(`Missing wall frame ${name}`)
  let atlas = atlases.get(frame.atlas)
  if (!atlas) { atlas = PNG.sync.read(readFileSync(join(assets, `${frame.atlas}.png`))); atlases.set(frame.atlas, atlas) }
  const [width, height] = frame.size, [left, top] = frame.trim, [sx, sy, w, h] = frame.rect
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[(top + y) * width + left + x] = atlas.data[((sy + y) * atlas.width + sx + x) * 4 + 3]
  result[name] = { pixelHash: frame.pixelHash, rects: alphaWallSegments(alpha, width, height, 4).map(r => [r.x, r.y, r.width, r.height]) }
}
const output = JSON.stringify({ version: 1, sprites: result }) + '\n'
writeFileSync(join(root, 'src', 'wall-alpha-data.json'), output)
process.stdout.write(`Derived ${Object.keys(result).length} wall masks, ${Buffer.byteLength(output)} bytes of metadata\n`)
