// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THREAD MESSAGE TO A RUN THAT ANSWERS AS NOBODY MINTS NOBODY.
 *
 * A message sent through POST /api/agent/threads/<id>/messages to a session that answered as no agent made a durable
 * agent from the session's title and wrote it into the session's `ranAs`. From then on the agent that had filed the
 * session was refused the runs it filed under it, and the next start of the office found a migration's work waiting.
 * A message record addressed to the same session is refused with 422 and a sentence. The thread door now refuses it
 * the same way, with the same sentence from the one place that makes it, and writes nothing. So does PATCH
 * /api/agent/messages/<id>, which reached the same mint when a waiting comment was given a new recipient.
 *
 * THE AGENTS. The person registers A and B. A files a running session for itself that names no agent: no `ranAs` and
 * no `servingAgent`, and nothing holds a handle for it, so it answers as nobody.
 *
 *   1. B posts a thread message whose recipient is A's session: 422, with the sentence
 *      `whyAMessageToThisRunWouldReachNobody` makes. No agent and no agent record is made, no message is stored, and
 *      A's session and its revisions are as they were.
 *   2. B posts a comment for a new run, and then changes its recipient to A's session: 422, with the same sentence.
 *      Nothing is minted, A's session is as it was, and the comment keeps the recipient it had.
 *   3. A then files a run whose parent is that session: accepted.
 *
 * Every request goes through the real doors with `app.inject`. No assertion prints a key.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let keyOfA = ''
let keyOfB = ''
let sessionOfA = ''

const TITLE_OF_A_SESSION = 'agent-a at work'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

/** An agent's own headers: its name and its key. */
function asAgent(handle: string, key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
  }
}

async function ask(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of an answer, for the assertions on what it says. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** Register an agent through the starter door, as the person, and hand back the key it was answered. */
async function register(handle: string): Promise<string> {
  const made = await ask('/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code', role: 'worker' })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

/** Everything a mint or a stored message would change: agents, agent records, messages, and A's session as stored. */
function whatAMintWouldChange(): { agents: number; agentRecords: number; messages: number; session: string; revisions: number } {
  const count = (query: string, ...params: string[]): number => (t.client.sqlite.prepare(query).get(...params) as { n: number }).n
  return {
    agents: count('SELECT COUNT(*) AS n FROM agents'),
    agentRecords: count("SELECT COUNT(*) AS n FROM records WHERE kind = 'agent'"),
    messages: count('SELECT COUNT(*) AS n FROM agent_messages'),
    session: (t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(sessionOfA) as { data: string }).data,
    revisions: count('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?', sessionOfA),
  }
}

/** The five columns that say whom a stored comment is for. */
function theRecipientOf(message: string): Record<string, unknown> {
  return t.client.sqlite
    .prepare(
      'SELECT recipient_kind, recipient_session_id, recipient_said, recipient_why, recipient_agent_id FROM agent_messages WHERE id = ?',
    )
    .get(message) as Record<string, unknown>
}

/** A conversation B starts, in review, so nothing it holds is sent before B says so. */
async function aThreadOfB(title: string): Promise<string> {
  const thread = await ask('/api/agent/threads', asAgent('agent-b', keyOfB), { title, mode: 'review' })
  expect(thread.status, said(thread.body)).toBe(201)
  return String((thread.body['thread'] as { id: string }).id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  keyOfA = await register('agent-a')
  keyOfB = await register('agent-b')
  const filed = await ask('/api/records', asAgent('agent-a', keyOfA), {
    kind: 'session',
    title: TITLE_OF_A_SESSION,
    data: { state: 'running', runtime: 'claude-code' },
  })
  expect(filed.status, said(filed.body)).toBe(201)
  sessionOfA = String((filed.body['record'] as { id: string }).id)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a thread message to a session that answers as nobody", () => {
  it("1. B addresses A's session in a thread: 422 in the message record's words, and nothing is made or written", async () => {
    // A'S SESSION ANSWERS AS NOBODY, or this case proves nothing.
    const { theAgentASessionAnswersAs } = await import('../src/server/lib/messages.ts')
    const stored = t.client.sqlite.prepare('SELECT id, data, workspace_id AS workspaceId FROM records WHERE id = ?').get(sessionOfA) as
      { id: string; data: string; workspaceId: string }
    const answers = theAgentASessionAnswersAs({ id: stored.id, data: JSON.parse(stored.data) as Record<string, unknown>, workspaceId: stored.workspaceId }, 'default')
    expect(answers, "A's session answers as an agent, so this case proves nothing").toBeNull()

    const threadId = await aThreadOfB('B asks A something')
    const before = whatAMintWouldChange()
    const sent = await ask(`/api/agent/threads/${threadId}/messages`, asAgent('agent-b', keyOfB), {
      intent: 'ask',
      body: 'Are you still working on this?',
      recipient: { kind: 'session', sessionId: sessionOfA },
    })
    expect(sent.status, said(sent.body)).toBe(422)
    const { whyAMessageToThisRunWouldReachNobody } = await import('../src/server/lib/records/addressed-run.ts')
    expect(said(sent.body)).toContain(whyAMessageToThisRunWouldReachNobody(TITLE_OF_A_SESSION, sessionOfA))
    expect(whatAMintWouldChange()).toEqual(before)
  })

  it("2. B changes a waiting comment's recipient to A's session: 422 in the same words, nothing is minted, and the comment keeps its recipient", async () => {
    const threadId = await aThreadOfB('B writes for a new run')
    const written = await ask(`/api/agent/threads/${threadId}/messages`, asAgent('agent-b', keyOfB), {
      intent: 'ask',
      body: 'Please look at this.',
      recipient: { kind: 'new' },
    })
    expect(written.status, said(written.body)).toBe(201)
    const messageId = String((written.body['message'] as { id: string }).id)
    const had = theRecipientOf(messageId)
    const before = whatAMintWouldChange()
    const changed = await ask(
      `/api/agent/messages/${messageId}`,
      asAgent('agent-b', keyOfB),
      { recipient: { kind: 'session', sessionId: sessionOfA } },
      'PATCH',
    )
    expect(changed.status, said(changed.body)).toBe(422)
    const { whyAMessageToThisRunWouldReachNobody } = await import('../src/server/lib/records/addressed-run.ts')
    expect(said(changed.body)).toContain(whyAMessageToThisRunWouldReachNobody(TITLE_OF_A_SESSION, sessionOfA))
    expect(whatAMintWouldChange()).toEqual(before)
    expect(theRecipientOf(messageId), 'the refused change moved the recipient all the same').toEqual(had)
  })

  it('3. A then files a run whose parent is that session: accepted', async () => {
    const child = await ask('/api/records', asAgent('agent-a', keyOfA), {
      kind: 'session',
      title: 'a run agent-a starts under its session',
      data: { state: 'running', runtime: 'claude-code', parentAttachment: sessionOfA },
    })
    expect(child.status, said(child.body)).toBe(201)
  })
})
