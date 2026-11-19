// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * U3: A CHECK CARRIES THE USAGE RECEIPT OF THE MODEL IT RAN.
 *
 * WHAT IS PROVED HERE, AND WHY IT IS NOT THE EXTRACTOR TEST.
 *
 * The extractor case already exists in tests/a-run-carries-its-usage-receipt.test.ts, and it would
 * pass today. This test drives the path instead: it arranges a real finished run, lets the real
 * message worker start the real inspection adapter against a stand-in check tool that prints a
 * Claude Code envelope, and then reads the check's own session record. The receipt has to survive
 * the two places `src/worker/index.ts` rebuilds `run.ended` on the check branch, or the record is
 * missing it and this test goes red.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION, AND WHAT WENT RED
 * ---------------------------------------------------------------------------------------
 *
 * Control: the whole file green (2 cases). Mutation: the check branch of `src/worker/index.ts`
 * rebuilds `run.ended` as a whole object again (the shape that dropped `usageReceipt` before this
 * change), so the adapter's receipt is lost before `sayHowItEnded` writes the patch. Result: the
 * case named *carries the receipt the tool printed through to the check session record* goes red;
 * the case about a check that ran no model stays green. The product was restored and the file's
 * sha256sum matched the control run's.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { inspectionUsageIn, inspectionUsageLine, inspectionUsageReceipt } from '../src/config/usage.mjs'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const RAN_A_MODEL = fileURLToPath(new URL('./fake-check-that-ran-a-model.mjs', import.meta.url))
const CODEX_OUTPUT = fileURLToPath(new URL('./fake-codex-check-that-ran-a-model.mjs', import.meta.url))
const CLAUDE_TURNS = fileURLToPath(new URL('./fake-claude-check-that-ran-two-turns.mjs', import.meta.url))
const RAN_NO_MODEL = fileURLToPath(new URL('./fake-inspection-tool.mjs', import.meta.url))
const FAKE_RUNTIME = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

interface RecordRead {
  record: { id: string; data: Record<string, unknown> & { theCheck?: Check } }
}
interface Check {
  message: string
  execution?: { session: string; endedAt?: string; failed?: string }
  says: string
}

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let outputs = ''
let cleanCheckout = ''
let cleanRoot = ''
let tip = ''
const watching: Parameters<typeof onePass>[1] = []
let group = ''
let groupMessage = ''

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string) => ({ ...AS_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function request<T>(path: string, method = 'GET', body?: unknown, headers = AS_PERSON): Promise<T> {
  const reply = await app.inject({
    method: method as 'GET',
    url: path,
    headers,
    ...(body === undefined ? {} : { payload: body as never }),
  })
  if (reply.statusCode < 200 || reply.statusCode >= 300) throw new Error(`${method} ${path}: ${reply.statusCode} ${reply.body}`)
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as T
}

async function makeRun(title: string): Promise<string> {
  const made = await request<RecordRead>('/api/records', 'POST', {
    kind: 'session',
    title,
    data: {
      state: 'running',
      servingAgent: 'builder-fixture',
      // A CLEAN REPOSITORY OF ITS OWN. The check seal refuses a tip with uncommitted files, and
      // this test runs in a worktree where the change under test is not committed yet. Reading the
      // real checkout would make the test measure the working tree instead of the receipt.
      workingDirectory: cleanCheckout,
      cutFrom: 'main',
      tip,
      deliveringMessage: groupMessage,
      doing: 'Synthetic fixture for the check-receipt test.',
    },
  }, asAgent('builder-fixture'))
  // Declaring the finish is what has the office ask for a check. U3's check half starts here.
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asAgent('builder-fixture'))
  return made.record.id
}

async function untilTheCheckEnds(run: string): Promise<Check> {
  const until = Date.now() + 30_000
  do {
    await onePass(settings, watching)
    const check = (await request<RecordRead>(`/api/records/${run}`)).record.data.theCheck
    if (check?.execution?.endedAt !== undefined) return check
    await new Promise((resolve) => setTimeout(resolve, 100))
  } while (Date.now() < until)
  throw new Error(`The synthetic check of ${run} did not end.`)
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-check-receipt-'))
  // A clean git repository the synthetic run can be sealed against; see `makeRun`.
  cleanRoot = mkdtempSync(join(tmpdir(), 'mole-office-check-clean-'))
  cleanCheckout = join(cleanRoot, 'checkout')
  mkdirSync(cleanCheckout)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: cleanCheckout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'A fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(cleanCheckout, 'work'), 'Before\n')
  git('add', '.')
  git('commit', '-qm', 'Fixture base')
  tip = git('rev-parse', 'HEAD')

  await request('/api/agents/started', 'POST', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await request('/api/agents/started', 'POST', { handle: 'inspector-fixture', name: 'Synthetic Inspector', runtime: 'claude-code', role: 'inspector' })
  await request('/api/agents/started', 'POST', {
    handle: 'builder-fixture',
    name: 'Synthetic Builder',
    runtime: 'claude-code',
    role: 'worker',
    chapters: ['5:full'],
    workArea: ['src/server/lib'],
  }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
  const opened = await request<{ group: { id: string } }>('/api/groups', 'POST', {
    name: 'Synthetic check conversation',
    because: 'Synthetic check-receipt fixture.',
    members: [
      { who: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, because: 'Synthetic test participant.' },
      { who: { kind: 'agent', id: 'builder-fixture' }, because: 'Synthetic test participant.' },
    ],
  })
  group = opened.group.id
  const conversation = await request<{ messages: { id: string }[] }>(`/api/groups/${group}`)
  groupMessage = conversation.messages[0]!.id

  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: RAN_A_MODEL, MOLE_OFFICE_FAKE_RUNTIME: FAKE_RUNTIME },
  }
}, 180_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The check-receipt test ended.')
  await app?.close()
  t?.close()
  if (outputs !== '') rmSync(outputs, { recursive: true, force: true })
  if (cleanRoot !== '') rmSync(cleanRoot, { recursive: true, force: true })
})

describe('a check carries its usage receipt', () => {
  it('keeps Codex totals absent when native output names another thread', () => {
    const output = [
      { type: 'thread.started', thread_id: 'synthetic-first-thread' },
      { type: 'turn.completed', usage: { input_tokens: 11, output_tokens: 3 } },
      { type: 'thread.started', thread_id: 'synthetic-other-thread' },
      { type: 'turn.completed', usage: { input_tokens: 2200, output_tokens: 600 } },
    ].map(event => JSON.stringify(event)).join('\n')
    const receipt = inspectionUsageReceipt({ runtime: 'codex', output })
    expect(receipt).not.toHaveProperty('inputTokens')
    expect(receipt).not.toHaveProperty('outputTokens')
    expect(receipt.says).toContain('more than one Codex thread')
  })

  it('keeps Claude invocation counts but no cumulative cost from another conversation', () => {
    const output = [
      { type: 'result', session_id: 'synthetic-first-conversation', usage: { input_tokens: 11, output_tokens: 3 }, total_cost_usd: 0.1 },
      { type: 'result', session_id: 'synthetic-other-conversation', usage: { input_tokens: 22, output_tokens: 6 }, total_cost_usd: 99 },
    ].map(envelope => JSON.stringify(envelope)).join('\n')
    const receipt = inspectionUsageReceipt({ runtime: 'claude-code', output })
    expect(receipt).toMatchObject({ inputTokens: 33, outputTokens: 9 })
    expect(receipt).not.toHaveProperty('costUsd')
    expect(receipt.says).toContain('more than one Claude conversation')
  })

  it.each([
    ['both ids are missing', [undefined, undefined]],
    ['the first id is missing', [undefined, 'synthetic-known-conversation']],
    ['the second id is missing', ['synthetic-known-conversation', undefined]],
    ['both ids are blank', ['', '']],
  ] as const)('keeps cumulative Claude cost absent when %s', (_label, ids) => {
    const output = [0, 1].map((index) => JSON.stringify({
      type: 'result', session_id: ids[index],
      usage: { input_tokens: 11 * (index + 1), output_tokens: 3 * (index + 1) },
      total_cost_usd: 0.1 * (index + 1),
    })).join('\n')
    const receipt = inspectionUsageReceipt({ runtime: 'claude-code', output })
    expect(receipt).toMatchObject({ inputTokens: 33, outputTokens: 9 })
    expect(receipt).not.toHaveProperty('costUsd')
    expect(receipt.says).toContain('no conversation')
  })

  it('carries the receipt the tool printed through to the check session record', async () => {
    const run = await makeRun('Synthetic check that ran a model')
    const check = await untilTheCheckEnds(run)
    const data = (await request<RecordRead>(`/api/records/${check.execution!.session}`)).record.data
    expect(data['usageReceipt']).toMatchObject({
      runtime: 'claude-code',
      inputTokens: 11,
      cachedInputTokens: 22,
      cacheCreationInputTokens: 33,
      outputTokens: 44,
      model: 'claude-opus-5',
      durationMs: 4321,
      costUsd: 0.25,
      inputIncludesCached: false,
    })
  })

  it('keeps a Codex receipt on the check session with no invented model or cost', async () => {
    const before = settings.env
    settings.env = { ...before, MOLE_OFFICE_FAKE_INSPECTION_TOOL: CODEX_OUTPUT }
    try {
      const run = await makeRun('Synthetic check with Codex events')
      const check = await untilTheCheckEnds(run)
      const data = (await request<RecordRead>(`/api/records/${check.execution!.session}`)).record.data
      expect(data['usageReceipt']).toMatchObject({ runtime: 'codex', inputTokens: 111, cachedInputTokens: 22, outputTokens: 44, inputIncludesCached: true })
      expect(data['usageReceipt']).not.toHaveProperty('costUsd')
      expect(data['usageReceipt']).not.toHaveProperty('model')
    } finally { settings.env = before }
  })

  it('keeps same-conversation invocation counts and its final cumulative Claude cost', async () => {
    const before = settings.env
    settings.env = { ...before, MOLE_OFFICE_FAKE_INSPECTION_TOOL: CLAUDE_TURNS }
    try {
      const run = await makeRun('Synthetic check with two Claude turns')
      const check = await untilTheCheckEnds(run)
      const data = (await request<RecordRead>(`/api/records/${check.execution!.session}`)).record.data
      expect(data['usageReceipt']).toMatchObject({ runtime: 'claude-code', inputTokens: 30, cachedInputTokens: 6, outputTokens: 9, inputIncludesCached: false, model: 'claude-synthetic' })
      expect((data['usageReceipt'] as { costUsd: number }).costUsd).toBeCloseTo(0.2)
      expect(data['usageReceipt']).not.toHaveProperty('cacheCreationInputTokens')
    } finally { settings.env = before }
  })

  it('writes no receipt when the check ran no model', async () => {
    const before = settings.env
    settings.env = { ...before, MOLE_OFFICE_FAKE_INSPECTION_TOOL: RAN_NO_MODEL }
    try {
      const run = await makeRun('Synthetic check that ran no model')
      const check = await untilTheCheckEnds(run)
      const data = (await request<RecordRead>(`/api/records/${check.execution!.session}`)).record.data
      expect(data['usageReceipt']).toBeUndefined()
    } finally {
      settings.env = before
    }
  })
})


it('dispatches OpenCode inspection output to native step receipts instead of Claude results', () => {
  const output = [1, 2].map(n => JSON.stringify({ type: 'step_finish', sessionID: 'ses_Synthetic', part: {
    id: `prt_${n}`, type: 'step-finish', tokens: { input: 11, output: 3, reasoning: 2, cache: { read: 5, write: 7 } }, cost: 0.1,
  } })).join('\n')
  const native = inspectionUsageIn(inspectionUsageLine('opencode', output))!
  expect(native).toEqual({ runtime: 'opencode', output })
  expect(inspectionUsageReceipt(native)).toMatchObject({ runtime: 'opencode', inputTokens: 22, outputTokens: 6,
    reasoningTokens: 4, cachedInputTokens: 10, cacheCreationInputTokens: 14, costUsd: 0.2, inputIncludesCached: false })
  expect(inspectionUsageReceipt(native).model).toBeUndefined()
})

it('keeps absent OpenCode inspection usage unknown and explains why', () => {
  const receipt = inspectionUsageReceipt({ runtime: 'opencode', output: '{"type":"text","part":{"text":"Synthetic"}}' })
  expect(receipt.runtime).toBe('opencode')
  expect(receipt.says).toContain('no step_finish')
  expect(receipt).not.toHaveProperty('inputTokens')
  expect(receipt).not.toHaveProperty('costUsd')
})
