// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const names = ['MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', 'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT'] as const
const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
let t: TestDb
let app: FastifyInstance
let before: (string | undefined)[]
beforeEach(async () => {
  before = names.map((name) => process.env[name])
  names.forEach((name) => { delete process.env[name] })
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterEach(async () => {
  await app?.close()
  t?.close()
  names.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i] })
})
const url = '/api/office/dead-letter-thresholds'
async function post(payload: object, headers = owner) { return app.inject({ method: 'POST', url, payload: { because: 'Made-up test reason', ...payload }, headers }) }

describe('the dead-letter thresholds are chosen without a file edit', () => {
  it('starts at one day and more than twenty letters, with the same positive-integer bounds', async () => {
    const config = await import('../src/config/settings.mjs')
    expect(config.readSetting(names[0], {}).value).toBe('1')
    expect(config.readSetting(names[1], {}).value).toBe('20')
    const initial = (await app.inject({ method: 'GET', url, headers: owner })).json()
    expect(initial.days.value).toBe(1)
    expect(initial.count.value).toBe(20)
    expect(initial.restartRequired).toBe(false)
    for (const bad of [0, -1, 1.5, '2', null]) {
      const payload = bad === null ? { days: 1 } : { days: bad, count: 20 }
      const refused = await post(payload)
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json().code).toBe('deadLetterThresholdsBadValue')
    }
    expect((await post({ days: 1, count: 20, unexpected: true })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url })).json().days.chosen).toBeNull()
    // The existing reader has no upper bound. The door must not add Zod's safe-integer ceiling.
    const large = await post({ days: Number.MAX_SAFE_INTEGER + 1, count: 20 })
    expect(large.statusCode, large.body).toBe(200)
    expect(large.json().days.value).toBe(Number.MAX_SAFE_INTEGER + 1)
  })

  it('stores the choice atomically, reads it on each sweep, and records who changed it', async () => {
    process.env[names[0]] = '7'
    process.env[names[1]] = '10'
    const saved = await post({ days: 2, count: 30 })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json().days).toEqual({ value: 2, chosen: 2, source: 'the office database' })
    expect(saved.json().count).toEqual({ value: 30, chosen: 30, source: 'the office database' })
    const env = await import('../src/server/lib/env.ts')
    expect(env.deadLetterAfterDays()).toBe(2)
    expect(env.deadLetterAfterCount()).toBe(30)
    expect(saved.json().lastChange.by).toMatchObject({ type: 'human', id: THE_PERSON })
    expect(JSON.parse(saved.json().lastChange.to)).toEqual({ days: 2, count: 30, effective: { days: 2, count: 30 }, because: 'Made-up test reason', decision: null })
    expect(JSON.parse(saved.json().lastChange.from).effective).toEqual({ days: 7, count: 10 })
    expect((await post({ days: 3, count: -1 })).statusCode).toBe(400)
    expect(env.deadLetterAfterDays()).toBe(2)
    expect((await post({ days: 3, count: 31 })).statusCode).toBe(200)
    expect(env.deadLetterAfterDays()).toBe(3)
    expect(env.deadLetterAfterCount()).toBe(31)
    // The stored choice is present in the file, independent of this process's reader.
    const { default: Database } = await import('better-sqlite3')
    const reopened = new Database(t.file, { readonly: true })
    try { expect(reopened.prepare('SELECT dead_letter_after_days AS days, dead_letter_after_count AS count FROM installation').get()).toEqual({ days: 3, count: 31 }) }
    finally { reopened.close() }
    const removed = await post({ days: null, count: null })
    expect(removed.statusCode, removed.body).toBe(200)
    expect(removed.json().days).toEqual({ value: 7, chosen: null, source: 'the environment' })
    expect(removed.json().count).toEqual({ value: 10, chosen: null, source: 'the environment' })
    expect(env.deadLetterAfterDays()).toBe(7)
    expect(JSON.parse(removed.json().lastChange.from).effective).toEqual({ days: 3, count: 31 })
    expect(JSON.parse(removed.json().lastChange.to).effective).toEqual({ days: 7, count: 10 })
    // A caller's explicit environment remains an isolated reading.
    const config = await import('../src/config/settings.mjs')
    expect(config.readSettingHere(names[0], { [names[0]]: '9' }, '/no-such-test-env').value).toBe('9')
  })

  it('sends the summary at one day or above twenty letters, and a saved threshold changes the next sweep', async () => {
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner, payload: { handle: 'test-grey', name: 'Test Grey', role: 'worker' } })
    expect(registered.statusCode, registered.body).toBe(201)
    const id = registered.json().agent.id
    async function letter() {
      const filed = await app.inject({ method: 'POST', url: '/api/records', headers: owner,
        payload: { kind: 'message', title: 'Made-up dead letter', data: { body: 'Made-up test letter', to: [{ kind: 'agent', id }] } } })
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(filed.statusCode, filed.body).toBe(409)
      return filed.json().record.id as string
    }
    async function sweep() {
      const reply = await app.inject({ method: 'POST', url: '/api/dead-letters/sweep', headers: owner, payload: {} })
      expect(reply.statusCode, reply.body).toBe(200)
      return reply.json()
    }
    for (let n = 0; n < 20; n++) await letter()
    expect((await sweep()).addressees).toEqual([])
    await letter()
    expect((await sweep()).addressees).toEqual([id])
    // The next addressee has fewer letters. Lowering the stored count alone starts its summary.
    const second = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner,
      payload: { handle: 'test-grey-two', name: 'Test Grey Two', role: 'worker' } })
    const secondId = second.json().agent.id
    for (let n = 0; n < 2; n++) {
      const filed = await app.inject({ method: 'POST', url: '/api/records', headers: owner,
        payload: { kind: 'message', title: 'Made-up second letter', data: { body: 'Made-up test letter', to: [{ kind: 'agent', id: secondId }] } } })
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(filed.statusCode, filed.body).toBe(409)
    }
    expect((await sweep()).addressees).toEqual([])
    expect((await post({ days: 1, count: 1 })).statusCode).toBe(200)
    expect((await sweep()).addressees).toEqual([secondId])
    expect((await post({ days: null, count: null })).statusCode).toBe(200)
    const third = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner,
      payload: { handle: 'test-grey-three', name: 'Test Grey Three', role: 'worker' } })
    const thirdId = third.json().agent.id
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: owner,
      payload: { kind: 'message', title: 'Made-up old letter', data: { body: 'Made-up test letter', to: [{ kind: 'agent', id: thirdId }] } } })
    const { localStamp } = await import('../src/shared/time.ts')
    const old = localStamp(new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000))
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(old, filed.json().record.id)
    t.client.sqlite.prepare('UPDATE message_delivery SET at = ? WHERE message_id = ?').run(old, filed.json().record.id)
    expect((await sweep()).addressees).toEqual([thirdId])
  })

  it('refuses an agent before any write, with a code and no audit row', async () => {
    const refused = await post({ days: 2, count: 30 }, { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-worker' })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.json().code).toBe('deadLetterThresholdsNotAllowed')
    const current = (await app.inject({ method: 'GET', url })).json()
    expect(current.days.chosen).toBeNull()
    expect(current.lastChange).toBeNull()
  })
  it('requires a reason and accepts only a live decision reference, without inventing one', async () => {
    for (const because of ['', '   ', 'x'.repeat(501)]) expect((await post({ days: 2, count: 30, because })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url })).json()).toMatchObject({ ownerDecided: true, decision: null, because: null })
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: owner,
      payload: { kind: 'decision', title: 'Made-up threshold decision', data: { replaces: [] } } })
    expect(filed.statusCode, filed.body).toBe(201)
    const decision = filed.json().record.id
    expect((await post({ days: 2, count: 30, decision: 'not-a-decision' })).json().code).toBe('deadLetterThresholdsBadDecision')
    const chosen = await post({ days: 2, count: 30, decision, because: 'Made-up chosen values' })
    expect(chosen.statusCode, chosen.body).toBe(200)
    expect(chosen.json().decision).toEqual({ id: decision, title: 'Made-up threshold decision', live: true })
    expect(chosen.json().because).toBe('Made-up chosen values')
    const after = JSON.parse(chosen.json().lastChange.to)
    expect(after).toMatchObject({ days: 2, count: 30, decision, because: 'Made-up chosen values' })
    t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run('2026-10-01 00:00:00', decision)
    expect((await post({ days: 3, count: 31, decision })).json().code).toBe('deadLetterThresholdsBadDecision')
    expect((await app.inject({ method: 'GET', url })).json().days.value).toBe(2)
  })

  it('requires a secretary key and words for the exact values; a raise alone, which the card asks the person about first, and reused words are refused', async () => {
    const { agentByHandle } = await import('../src/server/lib/participants.ts')
    const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
    const { deadLetterThresholdWarrantFor } = await import('../src/shared/dead-letter-thresholds.ts')
    async function register(handle: string, role: string) {
      const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: owner,
        payload: { handle, name: 'Made-up ' + handle, role } })
      expect(registered.statusCode, registered.body).toBe(201)
      return { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle,
        'x-mole-office-key': makeAnAgentKey(agentByHandle(handle)!.id, null) }
    }
    const secretary = await register('threshold-secretary', 'secretary')
    const worker = await register('threshold-worker', 'worker')
    const choice = { days: 2, count: 30, decision: null }
    const warrant = { saidBy: THE_PERSON, words: 'Made-up request: set the age to 2 days and the count to 30 letters.',
      where: 'terminal', when: '2026-09-26 10:00', for: [deadLetterThresholdWarrantFor(choice, choice)] }
    expect((await post(choice, secretary)).json().code).toBe('deadLetterThresholdsNotAllowed')
    const { thePersonsKeyHeader } = await import('./helpers.ts')
    const raised = await app.inject({ method: 'POST', url: '/api/roles/elevation/threshold-secretary',
      headers: { ...owner, ...thePersonsKeyHeader() }, payload: { reason: 'Made-up authorization test' } })
    expect(raised.statusCode, raised.body).toBe(201)
    // The raise alone is asked of the list of what the grant carries, and the secretary card asks the person first.
    const raiseAlone = await post(choice, secretary)
    expect(raiseAlone.statusCode, raiseAlone.body).toBe(403)
    expect(raiseAlone.json().error).toContain('The secretary card says to ask the person before pressing office.set-dead-letter-thresholds for them')
    expect((await post({ ...choice, warrant }, worker)).json().code).toBe('deadLetterThresholdsNotAllowed')
    expect((await post({ ...choice, days: 3, warrant }, secretary)).json().code).toBe('deadLetterThresholdsBadWarrant')
    const saved = await post({ ...choice, warrant }, secretary)
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json().lastChange.by).toMatchObject({ type: 'agent', id: 'threshold-secretary' })
    const rows = t.client.sqlite.prepare("SELECT warrant FROM changes WHERE record_id = 'setting:dead-letter-thresholds'").all() as { warrant: string }[]
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]!.warrant)).toEqual(warrant)
    const lines = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message'").all() as { data: string }[]
    expect(lines.filter((row) => JSON.parse(row.data).body === 'A secretary changed a setting for you')).toHaveLength(1)
  })

})
