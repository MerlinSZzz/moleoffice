// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * WHAT THE VERDICT DOOR WOULD REFUSE IS REFUSED BEFORE THE CHECK STARTS. Wave 13j, the round after X4FMBW2bGWp-, point 3
 * of the check line's brief: "Every condition known before the model starts is checked before it starts. A refusal says
 * what to fix and spends no model tokens."
 *
 * Five refusals of POST /api/checks/<run> do not depend on what the check finds: the caller is not registered; it holds
 * neither the inspector card nor the place of starter; the run was already released; the run names no agent it serves;
 * its worker is retired and nothing recorded who started it. They are one function, whoAnswersTheCheck in
 * src/server/lib/inspection.ts, and GET /api/checks/<run>/eligibility calls it too. The inspector tool asks that door
 * first and stops on a refusal, before its sandbox, its prompt and its model.
 *
 *   1. Each refusal the eligibility door can reach is given there, with the status and the words of the verdict door,
 *      and nothing is written.
 *   2. The two that may answer a check, the inspector and the starter, are told the run is eligible.
 *   3. A run whose worker is retired with no starter recorded is refused at the verdict door, by the same function.
 *   4. The real tool, handed the eligibility door's real refusal, runs no model and asks the office nothing more.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is a throwaway database behind the real routes. In case 4 the tool is the real
 * one, run --on-the-host against tests/inspector-tool-fixture.ts, a labelled stand-in office whose eligibility door hands
 * back what the real door answered in case 1. Claude is a stand-in on PATH that runs no model and only notes that it ran.
 *
 * MUTATIONS, RUN ON 16 OCTOBER 2026, each after a control run that was green:
 *   - The eligibility door stopped calling whoAnswersTheCheck: cases 1 and 4 went red, on the status.
 *   - In whoAnswersTheCheck the starter no longer counted as one who may answer: cases 1 and 2 went red, on the
 *     starter's 403, and so did the eligibility case of tests/sealed-submission.test.ts that asks as the starter.
 *   - theWorkerAVerdictGoesTo no longer refused a retired worker with no starter: case 3 went red, on the refusal's words.
 * Each was restored with cp and checked with cmp, and the control run again was green.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
const tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

const THE_STARTER = 'early-starter'
const THE_WORKER = 'early-worker'
const THE_INSPECTOR = 'early-inspector'
const A_BYSTANDER = 'early-bystander'
const NOBODY = 'early-nobody-registered-this'
const A_RELEASE = { verdict: 'released', check: 'Synthetic: a release written by a test. No model ran.' }

let t: TestDb
let app: FastifyInstance

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await call('POST', '/api/agents/started', headers, payload)
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A finished run of this worker, in the historical inventory so it needs no seal. */
function aRun(servingAgent: string): string {
  const made = t.api.createRecord({
    kind: 'session', title: 'Synthetic run checked by a test', workspaceId: WORKSPACE, actor: { type: 'agent', id: servingAgent }, origin: 'fixture',
    data: { state: 'running', servingAgent, cutFrom: 'main', tip },
  })
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...made.data, state: 'finished' }), made.id)
  return made.id
}

const messages = (): unknown => t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get()
const eligibility = (run: string, as: Record<string, string>) => call('GET', `/api/checks/${run}/eligibility`, as)
const verdict = (run: string, as: Record<string, string>) => call('POST', `/api/checks/${run}`, as, A_RELEASE)

/** The refusal's words, as the door's reply carries them. */
const said = (body: string): string => (JSON.parse(body) as { error: string }).error

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(PERSON, { handle: THE_STARTER, name: 'Early starter', role: 'secretary', runtime: 'claude-code' })
  await register(asAgent(THE_STARTER), { handle: THE_WORKER, name: 'Early worker', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  await register(asAgent(THE_STARTER), { handle: A_BYSTANDER, name: 'Early bystander', role: 'worker', runtime: 'claude-code', workArea: ['tests'] })
  await register(PERSON, { handle: THE_INSPECTOR, name: 'Early inspector', role: 'inspector', runtime: 'claude-code' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the verdict door’s refusals that are known before a check are given before it starts', () => {
  it('1. refuses at the eligibility door, in the verdict door’s status and words, and writes nothing', async () => {
    const run = aRun(THE_WORKER)
    const cases = [
      { as: asAgent(NOBODY), status: 403, words: `Nothing is registered as "${NOBODY}", so it cannot release or refuse anything.` },
      { as: asAgent(A_BYSTANDER), status: 403, words: `holds neither the inspector card nor the place of starter of ${THE_WORKER}` },
    ]
    for (const one of cases) {
      const before = messages()
      const early = await eligibility(run, one.as)
      expect(early.statusCode, early.body).toBe(one.status)
      expect(said(early.body)).toContain(one.words)
      const late = await verdict(run, one.as)
      expect(late.statusCode, late.body).toBe(one.status)
      expect(said(late.body)).toBe(said(early.body))
      expect(messages()).toEqual(before)
    }

    // ALREADY RELEASED: the starter releases it once, and the next check is refused before it starts.
    const assembled = await call('POST', `/api/checks/${run}/assembled`, asAgent(THE_STARTER), { changes: [] })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const released = await verdict(run, asAgent(THE_STARTER))
    expect(released.statusCode, released.body).toBe(201)
    const before = messages()
    const early = await eligibility(run, asAgent(THE_INSPECTOR))
    expect(early.statusCode, early.body).toBe(409)
    expect(said(early.body)).toContain(`Run ${run} was already released.`)
    const late = await verdict(run, asAgent(THE_INSPECTOR))
    expect(late.statusCode, late.body).toBe(409)
    expect(said(late.body)).toBe(said(early.body))
    expect(messages()).toEqual(before)
  })

  it('2. tells the inspector and the starter that the run is eligible', async () => {
    const run = aRun(THE_WORKER)
    for (const who of [THE_INSPECTOR, THE_STARTER]) {
      const reply = await eligibility(run, asAgent(who))
      expect(reply.statusCode, `${who}: ${reply.body}`).toBe(200)
      expect(reply.json()).toMatchObject({ eligible: true })
    }
  })

  it('3. refuses a verdict on a run whose worker is retired and whose starter nobody recorded', async () => {
    const handle = 'early-retired-worker'
    await register(asAgent(THE_STARTER), { handle, name: 'Early retired worker', role: 'worker', runtime: 'claude-code', workArea: ['docs'] })
    const run = aRun(handle)
    const assembled = await call('POST', `/api/checks/${run}/assembled`, asAgent(THE_INSPECTOR), { changes: [] })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    t.client.sqlite.prepare('UPDATE agents SET retired = 1, started_by_kind = NULL, started_by_id = NULL WHERE handle = ?').run(handle)
    if (columns.some((one) => one.name === 'owner_id')) setFixtureOwner(t.client.sqlite, null, handle, 'handle')
    const before = messages()
    const late = await verdict(run, asAgent(THE_INSPECTOR))
    expect(late.statusCode, late.body).toBe(409)
    expect(said(late.body)).toBeTruthy()
    expect(messages()).toEqual(before)
  })

  it('accepts a retired worker with an owner even when its starter is missing', async () => {
    const handle = 'early-owned-worker'
    await register(asAgent(THE_STARTER), { handle, name: 'Owned worker', role: 'worker', runtime: 'claude-code', workArea: ['docs'] })
    const run = aRun(handle)
    const assembled = await call('POST', `/api/checks/${run}/assembled`, asAgent(THE_INSPECTOR), { changes: [] })
    expect(assembled.statusCode).toBe(201)
    t.client.sqlite.prepare('UPDATE agents SET retired = 1, started_by_kind = NULL, started_by_id = NULL WHERE handle = ?').run(handle)
    const owner = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(THE_STARTER) as { id: string }
    const count = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM message_delivery WHERE recipient_kind = 'agent' AND recipient_id = ?").get(owner.id) as { n: number }).n
    const before = count()
    const reply = await verdict(run, asAgent(THE_INSPECTOR))
    expect(reply.statusCode).toBe(201)
    expect(count()).toBeGreaterThan(before)
  })

  it('explains that a retired worker without an owner has nobody to receive the verdict', async () => {
    const handle = 'early-no-owner'
    await register(asAgent(THE_STARTER), { handle, name: 'Ownerless worker', role: 'worker', runtime: 'claude-code', workArea: ['docs'] })
    const run = aRun(handle)
    const assembled = await call('POST', `/api/checks/${run}/assembled`, asAgent(THE_INSPECTOR), { changes: [] })
    expect(assembled.statusCode).toBe(201)
    t.client.sqlite.prepare('UPDATE agents SET retired = 1, started_by_kind = NULL, started_by_id = NULL WHERE handle = ?').run(handle)
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    if (columns.some((one) => one.name === 'owner_id')) setFixtureOwner(t.client.sqlite, null, handle, 'handle')
    const before = messages()
    const reply = await verdict(run, asAgent(THE_INSPECTOR))
    expect(reply.statusCode).toBe(409)
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    expect(said(reply.body)).toContain(sayInEnglish('checks.retiredWorkerNoOwner'))
    expect(messages()).toEqual(before)
  })

  it('tells a retired worker’s owner, who is not its starter, in the words the confirmation gives an owner', async () => {
    const handle = 'early-worker-owned-apart'
    const ownerHandle = 'early-owner-apart'
    await register(PERSON, { handle: ownerHandle, name: 'Early owner apart', role: 'supervisor', runtime: 'claude-code' })
    await register(asAgent(THE_STARTER), { handle, name: 'Worker owned apart', role: 'worker', runtime: 'claude-code', workArea: ['docs'] })
    const run = aRun(handle)
    const assembled = await call('POST', `/api/checks/${run}/assembled`, asAgent(THE_INSPECTOR), { changes: [] })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const idOf = (who: string): string => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(who) as { id: string }).id
    // THE STARTER STAYS RECORDED, and the owner is another agent, so the verdict's first line has to name the owner.
    setFixtureOwner(t.client.sqlite, idOf(ownerHandle), handle, 'handle')
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE handle = ?').run(handle)
    const reply = await verdict(run, asAgent(THE_INSPECTOR))
    expect(reply.statusCode, reply.body).toBe(201)
    const toTheOwner = (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message'").all() as { data: string }[])
      .map((row) => JSON.parse(row.data) as { body?: string; aboutRun?: string; to?: { kind: string; id: string }[] })
      .filter((one) => one.aboutRun === run && (one.to ?? []).some((who) => who.kind === 'agent' && who.id === idOf(ownerHandle)))
    expect(toTheOwner.length, 'no message about the run reached the owner').toBeGreaterThan(0)
    const { sayInEnglish } = await import('../src/shared/i18n.ts')
    expect(toTheOwner.map((one) => String(one.body).split('\n')[0])).toContain(sayInEnglish('checks.retiredWorkerReachesOwner', { name: 'Worker owned apart' }))
  })

  it('4. the tool, refused at the eligibility door, runs no model and asks the office nothing more', async () => {
    const run = aRun(THE_WORKER)
    const refused = await eligibility(run, asAgent(A_BYSTANDER))
    expect(refused.statusCode, refused.body).toBe(403)

    fixture = await inspectorFixture()
    const f = fixture
    f.state.onRequest = (request, reply) => {
      if (!request.url?.endsWith('/eligibility')) return false
      reply.statusCode = refused.statusCode
      reply.setHeader('content-type', 'application/json')
      reply.end(refused.body)
      return true
    }
    const bin = join(f.home, 'bin')
    const ran = join(f.home, 'the-model-ran')
    mkdirSync(bin)
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\n# A stand-in for claude, written by a test. It runs no model.\ntouch ${JSON.stringify(ran)}\necho '{}'\n`)
    chmodSync(join(bin, 'claude'), 0o755)
    const result = await f.inspect(['--check', aMadeUpCheckSession()], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
    expect(result.code, result.err).toBe(1)
    expect(result.out + result.err).toContain(said(refused.body))
    expect(existsSync(ran)).toBe(false)
    expect(f.state.requests.map((one) => one.path)).toEqual([`/api/checks/${f.run}/eligibility`])
  })
})
