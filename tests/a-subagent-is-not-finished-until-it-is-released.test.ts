// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old fixture finished without a submitted checkout. These historical runs are now explicitly inventoried; all identity, check-start and release assertions remain. */
/** Eligibility fixture update: old checked runs omitted their checkout; worker fixtures now record a resolvable workingDirectory and a registered work area. */
/**
 * A SUBAGENT IS NOT FINISHED UNTIL SOMEBODY RELEASES IT.
 *
 * Criteria C17 and C18 of design/rules/ACCEPTANCE.md: a subagent that says it has finished has not
 * really finished, and the agent that started it has to check.
 *
 * C17: *A subagent is not finished until it is released, and the run says who released it.*
 * Measured: a run whose subagent sent "done" and was never released reads as unreleased, not as
 * finished.
 *
 * C18: *An unchecked finish is visible on the run.* Measured: the run says no check happened.
 * **Nothing prevents it** — Mole Office does not own the subagent's process — and the criterion is
 * about the record, not about a wall.
 *
 * WHAT IS NOT PROVED HERE. What an inspector reads and the two messages it writes are C19 to C26,
 * in `tests/an-inspector-releases-or-refuses-in-one-act.test.ts`. This file is about the run's own
 * reading and the starter's list.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AN_UNCHECKED_FINISH, STILL_WORKING } from '../src/shared/releasing.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function fileARun(handle: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd(), ...data } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  return id
}

/** The subagent saying its work is done. Its own word, which is not the end. */
async function sayItIsDone(handle: string, run: string): Promise<void> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: asAgent(handle),
    payload: { dataPatch: { state: 'finished' } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

async function standsOf(run: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { stands: Record<string, unknown> }).stands
}

async function theStartersList(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/checks?startedBy=${handle}`,
    headers: asAgent(handle),
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-a', name: 'Builder A', role: 'worker', workArea: ['src'], chapters: ['5'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-b', name: 'Builder B', role: 'worker', workArea: ['src'], chapters: ['5'] })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('C17 — a run that said it was finished and was never released reads as unreleased', () => {
  it('reads as still working while the run has not said anything', async () => {
    const run = await fileARun('builder-a', 'Builder A, run one')
    const stands = await standsOf(run)
    expect(stands['saidFinished']).toBe(false)
    expect(stands['released']).toBeNull()
    expect(stands['unreleasedFinish']).toBe(false)
    expect(stands['says']).toBe(STILL_WORKING)
  })

  it('reads as an unchecked finish once the subagent says it is done, not as finished', async () => {
    const run = await fileARun('builder-a', 'Builder A, run two')
    await sayItIsDone('builder-a', run)
    const stands = await standsOf(run)
    expect(stands['saidFinished']).toBe(true)
    expect(stands['released']).toBeNull()
    expect(stands['unreleasedFinish']).toBe(true)
    expect(stands['says']).toBe(AN_UNCHECKED_FINISH)
    expect(String(stands['says'])).toContain('does not end it')
  })

  it('says who released it once its starter does, and by which of the two ways', async () => {
    const run = await fileARun('builder-b', 'Builder B, run one')
    await sayItIsDone('builder-b', run)
    const answered = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { verdict: 'released', check: 'Read the diff and the report. Nothing is missing.' },
    })
    expect(answered.statusCode, answered.body).toBe(201)
    const stands = await standsOf(run)
    const release = stands['released'] as Record<string, unknown>
    expect(release['by']).toEqual({ kind: 'agent', id: idOf(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(release['how']).toBe('its starter')
    expect(String(release['at']).length).toBeGreaterThan(0)
    expect(stands['unreleasedFinish']).toBe(false)
    expect(String(stands['says'])).toContain(`Released by agent ${THE_TEST_OFFICES_SECRETARY.handle}`)
    expect(String(stands['says'])).toContain('checked by its starter')
  })

  it('refuses a second release, so there are never two answers to who ended it', async () => {
    const list = await theStartersList(THE_TEST_OFFICES_SECRETARY.handle)
    const released = (list['list'] as Record<string, unknown>[]).find(
      (one) => (one['stands'] as Record<string, unknown>)['released'] !== null,
    )
    const again = await app.inject({
      method: 'POST',
      url: `/api/checks/${String(released!['run'])}`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { verdict: 'released', check: 'Checking it a second time.' },
    })
    expect(again.statusCode).toBe(409)
    expect(String((again.json() as { error: string }).error)).toContain('already released')
  })

  it('refuses a release from somebody who is neither the starter nor an inspector', async () => {
    const run = await fileARun('builder-a', 'Builder A, run three')
    await sayItIsDone('builder-a', run)
    const no = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('builder-b'),
      payload: { verdict: 'released', check: 'I say it is fine.' },
    })
    expect(no.statusCode).toBe(403)
    const said = String((no.json() as { error: string }).error)
    expect(said).toContain('inspector')
    expect(said).toContain('Nothing was written.')
    expect((await standsOf(run))['released']).toBeNull()
  })

  it('refuses a subagent releasing itself, which is the whole point of the rule', async () => {
    const run = await fileARun('builder-a', 'Builder A, run four')
    await sayItIsDone('builder-a', run)
    const no = await app.inject({
      method: 'POST',
      url: `/api/checks/${run}`,
      headers: asAgent('builder-a'),
      payload: { verdict: 'released', check: 'I am done.' },
    })
    expect(no.statusCode).toBe(403)
    expect((await standsOf(run))['released']).toBeNull()
  })
})

describe('C18 — an unchecked finish is visible on the run and on the starter list', () => {
  it('counts the unreleased finishes in this project and says what the number means', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/checks', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(reply.statusCode, reply.body).toBe(200)
    const said = reply.json() as { list: Record<string, unknown>[]; says: string }
    const unreleased = said.list.filter((one) => (one['stands'] as Record<string, unknown>)['unreleasedFinish'])
    expect(unreleased.length).toBeGreaterThan(0)
    expect(said.says).toContain('have not been released')
    expect(said.says).toContain('does not end it')
  })

  it('puts the unreleased finishes first on the starter list', async () => {
    const list = await theStartersList(THE_TEST_OFFICES_SECRETARY.handle)
    const rows = list['list'] as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(1)
    const flags = rows.map((one) => Boolean((one['stands'] as Record<string, unknown>)['unreleasedFinish']))
    expect(flags.indexOf(false)).toBeGreaterThan(flags.lastIndexOf(true) - 1)
    expect(String(list['says'])).toContain('nobody released')
  })

  it('says an empty list is empty because nobody was started, not because everything was checked', async () => {
    const list = await theStartersList('builder-a')
    expect(list['list']).toEqual([])
    expect(String(list['says'])).toContain('not because everything was checked')
  })

  it('leaves the run alone: nothing here stops a subagent process ending', async () => {
    // The run that said it was finished and was refused a self-release is still `finished` and
    // still unreleased. Mole Office made it visible; it did not prevent it, and it cannot.
    const list = await theStartersList(THE_TEST_OFFICES_SECRETARY.handle)
    const rows = list['list'] as Record<string, unknown>[]
    const four = rows.find((one) => one['title'] === 'Builder A, run four')
    const stands = four!['stands'] as Record<string, unknown>
    expect(stands['saidFinished']).toBe(true)
    expect(stands['unreleasedFinish']).toBe(true)
  })
})
