// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S OWN CHAPTER HAS DOORS OF ITS OWN: A READ, A PREVIEW AND ONE WRITER. Wave 13s round 226, part 4 of the
 * design-first build. The doors are in src/server/api/project-rules.ts, and what they do in
 * src/server/lib/project-rules.ts: `readTheProjectChapter`, `previewTheProjectChapter`, `mayWriteTheProjectChapter`
 * and `writeTheProjectChapter`. A rule is read by `readAProjectRule` in src/shared/project-rules.ts, which
 * tests/project-rules-the-chapter.test.ts proves on its own.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every project, agent, rule,
 * decision, duty and record here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. a project with no chapter answers that it keeps none, with no version, and the closed list of checks;
 *   2. the preview names each problem a write would meet, by its own code: a field that would set a general rule aside,
 *      a field that names a program, a check off the list, an id sent twice, a source that is deleted and a source of
 *      another project; it says which rules are new, and writes nothing;
 *   3. the person writes the chapter: every rule takes the revision the write made, which is the version read back,
 *      the reason is kept with that revision, and another project still keeps no chapter;
 *   4. a write is refused, with the chapter edit's code and nothing changed, for a version that is not the current one
 *      (409), for no reason (400), and for a rule that sets a general rule aside or names a program (400);
 *   5. only the person, or a secretary of this project using its own key, writes: an agent's name with no key, an
 *      agent that is not a secretary, a secretary with no duties and a secretary whose duties are in another project are
 *      each refused with 403, and nothing is changed; the secretary with duties in this project writes;
 *   6. a write that changes one rule gives only that rule the new revision; the same rules sent again are refused, and a
 *      rule taken out is gone; the preview says which rules are the same, changed and taken out;
 *   7. a design approved before a rule changed answers rule-changed for that rule alone, so the revision a write gives
 *      is the one the judge reads.
 *
 * MUTATIONS, each run alone after a green control and put back after (8 November 2026), all in
 * src/server/lib/project-rules.ts:
 *   - anybody may write the chapter: case 5 is red;
 *   - a secretary with duties in any project may write it: case 5 is red;
 *   - the version sent is not compared: case 4 is red;
 *   - a rule sent unchanged takes the new revision as well: cases 6 and 7 are red;
 *   - a source is asked only whether it exists: case 2 is red;
 *   - an id sent twice is let through: case 2 is red;
 *   - the reason is not kept with the revision: case 3 is red;
 *   - the same rules sent again are written: cases 6 and 7 are red, and in case 6 the write answers 500 because it made
 *     no revision;
 *   - the problems a rule meets do not refuse the write: case 4 is red;
 *   - a rule taken out is kept: cases 6 and 7 are red, and in case 6 the write answers 500 because it made no revision;
 *   - an agent's name with no key is let through: case 5 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROJECT_RULE_CHECK_NAMES } from '../src/shared/project-rules.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const ROBOTICS = 'made-up-robotics'
const OTHER = 'made-up-other'
const DOOR = '/api/office-regulations/projects/current/chapters'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': ROBOTICS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const inProject = (headers: Record<string, string>, project: string): Record<string, string> => ({ ...headers, 'x-mole-office-workspace': project })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; raw: string }> {
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

/** Register an agent through the starter door, as the person, and hand back its id and its own headers. */
async function register(handle: string, role: string): Promise<{ id: string; headers: Record<string, string> }> {
  const made = await call('POST', '/api/agents/started', inProject(PERSON, 'default'), { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, made.raw).toBe(201)
  const key = String(made.body.whatToGiveIt?.key)
  expect(/^[0-9a-f]{64}$/.test(key), `the registration of ${handle} answered no key`).toBe(true)
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
  return { id, headers: asAgent(handle, key) }
}

async function aNote(title: string, project = ROBOTICS): Promise<string> {
  const made = await call('POST', '/api/records', inProject(PERSON, project), { kind: 'note', title, data: { body: 'Made-up.' } })
  expect(made.status, made.raw).toBe(201)
  return made.body.record.id
}

/** Made-up duties the person files for one secretary in one project, on a made-up decision of the person's. */
async function dutiesFor(secretary: string, project: string): Promise<void> {
  const decision = await call('POST', '/api/records', inProject(PERSON, project), {
    kind: 'decision',
    title: 'A made-up decision the duties rest on',
    data: { option_taken: 'The made-up secretary looks after made-up rules.', because: 'A made-up reason.', decided_by: THE_OWNER, replaces: [] },
  })
  expect(decision.status, decision.raw).toBe(201)
  const duties = await call('POST', '/api/records', inProject(PERSON, project), {
    kind: 'secretary_duties',
    title: 'Made-up duties',
    data: { secretary: { kind: 'agent', id: secretary }, area: 'Made-up rules of a made-up project.', restsOn: [String(decision.body.record.id)] },
  })
  expect(duties.status, duties.raw).toBe(201)
}

let source = ''
/** A made-up rule as a writer sends it. */
function aRule(id: string, check: Record<string, unknown>, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    heading: `Made-up rule ${id}`,
    text: `Made-up: the rule ${id}.`,
    reason: `Made-up: why ${id} is kept.`,
    source,
    trigger: 'method-work',
    check,
    effect: 'remind',
    on: true,
    ...more,
  }
}

const theRules = (): Record<string, unknown>[] => [
  aRule('reviewed-design', { name: 'reviewed-design-linked' }),
  aRule('grasp-trials', { name: 'evidence-linked', evidence: 'grasp_trials' }),
  aRule('sourced-thresholds', { name: 'threshold-names-its-source' }),
]

async function read(project = ROBOTICS): ReturnType<typeof call> {
  const answer = await call('GET', DOOR, inProject(PERSON, project))
  expect(answer.status, answer.raw).toBe(200)
  return answer
}

/** The chapter's version now, read through its door. */
async function version(): Promise<number | null> {
  return (await read()).body.version
}

/**
 * Refused with this status, and the chapter left at the version it was. A refusal of the door's own carries the chapter
 * edit's code; a name sent with no key may be refused before the door is asked, so only its status is read.
 */
async function refused(answer: Awaited<ReturnType<typeof call>>, status: number, before: number | null, theDoors = true): Promise<void> {
  expect(answer.status, answer.raw).toBe(status)
  if (theDoors) {
    expect(answer.body.code, answer.raw).toBe('chapterEditRefused')
  }
  expect(await version()).toBe(before)
}

const theChapterRows = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'project_chapter'").get() as { n: number }).n

let secretary: Awaited<ReturnType<typeof register>>
let bystander: Awaited<ReturnType<typeof register>>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [id, title] of [[ROBOTICS, 'Made-up robotics'], [OTHER, 'Made-up other']] as const) {
    const made = await call('POST', '/api/workspaces', inProject(PERSON, 'default'), { id, title })
    expect(made.status, made.raw).toBe(201)
  }
  secretary = await register('made-up-door-secretary', 'secretary')
  bystander = await register('made-up-door-bystander', 'supervisor')
  source = await aNote('Made-up decision the rules come from')
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a project's own chapter, through its doors", () => {
  it('1. a project with no chapter answers that it keeps none, and the closed list of checks', async () => {
    const { NO_CHAPTER_OF_ITS_OWN } = await import('../src/server/lib/project-rules.ts')
    const answer = await read()
    expect(answer.body.chapter).toBeNull()
    expect(answer.body.version).toBeNull()
    expect(answer.body.rules).toEqual([])
    expect(answer.body.says).toBe(NO_CHAPTER_OF_ITS_OWN)
    expect(answer.body.checks.map((one: { name: string }) => one.name)).toEqual([...PROJECT_RULE_CHECK_NAMES])
  })

  it('2. the preview names each problem by its own code, says which rules are new, and writes nothing', async () => {
    const gone = await aNote('Made-up note that is deleted')
    const deleted = await call('DELETE', `/api/records/${gone}`, PERSON)
    expect(deleted.status, deleted.raw).toBe(200)
    const elsewhere = await aNote('Made-up decision of another project', OTHER)
    const sent = [
      aRule('fine', { name: 'reviewed-design-linked' }),
      aRule('sets-aside', { name: 'reviewed-design-linked' }, { overrides: 'chapter 5, rule 2' }),
      aRule('runs-something', { name: 'reviewed-design-linked' }, { script: 'node made-up.mjs' }),
      aRule('off-the-list', { name: 'node made-up.mjs' }),
      aRule('fine', { name: 'threshold-names-its-source' }),
      aRule('deleted-source', { name: 'reviewed-design-linked' }, { source: gone }),
      aRule('other-source', { name: 'reviewed-design-linked' }, { source: elsewhere }),
    ]
    const preview = await call('POST', `${DOOR}/preview`, PERSON, { rules: sent })
    expect(preview.status, preview.raw).toBe(200)
    expect(preview.body.problems.map((one: { at: number; code: string }) => [one.at, one.code])).toEqual([
      [1, 'weakensAGeneralRule'],
      [2, 'namesAProgram'],
      [3, 'unknownCheck'],
      [4, 'duplicateId'],
      [5, 'notASource'],
      [6, 'notASource'],
    ])
    const good = await call('POST', `${DOOR}/preview`, PERSON, { rules: theRules() })
    expect(good.status, good.raw).toBe(200)
    expect(good.body.problems).toEqual([])
    expect(good.body.rules.map((one: { rule: { id: string }; is: string }) => [one.rule.id, one.is])).toEqual([
      ['reviewed-design', 'new'],
      ['grasp-trials', 'new'],
      ['sourced-thresholds', 'new'],
    ])
    expect(theChapterRows()).toBe(0)
  })

  it('3. the person writes it: each rule takes the revision the write made, the reason is kept, and no other project is touched', async () => {
    const written = await call('POST', DOOR, PERSON, { version: null, because: 'Made-up: the first rules.', rules: theRules() })
    expect(written.status, written.raw).toBe(200)
    const made = written.body.version as number
    expect(made).toBeGreaterThan(0)
    expect(written.body.rules.map((one: { id: string; revision: number }) => [one.id, one.revision])).toEqual([
      ['reviewed-design', made],
      ['grasp-trials', made],
      ['sourced-thresholds', made],
    ])
    const note = t.client.sqlite.prepare('SELECT note FROM revisions WHERE record_id = ? AND seq = ?').get(written.body.chapter, made) as { note: string | null }
    expect(note.note).toBe('Made-up: the first rules.')
    expect((await read()).body).toEqual(written.body)
    expect((await read(OTHER)).body.chapter).toBeNull()
    expect(theChapterRows()).toBe(1)
  })

  it('4. a write with an old version, no reason, or a rule that sets a general rule aside or names a program is refused', async () => {
    const at = await version()
    const changed = [...theRules().slice(0, 2), aRule('sourced-thresholds', { name: 'threshold-names-its-source' }, { text: 'Made-up: changed.' })]
    await refused(await call('POST', DOOR, PERSON, { version: at! - 1, because: 'Made-up.', rules: changed }), 409, at)
    await refused(await call('POST', DOOR, PERSON, { version: null, because: 'Made-up.', rules: changed }), 409, at)
    const noReason = await call('POST', DOOR, PERSON, { version: at, because: '  ', rules: changed })
    expect(noReason.status, noReason.raw).toBe(400)
    expect(await version()).toBe(at)
    const aside = [...changed, aRule('waived', { name: 'reviewed-design-linked' }, { effect: 'waive' })]
    const program = [...changed, aRule('runs', { name: 'evidence-linked', evidence: 'grasp_trials', command: 'node made-up.mjs' })]
    for (const [rules, code] of [[aside, 'weakensAGeneralRule'], [program, 'namesAProgram']] as const) {
      const preview = await call('POST', `${DOOR}/preview`, PERSON, { rules })
      expect(preview.body.problems.map((one: { code: string }) => one.code)).toEqual([code])
      const answer = await call('POST', DOOR, PERSON, { version: at, because: 'Made-up.', rules })
      await refused(answer, 400, at)
      expect(answer.body.error).toContain(preview.body.problems[0].says)
    }
  })

  it("5. only the person, or a secretary of this project with its own key, writes it", async () => {
    const at = await version()
    const changed = [...theRules().slice(0, 2), aRule('sourced-thresholds', { name: 'threshold-names-its-source' }, { text: 'Made-up: the secretary changed it.' })]
    const body = { version: at, because: 'Made-up: a secretary changes a rule.', rules: changed }
    await refused(await call('POST', DOOR, asAgent('made-up-door-secretary', null), body), 403, at, false)
    await refused(await call('POST', DOOR, bystander.headers, body), 403, at)
    await refused(await call('POST', DOOR, secretary.headers, body), 403, at)
    await dutiesFor(secretary.id, OTHER)
    await refused(await call('POST', DOOR, secretary.headers, body), 403, at)
    await dutiesFor(secretary.id, ROBOTICS)
    await refused(await call('POST', DOOR, asAgent('made-up-door-secretary', null), body), 403, at, false)
    const written = await call('POST', DOOR, secretary.headers, body)
    expect(written.status, written.raw).toBe(200)
    expect(written.body.version).toBeGreaterThan(at!)
    expect(written.body.rules[2].text).toBe('Made-up: the secretary changed it.')
  })

  it('6. a change gives only the changed rule the new revision; the same rules again are refused; a rule taken out is gone', async () => {
    const before = (await read()).body
    const rules = before.rules.map(({ revision: _, ...rule }: { revision: number }) => rule) as Record<string, unknown>[]
    rules[1] = { ...rules[1], text: 'Made-up: grasp trials, changed.' }
    const preview = await call('POST', `${DOOR}/preview`, PERSON, { rules: rules.slice(0, 2) })
    expect(preview.body.rules.map((one: { is: string }) => one.is)).toEqual(['same', 'changed'])
    expect(preview.body.removed).toEqual(['sourced-thresholds'])
    const written = await call('POST', DOOR, PERSON, { version: before.version, because: 'Made-up: grasp trials changed.', rules })
    expect(written.status, written.raw).toBe(200)
    const made = written.body.version as number
    expect(written.body.rules.map((one: { id: string; revision: number }) => [one.id, one.revision])).toEqual([
      ['reviewed-design', before.rules[0].revision],
      ['grasp-trials', made],
      ['sourced-thresholds', before.rules[2].revision],
    ])
    await refused(await call('POST', DOOR, PERSON, { version: made, because: 'Made-up: again.', rules }), 400, made)
    const fewer = await call('POST', DOOR, PERSON, { version: made, because: 'Made-up: one rule taken out.', rules: rules.slice(0, 2) })
    expect(fewer.status, fewer.raw).toBe(200)
    expect(fewer.body.rules.map((one: { id: string }) => one.id)).toEqual(['reviewed-design', 'grasp-trials'])
    expect(fewer.body.rules[1].revision).toBe(made)
  })

  it('7. a design approved before one rule changed answers rule-changed for that rule alone', async () => {
    const evidence = await aNote('Made-up evidence grasp_trials')
    const row = { feasibility: 'Made-up: yes.', novelty: 'Made-up: little.', difficulty: 'Made-up: a week.', risk: 'Made-up: few trials.', fit: 'Made-up: good.' }
    const design = await call('POST', '/api/records', PERSON, {
      kind: 'design',
      title: 'Made-up design under the door',
      data: {
        purpose: 'Made-up: pick up a made-up cup.',
        assignedBy: { kind: 'person', id: THE_PERSON },
        candidatesAsked: 1,
        candidatesWhy: 'Made-up: one way is known.',
        candidates: [{ name: 'A', summary: 'Made-up: learn from demonstrations.' }],
        chosen: 'A',
        evaluation: [{ candidate: 'A', ...row }],
        pilot: 'Made-up: ten grasps.',
        sources: ['Made-up: a benchmark nobody wrote.'],
        thresholds: [],
        evidence: [{ name: 'grasp_trials', record: evidence }],
      },
    })
    expect(design.status, design.raw).toBe(201)
    const id = String(design.body.record.id)
    const { numbering } = await import('../src/server/lib/revisions.ts')
    const reviewed = await call('POST', `/api/designs/${id}/reviews`, PERSON, { designRevision: numbering(id).highest, verdict: 'approved', words: 'Made-up: read through.' })
    expect(reviewed.status, reviewed.raw).toBe(201)
    const { judgeADesign } = await import('../src/server/lib/project-rules.ts')
    expect(judgeADesign(id, 'method-work').answers.map((one) => [one.rule, one.answer])).toEqual([
      ['reviewed-design', 'met'],
      ['grasp-trials', 'met'],
    ])
    const now = (await read()).body
    const rules = now.rules.map(({ revision: _, ...rule }: { revision: number }) => rule) as Record<string, unknown>[]
    rules[1] = { ...rules[1], reason: 'Made-up: a new reason for grasp trials.' }
    const written = await call('POST', DOOR, PERSON, { version: now.version, because: 'Made-up: a new reason.', rules })
    expect(written.status, written.raw).toBe(200)
    const after = judgeADesign(id, 'method-work').answers.find((one) => one.rule === 'reviewed-design')!
    expect(after.answer).toBe('rule-changed')
    expect(after.names).toEqual([reviewed.body.review.id, 'grasp-trials'])
  })
})
