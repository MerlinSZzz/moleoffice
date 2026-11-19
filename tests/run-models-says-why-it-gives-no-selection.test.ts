// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RUN-MODELS SAYS WHY IT GIVES NO SELECTION, AND NAMES THE CASTING ROW WHEN IT HAS ONE.
 *
 * GET /api/office/run-models/for/<agent> answers a run's model, its selection and, when it gives no selection, why.
 * The answer's `noSelection` carries one of the reasons in src/shared/run-models.ts, the Casting row the reason is
 * about when there is one, and one plain sentence. A held row, an ambiguous model name and a refused Codex run say
 * their own reasons in `held`, `ambiguous` and `refused`, and those are not repeated here.
 *
 * Every agent, row, project and model here is made-up data in a throwaway office. No model is called and no
 * provider is read.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'

const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const project = { ...person, 'x-mole-office-workspace': 'sample-project' }

let db: TestDb
let app: FastifyInstance
let says: typeof import('../src/server/lib/run-models.ts').NO_SELECTION_SAYS
let theModelARunGets: typeof import('../src/server/lib/run-models.ts').theModelARunGets

let noNative = 0
let noModel = 0
let anotherProgram = 0
let modelNotTheRows = 0
let noProgram = 0

async function ask(method: 'GET' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = person): Promise<Record<string, any>> {
  const answer = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  expect(answer.statusCode, answer.body).toBeLessThan(300)
  return answer.json() as Record<string, any>
}

async function startAgent(handle: string, role: string, runtime: string): Promise<void> {
  await ask('POST', '/api/agents/started', { handle, name: `Made-up ${handle}`, role, runtime, workArea: ['src'] })
}

async function addCasting(role: string, body: Record<string, unknown>): Promise<number> {
  return (await ask('POST', `/api/casting/${role}`, body))['casting'].id as number
}

async function theAnswer(handle: string, query: string, headers: Record<string, string> = person): Promise<TheModelARunGets> {
  return (await ask('GET', `/api/office/run-models/for/${handle}?${query}`, undefined, headers)) as TheModelARunGets
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const lib = await import('../src/server/lib/run-models.ts')
  says = lib.NO_SELECTION_SAYS
  theModelARunGets = lib.theModelARunGets

  await ask('POST', '/api/workspaces', { id: 'sample-project', title: 'A sample project' })
  noNative = await addCasting('worker', { program: { value: 'claude-code' }, model: { value: 'sample-office-no-native' } })
  noModel = await addCasting('supervisor', { program: { value: 'claude-code' } })
  anotherProgram = await addCasting('inspector', {
    project: 'sample-project',
    program: { value: 'codex' },
    model: { value: 'sample-office-codex' },
    native: { model: 'sample-native-codex', provider: null, variant: null },
  })
  modelNotTheRows = await addCasting('worker', {
    project: 'sample-project',
    program: { value: 'claude-code' },
    model: { value: 'sample-office-project-row' },
    native: { model: 'sample-native-project-row', provider: null, variant: null },
  })
  noProgram = await addCasting('supervisor', {
    project: 'sample-project',
    model: { value: 'sample-office-no-program' },
    native: { model: 'sample-native-no-program', provider: null, variant: null },
  })

  await startAgent('no-native-worker', 'worker', 'claude-code')
  await startAgent('no-model-supervisor', 'supervisor', 'claude-code')
  await startAgent('no-row-inspector', 'inspector', 'claude-code')
  await startAgent('another-program-inspector', 'inspector', 'claude-code')
  await startAgent('other-model-worker', 'worker', 'claude-code')
  await startAgent('no-program-supervisor', 'supervisor', 'claude-code')
  await startAgent('kimi-inspector', 'inspector', 'kimi')
  await ask('POST', '/api/office/run-models/agent/another-program-inspector', { model: 'sample-office-codex' })
  await ask('POST', '/api/office/run-models/agent/other-model-worker', { model: 'sample-office-agent-own' })
  await ask('POST', '/api/office/run-models/agent/no-program-supervisor', { model: 'sample-office-supervisor-own' })
}, 120_000)

afterAll(async () => {
  await app?.close()
  db?.close()
})

describe('run-models says why it gives no selection', () => {
  it('names the row in force when the row has no native selection data', async () => {
    const got = await theAnswer('no-native-worker', 'place=builder&runtime=claude-code')
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({ reason: 'row-has-no-native', castingRow: noNative, says: says.rowHasNoNative(noNative) })
  }, 60_000)

  it('names the row in force when the row names no model', async () => {
    const got = await theAnswer('no-model-supervisor', 'place=builder&runtime=claude-code')
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({ reason: 'row-names-no-model', castingRow: noModel, says: says.rowNamesNoModel(noModel) })
  }, 60_000)

  it('says the Casting table has no row in force for the card, and names no row', async () => {
    const got = await theAnswer('no-row-inspector', 'place=builder&runtime=claude-code')
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({ reason: 'no-row', castingRow: null, says: says.noRow('inspector') })
  }, 60_000)

  it('names the row in force when it is for another program than the run', async () => {
    const got = await theAnswer('another-program-inspector', 'place=builder&runtime=claude-code', project)
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({
      reason: 'row-for-another-program',
      castingRow: anotherProgram,
      says: says.rowForAnotherProgram(anotherProgram, 'codex', 'claude-code'),
    })
  }, 60_000)

  it('names the row in force when it does not name the model the run is given', async () => {
    const got = await theAnswer('other-model-worker', 'place=builder&runtime=claude-code', project)
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({
      reason: 'model-not-the-rows',
      castingRow: modelNotTheRows,
      says: says.modelNotTheRows(modelNotTheRows, 'sample-office-agent-own'),
    })
  }, 60_000)

  it('names the row in force when it names a model and no program', async () => {
    const got = await theAnswer('no-program-supervisor', 'place=builder&runtime=claude-code', project)
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({ reason: 'row-names-no-program', castingRow: noProgram, says: says.rowNamesNoProgram(noProgram) })
  }, 60_000)

  it('says the runtime takes no model when it answers a message, and names no row', async () => {
    const got = await theAnswer('kimi-inspector', 'place=conversation&runtime=kimi')
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({
      reason: 'runtime-takes-no-model',
      castingRow: null,
      says: says.runtimeTakesNoModel('kimi', null),
    })
  }, 60_000)

  it('says no role card names a Casting row when a model comes from the settings file', async () => {
    const got = theModelARunGets({ place: 'builder', agentId: null, runtime: 'claude-code', project: null }, { MOLE_OFFICE_AGENT_MODEL: 'sample-office-env' })
    expect(got.selection).toBeUndefined()
    expect(got.noSelection).toEqual({ reason: 'no-role-card', castingRow: null, says: says.noRoleCard() })
  }, 60_000)
})
