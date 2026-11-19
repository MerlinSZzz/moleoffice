// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CODE THAT HOLDS AN AGENT'S ROW ADDRESSES IT BY THE ROW'S ID, NOT ITS HANDLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md, cause U2 of wave 13b's measurement. A new
 * agent is given an id of its own (criterion I1), so its handle is only a name. Several places in the
 * product read an agent's registry row and then built `{ kind: 'agent', id: row.handle }` to send it a
 * message, put it in a group or name it as responsible. That was right only while the id was the
 * handle. Each case below registers its agents after the mint, so their ids are not their handles,
 * and reads what was stored: a delivery row, a group member, a stored reference.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 * Each case names the one line that, put back to `.handle`, turns it red. On this branch the message
 * door still refuses a handle, so a send put back to a handle fails loudly. A comparison put back to
 * a handle fails its assertion instead.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

/**
 * A MADE-UP PERSON KEY, sent with the self-registration below: a new handle whose request proves nobody
 * waits for the owner’s press (decision Nc9QRT9R_IvF), and that case is about one admitted at once.
 */
const PERSON_KEY = randomBytes(32).toString('hex')
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function inject(
  method: 'GET' | 'POST' | 'PATCH',
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

/** Register an agent through the starter door and insist the door wrote it. */
async function started(by: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', by, payload)
  expect(reply.status, reply.text).toBe(201)
}

/** The registry id of the agent registered under this handle, and proof it is not the handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  expect(row!.id, `${handle} was registered with its handle as its id, so this case proves nothing`).not.toBe(handle)
  return row!.id
}

/** Every agent a message's delivery rows name. The delivery row is the only copy of who a message reached. */
function deliveredTo(messageId: string): string[] {
  const rows = t.client.sqlite
    .prepare("SELECT recipient_id AS id FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent'")
    .all(messageId) as { id: string }[]
  return rows.map((one) => one.id).sort()
}

/** Every message whose delivery rows name this recipient id. */
function messagesDeliveredTo(recipientId: string): { id: string; title: string; body: string }[] {
  const rows = t.client.sqlite
    .prepare(
      "SELECT r.id AS id, r.title AS title, json_extract(r.data, '$.body') AS body FROM message_delivery d " +
        "JOIN records r ON r.id = d.message_id WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? ORDER BY r.rowid",
    )
    .all(recipientId) as { id: string; title: string; body: string }[]
  return rows
}

/** A running session record for an agent, filed through the record door as that agent. */
async function aRun(handle: string, title: string): Promise<string> {
  const reply = await inject('POST', '/api/records', asAgent(handle), {
    kind: 'session',
    title,
    data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd() },
  })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['record'] as { id: string }).id
  // A run with no seal, as the release cases of the inspection tests file it.
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  return id
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  // The secretary, registered after the mint, and the only one: `theActiveSecretary` reads it.
  await started(AS_THE_PERSON, { handle: 'sec-u2', name: 'Secretary U2', role: 'secretary' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ the card door (src/server/api/roles.ts)

describe('the card door writes its message to the agent by its registry id', () => {
  // MUTATION: `to: { kind: 'agent', id: row.id }` in POST /roles/card/:handle put back to `asked.handle`.
  it('gives the card, and the message about it reaches the registry id', async () => {
    await started(AS_THE_PERSON, { handle: 'card-u2', name: 'Card U2' })
    const id = idOf('card-u2')
    const before = messagesDeliveredTo(id).length
    const given = await inject('POST', '/api/roles/card/card-u2', AS_THE_PERSON, { role: 'supervisor' })
    expect(given.status, given.text).toBe(201)
    const after = messagesDeliveredTo(id)
    expect(after.length, 'the card change wrote no message to the agent').toBe(before + 1)
    expect(after[after.length - 1]!.body).toContain('supervisor')
    expect(messagesDeliveredTo('card-u2'), 'a message was delivered to the handle').toEqual([])
  })
})

describe('the refusal of a card request pressed by the wrong agent names both agents by handle', () => {
  // MUTATION: `named(answersTo)` in POST /roles/requests/:id/:answer put back to `answersTo.id`.
  it('names the starter that answers it and the agent that asked, not their ids', async () => {
    await started(AS_THE_PERSON, { handle: 'ask-sup-u2', name: 'Ask Sup U2', role: 'supervisor' })
    await started(AS_THE_PERSON, { handle: 'other-sup-u2', name: 'Other Sup U2', role: 'supervisor' })
    await started(asAgent('ask-sup-u2'), { handle: 'ask-w-u2', name: 'Ask W U2', workArea: ['ask'] })
    const asked = await inject('POST', '/api/roles/requests', asAgent('ask-w-u2'), { asking: 'supervisor' })
    expect(asked.status, asked.text).toBe(201)
    const pressed = await inject('POST', `/api/roles/requests/${String(asked.json['request'])}/grant`, asAgent('other-sup-u2'), {})
    expect(pressed.status, pressed.text).toBe(403)
    const refusal = String(pressed.json['error'])
    expect(refusal).toContain('"ask-sup-u2", which is the agent that started ask-w-u2')
    expect(refusal).not.toContain(idOf('ask-sup-u2'))
  })
})

// ============================================================ self-registration (src/server/lib/selfregistration.ts)

describe('a session that registers itself is addressed by its new registry id', () => {
  let id = ''
  beforeAll(async () => {
    const reply = await inject('POST', '/api/agents/register-myself', { ...asAgent('self-u2'), 'x-mole-office-key': PERSON_KEY }, {
      handle: 'self-u2',
      name: 'Self U2',
      runtime: 'codex',
      workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      requestedRole: 'supervisor',
    })
    expect(reply.status, reply.text).toBe(201)
    id = idOf('self-u2')
  })

  // MUTATION: `to: theNewAgent` in writeTheCardMessageToOne's call put back to `{ kind: 'agent', id: input.said.handle }`.
  it('writes its card message to the registry id', () => {
    const messages = messagesDeliveredTo(id)
    expect(messages.length, 'the registration wrote no card message to the new agent').toBe(1)
    expect(messagesDeliveredTo('self-u2'), 'a message was delivered to the handle').toEqual([])
  })

  // MUTATION: `asker: theNewAgent` put back to `{ kind: 'agent', id: input.said.handle }`.
  it('stores the registry id as the asker of the card it asked for', () => {
    const row = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.asker') AS asker FROM records WHERE kind = 'role_request' AND title LIKE 'self-u2 %'")
      .get() as { asker: string } | undefined
    expect(row, 'the registration filed no card request').toBeDefined()
    expect(JSON.parse(row!.asker)).toEqual({ kind: 'agent', id })
  })
})

// ============================================================ inspection (src/server/lib/inspection.ts)

describe('a release reaches the worker by its registry id', () => {
  // MUTATION: `workerRef` in releaseOrRefuse put back to `{ kind: 'agent', id: reads.agent.handle }`.
  it('writes the release to the worker, and the delivery row names its id', async () => {
    await started(AS_THE_PERSON, { handle: 'lead-u2', name: 'Lead U2', role: 'supervisor' })
    await started(asAgent('lead-u2'), { handle: 'builder-u2', name: 'Builder U2', role: 'worker', workArea: ['src'], chapters: ['5'] })
    const run = await aRun('builder-u2', 'Builder U2, a run its starter releases')
    const done = await inject('PATCH', `/api/records/${run}`, asAgent('builder-u2'), { dataPatch: { state: 'finished' } })
    expect(done.status, done.text).toBe(200)
    const released = await inject('POST', `/api/checks/${run}`, asAgent('lead-u2'), {
      verdict: 'released',
      check: 'Read the diff. Nothing is missing.',
    })
    expect(released.status, released.text).toBe(201)
    const toTheWorker = messagesDeliveredTo(idOf('builder-u2')).filter((one) => one.title.startsWith('Released'))
    expect(toTheWorker.length, 'the release wrote no message to the worker').toBe(1)
    expect(deliveredTo(toTheWorker[0]!.id)).toEqual([idOf('builder-u2')])
  })
})

// ============================================================ delegation (src/server/lib/delegation.ts)

describe('the agent responsible for a task is named by its registry id', () => {
  let task = ''
  beforeAll(async () => {
    await started(AS_THE_PERSON, { handle: 'owner-u2', name: 'Owner U2', role: 'supervisor' })
    task = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'task',
      title: 'A task an agent made',
      actor: { type: 'agent', id: 'owner-u2' },
      data: {},
    }).id
  })

  // MUTATION: `who: { kind: 'agent', id: creator.id }` in responsibleFor put back to `creator.handle`.
  it('names the live creator by its id', async () => {
    const { responsibleFor } = await import('../src/server/lib/delegation.ts')
    expect(responsibleFor(task).who).toEqual({ kind: 'agent', id: idOf('owner-u2') })
  })

  // MUTATION: `participantForActor(actor)?.id === responsible.who.id` put back to `responsible.who.id === actor.id`.
  it('lets the responsible agent, calling under its handle, confirm the task', async () => {
    const { assertMayConfirmPackage } = await import('../src/server/lib/delegation.ts')
    expect(() => assertMayConfirmPackage({ id: task, title: 'A task an agent made' }, { type: 'agent', id: 'owner-u2' })).not.toThrow()
  })
})

describe('responsibility that passes up a starter chain names the live agent by handle', () => {
  // MUTATION: `above.handle` in rule 4's sentence of responsibleFor put back to `above.id`.
  it('addresses the live starter by its id and names it by its handle', async () => {
    await started(AS_THE_PERSON, { handle: 'boss-u2', name: 'Boss U2', role: 'supervisor' })
    await started(asAgent('boss-u2'), { handle: 'gone-u2', name: 'Gone U2' })
    const task = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'task',
      title: 'A task whose maker is retired',
      actor: { type: 'agent', id: 'gone-u2' },
      data: {},
    }).id
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE handle = ?').run('gone-u2')
    const { responsibleFor } = await import('../src/server/lib/delegation.ts')
    const said = responsibleFor(task)
    expect(said.who).toEqual({ kind: 'agent', id: idOf('boss-u2') })
    expect(said.why).toContain('up its starter chain to "boss-u2"')
  })
})

// ============================================================ claims (src/server/lib/claims.ts)

describe('a work-area overlap group holds registry ids, and the secretary is known by its id', () => {
  // MUTATION: `who: { kind: 'agent', id: who.id }` in theMembersOfAWorkAreaGroup put back to `who.handle`.
  it('puts both agents and the one above each in the group by their ids', async () => {
    await started(AS_THE_PERSON, { handle: 'sup-a-u2', name: 'Sup A U2', role: 'supervisor' })
    await started(AS_THE_PERSON, { handle: 'sup-b-u2', name: 'Sup B U2', role: 'supervisor' })
    await started(asAgent('sup-a-u2'), { handle: 'work-a-u2', name: 'Work A U2', role: 'worker', workArea: ['lib'] })
    await started(asAgent('sup-b-u2'), { handle: 'work-b-u2', name: 'Work B U2', role: 'worker', workArea: ['docs'] })
    const run = await aRun('work-a-u2', 'Work A U2 at work')
    const claimed = await inject('POST', '/api/claims', asAgent('work-a-u2'), { run, things: [{ what: 'path', id: 'lib/one.ts' }] })
    expect(claimed.status, claimed.text).toBe(201)

    const claims = await import('../src/server/lib/claims.ts')
    const opened = claims.openTheGroupsForAWorkArea(
      { agentHandle: 'work-b-u2', area: ['lib'], workspaceId: WORKSPACE },
      { type: 'human', id: THE_PERSON },
    )
    expect(opened.length, 'the overlap opened no group').toBe(1)
    const members = t.client.sqlite
      .prepare("SELECT member_id AS id FROM group_members WHERE group_id = ? AND member_kind = 'agent' AND left_at IS NULL")
      .all(opened[0]!.group) as { id: string }[]
    expect(members.map((one) => one.id).sort()).toEqual(['work-a-u2', 'work-b-u2', 'sup-a-u2', 'sup-b-u2'].map(idOf).sort())
  })

  // MUTATION: `{ kind: 'agent', id: row.id }` in theActiveSecretary put back to `row.handle`.
  it('lets the secretary registered after the mint end a claim whose run is not running', async () => {
    await started(AS_THE_PERSON, { handle: 'lone-u2', name: 'Lone U2', workArea: ['solo'] })
    const run = await aRun('lone-u2', 'Lone U2, a run that says it is finished')
    const claimed = await inject('POST', '/api/claims', asAgent('lone-u2'), { run, things: [{ what: 'path', id: 'solo/one.ts' }] })
    expect(claimed.status, claimed.text).toBe(201)
    const claim = (claimed.json['claim'] as { id: string }).id
    const done = await inject('PATCH', `/api/records/${run}`, asAgent('lone-u2'), { dataPatch: { state: 'finished' } })
    expect(done.status, done.text).toBe(200)
    const ended = await inject('POST', `/api/claims/${claim}/release`, asAgent('sec-u2'), { because: 'The run is finished.' })
    expect(ended.status, ended.text).toBe(200)
  })
})

// ============================================================ the Embassy (src/server/api/office.ts)

describe('the Embassy draws an agent that holds a visitor credential once', () => {
  // MUTATION: the credential row's `id: named?.id ?? credential.handle` put back to `id: credential.handle`.
  it('matches the credential to the registered agent by its id (problem MBSi6s2JRMOR)', async () => {
    const asked = await inject('POST', '/api/office/visitors', AS_THE_PERSON, {
      handle: 'visit-u2',
      name: 'Visit U2',
      role: 'worker',
      conversationPath: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/loquat/visit-u2.jsonl`,
      runtime: 'codex',
    })
    expect(asked.status, asked.text).toBeLessThan(300)
    const credential = (asked.json['credential'] as { id: string }).id
    const confirmed = await inject('POST', `/api/office/visitors/${credential}/confirm`, AS_THE_PERSON, {})
    expect(confirmed.status, confirmed.text).toBeLessThan(300)
    // Confirming the credential registers the agent, with an id of its own.
    const id = idOf('visit-u2')

    const embassy = await inject('GET', '/api/office/embassy', AS_THE_PERSON)
    expect(embassy.status, embassy.text).toBe(200)
    const rows = embassy.json['rows'] as { who: { kind: string; id: string } }[]
    const drawn = rows.filter((one) => one.who.kind === 'agent' && (one.who.id === id || one.who.id === 'visit-u2'))
    expect(drawn.map((one) => one.who.id), 'one agent, one row').toEqual([id])
  })
})
