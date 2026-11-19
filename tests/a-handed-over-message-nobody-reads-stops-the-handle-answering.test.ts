// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE HANDED OVER AND NOT READ STOPS A HELD HANDLE READING AS ANSWERING.
 *
 * Problem `-MLrleDe93wM`, found by the owner on 29 September 2026 at 11:42. The agent's last act was at
 * 06:30. Eight messages were handed to its waiter after that and none was read, and
 * `GET /api/handles/<its handle>` said "a live session" the whole time, with a fresh hold. The waiter beats
 * from its own process, and the agent's process was alive, so nothing the office read said otherwise.
 *
 * WHAT "HANDED OVER" AND "READ" ARE HERE
 *
 *   · handed over: the delivery row the took door writes, with the sentence naming the session and
 *     the time (`theFirstMessageHandedToThisSessionAfter` in src/server/lib/handles.ts);
 *   · read: the session's own transcript growing after that time. The delivery mark is not used,
 *     the waiter marks the unread message delivered, and the transcript shows whether a turn followed.
 *
 * WHAT IS MEASURED, with the setting MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS at 3 seconds:
 *
 *   · before the set time, a session that was handed a message still answers;
 *   · past the set time, a session whose transcript has not grown since the hand-over does not: the
 *     handle door says "is holding its handle, but nobody has read since <time>", the hold itself is
 *     still fresh, the owner's dot is grey with the same sentence, and a new message to the agent
 *     goes up its chain of starters;
 *   · past the set time, a session whose transcript grew after the hand-over still answers, and a
 *     new message to it goes to nobody else.
 *
 * Both sessions have a live process row and a transcript from two hours ago, which is the problem's shape:
 * before this change a live process answered for a quiet transcript.
 *
 * MUTATION, CONTROL RUN FIRST (the logs are named in the commit message that adds this file):
 *   in `theReadingOf` (src/server/lib/answering.ts), the guarded line
 *   `if (unread !== undefined && now.getTime() - unread.getTime() > limit * 1000) {` changed to
 *   `if (unread !== undefined && now.getTime() - unread.getTime() > limit * 1000 && false) {` —
 *   the "past the set time, nothing read" cases go red, because the handle still says a live session.
 *
 * THE LIVE PROCESSES ARE REAL CHILDREN OF THIS TEST, each in its own group, registered as process
 * resources of the sessions. They are killed by their group in afterAll.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The setting under test, short so the file can cross it. */
const UNREAD = 'MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS'
const LIMIT_SECONDS = 3

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []
/** Where the sessions' transcripts live, removed with the file. */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-unread-hand-over-'))

/** When the transcripts last grew before the hand-overs: two hours ago, as in the problem. */
const LONG_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000)

/** The one session and transcript behind each held handle, by handle. */
const heldBy = new Map<string, { session: string; logPath: string }>()
/** The message handed to each held session, by handle. */
const handedOver = new Map<string, string>()
/** The moment the last hand-over was written, so the waits below are measured from it. */
let handedAt = 0

// ============================================================ fixtures

function anAgent(handle: string): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  return idOf(handle)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

// THE OWNER BESIDE THE STARTER. Since the owner package a routed copy follows the recorded owner, and the office records
// an agent's starter as its owner, so this test writes both, as a real office holds them.
function setStartedBy(handle: string, by: string): void {
  t.client.sqlite
    .prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ?, owner_kind = 'agent', owner_id = ? WHERE id = ?")
    .run(idOf(by), idOf(by), idOf(handle))
}

/** A real process of this test's own, in its own group, registered against the session. */
async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: WORKSPACE, sessionRecordId, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

/** A running session serving the agent, with a live process: the reach reading reads this as a run. */
async function makeReachable(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: idOf(handle) },
    actor: t.api.HUMAN,
  }).id
  await aLiveProcessFor(session)
}

/** One transcript line, as Claude Code writes an assistant turn. */
function aTurnAt(at: Date, text: string): string {
  return `${JSON.stringify({
    type: 'assistant',
    timestamp: at.toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })}\n`
}

/**
 * A terminal session answering as the agent: a transcript last written two hours ago, a live process
 * row, and the handle held through the real door. It names no serving agent, so it is not a run.
 */
async function aHeldSession(handle: string): Promise<void> {
  const logPath = join(transcripts, `${handle}.jsonl`)
  writeFileSync(logPath, aTurnAt(LONG_AGO, 'the last thing this session did'))
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `a terminal answering as ${handle}`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: `unread-${handle}`,
          logPath,
          resumeCommand: null,
          startedAt: null,
          entryPoint: null,
        },
      },
    },
    actor: t.api.HUMAN,
  }).id
  await aLiveProcessFor(session)
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/hold`,
    headers: AS_THE_PERSON,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  heldBy.set(handle, { session, logPath })
}

async function send(to: string, body: string): Promise<{ said: Record<string, unknown>; messageId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const said = reply.json() as Record<string, unknown>
  return { said, messageId: (said['record'] as { id: string }).id }
}

/** The waiter takes one message for its session, through the real door. */
async function theWaiterTakes(handle: string, messageId: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/took`,
    headers: AS_THE_PERSON,
    payload: { session: heldBy.get(handle)!.session, message: messageId },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

async function theHandleDoor(handle: string): Promise<{ how: string; says: string; hold: { state: string } | null }> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${encodeURIComponent(handle)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { answering: { how: string; says: string; hold: { state: string } | null } }).answering
}

async function theDot(handle: string): Promise<{ colour: string; says: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/presence/agent/${idOf(handle)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { presence: { colour: string; says: string } }).presence
}

function recipientsOf(messageId: string): string[] {
  return (
    t.client.sqlite
      .prepare('SELECT recipient_id AS id FROM message_delivery WHERE message_id = ? ORDER BY recipient_id')
      .all(messageId) as { id: string }[]
  ).map((one) => one.id)
}

function markOf(messageId: string, handle: string): string {
  const row = t.client.sqlite
    .prepare("SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?")
    .get(messageId, idOf(handle)) as { mark: string }
  return row.mark
}

/** Wait until the set time has passed since the hand-overs, with a second to spare for the stored stamp's whole seconds. */
async function pastTheSetTime(): Promise<void> {
  const wait = handedAt + LIMIT_SECONDS * 1000 + 500 - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

beforeAll(async () => {
  process.env[UNREAD] = String(LIMIT_SECONDS)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  // A STARTER WHO CAN BE REACHED, above two agents held by terminal sessions.
  anAgent('unread-starter')
  await makeReachable('unread-starter')
  anAgent('unread-silent')
  setStartedBy('unread-silent', 'unread-starter')
  await aHeldSession('unread-silent')
  anAgent('unread-reader')
  setStartedBy('unread-reader', 'unread-starter')
  await aHeldSession('unread-reader')

  // ONE MESSAGE TO EACH, sent while both answer, and handed to each session by its waiter.
  for (const handle of ['unread-silent', 'unread-reader']) {
    const { said, messageId } = await send(idOf(handle), `A question for ${handle}`)
    expect(said['routed'], 'a message was routed while the agent still answered').toBeUndefined()
    await theWaiterTakes(handle, messageId)
    handedOver.set(handle, messageId)
  }
  handedAt = Date.now()
}, 60_000)

afterAll(() => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
  delete process.env[UNREAD]
})

describe('before the set time, a session that was handed a message still answers', () => {
  it('reads both handles as a live session', async () => {
    expect(Date.now() - handedAt, 'the set time passed before this case could look').toBeLessThan(LIMIT_SECONDS * 1000 - 1000)
    expect((await theHandleDoor('unread-silent')).how).toBe('a live session')
    expect((await theHandleDoor('unread-reader')).how).toBe('a live session')
  })
})

describe('past the set time, a session that read nothing after the hand-over does not answer', () => {
  it('the reader session reads what it was handed', () => {
    // THE SESSION TAKES A TURN AFTER THE HAND-OVER, which is what reading the message writes.
    appendFileSync(heldBy.get('unread-reader')!.logPath, aTurnAt(new Date(), 'read the question and answered it'))
  })

  it('says the handle is held, but nobody has read since the transcript last grew', async () => {
    await pastTheSetTime()
    const answering = await theHandleDoor('unread-silent')
    expect(answering.how, answering.says).toBe('nobody')
    expect(answering.says).toContain(
      `The session filed as record ${heldBy.get('unread-silent')!.session} is holding its handle, but it has read nothing since ${localStamp(LONG_AGO)}.`,
    )
    expect(answering.says).toContain(`longer than the ${String(LIMIT_SECONDS)} seconds a message handed over may wait unread`)
    // THE HOLD ITSELF IS STILL FRESH: the beat is not what this reads.
    const { theLiveHoldOn } = await import('../src/server/lib/handles.ts')
    expect(theLiveHoldOn(idOf('unread-silent'), true)?.state).toBe('fresh')
    // THE HAND-OVER IS DELIVERED; THE TRANSCRIPT HAS NOT GROWN.
    expect(markOf(handedOver.get('unread-silent')!, 'unread-silent')).toBe('delivered')
  })

  it("shows the owner's dot grey, with the same sentence", async () => {
    await pastTheSetTime()
    const dot = await theDot('unread-silent')
    expect(dot.colour).toBe('grey')
    const { IT_HAS_READ_NOTHING_SINCE } = await import('../src/server/lib/answering.ts')
    expect(dot.says).toContain(`is holding its handle, but ${IT_HAS_READ_NOTHING_SINCE}`)
  })

  it('sends a new message to the agent up its chain of starters as well', async () => {
    await pastTheSetTime()
    const { said, messageId } = await send(idOf('unread-silent'), 'Are you there?')
    const routed = (said['routed'] as { for: { id: string }; to: { id: string } | null }[] | undefined) ?? []
    expect(routed, JSON.stringify(said)).toHaveLength(1)
    expect(routed[0]!.for.id).toBe(idOf('unread-silent'))
    expect(routed[0]!.to?.id).toBe(idOf('unread-starter'))
    expect(recipientsOf(messageId)).toEqual([idOf('unread-silent'), idOf('unread-starter')].sort())
  })
})

describe('past the set time, a session that read what it was handed still answers', () => {
  it('reads the handle as a live session, and a new message goes to nobody else', async () => {
    await pastTheSetTime()
    const answering = await theHandleDoor('unread-reader')
    expect(answering.how, answering.says).toBe('a live session')
    expect((await theDot('unread-reader')).colour).toBe('green')
    const { said, messageId } = await send(idOf('unread-reader'), 'One more question')
    expect(said['routed']).toBeUndefined()
    expect(recipientsOf(messageId)).toEqual([idOf('unread-reader')])
  })
})
