// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S OWNER IS NAMED BY THE PERSON, ON THE SETTINGS PAGE. A decision, with the answer
 * EI3_Msuradr7, sets out a stored setting, its migration and a press, like the dead-letter secretary, defaulting to
 * nobody.
 *
 * WHAT IS PROVED, through the real doors of the real app, against a throwaway database:
 *
 *   1. Nobody owns the merge queue until the person names a secretary, and the reading says so. It never falls back
 *      to any secretary the office has.
 *   2. The person names a secretary, the reading says who, and the change is written down as the person's.
 *   3. An agent is refused in words, even a secretary naming itself; a secretary the person has raised may
 *      .
 *   4. An agent nobody bears, an agent that is not a secretary, and a retired one are refused, each with its own code,
 *      and nothing is stored. A secretary retired after it was named stops owning the queue at once, and the reading
 *      says why.
 *
 * MUTATION PROOF (each after a green control; each turns the case named red, and restoring it turns it green):
 *
 *   - Case 1: in src/server/lib/merge-queue-owner.ts, `theMergeQueueOwner`, answer the first of `mayBeNamed` when
 *     nothing is stored.
 *   - Case 2: in src/server/api/merge-queue-owner.ts, take out `writeDownASettingChange`.
 *   - Case 3: in `onlyThePersonMayNameTheOwner`, take out the `aRaiseCarriesIt` line (the raised secretary is refused),
 *     and, apart, return at the top for every actor (the unraised secretary names itself).
 *   - Case 4: in `whyThisAgentMayNotOwnIt`, take out the role check (the worker is named).
 *   - Case 5: in src/shared/addresses.ts, put 'settings.mergequeueowner' before 'settings.deadletters'.
 *
 * Every agent here is synthetic and made-up, and nothing reaches the live server.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
/** Made-up handles. */
const KEEPER = 'queue-keeper'
const OTHER = 'other-secretary'
const WORKER = 'a-worker'
const GONE = 'gone-secretary'

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const byKey = (key: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': key })

let t: TestDb
let app: FastifyInstance
const keys: Record<string, string> = {}

async function call(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

const reading = async () => (await call('GET', '/api/office/merge-queue-owner', as('agent', WORKER))).body
const storedNow = () => (t.client.sqlite.prepare('SELECT merge_queue_owner AS who FROM installation WHERE only_row = 1').get() as { who: string | null }).who
const changeRows = () =>
  t.client.sqlite.prepare("SELECT actor_id, old_value, new_value FROM changes WHERE record_id = 'setting:merge-queue-owner' ORDER BY rowid").all() as {
    actor_id: string
    old_value: string | null
    new_value: string | null
  }[]

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  for (const one of [
    { handle: KEEPER, name: 'Synthetic queue keeper', role: 'secretary' },
    { handle: OTHER, name: 'Synthetic other secretary', role: 'secretary' },
    { handle: GONE, name: 'Synthetic gone secretary', role: 'secretary' },
    { handle: WORKER, name: 'Synthetic worker', workArea: ['src'] },
  ]) {
    const started = await call('POST', '/api/agents/started', asPerson, one)
    expect(started.status, started.raw).toBe(201)
    keys[one.handle] = String(started.body['whatToGiveIt']?.key)
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the merge queue's owner", () => {
  it('1: is nobody until the person names one, and never falls back to a secretary', async () => {
    const now = await reading()
    expect(now).toMatchObject({ named: null, nobodyBecause: 'nobody chose', stored: null })
    expect(now['says']).toBe('No owner named. Only you may move an entry to the front.')
    // THE PICKER OFFERS THE SECRETARIES, and only them.
    const offered = (now['mayBeNamed'] as { handle: string }[]).map((one) => one.handle).sort()
    expect(offered).toEqual([GONE, OTHER, KEEPER].sort())
  })

  it('2: is named by the person, and the change is written down as the person’s', async () => {
    const before = changeRows().length
    const named = await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: KEEPER })
    expect(named.status, named.raw).toBe(200)
    expect(named.body['named']).toMatchObject({ handle: KEEPER })
    expect(named.body['says']).toBe('Synthetic queue keeper owns the merge queue.')
    expect((await reading())['named']).toMatchObject({ handle: KEEPER })
    const rows = changeRows()
    expect(rows.length).toBe(before + 1)
    expect(rows.at(-1)).toMatchObject({ actor_id: THE_TEST_OFFICES_OWNER.id, old_value: null })
    expect(rows.at(-1)?.new_value).toContain(String(named.body['stored']))
  })

  it('3: refuses an agent in words, even a secretary naming itself, and lets a raised secretary', async () => {
    const stored = storedNow()
    const refused = await call('POST', '/api/office/merge-queue-owner', byKey(keys[OTHER]!), { agent: OTHER })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.body['error']).toContain("Who owns the merge queue is the owner's own setting")
    expect(refused.raw).toContain('mergeQueueOwnerOwnerNotProved')
    expect(storedNow()).toBe(stored)

    const raised = await call('POST', `/api/roles/elevation/${OTHER}`, { ...asPerson, ...thePersonsKeyHeader() }, { reason: 'Synthetic: mind the queue tonight' })
    expect(raised.status, raised.raw).toBe(201)
    try {
      const byRaise = await call('POST', '/api/office/merge-queue-owner', byKey(keys[OTHER]!), { ...FOR_THE_PERSON, agent: null })
      expect(byRaise.status, byRaise.raw).toBe(200)
      expect(byRaise.body).toMatchObject({ named: null, nobodyBecause: 'nobody chose' })
    } finally {
      await call('DELETE', `/api/roles/elevation/${OTHER}`, asPerson)
    }
    expect((await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: KEEPER })).status).toBe(200)
  })

  it('4: refuses an agent nobody bears, a worker and a retired secretary, and stops a secretary retired since', async () => {
    const stored = storedNow()
    const nobody = await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: 'nobody-bears-this' })
    expect(nobody.status, nobody.raw).toBe(400)
    expect(nobody.raw).toContain('mergeQueueOwnerNoSuchAgent')
    const worker = await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: WORKER })
    expect(worker.status, worker.raw).toBe(400)
    expect(worker.raw).toContain('mergeQueueOwnerNotASecretary')
    expect(worker.body['error']).toContain("does not hold the secretary's card")
    expect(storedNow()).toBe(stored)

    // NAMED, THEN RETIRED: the reading says nobody, and why, at once.
    expect((await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: GONE })).status).toBe(200)
    const gone = await call('POST', `/api/participants/agent/${GONE}/retire`, asPerson, { because: 'Synthetic: its work is done.' })
    expect(gone.status, gone.raw).toBe(200)
    const after = await reading()
    expect(after).toMatchObject({ named: null, nobodyBecause: 'retired' })
    expect(after['says']).toBe('The merge queue has no owner. The agent named for it, Synthetic gone secretary, is retired, so only you may move an entry to the front.')
    expect((after['mayBeNamed'] as { handle: string }[]).map((one) => one.handle)).not.toContain(GONE)
    // THE WRITER REFUSES IT TOO.
    const lib = await import('../src/server/lib/merge-queue-owner.ts')
    let retired: unknown
    try {
      lib.setTheMergeQueueOwner(String(after['stored']))
    } catch (error) {
      retired = error
    }
    expect((retired as { status?: number } | undefined)?.status).toBe(400)
    expect(String((retired as Error | undefined)?.message)).toContain('is retired')
    expect((await call('POST', '/api/office/merge-queue-owner', asPerson, { agent: KEEPER })).status).toBe(200)
  })

})
