// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GROUP MESSAGE THAT NAMES NOBODY DOES NOT WAKE THE AGENT, AND A PERSON'S MESSAGE WAKES IT AT ONCE.
 *
 * Before 7 November 2026 the kit's waiter woke its agent for every hand-over, so each message in a group the agent
 * was in woke it, whoever it was for. Now a message sent to a group wakes the agent only when it names the
 * agent, a burst of the rest is gathered into one wake, and a person's message wakes it at
 * once. The waiter tool says which of the three a hand-over is, with --kept-by-the-kit, in one line before its last:
 * "hand-over wakes: now", "hand-over wakes: after-a-burst" or "hand-over wakes: nobody". The rule is
 * whenAHandOverWakes in for-agents/when-a-hand-over-wakes.mjs. What waiter.sh does with the line is
 * tests/the-kits-waiter-wakes-once-for-a-burst-and-not-for-a-group-that-names-nobody.test.ts.
 *
 * WHAT IS PROVED HERE.
 *   1. The rule, with a made-up inbox: a person's message, an emergency and a message that could not be read wake at
 *      once; group messages that name nobody wake nobody; a message names the agent by its handle, by its name, by
 *      @all or @所有人, or by being delivered only to it; anything else waits for a burst; and when the agent's name
 *      cannot be read, a group message counts as naming it. The name is not asked for when nothing turns on it.
 *   2. The real waiter tool, against a real office on a free port, with made-up agents and one group: it prints the
 *      line for a group message that names nobody, for one that names the agent by a name that is not its handle, for
 *      @all, for an agent's direct message and for the person's group message, and prints no such line without
 *      --kept-by-the-kit.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { whenAHandOverWakes } from '../for-agents/when-a-hand-over-wakes.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

// ============================================================================ 1. the rule, with a made-up inbox

const ME = { who: { kind: 'agent' as const, id: 'made-up-agent-id' }, handle: 'made-up-pip', name: 'Pip' }
const ANOTHER_AGENT = { kind: 'agent', id: 'made-up-other-agent' }
const A_PERSON = { kind: 'person', id: 'made-up-person' }
/** The office's own sender, made up: the rule gives it no place of its own. */
const THE_OFFICE = { kind: 'agent', id: 'made-up-office' }

/** One message as the tool hands it to the rule, read from the message's record. */
interface AHandedOverMessage {
  read: boolean
  sentBy: unknown
  toGroup: unknown
  words: unknown
  deliveredOnlyTo: unknown
  urgent: boolean
}

/** One made-up message: an agent's, to this agent, read. */
function aMessage(over: Partial<AHandedOverMessage> = {}): AHandedOverMessage {
  return { read: true, sentBy: ANOTHER_AGENT, toGroup: null, words: 'Made-up words.', deliveredOnlyTo: undefined, urgent: false, ...over }
}
const toTheGroup = (words: string, over: Partial<AHandedOverMessage> = {}): AHandedOverMessage => aMessage({ toGroup: 'made-up-group', words, ...over })

/** The rule's answer, and how many times it asked who the agent is. */
async function theAnswer(messages: AHandedOverMessage[], me: typeof ME | null = ME): Promise<{ answer: string; asked: number }> {
  let asked = 0
  const answer = await whenAHandOverWakes(messages, async () => {
    asked++
    return me
  })
  return { answer, asked }
}

describe('the rule: when a hand-over wakes its agent', () => {
  it('wakes at once for a person, for an emergency, and for a message that could not be read', async () => {
    expect((await theAnswer([aMessage({ sentBy: A_PERSON })])).answer, 'a person’s direct message').toBe('now')
    expect((await theAnswer([toTheGroup('The trays are in.', { sentBy: A_PERSON })])).answer, 'a person’s group message that names nobody').toBe('now')
    expect((await theAnswer([toTheGroup('The trays are in.', { urgent: true })])).answer, 'an emergency to a group').toBe('now')
    expect((await theAnswer([aMessage({ read: false, sentBy: undefined, toGroup: undefined, words: undefined })])).answer, 'a message that could not be read').toBe('now')
    expect((await theAnswer([toTheGroup('The trays are in.'), aMessage({ sentBy: A_PERSON })])).answer, 'a person’s message among group chatter').toBe('now')
  })

  it('wakes nobody for group messages that name nobody, the office’s own lines among them', async () => {
    expect((await theAnswer([toTheGroup('The compost comes at nine.')])).answer).toBe('nobody')
    expect((await theAnswer([toTheGroup('Joined the group.', { sentBy: THE_OFFICE })])).answer, 'an office line to a group').toBe('nobody')
    expect((await theAnswer([toTheGroup('One.'), toTheGroup('Two.')])).answer, 'two group messages that name nobody').toBe('nobody')
  })

  it('reads an @ as the office does: a longer word or an @ inside a word names nobody', async () => {
    expect((await theAnswer([toTheGroup('@Pipa has the trays.')])).answer, '@Pipa is not Pip').toBe('nobody')
    expect((await theAnswer([toTheGroup('mail x@Pip about it')])).answer, 'an @ inside a word').toBe('nobody')
    expect((await theAnswer([toTheGroup('@made-up-pipe is somebody else')])).answer, 'a longer handle').toBe('nobody')
  })

  it('waits for a burst when a group message names the agent, by handle, by name, by @all or @所有人, or by being delivered only to it', async () => {
    expect((await theAnswer([toTheGroup('@made-up-pip can you look?')])).answer, 'by handle').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('Thanks @Pip, that helps.')])).answer, 'by the name the chat draws').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('@pip, one more thing.')])).answer, 'by name, in another case').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('@all the trays are in.')])).answer, '@all').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('@所有人 托盘到了。')])).answer, '@所有人').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('A line for one member.', { sentBy: THE_OFFICE, deliveredOnlyTo: [ME.who] })])).answer, 'a line delivered only to it').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('A line for one member.', { sentBy: THE_OFFICE, deliveredOnlyTo: [ANOTHER_AGENT] })])).answer, 'a line delivered only to another').toBe('nobody')
    expect((await theAnswer([toTheGroup('Nothing for you.'), toTheGroup('@Pip this one is.')])).answer, 'one of two names it').toBe('after-a-burst')
  })

  it('waits for a burst for a message to the agent itself, and does not ask its name for one', async () => {
    const direct = await theAnswer([aMessage()])
    expect(direct.answer, 'an agent’s direct message').toBe('after-a-burst')
    expect(direct.asked, 'the name was asked for with no group message to read it in').toBe(0)
    expect((await theAnswer([aMessage({ sentBy: THE_OFFICE })])).answer, 'an office notice to the agent').toBe('after-a-burst')
    expect((await theAnswer([toTheGroup('The compost comes at nine.'), aMessage()])).answer, 'chatter and a direct message').toBe('after-a-burst')
  })

  it('counts a group message as naming the agent when its name cannot be read', async () => {
    const unreadable = await theAnswer([toTheGroup('The compost comes at nine.')], null)
    expect(unreadable.answer).toBe('after-a-burst')
    expect(unreadable.asked).toBe(1)
  })
})

// ============================================================================ 2. the real waiter tool

const TOOL = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
const QUIET = 'wk-quiet'
/** The quiet agent's name, which is not its handle, so a case can tell a match by name from one by handle. */
const QUIETS_NAME = 'Wren'
const WRITER = 'wk-writer'

let t: TestDb
let app: FastifyInstance
let api = ''
let group = ''
let quietsId = ''
let session = ''
/** Every tool this file started, killed by the pid recorded at start. */
const tools: ChildProcess[] = []

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (handle: string): Record<string, string> => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

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

async function started(handle: string, name: string): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  return (reply.json['agent'] as { id: string }).id
}

/** Mark everything waiting for the quiet agent seen, so a case hands over its own messages alone. */
async function clearTheInbox(): Promise<void> {
  const waiting = await inject('GET', '/api/messages?only=waiting-for-me', asAgent(QUIET))
  expect(waiting.status, waiting.text).toBe(200)
  for (const { id } of (waiting.json['messages'] ?? []) as { id: string }[]) {
    const marked = await inject('POST', `/api/messages/${id}/mark`, asAgent(QUIET), { mark: 'seen' })
    expect(marked.status, marked.text).toBe(200)
  }
}

async function filed(headers: Record<string, string>, data: Record<string, unknown>): Promise<string> {
  const sent = await inject('POST', '/api/records', headers, { kind: 'message', title: String(data['body']).slice(0, 40), data })
  expect(sent.status, sent.text).toBe(201)
  return (sent.json['record'] as { id: string }).id
}
const inTheGroup = (body: string, headers = asAgent(WRITER)): Promise<string> => filed(headers, { body, toGroup: group })

/** Run the waiter tool for the quiet agent until it hands over, and answer what it printed. */
async function theToolSays(keptByTheKit: boolean): Promise<string> {
  const env: Record<string, string | undefined> = { ...process.env, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' }
  // NO KEY OF THE SHELL'S GOES TO THE TEST'S OFFICE: the tool sends the test office's own key, read beside its database.
  for (const name of Object.keys(env)) if (/KEY|TOKEN|CREDENTIAL/u.test(name)) delete env[name]
  const child = spawn(process.execPath, [TOOL, '--agent', QUIET, '--session', session, '--api', api, '--workspace', 'default', ...(keptByTheKit ? ['--kept-by-the-kit'] : [])], { env })
  tools.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const code = await Promise.race([
    new Promise<number>((go) => child.on('exit', (exit) => go(exit ?? -1))),
    new Promise<null>((go) => setTimeout(() => go(null), 42_000)),
  ])
  expect(code, `the tool never stopped: ${printed}`).toBe(0)
  expect(printed.trim().split('\n').pop(), printed).toMatch(/^exiting: delivered /)
  return printed
}

/** The answer the tool printed, or null when it printed no such line. */
function theWakeLine(printed: string): string | null {
  const lines = printed.split('\n').filter((line) => line.startsWith('hand-over wakes: '))
  expect(lines.length, `more than one wake line:\n${printed}`).toBeLessThanOrEqual(1)
  return lines[0] === undefined ? null : lines[0].slice('hand-over wakes: '.length)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  quietsId = await started(QUIET, QUIETS_NAME)
  const writersId = await started(WRITER, 'Made-up writer')
  const opened = await inject('POST', '/api/groups', AS_THE_PERSON, {
    name: 'The seed trays',
    because: 'The seed trays are planned here.',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
      ...[quietsId, writersId].map((id) => ({ who: { kind: 'agent', id }, because: 'It works on the seed trays.' })),
    ],
  })
  expect(opened.status, opened.text).toBe(201)
  group = (opened.json['group'] as { id: string }).id
  const made = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'the quiet agent’s session', data: { state: 'running' } })
  expect(made.status, made.text).toBe(201)
  session = (made.json['record'] as { id: string }).id
}, 60_000)

afterAll(async () => {
  for (const child of tools) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is where a tool that handed over is.
    }
  }
  await app?.close()
  t?.close()
})

describe('the waiter tool says when a hand-over wakes, with --kept-by-the-kit', () => {
  it('says nobody for an agent’s group message that names nobody', async () => {
    await clearTheInbox()
    await inTheGroup('The seed trays are on the bench.')
    expect(theWakeLine(await theToolSays(true))).toBe('nobody')
  }, 60_000)

  it('says after-a-burst for a group message that names the agent by its name, which is not its handle', async () => {
    await clearTheInbox()
    await inTheGroup(`@${QUIETS_NAME} can you water the seed trays?`)
    expect(theWakeLine(await theToolSays(true))).toBe('after-a-burst')
  }, 60_000)

  it('says after-a-burst for @all', async () => {
    await clearTheInbox()
    await inTheGroup('@all the seed trays are in.')
    expect(theWakeLine(await theToolSays(true))).toBe('after-a-burst')
  }, 60_000)

  it('says after-a-burst for an agent’s message to the agent itself', async () => {
    await clearTheInbox()
    await filed(asAgent(WRITER), { body: 'The seed trays need labels.', to: [{ kind: 'agent', id: quietsId }] })
    expect(theWakeLine(await theToolSays(true))).toBe('after-a-burst')
  }, 60_000)

  it('says now for the person’s group message, though it names nobody', async () => {
    await clearTheInbox()
    await inTheGroup('The seed trays look good.', AS_THE_PERSON)
    expect(theWakeLine(await theToolSays(true))).toBe('now')
  }, 60_000)

  it('prints no such line without --kept-by-the-kit', async () => {
    await clearTheInbox()
    await inTheGroup('The seed trays are watered.')
    expect(theWakeLine(await theToolSays(false))).toBeNull()
  }, 60_000)
})
