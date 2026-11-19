// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * STARTING A NEW AGENT BRANCHES THE CONVERSATION AND LEAVES THE OLD ONE WHOLE.
 *
 * Criteria M78 and M80 of design/messages/ACCEPTANCE.md section 41.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. A new agent is registered, with a handle a reader can see came second, the same runtime word,
 *    and its own record saying which agent it was branched from and why.
 * 2. The new conversation opens with a line from Mole Office saying where it came from and that the
 *    old conversation is whole.
 * 3. What was waiting goes to the new agent, with the person's press on it, so the worker starts a run for
 *    the new agent and for nothing else.
 * 4. The old conversation keeps its messages. Their delivery rows name the new agent and no longer
 *    wait for another press or for the old agent to return.
 * 5. The old agent can return and read the conversation with those same messages in it.
 * 6. A press on an agent nothing is waiting for makes nothing, and says so.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 8 cases, all green. Then, in `startANewAgentFor` in src/server/lib/worker.ts,
 * `SYSTEM_LINES.branchedFromAnother.line` was
 * replaced by the words `A new agent.`, so the new conversation is opened without saying where it
 * came from.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × opens the new conversation with a line saying where it came from
 *
 * The change was put back and the control run again: 8 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { deliveryReading } from '../src/shared/messages.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function say(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return (filed['record'] as { id: string }).id
}

/** Everything said between the owner and one agent, oldest first. */
async function conversationWith(agentId: string): Promise<{ id: string; body: string; sentBy: { id: string } | null }[]> {
  const read = (await get(`/api/messages/conversation?kind=agent&id=${agentId}`)) as {
    messages?: { id: string; body: string; sentBy: { id: string } | null }[]
  }
  return read.messages ?? []
}

async function delivery(messageId: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { mark: string; because: string | null; run: string | null }[] }
  }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-branch-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('the press makes a new agent and branches the conversation', () => {
  let unreachable = ''
  let first = ''
  let second = ''
  let pressed: Record<string, unknown> = {}

  it('has two of the person\'s messages waiting, and nothing answering, which is the control', async () => {
    unreachable = await anAgent('loquat-codex')
    first = await say(unreachable, 'Can you read the loquat logs?')
    second = await say(unreachable, 'And the one from this morning too.')

    for (const id of [first, second]) {
      const row = (await get('/api/worker/queue')) as { queue?: { messageId: string; nobodyIsAnsweringAsIt: string | null }[] }
      const held = (row.queue ?? []).find((x) => x.messageId === id)
      expect(String(held?.nobodyIsAnsweringAsIt)).toContain('Nothing is answering as "loquat-codex"')
    }
    expect((await conversationWith(unreachable)).length).toBe(2)
  })

  it('registers a new agent that says where it came from', async () => {
    pressed = await post(`/api/agents/${unreachable}/start-a-new-agent`, {})

    expect(pressed['handle']).toBe('loquat-codex-2')
    expect(pressed['branchedFrom']).toBe('loquat-codex')
    expect((pressed['moved'] as string[]).length).toBe(2)

    const made = (await get(`/api/records/${String(pressed['agent'])}`)) as {
      record?: { summary: string | null; data: Record<string, unknown> }
    }
    expect(String(made.record?.summary)).toContain('could not be reached')
    expect(String(made.record?.summary)).toContain('kept whole')
    // THE SAME TOOL, because a branch of a Codex conversation is a Codex.
    expect(made.record?.data['runtime']).toBe('claude-code')
    expect(made.record?.data['startedBy']).toEqual({ kind: 'person', id: THE_PERSON })
    // WHERE IT CAME FROM, AS FACTS (round 37): the old agent's registry id and handle, and no sentence.
    expect(made.record?.data['branchedFrom']).toEqual({ agent: unreachable, handle: 'loquat-codex' })
  })

  it('opens the new conversation with a line saying where it came from', async () => {
    const said = await conversationWith('loquat-codex-2')
    const opening = said[0]
    expect(opening?.body).toBe(SYSTEM_LINES.branchedFromAnother.line)
    expect(opening?.sentBy?.id).toBe(moleOffice().id)

    const whole = (await get(`/api/messages/${String(opening?.id)}`)) as { message?: { saidInFull: string | null } }
    expect(String(whole.message?.saidInFull)).toContain('loquat-codex')
    expect(String(whole.message?.saidInFull)).toContain('kept whole and is still there')
  })

  it('carries what was waiting into the new conversation, as the person\'s, with their press on it', async () => {
    const said = await conversationWith('loquat-codex-2')
    const bodies = said.map((x) => x.body)
    expect(bodies).toContain('Can you read the loquat logs?')
    expect(bodies).toContain('And the one from this morning too.')
    for (const moved of pressed['moved'] as string[]) {
      const record = (await get(`/api/records/${moved}`)) as { record?: { data: Record<string, unknown> } }
      expect(record.record?.data['sentBy']).toEqual({ kind: 'person', id: THE_PERSON })
      expect(record.record?.data['runWasAskedFor']).toBeDefined()
    }
  })

  it('keeps the old messages and records which new agent received them', async () => {
    const said = await conversationWith(unreachable)
    expect(said.map((x) => x.id).sort()).toEqual([first, second].sort())
    for (const id of [first, second]) {
      const stands = await delivery(id)
      expect(stands.mark).toBe('delivered')
      expect(stands.because).toContain('carried this message to "loquat-codex-2"')
      expect(stands.run).toBeNull()
    }
  })

  it('starts a run for the new agent and for nothing else', async () => {
    const report = await onePass(settings, watching)

    const started = report.started.map((run) => run.agent)
    expect(started).toContain('loquat-codex-2')
    expect(started).not.toContain('loquat-codex')
  }, 40_000)

  it('lets the old agent read its conversation without waiting on messages already carried', async () => {
    const session = await post('/api/records', {
      kind: 'session',
      title: 'loquat-codex, back at last',
      data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal' },
    })
    const held = await app.inject({
      method: 'POST',
      url: '/api/handles/loquat-codex/hold',
      headers: AS_THE_OWNER,
      payload: { session: (session['record'] as { id: string }).id, machine: 'loquat', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)

    const waiting = (await get('/api/handles/loquat-codex/waiting')) as { waiting?: { messageId: string }[] }
    expect(waiting.waiting).toEqual([])
    expect((await conversationWith(unreachable)).map((x) => x.id).sort()).toEqual([first, second].sort())
  })
})

it('carries each waiting chat message once across two presses on a retired agent', async () => {
  const old = await anAgent('synthetic-retired-chat')
  const retired = await post(`/api/participants/agent/${old}/retire`, { because: 'Synthetic work finished.' })
  expect(retired['error']).toBeUndefined()
  const first = await say(old, 'Synthetic message before the first press.')
  const firstPress = await post(`/api/agents/${old}/start-a-new-agent`, {})
  expect(firstPress['moved']).toHaveLength(1)
  // THE FIRST PRESS WRITES WHERE IT CARRIED THE MESSAGE, as facts on it (problem hqbovBMnTu-z), and the
  // second press must leave the message exactly as the first one left it.
  const before = (await get(`/api/records/${first}`))['record'] as { data: Record<string, unknown> }
  expect(before.data['carriedTo'], 'the first press wrote no carry on the message').toEqual([
    expect.objectContaining({ from: old, fromHandle: 'synthetic-retired-chat', toHandle: firstPress['handle'], copy: (firstPress['moved'] as string[])[0] }),
  ])
  expect((await conversationWith(String(firstPress['handle']))).map((x) => x.body)).toContain('Synthetic message before the first press.')
  expect((await get(`/api/handles/${old}/waiting`))['waiting']).toEqual([])

  const later = await say(old, 'Synthetic message after the first press.')
  const secondPress = await post(`/api/agents/${old}/start-a-new-agent`, {})
  expect(secondPress['agent']).toBeTruthy()
  expect(secondPress['agent']).not.toBe(firstPress['agent'])
  expect(secondPress['moved']).toHaveLength(1)
  const secondConversation = await conversationWith(String(secondPress['handle']))
  expect(secondConversation.filter((x) => x.sentBy?.id === THE_PERSON).map((x) => x.body)).toEqual(['Synthetic message after the first press.'])
  expect((await conversationWith(String(firstPress['handle']))).map((x) => x.body)).not.toContain('Synthetic message after the first press.')
  for (const copy of secondPress['moved'] as string[]) {
    const record = (await get(`/api/records/${copy}`)) as { record: { data: Record<string, unknown> } }
    expect(record.record.data['runWasAskedFor']).toBeDefined()
  }
  expect((await get(`/api/handles/${old}/waiting`))['waiting']).toEqual([])
  expect((await get(`/api/records/${first}`))['record']).toEqual(before)
  expect((await conversationWith(old)).map((x) => x.id).sort()).toEqual([first, later].sort())
  const { deadLettersInTheQueue } = await import('../src/server/lib/worker.ts')
  const { deadLettersNow } = await import('../src/server/lib/deadletters.ts')
  expect(deadLettersNow().filter((one) => [first, later].includes(one.messageId))).toEqual([])
  for (const [id, handle] of [[first, firstPress['handle']], [later, secondPress['handle']]] as const) {
    const carried = await delivery(id)
    expect(carried).toMatchObject({ mark: 'delivered', because: expect.stringContaining(`carried this message to "${String(handle)}"`), run: null })
    expect(deliveryReading(carried).sentence).toBe(carried.because)
    expect(deliveryReading(carried).sentence).toContain('"synthetic-retired-chat" did not read it.')
    expect(deliveryReading(carried).sentence).not.toContain('has read this message')
    t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-01-01 00:00:00' WHERE id = ?").run(id)
  }
  expect(deadLettersInTheQueue('default').filter((one) => [first, later].includes(one.messageId))).toEqual([])
})

describe('a press on an agent nothing is waiting for', () => {
  it('makes no agent and says so, rather than reporting a success about nothing', async () => {
    const quiet = await anAgent('nothing-waiting')
    const pressed = await post(`/api/agents/${quiet}/start-a-new-agent`, {})

    expect(pressed['agent']).toBe('')
    expect(pressed['moved']).toEqual([])
    expect(String(pressed['says'])).toContain('Nothing is waiting for this press')
    // AND NO SECOND AGENT WAS MADE, which is what the sentence above claims.
    const listed = (await get('/api/participants')) as { agents?: { handle: string }[] }
    expect((listed.agents ?? []).map((a) => a.handle)).not.toContain('nothing-waiting-2')
  })
})
