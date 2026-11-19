// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONTINUED RUN KEEPS A MODEL UNDER THE PROVIDER THE DATA FILE NAMES.
 *
 * src/server/lib/next-round.ts decides whether a run's stored model can be continued with two patterns that wrote the
 * providers in code: openai/ for Codex and anthropic/ for Claude Code. The provider a runtime's own program runs is one
 * fact, in src/config/runtime-native-providers.json, read through src/config/runtime-native-providers.mjs. This file
 * mocks that module with providers made up for the run, asks for a next round, files the launcher run, and calls the
 * starting door. The made-up providers are the only ones that may pass; another provider is refused.
 *
 * WHAT GOES RED WHEN THE LITERALS COME BACK: the two cases that continue a model under the made-up providers, which
 * the old patterns refuse with "cannot use for continuation".
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const made = vi.hoisted(() => {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return {
    providers: Object.freeze({ codex: `codex-provider-${key}`, 'claude-code': `claude-provider-${key}` }),
    other: `other-provider-${key}`,
    key,
  }
})
vi.mock('../src/config/runtime-native-providers.json', async (importOriginal) => {
  const real = (await importOriginal<{ default: Record<string, { program: string; provider: string | null; fastMode: boolean }> }>()).default
  return {
    default: Object.freeze({
      ...real,
      codex: { ...real['codex']!, provider: made.providers.codex },
      'claude-code': { ...real['claude-code']!, provider: made.providers['claude-code'] },
    }),
  }
})

const WORKSPACE = 'default'
const THE_WORKER_ID = 'mole-office/the-message-worker'
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asTheWorker = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_WORKER_ID,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
})

let t: TestDb
let app: FastifyInstance
let scratch = ''
let starterId = ''
let asTheStarter: Record<string, string> = {}
let workerModeBefore: string | undefined

async function call(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

/** An agent of this test's own, registered by the person, with the runtime the run will name. Its registry id. */
async function started(handle: string, runtime: string): Promise<string> {
  const r = await call('POST', '/api/agents/started', asTheStarter, { handle, name: handle, runtime })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return (r.body['agent'] as { id: string }).id
}

/** A container row of the ledger that vouches for the sandbox folder, as `tools/sandbox.mjs up` writes one. */
function aContainerRow(folder: string, name: string): string {
  const id = `row-${randomUUID()}`
  t.client.sqlite
    .prepare(
      "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-30 10:00:00', 'agent:fixture')",
    )
    .run(
      id,
      `mole-office-sandbox-${name}`,
      `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`,
    )
  return id
}

/** A made-up sandbox folder with a brief in it, and the container row that vouches for it. */
function aSandbox(name: string): { folder: string; brief: string; container: string } {
  const folder = join(realpathSync(scratch), 'sandboxes', name)
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, `# A made-up brief for ${name}\n\nDo the made-up next round.\n`)
  return { folder, brief, container: aContainerRow(folder, name) }
}

/** The agent's last run, started in a sandbox and filed by its starter, as the launcher files one. It has ended. */
function aSandboxRun(
  handle: string,
  agentId: string,
  sandbox: { folder: string; container: string },
  runtime: string,
  model: string,
): string {
  return t.api.createRecord({
    kind: 'session',
    title: `A made-up round of ${handle}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: starterId },
    origin: 'fixture',
    data: {
      state: 'running',
      servingAgent: handle,
      servingAgentId: agentId,
      runtime,
      model,
      workingDirectory: scratch,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
    },
  }).id
}

/** The worker's launcher run for one round, filed with the office's key as the worker files it. */
async function aLauncherRun(round: string): Promise<string> {
  const r = await call('POST', '/api/records', asTheWorker(), {
    kind: 'session',
    title: `A made-up launcher run for the round after ${round}`,
    data: {
      state: 'running',
      runtime: 'round-launcher',
      doing: 'starting a made-up next round; this run runs no model',
      workingDirectory: scratch,
      startedByMoleOffice: true,
      extra: { purpose: 'round', round },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

/** A run of `runtime` with `model`, and the next-round door's answer to the ask for its next round. */
async function theAskFor(runtime: 'codex' | 'claude-code', model: string): Promise<{ status: number; body: Record<string, any>; run: string }> {
  const handle = `cc-${randomUUID().slice(0, 8)}`
  const agentId = await started(handle, runtime)
  const sandbox = aSandbox(`cc-sandbox-${handle}`)
  const run = aSandboxRun(handle, agentId, sandbox, runtime, model)
  const asked = await call('POST', `/api/agents/${handle}/next-round`, AS_THE_PERSON, { brief: sandbox.brief })
  return { status: asked.status, body: asked.body, run }
}

/** Ask for a next round of a run of `runtime` with `model`, file the launcher, and ask the starting door. */
async function aContinuation(runtime: 'codex' | 'claude-code', model: string): Promise<{ status: number; body: Record<string, any> }> {
  const asked = await theAskFor(runtime, model)
  expect(asked.status, JSON.stringify(asked.body)).toBe(202)
  const wrapper = await aLauncherRun(asked.run)
  return call('POST', `/api/worker/rounds/${asked.run}/starting`, asTheWorker(), { wrapper })
}

beforeAll(async () => {
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-continued-provider-'))
  // THE STARTER FILES EACH RUN'S SANDBOX, as the launcher does; a run never names its own.
  const starter = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'cc-starter', name: 'cc-starter', runtime: 'claude-code' })
  expect(starter.status, JSON.stringify(starter.body)).toBe(201)
  starterId = (starter.body['agent'] as { id: string }).id
  const starterKey = String((starter.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(starterKey).not.toBe('')
  asTheStarter = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'cc-starter', 'x-mole-office-key': starterKey }
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the continuation check reads the provider in the data file', () => {
  // MUTATION: the openai/ literal comes back; red on the 200 and the starting round.
  it('continues a Codex model named under the made-up Codex provider', async () => {
    const model = `model-${randomUUID()}`
    const r = await aContinuation('codex', `${made.providers.codex}/${model}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'codex', model: `${made.providers.codex}/${model}` })
  })

  // MUTATION: the anthropic literal comes back; red on the 200 and the starting round.
  it('continues a Claude Code model named under the made-up Claude Code provider', async () => {
    const model = `model-${randomUUID()}`
    const r = await aContinuation('claude-code', `${made.providers['claude-code']}/${model}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model: `${made.providers['claude-code']}/${model}` })
  })

  it('refuses a Codex model under another provider at the ask', async () => {
    const r = await theAskFor('codex', `${made.other}/model-${randomUUID()}`)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain('cannot use for continuation')
    expect(r.body['error']).toMatch(/ Nothing was written\.$/)
  })

  it('refuses a Claude Code model under another provider at the ask', async () => {
    const r = await theAskFor('claude-code', `${made.other}/model-${randomUUID()}`)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain('cannot use for continuation')
    expect(r.body['error']).toMatch(/ Nothing was written\.$/)
  })

  it('keeps taking a Claude Code model with no provider in front', async () => {
    const r = await aContinuation('claude-code', `model-${randomUUID()}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })
})
