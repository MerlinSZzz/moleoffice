// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TAKE, PROVED: AN AGENT'S CLAIM IS ENOUGH, A PERSON'S FORM IS A STATE ON THE PACKAGE, AND EITHER
 * ONE OPENS A CONVERSATION WITH WHOEVER IS RESPONSIBLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16, points 3 and 4, and the secretary's rulings 2 and 3 of 18:55 (report cCqfoTlkr10J):
 *
 *   - AN AGENT'S TAKE NEEDS NO NEW DOOR. A registered agent with a live session files an ORDINARY
 *     claim, through the claims door this product already had, and `GET /api/delegation` draws the
 *     packaged task as `taken`, naming that agent. No claim code changes for this to be true, and
 *     none is written here.
 *   - A PERSON'S TAKE IS A STATE ON THE PACKAGE, NEVER A CLAIM. `POST /api/delegation/:id/take`
 *     refuses an agent outright, pointing at the claims door; refuses a task with no package yet;
 *     and refuses a form missing any of its three required fields, naming every missing one at
 *     once rather than only the first.
 *   - THE FORM WRITES AN APPEND-ONLY ENTRY. A second take never erases the first.
 *   - A TAKE OPENS A CONVERSATION WITH WHOEVER `responsibleFor` NAMES, carrying a lead to the task,
 *     and an honest "nobody" is answered exactly when the change log cannot say who made the task —
 *     the take still happens, and the reply says so.
 *   - A TASK BOTH CLAIMED AND TAKEN OUTSIDE DRAWS BOTH FACTS, at the furthest-along state word.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MEASURED_TABLES } from '../src/server/db/schema.ts'

/** Each case works in a project of its own, so every column it reads is only its own task. */
let WORKSPACE = 'panelx'

let HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
let caseNumber = 0

const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
})

const A_PACKAGE = {
  forTheOutside: 'Build the module on its own and return a zip holding the source.',
  suits: 'own_module',
  acceptance: 'The module runs on its own and its tests pass.',
  acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
}

const A_TAKE = {
  who: 'ChatGPT (my own account)',
  comesBack: 'A zip holding the module and a one-page note of what it did not finish.',
  byWhen: '2026-09-20',
}

let t: TestDb
let app: FastifyInstance

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN = { ...HUMAN, 'x-mole-office-workspace': WORKSPACE }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: `Mole Office ${String(caseNumber)}` } })
  expect(made.statusCode, made.body).toBe(201)
})

/** File one record through the route and hand back its id. */
async function file(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = HUMAN,
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** Register a durable agent through the route, as the caller's headers say. */
async function registerAgent(
  handle: string,
  headers: Record<string, string> = HUMAN,
  role?: string,
  workArea?: string[],
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers,
    payload: {
      handle,
      name: handle,
      ...(role === undefined ? {} : { role }),
      ...(workArea === undefined ? {} : { workArea }),
    },
  })
  expect(res.statusCode, res.body).toBe(201)
}

/** File a task and package it, and hand back the task id. */
async function packagedTask(title: string, headers: Record<string, string> = HUMAN): Promise<string> {
  const taskId = await file('task', title, {}, headers)
  const res = await app.inject({
    method: 'POST',
    url: `/api/delegation/${taskId}/package`,
    headers,
    payload: { ...A_PACKAGE, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))] },
  })
  expect(res.statusCode, res.body).toBe(201)
  return taskId
}

/** Read the delegation column for this project. */
async function theColumn(headers: Record<string, string> = HUMAN) {
  const res = await app.inject({ method: 'GET', url: '/api/delegation', headers })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    tasks: Record<string, unknown>[]
    couldNotRead: { recordId: string }[]
    workspaceId: string
  }
}

/** One task's row from the column, by id. */
async function rowFor(taskId: string): Promise<Record<string, unknown>> {
  const column = await theColumn()
  const row = column.tasks.find((one) => one['recordId'] === taskId)
  expect(row, `no row for ${taskId}`).toBeDefined()
  return row as Record<string, unknown>
}

/** One record, read back by id. */
async function recordNow(id: string): Promise<{ id: string; kind: string; title: string; data: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: { id: string; kind: string; title: string; data: Record<string, unknown> } }).record
}

/**
 * The whole database as a string, except the measured tables, so a refusal can be shown to write
 * nothing AUTHORED. `MEASURED_TABLES` (table-name-lists.ts) is telemetry the server counts about a request
 * regardless of how it was answered — `header_only_calls` gains a row the first time a given
 * actor-type/actor-id pair is ever seen, whether the request it arrived on was refused or not — so
 * comparing those tables here would fail a refusal for a row nothing in this file's code wrote.
 */
function databaseNow(): string {
  const measured = new Set<string>(MEASURED_TABLES)
  const tables = (
    t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[]
  )
    .map((one) => one.name)
    .filter((name) => !measured.has(name))
  const counts = tables.map((name) => {
    const { n } = t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }
    return `${name}=${n}`
  })
  const rows = t.client.sqlite.prepare('SELECT * FROM records ORDER BY id').all()
  return `${counts.join(' ')}\n${JSON.stringify(rows)}`
}

/** File a session record with a running state, the weak input a live claim can read. */
async function aRunningSession(): Promise<string> {
  return file('session', 'a run for the claim', { state: 'running' })
}

/** Ask the take door for one task, with the body defaulting to a fully filled-in form. */
async function takeIt(taskId: string, body: Record<string, unknown> = A_TAKE, headers: Record<string, string> = HUMAN) {
  return app.inject({ method: 'POST', url: `/api/delegation/${taskId}/take`, headers, payload: body })
}

// ============================================================================ T1: an agent's claim needs no new door

describe("an agent's take needs no new door", () => {
  it('draws a packaged task as taken, naming the agent, once its claim is filed through POST /api/claims', async () => {
    const taskId = await packagedTask('Held by an ordinary claim')
    await registerAgent('f16-claimant', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent('f16-claimant'),
      payload: { run, things: [{ what: 'record', id: taskId }] },
    })
    expect(claimed.statusCode, claimed.body).toBe(201)

    const row = await rowFor(taskId)
    expect(row['state']).toBe('taken')
    expect(row['heldBy']).toEqual({ kind: 'agent', id: idOf('f16-claimant') })
    expect(row['outsideName']).toBe(null)
  })
})

// ============================================================================ T2/T3: a person's take

describe("a person's take", () => {
  it('refuses while any one of the three fields is empty, naming it, and names every missing one at once', async () => {
    const cases: { what: string; body: Record<string, unknown>; names: string[] }[] = [
      { what: 'who is empty', body: { ...A_TAKE, who: '' }, names: ['who'] },
      { what: 'who is only whitespace', body: { ...A_TAKE, who: '   ' }, names: ['who'] },
      { what: 'comesBack is empty', body: { ...A_TAKE, comesBack: '' }, names: ['comesBack'] },
      { what: 'byWhen is empty', body: { ...A_TAKE, byWhen: '' }, names: ['byWhen'] },
      {
        what: 'who and comesBack are both empty',
        body: { ...A_TAKE, who: '', comesBack: '' },
        names: ['who', 'comesBack'],
      },
      {
        what: 'all three are empty',
        body: { who: '', comesBack: '', byWhen: '' },
        names: ['who', 'comesBack', 'byWhen'],
      },
    ]
    for (const one of cases) {
      const taskId = await packagedTask(`Refused: ${one.what}`)
      const before = databaseNow()
      const res = await takeIt(taskId, one.body)
      expect(res.statusCode, `${one.what}: ${res.body}`).toBe(400)
      // THE EXACT NAMED CLAUSE, not merely each field's name appearing somewhere in the sentence:
      // the explanation below the named list mentions all three field names on every refusal, so a
      // looser `.toContain(name)` check would still pass even if the door stopped checking a field.
      const expected = `${one.names.map((f) => `\`${f}\``).join(' and ')} ${one.names.length === 1 ? 'is' : 'are'} empty`
      expect(res.body, `${one.what} — expected to contain "${expected}"`).toContain(expected)
      expect(databaseNow(), `${one.what} wrote to the database`).toBe(before)
    }
  })

  it('writes the entry and draws the task as taken, naming the outside chat, when all three are filled', async () => {
    const taskId = await packagedTask('Taken outside cleanly')
    const res = await takeIt(taskId)
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { entry: Record<string, unknown> }
    expect(body.entry['who']).toBe(A_TAKE.who)
    expect(body.entry['comesBack']).toBe(A_TAKE.comesBack)
    expect(body.entry['byWhen']).toBe(A_TAKE.byWhen)

    const row = await rowFor(taskId)
    expect(row['state']).toBe('taken')
    expect(row['outsideName']).toBe(A_TAKE.who)
  })

  it('appends a second take and never replaces the first', async () => {
    const taskId = await packagedTask('Taken twice')
    expect((await takeIt(taskId, { ...A_TAKE, who: 'First taker' })).statusCode).toBe(201)
    expect((await takeIt(taskId, { ...A_TAKE, who: 'Second taker' })).statusCode).toBe(201)

    const record = await recordNow(taskId)
    const entries = record.data['takenOutside'] as Record<string, unknown>[]
    expect(entries.length).toBe(2)
    expect(entries[0]?.['who']).toBe('First taker')
    expect(entries[1]?.['who']).toBe('Second taker')

    const row = await rowFor(taskId)
    expect(row['outsideName']).toBe('Second taker')
  })

  it('refuses an agent actor outright, pointing at POST /api/claims, and writes nothing', async () => {
    const taskId = await packagedTask('Not for an agent to take')
    await registerAgent('f16-wrong-door')
    const before = databaseNow()
    const res = await takeIt(taskId, A_TAKE, asAgent('f16-wrong-door'))
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain('POST /api/claims')
    expect(databaseNow(), 'the refused take wrote to the database').toBe(before)
  })

  it('refuses a task that has not been packaged yet', async () => {
    const taskId = await file('task', 'Never packaged')
    const before = databaseNow()
    const res = await takeIt(taskId)
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain('package')
    expect(databaseNow()).toBe(before)
  })
})

// ============================================================================ T4: a take opens a conversation

describe('a take opens a conversation with the one responsible', () => {
  it('sends the responsible one a message carrying a lead to the task', async () => {
    await registerAgent('f16-owner')
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task an agent owns',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'f16-owner', stated: true },
    }).id
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/delegation/${taskId}/package`,
          headers: HUMAN,
          payload: { ...A_PACKAGE, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))] },
        })
      ).statusCode,
    ).toBe(201)

    const res = await takeIt(taskId)
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as {
      responsible: { who: { kind: string; id: string } | null }
      toldId: string | null
    }
    expect(body.responsible.who).toEqual({ kind: 'agent', id: idOf('f16-owner') })
    expect(body.toldId).not.toBe(null)

    const message = await recordNow(body.toldId as string)
    expect(message.kind).toBe('message')
    expect(message.data['to']).toEqual([{ kind: 'agent', id: idOf('f16-owner') }])
    expect(message.data['sentBy']).toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    // toMatchObject, NOT toEqual: the record-write layer canonicalises a Context field and adds its
    // own defaults for keys this door never set (`place`, in particular). What matters here is only
    // that the lead really points at this task, in this project.
    expect(message.data['lead']).toMatchObject({ target: { kind: 'record', recordId: taskId, workspaceId: WORKSPACE } })
    expect(JSON.stringify(message.data)).toContain(A_TAKE.who)
    expect(JSON.stringify(message.data)).toContain(A_TAKE.byWhen)
  })

  it('still takes the package, and says nobody was told and why, when the responsible one cannot be worked out', async () => {
    const taskId = await packagedTask('Nobody can say who made this')
    t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(taskId)

    const res = await takeIt(taskId)
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { toldId: string | null; note: string; responsible: { who: unknown; why: string } }
    expect(body.toldId).toBe(null)
    expect(body.responsible.who).toBe(null)
    expect(body.note).toContain('Nobody was told')
    expect(body.note).toContain('no create row')
  })
})

// ============================================================================ both facts at once

describe('a task both claimed and taken outside', () => {
  it('draws both facts, at the furthest-along state word', async () => {
    const taskId = await packagedTask('Held and promised out, through the real doors')
    await registerAgent('f16-both-holder', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/claims',
          headers: asAgent('f16-both-holder'),
          payload: { run, things: [{ what: 'record', id: taskId }] },
        })
      ).statusCode,
    ).toBe(201)
    expect((await takeIt(taskId)).statusCode).toBe(201)

    const row = await rowFor(taskId)
    expect(row['state']).toBe('taken')
    expect(row['heldBy']).toEqual({ kind: 'agent', id: idOf('f16-both-holder') })
    expect(row['outsideName']).toBe(A_TAKE.who)
  })
})
