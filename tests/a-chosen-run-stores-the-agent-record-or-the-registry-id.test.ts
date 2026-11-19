// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHOSEN RUN STORES ITS AGENT'S RECORD ID, OR ITS REGISTRY ID WHERE THE AGENT HAS NO RECORD HERE. Wave 13s round 176,
 * for case 2 of section 10.1 of the re-mint plan.
 *
 * `agent_messages.recipient_agent_id` has three writers. The migration and the send store an agent record's id. The
 * third is the door that stores a comment's choice of a run: it stores the record of the agent the run answers as, and
 * the agent's registry id where that agent has no record in this project. So the column holds both kinds, and the
 * historical reader reads it that way (tests/registry-alias-classified-id-columns.test.ts). This file pins the writer.
 *
 * A throwaway office has two projects. One agent has its record here; the other has its record in the second project
 * only. A run here is served by each. Cases:
 *   1. a comment choosing the first run stores the first agent's record id, and the send writes that id again;
 *   2. a comment choosing the second run stores the second agent's registry id, which is no record's id;
 *   3. that comment cannot be sent: the send refuses with 409, in words that begin as src/server/lib/agents.ts exports
 *      them, and the comment stays queued with the registry id.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-chosen-run-stores-the-agent-record-or-the-registry-id.test.ts
 * After a green control, copy the file named in each change, then make one of these changes:
 *   1. in src/server/lib/records.ts, put `agentId: answered.agent.id,` in place of
 *      `agentId: answered.record ?? answered.agent.id,` in identityForAddressedRun: the registry id is stored where there
 *      is a record, and case 1 goes red;
 *   2. in the same place, put `agentId: answered.record ?? '',`: nothing names the agent with no record here, and cases
 *      2 and 3 go red;
 *   3. in src/server/lib/agents.ts, make the send stop refusing a comment whose agent has no record here. That takes three
 *      changes, because three lines refuse it and any one of them is enough: in actorIdFor, put `return ''` in place of
 *      its throw, and in dispatchThread delete the two lines that throw a refusal beginning with
 *      A_DISPATCH_WITH_NO_REGISTERED_AGENT. The send then fails with 500, and case 3 goes red;
 *   4. in src/server/lib/agents.ts, rename the export A_DISPATCH_WITH_NO_REGISTERED_AGENT: this file's import of it is
 *      broken, and case 3 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name and transcript here is made up, in a throwaway office.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, fakeTranscript, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'a-made-up-second-project'

function asTheOwnerIn(workspace: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': workspace,
  }
}

let t: TestDb
let app: FastifyInstance

/** The agent with its record here: its record id and its registry id. */
const keptHere = { record: '', registry: '' }
/** The agent with its record in the second project only: its registry id. */
let keptElsewhere = ''

async function ask(method: 'POST', url: string, payload: unknown, workspace = HERE): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.inject({ method, url, headers: asTheOwnerIn(workspace), payload: payload as never })
  return { status: res.statusCode, json: res.json() as Record<string, unknown> }
}

async function file(kind: string, title: string, data: Record<string, unknown>, workspace = HERE): Promise<string> {
  const filed = await ask('POST', '/api/records', { kind, title, data }, workspace)
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

function registryIdOf(record: string): string {
  const row = t.client.sqlite.prepare('SELECT agent_id FROM agent_records WHERE record_id = ?').get(record) as { agent_id: string } | undefined
  if (row === undefined) throw new Error(`The made-up agent record ${record} has no registry row.`)
  return row.agent_id
}

/** A run here that can be picked up again, served by the given registry id. */
async function aRunServedBy(title: string, externalId: string, servingAgent: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
    servingAgent,
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath,
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its made-up log last grew 40 minutes ago',
        filesTouched: [],
        filesComplete: true,
        at: '2026-11-01 09:00:00',
      },
    },
  })
}

/** A review here with one comment choosing the run. */
async function aCommentChoosing(run: string): Promise<{ thread: string; message: string }> {
  const thread = await ask('POST', '/api/agent/threads', { title: `A made-up review for ${run}`, mode: 'review' })
  expect(thread.status, JSON.stringify(thread.json)).toBe(201)
  const threadId = (thread.json['thread'] as { id: string }).id
  const said = await ask('POST', `/api/agent/threads/${threadId}/messages`, {
    intent: 'ask',
    body: 'Which of the two made-up numbers was measured?',
    recipient: { kind: 'session', sessionId: run },
  })
  expect(said.status, JSON.stringify(said.json)).toBe(201)
  return { thread: threadId, message: (said.json['message'] as { id: string }).id }
}

/** The send, which only the person may press: it carries the key the throwaway office made for the person. */
async function send(thread: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...asTheOwnerIn(HERE), ...thePersonsKeyHeader() } })
  return { status: res.statusCode, json: res.json() as Record<string, unknown> }
}

function stored(message: string): { state: string; recipient_kind: string; recipient_agent_id: string | null } {
  return t.client.sqlite
    .prepare('SELECT state, recipient_kind, recipient_agent_id FROM agent_messages WHERE id = ?')
    .get(message) as { state: string; recipient_kind: string; recipient_agent_id: string | null }
}

let toTheFirst = { thread: '', message: '' }
let toTheSecond = { thread: '', message: '' }

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'A made-up second project' })
  app = (await apiApp()).app
  await app.ready()

  keptHere.record = await file('agent', 'A made-up agent kept here', { handle: 'made-up-kept-here', runtime: 'claude-code', state: 'active' })
  keptHere.registry = registryIdOf(keptHere.record)
  const elsewhere = await file('agent', 'A made-up agent kept elsewhere', { handle: 'made-up-kept-elsewhere', runtime: 'claude-code', state: 'active' }, ELSEWHERE)
  keptElsewhere = registryIdOf(elsewhere)

  const first = await aRunServedBy('A made-up run served from here', 'made-up-conversation-1', keptHere.registry)
  const second = await aRunServedBy('A made-up run served from elsewhere', 'made-up-conversation-2', keptElsewhere)
  toTheFirst = await aCommentChoosing(first)
  toTheSecond = await aCommentChoosing(second)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the choice of a run stores the agent record, or the registry id where the agent has none here', () => {
  it('1. stores the record id of an agent kept here, and the send writes that id again', async () => {
    expect(keptHere.record, 'the made-up agent record and its registry row have one id').not.toBe(keptHere.registry)
    expect(stored(toTheFirst.message)).toEqual({ state: 'queued', recipient_kind: 'session', recipient_agent_id: keptHere.record })

    const sent = await send(toTheFirst.thread)
    expect(sent.status, JSON.stringify(sent.json)).toBe(201)
    expect(stored(toTheFirst.message)).toEqual({ state: 'sent', recipient_kind: 'session', recipient_agent_id: keptHere.record })
  })

  it("2. stores the registry id of an agent with no record here, and that id is no record's", () => {
    expect(stored(toTheSecond.message)).toEqual({ state: 'queued', recipient_kind: 'session', recipient_agent_id: keptElsewhere })
    expect(t.client.sqlite.prepare('SELECT 1 FROM records WHERE id = ?').get(keptElsewhere)).toBeUndefined()
  })

  it('3. refuses to send that comment, which stays queued with the registry id', async () => {
    const sent = await send(toTheSecond.thread)
    expect(sent.status, JSON.stringify(sent.json)).toBe(409)
    const { A_DISPATCH_WITH_NO_REGISTERED_AGENT } = await import('../src/server/lib/agents.ts')
    expect(String(sent.json['error'])).toContain(A_DISPATCH_WITH_NO_REGISTERED_AGENT)
    expect(stored(toTheSecond.message)).toEqual({ state: 'queued', recipient_kind: 'session', recipient_agent_id: keptElsewhere })
  })
})
