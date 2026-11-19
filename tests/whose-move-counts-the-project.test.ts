// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHOSE-MOVE COUNTS THE PROJECT, AND EVERY READING THAT CUTS ITS LIST SAYS SO BESIDE ITS NUMBER.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/open-loops` answers in 16 KB. When the whole answer does not fit it says less about
 * each loop, and when the shortest length still does not fit it drops the loops that changed
 * longest ago — every one of them named. That is deliberate and it is fine.
 *
 * `GET /api/whose-move` then called that reading and counted the list that had already been cut,
 * and wrote its length into its own sentence as the project's total. Measured on the live corpus on
 * 27 August 2026: it said *"Of 38 open loops in this project"* where the project held 143, and the
 * one person-move loop it hid was `RK4zJb6hJyV6`, *A block that was put down still reads as the
 * pipeline's live front*. Over all 143 the answer is person 4, agent 16, either 3, nobody has said
 * 120.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The counts are of the project, on a corpus built large enough that the byte budget really
 *      does cut the open-loops answer. A test on ten records would pass with the defect still in.
 *   2. The loop the cut would hide is in the answer, by id.
 *   3. `GET /api/open-loops` says the project total in the same sentence as its own carried count,
 *      and says its `whoseMove` tally is of the carried list.
 *   4. A word Mole Office cannot read is counted apart from nobody having said anything.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localStamp } from '@shared/time.ts'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let loops: typeof import('../src/server/lib/openloops.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let WORKSPACE = 'panelx-case-0'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  loops = await import('../src/server/lib/openloops.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` })
})

const AGENT = { type: 'agent' as const, id: 'claude-code' }

/** A problem with a long summary, so the corpus really outgrows the 16 KB budget. */
const problem = (title: string, move: string | null): string =>
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'problem',
    title,
    summary:
      `${title} — the account of it, written at the length a real record is written at, so that this corpus ` +
      'weighs what a real one weighs and the size limit in openLoopsFor is reached rather than imagined.',
    data: { state: 'open', ...(move === null ? {} : { whose_move: move }) },
    // WHO FILES IT DECIDES WHAT AN ABSENT `whose_move` MEANS, since 3 September 2026. A problem an
    // AGENT files says "agent" unless the agent names something else — the ruling that an
    // engineering question is the agent's, `design/messages/ACCEPTANCE.md` W3 — so "nobody has said"
    // is now the person's to file. Every case with a word in it is still the agent's.
    actor: move === null ? { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } : AGENT,
  }).id

/**
 * WHEN EACH LOOP LAST CHANGED, WRITTEN STRAIGHT INTO THE TABLE, OLDEST FIRST.
 *
 * WHY THE TEST SETS THESE INSTEAD OF LETTING THE CLOCK SET THEM. `openLoopsFor` drops "the loops
 * that changed longest ago" by sorting on `updatedAt`, and `updatedAt` is a local wall-clock stamp
 * accurate to the SECOND. A test that writes 120 records and lets the clock stamp them gets one of
 * two different corpora depending on how busy the machine is:
 *
 *   - fast machine: every record lands inside one second, every stamp is identical, and the sort
 *     leaves them in the order they were written, so the LAST ones written are dropped first;
 *   - loaded machine: the writes straddle a second boundary, the later records are genuinely newer,
 *     and the sort puts them at the front, so the FIRST ones written are dropped first.
 *
 * Those are opposite answers to "which loop does the cut hide", and this file used to depend on the
 * first one happening. It failed once in a full suite run on 27 August 2026 with *"the corpus did
 * not reach the last resort, so nothing was hidden to find"* and passed alone every time after,
 * which is the signature of that straddle. Reproduced deliberately by pausing 1.1 seconds before
 * the four person-move loops were written: 60 loops dropped and not one of them the person's.
 *
 * So the ages are built rather than hoped for. One minute apart, in the order given, so the sort is
 * a total order with no ties for the database to break as it likes and no clock to disturb it.
 *
 * IT WRITES `updated_at` DIRECTLY because there is no door that backdates a record, and nor should
 * there be: `updatedAt` is what the product wrote when the record last changed. This is the test
 * building a corpus that is a few weeks old, which is what every real corpus is.
 */
const changedAtMinutesApart = (idsOldestFirst: readonly string[]): void => {
  const first = new Date(2026, 0, 1, 3, 0, 0)
  const write = t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?')
  idsOldestFirst.forEach((id, index) => {
    const changed = write.run(localStamp(new Date(first.getTime() + index * 60_000)), id)
    if (changed.changes !== 1) throw new Error(`no record with id ${id} to age`)
  })
}

describe('a corpus big enough that the budget really cuts', () => {
  /** 120 problems: 4 the person's, 16 an agent's, 3 either, 97 with nothing said. */
  const build = (): { theHiddenOne: string } => {
    const made: string[] = []
    for (let i = 0; i < 97; i += 1) {
      made.push(problem(`Loop with nobody saying whose move it is, number ${String(i)}`, null))
    }
    for (let i = 0; i < 16; i += 1) made.push(problem(`Loop an agent can move, number ${String(i)}`, 'agent'))
    for (let i = 0; i < 3; i += 1) made.push(problem(`Loop either can move, number ${String(i)}`, 'either'))
    let hidden = ''
    for (let i = 0; i < 4; i += 1) {
      const id = problem(`Loop only a person can move, number ${String(i)}`, 'person')
      made.push(id)
      if (i === 0) hidden = id
    }
    // THE ONE THE LAST-RESORT DROP TAKES OUT FIRST, because it changed longer ago than any other.
    // That is the loop the old reading hid: dropped from the cut answer, and then counted out of
    // the project's total by a reading that counted the cut list.
    changedAtMinutesApart([hidden, ...made.filter((id) => id !== hidden)])
    return { theHiddenOne: hidden }
  }

  it('the open-loops answer really is cut, so this test is measuring the thing it claims to', () => {
    build()
    const answer = loops.openLoopsFor({ workspaceId: WORKSPACE })
    expect(
      answer.loops.length,
      'the budget did not cut anything, so this file would pass with the defect still in place',
    ).toBeLessThan(answer.attachment.openLoopsInProject)
    expect(answer.counts.leftOut).toBeGreaterThan(0)
  })

  it('whose-move counts every open loop in the project, not the carried list', () => {
    build()
    const cut = loops.openLoopsFor({ workspaceId: WORKSPACE })
    const move = loops.whoseMoveIn(WORKSPACE)

    expect(move.openLoopsInProject).toBe(120)
    expect(move.person.length).toBe(4)
    expect(move.agent.length).toBe(16)
    expect(move.either.length).toBe(3)
    expect(move.nobodyHasSaid.count).toBe(97)
    // The whole population is accounted for: nothing is quietly in no group.
    expect(move.person.length + move.agent.length + move.either.length + move.nobodyHasSaid.count + move.unreadable.count).toBe(
      move.openLoopsInProject,
    )
    // AND IT IS A DIFFERENT NUMBER FROM THE CUT ONE. If these agree the corpus is too small and the
    // check above would have caught it, but saying it here is what names the defect.
    expect(move.person.length + move.agent.length + move.either.length).not.toBe(
      cut.whoseMove.person + cut.whoseMove.agent + cut.whoseMove.either + cut.whoseMove.nobodyHasSaid,
    )
  })

  it('the loop the cut would hide is in the answer, by id', () => {
    const { theHiddenOne } = build()
    const cut = loops.openLoopsFor({ workspaceId: WORKSPACE })
    const dropped = cut.leftOut.find((group) => group.bucket === 'quiet_the_longest')?.ids ?? []
    // TWO SEPARATE FAILURES, SO NEITHER MESSAGE CAN DESCRIBE THE OTHER. The old single assertion
    // said "the corpus did not reach the last resort" when what had actually happened was that the
    // cut took out a different loop, and that wrong sentence is what made the flake hard to read.
    expect(dropped.length, 'the corpus did not reach the last resort, so nothing was hidden to find').toBeGreaterThan(0)
    expect(dropped, 'the cut took out other loops and left the oldest one in').toContain(theHiddenOne)
    expect(
      loops.whoseMoveIn(WORKSPACE).person.map((loop) => loop.id),
      'a loop whose move is the person’s is missing from the project answer',
    ).toContain(theHiddenOne)
  })

  it('says out loud that it is not cut', () => {
    build()
    const note = loops.whoseMoveIn(WORKSPACE).note
    expect(note).toContain('Of 120 open loops in this project')
    expect(note).toContain('all of them, not a page of them')
    expect(note).toContain('NOT CUT TO A SIZE')
  })
})

describe('the reading that IS cut says so beside its own number', () => {
  it('names the project total in the same sentence as the carried count', () => {
    for (let i = 0; i < 60; i += 1) problem(`A loop, number ${String(i)}`, null)
    const answer = loops.openLoopsFor({ workspaceId: WORKSPACE })
    // Both numbers, one sentence. A number on its own is read as the answer.
    expect(answer.note).toContain(`${String(answer.loops.length)} of the ${String(answer.counts.candidates)} open loops`)
    expect(answer.note).toContain('carried here')
  })

  it('says its own whoseMove tally is of the carried list and points at the project answer', () => {
    for (let i = 0; i < 60; i += 1) problem(`A loop, number ${String(i)}`, 'agent')
    const answer = loops.openLoopsFor({ workspaceId: WORKSPACE })
    expect(answer.note).toContain('are of the')
    expect(answer.note).toContain('not of the project')
    expect(answer.note).toContain('GET /api/whose-move counts all')
  })
})

describe('a word nobody can read is not the same as nobody having said', () => {
  it('is counted and named on its own', () => {
    const id = problem('A loop whose move somebody wrote in a word Mole Office does not have', null)
    // Written straight into the table: the write gate refuses a word outside the vocabulary, and
    // this is the state an imported corpus arrives in.
    writeDataBypassingTheGate(t, id, { state: 'open', whose_move: 'the intern' })
    problem('A loop nobody has said anything about', null)

    const move = loops.whoseMoveIn(WORKSPACE)
    expect(move.unreadable.ids).toEqual([id])
    expect(move.nobodyHasSaid.ids, 'an unreadable word was folded into the honest answer').not.toContain(id)
    expect(move.nobodyHasSaid.count).toBe(1)
    expect(move.note).toContain('carry a word Mole Office cannot read')
  })
})

describe('one membership rule, not two', () => {
  it('the project answer and the open-loops candidates are the same population', () => {
    for (let i = 0; i < 12; i += 1) problem(`A loop, number ${String(i)}`, null)
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'A problem that is done',
      data: { state: 'fixed' },
      actor: AGENT,
    })
    const answer = loops.openLoopsFor({ workspaceId: WORKSPACE })
    const move = loops.whoseMoveIn(WORKSPACE)
    // 12 open + 1 finished = 13 candidates; the finished one is out of both, once.
    expect(answer.counts.candidates).toBe(13)
    expect(answer.attachment.openLoopsInProject).toBe(12)
    expect(move.openLoopsInProject).toBe(12)
  })
})
