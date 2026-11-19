// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The six established planning pages, captured before their declarations move. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { freshDb } from './helpers.ts'

const pages = ['plan.md', 'plans.md', 'counters.md', 'intents.md', 'recurring.md', 'windows.md'] as const
const fixture = join(process.cwd(), 'tests/fixtures/planning-archive-before-split')

it('keeps the planning archive pages byte for byte, including the one-project view', async () => {
  const t = await freshDb()
  const whole = mkdtempSync(join(tmpdir(), 'planning-whole-'))
  const scoped = mkdtempSync(join(tmpdir(), 'planning-project-'))
  try {
    const db = t.client.sqlite
    const stamp = '2026-08-12 10:00:00'
    db.prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('second', 'Second project', stamp, stamp)
    const rec = db.prepare("INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, 'note', ?, '{}', ?, ?)")
    rec.run('work-a', 'default', 'fixture-owner', 'First work', stamp, stamp)
    rec.run('work-b', 'second', 'fixture-owner', 'Second work', stamp, stamp)
    const alloc = db.prepare("INSERT INTO allocations (id, horizon, period, record_id, planned_hours, created_at, updated_at, created_by) VALUES (?, 'week', ?, ?, ?, ?, ?, 'human:fixture')")
    alloc.run('z-alloc', '2026-W33', 'work-b', 2, stamp, stamp)
    alloc.run('a-alloc', '2026-W32', 'work-a', null, stamp, stamp)
    db.prepare("INSERT INTO planning_capacity (horizon, period, hours, note, updated_at, updated_by) VALUES ('week', '2026-W33', 12, 'capacity', ?, 'human:fixture')").run(stamp)
    db.prepare("INSERT INTO plans (id, title, state, created_at, updated_at, created_by) VALUES ('plan-one', 'Two projects', 'open', ?, ?, 'human:fixture')").run(stamp, stamp)
    const line = db.prepare("INSERT INTO plan_lines (id, plan_id, position, text, record_id, updated_at, updated_by) VALUES (?, 'plan-one', ?, ?, ?, ?, 'human:fixture')")
    line.run('line-z', 2, 'Second line', 'work-b', stamp)
    line.run('line-a', 1, 'First line', 'work-a', stamp)
    db.prepare("INSERT INTO plan_line_revisions (id, plan_id, line_id, seq, op, reason, changed_by, at) VALUES ('revision-one', 'plan-one', 'line-a', 1, 'added', 'A reason', 'human:fixture', ?)").run(stamp)
    db.prepare("INSERT INTO planning_intents (id, said, record_id, state, created_at, created_by) VALUES ('intent-one', 'Words exactly', 'work-b', 'kept', ?, 'human:fixture')").run(stamp)
    db.prepare("INSERT INTO planning_recurrences (id, record_id, every, created_at, updated_at, created_by) VALUES ('recurrence-one', 'work-a', 'weekly', ?, ?, 'human:fixture')").run(stamp, stamp)
    db.prepare("INSERT INTO work_windows (id, record_id, starts_on, ends_on, state, created_at, updated_at, created_by) VALUES ('window-one', 'work-b', '2026-08-12', '2026-08-15', 'planned', ?, ?, 'human:fixture')").run(stamp, stamp)
    db.prepare("INSERT INTO counter_rows (id, workspace_id, counter_id, seq, what, at, count, because) VALUES ('counter-one', 'second', 'work-b', 1, 'addition', ?, 2, 'A count')").run(stamp)
    const { writeExport } = await import('../src/server/lib/export.ts')
    writeExport(whole)
    writeExport(scoped, { workspaceId: 'default' })
    for (const [scope, root] of [['whole', whole], ['scoped', scoped]]) {
      for (const page of pages) {
        expect(readFileSync(join(root!, page)), `${scope}/${page}`).toEqual(readFileSync(join(fixture, scope!, page)))
      }
    }
    // A stale managed file is pruned while the old pages remain present and unchanged.
    mkdirSync(join(whole, 'schema-parts'), { recursive: true })
    const stale = join(whole, 'schema-parts', 'allocations.md')
    writeFileSync(stale, 'stale copy')
    writeExport(whole)
    expect(existsSync(stale)).toBe(false)
    for (const page of pages) expect(readFileSync(join(whole, page))).toEqual(readFileSync(join(fixture, 'whole', page)))

  } finally {
    t.close()
    rmSync(whole, { recursive: true, force: true })
    rmSync(scoped, { recursive: true, force: true })
  }
}, 30000)
