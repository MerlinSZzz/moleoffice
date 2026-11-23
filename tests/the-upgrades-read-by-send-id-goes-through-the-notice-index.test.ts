// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READ OF AN UPGRADE NOTICE BY ITS SEND ID GOES THROUGH THE INDEX OF FIRST UPGRADE NOTICES.
 *
 * `GET /api/office/upgrades?sendId=` asks `lookupDataFolderMoveNotice` first and `lookupStableUpgradeNotice` after it.
 * The first of those named no index, and SQLite's plan for it was `SEARCH revisions USING INDEX
 * revisions_kind_workspace_seq_idx (kind=?)`: it read every revision of every message. Filing a data-folder move notice
 * made the same read and two more like it. Each now names migration 0301's index and its WHERE, as the reads of
 * src/server/lib/stable-upgrade-notices.ts already did.
 *
 * This file files a made-up data-folder move, its BEFORE and its AFTER, through the server library, as
 * tests/the-data-folder-move-sends-a-notice-first.test.ts does. It asks again for an AFTER the BEFORE already has, and
 * it asks both lookups for a send id nobody used. It keeps every statement those calls ran that reads an upgrade event
 * from the revisions, and reads SQLite's plan of each with the values it ran with. Mole Office never runs ANALYZE, so
 * the plan does not depend on how many rows the table holds, and a small database is enough.
 *
 * It also holds that the reads still find what they found before: the BEFORE and the AFTER are found by their send
 * ids, a send id nobody used finds nothing, and a second AFTER for the same BEFORE is refused.
 *
 * WHAT IT DOES NOT CATCH. How long the door takes on a large table: the timing group times that, in
 * tests/the-upgrades-read-by-send-id-answers-within-100-ms-at-a-large-size.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** The index migration 0301 makes, under the name src/server/db/stored-fields.ts gives it. */
const INDEX = 'revisions_first_upgrade_notice_idx'

/** One read of an upgrade event from the revisions: its statement and the values it ran with. */
type Kept = { statement: string; values: unknown[] }

let t: TestDb
const kept: Kept[] = []
const found: Record<string, unknown> = {}
const wanted: Record<string, unknown> = {}
let refused: unknown = null

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, statement: string) {
    const prepared = prepare.call(this, statement)
    if (!/\bFROM revisions\b/.test(statement) || !statement.includes('$.extra.stableUpgradeNotice')) return prepared
    for (const method of ['all', 'get'] as const) {
      const run = prepared[method] as (...values: unknown[]) => unknown
      prepared[method] = function (this: unknown, ...values: unknown[]) {
        kept.push({ statement, values })
        return run.apply(this, values)
      }
    }
    return prepared
  }
  try {
    const actor = (handle: string, role: string) => {
      t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up ' + handle, data: { handle, runtime: 'codex', state: 'active' }, actor: t.api.HUMAN })
      const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as { id: string }
      t.client.sqlite.prepare('UPDATE agents SET role=? WHERE id=?').run(role, id)
      const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up notice run', data: { servingAgent: id, state: 'running' }, actor: t.api.HUMAN })
      return { type: 'agent' as const, id, provedBy: 'an-agent-key' as const, keyHolder: id, sessionId: run.id }
    }
    const writer = actor('index-notice-writer', 'worker'), secretary = actor('index-notice-secretary', 'secretary')
    const { readTheRoleCards } = await import('../src/server/lib/roles.ts'); readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
    const scope = { version: 1 as const, action: 'stop-to-move-the-data-folder' as const, database: '/fixture/checkout/data/invented.db',
      checkout: '/fixture/checkout', port: 29991, targetFolder: '/fixture/private-data', targetMode: '700' as const, backup: { path: '/fixture/backup.db', sha256: Buffer.alloc(32, 7).toString('base64') } }
    const words = 'Made-up owner approves ' + JSON.stringify(scope), title = 'Made-up move approval'
    const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
    const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: message.id, because: words, extra: { stableBootstrapStop: scope } }, actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + message.id, when: localStamp(new Date()), for: [title] } } })
    const decisionPin = { id: decision.id, seq: 1, contentHash: (t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id=? AND seq=1').get(decision.id) as { content_hash: string }).content_hash }
    const server = await import('../src/server/lib/stable-bootstrap-authority.ts'), shared = await import('../src/shared/stable-bootstrap-notices.ts')
    const notices = await import('../src/server/lib/stable-upgrade-notices.ts')
    const request = { scope, decision: decisionPin, sendId: 'made-up-index-move' }
    const reserved = server.reserveDataFolderMoveAuthority('default', request, writer)
    const before = { kind: 'data-folder-move', stage: 'before', sendId: 'made-up-index-before', announcement: { scope, decision: decisionPin, reservation: reserved.reservation, evidence: decisionPin, moveSendId: request.sendId, notice: shared.dataFolderMoveBeforeText(scope) } }
    const identity = (database: string) => () => ({ database, repository: scope.checkout, port: scope.port, commit: 'a'.repeat(40) })
    const beforeReceipt = server.fileDataFolderMoveNotice('default', before, writer, identity(scope.database))
    server.reserveDataFolderMoveAuthority('default', { ...request, reservation: reserved.reservation, outcome: 'moved' }, writer)
    const targetDatabase = scope.targetFolder + '/' + scope.database.split('/').at(-1)
    const after = { kind: 'data-folder-move', stage: 'after', sendId: 'made-up-index-after', before: beforeReceipt.original, outcome: { state: 'moved', database: targetDatabase } }
    const afterReceipt = server.fileDataFolderMoveNotice('default', after, writer, identity(targetDatabase))
    try { server.fileDataFolderMoveNotice('default', { ...after, sendId: 'made-up-index-after-again' }, writer, identity(targetDatabase)) } catch (error) { refused = error }

    found['the BEFORE by its send id'] = server.lookupDataFolderMoveNotice('default', before.sendId, writer)?.notice.original ?? null
    wanted['the BEFORE by its send id'] = beforeReceipt.original
    found['the AFTER by its send id'] = server.lookupDataFolderMoveNotice('default', after.sendId, writer)?.notice.original ?? null
    wanted['the AFTER by its send id'] = afterReceipt.original
    // The door's two lookups, in its order, for a send id nobody used.
    found['a move notice nobody sent'] = server.lookupDataFolderMoveNotice('default', 'made-up-send-id-nobody-used', writer)
    wanted['a move notice nobody sent'] = null
    found['an upgrade notice nobody sent'] = notices.lookupStableUpgradeNotice('default', 'made-up-send-id-nobody-used', writer)
    wanted['an upgrade notice nobody sent'] = { notice: null }
  } finally {
    sqlite.prepare = prepare
  }
}, 60_000)

afterAll(() => {
  t?.close()
})

describe('the reads of an upgrade notice by its send id', () => {
  it('find what the move filed, find nothing for a send id nobody used, and refuse a second AFTER', () => {
    expect(found).toEqual(wanted)
    expect(refused, 'a second AFTER for the same BEFORE').toMatchObject({ code: 'dataMoveNoticeRefused' })
  })

  it('each read the revisions through the index of first upgrade notices, in the plan SQLite makes for it', () => {
    const statements = new Map(kept.map(one => [one.statement, one.values]))
    // The move lookup, the read of its send id before a notice is filed, the read of an AFTER by its BEFORE, and the
    // upgrade lookup's read are four statements at least.
    expect(statements.size, 'the statements that read an upgrade event from the revisions').toBeGreaterThanOrEqual(4)
    const misread: { statement: string; plan: string[] }[] = []
    for (const [statement, values] of statements) {
      const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement}`).all(...values) as { detail: string }[]).map(row => row.detail)
      const alias = /\bFROM revisions (?!INDEXED\b|WHERE\b)(\w+)/.exec(statement)?.[1] ?? 'revisions'
      const reads = plan.filter(line => new RegExp(`^(SCAN|SEARCH) ${alias}\\b`).test(line))
      if (reads.length === 0 || reads.some(line => !line.includes(`USING INDEX ${INDEX}`))) misread.push({ statement, plan })
    }
    expect(misread, 'the reads whose plan does not go through the index').toEqual([])
  })
})
