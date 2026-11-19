// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOLE OFFICE'S OWN ROW IS THE OFFICE, AT THE AREA DOORS AND ON ITS PROFILE. Wave 13s round 217.
 *
 * The row sits in the agent registry and holds no card. Round 210 gave the refusals words of their own for it. Two places
 * still spoke of it as an agent that could be the owner, the starter or a secretary, or as a row nobody gave a card:
 *
 *   - The four doors that change an agent's areas (work area, files area, broadcast times, start folder) answered the
 *     office's own key with the sentence for any agent: only the owner, the starter or a secretary may. All four read
 *     one rule (`whoMayChangeItsAreas` in src/server/lib/participants.ts).
 *   - GET /api/participants/agent/mole-office answered `roleSays` "no role set", as for a row nobody has given a card yet.
 *     The roster and the restore read (GET /api/restore/mole-office) said the same.
 *
 * Each now says what is true of the row: it is Mole Office's own row and it holds no card. Every permission outcome stays
 * as it was: the office's key is refused at the four doors with the same 403, and nothing is written. `roleReadAs` stays
 * the worker card, because the rules still read the row at that card's rung and that field is the word the refusals use.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agents are made-up
 * agents with made-up handles, registered by the test's person. The office's key is the test office's own. The register
 * door writes the worker card on a row when no card is named, so the card is taken off plain-one's row in the scratch
 * database: the office's row is not the only row with no card, and a check that asks only whether a row has no card
 * cannot pass for the check that asks whether it is the office's.
 *
 *   1. The office's key at the four doors: each refuses with 403, in words that say the row is the office's and holds no
 *      card, ending with the sentence any other caller meets, and nothing is written.
 *   2. An agent holding the worker card and plain-one, a row with no card, at the same four doors: each is refused in the
 *      same words as the other, with nothing of the office's words. The person still changes the work area.
 *   3. The office's profile, read with the office's key: no card chosen, read as the worker card, and `roleSays` in the
 *      office's words; the roster and the restore read say the same of the row.
 *   4. plain-one's profile still says "no role set", and the worker's says nothing, on the profile and on the roster.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - lib/participants.ts the area rule never asks whether the caller is the office's row: case 1 red.
 *   - lib/participants.ts the office's words for every caller that is not the person: cases 1 and 2 red. Case 1 is red
 *     because the worker's refusal the office's must end with then carries the office's words too.
 *   - lib/participants.ts the area rule asks whether the caller's row has no card, not whether it is the office's: case 2
 *     red, at plain-one.
 *   - lib/participants.ts the office's key is let through as though it started the agent: case 1 red, at a 200 and a
 *     write.
 *   - lib/participants.ts the office's refusal answers 409 instead of 403: case 1 red, at the status.
 *   - api/participants.ts the profile never asks whether the row is the office's: case 3 red.
 *   - api/participants.ts the office's row read as no card (`roleReadAs` null): case 3 red.
 *   - api/participants.ts the office's words for every row with no card: case 4 red, at plain-one.
 *   - api/participants.ts the roster's rows never asked whether they are the office's: case 3 red, at the roster.
 *   - api/participants.ts the restore read says "no role set" for the office's row, as before: case 3 red, at the
 *     restore read.
 *   - the card is left on plain-one's row: case 2 and case 4 red, at the row's role.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_OFFICE = () => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...theOfficesKeyHeader() })
const AN_AGENT = (handle: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

/** The four doors one rule decides, each with a made-up body it would take from the person. */
const THE_FOUR_DOORS = {
  workArea: { door: 'work-area', body: { workArea: ['src/a-made-up-folder'], because: 'A made-up change.' } },
  filesArea: { door: 'files-area', body: { filesArea: ['/a-made-up-folder'], because: 'A made-up change.' } },
  broadcastTimes: { door: 'broadcast-times', body: { times: ['12:00'], because: 'A made-up change.' } },
  startFolder: { door: 'start-folder', body: { startFolder: '/a-made-up-folder', because: 'A made-up change.' } },
} as const

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  const said = reply.json() as Record<string, unknown>
  return { status: reply.statusCode, error: typeof said['error'] === 'string' ? said['error'] : '', said, raw: reply.body }
}

async function register(handle: string, role?: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, ...(role === undefined ? {} : { role }) })
  expect(made.status, made.raw).toBe(201)
  const said = made.said as { agent?: { id?: unknown }; whatToGiveIt?: { key?: unknown } }
  keys.set(handle, String(said.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(said.agent?.id ?? ''))
}

/** The office's row, its handle and the words for it, read from the code after the office is made. */
async function theOffice(): Promise<{ id: string; handle: string; holdsNoCard: string; saysOfItsCard: unknown }> {
  const participants = await import('../src/shared/participants.ts')
  const words = participants as unknown as Record<string, unknown>
  return {
    id: participants.moleOfficeId(),
    handle: participants.MOLE_OFFICE_HANDLE,
    holdsNoCard: String(words['MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD']),
    saysOfItsCard: words['MOLE_OFFICES_OWN_ROW_SAYS_OF_ITS_CARD'],
  }
}

/** Everything the four doors could write: the agent's row and every revision in the office. */
function whatIsWritten(handle: string): unknown {
  return {
    row: t.client.sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(ids.get(handle)),
    revisions: t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions').get(),
  }
}

/** Each of the four doors asked about `about` by these headers. */
async function atTheFourDoors(about: string, headers: Record<string, string>) {
  const said: Record<string, { status: number; error: string; raw: string }> = {}
  for (const [name, one] of Object.entries(THE_FOUR_DOORS)) {
    said[name] = await call('POST', `/api/participants/agent/${about}/${one.door}`, headers, one.body)
  }
  return said
}

/** The part of a participant's answer that says which card it holds. */
function itsCard(participant: unknown): unknown {
  const one = participant as Record<string, unknown>
  return { role: one['role'], roleReadAs: one['roleReadAs'], roleSays: one['roleSays'] }
}

async function onTheRoster(id: string): Promise<unknown> {
  const listed = await call('GET', '/api/participants', PERSON)
  expect(listed.status, listed.raw).toBe(200)
  const agents = (listed.said['agents'] as Record<string, unknown>[] | undefined) ?? []
  const row = agents.find((one) => one['id'] === id)
  expect(row, `the roster lists ${id}`).toBeDefined()
  return itsCard(row)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await register('w-one', THE_WORKER)
  await register('w-two', THE_WORKER)
  await register('plain-one')
  // AN ORDINARY ROW WITH NO CARD. The register door gave plain-one the worker card, so it is taken off here.
  t.client.sqlite.prepare('UPDATE agents SET role = NULL WHERE id = ?').run(ids.get('plain-one'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("Mole Office's own row is the office at the doors that change an agent's areas", () => {
  it("1. the office's key is refused at the four doors in words that say its row holds no card, and nothing is written", async () => {
    const office = await theOffice()
    const before = whatIsWritten('w-one')
    const byTheOffice = await atTheFourDoors('w-one', THE_OFFICE())
    const byAWorker = await atTheFourDoors('w-one', AN_AGENT('w-two'))
    const read = Object.fromEntries(
      Object.entries(byTheOffice).map(([name, one]) => [name, {
        status: one.status,
        saysNoCard: one.error.includes(`"${office.handle}" ${office.holdsNoCard}`),
        endsAsAnyCallersDoes: byAWorker[name]!.error !== '' && one.error !== byAWorker[name]!.error && one.error.endsWith(byAWorker[name]!.error),
      }]),
    )
    const refused = { status: 403, saysNoCard: true, endsAsAnyCallersDoes: true }
    expect({ read, written: whatIsWritten('w-one') }, JSON.stringify(byTheOffice))
      .toEqual({ read: { workArea: refused, filesArea: refused, broadcastTimes: refused, startFolder: refused }, written: before })
  })

  it('2. an agent with a card and a row with no card are refused in the same words, none of them the office\'s; the person still may', async () => {
    const office = await theOffice()
    const byAWorker = await atTheFourDoors('w-one', AN_AGENT('w-two'))
    const byNoCard = await atTheFourDoors('w-one', AN_AGENT('plain-one'))
    const read = Object.fromEntries(
      Object.entries(byAWorker).map(([name, one]) => [name, {
        worker: one.status,
        noCard: byNoCard[name]!.status,
        sameWords: one.error !== '' && one.error === byNoCard[name]!.error,
        officesWords: one.error.includes(office.holdsNoCard) || byNoCard[name]!.error.includes(office.holdsNoCard),
      }]),
    )
    const byThePerson = await call('POST', '/api/participants/agent/w-one/work-area', { ...PERSON, ...thePersonsKeyHeader() }, THE_FOUR_DOORS.workArea.body)
    const refused = { worker: 403, noCard: 403, sameWords: true, officesWords: false }
    expect({
      role: t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(ids.get('plain-one')),
      read,
      person: byThePerson.status,
    }, JSON.stringify({ byAWorker, byNoCard, byThePerson: byThePerson.raw }))
      .toEqual({ role: { role: null }, read: { workArea: refused, filesArea: refused, broadcastTimes: refused, startFolder: refused }, person: 200 })
  })
})

describe("Mole Office's own profile says its row is the office's and holds no card", () => {
  it("3. the office's profile, read with its own key, its row on the roster and its restore read", async () => {
    const office = await theOffice()
    const { A_ROW_WITH_NO_ROLE_READS_AS, NO_ROLE_SET } = await import('../src/shared/roles.ts')
    const read = await call('GET', `/api/participants/agent/${office.handle}`, THE_OFFICE())
    expect(read.status, read.raw).toBe(200)
    const restored = await call('GET', `/api/restore/${office.handle}`, PERSON)
    expect(restored.status, restored.raw).toBe(200)
    const expected = { role: null, roleReadAs: A_ROW_WITH_NO_ROLE_READS_AS, roleSays: office.saysOfItsCard }
    expect({
      wordsAreThere: typeof office.saysOfItsCard === 'string' && office.saysOfItsCard !== '' && office.saysOfItsCard !== NO_ROLE_SET,
      profile: itsCard(read.said['participant']),
      roster: await onTheRoster(office.id),
      restore: itsCard(restored.said['agent']),
    }, JSON.stringify({ read: read.raw, restored: restored.raw.slice(0, 2000) })).toEqual({ wordsAreThere: true, profile: expected, roster: expected, restore: expected })
  })

  it('4. a row with no card still says "no role set", and a row with a card says nothing, on the profile and the roster', async () => {
    const { A_ROW_WITH_NO_ROLE_READS_AS, NO_ROLE_SET } = await import('../src/shared/roles.ts')
    const plain = await call('GET', '/api/participants/agent/plain-one', PERSON)
    const worker = await call('GET', '/api/participants/agent/w-two', PERSON)
    const noCard = { role: null, roleReadAs: A_ROW_WITH_NO_ROLE_READS_AS, roleSays: NO_ROLE_SET }
    const aCard = { role: THE_WORKER, roleReadAs: THE_WORKER, roleSays: null }
    expect({
      role: t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(ids.get('plain-one')),
      plain: itsCard(plain.said['participant']),
      plainListed: await onTheRoster(String(ids.get('plain-one'))),
      worker: itsCard(worker.said['participant']),
      workerListed: await onTheRoster(String(ids.get('w-two'))),
    }, JSON.stringify({ plain: plain.raw, worker: worker.raw }))
      .toEqual({ role: { role: null }, plain: noCard, plainListed: noCard, worker: aCard, workerListed: aCard })
  })
})
