// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A WORKTREE LOOKS LIKE TO lstat, AS A HASH, so a finish can tell whether the tree it read on the seal-read thread
 * is still the tree it is about to seal (./a-finish-reads-git-apart.ts).
 *
 * A finish reads its Git on another thread and writes on the request thread afterwards. A HEAD read again at the write
 * would not see a file edited, staged or added while the read ran, so the stamp holds more than HEAD:
 * - git's own files the capture reads: the worktree's `.git`, HEAD, the index, the loose ref HEAD names, packed-refs,
 *   config, config.worktree, info/exclude and info/attributes;
 * - every path in the index, so an edit, a deletion, a chmod or a symlink swapped in is seen;
 * - every folder that holds one of those paths, and the worktree's root, so a file added beside them is seen.
 * Each is what lstat says of it: device, inode, mode, size, and the change and modification times to the nanosecond.
 * A path lstat cannot read, because it went, was shut or sits under what is now a file, is hashed as git's error code,
 * so it changes the stamp and never throws. Git writes HEAD, a ref and the index by renaming a new file into place, so
 * each write gives them a new inode.
 *
 * TWO CHECKS, BECAUSE A FULL ONE BLOCKS. `aWorktreeStampOf` runs git, so only the seal-read thread makes a stamp.
 * `theStampHolds` reads every path again with lstat, and the thread asks it after its read: the tree did not change
 * while git read it. Measured on a worktree of 9,847 files and 415 folders it took 21 ms, about 2 µs a path, which on
 * the request thread would hold every other request that long. So the request thread asks only `theGitFilesHold`, ten
 * lstats whatever the tree's size, just before it writes: HEAD, the index and the refs did not move since.
 *
 * WHAT IT CANNOT SEE, said here because a finish relies on it:
 * - two writes of the same size within one tick of the file system's clock, when the first came before the stamp;
 * - a file added inside a folder that holds no tracked path, such as an empty folder git does not list;
 * - a change to the user's global git configuration or global ignore file;
 * - an edit to a working file, not staged, between the thread's last check and the write.
 * A write that only touches the index, as `git status` does when it refreshes it, changes the stamp although the tree
 * did not change. Then the finish reads again.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { readGit } from './resources.ts'
import { theHashOfGitsFiles } from './the-git-files-hold.ts'
import { sayGitsFiles } from './the-git-files-hold.ts'
import { say } from './the-git-files-hold.ts'

/** The stamp of one worktree: which files it read, and the hashes of what lstat said of them. */
export interface AWorktreeStamp {
  directory: string
  gitDir: string
  commonDir: string
  /** The paths in the index, as git lists them. */
  paths: string[]
  /** The folders that hold them, relative to the worktree, with '' for the root. */
  folders: string[]
  /** The hash of git's own files and every path and folder. */
  said: string
  /** The hash of git's own files alone. */
  gitSaid: string
}

/** A stamp that could not be made, with git's words for why. */
export interface AStampNotMade {
  directory: string
  notMade: string
}

/** Make the stamp of `directory` now. It runs git, so only the seal-read thread calls it. */
export function aWorktreeStampOf(directory: string): AWorktreeStamp | AStampNotMade {
  try {
    if (!isAbsolute(directory)) return { directory, notMade: 'the working directory is not an absolute path' }
    const [gitDir = '', commonDir = ''] = readGit(directory, ['rev-parse', '--absolute-git-dir', '--git-common-dir']).toString('utf8').split('\n')
    const paths = readGit(directory, ['ls-files', '-z', '--cached']).toString('utf8').split('\0').filter((one) => one !== '')
    const folders = new Set([''])
    for (const path of paths) {
      for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) folders.add(path.slice(0, at))
    }
    const stamp = { directory, gitDir, commonDir: resolve(directory, commonDir), paths, folders: [...folders].sort() }
    return { ...stamp, gitSaid: theHashOfGitsFiles(stamp), said: theHashOfAll(stamp) }
  } catch (err) {
    return { directory, notMade: err instanceof Error ? err.message : String(err) }
  }
}

/** Whether every file `stamp` read still says to lstat what it said then. No process runs; it never throws. */
export function theStampHolds(stamp: AWorktreeStamp): boolean {
  try {
    return theHashOfAll(stamp) === stamp.said
  } catch {
    return false
  }
}

export { theGitFilesHold } from './the-git-files-hold.ts'

export type WhatIsHashed = Omit<AWorktreeStamp, 'said' | 'gitSaid'>

export { theHashOfGitsFiles } from './the-git-files-hold.ts'

function theHashOfAll(stamp: WhatIsHashed): string {
  const hash = createHash('sha256')
  sayGitsFiles(stamp, hash)
  for (const path of stamp.paths) say(hash, join(stamp.directory, path), path)
  for (const folder of stamp.folders) say(hash, folder === '' ? stamp.directory : join(stamp.directory, folder), folder)
  return hash.digest('hex')
}

export { sayGitsFiles } from './the-git-files-hold.ts'

export { say } from './the-git-files-hold.ts'

export { theWordsOf } from './the-git-files-hold.ts'
