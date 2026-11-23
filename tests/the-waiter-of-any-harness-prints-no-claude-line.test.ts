// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER OF A HARNESS THE OFFICE CANNOT READ HOLDS THE HEARTBEAT AND WAITS FOR MESSAGES.
 *
 * The waiter takes any harness's word, from `--runtime` or, with no flag, from the session record. For a harness it
 * cannot read, it says it holds the heartbeat and waits for messages. It never prints that no claude process was
 * found, and never tells the agent to stop there.
 *
 * WHAT IS PROVED HERE, with the waiter as a real process against a test office listening in this process:
 *
 *   1. Given `--runtime workbuddy`, it holds, prints the line saying it cannot read that harness's process and holds the
 *      heartbeat, prints the hold's sentence that the office cannot start it, prints no claude process line, and a
 *      message to the agent reaches it, is printed, and ends it.
 *   2. Given no `--runtime`, it takes `workbuddy` from the session record, says so, and prints the same lines.
 *
 * WHAT IS NOT PROVED HERE: the hold door and the chat's reading
 * (tests/an-agent-of-any-harness-holds-its-heartbeat.test.ts), and any measured wake of a running session of that
 * harness, which nobody has measured.
 *
 * Each waiter is given a home folder made for it and removed after, so nothing is written in the real one.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { readStoredWord } from '../src/shared/i18n.ts'
import { whatTheOfficeDoesForAHarnessWithNoAdapter } from '../src/shared/participants.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WORKBUDDY = 'workbuddy'

let t: TestDb
let app: FastifyInstance
let api = ''
/** Every waiter this file started, killed by the pid recorded at start. */
const started: ChildProcess[] = []
/** Every home folder made for a waiter, removed after. */
const homes: string[] = []

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The line a waiter prints for a claude-code session whose process it could not find. Never printed for this harness. */
const NO_CLAUDE_PROCESS = 'No claude process was found'

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A REAL LISTENER, because the waiter under test is a real process that calls fetch.
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as { port: number }).port)}`
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is where a waiter that ended itself is.
    }
  }
  await app.close()
  t.close()
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

/** File an agent of this harness and a session of it, and name the agent's registry id and the session record. */
async function anAgentOfTheHarness(handle: string): Promise<{ agentId: string; session: string }> {
  const agent = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'agent', title: `Agent ${handle}`, data: { handle, state: 'active', runtime: WORKBUDDY } },
  })
  expect(agent.statusCode, agent.body.slice(0, 300)).toBe(201)
  const key = (agent.json() as { whatToGiveIt: { key: string } }).whatToGiveIt.key
  writeFileSync(join(dirname(t.file), `${handle}.key`), key, { mode: 0o600 })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as {
    agents?: { id: string; handle: string }[]
  }
  const agentId = one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'session', title: `A ${WORKBUDDY} session`, data: { state: 'running', runtime: WORKBUDDY, doing: 'waiting' } },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  return { agentId, session: (filed.json() as { record: { id: string } }).record.id }
}

/** Start the waiter as a process, and say what it printed and when it stopped. */
function startTheWaiter(handle: string, session: string, runtime: string | null): { said: () => string; ended: Promise<number> } {
  const home = mkdtempSync(join(tmpdir(), 'mole-office-any-harness-waiter-'))
  homes.push(home)
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      handle,
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
      ...(runtime === null ? [] : ['--runtime', runtime]),
    ],
    { env: { ...process.env, HOME: home, MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: join(dirname(t.file), `${handle}.key`), MOLE_OFFICE_API: api, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { said: () => printed, ended }
}

/** Wait until the waiter has printed a line, or ten seconds have passed. */
async function untilItSays(waiter: { said: () => string }, line: string): Promise<void> {
  await new Promise<void>((go) => {
    const probe = setInterval(() => {
      if (waiter.said().includes(line)) {
        clearInterval(probe)
        go()
      }
    }, 100)
    setTimeout(() => {
      clearInterval(probe)
      go()
    }, 10_000)
  })
  expect(waiter.said()).toContain(line)
}

/** The person's message to the agent, filed while the waiter holds. A test office may answer 409 and store it. */
async function aMessageTo(agentId: string, body: string): Promise<void> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { body, to: [{ kind: 'agent', id: agentId }] } },
  })
  expect([201, 409], filed.body.slice(0, 300)).toContain(filed.statusCode)
}

/** What the waiter prints for this harness, from the one place each sentence is made. */
const NOT_READ = readStoredWord('devWords.waiter.harnessNotRead', { runtime: WORKBUDDY })
const CANNOT_START = whatTheOfficeDoesForAHarnessWithNoAdapter(WORKBUDDY)

describe('the waiter of a harness the office cannot read', () => {
  it('given --runtime workbuddy, holds the heartbeat, says why it records no process, and prints the message that reaches it', async () => {
    const { agentId, session } = await anAgentOfTheHarness('buddy-named')
    const waiter = startTheWaiter('buddy-named', session, WORKBUDDY)
    await untilItSays(waiter, 'Holding the handle')
    await untilItSays(waiter, NOT_READ)

    expect(waiter.said()).toContain(CANNOT_START)
    expect(waiter.said()).not.toContain(NO_CLAUDE_PROCESS)

    await aMessageTo(agentId, 'is the workbuddy session still there')
    // ONE POLL: a held answer is up to thirty seconds; the abort above it is nearly forty.
    const code = await Promise.race([waiter.ended, new Promise<null>((go) => setTimeout(() => go(null), 42_000))])
    const printed = waiter.said()
    expect(code, printed).not.toBe(null)
    expect(printed).toContain('is the workbuddy session still there')
    expect(printed).not.toContain(NO_CLAUDE_PROCESS)
  }, 60_000)

  it('given no --runtime, takes the word from the session record and prints the same lines', async () => {
    const { session } = await anAgentOfTheHarness('buddy-from-the-record')
    const waiter = startTheWaiter('buddy-from-the-record', session, null)
    await untilItSays(waiter, 'Holding the handle')
    await untilItSays(waiter, NOT_READ)

    expect(waiter.said()).toContain(`Runtime "${WORKBUDDY}" taken from the session record.`)
    expect(waiter.said()).toContain(CANNOT_START)
    expect(waiter.said()).not.toContain(NO_CLAUDE_PROCESS)
  }, 60_000)
})
