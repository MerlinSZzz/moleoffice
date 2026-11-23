// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DSH RUN'S RECEIPT SAYS WHY IT HOLDS NO NUMBERS WHEN THE RUN'S OWN TRANSCRIPT WAS NOT READ.
 *
 * The dsh stop hook writes a run's usage receipt from the run's own transcript. When the transcript gave no text,
 * because none was found, its file could not be read, or its text was past the most a transcript is decoded to, the
 * hook read an empty text and wrote a receipt with no numbers and no reason. So the longest runs went short in the usage
 * figures, and nobody was told. The seal's own receipt said such a transcript "could not be decoded", which is not why
 * when its text was past the most.
 *
 * WHAT IS PROVED, one case each:
 *   - The stop hook's receipt, for a transcript one byte past the most, for a session with no transcript, and for bytes
 *     that are not whole zstd frames: no number, and words that say the run's own transcript was not read and why,
 *     before the reader's own words.
 *   - The stop hook's receipt for a transcript it read: its numbers, and no such words. A control, green before the
 *     change too.
 *   - The seal's receipt for a transcript one byte past the most: no number, and words that say it was not read and why.
 *
 * Nothing here is a real transcript: each is spaces or made-up lines, compressed by Node's own zstd, in this test's own
 * temporary folder. The hook runs as a process of its own against this test's own server, never the live office.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, zstdCompressSync } from 'node:zlib'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { USAGE_NUMBERS } from '../src/config/usage.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { UsageReceipt } from '../src/shared/usage-receipts.ts'
import { projectKey, THE_MOST_OF_A_TRANSCRIPTS_TEXT } from '../tools/dsh-hooks/served.mjs'
import { SELF_REPORTED, theSealsReceipt } from '../tools/the-seal-receipt.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const STOP = fileURLToPath(new URL('../tools/dsh-hooks/stop.mjs', import.meta.url))
const PAST_THE_MOST = `its text is longer than ${String(THE_MOST_OF_A_TRANSCRIPTS_TEXT)} bytes, the most a transcript is decoded to`
const NOTHING_GIVEN = 'Not given in this output: tokens in, cached tokens, tokens out, model, duration. dsh reports no cost.'

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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE HOOK IS A REAL PROCESS THAT ASKS OVER HTTP, so it must reach this test's own server and never the live office's port.
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server!.address() as { port: number }).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-dsh-receipt-'))
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'a-dsh-run', name: 'A dsh run' } })
  expect(registered.statusCode, registered.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

async function aRun(): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title: 'a dsh run with a receipt', data: { state: 'running', runtime: 'dsh', servingAgent: 'a-dsh-run' } } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function theReceiptOf(id: string): Promise<UsageReceipt | undefined> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  return (read.json() as { record: { data: { usageReceipt?: UsageReceipt } } }).record.data.usageReceipt
}

/** The environment the hook runs in: this test's server, no sandbox, and no login. */
function anEnvironment(more: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_WORKSPACE: 'default', MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'), ...more }
  for (const name of ['SANDBOX_DIR', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
    if (!(name in more)) delete env[name]
  }
  return env
}

function aProcess(file: string, env: NodeJS.ProcessEnv, stdin: string, cwd: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [file], { env, cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('close', (status) => done({ status, stdout, stderr }))
    child.stdin.end(stdin)
  })
}

/** One zstd frame of the bytes given, as dsh compresses one write: with the checksum flag. */
const aFrame = (bytes: Buffer): Buffer => zstdCompressSync(bytes, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })

/** A frame whose text is one byte past the most a transcript is decoded to. */
const aFramePastTheMost = (): Buffer => aFrame(Buffer.alloc(THE_MOST_OF_A_TRANSCRIPTS_TEXT + 1, 0x20))

/** A dsh home in this test's folder, holding one session of `cwd`, whose transcript file holds `bytes`, or no transcript when `bytes` is null. */
function aDshHome(name: string, cwd: string, session: string, bytes: Buffer | null): string {
  const home = join(scratch, name)
  const folder = join(home, 'sessions', projectKey(cwd), session)
  mkdirSync(folder, { recursive: true })
  mkdirSync(cwd, { recursive: true })
  if (bytes !== null) writeFileSync(join(folder, 'session.v3.jsonl.zstd'), bytes)
  return home
}

/** The receipt the stop hook wrote for a new dsh run, run once in `cwd`, so the hold count it keeps is in this test's folder. */
async function theReceiptAfterAStop(name: string, bytes: Buffer | null): Promise<UsageReceipt | undefined> {
  const run = await aRun()
  const cwd = join(scratch, name)
  const home = aDshHome(`${name}-home`, cwd, `${name}-session`, bytes)
  const ran = await aProcess(STOP, anEnvironment({ DSH_HOME: home, MOLE_OFFICE_AGENT: 'a-dsh-run', MOLE_OFFICE_SESSION: run }), JSON.stringify({ cwd, session_id: `${name}-session` }), cwd)
  expect(ran.status, ran.stderr).toBe(0)
  return theReceiptOf(run)
}

const theNumbersIn = (receipt: object | undefined): string[] =>
  Object.keys(receipt ?? {}).filter((name) => (USAGE_NUMBERS as readonly string[]).includes(name))

describe('the dsh stop hook says why its receipt holds no numbers', () => {
  it('for a transcript whose text is one byte past the most', async () => {
    const receipt = await theReceiptAfterAStop('past-the-most', aFramePastTheMost())
    expect(theNumbersIn(receipt)).toEqual([])
    expect(receipt?.says).toBe(`The run's own transcript was not read: ${PAST_THE_MOST}. ${NOTHING_GIVEN}`)
  })

  it('for a session with no transcript', async () => {
    const receipt = await theReceiptAfterAStop('no-transcript', null)
    expect(theNumbersIn(receipt)).toEqual([])
    expect(receipt?.says).toBe(`The run's own transcript was not read: no transcript of this dsh session was found. ${NOTHING_GIVEN}`)
  })

  it('for a transcript whose bytes are not whole zstd frames', async () => {
    const receipt = await theReceiptAfterAStop('not-whole-frames', Buffer.concat([aFrame(Buffer.from('{"type":"session"}\n')), Buffer.from('not a frame')]))
    expect(theNumbersIn(receipt)).toEqual([])
    expect(receipt?.says).toBe(`The run's own transcript was not read: its bytes are not whole zstd frames. ${NOTHING_GIVEN}`)
  })

  it('and writes the numbers with no such words for a transcript it read (a control, green before the change too)', async () => {
    const lines = [
      JSON.stringify({ type: 'session', version: 3, id: 'a-read-session' }),
      JSON.stringify({ type: 'assistant/message', data: { message: { source: { model: 'the-dsh-model' } }, usage: { inputTokens: 11, outputTokens: 2 } } }),
    ]
    const receipt = await theReceiptAfterAStop('read', Buffer.concat(lines.map((line) => aFrame(Buffer.from(`${line}\n`)))))
    expect(receipt).toMatchObject({ inputTokens: 11, outputTokens: 2, model: 'the-dsh-model' })
    expect(receipt?.says).not.toContain('was not read')
  })
})

describe("the seal's own receipt says why a dsh transcript was not read", () => {
  it('for a transcript whose text is one byte past the most', () => {
    const cwd = join(scratch, 'a-sealed-run')
    const home = aDshHome('a-sealed-run-home', cwd, 'a-sealed-session', aFramePastTheMost())
    const record = { id: 'aSealedRun01', kind: 'session', createdAt: '2026-11-22 05:00:00', data: { runtime: 'dsh', state: 'running', workingDirectory: cwd } }
    const read = theSealsReceipt({ record, env: { HOME: scratch, DSH_HOME: home, DSH_SESSION_ID: 'a-sealed-session', MOLE_OFFICE_SESSION: 'aSealedRun01' }, cwd })
    const why = `the transcript of the run's dsh session was not read: ${PAST_THE_MOST}.`
    expect(theNumbersIn(read.receipt)).toEqual([])
    expect(read.receipt.says).toBe(`No numbers were read at the seal: ${why} ${SELF_REPORTED}`)
    expect(read.added).toBe(`A usage receipt with no numbers: ${why}`)
  })
})
