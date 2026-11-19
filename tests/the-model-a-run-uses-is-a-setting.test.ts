// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODEL A RUN USES IS A SETTING, AND EVERY RUN READS IT. Criterion U2 of design/settings/ACCEPTANCE.md.
 *
 * What this file proves, one layer and one reader at a time:
 *
 *   1. The store round-trips a choice and clears it (POST and GET /api/office/run-models).
 *   2. A malformed choice is refused with a 400 and nothing is written.
 *   3. An agent is refused with a 403 on both write doors, and nothing is written.
 *   4. The layers are applied in order: the agent's own model, then its role card's Casting row, then .env.
 *   5. A choice for another runtime than the run's is not applied, and `says` names why.
 *   6. `theQueue` carries the model the office chose, and the claude-code adapter passes it as --model.
 *   7. The check carries the Casting table's model for the inspector to the inspector's --model.
 *
 * A builder's model and the check's are kept in the Casting table since migration 0189, by a
 * decision. So this file sets them through POST /api/casting/:role.
 *   8. Both readings name the runtimes the worker gives a model and a reasoning effort to, as the adapters
 *      themselves answer, and a model and an effort are taken for a runtime exactly there.
 *   9. The Runtime page names the model a place's runs go to and where it came from.
 *  10. With nothing named anywhere there is no model, because by item FLO-05 of a decision the office ships no default
 *      model. The answer says where a model is named.
 *
 * Every test runs against a throwaway database through the real routes. No model is called.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readRunModels, type AnAgentsRunModel, type RunModelsReading, type TheModelARunGets } from '../src/shared/run-models.ts'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { NO_MODEL_SAYS, theModelIn } from '../src/config/agent-model.mjs'
import { mergedEnvironment } from '../src/config/settings.mjs'
import { THE_RUNTIMES_THE_OFFICE_DISPATCHES, adapterFor } from '../src/worker/runtimes/index.ts'
import { InspectionAdapter } from '../src/worker/runtimes/inspection.ts'
import { theRuntimesTheAdaptersGive } from './the-runtimes-the-adapters-give.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
const tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

let t: TestDb
let app: FastifyInstance

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function setOffice(change: unknown): Promise<RunModelsReading> {
  const reply = await call('POST', '/api/office/run-models', PERSON, change)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as RunModelsReading
}

async function setAgent(agent: string, model: string | null, variant: string | null = null): Promise<AnAgentsRunModel> {
  const reply = await call('POST', `/api/office/run-models/agent/${agent}`, PERSON, { model, variant })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as AnAgentsRunModel
}

/**
 * Set the model and program of one role's marked every-project casting, or empty both with null. The role's first
 * casting is added, and carries the mark; after that the marked one is changed.
 */
async function cast(role: string, program: string | null, model: string | null): Promise<void> {
  const marked = ((await call('GET', `/api/casting/for/${role}`, PERSON)).json() as { casting: { id: number } | null }).casting
  const reply =
    marked === null
      ? await call('POST', `/api/casting/${role}`, PERSON, { program: { value: program }, model: { value: model } })
      : await call('PATCH', `/api/casting/rows/${String(marked.id)}`, PERSON, { program: { value: program }, model: { value: model } })
  expect(reply.statusCode, reply.body).toBe(marked === null ? 201 : 200)
}

async function forAgent(agent: string, query: string): Promise<TheModelARunGets> {
  const reply = await call('GET', `/api/office/run-models/for/${agent}?${query}`, PERSON)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

function storedRow(): unknown {
  return t.client.sqlite.prepare('SELECT settings FROM run_models WHERE only_row = 1').get()
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await call('POST', '/api/agents/started', headers, payload)
  expect(reply.statusCode, reply.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(payload['handle']) as { id: string }
  return row.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'model-worker', name: 'Model worker', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'opencode-worker', name: 'Opencode worker', role: 'worker', runtime: 'opencode', workArea: ['src'] })
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the store', () => {
  it('holds nothing until somebody sets something, and says so', async () => {
    const reply = await call('GET', '/api/office/run-models', PERSON)
    expect(reply.statusCode, reply.body).toBe(200)
    const read = reply.json() as RunModelsReading
    expect(read.places.map((one) => one.slot.name)).toEqual(['conversation'])
    expect('builders' in read).toBe(false)
    for (const one of read.places) expect(one.set).toBeNull()
    expect(read.updatedAt).toBeNull()
    expect(read.notices).toBe('A notice starts no run, so there is no model to choose for it.')
  })

  it('round-trips a choice, trimmed, and clears it again', async () => {
    const set = await setOffice({ places: { conversation: { runtime: 'claude-code', model: '  claude-opus-5-5 ' } } })
    const conversation = set.places.find((one) => one.slot.name === 'conversation')
    expect(conversation?.set).toEqual({ runtime: 'claude-code', model: 'claude-opus-5-5' })
    expect(conversation?.inForce.model).toBe('claude-opus-5-5')
    expect(conversation?.inForce.from).toBe('the place')
    expect(set.updatedBy).toEqual({ kind: 'human', id: THE_PERSON })

    const reread = (await call('GET', '/api/office/run-models', PERSON)).json() as RunModelsReading
    expect(reread.places.find((one) => one.slot.name === 'conversation')?.set).toEqual({ runtime: 'claude-code', model: 'claude-opus-5-5' })

    const cleared = await setOffice({ places: { conversation: null } })
    expect(cleared.places.find((one) => one.slot.name === 'conversation')?.set).toBeNull()
    expect(readRunModels(JSON.parse((storedRow() as { settings: string }).settings), theRuntimesTheAdaptersGive())).toEqual({ places: {} })
  })
})

describe('a malformed choice', () => {
  it('is refused with a 400 naming why, and nothing is written', async () => {
    const before = JSON.stringify(storedRow())
    for (const [change, says] of [
      [{ places: { conversation: { runtime: 'codex', model: 'x', variant: 'max' } } }, 'passes codex no reasoning effort'],
      [{ places: { conversation: { runtime: 'claude-code', model: 'x', variant: 'max' } } }, 'no reasoning effort'],
      [{ places: { conversation: { model: 'x' } } }, 'names no runtime'],
      [{ places: { conversation: { runtime: 'claude-code', model: '   ' } } }, 'names no model'],
      // A BUILDER'S MODEL AND THE CHECK'S ARE NOT KEPT HERE ANY MORE: both slots are refused.
      [{ builders: { worker: { runtime: 'claude-code', model: 'x' } } }, 'builders'],
      [{ places: { check: { model: 'x' } } }, 'check'],
    ] as const) {
      const reply = await call('POST', '/api/office/run-models', PERSON, change)
      expect(reply.statusCode, reply.body).toBe(400)
      expect(reply.body).toContain(says)
      expect(JSON.stringify(storedRow()), `${JSON.stringify(change)} wrote something`).toBe(before)
    }
  })

  it('in the store is refused loudly when it is read, never read as nothing', () => {
    const gives = theRuntimesTheAdaptersGive()
    expect(readRunModels(undefined, gives)).toBeUndefined()
    expect(() => readRunModels({ places: { notices: { model: 'x' } } }, gives)).toThrow('not one of conversation')
    expect(() => readRunModels({ places: { conversation: { runtime: 'claude-code', model: '' } } }, gives)).toThrow('names no model')
    // A ROW WRITTEN BEFORE MIGRATION 0189 still holds the slots it copied into the Casting table; they are not read.
    expect(readRunModels({ builders: { worker: { runtime: 'claude-code', model: 'x' } }, places: { check: { model: 'y' } } }, gives)).toEqual({ places: {} })
    expect(() => readRunModels({ colours: {} }, gives)).toThrow('which is not places')
    expect(() => readRunModels([], gives)).toThrow('not an object')
  })
})

describe('an agent', () => {
  it('is refused with a 403 on both write doors, in words, and nothing is written', async () => {
    const before = JSON.stringify(storedRow())
    const office = await call('POST', '/api/office/run-models', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { places: { conversation: { runtime: 'claude-code', model: 'x' } } })
    expect(office.statusCode, office.body).toBe(403)
    expect(office.body).toContain("Which model a run gets is the owner's own setting")
    expect(JSON.stringify(storedRow())).toBe(before)

    const own = await call('POST', '/api/office/run-models/agent/model-worker', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { model: 'x' })
    expect(own.statusCode, own.body).toBe(403)
    expect(own.body).toContain("Which model a run gets is the owner's own setting")
    const read = (await call('GET', '/api/office/run-models/agent/model-worker', PERSON)).json() as AnAgentsRunModel
    expect(read.model).toBeNull()
  })
})

describe('the layers, first match wins', () => {
  it('takes the agent’s own model, then its role card’s Casting row, then .env', async () => {
    await cast('worker', 'claude-code', 'the-role-model')
    const own = await setAgent('model-worker', 'the-agents-own-model')
    expect(own.model).toBe('the-agents-own-model')
    expect(own.runtime).toBe('claude-code')

    const a = await forAgent('model-worker', 'place=builder&runtime=claude-code')
    expect(a).toMatchObject({ model: 'the-agents-own-model', from: 'the agent', runtime: 'claude-code' })

    await setAgent('model-worker', null)
    const b = await forAgent('model-worker', 'place=builder&runtime=claude-code')
    expect(b).toMatchObject({ model: 'the-role-model', from: 'the role' })
    expect(b.says).toContain('The Casting table names the-role-model for worker.')

    await cast('worker', null, null)
    const c = await forAgent('model-worker', 'place=builder&runtime=claude-code')
    // THIS CHECKOUT'S .env MAY NAME A MODEL OR NOT, and the office ships none, so the expected answer
    // is read from the same layer.
    const fromTheFile = theModelIn(mergedEnvironment())
    expect(c).toMatchObject({ model: fromTheFile, from: fromTheFile === null ? 'none' : 'the settings file' })
    expect(c.says).toContain('the office runtime controls decide')
  })

  it('names no model when nothing names one, and says where one is named, for each place', async () => {
    // AN EMPTY WORLD, handed in, so this checkout's .env cannot answer for it.
    const { theModelARunGets } = await import('../src/server/lib/run-models.ts')
    const worker = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get('model-worker') as { id: string }
    const builder = theModelARunGets({ place: 'builder', agentId: worker.id, runtime: 'claude-code' }, {})
    expect(builder).toMatchObject({ model: null, from: 'none' })
    expect(builder.says).toContain(NO_MODEL_SAYS.builder)
    const check = theModelARunGets({ place: 'check', agentId: worker.id, runtime: null }, {})
    expect(check).toMatchObject({ model: null, from: 'none' })
    expect(check.says).toContain(NO_MODEL_SAYS.check)
    const conversation = theModelARunGets({ place: 'conversation', agentId: worker.id, runtime: 'claude-code' }, {})
    expect(conversation).toMatchObject({ model: null, from: 'none' })
    expect(conversation.says).toContain(NO_MODEL_SAYS.conversation)
    // AND A MODEL NAMED IN THAT WORLD IS TAKEN, so the empty answer above is about the empty world.
    expect(theModelARunGets({ place: 'builder', agentId: worker.id, runtime: 'claude-code' }, { MOLE_OFFICE_AGENT_MODEL: 'named-here' }).model).toBe('named-here')
  })

  it('does not apply a choice made for another runtime, and says why', async () => {
    await cast('worker', 'opencode', 'openrouter/z-ai/glm-5.3-flash')
    const answered = await forAgent('model-worker', 'place=builder&runtime=claude-code')
    expect(answered.model).not.toBe('openrouter/z-ai/glm-5.3-flash')
    // The settings file's model, or none when it names none: the office ships no default model.
    expect(['the settings file', 'none']).toContain(answered.from)
    expect(answered.says).toContain('on opencode, and this run is on claude-code, so it is not used')

    await setAgent('opencode-worker', 'deepseek/deepseek-4.1-flash', 'high')
    const own = await forAgent('opencode-worker', 'place=builder&runtime=claude-code')
    expect(own.from).not.toBe('the agent')
    expect(own.says).toContain("This agent's own model, deepseek/deepseek-4.1-flash, is for opencode, and this run is on claude-code, so it is not used.")
    await cast('worker', null, null)
    await setAgent('opencode-worker', null)
  })

  it('refuses a reasoning effort for an agent whose runtime is given none', async () => {
    const reply = await call('POST', '/api/office/run-models/agent/model-worker', PERSON, { model: 'x', variant: 'max' })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain('passes claude-code no reasoning effort')
  })
})

describe('every run reads it', () => {
  it('theQueue carries the model the office chose, and the claude-code adapter passes it as --model', async () => {
    await setOffice({ places: { conversation: { runtime: 'claude-code', model: 'the-conversation-model' } } })
    const filed = await call('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      kind: 'message',
      title: 'A message whose run takes the office’s model',
      data: { body: 'Answer this.', to: [{ kind: 'agent', id: 'model-worker' }] },
    })
    // NOTHING HOLDS THE WORKER IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
    // message is stored all the same, and its delivery to the worker is still on the queue.
    expect(filed.statusCode, filed.body).toBe(409)
    const messageId = (filed.json() as { record: { id: string } }).record.id
    const { theQueue } = await import('../src/server/lib/worker.ts')
    const row = theQueue(WORKSPACE).find((one) => one.messageId === messageId)
    expect(row, 'the message is on the queue').toBeDefined()
    expect(row).toMatchObject({ runtime: 'claude-code', model: 'the-conversation-model', variant: null })

    const adapter = adapterFor('claude-code', {}, { model: row!.model, variant: row!.variant })
    const line = adapter!.commandFor({ session: 's', agent: 'model-worker', prompt: 'p', cwd: '/tmp', api: 'http://x', workspace: WORKSPACE, outputPath: '/tmp/o' })
    expect(line.args.slice(line.args.indexOf('--model'), line.args.indexOf('--model') + 2)).toEqual(['--model', 'the-conversation-model'])
    expect(adapter!.modelItWouldUse?.()).toBe('the-conversation-model')

    // AND WITHOUT A CHOICE, THE ROW CARRIES NONE and the adapter reads its own environment.
    await setOffice({ places: { conversation: null } })
    const bare = theQueue(WORKSPACE).find((one) => one.messageId === messageId)
    expect(bare?.model).toBeNull()
    expect(adapterFor('claude-code', { MOLE_OFFICE_AGENT_MODEL: 'the-workers-own' }, { model: null, variant: null })!.modelItWouldUse?.()).toBe('the-workers-own')
    // AND WITH NOTHING IN ITS OWN ENVIRONMENT EITHER, THE ADAPTER HAS NO MODEL, and the worker refuses the run.
    expect(adapterFor('claude-code', {}, { model: null, variant: null })!.modelItWouldUse?.()).toBeNull()
  })

  it('the check carries the Casting table’s model for the inspector to the inspector’s --model', async () => {
    await register(PERSON, { handle: 'the-inspector', name: 'The inspector', role: 'inspector', runtime: 'claude-code' })
    await cast('inspector', 'claude-code', 'the-check-model')
    const run = await call('POST', '/api/records', asAgent('model-worker'), {
      kind: 'session',
      title: 'A run the office checks',
      data: { state: 'running', servingAgent: 'model-worker', cutFrom: 'main', tip, doing: 'building' },
    })
    expect(run.statusCode, run.body).toBe(201)
    const runId = (run.json() as { record: { id: string } }).record.id
    t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(runId)
    const finished = await call('PATCH', `/api/records/${runId}`, asAgent('model-worker'), { dataPatch: { state: 'finished', doing: 'done' } })
    expect(finished.statusCode, finished.body).toBe(200)
    const message = (finished.json() as { theCheck?: { message?: string } }).theCheck?.message
    expect(message, finished.body).toBeTruthy()

    const { theQueue } = await import('../src/server/lib/worker.ts')
    // THE INSPECTOR'S OWN ROW: the same message is also delivered to the starter, who is told of it.
    const row = theQueue(WORKSPACE).find((one) => one.messageId === message && one.handle === 'the-inspector')
    expect(row?.inspection?.run).toBe(runId)
    expect(row?.inspection?.model).toBe('the-check-model')

    const adapter = new InspectionAdapter(row!.inspection!, {})
    const line = adapter.commandFor({ session: 's', agent: 'the-inspector', prompt: 'p', cwd: '/tmp', api: 'http://x', workspace: WORKSPACE, outputPath: '/tmp/o' })
    expect(line.args.slice(line.args.indexOf('--model'), line.args.indexOf('--model') + 2)).toEqual(['--model', 'the-check-model'])
    await cast('inspector', null, null)
  })

  it('both readings name the runtimes the worker gives a model and an effort to, as the adapters themselves answer', async () => {
    const theAdapters = theRuntimesTheAdaptersGive()
    const office = await call('GET', '/api/office/run-models', PERSON)
    expect(office.statusCode, office.body).toBe(200)
    expect((office.json() as RunModelsReading).theWorkerGives).toEqual(theAdapters)
    const agent = await call('GET', '/api/office/run-models/agent/model-worker', PERSON)
    expect(agent.statusCode, agent.body).toBe(200)
    expect((agent.json() as AnAgentsRunModel).theWorkerGives).toEqual(theAdapters)
  })

  it('takes a model and an effort for a runtime exactly where its adapter would pass them', async () => {
    const theAdapters = theRuntimesTheAdaptersGive()
    for (const runtime of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
      const givesAModel = theAdapters.aModelTo.includes(runtime)
      const givesAnEffort = theAdapters.aVariantTo.includes(runtime)
      const model = await call('POST', '/api/office/run-models', PERSON, { places: { conversation: { runtime, model: 'a-made-up-model' } } })
      expect(model.statusCode, `a model for ${runtime}: ${model.body}`).toBe(givesAModel ? 200 : 400)
      const effort = await call('POST', '/api/office/run-models', PERSON, { places: { conversation: { runtime, model: 'a-made-up-model', variant: 'a-made-up-effort' } } })
      expect(effort.statusCode, `an effort for ${runtime}: ${effort.body}`).toBe(givesAModel && givesAnEffort ? 200 : 400)

      const handle = `${runtime}-effort-worker`
      await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: handle, role: 'worker', runtime, workArea: ['src'] })
      const own = await call('POST', `/api/office/run-models/agent/${handle}`, PERSON, { model: 'a-made-up-model', variant: 'a-made-up-effort' })
      expect(own.statusCode, `an agent's own effort on ${runtime}: ${own.body}`).toBe(givesAnEffort ? 200 : 400)
      await setAgent(handle, null)
    }
    await setOffice({ places: { conversation: null } })
  })

  it('the Runtime page names the model a place’s runs go to, and where it came from', async () => {
    await setOffice({ places: { conversation: { runtime: 'opencode', model: 'openrouter/z-ai/glm-5.3-flash', variant: 'max' } } })
    const reply = await call('GET', '/api/runtime', PERSON)
    expect(reply.statusCode, reply.body).toBe(200)
    const page = reply.json() as RuntimeRecord
    const place = page.places.find((one) => one.place === 'the office answering a message by itself')
    expect(place?.runtime.name).toBe('opencode')
    expect(place?.model.name).toBe('openrouter/z-ai/glm-5.3-flash')
    expect(place?.model.from).toBe('The Settings page names openrouter/z-ai/glm-5.3-flash for a run the office starts to answer a message. The owner has set no effort for openrouter/z-ai/glm-5.3-flash.')
    expect(place?.variant.name).toBe('max')
    await setOffice({ places: { conversation: null } })
  })
})
