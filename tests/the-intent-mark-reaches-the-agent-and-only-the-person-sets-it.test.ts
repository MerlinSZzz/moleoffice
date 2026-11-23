// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK OF WHAT THE PERSON WANTS BACK REACHES THE AGENT, AND ONLY THE PERSON SETS IT. A message
 * from the person to an agent carries none, "just ask", "proposal first", "align" or "give options".
 * The rule and its sentences are in src/shared/intent-mark.ts.
 *
 * WHAT IS PROVED HERE, against a real office on a free port, the real waiter and the real dsh hook:
 *
 *   1. The mark is stored on the message as the person wrote it, and read back.
 *   2. Only the person sets it. An agent's message that carries it is refused, and so is every later write that would
 *      set, change or take it off: a dataPatch, a whole `data`, the agent's own message, and a record turned into a
 *      message. Each refusal writes nothing.
 *   3. The inbox read, GET /api/messages/:id, the waiter's hand-over and the dsh hook each carry the mark with its one
 *      sentence. They do so for Proposal first, and again for Give options, the fourth flag the office ships. Give
 *      options' sentence is read from the word list, never copied. On the code before that flag, a message marked
 *      "give-options" is refused, so its case fails there.
 *   4. "Mark broken" files one problem naming the message, the mark and the reply, and tells the agent in one line to
 *      it alone. A second press files nothing. An agent's press, an unmarked message and a reply the person wrote are
 *      refused.
 *   5. A message with no mark is unchanged everywhere: no field on the wire and no line in the hand-over.
 *
 * The messages and names are made up for this test.
 *
 * MUTATIONS, each after a green control run, then restored (logs in .scratch/r49):
 *   - the create check in src/server/lib/records.ts taken out: case 2 goes red;
 *   - `refuseAnIntentMarkThisWriteWouldChange` returning at once: case 2 goes red;
 *   - `theIntentOnTheWire` answering {}: cases 3 and 4 go red (the press reads the mark from the same message);
 *   - `deliveryEnvelope` never pushing the sentence: case 3 goes red;
 *   - the press's "already pressed" check taken out: case 4 goes red;
 *   - `theIntentOnTheWire` handing `intent: null` for a message with no mark: case 5 goes red.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { deliveryEnvelope } from '../src/shared/messages.ts'
import { THE_INTENT_MARK_IS_SET_WHEN_WRITTEN, THE_INTENT_MARK_IS_THE_PERSONS } from '../src/shared/intent-mark.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

const SESSION_START = fileURLToPath(new URL('../tools/dsh-hooks/session-start.mjs', import.meta.url))
const WAITER = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))

const JUST_ASK = 'Just ask: answer only; change nothing.'
const PROPOSAL_FIRST = 'Proposal first: come back with a proposal; build nothing until the person says yes.'
const GIVE_OPTIONS = enWave13y['message.intent.giveOptions'] as string

let t: TestDb
let app: FastifyInstance
let api = ''
const waiters: ChildProcess[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
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

async function started(handle: string): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  const key = (reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key
  if (key) writeFileSync(join(dirname(t.file), `${handle}.key`), key, { mode: 0o600 })
  return (reply.json['agent'] as { id: string }).id
}

async function clearInbox(handle: string): Promise<void> {
  const waiting = await inject('GET', '/api/messages?only=waiting-for-me&limit=25', asAgent(handle))
  expect(waiting.status, waiting.text).toBe(200)
  for (const { id } of (waiting.json['messages'] ?? []) as { id: string }[]) {
    const marked = await inject('POST', `/api/messages/${id}/mark`, asAgent(handle), { mark: 'seen' })
    expect(marked.status, marked.text).toBe(200)
  }
}

/** File one message, and answer the whole reply so a refusal can be read. */
async function write(headers: Record<string, string>, to: { kind: string; id: string }[], body: string, extra: Record<string, unknown> = {}) {
  return inject('POST', '/api/records', headers, { kind: 'message', title: body.slice(0, 40), data: { body, to, ...extra } })
}

async function send(headers: Record<string, string>, to: { kind: string; id: string }[], body: string, extra: Record<string, unknown> = {}, expected?: number): Promise<string> {
  const filed = await write(headers, to, body, extra)
  expect(filed.status, filed.text).toBe(expected ?? theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to } }))
  return (filed.json['record'] as { id: string }).id
}

async function aSession(title: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title, data: { state: 'running' } })
  expect(filed.status, filed.text).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

async function storedData(id: string): Promise<Record<string, unknown>> {
  const read = await inject('GET', `/api/records/${id}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return (read.json['record'] as { data: Record<string, unknown> }).data
}

function howMany(kind: string, where = '1 = 1', ...values: unknown[]): number {
  return (
    t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM records WHERE kind = ? AND deleted_at IS NULL AND ${where}`).get(kind, ...values) as {
      n: number
    }
  ).n
}

/** Run the dsh SessionStart hook as the bridge runs it, asynchronously so this process's office can answer it. */
async function theHookSays(handle: string, session: string): Promise<string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  env['MOLE_OFFICE_AGENT'] = handle
  env['MOLE_OFFICE_SESSION'] = session
  env['MOLE_OFFICE_WORKSPACE'] = 'default'
  env['MOLE_OFFICE_API'] = api
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

/** The lines of some printed text that are one of the three sentences. */
function sentenceLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line === JUST_ASK || line === PROPOSAL_FIRST || line === GIVE_OPTIONS)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
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

describe('the intent mark', () => {
  it('1. is stored as the person wrote it, and read back', async () => {
    const id = await started('intent-stored')
    for (const intent of ['none', 'just-ask', 'proposal-first', 'align', 'give-options']) {
      const message = await send(AS_THE_PERSON, [{ kind: 'agent', id }], `Test: marked ${intent}.`, { intent })
      expect((await storedData(message))['intent']).toBe(intent)
    }
    const refused = await write(AS_THE_PERSON, [{ kind: 'agent', id }], 'Test: not a mark.', { intent: 'build-it-all' })
    expect(refused.status, refused.text).toBe(400)
  })

  it('2. is set only by the person, only when the message is written (an agent\'s write of data.intent is refused)', async () => {
    const reader = await started('intent-reader')
    await started('intent-writer')
    const before = howMany('message')

    // AN AGENT'S OWN MESSAGE, written with a mark: refused, and nothing is filed.
    const byAgent = await write(asAgent('intent-writer'), [{ kind: 'agent', id: reader }], 'Test: an agent marks its own.', { intent: 'just-ask' })
    expect(byAgent.status, byAgent.text).toBe(403)
    expect(byAgent.text).toContain(THE_INTENT_MARK_IS_THE_PERSONS.slice(0, 60))
    expect(howMany('message')).toBe(before)

    // THE AGENT'S MESSAGE AFTER SENDING: neither a dataPatch nor a whole data may add the mark. Nothing holds the reader
    // in the test office, so the office stores the message, routes it and answers 409; the message is stored all the same.
    const own = await send(asAgent('intent-writer'), [{ kind: 'agent', id: reader }], 'Test: an agent writes plainly.', {}, 409)
    const patched = await inject('PATCH', `/api/records/${own}`, asAgent('intent-writer'), { dataPatch: { intent: 'proposal-first' } })
    expect(patched.status, patched.text).toBe(403)
    expect(patched.text).toContain(THE_INTENT_MARK_IS_SET_WHEN_WRITTEN.slice(0, 60))
    const stored = await storedData(own)
    const whole = await inject('PATCH', `/api/records/${own}`, asAgent('intent-writer'), { data: { ...stored, intent: 'just-ask' } })
    expect(whole.status, whole.text).toBe(403)
    expect(Object.hasOwn(await storedData(own), 'intent')).toBe(false)

    // THE PERSON'S OWN MARKED MESSAGE: no later write changes or drops the mark, not even the person's.
    const marked = await send(AS_THE_PERSON, [{ kind: 'agent', id: reader }], 'Test: the person asks only.', { intent: 'just-ask' })
    const changed = await inject('PATCH', `/api/records/${marked}`, AS_THE_PERSON, { dataPatch: { intent: 'proposal-first' } })
    expect(changed.status, changed.text).toBe(403)
    const markedData = await storedData(marked)
    const { intent: _dropped, ...withoutTheMark } = markedData
    const dropped = await inject('PATCH', `/api/records/${marked}`, AS_THE_PERSON, { data: withoutTheMark, replace: true })
    expect(dropped.status, dropped.text).toBe(403)
    expect((await storedData(marked))['intent']).toBe('just-ask')

    // A NOTE TURNED INTO A MESSAGE would bring `extra.intent` back onto the message: refused, and it stays a note.
    const note = await inject('POST', '/api/records', AS_THE_PERSON, {
      kind: 'note',
      title: 'Test: a note',
      data: { date: '2026-10-08', body: 'Test: a note.', extra: { to: [{ kind: 'agent', id: reader }], intent: 'just-ask' } },
    })
    expect(note.status, note.text).toBe(201)
    const noteId = (note.json['record'] as { id: string }).id
    const turned = await inject('PATCH', `/api/records/${noteId}`, AS_THE_PERSON, { kind: 'message' })
    expect(turned.status, turned.text).toBe(403)
    expect(turned.text).toContain(THE_INTENT_MARK_IS_SET_WHEN_WRITTEN.slice(0, 60))
  })

  it('3. reaches the agent with its sentence in the inbox, the message GET, the waiter and the dsh hook', async () => {
    const byWaiter = await started('intent-by-waiter')
    const byHook = await started('intent-by-hook')
    for (const handle of ['intent-by-waiter', 'intent-by-hook']) await clearInbox(handle)
    const id = await send(
      AS_THE_PERSON,
      [
        { kind: 'agent', id: byWaiter },
        { kind: 'agent', id: byHook },
      ],
      'Test: what would you change first?',
      { intent: 'proposal-first' },
    )

    const inbox = await inject('GET', '/api/messages?only=waiting-for-me&limit=25&full=1', asAgent('intent-by-waiter'))
    expect(inbox.status, inbox.text).toBe(200)
    const listed = ((inbox.json['messages'] ?? []) as Record<string, unknown>[]).find((one) => one['id'] === id)
    expect(listed?.['intent']).toBe('proposal-first')
    expect(listed?.['whatTheMarkAsks']).toBe(PROPOSAL_FIRST)

    const one = await inject('GET', `/api/messages/${id}`, asAgent('intent-by-waiter'))
    expect(one.status, one.text).toBe(200)
    const message = (one.json['message'] ?? one.json) as Record<string, unknown>
    expect(message['intent']).toBe('proposal-first')
    expect(message['whatTheMarkAsks']).toBe(PROPOSAL_FIRST)

    const hook = await theHookSays('intent-by-hook', await aSession('Test: the dsh session'))
    expect(hook).toContain(`THE MESSAGE, record ${id}:`)
    expect(sentenceLines(hook), hook).toEqual([PROPOSAL_FIRST])

    const waiter = await theWaiterSays('intent-by-waiter', await aSession('Test: the waiting terminal'))
    expect(waiter).toContain(`THE MESSAGE, record ${id}:`)
    expect(sentenceLines(waiter), waiter).toEqual([PROPOSAL_FIRST])
  }, 90_000)

  it('3. Give options reaches the agent with its sentence in the inbox, the message GET, the waiter and the dsh hook', async () => {
    expect(GIVE_OPTIONS, 'the word list has no sentence for Give options').toBeTruthy()
    const byWaiter = await started('options-by-waiter')
    const byHook = await started('options-by-hook')
    for (const handle of ['options-by-waiter', 'options-by-hook']) await clearInbox(handle)
    const id = await send(
      AS_THE_PERSON,
      [
        { kind: 'agent', id: byWaiter },
        { kind: 'agent', id: byHook },
      ],
      'Test: how should the bench keep its fixtures?',
      { intent: 'give-options' },
    )

    const inbox = await inject('GET', '/api/messages?only=waiting-for-me&limit=25&full=1', asAgent('options-by-waiter'))
    expect(inbox.status, inbox.text).toBe(200)
    const listed = ((inbox.json['messages'] ?? []) as Record<string, unknown>[]).find((one) => one['id'] === id)
    expect(listed?.['intent']).toBe('give-options')
    expect(listed?.['whatTheMarkAsks']).toBe(GIVE_OPTIONS)

    const one = await inject('GET', `/api/messages/${id}`, asAgent('options-by-waiter'))
    expect(one.status, one.text).toBe(200)
    const message = (one.json['message'] ?? one.json) as Record<string, unknown>
    expect(message['intent']).toBe('give-options')
    expect(message['whatTheMarkAsks']).toBe(GIVE_OPTIONS)

    const hook = await theHookSays('options-by-hook', await aSession('Test: the dsh session for Give options'))
    expect(hook).toContain(`THE MESSAGE, record ${id}:`)
    expect(sentenceLines(hook), hook).toEqual([GIVE_OPTIONS])

    const waiter = await theWaiterSays('options-by-waiter', await aSession('Test: the waiting terminal for Give options'))
    expect(waiter).toContain(`THE MESSAGE, record ${id}:`)
    expect(sentenceLines(waiter), waiter).toEqual([GIVE_OPTIONS])
  }, 90_000)

  it('4. "mark broken" files one problem and tells the agent once; only the person presses it, on a marked message', async () => {
    const agent = await started('intent-breaker')
    await clearInbox('intent-breaker')
    const marked = await send(AS_THE_PERSON, [{ kind: 'agent', id: agent }], 'Test: why does the build fail?', { intent: 'just-ask' })
    const reply = await send(asAgent('intent-breaker'), [{ kind: 'person', id: THE_PERSON }], 'Test: I changed the build.')
    const problemsBefore = howMany('problem')

    const byAgent = await inject('POST', `/api/messages/${reply}/mark-broken`, asAgent('intent-breaker'), { markedMessage: marked })
    expect(byAgent.status, byAgent.text).toBe(403)
    const unmarked = await send(AS_THE_PERSON, [{ kind: 'agent', id: agent }], 'Test: an unmarked question.')
    const onUnmarked = await inject('POST', `/api/messages/${reply}/mark-broken`, AS_THE_PERSON, { markedMessage: unmarked })
    expect(onUnmarked.status, onUnmarked.text).toBe(400)
    const onThePersons = await inject('POST', `/api/messages/${marked}/mark-broken`, AS_THE_PERSON, { markedMessage: marked })
    expect(onThePersons.status, onThePersons.text).toBe(400)
    expect(howMany('problem')).toBe(problemsBefore)
    await clearInbox('intent-breaker')

    // PRESSED STANDING IN ANOTHER PROJECT: a message belongs to no project, so the press crosses, and the problem is
    // filed in the project the person stands in.
    const elsewhere = await inject('POST', '/api/workspaces', AS_THE_PERSON, { id: 'intent-elsewhere', title: 'Test: Elsewhere' })
    expect(elsewhere.status, elsewhere.text).toBeLessThan(300)
    const standingElsewhere = { ...AS_THE_PERSON, 'x-mole-office-workspace': 'intent-elsewhere' }
    const pressed = await inject('POST', `/api/messages/${reply}/mark-broken`, standingElsewhere, { markedMessage: marked })
    expect(pressed.status, pressed.text).toBe(200)
    expect(pressed.json['filed']).toBe(true)
    const problem = String(pressed.json['problem'])
    const where = t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(problem) as { w: string }
    expect(where.w).toBe('intent-elsewhere')
    const read = await inject('GET', `/api/records/${problem}`, standingElsewhere)
    expect(read.status, read.text).toBe(200)
    const filed = (read.json['record'] as { data: Record<string, unknown> }).data
    expect((filed['extra'] as Record<string, unknown>)['intentMarkBroken']).toEqual({
      message: marked,
      intent: 'just-ask',
      reply,
      agent: { kind: 'agent', id: agent },
    })
    expect(String(filed['symptom'])).toContain(JUST_ASK)

    const waiting = await inject('GET', '/api/messages?only=waiting-for-me&limit=25&full=1', asAgent('intent-breaker'))
    const lines = ((waiting.json['messages'] ?? []) as Record<string, unknown>[]).filter((one) => one['id'] === pressed.json['told'])
    expect(lines, waiting.text).toHaveLength(1)
    const said = JSON.stringify(lines[0])
    for (const named of [marked, reply, problem]) expect(said).toContain(named)

    const again = await inject('POST', `/api/messages/${reply}/mark-broken`, AS_THE_PERSON, { markedMessage: marked })
    expect(again.status, again.text).toBe(200)
    expect(again.json['filed']).toBe(false)
    expect(again.json['problem']).toBe(problem)
    expect(howMany('problem')).toBe(problemsBefore + 1)
    expect(howMany('message', "json_extract(data, '$.extra.intentMarkBroken.reply') = ?", reply)).toBe(1)
  })

  it('5. a message with no mark is unchanged everywhere', async () => {
    const reader = await started('intent-unmarked')
    await clearInbox('intent-unmarked')
    const id = await send(AS_THE_PERSON, [{ kind: 'agent', id: reader }], 'Test: a plain question.')
    expect(Object.hasOwn(await storedData(id), 'intent')).toBe(false)

    const inbox = await inject('GET', '/api/messages?only=waiting-for-me&limit=25', asAgent('intent-unmarked'))
    const listed = ((inbox.json['messages'] ?? []) as Record<string, unknown>[]).find((one) => one['id'] === id)
    expect(listed).toBeDefined()
    expect(Object.hasOwn(listed ?? {}, 'intent')).toBe(false)
    expect(Object.hasOwn(listed ?? {}, 'whatTheMarkAsks')).toBe(false)
    const one = await inject('GET', `/api/messages/${id}`, asAgent('intent-unmarked'))
    const message = (one.json['message'] ?? one.json) as Record<string, unknown>
    expect(Object.hasOwn(message, 'intent')).toBe(false)
    expect(Object.hasOwn(message, 'whatTheMarkAsks')).toBe(false)

    const envelope = { from: 'Test sender', inProject: 'default', message: id }
    for (const intent of [undefined, null, 'none', 'not-a-mark']) {
      expect(deliveryEnvelope({ ...envelope, intent })).toEqual(deliveryEnvelope(envelope))
    }

    const waiter = await theWaiterSays('intent-unmarked', await aSession('Test: the plain terminal'))
    expect(waiter).toContain(`THE MESSAGE, record ${id}:`)
    expect(sentenceLines(waiter), waiter).toEqual([])
  }, 60_000)
})
