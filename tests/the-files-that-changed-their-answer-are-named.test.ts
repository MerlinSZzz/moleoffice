// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES THAT CHANGED THEIR ANSWER ON ONE TREE, NAMED ONCE, WITH HOW AND WHERE.
 *
 * The flaky-test rule (wave 13u round 51): a file that was red in a run and then green alone on the same tree, or
 * that the pair of runs cleared because a test passed with the entry in the pair, changed its answer. The merge
 * tool names each of them to the office. This file proves the pure part of that naming, tools/merge-tool/
 * changed-their-answer.mjs, which runs nothing and reads no file:
 *
 *   - green alone counts, with the run-alone log; red alone and no result do not;
 *   - a pair clear counts only when a test that failed only with the entry passed with it in the pair, with the
 *     pair's entry log; a clear because main failed in the pair does not count;
 *   - blamed, red on main too, and no result do not count;
 *   - a file met twice is named once, the first time, and an empty input answers an empty list;
 *   - the commit is the one the function gives for the tree each row ran on.
 */
import { describe, expect, it } from 'vitest'
import { filesThatChangedTheirAnswer } from '../tools/merge-tool/changed-their-answer.mjs'

/** The commit of a tree, as the merge tool's own git helper answers it. Here it names the tree it was given. */
const commitOf = (tree: string): string => `commit-of-${tree}`

/** SYNTHETIC: a file red in a run, with what its run alone then said on the same tree. */
interface ARunAloneRow {
  file: string
  alone: 'green' | 'red' | 'no result'
  tree: string
  log: string
}

/** SYNTHETIC: a row `comparedWithMain` answered for a file red alone with the entry. */
interface AComparedRow {
  file: string
  clearedByThePair: boolean
  passedWithIt: string[]
  failedOnMain: string[]
  onMainToo: boolean
  noResult: string | null
  pair: { entry: { log: string } }
  tree: string
}

function aRunAlone(file: string, alone: 'green' | 'red' | 'no result', tree = 'the-tree'): ARunAloneRow {
  return { file, alone, tree, log: `/logs/${file.replaceAll('/', '-')}-alone.log` }
}

function aCompared(
  file: string,
  fields: { clearedByThePair?: boolean; passedWithIt?: string[]; failedOnMain?: string[]; onMainToo?: boolean; noResult?: string | null; tree?: string; log?: string } = {},
): AComparedRow {
  return {
    file,
    clearedByThePair: fields.clearedByThePair ?? false,
    passedWithIt: fields.passedWithIt ?? [],
    failedOnMain: fields.failedOnMain ?? [],
    onMainToo: fields.onMainToo ?? false,
    noResult: fields.noResult ?? null,
    pair: { entry: { log: fields.log ?? `/logs/${file.replaceAll('/', '-')}-pair-entry.log` } },
    tree: fields.tree ?? 'the-tree',
  }
}

describe('a file that changed its answer on one tree', () => {
  it('is named when it was red in a run and green alone on the same tree', () => {
    expect(filesThatChangedTheirAnswer([aRunAlone('tests/red.test.ts', 'red'), aRunAlone('tests/green.test.ts', 'green')], [], commitOf)).toEqual([
      { file: 'tests/green.test.ts', how: 'green-alone', commit: 'commit-of-the-tree', log: '/logs/tests-green.test.ts-alone.log' },
    ])
  })

  it('is not named when it stayed red alone', () => {
    expect(filesThatChangedTheirAnswer([aRunAlone('tests/red.test.ts', 'red')], [], commitOf)).toEqual([])
  })

  it('is not named when its run alone gave no result', () => {
    expect(filesThatChangedTheirAnswer([aRunAlone('tests/silent.test.ts', 'no result')], [], commitOf)).toEqual([])
  })

  it('is named when the pair cleared it because a test passed with the entry there, with the pair entry run log', () => {
    expect(
      filesThatChangedTheirAnswer(
        [aRunAlone('tests/one.test.ts', 'red')],
        [aCompared('tests/one.test.ts', { clearedByThePair: true, passedWithIt: ['a test that passed with the entry'], log: '/logs/pair-entry-1.log' })],
        commitOf,
      ),
    ).toEqual([{ file: 'tests/one.test.ts', how: 'green-in-the-pair', commit: 'commit-of-the-tree', log: '/logs/pair-entry-1.log' }])
  })

  it('is not named when the pair cleared it only because a test failed on main there', () => {
    expect(
      filesThatChangedTheirAnswer(
        [aRunAlone('tests/on-main.test.ts', 'red')],
        [aCompared('tests/on-main.test.ts', { clearedByThePair: true, passedWithIt: [], failedOnMain: ['a test that failed on main in the pair'] })],
        commitOf,
      ),
    ).toEqual([])
  })

  it('is not named when it was blamed, was red on main too, or gave no result', () => {
    const reruns = [aRunAlone('tests/blamed.test.ts', 'red'), aRunAlone('tests/on-main.test.ts', 'red'), aRunAlone('tests/silent.test.ts', 'no result')]
    const compared = [
      aCompared('tests/blamed.test.ts'),
      aCompared('tests/on-main.test.ts', { onMainToo: true }),
      aCompared('tests/silent.test.ts', { noResult: 'in the pair, its run alone with this entry gave no result' }),
    ]
    expect(filesThatChangedTheirAnswer(reruns, compared, commitOf)).toEqual([])
  })

  it('is named once, the first time it was met', () => {
    const met = filesThatChangedTheirAnswer(
      [aRunAlone('tests/one.test.ts', 'green', 'first-tree'), aRunAlone('tests/one.test.ts', 'green', 'first-tree')],
      [aCompared('tests/one.test.ts', { clearedByThePair: true, passedWithIt: ['a test that passed with the entry'], tree: 'second-tree' })],
      commitOf,
    )
    expect(met).toEqual([{ file: 'tests/one.test.ts', how: 'green-alone', commit: 'commit-of-first-tree', log: '/logs/tests-one.test.ts-alone.log' }])
  })

  it('answers an empty list for no input', () => {
    expect(filesThatChangedTheirAnswer([], [], commitOf)).toEqual([])
  })

  it('gives the commit of the tree each file\'s runs were on', () => {
    const met = filesThatChangedTheirAnswer(
      [aRunAlone('tests/alone.test.ts', 'green', 'the-bus-tree')],
      [aCompared('tests/pair.test.ts', { clearedByThePair: true, passedWithIt: ['a test that passed with the entry'], tree: 'the-entry-tree' })],
      commitOf,
    )
    expect(met).toEqual([
      { file: 'tests/alone.test.ts', how: 'green-alone', commit: 'commit-of-the-bus-tree', log: '/logs/tests-alone.test.ts-alone.log' },
      { file: 'tests/pair.test.ts', how: 'green-in-the-pair', commit: 'commit-of-the-entry-tree', log: '/logs/tests-pair.test.ts-pair-entry.log' },
    ])
  })
})
