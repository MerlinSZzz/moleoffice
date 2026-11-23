// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A HAND-OVER SAYS HOW THE SENDER ASKS TO BE ADDRESSED, AND ONLY WHEN THE SENDER SET A PART. One of
 * the owner's decisions says agents address people as they wish to be addressed.
 *
 * The line is built once, by `deliveryEnvelope` in src/shared/messages.ts, right after WHO SENT IT.
 * The office works out its words in src/server/lib/who-sent-it.ts, and the three doors that hand a
 * message over carry them: the took door (the waiter), the message pool (the dsh hook) and the
 * worker's queue (the run prompt).
 *
 * WHAT IS PROVED HERE, against a real office on a free port and the three real callers:
 *
 *   1. An agent sets how it asks to be addressed, with its own key, and writes to three agents. The
 *      waiter, the dsh hook and the run prompt each print, right after WHO SENT IT, the one line
 *      with the values as the sender wrote them.
 *   2. A sender that set no part gets no line at all in the waiter's hand-over: the line after
 *      WHO SENT IT is IN PROJECT, and no sentence says nothing was set.
 *
 * The values are made up. None is the owner's own.
 *
 * MUTATION (after a green control run, then restored): `deliveryEnvelope` never pushes the address
 * line. Case 1 goes red.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const SESSION_START = fileURLToPath(new URL('../tools/dsh-hooks/session-start.mjs', import.meta.url))
const WAITER = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let promptFile = ''
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
/** Every waiter this file started, killed by the pid recorded at start. */
const waiters: ChildProcess[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function inject(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** Register an agent through the starter door and answer its registry id and its key. */
async function started(handle: string, name: string): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  writeFileSync(join(dirname(t.file), `${handle}.key`), key, { mode: 0o600 })
  return { id: (reply.json['agent'] as { id: string }).id, key }
}

/** Mark everything waiting for one agent seen, so each case starts from its own message alone. */
async function clearInbox(handle: string): Promise<void> {
  const waiting = await inject('GET', '/api/messages?only=waiting-for-me', asAgent(handle))
  expect(waiting.status, waiting.text).toBe(200)
  for (const { id } of (waiting.json['messages'] ?? []) as { id: string }[]) {
    const marked = await inject('POST', `/api/messages/${id}/mark`, asAgent(handle), { mark: 'seen' })
    expect(marked.status, marked.text).toBe(200)
  }
}

/** File one message and answer its record id. `expected` is the status the write answers. */
async function send(headers: Record<string, string>, to: string[], body: string, expected = 201): Promise<string> {
  const filed = await inject('POST', '/api/records', headers, {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: to.map((id) => ({ kind: 'agent', id })) },
  })
  expect(filed.status, filed.text).toBe(expected)
  return (filed.json['record'] as { id: string }).id
}

/** A session record for a waiter or a hook to name. */
async function aSession(title: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title, data: { state: 'running' } })
  expect(filed.status, filed.text).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

/**
 * The line right after the one WHO SENT IT line in some printed text, with any indent taken off. It
 * is where the address line goes; with no address line it is the IN PROJECT line.
 */
function theLineAfterTheSender(text: string): string {
  const lines = text.split('\n').map((line) => line.trim())
  const at = lines.findIndex((line) => line.startsWith('WHO SENT IT: '))
  expect(at, `no sender line in:\n${text}`).toBeGreaterThan(-1)
  return lines[at + 1] ?? ''
}

/** How many address lines some printed text holds. */
function addressLines(text: string): number {
  return text.split('\n').filter((line) => line.trim().startsWith('HOW THE SENDER ASKS TO BE ADDRESSED:')).length
}

/**
 * Run the dsh SessionStart hook as the bridge runs it, and answer the context it attaches.
 *
 * ASYNCHRONOUS ON PURPOSE: the office answering the hook runs in this process, and a blocking spawn
 * would stop it from answering.
 */
async function theHookSays(handle: string, session: string): Promise<string> {
  const env: Record<string, string> = { ...withoutInheritedEffort() } as Record<string, string>
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  env['MOLE_OFFICE_AGENT'] = handle
  env['MOLE_OFFICE_SESSION'] = session
  env['MOLE_OFFICE_WORKSPACE'] = 'default'
  env['MOLE_OFFICE_API'] = api
  // THE OFFICE'S KEY FILE IS FOR THIS TEST'S DATABASE, never the live checkout's.
  env['MOLE_OFFICE_DB'] = t.file
  const ran = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [SESSION_START], { cwd: process.cwd(), env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.stdin.on('error', () => {
      // The hook stopped reading, which is its right; the run is still reported below.
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.write(
      JSON.stringify({ session_id: 'dsh-1', transcript_path: '', cwd: process.cwd(), hook_event_name: 'SessionStart', source: 'startup' }),
    )
    child.stdin.end()
  })
  expect(ran.status, ran.stderr).toBe(0)
  const said = JSON.parse(ran.stdout.trim() || '{}') as { hookSpecificOutput?: { additionalContext?: string } }
  return String(said.hookSpecificOutput?.additionalContext ?? '')
}

/** Start the waiter for one handle, and answer what it printed once it has stopped. */
async function theWaiterSays(handle: string, session: string): Promise<string> {
  const child = spawn(process.execPath, [WAITER, '--agent', handle, '--session', session, '--api', api, '--workspace', 'default'], {
    env: { ...withoutInheritedEffort(), MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: join(dirname(t.file), `${handle}.key`), MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' },
  })
  waiters.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const code = await Promise.race([
    new Promise<number>((go) => child.on('exit', (exit) => go(exit ?? -1))),
    new Promise<null>((go) => setTimeout(() => go(null), 42_000)),
  ])
  expect(code, `the waiter never stopped: ${printed}`).toBe(0)
  return printed
}

/** Run worker passes until the run's prompt has been written, and answer it. */
async function thePromptSays(): Promise<string> {
  const deadline = Date.now() + 20_000
  while (!existsSync(promptFile)) {
    expect(Date.now(), 'no run was started, so no prompt was written').toBeLessThan(deadline)
    await onePass(settings, watching)
    await new Promise((go) => setTimeout(go, 100))
  }
  return readFileSync(promptFile, 'utf8')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-sender-addressed-'))
  promptFile = join(scratch, 'the-prompt.txt')
  // THE FAKE RUNTIME, WITH THE PROMPT IT WAS GIVEN WRITTEN DOWN FIRST. The worker hands a run its
  // prompt as an argument, so this wrapper keeps a copy and then does what the fake runtime does.
  const wrapper = join(scratch, 'fake-runtime-that-keeps-its-prompt.mjs')
  writeFileSync(
    wrapper,
    `import { writeFileSync } from 'node:fs'\n` +
      `writeFileSync(${JSON.stringify(promptFile)}, process.argv[2] ?? '')\n` +
      `await import(${JSON.stringify(pathToFileURL(FAKE).href)})\n`,
  )
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: join(scratch, 'runs'),
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: wrapper },
  }
}, 60_000)

afterAll(async () => {
  for (const child of waiters) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is where a waiter that ended itself is.
    }
  }
  for (const run of watching) {
    try {
      if (run.handle.pgid !== null) process.kill(-run.handle.pgid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('a hand-over says how the sender asks to be addressed', () => {
  it('the waiter, the dsh hook and the run prompt print the sender\'s own words right after who sent it', async () => {
    const sender = await started('addressed-sender', 'Addressed Sender')
    const set = await inject(
      'PUT',
      '/api/participants/agent/addressed-sender/address-as',
      { ...asAgent('addressed-sender'), 'x-mole-office-key': sender.key },
      { name: 'Wren', secondPerson: 'you', title: 'bench lead' },
    )
    expect(set.status, set.text).toBe(200)
    const byWaiter = (await started('addr-reads-by-waiter', 'Reads by waiter')).id
    const byHook = (await started('addr-reads-by-hook', 'Reads by hook')).id
    const byRun = (await started('addr-reads-by-run', 'Reads by run')).id
    for (const handle of ['addr-reads-by-waiter', 'addr-reads-by-hook', 'addr-reads-by-run']) await clearInbox(handle)

    // NOTHING HOLDS THE THREE READERS IN THE TEST OFFICE when this is sent, so the office stores the message, routes it
    // and answers 409. The message is stored all the same, and each reader is handed it below.
    const messageId = await send(
      asAgent('addressed-sender'),
      [byWaiter, byHook, byRun],
      'Which fixture comes first?',
      409,
    )
    const expected = 'HOW THE SENDER ASKS TO BE ADDRESSED: name "Wren"; second person "you"; title "bench lead"'

    const hook = await theHookSays('addr-reads-by-hook', await aSession('the dsh session'))
    expect(hook).toContain(`THE MESSAGE, record ${messageId}:`)
    const waiter = await theWaiterSays('addr-reads-by-waiter', await aSession('the waiting terminal'))
    expect(waiter).toContain(`THE MESSAGE, record ${messageId}:`)
    const pressed = await inject('POST', `/api/messages/${messageId}/start-an-agent`, AS_THE_PERSON, {})
    expect(pressed.status, pressed.text).toBe(200)
    const prompt = await thePromptSays()
    expect(prompt).toContain(`THE MESSAGE, record ${messageId}:`)

    expect(theLineAfterTheSender(waiter), waiter).toBe(expected)
    expect(theLineAfterTheSender(hook), hook).toBe(expected)
    expect(theLineAfterTheSender(prompt), prompt).toBe(expected)
  }, 90_000)

  it('a sender that set no part gets no line at all', async () => {
    await started('plain-sender', 'Plain Sender')
    const reader = (await started('addr-reads-a-plain-sender', 'Reads a plain sender')).id
    await clearInbox('addr-reads-a-plain-sender')
    // NOTHING HOLDS THE READER IN THE TEST OFFICE when this is sent, so the office stores the message, routes it and
    // answers 409. The message is stored all the same, and the waiter is handed it below.
    const messageId = await send(asAgent('plain-sender'), [reader], 'Nothing is set about me.', 409)

    const waiter = await theWaiterSays('addr-reads-a-plain-sender', await aSession('the plain terminal'))
    expect(waiter).toContain(`THE MESSAGE, record ${messageId}:`)
    expect(addressLines(waiter), waiter).toBe(0)
    expect(theLineAfterTheSender(waiter), waiter).toMatch(/^WRITTEN IN: /)
  }, 60_000)
})
