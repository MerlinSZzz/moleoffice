// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A HAND-OVER NAMES WHO SENT A MESSAGE, NOT ONLY ITS ID. Problem ynGL0myEnAbi.
 *
 * Since wave 13b a newly registered agent's id is minted and is no longer its handle. The waiter
 * printed "WHO SENT IT: agent WNHuOwWZxXdf" for a supervisor, and a session reading that
 * could not tell who had written to it.
 *
 * THE OFFICE NOW WORKS OUT THE WORDS ONCE, in src/server/lib/who-sent-it.ts, and the doors that
 * hand a message over carry them: the took door (the waiter), the message pool (the dsh hook) and
 * the worker's queue (the run prompt). Each caller passes them to the envelope unchanged.
 *
 * WHAT IS PROVED HERE, against a real office on a free port and the three real callers:
 *
 *   1. One message from an agent with a minted id reaches three agents: one through the waiter,
 *      one through the dsh SessionStart hook, one through a run the worker starts. All three
 *      print the same WHO SENT IT line, and it says the sender's handle and name with its id.
 *   2. A message whose stored sender no agent answers to keeps the stored id and says nobody
 *      could name who sent it.
 *   3. A message whose stored sender two agents answer to (a retired agent and the new agent
 *      that took its handle) keeps the stored string, says how many answer, and names neither.
 *   4. A message from the person says the person's name with the id.
 *
 * WHAT WOULD MAKE EACH CASE GO RED (mutation, each after a control run):
 *   - `theSender` in src/shared/messages.ts says `agent ${read.id}` for a found agent: case 1 red.
 *   - `theSenderAsRead` counts only the live handle (drops the retired rows): case 3 red.
 *   - the waiter builds its line from the record's `sentBy` instead of the took door's words:
 *     case 1 red, because the waiter's line no longer matches the other two.
 *   - src/worker/index.ts ignores the queue's words and builds the line from `sentBy`: case 1 red.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
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
  method: 'GET' | 'POST',
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

/** Register an agent through the starter door and answer its registry id. */
async function started(handle: string, name: string): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['agent'] as { id: string }).id
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

/** File one message and answer its record id. `expected` is the status the write answers, when a caller names it. */
async function send(headers: Record<string, string>, to: string[], body: string, expected?: number): Promise<string> {
  const data = { body, to: to.map((id) => ({ kind: 'agent', id })) }
  const filed = await inject('POST', '/api/records', headers, { kind: 'message', title: body.slice(0, 40), data })
  expect(filed.status, filed.text).toBe(expected ?? theAnswerToAWriteInATestOffice(headers, { kind: 'message', data }))
  return (filed.json['record'] as { id: string }).id
}

/** A session record for a waiter or a hook to name. */
async function aSession(title: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title, data: { state: 'running' } })
  expect(filed.status, filed.text).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

/** The one WHO SENT IT line in some printed text, or null because there is none. */
function theSenderLine(text: string): string | null {
  const lines = text.split('\n').filter((line) => line.startsWith('WHO SENT IT: '))
  expect(lines.length, `more than one sender line in:\n${text}`).toBeLessThanOrEqual(1)
  return lines[0] ?? null
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
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' },
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
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-sender-named-'))
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

describe('a hand-over names who sent the message', () => {
  it('the waiter, the dsh hook and the run prompt print the same line: the handle, the name and the minted id', async () => {
    const senderId = await started('the-sender', 'The Sender')
    // THE ID IS MINTED, which is the whole of the fault: printed alone it names nobody a reader knows.
    expect(senderId).not.toBe('the-sender')
    const byWaiter = await started('reads-by-waiter', 'Reads by waiter')
    const byHook = await started('reads-by-hook', 'Reads by hook')
    const byRun = await started('reads-by-run', 'Reads by run')
    for (const handle of ['reads-by-waiter', 'reads-by-hook', 'reads-by-run']) await clearInbox(handle)

    // NOTHING HOLDS THE THREE READERS IN THE TEST OFFICE when this is sent, so the office stores the message, routes it
    // and answers 409. The message is stored all the same, and each reader is handed it below.
    const messageId = await send(
      asAgent('the-sender'),
      [byWaiter, byHook, byRun],
      'Which gripper do I calibrate first?',
      409,
    )
    const expected = `WHO SENT IT: agent the-sender (The Sender, id ${senderId})`

    const hook = await theHookSays('reads-by-hook', await aSession('the dsh session'))
    expect(hook).toContain(`THE MESSAGE, record ${messageId}:`)
    const waiter = await theWaiterSays('reads-by-waiter', await aSession('the waiting terminal'))
    expect(waiter).toContain(`THE MESSAGE, record ${messageId}:`)
    // A FRESH AGENT'S MESSAGE WAITS FOR THE PERSON'S PRESS (criterion M78), so they press it.
    const pressed = await inject('POST', `/api/messages/${messageId}/start-an-agent`, AS_THE_PERSON, {})
    expect(pressed.status, pressed.text).toBe(200)
    const prompt = await thePromptSays()
    expect(prompt).toContain(`THE MESSAGE, record ${messageId}:`)

    expect(theSenderLine(hook), hook).toBe(expected)
    expect(theSenderLine(waiter), waiter).toBe(expected)
    expect(theSenderLine(prompt), prompt).toBe(expected)
  }, 90_000)

  it('a stored sender no agent answers to keeps its id and says nobody could name it', async () => {
    await started('reads-a-lost-sender', 'Reads a lost sender')
    await clearInbox('reads-a-lost-sender')
    const to = (await inject('GET', '/api/participants', AS_THE_PERSON)).json['agents'] as { id: string; handle: string }[]
    const recipient = one(to.filter((a) => a.handle === 'reads-a-lost-sender'), 'the recipient').id
    // NOTHING HOLDS THE RECIPIENT IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
    // message is stored all the same.
    const messageId = await send(asAgent('the-sender'), [recipient], 'Nobody will know who wrote this.', 409)
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', 'nobody-bears-this') WHERE id = ?")
      .run(messageId)

    const hook = await theHookSays('reads-a-lost-sender', await aSession('the lost-sender session'))
    expect(theSenderLine(hook), hook).toBe(
      'WHO SENT IT: agent nobody-bears-this (no agent in the registries answers to this stored id, so nobody could name who sent it)',
    )
  }, 30_000)

  it('a stored handle that a retired agent and a new one both answer to names neither', async () => {
    await started('twin', 'The first twin')
    const retired = await inject('POST', '/api/participants/agent/twin/retire', AS_THE_PERSON, { because: 'its work is done' })
    expect(retired.status, retired.text).toBe(200)
    await started('twin', 'The second twin')
    await started('reads-a-twin', 'Reads a twin')
    await clearInbox('reads-a-twin')
    const to = (await inject('GET', '/api/participants', AS_THE_PERSON)).json['agents'] as { id: string; handle: string }[]
    const recipient = one(to.filter((a) => a.handle === 'reads-a-twin'), 'the recipient').id
    // NOTHING HOLDS THE RECIPIENT IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
    // message is stored all the same.
    const messageId = await send(asAgent('the-sender'), [recipient], 'Which twin wrote this?', 409)
    // A MESSAGE WRITTEN BEFORE THE MINT HOLDS THE SENDER'S HANDLE, and this one now holds a handle
    // two agents bear.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', 'twin') WHERE id = ?").run(messageId)

    const hook = await theHookSays('reads-a-twin', await aSession('the twin session'))
    expect(theSenderLine(hook), hook).toBe(
      'WHO SENT IT: agent twin (2 agents answer to this stored id, so nobody could name who sent it)',
    )
  }, 30_000)

  it('a message from the person says the person by name, with the id', async () => {
    await started('reads-the-person', 'Reads the person')
    await clearInbox('reads-the-person')
    const listed = (await inject('GET', '/api/participants', AS_THE_PERSON)).json as {
      agents: { id: string; handle: string }[]
      people: { id: string; name: string }[]
    }
    const recipient = one(listed.agents.filter((a) => a.handle === 'reads-the-person'), 'the recipient').id
    const person = one(listed.people.filter((p) => p.id === THE_PERSON), 'the person')
    await send(AS_THE_PERSON, [recipient], 'A word from the person.')

    const hook = await theHookSays('reads-the-person', await aSession('the person-reading session'))
    expect(theSenderLine(hook), hook).toBe(`WHO SENT IT: person ${person.name} (id ${THE_PERSON})`)
  }, 30_000)
})
