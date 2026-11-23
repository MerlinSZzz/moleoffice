// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START WHOSE AGENT HAS NO WORK AREA IS TOLD SO.
 *
 * The requirement of 8 November 2026: a worker with no work area that would submit git work has its finish refused
 * with "its agent is registered with no work area" (src/server/lib/sealed-tip.ts, whatARunWithNoSubmissionMustDeclare),
 * and nothing told anybody at its start. So both start doors now carry the three sentences of its own export in
 * src/shared/a-start-with-no-work-area.ts, and the run still starts: this is a reminder, not a refusal.
 *
 * WHAT IS PROVED, against a test office of its own and a made-up sandbox.
 *   1. The worker door's answer (POST /api/agents/<handle>/worker-run, src/server/lib/worker-runs.ts) carries the
 *      sentence for a worker with no work area, and the ask is still kept as wanted.
 *   2. The round start's answer (POST /api/agents/<agent>/next-round, src/server/lib/next-round.ts) carries it for an
 *      agent with no work area, and the ask is still kept as wanted.
 *   3. A worker and a supervisor that do have a work area hear nothing from either door.
 *
 * This file does not prove the refused finish of such a run, or the crashed write after it. Two other tests do:
 * tests/a-run-with-no-submission-is-told-what-to-declare.test.ts proves the refusal's words, and
 * tests/sandbox-launcher.test.ts proves that a refused finish whose process ended is written crashed with the reason.
 *
 * Mutations, each alone: drop the sentence from the worker door (case 1 red); drop it from the round start (case 2 red);
 * give it to an agent that has a work area (case 3 red).
 *
 * Every key, row, folder and model here is made up.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { NO_WORK_AREA_FIRST, NO_WORK_AREA_HOW, NO_WORK_AREA_REMINDER, theReminderAStartWithNoWorkAreaCarries } from '../src/shared/a-start-with-no-work-area.ts'
import { SESSION_STATES } from '../src/shared/types.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_MODEL = 'claude-made-up-no-area-0'
const [RUNNING] = SESSION_STATES
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

let t: TestDb
let app: FastifyInstance
let scratch = ''
let sandbox: { folder: string; brief: string; container: string }
const agents = new Map<string, { id: string; key: string }>()

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

/** Register an agent through the starter door, by the person or by a starter's key. */
async function started(handle: string, by: Record<string, string> = AS_THE_PERSON, role?: string, workArea?: string[]): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/agents/started', by, {
    handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }), ...(workArea === undefined ? {} : { workArea }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = (r.body['agent'] as { id: string }).id
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id, key })
  return { id, key }
}
const idOf = (handle: string): string => agents.get(handle)!.id
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named. */
function aContainerRow(folder: string, name = folder.split('/').at(-1)!): string {
  const id = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-12 10:00:00', 'agent:fixture')")
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

/** A run filed over the API by the starter's own key, so the office mints the served agent a run key. */
async function theSupervisorsRun(handle: string, starter: string, terminal: string): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/records', asAgent(starter, agents.get(starter)!.key, terminal), {
    kind: 'session',
    title: `A made-up supervisor run of ${handle}`,
    data: {
      state: RUNNING,
      servingAgent: handle,
      servingAgentId: idOf(handle),
      runtime: 'claude-code',
      model: A_MADE_UP_MODEL,
      workingDirectory: CHECKOUT,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String(r.body['runKey']?.key)
  expect(key, 'the office minted the run no key').toMatch(/^[0-9a-f]{64}$/)
  return { id: String(r.body['record'].id), key }
}

/** An agent's last run in the sandbox, filed as a fixture: the round start reads it and continues its model. */
function aSandboxRun(handle: string): string {
  return t.api.createRecord({
    kind: 'session',
    title: `A made-up round of ${handle}`,
    workspaceId: 'default',
    actor: t.api.HUMAN,
    origin: 'fixture',
    data: {
      state: RUNNING,
      servingAgent: handle,
      servingAgentId: idOf(handle),
      runtime: 'claude-code',
      model: A_MADE_UP_MODEL,
      workingDirectory: CHECKOUT,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
    },
  }).id
}

const dataOf = (id: string): Record<string, any> =>
  JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, any>

let bossRun: { id: string; key: string }
const AS_BOSS = (): Record<string, string> => asAgent('plan-boss', bossRun.key, bossRun.id)

beforeAll(async () => {
  const before = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  afterAllRestore = () => {
    if (before === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
    else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = before
  }
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-no-work-area-'))
  const folder = join(realpathSync(scratch), 'sandboxes', 'plan-sandbox')
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief\n\nDo the made-up work.\n')
  sandbox = { folder, brief, container: aContainerRow(folder) }
  aMadeUpSandboxRepo(folder, CHECKOUT)

  await started('plan-quill', AS_THE_PERSON, 'secretary')
  const terminal = await call('POST', '/api/records', asOne('plan-quill'), { kind: 'session', title: 'plan-quill in a terminal', data: { state: RUNNING, runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  await started('plan-boss', asOne('plan-quill'), 'supervisor')
  await started('plan-worker', asOne('plan-boss'))
  await started('plan-worker-area', asOne('plan-boss'), undefined, ['src/'])
  await started('plan-boss-area', asOne('plan-quill'), 'supervisor', ['src/'])

  // THE PERSON CASTS THE WORKER CARD, so the worker door's roll has a row to take.
  const decided = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: 'The test casts the worker card', data: { ...governsTheWholeProject(), replaces: [] } })
  expect(decided.status, JSON.stringify(decided.body)).toBe(201)
  const decision = String(decided.body['record'].id)
  const cast = await call('POST', '/api/casting/worker', AS_THE_PERSON, {
    program: { value: 'claude-code', decision }, model: { value: 'claude-sonnet-5', decision }, effort: { value: 'high', decision },
  })
  expect(cast.status, JSON.stringify(cast.body)).toBe(201)

  bossRun = await theSupervisorsRun('plan-boss', 'plan-quill', String(terminal.body['record'].id))
  aSandboxRun('plan-boss-area')
})

let afterAllRestore: () => void = () => {}

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  afterAllRestore()
})

describe('the worker door tells a worker with no work area how it is given one', () => {
  it('carries the sentence for a worker with no work area, and keeps the ask', async () => {
    const answer = await call('POST', `/api/agents/${idOf('plan-worker')}/worker-run`, AS_BOSS(), { brief: sandbox.brief })
    expect(answer.status, JSON.stringify(answer.body)).toBe(202)
    const says = String(answer.body['says'])
    expect(says).toContain(NO_WORK_AREA_FIRST.replace('{handle}', 'plan-worker'))
    expect(says).toContain(NO_WORK_AREA_HOW)
    expect(says).toContain(NO_WORK_AREA_REMINDER)
    expect((dataOf(bossRun.id)['workerRuns'] as Record<string, { state: string }>)[idOf('plan-worker')]?.state).toBe('wanted')
  })

  it('says nothing to a worker that has a work area', async () => {
    const answer = await call('POST', `/api/agents/${idOf('plan-worker-area')}/worker-run`, AS_BOSS(), { brief: sandbox.brief })
    expect(answer.status, JSON.stringify(answer.body)).toBe(202)
    expect(String(answer.body['says'])).not.toContain(theReminderAStartWithNoWorkAreaCarries('plan-worker-area'))
  })
})

describe('the round start tells an agent with no work area how it is given one', () => {
  it('carries the sentence for an agent with no work area, and keeps the ask', async () => {
    const answer = await call('POST', `/api/agents/${idOf('plan-boss')}/next-round`, AS_THE_PERSON, { brief: sandbox.brief })
    expect(answer.status, JSON.stringify(answer.body)).toBe(202)
    const says = String(answer.body['says'])
    expect(says).toContain(NO_WORK_AREA_FIRST.replace('{handle}', 'plan-boss'))
    expect(says).toContain(NO_WORK_AREA_HOW)
    expect(says).toContain(NO_WORK_AREA_REMINDER)
    expect((dataOf(answer.body['run'] as string)['nextRound'] as { state: string }).state).toBe('wanted')
  })

  it('says nothing to an agent that has a work area', async () => {
    const answer = await call('POST', `/api/agents/${idOf('plan-boss-area')}/next-round`, AS_THE_PERSON, { brief: sandbox.brief })
    expect(answer.status, JSON.stringify(answer.body)).toBe(202)
    expect(String(answer.body['says'])).not.toContain(theReminderAStartWithNoWorkAreaCarries('plan-boss-area'))
  })
})
