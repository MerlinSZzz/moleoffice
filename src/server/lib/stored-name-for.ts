// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `storedNameFor` was moved byte for byte out of src/server/lib/reportfiles.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { extname } from 'node:path'
import { anOfficeId } from './ids.ts'

/**
 * The name a stored file is given on disk: a fresh id and the caller's extension.
 *
 * THE CALLER'S NAME IS NOT THE STORED NAME. Two files called `summary.ts` in two reports are two
 * files, and a directory holding them under one name would have the second silently replace the
 * first. The name the reader sees travels in the block and is never the path on disk.
 *
 * THE EXTENSION IS SANITISED and kept, because the preview door decides how to describe the bytes
 * from it and because a file served as `application/octet-stream` when it is really text is a
 * smaller loss than a file stored under a name that is not a file name.
 */
export function storedNameFor(name: string): string {
  const found = extname(name).toLowerCase()
  const safe = found.replace(/[^.a-z0-9]/gu, '').slice(0, 20)
  return `${anOfficeId()}${safe}`
}
