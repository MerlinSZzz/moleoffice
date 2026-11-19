// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY END A RUN. Problem FZQflYp1vHuY, found by the supervisor of wave 13m: any agent that could write a run could move
 * it to an end, and the end revokes the run's key and ends its claims in the same write. the answers of 27
 * September 2026 (message _tAWRdxNui9W) name who may: the person with their key, the office itself, the run's own
 * agent, the agent that started its agent or filed it, and a secretary. The guard is `assertMayEndARun` in
 * src/server/lib/records.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The run's own agent ends it.
 *   2. An agent that is none of them is refused with the 403 that names who may, and the run is still running. A
 *      session header naming the run does not make a stranger the run.
 *   3. The agent that filed the run ends it.
 *   4. The agent that started the run's agent ends it.
 *   5. A secretary ends it.
 *   6. The person ends it with their key, or from inside the office; their name with no key is refused even where the key
 *      window covers it.
 *   7. The office ends it: a system writer, its own writers by their names (taken at their word as any agent's name
 *      is while the key window is open), or a caller proved by the office's key, whatever name it gives.
 *   8. The agent a run ran as ends it with its own key. The agent named in the run's `ranAs` is the run's own agent,
 *      as it is for the rule on what an agent's own key holds, and the run here names no agent it serves.
 *   9. On such a run, another agent's own key is still refused, and the run is still running.
 *  10. On such a run, the person's name with no key is still refused where the key window covers it.
 *  11. On such a run, the 403 still names who may, and among them the agent the run ran as, in the words the
 *      record's page uses for that field.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the guard not asked: cases 2, 6, 9, 10 and 11 go red;
 *   - the key window's claim counted as the person: cases 6 and 10 go red;
 *   - the filer not asked: case 3 goes red;
 *   - the starter of its agent not asked: case 4 goes red;
 *   - a secretary not asked: case 5 goes red;
 *   - the office's writers' names not asked: case 7 goes red;
 *   - the office's key not asked: case 7 goes red;
 *   - a session header naming the run believed: case 2 goes red;
 *   - the agent a run ran as not asked, the run's own agents read without its `ranAs`: case 8 goes red;
 *   - the 403's words for who may renamed away from their export: case 11 goes red, on the export;
 *   - "an agent it ran as" taken out of those words: case 11 goes red, on the word the record's page uses for the
 *     field.
 *
 * The run that added cases 8 to 11 ran the first two again and the last three, each after a control run.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Built = Awaited<ReturnType<typeof apiApp>>

let t: TestDb
let app: Built
/** The records library, loaded after the test's own database is made, because it opens one. */
let records: typeof import('../src/server/lib/records.ts')
/** The registry id of the agent the runs in cases 8 to 11 ran as. */
let ranAsOne = ''

const THEM = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/**
 * Register an agent, as the person or as the agent that starts it. An agent another agent starts is registered here
 * with no card named, so it reads as a worker.
 */
async function registered(handle: string, role: 'worker' | 'secretary' | null, by: Record<string, string> = THEM): Promise<string> {
  const body =
    role === null ? { handle, name: handle } : role === 'secretary' ? { handle, name: handle, role } : { handle, name: handle, role, workArea: ['src'], chapters: ['5'] }
  const done = await ask('POST', '/api/agents/started', by, body)
  expect(done.status, done.said).toBeLessThan(300)
  return String(done.body['agent']?.id)
}

/** A run that serves `agent`, filed by whoever `filer` names, and still running. */
async function aRunningRun(agent: string, filer: Record<string, string>): Promise<string> {
  const filed = await ask('POST', '/api/records', filer, { kind: 'session', title: `a run of ${agent}`, data: { state: 'running', servingAgent: agent } })
  expect(filed.status, filed.said).toBe(201)
  return String(filed.body['record'].id)
}

/** A run that ran as the agent with this id and names no agent it serves, filed by the person and still running. */
async function aRunThatRanAs(agentId: string): Promise<string> {
  const filed = await ask('POST', '/api/records', THEM, { kind: 'session', title: 'a run that ran as an agent', data: { state: 'running', ranAs: [{ workspaceId: 'default', agentId }] } })
  expect(filed.status, filed.said).toBe(201)
  return String(filed.body['record'].id)
}

async function stateOf(run: string): Promise<unknown> {
  return (await ask('GET', `/api/records/${run}`, THEM)).body['record']?.data?.state
}

/**
 * The refusal `patchRecord` throws for an actor that no request could stand for, or null when it wrote. The runs here
 * end as `crashed`, which is an end like `finished` for the guard and the key, and is not sealed.
 */
function endedDirectlyBy(run: string, actor: import('../src/server/lib/records.ts').Actor): { status: number; said: string } | null {
  try {
    records.patchRecord(run, { dataPatch: { state: 'crashed', detail: 'ended in a test of who may end a run' } }, actor)
    return null
  } catch (refused) {
    return { status: (refused as { status: number }).status, said: String((refused as Error).message) }
  }
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = await apiApp()
  await app.app.ready()
  records = await import('../src/server/lib/records.ts')
  await registered('sec-one', 'secretary')
  await registered('lead-one', 'worker')
  await registered('lead-two', 'worker')
  await registered('stranger-one', 'worker')
  await registered('worker-one', 'worker')
  // STARTED BY ANOTHER AGENT, which makes lead-two its starter (criterion P1).
  await registered('worker-two', null, asAgent('lead-two'))
  // TWO RUNGS BELOW lead-one: lead-one started mid-one, which started worker-three. So lead-one may file worker-three's
  // run (an agent above it in its chain of starters, the secretary's filing door of round 30) without being the agent that
  // started it, and what lets it end that run is that it filed it.
  await registered('mid-one', null, asAgent('lead-one'))
  await registered('worker-three', null, asAgent('mid-one'))
  ranAsOne = await registered('ran-as-one', 'worker')
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('who may end a run', () => {
  it('1: its own agent', async () => {
    const run = await aRunningRun('worker-one', THEM)
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('worker-one'), { dataPatch: { state: 'crashed', detail: 'its own agent stopped it' } })
    expect(ended.status, ended.said).toBe(200)
    expect(await stateOf(run)).toBe('crashed')
  })

  it('2: not an agent that is none of them, not even with the run named in its session header', async () => {
    const run = await aRunningRun('worker-one', THEM)
    for (const headers of [asAgent('stranger-one'), asAgent('stranger-one', run)]) {
      const refused = await ask('PATCH', `/api/records/${run}`, headers, { dataPatch: { state: 'crashed', detail: 'ended by somebody else' } })
      expect(refused.status, refused.said).toBe(403)
      expect(refused.said).toContain('A run is ended only by the person with their key, the office itself, its own agent')
      expect(refused.said).toContain('"stranger-one"')
    }
    expect(await stateOf(run), 'the refused end was written').toBe('running')
  })

  it('3: the agent that filed it', async () => {
    const run = await aRunningRun('worker-three', asAgent('lead-one'))
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('lead-one'), { dataPatch: { state: 'crashed', detail: 'its filer stopped it' } })
    expect(ended.status, ended.said).toBe(200)
    expect(await stateOf(run)).toBe('crashed')
  })

  it('4: the agent that started its agent', async () => {
    const run = await aRunningRun('worker-two', THEM)
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('lead-two'), { dataPatch: { state: 'crashed', detail: 'the starter of its agent stopped it' } })
    expect(ended.status, ended.said).toBe(200)
    expect(await stateOf(run)).toBe('crashed')
  })

  it('5: a secretary', async () => {
    const run = await aRunningRun('worker-one', THEM)
    const ended = await ask('PATCH', `/api/records/${run}`, asAgent('sec-one'), { dataPatch: { state: 'crashed', detail: 'settled by the secretary' } })
    expect(ended.status, ended.said).toBe(200)
    expect(await stateOf(run)).toBe('crashed')
  })

  it('6: the person with their key or from inside the office, and not their name with no key where the window covers it', async () => {
    const fromInside = await aRunningRun('worker-one', THEM)
    const ended = await ask('PATCH', `/api/records/${fromInside}`, THEM, { dataPatch: { state: 'crashed', detail: 'the person stopped it' } })
    expect(ended.status, ended.said).toBe(200)

    const withTheirKey = await aRunningRun('worker-one', THEM)
    expect(endedDirectlyBy(withTheirKey, { type: 'human', id: THE_PERSON, from: 'this machine', provedBy: 'the-person-key' })).toBeNull()

    // A CLAIM THE KEY WINDOW COVERS, which `thePersonIsProved` counts: not here (problem T5Dbi_Z55666).
    const aClaim = await aRunningRun('worker-one', THEM)
    const refused = endedDirectlyBy(aClaim, { type: 'human', id: THE_PERSON, from: 'this machine', theKeyWindowCovers: true })
    expect(refused?.status).toBe(403)
    expect(refused?.said).toContain("A claim to be the person counts here only with the person's key, even while the key window is open.")
    expect(await stateOf(aClaim)).toBe('running')
  })

  it("7: the office itself: a system writer, its own writers by their names, or a caller with the office's key", async () => {
    const bySystem = await aRunningRun('worker-one', THEM)
    expect(endedDirectlyBy(bySystem, { type: 'system', id: 'mole-office' })).toBeNull()

    const byItsWriter = await aRunningRun('worker-one', THEM)
    expect(endedDirectlyBy(byItsWriter, { type: 'agent', id: 'mole-office/the-message-worker', from: 'this machine' })).toBeNull()

    // THE OFFICE'S KEY PROVES THE OFFICE, whatever name the request gives.
    const byItsKey = await aRunningRun('worker-one', THEM)
    expect(endedDirectlyBy(byItsKey, { type: 'agent', id: 'an-office-tool', from: 'this machine', provedBy: 'the-office-key' })).toBeNull()
  })

  it('8: the agent it ran as, with its own key', async () => {
    const run = await aRunThatRanAs(ranAsOne)
    expect(endedDirectlyBy(run, { type: 'agent', id: 'ran-as-one', from: 'this machine', provedBy: 'an-agent-key' })).toBeNull()
    expect(await stateOf(run)).toBe('crashed')
  })

  it('9: not another agent on a run that ran as an agent, even with its own key', async () => {
    const run = await aRunThatRanAs(ranAsOne)
    const refused = endedDirectlyBy(run, { type: 'agent', id: 'stranger-one', from: 'this machine', provedBy: 'an-agent-key' })
    expect(refused?.status).toBe(403)
    expect(await stateOf(run), 'the refused end was written').toBe('running')
  })

  it('10: not the person\'s name with no key on a run that ran as an agent, where the window covers it', async () => {
    const run = await aRunThatRanAs(ranAsOne)
    const refused = endedDirectlyBy(run, { type: 'human', id: THE_PERSON, from: 'this machine', theKeyWindowCovers: true })
    expect(refused?.status).toBe(403)
    expect(await stateOf(run), 'the refused end was written').toBe('running')
  })

  it('11: the 403 on a run that ran as an agent names who may, the agent it ran as among them', async () => {
    const run = await aRunThatRanAs(ranAsOne)
    const refused = await ask('PATCH', `/api/records/${run}`, asAgent('stranger-one'), { dataPatch: { state: 'crashed', detail: 'ended by somebody else' } })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(records.WHO_MAY_END_A_RUN)
    expect(refused.said.toLowerCase(), 'the 403 does not name the agent the run ran as').toContain(sayInEnglish('record.section.ranAs').toLowerCase())
    expect(await stateOf(run), 'the refused end was written').toBe('running')
  })
})
