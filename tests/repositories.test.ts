// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE REPOSITORY PER CHECKOUT, NOT ONE PER PROJECT — AND WHAT A RE-POINT THROWS AWAY.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE THAT DECIDES THE FIRST HALF
 * ---------------------------------------------------------------------------------------
 *
 * Two `source_index` rows, one root. Under the draft this file replaces — "for each workspace that
 * has a source_index row, insert one repositories row" — that mints TWO repositories for one
 * directory on disk, every finding resolves against whichever row the caller's workspace happened
 * to pick, and the two halves of one map never meet. The assertion is `1`, and the mutation the
 * comment on `repositoriesFromIndexes` names is keying on the workspace, which turns it into `2`.
 *
 * That corpus is not hypothetical: the 24 August isolated copy of the owner's database holds
 * exactly it — `default` with 242 files from 10 August and `panelx` with 1,155 files built
 * 2026-08-24 19:43, one root — because a measuring session ran a rebuild inside the copy under a
 * different workspace id. It took one command.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE SECOND HALF IS ABOUT WHAT SURVIVES A POINTER MOVING
 * ---------------------------------------------------------------------------------------
 *
 * Re-pointing a root deletes every derived row of the tree it is leaving and touches nothing
 * anybody stated. Both directions are asserted, because getting either wrong is silent: keeping the
 * derived rows draws suggested files from a checkout nobody is looking at any more, beside an index
 * age of three minutes; deleting the stated ones throws away sentences people typed.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

type Repositories = typeof import('../src/server/lib/repositories.ts')

let t: TestDb
let repos: Repositories
const madeDirs: string[] = []

const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.name, stated: true } as const

beforeEach(async () => {
  t = await freshDb()
  repos = await import('../src/server/lib/repositories.ts')
})

afterEach(() => {
  t.close()
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function aDirectory(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-repo-')))
  madeDirs.push(dir)
  return dir
}

// ============================================================ one row per root

describe('one repository per distinct root', () => {
  // THE CONTROL. Every assertion below counts rows out of the grouping, and a grouping that
  // returned nothing at all would satisfy "not two". So the ordinary case is asserted first: two
  // roots really do give two repositories.
  it('gives two repositories for two roots', () => {
    const minted = repos.repositoriesFromIndexes([
      { workspaceId: 'default', root: '/a/panelx', builtAt: '2026-08-10 22:15:53' },
      { workspaceId: 'robotics', root: '/a/calibration', builtAt: '2026-08-11 09:00:00' },
    ])
    expect(minted.length).toBe(2)
    expect(minted.map((m) => m.name)).toEqual(['calibration', 'panelx'])
  })

  it('gives ONE repository with two workspace pointers for two rows with one root', () => {
    const minted = repos.repositoriesFromIndexes([
      { workspaceId: 'default', root: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, builtAt: '2026-08-10 22:15:53' },
      { workspaceId: 'panelx', root: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, builtAt: '2026-08-24 19:43:00' },
    ])
    expect(minted.length).toBe(1)
    expect(minted[0]?.pointedAtBy).toEqual(['default', 'panelx'])
    expect(minted[0]?.note).toContain('2 projects pointed')
    expect(minted[0]?.note).toContain('one repository with two pointers')
  })

  it('belongs to the workspace that indexed it first, whatever order the rows arrive in', () => {
    const rows = [
      { workspaceId: 'panelx', root: '/one/tree', builtAt: '2026-08-24 19:43:00' },
      { workspaceId: 'default', root: '/one/tree', builtAt: '2026-08-10 22:15:53' },
    ]
    expect(repos.repositoriesFromIndexes(rows)[0]?.workspaceId).toBe('default')
    expect(repos.repositoriesFromIndexes([...rows].reverse())[0]?.workspaceId).toBe('default')
  })

  it('reads two spellings of one directory as one repository', () => {
    const minted = repos.repositoriesFromIndexes([
      { workspaceId: 'default', root: '/one/tree', builtAt: '2026-08-10 22:15:53' },
      { workspaceId: 'panelx', root: '/one/tree/', builtAt: '2026-08-11 22:15:53' },
    ])
    expect(minted.length).toBe(1)
  })
})

// ============================================================ registering

describe('registering one', () => {
  it('writes the row and one change row, and does not scan', () => {
    const root = aDirectory()
    const repo = repos.registerRepository({ workspaceId: 'default', name: 'panelx', root, actor: PERSON })
    expect(repo.name).toBe('panelx')
    expect(repo.root).toBe(root)
    expect(repos.listRepositories('default').map((r) => r.id)).toEqual([repo.id])
    // NOT SCANNED. A scan started by a write would make built_at mean "when somebody last saved a
    // form".
    expect(repos.everScanned(repo.id, 'default')).toBe(false)
    const change = t.client.sqlite
      .prepare('SELECT field, new_value FROM changes WHERE record_id = ?')
      .get(repo.id) as { field: string; new_value: string } | undefined
    expect(change?.field).toBe('repository')
    expect(change?.new_value).toBe('panelx')
  })

  it('takes a repository with no checkout on this machine, because that is a real answer', () => {
    const repo = repos.registerRepository({ workspaceId: 'default', name: 'calibration', actor: PERSON })
    expect(repo.root).toBeNull()
  })

  it('refuses a root that is not a directory, and does not fall back to the default', () => {
    expect(() =>
      repos.registerRepository({ workspaceId: 'default', name: 'firmware', root: '/no/such/place', actor: PERSON }),
    ).toThrow(/not a directory on this machine/)
    expect(repos.listRepositories('default')).toEqual([])
  })

  it('refuses a second repository with the same name, naming the first', () => {
    const first = repos.registerRepository({ workspaceId: 'default', name: 'firmware', actor: PERSON })
    expect(() => repos.registerRepository({ workspaceId: 'default', name: 'firmware', actor: PERSON })).toThrow(
      new RegExp(first.id),
    )
  })

  it('lets two projects each have a repository called firmware', () => {
    repos.registerRepository({ workspaceId: 'default', name: 'firmware', actor: PERSON })
    const other = repos.registerRepository({ workspaceId: 'panelx', name: 'firmware', actor: PERSON })
    expect(other.name).toBe('firmware')
  })
})

// ============================================================ re-pointing

describe('re-pointing a root', () => {
  /** A repository with an index and a finding hanging off it, the way a scanned one looks. */
  function scanned(): { id: string; root: string } {
    const root = aDirectory()
    const repo = repos.registerRepository({ workspaceId: 'default', name: 'panelx', root, actor: PERSON })
    t.client.sqlite
      .prepare(
        'INSERT INTO source_index (workspace_id, repository_id, built_at, built_by, root, scan_ms, skipped) ' +
          `VALUES ('default', ?, '2026-08-25 10:00:00', 'human:${THE_TEST_OFFICES_OWNER.name}', ?, 12, '[]')`,
      )
      .run(repo.id, root)
    t.client.sqlite
      .prepare(
        'INSERT INTO source_files (workspace_id, repository_id, path, language, size_bytes, lines, imports, exports, modified_at) ' +
          "VALUES ('default', ?, 'src/a.ts', 'typescript', 10, 1, '[]', '[]', '2026-08-25 10:00:00')",
      )
      .run(repo.id)
    t.client.sqlite
      .prepare(
        'INSERT INTO implementation_findings (id, workspace_id, record_id, repository_id, path, relation, provenance, evidence_path, evidence_detail, built_at) ' +
          "VALUES ('f1', 'default', 'rec1', ?, 'src/a.ts', 'implements', 'imports', 'src/b.ts', './a.ts', '2026-08-25 10:00:00')",
      )
      .run(repo.id)
    return { id: repo.id, root }
  }

  it('deletes everything derived from the tree it is leaving', () => {
    const repo = scanned()
    const to = aDirectory()
    const out = repos.updateRepository({ id: repo.id, workspaceId: 'default', root: to, actor: PERSON })
    expect(out.repository.root).toBe(to)
    expect(out.wasRoot).toBe(repo.root)
    expect(out.droppedIndexFiles).toBe(1)
    expect(out.droppedFindings).toBe(1)
    expect(repos.everScanned(repo.id, 'default')).toBe(false)
    expect(out.note).toContain('first build')
  })

  it('touches nothing anybody stated', () => {
    const repo = scanned()
    const record = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'a module',
      actor: PERSON,
    })
    t.client.sqlite
      .prepare(
        'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, stated_at, stated_by) ' +
          `VALUES ('m1', 'default', ?, ?, 'src/a.ts', 'implements', 'declared', '2026-08-25 10:00:00', 'human:${THE_TEST_OFFICES_OWNER.name}')`,
      )
      .run(record.id, repo.id)
    repos.updateRepository({ id: repo.id, workspaceId: 'default', root: aDirectory(), actor: PERSON })
    const left = t.client.sqlite.prepare('SELECT count(*) AS c FROM implementation_map').get() as { c: number }
    expect(left.c).toBe(1)
  })

  it('refuses an agent once the repository has been scanned', () => {
    const repo = scanned()
    expect(() =>
      repos.updateRepository({ id: repo.id, workspaceId: 'default', root: aDirectory(), actor: AGENT }),
    ).toThrow(/came from agent/)
    // NOTHING WAS WRITTEN, which is what the refusal says.
    expect(repos.repositoryById(repo.id, 'default')?.root).toBe(repo.root)
    expect(repos.everScanned(repo.id, 'default')).toBe(true)
  })

  it('lets an agent re-point one that has never been scanned, because there is nothing to throw away', () => {
    const repo = repos.registerRepository({ workspaceId: 'default', name: 'calibration', actor: PERSON })
    const to = aDirectory()
    const out = repos.updateRepository({ id: repo.id, workspaceId: 'default', root: to, actor: AGENT })
    expect(out.repository.root).toBe(to)
  })

  it('renames without touching anything derived', () => {
    const repo = scanned()
    const out = repos.updateRepository({ id: repo.id, workspaceId: 'default', name: 'mole-office-two', actor: PERSON })
    expect(out.repository.name).toBe('mole-office-two')
    expect(out.droppedIndexFiles).toBe(0)
    expect(repos.everScanned(repo.id, 'default')).toBe(true)
  })
})

// ============================================================ deleting

describe('deleting one', () => {
  it('is refused while a relationship somebody stated names it', () => {
    const root = aDirectory()
    const repo = repos.registerRepository({ workspaceId: 'default', name: 'panelx', root, actor: PERSON })
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'a module', actor: PERSON })
    t.client.sqlite
      .prepare(
        'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, stated_at, stated_by) ' +
          `VALUES ('m1', 'default', ?, ?, 'src/a.ts', 'implements', 'declared', '2026-08-25 10:00:00', 'human:${THE_TEST_OFFICES_OWNER.name}')`,
      )
      .run(record.id, repo.id)
    expect(() => repos.deleteRepository(repo.id, 'default', PERSON)).toThrow(/1 relationship/)
  })

  it('is NOT blocked by derived rows, which go with it', () => {
    const root = aDirectory()
    const repo = repos.registerRepository({ workspaceId: 'default', name: 'panelx', root, actor: PERSON })
    t.client.sqlite
      .prepare(
        'INSERT INTO implementation_findings (id, workspace_id, record_id, repository_id, path, relation, provenance, evidence_path, evidence_detail, built_at) ' +
          "VALUES ('f1', 'default', 'rec1', ?, 'src/a.ts', 'implements', 'imports', 'src/b.ts', './a.ts', '2026-08-25 10:00:00')",
      )
      .run(repo.id)
    repos.deleteRepository(repo.id, 'default', PERSON)
    expect(repos.listRepositories('default')).toEqual([])
    const left = t.client.sqlite.prepare('SELECT count(*) AS c FROM implementation_findings').get() as { c: number }
    expect(left.c).toBe(0)
  })
})
