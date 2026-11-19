// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS A SECRETARY MAKES FOR THE PERSON, UNDER THEIR GRANT, IS ONE ROW, and every change row it wrote names it.
 * Wave 13s round 1, migration 0280. The flow design (section 7) says every press under the grant gives its reason
 * and names the grant, and the person sees every press.
 *
 * `logChange` writes the press row beside the first change row a press writes, in the same transaction, and puts its id
 * in `changes.press_id` on that row and on every later row of the same request (`thePressRowOf` in
 * src/server/lib/records.ts). So:
 *   - a press that wrote two change rows is one press row, named by both;
 *   - a press that was refused wrote nothing, so there is no row;
 *   - a write the grant did not allow names no press, even when the secretary sent a reason;
 *   - the person's own press is not a press for the person, and writes no row.
 *
 * MUTATION, after a control run (the report of the run that added this file):
 *   · `changes.press_id` left unset in `logChange` → "writes one row for one press" and "a row of its own for a
 *     second press" are red;
 *   · the press row's insert made a plain insert, so the second change row of the press inserts it again → the same
 *     two cases are red, because the promote answers 500.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let grant: string

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_SECRETARY = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY }

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

interface PressRow {
  id: string
  workspace_id: string | null
  agent_id: string
  session_id: string | null
  grant_id: string
  operation: string
  reason: string | null
  at: string
}

function thePresses(): PressRow[] {
  return t.client.sqlite.prepare('SELECT * FROM presses_for_the_person ORDER BY rowid').all() as PressRow[]
}

/** The change rows written after the row this names, oldest first. */
function theChangeRowsAfter(rowid: number): { workspace_id: string | null; press_id: string | null; elevation: string | null }[] {
  return t.client.sqlite.prepare('SELECT workspace_id, press_id, elevation FROM changes WHERE rowid > ? ORDER BY rowid').all(rowid) as {
    workspace_id: string | null
    press_id: string | null
    elevation: string | null
  }[]
}

function theLastChangeRow(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

/** A fork only the owner settles, filed by the secretary. Promoting it is an act only the grant opens to it. */
async function aForkTheOwnerReserved(title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', AS_THE_SECRETARY, {
    kind: 'proposal',
    title,
    data: { question: 'Which of the two?', options: ['One', 'The other'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
  })
  expect(filed.status, filed.said).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

/** Settle the fork and write its decision, in one act. */
function promote(fork: string, headers: Record<string, string>, extra: Record<string, unknown> = {}) {
  return ask('POST', `/api/records/${fork}/promote`, headers, {
    ...extra,
    title: 'What was chosen',
    data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One of them, and this is the reasoning.' },
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).status).toBe(201)
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
  grant = String((pressed.body['elevation'] as { id: string }).id)
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a press for the person is one row', () => {
  it('writes one row for one press, and every change row the press wrote names it', async () => {
    const fork = await aForkTheOwnerReserved('A fork settled under the grant')
    const before = thePresses().length
    const from = theLastChangeRow()

    const done = await promote(fork, AS_THE_SECRETARY, FOR_THE_PERSON)
    expect(done.status, done.said).toBe(201)

    const presses = thePresses().slice(before)
    expect(presses).toHaveLength(1)
    const press = presses[0]!
    expect(press).toMatchObject({ agent_id: SECRETARY, session_id: null, grant_id: grant, operation: 'record.promote', reason: A_TESTS_REASON_FOR_THE_PERSON })
    expect(press.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)

    // THE PROMOTE WRITES MORE THAN ONE CHANGE ROW, the decision and the fork it settled, so one press names several.
    const rows = theChangeRowsAfter(from)
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) {
      expect(row.press_id).toBe(press.id)
      expect(row.elevation).not.toBeNull()
    }
    expect(press.workspace_id).toBe(rows[0]!.workspace_id)
  })

  it('writes a row of its own for a second press', async () => {
    const fork = await aForkTheOwnerReserved('A second fork settled under the grant')
    const before = thePresses()
    const from = theLastChangeRow()
    expect((await promote(fork, AS_THE_SECRETARY, { forThePerson: { reason: 'The second press.' } })).status).toBe(201)

    const added = thePresses().slice(before.length)
    expect(added).toHaveLength(1)
    expect(before.map((one) => one.id)).not.toContain(added[0]!.id)
    expect(added[0]!.reason).toBe('The second press.')
    expect(new Set(theChangeRowsAfter(from).map((row) => row.press_id))).toEqual(new Set([added[0]!.id]))
  })

  it('writes no row for a press that was refused, and writes nothing else either', async () => {
    const fork = await aForkTheOwnerReserved('A fork pressed with no reason')
    const before = thePresses().length
    const from = theLastChangeRow()

    const no = await promote(fork, AS_THE_SECRETARY)
    expect(no.status, no.said).toBe(400)

    expect(thePresses()).toHaveLength(before)
    expect(theChangeRowsAfter(from)).toEqual([])
  })

  it('names no press on a write the grant did not allow, even with a reason sent', async () => {
    const before = thePresses().length
    const from = theLastChangeRow()

    const note = await ask('POST', '/api/records', AS_THE_SECRETARY, { ...FOR_THE_PERSON, kind: 'note', title: 'An ordinary note', data: { body: 'Any agent may write this.' } })
    expect(note.status, note.said).toBe(201)

    expect(thePresses()).toHaveLength(before)
    const rows = theChangeRowsAfter(from)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row).toMatchObject({ press_id: null, elevation: null })
  })

  it("writes no row for the person's own press", async () => {
    const fork = await aForkTheOwnerReserved('A fork the person settles')
    const before = thePresses().length
    const from = theLastChangeRow()

    expect((await promote(fork, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })).status).toBe(201)

    expect(thePresses()).toHaveLength(before)
    for (const row of theChangeRowsAfter(from)) expect(row.press_id).toBeNull()
  })
})
