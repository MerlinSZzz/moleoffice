// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN MARKED AS METHOD WORK IS REMINDED, BEFORE ITS SEAL, OF THE REVIEWED DESIGN IT LACKS, AND THE REMINDER IS KEPT.
 * Part 6 of the design-first build of wave 13s's requirements, on the secretary's decision bYwACBK03tGT, hL0xQI9EfpCO answers 4
 * and 5, the owner's decision (reminded only, for a trial week) and the supervisor's vinDV1XnZ2dG, points 3, 4 and
 * 7.
 *
 * A marked run's designs are the design records of its own project that it links by a told about link. Before the
 * seal, each is asked: a review that counts approves its current revision, and the project's own rules at the mark's
 * trigger are met. One design with nothing named is enough. Otherwise what each lacks is added to the reminder before
 * the seal (src/server/lib/before-the-seal.ts, line 13n's, with its yes) and kept as a design_reminder record, which
 * is what the week's count reads. The check is src/server/lib/design-reminders.ts; the setting is
 * MOLE_OFFICE_GATE_REVIEWED_DESIGN in src/config/gates.mjs, remind by default.
 *
 * WHAT IS REAL: the made-up world of tests/a-world-of-method-runs.ts, in a scratch office and a scratch git folder.
 *
 * THE CASES, in order, on one world:
 *   1. a run nobody marked is reminded before the seal with no design part, and nothing is kept or counted for it;
 *   2. a marked run linking a design the secretary approved, with its evidence and sourced threshold, gets no design
 *      part; nor does one linking that design beside a design that lacks something;
 *   3. a marked run linking no design is reminded that it links none: the office's line carries the words, the reply
 *      names the kept record, the record is filed in the run's project with what it named, and the gate counts it;
 *   4. each lack in turn is named on its own: no review, a review by an agent the design does not count from, a review
 *      that asks for changes, a review of an earlier revision, and a missing evidence account with the rule and its
 *      source;
 *   5. a run marked as go is asked the rules of the go only, so an evidence rule of method work names nothing;
 *   6. at remind the run's next write seals, and no second reminder is kept;
 *   7. at off no design is checked: the reminder before the seal comes with no design part, and nothing is kept or
 *      counted;
 *   8. at block the run's next write is refused while the check still names something, nothing is sealed, and each
 *      refusal is counted; once a reviewed design is linked, the write seals.
 *
 * RED BEFORE THE CODE, 8 November 2026, at 17adf3aef (since remade with its author set, as e6a155c12, the same tree),
 * with this file and tests/a-world-of-method-runs.ts in the worktree and the code not yet written: cases 2 to 8 red,
 * each at the mark, which found no such door (404). Case 1 was green, because a run nobody marked got no design part
 * before the code either; the first mutation below is its proof.
 * MUTATION PROOF, 8 November 2026, after a control run of 8 green. Each mutation alone, then restored:
 * - a run nobody marked checked as if it were marked as method work: cases 1 and 2 red.
 * - one design with nothing named no longer enough: case 2 red.
 * - a design's missing or unmet review not named: case 4 red.
 * - a project rule that is not met not named: case 4 red.
 * - the kept design_reminder record naming nothing: case 3 red.
 * - the gate's count not raised for a reminder: cases 3 and 8 red.
 * - a run marked as go asked the rules of method work: case 5 red.
 * - at remind, the next write held as at block: case 6 red.
 * - off no longer skipping the check: case 7 red.
 * - block never holding the write: case 8 red.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { aReportInForm } from './a-run-in-form.ts'
import { aWorldOfMethodRuns, type ARun, type AWorldOfMethodRuns } from './a-world-of-method-runs.ts'

const GATE = 'reviewed-design-before-method-work'
const SETTING = 'MOLE_OFFICE_GATE_REVIEWED_DESIGN'

let w: AWorldOfMethodRuns
let good = ''

type Named ={ design: string | null; answer: string; rule: string | null; source: string | null; says: string }

/** A run of the worker, marked by the assigner, linking these designs. */
async function aMarkedRun(designs: string[], work: 'method-work' | 'go' = 'method-work'): Promise<ARun> {
  const run = await w.aRun()
  for (const design of designs) w.link(run.id, design)
  const marked = await w.mark(run.id, w.assigner.headers, { work, because: 'Made-up: the run builds the grasp method.' })
  expect(marked.status, marked.raw).toBe(200)
  return run
}

/** The run's first write that would seal it: answered with the reminder before the seal, and nothing sealed. */
async function reminded(run: ARun): Promise<{ design?: { reminder: string | null; says: string; named: Named[] }; line: string }> {
  const first = await w.finish(run)
  expect(first.status, first.raw).toBe(200)
  expect(first.body.beforeTheSeal, 'the reminder before the seal did not come').toMatchObject({ sealed: false })
  return first.body.beforeTheSeal
}

const keptFor = (run: string) => w.recordsOfKind('design_reminder').filter((one) => one.data['run'] === run)
const counted = () => w.gateCounts(GATE) ?? { would_stop: 0, stopped: 0, reminded: 0 }
/** The whole words of the reminder's line; its body is only the line's short title. */
const wordsOfLine = (line: string): string => String(w.t.api.getRecord(line)!.data['saidInFull'])
const answersOf = (named: Named[]) => named.map((one) => [one.design, one.answer, one.rule])

beforeAll(async () => {
  w = await aWorldOfMethodRuns()
  good = await w.aDesign()
  await w.review(good, w.secretary.headers)
}, 60_000)

afterEach(() => {
  vi.stubEnv(SETTING, 'remind')
})

afterAll(async () => {
  await w?.close()
})

describe('the reminder of a reviewed design, before the seal of a marked run', () => {
  it('1. a run nobody marked gets no design part, and nothing is kept or counted', async () => {
    const run = await w.aRun()
    const said = await reminded(run)
    expect(said.design).toBeUndefined()
    expect(keptFor(run.id)).toEqual([])
    expect(w.gateCounts(GATE)).toBeUndefined()
  })

  it('2. a marked run linking an approved design that meets the rules gets no design part', async () => {
    const lacking = await w.aDesign({ evidence: [] })
    for (const designs of [[good], [lacking, good]]) {
      const run = await aMarkedRun(designs)
      const said = await reminded(run)
      expect(said.design, JSON.stringify(said.design)).toBeUndefined()
      expect(keptFor(run.id)).toEqual([])
    }
    expect(w.gateCounts(GATE)).toBeUndefined()
  })

  it('3. a marked run linking no design is told so, and the reminder is kept and counted', async () => {
    const before = counted()
    const run = await aMarkedRun([])
    const said = await reminded(run)
    expect(said.design, 'no design part').toBeDefined()
    expect(answersOf(said.design!.named)).toEqual([[null, 'no-design', null]])
    expect(wordsOfLine(said.line)).toContain(said.design!.says)
    const kept = keptFor(run.id)
    expect(kept).toHaveLength(1)
    expect(said.design!.reminder).toBe(kept[0]!.id)
    expect(kept[0]!.workspaceId).toBe(w.t.api.getRecord(run.id)!.workspaceId)
    expect(kept[0]!.data).toMatchObject({ run: run.id, work: 'method-work', markedBy: { kind: 'agent', id: w.assigner.id }, was: 'reminded', named: said.design!.named, reminderLine: said.line, afterSeal: null, judgement: null })
    expect(counted()).toEqual({ would_stop: before.would_stop + 1, stopped: before.stopped, reminded: before.reminded + 1 })
  })

  it('4. each lack is named on its own', async () => {
    const { numbering } = await import('../src/server/lib/revisions.ts')
    const unreviewed = await w.aDesign()
    const byABystander = await w.aDesign()
    await w.review(byABystander, w.bystander.headers)
    const changesAsked = await w.aDesign()
    await w.review(changesAsked, w.secretary.headers, 'changes-asked')
    const stale = await w.aDesign()
    await w.review(stale, w.secretary.headers)
    w.t.api.patchRecord(stale, { title: 'Made-up design changed after its review' }, { type: 'human', id: w.person['x-mole-office-actor-id']! })
    expect(numbering(stale).highest).toBeGreaterThan(1)
    const noTrials = await w.aDesign({ evidence: [{ name: 'cloth_trials', record: w.evidence['cloth_trials'] }, { name: 'failure_log', record: w.evidence['failure_log'] }] })
    await w.review(noTrials, w.secretary.headers)

    for (const [design, answer] of [
      [unreviewed, 'no-review'],
      [byABystander, 'wrong-reviewer'],
      [changesAsked, 'changes-asked'],
      [stale, 'stale-review'],
    ] as const) {
      const said = await reminded(await aMarkedRun([design]))
      expect(answersOf(said.design!.named), answer).toEqual([[design, answer, null]])
    }

    const said = await reminded(await aMarkedRun([noTrials]))
    expect(answersOf(said.design!.named)).toEqual([[noTrials, 'missing', 'grasp-trials']])
    expect(said.design!.named[0]!.source).toBe(w.source)
    expect(said.design!.named[0]!.says).toContain('grasp_trials')
    expect(said.design!.named[0]!.says).toContain(w.source)
  })

  it('5. a run marked as go is asked the rules of the go only', async () => {
    const noTrials = await w.aDesign({ evidence: [] })
    await w.review(noTrials, w.secretary.headers)
    const run = await aMarkedRun([noTrials], 'go')
    const said = await reminded(run)
    expect(said.design, JSON.stringify(said.design)).toBeUndefined()
  })

  it('6. at remind the next write seals, and no second reminder is kept', async () => {
    const run = await aMarkedRun([])
    // The run's report is in form, so the write after the reminder seals and only the design is judged.
    await aReportInForm(w.t, run.id, w.worker.handle)
    await reminded(run)
    const second = await w.finish(run)
    expect(second.status, second.raw).toBe(200)
    expect(second.body.beforeTheSeal).toBeUndefined()
    expect(w.t.api.getRecord(run.id)!.data['state']).toBe('finished')
    expect(keptFor(run.id)).toHaveLength(1)
  })

  it('7. at off no design is checked', async () => {
    vi.stubEnv(SETTING, 'off')
    const before = counted()
    const run = await aMarkedRun([])
    const said = await reminded(run)
    expect(said.design).toBeUndefined()
    expect(keptFor(run.id)).toEqual([])
    expect(counted()).toEqual(before)
  })

  it('8. at block the next write is refused while the check still names something, then seals', async () => {
    vi.stubEnv(SETTING, 'block')
    const before = counted()
    const run = await aMarkedRun([])
    // The run's report is in form, so what refuses this seal is the design alone.
    await aReportInForm(w.t, run.id, w.worker.handle)
    const said = await reminded(run)
    expect(counted()).toEqual({ would_stop: before.would_stop + 1, stopped: before.stopped + 1, reminded: before.reminded })
    for (const n of [1, 2]) {
      const refused = await w.finish(run)
      expect(refused.status, refused.raw).toBe(409)
      for (const one of said.design!.named) expect(refused.body.error).toContain(one.says)
      expect(w.t.api.getRecord(run.id)!.data['state']).toBe('running')
      expect(w.t.api.getRecord(run.id)!.data['sealedTip']).toBeUndefined()
      expect(counted()).toEqual({ would_stop: before.would_stop + 1 + n, stopped: before.stopped + 1 + n, reminded: before.reminded })
    }
    w.link(run.id, good)
    const sealed = await w.finish(run)
    expect(sealed.status, sealed.raw).toBe(200)
    expect(w.t.api.getRecord(run.id)!.data['state']).toBe('finished')
    expect(keptFor(run.id)).toHaveLength(1)
  })
})
