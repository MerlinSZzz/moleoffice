// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Requests, keys and callers belong only to a made-up test office. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
let t: TestDb, app: FastifyInstance, office: Record<string, string>, person: Record<string, string>
beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8'))
  person = {'x-mole-office-workspace': 'default', 'x-mole-office-key': keys.person}
  office = {...person, 'x-mole-office-key': keys.office, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker'}
}, 60_000)
afterAll(async () => { await app.close(); t.close() })
function send(id: string, payload: unknown, headers = office) { return app.inject({method: 'POST', url: `/api/office/gates/${id}/met`, headers, payload: payload as never}) }
function counts() { return t.client.sqlite.prepare('SELECT * FROM gate_counts ORDER BY gate,day').all() }
it('takes an office-key count and answers with the resulting local day and today tally', async () => {
  const reply = await send('whole-suite-fix-round', {position: '0'})
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json()).toMatchObject({gate: 'whole-suite-fix-round', day: localStamp(new Date()).slice(0, 10), position: '0', today: {wouldStop: 1, stopped: 0, reminded: 0, ignored: 0, heeded: 0}})
  expect((await send('whole-suite-fix-round', {position: '1'})).json().today.wouldStop).toBe(2)
})
it('refuses the person, a secretary and an agent, and refuses wrong ids, ownership and bodies without changing counts', async () => {
  const {makeAnAgentKey} = await import('../src/server/lib/keys.ts')
  const {agentByHandle} = await import('../src/server/lib/participants.ts')
  const callers = [person]
  for (const role of ['secretary', 'worker']) {
    const handle = `made-up-counter-${role}`
    const made = await app.inject({method: 'POST', url: '/api/agents/started', headers: person, payload: {handle, name: `Made-up ${role}`, role}})
    expect(made.statusCode, made.body).toBe(201)
    const agent = agentByHandle(handle)!
    callers.push({...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.id, 'x-mole-office-key': makeAnAgentKey(agent.id, null)})
  }
  const before = counts()
  for (const caller of callers) {
    const reply = await send('whole-suite-fix-round', {position: '0'}, caller)
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.json().code).toBe('gateCountNotAllowed')
    expect(reply.json().error).toMatch(/Nothing was counted\.$/)
    expect(counts()).toEqual(before)
  }
  for (const [id, payload, status, code] of [
    ['made-up-gate', {position: '0'}, 404, 'gateCountUnknown'],
    ['house-rule-reds', {position: 'block'}, 409, 'gateCountAlreadyInServer'],
    ['whole-suite-fix-round', {position: 'block'}, 400, 'gateCountBadPosition'],
    ['whole-suite-fix-round', {position: 1}, 400, 'gateCountBadPosition'],
    ['whole-suite-fix-round', {position: '1', extra: true}, 400, 'gateCountBadPosition'],
  ] as const) {
    const reply = await send(id, payload)
    expect(reply.statusCode, reply.body).toBe(status)
    expect(reply.json().code).toBe(code)
    expect(reply.json().error).toMatch(/Nothing was counted\.$/)
    expect(counts()).toEqual(before)
  }
})

// OLD: only the office key may send a count. NEW: a live run's own key may count a gate the release tool counts, when
// the run's agent holds the card that may authorize a stable release. Every other key and gate is refused as before.
// WHY: the release tool decides the spacing between stable releases and holds only its run key (round E, way 1).
// Mutation: accept any run key for the release tool's gate, and the worker's run key is counted.
it('takes a release count only from a live run key whose agent holds the authorizing card, and refuses every other key and gate', async () => {
  const {makeAnAgentKey} = await import('../src/server/lib/keys.ts')
  const participants = await import('../src/server/lib/participants.ts')
  async function aRunOf(role: 'secretary' | 'worker') {
    const handle = `made-up-release-${role}`
    const agent = t.api.createRecord({workspaceId: 'default', kind: 'agent', title: `Made-up ${role}`,
      data: {handle, role, runtime: 'codex', state: 'active', startedBy: {kind: 'person', id: THE_TEST_OFFICES_OWNER.id}}, actor: t.api.HUMAN})
    const id = participants.agentForRecord(agent.id)!.id
    const minted = await app.inject({method: 'POST', url: '/api/records', headers: office,
      payload: {kind: 'session', title: 'Made-up release run', data: {state: 'running', runtime: 'codex', servingAgent: handle, servingAgentId: id, startedByMoleOffice: true}}})
    expect(minted.statusCode, minted.body).toBe(201)
    const {record, runKey} = minted.json()
    const asAgent = {...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id}
    return {run: record.id as string, runKey: {...asAgent, 'x-mole-office-key': runKey.key, 'x-mole-office-session': record.id},
      ownKey: {...asAgent, 'x-mole-office-key': makeAnAgentKey(id, null)}}
  }
  const secretary = await aRunOf('secretary'), worker = await aRunOf('worker')
  const refusedWithoutCounting = async (id: string, payload: unknown, caller: Record<string, string>, status = 403, code = 'gateCountNotAllowed') => {
    const before = counts()
    const reply = await send(id, payload, caller)
    expect(reply.statusCode, `${id}: ${reply.body}`).toBe(status)
    expect(reply.json().code).toBe(code)
    expect(reply.json().error).toMatch(/Nothing was counted\.$/)
    expect(counts()).toEqual(before)
  }
  await refusedWithoutCounting('release-spacing', {position: '180'}, worker.runKey)
  await refusedWithoutCounting('release-spacing', {position: '180'}, secretary.ownKey)
  await refusedWithoutCounting('release-spacing', {position: '180'}, person)
  await refusedWithoutCounting('whole-suite-fix-round', {position: '0'}, secretary.runKey)
  await refusedWithoutCounting('house-rule-reds', {position: 'block'}, secretary.runKey)
  await refusedWithoutCounting('made-up-gate', {position: '0'}, secretary.runKey)
  await refusedWithoutCounting('release-spacing', {position: '1441'}, secretary.runKey, 400, 'gateCountBadPosition')
  const taken = await send('release-spacing', {position: '180'}, secretary.runKey)
  expect(taken.statusCode, taken.body).toBe(200)
  expect(taken.json()).toMatchObject({gate: 'release-spacing', position: '180', today: {wouldStop: 1, stopped: 0, reminded: 0, ignored: 0, heeded: 0}})
  expect((await send('release-spacing', {position: '240'})).json().today.wouldStop).toBe(2)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(secretary.run)
  await refusedWithoutCounting('release-spacing', {position: '180'}, secretary.runKey)
})
