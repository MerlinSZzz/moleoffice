// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE FILES THAT CHANGED THEIR ANSWER ON ONE TREE: red in a run and then green alone there, or cleared by the pair
 * because a test that failed only with the entry passed with it in the pair. The office files a problem for each when
 * its setting says so; this module only works out the list. It runs nothing and reads no file. Part of the merge tool,
 * tools/the-merger.mjs.
 */
import './a-library-is-not-a-program.mjs'

/** @typedef {'green-alone' | 'green-in-the-pair'} HowAFileChanged */
/** @typedef {{ file: string, alone: 'green' | 'red' | 'no result', tree: string, log?: string | null, unfinished?: boolean }} ARunAlone */
/** @typedef {{ file: string, clearedByThePair?: boolean, passedWithIt?: string[], tree: string, pair?: { entry?: { log?: string | null } | null } | null }} AComparedRow */
/** @typedef {{ file: string, how: HowAFileChanged, commit: string, log?: string }} AChangedAnswer */

/**
 * THE FILES THAT CHANGED THEIR ANSWER, in the order they were first met, with no file named twice. A file `green` in a
 * rerun counts as green alone, unless a worker exit left it `unfinished` in the run it was red in: that run gave it no
 * answer, so its run alone is its first answer and not a changed one. A row `comparedWithMain`
 * cleared counts as green in the pair only when a test that failed only with the entry passed with it there
 * (`passedWithIt` is not empty), never when the clear rests on a test that failed on main in the pair (`failedOnMain`).
 * `commitOf` gives the commit of the tree a row ran on, and `before` carries the files an earlier run on a tree already
 * named, so a later run cannot name one again.
 *
 * @param {ARunAlone[]} reruns
 * @param {AComparedRow[]} compared
 * @param {(tree: string) => string} commitOf
 * @param {AChangedAnswer[]} [before]
 * @returns {AChangedAnswer[]}
 */
export function filesThatChangedTheirAnswer(reruns, compared, commitOf, before = []) {
  /** @type {AChangedAnswer[]} */
  const answer = [...before]
  const named = new Set(answer.map((one) => one.file))
  /** @type {Map<string, AComparedRow>} */
  const cleared = new Map()
  for (const one of compared) {
    if (one.clearedByThePair === true && Array.isArray(one.passedWithIt) && one.passedWithIt.length > 0) cleared.set(one.file, one)
  }
  /**
   * @param {string} file
   * @param {HowAFileChanged} how
   * @param {string} tree
   * @param {string | null | undefined} log
   */
  const add = (file, how, tree, log) => {
    if (named.has(file)) return
    named.add(file)
    answer.push({ file, how, commit: commitOf(tree), ...(typeof log === 'string' && log !== '' ? { log } : {}) })
  }
  for (const one of reruns) {
    if (one.alone === 'green') {
      if (one.unfinished !== true) add(one.file, 'green-alone', one.tree, one.log)
    } else {
      const pair = cleared.get(one.file)
      if (pair !== undefined) add(one.file, 'green-in-the-pair', one.tree, pair.pair?.entry?.log)
    }
  }
  for (const one of cleared.values()) add(one.file, 'green-in-the-pair', one.tree, one.pair?.entry?.log)
  return answer
}
