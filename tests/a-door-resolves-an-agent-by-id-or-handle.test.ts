// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE API DOORS RESOLVE AN AGENT THE ONE WAY. Criterion I2 of IDENTITY-ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY EACH CASE IS A SEPARATE TEST
 * ---------------------------------------------------------------------------------------
 *
 * An agent's registry id and its handle are two different strings once the id is minted or the
 * handle is changed in place. This file makes a real agent of that shape through the real doors — a
 * registration under one name, then a record patch that changes the handle and leaves the id — and
 * then drives the four doors I-4 names:
 *
 *   · a keyless restore addressed by the handle finds the agent whose id is not that handle;
 *   · the retire door resolves a live handle, and refuses a retired name in words;
 *   · the registration's card message is addressed to the new ROW's registry id, not to the name,
 *     and a registration that joins a row that already held the handle sends none;
 *   · the work-area door resolves an agent by either name and stamps the caller's registry id;
 *   · so does its sibling, the files-area door (acceptance finding 55), so the two record the same,
 *     and it refuses a retired agent's name in words, as the resolver does for a write.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS EACH CASE RED, after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   restore:  in `theRestore`, set the keyless `handle` straight to `claimedHandle` and read by
 *             exact id again. The renamed agent's handle is nobody's id, so the read answers 404.
 *   retire:   in the retire door, put `agentByHandle(asked.id) ?? readParticipant(...)` back. A
 *             second press under the retired name then meets the already-retired row and answers
 *             200 instead of the refusal in words.
 *   card:     address the card message to `{ kind: 'agent', id: body.handle }` again. The message
 *             then names the retired agent whose id the handle is, not the new row. And write the
 *             card message whether or not the row was joined: the joined row then has one waiting.
 *   work area: in `changeWorkArea`, look the arriving `:id` up with `agentByHandle` and stamp
 *             `actor.id`. The renamed worker is found by neither, so the door refuses it.
 *   files area: in `changeFilesArea`, the same two: `agentByHandle` for the arriving `:id`, and the
 *             door refuses the worker by its old id, and writes a retired worker's files area by
 *             its name (200) instead of refusing it in words; `actor.id` for the stamp, and the
 *             stamp names the handle the starter called itself instead of its registry id.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
/** Every handle this case registers, so a name another case used is not already taken. */
let caseNumber = 0
const h = (name: string): string => `${name}-case-${String(caseNumber)}`

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The person's headers, with the caller claimed as one agent. */
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

/** Register through the starter door and hand back the agent record and the registry id it got. */
async function started(
  handle: string,
  role: string | null,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<{ record: string; id: string }> {
  const reply = await inject('POST', '/api/agents/started', headers, {
    handle,
    name: handle,
    ...(role === null ? {} : { role }),
  })
  expect(reply.status, reply.text).toBe(201)
  const agent = reply.json['agent'] as { id: string }
  return { record: String(reply.json['record']), id: agent.id }
}

/**
 * CHANGE AN AGENT'S HANDLE AND LEAVE ITS ID ALONE.
 *
 * The door gives a new agent a minted id, so the id is already not the handle. The rename makes the
 * old handle nobody's name as well. `keepTheAgentRegistryInStep` follows a record's handle with an
 * UPDATE and never touches the id.
 */
async function rename(recordId: string, handle: string): Promise<void> {
  const reply = await inject('PATCH', `/api/records/${recordId}`, AS_THE_PERSON, {
    dataPatch: { handle },
  })
  expect(reply.status, reply.text).toBe(200)
}

/**
 * One registry row inserted straight at the table, with the picture row its foreign key needs.
 *
 * Every other case here makes its agent through the doors. This one cannot: the card message is
 * written at registration time, so to have it addressed to a row whose id is not the handle the
 * row must already be there when the registration runs.
 */
function aDrawnPictureRow(assetId: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(assetId, '2026-08-27 10:00:00')
}

function anAgentRow(id: string, handle: string, name: string): void {
  aDrawnPictureRow(`avatar-default-agent-${id}`)
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
        'VALUES (?, ?, ?, ?, 0, NULL, ?)',
    )
    .run(id, name, handle, `avatar-default-agent-${id}`, '2026-08-27 10:00:00')
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

beforeEach(() => {
  caseNumber += 1
})

// ============================================================ a keyless restore by handle

describe('a keyless restore addressed by handle finds an agent whose id is not its handle', () => {
  it('answers the agent by the name it goes by now, not by its unchanged id', async () => {
    const made = await started(h('restore-old'), null)
    expect(made.id, 'the registration set the id to the handle it was given, not a minted id').not.toBe('restore-old')
    await rename(made.record, h('restore-new'))

    // The handle is nobody's id now, and the row's id is nobody's handle.
    const res = await inject('GET', `/api/restore/${h('restore-new')}`, { 'x-mole-office-workspace': WS })
    expect(res.status, res.text).toBe(200)
    const agent = res.json['agent'] as { id: string; handle: string }
    expect(agent.handle).toBe(h('restore-new'))
    expect(agent.id).toBe(made.id)
  })

  it('still answers an unknown name as nobody, which is the control that the read is not blanket', async () => {
    const made = await started(h('restore-other'), null)
    await rename(made.record, h('restore-other-new'))
    const res = await inject('GET', '/api/restore/nobody-has-this-name', { 'x-mole-office-workspace': WS })
    expect(res.status, res.text).toBe(404)
    expect(res.text).toContain('No agent in this installation answers')
  })
})

// ============================================================ the retire door

describe('the retire door refuses a retired name in words and resolves a live handle', () => {
  it('retires by the live handle, then refuses the same name because it is retired', async () => {
    const made = await started(h('retire-old'), null)
    await rename(made.record, h('retire-new'))

    const first = await inject('POST', `/api/participants/agent/${h('retire-new')}/retire`, AS_THE_PERSON, {
      because: 'the work it was started for is done',
    })
    expect(first.status, first.text).toBe(200)

    const second = await inject('POST', `/api/participants/agent/${h('retire-new')}/retire`, AS_THE_PERSON, {
      because: 'asking again',
    })
    // THE REFUSAL IS THE RESOLVER'S OWN, and it names the retirement and the id that still works.
    // The agent's name is `retire-old`, because it registered with its first handle as its name.
    expect(second.status, second.text).toBe(409)
    const said = String(second.json['error'])
    expect(said).toContain('retired')
    expect(said).toContain(h('retire-old'))
    expect(said).toContain(made.id)
  })
})

// ============================================================ the registration card message

describe('a registration card message is addressed to the new row by its registry id', () => {
  it('reaches the new row by its minted id, and never the handle itself', async () => {
    // THE HANDLE IS A RETIRED AGENT'S ID. An agent registered before criterion I1 has its handle as
    // its id, and once it is retired its handle is free (criterion I3), so the new agent registered
    // under it gets a minted id and the one string names the retired agent by id. A card message
    // addressed to the string would not be addressed to the new row. Until keys wave round 6 this
    // case used a live row that already held the handle; a registration that joins such a row now
    // sends no card message, because the row's card did not change (the case below).
    const held = h('card-handle')
    anAgentRow(held, held, 'Retired Holder')
    t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_at = '2026-08-28 10:00:00' WHERE id = ?").run(held)
    const made = await started(held, null)
    expect(made.id).not.toBe(held)

    // ASKED BY THE NEW ROW'S ID, because the handle alone names two agents and the door refuses it.
    const waiting = await inject('GET', `/api/handles/${made.id}/waiting`, AS_THE_PERSON)
    expect(waiting.status, waiting.text).toBe(200)
    const rows = waiting.json['waiting'] as { messageId: string }[]
    expect(rows.length, 'the registration wrote no card message the waiter can find').toBe(1)

    const message = await inject('GET', `/api/records/${rows[0]!.messageId}`, AS_THE_PERSON)
    expect(message.status, message.text).toBe(200)
    const record = message.json['record'] as { data: { to?: { kind: string; id: string }[] } }
    expect(record.data.to?.[0]?.id, 'the card message is addressed to the handle, not the row').toBe(made.id)
  })

  it('sends no card message to a row that already held the handle, whose card did not change', async () => {
    const minted = 'CardRowId012'
    anAgentRow(minted, h('held-handle'), 'Card Holder')

    const made = await started(h('held-handle'), null)
    // The record was mapped to the row that already held the handle, so the row's id is not the name.
    expect(made.id).toBe(minted)

    const waiting = await inject('GET', `/api/handles/${h('held-handle')}/waiting`, AS_THE_PERSON)
    expect(waiting.status, waiting.text).toBe(200)
    expect(waiting.json['waiting'] as unknown[], 'a card message went to a row whose card did not change').toEqual([])
  })
})

// ============================================================ the work-area door

describe('the work-area door resolves either name and stamps the caller by registry id', () => {
  it('changes a renamed worker by its new handle from a renamed starter, and records the starter id', async () => {
    // THE STARTER IS A SUPERVISOR whose id is not its handle, so registering the worker asks for
    // the starter's card by exact id. A worker starter would be refused the right to give the card.
    const starter = await started(h('starter-old'), 'supervisor')
    await rename(starter.record, h('starter-new'))

    const worker = await started(h('area-old'), 'worker', asAgent(h('starter-new')))
    await rename(worker.record, h('area-new'))

    const changed = await inject('POST', `/api/participants/agent/${h('area-new')}/work-area`, asAgent(h('starter-new')), {
      workArea: ['src/one'],
      because: 'the first part is built',
    })
    expect(changed.status, changed.text).toBe(200)

    // AND BY THE ROW'S MINTED ID, which is not its handle. The resolver answers the id at its
    // second step; a bare handle lookup would refuse the agent that is right there.
    const byId = await inject('POST', `/api/participants/agent/${worker.id}/work-area`, asAgent(h('starter-new')), {
      workArea: ['src/two'],
      because: 'the second part is built',
    })
    expect(byId.status, byId.text).toBe(200)

    const record = await inject('GET', `/api/records/${worker.record}`, AS_THE_PERSON)
    expect(record.status, record.text).toBe(200)
    const data = (record.json['record'] as { data: Record<string, unknown> }).data
    const mark = (data['extra'] as Record<string, unknown>)['workAreaChange'] as {
      by: { type: string; id: string }
      how: string
    }
    // THE STAMP IS THE CALLER'S REGISTRY ID: the agent calling itself `starter-new` is the row
    // whose id is `starter.id`, and that is what must own the change.
    expect(mark.by.id).toBe(starter.id)
    expect(mark.by.id).not.toBe(h('starter-new'))
    expect(mark.how).toBe('a-starter')
  })
})

// ============================================================ the files-area door

describe('the files-area door resolves either name and stamps the caller by registry id', () => {
  it('changes a renamed worker by its new handle and by its old id, and records the starter id', async () => {
    // THE WORK-AREA DOOR'S SIBLING, in the same shape (acceptance finding 55): a supervisor starter and a worker, each
    // renamed, so neither id is its handle. The files area is a folder outside this checkout and outside every home.
    const starter = await started(h('starter-old'), 'supervisor')
    await rename(starter.record, h('starter-new'))

    const worker = await started(h('files-old'), 'worker', asAgent(h('starter-new')))
    await rename(worker.record, h('files-new'))

    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'a-door-files-area-')))
    try {
      const changed = await inject('POST', `/api/participants/agent/${h('files-new')}/files-area`, asAgent(h('starter-new')), {
        filesArea: [folder],
        because: 'synthetic: where its files runs land',
      })
      expect(changed.status, changed.text).toBe(200)

      // AND BY THE ROW'S MINTED ID, which is not its handle: a bare handle lookup refuses it.
      const byId = await inject('POST', `/api/participants/agent/${worker.id}/files-area`, asAgent(h('starter-new')), {
        filesArea: [folder],
        because: 'synthetic: the same folder, asked for by the id',
      })
      expect(byId.status, byId.text).toBe(200)

      const record = await inject('GET', `/api/records/${worker.record}`, AS_THE_PERSON)
      expect(record.status, record.text).toBe(200)
      const data = (record.json['record'] as { data: Record<string, unknown> }).data
      const mark = (data['extra'] as Record<string, unknown>)['filesAreaChange'] as {
        by: { type: string; id: string }
        how: string
      }
      // THE STAMP IS THE CALLER'S REGISTRY ID, as the work-area door's is: the agent calling itself `starter-new` is
      // the row whose id is `starter.id`.
      expect(mark.by.id).toBe(starter.id)
      expect(mark.by.id).not.toBe(h('starter-new'))
      expect(mark.how).toBe('a-starter')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('refuses a retired worker by its name, in words that name the retirement and the id', async () => {
    // THE RESOLVER READS IN WRITING MODE, so a name a retired agent still bears is refused here as the work-area door
    // refuses it, with the retirement and the id that still works in the words.
    const worker = await started(h('gone-old'), null)
    await rename(worker.record, h('gone-new'))
    const retired = await inject('POST', `/api/participants/agent/${h('gone-new')}/retire`, AS_THE_PERSON, {
      because: 'synthetic: the work it was started for is done',
    })
    expect(retired.status, retired.text).toBe(200)

    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'a-door-files-area-')))
    try {
      const refused = await inject('POST', `/api/participants/agent/${h('gone-new')}/files-area`, AS_THE_PERSON, {
        filesArea: [folder],
        because: 'synthetic: where its files runs land',
      })
      expect(refused.status, refused.text).toBe(409)
      // The agent's name is `gone-old`, because it registered with its first handle as its name.
      const said = String(refused.json['error'])
      expect(said).toContain('retired')
      expect(said).toContain(h('gone-old'))
      expect(said).toContain(worker.id)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
