// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT OF A HARNESS THE OFFICE HAS NO ADAPTER FOR CHOOSES ITS MODEL IN THAT HARNESS.
 *
 * The office starts no run of such a harness, so it keeps no model for one. The model doors say so in those words,
 * and the two pages that show models list the agent with short words saying where its model is chosen.
 *
 * WHAT IS PROVED HERE, through the doors the pages and a caller read, against a test office in this process:
 *
 *   1. Setting such an agent's own model is refused with the sentence that the harness chooses its model itself, and
 *      not with the sentence for a record that names no runtime. Nothing is written.
 *   2. Reading the agent's model gives its harness's word and no model, with the sentence the reading makes for it.
 *   3. The answer for a run that answers a message gives the same sentence and no reason for the missing selection, so
 *      nothing in it says the office answers its messages or passes it a model. The builder's answer gives no reason
 *      either.
 *   4. The Casting reading and the runtime reading each list the agent by its handle, with its harness's word.
 *   5. An agent of a known runtime is not on either list.
 *
 * WHAT IS NOT PROVED HERE: the pages as drawn. The launchers' model door and the Casting credential serve only runs the
 * office starts, so they are not asked about such a harness.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { inEnglish, saying } from '../src/shared/dev-sayings.ts'
import { whyAnAgentsModelIsRefused } from '../src/shared/run-models.ts'

const WORKBUDDY = 'workbuddy'
const HANDLE = 'a-workbuddy-with-a-model'
const KNOWN = 'a-codex-with-a-model'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, runtime] of [
    [HANDLE, WORKBUDDY],
    [KNOWN, 'codex'],
  ]) {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'agent', title: `Agent ${handle}`, data: { handle, state: 'active', runtime } },
    })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("an agent's own model, for a harness the office has no adapter for", () => {
  it('is refused with the sentence that the harness chooses its model itself, and nothing is written', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/office/run-models/agent/${HANDLE}`,
      headers: AS_THE_PERSON,
      payload: { model: 'a-model-name' },
    })

    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(400)
    const error = (reply.json() as { error: string }).error
    // READ FROM THE ONE PLACE THE REFUSAL IS MADE, which the door asks with the same words.
    const { THE_WORKER_GIVES } = await import('../src/server/lib/run-models.ts')
    expect(error).toContain(String(whyAnAgentsModelIsRefused(null, 'a-model-name', null, THE_WORKER_GIVES, WORKBUDDY)))
    expect(error).toContain('chooses its model itself')
    expect(error).not.toContain('names no runtime')
    // NOTHING WAS WRITTEN: the agent's record still names no model.
    const read = (await app.inject({ method: 'GET', url: `/api/office/run-models/agent/${HANDLE}`, headers: AS_THE_PERSON })).json() as { model: string | null }
    expect(read.model).toBeNull()
  })

  it('reads as its harness, with no model, and the sentence saying the harness chooses it', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/agent/${HANDLE}`, headers: AS_THE_PERSON })

    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const said = reply.json() as {
      runtime: string | null
      model: string | null
      builder: { runtime: string | null; model: string | null; from: string; says: string }
    }
    expect(said.runtime).toBe(WORKBUDDY)
    expect(said.model).toBeNull()
    expect(said.builder.runtime).toBe(WORKBUDDY)
    expect(said.builder.model).toBeNull()
    expect(said.builder.from).toBe('none')
    // READ FROM THE ONE PLACE THE SENTENCE IS MADE.
    expect(said.builder.says).toBe(inEnglish(saying('modelChosenInTheHarness', { runtime: WORKBUDDY })))
  })

  it('answers a run that answers a message with the same sentence, and no reason that says the office answers it', async () => {
    const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/agent/${HANDLE}`, headers: AS_THE_PERSON })

    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    type Answer = { runtime: string | null; model: string | null; from: string; says: string; said?: unknown; noSelection?: unknown }
    const said = reply.json() as { builder: Answer; conversation: Answer }
    const chosenThere = saying('modelChosenInTheHarness', { runtime: WORKBUDDY })
    expect(said.conversation.runtime).toBe(WORKBUDDY)
    expect(said.conversation.model).toBeNull()
    expect(said.conversation.from).toBe('none')
    // READ FROM THE ONE PLACE THE SENTENCE IS MADE, as words and as codes.
    expect(said.conversation.says).toBe(inEnglish(chosenThere))
    expect(said.conversation.said).toEqual([chosenThere])
    // NO REASON FOR THE MISSING SELECTION, at either place: the model's part already says why.
    expect(said.conversation).not.toHaveProperty('noSelection')
    expect(said.builder).not.toHaveProperty('noSelection')
    // NOTHING SAYS THE OFFICE ANSWERS ITS MESSAGES. The sentence it said before is read from the one place it is made.
    const { NO_SELECTION_SAYS } = await import('../src/server/lib/run-models.ts')
    const answered = JSON.stringify(said.conversation)
    expect(answered).not.toContain(NO_SELECTION_SAYS.runtimeTakesNoModel(WORKBUDDY, null))
    expect(answered).not.toContain('when it answers a message')
  })
})

describe('the pages that show models', () => {
  it('the Casting reading lists the agent by its handle and harness, and not an agent of a known runtime', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/casting', headers: AS_THE_PERSON })

    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const harnesses = (reply.json() as { harnesses: { handle: string; harness: string }[] }).harnesses
    expect(harnesses).toContainEqual({ handle: HANDLE, harness: WORKBUDDY })
    expect(harnesses.map((one) => one.handle)).not.toContain(KNOWN)
  })

  it('the runtime reading lists the agent by its handle and harness, and not an agent of a known runtime', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/runtime' })

    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const harnesses = (reply.json() as { harnesses: { handle: string; harness: string }[] }).harnesses
    expect(harnesses).toContainEqual({ handle: HANDLE, harness: WORKBUDDY })
    expect(harnesses.map((one) => one.handle)).not.toContain(KNOWN)
  })
})
