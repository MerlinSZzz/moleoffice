// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SOMETHING COMES BACK FROM OUTSIDE, AND THE ONE RESPONSIBLE SAYS THE TASK IS FINISHED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16 point 5, and invariant 3.
 *
 *   1. THE RETURN DOOR STORES ONE ENTRY PER FORM, APPEND-ONLY. Words are words in the entry, a
 *      picture is the path the pictures door handed back, and a zip is the path the returned-files
 *      door handed back. A second return never removes the first.
 *   2. IT TAKES PATHS AND NOT BYTES. A picture path or a zip path no storing door produced is
 *      refused by name and nothing is written.
 *   3. IT REFUSES AN AGENT, AND TELLS IT WHAT IT DOES INSTEAD: an agent's return is the ordinary
 *      acceptance as it stands today.
 *   4. NOTHING AT ALL IS REFUSED, and two forms at once are refused.
 *   5. EVERY ENTRY SAYS ON ITS FACE THAT IT CAME FROM OUTSIDE. The stored marker is read back, and
 *      the one component that draws a return labels it with its outside author.
 *   6. THE COLUMN DRAWS THE TASK AS `returned`, then as `confirmed`.
 *   7. THE CONFIRMATION IS RESERVED to the one `responsibleFor` names and to the person, and the
 *      refusal names who may. A task whose responsible one cannot be worked out is still
 *      confirmable by the person and by nobody else.
 *   8. CONFIRMING RELEASES NO CLAIM.
 *   9. THE WAITING QUEUE PUTS A RETURNED TASK ON THE PERSON'S LIST, under a verb of its own whose
 *      words hold no underscore.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   drop the words from the entry                       → case 1's words test
 *   drop the picture paths from the entry               → case 1's pictures test
 *   drop the zip path from the entry                    → case 1's zip test
 *   skip the picture-path check                         → case 2's picture test
 *   skip the zip-path check                             → case 2's zip test
 *   stop refusing an agent here                         → case 3
 *   stop refusing an empty return, or two forms at once → case 4
 *   store the marker false, or draw no outside label    → case 5
 *   stop appending to `returns`, or stop writing
 *   `completed`                                         → case 6
 *   stop calling the confirmation guard                 → case 7's first test
 *   refuse the person when nobody can be worked out     → case 7's second test
 *   release the claims as part of confirming            → case 8
 *   make the pending query return nothing               → case 9
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PREVIEW ROOT IS NAMED, AND WHY THAT IS NOT CHEATING
 * ---------------------------------------------------------------------------------------
 *
 * A returned picture and a returned zip are stored beside the database, and `GET /api/file` reads
 * only inside a preview root. A test database lives in a temporary directory of its own, so without
 * naming it the storing doors would refuse — which is the doors being right rather than the test
 * being wrong. The checkout stays a root as well, so nothing else changes.
 *
 * NO SERVER IS STARTED. `apiApp` builds the product's own server without listening and every request
 * goes through `app.inject`.
 */

import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NOTHING_WAS_BROUGHT_BACK } from '../src/shared/delegation.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MEASURED_TABLES } from '../src/server/db/schema.ts'
// Type-only, so it is erased before this file runs and opens no database: the shape the component
// tests below are built from.
import type { StatedReturn } from '../src/web/api.ts'

/**
 * EACH CASE GETS ITS OWN PROJECT AND ITS OWN HANDLES. The delegation column, the waiting queue and
 * the read-back of a task are per project, and a handle is unique across the office; both are what
 * keeps one case from reading what another wrote.
 */
let WORKSPACE = 'panelx'
let caseNumber = 0
function handleFor(name: string): string {
  return `${name}-c${String(caseNumber)}`
}
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}

const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handleFor(handle),
  'x-mole-office-workspace': WORKSPACE,
})

const A_PACKAGE = {
  forTheOutside: 'Build the module on its own and return a zip holding the source.',
  suits: 'own_module',
  acceptance: 'The module runs on its own and its tests pass.',
  acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
}

/** A one pixel png, so what the pictures door stores is a real picture and not bytes called one. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** A zip the returned-files door accepts: the four bytes it checks, and some content after them. */
const A_ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16, 7)])

let t: TestDb
let app: FastifyInstance
let ours = ''
let previousRoots: string | undefined
let panel: typeof import('../src/web/components/TaskPackagePanel.tsx')

beforeAll(async () => {
  // A window first: src/web/api.ts reads it at module scope. Same stand-in the other web tests use.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  panel = await import('../src/web/components/TaskPackagePanel.tsx')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  t = await freshDb()
  ours = dirname(t.file)
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${ours}`
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Mole Office case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

// ============================================================================ helpers

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

/** Register a durable agent through the route the product uses. */
async function registerAgent(handle: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: HUMAN,
    payload: { handle: handleFor(handle), name: handle, workArea: ['src'] },
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

/** Send a real picture through the pictures door and hand back the path it produced. */
async function sendAPicture(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/messages/pictures',
    headers: HUMAN,
    payload: JSON.stringify({ bytes: A_REAL_PNG.toString('base64') }),
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { picture: { path: string } }).picture.path
}

/** Send a zip through the returned-files door and hand back the path it produced. */
async function sendAZip(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/returned-files',
    headers: HUMAN,
    payload: JSON.stringify({ bytes: A_ZIP.toString('base64') }),
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { returnedFile: { path: string } }).returnedFile.path
}

/** Ask the return door for one task. */
async function returnIt(
  taskId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = HUMAN,
) {
  return app.inject({ method: 'POST', url: `/api/delegation/${taskId}/return`, headers, payload: body })
}

/** Ask the confirm door for one task. */
async function confirmIt(taskId: string, headers: Record<string, string> = HUMAN) {
  return app.inject({ method: 'POST', url: `/api/delegation/${taskId}/confirm`, headers })
}

/** One record, read back by id. */
async function recordNow(id: string): Promise<{ data: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: { data: Record<string, unknown> } }).record
}

/** Every return on a task, oldest first. */
async function returnsNow(taskId: string): Promise<Record<string, unknown>[]> {
  const record = await recordNow(taskId)
  return (record.data['returns'] as Record<string, unknown>[] | undefined) ?? []
}

/** One task's row from the packaged-tasks column, by id. */
async function columnRow(taskId: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: '/api/delegation', headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const rows = (res.json() as { tasks: Record<string, unknown>[] }).tasks
  const row = rows.find((one) => one['recordId'] === taskId)
  expect(row, `no column row for ${taskId}`).toBeDefined()
  return row as Record<string, unknown>
}

/**
 * The whole database as a string, except the measured tables, so a refusal can be shown to write
 * nothing AUTHORED — the same reading tests/an-agent-takes-with-a-claim-a-person-takes-with-a-form
 * uses, and for the same reason.
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

// ============================================================================ 1. the three forms

describe('one thing at a time comes back and is stored with what the doors handed over', () => {
  it('stores the words of a text return', async () => {
    const taskId = await packagedTask('Words came back')
    const res = await returnIt(taskId, { fromOutside: 'ChatGPT (my own account)', words: 'Finished it. One test needs the key.' })
    expect(res.statusCode, res.body).toBe(201)

    const returns = await returnsNow(taskId)
    expect(returns.length).toBe(1)
    expect(returns[0]?.['form']).toBe('text')
    expect(returns[0]?.['words']).toBe('Finished it. One test needs the key.')
    expect(returns[0]?.['fromOutside']).toBe('ChatGPT (my own account)')
  })

  it('stores the picture paths the pictures door handed back', async () => {
    const taskId = await packagedTask('Pictures came back')
    const path = await sendAPicture()
    const res = await returnIt(taskId, { fromOutside: 'Wren', words: 'Two views of the rig.', pictures: [path] })
    expect(res.statusCode, res.body).toBe(201)

    const returns = await returnsNow(taskId)
    expect(returns[0]?.['form']).toBe('pictures')
    expect(returns[0]?.['pictures']).toEqual([path])
    expect(existsSync(path), 'the picture the door wrote is gone').toBe(true)
  })

  it('stores the zip path the returned-files door handed back', async () => {
    const taskId = await packagedTask('A zip came back')
    const path = await sendAZip()
    const res = await returnIt(taskId, { fromOutside: 'ChatGPT (my own account)', file: path })
    expect(res.statusCode, res.body).toBe(201)

    const returns = await returnsNow(taskId)
    expect(returns[0]?.['form']).toBe('zip')
    expect(returns[0]?.['file']).toBe(path)
    expect(existsSync(path), 'the zip the door wrote is gone').toBe(true)
  })

  it('appends a second return and never replaces the first', async () => {
    const taskId = await packagedTask('Two things came back')
    expect((await returnIt(taskId, { fromOutside: 'First', words: 'one' })).statusCode).toBe(201)
    expect((await returnIt(taskId, { fromOutside: 'Second', words: 'two' })).statusCode).toBe(201)

    const returns = await returnsNow(taskId)
    expect(returns.length).toBe(2)
    expect(returns[0]?.['fromOutside']).toBe('First')
    expect(returns[1]?.['fromOutside']).toBe('Second')
  })
})

// ============================================================================ 2. paths and bytes

describe('the door takes paths a storing door produced, and no others', () => {
  it('refuses a picture path no door produced, by name, writing nothing', async () => {
    const taskId = await packagedTask('A made-up picture path')
    const before = databaseNow()
    const res = await returnIt(taskId, { fromOutside: 'Wren', pictures: ['/tmp/not-a-real-picture.png'] })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain('/tmp/not-a-real-picture.png')
    expect(res.body).toContain('POST /api/messages/pictures')
    expect(databaseNow(), 'the refused return wrote to the database').toBe(before)
  })

  it('refuses a zip path no door produced, by name, writing nothing', async () => {
    const taskId = await packagedTask('A made-up zip path')
    const before = databaseNow()
    const res = await returnIt(taskId, { fromOutside: 'ChatGPT', file: '/tmp/not-a-real-return.zip' })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain('/tmp/not-a-real-return.zip')
    expect(res.body).toContain('POST /api/returned-files')
    expect(databaseNow(), 'the refused return wrote to the database').toBe(before)
  })
})

// ============================================================================ 3. an agent is refused

describe('an agent is refused and told what it does instead', () => {
  it('refuses an agent at the return door, pointing at the ordinary acceptance, and writes nothing', async () => {
    const taskId = await packagedTask('Not for an agent to bring back')
    await registerAgent('f16-wrong-door')
    const before = databaseNow()
    const res = await returnIt(taskId, { fromOutside: 'An agent', words: 'I did it.' }, asAgent('f16-wrong-door'))
    expect(res.statusCode, res.body).toBe(403)
    expect(res.body).toContain('ordinary acceptance')
    expect(res.body).toContain('review')
    expect(databaseNow(), 'the refused return wrote to the database').toBe(before)
  })
})

// ============================================================================ 4. nothing, and two forms

describe('a return is exactly one thing', () => {
  it('refuses a return that brought nothing back, saying all three are empty, and writes nothing', async () => {
    const taskId = await packagedTask('Nothing came back')
    const before = databaseNow()
    const res = await returnIt(taskId, { fromOutside: 'ChatGPT' })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain(NOTHING_WAS_BROUGHT_BACK)
    expect(databaseNow(), 'the refused return wrote to the database').toBe(before)
  })

  it('refuses a return carrying both pictures and a zip, and writes nothing', async () => {
    const taskId = await packagedTask('Two forms at once')
    const picture = await sendAPicture()
    const zip = await sendAZip()
    const before = databaseNow()
    const res = await returnIt(taskId, { fromOutside: 'ChatGPT', pictures: [picture], file: zip })
    expect(res.statusCode, res.body).toBe(400)
    expect(res.body).toContain('one form')
    expect(databaseNow(), 'the refused return wrote to the database').toBe(before)
  })
})

// ============================================================================ 5. from outside, by name

describe('every entry says on its face that it came from outside', () => {
  it('stores the marker, the name and the person who carried it, and nowhere else', async () => {
    const taskId = await packagedTask('A return that is nobody\'s observation')
    const res = await returnIt(taskId, { fromOutside: 'ChatGPT (my own account)', words: 'the outside words' })
    expect(res.statusCode, res.body).toBe(201)

    const record = await recordNow(taskId)
    const returns = (record.data['returns'] as Record<string, unknown>[]) ?? []
    expect(returns.length).toBe(1)
    expect(returns[0]?.['saysItIsFromOutside']).toBe(true)
    expect(returns[0]?.['fromOutside']).toBe('ChatGPT (my own account)')
    expect(returns[0]?.['broughtBackBy']).toEqual({ actorType: 'human', actorId: THE_PERSON })

    // AND NOWHERE ELSE. A return must never become a summary, a finding or a measurement, so the
    // words are in the returns list and in no other key of the record.
    const elsewhere = { ...record.data }
    delete elsewhere['returns']
    expect(JSON.stringify(elsewhere)).not.toContain('the outside words')
  })

  it('draws an entry with its outside author and the form it came in', () => {
    const entry: StatedReturn = {
      at: '2026-09-16 11:02:00',
      broughtBackBy: { actorType: 'human', actorId: THE_PERSON },
      fromOutside: 'ChatGPT (my own account)',
      form: 'zip',
      words: 'Finished the module.',
      file: 'data/packages/returns/wrist-camera-module.zip',
      saysItIsFromOutside: true,
    }
    const html = renderToStaticMarkup(h(panel.ReturnsList, { returns: [entry] }))
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    expect(html).toContain('from outside')
    expect(html).toContain('ChatGPT (my own account)')
    expect(html).toContain('brought back by')
    expect(html).toContain('person')
    expect(html).toContain('a zip')
    expect(html).toContain('Finished the module.')
  })

  it('answers no returns for an entry that does not carry the marker', () => {
    // The reader, not the drawing, is where the marker is enforced: a hand-edited or imported entry
    // without `saysItIsFromOutside` is not a return this product wrote and is not drawn as one.
    const unmarked = {
      at: '2026-09-16 11:02:00',
      broughtBackBy: { actorType: 'human', actorId: THE_PERSON },
      fromOutside: 'Somebody',
      form: 'text',
      words: 'not marked as from outside',
    }
    expect(panel.returnsOnTask({ returns: [unmarked] })).toEqual([])
  })
})

// ============================================================================ 6. the column

describe('the column draws the task as handed back, then as done', () => {
  it('goes handed back on the first return, and done once the person confirms', async () => {
    const taskId = await packagedTask('The column watches it come back')
    // To do, to begin with: nobody has taken it and nothing has come back.
    expect((await columnRow(taskId))['state']).toBe('to_do')

    expect(
      (await returnIt(taskId, { fromOutside: 'ChatGPT (my own account)', words: 'it is back' })).statusCode,
    ).toBe(201)
    const returned = await columnRow(taskId)
    expect(returned['state']).toBe('handed_back')
    expect(returned['returnCount']).toBe(1)
    expect(returned['confirmedAt']).toBe(null)

    expect((await confirmIt(taskId)).statusCode).toBe(201)
    const confirmed = await columnRow(taskId)
    expect(confirmed['state']).toBe('done')
    expect(typeof confirmed['confirmedAt']).toBe('string')
  })
})

// ============================================================================ 7. who may confirm

describe('the confirmation is reserved to the one responsible and to the person', () => {
  it('refuses an agent that is not responsible, names who may, and lets the person through', async () => {
    await registerAgent('f16-owner')
    await registerAgent('f16-other')
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task an agent owns',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: handleFor('f16-owner'), stated: true },
    }).id
    const packaged = await app.inject({
      method: 'POST',
      url: `/api/delegation/${taskId}/package`,
      headers: HUMAN,
      payload: { ...A_PACKAGE, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))] },
    })
    expect(packaged.statusCode, packaged.body).toBe(201)
    expect((await returnIt(taskId, { fromOutside: 'ChatGPT', words: 'back' })).statusCode).toBe(201)

    const before = databaseNow()
    const refused = await confirmIt(taskId, asAgent('f16-other'))
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('f16-owner')
    expect(refused.body).toContain('person')
    expect(refused.body).toContain('f16-other')
    expect(databaseNow(), 'the refused confirmation wrote to the database').toBe(before)

    const allowed = await confirmIt(taskId)
    expect(allowed.statusCode, allowed.body).toBe(201)
    expect((await columnRow(taskId))['state']).toBe('done')
  })

  it('refuses the responsible agent a second confirmation, because a confirmation is written once', async () => {
    await registerAgent('f16-owner')
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'Confirmed once',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: handleFor('f16-owner'), stated: true },
    }).id
    const packaged = await app.inject({
      method: 'POST',
      url: `/api/delegation/${taskId}/package`,
      headers: HUMAN,
      payload: { ...A_PACKAGE, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))] },
    })
    expect(packaged.statusCode, packaged.body).toBe(201)
    expect((await returnIt(taskId, { fromOutside: 'ChatGPT', words: 'back' })).statusCode).toBe(201)
    expect((await confirmIt(taskId, asAgent('f16-owner'))).statusCode).toBe(201)

    const before = databaseNow()
    const again = await confirmIt(taskId, asAgent('f16-owner'))
    expect(again.statusCode, again.body).toBe(409)
    expect(again.body).toContain('once')
    expect(databaseNow(), 'the second confirmation wrote to the database').toBe(before)
  })

  it('still lets the person confirm when the responsible one cannot be worked out, and no agent may', async () => {
    const taskId = await packagedTask('Nobody can say who made this')
    expect((await returnIt(taskId, { fromOutside: 'ChatGPT', words: 'back' })).statusCode).toBe(201)
    // The create row is what `responsibleFor` reads; without it the honest answer is "nobody".
    t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(taskId)

    const refused = await confirmIt(taskId, asAgent('any-agent'))
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('person')

    const allowed = await confirmIt(taskId)
    expect(allowed.statusCode, allowed.body).toBe(201)
  })
})

// ============================================================================ 8. no release

describe('confirming releases nothing', () => {
  it('leaves a live claim on the record exactly where it was', async () => {
    const taskId = await packagedTask('Held while it is confirmed')
    await registerAgent('f16-claimant')
    const run = await file('session', 'a run for the claim', { state: 'running' })
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent('f16-claimant'),
      payload: { run, things: [{ what: 'record', id: taskId }] },
    })
    expect(claimed.statusCode, claimed.body).toBe(201)

    expect((await returnIt(taskId, { fromOutside: 'ChatGPT', words: 'back' })).statusCode).toBe(201)
    expect((await confirmIt(taskId)).statusCode).toBe(201)

    const onRecord = await app.inject({
      method: 'GET',
      url: `/api/claims/on/${taskId}`,
      headers: HUMAN,
    })
    expect(onRecord.statusCode, onRecord.body).toBe(200)
    const claims = (onRecord.json() as { claims: { id: string; releasedAt: string | null }[] }).claims
    expect(claims.length, 'confirming released the claim').toBe(1)
    expect(claims[0]?.releasedAt).toBe(null)
  })
})

// ============================================================================ 9. the waiting verb

describe('a returned task waits on the person under a verb of its own', () => {
  it('puts the task on the waiting list as confirm-return, with words that hold no underscore', async () => {
    const taskId = await packagedTask('Waiting to be confirmed')
    expect((await returnIt(taskId, { fromOutside: 'ChatGPT', words: 'back' })).statusCode).toBe(201)

    const res = await app.inject({ method: 'GET', url: '/api/waiting', headers: HUMAN })
    expect(res.statusCode, res.body).toBe(200)
    const reply = res.json() as { items: { id: string; act: string; why: string }[] }
    const row = reply.items.find((one) => one.id === taskId)
    expect(row, `no waiting row for ${taskId}`).toBeDefined()
    expect(row?.act).toBe('confirm-return')
    expect(row?.why).toContain('confirm a returned task is finished')
    expect(row?.why ?? '').not.toContain('_')

    // AND IT LEAVES THE LIST ONCE CONFIRMED, by derivation and with nothing written.
    expect((await confirmIt(taskId)).statusCode).toBe(201)
    const after = await app.inject({ method: 'GET', url: '/api/waiting', headers: HUMAN })
    const items = (after.json() as { items: { id: string }[] }).items
    expect(items.map((one) => one.id)).not.toContain(taskId)
  })
})

