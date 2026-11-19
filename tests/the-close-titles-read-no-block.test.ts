// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLOSE TITLES READ NO BLOCK, AND NAME THE SAME RECORDS AS BEFORE. Wave 13y round 85, item 4.
 *
 * `nearDuplicateTitles` (src/server/lib/records/near-duplicate-titles.ts) gives the live records of a project whose titles are close to a
 * title being filed, closest first, at most three. It reads the id, kind and title of the project's live records in
 * one statement, and never reports a block. Until round 85 the blocks were read and then skipped, one by one. Round 85
 * leaves them out of the statement itself, and checks a candidate against the floor before it builds the candidate's
 * character pairs. Neither change may drop a record the function reported before, and neither may report one more.
 *
 * Every title and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE SAME RECORDS, IN THE SAME ORDER, WITH THE SAME CLOSENESS, for a title that a block is also called: the two
 *      notes whose words are the title's (1, filed first and second), the note one letter longer (60 of 63), and not
 *      the fourth close note (62 of 66), because three are reported. The block is not among them, and neither is a
 *      deleted note nor a note of another project called the same.
 *   2. ONE STATEMENT, WHICH GIVES BACK NO BLOCK: the call runs one statement, and it gives back one row for each live
 *      record of the project that is not a block. The statement's text is not written here, so that drizzle's way of
 *      writing it does not decide the case.
 *   3. A TITLE LONGER ONLY IN ITS PUNCTUATION is reported. Its words are the asked title's, but it is longer than the
 *      length bound in characters as stored. A bound in the statement, on the stored title, would leave it out.
 *   4. A TITLE EXACTLY AT THE FLOOR IS REPORTED, and one just under it is not: 0.7 (14 pairs shared of 20) and 0.6842
 *      (13 of 19). So a check before the pairs are built may leave out nothing the floor lets in.
 *
 * THE LIMITS.
 *   · The answers are compared with the answers written out below, worked out by hand from the measure, and not with
 *     an answer from the code before round 85. The made-up office of the live counts holds that comparison: 42 titles,
 *     the same answers by hash before and after, in round 85's report.
 *   · Case 2 counts statements run through the database connection while the function runs. A statement prepared
 *     before this file's counter would not be counted, and then the case fails with no run, which says so.
 *
 * WHAT TURNS EACH RED, each tried in wave 13y round 85, on `nearDuplicateTitles` alone:
 *   · cases 1 and 2: take the blocks out of the statement's condition, with the skip of blocks gone as it is now;
 *   · case 2 alone: the function before round 85, which read the blocks and skipped them;
 *   · cases 1 to 4: leave notes out of the statement as well as blocks;
 *   · case 3: a length bound on the stored title in the statement;
 *   · case 4: a check before the pairs that leaves out a title exactly at the floor, and separately one that counts a
 *     candidate one pair longer than it is.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const ELSEWHERE = 'made-up-other-project'

let t: TestDb
/** What the statements run while `counting` gave back: how many ran, and how many rows they gave back in all. */
let ran = { statements: 0, rows: 0 }
let counting = false

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const how of ['all', 'get', 'iterate', 'run']) {
      const run = statement[how] as (...args: unknown[]) => unknown
      statement[how] = function (this: unknown, ...args: unknown[]) {
        const answer = run.apply(this, args)
        if (counting) ran = { statements: ran.statements + 1, rows: ran.rows + (how === 'all' ? (answer as unknown[]).length : 0) }
        return answer
      }
    }
    return statement
  }
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'A made-up other project' })
}, 60_000)

afterAll(() => {
  t?.close()
})

const note = (title: string, workspaceId = PROJECT): string =>
  t.api.createRecord({ workspaceId, kind: 'note', title, data: { body: 'Made up for this file.' }, actor: t.api.HUMAN }).id

/** The close titles of `title` in the project, with the statements run while the function ran. */
function closeTo(title: string) {
  ran = { statements: 0, rows: 0 }
  counting = true
  try {
    const found = t.api.nearDuplicateTitles(title, PROJECT)
    return { found: found.map((one) => ({ id: one.id, closeness: one.closeness })), ...ran }
  } finally {
    counting = false
  }
}

const count = (where: string): number =>
  (t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE workspace_id = ? AND deleted_at IS NULL${where}`).get(PROJECT) as { n: number }).n

describe('the close titles', () => {
  const TITLE = 'Weigh the reel before storing it'
  const filed = { a: '', c: '', b: '' }

  beforeAll(() => {
    const pipeline = t.api.createRecord({ workspaceId: PROJECT, kind: 'pipeline', title: 'Store the reel', data: { blockIds: [] }, actor: t.api.HUMAN }).id
    // A BLOCK'S TITLE IS ITS OWN NAME (src/shared/blocks.ts), so this block is called exactly what the asked title is.
    t.blocks.addBlock(pipeline, { name: TITLE, state: 'todo' }, t.api.HUMAN)
    filed.a = note(TITLE)
    filed.c = note('weigh the reel, before storing it!')
    filed.b = note('Weigh the reels before storing it')
    note('Weigh the old reel before storing it')
    t.api.deleteRecord(note(TITLE), t.api.HUMAN)
    note(TITLE, ELSEWHERE)
  })

  it('1. names the same records, in the same order, with the same closeness, and no block', () => {
    expect(closeTo(TITLE).found).toEqual([
      { id: filed.a, closeness: 1 },
      { id: filed.c, closeness: 1 },
      { id: filed.b, closeness: 60 / 63 },
    ])
  })

  it('2. runs one statement, which gives back every live record of the project but its blocks', () => {
    const blocks = count(` AND kind = 'block'`)
    expect(blocks, 'the blocks of the project').toBeGreaterThan(0)
    const { statements, rows } = closeTo(TITLE)
    expect({ statements, rows }, `${count('')} live records, ${blocks} of them blocks`).toEqual({ statements: 1, rows: count('') - blocks })
  })

  it('3. reports a title longer than the bound only in its punctuation', () => {
    const asked = 'Fire the glaze kiln'
    const longer = 'Fire — the — glaze — kiln — !!!!!!!!!!!!!!!!!!!!'
    // LONGER THAN THE BOUND AS STORED: 19 characters asked, so 35.3 at most by the bound, and 48 here.
    expect(longer.length, 'the stored title is longer than the bound').toBeGreaterThan(19 * ((2 - 0.7) / 0.7))
    const id = note(longer)
    expect(closeTo(asked).found).toEqual([{ id, closeness: 1 }])
  })

  it('4. reports a title exactly at the floor, and not one just under it', () => {
    const at = note('Check that front doors')
    note('Paint the shed doors')
    expect(closeTo('Paint the front door').found).toEqual([{ id: at, closeness: 0.7 }])
  })
})
