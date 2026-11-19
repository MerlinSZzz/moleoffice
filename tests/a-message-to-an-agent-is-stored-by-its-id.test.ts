// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE TO AN AGENT IS STORED BY THE AGENT'S ID, WHETHER IT WAS ADDRESSED BY ID OR BY HANDLE.
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md, as piece I-1b needs it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Since the mint, a new agent's registry id is twelve characters nobody chose, and its handle is the
 * name it goes by. A `to` entry, a claimed `sentBy` and the actor header are ARRIVING references: a
 * caller may write either string. This file registers agents through the real door, so each one has
 * a minted id, and then drives the message write and one card lookup:
 *
 *   · a message to an agent by its handle is accepted, the stored `to` holds the registry id, and
 *     the agent's delivery row is keyed on that id;
 *   · the same message addressed by the id is stored the same way;
 *   · a `to` string that is one agent's id and another live agent's handle is refused with the
 *     resolver's own sentence, and nothing is written;
 *   · a `sentBy` claimed as the writer's own handle is accepted and stored as its id;
 *   · an entry in the path a question took, naming the caller by its handle, is stored as its id;
 *   · a secretary that sends its minted id in the actor header is read as holding its own card;
 *   · a run's own agent may not name the run's sandbox, whether it sends its minted id in the header
 *     or only its key, while `servingAgent` holds its handle;
 *   · a message whose stored sender is a name is no longer an unregistered writer's once exactly one
 *     agent bears that name, and still is where two do or none does.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS EACH RED, after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   to:      in `createRecordWithReport`, take out the resolution of `to` before
 *            `whyTheAddressingIsRefused`. The handle case is refused ("Nothing is registered as the
 *            agent"), and the ambiguous case answers 201 and stores the message addressed to the
 *            legacy agent whose id is `foo`, with nothing said about the other.
 *   sentBy:  compare `claimed.id` with `mine.id` again. The handle is refused as somebody else.
 *   who:     in `assertMayPassTheQuestionOn`, compare the caller with `appended.who` as it arrived
 *            again. The secretary's handle is not its id, so the PATCH is refused as written under
 *            somebody else's name.
 *   sandbox: in `assertMayWriteASandbox`, compare `servingAgent` with `actor.id` by string again. The
 *            handle is neither the id in the header nor the key holder's id, so both writes pass.
 *   stored:  in `unregisteredWriterOf`, take out the step that reads the one agent bearing the name.
 *            The first case goes red: the message stays under an unregistered writer.
 *   card:    read the caller's row with `agentByHandle(actor.id)` again in
 *            `actorMayActAsSecretaryOrThePerson`. The id finds no row, the row is read as a worker,
 *            and the secretary is refused the incident.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { unregisteredWriterOf, type KnownParticipant, type MessageOnTheWire } from '../src/shared/messages.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The headers of a caller that says it is one agent. */
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function inject(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** Register through the starter door and give back the registry id the door answered. */
async function register(
  handle: string,
  role: string | null = null,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', headers, {
    handle,
    name: handle,
    runtime: 'claude-code',
    ...(role === null ? {} : { role }),
  })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  // THE PRECONDITION OF THE WHOLE FILE: the mint gave this agent an id that is not its handle.
  expect(id, `the registration of ${handle} set its id to its handle`).not.toBe(handle)
  return id
}

/** A message written over the one door every message write arrives at. */
async function send(headers: Record<string, string>, data: Record<string, unknown>) {
  return inject('POST', '/api/records', headers, { kind: 'message', title: `a message ${Math.random().toString(36).slice(2, 8)}`, data })
}

function storedData(reply: { json: Record<string, unknown> }): Record<string, unknown> {
  return (reply.json['record'] as { data: Record<string, unknown> }).data
}

function deliveryRowsOf(messageId: string): { recipient_kind: string; recipient_id: string }[] {
  return t.client.sqlite
    .prepare('SELECT recipient_kind, recipient_id FROM message_delivery WHERE message_id = ?')
    .all(messageId) as { recipient_kind: string; recipient_id: string }[]
}

function messageCount(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

/** A registry row inserted at the table, the way a legacy agent renamed in place really is. */
function aLegacyAgentRow(id: string, handle: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-08-27 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
        'VALUES (?, ?, ?, ?, 0, NULL, ?)',
    )
    .run(id, handle, handle, `avatar-default-agent-${id}`, '2026-08-27 10:00:00')
}

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ `to`

describe('a message to an agent is stored by its registry id', () => {
  it('is stored when addressed by the handle, though a person gets the unheld 409, and `to` and the delivery row hold the id', async () => {
    const id = await register('mt-reader')
    const reply = await send(AS_THE_PERSON, { to: [{ kind: 'agent', id: 'mt-reader' }], body: 'by the handle' })
    // THE UNHELD 409 (decision 60sbc5I-bwKx): the agent is registered and nothing holds it, so the person's answer is
    // the error with the routing; the letter and its delivery row are what this file measures.
    expect(reply.status, reply.text).toBe(409)
    const data = storedData(reply)
    expect(data['to']).toEqual([{ kind: 'agent', id }])
    const recordId = (reply.json['record'] as { id: string }).id
    expect(deliveryRowsOf(recordId)).toContainEqual({ recipient_kind: 'agent', recipient_id: id })
  })

  it('is stored the same way when addressed by the id, and the person gets the same unheld 409', async () => {
    const id = await register('mt-reader-two')
    const reply = await send(AS_THE_PERSON, { to: [{ kind: 'agent', id }], body: 'by the id' })
    expect(reply.status, reply.text).toBe(409)
    expect(storedData(reply)['to']).toEqual([{ kind: 'agent', id }])
    const recordId = (reply.json['record'] as { id: string }).id
    expect(deliveryRowsOf(recordId)).toContainEqual({ recipient_kind: 'agent', recipient_id: id })
  })

  it('is refused with the resolver\'s sentence when the string is one agent\'s id and another\'s handle, and nothing is written', async () => {
    // A NEW agent registered under `foo`, which the mint gives an id of its own, and a LEGACY agent
    // whose id is `foo`, renamed in place. The legacy row goes in second: the registration door
    // addresses its card message to the handle it was given (piece C1 of wave 13b mends that), so
    // with the legacy row already there the registration itself would meet this same refusal.
    const minted = await register('foo')
    aLegacyAgentRow('foo', 'foo-renamed')
    const before = messageCount()
    const reply = await send(AS_THE_PERSON, { to: [{ kind: 'agent', id: 'foo' }], body: 'which foo' })
    expect(reply.status, reply.text).toBe(409)
    expect(reply.text).toContain('\\"foo\\" names two agents, so nobody can tell which one you mean.')
    expect(reply.text).toContain(`Send the id ${minted} to mean`)
    expect(messageCount()).toBe(before)
  })
})

// ============================================================ `sentBy`

describe('a claimed sender is compared by registry id', () => {
  it('accepts the writer\'s own handle and stores its id', async () => {
    const id = await register('mt-sender')
    const reply = await send(asAgent('mt-sender'), {
      to: [{ kind: 'person', id: THE_PERSON }],
      sentBy: { kind: 'agent', id: 'mt-sender' },
      body: 'from me, by my handle',
    })
    expect(reply.status, reply.text).toBe(201)
    expect(storedData(reply)['sentBy']).toEqual({ kind: 'agent', id })
  })
})

// ============================================================ the path a question took

describe('a name in the path a question took is stored by registry id', () => {
  it('accepts the caller\'s own handle in the new entry and stores its id', async () => {
    // THE PERSON STARTS THE SECRETARY, THE SECRETARY STARTS A WORKER, AND THE WORKER ASKS THE PERSON
    // SOMETHING. The question is then with the secretary, which passes it on by an ordinary PATCH.
    const secretary = await register('mt-starter', theSecretaryCard())
    await register('mt-asker', 'worker', asAgent('mt-starter'))
    const asked = await inject('POST', '/api/records', asAgent('mt-asker'), {
      kind: 'problem',
      title: 'a question for the person',
      data: { whose_move: 'person', symptom: 'the arm stops short' },
    })
    expect(asked.status, asked.text).toBe(201)
    const id = (asked.json['record'] as { id: string }).id
    const passed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: asAgent('mt-starter'),
      payload: { dataPatch: { confirmed_by: [{ who: { kind: 'agent', id: 'mt-starter' }, at: '2026-09-25 03:00:00' }] } },
    })
    expect(passed.statusCode, passed.body).toBe(200)
    const data = (passed.json() as { record: { data: Record<string, unknown> } }).record.data
    expect(data['confirmed_by']).toEqual([{ who: { kind: 'agent', id: secretary }, at: '2026-09-25 03:00:00' }])
  })
})

// ============================================================ a run's own sandbox

describe('a run does not name its own sandbox, whichever name its agent sends', () => {
  const A_SANDBOX = { template: 'mole-office-dev', container: 'a-row', folder: '/anywhere' }

  /** A run serving one agent, filed by the person, with `servingAgent` holding the handle. */
  async function aRunServing(handle: string): Promise<string> {
    const filed = await inject('POST', '/api/records', AS_THE_PERSON, {
      kind: 'session',
      title: `a run of ${handle}`,
      data: { state: 'running', servingAgent: handle },
    })
    expect(filed.status, filed.text).toBe(201)
    return (filed.json['record'] as { id: string }).id
  }

  async function nameTheSandbox(runId: string, headers: Record<string, string>) {
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${runId}`, headers, payload: { dataPatch: { sandbox: A_SANDBOX } } })
    return { status: reply.statusCode, text: reply.body }
  }

  it('refuses the run\'s agent sending its minted id in the actor header', async () => {
    const id = await register('mt-runner')
    const runId = await aRunServing('mt-runner')
    const said = await nameTheSandbox(runId, asAgent(id))
    expect(said.status, said.text).toBe(403)
    expect(said.text).toContain('A run does not name its own sandbox')
    // THE REFUSAL NAMES THE AGENT BY ITS HANDLE, not by the minted id it sent.
    expect((JSON.parse(said.text) as { error: string }).error).toContain('the run\'s own agent "mt-runner"')
  })

  it('refuses the run\'s agent sending its key and no actor headers', async () => {
    const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'mt-keyed-runner', name: 'mt-keyed-runner', runtime: 'claude-code' })
    expect(reply.status, reply.text).toBe(201)
    const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
    expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
    const runId = await aRunServing('mt-keyed-runner')
    const said = await nameTheSandbox(runId, { 'content-type': 'application/json', 'x-mole-office-workspace': WS, 'x-mole-office-key': key })
    expect(said.status, said.text).toBe(403)
    expect(said.text).toContain('A run does not name its own sandbox')
  })

  it('still lets the person name it, which is the control', async () => {
    await register('mt-other-runner')
    const runId = await aRunServing('mt-other-runner')
    const said = await nameTheSandbox(runId, AS_THE_PERSON)
    expect(said.status, said.text).toBe(200)
  })
})

// ============================================================ a stored sender that is a name

describe('a sender stored as a name is read as the one agent bearing it', () => {
  /** A message as the chat reads it. Only the two fields this reading looks at are filled in. */
  const aMessageSentBy = (id: string): MessageOnTheWire =>
    ({ sentBy: { kind: 'agent', id }, from: null }) as unknown as MessageOnTheWire
  /** A registered agent as the callers list one: its registry id, its name and its handle. */
  const anAgent = (id: string, handle: string): KnownParticipant => ({ who: { kind: 'agent', id }, name: handle, handle })

  it('is not an unregistered writer once one agent registers under that name', () => {
    const everyone = [anAgent('Xk3mintedId1', 'roadmap-recorder')]
    expect(unregisteredWriterOf(aMessageSentBy('roadmap-recorder'), everyone)).toBeNull()
  })

  it('is still read by its exact id first', () => {
    const everyone = [anAgent('Xk3mintedId1', 'roadmap-recorder')]
    expect(unregisteredWriterOf(aMessageSentBy('Xk3mintedId1'), everyone)).toBeNull()
  })

  it('is an unregistered writer where two agents bear the name, and where none does', () => {
    const two = [anAgent('Xk3mintedId1', 'roadmap-recorder'), anAgent('Yq7mintedId2', 'roadmap-recorder')]
    expect(unregisteredWriterOf(aMessageSentBy('roadmap-recorder'), two)).toEqual({
      typed: null,
      said: { kind: 'agent', id: 'roadmap-recorder' },
    })
    expect(unregisteredWriterOf(aMessageSentBy('nobody-has-this-name'), two)).not.toBeNull()
  })
})

// ============================================================ the caller's card

describe('the caller\'s card is found when the header carries its minted id', () => {
  it('lets a secretary that sends its id file an incident, which only the secretary card may', async () => {
    const id = await register('mt-secretary', theSecretaryCard())
    const reply = await inject('POST', '/api/records', asAgent(id), {
      kind: 'incident',
      title: 'an incident filed under a minted id',
      data: {
        loss: 'Two near-misses.',
        timeline: [{ id: 'm-1', at: '2026-09-25 03:00', who: 'the operator', what: 'Something happened.', evidence: 'ev-placeholder' }],
      },
    })
    expect(reply.status, reply.text).toBe(201)
  })
})
