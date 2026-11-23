// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOST JOB SHOWS THE DIGESTS THE OFFICE COMPUTED, IN BASE64, SO AN AGENT CAN COMPARE THEM.
 *
 * A host job record keeps the sha256 of its program and of each output as 64 hexadecimal characters. Every reply an
 * agent reads through the office tool has each run of 64 hexadecimal characters masked as a key, so those digests could
 * not be read back, and a lab's outputs could not be compared. GET /api/host-jobs/<id> now answers `digests` beside the
 * job: the program's sha256 and each output's, in canonical base64, worked out from the stored hex in one place
 * (`theDigestsOfAHostJob` in src/server/lib/host-jobs.ts). What a tool prints is masked as before (decision
 * 3hQme-j-ukjV), so a key the tool prints is still not shown, in hex or in base64, and neither is a digest the tool
 * prints itself. A digest is told apart from a key by where it comes from, not by its shape: the office works its
 * digests out from the record's own hex, and they never pass the mask.
 *
 * The tool here is a stand-in: a small shell script in a scratch folder, registered only in this file, through the
 * secretary's door, on a decision the person made in this test office. The key it prints is made up here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Through the office tool, as the asking run, the job's program digest is shown in base64 and is the sha256 of
 *      the registered program, while the record's own hex field reads as a masked key in the same reply.
 *   2. Each output the runner hashed is shown by name, with the base64 sha256 of the bytes the tool wrote: one it
 *      returned and one too large to return. An output that is missing and one that is a folder have no digest.
 *   3. A made-up key the tool prints in its log and in an output's text is still masked: what the asker reads holds
 *      it neither in hex nor in base64, and the record says where it was masked.
 *   4. Every digest shown is canonical base64 of 32 bytes, and it decodes to the hex the record holds.
 *   5. A stored sha256 that is not 64 hexadecimal characters is not shown as a digest: the read fails loudly.
 *   6. A made-up key in base64 holding a `/` and a `+`, and the base64 sha256 of an output, each printed by the tool in
 *      its log, are hidden whole there, and no 8 characters of either are shown in the log. The digest the office
 *      computed of that same output is still shown whole beside it.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the hand-back of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the digests left out of the door's answer: cases 1, 2 and 4 go red;
 *   - the digest given in hex and not in base64: cases 1 and 4 go red;
 *   - an output with no sha256 given an entry: case 2 goes red;
 *   - the log filed unmasked: case 3 goes red;
 *   - the check on the stored hex taken out: case 5 goes red;
 *   - the digests the office computed passed through the host job mask: cases 1, 2, 4 and 6 go red.
 */

import type { AddressInfo } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { A_KEY_IN_BASE64, theSha256Of } from '../src/config/host-tools.mjs'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_KEY_SHOWN_AS, askTheOffice } from '../tools/office-request.mjs'
import { runOnce } from '../tools/run-the-host-jobs.mjs'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

/** Made-up keys, written before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
/** The made-up key the stand-in prints, as a tool that leaks a key would. */
const A_MADE_UP_KEY_THE_TOOL_PRINTS = randomBytes(32).toString('hex')
/**
 * A made-up key in base64 the stand-in prints, from a fixed seed so that the case is the same on every run. It holds a
 * `/` and a `+`, which the printed-line mask stopped at. How often the mask misses a key is measured in
 * tests/the-host-job-mask-hides-a-base64-key-whole.test.ts, on 957 keys and more.
 */
const A_MADE_UP_KEY_IN_BASE64 = createHash('sha256').update('a made-up key 9').digest('base64')

const ASKER = 'a-lab-worker'
/** The shape of a sha256 in canonical base64: 32 bytes, so 43 characters and one "=", the last character's low bits 0. */
const A_DIGEST_IN_BASE64 = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let work = ''
let runnerFolder = ''
let toolsFile = ''
let theDecision = ''
let program = { path: '', sha256: '' }
const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

interface ARun {
  id: string
  key: string
  handle: string
}

function asTheRun(run: ARun): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': run.handle,
    'x-mole-office-session': run.id,
    'x-mole-office-key': run.key,
  }
}

async function send(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: any; text: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as Record<string, unknown> }) })
  let parsed: any = null
  try {
    parsed = reply.json()
  } catch {
    parsed = null
  }
  return { status: reply.statusCode, body: parsed, text: reply.body }
}

async function register(handle: string, role: string): Promise<void> {
  const reply = await send('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role, runtime: 'claude-code' })
  expect(reply.status, `registering ${handle}: ${reply.text.slice(0, 300)}`).toBe(201)
  idOf[handle] = reply.body.agent.id
  keyOf[handle] = String(reply.body.whatToGiveIt?.key ?? '')
}

async function aRunOf(handle: string): Promise<ARun> {
  const title = `A run of ${handle}`
  const filed = await send('POST', '/api/records', AS_THE_OFFICE_WORKER, {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[handle], doing: title },
  })
  expect(filed.status, filed.text.slice(0, 400)).toBe(201)
  return { id: filed.body.record.id, key: String(filed.body.runKey?.key), handle }
}

/** Asks as the run, through the office tool, with the run's identity in the environment as a sandbox gives it. */
async function askAsTheRun(run: ARun, path: string, fields: string[] | 'whole'): Promise<{ status: number | null; body: string }> {
  const keyBefore = process.env['MOLE_AGENT_KEY']
  process.env['MOLE_AGENT_KEY'] = run.key
  try {
    const env = { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_AGENT: run.handle, MOLE_OFFICE_SESSION: run.id, MOLE_OFFICE_WORKSPACE: 'default' }
    const answer = (await askTheOffice({ method: 'GET', path, fields }, { env })) as { status: number | null; body: string }
    return { status: answer.status, body: String(answer.body) }
  } finally {
    if (keyBefore === undefined) delete process.env['MOLE_AGENT_KEY']
    else process.env['MOLE_AGENT_KEY'] = keyBefore
  }
}

function theJobData(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

function inBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64')
}

/** The bytes the stand-in writes, so the test can hash them itself. */
const RETURNED = 'the result a lab would compare'
const TOO_LARGE = 'x'.repeat(300)
/** The sha256 of an output in base64, as the office shows it, and as a tool may print it itself. */
const THE_RETURNED_DIGEST = createHash('sha256').update(RETURNED).digest('base64')

let run: ARun
let jobId = ''

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  toolsFile = join(dirname(t.file), 'host-tools.json')
  runnerFolder = join(dirname(t.file), 'host-jobs')
  mkdirSync(runnerFolder, { mode: 0o700 })
  scratch = aTestDatabaseFolder('host-job-digests')
  work = join(scratch, 'work')
  mkdirSync(join(scratch, 'bin'), { recursive: true })
  // MODE 755 WHATEVER THE UMASK, since a program in a folder others may write is refused.
  chmodSync(join(scratch, 'bin'), 0o755)
  mkdirSync(work)
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await register(ASKER, 'worker')
  await register(THE_TEST_OFFICES_SECRETARY.handle, 'secretary')

  const words = await send('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'What the person said about host tools', data: { body: 'the office runs the registered stand-in' } })
  expect(words.status, words.text.slice(0, 300)).toBe(201)
  const decided = await send('POST', '/api/records', AS_THE_PERSON, {
    kind: 'decision',
    title: 'The office runs a registered stand-in host tool',
    data: {
      ...governsTheWholeProject(),
      replaces: [], option_taken: 'register the stand-in', because: 'this test office needs it', decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: words.body.record.id },
  })
  expect(decided.status, decided.text.slice(0, 300)).toBe(201)
  theDecision = decided.body.record.id

  const path = join(scratch, 'bin', 'digester')
  writeFileSync(path, [
    '#!/bin/sh',
    `printf '%s' '${RETURNED}' > "$HOST_JOB_OUTPUT/RESULT.txt"`,
    `printf '%s' '${TOO_LARGE}' > "$HOST_JOB_OUTPUT/LARGE.txt"`,
    'mkdir "$HOST_JOB_OUTPUT/A_FOLDER"',
    `echo "the key is ${A_MADE_UP_KEY_THE_TOOL_PRINTS}"`,
    `echo "the key is ${A_MADE_UP_KEY_THE_TOOL_PRINTS}" > "$HOST_JOB_OUTPUT/SAID.txt"`,
    `echo "a made-up key in base64 is ${A_MADE_UP_KEY_IN_BASE64}"`,
    `echo "the digest of RESULT.txt is ${THE_RETURNED_DIGEST}"`,
    '',
  ].join('\n'), { mode: 0o755 })
  chmodSync(path, 0o755)
  program = { path, sha256: theSha256Of(path) }
  const registered = await send('POST', '/api/host-tools', {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
    'x-mole-office-key': keyOf[THE_TEST_OFFICES_SECRETARY.handle] ?? '',
  }, {
    declaration: {
      name: 'digester',
      what: 'a stand-in for this test only, which writes outputs to hash and prints a made-up key',
      program,
      argv: [],
      arguments: {},
      folder: work,
      timeLimitSeconds: 20,
      outputs: [
        { name: 'RESULT.txt', maxBytes: 1000 },
        { name: 'LARGE.txt', maxBytes: 100 },
        { name: 'SAID.txt', maxBytes: 1000 },
        { name: 'A_FOLDER', maxBytes: 1000 },
        { name: 'MISSING.txt', maxBytes: 1000 },
      ],
      logLines: 20,
      mayAsk: { agents: [idOf[ASKER]] },
    },
    decision: theDecision,
  })
  expect(registered.status, registered.text.slice(0, 500)).toBe(201)

  run = await aRunOf(ASKER)
  const asked = await send('POST', '/api/host-jobs', asTheRun(run), { tool: 'digester', arguments: {} })
  expect(asked.status, asked.text.slice(0, 500)).toBe(201)
  jobId = asked.body.job.id as string
  expect(await runOnce({ api, key: A_MADE_UP_OFFICE_KEY, folder: runnerFolder, toolsFile, graceMs: 300 })).toBe(0)
  expect(theJobData(jobId)['state'], JSON.stringify(theJobData(jobId)).slice(0, 600)).toBe('finished')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

it("1: the program's digest is shown in base64 through the office tool, while the record's hex field reads as a masked key", async () => {
  const read = await askAsTheRun(run, `/api/host-jobs/${jobId}`, ['job.data.sha256', 'digests.program'])
  expect(read.status, read.body.slice(0, 500)).toBe(200)
  const body = JSON.parse(read.body) as { job: { data: { sha256: string } }; digests: { program: { sha256Base64: string } } }
  expect(body.job.data.sha256, 'the hex the record holds is masked as a key on its way to the agent').toBe(A_KEY_SHOWN_AS)
  expect(body.digests.program.sha256Base64).toBe(inBase64(program.sha256))
})

it('2: each output the runner hashed is shown by name with the sha256 of the bytes the tool wrote, and one with no hash has no digest', async () => {
  const read = await askAsTheRun(run, `/api/host-jobs/${jobId}`, ['digests.outputs'])
  expect(read.status, read.body.slice(0, 500)).toBe(200)
  const shown = (JSON.parse(read.body) as { digests: { outputs: { name: string; sha256Base64: string }[] } }).digests.outputs
  const sha256 = (text: string): string => createHash('sha256').update(text).digest('base64')
  expect(shown).toEqual([
    { name: 'RESULT.txt', sha256Base64: sha256(RETURNED) },
    { name: 'LARGE.txt', sha256Base64: sha256(TOO_LARGE) },
    { name: 'SAID.txt', sha256Base64: sha256(`the key is ${A_MADE_UP_KEY_THE_TOOL_PRINTS}\n`) },
  ])
  const states = Object.fromEntries((theJobData(jobId)['outputs'] as { name: string; state: string }[]).map((one) => [one.name, one.state]))
  expect(states).toEqual({ 'RESULT.txt': 'returned', 'LARGE.txt': 'too large', 'SAID.txt': 'returned', A_FOLDER: 'not a regular file', 'MISSING.txt': 'missing' })
})

it('3: a key the tool prints is still masked, in its log and in an output, and is shown neither in hex nor in base64', async () => {
  const whole = await send('GET', `/api/host-jobs/${jobId}`, asTheRun(run))
  expect(whole.status, whole.text.slice(0, 500)).toBe(200)
  const through = await askAsTheRun(run, `/api/host-jobs/${jobId}`, 'whole')
  expect(through.status, through.body.slice(0, 500)).toBe(200)
  for (const reply of [whole.text, through.body]) {
    expect(reply).not.toContain(A_MADE_UP_KEY_THE_TOOL_PRINTS)
    expect(reply).not.toContain(inBase64(A_MADE_UP_KEY_THE_TOOL_PRINTS))
  }
  expect(whole.body.job.data.logTail).toContain('the key is <')
  expect(whole.body.job.data.masked).toEqual(expect.arrayContaining(['the log', 'SAID.txt']))
})

it('4: every digest shown is canonical base64 of 32 bytes, and it decodes to the hex the record holds', async () => {
  const read = await send('GET', `/api/host-jobs/${jobId}`, asTheRun(run))
  expect(read.status, read.text.slice(0, 500)).toBe(200)
  const digests = read.body.digests as { program: { sha256Base64: string }; outputs: { name: string; sha256Base64: string }[] }
  const stored = theJobData(jobId)
  const hexOf: Record<string, string> = Object.fromEntries((stored['outputs'] as { name: string; sha256?: string }[]).flatMap((one) => (one.sha256 === undefined ? [] : [[one.name, one.sha256]])))
  expect(digests.program.sha256Base64).toMatch(A_DIGEST_IN_BASE64)
  expect(Buffer.from(digests.program.sha256Base64, 'base64').toString('hex')).toBe(stored['sha256'])
  expect(digests.outputs.map((one) => one.name)).toEqual(Object.keys(hexOf))
  for (const one of digests.outputs) {
    expect(one.sha256Base64, one.name).toMatch(A_DIGEST_IN_BASE64)
    expect(Buffer.from(one.sha256Base64, 'base64').toString('hex'), one.name).toBe(hexOf[one.name])
  }
})

it('5: a stored sha256 that is not 64 hexadecimal characters is not shown as a digest, and the read fails', async () => {
  const run2 = await aRunOf(ASKER)
  const asked = await send('POST', '/api/host-jobs', asTheRun(run2), { tool: 'digester', arguments: {} })
  expect(asked.status, asked.text.slice(0, 500)).toBe(201)
  const id = asked.body.job.id as string
  // A HAND-MADE ROW: the office writes only 64 hexadecimal characters here, so this is the broken assumption itself.
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sha256', ?) WHERE id = ?").run(program.sha256.slice(0, 63) + 'z', id)
  const read = await send('GET', `/api/host-jobs/${id}`, asTheRun(run2))
  expect(read.status, read.text.slice(0, 500)).toBe(500)
  expect(read.text).not.toContain('sha256Base64')
})

it("6: a key in base64 and an output's digest the tool prints are hidden whole in its log, while the office's digest of that output is shown", async () => {
  expect(A_MADE_UP_KEY_IN_BASE64).toMatch(/\//)
  expect(A_MADE_UP_KEY_IN_BASE64).toMatch(/\+/)
  const read = await askAsTheRun(run, `/api/host-jobs/${jobId}`, ['job.data.logTail', 'digests.outputs'])
  expect(read.status, read.body.slice(0, 500)).toBe(200)
  const body = JSON.parse(read.body) as { job: { data: { logTail: string } }; digests: { outputs: { name: string; sha256Base64: string }[] } }
  const log = body.job.data.logTail
  expect(log).toContain(`a made-up key in base64 is ${A_KEY_IN_BASE64}\n`)
  expect(log).toContain(`the digest of RESULT.txt is ${A_KEY_IN_BASE64}\n`)
  for (const shown of [A_MADE_UP_KEY_IN_BASE64, THE_RETURNED_DIGEST]) {
    const pieces = Array.from({ length: shown.length - 7 }, (_, at) => shown.slice(at, at + 8))
    expect(pieces.filter((piece) => log.includes(piece)), 'pieces of 8 characters shown in the log').toEqual([])
  }
  expect(body.digests.outputs.find((one) => one.name === 'RESULT.txt')?.sha256Base64).toBe(THE_RETURNED_DIGEST)
})
