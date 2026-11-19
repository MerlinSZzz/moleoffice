// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR SWITCHES THAT DECIDE WHETHER WORK MOVES ARE OFFICE SETTINGS, READ IN ONE CALL. Wave 13q, item 17 of its list.
 *
 * Until this item they were files on the host, and nobody saw them without reading those files. Now each is an office
 * setting, changed through a door that keeps who changed it, when and why:
 *   - the own-release skip list, as two settings: the check tags and the run ids whose release is kept by hand;
 *   - the queue hold, which is the office's own queue-held gate;
 *   - how many checks run at once, which is the office's own checks-at-once setting, now with bounds;
 *   - the receipt producer's unfinished attempt.
 * GET /api/office/work-switches answers all four, to an agent with its own key and no person's session, and reads
 * only those four.
 *
 * What is proved, through the doors:
 *   1. the read call answers each of the four, with an agent's own key, from an office where nobody set them, and its
 *      answer names no other setting;
 *   2. a change is shown with who made it, when and why;
 *   3. a hold without a reason is refused and changes nothing, and a hold with one is shown with it;
 *   4. checks at once is refused outside its bounds and taken at each bound;
 *   5. a skip list with a blank entry, a space, a repeat or a run id of the wrong shape is refused and stores nothing;
 *   6. the receipt producer's attempt is shown with since when, clearing it without a reason is refused, and clearing
 *      it with one is shown;
 *   7. a stored value the read call cannot read is refused with a 500 that names the setting, not read as empty.
 *
 * No refusal's words are copied here: a case reads the status and the setting or number the refusal must name.
 *
 * MUTATIONS, after a control run, are written in the commit that proves this file.
 *
 * Every agent, list, attempt and reason here is made up, in a fresh test database. Nothing reaches the live office.
 */
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { gateNamed } from '../src/config/gates.mjs'
import { SETTINGS } from '../src/config/settings.mjs'
import { CHECKS_AT_ONCE_BOUNDS, CHECKS_AT_ONCE_BY_DEFAULT } from '../src/shared/checks-in-merges-only.ts'
import { NARROWED_BY_PERMISSION } from '../src/shared/disclosure.ts'
import { OWN_RELEASE_SKIP_RUNS, OWN_RELEASE_SKIP_TAGS, RECEIPT_PRODUCER_PENDING } from '../src/shared/work-switches.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const QUEUE_HELD = gateNamed('queue-held').setting
const THE_READ_CALL = '/api/office/work-switches'
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/

interface ALastChange { at: string; by: { type: string; id: string; name: string | null }; because: string | null }
interface TheWorkSwitches {
  ownReleaseSkip: Record<'tags' | 'runs', { setting: string; entries: string[]; source: string; lastChange: ALastChange | null }>
  queueHeld: { gate: string; setting: string; on: boolean; source: string; lastChange: (ALastChange & { until: string | null }) | null }
  checksAtOnce: { value: number; from: string; fewest: number; most: number; lastChange: ALastChange | null }
  receiptProducerPending: { setting: string; attempt: string | null; since: string | null; source: string; lastChange: ALastChange | null }
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** What a case stored is taken away, so the next case starts from an office where nobody set the four. */
afterEach(() => {
  const names = [OWN_RELEASE_SKIP_TAGS, OWN_RELEASE_SKIP_RUNS, RECEIPT_PRODUCER_PENDING, QUEUE_HELD]
  for (const name of names) t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(name)
  for (const name of names) t.client.sqlite.prepare('DELETE FROM changes WHERE record_id = ?').run(`setting:runtime:${name}`)
  t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = 'setting:checks-at-once'").run()
})

let agents = 0
/** An agent of this test office with its own key, and the headers it asks with. */
async function anAgent(role: 'secretary' | 'worker'): Promise<{ id: string; name: string; headers: Record<string, string> }> {
  const handle = `switch-${role}-${String(++agents)}`
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_OWNER, payload: { handle, name: `Made-up ${handle}`, role } })
  expect(made.statusCode, made.body).toBe(201)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const agent = agentByHandle(handle)!
  return {
    id: agent.id,
    name: `Made-up ${handle}`,
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': makeAnAgentKey(agent.id, null) },
  }
}

async function read(headers: Record<string, string>): Promise<{ status: number; body: TheWorkSwitches & { error?: string } }> {
  const reply = await app.inject({ method: 'GET', url: THE_READ_CALL, headers })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as TheWorkSwitches & { error?: string } }
}

async function readAsAWorker(): Promise<TheWorkSwitches> {
  const reading = await read((await anAgent('worker')).headers)
  expect(reading.status, JSON.stringify(reading.body)).toBe(200)
  return reading.body
}

async function setThroughTheSettingsDoor(name: string, value: string | null, because: string | undefined, headers: Record<string, string> = AS_THE_OWNER): Promise<{ status: number; body: { error?: string } }> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/settings', headers, payload: { changes: [{ name, value }], ...(because === undefined ? {} : { because }) } })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as { error?: string } }
}

async function setTheChecksAtOnce(checksAtOnce: unknown, because: string): Promise<{ status: number; body: { error?: string } }> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/checks-in-merges-only', headers: AS_THE_OWNER, payload: { checksAtOnce, because } })
  return { status: reply.statusCode, body: JSON.parse(reply.body) as { error?: string } }
}

function stored(name: string): unknown {
  return t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(name)
}

describe('the four work switches', () => {
  it('1: the read call answers each of the four to an agent with its own key, and names no other setting', async () => {
    const reading = await readAsAWorker()
    // The office adds its permission field to every reply, so the four and that field are all the reply holds.
    expect(Object.keys(reading).sort()).toEqual(['checksAtOnce', NARROWED_BY_PERMISSION, 'ownReleaseSkip', 'queueHeld', 'receiptProducerPending'].sort())
    expect(reading[NARROWED_BY_PERMISSION as keyof TheWorkSwitches]).toBeNull()
    expect(reading.ownReleaseSkip).toEqual({
      tags: { setting: OWN_RELEASE_SKIP_TAGS, entries: [], source: 'nothing set it', lastChange: null },
      runs: { setting: OWN_RELEASE_SKIP_RUNS, entries: [], source: 'nothing set it', lastChange: null },
    })
    expect(reading.queueHeld).toMatchObject({ gate: 'queue-held', setting: QUEUE_HELD, on: false, lastChange: null })
    expect(reading.checksAtOnce).toEqual({ value: CHECKS_AT_ONCE_BY_DEFAULT, from: 'the default', ...CHECKS_AT_ONCE_BOUNDS, lastChange: null })
    expect(reading.receiptProducerPending).toEqual({ setting: RECEIPT_PRODUCER_PENDING, attempt: null, since: null, source: 'nothing set it', lastChange: null })
    // ONLY THE FOUR ARE READ: no other setting's name is in the answer, so a host script gets no whole table to sift.
    const said = JSON.stringify(reading)
    const four = new Set([OWN_RELEASE_SKIP_TAGS, OWN_RELEASE_SKIP_RUNS, RECEIPT_PRODUCER_PENDING, QUEUE_HELD])
    expect(SETTINGS.map(({ name }) => name).filter((name) => !four.has(name) && said.includes(`"${name}"`))).toEqual([])
  })

  it('2: shows each change with who made it, when and why', async () => {
    const clerk = await anAgent('secretary')
    expect((await setThroughTheSettingsDoor(OWN_RELEASE_SKIP_TAGS, 'w13s-r38\nw13x-r14', 'Synthetic: these two are released by hand.')).status).toBe(200)
    expect((await setThroughTheSettingsDoor(OWN_RELEASE_SKIP_RUNS, 'lTEX3kirjfRP', 'Synthetic: this run is released by hand.', clerk.headers)).status).toBe(200)
    expect((await setTheChecksAtOnce(3, 'Synthetic: three at once.')).status).toBe(200)
    const reading = await readAsAWorker()
    expect(reading.ownReleaseSkip.tags).toMatchObject({
      entries: ['w13s-r38', 'w13x-r14'], source: 'the office database',
      lastChange: { by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, because: 'Synthetic: these two are released by hand.' },
    })
    expect(reading.ownReleaseSkip.runs).toMatchObject({
      entries: ['lTEX3kirjfRP'], source: 'the office database',
      lastChange: { by: { type: 'agent', name: clerk.name }, because: 'Synthetic: this run is released by hand.' },
    })
    expect(reading.checksAtOnce).toMatchObject({
      value: 3, from: 'set here', lastChange: { by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, because: 'Synthetic: three at once.' },
    })
    for (const last of [reading.ownReleaseSkip.tags.lastChange, reading.ownReleaseSkip.runs.lastChange, reading.checksAtOnce.lastChange]) expect(last?.at).toMatch(STAMP)
  })

  it('3: refuses a hold without a reason and changes nothing, and shows a hold with its reason', async () => {
    for (const because of [undefined, '', '   ']) {
      const refused = await setThroughTheSettingsDoor(QUEUE_HELD, '1', because)
      expect(refused.status, JSON.stringify(because)).toBe(400)
    }
    expect(stored(QUEUE_HELD)).toBeUndefined()
    expect((await readAsAWorker()).queueHeld).toMatchObject({ on: false, lastChange: null })
    expect((await setThroughTheSettingsDoor(QUEUE_HELD, '1', 'Synthetic: hold the queue while main is red.')).status).toBe(200)
    const held = (await readAsAWorker()).queueHeld
    expect(held).toMatchObject({ on: true, source: 'the office database', lastChange: { by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, because: 'Synthetic: hold the queue while main is red.', until: null } })
    expect(held.lastChange?.at).toMatch(STAMP)
  })

  it('4: refuses checks at once outside its bounds, naming them, and takes each bound', async () => {
    const { fewest, most } = CHECKS_AT_ONCE_BOUNDS
    for (const wrong of [fewest - 1, most + 1, 1.5, String(fewest)]) {
      const refused = await setTheChecksAtOnce(wrong, 'Synthetic: a number out of bounds.')
      expect(refused.status, JSON.stringify(wrong)).toBe(400)
      expect(refused.body.error, JSON.stringify(wrong)).toContain(String(fewest))
      expect(refused.body.error, JSON.stringify(wrong)).toContain(String(most))
    }
    expect((await readAsAWorker()).checksAtOnce).toMatchObject({ value: CHECKS_AT_ONCE_BY_DEFAULT, from: 'the default', lastChange: null })
    for (const bound of [fewest, most]) {
      expect((await setTheChecksAtOnce(bound, 'Synthetic: a bound.')).status, String(bound)).toBe(200)
      expect((await readAsAWorker()).checksAtOnce).toMatchObject({ value: bound, from: 'set here' })
    }
  })

  it('5: refuses a skip list with a blank entry, a space, a repeat or a run id of the wrong shape, and stores nothing', async () => {
    const wrongTags = ['w13s-r38\n\nw13x-r14', 'w13s r38', 'w13s-r38\nw13s-r38', 'w13s_r38', 'w13s-r38\r\nw13x-r14']
    const wrongRuns = ['lTEX3kirjfR', 'lTEX3kirjfRPx', 'lTEX3kirj.RP', 'lTEX3kirjfRP\nlTEX3kirjfRP', 'lTEX3kirjfRP w13s-r38']
    for (const [name, values] of [[OWN_RELEASE_SKIP_TAGS, wrongTags], [OWN_RELEASE_SKIP_RUNS, wrongRuns]] as const) {
      for (const value of values) {
        const refused = await setThroughTheSettingsDoor(name, value, 'Synthetic: a list that is wrong.')
        expect(refused.status, JSON.stringify(value)).toBe(400)
      }
      expect(stored(name), name).toBeUndefined()
    }
    const reading = await readAsAWorker()
    expect(reading.ownReleaseSkip.tags.entries).toEqual([])
    expect(reading.ownReleaseSkip.runs.entries).toEqual([])
  })

  it('6: shows the receipt producer\'s attempt with since when, and clearing it needs a reason', async () => {
    const producer = await anAgent('secretary')
    const attempt = join(tmpdir(), 'made-up-producer', 'attempt-1')
    for (const wrong of ['attempt-1', `${attempt}\n${attempt}`]) {
      expect((await setThroughTheSettingsDoor(RECEIPT_PRODUCER_PENDING, wrong, 'Synthetic: a wrong attempt.', producer.headers)).status, JSON.stringify(wrong)).toBe(400)
    }
    expect(stored(RECEIPT_PRODUCER_PENDING)).toBeUndefined()
    expect((await setThroughTheSettingsDoor(RECEIPT_PRODUCER_PENDING, attempt, 'Synthetic: an attempt began.', producer.headers)).status).toBe(200)
    const pending = (await readAsAWorker()).receiptProducerPending
    expect(pending).toMatchObject({ attempt, source: 'the office database', lastChange: { by: { type: 'agent', name: producer.name }, because: 'Synthetic: an attempt began.' } })
    expect(pending.since).toMatch(STAMP)
    expect(pending.since).toBe(pending.lastChange?.at)
    for (const because of [undefined, '']) {
      expect((await setThroughTheSettingsDoor(RECEIPT_PRODUCER_PENDING, null, because)).status, JSON.stringify(because)).toBe(400)
    }
    expect((await readAsAWorker()).receiptProducerPending.attempt).toBe(attempt)
    expect((await setThroughTheSettingsDoor(RECEIPT_PRODUCER_PENDING, null, 'Synthetic: its result was read, and nothing waits.')).status).toBe(200)
    expect((await readAsAWorker()).receiptProducerPending).toMatchObject({
      attempt: null, since: null, source: 'nothing set it', lastChange: { by: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, because: 'Synthetic: its result was read, and nothing waits.' },
    })
  })

  it('7: refuses with a 500 that names it a stored value the read call cannot read, rather than read it as no list', async () => {
    t.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(OWN_RELEASE_SKIP_TAGS, 'w13s r38')
    const reading = await read((await anAgent('worker')).headers)
    expect(reading.status).toBe(500)
    expect(reading.body.error).toContain(OWN_RELEASE_SKIP_TAGS)
  })
})
