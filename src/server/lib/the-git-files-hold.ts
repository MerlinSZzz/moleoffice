// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theGitFilesHold` was moved byte for byte out of src/server/lib/a-worktree-stamp.ts, with no change of behaviour.
 * `theHashOfGitsFiles` was moved byte for byte out of src/server/lib/a-worktree-stamp.ts, with no change of behaviour.
 * `sayGitsFiles` was moved byte for byte out of src/server/lib/a-worktree-stamp.ts, with no change of behaviour.
 * `say` was moved byte for byte out of src/server/lib/a-worktree-stamp.ts, with no change of behaviour.
 * `theWordsOf` was moved byte for byte out of src/server/lib/a-worktree-stamp.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { AWorktreeStamp, WhatIsHashed } from './a-worktree-stamp.ts'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { lstatSync, readFileSync } from 'node:fs'

/** Whether git's own files `stamp` read still say to lstat what they said then: ten lstats; it never throws. */
export function theGitFilesHold(stamp: AWorktreeStamp): boolean {
  try {
    return theHashOfGitsFiles(stamp) === stamp.gitSaid
  } catch {
    return false
  }
}
export function theHashOfGitsFiles(stamp: WhatIsHashed): string {
  const hash = createHash('sha256')
  sayGitsFiles(stamp, hash)
  return hash.digest('hex')
}
export function sayGitsFiles(stamp: WhatIsHashed, hash: ReturnType<typeof createHash>): void {
  const head = theWordsOf(join(stamp.gitDir, 'HEAD'))
  hash.update(`${head}\0`)
  const ref = /^ref: (refs\/\S+)\n?$/u.exec(head)?.[1]
  for (const file of [join(stamp.directory, '.git'), join(stamp.gitDir, 'HEAD'), join(stamp.gitDir, 'index'), join(stamp.gitDir, 'config.worktree'),
    join(stamp.commonDir, 'packed-refs'), join(stamp.commonDir, 'config'), join(stamp.commonDir, 'info', 'exclude'), join(stamp.commonDir, 'info', 'attributes'),
    ...(ref === undefined ? [] : [join(stamp.commonDir, ref)])]) say(hash, file, file)
}
/** What lstat says of `path`, under its `name`: its fields, '-' when it is not there, or the error code it gave. */
export function say(hash: ReturnType<typeof createHash>, path: string, name: string): void {
  let seen: string
  try {
    const stat = lstatSync(path, { bigint: true, throwIfNoEntry: false })
    seen = stat === undefined ? '-' : `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
  } catch (err) {
    seen = `! ${(err as NodeJS.ErrnoException).code ?? String(err)}`
  }
  hash.update(`${name}\0${seen}\0`)
}
export function theWordsOf(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    return `! ${(err as NodeJS.ErrnoException).code ?? String(err)}`
  }
}
