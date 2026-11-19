// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S MESSAGE HANDED TO AN AGENT, WITH NO REPLY, GETS THE AGENT REMINDED ONCE.
 *
 * Wave 13y round 11, the secretary's messages zFcMF9J8smC5 and KIixAOdCDGfh. The waiter marks a message delivered.
 * Even when the agent marks it read, the person still waits for a reply. When a person's
 * message has been handed to an agent's live session and the agent has written nothing to that person in that
 * conversation within MOLE_OFFICE_REPLY_REMINDER_MINUTES (three unless set), the office's reminder tick writes the agent
 * one line that wakes it. src/server/lib/reply-reminder.ts.
 *
 * WHAT IS MEASURED, each through the real hold, took and record doors and the real reminder tick, with the tick's clock
 * set forward rather than waited for:
 *
 *   · a person's message with no reply: nothing before three minutes, one line at three minutes, and still exactly one
 *     at ten minutes and on every later tick;
 *   · a person's message the agent answered: no line;
 *   · an agent's message with no reply: no line;
 *   · the minutes are read from the setting: at seven, nothing at three minutes and one line at seven;
 *   · the line is a notice that wakes its reader.
 *
 * MUTATIONS, CONTROL RUN FIRST (the logs are named in the commit message that adds this file):
 *   0. remove the hand-over preservation rule in the delivery writer — read without reply goes red;
 *   1. in `sendTheReplyRemindersThatAreDue`, `if (theAgentHasReplied(one)) continue` taken out — the answered case
 *      goes red;
 *   2. in the same function, `if (said.has(aKey(one.messageId, one.agentId))) continue` taken out — "exactly one"
 *      goes red;
 *   3. in `theHandoversSince`, `AND json_extract(r.data, '$.sentBy.kind') = 'person'` taken out — the agent's
 *      message case goes red;
 *   4. in `sendTheReplyRemindersThatAreDue`, `const minutes = replyReminderMinutes()` changed to `const minutes = 3` —
 *      the setting case goes red;
 *   5. in src/server/lib/notices.ts, `aPersonWaitsForAReply: WAKES(` changed to `QUIET(` — the three-minute case
 *      goes red.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const SETTING = 'MOLE_OFFICE_REPLY_REMINDER_MINUTES'
const MINUTE = 60_000

let t: TestDb
let app: FastifyInstance
const worlds = mkdtempSync(join(tmpdir(), 'mole-office-reply-reminder-'))

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** When the tick started watching: before every hand-over in this file. */
let watchingSince: Date
/** The session holding each agent's handle, by handle. */
const heldBy = new Map<string, string>()
/** The message handed to each agent, by handle, and when it was handed. */
const handed = new Map<string, { messageId: string; at: number }>()

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

/** A terminal session answering as the agent, holding its handle through the real door. */
async function aHeldSession(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `a terminal answering as ${handle}`,
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/hold`,
    headers: AS_THE_PERSON,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  heldBy.set(handle, session)
}

/** The person writes to an agent, through the record door. */
async function thePersonWrites(toHandle: string, body: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: idOf(toHandle) }], body } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** An agent writes to somebody, as itself. */
function anAgentWrites(fromHandle: string, to: { kind: 'person' | 'agent'; id: string }, body: string): string {
  const id = idOf(fromHandle)
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'message',
    title: body.slice(0, 40),
    data: { to: [to], body, sentBy: { kind: 'agent', id } },
    actor: { type: 'agent', id: fromHandle },
  }).id
}

/** The agent's waiter takes the message for its session, through the real door. */
async function theWaiterTakes(handle: string, messageId: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/took`,
    headers: AS_THE_PERSON,
    payload: { session: heldBy.get(handle)!, message: messageId },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  handed.set(handle, { messageId, at: Date.now() })
}

/** One tick of the office's reminders, with its clock this long after the agent's hand-over. */
async function aTickAfter(handle: string, ms: number): Promise<string[]> {
  const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
  const done = sendTheRemindersThatAreDue(WORKSPACE, new Date(handed.get(handle)!.at + ms), watchingSince, worlds)
  expect(done.replyReminderProblem, 'the reply reminder could not run').toBeNull()
  return done.repliesReminded
}

/** Every reply reminder the office has written to this agent, with the message each is about. */
function theRemindersTo(handle: string): { aboutMessage: string; notice: string; saidInFull: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.notice') = 'aPersonWaitsForAReply' AND json_extract(data, '$.to[0].id') = ?",
      )
      .all(idOf(handle)) as { data: string }[]
  ).map((row) => JSON.parse(row.data) as { aboutMessage: string; notice: string; saidInFull: string })
}

beforeAll(async () => {
  delete process.env[SETTING]
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  watchingSince = new Date(Date.now() - 2000)

  for (const handle of ['rr-silent', 'rr-answers', 'rr-from-an-agent', 'rr-writer', 'rr-seven', 'rr-read']) {
    anAgent(handle)
    await aHeldSession(handle)
  }

  // A PERSON'S MESSAGE NOBODY ANSWERS.
  await theWaiterTakes('rr-silent', await thePersonWrites('rr-silent', 'A question nobody answers'))
  // A PERSON'S MESSAGE THE AGENT ANSWERS, in the direct conversation, after the hand-over.
  await theWaiterTakes('rr-answers', await thePersonWrites('rr-answers', 'A question that is answered'))
  anAgentWrites('rr-answers', { kind: 'person', id: THE_PERSON }, 'Here is the answer')
  // AN AGENT'S MESSAGE NOBODY ANSWERS.
  await theWaiterTakes('rr-from-an-agent', anAgentWrites('rr-writer', { kind: 'agent', id: idOf('rr-from-an-agent') }, 'From one agent to another'))
  // THE SEVEN-MINUTE CASE IS HANDED OVER IN ITS OWN CASE, last, so the ticks above, read at three minutes, cannot
  // remind it first.
}, 60_000)

afterAll(() => {
  app.close()
  t.close()
  rmSync(worlds, { recursive: true, force: true })
  delete process.env[SETTING]
})

describe('the hand-over these cases stand on', () => {
  it('marks every handed message delivered; the person still waits for a reply', () => {
    for (const [handle, one] of handed) {
      const row = t.client.sqlite
        .prepare("SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?")
        .get(one.messageId, idOf(handle)) as { mark: string } | undefined
      expect(row?.mark, `the message handed to ${handle}`).toBe('delivered')
    }
  })
})

describe("a person's message with no reply", () => {
  it('is not reminded before three minutes', async () => {
    expect(await aTickAfter('rr-silent', 3 * MINUTE - 2000)).not.toContain(handed.get('rr-silent')!.messageId)
    expect(theRemindersTo('rr-silent')).toEqual([])
  })

  it('is reminded once at three minutes, about that message, with a line that wakes the agent', async () => {
    const messageId = handed.get('rr-silent')!.messageId
    expect(await aTickAfter('rr-silent', 3 * MINUTE)).toContain(messageId)
    const said = theRemindersTo('rr-silent')
    expect(said).toHaveLength(1)
    expect(said[0]!.aboutMessage).toBe(messageId)
    expect(said[0]!.saidInFull).toContain(`message ${messageId}`)
    expect(said[0]!.saidInFull).toContain('This is the only reminder for this message.')
    const { whyThisWakesNoWaiter } = await import('../src/server/lib/notices.ts')
    expect(whyThisWakesNoWaiter(moleOffice(), said[0]!.notice)).toBeNull()
  })

  it('is never reminded a second time', async () => {
    expect(await aTickAfter('rr-silent', 10 * MINUTE)).not.toContain(handed.get('rr-silent')!.messageId)
    expect(await aTickAfter('rr-silent', 60 * MINUTE)).not.toContain(handed.get('rr-silent')!.messageId)
    expect(theRemindersTo('rr-silent')).toHaveLength(1)
  })
})

describe('a message the agent marked read without replying', () => {
  it('is still reminded once, measured from the hand-over', async () => {
    await theWaiterTakes('rr-read', await thePersonWrites('rr-read', 'Read but unanswered'))
    const messageId = handed.get('rr-read')!.messageId
    const reply = await app.inject({
      method: 'POST', url: `/api/messages/${messageId}/mark`,
      headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'rr-read',
        'x-mole-office-session': heldBy.get('rr-read')! },
      payload: { mark: 'seen' },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(await aTickAfter('rr-read', 3 * MINUTE)).toContain(messageId)
    expect(await aTickAfter('rr-read', 10 * MINUTE)).not.toContain(messageId)
    expect(theRemindersTo('rr-read')).toHaveLength(1)
  })
})

describe("a person's message the agent answered", () => {
  it('is not reminded', async () => {
    expect(await aTickAfter('rr-answers', 10 * MINUTE)).not.toContain(handed.get('rr-answers')!.messageId)
    expect(theRemindersTo('rr-answers')).toEqual([])
  })
})

describe("an agent's message with no reply", () => {
  it('is not reminded', async () => {
    expect(await aTickAfter('rr-from-an-agent', 10 * MINUTE)).not.toContain(handed.get('rr-from-an-agent')!.messageId)
    expect(theRemindersTo('rr-from-an-agent')).toEqual([])
  })
})

describe('the minutes are read from the setting', () => {
  it('at seven minutes, nothing is said at three and one line is said at seven', async () => {
    process.env[SETTING] = '7'
    try {
      await theWaiterTakes('rr-seven', await thePersonWrites('rr-seven', 'A question read against seven minutes'))
      expect(await aTickAfter('rr-seven', 3 * MINUTE)).not.toContain(handed.get('rr-seven')!.messageId)
      expect(theRemindersTo('rr-seven')).toEqual([])
      expect(await aTickAfter('rr-seven', 7 * MINUTE)).toContain(handed.get('rr-seven')!.messageId)
      expect(theRemindersTo('rr-seven')).toHaveLength(1)
    } finally {
      delete process.env[SETTING]
    }
  })
})
