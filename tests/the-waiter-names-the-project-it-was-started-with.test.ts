// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER'S RESTART HINT CARRIES THE PROJECT IT WAS STARTED IN.
 *
 * Problem `9GprctNxq97I`. A secretary of another project was told to copy
 * `node tools/hold-the-handle.mjs --agent <h> --session <id>` and the command failed with "is in
 * another project" unless the operator remembered to add `--workspace`. The workspace the waiter
 * resolved is known to it; this file proves the copyable command now prints it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND WHY A REAL CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * A real waiter (`tools/hold-the-handle.mjs`) is started with `--workspace robotics` against a
 * listening app. It holds the handle, a message is written to the agent, the waiter hands the words
 * over and prints its restart hint. That hint's command must contain `--workspace robotics` — the
 * project the waiter was started with — so a copy restarts the waiter in the same project.
 *
 * MUTATION, CONTROL RUN FIRST
 *
 * CONTROL: the case below passes with the mend in place.
 *
 * MUTATION: in tools/hold-the-handle.mjs the command is put back to printing `--workspace` only
 * when the message came from another project (today's code), so for a robotics waiter and a
 * robotics message it prints no `--workspace`. The case goes red. The file is restored
 * byte-for-byte (sha256 checked) and the control run again: green.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let api = ''
let agentId = ''
let session = ''
const started: ChildProcess[] = []

const AS_THE_WAITER = {
  'x-mole-office-workspace': 'robotics',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_WAITER, payload: body as never })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json() as Record<string, unknown>
}

/** Start the waiter and say when it stops. */
function startTheWaiter(): { said: () => string; ended: Promise<number> } {
  const child: ChildProcess = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../for-agents/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      'waiter-project-hand',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'robotics',
    ],
    { env: { ...process.env, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { said: () => printed, ended }
}

async function until(what: () => boolean | Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (await what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const madeWorkspace = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: 'robotics', title: 'Robotics' },
  })
  expect(madeWorkspace.statusCode, madeWorkspace.body).toBe(201)

  await post('/api/records', {
    kind: 'agent',
    title: 'Waiter project hand',
    data: { handle: 'waiter-project-hand', runtime: 'claude-code', state: 'active' },
  })
  const listed = await app.inject({
    method: 'GET',
    url: '/api/participants',
    headers: { 'x-mole-office-workspace': 'robotics' },
  })
  const agents = (listed.json() as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = one(agents.filter((a) => a.handle === 'waiter-project-hand'), 'the registry row').id
  const filed = await post('/api/records', {
    kind: 'session',
    title: 'A terminal answering as it',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as waiter-project-hand' },
  })
  session = (filed['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is what this wanted.
    }
  }
  await app.close()
  t.close()
})

describe('the waiter prints the project it was started with in its restart hint', () => {
  it('names --workspace robotics in the copyable command', async () => {
    const waiter = startTheWaiter()
    // THE HOLD IS REALLY THERE BEFORE THE MESSAGE IS WRITTEN, so the delivery cannot have come from
    // a run started for it instead.
    expect(
      await until(async () => {
        const holds = await app.inject({
          method: 'GET',
          url: '/api/handles',
          headers: { 'x-mole-office-workspace': 'robotics' },
        })
        const rows = (holds.json() as { holds?: { handle: string; session: string; releasedAt: string | null }[] }).holds ?? []
        return rows.some(
          (hold) => hold.handle === 'waiter-project-hand' && hold.session === session && hold.releasedAt === null,
        )
      }),
      waiter.said(),
    ).toBe(true)

    const sent = await post('/api/records', {
      kind: 'message',
      title: 'which project does the restart belong to?',
      data: { body: 'which project does the restart belong to?', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (sent['record'] as { id: string }).id
    expect(await until(() => waiter.said().includes(messageId), 20_000), waiter.said()).toBe(true)
    // THE HINT IS PRINTED AND THE WAITER EXITS, which is the wake for a Claude Code session.
    expect(await waiter.ended, waiter.said()).toBe(0)

    expect(waiter.said(), 'the restart hint printed no project').toContain(
      `node for-agents/hold-the-handle.mjs --agent waiter-project-hand --session ${session} --workspace robotics`,
    )
  }, 60_000)
})
