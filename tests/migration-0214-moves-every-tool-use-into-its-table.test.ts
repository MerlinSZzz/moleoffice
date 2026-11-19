// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0231 MOVES EVERY RUN'S `data.toolUses` INTO `tool_uses`, IN ORDER, WITH NOTHING LOST (problem
 * mR8vNPOVNQ_p, wave 13s round 33).
 *
 * The data step is src/server/db/tool-uses-migration.ts, run by `migrateInPlace` with every other data step. A run
 * from before round 33 holds its uses as a list in `data.toolUses`, and its revisions and change rows hold that list
 * too. Here such runs are made on a throwaway database the way the use door made them then: the list on the record,
 * and a change row and a revision for it. Then:
 *
 *   1. `migrateInPlace` moves each list into rows, one per line, in the list's order, a deleted run's included. It
 *      counts the lists and the lines, and the rows it wrote equal the lines. Each run loses the key and nothing
 *      else, `updated_at` included. Each gets one change row and one revision as the office, and the revision names
 *      what the run now holds. Every revision and change row that was there before is still there, unchanged.
 *   2. A second run of the migration changes nothing.
 *   3. The step stops with nothing written on a list it cannot move faithfully: one on a record that is not a run,
 *      a line that is not {at, tool, said}, and a run that already has rows.
 *
 * MUTATION PROOFS, each after a control run, restored byte for byte, are in the report of round 33.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { moveToolUsesIntoTheirTable, REVISION_NOTE } from '../src/server/db/tool-uses-migration.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import type { ToolUse } from '../src/shared/toolset.ts'

const ACTOR = { type: 'agent', id: 'toolset-tester' } as const
const THE_OFFICE = 'mole-office/the-api-server'

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

const lines = (run: string, n: number): ToolUse[] =>
  Array.from({ length: n }, (_, i) => ({ at: `2026-10-0${String(1 + i)} 10:00:00`, tool: 'data-copy', said: `make: made-up use ${String(i + 1)} on ${run}` }))

interface Stored { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null; updated_at: string; workspace_id: string }

/**
 * Give a record a list in `data.toolUses` as the use door did before round 33: the list on the record, one change row
 * naming the whole list, and one revision holding what the record then held.
 */
function holdAList(id: string, list: unknown): void {
  const sql = t.client.sqlite
  sql.prepare("UPDATE records SET data = json_set(data, '$.toolUses', json(?)) WHERE id = ?").run(JSON.stringify(list), id)
  const row = sql.prepare('SELECT kind, title, summary, data, deleted_at, updated_at, workspace_id FROM records WHERE id = ?').get(id) as Stored
  const data = JSON.parse(row.data) as Record<string, unknown>
  const seq = ((sql.prepare('SELECT max(seq) AS seq FROM revisions WHERE record_id = ?').get(id) as { seq: number | null }).seq ?? 0) + 1
  sql
    .prepare(
      "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, ?, 'update', 'agent', 'toolset-tester', 'data.toolUses', NULL, ?, '2026-10-01 10:00:00')",
    )
    .run(`before-${id}`, id, row.workspace_id, JSON.stringify(list))
  sql
    .prepare(
      'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, actor_type, actor_id, at) ' +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'update', 'agent', 'toolset-tester', '2026-10-01 10:00:00')",
    )
    .run(`before-rev-${id}`, id, row.workspace_id, seq, versionOf(contentOf({ ...row, data, deletedAt: row.deleted_at })), row.kind, row.title, row.summary, row.data, row.deleted_at)
}

const aRun = (title: string): string => t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state: 'finished', doing: 'made up' }, actor: ACTOR }).id

function all(table: 'changes' | 'revisions' | 'tool_uses' | 'records'): Record<string, unknown>[] {
  return t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Record<string, unknown>[]
}

describe("migration 0231's data step", () => {
  it('1. moves every list into rows in order, and changes nothing else', () => {
    const first = aRun('A made-up run with three uses')
    const second = aRun('A made-up run with two uses, deleted')
    const none = aRun('A made-up run with no use')
    holdAList(first, lines('first', 3))
    holdAList(second, lines('second', 2))
    t.api.deleteRecord(second, ACTOR)
    const recordsBefore = new Map(all('records').map((r) => [r['id'], r]))
    const changesBefore = all('changes')
    const revisionsBefore = all('revisions')

    const outcome = migrateInPlace(t.client.sqlite)
    expect(outcome.toolUses).toEqual({ tableMissing: false, moved: [{ run: first, lines: 3 }, { run: second, lines: 2 }], linesFound: 5, rowsWritten: 5 })

    for (const [run, list] of [[first, lines('first', 3)], [second, lines('second', 2)]] as const) {
      const rows = t.client.sqlite.prepare('SELECT seq, at, tool, said, actor_type, actor_id, moved_at FROM tool_uses WHERE run_id = ? ORDER BY seq').all(run) as Record<string, unknown>[]
      expect(rows.map(({ at, tool, said }) => ({ at, tool, said }))).toEqual(list)
      expect(rows.map((r) => r['seq'])).toEqual(list.map((_, i) => i + 1))
      for (const r of rows) {
        expect(r['actor_type']).toBeNull()
        expect(r['actor_id']).toBeNull()
        expect(r['moved_at']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      }

      // THE RECORD LOST THE KEY AND NOTHING ELSE.
      const was = recordsBefore.get(run)!
      const is = all('records').find((r) => r['id'] === run)!
      const wasData = JSON.parse(was['data'] as string) as Record<string, unknown>
      delete wasData['toolUses']
      expect(JSON.parse(is['data'] as string)).toEqual(wasData)
      expect({ ...is, data: null }).toEqual({ ...was, data: null })

      // ONE CHANGE ROW AND ONE REVISION, AS THE OFFICE; THE REVISION NAMES WHAT THE RUN NOW HOLDS.
      const newChanges = all('changes').filter((c) => c['record_id'] === run && !changesBefore.some((b) => b['id'] === c['id']))
      expect(newChanges.map((c) => [c['field'], JSON.parse(c['old_value'] as string), c['new_value'], c['actor_id']])).toEqual([['data.toolUses', list, null, THE_OFFICE]])
      const newRevisions = all('revisions').filter((r) => r['record_id'] === run && !revisionsBefore.some((b) => b['id'] === r['id']))
      expect(newRevisions).toHaveLength(1)
      const revision = newRevisions[0]!
      expect([revision['actor_id'], revision['note']]).toEqual([THE_OFFICE, REVISION_NOTE])
      const newest = t.client.sqlite.prepare('SELECT id FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(run) as { id: string }
      expect(newest.id).toBe(revision['id'])
      const content = contentOf({ kind: is['kind'] as string, title: is['title'] as string, summary: is['summary'] as string | null, data: JSON.parse(is['data'] as string) as Record<string, unknown>, deletedAt: is['deleted_at'] as string | null })
      expect(revision['content_hash']).toBe(versionOf(content))
    }

    // THE RUN WITH NO LIST IS AS IT WAS, AND EVERY ROW FROM BEFORE IS STILL THERE, UNCHANGED.
    expect(all('records').find((r) => r['id'] === none)).toEqual(recordsBefore.get(none))
    expect(all('changes').slice(0, changesBefore.length)).toEqual(changesBefore)
    expect(all('revisions').slice(0, revisionsBefore.length)).toEqual(revisionsBefore)
    expect(all('changes')).toHaveLength(changesBefore.length + 2)
    expect(all('revisions')).toHaveLength(revisionsBefore.length + 2)
  })

  it('2. changes nothing when it runs a second time', () => {
    holdAList(aRun('A made-up run with one use'), lines('one', 1))
    migrateInPlace(t.client.sqlite)
    const before = (['records', 'changes', 'revisions', 'tool_uses'] as const).map(all)
    const again = migrateInPlace(t.client.sqlite)
    expect(again.toolUses).toEqual({ tableMissing: false, moved: [], linesFound: 0, rowsWritten: 0 })
    expect((['records', 'changes', 'revisions', 'tool_uses'] as const).map(all)).toEqual(before)
  })

  it('3. stops with nothing written on a list it cannot move faithfully', () => {
    const good = aRun('A made-up run whose list is fine')
    holdAList(good, lines('good', 2))
    const cases: { what: string; make: () => void; says: string }[] = [
      {
        what: 'a list on a record that is not a run',
        make: () => holdAList(t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A made-up note', data: {}, actor: ACTOR }).id, lines('note', 1)),
        says: 'is a note',
      },
      { what: 'a line that is not {at, tool, said}', make: () => holdAList(aRun('A made-up run with a broken line'), [{ at: '2026-10-01 10:00:00', tool: 'data-copy' }]), says: 'Line 1' },
      {
        what: 'a run that already has rows',
        make: () => {
          const run = aRun('A made-up run that already has a row')
          holdAList(run, lines('rows', 1))
          t.client.sqlite.prepare("INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said) VALUES ('already', 'default', ?, 1, '2026-10-01 10:00:00', 'data-copy', 'make: made up')").run(run)
        },
        says: 'already has rows',
      },
    ]
    for (const one of cases) {
      const fresh = t.client.sqlite.transaction(() => {
        one.make()
        const before = (['records', 'changes', 'revisions', 'tool_uses'] as const).map(all)
        expect(() => moveToolUsesIntoTheirTable(t.client.sqlite), one.what).toThrow(one.says)
        expect((['records', 'changes', 'revisions', 'tool_uses'] as const).map(all), one.what).toEqual(before)
        throw new Error('undo the case')
      })
      expect(fresh).toThrow('undo the case')
    }
    // With the broken cases gone, the good list moves.
    expect(moveToolUsesIntoTheirTable(t.client.sqlite).rowsWritten).toBe(2)
  })
})
