// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LOADER HOOK OF tools/record-what-tests-read.mjs: it notes each file a node process imports under the root, as
 * `R <path>`, into a record of its own (the hook runs in the loader's thread).
 * A decision set this up. It never changes
 * what is loaded, and a failure to note is a missing line, which the merge tool reads as "read everything".
 */
import { appendFileSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

let root = ''
let file = ''
const seen = new Set()

/** @param {{ root: string, file: string }} data */
export function initialize(data) {
  root = data.root
  file = data.file
}

/** @param {string} url @param {unknown} context @param {(url: string, context: unknown) => Promise<unknown>} nextLoad */
export async function load(url, context, nextLoad) {
  if (root !== '' && url.startsWith('file:')) {
    try {
      const rel = relative(root, fileURLToPath(url))
      if (!rel.startsWith('..') && !isAbsolute(rel) && !seen.has(rel)) {
        seen.add(rel)
        appendFileSync(file, `R ${rel}\n`)
      }
    } catch {
      // A note that cannot be written is a missing line.
    }
  }
  return nextLoad(url, context)
}
