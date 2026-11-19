// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTORE KEEPS THE ORDER THE CHANGE LOG WAS APPENDED IN. Problem BhszTJsVC8rF, migration 0194.
 *
 * "What has changed since I last looked" counts the change rows placed after the row a reader's
 * anchor sits on. The order was SQLite's rowid, which an archive does not carry, so a restore gave a
 * reader who had read everything hundreds of rows as new. Now `changes.append_order` holds the order,
 * the archive carries it as `appendOrder`, and the importer writes it back.
 *
 * WHAT IS PROVED HERE
 *
 * 1. A change row gets the next place in the order whoever inserts it, and the anchor reading follows
 *    that place and not the stamp.
 * 2. Exported and imported into an empty database, the log comes back in the same order, and both
 *    readers get the same answer they had before.
 * 3. An archive written before 0194 carries no place. It still imports, and the plan says in words
 *    that the order was rebuilt, from the stamps, after the rows already stored.
 * 4. An archive whose places are taken in the database it goes into is placed after the stored rows,
 *    and the plan says so. A stored row keeps its own place whatever the archive says.
 *
 * THE FIXTURE BACK-DATES ROWS, as scripts/seed.ts does, so the order by stamp and the order by
 * append are different orders. Without that, a restore that rebuilt the order from the stamps would
 * pass case 2 by luck.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

const open: TestDb[] = []
const folders: string[] = []

afterEach(() => {
  for (const t of open.splice(0)) t.close()
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function database(): Promise<TestDb> {
  const t = await freshDb()
  open.push(t)
  return t
}

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-append-order-'))
  folders.push(dir)
  return dir
}

/** The change log's ids in the order it was appended in. */
function inOrder(t: TestDb): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM changes ORDER BY append_order').all() as { id: string }[]).map((r) => r.id)
}

/**
 * A log whose append order is not its stamp order and not its id order, and two readers in it.
 *
 * Three rows are written in raw SQL, the way a migration writes them, with stamps that go BACK in
 * time as they are appended. The caught-up reader has read everything; the pinned one has read as
 * far as the second of the three.
 */
function fill(t: TestDb): { pinnedOn: string } {
  const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note the log is about', data: { body: 'x' }, actor: HUMAN })
  const add = t.client.sqlite.prepare(
    `INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, 'default', 'update', 'human', '${THE_TEST_OFFICES_OWNER.id}', 'data.body', 'x', 'y', ?)`,
  )
  add.run('zz-first-row', note.id, '2026-09-03 10:00:00')
  add.run('mm-second-row', note.id, '2026-09-02 10:00:00')
  add.run('aa-third-row', note.id, '2026-09-01 10:00:00')
  t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, 'default')
  t.api.moveAnchor('agent:claude-code', 'default', { lastChangeId: 'mm-second-row' })
  return { pinnedOn: 'mm-second-row' }
}

/** What each reader is told is new, as ids, so a difference names the rows. */
function readings(t: TestDb): Record<string, string[] | null> {
  const ids = (reader: string): string[] | null =>
    t.api.readingSinceAnchor(reader, 'default', { limit: 1000 }).changes?.map((c) => c.id).sort() ?? null
  return { [`human:${THE_TEST_OFFICES_OWNER.id}`]: ids(`human:${THE_TEST_OFFICES_OWNER.id}`), 'agent:claude-code': ids('agent:claude-code') }
}

async function exportFrom(): Promise<string> {
  const dir = folder()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  exportLib.writeExport(dir)
  return dir
}

/** Take every `appendOrder:` line out of the archive's change files, as an archive before 0194 reads. */
function withoutAppendOrder(archive: string): number {
  let taken = 0
  const changes = join(archive, 'changes')
  for (const name of readdirSync(changes)) {
    const path = join(changes, name)
    const lines = readFileSync(path, 'utf8').split('\n')
    const kept = lines.filter((line) => !line.startsWith('appendOrder:'))
    taken += lines.length - kept.length
    writeFileSync(path, kept.join('\n'))
  }
  return taken
}

// Each case builds one to three databases. The first database of the process, which loads the whole server's modules,
// is built in the hook at the top (wave 13t round 34); the limit is kept as it was.
describe('the change log keeps the order it was appended in', { timeout: 60_000 }, () => {
  it('numbers each new row after the last, and the reading follows that order and not the stamp', async () => {
    const t = await database()
    const { pinnedOn } = fill(t)
    const order = inOrder(t)
    expect(order.slice(-3)).toEqual(['zz-first-row', 'mm-second-row', 'aa-third-row'])
    const places = (t.client.sqlite.prepare('SELECT append_order AS n FROM changes ORDER BY rowid').all() as { n: number }[]).map((r) => r.n)
    expect(places).toEqual(places.map((_, i) => i + 1))
    // The row after the pinned one is older by its stamp and newer by its place, and it is new.
    const pinned = readings(t)['agent:claude-code']
    expect(pinned).toEqual(['aa-third-row'])
    expect(pinnedOn).toBe('mm-second-row')
    expect(readings(t)[`human:${THE_TEST_OFFICES_OWNER.id}`]).toEqual([])
  })

  it('comes back in the same order from an archive, and every reader is told the same', async () => {
    const origin = await database()
    fill(origin)
    const before = { order: inOrder(origin), readings: readings(origin) }
    const archive = await exportFrom()
    expect(readFileSync(join(archive, 'changes', '2026-09-01.md'), 'utf8')).toMatch(/^appendOrder: \d+$/m)

    const restored = await database()
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const report = importLib.applyImport(archive)
    expect(report.notes.join('\n')).not.toMatch(/REBUILT|cannot keep the place/)
    expect(inOrder(restored)).toEqual(before.order)
    expect(readings(restored)).toEqual(before.readings)
    // AND SQLITE'S OWN ROWID ORDER, which some readers still use, came back the same.
    const byRowid = (restored.client.sqlite.prepare('SELECT id FROM changes ORDER BY rowid').all() as { id: string }[]).map((r) => r.id)
    expect(byRowid).toEqual(before.order)
    // A row written after the restore goes after every restored row.
    restored.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Written after the restore', data: { body: 'z' }, actor: HUMAN })
    expect(inOrder(restored).slice(0, -1)).toEqual(before.order)
  })

  it('imports an archive written before the column, and says the order was rebuilt', async () => {
    const origin = await database()
    fill(origin)
    const archive = await exportFrom()
    expect(withoutAppendOrder(archive)).toBeGreaterThan(3)

    const restored = await database()
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = importLib.planImport(archive)
    expect(plan.refusals).toEqual([])
    const said = plan.notes.find((note) => note.includes('carry no appendOrder line'))
    expect(said, plan.notes.join('\n')).toBeDefined()
    expect(said).toMatch(/it was REBUILT/)
    expect(said).toMatch(/may show a reader rows they had already seen/)
    importLib.applyImport(archive)
    // Rebuilt from the stamps: the three back-dated rows now come first, oldest stamp first.
    expect(inOrder(restored).slice(0, 3)).toEqual(['aa-third-row', 'mm-second-row', 'zz-first-row'])
  })

  it('places an archive after the rows already stored when its places are taken, and says so', async () => {
    const origin = await database()
    fill(origin)
    const archive = await exportFrom()

    const other = await database()
    other.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Already here', data: { body: 'a' }, actor: HUMAN })
    const stored = inOrder(other)
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const report = importLib.applyImport(archive)
    const said = report.notes.find((note) => note.includes('cannot keep the place in the order'))
    expect(said, report.notes.join('\n')).toBeDefined()
    const now = inOrder(other)
    expect(now.slice(0, stored.length)).toEqual(stored)
    expect(now.slice(-3)).toEqual(['zz-first-row', 'mm-second-row', 'aa-third-row'])

    // Applied again, every row is stored already and keeps its place, although the archive gives
    // each of them a different one.
    const again = importLib.applyImport(archive)
    expect(again.notes.join('\n')).toMatch(/Each keeps its stored place/)
    expect(inOrder(other)).toEqual(now)
  })

  it('refuses two rows of an archive at one place', async () => {
    const origin = await database()
    fill(origin)
    const archive = await exportFrom()
    const path = join(archive, 'changes', '2026-09-01.md')
    const text = readFileSync(path, 'utf8')
    const place = /^appendOrder: (\d+)$/m.exec(text)?.[1]
    expect(place).toBeDefined()
    const second = join(archive, 'changes', '2026-09-02.md')
    writeFileSync(second, readFileSync(second, 'utf8').replace(/^appendOrder: \d+$/m, `appendOrder: ${String(place)}`))

    await database()
    const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
    const plan = importLib.planImport(archive)
    expect(plan.refusals.map((r) => r.problem).join('\n')).toMatch(new RegExp(`changes.appendOrder ${String(place)} is also given`))
  })
})
