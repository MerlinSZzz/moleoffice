// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A message's parties are the same when many messages are read together, without a query per group or sender. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
  t = await freshDb()
})
afterAll(() => { t.close(); vi.useRealTimers() })

function counted<T>(work: () => T): { value: T; statements: number } {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const originals = new Map<string, Run>()
  let statements = 0
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const original = proto[method]!
    originals.set(method, original)
    proto[method] = function (...params: unknown[]) { statements++; return original.apply(this, params) }
  }
  try { return { value: work(), statements } }
  finally { for (const [method, original] of originals) proto[method] = original }
}

it('answers each party the same while its statement count stays fixed as distinct groups and senders grow', async () => {
  const { openAGroup } = await import('../src/server/lib/groups.ts')
  const { thePartiesOfMany, theMessagesThisReaderMayRead } = await import('../src/server/lib/messages.ts')
  const db = t.client.sqlite
  const owner = { kind: 'person' as const, id: THE_PERSON }
  const addAgent = db.prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
  const addMessage = db.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) VALUES (?, 'default', ?, ?, ?, 'message', 'A message', NULL, ?, NULL, 'fixture')")
  const readerId = randomUUID()
  addAgent.run(readerId, randomUUID(), 'A reader', '2026-09-01 12:00:00')
  const reader = { readsEveryMessage: false as const, who: { kind: 'agent' as const, id: readerId } }
  const ids: string[] = []
  for (let i = 0; i < 8; i++) {
    const sender = randomUUID(), handle = randomUUID(), id = randomUUID()
    addAgent.run(sender, handle, 'A sender', '2026-09-01 12:00:00')
    const group = openAGroup({ workspaceId: 'default', name: 'A group', openedBy: owner, because: 'To talk.', members: [{ who: { kind: 'agent', id: sender }, because: 'To talk.' }] })
    addMessage.run(id, THE_PERSON, '2026-09-01 12:00:00', '2026-09-01 12:00:00', JSON.stringify({ sentBy: { kind: 'agent', id: handle }, toGroup: group.id }))
    ids.push(id)
  }
  // A reader who left or joined after a message was sent is not made a party by current membership.
  const makeMemberMessage = (joined: string, left: string | null): string => {
    const group = openAGroup({ workspaceId: 'default', name: 'A group', openedBy: owner, because: 'To talk.', members: [{ who: reader.who, because: 'To talk.' }] })
    db.prepare('UPDATE group_members SET joined_at = ?, left_at = ? WHERE group_id = ? AND member_id = ?').run(joined, left, group.id, readerId)
    const id = randomUUID()
    addMessage.run(id, THE_PERSON, '2026-09-01 12:00:00', '2026-09-01 12:00:00', JSON.stringify({ sentBy: owner, toGroup: group.id }))
    return id
  }
  const active = makeMemberMessage('2026-09-01 11:00:00', null)
  const leftBefore = makeMemberMessage('2026-09-01 11:00:00', '2026-09-01 11:59:00')
  const joinedAfter = makeMemberMessage('2026-09-01 12:01:00', null)
  const direct = randomUUID(), other = randomUUID()
  addAgent.run(other, randomUUID(), 'Another reader', '2026-09-01 12:00:00')
  addMessage.run(direct, THE_PERSON, '2026-09-01 12:00:00', '2026-09-01 12:00:00', JSON.stringify({ sentBy: owner }))
  db.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)").run(randomUUID(), direct, other, '2026-09-01 12:00:00')
  const visible = theMessagesThisReaderMayRead(reader, [active, leftBefore, joinedAfter, direct])
  expect(visible.has(active), 'the current member may read its message').toBe(true)
  expect(visible.has(leftBefore), 'the reader who left before sending may not read it').toBe(false)
  expect(visible.has(joinedAfter), 'the reader who joined after sending may not read it').toBe(false)
  expect(visible.has(direct), 'a message delivered to somebody else is hidden').toBe(false)

  // A damaged alias unrelated to the requested names must not make this read fail. A message that
  // actually names that damaged alias must still be refused by the same stored-reference rule.
  const alias = randomUUID(), goodAlias = randomUUID(), damaged = randomUUID()
  const insertAlias = db.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', ?, ?)")
  insertAlias.run(alias, readerId)
  insertAlias.run(goodAlias, readerId)
  db.exec('DROP TRIGGER registry_aliases_immutable_update; PRAGMA foreign_keys = OFF')
  db.prepare('UPDATE registry_aliases SET canonical_id = ? WHERE alias_id = ?').run(goodAlias, alias)
  addMessage.run(damaged, THE_PERSON, '2026-09-01 12:00:00', '2026-09-01 12:00:00', JSON.stringify({ sentBy: { kind: 'agent', id: alias } }))
  expect(() => thePartiesOfMany([damaged])).toThrow('Registry aliases are invalid: a target is an alias rather than a canonical id.')
  expect(() => thePartiesOfMany([ids[0]!])).not.toThrow()

  const separate = ids.map((id) => [id, thePartiesOfMany([id]).get(id)] as const)
  const one = counted(() => thePartiesOfMany(ids.slice(0, 1)))
  const many = counted(() => thePartiesOfMany(ids))
  expect(many.value).toEqual(new Map(separate))
  expect(one.value).toEqual(new Map(separate.slice(0, 1)))
  expect(many.statements, 'one set read, not one read for each group and sender').toBe(one.statements)

  const { IDS_AT_ONCE } = await import('../src/server/db/in-pieces.ts')
  const missing = Array.from({ length: IDS_AT_ONCE + 1 }, () => randomUUID())
  // The existing message-row read uses one statement per IDS_AT_ONCE ids.
  expect(counted(() => thePartiesOfMany(missing)).statements).toBe(counted(() => thePartiesOfMany(missing.slice(0, 1))).statements + 1)

  const aliases = await import('../src/server/db/registry-aliases/index.ts')
  const batch = (aliases as unknown as { theRegistryRowsNamedBy: (connection: typeof t.client.sqlite, ids: readonly string[], columns: string) => Map<string, Record<string, unknown> | undefined> }).theRegistryRowsNamedBy
  const columns = 'agents.id AS id, agents.handle AS handle, agents.name AS name'
  const asked = [readerId, goodAlias, randomUUID()]
  expect(batch(db, asked, columns)).toEqual(new Map(asked.map(id => [id, aliases.theRegistryRowNamedBy(db, id, columns)])))
  const refusal = 'Registry aliases are invalid: a target is an alias rather than a canonical id.'
  expect(() => aliases.theRegistryRowNamedBy(db, alias, columns)).toThrow(refusal)
  expect(() => batch(db, [alias], columns)).toThrow(refusal)
  expect(() => batch(db, asked, columns)).not.toThrow()
})
