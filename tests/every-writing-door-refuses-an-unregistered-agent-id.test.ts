// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY WRITING DOOR REFUSES AN AGENT ID NO REGISTRY HOLDS, NOT ONLY THE RECORDS DOOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS BESIDE THE FIRST ONE
 * ---------------------------------------------------------------------------------------
 *
 * The first file, tests/a-write-under-an-unregistered-agent-id-is-refused.test.ts, proved the
 * refusal for the records door. The inspector then drove POST /api/records/:id/timeline on the live
 * office and got a 201: the incident's timeline gained the moment, `who` was stored as a placeholder
 * no registry held, and the change row kept that name for ever. notebook.ts, roles.ts and
 * folderreading.ts build their actor the same way and write into the same tables. The refusal now
 * lives in `actorFrom` (src/server/lib/http.ts), which every writing route passes through, so this
 * file drives each door the audit found open and checks three things:
 *
 *   1. a write under an id no registry holds gets 403, and NOTHING is stored — no record, no link,
 *      no draft row and no change row under the made-up name;
 *   2. the same id, once registered, makes the same write;
 *   3. the declared office writers and the person keep writing where they wrote, and an in-process
 *      caller is still not asked at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * `whyAnUnregisteredAgentMayNotWrite` reads `actor.from`, written by the listener that accepted the
 * connection. An injected request is on no socket, so its arrival is `undefined` — the rule does not
 * apply, which is the honest answer for the seed, a migration or a script, and the line that keeps
 * criterion M14 whole. So each refusal case here drives a real port with `fetch`; the last case
 * proves the in-process answer with `app.inject`.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
/** The door Mole Office really answers on: `app.listen()`, stamped `this machine` by buildApp. */
let base: string
/**
 * THE DECLARED EXCEPTIONS, IMPORTED AFTER A DATABASE EXISTS. src/server/lib/records.ts reaches
 * src/server/db/client.ts, so a static import here would open the database `.env` names before
 * `freshDb()` could name this test's own — the failure tests/no-test-opens-the-live-corpus.test.ts
 * exists to catch. Read inside `beforeAll`, after `freshDb()`.
 */
let declaredExceptions: readonly string[]

const THE_PERSON = THE_TEST_OFFICES_OWNER.id

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The headers a run sends when its brief left its actor id unfilled. */
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

interface Answer {
  status: number
  body: string
  /** The parsed body, or null when the reply is not JSON. */
  said: Record<string, unknown> | null
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<Answer> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = await res.text()
  let said: Record<string, unknown> | null = null
  try {
    said = JSON.parse(body) as Record<string, unknown>
  } catch {
    said = null
  }
  return { status: res.status, body, said }
}

/** Every actor id in the change log, exactly as the log stored it. */
async function writers(): Promise<string[]> {
  const log = await ask('GET', '/api/changes', undefined, AS_THE_PERSON)
  const rows = (log.said?.['changes'] ?? []) as { actorId: string }[]
  return rows.map((row) => row.actorId)
}

/** The id of a note filed by the person, for evidence or for one end of a link. */
async function aNote(title: string): Promise<string> {
  const made = await ask('POST', '/api/records', { kind: 'note', title, data: { body: 'the person wrote this' } }, AS_THE_PERSON)
  expect(made.status, made.body).toBe(201)
  return String((made.said?.['record'] as { id?: unknown } | undefined)?.id ?? '')
}

/** One incident, filed by the person, with a timeline moment already on it. */
async function anIncident(): Promise<string> {
  const made = await ask(
    'POST',
    '/api/records',
    {
      kind: 'incident',
      title: `an incident for the door audit ${Math.random().toString(36).slice(2, 8)}`,
      data: { loss: 'A near-miss nobody wants twice.', timeline: [{ id: 'm-0', at: '2026-09-16 09:00', who: 'the operator', what: 'It happened.', evidence: 'placeholder' }] },
    },
    AS_THE_PERSON,
  )
  expect(made.status, made.body).toBe(201)
  return String((made.said?.['record'] as { id?: unknown } | undefined)?.id ?? '')
}

/** Register a handle through the ordinary starter door, as the person, and insist it worked. */
async function register(handle: string, role?: string): Promise<void> {
  const made = await ask(
    'POST',
    '/api/agents/started',
    role === undefined ? { handle, name: handle } : { handle, name: handle, role },
    AS_THE_PERSON,
  )
  expect(made.status, made.body).toBe(201)
}

/** The refusal must name the made-up id and say the registry has nobody by that name. */
function expectTheRegistryRefusal(answer: Answer, id: string): void {
  expect(answer.status, answer.body).toBe(403)
  const why = String(answer.said?.['error'] ?? '')
  expect(why, 'the refusal must name the id it refused').toContain(id)
  expect(why, 'the refusal must say the registry has nobody by that name').toContain('Nothing is registered as the agent')
  expect(why, 'the refusal must say nothing was written').toContain('Nothing was written')
}

const A_MOMENT = { at: '2026-09-16 10:00', who: 'the operator', what: 'The timeline gained a moment.', evidence: 'placeholder' }

beforeAll(async () => {
  t = await freshDb()
  declaredExceptions = (await import('../src/server/lib/records.ts')).AGENT_IDS_THAT_NEED_NO_REGISTRATION
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a write under an id no registry holds is refused at every door', () => {
  it('refuses the incident timeline, leaves no moment and no change row, and accepts it once registered', async () => {
    const handle = 'timeline-actor'
    const incident = await anIncident()
    const evidence = await aNote('the evidence a timeline moment names')

    const refused = await ask('POST', `/api/records/${incident}/timeline`, { ...A_MOMENT, evidence }, asAgent(handle))
    expectTheRegistryRefusal(refused, handle)

    const before = await ask('GET', `/api/records/${incident}`, undefined, AS_THE_PERSON)
    const moments = ((before.said?.['record'] as { data?: { timeline?: unknown[] } } | undefined)?.data?.timeline ?? []) as unknown[]
    expect(moments, 'a refused write left a moment on the timeline').toHaveLength(1)
    expect(await writers(), 'a refused write left a change row under the made-up name').not.toContain(handle)

    await register(handle)
    const accepted = await ask('POST', `/api/records/${incident}/timeline`, { ...A_MOMENT, evidence }, asAgent(handle))
    expect(accepted.status, accepted.body).toBe(201)
    expect(await writers(), 'the accepted moment is not attributed to the registered handle').toContain(handle)
  })

  it('refuses the notebook doors, and accepts them once the registered handle writes its own', async () => {
    const notebookHandle = 'notebook-keeper'
    await register(notebookHandle, 'secretary')
    // The person writes the first entry, which makes the notebook. The secretary may then write its
    // own entries; an id no registry holds may write nothing.
    const first = await ask(
      'POST',
      `/api/agents/${notebookHandle}/notebook/entries`,
      { entryKind: 'its-character', text: 'It keeps its writing short.' },
      AS_THE_PERSON,
    )
    expect(first.status, first.body).toBe(201)
    const notebook = (first.said as { recordId?: string } | null)?.recordId ?? ''
    expect(notebook).not.toBe('')

    const stranger = 'a-notebook-stranger'
    // AN ID NO REGISTRY HOLDS, AND NOT THE NOTEBOOK'S OWN HANDLE, so the refusal can only be the
    // registry one. The notebook's own stranger rule refuses too, but with a different sentence;
    // this asserts the shared sentence, which is what makes the case go red with the refusal removed.
    const refusedAdd = await ask(
      'POST',
      `/api/agents/${notebookHandle}/notebook/entries`,
      { entryKind: 'its-character', text: 'A stranger wrote this.' },
      asAgent(stranger),
    )
    expectTheRegistryRefusal(refusedAdd, stranger)

    // A CHANGE AND A REMOVE NAME AN EXISTING ENTRY, so they are reached with an entry already there.
    const entryId = String(((first.said as { entries?: { id: string }[] } | null)?.entries ?? [])[0]?.id ?? '')
    const refusedChange = await ask(
      'PATCH',
      `/api/agents/${notebookHandle}/notebook/entries/${entryId}`,
      { text: 'A stranger changed this.' },
      asAgent(stranger),
    )
    expectTheRegistryRefusal(refusedChange, stranger)
    const refusedRemove = await ask(
      'DELETE',
      `/api/agents/${notebookHandle}/notebook/entries/${entryId}`,
      undefined,
      asAgent(stranger),
    )
    expectTheRegistryRefusal(refusedRemove, stranger)
    expect(await writers(), 'a refused notebook write left a change row under the made-up name').not.toContain(stranger)

    // THE REGISTERED HANDLE WRITES ITS OWN NOTEBOOK, on all three doors.
    const added = await ask(
      'POST',
      `/api/agents/${notebookHandle}/notebook/entries`,
      { entryKind: 'its-character', text: 'It says what it means the first time.' },
      asAgent(notebookHandle),
    )
    expect(added.status, added.body).toBe(201)
    const addedId = String(((added.said as { entries?: { id: string }[] } | null)?.entries ?? [])[0]?.id ?? '')
    const changed = await ask(
      'PATCH',
      `/api/agents/${notebookHandle}/notebook/entries/${addedId}`,
      { text: 'It says what it means the first time, and no more.' },
      asAgent(notebookHandle),
    )
    expect(changed.status, changed.body).toBe(200)
    const removed = await ask(
      'DELETE',
      `/api/agents/${notebookHandle}/notebook/entries/${addedId}`,
      undefined,
      asAgent(notebookHandle),
    )
    expect(removed.status, removed.body).toBe(200)
  })

  it('refuses the roles doors, and accepts them once registered', async () => {
    const handle = 'roles-actor'
    const card = {
      name: 'chronicler',
      rung: null,
      duties: 'It writes down what happened, and it changes nothing.',
      powers: ['Reading everything'],
      appointedBy: 'the person',
      appoints: 'nobody',
      mustRead: { chapters: [{ chapter: 10, level: 'full' }], andWhatItsStarterNames: null },
      reportsTo: 'The person.',
      whatEndsIt: 'Only the person retires it.',
    }

    const refusedCard = await ask('POST', '/api/roles/cards', { card }, asAgent(handle))
    expectTheRegistryRefusal(refusedCard, handle)
    const refusedMirror = await ask('POST', '/api/roles/mirror', undefined, asAgent(handle))
    expectTheRegistryRefusal(refusedMirror, handle)
    expect(await writers(), 'a refused roles write left a change row under the made-up name').not.toContain(handle)

    await register(handle)
    // PAST THE REGISTRY TO THE DOOR'S OWN ANSWER. That door was switched off in wave 13r round 5 and
    // refuses every write in its own words, so a registered writer meets that refusal and not the registry's.
    const made = await ask('POST', '/api/roles/cards', { card }, asAgent(handle))
    expect(made.status, made.body).toBe(410)
    expect(made.body).toContain('Role cards are no longer written here.')
    const mirrored = await ask('POST', '/api/roles/mirror', undefined, asAgent(handle))
    expect(mirrored.status, mirrored.body).toBe(200)
  })

  it('refuses the folder-reading draft, stores no draft row, and accepts it once registered', async () => {
    const handle = 'folder-reader'
    const folder = `${THE_TEST_FIXTURE_ROOT}/projects/audit-${Math.random().toString(36).slice(2, 8)}`
    const draft = {
      folder,
      note: 'What the folder said.',
      pieces: [
        { kind: 'note', title: 'What the README said', data: { body: 'The README said this.' }, from: ['README.md'], quote: 'The README said this.' },
      ],
    }

    const refused = await ask('POST', '/api/import/draft', draft, asAgent(handle))
    expectTheRegistryRefusal(refused, handle)
    const stored = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM folder_readings WHERE read_by = ?').get(handle) as { n: number }
    expect(stored.n, 'a refused draft left a row in folder_readings').toBe(0)
    expect(await writers(), 'a refused draft left a change row under the made-up name').not.toContain(handle)

    await register(handle)
    const accepted = await ask('POST', '/api/import/draft', draft, asAgent(handle))
    expect(accepted.status, accepted.body).toBe(201)
    const after = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM folder_readings WHERE read_by = ?').get(handle) as { n: number }
    expect(after.n, 'the accepted draft is not stored under the registered handle').toBe(1)
  })

  it('refuses a link, stores no link row, and accepts it once registered', async () => {
    const handle = 'link-actor'
    const from = await aNote('one end of the link the audit makes')
    const to = await aNote('the other end of the link the audit makes')

    const refused = await ask('POST', '/api/links', { fromId: from, toId: to, type: 'relates_to' }, asAgent(handle))
    expectTheRegistryRefusal(refused, handle)
    const links = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM links WHERE created_by = ?').get(handle) as { n: number }
    expect(links.n, 'a refused link left a row in links').toBe(0)
    expect(await writers(), 'a refused link left a change row under the made-up name').not.toContain(handle)

    await register(handle)
    const accepted = await ask('POST', '/api/links', { fromId: from, toId: to, type: 'relates_to' }, asAgent(handle))
    expect(accepted.status, accepted.body).toBe(201)
  })

  it('keeps every declared office writer and the person writing where they write', async () => {
    const incident = await anIncident()
    const evidence = await aNote('the evidence a declared writer names')

    for (const id of declaredExceptions) {
      const accepted = await ask('POST', `/api/records/${incident}/timeline`, { ...A_MOMENT, evidence }, asAgent(id))
      expect(accepted.status, `${id} was refused: ${accepted.body}`).toBe(201)
    }
    const byHand = await ask('POST', `/api/records/${incident}/timeline`, { ...A_MOMENT, evidence }, AS_THE_PERSON)
    expect(byHand.status, byHand.body).toBe(201)
  })

  it('still lets an in-process caller write under any id, as before', async () => {
    // `app.inject` is on no socket, so `actor.from` is undefined and the rule does not apply. That is
    // the line that keeps criterion M14 whole: a row already written under a name no registry holds
    // is still accepted in process and still named.
    const incident = await anIncident()
    const evidence = await aNote('the evidence an in-process caller names')
    const injected = await app.inject({
      method: 'POST',
      url: `/api/records/${incident}/timeline`,
      headers: asAgent('an-in-process-name-nothing-registers'),
      payload: { ...A_MOMENT, evidence },
    })
    expect(injected.statusCode, injected.body).toBe(201)
  })
})
