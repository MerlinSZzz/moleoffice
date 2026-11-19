// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONFLICTED TEXT OF A PATH A STOPPED REPLAY LEFT IN CONFLICT, AND THE PLACES IN IT (tier 2 of decision
 * to resolve a conflict, round B). The clean copy a supervisor resolves in (resolve-a-conflict.mjs) writes it into the working
 * file, and the merge tool's check of the resolution (check-a-resolution.mjs) reads the resolved file against it, so the
 * supervisor and the check read one text.
 *
 * IT IS MADE FROM THE INDEX'S THREE STAGES, by the three-way merge the list-join driver runs (list-join.mjs
 * `theThreeWayMerge`), with the ancestor's lines between main's and the entry's in each place. Git's own working file is
 * not read: where the driver refused a join, git leaves main's side there with no markers at all, and git's own markers
 * carry no ancestor.
 *
 * IT READS NONE OF THE MERGE TOOL'S ARGUMENTS, so the clean copy, which a supervisor runs, can import it. Git is run by
 * the caller's `gitBytes(args)`, which answers stdout as bytes or throws.
 */

import './a-library-is-not-a-program.mjs'
import { BASE, CLOSE, OPEN, SPLIT, theThreeWayMergeOfTexts } from './list-join.mjs'

/** The blob of each of the three stages of `path`, or null for a stage the index does not hold. */
function theStagesOf(path, gitBytes) {
  const stages = { 1: null, 2: null, 3: null }
  for (const row of gitBytes(['ls-files', '-u', '-z', '--', path]).toString('utf8').split('\0')) {
    const match = /^([0-7]{6}) ([0-9a-f]{40,64}) ([123])\t(.*)$/su.exec(row)
    if (match !== null && match[4] === path) stages[match[3]] = gitBytes(['cat-file', 'blob', match[2]])
  }
  return { ancestor: stages[1], main: stages[2], entry: stages[3] }
}

/**
 * THE CONFLICTED TEXT OF ONE PATH, with its parts: `segments` are the lines outside the places, one more than there are
 * places, and each place holds the ancestor's, main's and the entry's lines and the line it starts at in the text.
 * `{ text, segments, places }`, or `{ refused }` with the sentence of why this path has no text to resolve by lines.
 */
export function theConflictedText(path, gitBytes) {
  const sides = theStagesOf(path, gitBytes)
  if (sides.main === null || sides.entry === null) {
    return { refused: `${path} was ${sides.main === null ? 'deleted on main' : 'deleted by the entry'} and changed on the other side, and a resolution of that is not a choice between lines, so no conflicted text is made for it.` }
  }
  const made = theMergeOf(path, sides)
  if (!('refused' in made) && made.places.length === 0) {
    return { refused: `Git left ${path} in conflict, and the three-way merge of its three sides finds no place where they conflict, so the places cannot be shown.` }
  }
  return made
}

/**
 * THE CONFLICTED TEXT OF THE FILE EACH SIDE RENAMED DIFFERENTLY, under main's name (wave 13u round 131, item 51 (b)): the
 * three-way merge of the ancestor's file, main's file and the entry's file, each read from its commit at the stop at the
 * entry's commit `stoppedAt`, where main's side is HEAD. The index cannot give them, because git holds its own merge of
 * the two sides at each new name. `kind` is a `renamed` kind of whole-file-conflicts.mjs. The text may have no place,
 * where the two sides changed different lines; the file is then resolved as it stands.
 */
export function theConflictedTextOfARename(kind, stoppedAt, gitBytes) {
  const blob = (at, path) => gitBytes(['cat-file', 'blob', `${at}:${path}`])
  return theMergeOf(kind.main, { ancestor: blob(`${stoppedAt}^`, kind.ancestor), main: blob('HEAD', kind.main), entry: blob(stoppedAt, kind.entry) })
}

/** The three-way merge of three sides as its parts, with no place where the sides do not conflict. */
function theMergeOf(path, sides) {
  if ([sides.ancestor, sides.main, sides.entry].some((one) => one !== null && one.includes(0))) {
    return { refused: `${path} holds bytes that are not text, so no conflicted text is made for it.` }
  }
  const merged = theThreeWayMergeOfTexts(path, sides.ancestor ?? Buffer.alloc(0), sides.main, sides.entry)
  if ('refused' in merged) return merged
  return merged.conflicts ? thePartsOf(path, merged.text) : { text: merged.text, segments: [merged.text.split('\n')], places: [] }
}

/** The merge's text cut into the lines outside the places and the places themselves. */
function thePartsOf(path, text) {
  const lines = text.split('\n')
  const segments = [[]]
  const places = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith(OPEN)) {
      segments.at(-1).push(lines[index])
      continue
    }
    const place = { at: index + 1, ancestor: [], main: [], entry: [] }
    let part = 'main'
    for (index += 1; index < lines.length && !lines[index].startsWith(CLOSE); index += 1) {
      if (lines[index].startsWith(BASE)) part = 'ancestor'
      else if (lines[index] === SPLIT) part = 'entry'
      else place[part].push(lines[index])
    }
    if (index >= lines.length) return { refused: `In ${path}, the three-way merge left a place at line ${place.at} with no end, so its places cannot be shown.` }
    places.push(place)
    segments.push([])
  }
  return { text, segments, places }
}

const startsAt = (lines, part, from) => part.every((line, offset) => lines[from + offset] === line)

/**
 * WHERE EACH LINE OF A RESOLVED FILE CAME FROM: every line outside the places must be the conflicted text's own, in its
 * order, and what stands between them is the resolution of each place. `{ places, ambiguous }`, each place with its
 * `resolution` lines; `ambiguous` is true when the lines between two places also stand inside a resolution, so where
 * one place's resolution ends and the next begins cannot be told from the file alone. Or `{ refused }` naming the
 * first line outside the places that the resolved file does not keep.
 */
export function theResolvedPlaces(path, conflicted, resolvedText) {
  const lines = resolvedText.split('\n')
  const { segments, places } = conflicted
  // A TEXT WITH NO PLACE is resolved only as it stands.
  if (places.length === 0) return resolvedText === conflicted.text ? { ambiguous: false, places: [] } : { refused: `${path} as resolved is not the three-way merge of its three sides, which has no place to resolve.` }
  const first = segments[0]
  const last = segments.at(-1)
  const end = lines.length - last.length
  if (!startsAt(lines, first, 0)) {
    return { refused: `${path} as resolved does not keep the conflicted text's first ${String(first.length)} lines before its first place.` }
  }
  if (end < first.length || !startsAt(lines, last, end)) {
    return { refused: `${path} as resolved does not keep the conflicted text's last ${String(last.length)} lines after its last place.` }
  }
  // THE EARLIEST AND THE LATEST FIT OF THE LINES BETWEEN THE PLACES. Where any fit is, the earliest is, since what stands
  // in a place is free; where the two differ, the file alone does not say which lines resolve which place.
  const middle = segments.slice(1, -1)
  const earliest = []
  for (const [n, part] of middle.entries()) {
    let at = n === 0 ? first.length : earliest[n - 1] + middle[n - 1].length
    while (at + part.length <= end && !startsAt(lines, part, at)) at += 1
    if (at + part.length > end) {
      const shown = part.find((line) => line.trim() !== '') ?? ''
      return { refused: `${path} as resolved does not keep, in their order, the ${String(part.length)} lines the conflicted text holds between its places ${String(n + 1)} and ${String(n + 2)}${shown === '' ? '' : `, starting at or after \`${shown.trim().slice(0, 80)}\``}.` }
    }
    earliest.push(at)
  }
  const latest = []
  for (let n = middle.length - 1; n >= 0; n -= 1) {
    let at = (n === middle.length - 1 ? end : latest[0]) - middle[n].length
    while (!startsAt(lines, middle[n], at)) at -= 1
    latest.unshift(at)
  }
  const bounds = [first.length, ...earliest.flatMap((at, n) => [at, at + middle[n].length]), end]
  return {
    ambiguous: latest.some((at, n) => at !== earliest[n]),
    places: places.map((place, n) => ({ ...place, resolution: lines.slice(bounds[2 * n], bounds[2 * n + 1]) })),
  }
}
