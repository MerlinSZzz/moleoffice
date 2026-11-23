// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY RUN GETS A USAGE RECEIPT — milestone M8 of report 4IoRUKizcZXb, design B: record first, no
 * gates.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The readers. The -p envelope is found past anything printed before it, and a failed run's envelope is read like
 *      any other. A Claude Code transcript counts each answer once, and only from the run's start. A dsh transcript
 *      counts its usage rows and never their stream copies. A Codex run's last turn.completed event is its usage, with no
 *      cost and no login named (wave 13p round 27; the last and not the sum, because each is the thread's total so
 *      far, wave 13s round 42). A Codex run that reported no usage says why, worked out from what it printed (round 42).
 *      A round that continues another is held in tests/a-rounds-receipt-is-its-own.test.ts. A number nobody reported stays absent, never 0. Which login
 *      paid and where the run ran are named by their fixed forms. Outside spending already on a receipt is kept.
 *   2. The sealed-itself case at the launcher's exit is told apart from a fault only when the launcher held a run key
 *      and a read without that key shows the run over (a review, message DLqviJ8nr3yH).
 *   3. The tools. tools/outside-spend.mjs adds an amount with its service and keeps the rest of the receipt.
 *      tools/usage-so-far.mjs writes the run's usage and what served it before the seal, from the run's own
 *      transcripts. Each says in one sentence, and with exit 1, when it wrote nothing.
 *   4. The hooks. The dsh stop hook writes the receipt beside `served`. A secretary's session hook writes the running
 *      total, a total and never a sum of totals. Both write at a stop at most once in ten minutes, by the receipt's
 *      `readAt`, and always at the end (the same review): a stop inside the window reads no transcript and writes nothing.
 *   5. The page. A receipt says "Not reported" for an absent number, and says who paid, where it ran and what was spent
 *      outside, in English and in Chinese. It draws the model the runtime named, and never `modelRequested`, the model the
 *      run asked for (Dxiry_2y6vuD point 3).
 *
 * NO GATE, NO REFUSED WRITE AND NO STOPPED RUN. Nothing here is refused for lacking a receipt. Every writer that fails
 * leaves the run as it was: the tools exit 1 with a sentence, the hooks exit 0 with a sentence on stderr, and the
 * launcher's cases in tests/sandbox-launcher.test.ts show a crashed run still recorded crashed with its receipt.
 *
 * THE AGENT A NAMED RUN SERVES HOLDS A KEY OF ITS OWN, from the door that registers it, and every run of the session
 * hook on a run the environment names is given it. A session that names an agent and holds no key of it sends the
 * name alone, and the office lets no name alone change a run, so the receipt the hook writes there would be refused
 * without the key.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run (the report of wave 13p's round 26)
 * ---------------------------------------------------------------------------------------
 *
 *   - theEnvelopeLineIn reading only the last line: the envelope-past-a-warning case goes red.
 *   - claudeTranscriptUsage without the sinceMs cut: the earlier-round case goes red; without the message.id
 *     dedupe, the each-answer-once case goes red.
 *   - dshTranscriptUsage counting the stream copies: the dsh case goes red.
 *   - theReceiptOfAnEndedCodexCommand reading every Codex text as reported: the no-turn.completed case goes red; naming a
 *     login in paidBy: both Codex cases go red; codexUsage without its no-cost sentence: the Codex usage case goes red;
 *     ignoring `unread`, or saying only "no turn.completed": the no-turn.completed case goes red.
 *   - number() turning undefined into 0: the not-reported case goes red.
 *   - keepingTheOutsideSpend returning `fresh`: every kept-spending case goes red.
 *   - theRunEndedBeforeItsCommand without the run-key half: its case goes red; without the state read without the key,
 *     the still-running and unreadable cases go red.
 *   - theLoginThatPaid naming the credentials file by its full path: the home-folder case goes red.
 *   - aReceiptReadLately always false (no window): its own case, the session hook's inside-the-window case and the dsh
 *     held-stop case go red; always true: its own case and the after-the-window case go red.
 *   - the session hook's end also skipping inside the window: the stop-then-end case goes red.
 *   - the dsh stop that lets the run go also skipping inside the window: the held-stop case goes red at its fourth stop.
 *   - the session hook adding onto the stored receipt instead of writing the total: the stop-then-end case goes red.
 *   - the component drawing notGiven instead of notReported: the page case goes red.
 *   - the component drawing `modelRequested` when it is there, in place of `model`: the model-asked-for page case goes red.
 */
import { execFile, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { constants, zstdCompressSync } from 'node:zlib'

import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theLoginThatPaid } from '../src/config/claude-code-login.mjs'
import {
  A_STOP_WRITES_THE_RECEIPT_EVERY_MS,
  aReceiptReadLately,
  claudeTranscriptUsage,
  dshTranscriptUsage,
  keepingTheOutsideSpend,
  theEnvelopeLineIn,
  theReceiptOfAnEndedCodexCommand,
  theReceiptOfAnEndedCommand,
  whereItRan,
} from '../src/config/usage.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { PAID_BY_THE_LOGIN_IN, RAN_IN_THE_SANDBOX, RAN_ON_THE_HOST, RECEIPT_NOT_REPORTED, type UsageReceipt } from '../src/shared/usage-receipts.ts'
import { projectKey } from '../tools/dsh-hooks/served.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { theRunEndedBeforeItsCommand } from '../tools/sandbox-common.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const tool = (path: string): string => fileURLToPath(new URL(path, import.meta.url))
const ENVELOPE = readFileSync(tool('./fixtures/usage-receipts/claude-code.json'), 'utf8').trim()
const CODEX_EVENTS = readFileSync(tool('./fixtures/usage-receipts/codex.jsonl'), 'utf8')

/** One assistant line of a Claude Code transcript. */
const anAnswer = (id: string, at: Date, usage: Record<string, number>, model = 'claude-opus-5'): string =>
  JSON.stringify({ type: 'assistant', timestamp: at.toISOString(), message: { id, model, usage } })

// ---------------------------------------------------------------------------- 1. the readers

describe('the readers', () => {
  it('finds the envelope past a warning printed before it, and reads a failed run\u2019s envelope like any other', () => {
    expect(theEnvelopeLineIn(`a warning\n${ENVELOPE}\n`)).toBe(ENVELOPE)
    expect(theEnvelopeLineIn(`${ENVELOPE}\nan error printed after it\n`)).toBe(ENVELOPE)
    const failed = JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, usage: { input_tokens: 9, output_tokens: 1 }, total_cost_usd: 0.5 })
    expect(theReceiptOfAnEndedCommand({ text: failed, noEnvelope: 'none', previous: null, stored: undefined, paidBy: 'p', ranIn: 'r' })).toMatchObject({ inputTokens: 9, outputTokens: 1, costUsd: 0.5 })
  })

  it('reads the envelope into a receipt, with who paid and where it ran, and keeps outside spending already stored', () => {
    const stored = { inputTokens: 1, outsideSpend: [{ service: 'OpenRouter', usd: 0.42 }] }
    const receipt = theReceiptOfAnEndedCommand({ text: `noise\n${ENVELOPE}`, noEnvelope: 'none', previous: null, stored, paidBy: 'the payer', ranIn: 'the place' })
    expect(receipt).toMatchObject({ inputTokens: 2, cachedInputTokens: 9978, outputTokens: 4, costUsd: 0.110209, model: 'claude-opus-5', paidBy: 'the payer', ranIn: 'the place' })
    expect(receipt.outsideSpend).toEqual([{ service: 'OpenRouter', usd: 0.42 }])
  })

  it('leaves every number absent, never 0, when no envelope was printed, and says why', () => {
    const receipt = theReceiptOfAnEndedCommand({ text: 'no json here\n', noEnvelope: 'Nothing was printed.', previous: null, stored: undefined, paidBy: 'p', ranIn: 'r' })
    for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd', 'durationMs'] as const) expect(receipt[key]).toBeUndefined()
    expect(receipt.says).toBe('Nothing was printed.')
  })

  it('leaves absent a count the runtime did not give, beside the ones it did, and never writes it as 0', () => {
    const envelope = JSON.stringify({ type: 'result', usage: { input_tokens: 3 } })
    const fromTheEnvelope = theReceiptOfAnEndedCommand({ text: envelope, noEnvelope: 'none', previous: null, stored: undefined, paidBy: 'p', ranIn: 'r' })
    expect(fromTheEnvelope.inputTokens).toBe(3)
    for (const key of ['outputTokens', 'costUsd', 'durationMs'] as const) expect(fromTheEnvelope[key]).toBeUndefined()
    const fromTheTranscript = claudeTranscriptUsage([anAnswer('msg_only', new Date(), { input_tokens: 3 })], 0)
    expect(fromTheTranscript.inputTokens).toBe(3)
    expect(fromTheTranscript.outputTokens).toBeUndefined()
  })

  it('reads a Codex run\u2019s own usage from its turn.completed events, with no cost and no login named, and keeps outside spending', () => {
    const stored = { outsideSpend: [{ service: 'OpenRouter', usd: 0.42 }] }
    const receipt = theReceiptOfAnEndedCodexCommand({ text: `a warning Codex printed first\n${CODEX_EVENTS}`, unread: null, stopped: null, previous: null, stored, ranIn: 'the place' })
    expect(receipt).toMatchObject({ runtime: 'codex', inputTokens: 15262, cachedInputTokens: 12160, outputTokens: 5, reasoningTokens: 0, inputIncludesCached: true, paidBy: RECEIPT_NOT_REPORTED, ranIn: 'the place' })
    expect(receipt).not.toHaveProperty('costUsd')
    expect(receipt.says).toContain('Codex reports no cost.')
    expect(receipt.outsideSpend).toEqual([{ service: 'OpenRouter', usd: 0.42 }])
  })

  it('leaves every number of a Codex run absent, never 0, when it printed no turn.completed event, and says why', () => {
    const receipt = theReceiptOfAnEndedCodexCommand({ text: '{"type":"thread.started"}\nplain words\n', unread: null, stopped: null, previous: null, stored: undefined, ranIn: 'r' })
    for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd', 'durationMs'] as const) expect(receipt).not.toHaveProperty(key)
    expect(receipt).toMatchObject({ runtime: 'codex', says: 'Codex\'s last event was "thread.started", and no turn.completed came after it, so no usage was reported.', paidBy: RECEIPT_NOT_REPORTED })
    const unread = theReceiptOfAnEndedCodexCommand({ text: CODEX_EVENTS, unread: 'The output file could not be read.', stopped: null, previous: null, stored: undefined, ranIn: 'r' })
    for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd', 'durationMs'] as const) expect(unread).not.toHaveProperty(key)
    expect(unread).toMatchObject({ runtime: 'codex', says: 'The output file could not be read.', paidBy: RECEIPT_NOT_REPORTED })
  })

  it('counts each Claude Code answer once, from the run\u2019s start only, and names no cost', () => {
    const start = Date.parse('2026-10-05T10:00:00Z')
    const text = [
      anAnswer('msg_before', new Date(start - 60_000), { input_tokens: 1000, output_tokens: 1000 }),
      anAnswer('msg_1', new Date(start + 1_000), { input_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 100, output_tokens: 1 }),
      anAnswer('msg_1', new Date(start + 2_000), { input_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 100, output_tokens: 7 }),
      anAnswer('msg_2', new Date(start + 3_000), { input_tokens: 2, cache_read_input_tokens: 103, cache_creation_input_tokens: 10, output_tokens: 5 }),
      anAnswer('msg_3', new Date(start + 4_000), { input_tokens: 0 }, '<synthetic>'),
      JSON.stringify({ type: 'user', timestamp: new Date(start + 5_000).toISOString(), message: { content: 'hello' } }),
    ].join('\n')
    const receipt = claudeTranscriptUsage([text], start)
    expect(receipt).toMatchObject({ inputTokens: 5, cachedInputTokens: 103, cacheCreationInputTokens: 110, outputTokens: 12, model: 'claude-opus-5', inputIncludesCached: false })
    expect(receipt).not.toHaveProperty('costUsd')
    expect(receipt.says).toContain('The transcript carries no cost.')
  })

  it('counts a dsh run\u2019s usage rows and never their stream copies', () => {
    const line = (usage: Record<string, number>, stream?: Record<string, number>) => JSON.stringify({
      type: 'assistant/message',
      data: { message: { source: { model: 'the-dsh-model' } }, usage, ...(stream === undefined ? {} : { stream: [{ chunk: { type: 'usage', usage: stream } }] }) },
    })
    const receipt = dshTranscriptUsage([
      line({ inputTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 5, outputTokens: 3, reasoningTokens: 2 }, { inputTokens: 999999 }),
      line({ inputTokens: 20, cacheReadTokens: 200, outputTokens: 4 }),
    ].join('\n'))
    expect(receipt).toMatchObject({ runtime: 'dsh', inputTokens: 30, cachedInputTokens: 300, cacheCreationInputTokens: 5, outputTokens: 7, reasoningTokens: 2, model: 'the-dsh-model' })
    expect(receipt).not.toHaveProperty('costUsd')
  })

  it('names the login that paid and where the run ran by their fixed forms', () => {
    expect(theLoginThatPaid({ ANTHROPIC_API_KEY: 'not-a-real-key' })).toBe(`${PAID_BY_THE_LOGIN_IN}ANTHROPIC_API_KEY`)
    expect(theLoginThatPaid({ CLAUDE_CONFIG_DIR: join(tmpdir(), 'no-such-claude-folder') })).toBe(RECEIPT_NOT_REPORTED)
    expect(whereItRan({})).toBe(RAN_ON_THE_HOST)
    expect(whereItRan({ SANDBOX_DIR: '/somewhere/sandboxes/w13p/' })).toBe(`${RAN_IN_THE_SANDBOX}w13p`)
  })

  it('names a credentials file from the home folder on, so no receipt carries the home folder or the user name', () => {
    const home = mkdtempSync(join(tmpdir(), 'a-home-'))
    const config = join(home, 'a-config')
    mkdirSync(join(home, '.claude'), { recursive: true })
    mkdirSync(config, { recursive: true })
    writeFileSync(join(home, '.claude', '.credentials.json'), '{}')
    writeFileSync(join(config, '.credentials.json'), '{}')
    try {
      expect(theLoginThatPaid({ HOME: home })).toBe(`${PAID_BY_THE_LOGIN_IN}~/.claude/.credentials.json`)
      expect(theLoginThatPaid({ HOME: home, CLAUDE_CONFIG_DIR: config })).toBe(`${PAID_BY_THE_LOGIN_IN}$CLAUDE_CONFIG_DIR/.credentials.json`)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('takes a receipt as read lately only for ten minutes after its readAt, and one with no readAt as not read lately', () => {
    const now = new Date(2026, 9, 5, 12, 0, 0).getTime()
    const at = (msBefore: number) => ({ readAt: localStampOf(new Date(now - msBefore)) })
    expect(aReceiptReadLately(at(0), now)).toBe(true)
    expect(aReceiptReadLately(at(A_STOP_WRITES_THE_RECEIPT_EVERY_MS - 1000), now)).toBe(true)
    expect(aReceiptReadLately(at(A_STOP_WRITES_THE_RECEIPT_EVERY_MS), now)).toBe(false)
    expect(aReceiptReadLately(at(-60_000), now), 'a readAt in the future').toBe(false)
    expect(aReceiptReadLately({ inputTokens: 1 }, now)).toBe(false)
    expect(aReceiptReadLately(undefined, now)).toBe(false)
    expect(aReceiptReadLately({ readAt: 'not a time' }, now)).toBe(false)
  })

  it('keeps outside spending only when there is some', () => {
    expect(keepingTheOutsideSpend({ outsideSpend: [] }, { inputTokens: 1 })).toEqual({ inputTokens: 1 })
    expect(keepingTheOutsideSpend(undefined, { inputTokens: 1 })).toEqual({ inputTokens: 1 })
  })
})

// ---------------------------------------------------------------------------- 2. the sealed-itself case

describe('the launcher tells a run that sealed itself apart from a fault', () => {
  it('only for a refusal of the run key it held, when a read without that key shows the run over', () => {
    for (const over of ['finished', 'crashed', 'orphaned']) expect(theRunEndedBeforeItsCommand(403, true, over), over).toBe(true)
    expect(theRunEndedBeforeItsCommand(403, false, 'finished')).toBe(false)
    expect(theRunEndedBeforeItsCommand(404, true, 'finished')).toBe(false)
    expect(theRunEndedBeforeItsCommand(200, true, 'finished')).toBe(false)
  })

  it('keeps a refusal a fault when the run still runs, or when the read without the key told nothing', () => {
    expect(theRunEndedBeforeItsCommand(403, true, 'running'), 'the run still says running').toBe(false)
    expect(theRunEndedBeforeItsCommand(403, true, 'paused'), 'a paused run was not ended').toBe(false)
    expect(theRunEndedBeforeItsCommand(403, true, undefined), 'the read without the key was not answered with the run').toBe(false)
  })
})

// ---------------------------------------------------------------------------- 3 and 4. the tools and the hooks

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
/** The key the office gave 'a-paying-run' when it was registered. The session hook on a named run is given it. */
let payingRunsKey = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE TOOLS AND HOOKS ARE REAL PROCESSES THAT ASK OVER HTTP, so they must reach this test's own server and never the
  // live office's port.
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server!.address() as { port: number }).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-receipts-'))
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'a-paying-run', name: 'A paying run' } })
  expect(registered.statusCode, registered.body).toBe(201)
  payingRunsKey = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(payingRunsKey, 'the registration gave the agent no key').not.toBe('')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

async function aRun(data: Record<string, unknown>): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title: 'a run with a receipt', data: { state: 'running', servingAgent: 'a-paying-run', ...data } } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function theReceiptOf(id: string): Promise<UsageReceipt | undefined> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  return (read.json() as { record: { data: { usageReceipt?: UsageReceipt } } }).record.data.usageReceipt
}

/** The environment a tool or hook runs in: this test's server, no sandbox, and no login but the ones named. */
function anEnvironment(more: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_WORKSPACE: 'default', MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'), ...more }
  for (const name of ['SANDBOX_DIR', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
    if (!(name in more)) delete env[name]
  }
  return env
}

function aProcess(file: string, args: string[], env: NodeJS.ProcessEnv, stdin = '', cwd = process.cwd()): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [file, ...args], { env, cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('close', (status) => done({ status, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

describe('tools/outside-spend.mjs', () => {
  const OUTSIDE = tool('../tools/outside-spend.mjs')

  it('adds an amount with its service, twice, and keeps the tokens already on the receipt', async () => {
    const run = await aRun({ usageReceipt: { inputTokens: 7 } })
    const env = anEnvironment({ MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: run })
    const first = await aProcess(OUTSIDE, ['--service', 'OpenRouter', '--usd', '0.42', '--says', 'Two reviews.'], env)
    expect(first.status, first.stderr).toBe(0)
    const second = await aProcess(OUTSIDE, ['--service', 'A search service', '--usd', '0'], env)
    expect(second.status, second.stderr).toBe(0)
    const receipt = await theReceiptOf(run)
    expect(receipt?.inputTokens).toBe(7)
    expect(receipt?.outsideSpend?.map(({ service, usd, says }) => ({ service, usd, says }))).toEqual([
      { service: 'OpenRouter', usd: 0.42, says: 'Two reviews.' },
      { service: 'A search service', usd: 0, says: undefined },
    ])
    expect(receipt?.outsideSpend?.[0]?.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  })

  it('refuses a wrong command line with exit 2 and writes nothing', async () => {
    const run = await aRun({})
    const env = anEnvironment({ MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: run })
    for (const args of [['--usd', '1'], ['--service', 'X', '--usd', 'lots'], ['--service', 'X', '--usd', '-1'], ['--service', 'X', '--usd=-1']]) {
      const ran = await aProcess(OUTSIDE, args, env)
      expect(ran.status, ran.stderr).toBe(2)
      expect(ran.stderr.trim().split('\n')).toHaveLength(1)
    }
    expect(await theReceiptOf(run)).toBeUndefined()
  })

  it('says in one sentence, with exit 1, that nothing was written when the run cannot be read', async () => {
    const ran = await aProcess(OUTSIDE, ['--service', 'X', '--usd', '1'], anEnvironment({ MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: 'no-such-run0' }))
    expect(ran.status).toBe(1)
    expect(ran.stderr.trim().split('\n')).toHaveLength(1)
    expect(ran.stderr).toContain('nothing was written')
  })
})

describe('tools/usage-so-far.mjs', () => {
  const SO_FAR = tool('../tools/usage-so-far.mjs')

  it('writes the run\u2019s usage and what served it from its own transcripts, before the seal, counting nothing older than the run', async () => {
    const cwd = join(scratch, 'a-round')
    const config = join(scratch, 'a-claude-folder')
    const run = await aRun({ workingDirectory: cwd, usageReceipt: { outsideSpend: [{ service: 'OpenRouter', usd: 1.5 }] } })
    const folder = join(config, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
    mkdirSync(folder, { recursive: true })
    const now = Date.now()
    writeFileSync(join(folder, 'a-conversation.jsonl'), [
      // AN EARLIER ROUND OF THE SAME CONVERSATION, an hour before this run was filed: not this run's.
      anAnswer('msg_earlier', new Date(now - 3_600_000), { input_tokens: 5000, output_tokens: 5000 }),
      anAnswer('msg_1', new Date(now + 60_000), { input_tokens: 4, cache_read_input_tokens: 40, cache_creation_input_tokens: 400, output_tokens: 8 }),
      anAnswer('msg_2', new Date(now + 61_000), { input_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 0, output_tokens: 2 }),
    ].join('\n') + '\n')
    const ran = await aProcess(SO_FAR, [], anEnvironment({ MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: run, CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_OAUTH_TOKEN: 'not-a-real-token' }))
    expect(ran.status, ran.stderr).toBe(0)
    const read = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: AS_THE_PERSON })
    const data = (read.json() as { record: { data: { usageReceipt: UsageReceipt; served: { model: string } } } }).record.data
    expect(data.usageReceipt).toMatchObject({
      inputTokens: 5, cachedInputTokens: 50, cacheCreationInputTokens: 400, outputTokens: 10, model: 'claude-opus-5',
      paidBy: `${PAID_BY_THE_LOGIN_IN}CLAUDE_CODE_OAUTH_TOKEN`, ranIn: RAN_ON_THE_HOST,
      outsideSpend: [{ service: 'OpenRouter', usd: 1.5 }],
    })
    expect(data.usageReceipt).not.toHaveProperty('costUsd')
    expect(data.usageReceipt.says).toContain('before the run sealed itself: its last reply, after this, is not in it.')
    expect(data.served.model).toBe('claude-opus-5')
  })

  it('says in one sentence, with exit 1, that nothing was written when the run cannot be read, and the run may seal anyway', async () => {
    const ran = await aProcess(SO_FAR, [], anEnvironment({ MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: 'no-such-run0' }))
    expect(ran.status).toBe(1)
    expect(ran.stderr.trim().split('\n')).toHaveLength(1)
    expect(ran.stderr).toContain('The run may seal anyway.')
  })
})

describe('the dsh stop hook writes the receipt beside what served the run', () => {
  it('from the transcript\u2019s usage rows, on the host where no sandbox is named, keeping outside spending', async () => {
    const run = await aRun({ runtime: 'dsh', usageReceipt: { outsideSpend: [{ service: 'OpenRouter', usd: 0.1 }] } })
    const cwd = join(scratch, 'a-dsh-project')
    const sessions = join(scratch, 'a-dsh-home', 'sessions', projectKey(cwd), 'a-dsh-session')
    mkdirSync(sessions, { recursive: true })
    const lines = [
      JSON.stringify({ type: 'session', version: 3, id: 'a-dsh-session', cwd }),
      JSON.stringify({ type: 'assistant/message', data: { message: { source: { model: 'the-dsh-model' } }, usage: { inputTokens: 11, outputTokens: 2 }, stream: [{ chunk: { type: 'usage', usage: { inputTokens: 999999 } } }] } }),
      JSON.stringify({ type: 'assistant/message', data: { message: { source: { model: 'the-dsh-model' } }, usage: { inputTokens: 22, outputTokens: 3, cacheReadTokens: 50 } } }),
    ]
    const frames = Buffer.concat(lines.map((line) => zstdCompressSync(Buffer.from(line + '\n'), { params: { [constants.ZSTD_c_checksumFlag]: 1 } })))
    writeFileSync(join(sessions, 'session.v3.jsonl.zstd'), frames)
    const ran = await aProcess(tool('../tools/dsh-hooks/stop.mjs'), [], anEnvironment({ DSH_HOME: join(scratch, 'a-dsh-home'), MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: run }), JSON.stringify({ cwd, session_id: 'a-dsh-session' }))
    expect(ran.status, ran.stderr).toBe(0)
    const receipt = await theReceiptOf(run)
    expect(receipt).toMatchObject({
      runtime: 'dsh', inputTokens: 33, cachedInputTokens: 50, outputTokens: 5, model: 'the-dsh-model',
      paidBy: RECEIPT_NOT_REPORTED, ranIn: RAN_ON_THE_HOST, outsideSpend: [{ service: 'OpenRouter', usd: 0.1 }],
    })
    expect(receipt).not.toHaveProperty('costUsd')
    expect(receipt?.readAt).toEqual(expect.any(String))
  })

  it('writes nothing at a held stop inside ten minutes, and writes the new total at the stop that lets the run go', async () => {
    const run = await aRun({ runtime: 'dsh' })
    const cwd = join(scratch, 'a-held-dsh-project')
    const home = join(scratch, 'a-held-dsh-home')
    const sessions = join(home, 'sessions', projectKey(cwd), 'a-held-session')
    mkdirSync(sessions, { recursive: true })
    mkdirSync(cwd, { recursive: true })
    const usage = (inputTokens: number) => JSON.stringify({ type: 'assistant/message', data: { message: { source: { model: 'the-dsh-model' } }, usage: { inputTokens, outputTokens: 1 } } })
    const write = (rows: string[]) => writeFileSync(join(sessions, 'session.v3.jsonl.zstd'), Buffer.concat([JSON.stringify({ type: 'session', version: 3, id: 'a-held-session', cwd }), ...rows].map((line) => zstdCompressSync(Buffer.from(line + '\n'), { params: { [constants.ZSTD_c_checksumFlag]: 1 } }))))
    const stop = () => aProcess(tool('../tools/dsh-hooks/stop.mjs'), [], anEnvironment({ DSH_HOME: home, MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_OFFICE_SESSION: run }), JSON.stringify({ cwd, session_id: 'a-held-session' }), cwd)

    // THE HOLD COUNT is kept under the hook's working folder, so this case runs in its own and leaves the worktree's alone.
    write([usage(10)])
    const first = await stop()
    expect(first.stdout, 'the run still runs unsealed, so its stop is held').toContain('"decision":"block"')
    const written = await theReceiptOf(run)
    expect(written).toMatchObject({ inputTokens: 10 })

    write([usage(10), usage(5)])
    for (const held of [2, 3]) {
      const again = await stop()
      expect(again.stdout, `stop ${String(held)} is held`).toContain('"decision":"block"')
      expect(await theReceiptOf(run), `held stop ${String(held)} inside ten minutes wrote the receipt`).toEqual(written)
    }
    const letGo = await stop()
    expect(letGo.stdout, 'the fourth stop is let go').not.toContain('"decision":"block"')
    expect(await theReceiptOf(run), 'the stop that let the run go did not write the new total').toMatchObject({ inputTokens: 15 })
  })
})

describe("a secretary's session hook writes its running total at a stop, at most once in ten minutes, and at the end", () => {
  const HOOK = tool('../tools/session-hook.mjs')
  const notes: string[] = []
  afterAll(() => {
    for (const name of notes) rmSync(join(tool('../.logs'), name), { force: true })
  })

  function theHook(mode: 'start' | 'stop' | 'end', payload: Record<string, unknown>): Promise<string> {
    const env = anEnvironment({ ANTHROPIC_API_KEY: 'not-a-real-key' })
    delete env['MOLE_OFFICE_SESSION']
    delete env['MOLE_OFFICE_AGENT']
    delete env['TMUX_PANE']
    return new Promise((done, fail) => {
      const child = execFile(process.execPath, [HOOK, mode], { encoding: 'utf8', env }, (error, _stdout, stderr) => (error === null ? done(String(stderr)) : fail(error)))
      child.stdin?.end(JSON.stringify(payload))
    })
  }

  function theRunOf(id: string) {
    const rows = t.api.listRecords({ workspaceId: 'default', kind: 'session' }).filter((row) => JSON.stringify(row.data).includes(id))
    expect(rows).toHaveLength(1)
    return rows[0]!
  }

  it('writes the transcript\u2019s total at a stop, and the same total again at the end, never added onto what is stored', async () => {
    const id = `test-receipt-${Math.random().toString(36).slice(2)}-${Date.now()}`
    notes.push(`session-${id}.json`)
    const transcript = join(scratch, `${id}.jsonl`)
    const now = Date.now()
    writeFileSync(transcript, [
      JSON.stringify({ type: 'user', timestamp: new Date(now).toISOString(), message: { content: 'hello' } }),
      anAnswer('msg_1', new Date(now + 1_000), { input_tokens: 6, cache_read_input_tokens: 60, cache_creation_input_tokens: 600, output_tokens: 9 }),
    ].join('\n') + '\n')
    await theHook('start', { session_id: id, transcript_path: transcript, cwd: process.cwd() })
    await theHook('stop', { session_id: id, transcript_path: transcript, cwd: process.cwd() })
    const atTheStop = (theRunOf(id).data as { usageReceipt?: UsageReceipt }).usageReceipt
    expect(atTheStop).toMatchObject({ inputTokens: 6, outputTokens: 9 })
    // THE END WRITES WHATEVER THE WINDOW SAYS: its readAt moves on, or a second stop written within the second shows it.
    while (localStampOf(new Date()) === atTheStop?.readAt) await new Promise((wait) => setTimeout(wait, 20))
    await theHook('end', { session_id: id, transcript_path: transcript, cwd: process.cwd() })
    const receipt = (theRunOf(id).data as { usageReceipt?: UsageReceipt }).usageReceipt
    expect(receipt).toMatchObject({ inputTokens: 6, cachedInputTokens: 60, cacheCreationInputTokens: 600, outputTokens: 9, paidBy: `${PAID_BY_THE_LOGIN_IN}ANTHROPIC_API_KEY`, ranIn: RAN_ON_THE_HOST })
    expect(receipt?.readAt, 'the end did not write the receipt').not.toBe(atTheStop?.readAt)
    expect(receipt).not.toHaveProperty('costUsd')
  }, 60_000)

  it('reads no transcript and writes nothing at a second stop inside ten minutes, and writes again after them', async () => {
    const id = `test-receipt-${Math.random().toString(36).slice(2)}-${Date.now()}`
    notes.push(`session-${id}.json`)
    const transcript = join(scratch, `${id}.jsonl`)
    const now = Date.now()
    const first = [
      JSON.stringify({ type: 'user', timestamp: new Date(now).toISOString(), message: { content: 'hello' } }),
      anAnswer('msg_1', new Date(now + 1_000), { input_tokens: 6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 9 }),
    ]
    writeFileSync(transcript, first.join('\n') + '\n')
    await theHook('start', { session_id: id, transcript_path: transcript, cwd: process.cwd() })
    await theHook('stop', { session_id: id, transcript_path: transcript, cwd: process.cwd() })
    const written = (theRunOf(id).data as { usageReceipt?: UsageReceipt }).usageReceipt
    expect(written).toMatchObject({ inputTokens: 6 })

    // A TRANSCRIPT THAT CANNOT BE READ: a stop that read it would say so on stderr.
    const said = await theHook('stop', { session_id: id, transcript_path: join(scratch, 'no-such-transcript.jsonl'), cwd: process.cwd() })
    expect(said, 'a stop inside the window read the transcript').not.toContain('could not be read')
    expect((theRunOf(id).data as { usageReceipt?: UsageReceipt }).usageReceipt, 'a stop inside the window wrote the receipt').toEqual(written)

    // ELEVEN MINUTES LATER, as the stored readAt says, the next stop reads the transcript and writes its new total.
    const run = theRunOf(id)
    t.api.patchRecord(run.id, { dataPatch: { usageReceipt: { ...written, readAt: localStampOf(new Date(Date.now() - 11 * 60_000)) } } }, t.api.HUMAN)
    writeFileSync(transcript, [...first, anAnswer('msg_2', new Date(now + 2_000), { input_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 })].join('\n') + '\n')
    await theHook('stop', { session_id: id, transcript_path: transcript, cwd: process.cwd() })
    expect((theRunOf(id).data as { usageReceipt?: UsageReceipt }).usageReceipt, 'a stop after the window wrote nothing').toMatchObject({ inputTokens: 10, outputTokens: 10 })
  }, 60_000)

  // WAVE 13s ROUND 34: a run named by MOLE_OFFICE_SESSION has no note, so before a decision its stop wrote nothing at
  // all. Mutations: the environment's run left unread at a stop (red); the transcript counted
  // from its start rather than the run's filing (red); a run that is over written to anyway (red).
  it("writes the receipt of a run the environment names, counting only from the run's filing, and never on a run that is over", async () => {
    const run = await aRun({ runtime: 'claude-code' })
    const filed = Date.parse((await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: AS_THE_PERSON })).json().record.createdAt.replace(' ', 'T'))
    const id = `test-receipt-${Math.random().toString(36).slice(2)}-${Date.now()}`
    const transcript = join(scratch, `${id}.jsonl`)
    writeFileSync(transcript, [
      anAnswer('msg_before', new Date(filed - 60_000), { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1000 }),
      anAnswer('msg_after', new Date(filed + 1_000), { input_tokens: 6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 9 }),
    ].join('\n') + '\n')
    const theNamedHook = (mode: 'stop' | 'end') => new Promise<string>((done, fail) => {
      const env = anEnvironment({ ANTHROPIC_API_KEY: 'not-a-real-key', MOLE_OFFICE_SESSION: run, MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_AGENT_KEY: payingRunsKey })
      delete env['TMUX_PANE']
      delete env['MOLE_AGENT_KEY_FILE']
      const child = execFile(process.execPath, [HOOK, mode], { encoding: 'utf8', env }, (error, _stdout, stderr) => (error === null ? done(String(stderr)) : fail(error)))
      child.stdin?.end(JSON.stringify({ session_id: id, transcript_path: transcript, cwd: process.cwd() }))
    })
    const said = await theNamedHook('stop')
    expect(await theReceiptOf(run), said).toMatchObject({ inputTokens: 6, outputTokens: 9, paidBy: `${PAID_BY_THE_LOGIN_IN}ANTHROPIC_API_KEY` })

    const over = await aRun({ runtime: 'claude-code', state: 'paused' })
    const env = anEnvironment({ ANTHROPIC_API_KEY: 'not-a-real-key', MOLE_OFFICE_SESSION: over, MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_AGENT_KEY: payingRunsKey })
    delete env['TMUX_PANE']
    delete env['MOLE_AGENT_KEY_FILE']
    await new Promise<void>((done, fail) => {
      const child = execFile(process.execPath, [HOOK, 'end'], { encoding: 'utf8', env }, (error) => (error === null ? done() : fail(error)))
      child.stdin?.end(JSON.stringify({ session_id: `${id}-over`, transcript_path: transcript, cwd: process.cwd() }))
    })
    expect(await theReceiptOf(over)).toBeUndefined()
  }, 60_000)

  // WAVE 13s ROUND 34b (check JkBz3EBgIBlZ): a stop or end that cannot read the run the environment names says so on
  // stderr, in either of two sentences, and exits 0. `ask` catches every failure of a request, so the second sentence
  // is reached only by a reply that throws when it is read: a preloaded module gives the hook that reply. Mutations:
  // the first sentence left out (red); the second sentence left out (red).
  it('says on stderr, in its own sentence, why the receipt of a run the environment names was not written', async () => {
    const named = (run: string, more: Record<string, string> = {}) => {
      const env = anEnvironment({ ANTHROPIC_API_KEY: 'not-a-real-key', MOLE_OFFICE_SESSION: run, MOLE_OFFICE_AGENT: 'a-paying-run', MOLE_AGENT_KEY: payingRunsKey, ...more })
      delete env['TMUX_PANE']
      delete env['MOLE_AGENT_KEY_FILE']
      return env
    }
    const payload = (mode: string) => JSON.stringify({ session_id: `test-unread-${mode}-${Date.now()}`, transcript_path: join(scratch, 'none.jsonl'), cwd: process.cwd() })

    // THE OFFICE ANSWERS WITHOUT THE RECORD: a run it does not hold.
    for (const mode of ['stop', 'end']) {
      const said = await aProcess(HOOK, [mode], named('noSuchRun0001'), payload(mode))
      expect(said.status, said.stderr).toBe(0)
      expect(said.stderr).toContain('session-hook: the usage receipt of run noSuchRun0001 was not written, because the office did not answer with its record (status 404: ')
    }

    // THE REPLY CANNOT BE READ: the hook's own GET of the run is answered with a body that throws when it is read.
    const run = await aRun({ runtime: 'claude-code' })
    const preload = join(scratch, 'a-reply-that-cannot-be-read.mjs')
    writeFileSync(preload, [
      'const real = globalThis.fetch',
      'globalThis.fetch = async (input, options) => {',
      '  const asked = new URL(String(input instanceof Request ? input.url : input))',
      "  if ((options?.method ?? 'GET') === 'GET' && asked.pathname === `/api/records/${process.env.MOLE_OFFICE_SESSION}`) {",
      "    return { status: 200, headers: new Headers(), json: async () => ({ get record() { throw new Error('a reply that cannot be read') } }) }",
      '  }',
      '  return real(input, options)',
      '}',
    ].join('\n'))
    for (const mode of ['stop', 'end']) {
      const said = await aProcess(HOOK, [mode], named(run, { NODE_OPTIONS: `--import ${pathToFileURL(preload).href}` }), payload(mode))
      expect(said.status, said.stderr).toBe(0)
      expect(said.stderr).toContain(`session-hook: the usage receipt of run ${run} was not written, because its record could not be read (a reply that cannot be read).`)
    }
    expect(await theReceiptOf(run)).toBeUndefined()
  }, 60_000)
})

// ---------------------------------------------------------------------------- 5. the page

describe('the receipt on a page', () => {
  type ReceiptModule = typeof import('../src/web/components/UsageReceipt.tsx')
  type I18n = typeof import('../src/shared/i18n.ts')
  let shown: ReceiptModule
  let i18n: I18n
  beforeAll(async () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    ;(globalThis as unknown as { window: unknown }).window ??= {
      localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      addEventListener: () => {}, removeEventListener: () => {},
    }
    shown = await import('../src/web/components/UsageReceipt.tsx')
    i18n = await import('../src/shared/i18n.ts')
  })
  afterAll(() => i18n.setWordLanguage('en'))

  const A_RECEIPT: UsageReceipt = {
    inputTokens: 5, paidBy: `${PAID_BY_THE_LOGIN_IN}CLAUDE_CODE_OAUTH_TOKEN`, ranIn: `${RAN_IN_THE_SANDBOX}w13p`,
    outsideSpend: [{ service: 'OpenRouter', usd: 0.42 }],
  }
  const drawn = (receipt: UsageReceipt): string => renderToStaticMarkup(h(shown.UsageReceipt, { receipt })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('says Not reported for an absent number, and who paid, where it ran and what was spent outside', () => {
    i18n.setWordLanguage('en')
    const text = drawn(A_RECEIPT)
    expect(text).toContain('Cost reported by the runtime Not reported')
    expect(text).not.toContain('Not given')
    expect(text).toContain('Paid by The Claude Code login in CLAUDE_CODE_OAUTH_TOKEN')
    expect(text).toContain('Ran In the sandbox w13p')
    expect(text).toContain('Spent outside the office 0.42 US dollars on OpenRouter')
    expect(drawn({ paidBy: RECEIPT_NOT_REPORTED, ranIn: RAN_ON_THE_HOST })).toContain('Paid by Not reported Ran On the host Spent outside the office None recorded')
  })

  it('says the same in Chinese', () => {
    i18n.setWordLanguage('zh')
    const text = drawn(A_RECEIPT)
    expect(text).toContain('未报告')
    expect(text).toContain('CLAUDE_CODE_OAUTH_TOKEN 里的 Claude Code 登录')
    expect(text).toContain('在沙箱 w13p 里')
    expect(text).toContain('OpenRouter：0.42 美元')
    expect(text).not.toContain('Paid by')
  })

  it('draws the model the runtime named, and never the model the run asked for (the tool maintainer, Dxiry_2y6vuD point 3)', () => {
    i18n.setWordLanguage('en')
    const text = drawn({ model: 'deepseek-synthetic-served', modelRequested: 'deepseek-flash' })
    expect(text).toContain('Model deepseek-synthetic-served')
    expect(text).not.toContain('deepseek-flash')
    expect(drawn({ modelRequested: 'deepseek-flash' })).toContain('Model Not reported')
  })

  it('says when the usage was read, or that nobody recorded it', () => {
    i18n.setWordLanguage('en')
    const markup = renderToStaticMarkup(h(shown.UsageReceipt, { receipt: { ...A_RECEIPT, readAt: '2026-10-05T10:00:00.000Z' } }))
    expect(markup).toMatch(/Usage read[^]*<time[^>]*dateTime="2026-10-05T10:00:00.000Z"/i)
    expect(drawn(A_RECEIPT)).toContain('Usage read Not recorded')
    i18n.setWordLanguage('zh')
    expect(drawn(A_RECEIPT)).toContain('用量读取于')
  })

  it('lets a narrow page break a login folder after a slash and never inside a name', () => {
    i18n.setWordLanguage('en')
    const markup = renderToStaticMarkup(h(shown.UsageReceipt, { receipt: { paidBy: `${PAID_BY_THE_LOGIN_IN}/srv/someone/.codex/auth.json` } }))
    expect(markup).toContain('/<wbr/>srv</span>')
    expect(markup).toContain('/<wbr/>.codex</span>')
    expect(markup).toContain('/<wbr/>auth.json</span>')
    expect(markup).not.toMatch(/<wbr\/>[^<]*<wbr\/>/)
    expect(drawn({ paidBy: `${PAID_BY_THE_LOGIN_IN}/srv/someone/.codex/auth.json` })).toContain('Paid by The Claude Code login in / srv / someone / .codex / auth.json')
  })
})
