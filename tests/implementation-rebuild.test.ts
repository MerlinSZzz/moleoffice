// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REBUILD NEVER TOUCHES AN AUTHORED ROW, AND IT REPLACES EVERY DERIVED ONE.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLAIM
 * ---------------------------------------------------------------------------------------
 *
 * `implementation_map` is what a person or an agent stated. `implementation_findings` is what a
 * resolver worked out. A rebuild reads the first and writes the second, and the mutation this file
 * exists to survive is having the rebuild clear both tables: count the map before and after, and it
 * must be identical.
 *
 * That is the half of L's rule that runs the other way from A.4's — *"let deterministic mappings
 * silently overwrite Agent judgment;"* — and the mechanism against it is that `rebuildRepository`
 * holds no statement that could write that table. This test is what says so out loud, because a
 * mechanism nobody drove is a claim.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT A REBUILD SAYS ABOUT PATTERNS THAT BROKE, AND THAT WERE REPAIRED
 * ---------------------------------------------------------------------------------------
 *
 * `wentStale` and `cameBack`. The second is not symmetry for its own sake: a rename breaks a
 * pattern and somebody fixes it, and a rebuild that only reported breakage would never say the
 * repair landed — the person would go on seeing an alarm they had already cleared.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type Implementation = typeof import('../src/server/lib/implementation.ts')
type Repositories = typeof import('../src/server/lib/repositories.ts')

let t: TestDb
let map: Implementation
let repos: Repositories
const madeDirs: string[] = []

const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.name, stated: true } as const

beforeEach(async () => {
  t = await freshDb()
  map = await import('../src/server/lib/implementation.ts')
  repos = await import('../src/server/lib/repositories.ts')
})

afterEach(() => {
  t.close()
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A throwaway checkout. Keys are repository-relative paths. */
function tree(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-rebuild-')))
  madeDirs.push(dir)
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

/** A repository, a module, and one stated pattern over the module's own file. */
function aRepositoryWith(files: Record<string, string>): { repositoryId: string; moduleId: string; root: string } {
  const root = tree(files)
  const repositoryId = repos.registerRepository({ workspaceId: 'default', name: 'panelx', root, actor: PERSON }).id
  const moduleId = t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'the write path',
    actor: PERSON,
  }).id
  return { repositoryId, moduleId, root }
}

describe('a rebuild reads the map and cannot write it', () => {
  // THE CONTROL. "the map is unchanged" is trivially true of a rebuild that did nothing at all, so
  // the rebuild is shown doing its own job first: it indexes files and writes findings.
  it('indexes the tree and writes what the resolver worked out', () => {
    const { repositoryId, moduleId } = aRepositoryWith({
      'src/owned.ts': "import './helper.ts'\n",
      'src/helper.ts': 'export const a = 1\n',
    })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/owned.ts',
      actor: PERSON,
    })
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.fileCount).toBe(2)
    expect(out.firstBuild).toBe(true)
    expect(out.findingsWritten).toBe(1)
    const findings = map.findingsFor(moduleId, 'default')
    expect(findings[0]?.path).toBe('src/helper.ts')
    expect(findings[0]?.provenance).toBe('imports')
    expect(findings[0]?.authority).toBe('computed')
    expect(findings[0]?.evidencePath).toBe('src/owned.ts')
  })

  it('leaves implementation_map identical across a rebuild', () => {
    const { repositoryId, moduleId } = aRepositoryWith({
      'src/owned.ts': "import './helper.ts'\n",
      'src/helper.ts': 'export const a = 1\n',
    })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/owned.ts',
      actor: PERSON,
    })
    const rows = () =>
      t.client.sqlite.prepare('SELECT id, pattern, provenance, stated_by, deleted_at FROM implementation_map ORDER BY id').all()
    const before = JSON.stringify(rows())
    map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(JSON.stringify(rows())).toBe(before)
  })

  it('replaces every finding whole, so nothing survives from an older build', () => {
    const { repositoryId, moduleId, root } = aRepositoryWith({
      'src/owned.ts': "import './helper.ts'\n",
      'src/helper.ts': 'export const a = 1\n',
    })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/owned.ts',
      actor: PERSON,
    })
    const first = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(map.findingsFor(moduleId, 'default').length).toBe(1)
    // The import goes away. The finding it produced has to go with it, and a finding is not
    // soft-deleted or kept: the table is rebuilt whole, which is what makes built_at mean anything.
    writeFileSync(join(root, 'src/owned.ts'), 'export const b = 2\n')
    const second = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(map.findingsFor(moduleId, 'default')).toEqual([])
    expect(second.builtAt >= first.builtAt).toBe(true)
    expect(second.firstBuild).toBe(false)
  })

  it('never proposes an owner for a file a stated pattern already covers', () => {
    const { repositoryId, moduleId } = aRepositoryWith({
      'src/owned.ts': "import './helper.ts'\n",
      'src/helper.ts': 'export const a = 1\n',
    })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src',
      actor: PERSON,
    })
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.findingsWritten).toBe(0)
  })

  it("does not let an agent's un-accepted guess cover a file for the resolver", () => {
    // A guessed row is not ownership, so it must not stop the resolver asking the question. If it
    // did, one agent's proposal would silently switch off the candidate read for that file.
    const { repositoryId, moduleId } = aRepositoryWith({
      'src/owned.ts': "import './helper.ts'\n",
      'src/helper.ts': 'export const a = 1\n',
    })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/owned.ts',
      actor: PERSON,
    })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/helper.ts',
      proposing: true,
      actor: { type: 'agent', id: 'claude-code' },
    })
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.findingsWritten).toBe(1)
  })
})

describe('what a rebuild says about the patterns people wrote', () => {
  it('reports one that matched before and matches nothing now', () => {
    const { repositoryId, moduleId, root } = aRepositoryWith({ 'src/a.ts': 'export const a = 1\n' })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: PERSON,
    })
    map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    rmSync(join(root, 'src/a.ts'))
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 2\n')
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.wentStale.map((r) => r.pattern)).toEqual(['src/a.ts'])
    expect(out.cameBack).toEqual([])
    // NOTHING WAS DELETED. A stale row keeps its words, its author and its date.
    expect(map.statedFor(moduleId, 'default').length).toBe(1)
  })

  it('reports one that was broken and is repaired, so the alarm can be cleared', () => {
    const { repositoryId, moduleId, root } = aRepositoryWith({ 'src/a.ts': 'export const a = 1\n' })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/moved.ts',
      actor: PERSON,
    })
    map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    writeFileSync(join(root, 'src/moved.ts'), 'export const c = 3\n')
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.cameBack.map((r) => r.pattern)).toEqual(['src/moved.ts'])
  })

  it('reports neither after a re-point, because there is nothing of this tree to compare against', () => {
    const { repositoryId, moduleId } = aRepositoryWith({ 'src/a.ts': 'export const a = 1\n' })
    map.declareRelationship({
      workspaceId: 'default',
      recordId: moduleId,
      repositoryId,
      pattern: 'src/a.ts',
      actor: PERSON,
    })
    map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    const elsewhere = tree({ 'lib/other.ts': 'export const d = 4\n' })
    repos.updateRepository({ id: repositoryId, workspaceId: 'default', root: elsewhere, actor: PERSON })
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.firstBuild).toBe(true)
    expect(out.wentStale).toEqual([])
    expect(out.cameBack).toEqual([])
    expect(out.note).toContain('nothing of this tree to compare against')
  })

  it('refuses a repository with no checkout on this machine, in those words', () => {
    const repository = repos.registerRepository({ workspaceId: 'default', name: 'calibration', actor: PERSON })
    expect(() => map.rebuildRepository({ workspaceId: 'default', repositoryId: repository.id, actor: PERSON })).toThrow(
      /no checkout on this machine/,
    )
  })

  it('says which resolvers ran and which had nothing to read', () => {
    const { repositoryId } = aRepositoryWith({ 'notes.md': 'no imports here\n' })
    const out = map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: PERSON })
    expect(out.resolvers.length).toBe(1)
    expect(out.resolvers[0]?.provenance).toBe('imports')
    expect(out.resolvers[0]?.ran).toBe(false)
    expect(out.resolvers[0]?.note).toContain('Nothing here for it to read')
  })
})
