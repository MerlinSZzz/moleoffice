// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A GROUP MESSAGE HANDED TO AN AGENT SAYS WHICH GROUP IT CAME FROM, AND A DIRECT ONE DOES NOT. Item 5 of
 * one of the owner's decisions agrees to step 1 of block b-6 of the secretary's
 * report: a delivered group message looked exactly like a direct one, so agents answered privately.
 *
 * The line is built once, by `deliveryEnvelope` in src/shared/messages.ts, as the envelope's first
 * line, from what `theGroupForAHandOver` in src/server/lib/who-sent-it.ts read. The doors that hand a
 * message over carry it as `fromGroup`: the took door (the waiter), the message pool (the dsh hook)
 * and the worker's queue (the run prompt).
 *
 * WHAT IS PROVED HERE, against a real office on a free port and the real message worker:
 *
 *   1. A message sent to a group that holds an agent: the took door, the pool and the worker's queue
 *      each carry `fromGroup` with the group's id and title, and the run prompt's envelope opens with
 *      the group line, in English and Chinese, naming the group by its title.
 *   2. A message sent straight to an agent: each door carries `fromGroup` null, and the run prompt has
 *      no group line.
 *
 * The names are made up.
 *
 * MUTATIONS (each after a green control run, then restored):
 *   - case 1: `deliveryEnvelope` never pushes the group line. Case 1 goes red at the prompt.
 *   - case 2: `theGroupForAHandOver` answers `{ id: '', name: null }` for a message sent to no group
 *     instead of null. Case 2 goes red at the first door.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { DELIVERY_ENVELOPE } from '../src/shared/messages.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let scratch = ''
let prompts = ''
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

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

/** File one message as the person and answer its record id. */
async function send(data: Record<string, unknown>): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: String(data['body']).slice(0, 40), data })
  expect(filed.status, filed.text).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, { kind: 'message', data }))
  return (filed.json['record'] as { id: string }).id
}

/** What each of the three hand-over doors carries as `fromGroup` for one message to one agent. */
async function whatTheDoorsCarry(handle: string, messageId: string): Promise<{ pool: unknown; queue: unknown; took: unknown }> {
  const pool = await inject('GET', '/api/messages?only=waiting-for-me&full=1', asAgent(handle))
  expect(pool.status, pool.text).toBe(200)
  const entry = ((pool.json['messages'] ?? []) as { id: string; fromGroup?: unknown }[]).find((one) => one.id === messageId)
  expect(entry, `the pool does not hold ${messageId}: ${pool.text.slice(0, 300)}`).toBeDefined()

  const queue = await inject('GET', '/api/worker/queue?full=1', AS_THE_PERSON)
  expect(queue.status, queue.text).toBe(200)
  const row = ((queue.json['queue'] ?? []) as { messageId: string; handle: string; fromGroup?: unknown }[]).find(
    (one) => one.messageId === messageId && one.handle === handle,
  )
  expect(row, `the queue does not hold ${messageId} for ${handle}: ${queue.text.slice(0, 300)}`).toBeDefined()

  // THE TOOK DOOR, as the waiter asks it: a session holds the handle and says it took the message.
  const session = await inject('POST', '/api/records', AS_THE_PERSON, {
    kind: 'session',
    title: `the waiting terminal of ${handle}`,
    data: { state: 'running', runtime: 'claude-code', doing: 'waiting' },
  })
  expect(session.status, session.text).toBe(201)
  const sessionId = (session.json['record'] as { id: string }).id
  const held = await inject('POST', `/api/handles/${handle}/hold`, AS_THE_PERSON, {
    session: sessionId,
    machine: 'a-machine',
    runtime: 'claude-code',
  })
  expect(held.status, held.text).toBe(201)
  const took = await inject('POST', `/api/handles/${handle}/took`, AS_THE_PERSON, { session: sessionId, message: messageId })
  expect(took.status, took.text).toBe(200)
  const released = await inject('POST', `/api/handles/${handle}/release`, AS_THE_PERSON, { session: sessionId })
  expect(released.status, released.text).toBe(200)
  return { pool: entry?.fromGroup, queue: row?.fromGroup, took: took.json['fromGroup'] }
}


/**
 * Wait for a run's prompt naming each of these messages, and answer them in the same order.
 *
 * ONE WORKER PASS STARTS BOTH RUNS, and no pass runs after that. A later pass would file the ending of
 * a run that has already ended, and the worker refuses to file it for an agent registered with no work
 * area, which is not what this file is about.
 */
async function thePromptsFor(messageIds: readonly string[]): Promise<string[]> {
  await onePass(settings, watching)
  const deadline = Date.now() + 20_000
  for (;;) {
    const texts = readdirSync(prompts).map((name) => readFileSync(join(prompts, name), 'utf8'))
    const found = messageIds.map((id) => texts.find((text) => text.includes(`THE MESSAGE, record ${id}:`)))
    if (found.every((one) => one !== undefined)) return found as string[]
    expect(Date.now(), `not every run was started for ${messageIds.join(', ')}, so not every prompt was written`).toBeLessThan(
      deadline,
    )
    await new Promise((go) => setTimeout(go, 100))
  }
}

/** The line just before WHO SENT IT in a prompt. */
function theLineBeforeTheSender(prompt: string): string {
  const lines = prompt.split('\n')
  const at = lines.findIndex((line) => line.startsWith('WHO SENT IT: '))
  expect(at, `no sender line in:\n${prompt}`).toBeGreaterThan(0)
  return lines[at - 1] ?? ''
}

/** What the three doors carried, and the run prompt, for the group message and for the direct one. */
let groupId = ''
let viaAGroup: { doors: Awaited<ReturnType<typeof whatTheDoorsCarry>>; prompt: string }
let direct: { doors: Awaited<ReturnType<typeof whatTheDoorsCarry>>; prompt: string }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-group-line-'))
  prompts = join(scratch, 'prompts')
  mkdirSync(prompts, { recursive: true })
  // THE FAKE RUNTIME, WITH EVERY PROMPT IT WAS GIVEN WRITTEN DOWN FIRST, one file per run.
  const wrapper = join(scratch, 'fake-runtime-that-keeps-its-prompt.mjs')
  writeFileSync(
    wrapper,
    `import { writeFileSync } from 'node:fs'\n` +
      `writeFileSync(${JSON.stringify(prompts)} + '/' + String(process.pid) + '.txt', process.argv[2] ?? '')\n` +
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

  // TWO AGENTS: one in a group with the person, one written to directly.
  const inTheGroup = await started('group-line-reader', 'Group Line Reader')
  const writtenTo = await started('direct-line-reader', 'Direct Line Reader')
  const opened = await inject('POST', '/api/groups', AS_THE_PERSON, {
    name: 'The bench crew',
    because: 'The fixtures on the bench are discussed here.',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
      { who: { kind: 'agent', id: inTheGroup }, because: 'It builds the fixtures.' },
    ],
  })
  expect(opened.status, opened.text).toBe(201)
  groupId = (opened.json['group'] as { id: string }).id
  await clearInbox('group-line-reader')
  await clearInbox('direct-line-reader')

  // THE DOORS FIRST, on one message each, before any run holds a handle.
  const groupDoors = await whatTheDoorsCarry(
    'group-line-reader',
    await send({ body: 'Which fixture goes on the bench first?', toGroup: groupId }),
  )
  const directDoors = await whatTheDoorsCarry(
    'direct-line-reader',
    await send({ body: 'Is the bench clear?', to: [{ kind: 'agent', id: writtenTo }] }),
  )

  // THEN ONE RUN EACH, on a second message each, both pressed before the one worker pass.
  const groupRun = await send({ body: 'And which one goes second?', toGroup: groupId })
  const directRun = await send({ body: 'Is the bench clear now?', to: [{ kind: 'agent', id: writtenTo }] })
  for (const id of [groupRun, directRun]) {
    const pressed = await inject('POST', `/api/messages/${id}/start-an-agent`, AS_THE_PERSON, {})
    expect(pressed.status, pressed.text).toBe(200)
  }
  const [groupPrompt, directPrompt] = await thePromptsFor([groupRun, directRun])
  viaAGroup = { doors: groupDoors, prompt: groupPrompt! }
  direct = { doors: directDoors, prompt: directPrompt! }
}, 90_000)

afterAll(async () => {
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

describe('a message handed to an agent says which group it came from', () => {
  it('a group message carries the group on every door, and the run prompt opens its envelope with the group line', () => {
    const expected = { id: groupId, name: 'The bench crew' }
    expect(viaAGroup.doors).toEqual({ pool: expected, queue: expected, took: expected })
    const line = theLineBeforeTheSender(viaAGroup.prompt)
    expect(line, viaAGroup.prompt).toBe(DELIVERY_ENVELOPE.fromAGroup(expected))
    expect(line).toContain('the group "The bench crew"')
    expect(line).toContain('这是"The bench crew"群里的消息')
  })

  it('a direct message carries no group on any door, and the run prompt has no group line', () => {
    expect(direct.doors).toEqual({ pool: null, queue: null, took: null })
    expect(direct.prompt).not.toContain('FROM A GROUP:')
    expect(direct.prompt.split('\n').filter((one) => one.startsWith('WHO SENT IT: ')).length, direct.prompt).toBe(1)
  })
})
