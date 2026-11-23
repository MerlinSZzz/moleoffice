// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE TO A HANDLE, FILED IN ANOTHER PROJECT, WAKES THAT HANDLE'S WAITER.
 *
 * Problem `ENhtwt1iDrAu`, on an agent's finding of 16 September 2026 at 11:19 and the friction
 * batch xQkF-ca9mT5M item 1: a message to an agent was filed in project
 * panelx; an agent's waiter held --workspace robotics; the person waited twenty minutes.
 *
 * WHAT THE FIX IS, AND WHERE IT LIVES. The brief offered two shapes: a cross-project query flag
 * on the waiting door, or the waiter asking every project in turn. Neither was needed, and that
 * is the finding this file pins. Measured first, on 16 September 2026 with the plain probe:
 *
 *   a waiter started in project robotics, polling the one door it always polls
 *   (GET /api/handles/:handle/waiting?wait=30, one long request per answer), woke and handed
 *   over a message filed in project panelx inside one poll, three seconds after it was filed.
 *
 * The read behind that door, `everythingWaitingFor` in src/server/lib/handles.ts, already joins
 * the delivery rows to the records table over the whole installation and no project of its own:
 * a delivery row has a recipient and no project, and has never had one. So the waiting door
 * answers across projects without being asked to, the hold itself stays one project's (it is
 * claimed with a workspace header and names one session record), a message from another project
 * is labelled by the note the waiter already prints for M76, nothing is moved between projects
 * and nothing is delivered twice. A second door, or a flag, would be a second answer to a
 * question this door answers once, and two answers drift.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. A waiter holding project robotics is handed a message written in panelx within one poll,
 *      printed with the body, with the envelope's WRITTEN IN line, and with a restart command naming robotics. Until
 *      a decision, of 29 September 2026, it printed M76's note telling the session to answer in panelx; every
 *      message is kept in the message centre now and belongs to no project, so there is no project to
 *      answer in.
 *   2. And the delivery row says `delivered`, once.
 *   3. A message filed in robotics still arrives as it always did.
 *
 * WHAT WOULD MAKE EACH CASE GO RED (mutation, run alone): drop the other projects from the read
 * in `everythingWaitingFor` — filter it to one workspace, as the requested fix's first shape
 * would leave it — and case 1 goes red: the message in panelx is never handed over. Case 2 goes
 * red under the same mutation, because the waiter's own project is robotics and the read would
 * answer about `default`.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, aTestAgentsKeyEnvironment, type TestDb } from './helpers.ts'

const HERE = 'panelx'
const THERE = 'robotics'

let t: TestDb
let app: FastifyInstance
let api = ''
let keyEnv: NodeJS.ProcessEnv = {}
let agentId = ''
let session = ''
/** Every waiter this file started, killed by the pid recorded at start. */
const started: ChildProcess[] = []

const inProject = (id: string): Record<string, string> => ({
  'x-mole-office-workspace': id,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A REAL LISTENER, because the waiter under test is a real process that calls fetch: hand-cut
  // headers would prove this file's own assignment, not the waiter's housekeeping (the reason the
  // waiter-credential tests listen too).
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as { port: number }).port)}`
  for (const [id, title] of [
    [HERE, 'Panelx'],
    [THERE, 'Robotics'],
  ]) {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(made.statusCode, made.body).toBe(201)
  }
  // THE AGENT AND ITS SESSION ARE IN ROBOTICS, which is the project the waiter will be started in.
  keyEnv = await aTestAgentsKeyEnvironment(app, 'quill', dirname(t.file), THERE)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: inProject(THERE) })).json() as {
    agents?: { id: string; handle: string }[]
  }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === 'quill'), 'the registry row for quill').id
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: inProject(THERE),
    payload: {
      kind: 'session',
      title: 'A robotics terminal',
      data: { state: 'running', runtime: 'claude-code', doing: 'waiting' },
    },
  })
  session = (filed.json() as { record: { id: string } }).record.id
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
})

/** Start the waiter as a process, and say what it printed and when it stopped. */
function startTheWaiter(): { said: () => string; ended: Promise<number> } {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      'quill',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      THERE,
    ],
    { env: { ...keyEnv, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { said: () => printed, ended }
}

/** Say when the waiter has the hold, so the message is written to a holder that is listening. */
async function wantsHolding(waiter: { said: () => string }): Promise<void> {
  await new Promise<void>((go) => {
    const probe = setInterval(() => {
      if (waiter.said().includes('Holding the handle')) {
        clearInterval(probe)
        go()
      }
    }, 100)
    setTimeout(() => {
      clearInterval(probe)
      go()
    }, 10_000)
  })
  expect(waiter.said()).toContain('Holding the handle')
}

/** File a message in one project, addressed to the agent, and name its record. */
async function aMessageIn(project: string, body: string): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: inProject(project),
    payload: {
      kind: 'message',
      title: body.slice(0, 40),
      data: { body, to: [{ kind: 'agent', id: agentId }] },
    },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

describe('a message to a held agent arrives wherever it was filed', () => {
  it('a message filed in another project hands over within one poll, labelled with that project, and nothing is delivered twice', async () => {
    const waiter = startTheWaiter()
    await wantsHolding(waiter)

    const writtenAt = Date.now()
    const messageId = await aMessageIn(HERE, 'which experiment guide do I follow')
    // ONE POLL: a held answer is up to thirty seconds; the abort above it is nearly forty.
    const code = await Promise.race([
      waiter.ended,
      new Promise<null>((go) => setTimeout(() => go(null), 42_000)),
    ])
    const printed = waiter.said()
    expect(code, printed).not.toBe(null)
    expect(printed).toContain('which experiment guide do I follow')
    // THE LABEL: the envelope says where the message was written, and nothing tells the reader where to answer
    // A reply joins the conversation wherever it is written.
    expect(printed).toContain('WRITTEN IN: the project panelx')
    expect(printed).not.toContain('THIS MESSAGE IS FILED IN THE PROJECT')
    expect(printed).not.toContain('Answer it in')
    // AND THE RESTART COMMAND CARRIES THE WAITER'S OWN PROJECT, problem `9GprctNxq97I`.
    expect(printed).toContain(`--workspace robotics`)
    // NOTHING IS DELIVERED TWICE: one delivery row, handed over once. Only the recipient marks read.
    // Mutation: theLiveSessionTookIt writes seen again, or the waiter posts seen automatically.
    const read = (
      await app.inject({ method: 'GET', url: `/api/messages/${messageId}`, headers: inProject(HERE) })
    ).json() as { message?: { deliveries?: { mark: string }[] } }
    const rows = read.message?.deliveries ?? []
    expect(rows).toHaveLength(1)
    expect(one(rows, `the delivery row for ${messageId}`).mark).toBe('delivered')
    // THE MEASUREMENT THE BRIEF ASKED FOR, printed for the report: file to hand-over, in ms.
    // eslint-disable-next-line no-console
    console.log(`[waiter-wake-measured ${writtenAt} -> hand-over within ${Date.now() - writtenAt} ms]`)
  }, 60_000)

  it('a message filed in the project the waiter was started in still arrives as before', async () => {
    const waiter = startTheWaiter()
    await wantsHolding(waiter)

    const messageId = await aMessageIn(THERE, 'the shared washing bay still holds no soap')
    const code = await Promise.race([
      waiter.ended,
      new Promise<null>((go) => setTimeout(() => go(null), 42_000)),
    ])
    const printed = waiter.said()
    expect(code, printed).not.toBe(null)
    expect(printed).toContain('the shared washing bay still holds no soap')
    // It says where it was written, as every hand-over does, and nothing about where to answer.
    expect(printed).toContain('WRITTEN IN: the project robotics')
    expect(printed).not.toContain('Answer it in')
  }, 60_000)
})
