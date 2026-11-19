// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { journal, MIGRATIONS, migrationsBefore, partialMigrations, scratch } from './migration-fixtures.ts'

const TAG = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_a_run_token_names_its_kind'))?.tag
if (TAG === undefined) throw new Error('The migration journal holds no migration ending _a_run_token_names_its_kind.')
const BEFORE_0334 = migrationsBefore(TAG)
const RUN = 'a-made-up-run-before-the-kind'
const OLD_ROW = 'rt_madeUpBeforeKind000000'
const A_HASH = 'a-made-up-token-hash-before-the-kind'
const AT = 1_793_300_000_000
const TWELVE_HOURS = 12 * 60 * 60 * 1000
const indexColumns = (db: ReturnType<typeof scratch>['db'], name: string): string[] =>
  (db.prepare(`PRAGMA index_info("${name}")`).all() as { name: string }[]).map((one) => one.name)

/** A database at the migration before 0334, with one live row written the old way. */
function beforeTheKind() {
  const s = scratch('run-token-kind')
  migrateInPlace(s.db, partialMigrations(BEFORE_0334))
  s.db.prepare(
    "INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data) " +
      "VALUES (?, 'default', 'a-made-up-owner', '2026-11-10 00:00:00', '2026-11-10 00:00:00', 'session', 'Made-up run', '{\"state\":\"running\"}')",
  ).run(RUN)
  s.db.prepare(
    'INSERT INTO run_tokens (id, run_id, token_hash, allowed_pairs, spend_cap, spent, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(OLD_ROW, RUN, A_HASH, JSON.stringify([{ provider: 'deepseek', model: 'a-made-up-model' }]), 1, 0, AT, AT + TWELVE_HOURS)
  return s
}

/** One live row of a kind, written after 0334 with made-up values. */
function insertLive(db: ReturnType<typeof scratch>['db'], id: string, hash: string, kind: string): void {
  db.prepare(
    'INSERT INTO run_tokens (id, run_id, token_hash, allowed_pairs, spend_cap, spent, issued_at, expires_at, kind) ' +
      'VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
  ).run(id, RUN, hash, JSON.stringify([{ provider: 'deepseek', model: 'a-made-up-model' }]), 1, AT, AT + TWELVE_HOURS, kind)
}

describe('migration 0334', () => {
  it('backs a row written before it in as casting, and keeps the old values', () => {
    const s = beforeTheKind()
    // ONLY THE LIST UP TO 0334 IS APPLIED, so the count is 0334's own and a later migration does not change it.
    const outcome = migrateInPlace(s.db, partialMigrations(BEFORE_0334 + 1))
    expect(outcome.newlyApplied).toBe(1)
    const row = s.db.prepare('SELECT id, kind, token_hash, allowed_pairs, spend_cap, spent, issued_at, expires_at FROM run_tokens WHERE id = ?').get(OLD_ROW)
    expect(row).toEqual({
      id: OLD_ROW,
      kind: 'casting',
      token_hash: A_HASH,
      allowed_pairs: JSON.stringify([{ provider: 'deepseek', model: 'a-made-up-model' }]),
      spend_cap: 1,
      spent: 0,
      issued_at: AT,
      expires_at: AT + TWELVE_HOURS,
    })
    const column = (s.db.prepare('PRAGMA table_info("run_tokens")').all() as { name: string; type: string; notnull: number; dflt_value: string | null }[])
      .find((one) => one.name === 'kind')
    expect(column).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: "'casting'" })
  })

  it('makes the one-live index over the run and then the kind, so one of each may be live and a second of one kind is refused', () => {
    const s = beforeTheKind()
    migrateInPlace(s.db, MIGRATIONS)
    expect(indexColumns(s.db, 'run_tokens_current_idx')).toEqual(['run_id', 'kind'])
    insertLive(s.db, 'rt_madeUpLiveTool0000000', 'a-made-up-live-tool-hash', 'tool')
    expect(s.db.prepare('SELECT kind FROM run_tokens ORDER BY issued_at, rowid').all()).toEqual([{ kind: 'casting' }, { kind: 'tool' }])
    expect(() => insertLive(s.db, 'rt_madeUpSecondTool000000', 'a-made-up-second-tool-hash', 'tool')).toThrow(/UNIQUE/)
    expect(() => insertLive(s.db, 'rt_madeUpSecondCast000000', 'a-made-up-second-casting-hash', 'casting')).toThrow(/UNIQUE/)
    // A REVOKED ROW OF THE SAME KIND DOES NOT COUNT AS LIVE, so replacement can leave its history.
    s.db.prepare("UPDATE run_tokens SET revoked_at = ?, revoked_because = 'replaced' WHERE id = ?").run(AT + 1, OLD_ROW)
    insertLive(s.db, 'rt_madeUpNextCast00000000', 'a-made-up-next-casting-hash', 'casting')
    expect(s.db.prepare('SELECT kind, revoked_because FROM run_tokens ORDER BY kind, issued_at, rowid').all()).toEqual([
      { kind: 'casting', revoked_because: 'replaced' },
      { kind: 'casting', revoked_because: null },
      { kind: 'tool', revoked_because: null },
    ])
  })
})
