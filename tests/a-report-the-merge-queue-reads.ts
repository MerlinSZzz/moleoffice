// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S REPORT AS THE MERGE QUEUE READS IT AT THE PIN, by part 1 of a decision in wave 13v round 34.
 *
 * Before any check of a run starts, the queue bounces its entry when the run has no doing line, when no report linked
 * about it lists the chapters read, or when a test file the run added has no control, mutation and restore. A fixture
 * that pins an entry before any check started gives its run all three here: a doing line, and one report that lists the
 * shipped chapters and names every test file in the run's tree beside the words control, mutation and restore.
 *
 * EVERY TEST FILE IN THE TREE, not only those the run added. Which commits are the run's own is read from the second the
 * run started, and a fixture makes its commits in the same second as its run or the one before, so either can happen.
 * A tree of many test files is named over as many blocks as the prose cap needs, each block with the three words, because
 * the queue looks for the file and the words in one block.
 *
 * Every word of it is synthetic and says so. Nothing here is an observation.
 */
import { execFileSync } from 'node:child_process'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
import { MAX_PROSE } from '../src/shared/prose-cap.ts'
import type { TestDb } from './helpers.ts'

/**
 * Every chapter the checkout ships, which the fixture's report says it read. They are read from the shipped file and
 * never typed, so a card that names a role chapter finds it in the list.
 */
const EVERY_CHAPTER = [...SHIPPED_CHAPTER_NUMBERS]

/** The synthetic sentence for some test files, the control, the mutation and the restore of each written and none run. */
const proofOf = (tests: string[]) => `Synthetic: the control, the mutation and the restore of ${tests.join(', ')} are written here for a fixture; none was run.`

/** The blocks that name every test file in `tests`, each block within the prose cap. */
function theBlocksNaming(tests: string[]): { id: string; type: 'text'; text: string }[] {
  if (tests.length === 0) return [{ id: 'b-1', type: 'text', text: 'Synthetic: this fixture run adds no test file.' }]
  const groups: string[][] = [[]]
  for (const test of tests) {
    if (groups.at(-1)!.length > 0 && proofOf([...groups.at(-1)!, test]).length > MAX_PROSE) groups.push([])
    groups.at(-1)!.push(test)
  }
  return groups.map((group, i) => ({ id: `b-${String(i + 1)}`, type: 'text', text: proofOf(group) }))
}

/**
 * Give a fixture's run the doing line and the linked report the merge queue reads at the pin, written as `actor` (the
 * run's own agent, as the fixture filed the run). Returns the report's id.
 */
export function theRunReportsForTheQueue(t: TestDb, run: string, actor: { type: 'agent'; id: string }): string {
  const record = t.api.getRecord(run)
  if (record === null) throw new Error(`Run ${run} is not here, so no report was written for it.`)
  const dir = record.data['workingDirectory']
  const tests =
    typeof dir === 'string'
      ? execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8' }).split('\n').filter((one) => /\.test\.(ts|tsx|mjs|js)$/u.test(one))
      : []
  t.api.patchRecord(run, { dataPatch: { doing: 'Synthetic: a fixture run, made to be submitted to the merge queue.' } }, actor)
  const report = t.api.createRecord({
    kind: 'report',
    title: `Synthetic report of fixture run ${run}`,
    workspaceId: record.workspaceId,
    actor,
    origin: 'fixture',
    data: {
      chaptersRead: EVERY_CHAPTER,
      blocks: theBlocksNaming(tests),
    },
  }).id
  t.api.createLink({ fromId: report, toId: run, type: 'about', actor })
  return report
}
