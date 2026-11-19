// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED DSH TRANSCRIPT IS COUNTED ONCE FOR THE CHECK (wave 13r round AA). When the check tool's last line carries a
 * dsh transcript the line's reader refuses, the message worker says so when it reports that the tool ended, and the
 * office counts the gate a-dsh-checks-transcript-is-its-own once, in the call that writes the tool's ending. A call
 * repeated after that, as the worker repeats one whose reply did not come, counts nothing. A line refused for another
 * reason says nothing of a transcript, and a report in the shape older workers send is still taken.
 *
 * The database, server, worker passes and process ledger are real. The two check tools are made-up stand-ins written
 * into a scratch folder: they print one made-up line and exit, and run no model. Nothing reaches the live office.
 *
 * WHAT GOES RED. Control run first. Take the count out, count a repeated report, count without the worker's word, let
 * the worker say it for a line refused for another reason, or refuse the older shape, and a case here turns red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { INSPECTION_USAGE_LINE } from '../src/config/usage.mjs'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

const GATE = 'a-dsh-checks-transcript-is-its-own'
let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let tree = ''
let tools = ''
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []
const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const person = as('human', THE_PERSON)
const worker = as('agent', 'worker-w')
const officeWorker = as('agent', 'mole-office/the-message-worker')
interface Check { message: string; execution?: { session: string; endedAt?: string; failed?: string }; says: string }

// The two lines a made-up check tool prints last. The first carries a transcript read from outside the check's own
// sessions folder, which the line's reader refuses. The second is not JSON, which the reader refuses for another reason.
const A_REFUSED_TRANSCRIPT = INSPECTION_USAGE_LINE + JSON.stringify({ runtime: 'dsh', output: '', transcript: { text: 'Made-up transcript.', from: '/made-up/elsewhere/session.jsonl' } })
const A_LINE_THAT_IS_NOT_JSON = `${INSPECTION_USAGE_LINE}made-up, and not JSON`

function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `dsh-transcript-${what}-`)))
  made.push(dir)
  return dir
}
/** A made-up check tool that prints `line` and exits 1, as a check that wrote no verdict does. */
function aToolThatPrints(name: string, line: string): string {
  const file = join(tools, `${name}.mjs`)
  writeFileSync(file, `// A made-up check tool. It runs no model and judges no work.\nprocess.stdout.write(${JSON.stringify(`${line}\n`)})\nprocess.exitCode = 1\n`)
  return file
}
function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}
function check(run: string): Check { return t.api.getRecord(run)!.data['theCheck'] as Check }
function counted(): number {
  return (t.client.sqlite.prepare('SELECT coalesce(sum(would_stop), 0) AS n FROM gate_counts WHERE gate = ?').get(GATE) as {n: number}).n
}
async function sealed(title: string): Promise<string> {
  const run = t.api.createRecord({ kind: 'session', title, workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
    data: { state: 'running', servingAgent: 'worker-w', workingDirectory: tree, cutFrom: 'main', doing: 'Made-up fixture changes work/a.txt.' } }).id
  const ended = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, worker)
  expect(ended.status, ended.raw).toBe(200)
  if (!check(run).message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, {}, person)
    expect(asked.status, asked.raw).toBe(200)
  }
  expect(check(run).message).toBeTruthy()
  return run
}
/** Start the run's check with `tool`, wait for the tool to end, and let the worker report the ending. */
async function aCheckWhoseToolPrinted(run: string, tool: string): Promise<string> {
  settings.env = { ...settings.env, MOLE_OFFICE_FAKE_INSPECTION_TOOL: tool }
  const pass = await onePass(settings, watching)
  const session = check(run).execution?.session
  expect(pass.started.some(r => r.session === session), JSON.stringify(pass)).toBe(true)
  const processRun = watching.find(r => r.session === session)!
  const until = Date.now() + 15_000
  while (processRun.adapter.alive(processRun.handle) && Date.now() < until) await new Promise(r => setTimeout(r, 25))
  expect(processRun.adapter.alive(processRun.handle), 'the made-up tool did not end').toBe(false)
  await onePass(settings, watching)
  expect(check(run).execution, 'the worker did not report the ending').toMatchObject({ session, endedAt: expect.any(String), failed: expect.any(String) })
  return session!
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  for (const [headers, data] of [
    [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [person, { handle: 'inspector-one', name: 'Made-up Inspector', role: 'inspector' }],
    [person, { handle: 'super-r', name: 'Made-up Supervisor', role: 'supervisor' }],
    [as('agent', 'super-r'), { handle: 'worker-w', name: 'Made-up Worker', role: 'worker', workArea: ['work'] }],
  ] as const) {
    const registered = await call('POST', '/api/agents/started', data, headers)
    expect(registered.status, registered.raw.replace(/[0-9a-f]{64}/g, '<a key>')).toBe(201)
  }
  tree = scratch('tree')
  tools = scratch('tools')
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Made-up dsh transcript fixture')
  mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Made-up before.\n')
  git('add', '.'); git('commit', '-q', '-m', 'Made-up baseline'); git('switch', '-q', '-c', 'work')
  writeFileSync(join(tree, 'work/a.txt'), 'Made-up after.\n'); git('commit', '-q', '-am', 'Made-up work')
  settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
    checkout: aCheckoutForATestRun(), runs: 9, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'), MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' } }
}, 60_000)
afterEach(async () => {
  const until = Date.now() + 20_000
  do {
    await new Promise(r => setTimeout(r, 25))
    const pass = await onePass(settings, watching)
    if (watching.length === 0 && pass.started.length === 0) return
  } while (Date.now() < until)
  expect(watching).toEqual([])
}, 60_000)
afterAll(async () => {
  for (const r of watching) if (r.adapter.alive(r.handle)) r.adapter.stop(r.handle, 'The made-up dsh transcript test ended.')
  await app?.close(); t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

// Mutation: take the gateMet call out of the tool-ending door, count a call that finds the ending already written, or
// leave the worker's word out of its report.
it('counts a refused dsh transcript once, in the report that writes the ending, and not in a repeated report', async () => {
  const run = await sealed('Made-up check whose dsh transcript is refused')
  const before = counted()
  const session = await aCheckWhoseToolPrinted(run, aToolThatPrints('a-refused-transcript', A_REFUSED_TRANSCRIPT))
  expect(JSON.stringify(t.api.getRecord(session)!.data['usageReceipt']), 'the worker read no refusal of the transcript').toContain('which is not a path inside')
  expect(counted()).toBe(before + 1)
  // The worker repeats a report whose reply did not come. The ending is written by then, so nothing more is counted.
  const repeated = await call('POST', `/api/checks/${run}/tool-ended`, { session, reason: 'Made-up: the same ending, reported again.', dshTranscriptRefused: true }, officeWorker)
  expect(repeated.status, repeated.raw).toBe(200)
  expect(counted(), 'a repeated report').toBe(before + 1)
  await onePass(settings, watching)
  expect(counted()).toBe(before + 1)
}, 60_000)

// Mutation: let the worker say a transcript was refused for any refusal of the line, count a report without the word,
// or refuse a report that does not carry the field.
it('counts nothing for a line refused for another reason, and takes a report in the older shape', async () => {
  const run = await sealed('Made-up check whose line is not JSON')
  const before = counted()
  const session = await aCheckWhoseToolPrinted(run, aToolThatPrints('a-line-that-is-not-json', A_LINE_THAT_IS_NOT_JSON))
  expect(JSON.stringify(t.api.getRecord(session)!.data['usageReceipt'])).toContain('not JSON')
  expect(counted()).toBe(before)
  const older = await call('POST', `/api/checks/${run}/tool-ended`, { session, reason: 'Made-up: an ending in the older shape.' }, officeWorker)
  expect(older.status, older.raw).toBe(200)
  expect(counted()).toBe(before)
}, 60_000)
