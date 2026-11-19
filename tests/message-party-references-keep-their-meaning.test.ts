// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Stored references and delivery order retain their meaning when their parties are read as a set. */
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

it('keeps exact ids, ambiguous and retired names, aliases, routing and delivery order in a set read', async () => {
  const { thePartiesOfMany } = await import('../src/server/lib/messages.ts')
  const db = t.client.sqlite
  const addAgent = db.prepare('INSERT INTO agents (id, handle, name, created_at, avatar_asset_id) SELECT ?, ?, ?, ?, avatar_asset_id FROM agents LIMIT 1')
  const retire = db.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE id = ?')
  const addMessage = db.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) VALUES (?, 'default', ?, ?, ?, 'message', 'A message', NULL, ?, NULL, 'fixture')")
  const person = { kind: 'person' as const, id: THE_PERSON }
  const ref = (id: string) => ({ kind: 'agent' as const, id })
  const put = (data: Record<string, unknown>): string => {
    const id = randomUUID()
    addMessage.run(id, THE_PERSON, '2026-09-01 12:00:00', '2026-09-01 12:00:00', JSON.stringify(data))
    return id
  }
  const shared = randomUUID(), retired = randomUUID(), live = randomUUID()
  addAgent.run(retired, shared, 'A retired agent', '2026-09-01 10:00:00')
  retire.run('2026-09-01 11:00:00', retired)
  addAgent.run(live, shared, 'A live agent', '2026-09-01 10:01:00')
  const exact = randomUUID(), other = randomUUID()
  addAgent.run(exact, randomUUID(), 'An exact identity', '2026-09-01 10:02:00')
  addAgent.run(other, exact, 'Another agent', '2026-09-01 10:03:00')
  const oldOnly = randomUUID(), oldHandle = randomUUID()
  addAgent.run(oldOnly, oldHandle, 'An earlier agent', '2026-09-01 10:04:00')
  retire.run('2026-09-01 11:00:00', oldOnly)
  const alias = randomUUID()
  db.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', ?, ?)").run(alias, exact)

  const ambiguousMessage = put({ sentBy: ref(shared) })
  const exactMessage = put({ sentBy: ref(exact) })
  const retiredMessage = put({ sentBy: ref(oldHandle) })
  const aliasMessage = put({ sentBy: ref(alias) })
  const missing = randomUUID(), missingMessage = put({ sentBy: ref(missing) })
  const routedMessage = put({ sentBy: person, routed: [{ for: ref(other), because: 'A route.', line: 'A summary.', to: ref(exact), passedOver: [], inSummary: 'a-summary' }] })
  const delivery = db.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)")
  delivery.run(randomUUID(), routedMessage, oldOnly, '2026-09-01 11:01:00')
  delivery.run(randomUUID(), routedMessage, live, '2026-09-01 11:00:00')
  const messages = [ambiguousMessage, exactMessage, retiredMessage, aliasMessage, missingMessage, routedMessage]
  const parties = thePartiesOfMany(messages)
  expect(parties.get(ambiguousMessage)).toEqual([])
  expect(parties.get(exactMessage)).toEqual([ref(exact)])
  expect(parties.get(retiredMessage)).toEqual([ref(oldOnly)])
  expect(parties.get(aliasMessage)).toEqual([ref(exact)])
  expect(parties.get(missingMessage)).toEqual([ref(missing)])
  expect(parties.get(routedMessage)).toEqual([person, ref(live), ref(oldOnly), ref(exact)])
  const one = counted(() => thePartiesOfMany([exactMessage]))
  const many = counted(() => thePartiesOfMany([exactMessage, retiredMessage, aliasMessage]))
  expect(many.value.get(exactMessage)).toEqual(one.value.get(exactMessage))
  expect(many.statements, 'distinct stored spellings do not each add reads').toBe(one.statements)
})
