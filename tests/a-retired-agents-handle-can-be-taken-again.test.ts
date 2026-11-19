// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RETIRED AGENT'S HANDLE CAN BE TAKEN AGAIN, BY A NEW AGENT WITH A NEW ID. Criterion I3 of
 * design/agents/IDENTITY-ACCEPTANCE.md and a decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE CRITERION SAYS, AND WHAT THIS FILE PROVES OF IT
 * ---------------------------------------------------------------------------------------
 *
 * "A handle is unique among LIVE agents and free again after retirement: the unique index on
 * agents.handle becomes an index over live rows (...); a registration under a freed handle makes a
 * NEW agent with a NEW id; two live agents never share a handle." Until this piece the index covered
 * retired rows too and a registration under a retired handle was refused (problem zyCcJYCLsAe7).
 *
 *   1. Register foo, retire it, register foo again: a new agent with a new id, the old row kept,
 *      retired, with its id, and each record joined to its own row.
 *   2. Two live agents never share a handle: another project's registration maps onto the live
 *      agent; a rename onto a live agent's handle is refused in words; a rename onto a handle only a
 *      retired agent bears goes through.
 *   3. Making the old foo active again while the new foo is live is refused in words, and nothing is
 *      written.
 *   4. The new foo inherits nothing: no key, no authorship, no credential, no hold, no message.
 *   5. A message to "foo" reaches the new foo; a message to the old foo's id is refused as retired.
 *   6. Removing the old foo's record retires nobody else.
 *   7. The retire door revokes the keys of the agent it retires, by id.
 *   8. Two retired agents on one handle: nobody is picked (lib/agent-references.ts).
 *   9. The migration: before it a retired and a live row cannot share a handle, after it they can,
 *      two live rows still cannot, and a second run changes nothing.
 *  10. A freed LEGACY handle (an agent whose id is its handle): the new agent's key settles who it is,
 *      and without the key the bare name is refused naming both agents (the supervisor's answer
 *      tW482dZYBxfq; plan be2Z8l-GArM2, block b9). The change log marks no different holder.
 *  11. The readers that met two rows on one handle: the notebook, the served guard, the start-up
 *      mapping of an unmapped record, the inbox of one project, the usage page's runtime join.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST. Each undoes one change.
 * ---------------------------------------------------------------------------------------
 *
 *   M1  lib/participants.ts `theAgentByHandleStatement`: drop `AND retired = 0` → sections 1, 2, 4, 5 red.
 *   M2  lib/participants.ts `whyTheRegistryCannotFollow`: return null at once → sections 2 and 3 red.
 *   M3  lib/records.ts `retireTheRowBehind`: read the row by `agentByHandle(handle)` → section 6 red.
 *   M4  api/participants.ts, the retire door: revoke by `retired.handle` → section 7 red.
 *   M5  lib/agent-references.ts: `retiredByHandle` the first retired row, and `theOneAgentAStringNames`
 *       counting only it → section 8 red.
 *   M6  drizzle/0174: leave out the DROP INDEX line → section 9 red.
 *   M7  lib/participants.ts `participantForActor`: pass no key to the resolver → section 10 red.
 *   M8  lib/handles.ts `whyACredentialMayNotActOnThisHandle`: compare the handle strings only → section 4's
 *       credential case red.
 *   M9  lib/records/notebook-entries.ts `checkTheNotebook`: read the row by `agentByHandle` → section 11's notebook case red.
 *   M10 lib/records.ts `theSecretaryOfThisOffice`: find the row by handle in the list → the served case red.
 *   M11 db/participants-migration.ts: map onto the first row bearing the handle → the start-up case red.
 *   M12 lib/inbox.ts `agentByHandle`: search every record in one pass → the inbox case red.
 *   M13 lib/usage-agents.ts `runtimeByAgent`: key by handle only → the usage case red.
 *
 * ROUND 2, section 12: the handle doors settle a freed legacy handle by the caller's key. Each
 * mutation drops the key from one door's resolution, and that door's case goes red:
 *   R1 api/handles.ts, the hold door: `keyHolder: theKeyOn(req)` left out of `holdTheHandle`.
 *   R2 api/handles.ts, the waiting door: `theAgentAHandleDoorNames(asked.handle, null)`.
 *   R3 api/handles.ts, the one-handle read: the same.
 *   R4 api/handles.ts, the took door: the same.
 *   R5 api/handles.ts, the beat door: `beatTheHold` called without the key.
 *   R6 api/handles.ts, the release door: `letTheHandleGo` called without the key.
 *   R7 lib/held-process.ts `recordTheSessionsProcess`: the path resolved without the key.
 *   R8 lib/handles.ts `theAgentAHandleDoorNames`: step 1 given no key → every keyed case red.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NOTEBOOK_KIND } from '../src/shared/notebook.ts'
import { KEY_HEADER } from '../src/config/key-header.mjs'

type ParticipantsLib = typeof import('../src/server/lib/participants.ts')
type KeysLib = typeof import('../src/server/lib/keys.ts')
type HandlesLib = typeof import('../src/server/lib/handles.ts')
type ReferencesLib = typeof import('../src/server/lib/agent-references.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(key === undefined ? {} : { [KEY_HEADER]: key }),
})

const inProject = (headers: Record<string, string>, project: string): Record<string, string> => ({
  ...headers,
  'x-mole-office-workspace': project,
})

/** What one registration answered: the record, the registry id, and the key it was handed. */
interface Registered {
  record: string
  id: string
  key: string | null
}

async function register(
  app: FastifyInstance,
  body: Record<string, unknown>,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<Registered> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  const said = reply.json() as { record: string; agent: { id: string }; whatToGiveIt: { key?: string } }
  return { record: said.record, id: said.agent.id, key: said.whatToGiveIt.key ?? null }
}

/** Retire through the door, asked from the project the agent's record is in, so the record follows. */
async function retire(
  app: FastifyInstance,
  id: string,
  because: string,
  project = 'default',
): Promise<{ code: number; body: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${encodeURIComponent(id)}/retire`,
    headers: inProject(AS_THE_PERSON, project),
    payload: { because },
  })
  return { code: reply.statusCode, body: reply.body }
}

async function aProject(app: FastifyInstance, id: string): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title: `Project ${id}` } })
  expect(made.statusCode, made.body).toBe(201)
}

/** Every registry row bearing one handle, oldest first, straight from the table. */
function rowsBearing(t: TestDb, handle: string): { id: string; retired: number; name: string }[] {
  return t.client.sqlite
    .prepare('SELECT id, retired, name FROM agents WHERE handle = ? ORDER BY created_at, rowid')
    .all(handle) as { id: string; retired: number; name: string }[]
}

/** One agent row written straight at the table, for the shapes no door makes (a legacy id). */
function anAgentRow(t: TestDb, row: { id: string; handle: string; name: string; retired?: boolean; role?: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${row.id}`, '2026-09-01 10:00:00')
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, role, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      row.id,
      row.name,
      row.handle,
      `avatar-default-agent-${row.id}`,
      row.retired === true ? 1 : 0,
      row.retired === true ? '2026-09-02 09:00:00' : null,
      row.role ?? null,
      '2026-09-01 10:00:00',
    )
}

async function aRecordOf(
  app: FastifyInstance,
  id: string,
  project = 'default',
): Promise<{ data: Record<string, unknown>; seq: number }> {
  const headers = inProject(AS_THE_PERSON, project)
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers })
  expect(read.statusCode, read.body).toBe(200)
  const record = (read.json() as { record: { data: Record<string, unknown> } }).record
  const revisions = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers })
  const seqs = ((revisions.json() as { revisions: { seq: number }[] }).revisions ?? []).map((one) => one.seq)
  return { data: record.data, seq: Math.max(0, ...seqs) }
}

async function anAsk(app: FastifyInstance, headers: Record<string, string>): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'problem', title: 'The arm stops short of the handover pose', data: { symptom: 'it stops 4 cm short', whose_move: 'person' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function aMessage(
  app: FastifyInstance,
  to: string,
  body: string,
): Promise<{ code: number; json: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body, data: { to: [{ kind: 'agent', id: to }], body } },
  })
  return { code: reply.statusCode, json: reply.json() as Record<string, unknown> }
}

async function waitingFor(app: FastifyInstance, reference: string): Promise<string[]> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/handles/${encodeURIComponent(reference)}/waiting`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { waiting: { messageId: string }[] }).waiting.map((one) => one.messageId)
}

// ============================================================ sections 1 to 7: one office, in order

describe('foo, retired, and a new foo', () => {
  let t: TestDb
  let app: FastifyInstance
  let participants: ParticipantsLib
  let keys: KeysLib
  let handles: HandlesLib
  let oldFoo: Registered
  let newFoo: Registered
  let oldFoosAsk = ''
  let aMessageToTheOldFoo = ''

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    participants = await import('../src/server/lib/participants.ts')
    keys = await import('../src/server/lib/keys.ts')
    handles = await import('../src/server/lib/handles.ts')
    await aProject(app, 'another')

    // THE OLD FOO: registered, writes an ask, holds its handle, has a message waiting, then retires.
    oldFoo = await register(app, { handle: 'foo', name: 'Foo The First', role: 'worker' })
    oldFoosAsk = await anAsk(app, asAgent('foo'))
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'The old foo at work',
      data: { state: 'running', runtime: 'claude-code', doing: 'working as foo' },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    const held = await app.inject({
      method: 'POST',
      url: '/api/handles/foo/hold',
      headers: AS_THE_PERSON,
      payload: { session, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)
    const sent = await aMessage(app, oldFoo.id, 'For the old foo only')
    expect(sent.code, JSON.stringify(sent.json)).toBe(201)
    aMessageToTheOldFoo = (sent.json['record'] as { id: string }).id
    // A VISITOR CREDENTIAL THE OLD FOO CAME IN ON, never ended. Written on its row the way the visitor
    // confirm writes it.
    t.client.sqlite.prepare("UPDATE agents SET credential = 'cred-of-the-old-foo' WHERE id = ?").run(oldFoo.id)
    expect((await retire(app, oldFoo.id, 'its piece of work is done')).code).toBe(200)

    newFoo = await register(app, { handle: 'foo', name: 'Foo The Second', role: 'worker' })
  }, 120_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  // ---------------------------------------------------------------- 1. a new agent with a new id

  describe('1. a registration under a retired handle', () => {
    it('makes a new agent with a new id, and keeps the old row, retired, with its id', () => {
      expect(newFoo.id, 'a new id').not.toBe(oldFoo.id)
      const rows = rowsBearing(t, 'foo')
      expect(rows.map((one) => one.id)).toEqual([oldFoo.id, newFoo.id])
      expect(rows[0]!.retired, 'the old foo is still retired').toBe(1)
      expect(rows[1]!.retired, 'the new foo is live').toBe(0)
    })

    it('joins each record to its own row', () => {
      expect(participants.agentForRecord(oldFoo.record)?.id).toBe(oldFoo.id)
      expect(participants.agentForRecord(newFoo.record)?.id).toBe(newFoo.id)
      expect(newFoo.record).not.toBe(oldFoo.record)
    })

    it('answers the live agent when the handle is asked for', () => {
      expect(participants.agentByHandle('foo')?.id).toBe(newFoo.id)
    })
  })

  // ---------------------------------------------------------------- 2. two live agents never share

  describe('2. two live agents never share a handle', () => {
    it('maps a registration under a live handle in another project onto that live agent', async () => {
      const again = await register(app, { handle: 'foo', name: 'Foo Elsewhere', role: 'worker' }, inProject(AS_THE_PERSON, 'another'))
      expect(again.id, 'the live foo, not a third row').toBe(newFoo.id)
      expect(rowsBearing(t, 'foo')).toHaveLength(2)
    })

    it('refuses a rename onto a live agent’s handle in words, and changes nothing', async () => {
      // A THIRD PROJECT, where no record bears `foo`, so that project's own handle rule has nobody to
      // refuse for and the registry's rule is the one that answers.
      await aProject(app, 'third')
      const bar = await register(app, { handle: 'bar', name: 'Bar', role: 'worker' }, inProject(AS_THE_PERSON, 'third'))
      const before = await aRecordOf(app, bar.record, 'third')
      const reply = await app.inject({
        method: 'PATCH',
        url: `/api/records/${bar.record}`,
        headers: inProject(AS_THE_PERSON, 'third'),
        payload: { dataPatch: { handle: 'foo' } },
      })
      expect(reply.statusCode, reply.body).toBe(409)
      const said = (reply.json() as { error: string }).error
      expect(said).toBe(
        `Bar (${bar.id}) cannot take the handle "foo": Foo The Second (${newFoo.id}) bears it and is active. ` +
          'Two live agents never share a handle. Nothing was written.',
      )
      const after = await aRecordOf(app, bar.record, 'third')
      expect(after.data['handle']).toBe('bar')
      expect(after.seq, 'no revision was written').toBe(before.seq)
      expect(rowsBearing(t, 'bar').map((one) => one.id)).toEqual([bar.id])
    })

    it('lets a rename onto a handle only a retired agent bears go through', async () => {
      const gone = await register(app, { handle: 'gone', name: 'Gone', role: 'worker' })
      expect((await retire(app, gone.id, 'finished')).code).toBe(200)
      const baz = await register(app, { handle: 'baz', name: 'Baz', role: 'worker' }, inProject(AS_THE_PERSON, 'another'))
      const reply = await app.inject({
        method: 'PATCH',
        url: `/api/records/${baz.record}`,
        headers: inProject(AS_THE_PERSON, 'another'),
        payload: { dataPatch: { handle: 'gone' } },
      })
      expect(reply.statusCode, reply.body).toBe(200)
      expect(rowsBearing(t, 'gone').map((one) => [one.id, one.retired])).toEqual([
        [gone.id, 1],
        [baz.id, 0],
      ])
    })
  })

  // ---------------------------------------------------------------- 3. un-retiring is refused

  describe('3. making a retired agent active again while a new agent bears its handle', () => {
    it('is refused in the same project by the project’s own handle rule, and nothing is written', async () => {
      const before = await aRecordOf(app, oldFoo.record)
      const reply = await app.inject({
        method: 'PATCH',
        url: `/api/records/${oldFoo.record}`,
        headers: AS_THE_PERSON,
        payload: { dataPatch: { state: 'active' } },
      })
      expect(reply.statusCode, reply.body).toBe(409)
      const said = (reply.json() as { error: string }).error
      expect(said).toContain('The handle "foo" already belongs to "Foo The Second"')
      expect(said).toContain('Nothing was written')
      const after = await aRecordOf(app, oldFoo.record)
      expect(after.data['state']).toBe('retired')
      expect(after.seq, 'no revision was written').toBe(before.seq)
      expect(rowsBearing(t, 'foo').map((one) => one.retired)).toEqual([1, 0])
    })

    it('is refused from another project in words naming the live agent, and nothing is written', async () => {
      // THE OLD QUX LIVES IN ANOTHER PROJECT, so that project's own handle rule has nobody to refuse
      // for, and the registry's rule is the one that answers.
      const oldQux = await register(app, { handle: 'qux', name: 'Qux The First', role: 'worker' }, inProject(AS_THE_PERSON, 'another'))
      expect((await retire(app, oldQux.id, 'finished', 'another')).code).toBe(200)
      const newQux = await register(app, { handle: 'qux', name: 'Qux The Second', role: 'worker' })
      expect(newQux.id).not.toBe(oldQux.id)
      const before = await aRecordOf(app, oldQux.record, 'another')
      const reply = await app.inject({
        method: 'PATCH',
        url: `/api/records/${oldQux.record}`,
        headers: inProject(AS_THE_PERSON, 'another'),
        payload: { dataPatch: { state: 'active' } },
      })
      expect(reply.statusCode, reply.body).toBe(409)
      expect((reply.json() as { error: string }).error).toBe(
        `Qux The First (${oldQux.id}) cannot be made active again under the handle "qux": ` +
          `Qux The Second (${newQux.id}) bears that handle now and is active. Two live agents never share a handle. ` +
          'Nothing was written.',
      )
      const after = await aRecordOf(app, oldQux.record, 'another')
      expect(after.data['state']).toBe('retired')
      expect(after.seq, 'no revision was written').toBe(before.seq)
      expect(rowsBearing(t, 'qux').map((one) => [one.id, one.retired])).toEqual([
        [oldQux.id, 1],
        [newQux.id, 0],
      ])
    })
  })

  // ---------------------------------------------------------------- 4. it inherits nothing

  describe('4. the new foo inherits nothing of the old one', () => {
    it('was handed a key of its own, kept under its own id', () => {
      expect(newFoo.key, 'the registration handed it a key').not.toBeNull()
      expect(keys.aKeyWasEverHeldBy('agent', newFoo.id)).toBe(true)
      const underNew = t.client.sqlite.prepare("SELECT id FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ?").all(newFoo.id)
      expect(underNew, 'one key, its own').toHaveLength(1)
      expect(keys.theLiveKeyHeldBy('agent', 'foo')?.id, 'the live key the name finds is the new one').toBe(
        (underNew[0] as { id: string }).id,
      )
      expect(keys.theLiveKeyHeldBy('agent', oldFoo.id), 'and the old foo’s key died with it').toBeNull()
    })

    it('may not withdraw the ask the old foo wrote', async () => {
      const reply = await app.inject({
        method: 'PATCH',
        url: `/api/records/${oldFoosAsk}`,
        headers: asAgent('foo'),
        payload: { dataPatch: { whose_move: null } },
      })
      expect(reply.statusCode, reply.body).toBe(403)
      expect((await aRecordOf(app, oldFoosAsk)).data['whose_move']).toBe('person')
    })

    it('is not acted for by the old foo’s credential', () => {
      const refused = handles.whyACredentialMayNotActOnThisHandle({ id: 'cred-of-the-old-foo', handle: 'foo' }, 'foo')
      expect(refused, 'the old credential acted for the new foo').not.toBeNull()
      expect(refused).toContain(newFoo.id)
      expect(refused).toContain('Nothing was done')
      expect(
        handles.whyACredentialMayNotActOnThisHandle({ id: 'cred-of-the-old-foo', handle: 'foo' }, oldFoo.id),
        'while it still acts for the agent it was issued to',
      ).toBeNull()
    })

    it('holds nothing the old foo held, and takes its own hold over nobody', async () => {
      const heldByNew = t.client.sqlite.prepare('SELECT id FROM handle_holds WHERE agent_id = ?').all(newFoo.id)
      expect(heldByNew, 'no hold came with the name').toHaveLength(0)
      const session = t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: 'The new foo at work',
        data: { state: 'running', runtime: 'claude-code', doing: 'working as the new foo' },
        actor: { type: 'human', id: THE_PERSON },
      }).id
      const held = await app.inject({
        method: 'POST',
        url: '/api/handles/foo/hold',
        headers: AS_THE_PERSON,
        payload: { session, machine: 'a-machine', runtime: 'claude-code' },
      })
      expect(held.statusCode, held.body).toBe(201)
      expect((held.json() as { tookOverFrom: unknown }).tookOverFrom, 'it took over from nobody').toBeNull()
      const rows = t.client.sqlite.prepare('SELECT agent_id AS agentId FROM handle_holds WHERE session_record_id = ?').all(session)
      expect(rows).toEqual([{ agentId: newFoo.id }])
    })

    it('is not given the messages the old foo was sent', async () => {
      expect(await waitingFor(app, 'foo'), 'the name reads the new foo’s waiting list').not.toContain(aMessageToTheOldFoo)
      expect(await waitingFor(app, oldFoo.id), 'the old foo still has its own').toContain(aMessageToTheOldFoo)
    })
  })

  // ---------------------------------------------------------------- 5. messages

  describe('5. a message', () => {
    it('to "foo" reaches the new foo', async () => {
      const sent = await aMessage(app, 'foo', 'For whoever is foo now')
      expect(sent.code, JSON.stringify(sent.json)).toBe(201)
      const to = (sent.json['record'] as { data: { to: { id: string }[] } }).data.to
      expect(to).toEqual([{ kind: 'agent', id: newFoo.id }])
    })

    it('to the old foo’s id still names the old foo, and is refused because it is retired', async () => {
      const sent = await aMessage(app, oldFoo.id, 'For the old foo again')
      expect(sent.code, JSON.stringify(sent.json)).toBe(409)
      expect(String(sent.json['reason'] ?? sent.json['error'])).toContain('Foo The First')
    })
  })

  // ---------------------------------------------------------------- 6. removing the old record

  describe('6. removing the old foo’s record', () => {
    it('retires nobody else', async () => {
      const gone = await app.inject({ method: 'DELETE', url: `/api/records/${oldFoo.record}`, headers: AS_THE_PERSON })
      expect(gone.statusCode, gone.body).toBe(200)
      expect(rowsBearing(t, 'foo').map((one) => [one.id, one.retired])).toEqual([
        [oldFoo.id, 1],
        [newFoo.id, 0],
      ])
      expect(gone.body, 'and says the row behind it was already retired').toContain('was already retired')
    })
  })

  // ---------------------------------------------------------------- 7. the retire door, by id

  describe('7. retiring the new foo', () => {
    it('revokes the new foo’s key, by its id, while the old foo also bears the name', async () => {
      const retired = await retire(app, 'foo', 'the second piece of work is done')
      expect(retired.code, retired.body).toBe(200)
      expect((JSON.parse(retired.body) as { keysRevoked: number }).keysRevoked).toBe(1)
      expect(keys.theLiveKeyHeldBy('agent', newFoo.id)).toBeNull()
    })
  })
})

// ============================================================ 8. two retired agents on one handle

describe('8. a handle two retired agents bore, and no live one', () => {
  let t: TestDb
  let participants: ParticipantsLib
  let references: ReferencesLib

  beforeAll(async () => {
    t = await freshDb()
    participants = await import('../src/server/lib/participants.ts')
    references = await import('../src/server/lib/agent-references.ts')
    anAgentRow(t, { id: 'Rt1aAaAaAaA1', handle: 'twice', name: 'Twice The First', retired: true })
    anAgentRow(t, { id: 'Rt2bBbBbBbB2', handle: 'twice', name: 'Twice The Second', retired: true })
  })

  afterAll(() => {
    t.close()
  })

  it('names nobody to a stored reader', () => {
    expect(references.theOneAgentAStringNames(t.client.sqlite, 'twice')).toBeNull()
    const could = references.everyAgentAReferenceCouldName(t.client.sqlite, 'twice')
    expect(could.retiredByHandle).toBeNull()
    expect(could.everyRetiredByHandle.map((one) => one.id)).toEqual(['Rt1aAaAaAaA1', 'Rt2bBbBbBbB2'])
  })

  it('is refused to an arriving reference, naming both and the id of each', () => {
    let said = ''
    try {
      participants.theAgentAnArrivingReferenceNames('twice', 'reading')
    } catch (error) {
      said = String((error as Error).message)
    }
    expect(said).toContain('is the handle of 2 retired agents')
    expect(said).toContain('Rt1aAaAaAaA1')
    expect(said).toContain('Rt2bBbBbBbB2')
  })
})

// ============================================================ 9. the migration

describe('9. migration 0174 on a database made before it', () => {
  const REPO = fileURLToPath(new URL('..', import.meta.url))
  const MIGRATIONS = join(REPO, 'drizzle')
  const made: string[] = []
  let migrate: typeof import('../src/server/db/migrate.ts')

  beforeAll(async () => {
    migrate = await import('../src/server/db/migrate.ts')
  })

  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  /** The real migrations folder without its last entry, so a database can be made before 0174. */
  function everyMigrationBefore0174(): string {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-before-0174-'))
    made.push(dir)
    mkdirSync(join(dir, 'meta'))
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[]
    }
    const at = journal.entries.findIndex((one) => one.tag.startsWith('0174_'))
    expect(at, 'drizzle/ holds migration 0174').toBeGreaterThan(0)
    const entries = journal.entries.slice(0, at)
    for (const one of entries) copyFileSync(join(MIGRATIONS, `${one.tag}.sql`), join(dir, `${one.tag}.sql`))
    writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }))
    return dir
  }

  function insert(db: Database.Database, id: string, handle: string, retired: 0 | 1): void {
    db.prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    ).run(`avatar-${id}`, '2026-09-01 10:00:00')
    db.prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, id, handle, `avatar-${id}`, retired, '2026-09-01 10:00:00')
  }

  function theIndexes(db: Database.Database): unknown {
    return db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'agents' ORDER BY name").all()
  }

  it('lets a retired and a live row share a handle after it, and never two live rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-0174-'))
    made.push(dir)
    const db = new Database(join(dir, 'panelx.db'))
    try {
      db.pragma('foreign_keys = ON')
      migrate.migrateInPlace(db, everyMigrationBefore0174())
      insert(db, 'OldOne000001', 'shared', 1)
      expect(() => insert(db, 'NewOne000002', 'shared', 0), 'before 0174 a retired row keeps its handle taken').toThrow(
        /UNIQUE/,
      )

      migrate.migrateInPlace(db)
      insert(db, 'NewOne000002', 'shared', 0)
      expect(() => insert(db, 'NewTwo000003', 'shared', 0), 'two live rows still cannot share one').toThrow(/UNIQUE/)
      const rows = db.prepare("SELECT id, retired FROM agents WHERE handle = 'shared' ORDER BY id").all()
      expect(rows).toEqual([
        { id: 'NewOne000002', retired: 0 },
        { id: 'OldOne000001', retired: 1 },
      ])

      // A SECOND RUN. The data steps fill in columns on the row written just now, which is their
      // business and not this migration's; what 0174 is about is the indexes and who bears a handle.
      const indexes = theIndexes(db)
      const bearers = db.prepare('SELECT id, handle, retired FROM agents ORDER BY id').all()
      const second = migrate.migrateInPlace(db)
      expect(second.newlyApplied, 'nothing is left to apply').toBe(0)
      expect(theIndexes(db), 'a second run changes no index').toEqual(indexes)
      expect(db.prepare('SELECT id, handle, retired FROM agents ORDER BY id').all(), 'and no handle').toEqual(bearers)
    } finally {
      db.close()
    }
  })
})

// ============================================================ 10. a freed legacy handle and the key

describe('10. a new agent under a retired legacy agent’s handle, which is that agent’s id', () => {
  let t: TestDb
  let app: FastifyInstance
  let quill: Registered

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    // THE LEGACY AGENT: its id IS its handle, and it has retired.
    anAgentRow(t, { id: 'quill', handle: 'quill', name: 'Quill The Legacy', retired: true })
    quill = await register(app, { handle: 'quill', name: 'Quill The New', role: 'worker' })
  }, 120_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('makes the new agent, with an id of its own', () => {
    expect(quill.id).not.toBe('quill')
    expect(quill.key).not.toBeNull()
  })

  it('lets the new agent write under its handle when it sends its key', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('quill', quill.key!),
      payload: { kind: 'note', title: 'Written by the new quill with its key', data: { body: 'hello' } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    // THE CHANGE LOG MARKS NO DIFFERENT HOLDER: the key proved the very agent the header named.
    const proved = t.client.sqlite
      .prepare("SELECT proved_holder AS provedHolder FROM changes WHERE record_id = ? AND op = 'create'")
      .all(id) as { provedHolder: string | null }[]
    expect(proved.length).toBeGreaterThan(0)
    expect(proved.every((one) => one.provedHolder === null), JSON.stringify(proved)).toBe(true)
  })

  it('refuses the same request with no key, naming both agents and the id to send', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('quill'),
      payload: { kind: 'note', title: 'Written with the bare name', data: { body: 'hello' } },
    })
    expect(made.statusCode, made.body).toBe(409)
    expect(made.body).toContain('names two agents')
    expect(made.body).toContain('Quill The Legacy')
    expect(made.body).toContain('Quill The New')
    expect(made.body).toContain(quill.id)
  })
})

// ============================================================ 11. the readers that met two rows

describe('11. the readers that meet a retired and a live agent under one handle', () => {
  let t: TestDb
  let app: FastifyInstance

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('files a notebook for a retired secretary whose handle no live agent bears', async () => {
    const sec = await register(app, { handle: 'nb-sec', name: 'Notebook Secretary', role: 'secretary' })
    expect((await retire(app, sec.id, 'handed over')).code).toBe(200)
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: NOTEBOOK_KIND, title: 'The retired secretary’s notebook', data: { agentHandle: 'nb-sec', entries: [] } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
  })

  it('lets the live secretary write served, where a retired worker bore the same handle first', async () => {
    const worker = await register(app, { handle: 'hon', name: 'Hon The Worker', role: 'worker' })
    expect((await retire(app, worker.id, 'moved on')).code).toBe(200)
    await register(app, { handle: 'hon', name: 'Hon The Secretary', role: 'secretary' })
    const run = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'session', title: 'a run the secretary reads', data: { state: 'running', runtime: 'dsh' } },
    })
    expect(run.statusCode, run.body).toBe(201)
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${(run.json() as { record: { id: string } }).record.id}`,
      headers: asAgent('hon'),
      payload: {
        dataPatch: {
          served: {
            model: 'read-by-hand',
            temperature: 'not reported',
            briefBytes: 'not reported',
            contextTokens: { largestTurn: 'not reported', total: 'not reported' },
          },
        },
      },
    })
    expect(reply.statusCode, reply.body).toBe(200)
  })

  it('maps an unmapped record onto the live row at start-up, and onto none where two retired rows could be meant', async () => {
    const migration = await import('../src/server/db/participants-migration.ts')
    // THE PAIR: a retired row and a live one under `pair`, and a record of `pair` nothing has mapped.
    anAgentRow(t, { id: 'PairOld00001', handle: 'pair', name: 'Pair Retired', retired: true })
    anAgentRow(t, { id: 'PairNew00002', handle: 'pair', name: 'Pair Live' })
    // THE TWO RETIRED: two retired rows under `both`, no live one, and a record of `both`.
    anAgentRow(t, { id: 'BothOld00001', handle: 'both', name: 'Both One', retired: true })
    anAgentRow(t, { id: 'BothOld00002', handle: 'both', name: 'Both Two', retired: true })
    // A RECORD NOTHING HAS MAPPED. The record door maps as it writes, and for `both` it mints a row of
    // its own, so the mapping and any row it minted are taken back out: the state a record written
    // before the registry existed is in.
    const written = new Set(['PairOld00001', 'PairNew00002', 'BothOld00001', 'BothOld00002'])
    const unmapped = (handle: string, state: string): string => {
      const id = t.api.createRecord({
        workspaceId: 'default',
        kind: 'agent',
        title: `A record of ${handle}`,
        data: { handle, state },
        actor: { type: 'human', id: THE_PERSON },
      }).id
      const minted = (t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(id) as { id: string }).id
      t.client.sqlite.prepare('DELETE FROM agent_records WHERE record_id = ?').run(id)
      if (!written.has(minted)) t.client.sqlite.prepare('DELETE FROM agents WHERE id = ?').run(minted)
      return id
    }
    const pairRecord = unmapped('pair', 'active')
    const bothRecord = unmapped('both', 'retired')

    const report = migration.migrateParticipants(t.client.sqlite)
    const mappedTo = (record: string): unknown =>
      (t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record) as { id: string } | undefined)?.id ?? null
    expect(mappedTo(pairRecord), 'the live row').toBe('PairNew00002')
    expect(mappedTo(bothRecord), 'no row at all').toBeNull()
    expect(report.couldBeEither).toEqual([{ handle: 'both', recordIds: [bothRecord], rows: ['BothOld00001', 'BothOld00002'] }])
    expect(migration.describeParticipants(report)).toContain('nothing says which of them the record is')
    expect(rowsBearing(t, 'both'), 'and no row was written for it').toHaveLength(2)
  })

  it('sends mail for a shared handle in one project to the live record', async () => {
    const inbox = await import('../src/server/lib/inbox.ts')
    const first = await register(app, { handle: 'mail', name: 'Mail The First', role: 'worker' })
    expect((await retire(app, first.id, 'done')).code).toBe(200)
    const second = await register(app, { handle: 'mail', name: 'Mail The Second', role: 'worker' })
    expect(inbox.agentByHandle('mail', 'default')?.id, 'the live record').toBe(second.record)
  })

  it('reads a request log row by the exact agent id, and a handle two agents bear as nobody', async () => {
    const usage = await import('../src/server/lib/usage-agents.ts')
    const first = await register(app, { handle: 'tally', name: 'Tally The First', role: 'worker', runtime: 'claude-code' })
    expect((await retire(app, first.id, 'done')).code).toBe(200)
    const second = await register(app, { handle: 'tally', name: 'Tally The Second', role: 'worker', runtime: 'codex' })
    const call = t.client.sqlite.prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES (?, ?, 'GET', 200, 1, 'agent', ?, ?, 'default', 'none')",
    )
    const now = Date.now()
    call.run('call-by-id', now, second.id, 'a-run-by-id')
    call.run('call-by-name', now, 'tally', 'a-run-by-name')
    const arrivals = usage.agentUsage(now - 60_000, null).arrivals
    const bySession = new Map(arrivals.map((one) => [one.sessionId, one.adaptedTool]))
    expect(bySession.get('a-run-by-id'), 'the exact id answers').toBe('codex')
    expect(bySession.get('a-run-by-name'), 'a handle two agents bear answers nobody').toBeNull()
  })
})

// ============================================================ 12. the handle doors and the key

describe('12. the handle doors, for a new agent under a retired legacy agent’s handle', () => {
  let t: TestDb
  let app: FastifyInstance
  let quill: Registered
  let plain: Registered
  let quillsSession = ''
  let plainsSession = ''

  /** A session record for a hold to name. */
  function aSession(title: string): string {
    return t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', doing: title },
      actor: { type: 'human', id: THE_PERSON },
    }).id
  }

  async function door(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    payload?: unknown,
  ): Promise<{ code: number; body: string }> {
    const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { code: reply.statusCode, body: reply.body }
  }

  /** The refusal the resolver gives for the shared string: it names both agents and the id to send. */
  function isTheTwoAgentRefusal(said: { code: number; body: string }): void {
    expect(said.code, said.body).toBe(409)
    expect(said.body).toContain('names two agents')
    expect(said.body).toContain('Quill The Legacy')
    expect(said.body).toContain('Quill The New')
    expect(said.body).toContain(quill.id)
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    // THE LEGACY AGENT: its id IS its handle, and it has retired.
    anAgentRow(t, { id: 'quill', handle: 'quill', name: 'Quill The Legacy', retired: true })
    quill = await register(app, { handle: 'quill', name: 'Quill The New', role: 'worker' })
    // AN ORDINARY AGENT, whose handle names nobody else.
    plain = await register(app, { handle: 'plain', name: 'Plain', role: 'worker' })
    quillsSession = aSession('the new quill at work')
    plainsSession = aSession('plain at work')
  }, 120_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('holds its handle with its key, and the hold is its own', async () => {
    const held = await door('POST', '/api/handles/quill/hold', asAgent('quill', quill.key!), {
      session: quillsSession,
      machine: 'a-machine',
      runtime: 'claude-code',
    })
    expect(held.code, held.body).toBe(201)
    const rows = t.client.sqlite.prepare('SELECT agent_id AS agentId FROM handle_holds WHERE session_record_id = ?').all(quillsSession)
    expect(rows).toEqual([{ agentId: quill.id }])
  })

  it('reads its waiting list, and the one-handle read, with its key', async () => {
    const waiting = await door('GET', '/api/handles/quill/waiting', asAgent('quill', quill.key!))
    expect(waiting.code, waiting.body).toBe(200)
    const one = await door('GET', '/api/handles/quill', asAgent('quill', quill.key!))
    expect(one.code, one.body).toBe(200)
    expect((JSON.parse(one.body) as { handle: string }).handle).toBe('quill')
  })

  it('beats its hold with its key', async () => {
    const beat = await door('POST', '/api/handles/quill/beat', asAgent('quill', quill.key!), { session: quillsSession })
    expect(beat.code, beat.body).toBe(200)
  })

  it('reaches the took door’s own check with its key, rather than the name refusal', async () => {
    const took = await door('POST', '/api/handles/quill/took', asAgent('quill', quill.key!), {
      session: quillsSession,
      message: 'no-such-message',
    })
    expect(took.body, 'the name was settled by the key').not.toContain('names two agents')
    expect(took.code).not.toBe(201)
  })

  it('reaches the process door’s own checks with its key, rather than the name refusal', async () => {
    const recorded = await door('POST', '/api/handles/quill/process', asAgent('quill', quill.key!), {
      session: quillsSession,
      pid: 1,
      pidStartedAt: 'not a time',
    })
    expect(recorded.body, 'the name was settled by the key').not.toContain('names two agents')
    expect(recorded.code).not.toBe(201)
  })

  it('is refused at every handle door without its key, naming both agents and the id to send', async () => {
    const bare = asAgent('quill')
    isTheTwoAgentRefusal(await door('GET', '/api/handles/quill/waiting', bare))
    isTheTwoAgentRefusal(await door('GET', '/api/handles/quill', bare))
    isTheTwoAgentRefusal(await door('POST', '/api/handles/quill/hold', bare, { session: quillsSession, machine: 'a-machine', runtime: 'claude-code' }))
    isTheTwoAgentRefusal(await door('POST', '/api/handles/quill/beat', bare, { session: quillsSession }))
    isTheTwoAgentRefusal(await door('POST', '/api/handles/quill/release', bare, { session: quillsSession, because: 'x' }))
  })

  it('lets its hold go with its key', async () => {
    const gone = await door('POST', '/api/handles/quill/release', asAgent('quill', quill.key!), {
      session: quillsSession,
      because: 'the waiter stopped',
    })
    expect(gone.code, gone.body).toBe(200)
  })

  it('leaves an ordinary agent holding its handle with its key and without one, as before', async () => {
    for (const headers of [asAgent('plain', plain.key!), asAgent('plain')]) {
      const held = await door('POST', '/api/handles/plain/hold', headers, { session: plainsSession, machine: 'a-machine', runtime: 'claude-code' })
      expect(held.code, held.body).toBe(201)
      expect((await door('GET', '/api/handles/plain/waiting', headers)).code).toBe(200)
      expect((await door('POST', '/api/handles/plain/beat', headers, { session: plainsSession })).code).toBe(200)
      const gone = await door('POST', '/api/handles/plain/release', headers, { session: plainsSession, because: 'done' })
      expect(gone.code, gone.body).toBe(200)
    }
    const rows = t.client.sqlite.prepare('SELECT DISTINCT agent_id AS agentId FROM handle_holds WHERE session_record_id = ?').all(plainsSession)
    expect(rows).toEqual([{ agentId: plain.id }])
  })
})
