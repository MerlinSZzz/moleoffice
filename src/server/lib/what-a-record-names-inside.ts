// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD NAMES INSIDE A WORKTREE, compared with the worktree's HEAD commit, for the named-inside door
 * (src/server/api/reportfiles.ts) and the remove tool that decides on its answer (wave 13s round 115, item 25).
 *
 * Git is read through the office's one guarded reader: what HEAD holds (ls-tree) and what git lists as untracked or
 * ignored (ls-files --others, which lists ignored files too when no exclude is given). The folder is read with lstat,
 * and a link is never followed on the way to a path, because a link may lead back inside to a file git does not hold.
 * Nothing here reads a file's bytes: whether a tracked file still holds its commit's bytes is the remove tool's own
 * check, which keeps a worktree with work outside its commit whatever the records name.
 */
import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { NAMED_INSIDE_CLASSES, type WhatARecordNamesInside } from '@shared/what-a-record-names-inside.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'

/** A worktree as git holds it: its HEAD, every file and folder HEAD holds, and what git lists as untracked or ignored. */
export interface TheWorktree {
  folder: string
  head: string
  held: Map<string, 'blob' | 'tree'>
  /** Paths from the top, a folder ending in "/". */
  others: string[]
}

/** The worktree whose top is `folder`, or why the door compares nothing with git. */
export function theWorktreeAsGitHoldsIt(folder: string): TheWorktree | { because: string } {
  let real: string
  try {
    real = realpathSync(folder)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { because: code === 'ENOENT' ? `${folder} is not there.` : `${folder} could not be read (${String(code ?? error)}).` }
  }
  const read = (args: string[], what: string): string | { because: string } => {
    try {
      return readGit(folder, args).toString('utf8')
    } catch (error) {
      return { because: `git could not read ${what} in ${folder}: ${whyGitDidNotAnswer(error)}.` }
    }
  }
  const top = read(['rev-parse', '--show-toplevel'], 'the top of its worktree')
  if (typeof top !== 'string') return top
  if (top.replace(/\n$/, '') !== real) return { because: `${folder} is not the top of a git worktree: git gives ${top.replace(/\n$/, '')} as its top.` }
  const head = read(['rev-parse', '--verify', 'HEAD^{commit}'], 'the HEAD commit')
  if (typeof head !== 'string') return head
  const tree = read(['ls-tree', '-r', '-t', '-z', '--full-tree', head.trim()], 'what HEAD holds')
  if (typeof tree !== 'string') return tree
  const others = read(['ls-files', '-z', '--others', '--directory'], 'the untracked and ignored paths')
  if (typeof others !== 'string') return others
  const held = new Map<string, 'blob' | 'tree'>()
  for (const entry of tree.split('\0')) {
    const tab = entry.indexOf('\t')
    const type = entry.slice(0, tab).split(' ')[1]
    // A submodule's commit is neither, so a path to one is not held, and what is checked out there keeps the worktree.
    if (tab > 0 && (type === 'blob' || type === 'tree')) held.set(entry.slice(tab + 1), type)
  }
  return { folder, head: head.trim(), held, others: others.split('\0').filter((one) => one !== '') }
}

/** Walk the path's components from the top, and say how far the folder holds them. */
function walk(tree: TheWorktree, components: string[]): { names: WhatARecordNamesInside; stoppedAt: number } {
  let place = tree.folder
  for (let at = 0; at < components.length; at++) {
    place = join(place, components[at]!)
    let found
    try {
      found = lstatSync(place)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return { names: 'aPathNotThere', stoppedAt: at }
      return { names: 'notCompared', stoppedAt: at }
    }
    if (found.isSymbolicLink() && at < components.length - 1) return { names: 'notCompared', stoppedAt: at }
  }
  const stoppedAt = components.length - 1
  const whole = components.join('/')
  if (tree.held.get(whole) === 'blob') return { names: 'trackedFilesOnly', stoppedAt }
  const inOrIs = (other: string) => other === whole || other === `${whole}/` || whole.startsWith(other.endsWith('/') ? other : `${other}/`)
  if (tree.others.some(inOrIs)) return { names: 'anotherPath', stoppedAt }
  if (tree.held.get(whole) === 'tree' && !tree.others.some((other) => other.startsWith(`${whole}/`))) return { names: 'trackedFilesOnly', stoppedAt }
  // A file staged and not committed, a submodule, an empty folder: there, and not what HEAD holds.
  return { names: 'anotherPath', stoppedAt }
}

/** A stored path's place inside the folder, "" for the folder itself. A stored path is exact, so nothing is in doubt. */
export function whatAStoredPathNames(tree: TheWorktree, inside: string): WhatARecordNamesInside {
  const components = inside.split('/').filter((one) => one !== '' && one !== '.')
  return components.length === 0 ? 'theFolderOnly' : walk(tree, components).names
}

/**
 * Where a path in prose ends: a space, an ASCII quote or a backtick, or a mark of Chinese text, which puts no space after
 * a path (wave 13s round 116, after the door missed a path written in Chinese text): a curly quote, a guillemet, a
 * full-width stop, comma, colon or bracket. A file whose own name holds such a mark is then read short, and the rule
 * for another name in the same folder puts the record in notCompared.
 */
const THE_END_OF_A_PATH = /[\s"'`“”‘’«»。，、；：！？（）「」『』【】《》]/
/** What may follow a path in a sentence and is not part of it: a line number, a closing mark, a stop. */
const AFTER_A_PATH = /(?::\d+(?::\d+)?|[)\]}>,;:.!?])$/
/** A path holding one of these may be a pattern, a variable or an escape, and not one file's name. */
const NOT_ONE_PATH = /[*?[\]{}<>$%\\|]/
const A_NAMES_LETTER = /[A-Za-z0-9._-]/

/**
 * What prose names at `at`, the index just after the folder and its "/", or -1 where the prose names the folder itself.
 * The path is read to where `THE_END_OF_A_PATH` says, with a line number or a closing mark after it taken off. Where another
 * name in the same folder could be read there instead, longer or ending where this one goes on, it is not compared.
 */
export function whatProseNames(tree: TheWorktree, text: string, at: number): WhatARecordNamesInside {
  if (at < 0) return 'theFolderOnly'
  let end = at
  while (end < text.length && !THE_END_OF_A_PATH.test(text[end]!)) end += 1
  let path = text.slice(at, end)
  if (path.includes('..') || path.includes('…')) return 'notCompared'
  for (let cut = AFTER_A_PATH.exec(path); cut !== null; cut = AFTER_A_PATH.exec(path)) path = path.slice(0, cut.index)
  if (NOT_ONE_PATH.test(path)) return 'notCompared'
  const components: { name: string; at: number }[] = []
  let offset = at
  for (const name of path.split('/')) {
    if (name !== '' && name !== '.') components.push({ name, at: offset })
    offset += name.length + 1
  }
  if (components.length === 0) return 'theFolderOnly'
  const { names, stoppedAt } = walk(tree, components.map((one) => one.name))
  if (names === 'notCompared') return names
  const { name, at: from } = components[stoppedAt]!
  let neighbours: string[]
  try {
    neighbours = readdirSync(join(tree.folder, ...components.slice(0, stoppedAt).map((one) => one.name)))
  } catch {
    return 'notCompared'
  }
  for (const neighbour of neighbours) {
    if (neighbour === name || !text.startsWith(neighbour, from)) continue
    if (neighbour.length > name.length || !A_NAMES_LETTER.test(text[from + neighbour.length]!)) return 'notCompared'
  }
  return names
}

/** The first class, in the door's order, that any place a record names is in. A record naming no place is not compared. */
export function theFirstClassOf(found: Iterable<WhatARecordNamesInside>): WhatARecordNamesInside {
  let first = NAMED_INSIDE_CLASSES.length
  for (const one of found) first = Math.min(first, NAMED_INSIDE_CLASSES.indexOf(one))
  return NAMED_INSIDE_CLASSES[first] ?? 'notCompared'
}
