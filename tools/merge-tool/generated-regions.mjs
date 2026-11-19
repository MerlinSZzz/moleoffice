// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GENERATED FILE THAT MAIN AND AN ENTRY BOTH CHANGED: may the entry's version stand without a new check? Part of the
 * merge tool, tools/the-merger.mjs. It imports none of the tool's other modules, so a test can call it without
 * starting a run.
 *
 * A file such as design/ground/TEST-AUDIT-2026-09-03.md is written in two ways. Its generator writes only between
 * marker pairs (tools/test-audit-table-markers.mjs), and every line outside the pairs is written by hand. When main
 * changed only the generated lines and the entry changed only hand-written lines, the hand-written lines the entry's
 * check read are still the entry's on the merged file, and the generator writes the rest again.
 *
 * The answer is yes only when all three of these conditions hold, which the merge tool's keeper set:
 *   (a) the base, the entry and main hold the same marker pairs, with the same names, in the same order, and each
 *       pair is balanced;
 *   (b) the entry changed nothing inside any pair, and main changed nothing outside them;
 *   (c) git merge-file merges the three versions of the file without a conflict. That catches hand-written words
 *       next to a line main changed, which git cannot put together, for example on a marker's own line.
 * Anything else is no, with a reason in words. A change inside a pair by anybody but the generator is a no.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MARKED_KEY, endMarker, startMarker } from '../test-audit-table-markers.mjs'

/**
 * THE REGIONS OF ONE VERSION OF A FILE, in order, or why it cannot be read as regions. `outside` holds the text before,
 * between and after the pairs, one more than `keys`; `inside` holds the text between each pair's two markers.
 */
export function theRegionsOf(text, which) {
  const marker = new RegExp(`${startMarker(`(${MARKED_KEY})`)}|${endMarker(`(${MARKED_KEY})`)}`, 'g')
  const keys = []
  const inside = []
  const outside = []
  let open = null
  let from = 0
  for (const found of text.matchAll(marker)) {
    const opening = found[1] !== undefined
    const key = opening ? found[1] : found[2]
    if (opening) {
      if (open !== null) return { why: `In ${which}, ${startMarker(open.key)} has no end marker before ${startMarker(key)} opens.` }
      outside.push(text.slice(from, found.index))
      open = { key, after: found.index + found[0].length }
    } else {
      if (open === null) return { why: `In ${which}, ${endMarker(key)} closes a region that was never opened.` }
      if (key !== open.key) return { why: `In ${which}, ${startMarker(open.key)} is closed by ${endMarker(key)}.` }
      keys.push(key)
      inside.push(text.slice(open.after, found.index))
      from = found.index + found[0].length
      open = null
    }
  }
  if (open !== null) return { why: `In ${which}, ${startMarker(open.key)} has no end marker.` }
  outside.push(text.slice(from))
  return { keys, inside, outside }
}

/** Where outside segment `index` lies, said by the regions around it. */
export function whereOutside(keys, index) {
  if (keys.length === 0) return 'in the file'
  if (index === 0) return `before region ${keys[0]}`
  if (index === keys.length) return `after region ${keys[index - 1]}`
  return `between regions ${keys[index - 1]} and ${keys[index]}`
}

/** The number of conflicts git merge-file finds in the three versions, in a temporary folder made and removed here. */
function conflictsOfAMerge(base, entry, main) {
  const folder = mkdtempSync(join(tmpdir(), 'generated-regions-'))
  try {
    const files = { entry: join(folder, 'entry'), base: join(folder, 'base'), main: join(folder, 'main') }
    writeFileSync(files.entry, entry)
    writeFileSync(files.base, base)
    writeFileSync(files.main, main)
    const merged = spawnSync('git', ['merge-file', '-p', files.entry, files.base, files.main], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    // GIT ANSWERS THE NUMBER OF CONFLICTS, from 0 to 127, and a negative number for an error, which a process shows as
    // 255. An error is not an answer about the file, so it is said and not read as a conflict or as clean.
    if (merged.error !== undefined || merged.status === null || merged.status > 127) {
      throw new Error(`git merge-file could not merge the three versions: ${merged.error?.message ?? (merged.stderr.trim() || `exit ${String(merged.status)}`)}`)
    }
    return merged.status
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/**
 * WHETHER THE ENTRY'S VERSION OF A GENERATED FILE STANDS on main's, by conditions (a), (b) and (c) above. Takes the
 * text of the file at the entry's base, at the entry's commit and on main (null where the file is absent). Answers
 * `{ stands: true }`, or `{ stands: false, why }` with the first condition that fails, in words.
 */
export function whetherTheEntrysVersionStands({ base, entry, main }) {
  const versions = { base, entry, main }
  for (const [which, text] of Object.entries(versions)) {
    if (typeof text !== 'string') return { stands: false, why: `The file is absent in ${which}, so there are no regions to compare.` }
  }
  const read = {}
  for (const [which, text] of Object.entries(versions)) {
    const regions = theRegionsOf(text, which)
    if (regions.why !== undefined) return { stands: false, why: regions.why }
    read[which] = regions
  }
  // (a) THE SAME PAIRS, BY NAME AND ORDER, IN ALL THREE.
  const named = (which) => read[which].keys.join(', ') || 'none'
  if (read.base.keys.length === 0) return { stands: false, why: 'The file holds no marker pairs, so none of it is a generated region.' }
  for (const which of ['entry', 'main']) {
    if (named(which) !== named('base')) return { stands: false, why: `The marker pairs differ: the base holds ${named('base')}, and ${which} holds ${named(which)}.` }
  }
  // (b) THE ENTRY KEPT OUT OF THE PAIRS, AND MAIN KEPT INSIDE THEM.
  const keys = read.base.keys
  const touched = keys.filter((_key, i) => read.entry.inside[i] !== read.base.inside[i])
  if (touched.length > 0) return { stands: false, why: `The entry changed lines inside region ${touched.join(', ')}, which only the generator writes.` }
  const moved = read.base.outside.map((_text, i) => i).filter((i) => read.main.outside[i] !== read.base.outside[i])
  if (moved.length > 0) return { stands: false, why: `Main changed hand-written lines ${moved.map((i) => whereOutside(keys, i)).join('; ')}.` }
  // (c) GIT PUTS THE TWO CHANGES TOGETHER.
  const conflicts = conflictsOfAMerge(base, entry, main)
  if (conflicts > 0) {
    return { stands: false, why: `git merge-file found ${String(conflicts)} ${conflicts === 1 ? 'conflict' : 'conflicts'} between the entry's lines and main's, so they are too close to put together.` }
  }
  return { stands: true }
}
