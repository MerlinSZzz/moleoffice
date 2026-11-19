// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNTIME PAGE SAYS WHICH RUNS GO WHERE, AND WHERE EACH ANSWER CAME FROM. Criterion T7.
 *
 * Until this existed the page drew ONE model line for the whole office, read straight from
 * `MOLE_OFFICE_AGENT_MODEL`. An office whose own runs go to opencode would then be told "opus",
 * which breaks the principle above USER.md's invariants: truth before convenience. Every entry here
 * carries the runtime, the model and the reasoning effort, and where each of the three answers came
 * from.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. The office's own runs show the chore model and the chore variant, not the builder's model. The
 *    mutation this is for reads `MOLE_OFFICE_AGENT_MODEL` for that place: the name becomes the
 *    builder's and this file goes red.
 * 2. A builder's model is still `MOLE_OFFICE_AGENT_MODEL`, and a check's model is still its own
 *    setting, because a check does not take a runtime or a model from the chores pair.
 * 3. The tool list answers for every runtime word the registry allows, including the one the office
 *    does not dispatch, which comes back with a sentence rather than being called missing.
 * 4. The program the page says each runtime runs is the program the adapter behind that word runs.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { inspectionSettings } from '../src/config/inspection.mjs'
import { THE_PROGRAM_FOR_RUNTIME } from '../src/config/runtimes.mjs'
import { everyAdapter } from '../src/worker/runtimes/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

const TOUCHED = [
  'MOLE_OFFICE_CHORE_RUNTIME',
  'MOLE_OFFICE_CHORE_MODEL',
  'MOLE_OFFICE_CHORE_VARIANT',
  'MOLE_OFFICE_AGENT_MODEL',
]

afterEach(() => {
  for (const name of TOUCHED) delete process.env[name]
})

async function page(): Promise<RuntimeRecord> {
  const reply = await app.inject({ method: 'GET', url: '/api/runtime' })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as RuntimeRecord
}

describe('which runs go where', () => {
  it('shows the office its own pair, apart from what a builder gets', async () => {
    process.env['MOLE_OFFICE_CHORE_RUNTIME'] = 'opencode'
    process.env['MOLE_OFFICE_CHORE_MODEL'] = 'openrouter/z-ai/glm-5.3-flash'
    process.env['MOLE_OFFICE_CHORE_VARIANT'] = 'max'
    process.env['MOLE_OFFICE_AGENT_MODEL'] = 'builder-opus'
    const read = await page()

    const chore = one(
      read.places.filter((one) => one.place.includes('answering a message')),
      'the place for the office answering a message',
    )
    expect(chore.runtime.name).toBe('opencode')
    expect(chore.model.name).toBe('openrouter/z-ai/glm-5.3-flash')
    expect(chore.variant.name).toBe('max')
    // THE SOURCE, not only the value, so a person can tell what they set from what nobody set.
    expect(chore.model.from).toContain('MOLE_OFFICE_CHORE_MODEL says so')

    // ONE BUILDER ROW PER ROLE CARD since criterion U2, because the Settings page keeps a default for
    // each. With nothing set there, every one of them falls back to MOLE_OFFICE_AGENT_MODEL.
    const builders = read.places.filter((one) => one.place.includes('builder'))
    expect(builders.map((one) => one.place)).toEqual([
      'a builder with the secretary card',
      'a builder with the supervisor card',
      'a builder with the worker card',
    ])
    for (const builder of builders) expect(builder.model.name).toBe('builder-opus')

    const check = one(
      read.places.filter((one) => one.place.includes('check')),
      'the place for the check on a finished run',
    )
    expect(check.runtime.name).toBe('claude-code')
    expect(check.model.name).toBe(inspectionSettings().model)
    // A CHECK DOES NOT TAKE THE CHORE VARIANT, because its tool passes none.
    expect(check.variant.name).toBeNull()
  })

  it('says where each of the three answers came from when nobody set the chores pair', async () => {
    delete process.env['MOLE_OFFICE_CHORE_RUNTIME']
    delete process.env['MOLE_OFFICE_CHORE_MODEL']
    delete process.env['MOLE_OFFICE_CHORE_VARIANT']
    const read = await page()
    const chore = one(
      read.places.filter((one) => one.place.includes('answering a message')),
      'the place for the office answering a message',
    )
    // NOT A BARE NULL. Each answer has the server's own sentence beside it.
    for (const answer of [chore.runtime, chore.model, chore.variant]) {
      expect(answer.from.length).toBeGreaterThan(20)
    }
  })
})

describe('the agent tools on this machine', () => {
  it('answers for every runtime word the registry allows, including the one it does not dispatch', async () => {
    const read = await page()
    const words = read.installed.map((one) => one.runtime)
    expect(words.sort()).toEqual([...AGENT_RUNTIMES].sort())
    const dsh = one(
      read.installed.filter((one) => one.runtime === 'dsh'),
      'the dsh entry',
    )
    // NOT CALLED MISSING. It is not dispatched from here, and the sentence says so.
    expect(dsh.where).toBeNull()
    expect(String(dsh.says)).toContain('does not start')
  })

  it('names the program each adapter really runs, so the map and the adapters cannot drift', () => {
    const programs = THE_PROGRAM_FOR_RUNTIME as Record<string, string>
    for (const adapter of everyAdapter({})) {
      expect(programs[adapter.runtime], `${adapter.runtime} has no program in the map`).toBe(adapter.command)
    }
  })
})
