// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The probability cell migration adds two nullable columns and leaves every existing casting empty. */
import { describe, expect, it } from 'vitest'

import { readCastingProbability } from '../src/shared/casting.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { MIGRATIONS, columnNames, journal, partialMigrations, scratch } from './migration-fixtures.ts'

const TAG = '0268_casting_probability_cell'

describe('migration 0268 adds the Casting probability cell', () => {
  it('leaves every existing row empty, and the strict reader answers null', () => {
    const entries = journal(MIGRATIONS)
    const index = entries.findIndex((entry) => entry.tag === TAG)
    if (index <= 0) throw new Error(`drizzle/meta/_journal.json has no migration tagged ${TAG}`)

    const s = scratch('0268-casting-probability')
    migrateInPlace(s.db, partialMigrations(index))
    const insert = s.db.prepare(
      'INSERT INTO casting_rows (role, project, marked, changed_at, changed_by_kind, changed_by_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
    insert.run('worker', '', 1, '2026-10-01 10:00:00', 'human', 'probability-migration-test')
    insert.run('secretary', 'sample-project', 1, '2026-10-01 10:01:00', 'human', 'probability-migration-test')
    migrateInPlace(s.db, partialMigrations(index + 1))

    expect(columnNames(s.db, 'casting_rows')).toContain('probability')
    expect(columnNames(s.db, 'casting_rows')).toContain('probability_from')
    const rows = s.db
      .prepare('SELECT probability, probability_from FROM casting_rows ORDER BY role, project')
      .all() as { probability: string | null; probability_from: string | null }[]
    expect(rows).toEqual([
      { probability: null, probability_from: null },
      { probability: null, probability_from: null },
    ])
    expect(rows.map((row) => readCastingProbability(row.probability))).toEqual([null, null])
  })
})
