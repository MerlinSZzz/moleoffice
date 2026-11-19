// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Historical receipt displays are inventoried explicitly; the new fake-runtime replay submits a real fixture note and preserves the storage retry assertions. */
import { historicalSession } from './synthetic-submission-fixtures.ts'
/** U3: real captures are in fixtures/usage-receipts; synthetic edge cases are named below. */
import { describe, expect, it } from 'vitest'
import { validateData } from '../src/shared/kinds.ts'
import type { RunResult } from '../src/worker/runtimes/adapter.ts'

describe('U3 receipt shape', () => {
  it('keeps not given distinct from measured zero and refuses invented fields', () => {
    const result: RunResult = { text: '', providerSession: null, endedHow: 'answered', because: 'synthetic shape control', usageReceipt: { inputTokens: 0, inputIncludesCached: true } }
    expect(validateData('session', { state: 'finished', usageReceipt: result.usageReceipt }).ok).toBe(true)
    expect(result.usageReceipt).not.toHaveProperty('outputTokens')
    expect(validateData('session', { usageReceipt: { guessedTokens: 1 } }).ok).toBe(false)
    expect(validateData('session', { usageReceipt: { outputTokens: null } }).ok).toBe(false)
  })
})

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { KimiAdapter } from '../src/worker/runtimes/kimi.ts'
import type { RuntimeAdapter } from '../src/worker/runtimes/adapter.ts'
import { codexUsage, openCodeUsage } from '../src/worker/runtimes/usage.ts'
import { whereItRan } from '../src/config/usage.mjs'
const fixture = (name: string) => readFileSync(new URL('./fixtures/usage-receipts/' + name, import.meta.url), 'utf8')
function read(adapter: RuntimeAdapter, said: string) {
  const dir = mkdtempSync(join(tmpdir(), 'usage-parser-'))
  try {
    const outputPath = join(dir, 'output'); writeFileSync(outputPath, said); writeFileSync(outputPath + '.answer', 'ok')
    return adapter.readResult({ runtime: adapter.runtime, pid: 0, pgid: 0, startedAt: '2026-09-08 16:49:26', providerSession: null, outputPath })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
describe('U3 adapter captures', () => {
  it('reads the real Claude result, including cache creation, zero reasoning and resolved model', () => {
    expect(read(new ClaudeCodeAdapter({}), fixture('claude-code.json')).usageReceipt).toMatchObject({ inputTokens: 2, cachedInputTokens: 9978, cacheCreationInputTokens: 10511, outputTokens: 4, reasoningTokens: 0, model: 'claude-opus-5', durationMs: 1544, costUsd: 0.110209, inputIncludesCached: false })
  })
  it('reads the real Codex turn and does not guess an unannounced model', () => {
    expect(read(new CodexAdapter({}), fixture('codex.jsonl')).usageReceipt).toMatchObject({ inputTokens: 15262, cachedInputTokens: 12160, outputTokens: 5, reasoningTokens: 0, inputIncludesCached: true, says: expect.stringContaining('model') })
    expect(read(new CodexAdapter({}), fixture('codex.jsonl')).usageReceipt?.model).toBeUndefined()
  })
  it('reads the real OpenCode step finish', () => {
    expect(read(new OpenCodeAdapter({}), fixture('opencode.jsonl')).usageReceipt).toMatchObject({ inputTokens: 8517, cachedInputTokens: 1920, outputTokens: 2, reasoningTokens: 0, costUsd: 0.003713595, inputIncludesCached: false })
  })
  it('states the absence in the real Kimi refusal and synthetic final-only answer', () => {
    for (const said of [fixture('kimi.txt'), '{"role":"assistant","content":"ok"}']) {
      expect(read(new KimiAdapter({}), said).usageReceipt).toMatchObject({ runtime: 'kimi', says: expect.stringContaining('no token usage') })
      expect(read(new KimiAdapter({}), said).usageReceipt?.inputTokens).toBeUndefined()
    }
  })
  it('does not turn malformed synthetic counts or an ambiguous model into a measurement', () => {
    const malformed = read(new ClaudeCodeAdapter({}), JSON.stringify({ usage: { input_tokens: '20', cache_read_input_tokens: -1, output_tokens: 0 }, modelUsage: { first: {}, second: {} } })).usageReceipt!
    expect(malformed.inputTokens).toBeUndefined()
    expect(malformed.cachedInputTokens).toBeUndefined()
    expect(malformed.outputTokens).toBe(0)
    expect(malformed.model).toBeUndefined()
    expect(codexUsage('{"type":"turn.completed","usage":{"input_tokens":1e400,"output_tokens":-2}}').inputTokens).toBeUndefined()
    expect(codexUsage('{"type":"turn.completed","usage":{"output_tokens":-2}}').outputTokens).toBeUndefined()
  })
  it('handles synthetic repeated steps, multiple turns, model announcements and partial envelopes', () => {
    expect(openCodeUsage(fixture('opencode.jsonl').repeat(2)).inputTokens).toBe(8517)
    // Codex's turn.completed is the thread's total so far, so two turns are read as the last, not summed (round 42).
    expect(codexUsage('{"type":"turn.started","model":"announced-model"}\n' + fixture('codex.jsonl').repeat(2))).toMatchObject({ model: 'announced-model', inputTokens: 15262 })
    expect(codexUsage(fixture('codex.jsonl')+'\n{"type":"turn.completed","usage":{}}').inputTokens).toBeUndefined()
    for (const adapter of [new ClaudeCodeAdapter({}), new CodexAdapter({}), new OpenCodeAdapter({}), new KimiAdapter({})]) {
      expect(read(adapter, 'broken output').usageReceipt?.inputTokens).toBeUndefined()
      expect(read(adapter, '').usageReceipt?.says).toBeTruthy()
    }
  })
})

import { beforeAll, afterAll, vi } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { onePass } from '../src/worker/index.ts'
import { claudeUsage } from '../src/worker/runtimes/usage.ts'
import type { ReceiptUsage } from '../src/shared/usage-receipts.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

describe('U3 worker storage and pages', () => {
  let app: LiveApp
  let database: Awaited<ReturnType<typeof freshDb>>
  let runId: string, missingId: string
  const receipt = claudeUsage(fixture('claude-code.json'))
  beforeAll(async () => {
    database = await freshDb()
    database.api.createRecord({ workspaceId: 'default', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, kind: 'agent', title: 'Fixture runtime', data: { handle: 'fixture-agent', runtime: 'claude-code', state: 'active', workArea: ['records'] } })
    const completion = database.api.createRecord({ workspaceId: 'default', actor: { type: 'agent', id: 'builder-fc' }, kind: 'note', title: 'Synthetic runtime completion receipt', origin: 'fixture', data: {} })
    // FILED AS THE MESSAGE WORKER FILES A RUN IT STARTS: a session for an agent is filed only by that agent, those above
    // it, the person proved, or the office. builder-fc, which filed these before, is none of them for fixture-agent.
    const fileRun = (title: string, data: Record<string, unknown>) => (data.state === 'finished' ? historicalSession.bind(null, database) : database.api.createRecord)({ workspaceId: 'default', actor: { type: 'agent', id: 'mole-office/the-message-worker' }, kind: 'session', title, origin: 'fixture', data }).id
    runId = fileRun('Synthetic fixture: receipt persistence', { state: 'running', submission: { kind: 'records', records: [completion.id] }, servingAgent: 'fixture-agent', deliveringMessage: 'fixture-message', model: 'requested-model', runtime: 'claude-code', adaptedTool: 'claude-code' })
    missingId = fileRun('Synthetic fixture: missing usage', { state: 'finished', servingAgent: 'fixture-agent', runtime: 'claude-code' })
    fileRun('Synthetic fixture: incomplete count', { state: 'finished', usageReceipt: { inputTokens: 999999 } })
    for (const reason of ['old', 'deleted', 'other project']) {
      const id = fileRun('Synthetic fixture: excluded ' + reason, { state: 'finished', usageReceipt: { ...receipt, model: 'excluded-' + reason } })
      if (reason === 'old') database.client.sqlite.prepare('update records set created_at = ? where id = ?').run('2000-01-01 00:00:00', id)
      if (reason === 'deleted') database.client.sqlite.prepare('update records set deleted_at = ? where id = ?').run('2026-09-08 00:00:00', id)
      if (reason === 'other project') database.client.sqlite.prepare('update records set workspace_id = ? where id = ?').run('panelx', id)
    }
    // Deliberately moved historical display rows need explicit catch-up revisions before serving.
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    migrateInPlace(database.client.sqlite, join(process.cwd(), 'drizzle'))
    app = await liveApp({ name: 'usage-receipts', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: database.file })
  }, 60_000)
  afterAll(async () => { if (app) await app.stop(); database?.close() })
  const get = async (path: string) => {
    const response = await fetch(app.api + path, { headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-fc' } })
    expect(response.status).toBe(200); return response.json()
  }
  it('the worker copies the parsed receipt onto the run and leaves the requested model alone', async () => {
    const adapter = new ClaudeCodeAdapter({})
    adapter.alive = () => false
    adapter.readResult = () => ({ text: 'ok', endedHow: 'answered', providerSession: null, because: 'Synthetic worker replay of captured envelope', usageReceipt: receipt })
    const watching: Parameters<typeof onePass>[1] = [{ adapter, handle: { runtime: 'claude-code', pid: 0, pgid: 0, startedAt: '2026-09-08 16:49:26', providerSession: null, outputPath: join(app.dir, 'unused') }, session: runId, messageId: 'fixture-message', agentId: 'fixture-agent', handleName: 'fixture-agent', ledgerRow: null, lastSaid: '', tryAgainAt: Date.now() + 3600000 }]
    // THE DATABASE OF THE OFFICE THE WORKER TALKS TO, so the worker reads the office's own key beside it and sends that
    // key, as it does in an office with a key file.
    const settings = { api: app.api, workspace: 'default', session: null, stopWithPid: null, checkout: process.cwd(), runs: 0, hops: 3, outputRoot: app.dir, env: { MOLE_OFFICE_DB: database.file } }
    const realFetch = globalThis.fetch
    const unavailable = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/api/records/' + runId) && init?.method === 'PATCH') return new Response('{"error":"synthetic temporary failure"}', { status: 503 })
      return realFetch(url, init)
    })
    try { await expect(onePass(settings, watching)).rejects.toThrow('were not stored') } finally { unavailable.mockRestore() }
    expect(watching[0]?.patched).not.toBe(true)
    await onePass(settings, watching)
    const data = (await get('/api/records/' + runId)).record.data
    // Wave 13p round 26: the worker adds where the run ran to the receipt it was handed, and changes nothing else in it.
    expect(data.usageReceipt).toEqual({ ...JSON.parse(JSON.stringify(receipt)), ranIn: whereItRan(process.env) })
    expect(data.model).toBe('requested-model')
    expect(data.state).toBe('finished')
  })
  it('sums receipts without counting absent fields as zero, including runs with no API calls', async () => {
    const { receipts } = await get('/api/usage/agents') as { receipts: ReceiptUsage }
    const model = receipts.byModel.find(row => row.name === 'claude-opus-5')!
    expect(model.values).toMatchObject({ inputTokens: 20491, cachedInputTokens: 9978, outputTokens: 4 })
    expect(model.runs).toEqual([runId])
    expect(receipts.byModel.some(row => row.name?.startsWith('excluded-'))).toBe(false)
    const unknown = receipts.byModel.find(row => row.name === null)!
    expect(unknown.values.inputTokens).toBeUndefined()
    expect(unknown.supplied.inputTokens).toBe(0)
    expect(receipts.byAgent.find(row => row.name === 'fixture-agent')?.missingReceipts).toBe(1)
    expect(receipts.byRuntime.find(row => row.name === 'claude-code')?.supplied.outputTokens).toBe(1)
    expect(receipts.byRecord.find(row => row.name === 'fixture-message')?.runs).toEqual([runId])
  })
  it('draws measured tokens, model and source on the run page, and says when a receipt is missing', async () => {
    await app.page.goto(app.site + '/#/r/' + runId); await waitForThePage(app.page)
    await app.page.getByTestId('usage-receipt').waitFor()
    expect(await app.page.getByTestId('usage-receipt').innerText()).toMatch(/Tokens in\s+2\s+Cached\s+9,978\s+Tokens out\s+4/)
    expect(await app.page.getByTestId('usage-receipt').innerText()).toContain('claude-opus-5')
    expect(await app.page.getByTestId('usage-receipt').innerText()).toContain('result.usage')
    await app.page.goto(app.site + '/#/r/' + missingId); await waitForThePage(app.page)
    await app.page.getByTestId('usage-receipt').getByText('Not recorded', { exact: true }).waitFor()
    expect(await app.page.getByTestId('usage-receipt').innerText()).toContain('Usage receipt')
  }, 30_000)
  it('draws receipt totals and missing coverage on the usage page', async () => {
    await app.page.goto(app.site + '/#/agent-use'); await waitForThePage(app.page)
    await app.page.getByTestId('receipt-totals').waitFor()
    const text = await app.page.getByTestId('receipt-totals').innerText()
    expect(text).toContain('20,491 (1/1 runs)')
    expect(text).toContain('Without a receipt:')
  }, 30_000)
})
