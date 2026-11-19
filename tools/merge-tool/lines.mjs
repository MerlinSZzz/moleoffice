// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINE RULE FOR LINE FILES. Part of the merge tool, tools/the-merger.mjs.
 *
 * For a file on the list of line files (src/shared/merge-queue.ts, `isALineFile`), a release's reading still holds on a
 * tree when the entry's own lines stand there unchanged and no line somebody else changed meets them. Lines meet when
 * they overlap or touch with no unchanged line between, which is where git reports a conflict. Every other file keeps
 * decision R2, by file.
 *
 * This module imports nothing from the tool but a-library-is-not-a-program.mjs, which does nothing when it is imported,
 * so the replay of a day's queue can use it without starting a run. Its git never starts git's automatic housekeeping,
 * for the reason git.mjs gives.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'

/** The two registries contain only literal names, one per line, inside one const array. */
export function plainRegistryList(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'))
  if (!/^export const (?:OPERATION_NAMES|ROUTE_GROUPS) = \[$/.test(lines.shift() ?? '') || lines.pop() !== '] as const') return false
  if (lines.length === 0 || !lines.every((line) => /^'[a-zA-Z][a-zA-Z0-9.-]*',$/.test(line))) return false
  return new Set(lines).size === lines.length
}

function gitOut(repo, args) {
  const env = { ...process.env }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY']) delete env[name]
  const result = spawnSync('git', ['-c', 'gc.auto=0', '-C', repo, ...args], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return result.status === 0 ? result.stdout : null
}

/** The two joiners of parts files, src/shared/merge-queue.ts's line files with one re-export line per part. */
const JOINING_FILES = ['src/shared/words/parts.ts', 'src/shared/kind-fields/parts.ts']

/**
 * A joiner is plain only with blank lines, line comments and one static import or re-export per line. The kind-fields
 * joiner may also hold `export {}`, which makes it a module before any line adds a file.
 */
function joiningFileHolds(repo, path, commits) {
  if (path === 'src/shared/ops-list.ts' || path === 'src/server/routes-list.ts') {
    return [...new Set(commits)].every((commit) => {
      const text = gitOut(repo, ['show', `${commit}:${path}`])
      return text !== null && plainRegistryList(text)
    })
  }
  if (!JOINING_FILES.includes(path)) return true
  const declaration = /^(?:import(?:\s+type)?(?:\s+[\w$ ,{}*]+?\s+from)?|export(?:\s+type)?\s+[\w$ ,{}*]+?\s+from)\s+(['"])[^'"\r\n\\]*\1\s*;?\s*(?:\/\/.*)?$/
  const nothingExported = (line) => path === 'src/shared/kind-fields/parts.ts' && /^export\s*\{\s*\}\s*;?$/.test(line)
  return [...new Set(commits)].every((commit) => {
    const text = gitOut(repo, ['show', `${commit}:${path}`])
    return text !== null && text.split('\n').every((line) => !line.trim() || line.trim().startsWith('//') || declaration.test(line.trim()) || nothingExported(line.trim()))
  })
}

/** Why a file that is not plain is judged by file, naming the file. */
function whyNotPlain(path) {
  return JOINING_FILES.includes(path) ? `${path} is not a plain joining file; judge it by file` : `${path} is not a plain list; judge it by file`
}

/**
 * THE HUNKS OF ONE FILE BETWEEN TWO COMMITS, with no context lines. Each is `{i, c, j, d, removed, added}`: `c` lines
 * from line `i` of the old side (counted from 0) became `d` lines from line `j` of the new side. Null when git cannot
 * say, or the file is binary: the caller then judges by file.
 */
export function hunksOf(repo, from, to, path) {
  const out = gitOut(repo, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', '--no-textconv', from, to, '--', path])
  if (out === null) return null
  const hunks = []
  let hunk = null
  for (const line of out.split('\n')) {
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') return null
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (header !== null) {
      const a = Number(header[1])
      const c = header[2] === undefined ? 1 : Number(header[2])
      const b = Number(header[3])
      const d = header[4] === undefined ? 1 : Number(header[4])
      hunk = { i: c === 0 ? a : a - 1, c, j: d === 0 ? b : b - 1, d, removed: [], added: [] }
      hunks.push(hunk)
    } else if (hunk !== null && line.startsWith('-')) hunk.removed.push(line.slice(1))
    else if (hunk !== null && line.startsWith('+')) hunk.added.push(line.slice(1))
  }
  return hunks
}

/** Whether two changes of the same old lines meet: they overlap, or touch with no unchanged line between. */
export function meet(x, y) {
  return x.i + x.c >= y.i && y.i + y.c >= x.i
}

/** Lines `from`..`to` counted from 1, as a person reads them; a change that only removes lines is "after line N". */
function rangeOf(start, count) {
  if (count === 0) return `after line ${String(start)}`
  return count === 1 ? `line ${String(start + 1)}` : `lines ${String(start + 1)}-${String(start + count)}`
}

/** The old-side lines of hunks, as a person reads them. */
export function oldRanges(hunks) {
  return hunks.map((one) => rangeOf(one.i, one.c)).join(', ')
}

/** The new-side lines of hunks, as a person reads them. */
export function newRanges(hunks) {
  return hunks.map((one) => rangeOf(one.j, one.d)).join(', ')
}

/**
 * AN ENTRY'S OWN HUNKS OF A FILE, PLACED ON ANOTHER TREE. `own` are its hunks from its base; `moved` are the hunks from
 * its base to the tree. A hunk that no moved hunk meets is shifted by the lines added and removed before it. When any
 * own hunk meets a moved one, the entry cannot be placed: null.
 */
export function placed(own, moved) {
  const out = []
  for (const hunk of own) {
    if (moved.some((other) => meet(hunk, other))) return null
    const shift = moved.filter((other) => other.i + other.c <= hunk.i).reduce((sum, other) => sum + other.d - other.c, 0)
    out.push({ ...hunk, i: hunk.i + shift })
  }
  return out
}

/**
 * WHETHER TWO ENTRIES' OWN LINES OF A FILE MEET ON A TREE, for the bus's check of an entry passed over ahead. Each is
 * `{base, commit}`. Answers `{meet: false}` when both can be placed on `tree` and no hunk of one meets a hunk of the
 * other, and otherwise `{meet: true, why}`.
 */
export function linesMeetOn(repo, path, tree, one, other) {
  if (!joiningFileHolds(repo, path, [tree, one.base, one.commit, other.base, other.commit])) return { meet: true, why: whyNotPlain(path) }
  const placedOf = (entry) => {
    const own = hunksOf(repo, entry.base, entry.commit, path)
    const moved = hunksOf(repo, entry.base, tree, path)
    if (own === null || moved === null) return { hunks: null, why: 'git could not compare its lines' }
    const hunks = placed(own, moved)
    return hunks === null ? { hunks, why: 'its own lines were changed by somebody else' } : { hunks, why: null }
  }
  const a = placedOf(one)
  if (a.hunks === null) return { meet: true, why: `the first entry's lines cannot be placed: ${a.why}` }
  const b = placedOf(other)
  if (b.hunks === null) return { meet: true, why: `the other entry's lines cannot be placed: ${b.why}` }
  const met = a.hunks.filter((x) => b.hunks.some((y) => meet(x, y)))
  if (met.length > 0) return { meet: true, why: `their lines meet at ${oldRanges(met)}` }
  return { meet: false, ranges: oldRanges(a.hunks), theirs: oldRanges(b.hunks) }
}

/**
 * WHETHER AN ENTRY'S OWN LINES OF A FILE HOLD ON A JOINED TREE. The entry changed `path` from `base` to `commit`; git
 * put it on `onto` and made `joined`. Its lines hold when it has some, no line changed between its base and `onto`
 * meets them, and the change from `onto` to `joined` is exactly its own change, hunk for hunk. Answers `{held: true,
 * ranges}` with its lines on the joined tree, or `{held: false, why}`.
 */
export function ownLinesOn(repo, { base, commit, path, onto, joined }) {
  if (!joiningFileHolds(repo, path, [base, commit, onto, joined])) return { held: false, why: whyNotPlain(path) }
  const own = hunksOf(repo, base, commit, path)
  if (own === null) return { held: false, why: 'git could not compare its lines' }
  if (own.length === 0) return { held: false, why: 'it changes no line of it' }
  const others = hunksOf(repo, base, onto, path)
  if (others === null) return { held: false, why: 'git could not compare the lines changed by others' }
  const met = own.filter((x) => others.some((y) => meet(x, y)))
  if (met.length > 0) return { held: false, why: `lines changed by somebody else meet its own at ${oldRanges(met)} of its base` }
  const landed = hunksOf(repo, onto, joined, path)
  if (landed === null) return { held: false, why: 'git could not compare the joined tree' }
  const expected = placed(own, others)
  const same =
    landed.length === own.length &&
    expected !== null && landed.every((x, n) => x.i === expected[n].i && x.c === expected[n].c && x.d === expected[n].d) &&
    landed.every((x, n) => JSON.stringify([x.removed, x.added]) === JSON.stringify([own[n].removed, own[n].added]))
  if (!same) return { held: false, why: 'its own lines do not stand unchanged on the joined tree' }
  return { held: true, ranges: newRanges(landed) }
}
