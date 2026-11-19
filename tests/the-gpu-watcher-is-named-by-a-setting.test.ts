// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GPU WATCHER IS NAMED BY A SETTING (wave 13v round 35). The agent whose watcher reads the host GPU card, and the
 * one agent besides the person who may hand in a reading or record a cut-in step, is the agent MOLE_OFFICE_GPU_WATCHER
 * names. Its handle was written in the code, and an office's agents are its own, so it is read from the setting.
 *
 *   1. Named: that agent hands in a reading; another agent is refused, told which agent may and which setting says so.
 *   2. Not named: no agent hands in a reading, the refusal says the setting names nobody, and the person still may.
 *   3. Empty is the same as not set.
 *   4. A cut-in step follows the same rule: the named agent gets past the rule to the booking it names, and nobody
 *      else does.
 *
 * Since round 35b the .env line is an override of a setting kept in the office, and this file is about the line. With no
 * line and nothing set in the office, nobody is the watcher, and the refusal says how one is named.
 * tests/the-gpu-watcher-is-kept-in-the-office.test.ts is about the setting kept in the office.
 *
 * Every handle here is made up.
 *
 * MUTATIONS (each restored after):
 *   - isTheGpuWatcher in src/server/lib/gpu-watcher.ts never finds a watcher (answers false): red, cases 1 and 4;
 *   - theGpuWatcherHandle in src/server/lib/env.ts answers an empty setting as a handle: red, case 3;
 *   - the refusal in an office that names nobody leaves out how a watcher is named: red, cases 2, 3 and 4.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const THE_WATCHER = 'card-watcher'
const ANOTHER = 'some-worker'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance
const before = process.env.MOLE_OFFICE_GPU_WATCHER

async function post(url: string, headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ status: number; error: string }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload })
  const said = reply.json() as { error?: unknown }
  return { status: reply.statusCode, error: typeof said.error === 'string' ? said.error : '' }
}

const aReading = (): Record<string, unknown> => ({ readAt: '2026-10-08 18:00:00', totalMiB: 16303, usedMiB: 900, processes: [] })
const handIn = (by: Record<string, string>) => post('/api/resources/gpu/reading', by, aReading())
const recordAStep = (by: Record<string, string>) => post('/api/bookings/no-such-booking/cut-in/step', by, { sandbox: 'a-sandbox', did: 'down' })

const NAMED_REFUSAL = (does: string): string =>
  `Only the GPU watcher (the agent ${THE_WATCHER}, which MOLE_OFFICE_GPU_WATCHER names) or the owner ${does}. Nothing was written.`
// WHEN NOBODY IS THE WATCHER, THE REFUSAL SAYS HOW TO NAME ONE (round 35b): on the Settings page, at the door, or by
// the .env line.
const UNNAMED_REFUSAL = (does: string): string =>
  `Only the owner ${does}: no agent is the GPU watcher in this office. The owner or the holder of the secretary card ` +
  'names one on the Settings page or at POST /api/office/gpu-watcher, or MOLE_OFFICE_GPU_WATCHER names one. Nothing was written.'

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of [THE_WATCHER, ANOTHER]) {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle, name: handle, runtime: 'claude-code', role: 'worker', workArea: [`src/${handle}`] },
    })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
  }
}, 300_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (before === undefined) delete process.env.MOLE_OFFICE_GPU_WATCHER
  else process.env.MOLE_OFFICE_GPU_WATCHER = before
})

describe('the GPU watcher is the agent MOLE_OFFICE_GPU_WATCHER names', () => {
  it('lets the named agent hand in a reading and refuses another, saying who may and which setting says so', async () => {
    process.env.MOLE_OFFICE_GPU_WATCHER = THE_WATCHER
    expect(await handIn(asAgent(THE_WATCHER))).toEqual({ status: 200, error: '' })
    expect(await handIn(asAgent(ANOTHER))).toEqual({ status: 403, error: NAMED_REFUSAL('hands in a reading of the card') })
  })

  it('lets no agent hand in a reading when it names nobody, says so, and the person still may', async () => {
    delete process.env.MOLE_OFFICE_GPU_WATCHER
    expect(await handIn(asAgent(THE_WATCHER))).toEqual({ status: 403, error: UNNAMED_REFUSAL('hands in a reading of the card') })
    expect(await handIn(AS_THE_PERSON)).toEqual({ status: 200, error: '' })
  })

  it('reads an empty setting as one that names nobody', async () => {
    process.env.MOLE_OFFICE_GPU_WATCHER = ''
    expect(await handIn(asAgent(THE_WATCHER))).toEqual({ status: 403, error: UNNAMED_REFUSAL('hands in a reading of the card') })
  })

  it('holds a cut-in step to the same rule', async () => {
    process.env.MOLE_OFFICE_GPU_WATCHER = THE_WATCHER
    // THE CONTROL: the named agent gets past the rule, to the booking this request names, which does not exist.
    const named = await recordAStep(asAgent(THE_WATCHER))
    expect(named.status, named.error).toBe(404)
    expect(await recordAStep(asAgent(ANOTHER))).toEqual({ status: 403, error: NAMED_REFUSAL('records a cut-in step') })
    delete process.env.MOLE_OFFICE_GPU_WATCHER
    expect(await recordAStep(asAgent(THE_WATCHER))).toEqual({ status: 403, error: UNNAMED_REFUSAL('records a cut-in step') })
  })
})
