// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DEPARTMENTS ARE RECORDS OF THEIR OWN. Wave 13s round 281, step 1 of departments and posts: a department is a record of
 * the kind `department`, filed and changed only by the person's own press, or by a secretary with its own key and a
 * warrant quoting the person's words from a decision the department rests on.
 *
 * WHAT IS PROVED, in a test office with made-up agents, decisions and departments:
 *   1. With none filed, the list door says nobody has filed a department, and gives no empty list. The person then
 *      files a top department by their own press. It has no sub-department, so its level is team, and with no
 *      supervisor its leader says so.
 *   2. A secretary files a sub-department under it, with its own key and a warrant quoting a decision it rests on. The
 *      top department's level is department from then on and it counts one team under it, and the top department's
 *      own record gains no revision: the level is worked out when it is read, never stored.
 *   3. A secretary without a warrant, a supervisor and a worker are refused, by the department door and by POST, PATCH
 *      and DELETE on /api/records. Each refusal names who may write a department, and nothing is written.
 *   4. The sub-department merged into the top department makes the top department a team again, still with no write
 *      to it.
 *   5. A parent that is the department itself or one of its sub-departments at any depth, a merged department and a
 *      department of another project are refused as a parent.
 *   6. A second department for one supervisor, or holding a code another department holds, is refused with 409 naming
 *      the department that holds it. One department may hold two codes.
 *   7. The leader is the owner of the supervisor, read through the registry when the department is read. A change
 *      through the owner door changes the leader with no write to the department. With no owner recorded, it says the
 *      owner is not recorded, and names nobody, not the starter.
 *   8. A merged department's code names the department it merged into, followed to the end. A code no department holds
 *      is answered as held by none.
 *   9. Two changes, one by the person and one by a secretary on the person's words, show as two revisions in the
 *      department's history, each with who wrote it, and the second with the words it was made on.
 *  10. A department and a secretary's duties ask the same of the decisions they rest on (step 1b): a decision that is
 *      not live, one replaced by a newer decision, one not decided by the owner and one not on the person's own words
 *      are each refused by both, with 400 naming the decision, and a decision fit for both is taken by both.
 *  11. A secretary taking a department away (delete, change of kind, move) while it rests on a replaced decision is
 *      told, under a code with words in English and in Chinese, to rest it on the decision that stands first and then
 *      to take it away, as duties are told (tests/secretary-duties.test.ts, case 27). A write naming the same decision
 *      keeps its own sentence, with no code. Nothing is written. Once the department rests on the decision that stands,
 *      the delete and the change of kind are made.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage, t, type WordKey } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REFUSAL_CODES } from '../src/shared/refusal-codes.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

type TheGuard = typeof import('../src/server/lib/grant/departments.ts')
type TheReads = typeof import('../src/server/lib/departments.ts')
type TheShared = typeof import('../src/shared/departments.ts')

const SECRETARY = 'department-made-up-secretary'
const OWNING_SECRETARY = 'department-made-up-owning-secretary'
const SUPERVISOR = 'department-made-up-supervisor'
const LED_SUPERVISOR = 'department-made-up-led-supervisor'
const WORKER = 'department-made-up-worker'
/** A made-up secretary whose duties case 10 writes, beside a department. */
const DUTIES_SECRETARY = 'department-made-up-duties-secretary'
/** A made-up secretary raised under the person's grant: it promotes a fork in case 10 and takes departments away in case 11. */
const RAISED_SECRETARY = 'department-made-up-raised-secretary'

/** A made-up second project, whose department case 5 names as a parent. */
const OTHER_PROJECT = 'made-up-department-project'

let t0: TestDb
let app: FastifyInstance
let guard: TheGuard
let reads: TheReads
let shared: TheShared
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

const idOf = (handle: string): string => {
  const id = ids.get(handle)
  if (id === undefined || id === '') throw new Error(`the test registered no agent ${handle}`)
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** The words of the person's made-up decision that departments rest on. */
const THE_PERSONS_WORDS = 'The made-up departments may be filed and changed by a secretary on these words.'
let decision = ''

/** The person's words, as a warrant the secretary carries for one or more acts. */
function aWarrant(words: string, ...acting: string[]): Record<string, unknown> {
  return { saidBy: THE_PERSON, words, where: 'terminal', when: '2026-10-12 21:06', for: acting }
}

/** Another made-up decision the person files themselves, for cases 10 and 11. */
async function aDecision(title: string, optionTaken: string, replaces: string[] = [], decidedBy: string = THE_OWNER): Promise<string> {
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title,
    data: { option_taken: optionTaken, because: 'A made-up reason.', decided_by: decidedBy, ...governsTheWholeProject(), replaces },
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

/**
 * WHAT STEP 1B ADDS, read by name, so this file loads before it is written: the code a department taken away on a
 * decision it may not rest on carries (src/shared/refusal-codes.ts), and the guard's way to take a department away.
 * Each is red, naming the name, until it is there.
 */
const THE_TAKE_AWAY_CODES_NAME = 'DEPARTMENT_TAKEN_AWAY_ON_A_DECISION_IT_MAY_NOT_REST_ON'
let codes: Record<string, unknown> = {}
function theTakeAwayCode(): string {
  const code = codes[THE_TAKE_AWAY_CODES_NAME]
  expect(typeof code, `src/shared/refusal-codes.ts exports ${THE_TAKE_AWAY_CODES_NAME}`).toBe('string')
  expect(Object.hasOwn(REFUSAL_CODES, String(code)), `${String(code)} is a declared refusal code`).toBe(true)
  return String(code)
}
function theWayToTakeItAway(act: 'delete' | 'kind' | 'move', department: string, onto: string | null): string {
  const way = (guard as unknown as Record<string, unknown>)['theWayToTakeItAway']
  expect(typeof way, 'src/server/lib/grant/departments.ts exports theWayToTakeItAway').toBe('function')
  return (way as (act: string, department: string, onto: string | null) => string)(act, department, onto)
}

/** A code's words in English and in Chinese: each a word of its own, and the Chinese not the English. */
function expectWordsInBothLanguages(code: string, values: Record<string, string>): void {
  const key = `server.${code}` as WordKey
  setWordLanguage('en')
  const english = t(key, values)
  setWordLanguage('zh')
  const chinese = t(key, values)
  setWordLanguage('en')
  expect(english).not.toContain(key)
  expect(chinese).not.toContain(key)
  expect(chinese).not.toBe(english)
}

/** Every department record and every change and revision of one, so a refusal can be shown to write nothing. */
function theDepartmentsAsStored(): string {
  const kind = 'department'
  return JSON.stringify([
    t0.client.sqlite.prepare('SELECT id, title, data, deleted_at FROM records WHERE kind = ? ORDER BY id').all(kind),
    t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
    t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
  ])
}

/** How many revisions one record has, read from the table. */
function revisionsOf(id: string): number {
  return (t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
}

/** The person files a department by their own press, and the door answers 201. */
async function filedByThePerson(department: Record<string, unknown>, headers: Record<string, string> = PERSON): Promise<string> {
  const filed = await call('POST', '/api/departments', headers, department)
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.department.id)
}

/** One department as the one-department door reads it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readOne(id: string): Promise<any> {
  const one = await call('GET', `/api/departments/${id}`, PERSON)
  expect(one.status, one.raw).toBe(200)
  return one.body
}

/** The top department of the first cases, and the sub-department a secretary files under it. */
const TOP = { codes: ['made-up-top'], nameEn: 'Made-up top department', doesEn: 'It holds the made-up work.', state: 'running' }
let top = ''
let sub = ''
let SUB: Record<string, unknown> = {}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t0 = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  guard = await import('../src/server/lib/grant/departments.ts')
  reads = await import('../src/server/lib/departments.ts')
  shared = await import('../src/shared/departments.ts')
  codes = (await import('../src/shared/refusal-codes.ts')) as unknown as Record<string, unknown>
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const [handle, role] of [
    [SECRETARY, THE_SECRETARY],
    [OWNING_SECRETARY, THE_SECRETARY],
    [SUPERVISOR, THE_SUPERVISOR],
    [LED_SUPERVISOR, THE_SUPERVISOR],
    [WORKER, THE_WORKER],
    [DUTIES_SECRETARY, THE_SECRETARY],
    [RAISED_SECRETARY, THE_SECRETARY],
  ] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED_SECRETARY}`, PERSON, { reason: 'A made-up raise for cases 10 and 11.' })
  expect(raised.status, raised.raw).toBe(201)
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'A made-up decision that departments rest on',
    data: { option_taken: THE_PERSONS_WORDS, because: 'A made-up reason.', decided_by: THE_OWNER, ...governsTheWholeProject(), replaces: [] },
  })
  expect(filed.status, filed.raw).toBe(201)
  decision = String(filed.body.record.id)
  const project = await call('POST', '/api/workspaces', PERSON, { id: OTHER_PROJECT, title: 'A made-up project for departments' })
  expect(project.status, project.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t0?.close()
})

describe('departments are records of their own', () => {
  it('1: with none filed the list says so; the person files a top department by their own press', async () => {
    const none = await call('GET', '/api/departments', PERSON)
    expect(none.status, none.raw).toBe(200)
    expect(none.body.departments).toBeNull()
    expect(typeof none.body.nobodyFiled).toBe('string')
    expect(none.body.nobodyFiled).not.toBe('')

    top = await filedByThePerson(TOP)
    const one = await readOne(top)
    expect(one.department).toMatchObject({ id: top, codes: TOP.codes, name: { en: TOP.nameEn, zh: null }, does: { en: TOP.doesEn, zh: null }, parent: null, supervisor: null, state: 'running', mergedInto: null })
    expect(one.department.level).toBe('team')
    expect(one.department.teams).toBeNull()
    expect(one.department.leader.state).toBe('no-supervisor')
    expect(one.subDepartments).toEqual([])
  })

  it('2: a secretary files a sub-department on the person’s words, and the department above becomes a department with no write to it', async () => {
    const before = revisionsOf(top)
    SUB = { codes: ['made-up-sub'], nameZh: '虚构的小组', parent: top, state: 'running', restsOn: [decision] }
    const filed = await call('POST', '/api/departments', as(SECRETARY), {
      ...SUB,
      warrant: aWarrant(THE_PERSONS_WORDS.slice(0, 40), guard.theBindingOf(null, SUB)),
    })
    expect(filed.status, filed.raw).toBe(201)
    sub = String(filed.body.department.id)
    expect(filed.body.department).toMatchObject({ parent: top, name: { en: null, zh: '虚构的小组' }, level: 'team' })

    const above = await readOne(top)
    expect(above.department.level).toBe('department')
    expect(above.department.teams).toBe(1)
    expect(above.subDepartments.map((one: { id: string }) => one.id)).toEqual([sub])
    expect(revisionsOf(top)).toBe(before)

    const list = await call('GET', '/api/departments', PERSON)
    expect(list.status, list.raw).toBe(200)
    expect(list.body.nobodyFiled).toBeNull()
    const listed = (list.body.departments as { id: string; level: string; subDepartments: { id: string }[] }[]).find((one) => one.id === top)
    expect(listed?.level).toBe('department')
    expect(listed?.subDepartments.map((one) => one.id)).toEqual([sub])
  })

  it('3: a secretary without a warrant, a supervisor and a worker are refused, and the refusal says who may', async () => {
    const before = theDepartmentsAsStored()
    const another = { codes: ['made-up-refused'], nameEn: 'A made-up refused department', state: 'running', restsOn: [decision] }
    const warrant = aWarrant(THE_PERSONS_WORDS, guard.theBindingOf(null, another))
    const refusals = [
      await call('POST', '/api/departments', as(SECRETARY), another),
      await call('POST', '/api/departments', as(SUPERVISOR), { ...another, warrant }),
      await call('POST', '/api/departments', as(WORKER), { ...another, warrant }),
      await call('POST', '/api/records', as(WORKER), { kind: 'department', title: 'A made-up refused department', data: another }),
      await call('PATCH', `/api/records/${top}`, as(WORKER), { dataPatch: { doesEn: 'A made-up change nobody may make.' } }),
      await call('DELETE', `/api/records/${sub}`, as(WORKER)),
    ]
    for (const refused of refusals) {
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain(guard.WHO_MAY_WRITE_A_DEPARTMENT)
    }
    expect(theDepartmentsAsStored()).toBe(before)
  })

  it('4: merging the sub-department makes the department above a team again, with no write to it', async () => {
    const before = revisionsOf(top)
    const merged = await call('PUT', `/api/departments/${sub}`, PERSON, { ...SUB, state: 'merged', mergedInto: top })
    expect(merged.status, merged.raw).toBe(200)
    const above = await readOne(top)
    expect(above.department.level).toBe('team')
    expect(above.department.teams).toBeNull()
    expect(revisionsOf(top)).toBe(before)
  })

  it('5: a cycle, a merged department and a department of another project are refused as a parent', async () => {
    const a = await filedByThePerson({ nameEn: 'Made-up department A', state: 'running' })
    const b = await filedByThePerson({ nameEn: 'Made-up department B', parent: a, state: 'running' })
    const c = await filedByThePerson({ nameEn: 'Made-up department C', parent: b, state: 'running' })
    const elsewhere = await filedByThePerson({ nameEn: 'A made-up department in another project', state: 'running' }, { ...PERSON, 'x-mole-office-workspace': OTHER_PROJECT })
    const before = theDepartmentsAsStored()
    for (const parent of [a, b, c]) {
      const refused = await call('PUT', `/api/departments/${a}`, PERSON, { nameEn: 'Made-up department A', parent, state: 'running' })
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.error).toContain(guard.WHY_A_DEPARTMENT_IS_REFUSED.aCycle)
    }
    const underMerged = await call('PUT', `/api/departments/${a}`, PERSON, { nameEn: 'Made-up department A', parent: sub, state: 'running' })
    expect(underMerged.status, underMerged.raw).toBe(400)
    expect(underMerged.error).toContain(guard.WHY_A_DEPARTMENT_IS_REFUSED.aMergedParent)
    const across = await call('PUT', `/api/departments/${a}`, PERSON, { nameEn: 'Made-up department A', parent: elsewhere, state: 'running' })
    expect(across.status, across.raw).toBe(400)
    expect(across.error).toContain(guard.WHY_A_DEPARTMENT_IS_REFUSED.anotherProject)
    expect(theDepartmentsAsStored()).toBe(before)
  })

  it('6: a second department for one supervisor or one code is refused with 409 naming the one that holds it', async () => {
    const holder = await filedByThePerson({
      codes: ['made-up-map', 'made-up-office-map'],
      nameEn: 'Made-up map department',
      supervisor: { kind: 'agent', id: idOf(SUPERVISOR) },
      state: 'running',
    })
    expect((await readOne(holder)).department.codes).toEqual(['made-up-map', 'made-up-office-map'])
    const before = theDepartmentsAsStored()
    const sameSupervisor = await call('POST', '/api/departments', PERSON, {
      nameEn: 'A second made-up department for one supervisor',
      supervisor: { kind: 'agent', id: idOf(SUPERVISOR) },
      state: 'running',
    })
    expect(sameSupervisor.status, sameSupervisor.raw).toBe(409)
    expect(sameSupervisor.error).toContain(holder)
    const sameCode = await call('POST', '/api/departments', PERSON, { codes: ['made-up-office-map'], nameEn: 'A second made-up department for one code', state: 'running' })
    expect(sameCode.status, sameCode.raw).toBe(409)
    expect(sameCode.error).toContain(holder)
    expect(theDepartmentsAsStored()).toBe(before)
  })

  it('7: the leader is the owner of the supervisor, follows the owner door, and says not recorded with no owner', async () => {
    const led = await filedByThePerson({ nameEn: 'Made-up led department', supervisor: { kind: 'agent', id: idOf(LED_SUPERVISOR) }, state: 'running' })
    const before = revisionsOf(led)
    const first = await readOne(led)
    expect(first.department.leader.state).toBe('recorded')
    expect(first.department.leader.leader.kind).toBe('person')

    const moved = await call('POST', `/api/agents/${idOf(LED_SUPERVISOR)}/owner`, PERSON, {
      owner: { kind: 'agent', id: idOf(OWNING_SECRETARY) },
      because: 'A made-up change of owner.',
    })
    expect(moved.status, moved.raw).toBe(200)
    const after = await readOne(led)
    expect(after.department.leader).toMatchObject({ state: 'recorded', leader: { kind: 'agent', id: idOf(OWNING_SECRETARY) } })
    expect(revisionsOf(led)).toBe(before)

    t0.client.sqlite.prepare('UPDATE agents SET owner_id = NULL, owner_kind = NULL WHERE id = ?').run(idOf(LED_SUPERVISOR))
    const none = await readOne(led)
    expect(none.department.leader.state).toBe('owner-not-recorded')
    expect(Object.keys(none.department.leader).sort()).toEqual(['says', 'state'])
    expect(none.department.leader.says).not.toBe('')
  })

  it('8: a merged department’s code names the department it merged into, followed to the end', async () => {
    const end = await filedByThePerson({ nameEn: 'Made-up end department', state: 'running' })
    const middle = await filedByThePerson({ codes: ['made-up-middle'], nameEn: 'Made-up middle department', state: 'running' })
    const first = await filedByThePerson({ codes: ['made-up-first'], nameEn: 'Made-up first department', state: 'running' })
    const mergeMiddle = await call('PUT', `/api/departments/${middle}`, PERSON, { codes: ['made-up-middle'], nameEn: 'Made-up middle department', state: 'merged', mergedInto: end })
    expect(mergeMiddle.status, mergeMiddle.raw).toBe(200)
    const mergeFirst = await call('PUT', `/api/departments/${first}`, PERSON, { codes: ['made-up-first'], nameEn: 'Made-up first department', state: 'merged', mergedInto: middle })
    expect(mergeFirst.status, mergeFirst.raw).toBe(200)

    expect(reads.theDepartmentACodeNames('default', 'made-up-first')).toMatchObject({ state: 'held', department: { id: end } })
    expect(reads.theDepartmentACodeNames('default', 'made-up-sub')).toMatchObject({ state: 'held', department: { id: top } })
    expect(reads.theDepartmentACodeNames('default', 'made-up-top')).toMatchObject({ state: 'held', department: { id: top } })
    const nobody = reads.theDepartmentACodeNames('default', 'made-up-code-nobody-holds')
    expect(nobody.state).toBe('not-held')
  })

  it('9: two changes show as two revisions, each with who wrote it', async () => {
    const changedByThePerson = { ...TOP, doesEn: 'It holds the made-up work, changed by the person.' }
    const byThePerson = await call('PUT', `/api/departments/${top}`, PERSON, changedByThePerson)
    expect(byThePerson.status, byThePerson.raw).toBe(200)
    const changedByTheSecretary = { ...changedByThePerson, nameZh: '虚构的上级部门', restsOn: [decision] }
    const words = THE_PERSONS_WORDS.slice(0, 40)
    const bySecretary = await call('PUT', `/api/departments/${top}`, as(SECRETARY), {
      ...changedByTheSecretary,
      warrant: aWarrant(words, guard.theBindingOf(top, changedByTheSecretary)),
    })
    expect(bySecretary.status, bySecretary.raw).toBe(200)

    const history = (await readOne(top)).history
    expect(history.count).toBe(3)
    const [newest, middle, oldest] = history.revisions as { seq: number; op: string; who: { actorType: string; agent: string | null }; onTheWordsOf: { words: string } | null }[]
    expect(newest).toMatchObject({ seq: 3, who: { actorType: 'agent', agent: idOf(SECRETARY) }, onTheWordsOf: { words } })
    expect(middle).toMatchObject({ seq: 2, who: { actorType: 'human' }, onTheWordsOf: null })
    expect(oldest).toMatchObject({ seq: 1, who: { actorType: 'human' }, onTheWordsOf: null })
  })

  it('10: a department and duties ask the same of the decisions they rest on', async () => {
    // ONE MADE-UP DECISION FOR EACH FAULT, and one fit for both.
    const gone = await aDecision('A made-up decision deleted before anything rests on it', 'The made-up departments rest here, deleted.')
    const deleted = await call('DELETE', `/api/records/${gone}`, PERSON)
    expect(deleted.status, deleted.raw).toBe(200)
    const replaced = await aDecision('A made-up decision later replaced', 'The made-up departments rest here, replaced.')
    await aDecision('A made-up decision replacing it', 'The made-up departments rest on the newer decision.', [replaced])
    const byADeputy = await aDecision('A made-up decision a deputy made', 'The made-up departments rest here, a deputy.', [], 'made-up-deputy')
    const note = await call('POST', '/api/records', as(RAISED_SECRETARY), { kind: 'note', title: 'A made-up note a secretary wrote', data: { body: "A made-up note, in the secretary's own words." } })
    expect(note.status, note.raw).toBe(201)
    const fork = await call('POST', '/api/records', PERSON, {
      kind: 'proposal',
      title: 'A made-up fork for a department',
      data: { question: 'May the made-up departments rest on a promoted decision?', options: ['a — yes', 'b — no'], who_settles_it: THE_OWNER },
    })
    expect(fork.status, fork.raw).toBe(201)
    const promoted = await call('POST', `/api/records/${String(fork.body.record.id)}/promote`, as(RAISED_SECRETARY), {
      title: 'A made-up decision a promotion filed on a note',
      data: { because: 'A made-up reason the person gave.', authority_reference: String(note.body.record.id) },
      warrant: aWarrant('Yes, the made-up departments may rest on it.', String(fork.body.record.id)),
    })
    expect(promoted.status, promoted.raw).toBe(201)
    const read = await call('GET', `/api/records/${String(fork.body.record.id)}`, PERSON)
    const notTheirWords = String((read.body.onThePersonsWords as { recordId: string }[])[0]?.recordId)
    const fit = await aDecision('A made-up decision both may rest on', 'The made-up departments and duties rest here.')

    // EACH FAULT, REFUSED BY BOTH on the person's own press, with the same status, each naming the decision.
    const dutiesDoor = `/api/secretaries/${idOf(DUTIES_SECRETARY)}/duties`
    const area = 'A made-up area beside the departments.'
    for (const [fault, bad] of [['not live', gone], ['replaced', replaced], ['not by the owner', byADeputy], ["not on the person's own words", notTheirWords]] as const) {
      const before = theDepartmentsAsStored()
      const department = await call('POST', '/api/departments', PERSON, { nameEn: `Made-up department, ${fault}`, state: 'running', restsOn: [bad] })
      const duties = await call('PUT', dutiesDoor, PERSON, { area, restsOn: [bad] })
      expect(department.status, `the department, ${fault}: ${department.raw}`).toBe(400)
      expect(duties.status, `the duties, ${fault}: ${duties.raw}`).toBe(400)
      expect(department.error).toContain(bad)
      expect(duties.error).toContain(bad)
      expect(theDepartmentsAsStored()).toBe(before)
    }

    // AND THE DECISION FIT FOR BOTH IS TAKEN BY BOTH. The refusals wrote no duties, so this write creates them.
    const department = await call('POST', '/api/departments', PERSON, { nameEn: 'Made-up department, fit', state: 'running', restsOn: [fit] })
    expect(department.status, department.raw).toBe(201)
    const duties = await call('PUT', dutiesDoor, PERSON, { area, restsOn: [fit] })
    expect(duties.status, duties.raw).toBe(201)
    expect(duties.body.written, duties.raw).toBe('created')
  })

  it('11: a secretary taking a department away while it rests on a replaced decision is told to rest it on the decision that stands first', async () => {
    for (const act of ['delete', 'kind', 'move'] as const) {
      const words = `The made-up department may be taken away, ${act}.`
      const decision = await aDecision(`A made-up decision a department rests on, ${act}`, words)
      const data = { nameEn: `Made-up department taken away, ${act}`, state: 'running', restsOn: [decision] }
      const department = await filedByThePerson(data)
      const newer = { title: `A made-up decision replacing the one under a department, ${act}`, words: `The made-up department rests on the newer decision, ${act}.` }
      const newerId = await aDecision(newer.title, newer.words, [decision])
      const away = guard.theBindingOf(department, null)
      const ask = (quoting: string): ReturnType<typeof call> =>
        act === 'delete'
          ? call('DELETE', `/api/records/${department}`, as(RAISED_SECRETARY), { warrant: aWarrant(quoting, department, away) })
          : act === 'kind'
            ? call('PATCH', `/api/records/${department}`, as(RAISED_SECRETARY), { kind: 'note', warrant: aWarrant(quoting, department, away) })
            : call('POST', `/api/records/${department}/workspace`, as(RAISED_SECRETARY), { to: OTHER_PROJECT, warrant: aWarrant(quoting, department, away, guard.theBindingOf(department, data)) })

      // THE TAKE-AWAY IS REFUSED UNDER ITS CODE, saying the way: rest it on the decision that stands, then take it away.
      const before = theDepartmentsAsStored()
      const refused = await ask(words)
      expect(refused.status, `${act}: ${refused.raw}`).toBe(400)
      expect(refused.body.code, refused.raw).toBe(theTakeAwayCode())
      expect(refused.body.values, refused.raw).toMatchObject({ department, decision })
      expect(refused.error).toContain(theWayToTakeItAway(act, department, newerId))
      if (act === 'delete') expectWordsInBothLanguages(theTakeAwayCode(), refused.body.values as Record<string, string>)

      // A WRITE NAMING THE SAME DECISION KEEPS ITS OWN SENTENCE, with no code, and is not told to take anything away. It
      // changes a line, since data sent as it already stands writes nothing and is not asked about its decisions.
      const changed = { ...data, doesEn: `It does made-up work, ${act}.` }
      const written = await call('PUT', `/api/departments/${department}`, as(RAISED_SECRETARY), { ...changed, warrant: aWarrant(words, guard.theBindingOf(department, changed)) })
      expect(written.status, written.raw).toBe(400)
      expect(written.body.code, written.raw).toBeUndefined()
      expect(written.error).toContain(newerId)
      expect(written.error).not.toContain(theWayToTakeItAway(act, department, newerId))
      expect(theDepartmentsAsStored()).toBe(before)
      if (act === 'move') continue

      // ONCE IT RESTS ON THE DECISION THAT STANDS, on the person's words from it, the take-away is made.
      const onTheNewer = { ...data, restsOn: [newerId] }
      const rested = await call('PUT', `/api/departments/${department}`, as(RAISED_SECRETARY), { ...onTheNewer, warrant: aWarrant(newer.words, guard.theBindingOf(department, onTheNewer)) })
      expect(rested.status, rested.raw).toBe(200)
      const takenAway = await ask(newer.words)
      expect(takenAway.status, `${act}, once it rests on the decision that stands: ${takenAway.raw}`).toBe(200)
      const row = t0.client.sqlite.prepare('SELECT kind, deleted_at FROM records WHERE id = ?').get(department)
      expect(row).toMatchObject(act === 'delete' ? { deleted_at: expect.any(String) } : { kind: 'note' })
    }
  })
})
