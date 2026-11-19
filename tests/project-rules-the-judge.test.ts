// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROJECT'S OWN RULES SAY OF ONE DESIGN, AND HOW A DESIGN IS REVIEWED. Wave 13s round 226, part 3 of the
 * design-first build: the design kind, the design review, and the judge that answers each rule of the design's own
 * project. The kinds are declared in src/shared/kinds.ts, the judge and the one writer of a review in
 * src/server/lib/project-rules.ts, the review's door in src/server/api/project-rules.ts, and the guard that refuses
 * the general doors in `assertMayWrite` (src/server/lib/records.ts).
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every project, agent,
 * rule, design and record here is made up. The chapters are written under the doors' mark, as part 4's door will.
 *
 * WHAT IT DOES NOT PROVE: which run is method work, and the reminder before the seal. The acceptance examples that
 * speak of a run (an office run gets no robotics reminder) are next round's, with the line that owns the seal.
 *
 * THE CASES, in order, on one world (the robotics project's chapter has three evidence rules, a reviewed-design rule
 * and a threshold rule at method work, one evidence rule turned off, and one rule asked at the go):
 *   1. a design reviewed by the secretary its assigner answers to, with its three evidence accounts and its sourced
 *      threshold, gets no reminder: every rule asked answers met, the rule turned off answers off, and the rule of
 *      the go is not asked at method work;
 *   2. with each evidence account missing in turn, that rule alone answers missing, naming the account and the
 *      rule's source;
 *   3. a threshold with no source is answered missing, and names that threshold and no other;
 *   4. evidence whose record is deleted, or whose record does not exist, answers unreadable and names the record;
 *   5. a design of another project is answered by that project's chapter only: none where it keeps none, and its own
 *      rule and none of robotics' where it keeps one; a robotics design never hears the other project's rule;
 *   6. a review of an earlier revision answers stale-review, and a review of the current revision is met again;
 *   7. a review by an agent the design does not count from, or by its own assigner, answers wrong-reviewer; no review
 *      answers no-review; the person's own review counts;
 *   8. a review that asks for changes answers changes-asked;
 *   9. a rule changed after the review answers rule-changed, naming it, until the design is reviewed again;
 *  10. a stored rule that does not read answers not-checked, at either trigger, and is never taken as met;
 *  11. the review door writes the reviewer from the key, refuses a reviewer in the body, a revision that is not the
 *      design's current one, an agent with no key and a review of something that is not a design; and POST
 *      /api/records of a design review is refused, to the person too.
 *
 * MUTATIONS, each run alone after a green control and put back after (8 November 2026). All are in
 * src/server/lib/project-rules.ts but the last, which is in src/server/lib/records.ts:
 *   - evidence whose record cannot be read is not asked for: case 4 is red;
 *   - a design with no evidence account for a rule answers met: cases 2 and 5 are red;
 *   - a threshold with no source answers met: case 3 is red;
 *   - a design's chapter is read from any project: case 5 is red;
 *   - the assigner's own review counts as well: case 7 is red;
 *   - a review of an earlier revision answers met: case 6 is red;
 *   - a review that asks for changes answers met: case 8 is red;
 *   - a rule changed after the review answers met: case 9 is red;
 *   - a stored rule that does not read is left out of the answers: case 10 is red;
 *   - a rule turned off is asked like any other: cases 1, 2, 5 and 11 are red;
 *   - an agent with no key may write a review: case 11 is red;
 *   - a review of a revision that is not the design's current one is written: case 11 is red;
 *   - the design review's guard is taken out of `assertMayWrite`: case 11 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const ROBOTICS = 'made-up-robotics'
const OTHER = 'made-up-other'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': ROBOTICS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, raw: reply.body }
}

/** An agent's own headers in a project: its handle, and its key where it sends one. */
function asAgent(handle: string, key: string | null, project = ROBOTICS): Record<string, string> {
  return {
    'x-mole-office-workspace': project,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === null ? {} : { 'x-mole-office-key': key }),
  }
}

/** Register an agent through the starter door, as `by`, and hand back its id and the key it was answered. */
async function register(handle: string, by: Record<string, string>, role?: string): Promise<{ id: string; key: string; headers: Record<string, string> }> {
  const made = await call('POST', '/api/agents/started', { ...by, 'x-mole-office-workspace': 'default' }, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(made.status, made.raw).toBe(201)
  const key = String(made.body.whatToGiveIt?.key)
  expect(/^[0-9a-f]{64}$/.test(key), `the registration of ${handle} answered no key`).toBe(true)
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
  return { id, key, headers: asAgent(handle, key) }
}

async function aNote(title: string, project = ROBOTICS): Promise<string> {
  const made = await call('POST', '/api/records', { ...PERSON, 'x-mole-office-workspace': project }, { kind: 'note', title, data: { body: 'Made-up.' } })
  expect(made.status, made.raw).toBe(201)
  return made.body.record.id
}

let secretary: Awaited<ReturnType<typeof register>>
let assigner: Awaited<ReturnType<typeof register>>
let bystander: Awaited<ReturnType<typeof register>>
const source: Record<string, string> = {}
const evidence: Record<string, string> = {}

/** A made-up rule as its door stores it. */
function aRule(id: string, check: Record<string, unknown>, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    heading: `Made-up rule ${id}`,
    text: `Made-up: the rule ${id}.`,
    reason: `Made-up: why ${id} is kept.`,
    source: source[id] ?? source['general'],
    trigger: 'method-work',
    check,
    effect: 'remind',
    on: true,
    revision: 1,
    ...more,
  }
}

function theRoboticsRules(): Record<string, unknown>[] {
  return [
    aRule('reviewed-design', { name: 'reviewed-design-linked' }),
    aRule('grasp-trials', { name: 'evidence-linked', evidence: 'grasp_trials' }),
    aRule('cloth-trials', { name: 'evidence-linked', evidence: 'cloth_trials' }),
    aRule('failure-log', { name: 'evidence-linked', evidence: 'failure_log' }),
    aRule('sourced-thresholds', { name: 'threshold-names-its-source' }),
    aRule('calibration-log', { name: 'evidence-linked', evidence: 'calibration_log' }, { on: false }),
    aRule('pilot-go', { name: 'reviewed-design-linked' }, { trigger: 'go' }),
  ]
}

/** Write a project's chapter as its doors will: created the first time, its rules replaced after. Answers its id. */
async function writeTheChapter(project: string, rules: unknown[]): Promise<string> {
  const { createRecord, patchRecord } = await import('../src/server/lib/records.ts')
  const { asTheProjectRulesDoors } = await import('../src/server/lib/project-rules-door.ts')
  const { theChapterOfProject } = await import('../src/server/lib/project-rules.ts')
  const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
  const there = theChapterOfProject(project)
  return asTheProjectRulesDoors(() => {
    if (there === null) return createRecord({ kind: 'project_chapter', title: `Made-up rules of ${project}`, data: { rules }, workspaceId: project, actor }).id
    patchRecord(there.id, { data: { rules } }, actor)
    return there.id
  })
}

/** A whole made-up design, assigned by the assigner, with its three evidence accounts and a sourced threshold. */
function aDesign(more: Record<string, unknown> = {}): Record<string, unknown> {
  const row = { feasibility: 'Made-up: yes.', novelty: 'Made-up: little.', difficulty: 'Made-up: two weeks.', risk: 'Made-up: too few trials.', fit: 'Made-up: good.' }
  return {
    purpose: 'Made-up: teach a made-up arm to pick up cups and cloths.',
    assignedBy: { kind: 'agent', id: assigner.id },
    candidatesAsked: 2,
    candidatesWhy: 'Made-up: two ways are known.',
    candidates: [
      { name: 'A', summary: 'Made-up: learn from demonstrations.' },
      { name: 'B', summary: 'Made-up: plan from a model.' },
    ],
    chosen: 'A',
    evaluation: [
      { candidate: 'A', ...row },
      { candidate: 'B', ...row },
    ],
    pilot: 'Made-up: ten grasps of one cup.',
    sources: ['Made-up: a benchmark nobody wrote.'],
    thresholds: [{ what: 'Made-up: a grasp passes at 8 of 10.', source: 'Made-up: table 3.' }],
    evidence: [
      { name: 'grasp_trials', record: evidence['grasp_trials'] },
      { name: 'cloth_trials', record: evidence['cloth_trials'] },
      { name: 'failure_log', record: evidence['failure_log'] },
    ],
    ...more,
  }
}

let designs = 0
async function fileADesign(more: Record<string, unknown> = {}, project = ROBOTICS): Promise<string> {
  designs += 1
  const made = await call('POST', '/api/records', { ...PERSON, 'x-mole-office-workspace': project }, { kind: 'design', title: `Made-up design ${String(designs)}`, data: aDesign(more) })
  expect(made.status, made.raw).toBe(201)
  return made.body.record.id
}

async function currentRevision(id: string): Promise<number> {
  const { numbering } = await import('../src/server/lib/revisions.ts')
  return numbering(id).highest
}

async function review(design: string, who: Record<string, string>, verdict = 'approved', revision?: number): ReturnType<typeof call> {
  return call('POST', `/api/designs/${design}/reviews`, who, { designRevision: revision ?? (await currentRevision(design)), verdict, words: 'Made-up: read through.' })
}

async function reviewed(design: string, who: Record<string, string> = secretary.headers, verdict = 'approved'): Promise<void> {
  const done = await review(design, who, verdict)
  expect(done.status, done.raw).toBe(201)
}

async function judge(design: string, trigger: 'method-work' | 'go' = 'method-work') {
  const { judgeADesign } = await import('../src/server/lib/project-rules.ts')
  return judgeADesign(design, trigger)
}

function answerOf(judged: Awaited<ReturnType<typeof judge>>, rule: string) {
  const found = judged.answers.filter((one) => one.rule === rule)
  expect(found, `rule ${rule} was answered ${String(found.length)} times: ${JSON.stringify(judged.answers)}`).toHaveLength(1)
  return found[0]!
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [id, title] of [[ROBOTICS, 'Made-up robotics'], [OTHER, 'Made-up other']] as const) {
    const made = await call('POST', '/api/workspaces', { ...PERSON, 'x-mole-office-workspace': 'default' }, { id, title })
    expect(made.status, made.raw).toBe(201)
  }
  secretary = await register('made-up-secretary', PERSON, 'secretary')
  assigner = await register('made-up-assigner', asAgent('made-up-secretary', secretary.key))
  bystander = await register('made-up-bystander', PERSON, 'supervisor')
  for (const id of ['general', 'grasp-trials', 'cloth-trials', 'failure-log', 'sourced-thresholds']) source[id] = await aNote(`Made-up decision behind ${id}`)
  for (const name of ['grasp_trials', 'cloth_trials', 'failure_log']) evidence[name] = await aNote(`Made-up evidence ${name}`)
  await writeTheChapter(ROBOTICS, theRoboticsRules())
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a project's own rules, asked of one design", () => {
  it('1. a reviewed design with its three evidence accounts and a sourced threshold gets no reminder', async () => {
    const { theSecretaryAgentAnswersTo } = await import('../src/server/lib/claims.ts')
    expect(theSecretaryAgentAnswersTo(assigner.id), 'the assigner answers to no secretary, so the world is wrong').toEqual({ kind: 'agent', id: secretary.id })
    const design = await fileADesign()
    await reviewed(design)
    const judged = await judge(design)
    expect(judged.project).toBe(ROBOTICS)
    expect(judged.answers.map((one) => [one.rule, one.answer])).toEqual([
      ['reviewed-design', 'met'],
      ['grasp-trials', 'met'],
      ['cloth-trials', 'met'],
      ['failure-log', 'met'],
      ['sourced-thresholds', 'met'],
      ['calibration-log', 'off'],
    ])
    expect(judged.reminds).toBe(false)
    const atTheGo = await judge(design, 'go')
    expect(atTheGo.answers.map((one) => [one.rule, one.answer])).toEqual([['pilot-go', 'met']])
    expect(atTheGo.reminds).toBe(false)
  })

  it('2. with each evidence account missing in turn, that rule answers missing and names the account and its source', async () => {
    for (const [name, rule] of [['grasp_trials', 'grasp-trials'], ['cloth_trials', 'cloth-trials'], ['failure_log', 'failure-log']] as const) {
      const design = await fileADesign({ evidence: (aDesign()['evidence'] as { name: string }[]).filter((one) => one.name !== name) })
      await reviewed(design)
      const judged = await judge(design)
      const answer = answerOf(judged, rule)
      expect(answer.answer).toBe('missing')
      expect(answer.names).toEqual([name])
      expect(answer.source).toBe(source[rule])
      expect(answer.says).toContain(name)
      expect(answer.says).toContain(source[rule]!)
      expect(judged.answers.filter((one) => one.rule !== rule && one.answer !== 'off').every((one) => one.answer === 'met'), JSON.stringify(judged.answers)).toBe(true)
      expect(judged.reminds).toBe(true)
    }
  })

  it('3. a threshold with no source is answered missing, naming that threshold and no other', async () => {
    const design = await fileADesign({ thresholds: [{ what: 'Made-up: a grasp passes at 8 of 10.', source: 'Made-up: table 3.' }, { what: 'Made-up: a cloth passes at 9 of 10.' }] })
    await reviewed(design)
    const answer = answerOf(await judge(design), 'sourced-thresholds')
    expect(answer.answer).toBe('missing')
    expect(answer.names).toEqual(['Made-up: a cloth passes at 9 of 10.'])
    expect(answer.says).toContain(source['sourced-thresholds']!)
  })

  it('4. evidence whose record is deleted or does not exist answers unreadable, and names the record', async () => {
    const gone = await aNote('Made-up evidence, deleted')
    const deleted = await call('DELETE', `/api/records/${gone}`, PERSON)
    expect(deleted.status, deleted.raw).toBe(200)
    const design = await fileADesign({
      evidence: [
        { name: 'grasp_trials', record: 'madeUpNoSuch' },
        { name: 'cloth_trials', record: evidence['cloth_trials'] },
        { name: 'failure_log', record: gone },
      ],
    })
    await reviewed(design)
    const judged = await judge(design)
    expect(answerOf(judged, 'grasp-trials')).toMatchObject({ answer: 'unreadable', names: ['madeUpNoSuch'] })
    expect(answerOf(judged, 'failure-log')).toMatchObject({ answer: 'unreadable', names: [gone] })
    expect(answerOf(judged, 'cloth-trials').answer).toBe('met')
    expect(judged.reminds).toBe(true)
  })

  it("5. a design is answered by its own project's chapter and never by another's", async () => {
    const theirs = await fileADesign({ evidence: [] }, OTHER)
    const none = await judge(theirs)
    expect(none.chapter).toBeNull()
    expect(none.answers).toEqual([])
    expect(none.reminds).toBe(false)
    source['other-only'] = await aNote('Made-up decision of the other project', OTHER)
    await writeTheChapter(OTHER, [aRule('other-only', { name: 'evidence-linked', evidence: 'other_only' })])
    const own = await judge(theirs)
    expect(own.answers.map((one) => [one.rule, one.answer])).toEqual([['other-only', 'missing']])
    const ours = await fileADesign()
    await reviewed(ours)
    const robotics = await judge(ours)
    expect(robotics.answers.map((one) => one.rule)).not.toContain('other-only')
    expect(robotics.reminds).toBe(false)
  })

  it('6. a review of an earlier revision is stale, and a review of the current one is met again', async () => {
    const design = await fileADesign()
    await reviewed(design)
    const changed = await call('PATCH', `/api/records/${design}`, PERSON, { dataPatch: { pilot: 'Made-up: twelve grasps of one cup.' } })
    expect(changed.status, changed.raw).toBe(200)
    expect(answerOf(await judge(design), 'reviewed-design').answer).toBe('stale-review')
    await reviewed(design)
    expect(answerOf(await judge(design), 'reviewed-design').answer).toBe('met')
  })

  it('7. a review by somebody the design does not count from is wrong-reviewer; none is no-review; the person counts', async () => {
    const design = await fileADesign()
    expect(answerOf(await judge(design), 'reviewed-design').answer).toBe('no-review')
    await reviewed(design, bystander.headers)
    await reviewed(design, assigner.headers)
    const wrong = answerOf(await judge(design), 'reviewed-design')
    expect(wrong.answer).toBe('wrong-reviewer')
    expect(wrong.names).toHaveLength(2)
    await reviewed(design, PERSON)
    expect(answerOf(await judge(design), 'reviewed-design').answer).toBe('met')
  })

  it('8. a review that asks for changes answers changes-asked', async () => {
    const design = await fileADesign()
    await reviewed(design, secretary.headers, 'changes-asked')
    expect(answerOf(await judge(design), 'reviewed-design').answer).toBe('changes-asked')
  })

  it('9. a rule changed after the review answers rule-changed, naming it, until the design is reviewed again', async () => {
    const design = await fileADesign()
    await reviewed(design)
    const chapter = await writeTheChapter(ROBOTICS, theRoboticsRules())
    const next = (await currentRevision(chapter)) + 1
    await writeTheChapter(ROBOTICS, theRoboticsRules().map((one) => (one['id'] === 'sourced-thresholds' ? { ...one, text: 'Made-up: changed.', revision: next } : one)))
    expect(await currentRevision(chapter)).toBe(next)
    const answer = answerOf(await judge(design), 'reviewed-design')
    expect(answer.answer).toBe('rule-changed')
    expect(answer.names).toContain('sourced-thresholds')
    await reviewed(design)
    expect(answerOf(await judge(design), 'reviewed-design').answer).toBe('met')
  })

  it('10. a stored rule that does not read answers not-checked at either trigger, and is never met', async () => {
    const design = await fileADesign()
    const chapter = await writeTheChapter(ROBOTICS, theRoboticsRules())
    // NO DOOR STORES THIS RULE: the shape refuses a check outside the closed list at every write. So it goes into the
    // stored row the only way one gets there, by a hand on the database.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_insert(data, '$.rules[#]', json(?)) WHERE id = ?")
      .run(JSON.stringify(aRule('runs-a-program', { name: 'node made-up.mjs' })), chapter)
    await reviewed(design)
    for (const trigger of ['method-work', 'go'] as const) {
      const judged = await judge(design, trigger)
      const answer = answerOf(judged, 'runs-a-program')
      expect(answer.answer).toBe('not-checked')
      expect(answer.says).toContain('node made-up.mjs')
      expect(judged.reminds).toBe(true)
    }
    await writeTheChapter(ROBOTICS, theRoboticsRules())
  })

  it('11. the review door writes the reviewer from the key, and refuses everything else', async () => {
    const design = await fileADesign()
    const before = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'design_review'").get() as { n: number }).n
    const named = await call('POST', `/api/designs/${design}/reviews`, secretary.headers, { designRevision: await currentRevision(design), verdict: 'approved', words: 'Made-up.', reviewer: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
    expect(named.status, named.raw).toBe(400)
    const stale = await review(design, secretary.headers, 'approved', (await currentRevision(design)) + 1)
    expect(stale.status, stale.raw).toBe(409)
    const keyless = await review(design, asAgent('made-up-secretary', null))
    expect(keyless.status, keyless.raw).toBe(403)
    const notADesign = await review(source['general']!, secretary.headers, 'approved', 1)
    expect(notADesign.status, notADesign.raw).toBe(400)
    const general = await call('POST', '/api/records', PERSON, { kind: 'design_review', title: 'Made-up review', data: { design, designRevision: 1, verdict: 'approved', words: 'Made-up.', reviewer: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } } })
    expect(general.status, general.raw).toBe(403)
    const { A_DESIGN_REVIEW_IS_WRITTEN_BY_ITS_DOOR, THE_DESIGN_REVIEW_DOOR } = await import('../src/shared/project-rules.ts')
    expect(general.body.error).toBe(A_DESIGN_REVIEW_IS_WRITTEN_BY_ITS_DOOR)
    expect(general.body.detail).toBe(THE_DESIGN_REVIEW_DOOR)
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'design_review'").get() as { n: number }).n).toBe(before)
    const done = await review(design, secretary.headers)
    expect(done.status, done.raw).toBe(201)
    expect(done.body.review.data.reviewer).toEqual({ kind: 'agent', id: secretary.id })
    expect(done.body.review.data.designRevision).toBe(await currentRevision(design))
    expect(done.body.review.workspaceId).toBe(ROBOTICS)
    expect(done.body.judged.reminds).toBe(false)
  })
})
