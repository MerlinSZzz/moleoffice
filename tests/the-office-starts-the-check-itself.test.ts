// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/** The old fixture finished without a submitted checkout. These historical runs are now explicitly inventoried; all identity, check-start and release assertions remain. */
/** Eligibility fixture update: the old run fixtures named no submitted tip. Runs meant to be checked now record cutFrom and the actual checkout HEAD. */
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync as readFixtureGit } from 'node:child_process'
const fixtureTip = readFixtureGit('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
/**
 * THE OFFICE STARTS THE CHECK ITSELF, AND NOBODY HOLDS A TERMINAL FOR IT.
 *
 * Criterion C28 of design/rules/ACCEPTANCE.md, on a question: must a tmux session be kept open for
 * the checker, or does Mole Office start an agent itself when there is none? The answer is the second,
 * and the rule of the same message stands over all of it: nobody may be asked to run a command in
 * a terminal, and everything must be possible from inside Mole Office.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED FIRST, BECAUSE THE BUILD REUSES IT
 * ---------------------------------------------------------------------------------------
 *
 * HOW A FINISH IS DECLARED TODAY. `sayHowItEnded` in src/worker/index.ts patches the run's own
 * record — `PATCH /api/records/<run>` with `dataPatch: {state: 'finished'}` — and an agent writing
 * its own session record does the same thing. `aRunSaysItIsFinished` in src/server/lib/inspection.ts
 * reads that, and a close the run wrote itself, as the two ways a run says it is done.
 *
 * HOW THE MESSAGE WORKER STARTS A RUN. A message addressed to an agent leaves a delivery row marked
 * `queued`; `theQueue` in src/server/lib/worker.ts hands every such row to the worker through
 * `GET /api/worker/queue`; the worker starts one run per entry.
 *
 * So the office starts no process of its own. It writes the inspector a message, and the path that
 * already starts every run starts this one. This file proves that by reading the worker's own door.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Take the `theOfficeStartsTheCheck` call out of the PATCH route in src/server/api/records.ts,
 *     and every case here goes red.
 *   - Ask on the state rather than on the transition, and the "not twice" case goes red.
 *   - Have `theOfficeStartsTheCheck` return early where nobody holds the card without telling the
 *     starter, and the "nobody is appointed" case goes red.
 *   - Drop the `unreleasedFinish` guard inside `theOfficeStartsTheCheck`, and the two cases that
 *     call it straight out go red. Removing the route's call does NOT prove that guard — measured:
 *     with the call removed those two still pass, because the route was the only thing asking. They
 *     are two different guards, the route's on the transition and the function's on where the run
 *     stands, and each is proved on its own.
 *   - Name a checkout the run never recorded, and the "no checkout" case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

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

let t: TestDb
let app: FastifyInstance
/**
 * THE LIBRARY, IMPORTED AFTER `freshDb()` AND NOT AT THE TOP OF THE FILE.
 *
 * A value imported from a module that reaches src/server/db/client.ts opens the database before any
 * test body runs, and src/server/db/client.ts refuses that by name: it would be the operator's own
 * file, opened for writing. `helpers.ts` is written for this, and the fix is the one its refusal
 * names — call freshDb() first, then import.
 */
let lib: typeof import('../src/server/lib/inspection.ts')

interface TheCheck {
  askedAt: string
  askedOf?: string
  message?: string
  checkout: { directory?: string; cutFrom?: string }
  says: string
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** File a run that is still going. Nothing about it is finished yet. */
async function aRunStillGoing(handle: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'running', servingAgent: handle, cutFrom: 'main', tip: fixtureTip, doing: 'building the thing under check', ...extra },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const id = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  return id
}

/** Say the run is finished, exactly as the message worker's `sayHowItEnded` says it. */
async function sayItIsFinished(handle: string, run: string): Promise<{ theCheck?: TheCheck }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: asAgent(handle),
    payload: { dataPatch: { state: 'finished', doing: 'the work is done' } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { theCheck?: TheCheck }
}

/** What the message worker would be handed on its next pass, through its own door.
 *
 * `full=1` is the queue door's full reply: the narrow answer these tests
 * drove before carries the words no longer, and this file reads them back, so it asks for them. */
async function theWorkersQueue(): Promise<{ messageId: string; handle: string; body: string; nobodyIsAnsweringAsIt: string | null }[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { queue: { messageId: string; handle: string; body: string; nobodyIsAnsweringAsIt: string | null }[] }).queue
}

async function readTheCheck(run: string): Promise<{ theCheck: TheCheck | null; stands: { unreleasedFinish: boolean } }> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { theCheck: TheCheck | null; stands: { unreleasedFinish: boolean } }
}

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/inspection.ts')
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'the-worker', name: 'The Worker', role: 'worker', workArea: ['src'] })
})

afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * THE ORDER OF THESE TWO BLOCKS IS PART OF THE TEST and not an accident. The first runs while no
 * agent holds the inspector card, because that is the state this installation was in until the
 * person appointed one; the second appoints one. Appointing is the person's act and cannot be
 * undone from here, so it happens once, between them.
 */
describe('C28 — when nobody holds the inspector card', () => {
  it('starts nothing, records the finish, and tells the starter that nobody is appointed', async () => {
    const run = await aRunStillGoing('the-worker', 'A run finishing with no inspector in the building')
    const patched = await sayItIsFinished('the-worker', run)

    // ABSENT, not null: an absent key is how this product says nobody holds the card.
    expect(patched.theCheck).not.toHaveProperty('askedOf')
    expect(patched.theCheck?.says).toContain('Nobody holds the inspector card')

    // THE FINISH IS STILL RECORDED. Nothing here hides an unreleased finish.
    const read = await readTheCheck(run)
    expect(read.stands.unreleasedFinish).toBe(true)
    expect(read.theCheck).not.toHaveProperty('askedOf')

    // AND THE STARTER WAS TOLD, by name, rather than the finish quietly waiting for nobody.
    const queue = await theWorkersQueue()
    const told = queue.filter((one) => one.messageId === patched.theCheck?.message && one.handle === THE_TEST_OFFICES_SECRETARY.handle)
    expect(told).toHaveLength(1)
    expect(told[0]?.handle).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(told[0]?.body).toContain('no inspector is appointed')
    expect(told[0]?.body).toContain(run)
  })

  it('tells the owner when no inspector is appointed after a hand-over', async () => {
    await register(AS_THE_PERSON, { handle: 'synthetic-check-owner', name: 'Synthetic check owner', role: 'secretary' })
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'synthetic-owned-worker', name: 'Synthetic owned worker', role: 'worker', workArea: ['src'] })
    const row = (handle: string) => t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
    const owner = row('synthetic-check-owner')
    const worker = row('synthetic-owned-worker')
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    if (columns.some((column) => column.name === 'owner_id')) {
      setFixtureOwner(t.client.sqlite, owner.id, worker.id, 'id')
    }
    const run = await aRunStillGoing('synthetic-owned-worker', 'A synthetic finish awaiting a check')
    const finished = await sayItIsFinished('synthetic-owned-worker', run)
    expect(finished.theCheck?.message).toBeDefined()
    const notice = t.api.getRecord(finished.theCheck!.message!)
    expect(notice?.data['to']).toEqual([{ kind: 'agent', id: owner.id }, { kind: 'agent', id: worker.id }])
    expect(notice?.data['to']).not.toContainEqual({ kind: 'agent', id: row(THE_TEST_OFFICES_SECRETARY.handle).id })
  })
})

describe('C28 — when an inspector holds the card', () => {
  beforeAll(async () => {
    // ONLY THE PERSON APPOINTS AN INSPECTOR. An agent that tried would be appointing its own checker.
    await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  })

  it('writes the inspector a message, which is what the message worker starts the run from', async () => {
    const before = await theWorkersQueue()
    const run = await aRunStillGoing('the-worker', 'A run the office checks by itself', {
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/some-branch`,
      cutFrom: 'main',
    })
    const patched = await sayItIsFinished('the-worker', run)

    expect(patched.theCheck?.askedOf).toBe('inspector-one')
    expect(patched.theCheck?.message).toBeTruthy()

    // THE PROOF THAT IT IS THE SAME PATH: the worker's own door now holds one more entry, addressed
    // to the inspector, and the worker starts a run for every entry it is handed.
    const after = await theWorkersQueue()
    expect(after.length).toBe(before.length + 2)
    const started = after.filter((one) => one.messageId === patched.theCheck?.message && one.handle === 'inspector-one')
    expect(started).toHaveLength(1)
    expect(started[0]?.handle).toBe('inspector-one')

    // The server's trusted check job is sufficient to start the tool without a person's press.
    // It no longer needs the mark used to authorize a provider conversation.
    expect(started[0]?.nobodyIsAnsweringAsIt).toBeNull()
    expect(started[0]).toHaveProperty('inspection.run', run)
  })

  it('names the run in a notice and keeps its checkout on the request', async () => {
    const run = await aRunStillGoing('the-worker', 'A run whose checkout the message has to name', {
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-named-place`,
      cutFrom: 'a-branch-of-its-own',
    })
    const patched = await sayItIsFinished('the-worker', run)
    const queue = await theWorkersQueue()
    const body = queue.find((one) => one.messageId === patched.theCheck?.message)?.body ?? ''

    expect(body).toContain(run)
    expect(body).toContain('office will run the check tool')
    expect(body).not.toContain('RUN IT IN THE FOREGROUND')
    expect(patched.theCheck?.checkout).toEqual({
      directory: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/a-named-place`,
      cutFrom: 'a-branch-of-its-own',
    })
  })

  it('says so plainly where the run recorded no checkout, rather than naming one it does not have', async () => {
    const run = await aRunStillGoing('the-worker', 'A run that recorded no working directory')
    const patched = await sayItIsFinished('the-worker', run)
    const queue = await theWorkersQueue()
    const body = queue.find((one) => one.messageId === patched.theCheck?.message)?.body ?? ''

    expect(body).not.toContain('--checkout undefined')
    expect(body).not.toContain('--checkout null')
    expect(body).toContain('office will run the check tool')
    expect(patched.theCheck?.checkout).toEqual({ cutFrom: 'main' })
  })

  it('asks once, so a run patched to finished twice does not get two inspectors started on it', async () => {
    const run = await aRunStillGoing('the-worker', 'A run that says it is finished twice')
    const first = await sayItIsFinished('the-worker', run)
    const afterOne = await theWorkersQueue()

    // The second patch declares nothing: the run already said it was finished.
    const second = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('the-worker'),
      payload: { dataPatch: { state: 'finished', doing: 'saying it again' } },
    })
    expect(second.statusCode, second.body).toBe(200)
    expect((second.json() as { theCheck?: TheCheck }).theCheck).toBeUndefined()

    const afterTwo = await theWorkersQueue()
    expect(afterTwo.length).toBe(afterOne.length)
    expect(afterTwo.filter((one) => one.messageId === first.theCheck?.message && one.handle === 'inspector-one')).toHaveLength(1)
  })

  it("starts nothing for a run of the inspector's own, so a check never checks itself", async () => {
    // PROBLEM t4Ac_IqiGdUD, MEASURED 8 SEPTEMBER 2026 FROM 11:53 TO 12:07: every inspector run that
    // ended was itself an unreleased finish, so the office asked the inspector to check it, and
    // twenty-five runs of the inspector chained back to back, each checking the one before. Once
    // the office's own request carried the mark that starts a run without a press, nothing held
    // them. A run that serves the inspector card's holder is never checked.
    const before = await theWorkersQueue()
    const run = await aRunStillGoing('inspector-one', "The inspector's own answering run", {
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/a-check-of-something`,
    })
    const patched = await sayItIsFinished('inspector-one', run)
    expect(patched.theCheck?.askedOf).toBeUndefined()
    expect(patched.theCheck?.message).toBeUndefined()
    expect(String(patched.theCheck?.says)).toContain('no inspector role or purpose')
    const after = await theWorkersQueue()
    expect(after.length).toBe(before.length)
  })

  it('starts nothing for a run that has not said its work is finished', async () => {
    const before = await theWorkersQueue()
    const run = await aRunStillGoing('the-worker', 'A run still working')
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${run}`,
      headers: asAgent('the-worker'),
      payload: { dataPatch: { doing: 'still going, and saying so' } },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    expect((patched.json() as { theCheck?: TheCheck }).theCheck).toBeUndefined()

    const read = await readTheCheck(run)
    expect(read.theCheck).toBe(null)
    expect(read.stands.unreleasedFinish).toBe(false)
    expect(await theWorkersQueue()).toHaveLength(before.length)

    // AND THE FUNCTION ITSELF REFUSES, not only the route that calls it. Asked straight out about a
    // run that never said it was finished, it answers null and writes nothing. The route's guard and
    // this one are two different guards and each needs its own proof: the route asks on the
    // TRANSITION, which no other caller has, and this asks on where the run STANDS.
    expect(
      lib.theOfficeStartsTheCheck({ runId: run, workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle } }),
    ).toBe(null)
    expect(await theWorkersQueue()).toHaveLength(before.length)
  })

  it('starts nothing for a run somebody already released, asked straight out', async () => {
    const before = await theWorkersQueue()
    const run = await aRunStillGoing('the-worker', 'A run its starter released without an inspector')
    await sayItIsFinished('the-worker', run)
    const askedOnce = await theWorkersQueue()
    expect(askedOnce.length).toBe(before.length + 2)

    // A SECOND ASK AFTER A RELEASE STARTS NOTHING, and the reason is the field the first ask wrote:
    // the office reads what it did as the proof it did it.
    expect(
      lib.theOfficeStartsTheCheck({ runId: run, workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle } })?.askedOf,
    ).toBe('inspector-one')
    expect(await theWorkersQueue()).toHaveLength(askedOnce.length)
  })
})
