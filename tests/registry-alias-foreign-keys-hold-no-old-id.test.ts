// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SIX AGENT-KEYED TABLES CANNOT HOLD AN AGENT'S OLD REGISTRY ID, so their readers do not follow aliases (item 30c, part
 * 2b-4). agent_records, handle_holds, resident_sleeps, resident_read_grants, resident_void_marks and
 * resident_space_writes name an agent by a foreign key to agents.id, and foreign keys are on in every connection the
 * office opens. An old id is filed in registry_aliases and has no agents row, so the database refuses a row that names
 * it. A reader of these tables asks by the canonical id and finds every row there is.
 *
 * This holds while an agent's id is never changed in place. If a re-mint changes agents.id, these rows must either be
 * rewritten with it or be read through the aliases; that is not decided here.
 *
 * Every agent, alias and row here is made up, in a throwaway office.
 *
 * MUTATIONS, after a control run: turn foreign keys off where the office opens its database, and every case goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { inventedRegistry } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

// The fixture's live agent, and an old id of it that this file files as an alias.
const live = 'CanonicalB2'
const liveOldId = 'old-id-of-the-live-agent'
const when = '2026-10-29 10:00:00'

/** Each row, written with the agent's id in `agentId`. */
const rows: { site: string; write: (agentId: string, serial: number) => void }[] = [
  { site: 'agent_records.agent_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`made-up-record-${serial}`, agentId) },
  { site: 'handle_holds.agent_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-hold-${serial}`, agentId, 'made-up-session', 'made-up-machine', 'claude-code', when, when, when) },
  { site: 'resident_sleeps.agent_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES (?, ?, ?, ?, ?, ?)').run(`made-up-sleep-${serial}`, agentId, 'slept', when, 'agent', live) },
  { site: 'resident_read_grants.resident_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-${serial}`, agentId, live, '2026-11-30', when, 'agent', live) },
  { site: 'resident_read_grants.reader_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-${serial}`, live, agentId, '2026-11-30', when, 'agent', live) },
  { site: 'resident_void_marks.resident_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-mark-${serial}`, agentId, `made-up-path-${serial}`, 'Made-up reason', when, 'agent', live) },
  { site: 'resident_space_writes.resident_id', write: (agentId, serial) => t.client.sqlite.prepare('INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-write-${serial}`, agentId, 'made-up-path', 1, 'made-up-hash', when, 'agent', live) },
]

describe('the agent-keyed tables with a foreign key to the registry', () => {
  for (const one of rows) {
    it(`refuses ${one.site} under an old id, and keeps it under the canonical id`, async () => {
      const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
      fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: liveOldId, canonicalId: live }])
      expect(() => one.write(live, 1)).not.toThrow()
      expect(() => one.write(liveOldId, 2)).toThrow(expect.objectContaining({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }))
    })
  }
})
