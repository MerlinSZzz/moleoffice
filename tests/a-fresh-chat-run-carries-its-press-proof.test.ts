// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** M78: the real message worker starts a fresh tool in this test office on a free port. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, apiApp, freshDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

it('mints a fresh chat run on the stored press and leaves resumed runs on the office proof', async () => {
  const t = await freshDb()
  const app = (await apiApp()).app
  const watching: Parameters<typeof onePass>[1] = []
  const home = dirname(t.file)
  const keys = JSON.parse(readFileSync(join(home, 'keys.json'), 'utf8'))
  const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': keys.person }
  const office = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': keys.office }
  const post = (url: string, payload: unknown, headers = person) => app.inject({ method: 'POST', url, payload: payload as never, headers })
  try {
    await app.listen({ host: '127.0.0.1', port: 0 })
    const api = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
    const made = await post('/api/records', { kind: 'agent', title: 'Synthetic fresh chat', data: {
      handle: 'synthetic-fresh-chat', state: 'active', runtime: 'claude-code',
    } })
    expect(made.statusCode, made.body).toBe(201)
    const { agentForRecord } = await import('../src/server/lib/participants.ts')
    const old = agentForRecord(made.json().record.id)!
    const said = await post('/api/records', { kind: 'message', title: 'Synthetic chat request', data: {
      body: 'Synthetic request: please hang.', to: [{ kind: 'agent', id: old.id }],
    } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(said.statusCode, said.body).toBe(409)
    const press = await post(`/api/agents/${old.id}/start-a-new-agent`, {})
    expect(press.statusCode, press.body).toBe(200)
    const message = press.json().moved[0] as string
    const agent = agentForRecord(press.json().agent)!
    // A later edit with another proof must not replace the proof of the revision that wrote the press. Its writer's
    // own change of the words, sent with no key while the key window is open, writes a revision with no proof.
    // Only its writer may change a message, so the office may no longer edit it.
    const { 'x-mole-office-key': _theirKey, ...keyless } = person
    const later = await app.inject({ method: 'PATCH', url: `/api/records/${message}`, headers: keyless,
      payload: { dataPatch: { body: 'Synthetic request, edited: please hang.' } } })
    expect(later.statusCode, later.body).toBe(200)
    const settings: WorkerSettings = { api, workspace: 'default', session: null, stopWithPid: null,
      checkout: aCheckoutForATestRun(), runs: 1, hops: 3, outputRoot: join(home, 'runs'),
      env: { ...withoutInheritedEffort(), HOME: home, MOLE_OFFICE_FAKE_RUNTIME: fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url)) },
    }
    const pass = await onePass(settings, watching)
    expect(pass.started.map((run) => run.messageId), JSON.stringify(pass)).toContain(message)
    const run = pass.started.find((run) => run.messageId === message)!
    const stored = (await app.inject({ method: 'GET', url: `/api/records/${run.session}`, headers: person })).json().record
    const proof = (key: string) => t.client.sqlite.prepare('SELECT mint_proved_by FROM held_keys WHERE id = ?').get(key)
    expect(stored.data.providerSession).toBeUndefined()
    expect(proof(stored.data.extra.runKeyId)).toEqual({ mint_proved_by: 'the-persons-press' })
    const resumed = await post('/api/records', { kind: 'session', title: 'Synthetic resumed conversation', data: {
      state: 'running', runtime: 'fake', servingAgent: agent.handle, servingAgentId: agent.id,
      startedByMoleOffice: true, deliveringMessage: message, providerSession: 'synthetic-existing-conversation',
    } }, office)
    expect(resumed.statusCode, resumed.body).toBe(201)
    const kept = (await app.inject({ method: 'GET', url: `/api/records/${resumed.json().record.id}`, headers: person })).json().record
    expect(proof(kept.data.extra.runKeyId)).toEqual({ mint_proved_by: 'the-offices-key' })
  } finally {
    for (const run of watching) run.adapter.stop(run.handle, 'The test has finished.')
    const until = Date.now() + 5000
    while (watching.some((run) => run.adapter.alive(run.handle)) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(watching.every((run) => !run.adapter.alive(run.handle))).toBe(true)
    await app.close()
    t.close()
  }
}, 30000)
