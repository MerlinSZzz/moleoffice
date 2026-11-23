// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HAND-OVER CARRIES ONLY THE GROUP NEWS THAT DID NOT REACH THE AGENT ONE BY ONE, AND MOVES ITS READ POINT.
 *
 * The secretary, message RFv1V8oxkYGF, answering for wave 13n (whose door GET /api/messages/groups is, criterion GM4): an agent
 * woken by its waiter heard nothing of its groups until its next start, and its read point in a group never moved, so
 * each brief listed long-read group messages as new again (the secretary's own brief of 4 October listed 35). A group message
 * that @s members reaches only them (whoAGroupMessageReaches); every other group message has a delivery to each member,
 * which the waiter and dsh's hook hand over whole. So a hand-over now reads GET /api/messages/groups?move=1&undelivered=1:
 * the read point moves to now, and the summary carries only what did not reach the agent one by one, printed by the one
 * formatter only when some group has something left.
 *
 * WHAT IS PROVED HERE, against a real office on a free port, with made-up agents and one group:
 *
 *   1. The door with ?undelivered=1 leaves out of its summary the reader's own message and the message delivered to it,
 *      and keeps the one that @s another member; without it the summary is as before.
 *   2. The waiter hands over a direct message and the group message delivered to the agent, whole, and after them the
 *      group news holding only the message that @s another member. The delivered one is printed once, the agent's own
 *      not at all, and the read point has moved: the door then has nothing new.
 *   3. A later wake with nothing left undelivered prints no group news at all.
 *   4. dsh's PostToolUse hook hands over the same way: the delivered group messages whole, the news with only the
 *      undelivered one; a later hand-over attaches no news.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED (each after a green control):
 *   - whatYourGroupsGained ignores `onlyTheUndelivered`: cases 1, 2 and 4 are red.
 *   - the waiter reads no group news at a hand-over: case 2 is red.
 *   - the waiter reads the door without move=1: case 2 is red (the read point did not move).
 *   - the waiter prints the door's text when no group has anything left: case 3 is red.
 *   - dsh's attachUnseen attaches no group news: case 4 is red.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WAITER = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
const POST_TOOL_USE = fileURLToPath(new URL('../tools/dsh-hooks/post-tool-use.mjs', import.meta.url))

const READER = 'gn-reader'
const WRITER = 'gn-writer'
const OTHER = 'gn-other'
const DSH = 'gn-dsh'

const TO_EVERYONE = 'The compost delivery comes at nine; it goes behind the potting bench.'
const TO_THE_OTHER = '@gn-other please sweep the potting bench before noon, the new trays arrive after lunch.'
const THE_READERS_OWN = 'I will label the new pots once the trays are in.'

let t: TestDb
let app: FastifyInstance
let api = ''
let group = ''
let toTheOther = ''
/** The reader's session, the one both of its waiters hold the handle for, as the kit's waiter runs the tool again. */
let readersSession = ''
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

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
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
async function started(handle: string): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  const key = (reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key
  if (key) writeFileSync(join(dirname(t.file), `${handle}.key`), key, { mode: 0o600 })
  return (reply.json['agent'] as { id: string }).id
}

/** Mark everything waiting for one agent seen, so a case starts from its own messages alone. */
async function clearInbox(handle: string): Promise<void> {
  const waiting = await inject('GET', '/api/messages?only=waiting-for-me', asAgent(handle))
  expect(waiting.status, waiting.text).toBe(200)
  for (const { id } of (waiting.json['messages'] ?? []) as { id: string }[]) {
    const marked = await inject('POST', `/api/messages/${id}/mark`, asAgent(handle), { mark: 'seen' })
    expect(marked.status, marked.text).toBe(200)
  }
}

/** Write one message into the group, as these headers, and answer its id. */
async function said(body: string, headers: Record<string, string>): Promise<string> {
  const sent = await inject('POST', '/api/records', headers, { kind: 'message', title: body.slice(0, 40), data: { body, toGroup: group } })
  expect(sent.status, sent.text).toBe(201)
  return (sent.json['record'] as { id: string }).id
}

/**
 * One direct message from the person, which wakes the agent's waiter. A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS
 * 409, with the letter stored and routed (decision 60sbc5I-bwKx). After the waiter has held the reader's handle for its
 * session in the case before, a send to the reader answers 201.
 */
async function aDirectMessage(to: string, body: string, answers: 201 | 409 = 409): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: body.slice(0, 40), data: { body, to: [{ kind: 'agent', id: to }] } })
  expect(filed.status, filed.text).toBe(answers)
  return (filed.json['record'] as { id: string }).id
}

/** A session record for a waiter or a hook to name. */
async function aSession(title: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title, data: { state: 'running' } })
  expect(filed.status, filed.text).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

interface TheSummary {
  onlyTheUndelivered: boolean
  readPointMoved: boolean
  groups: { id: string; count: number; newest: { id: string; body: string }[] }[]
}

async function theDoor(handle: string, query: string): Promise<{ summary: TheSummary; text: string }> {
  const reply = await inject('GET', `/api/messages/groups${query}`, asAgent(handle))
  expect(reply.status, reply.text).toBe(200)
  return reply.json as unknown as { summary: TheSummary; text: string }
}

/** How many times some words are in a text. */
function timesIn(text: string, words: string): number {
  return text.split(words).length - 1
}

/** Start the waiter for one handle, and answer what it printed once it has stopped. */
async function theWaiterSays(handle: string, session: string): Promise<string> {
  const child = spawn(process.execPath, [WAITER, '--agent', handle, '--session', session, '--api', api, '--workspace', 'default'], {
    env: { ...process.env, MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: join(dirname(t.file), `${handle}.key`), MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' },
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

/** Run dsh's PostToolUse hook as the bridge runs it, and answer the context it attached. Asynchronous, so the office in this process can answer. */
async function theHookAttaches(handle: string, session: string): Promise<{ context: string; stderr: string }> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  env['MOLE_OFFICE_AGENT'] = handle
  env['MOLE_OFFICE_SESSION'] = session
  env['MOLE_OFFICE_WORKSPACE'] = 'default'
  env['MOLE_OFFICE_API'] = api
  // THE OFFICE'S KEY FILE IS FOR THIS TEST'S DATABASE, never the live checkout's.
  env['MOLE_OFFICE_DB'] = t.file
  const ran = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [POST_TOOL_USE], { cwd: process.cwd(), env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.stdin.on('error', () => {})
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.write(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }))
    child.stdin.end()
  })
  expect(ran.status, ran.stderr).toBe(0)
  const said = JSON.parse(ran.stdout.trim() || '{}') as { hookSpecificOutput?: { additionalContext?: string } }
  return { context: String(said.hookSpecificOutput?.additionalContext ?? ''), stderr: ran.stderr }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const ids = []
  for (const handle of [READER, WRITER, OTHER, DSH]) ids.push(await started(handle))
  const opened = await inject('POST', '/api/groups', AS_THE_PERSON, {
    name: 'The potting bench',
    because: 'The potting bench is planned here.',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
      ...ids.map((id) => ({ who: { kind: 'agent', id }, because: 'It works at the potting bench.' })),
    ],
  })
  expect(opened.status, opened.text).toBe(201)
  group = (opened.json['group'] as { id: string }).id
  for (const handle of [READER, DSH]) await clearInbox(handle)
  await said(TO_EVERYONE, asAgent(WRITER))
  toTheOther = await said(TO_THE_OTHER, asAgent(WRITER))
  await said(THE_READERS_OWN, asAgent(READER))
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
  await app.close()
  t.close()
})

describe('a hand-over carries only the group news that did not reach the agent one by one', () => {
  it('the door with ?undelivered=1 leaves out the reader’s own message and the one delivered to it', async () => {
    const undelivered = await theDoor(READER, '?undelivered=1')
    expect(undelivered.summary.onlyTheUndelivered).toBe(true)
    expect(undelivered.summary.readPointMoved).toBe(false)
    const mine = undelivered.summary.groups.find((one) => one.id === group)
    expect(mine?.newest.map((one) => one.id)).toEqual([toTheOther])
    expect(mine?.count).toBe(1)
    expect(undelivered.text).toContain('NEW IN YOUR GROUPS that did not reach you one by one')
    expect(undelivered.text).toContain(TO_THE_OTHER)
    expect(undelivered.text).not.toContain(TO_EVERYONE)
    expect(undelivered.text).not.toContain(THE_READERS_OWN)
    // WITHOUT IT, THE SUMMARY IS AS BEFORE: every member's new message, the reader's own among them.
    const whole = await theDoor(READER, '')
    expect(whole.summary.onlyTheUndelivered).toBe(false)
    expect(whole.summary.groups.find((one) => one.id === group)?.count).toBe(3)
    expect(whole.text).toContain(TO_EVERYONE)
  })

  it('the waiter hands over what was delivered whole, then only the news that was not, and moves the read point', async () => {
    const direct = await aDirectMessage(READER, 'Please read the bench plan before the trays come.')
    readersSession = await aSession('the reader’s session')
    const printed = await theWaiterSays(READER, readersSession)
    expect(printed).toContain(`THE MESSAGE, record ${direct}:`)
    expect(printed).toContain('FROM A GROUP')
    expect(timesIn(printed, TO_EVERYONE), `the delivered group message was not printed exactly once:\n${printed}`).toBe(1)
    expect(printed).toContain('NEW IN YOUR GROUPS that did not reach you one by one')
    expect(timesIn(printed, TO_THE_OTHER)).toBe(1)
    expect(printed).not.toContain(THE_READERS_OWN)
    expect(printed.indexOf('NEW IN YOUR GROUPS')).toBeGreaterThan(printed.indexOf(TO_EVERYONE))
    expect(printed.trim().split('\n').pop()).toMatch(/^exiting: delivered /)
    // THE READ POINT MOVED: the door has nothing new for the reader in any group.
    const after = await theDoor(READER, '')
    expect(after.summary.groups).toEqual([])
  })

  it('a later wake with nothing left undelivered prints no group news', async () => {
    const direct = await aDirectMessage(READER, 'The trays are in.', 201)
    const printed = await theWaiterSays(READER, readersSession)
    expect(printed).toContain(`THE MESSAGE, record ${direct}:`)
    expect(printed).not.toContain('NEW IN YOUR GROUPS')
    expect(printed).not.toContain('No member wrote anything new')
  })

  it('dsh’s hand-over attaches the delivered group messages whole and only the undelivered one as news', async () => {
    const session = await aSession('the dsh session')
    const first = await theHookAttaches(DSH, session)
    expect(first.stderr).toBe('')
    expect(timesIn(first.context, TO_EVERYONE)).toBe(1)
    expect(timesIn(first.context, THE_READERS_OWN)).toBe(1)
    expect(first.context).toContain('NEW IN YOUR GROUPS that did not reach you one by one')
    expect(timesIn(first.context, TO_THE_OTHER)).toBe(1)
    // THE READ POINT MOVED, so the next hand-over attaches its message and no news.
    await aDirectMessage(DSH, 'Bring the watering can.')
    const second = await theHookAttaches(DSH, session)
    expect(second.context).toContain('Bring the watering can.')
    expect(second.context).not.toContain('NEW IN YOUR GROUPS')
  })
})
