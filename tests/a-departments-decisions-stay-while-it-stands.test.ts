// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION A DEPARTMENT RESTS ON STAYS WHILE THE DEPARTMENT STANDS. Wave 13s round 281, step 1b of departments and
 * posts. A department names the person's decisions it rests on in restsOn. An act on such a decision that would leave
 * the department resting on something it may not rest on is refused, as it is for a secretary's duties
 * (tests/secretary-duties.test.ts, cases 21 to 28), even on the person's own press. The refusal carries a code, so the
 * page can say it in English and in Chinese, and names each department and the door that changes it.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agents, decisions,
 * departments, notes, forks and the second project are made up by this test, and every one is labelled as made up.
 *
 * THE CASES, each on its own made-up decision and department:
 *   1. Deleting the decision is refused with 409, naming the department and its door. Nothing is written. The code has
 *      its words in English and in Chinese.
 *   2. Moving it to another project, and the move's dry run, are refused the same way, and the refusal offers "also".
 *      With the department linked to it and named in "also", the two move together.
 *   3. Changing its kind is refused.
 *   4. Changing decided_by away from the owner is refused.
 *   5. Changing authority_reference to a note a secretary wrote, which is not the person's own words, is refused.
 *   6. Revoking the promotion that filed it is refused, and so is revoking an act whose undoing would put back a version
 *      the department may not rest on: a change of decided_by to the owner, and a change of authority_reference to the
 *      person's own record. Each refusal says the order.
 *   7. Once the person deletes the department, the decision is deleted.
 *   8. A decision that a secretary's duties and a department both rest on: the refusal names both, each with its door.
 *   9. A department that is merged and not deleted still holds the decision it rests on, so the delete is refused as
 *      for a standing department: it can be restored and changed, and its next change asks for a live decision.
 *
 * THE CODE is read from src/shared/refusal-codes.ts by its exported name, and its words through t(), so no sentence is
 * copied here. Until the code is declared, every case is red at its first refusal.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage, t, type WordKey } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REFUSAL_CODES } from '../src/shared/refusal-codes.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import { SECRETARY_DUTIES_KIND } from '../src/shared/secretary-duties-record.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'

type TheDutiesGuard = typeof import('../src/server/lib/grant/secretary-duties.ts')

/** A made-up secretary, raised under the person's grant, which promotes forks and acts on decisions for the person. */
const SECRETARY = 'made-up-decisions-kept-secretary'
/** A made-up secretary whose duties case 8 rests on the same decision as a department. */
const DUTIES_SECRETARY = 'made-up-decisions-kept-duties-secretary'

/** A made-up second project, which case 2 moves a decision into. */
const OTHER_PROJECT = 'made-up-decisions-kept-project'

/** The exported name of the code this refusal carries in src/shared/refusal-codes.ts. */
const THE_CODES_NAME = 'DEPARTMENTS_REST_ON_THE_DECISION'

let t0: TestDb
let app: FastifyInstance
let duties: TheDutiesGuard
let codes: Record<string, unknown> = {}
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

/** The person's words, as a warrant the secretary carries for one or more acts. */
function aWarrant(words: string, ...acting: string[]): Record<string, unknown> {
  return { saidBy: THE_PERSON, words, where: 'terminal', when: '2026-10-12 21:06', for: acting }
}

/** A made-up decision the person files themselves, in their own name. */
async function aDecision(title: string, optionTaken: string, decidedBy: string = THE_OWNER): Promise<string> {
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title,
    data: { option_taken: optionTaken, because: 'A made-up reason.', decided_by: decidedBy, ...governsTheWholeProject(), replaces: [] },
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

/** A made-up department the person files by their own press, resting on `decision`. */
async function aDepartmentOn(decision: string, name: string): Promise<string> {
  const filed = await call('POST', '/api/departments', PERSON, { nameEn: `Made-up department, ${name}`, state: 'running', restsOn: [decision] })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.department.id)
}

/** A made-up fork the person files: a record of the person's own, which a decision may cite. */
async function aForkThePersonFiled(question: string): Promise<string> {
  const fork = await call('POST', '/api/records', PERSON, {
    kind: 'proposal',
    title: 'A made-up fork for a department',
    data: { question, options: ['a — yes', 'b — no'], who_settles_it: THE_OWNER },
  })
  expect(fork.status, fork.raw).toBe(201)
  return String(fork.body.record.id)
}

/** A made-up note the secretary files itself: a live record that is not the person's own words. */
async function aNoteTheSecretaryFiled(): Promise<string> {
  const note = await call('POST', '/api/records', as(SECRETARY), {
    kind: 'note',
    title: 'A made-up note a secretary wrote',
    data: { body: "A made-up note, in the secretary's own words." },
  })
  expect(note.status, note.raw).toBe(201)
  return String(note.body.record.id)
}

/**
 * A MADE-UP DECISION THE SECRETARY'S PROMOTION FILED on the person's words, citing `cites`, and the version the
 * promotion wrote.
 */
async function aPromotedDecision(question: string, cites: (fork: string) => Promise<string> | string): Promise<{ decision: string; seq: number; fork: string }> {
  const fork = await aForkThePersonFiled(question)
  const promoted = await call('POST', `/api/records/${fork}/promote`, as(SECRETARY), {
    title: 'A made-up decision a promotion filed',
    data: { because: 'A made-up reason the person gave.', authority_reference: await cites(fork) },
    warrant: aWarrant('Yes, the made-up department may rest on it.', fork),
  })
  expect(promoted.status, promoted.raw).toBe(201)
  const read = await call('GET', `/api/records/${fork}`, PERSON)
  const act = (read.body.onThePersonsWords as { recordId: string; seq: number }[])[0]
  expect(act, read.raw).toBeDefined()
  return { decision: String(act?.recordId), seq: Number(act?.seq), fork }
}

/** The project a record is filed in, read from the table. */
function projectOf(id: string): string {
  const row = t0.client.sqlite.prepare('SELECT workspace_id FROM records WHERE id = ?').get(id) as { workspace_id: string } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return row.workspace_id
}

/** A record and its whole ledger, read even after deletion or a change of kind, so a refusal can be shown to write nothing. */
function stored(id: string): unknown {
  return {
    record: t0.client.sqlite.prepare('SELECT workspace_id, deleted_at, kind, title, summary, data FROM records WHERE id = ?').get(id),
    changes: t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(id),
    revisions: t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id),
  }
}

/** The code the refusal carries, read by its exported name; red, naming the name, until it is declared. */
function theCode(): string {
  const code = codes[THE_CODES_NAME]
  expect(typeof code, `src/shared/refusal-codes.ts exports ${THE_CODES_NAME}`).toBe('string')
  expect(Object.hasOwn(REFUSAL_CODES, String(code)), `${String(code)} is a declared refusal code`).toBe(true)
  return String(code)
}

/**
 * THE ACT WAS REFUSED FOR THE DEPARTMENTS RESTING ON THE DECISION: 409, the code, the decision in its values, each
 * department named with its door, and nothing written to the decision or to any department.
 */
function expectKeptForTheDepartments(refused: Awaited<ReturnType<typeof call>>, decision: string, departments: readonly string[], before: unknown): void {
  expect(refused.status, refused.raw).toBe(409)
  expect(refused.body.code, refused.raw).toBe(theCode())
  expect(refused.body.values?.decision, refused.raw).toBe(decision)
  for (const department of departments) {
    expect(refused.error).toContain(department)
    expect(refused.error).toContain(`PUT /api/departments/${department}`)
  }
  expect([decision, ...departments].map(stored)).toEqual(before)
}

/** What `expectKeptForTheDepartments` compares against, read before the act. */
const asStored = (decision: string, departments: readonly string[]): unknown => [decision, ...departments].map(stored)

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t0 = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  duties = await import('../src/server/lib/grant/secretary-duties.ts')
  codes = (await import('../src/shared/refusal-codes.ts')) as unknown as Record<string, unknown>
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const handle of [SECRETARY, DUTIES_SECRETARY]) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: THE_SECRETARY })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${SECRETARY}`, PERSON, { reason: 'A made-up raise for acts on decisions.' })
  expect(raised.status, raised.raw).toBe(201)
  const project = await call('POST', '/api/workspaces', PERSON, { id: OTHER_PROJECT, title: 'A made-up project for a moved decision' })
  expect(project.status, project.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t0?.close()
})

describe('a decision a department rests on stays while the department stands', () => {
  it('1: deleting it is refused with 409 naming the department and its door, and the code has words in both languages', async () => {
    const decision = await aDecision('A made-up decision a department rests on, delete', 'The made-up department rests here, delete.')
    const department = await aDepartmentOn(decision, 'delete')
    const before = asStored(decision, [department])
    const refused = await call('DELETE', `/api/records/${decision}`, PERSON)
    expectKeptForTheDepartments(refused, decision, [department], before)

    // THE CODE'S WORDS, in English and in Chinese: each is a word of its own, and the Chinese is not the English.
    const key = `server.${theCode()}` as WordKey
    const values = refused.body.values as Record<string, string>
    setWordLanguage('en')
    const english = t(key, values)
    setWordLanguage('zh')
    const chinese = t(key, values)
    setWordLanguage('en')
    expect(english).not.toContain(key)
    expect(chinese).not.toContain(key)
    expect(chinese).not.toBe(english)
  })

  it('2: moving it, and the dry run, are refused offering "also"; named in "also" with a link, the department moves with it', async () => {
    const decision = await aDecision('A made-up decision a department rests on, move', 'The made-up department rests here, move.')
    const department = await aDepartmentOn(decision, 'move')
    const url = `/api/records/${decision}/workspace`
    const before = asStored(decision, [department])
    const dry = await call('POST', url, PERSON, { to: OTHER_PROJECT, dryRun: true })
    expectKeptForTheDepartments(dry, decision, [department], before)
    const refused = await call('POST', url, PERSON, { to: OTHER_PROJECT })
    expectKeptForTheDepartments(refused, decision, [department], before)
    expect(refused.error).toBe(dry.error)
    expect(refused.error).toContain('"also"')

    const linked = await call('POST', '/api/links', PERSON, { fromId: department, toId: decision, type: 'derived_from' })
    expect(linked.status, linked.raw).toBe(201)
    const moved = await call('POST', url, PERSON, { to: OTHER_PROJECT, also: [department] })
    expect(moved.status, moved.raw).toBe(200)
    expect(projectOf(decision)).toBe(OTHER_PROJECT)
    expect(projectOf(department)).toBe(OTHER_PROJECT)
  })

  it('3: changing its kind is refused', async () => {
    const decision = await aDecision('A made-up decision a department rests on, kind', 'The made-up department rests here, kind.')
    const department = await aDepartmentOn(decision, 'kind')
    const before = asStored(decision, [department])
    const refused = await call('PATCH', `/api/records/${decision}`, PERSON, { kind: 'note' })
    expectKeptForTheDepartments(refused, decision, [department], before)
  })

  it('4: changing decided_by away from the owner is refused', async () => {
    const decision = await aDecision('A made-up decision a department rests on, decided_by', 'The made-up department rests here, decided_by.')
    const department = await aDepartmentOn(decision, 'decided_by')
    const before = asStored(decision, [department])
    const refused = await call('PATCH', `/api/records/${decision}`, PERSON, { dataPatch: { decided_by: 'made-up-deputy' } })
    expectKeptForTheDepartments(refused, decision, [department], before)
  })

  it("5: changing authority_reference to a note a secretary wrote, not the person's own words, is refused", async () => {
    const { decision } = await aPromotedDecision('May a made-up department rest on a promoted decision, reference?', (fork) => fork)
    const department = await aDepartmentOn(decision, 'authority_reference')
    const note = await aNoteTheSecretaryFiled()
    const before = asStored(decision, [department])
    const refused = await call('PATCH', `/api/records/${decision}`, PERSON, { dataPatch: { authority_reference: note } })
    expectKeptForTheDepartments(refused, decision, [department], before)
  })

  it('6: revoking the promotion that filed it, or an act whose undoing it would leave unfit, is refused with the order', async () => {
    // THE PROMOTION THAT FILED IT: revoking it would retract the decision.
    const promoted = await aPromotedDecision('May a made-up department rest on a promoted decision, revoke?', (fork) => fork)
    const onThePromoted = await aDepartmentOn(promoted.decision, 'revoke')
    const promotedBefore = asStored(promoted.decision, [onThePromoted])
    const refused = await call('POST', `/api/records/${promoted.decision}/revisions/${String(promoted.seq)}/revoke`, PERSON)
    expectKeptForTheDepartments(refused, promoted.decision, [onThePromoted], promotedBefore)
    expect(refused.error).toContain(duties.WHY_DUTIES_ARE_REFUSED.changeThemThenRevoke)

    // AN ACT UNDER THE GRANT THAT MADE THE DECISION ONE A DEPARTMENT MAY REST ON. Revoking it would put back the version
    // before it, so it is refused with the order: the department first, then the revoke.
    for (const change of ['decidedBy', 'authorityReference'] as const) {
      const fork = await aForkThePersonFiled(`May the made-up department rest here, ${change}?`)
      let decision = ''
      if (change === 'decidedBy') {
        decision = await aDecision('A made-up decision a deputy made', `The made-up department rests here, ${change}.`, 'made-up-deputy')
        const act = await call('PATCH', `/api/records/${decision}`, as(SECRETARY), {
          dataPatch: { decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: fork },
          ...FOR_THE_PERSON,
        })
        expect(act.status, act.raw).toBe(200)
      } else {
        decision = (await aPromotedDecision(`May the made-up department rest here, ${change}, at first?`, () => aNoteTheSecretaryFiled())).decision
        const act = await call('PATCH', `/api/records/${decision}`, as(SECRETARY), { dataPatch: { authority_reference: fork }, ...FOR_THE_PERSON })
        expect(act.status, act.raw).toBe(200)
      }
      const department = await aDepartmentOn(decision, `put back ${change}`)
      const theAct = t0.client.sqlite.prepare('SELECT seq FROM revisions WHERE record_id = ? AND elevation IS NOT NULL ORDER BY seq DESC LIMIT 1').get(decision) as { seq: number } | undefined
      expect(theAct, `${change}: the act under the grant is in the decision's history`).toBeDefined()
      const before = asStored(decision, [department])
      const putBack = await call('POST', `/api/records/${decision}/revisions/${String(theAct?.seq)}/revoke`, PERSON)
      expectKeptForTheDepartments(putBack, decision, [department], before)
      expect(putBack.error).toContain(duties.WHY_DUTIES_ARE_REFUSED.changeThemThenRevokeTheAct)
    }
  })

  it('7: once the person deletes the department, the decision is deleted', async () => {
    const decision = await aDecision('A made-up decision a department rested on', 'The made-up department rested here.')
    const department = await aDepartmentOn(decision, 'deleted first')
    const takenAway = await call('DELETE', `/api/records/${department}`, PERSON)
    expect(takenAway.status, takenAway.raw).toBe(200)
    const deleted = await call('DELETE', `/api/records/${decision}`, PERSON)
    expect(deleted.status, deleted.raw).toBe(200)
    expect((stored(decision) as { record: { deleted_at: string | null } }).record.deleted_at).not.toBeNull()
  })

  it("8: a decision a secretary's duties and a department both rest on: the refusal names both, each with its door", async () => {
    const decision = await aDecision('A made-up decision duties and a department rest on', 'The made-up duties and department rest here.')
    const filed = await call('POST', '/api/records', PERSON, {
      kind: SECRETARY_DUTIES_KIND,
      title: 'Made-up duties resting beside a department',
      data: { secretary: { kind: 'agent', id: idOf(DUTIES_SECRETARY) }, area: 'A made-up area beside a department.', restsOn: [decision] },
    })
    expect(filed.status, filed.raw).toBe(201)
    const theDuties = String(filed.body.record.id)
    const department = await aDepartmentOn(decision, 'beside duties')
    const before = asStored(decision, [department])
    const dutiesBefore = stored(theDuties)
    const refused = await call('DELETE', `/api/records/${decision}`, PERSON)
    expectKeptForTheDepartments(refused, decision, [department], before)
    expect(refused.error).toContain(theDuties)
    expect(refused.error).toContain(`PUT /api/secretaries/${idOf(DUTIES_SECRETARY)}/duties`)
    expect(stored(theDuties)).toEqual(dutiesBefore)
  })

  it('9: a department merged and not deleted still holds the decision it rests on', async () => {
    const decision = await aDecision('A made-up decision a merged department rests on', 'The made-up merged department rests here.')
    const into = await call('POST', '/api/departments', PERSON, { nameEn: 'Made-up department it merged into', state: 'running' })
    expect(into.status, into.raw).toBe(201)
    const department = await aDepartmentOn(decision, 'merged')
    const merged = await call('PUT', `/api/departments/${department}`, PERSON, {
      nameEn: 'Made-up department, merged',
      state: 'merged',
      mergedInto: String(into.body.department.id),
      restsOn: [decision],
    })
    expect(merged.status, merged.raw).toBe(200)
    const before = asStored(decision, [department])
    const refused = await call('DELETE', `/api/records/${decision}`, PERSON)
    expectKeptForTheDepartments(refused, decision, [department], before)
  })
})
