// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY THE OWNER HAS RAISED SAYS HOW AN AGENT READS RELEASES, AS THE OWNER DOES.
 *
 * Wave 13y round 10, on the secretary's message j4AkiMmK8xMc. A decision gives a raised secretary
 * the owner's acts except three it names, and saying whether an agent reads a release from the check is not one of
 * them. So the
 * door `POST /api/participants/agent/<id>/reads-releases-from-the-check` takes it from a raised secretary, and writes
 * it down as done under the raise. A secretary that is not raised is refused as before, and nothing is written.
 *
 * Every agent here is made up for the test, in a fresh test database.
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - `if (aRaiseCarriesIt(actor)) return null` taken out of `whyThisReleaseReadingWriteIsRefused`: case 2 goes red.
 *   - `writeDownAnActUnderTheRaise` taken out of the door: case 2 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function say(by: string, about: string): Promise<{ status: number; body: string }> {
  const reply = await app.app.inject({
    method: 'POST',
    url: `/api/participants/agent/${about}/reads-releases-from-the-check`,
    headers: asAgent(by),
    payload: { on: true, because: 'Test: it queues from the check itself.', ...FOR_THE_PERSON },
  })
  return { status: reply.statusCode, body: reply.body }
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

function stored(handle: string): string | null {
  return (t.client.sqlite.prepare('SELECT reads_releases_from_the_check AS said FROM agents WHERE handle = ?').get(handle) as { said: string | null }).said
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  for (const [handle, role] of [[THE_TEST_OFFICES_SECRETARY.handle, 'secretary'], ['unraised-u', 'secretary'], ['queues-q', 'worker']] as const) {
    const made = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: `Synthetic ${handle}`, role } })
    expect(made.statusCode, made.body).toBe(201)
  }
  const pressed = await app.app.inject({
    method: 'POST',
    url: `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`,
    headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
    payload: { reason: 'a test raises it', endsWhen: 'when you say' },
  })
  expect(pressed.statusCode, pressed.body).toBe(201)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('who may say how another agent reads releases', () => {
  it('1: refuses a secretary the owner has not raised, and writes nothing', async () => {
    const no = await say('unraised-u', 'queues-q')
    expect(no.status, no.body).toBe(403)
    expect(no.body).toContain('nor from a secretary the owner has raised')
    expect(stored('queues-q')).toBeNull()
  })

  it('2: takes it from a raised secretary, and writes it down as done under the raise', async () => {
    const yes = await say(THE_TEST_OFFICES_SECRETARY.handle, 'queues-q')
    expect(yes.status, yes.body).toBe(200)
    const value = JSON.parse(String(stored('queues-q'))) as { on: boolean; by: { kind: string; id: string } }
    expect(value.on).toBe(true)
    // WHO SAID IT is the secretary: by its registry id when its key proves it, and by the handle it sent when no key does.
    expect(value.by.kind).toBe('agent')
    expect([THE_TEST_OFFICES_SECRETARY.handle, idOf(THE_TEST_OFFICES_SECRETARY.handle)]).toContain(value.by.id)
    const rows = t.client.sqlite
      .prepare("SELECT actor_id AS id, field, elevation FROM changes WHERE record_id = 'setting:reads-releases-from-the-check'")
      .all() as { id: string; field: string; elevation: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.field).toBe(`agent ${idOf('queues-q')}`)
    expect(rows[0]!.elevation, 'the act is not written down as done under the raise').not.toBeNull()
  })
})
