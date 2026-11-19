// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT KEEPS A CHAPTER OF ITS OWN, AND ITS RULES NAME ONLY THE CLOSED LIST OF CHECKS. Wave 13s round 226, parts 1
 * and 2 of the design-first build: the project chapter record, and the closed list of checks as data. The kind is
 * declared in src/shared/kinds.ts, its closed lists and the one reader of a rule in src/shared/project-rules.ts, and
 * the guard that refuses the general doors in `assertMayWrite` (src/server/lib/records.ts), with its mark in
 * src/server/lib/project-rules-door.ts.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every project, rule and
 * record id here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. the kind declares its rules, each a heading, a text, a reason, a source, a trigger, a check, an effect, whether
 *      it is on and its revision; the check is one of exactly three, the effect is only a reminder, and the triggers
 *      are method work and the go; it is read beside the regulations and takes no hours;
 *   2. POST /api/records of a project chapter is refused with 403 and the chapter edit's code, to the person too, and
 *      nothing is written;
 *   3. a chapter written through its doors' mark is stored in its own project, and through the general doors a change,
 *      a delete, a change of the chapter into a note and a change of a note into a chapter are all refused;
 *   4. the office-wide chapter reading never selects it, even when its data carries a chapter number, and
 *      GET /api/office-regulations names it nowhere;
 *   5. a rule as a writer sends it reads as a rule, and each way a rule can be wrong is named with its own code: a
 *      field nobody declared, a field or an effect that would set a general rule aside, a field that names a program,
 *      in the rule or in its check, a check not on the list, a trigger not on the list, a missing evidence name, and a
 *      revision sent by the writer; a stored rule with no revision does not read.
 *
 * MUTATIONS, each run alone after a green control and restored after (8 November 2026):
 *   - the guard for the project chapter is taken out of `assertMayWrite`: cases 2 and 3 are red, before and after case 2
 *     read the refusal's words from `A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS`;
 *   - a kind change no longer asks `assertMayWrite` about a project chapter as the kind it becomes: case 3 is red,
 *     because the change of a note into a chapter is then refused only for its shape, with 400;
 *   - the guard lets the reclassify verb through: case 3 stays green, because the change check about the kind a
 *     record leaves refuses first. No case here proves the reclassify call on its own;
 *   - the office-wide reading no longer asks the kind, neither in `theOfficesChapterRecords` nor in `isAChapterRow`:
 *     case 4 is red. Taken out of `isAChapterRow` alone, case 4 stays green, because the other still asks it;
 *   - "waive" is taken out of WEAKENING_EFFECTS: case 5 is red;
 *   - "script" is taken out of PROGRAM_FIELDS: case 5 is red;
 *   - a fourth check is added to PROJECT_RULE_CHECKS: case 1 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KIND_SPECS, SHAPE_SPECS } from '../src/shared/kinds.ts'
import { A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS, PROJECT_RULE_CHECK_NAMES, PROJECT_RULE_EFFECTS, PROJECT_RULE_TRIGGERS, readAProjectRule } from '../src/shared/project-rules.ts'
import { PLAN_HOURS_BY_KIND, familyOf } from '../src/shared/work.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const PROJECT = 'made-up-robotics'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': PROJECT,
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

/** How many project chapters the table holds, deleted or not. */
function chaptersStored(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'project_chapter'").get() as { n: number }).n
}

/** A made-up rule as a writer would send it. */
function aRule(more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'reviewed-design',
    heading: 'Method work starts from a reviewed design',
    text: 'Made-up: a robotics method run links a design its reviewer approved.',
    reason: 'Made-up: two made-up pilots were started from a design nobody had read.',
    source: 'made-up-decision',
    trigger: 'method-work',
    check: { name: 'reviewed-design-linked' },
    effect: 'remind',
    on: true,
    ...more,
  }
}

let chapterId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const made = await call('POST', '/api/workspaces', { ...PERSON, 'x-mole-office-workspace': 'default' }, { id: PROJECT, title: 'Made-up robotics' })
  expect(made.status, made.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a project's own chapter", () => {
  it('1. declares its rules, each naming one check of exactly three, and is a note that takes no hours', () => {
    const spec = KIND_SPECS.project_chapter
    expect(spec, 'there is no kind called project_chapter').toBeDefined()
    const rules = spec.fields.find((one) => one.key === 'rules')
    expect(rules?.type).toBe('ProjectRule[]')
    expect(rules?.required).toBe(true)
    const rule = SHAPE_SPECS['ProjectRule']
    expect(rule, 'there is no ProjectRule shape').toBeDefined()
    expect(rule!.fields.map((one) => one.key)).toEqual(['id', 'heading', 'text', 'reason', 'source', 'trigger', 'check', 'effect', 'on', 'revision'])
    for (const field of rule!.fields) expect(field.required, `${field.key} is not required`).toBe(true)
    expect(rule!.fields.find((one) => one.key === 'check')?.type).toBe('ProjectRuleCheck')
    expect([...PROJECT_RULE_CHECK_NAMES].sort()).toEqual(['evidence-linked', 'reviewed-design-linked', 'threshold-names-its-source'])
    expect([...PROJECT_RULE_EFFECTS]).toEqual(['remind'])
    expect([...PROJECT_RULE_TRIGGERS]).toEqual(['method-work', 'go'])
    expect(familyOf('project_chapter')).toBe(familyOf('regulation'))
    expect(PLAN_HOURS_BY_KIND.project_chapter.mayHaveHours).toBe(false)
  })

  it('2. is refused at POST /api/records, to the person too, with the chapter edit code, and nothing is written', async () => {
    const before = chaptersStored()
    const refused = await call('POST', '/api/records', PERSON, { kind: 'project_chapter', title: 'Made-up robotics rules', data: { rules: [] } })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.body.code).toBe('chapterEditRefused')
    expect(refused.body.error).toContain(A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS)
    expect(chaptersStored()).toBe(before)
  })

  it('3. is stored in its own project when its doors write it, and the general doors cannot change, delete or reclassify it', async () => {
    const { createRecord } = await import('../src/server/lib/records.ts')
    const { asTheProjectRulesDoors } = await import('../src/server/lib/project-rules-door.ts')
    const written = asTheProjectRulesDoors(() =>
      createRecord({ kind: 'project_chapter', title: 'Made-up robotics rules', data: { rules: [{ ...aRule(), revision: 1 }] }, workspaceId: PROJECT, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }),
    )
    chapterId = written.id
    expect(written.workspaceId).toBe(PROJECT)
    const changed = await call('PATCH', `/api/records/${chapterId}`, PERSON, { dataPatch: { rules: [] } })
    expect(changed.status, changed.raw).toBe(403)
    expect(changed.body.code).toBe('chapterEditRefused')
    const deleted = await call('DELETE', `/api/records/${chapterId}`, PERSON)
    expect(deleted.status, deleted.raw).toBe(403)
    const intoANote = await call('PATCH', `/api/records/${chapterId}`, PERSON, { kind: 'note' })
    expect(intoANote.status, intoANote.raw).toBe(403)
    expect(intoANote.body.code).toBe('chapterEditRefused')
    const row = t.client.sqlite.prepare('SELECT kind, deleted_at AS gone, data FROM records WHERE id = ?').get(chapterId) as { kind: string; gone: string | null; data: string }
    expect(row.kind).toBe('project_chapter')
    expect(row.gone).toBeNull()
    expect(JSON.parse(row.data).rules).toHaveLength(1)
    const note = await call('POST', '/api/records', PERSON, { kind: 'note', title: 'Made-up note', data: { body: 'Made-up.' } })
    expect(note.status, note.raw).toBe(201)
    const intoAChapter = await call('PATCH', `/api/records/${note.body.record.id}`, PERSON, { kind: 'project_chapter' })
    expect(intoAChapter.status, intoAChapter.raw).toBe(403)
    expect(intoAChapter.body.code).toBe('chapterEditRefused')
    expect(chaptersStored()).toBe(1)
  })

  it('4. is never selected by the office-wide chapter reading, even with a chapter number in its data', async () => {
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.extra', json('{\"chapter\":1}')) WHERE id = ?").run(chapterId)
    const { theOfficesChapterRecords } = await import('../src/server/lib/office-regulations.ts')
    expect(theOfficesChapterRecords().map((one) => one.id)).not.toContain(chapterId)
    const read = await call('GET', '/api/office-regulations', PERSON)
    expect(read.status, read.raw).toBe(200)
    expect(read.raw).not.toContain(chapterId)
  })

  it('5. reads a rule against the closed lists, and names each way a rule can be wrong', () => {
    const read = readAProjectRule(aRule({ check: { name: 'evidence-linked', evidence: 'grasp_trials' } }), 0, false)
    expect('rule' in read, JSON.stringify(read)).toBe(true)
    const codes = (value: unknown, stored = false): string[] => {
      const answer = readAProjectRule(value, 0, stored)
      return 'problems' in answer ? answer.problems.map((one) => one.code) : []
    }
    expect(codes(aRule({ colour: 'red' }))).toEqual(['unknownField'])
    expect(codes(aRule({ overrides: 'chapter 5, rule 2' }))).toEqual(['weakensAGeneralRule'])
    expect(codes(aRule({ effect: 'waive' }))).toEqual(['weakensAGeneralRule'])
    expect(codes(aRule({ script: 'node made-up.mjs' }))).toEqual(['namesAProgram'])
    expect(codes(aRule({ check: { name: 'reviewed-design-linked', command: 'node made-up.mjs' } }))).toEqual(['namesAProgram'])
    expect(codes(aRule({ check: { name: 'node made-up.mjs' } }))).toEqual(['unknownCheck'])
    expect(codes(aRule({ trigger: 'always' }))).toEqual(['unknownTrigger'])
    expect(codes(aRule({ check: { name: 'evidence-linked' } }))).toEqual(['evidenceName'])
    expect(codes(aRule({ revision: 9 }))).toEqual(['revisionIsTheDoors'])
    expect(codes(aRule(), true)).toEqual(['missingField'])
    expect(codes({ ...aRule(), revision: 2 }, true)).toEqual([])
    expect(codes('a rule in words')).toEqual(['notAnObject'])
  })
})
