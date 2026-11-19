// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Effort choices are read through the real office doors against a throwaway database. No runtime is started. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'

const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
let db: TestDb
let app: FastifyInstance

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
  const answer = await app.inject({ method, url, headers: person, ...(payload === undefined ? {} : { payload: payload as never }) })
  expect(answer.statusCode, answer.body).toBeLessThan(300)
  return answer.json()
}

async function cast(role: string, model: string, effort: string) {
  const held = (await ask('GET', `/api/casting/for/${role}`)).casting
  const payload = { program: { value: 'claude-code' }, model: { value: model }, effort: { value: effort } }
  await ask(held === null ? 'POST' : 'PATCH', held === null ? `/api/casting/${role}` : `/api/casting/rows/${held.id}`, payload)
}

const reading = async (agent: string, query: string) => await ask('GET', `/api/office/run-models/for/${agent}?${query}`) as TheModelARunGets

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role, runtime] of [['effort-worker', 'worker', 'claude-code'], ['effort-supervisor', 'supervisor', 'claude-code'], ['effort-own', 'worker', 'opencode']]) {
    await ask('POST', '/api/agents/started', { handle, name: 'Synthetic effort fixture', role, runtime, workArea: ['src'] })
  }
  await cast('worker', 'claude-opus-5-5', 'max')
  await cast('inspector', 'claude-opus-5-5', 'max')
}, 90_000)

afterAll(async () => { await app?.close(); db?.close() })

describe('The office answers effort from its explicit choices first', () => {
  it('gives a builder the Casting effort and names its source', async () => {
    const got = await reading('effort-worker', 'place=builder&runtime=claude-code')
    expect(got).toMatchObject({ model: 'claude-opus-5-5', effort: 'max', effortFrom: 'Casting' })
    expect(got.says).toContain('effort max from the Casting row')
    expect(got.says).not.toContain('not passed')
    const page = await ask('GET', '/api/runtime')
    const builder = page.places.find((one: { place: string }) => one.place.includes('worker'))
    expect(builder.variant.name).toBe('max')
    expect(builder.variant.from).toContain('effort max from the Casting row')
  })

  it('gives an agent without a matching row the rule for their model', async () => {
    await ask('POST', '/api/office/run-models/agent/effort-supervisor', { model: 'claude-opus-5-5' })
    const got = await reading('effort-supervisor', 'place=builder&runtime=claude-code')
    expect(got).toMatchObject({ model: 'claude-opus-5-5', effort: 'xhigh', effortFrom: "the owner's rule" })
    expect(got.says).toContain("effort xhigh from the owner's rule")
  })

  it('gives a check the effort of its check card', async () => {
    const got = await reading('effort-worker', 'place=check')
    expect(got).toMatchObject({ effort: 'max', effortFrom: 'Casting' })
  })

  it('gives a check the same Casting effort as its variant', async () => {
    const got = await reading('effort-worker', 'place=check')
    expect(got).toMatchObject({ model: 'claude-opus-5-5', variant: 'max', effort: 'max', effortFrom: 'Casting' })
    const page = await ask('GET', '/api/runtime')
    const check = page.places.find((one: { place: string }) => one.place === 'the check on a finished run')
    expect(check.variant.name).toBe('max')
    expect(check.variant.fromSaid).toEqual([{ code: 'effortWithTheModel', values: {} }])
  })

  it('uses the rule for a caller model that differs from the Casting model and says why', async () => {
    const got = await reading('effort-worker', 'place=builder&runtime=claude-code&model=claude-sonnet-5')
    expect(got).toMatchObject({ model: 'claude-sonnet-5', effort: 'max', effortFrom: "the owner's rule" })
    expect(got.says).toContain('Casting row names a different model, claude-opus-5-5')
    expect(got.says).toContain('does not apply to claude-sonnet-5')
  })

  it('uses the agent’s own effort before Casting or the rule', async () => {
    await ask('POST', '/api/office/run-models/agent/effort-own', { model: 'deepseek/deepseek-v4.1-flash', variant: 'high' })
    const got = await reading('effort-own', 'place=builder&runtime=opencode')
    expect(got).toMatchObject({ effort: 'high', effortFrom: 'the agent' })
    expect(got.says).toContain("effort high from the agent's own record")
  })
})
