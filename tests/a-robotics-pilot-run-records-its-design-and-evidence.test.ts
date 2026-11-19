// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROBOTICS PILOT RUN SHOWS AT ITS SEAL WHAT IT WAS JUDGED ON: its design, the project chapter, and the review that
 * counted. Part 7 of the design-first build of wave 13s's requirements, design-9 of the secretary's accepted report
 * jtLSI8sX0KsC, on the coordinator's decsion bYwACBK03tGT, the answers hL0xQI9EfpCO and the review rule TkDhXpGWhkTx.
 *
 * THE PILOT'S ACCEPTANCE EXAMPLES, proved at the run, in order, on one made-up world (design-9 asks that the observed
 * outputs and the project, rule, design and review revisions be recorded):
 *   1. a robotics method run with a reviewed design and the literature_search, open_implementations_search and
 *      owner_purpose_comparison accounts seals without a design reminder;
 *   2. removing each account names that account and the source of the rule that asked for it, and the kept reminder
 *      records the design's revision, the chapter's revision and the review that counted;
 *   3. a threshold with no source is named, and the kept reminder records the same three;
 *   4. after the design is corrected and reviewed again, the next run has no reminder;
 *   5. another project's run and an office-started run receive no robotics reminder, and the office-started run is
 *      refused a method mark;
 *   6. a stale review, a review by somebody the design does not count from, an unreadable rule, unreadable evidence and
 *      a rule changed after its review each receive their own answer and do not pass.
 *
 * WHAT THIS FILE DOES NOT REPEAT: the chapter door's own proof that a rule which weakens a general rule, or names a
 * program, is refused at registration is case 4 of tests/project-rules-the-door.test.ts. This file proves what the run
 * is told when a stored rule does not read, not how such a rule is refused a place in a chapter.
 *
 * WHAT IS REAL: the made-up world of tests/a-world-of-method-runs.ts, in a scratch office and a scratch git folder.
 * Every project, agent, rule, design, run and record is made up. No worker starts.
 *
 * MUTATION PROOF, after a control run, each mutation alone and then restored: (a) the named entry drops
 * designRevision, chapterRevision and review, and cases 2, 3 and 6 are red; (b) the review that counted is always null,
 * and cases 2, 3 and 6 are red; (c) an office-started run may be marked, and case 5 is red. Cases 1 and 4 pass in all
 * three, as they should: they are about an answer the run-level reminder already gave in part 6.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aReportInForm } from './a-run-in-form.ts'
import { aWorldOfMethodRuns, type ARun, type AWorldOfMethodRuns } from './a-world-of-method-runs.ts'

const OTHER = 'made-up-other'

let w: AWorldOfMethodRuns
let good = ''
let goodReview = ''
let chapterRevision = 0

type Named = {
  design: string | null
  answer: string
  rule: string | null
  source: string | null
  designRevision?: number | null
  chapterRevision?: number | null
  review?: string | null
  says: string
}

/** A run of the worker, marked by the assigner, linking these designs. */
async function aMarkedRun(designs: string[], project?: string): Promise<ARun> {
  const run = await w.aRun(project)
  for (const design of designs) w.link(run.id, design)
  const marked = await w.mark(run.id, { ...w.assigner.headers, 'x-mole-office-workspace': project ?? 'made-up-robotics' }, { work: 'method-work', because: 'Made-up: the run builds the grasp method.' })
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
const currentRevision = async (id: string): Promise<number> => (await import('../src/server/lib/revisions.ts')).numbering(id).highest

beforeAll(async () => {
  w = await aWorldOfMethodRuns()
  await w.usePilotChapter()
  const { readTheProjectChapter } = await import('../src/server/lib/project-rules.ts')
  chapterRevision = readTheProjectChapter('made-up-robotics').version ?? 0
  good = await w.aPilotDesign()
  goodReview = await w.review(good, w.secretary.headers)
}, 60_000)

afterAll(async () => {
  await w?.close()
})

describe('the robotics pilot, judged at each run', () => {
  it('1. a method run with a reviewed design and the three accounts seals without a design reminder', async () => {
    const run = await aMarkedRun([good])
    // The run's report is in form, so the write after the reminder seals.
    await aReportInForm(w.t, run.id, w.worker.handle)
    const said = await reminded(run)
    expect(said.design, JSON.stringify(said.design)).toBeUndefined()
    expect(keptFor(run.id)).toEqual([])
    const sealed = await w.finish(run)
    expect(sealed.status, sealed.raw).toBe(200)
    expect(w.t.api.getRecord(run.id)!.data['state']).toBe('finished')
  })

  it('2. removing each account names it, its rule and its source, and the reminder records what was judged', async () => {
    const accounts = [
      ['literature_search', 'literature-search'],
      ['open_implementations_search', 'open-implementations'],
      ['owner_purpose_comparison', 'owner-purpose'],
    ] as const
    for (const [account, rule] of accounts) {
      const design = await w.aPilotDesign({
        evidence: accounts.filter(([name]) => name !== account).map(([name]) => ({ name, record: w.evidence[name] })),
      })
      const review = await w.review(design, w.secretary.headers)
      const run = await aMarkedRun([design])
      const said = await reminded(run)
      expect(said.design!.named.map((one) => [one.design, one.answer, one.rule]), account).toEqual([[design, 'missing', rule]])
      const named = said.design!.named[0]!
      expect(named.source).toBe(w.source)
      expect(named.designRevision).toBe(await currentRevision(design))
      expect(named.chapterRevision).toBe(chapterRevision)
      expect(named.review).toBe(review)
      expect(named.says).toContain(account)
      expect(named.says).toContain(w.source)
      // THE KEPT RECORD CARRIES THE SAME ENTRY, so the count and the page read what the run was told.
      expect(keptFor(run.id)[0]!.data['named']).toEqual([named])
    }
  })

  it('3. a threshold with no source is named, with the revisions and review that counted', async () => {
    const unsourced = 'Made-up: a grasp passes at 9 of 10.'
    const design = await w.aPilotDesign({ thresholds: [{ what: unsourced }] })
    const review = await w.review(design, w.secretary.headers)
    const run = await aMarkedRun([design])
    const said = await reminded(run)
    expect(said.design!.named.map((one) => [one.design, one.answer, one.rule])).toEqual([[design, 'missing', 'sourced-thresholds']])
    const named = said.design!.named[0]!
    expect(named.source).toBe(w.source)
    expect(named.says).toContain(unsourced)
    expect(named.says).toContain(w.source)
    expect(named.designRevision).toBe(await currentRevision(design))
    expect(named.chapterRevision).toBe(chapterRevision)
    expect(named.review).toBe(review)
  })

  it('4. after correction and a fresh review, the next run has no reminder', async () => {
    const missing = ['open_implementations_search']
    const design = await w.aPilotDesign({
      evidence: ['literature_search', 'owner_purpose_comparison'].map((name) => ({ name, record: w.evidence[name] })),
    })
    await w.review(design, w.secretary.headers)
    const first = await aMarkedRun([design])
    const said = await reminded(first)
    expect(said.design!.named[0]!.answer).toBe('missing')
    expect(said.design!.named[0]!.says).toContain(missing[0]!)
    const corrected = await w.call('PATCH', `/api/records/${design}`, w.person, {
      dataPatch: { evidence: ['literature_search', 'open_implementations_search', 'owner_purpose_comparison'].map((name) => ({ name, record: w.evidence[name] })) },
    })
    expect(corrected.status, corrected.raw).toBe(200)
    await w.review(design, w.secretary.headers)
    const next = await aMarkedRun([design])
    const after = await reminded(next)
    expect(after.design, JSON.stringify(after.design)).toBeUndefined()
    expect(keptFor(next.id)).toEqual([])
  })

  it("5. another project's run and an office-started run get no robotics reminder, and the office run is refused a mark", async () => {
    const theirs = await w.aDesign({ evidence: [] }, OTHER)
    await w.review(theirs, { ...w.secretary.headers, 'x-mole-office-workspace': OTHER })
    const other = await aMarkedRun([theirs], OTHER)
    const otherSaid = await reminded(other)
    expect(otherSaid.design, 'a robotics rule reached another project').toBeUndefined()

    const office = await w.anOfficeRun()
    w.link(office.id, good)
    const refused = await w.mark(office.id, w.person, { work: 'method-work', because: 'Made-up: the office run builds the method.' })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body.error).toContain('started by the office')
    const officeSaid = await reminded(office)
    expect(officeSaid.design, 'an office-started run was given a design reminder').toBeUndefined()
  })

  it('6. each wrong design and rule gets its own answer, and none passes', async () => {
    const stale = await w.aPilotDesign()
    const staleReview = await w.review(stale, w.secretary.headers)
    w.t.api.patchRecord(stale, { title: 'Made-up design changed after its review' }, { type: 'human', id: w.person['x-mole-office-actor-id']! })
    const staleSaid = await reminded(await aMarkedRun([stale]))
    expect(staleSaid.design!.named.map((one) => [one.design, one.answer, one.rule])).toEqual([[stale, 'stale-review', null]])
    expect(staleSaid.design!.named[0]!.review).toBe(staleReview)
    expect(staleSaid.design!.named[0]!.designRevision).toBe(await currentRevision(stale))

    const wrong = await w.aPilotDesign()
    await w.review(wrong, w.bystander.headers)
    const wrongSaid = await reminded(await aMarkedRun([wrong]))
    expect(wrongSaid.design!.named.map((one) => [one.design, one.answer, one.rule])).toEqual([[wrong, 'wrong-reviewer', null]])
    expect(wrongSaid.design!.named[0]!.review).toBeNull()

    const brokenEvidence = await w.aPilotDesign({
      evidence: [
        { name: 'literature_search', record: 'madeUpNoSuch' },
        { name: 'open_implementations_search', record: w.evidence['open_implementations_search'] },
        { name: 'owner_purpose_comparison', record: w.evidence['owner_purpose_comparison'] },
      ],
    })
    const unreadableReview = await w.review(brokenEvidence, w.secretary.headers)
    const unreadableSaid = await reminded(await aMarkedRun([brokenEvidence]))
    expect(unreadableSaid.design!.named.map((one) => [one.design, one.answer, one.rule])).toEqual([[brokenEvidence, 'unreadable', 'literature-search']])
    expect(unreadableSaid.design!.named[0]!.review).toBe(unreadableReview)
    expect(unreadableSaid.design!.named[0]!.says).toContain('madeUpNoSuch')

    const changed = await w.aPilotDesign()
    const changedReview = await w.review(changed, w.secretary.headers)
    const beforeChange = chapterRevision
    await w.usePilotChapter({ text: 'Made-up: the rule changed after the review.' })
    const changedSaid = await reminded(await aMarkedRun([changed]))
    expect(changedSaid.design!.named.map((one) => [one.design, one.answer, one.rule])).toEqual([[changed, 'rule-changed', null]])
    expect(changedSaid.design!.named[0]!.says).toContain('literature-search')
    expect(changedSaid.design!.named[0]!.review).toBe(changedReview)
    expect(changedSaid.design!.named[0]!.chapterRevision).toBe(beforeChange + 1)

    // AND A RULE THAT DOES NOT READ IS NAMED, never taken as met. How it is refused a place in a chapter is
    // tests/project-rules-the-door.test.ts, case 4.
    const chapter = w.t.client.sqlite.prepare('SELECT id FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL').get('project_chapter', 'made-up-robotics') as { id: string }
    w.t.client.sqlite
      .prepare("UPDATE records SET data = json_insert(data, '$.rules[#]', json(?)) WHERE id = ?")
      .run(JSON.stringify({ id: 'runs-a-program', heading: 'Made-up broken rule', text: 'Made-up.', reason: 'Made-up.', source: w.source, trigger: 'method-work', check: { name: 'node made-up.mjs' }, effect: 'remind', on: true, revision: 1 }), chapter.id)
    const whole = await w.aPilotDesign()
    await w.review(whole, w.secretary.headers)
    const unreadableRule = await reminded(await aMarkedRun([whole]))
    const broken = unreadableRule.design!.named.filter((one) => one.rule === 'runs-a-program')
    expect(broken, JSON.stringify(unreadableRule.design!.named)).toHaveLength(1)
    expect(broken[0]!.answer).toBe('not-checked')
    expect(broken[0]!.says).toContain('node made-up.mjs')
    await w.usePilotChapter()
  })
})
