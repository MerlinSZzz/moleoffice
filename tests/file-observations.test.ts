// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ONE SCAN SAW ABOUT ONE FILE, KEPT — AND THE BOUNDARY IT MAY NOT CROSS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LEDGER EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `source_files`, `source_index` and `source_file_hashes` are DERIVED: a rebuild replaces every row.
 * The comparison a rebuild computes — added, removed, changed, with the content hash making
 * *changed* exact — is handed to whoever asked and is then unrecoverable. So a work domain accepted
 * on Tuesday could not ask on Friday what changed, because four scans had run in between and each
 * threw its predecessor away. `file_observations` is what each scan saw, appended and never rebuilt.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE BOUNDARY, WHICH IS THE HALF THAT NEEDS A TEST RATHER THAN A PROMISE
 * ---------------------------------------------------------------------------------------
 *
 * The owner's first named failure mode for this whole area is *build a second Git*. So the column
 * list is read out of `sqlite_master` and asserted to be exactly ten. No content, no diff, no
 * author, no parent, no branch, no message. The failure this catches is not somebody rewriting the
 * design — it is somebody adding `author` in a follow-up commit because it would be convenient, and
 * a comment saying not to would not have stopped them.
 *
 * ---------------------------------------------------------------------------------------
 * AND `first_scan`, WHICH IS THE ONE THAT FAILS SILENTLY
 * ---------------------------------------------------------------------------------------
 *
 * With no previous index, a rebuild reports one `added` row per file in the repository. That is a
 * true statement about what the index now holds and a FALSE statement about what changed. And it
 * recurs after any restore, because this table is authored and restored while the three index
 * tables are derived and are not. Without the flag, every open domain's drift read would report the
 * entire repository as outside its accepted domain and nothing would fail.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let workspace: string
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(() => {
  t.close()
})

beforeEach(() => {
  // Each case scans into its own project, so a first scan is really the first scan of that project.
  caseNumber += 1
  workspace = `file-observations-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: workspace, title: `File observations case ${String(caseNumber)}` })
})

/** The columns the design declares, in the order the migration wrote them. */
const THE_TEN = [
  'id',
  'workspace_id',
  'scan_id',
  'repository_id',
  'path',
  'change',
  'hash',
  'seen_at',
  'since',
  'first_scan',
]

function columnsOf(table: string): string[] {
  const rows = t.client.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.map((r) => r.name)
}

/** A throwaway checkout with two source files in it, so a real scan has something to see. */
function aCheckout(where: string, files: Record<string, string>): string {
  const root = join(t.file, '..', where)
  mkdirSync(join(root, 'src'), { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body, 'utf8')
  return root
}

describe('the ledger holds an observation and nothing that could rebuild a file', () => {
  it('has exactly the ten columns, and an eleventh fails this test rather than a review', () => {
    expect(columnsOf('file_observations')).toEqual(THE_TEN)
  })

  it('holds no column that could carry content, a diff, an author, a parent or a branch', () => {
    // Named one at a time, because the list above would still pass if somebody swapped a column for
    // one of these and kept the count at ten.
    const forbidden = ['content', 'body', 'text', 'diff', 'patch', 'author', 'committer', 'parent', 'branch', 'message']
    const held = columnsOf('file_observations')
    for (const name of forbidden) {
      expect(held, `file_observations must never carry "${name}"`).not.toContain(name)
    }
  })
})

describe('every rebuild fills it, because a hole in it reads as nothing changed', () => {
  it('writes a row per file on the first scan, and flags every one of them', async () => {
    const root = aCheckout('repo-one', {
      'src/a.ts': 'export const a = 1\n',
      'src/b.ts': 'export const b = 2\n',
    })
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    // The office is shared, so a reading of the whole ledger keeps its whole-table scope and this
    // case takes the rows that were not there when it began.
    const seenBefore = new Set(
      (t.client.sqlite.prepare('SELECT scan_id, path FROM file_observations').all() as { scan_id: string; path: string }[]).map(
        (r) => `${r.scan_id} ${r.path}`,
      ),
    )
    const out = rebuildIndex({ workspaceId: workspace, root })
    expect(out.report.firstScan).toBe(true)

    const rows = (
      t.client.sqlite
        .prepare('SELECT path, change, hash, seen_at, since, first_scan, repository_id, scan_id FROM file_observations ORDER BY path')
        .all() as { path: string; change: string; hash: string | null; seen_at: string; since: string | null; first_scan: number; repository_id: string | null; scan_id: string }[]
    )
      .filter((r) => !seenBefore.has(`${r.scan_id} ${r.path}`))
      .map(({ scan_id: _scanId, ...r }) => r)
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(rows.every((r) => r.change === 'added')).toBe(true)
    // THE FLAG. These rows are true observations of a real scan AND they are not evidence of
    // change, and the flag is the only column that can carry the difference.
    expect(rows.every((r) => r.first_scan === 1)).toBe(true)
    // NOTHING CAME BEFORE, so the window has no beginning and the row says so rather than
    // inventing one.
    expect(rows.every((r) => r.since === null)).toBe(true)
    expect(rows.every((r) => r.seen_at === out.builtAt)).toBe(true)
    // THE HASH IS THE CONTENT HASH AND NOT SOMETHING ELSE OF THE RIGHT SHAPE, asserted against the
    // index's own `source_file_hashes` row rather than against a length. A ledger storing the file's
    // SIZE here would look identical to this one and would report nothing at all the day a constant
    // is swapped for another of the same width — which is the exact failure the content hash exists
    // to catch, and the failure this whole ledger is built to answer.
    const indexHashes = new Map(
      (
        t.client.sqlite.prepare('SELECT path, hash FROM source_file_hashes').all() as {
          path: string
          hash: string
        }[]
      ).map((r) => [r.path, r.hash] as const),
    )
    for (const row of rows) expect(row.hash, row.path).toBe(indexHashes.get(row.path))
    // And the two files differ in content, so their hashes differ: a column holding one constant
    // for everything would pass the line above if the index held one too.
    expect(new Set(rows.map((r) => r.hash)).size).toBe(2)
    // AND NO REPOSITORY, because this rebuild scans one root for a whole workspace and mints no
    // repository id. Null here has one stated meaning and is not a stand-in for a repository.
    expect(rows.every((r) => r.repository_id === null)).toBe(true)
  })

  it('appends what the SECOND scan saw, with the window it is measured over', async () => {
    const root = aCheckout('repo-two', {
      'src/a.ts': 'export const a = 1\n',
      'src/b.ts': 'export const b = 2\n',
    })
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    const beforeCount = (t.client.sqlite.prepare('SELECT count(*) AS n FROM file_observations').get() as { n: number }).n
    const first = rebuildIndex({ workspaceId: workspace, root })

    // One file's CONTENT changes and its size does not. That is the case the content hash exists
    // for: the size, the line count and both lists are identical afterwards.
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 9\n', 'utf8')
    writeFileSync(join(root, 'src/c.ts'), 'export const c = 3\n', 'utf8')
    const second = rebuildIndex({ workspaceId: workspace, root })
    expect(second.report.firstScan).toBe(false)

    const rows = t.client.sqlite
      .prepare('SELECT path, change, since, first_scan FROM file_observations WHERE scan_id = ? ORDER BY path')
      .all(second.observed.scanId) as { path: string; change: string; since: string | null; first_scan: number }[]
    expect(rows).toEqual([
      { path: 'src/a.ts', change: 'changed', since: first.builtAt, first_scan: 0 },
      { path: 'src/c.ts', change: 'added', since: first.builtAt, first_scan: 0 },
    ])

    // A SCAN IS FOUND BY ITS ID AND NOT BY ITS STAMP, and that is measured rather than tidy: both
    // rebuilds in this test land inside one second, so `built_at` — a local wall-clock stamp to the
    // second — is the SAME STRING for both, and `since` on the second scan's rows equals its own
    // `seen_at`. A window written over stamps alone cannot separate two scans in one second, which
    // is why the reply that has to name a scan names `scan_id`.
    expect(second.builtAt === first.builtAt || second.builtAt > first.builtAt).toBe(true)

    // AND THE FIRST SCAN'S ROWS ARE STILL THERE. Nothing rebuilds this table, which is the whole
    // difference between it and the three it is computed from.
    const total = t.client.sqlite.prepare('SELECT count(*) AS n FROM file_observations').get() as { n: number }
    expect(total.n - beforeCount).toBe(4)
  })

  it('records a removal with no hash, because there is no content after it to hash', async () => {
    const root = aCheckout('repo-three', { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 2\n' })
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    rebuildIndex({ workspaceId: workspace, root })
    writeFileSync(join(root, 'src/b.ts'), '', 'utf8')
    const { unlinkSync } = await import('node:fs')
    unlinkSync(join(root, 'src/b.ts'))
    const second = rebuildIndex({ workspaceId: workspace, root })

    const row = t.client.sqlite
      .prepare("SELECT path, change, hash FROM file_observations WHERE scan_id = ? AND change = 'removed'")
      .get(second.observed.scanId) as { path: string; change: string; hash: string | null } | undefined
    expect(row?.path).toBe('src/b.ts')
    expect(row?.hash).toBeNull()
  })

  it('groups one rebuild’s rows under one scan id, so a scan can be named later', async () => {
    const root = aCheckout('repo-four', { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 2\n' })
    const seenBefore = new Set(
      (t.client.sqlite.prepare('SELECT DISTINCT scan_id FROM file_observations').all() as { scan_id: string }[]).map((r) => r.scan_id),
    )
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    rebuildIndex({ workspaceId: workspace, root })
    const ids = (t.client.sqlite.prepare('SELECT DISTINCT scan_id FROM file_observations').all() as { scan_id: string }[]).filter(
      (r) => !seenBefore.has(r.scan_id),
    )
    expect(ids).toHaveLength(1)
  })

  it('writes nothing when a rebuild saw no difference at all', async () => {
    const root = aCheckout('repo-five', { 'src/a.ts': 'export const a = 1\n' })
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    rebuildIndex({ workspaceId: workspace, root })
    const second = rebuildIndex({ workspaceId: workspace, root })
    const n = t.client.sqlite
      .prepare('SELECT count(*) AS n FROM file_observations WHERE scan_id = ?')
      .get(second.observed.scanId) as { n: number }
    expect(second.observed.rows).toBe(0)
    // AN EMPTY WINDOW IS A REAL ANSWER HERE and is not a hole: the scan ran, it is stamped in
    // `source_index`, and it saw nothing. The drift read distinguishes that from nobody looking by
    // reading the index's own stamp, not by counting rows in this table.
    expect(n.n).toBe(0)
  })
})
