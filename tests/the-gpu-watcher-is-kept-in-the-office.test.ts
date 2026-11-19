// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GPU WATCHER IS KEPT IN THE OFFICE (wave 13v round 35b). The agent that may hand in readings of the GPU card, besides
 * the owner, was named only by the .env line in round 35. Nobody edits the live .env, so the watcher is now a setting
 * kept in the office's change log, and the line is an override.
 *
 * WHERE THE RULES LIVE: src/server/lib/gpu-watcher.ts (the reader, the writer and the step at start) and
 * src/server/api/gpu-watcher.ts (who may set it).
 *
 *   1. Who may set it: the owner with or without a reason; a secretary proved by its own key, with a reason only;
 *      nobody else. An agent nobody answers to, or a retired one, is refused. A refusal writes nothing.
 *   2. Which answer counts: the agent set here hands in a reading and another is refused, told which agent may; the
 *      .env line wins over the setting; an agent set here that is retired cannot watch, and then nobody does.
 *   3. The step at start: when neither the line nor the setting names a watcher, and every reading the office accepted
 *      from an agent came from one live agent, that agent is written as the watcher, by the office, with the reason.
 *      Two agents, none, a retired one, a setting already made (to nobody as well) or the .env line: nothing is written.
 *
 * Every handle and reason here is made up.
 *
 * MUTATIONS (each after a green control run, then restored):
 *   a. `whoMaySetTheGpuWatcher` in src/server/api/gpu-watcher.ts lets a secretary set it with no reason: red, case 1.
 *   b. `theGpuWatcherInForce` in src/server/lib/gpu-watcher.ts reads the setting before the .env line: red, case 2.
 *   c. `takeTheGpuWatcherFromItsReadings` counts refused readings as well as accepted ones (no status clause): red,
 *      case 3 (the agent that was refused counts as a second agent).
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

const HOW =
  'The owner or the holder of the secretary card names one on the Settings page or at POST /api/office/gpu-watcher, ' +
  'or MOLE_OFFICE_GPU_WATCHER names one.'

type Lib = typeof import('../src/server/lib/gpu-watcher.ts')

let t: TestDb
let app: FastifyInstance
let lib: Lib
const agents = new Map<string, { id: string; key: string }>()

/** A fresh office with these agents registered by the owner, each with its own key. */
async function anOffice(handles: { handle: string; role: string }[]): Promise<void> {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  lib = await import('../src/server/lib/gpu-watcher.ts')
  agents.clear()
  for (const { handle, role } of handles) {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      // A SECRETARY HOLDS NO WORK AREA; A WORKER HOLDS ONE.
      payload: { handle, name: handle, runtime: 'claude-code', role, ...(role === 'secretary' ? {} : { workArea: [`src/${handle}`] }) },
    })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
    const said = reply.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
    agents.set(handle, { id: said.agent.id, key: String(said.whatToGiveIt?.key) })
  }
}

async function closeTheOffice(): Promise<void> {
  await app?.close()
  t?.close()
}

const idOf = (handle: string): string => agents.get(handle)!.id
const keyOf = (handle: string): string => agents.get(handle)!.key

async function send(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: Record<string, unknown>) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  const said = reply.json() as Record<string, unknown>
  return { status: reply.statusCode, said, error: typeof said['error'] === 'string' ? said['error'] : '' }
}

const read = () => send('GET', '/api/office/gpu-watcher', AS_THE_PERSON)
const setIt = (headers: Record<string, string>, body: Record<string, unknown>) => send('POST', '/api/office/gpu-watcher', headers, body)
const aReading = () => ({ readAt: '2026-10-08 18:00:00', totalMiB: 16303, usedMiB: 900, processes: [] })
const handIn = async (headers: Record<string, string>) => {
  const { status, error } = await send('POST', '/api/resources/gpu/reading', headers, aReading())
  return { status, error }
}

/** Every change row of the setting, oldest first. */
function rows(): { actor_type: string; actor_id: string; workspace_id: string | null; new_value: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT actor_type, actor_id, workspace_id, new_value FROM changes WHERE record_id = 'setting:gpu-watcher' ORDER BY rowid")
    .all() as { actor_type: string; actor_id: string; workspace_id: string | null; new_value: string | null }[]
}

const stored = (watcher: string | null, because: string | null): string => JSON.stringify({ watcher, because })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('1 and 2: the door, and which answer counts', () => {
  beforeAll(async () => {
    vi.stubEnv('MOLE_OFFICE_GPU_WATCHER', '')
    await anOffice([
      { handle: 'a-made-up-secretary', role: 'secretary' },
      { handle: 'card-reader-one', role: 'worker' },
      { handle: 'card-reader-two', role: 'worker' },
      { handle: 'a-leaving-worker', role: 'worker' },
    ])
    vi.unstubAllEnvs()
  }, 300_000)
  afterAll(closeTheOffice)

  it('1: the owner and a secretary with a reason may set it; nobody else, and a refusal writes nothing', async () => {
    const first = await read()
    expect(first.status).toBe(200)
    expect(first.said).toMatchObject({ inForce: { from: 'nobody named' }, stored: null, everSet: false, because: null })
    expect(first.said['says']).toBe(englishWords()['gpuWatcher.inForce.nobody'])

    // ANOTHER AGENT, WITH ITS OWN KEY, IS NEITHER.
    const worker = await setIt(asAgent('card-reader-one', keyOf('card-reader-one')), { agent: 'card-reader-one', because: 'it reads the card' })
    expect(worker.status).toBe(403)
    expect(worker.error).toBe(
      `The GPU watcher is set by the owner or by the holder of the secretary card with a reason, and this request was made by "card-reader-one", which is neither. Nothing was changed. A secretary is proved by its own key. Any agent may read the setting and may file a proposal about it.`,
    )
    // A REQUEST THAT ONLY NAMES THE SECRETARY, WITH NO KEY, IS NOT ONE.
    expect((await setIt(asAgent('a-made-up-secretary'), { agent: 'card-reader-one', because: 'it reads the card' })).status).toBe(403)
    // THE SECRETARY GIVES A REASON.
    const noReason = await setIt(asAgent('a-made-up-secretary', keyOf('a-made-up-secretary')), { agent: 'card-reader-one' })
    expect(noReason).toMatchObject({ status: 400, error: 'A secretary who changes the GPU watcher gives a reason, in "because". Nothing was changed.' })
    expect(rows()).toEqual([])

    const bySecretary = await setIt(asAgent('a-made-up-secretary', keyOf('a-made-up-secretary')), { agent: 'card-reader-one', because: 'it runs the card watcher' })
    expect(bySecretary.status, bySecretary.error).toBe(200)
    expect(bySecretary.said).toMatchObject({ inForce: { from: 'set here', agent: { id: idOf('card-reader-one') } }, stored: idOf('card-reader-one'), everSet: true, because: 'it runs the card watcher' })
    expect(bySecretary.said['says']).toBe('card-reader-one is the GPU watcher, chosen here.')
    expect(rows()).toEqual([{ actor_type: 'agent', actor_id: 'a-made-up-secretary', workspace_id: 'default', new_value: stored(idOf('card-reader-one'), 'it runs the card watcher') }])

    // THE OWNER NEEDS NO REASON, AND MAY NAME THE AGENT BY ITS HANDLE.
    const byTheOwner = await setIt(AS_THE_PERSON, { agent: 'card-reader-two' })
    expect(byTheOwner.status, byTheOwner.error).toBe(200)
    expect(rows().at(-1)).toEqual({ actor_type: 'human', actor_id: THE_PERSON, workspace_id: 'default', new_value: stored(idOf('card-reader-two'), null) })

    // AN AGENT NOBODY ANSWERS TO, AND A RETIRED ONE, ARE REFUSED, AND NOTHING IS WRITTEN.
    const before = rows().length
    expect(await setIt(AS_THE_PERSON, { agent: 'nobody-by-this-name' })).toMatchObject({
      status: 400,
      error: 'No agent here answers to "nobody-by-this-name", so it cannot be the GPU watcher. GET /api/office/gpu-watcher lists the agents that may. Nothing was changed.',
    })
    const retired = await send('POST', `/api/participants/agent/${idOf('a-leaving-worker')}/retire`, AS_THE_PERSON, { because: 'a made-up agent that is no longer needed here' })
    expect(retired.status, retired.error).toBe(200)
    expect(await setIt(AS_THE_PERSON, { agent: idOf('a-leaving-worker') })).toMatchObject({
      status: 400,
      error: 'a-leaving-worker is retired, so it cannot be the GPU watcher. GET /api/office/gpu-watcher lists the agents that may. Nothing was changed.',
    })
    expect(rows().length).toBe(before)
    const now = await read()
    expect((now.said['mayBeNamed'] as { handle: string }[]).map((one) => one.handle)).not.toContain('a-leaving-worker')
  })

  it('2: the agent set here hands in a reading, the .env line wins over it, and an agent set here that is retired cannot watch', async () => {
    expect((await setIt(AS_THE_PERSON, { agent: 'card-reader-one', because: 'the card watcher runs as this agent' })).status).toBe(200)
    expect(await handIn(asAgent('card-reader-one'))).toEqual({ status: 200, error: '' })
    expect(await handIn(asAgent('card-reader-two'))).toEqual({
      status: 403,
      error: "Only the GPU watcher (the agent card-reader-one, named in this office's settings) or the owner hands in a reading of the card. Nothing was written.",
    })

    // THE .ENV LINE WINS, and the setting is not changed by it.
    vi.stubEnv('MOLE_OFFICE_GPU_WATCHER', 'card-reader-two')
    expect(await handIn(asAgent('card-reader-two'))).toEqual({ status: 200, error: '' })
    expect(await handIn(asAgent('card-reader-one'))).toEqual({
      status: 403,
      error: 'Only the GPU watcher (the agent card-reader-two, which MOLE_OFFICE_GPU_WATCHER names) or the owner hands in a reading of the card. Nothing was written.',
    })
    const overridden = await read()
    expect(overridden.said).toMatchObject({ inForce: { from: 'the .env line', handle: 'card-reader-two' }, stored: idOf('card-reader-one') })
    expect(overridden.said['says']).toBe('card-reader-two is the GPU watcher. The .env line names it, and that line comes before the choice here.')
    vi.unstubAllEnvs()

    // AN AGENT SET HERE THAT IS RETIRED CANNOT WATCH, and the refusal says how to name another.
    const retired = await send('POST', `/api/participants/agent/${idOf('card-reader-one')}/retire`, AS_THE_PERSON, { because: 'a made-up agent that is no longer needed here' })
    expect(retired.status, retired.error).toBe(200)
    expect(await handIn(asAgent('card-reader-two'))).toEqual({
      status: 403,
      error: `Only the owner hands in a reading of the card: the GPU watcher named in this office's settings, card-reader-one, is retired. ${HOW} Nothing was written.`,
    })
    const cannot = await read()
    expect(cannot.said).toMatchObject({ inForce: { from: 'set here, cannot watch', stored: idOf('card-reader-one'), cannotBecause: 'retired' } })
    expect(cannot.said['says']).toBe('The GPU watcher chosen here, card-reader-one, is retired, so no agent may hand in readings of the card.')
    expect(await handIn(AS_THE_PERSON)).toEqual({ status: 200, error: '' })
  })
})

describe('3: the step at start takes the watcher from the readings the office accepted', () => {
  afterEach(closeTheOffice)

  /** Hand in readings while the .env line names the agent, as an office before this setting did. */
  async function readingsUnderTheLine(handle: string, n: number): Promise<void> {
    vi.stubEnv('MOLE_OFFICE_GPU_WATCHER', handle)
    for (let i = 0; i < n; i += 1) expect(await handIn(asAgent(handle))).toEqual({ status: 200, error: '' })
    vi.unstubAllEnvs()
  }

  /** The first and last accepted reading, as the request log holds them. */
  function firstAndLast(): { first: string; last: string } {
    const row = t.client.sqlite
      .prepare("SELECT min(at_ms) AS first, max(at_ms) AS last FROM api_calls WHERE operation = 'booking.reading' AND status = 200 AND actor_type = 'agent'")
      .get() as { first: number; last: number }
    return { first: localStamp(new Date(row.first)), last: localStamp(new Date(row.last)) }
  }

  it('writes the one agent as the watcher, by the office, with the reason, once', async () => {
    await anOffice([{ handle: 'card-reader-one', role: 'worker' }, { handle: 'card-reader-two', role: 'worker' }])
    await readingsUnderTheLine('card-reader-one', 2)
    // A REFUSED READING FROM ANOTHER AGENT, AND THE OWNER'S, ARE NOT COUNTED.
    vi.stubEnv('MOLE_OFFICE_GPU_WATCHER', 'card-reader-one')
    expect((await handIn(asAgent('card-reader-two'))).status).toBe(403)
    vi.unstubAllEnvs()
    expect((await handIn(AS_THE_PERSON)).status).toBe(200)
    // NO LINE AND NO SETTING: NOBODY WATCHES UNTIL THE STEP RUNS.
    expect((await handIn(asAgent('card-reader-one'))).status).toBe(403)

    const { first, last } = firstAndLast()
    const because =
      `Set by the office when it started: this office had accepted 2 readings of the GPU card from this agent, the first at ${first} ` +
      `and the last at ${last}, and none from any other agent.`
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe(`The GPU watcher is now card-reader-one. ${because}`)
    expect(rows()).toEqual([{ actor_type: 'system', actor_id: theOfficesOwnId(t), workspace_id: null, new_value: stored(idOf('card-reader-one'), because) }])
    expect((await read()).said).toMatchObject({ inForce: { from: 'set here', agent: { handle: 'card-reader-one' } }, everSet: true, because })
    expect(await handIn(asAgent('card-reader-one'))).toEqual({ status: 200, error: '' })

    // THE NEXT START LEAVES IT ALONE.
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe('The GPU watcher is set in this office already. It was not changed.')
    expect(rows().length).toBe(1)
  })

  it('writes nothing when two agents handed readings in', async () => {
    await anOffice([{ handle: 'card-reader-one', role: 'worker' }, { handle: 'card-reader-two', role: 'worker' }])
    await readingsUnderTheLine('card-reader-one', 1)
    await readingsUnderTheLine('card-reader-two', 1)
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe(
      `This office accepted readings of the GPU card from 2 agents (card-reader-one, card-reader-two), so it did not choose between them. No GPU watcher was set. ${HOW}`,
    )
    expect(rows()).toEqual([])
  })

  it('writes nothing in a new office with no readings, and says how to name a watcher', async () => {
    await anOffice([{ handle: 'card-reader-one', role: 'worker' }])
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe(`This office has accepted no reading of the GPU card from an agent. No GPU watcher was set. ${HOW}`)
    expect(rows()).toEqual([])
    expect(await handIn(asAgent('card-reader-one'))).toEqual({
      status: 403,
      error: `Only the owner hands in a reading of the card: no agent is the GPU watcher in this office. ${HOW} Nothing was written.`,
    })
  })

  it('writes nothing when the .env line names a watcher, when nobody was chosen on purpose, or when the one agent is retired', async () => {
    await anOffice([{ handle: 'card-reader-one', role: 'worker' }])
    await readingsUnderTheLine('card-reader-one', 1)

    vi.stubEnv('MOLE_OFFICE_GPU_WATCHER', 'card-reader-one')
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe('The GPU watcher is the agent card-reader-one, which MOLE_OFFICE_GPU_WATCHER names. The setting was not changed.')
    vi.unstubAllEnvs()
    expect(rows()).toEqual([])

    const retired = await send('POST', `/api/participants/agent/${idOf('card-reader-one')}/retire`, AS_THE_PERSON, { because: 'a made-up agent that is no longer needed here' })
    expect(retired.status, retired.error).toBe(200)
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe(
      `The one agent this office accepted readings of the GPU card from, card-reader-one, is retired. No GPU watcher was set. ${HOW}`,
    )
    expect(rows()).toEqual([])

    expect((await setIt(AS_THE_PERSON, { agent: null })).status).toBe(200)
    expect(lib.takeTheGpuWatcherFromItsReadings()).toBe('The GPU watcher is set in this office already. It was not changed.')
    expect(rows()).toEqual([{ actor_type: 'human', actor_id: THE_PERSON, workspace_id: 'default', new_value: stored(null, null) }])
  })
})
