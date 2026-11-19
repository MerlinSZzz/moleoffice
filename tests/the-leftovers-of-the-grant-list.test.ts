// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LEFTOVERS OF THE GRANT LIST. Wave 13s round 2b.
 *
 * WHAT IS UNDER TEST, EACH THROUGH ITS ROUTE:
 *   1. a read asks the check and writes no press row, while a write under the grant still writes one;
 *   2. a press row filed in no project is listed on each project's page, where the person reads the grant, and once
 *      on the card read with no project;
 *   3. `record:decision` is the part beside the record door: an office that keeps it refuses a
 *      decision written through the create door and through the promote door, naming the part; an
 *      office that presses it lets the write through and names the secretary and the grant; and an
 *      office with no row answers as the record door does;
 *   4. five small faults:
 *      a. the answer door names the person rather than calling them the agent that started;
 *      b. a second revoke of the same key is not found, whoever asks;
 *      c. undoing a revocation is refused in its own door's words;
 *      d. `setThisOfficesAnswer` refuses an answer that is not one of the three, whoever calls it;
 *      e. the merge move asks the check once.
 *
 * Every agent, record and key here is made up for the test, in a fresh test database. Nothing is
 * listened on and nothing reaches the live office.
 *
 * MUTATIONS, EACH ALONE AFTER A GREEN CONTROL (the report of the run that added this file):
 *   · the read skip taken out of `writeDownEveryPressUnderTheGrant` → case 1's read writes a row;
 *   · `record:decision` taken out of `touches` in `assertMayWrite` → case 3's kept create and kept
 *     promote go through;
 *   · the answer check taken out of `setThisOfficesAnswer` → fault d's case writes a row.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const WORKER = 'leftovers-worker'
const ASKER = 'leftovers-asker'
const THE_OFFICE = { type: 'agent', id: THE_MESSAGE_WORKER_ID }

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let list: typeof import('../src/server/lib/what-the-grant-carries.ts')
let entryDoor: typeof import('../src/server/lib/merge-entry-door.ts')
let grant = ''

const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()

let asPerson: Record<string, string> = {}
let asSecretary: Record<string, string> = {}

const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({
    method,
    url,
    headers: payload === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { payload }),
  })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** Start an agent as the person, and keep its key and its registry id. */
async function start(handle: string, role: string): Promise<void> {
  const made = await ask('POST', '/api/agents/started', asPerson, { handle, name: handle, role })
  expect(made.status, made.said).toBe(201)
  keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
  ids.set(handle, String(made.body['agent']?.id ?? ''))
}

interface APressRow {
  id: string
  workspace_id: string | null
  agent_id: string
  grant_id: string
  operation: string
  reason: string | null
}

function thePresses(): APressRow[] {
  return t.client.sqlite.prepare('SELECT * FROM presses_for_the_person ORDER BY rowid').all() as APressRow[]
}

function countChanges(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor | 'default'): void {
  list.setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

interface AnAct {
  recordId: string | null
  op: string
  door: { operation: string } | null
}

function thePeriodActsIn(said: Record<string, any>): AnAct[] {
  const held = said['theCardTheyHold'] ?? said['card']
  const period = held?.elevation?.period
  expect(period, 'the reply carries no period').toBeTruthy()
  return period.acts as AnAct[]
}

/** The scene is the door that writes outside the change log, so a press there is one press row and no change row. */
function changeTheScene(extra: Record<string, unknown> = {}) {
  return ask('PATCH', '/api/office/scene-settings', asSecretary, { motion: true, ...extra })
}

/** A merge entry in the shape the queue writes, written as the queue writes it. Synthetic. */
function anEntry(name: string): string {
  return entryDoor.asTheMergeQueue(() =>
    t.api.createRecord({
      kind: 'merge_entry',
      title: `Synthetic merge entry ${name}`,
      workspaceId: WORKSPACE,
      actor: THE_OFFICE as never,
      origin: 'fixture',
      data: {
        run: `synthetic-run-${name}`,
        seal: { id: `synthetic-seal-${name}`, hash: `synthetic-hash-${name}` },
        changeset: { adapter: 'files', root: `/synthetic/lane-${name}`, operations: [] },
        state: 'judged',
        submittedBy: { kind: 'agent', id: `synthetic-submitter-${name}` },
      },
    }),
  ).id
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  list = await import('../src/server/lib/what-the-grant-carries.ts')
  entryDoor = await import('../src/server/lib/merge-entry-door.ts')
  asPerson = {
    'content-type': 'application/json',
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(),
  }
  await start(SECRETARY, 'secretary')
  await start(WORKER, 'worker')
  await start(ASKER, 'worker')
  asSecretary = asAgent(SECRETARY)
  const raised = await ask('POST', `/api/roles/elevation/${SECRETARY}`, asPerson, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.said).toBe(201)
  grant = String(raised.body['elevation']?.id ?? '')
  expect(grant).not.toBe('')
}, 60_000)

afterEach(() => {
  for (const door of answered) list.setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a read asks the check and writes no press row', () => {
  it('lets the granted secretary read the scene, and writes no press row', async () => {
    const before = thePresses().length
    const read = await ask('GET', '/api/office/scene-settings', asSecretary)
    expect(read.status, read.said).toBe(200)
    expect(read.body['mayChange'], 'the read did not ask the check, or the check said no').toBe(true)
    expect(thePresses(), 'a read wrote a press row').toHaveLength(before)
  })

  it('still writes one press row for a write under the grant', async () => {
    const before = thePresses().length
    const done = await changeTheScene({ ...FOR_THE_PERSON })
    expect(done.status, done.said).toBe(200)
    const written = thePresses().slice(before)
    expect(written, 'the write left no press row').toHaveLength(1)
    expect(written[0]).toMatchObject({ grant_id: grant, operation: 'office.scene-settings.change', reason: A_TESTS_REASON_FOR_THE_PERSON })
  })
})

describe('a press row filed in no project', () => {
  it('is listed on a project page, and once on the card read with no project', async () => {
    // BY HAND: earlier cases' press rows are taken away, so the only press this case reads is its own.
    t.client.sqlite.prepare('DELETE FROM presses_for_the_person').run()
    const done = await changeTheScene({ ...FOR_THE_PERSON })
    expect(done.status, done.said).toBe(200)
    const press = thePresses().at(-1)!
    // BY HAND: the press is filed in no project, as a press from a door that resolves none.
    t.client.sqlite.prepare('UPDATE presses_for_the_person SET workspace_id = NULL WHERE id = ?').run(press.id)

    const projectPage = await ask('GET', `/api/participants/agent/${SECRETARY}/profile`, asPerson)
    expect(projectPage.status, projectPage.said).toBe(200)
    expect(
      thePeriodActsIn(projectPage.body).filter((one) => one.door?.operation === 'office.scene-settings.change'),
      'a press in no project is not listed on the project page the person reads',
    ).toHaveLength(1)

    const officeWide = await ask('GET', '/api/restore', {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': SECRETARY,
      'x-mole-office-key': keys.get(SECRETARY) ?? '',
    })
    expect(officeWide.status, officeWide.said).toBe(200)
    const listed = thePeriodActsIn(officeWide.body).filter((one) => one.door?.operation === 'office.scene-settings.change')
    expect(listed, 'the office-wide list does not show the press in no project once').toHaveLength(1)
  })
})

describe('the part beside the record door: record:decision', () => {
  const aDecision = (title: string): Record<string, unknown> => ({
    ...FOR_THE_PERSON,
    kind: 'decision',
    title,
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'Because they said so.' },
  })

  it('keeps the create door when this office keeps writing a decision, and writes nothing', async () => {
    answer('record:decision', 'kept')
    const before = countChanges()
    const refused = await ask('POST', '/api/records', asSecretary, aDecision('A decision this office keeps'))
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('writing a decision')
    expect(countChanges(), 'a refused decision wrote a change row').toBe(before)
  })

  it('keeps the promote door too, so the part is named however a decision is written', async () => {
    answer('record:decision', 'kept')
    const filed = await ask('POST', '/api/records', asPerson, {
      kind: 'proposal',
      title: 'A fork the person reserved',
      data: { question: 'Which?', options: ['One', 'Two'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
    })
    expect(filed.status, filed.said).toBe(201)
    const before = countChanges()
    const refused = await ask('POST', `/api/records/${String(filed.body['record'].id)}/promote`, asSecretary, {
      ...FOR_THE_PERSON,
      title: 'The decision the promote door would file',
      data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One of them.' },
    })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('writing a decision')
    expect(countChanges(), 'a refused promotion wrote a change row').toBe(before)
  })

  it('lets it through where this office presses it, and what it wrote names the secretary and the grant', async () => {
    answer('record:decision', 'may-press')
    const before = countChanges()
    const pressesBefore = thePresses().length
    const done = await ask('POST', '/api/records', asSecretary, aDecision('A decision this office presses'))
    expect(done.status, done.said).toBe(201)
    const written = t.client.sqlite
      .prepare('SELECT actor_type, actor_id, elevation FROM changes WHERE rowid > ? ORDER BY rowid')
      .all(before) as { actor_type: string; actor_id: string; elevation: string | null }[]
    expect(written.length).toBeGreaterThan(0)
    for (const row of written) {
      expect(row.actor_type, 'a change row names the person as the one who did it').toBe('agent')
      expect(row.actor_id).toBe(SECRETARY)
      expect(String(row.elevation), 'a change row names no grant').toContain(grant)
    }
    const pressed = thePresses().slice(pressesBefore)
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toMatchObject({ grant_id: grant, operation: 'record.write', agent_id: SECRETARY, reason: A_TESTS_REASON_FOR_THE_PERSON })
  })

  it("answers as the record door does when this office has no row: the grant writes a decision", async () => {
    const done = await ask('POST', '/api/records', asSecretary, aDecision('A decision under the card default'))
    expect(done.status, done.said).toBe(201)
  })
})

describe('the five small faults', () => {
  it('names the person in the answer door, not the agent that started', async () => {
    const asked = await ask('POST', '/api/roles/requests', asAgent(ASKER), { asking: 'supervisor', because: 'A made-up reason.' })
    expect(asked.status, asked.said).toBe(201)
    const refused = await ask('POST', `/api/roles/requests/${String(asked.body['request'])}/grant`, asAgent(WORKER), {})
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('is answered by the person')
    expect(refused.said, 'the person is still called the agent that started').not.toContain('the agent that started')
  })

  it('answers a second revoke of the same key as not found, whoever asks', async () => {
    await start('revoked-key-holder', 'worker')
    const key = (t.client.sqlite.prepare('SELECT id FROM held_keys WHERE whose_id = ? AND revoked_at IS NULL').get(ids.get('revoked-key-holder')) as { id: string }).id
    const revoked = await ask('POST', `/api/office/held-keys/${key}/revoke`, asPerson, {})
    expect(revoked.status, revoked.said).toBe(200)

    const byAnAgent = await ask('POST', `/api/office/held-keys/${key}/revoke`, asAgent(WORKER), {})
    expect(byAnAgent.status, byAnAgent.said).toBe(404)
    expect(byAnAgent.said).toContain('No live key here has the id')
    expect(byAnAgent.said).toContain('revoked already')

    const byThePerson = await ask('POST', `/api/office/held-keys/${key}/revoke`, asPerson, {})
    expect(byThePerson.status, byThePerson.said).toBe(404)
  })

  it("asks about undoing a revocation in its own door's words", async () => {
    await start('undo-holder', 'worker')
    const key = (t.client.sqlite.prepare('SELECT id FROM held_keys WHERE whose_id = ? AND revoked_at IS NULL').get(ids.get('undo-holder')) as { id: string }).id
    const revoked = await ask('POST', `/api/office/held-keys/${key}/revoke`, asPerson, {})
    expect(revoked.status, revoked.said).toBe(200)
    const refused = await ask('POST', `/api/office/held-keys/${key}/revoke/undo`, asAgent(WORKER), { revokedAt: revoked.body['revokedAt'] })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain("Undoing a key's revocation is the owner's own act")
  })

  it('refuses an answer that is not one of the three, whoever calls it', () => {
    const before = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM what_the_grant_carries').get() as { n: number }).n
    expect(() => list.setThisOfficesAnswer('record.write', 'maybe' as never, { type: 'human', id: THE_PERSON } as never)).toThrow(
      /kept, ask-first, may-press/,
    )
    expect((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM what_the_grant_carries').get() as { n: number }).n).toBe(before)
  })

  it('asks the check once when the merge move is made through its route', async () => {
    answer('merge.first', 'may-press')
    const spy = vi.spyOn(list, 'theAnswerAboutAPress')
    const entry = anEntry('asks-once')
    const before = spy.mock.calls.length
    const moved = await ask('POST', `/api/merge-queue/${entry}/first`, asSecretary, { ...FOR_THE_PERSON, because: 'A test moves it first.' })
    expect(moved.status, moved.said).toBe(200)
    // One: the move asks once. Before this change the route asked, and moveToTheFront asked again.
    expect(spy.mock.calls.length - before, 'the merge move asks the check more than once').toBe(1)
    spy.mockRestore()
  })
})
