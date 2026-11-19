// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The derived layer: the scan, the storage, and the coverage queries that join the index to the
 * canonical module records.
 *
 * WHAT THESE TESTS ARE REALLY GUARDING. A source index is a thing you stop checking after the
 * first week — you read what it says and believe it. So the properties worth testing are not "it
 * found some files" but the ones whose failure would be INVISIBLE:
 *
 *   - a directory quietly missed by the ignore rules makes unclaimed code look clean
 *   - a half-written index after a failed scan reports plausible, wrong coverage
 *   - "src/web" silently claiming "src/webhooks.ts" gives a file an owner it does not have
 *   - a coverage query answering "nothing unclaimed" when the index was never built at all
 *   - an import read out of a COMMENT, which this codebase is full of, drawing a dependency edge
 *     that does not exist
 *
 * AND ONE MORE, which is why the last block exists. There used to be two implementations of this
 * scan — this file's subject and a copy inside src/server/api/source.ts — writing the same two
 * tables, so a column added to either would have broken the other on INSERT with nothing failing
 * at compile time. There is now one, and api/source.ts is routes over it. The last block is what
 * holds that: it proves the answers on the wire are the rows this file stored, so a scanner
 * growing back inside the route file shows up as a disagreement rather than as a second opinion.
 *
 * Most tests run against a fixture tree in a temporary directory, because a test that asserts
 * "125 files" breaks every time somebody adds one and teaches people to re-run it until it
 * passes. Two of them do scan the real repository, on purpose: that is where the scan meets a
 * .gitignore, 62 MB of screenshots and 900-line files with import statements in their comments.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { claimProblem } from '../src/shared/paths.ts'
import type { SourceFile, SourceIndexStamp } from '../src/shared/types.ts'
import { AGENT, freshDb, one, type TestDb } from './helpers.ts'

type SourceIndex = typeof import('../src/server/lib/sourceindex.ts')

let t: TestDb
let idx: SourceIndex
let map: typeof import('../src/server/lib/implementation.ts')
let repos: typeof import('../src/server/lib/repositories.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
const madeDirs: string[] = []

/**
 * EACH CASE GETS ITS OWN PROJECT, so a reading that answers for one project sees only the rows that
 * case wrote. The index, its status, the claims and the repositories are all keyed by project, so a
 * new one gives a case the empty starting state its subject needs without a new database.
 */
let WORKSPACE = 'default'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  // Imported AFTER freshDb, for the reason its own header gives: a top-level import would have
  // opened the wrong database before any test code ran.
  idx = await import('../src/server/lib/sourceindex.ts')
  map = await import('../src/server/lib/implementation.ts')
  repos = await import('../src/server/lib/repositories.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `index-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Source index case ${String(caseNumber)}` })
})

afterEach(() => {
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  t.close()
})

/** A throwaway directory tree. Keys are relative paths; a Buffer value writes raw bytes. */
function tree(files: Record<string, string | Buffer>): string {
  // realpathSync because a claim is matched against the scanned root as text. On a machine where
  // /tmp is a symlink the two spellings would never meet, and the failure would look like a bug
  // in the prefix rule rather than in the fixture.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-index-')))
  madeDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

/**
 * A module record, and one stated implementation-map row for each pattern it is given.
 *
 * THE CLAIMS ARE MAP ROWS, because that is what coverage reads: `claimsOf` in
 * src/server/lib/sourceindex.ts reads the stated rows `statedFor` returns. They go in through
 * `declareRelationship`, the function behind POST /api/implementation, in the project's one
 * repository. A pattern that door refuses — an absolute path, a backslash, a `..` — is written
 * straight into the table instead, the way the claims migration (src/server/db/module-claims.ts)
 * keeps such a pattern as it was written.
 */
function moduleClaiming(title: string, patterns: string[]) {
  const record = t.api.createRecord({ workspaceId: WORKSPACE,
    kind: 'module',
    title,
    data: { context: `why ${title} exists`, parts: [] },
    actor: AGENT,
  })
  const repositoryId = theRepository()
  for (const pattern of patterns) {
    if (claimProblem(pattern) === null) {
      map.declareRelationship({ workspaceId: WORKSPACE, recordId: record.id, repositoryId, pattern, actor: AGENT })
      continue
    }
    t.client.sqlite
      .prepare(
        'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, ' +
          "stated_at, stated_by) VALUES (?, ?, ?, ?, ?, 'implements', 'declared', '2026-09-25 00:00:00', " +
          "'system:module-claims-migration')",
      )
      .run(`row-${record.id}-${patterns.indexOf(pattern)}`, WORKSPACE, record.id, repositoryId, pattern)
  }
  return record
}

/** The project's one repository, registered on first use. No root: nothing here scans it. */
function theRepository(): string {
  const held = repos.listRepositories(WORKSPACE)[0]
  return held?.id ?? repos.registerRepository({ workspaceId: WORKSPACE, name: 'fixture', root: null, actor: AGENT }).id
}

/**
 * The project's one repository, registered with `root` as its checkout and scanned into its own slot.
 * A test that counts coverage calls this before it states a row, because coverage counts a registered
 * repository's rows against that repository's own scan and never against the workspace scan, which
 * records no repository (decision 0KSoGUNDF9ml).
 */
function theRepositoryScanned(root: string): void {
  const repositoryId = repos.registerRepository({ workspaceId: WORKSPACE, name: 'fixture', root, actor: AGENT }).id
  map.rebuildRepository({ workspaceId: WORKSPACE, repositoryId, actor: AGENT })
}

const paths = (files: readonly { path: string }[]) => files.map((f) => f.path)

// ================================================================================== the scan

describe('what a scan puts in the index', () => {
  it('records a row per source file with language, size, lines and modification time', () => {
    const root = tree({ 'src/a.ts': 'export const a = 1\n', 'src/web/App.tsx': 'export const App = 1\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })

    const file = idx.indexedFile('src/a.ts', WORKSPACE)
    expect(file?.language).toBe('typescript')
    expect(file?.sizeBytes).toBe(19)
    expect(file?.lines).toBe(1)
    // Local time, in the format every other table in this database uses.
    expect(file?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(idx.indexedFile('src/web/App.tsx', WORKSPACE)?.language).toBe('tsx')
  })

  it('keeps a sha256 of every file, which is what makes "changed" exact', () => {
    const root = tree({ 'a.ts': 'export const a = 1\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    const first = idx.storedHashes(WORKSPACE).get('a.ts')
    expect(first).toMatch(/^[0-9a-f]{64}$/)

    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(idx.storedHashes(WORKSPACE).get('a.ts')).toBe(first)

    // Same length, same line count, same imports and exports. Every other field says "unchanged".
    writeFileSync(join(root, 'a.ts'), 'export const a = 2\n')
    const outcome = idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(idx.storedHashes(WORKSPACE).get('a.ts')).not.toBe(first)
    expect(one(outcome.report.changed, 'changed file').what).toContain('contents changed, same size and shape')
  })

  it('counts a last line with no newline, and gives an empty file no lines at all', () => {
    const root = tree({ 'a.ts': 'one\ntwo', 'b.ts': 'one\ntwo\n', 'empty.ts': '' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(idx.indexedFile('a.ts', WORKSPACE)?.lines).toBe(2)
    expect(idx.indexedFile('b.ts', WORKSPACE)?.lines).toBe(2)
    expect(idx.indexedFile('empty.ts', WORKSPACE)?.lines).toBe(0)
  })

  it('indexes source text only, and says what else was there', () => {
    const root = tree({
      'a.ts': 'export const a = 1\n',
      'README.md': '# readme\n',
      'shot.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    })
    const scan = idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['a.ts'])
    // Counted, not dropped: a coverage figure over a set nobody can see cannot be argued with.
    expect(scan.skipped.join(' ')).toContain('1 .md, 1 .png')
  })

  it('never walks node_modules, dist, data, a dot directory or an underscore directory', () => {
    const root = tree({
      'keep.ts': 'export const k = 1\n',
      'node_modules/dep/index.js': 'module.exports = 1\n',
      'dist/bundle.js': 'console.log(1)\n',
      'data/scratch.ts': 'export const d = 1\n',
      '.git/hooks/pre-commit.sh': '#!/bin/sh\n',
      '_scratch/probe.ts': 'export const p = 1\n',
    })
    const scan = idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['keep.ts'])
    // Each skipped directory is named with its reason, because an unsearched place and an empty
    // one read identically otherwise.
    expect(scan.skipped.join(' ')).toContain('node_modules')
    expect(scan.skipped.join(' ')).toContain('installed dependencies')
  })

  it('honours a .gitignore, including a negation that rescues one file', () => {
    const root = tree({
      '.gitignore': '# comment\ngenerated.ts\nvendor/\n!vendor/keep.ts\n',
      'app.ts': 'export const a = 1\n',
      'generated.ts': 'export const g = 1\n',
      'vendor/lib.ts': 'export const v = 1\n',
      'vendor/keep.ts': 'export const k = 1\n',
    })
    const scan = idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    // vendor/keep.ts stays out because the DIRECTORY is ignored and never walked — the same
    // answer git gives, and the reason the sentence below has to name what was skipped.
    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['app.ts'])
    expect(scan.skipped.join(' ')).toContain('ignored by a .gitignore')
  })

  it('applies a nested .gitignore to its own directory only', () => {
    const root = tree({
      'web/.gitignore': 'generated.ts\n',
      'web/generated.ts': 'export const g = 1\n',
      'web/real.ts': 'export const r = 1\n',
      'server/generated.ts': 'export const g = 2\n',
    })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['server/generated.ts', 'web/real.ts'])
  })

  it('refuses a gitignore pattern it does not fully understand rather than half-applying it', () => {
    const root = tree({ '.gitignore': 'file[0-9].ts\n', 'file1.ts': 'export const a = 1\n' })
    // A character class silently treated as literal text would leave file1.ts in the index while
    // its author believes it is ignored. That is the failure this refusal exists to prevent.
    expect(() => idx.rebuildIndex({ workspaceId: WORKSPACE, root })).toThrow(/character classes/)
  })

  it('reports a file it could not read instead of stopping', () => {
    const root = tree({ 'a.ts': 'export const a = 1\n', 'big.ts': 'x'.repeat(3 * 1024 * 1024) })
    const scan = idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['a.ts'])
    expect(scan.skipped.join(' ')).toContain('big.ts is 3,145,728 bytes')
  })

  it('produces the same rows twice over an unchanged tree', () => {
    const root = tree({ 'a.ts': 'export const a = 1\n', 'b/c.ts': "import './x.ts'\n" })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    const first = idx.listIndexedFiles(WORKSPACE)
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(idx.listIndexedFiles(WORKSPACE)).toEqual(first)
  })
})

describe('rebuild, never merge', () => {
  it('drops a file that is gone from disk instead of keeping it around', () => {
    const root = tree({ 'a.ts': 'export const a = 1\n', 'b.ts': 'export const b = 1\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })

    unlinkSync(join(root, 'a.ts'))
    writeFileSync(join(root, 'c.ts'), 'export const c = 1\n')
    const outcome = idx.rebuildIndex({ workspaceId: WORKSPACE, root })

    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['b.ts', 'c.ts'])
    expect(outcome.report.removed).toEqual(['a.ts'])
    expect(outcome.report.added).toEqual(['c.ts'])
    expect(outcome.report.unchanged).toBe(1)
    expect(idx.storedHashes(WORKSPACE).has('a.ts')).toBe(false)
  })

  it('leaves the previous index untouched when a scan fails half way', () => {
    const root = tree({ 'a.ts': 'export const a = 1\n', 'b.ts': 'export const b = 1\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    const before = idx.indexStatus(WORKSPACE)

    // The tree changes AND becomes unscannable. A merge-style index would now be a mixture of
    // two moments, which is the failure with no symptom: it reads as a normal index.
    unlinkSync(join(root, 'a.ts'))
    mkdirSync(join(root, 'sub'), { recursive: true })
    writeFileSync(join(root, 'sub/.gitignore'), 'bad[0-9].ts\n')

    expect(() => idx.rebuildIndex({ workspaceId: WORKSPACE, root })).toThrow()
    expect(paths(idx.listIndexedFiles(WORKSPACE))).toEqual(['a.ts', 'b.ts'])
    expect(idx.indexStatus(WORKSPACE)).toEqual(before)
  })

  it('has no status at all until it has been built once', () => {
    expect(idx.indexStatus(WORKSPACE)).toBeNull()
    const root = tree({ 'a.ts': 'export const a = 1\n' })
    const scan = idx.rebuildIndex({ workspaceId: WORKSPACE, root, actor: { type: 'system', id: 'reindex-script' } })
    const status = idx.indexStatus(WORKSPACE)
    expect(status?.root).toBe(root)
    expect(status?.fileCount).toBe(1)
    expect(status?.builtAt).toBe(scan.builtAt)
    // Attributed like every other write, and a script says so rather than claiming to be a person.
    expect(status?.builtBy).toBe('system:reindex-script')
    expect(scan.report.firstScan).toBe(true)
  })
})

// ======================================================================= imports and exports

describe('what a file declares', () => {
  const read = (source: string, name = 'a.ts') => {
    const root = tree({ [name]: source })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    const file = idx.indexedFile(name, WORKSPACE)
    if (!file) throw new Error(`${name} was not indexed`)
    return file
  }

  it('reads static, side-effect, dynamic, require and re-export specifiers', () => {
    const file = read(
      [
        "import { z } from 'zod'",
        "import type { A } from './a.ts'",
        "import './side-effect.css'",
        "const late = await import('./late.ts')",
        "const cjs = require('node:fs')",
        "export { thing } from './thing.ts'",
      ].join('\n'),
    )
    expect(file.imports.sort()).toEqual(['./a.ts', './late.ts', './side-effect.css', './thing.ts', 'node:fs', 'zod'])
  })

  it('ignores an import written inside a comment', () => {
    // Not hypothetical: src/web/pages/HomePage.tsx documents its own use with
    // `import { HomePage } from './pages/HomePage.tsx'` in its header comment, and without the
    // comment stripper the index reports that the file imports itself.
    const file = read(
      [
        '/**',
        " * Use it as: import { A } from './commented-out.ts'",
        ' */',
        "// import { B } from './also-commented.ts'",
        "import { real } from './real.ts'",
        "const message = 'this // is not a comment'",
      ].join('\n'),
    )
    expect(file.imports).toEqual(['./real.ts'])
  })

  it('lists exported names, however they are written', () => {
    const file = read(
      [
        'export function fn() {}',
        'export const value = 1',
        'export class Thing {}',
        'export interface Shape { a: number }',
        'export type Alias = Shape',
        'const hidden = 2',
        'export { hidden as shown }',
        "export * from './everything.ts'",
        'export default fn',
      ].join('\n'),
    )
    expect(file.exports).toEqual(['fn', 'value', 'Thing', 'Shape', 'Alias', 'shown', '*', 'default'])
  })

  it('reads what the other languages declare, and nothing where there is nothing to read', () => {
    const root = tree({
      'go.py': 'import asyncio\nfrom playwright.async_api import async_playwright\ndef run():\n    pass\n',
      'a.css': "@import './tokens.css';\n",
      'page.html': '<script src="./main.tsx"></script>\n',
      'up.sql': 'CREATE TABLE x (id TEXT);\n',
    })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    expect(idx.indexedFile('go.py', WORKSPACE)?.imports).toEqual(['asyncio', 'playwright.async_api'])
    expect(idx.indexedFile('go.py', WORKSPACE)?.exports).toEqual(['run'])
    expect(idx.indexedFile('a.css', WORKSPACE)?.imports).toEqual(['./tokens.css'])
    expect(idx.indexedFile('page.html', WORKSPACE)?.imports).toEqual(['./main.tsx'])
    // SQL declares neither. Empty because nothing could be named, not because nothing was looked
    // for — which is the difference somebody reading an empty list wonders about.
    expect(idx.indexedFile('up.sql', WORKSPACE)?.imports).toEqual([])
    expect(idx.indexedFile('up.sql', WORKSPACE)?.exports).toEqual([])
  })
})

// ================================================================================== coverage

describe('a coverage query with no index behind it', () => {
  it('refuses instead of answering "nothing is unclaimed"', () => {
    // The dangerous answer is the plausible one: an empty unclaimed list reads exactly like a
    // fully covered repository. Each of these has to name the command that fixes it.
    for (const call of [
      () => idx.unclaimedFiles({ workspaceId: WORKSPACE }),
      () => idx.staleClaims(WORKSPACE),
      () => idx.coverage(WORKSPACE),
      () => idx.moduleFor('src/a.ts', WORKSPACE),
      () => idx.filesFor('anything', WORKSPACE),
    ]) {
      expect(call).toThrow(/never been built.*reindex/s)
    }
  })
})

describe('claims, and the files under them', () => {
  const fixture = () =>
    tree({
      'src/web/App.tsx': 'export const App = 1\n'.repeat(20),
      'src/web/lib/layout.ts': 'export const layout = 1\n',
      'src/webhooks.ts': 'export const hook = 1\n',
      'src/server/index.ts': 'export const server = 1\n',
      'tests/api.test.ts': 'export const test = 1\n',
    })

  it('claims every file under a plain path, on whole segments only', () => {
    const root = fixture()
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    moduleClaiming('Browser app', ['src/web'])

    // src/webhooks.ts starts with the same letters. Claiming it would give a file an owner that
    // has never heard of it, and nothing on any page would look wrong.
    expect(paths(idx.filesFor('Browser app', WORKSPACE))).toEqual(['src/web/App.tsx', 'src/web/lib/layout.ts'])
    expect(idx.moduleFor('src/webhooks.ts', WORKSPACE)).toEqual([])
  })

  it('matches the wildcards the kind spec promises', () => {
    const root = fixture()
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    moduleClaiming('One file', ['src/webhooks.ts'])
    moduleClaiming('Everything under src', ['src/**'])
    moduleClaiming('One segment', ['src/*.ts'])
    moduleClaiming('A suffix', ['tests/*.test.ts'])

    expect(paths(idx.filesFor('One file', WORKSPACE))).toEqual(['src/webhooks.ts'])
    expect(idx.filesFor('Everything under src', WORKSPACE)).toHaveLength(4)
    // One star stays inside a segment, so this is src/webhooks.ts and not src/web/lib/layout.ts.
    expect(paths(idx.filesFor('One segment', WORKSPACE))).toEqual(['src/webhooks.ts'])
    expect(paths(idx.filesFor('A suffix', WORKSPACE))).toEqual(['tests/api.test.ts'])
  })

  it('ranks unclaimed files by size, largest gap first', () => {
    const root = fixture()
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    theRepositoryScanned(root)
    moduleClaiming('Server', ['src/server'])

    const unclaimed = idx.unclaimedFiles({ workspaceId: WORKSPACE })
    expect(paths(unclaimed)).toEqual([
      'src/web/App.tsx',
      'src/web/lib/layout.ts',
      'src/webhooks.ts',
      'tests/api.test.ts',
    ])
    expect(unclaimed[0]!.sizeBytes).toBeGreaterThan(unclaimed[1]!.sizeBytes)
    expect(paths(idx.unclaimedFiles({ workspaceId: WORKSPACE, limit: 2 }))).toEqual(['src/web/App.tsx', 'src/web/lib/layout.ts'])
    // The path-ordered list on SourceCoverage is the same set, in a different order.
    expect([...idx.coverage(WORKSPACE).unclaimed].sort()).toEqual(paths(unclaimed).sort())
  })

  it('answers both directions, most specific claim first, and shows an overlap rather than picking', () => {
    const root = fixture()
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    moduleClaiming('Everything', ['src'])
    moduleClaiming('Browser app', ['src/web'])
    moduleClaiming('Layout', ['src/web/lib'])

    // Two modules claiming one file is a real state while responsibility is being split. Picking
    // one by an invented rule would hide it, so all three come back, narrowest first.
    expect(idx.moduleFor('src/web/lib/layout.ts', WORKSPACE).map((c) => c.moduleTitle)).toEqual([
      'Layout',
      'Browser app',
      'Everything',
    ])
    const match = one(idx.moduleFor('src/server/index.ts', WORKSPACE), 'claim on src/server/index.ts')
    expect(match.moduleTitle).toBe('Everything')
    expect(match.pattern).toBe('src')
  })

  it('tells an unknown module from a module with no code', () => {
    const root = fixture()
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    const empty = moduleClaiming('No code yet', [])
    expect(idx.filesFor(empty.id, WORKSPACE)).toEqual([])

    // A typo must not produce the same answer as "this module claims nothing".
    expect(() => idx.filesFor('No Code Yet', WORKSPACE)).toThrow(/No record with id or title/)

    const claim = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'claim', title: 'A claim, not a module', actor: AGENT })
    expect(() => idx.filesFor(claim.title, WORKSPACE)).toThrow(/is a claim, not a module/)
  })
})

describe('claims that match nothing', () => {
  it('separates a rename from a claim that could never have matched', () => {
    const root = tree({ 'src/a.ts': 'export const a = 1\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    theRepositoryScanned(root)
    moduleClaiming('Renamed', ['src/old-name.ts'])
    moduleClaiming('Wrong field', [join(root, 'src'), '../outside', 'src\\windows.ts'])

    const stale = idx.staleClaims(WORKSPACE)
    // Each module's stale claims come together, the modules in the order listRecords gives them: newest
    // change first, and those changed in the same second by id, A to Z. The two modules here are made
    // within a second or two and an id is random, so which comes first is read from that list and not
    // assumed (problem efZ0jxihmNbv: "Renamed" was assumed first, and the merge run drew the ids the
    // other way round).
    const modules = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'module' }).map((m) => m.title)
    expect([...modules].sort()).toEqual(['Renamed', 'Wrong field'])
    const claimsOf: Record<string, number> = { Renamed: 1, 'Wrong field': 3 }
    expect(stale.map((s) => s.moduleTitle)).toEqual(modules.flatMap((title) => Array<string>(claimsOf[title]!).fill(title)))

    // A rename has no problem to report: the claim was well formed and the code moved.
    expect(one(stale.filter((s) => s.moduleTitle === 'Renamed'), 'the rename').problem).toBeNull()
    // The others could never resolve, and calling them "stale" would send somebody hunting for a
    // file that never existed.
    // Found by pattern, because the map hands a module's rows back in pattern order.
    const problemOf = (pattern: string) => one(stale.filter((s) => s.pattern === pattern), pattern).problem
    expect(problemOf(join(root, 'src'))).toContain('absolute path')
    expect(problemOf('../outside')).toContain('climbs out of the repository')
    expect(problemOf('src\\windows.ts')).toContain('backslash')
    // A blank claim never reaches the database — the write gate refuses it — so the rule is
    // checked directly rather than through a record that cannot be created.
    expect(claimProblem('   ')).toContain('blank')
  })

  it('reads no claim out of a module\'s data, because the map is where a module\'s code is stated', () => {
    const root = tree({ 'src/a.ts': 'export const a = 1\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    theRepositoryScanned(root)
    const module = moduleClaiming('Old record', [])

    // Written straight into the table, because the write door refuses `claims` on a module. A
    // record like this is one the claims migration never reached, and coverage reads the map.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.claims', json(?)) WHERE id = ?")
      .run(JSON.stringify(['src']), module.id)

    const cover = idx.coverage(WORKSPACE)
    expect(one(cover.modules, 'module').claims).toEqual([])
    expect(cover.claimedFiles).toBe(0)
    expect(cover.unclaimedFiles).toBe(1)
  })

  it('accounts for every indexed file exactly once', () => {
    const root = tree({
      'src/a.ts': 'export const a = 1\n',
      'src/b.ts': 'export const b = 1\n',
      'web/c.ts': 'export const c = 1\n',
      'web/d.ts': 'export const d = 1\n',
    })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    theRepositoryScanned(root)
    moduleClaiming('Source', ['src'])
    moduleClaiming('Nothing here', ['src/missing.ts'])

    const cover = idx.coverage(WORKSPACE)
    expect(cover.totalFiles).toBe(4)
    expect(cover.claimedFiles).toBe(2)
    expect(cover.unclaimedFiles).toBe(2)
    expect(cover.claimedFiles + cover.unclaimedFiles).toBe(cover.totalFiles)
    expect(cover.percentClaimed).toBe(50)
    expect(cover.staleClaims).toHaveLength(1)
    // A module that has never claimed a file is listed, because that IS the finding this whole
    // feature exists for: it is what the two front-end stubs look like from here.
    expect(cover.modules.map((m) => m.moduleTitle).sort()).toEqual(['Nothing here', 'Source'])
  })
})

// ============================================================================ configuration

describe('which repository gets scanned', () => {
  it('defaults to this checkout', () => {
    const repo = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
    expect(idx.repoRoot()).toBe(repo)
  })

  it('refuses a root that is not there rather than scanning the default one', () => {
    // Falling back would index the wrong repository and report every claim in the real one as
    // stale, which reads as a codebase in trouble rather than as a typo in an environment variable.
    expect(() => idx.repoRoot('/no/such/place')).toThrow(/MOLE_OFFICE_REPO_ROOT/)
  })
})

// ======================================================================== the real repository

describe('scanning Mole Office itself', () => {
  const repo = () => fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

  it('indexes this project, fast enough to run often', () => {
    const scan = idx.rebuildIndex({ workspaceId: WORKSPACE, root: repo() })

    // A file count is not a property worth protecting, so that assertion is loose. What is worth
    // protecting is that the scan reaches the source tree, skips what it should, and reads each file
    // fast enough to run often.
    expect(scan.fileCount).toBeGreaterThan(50)
    // THE SPEED CLAIM IS PER MIB READ, because the scan grows with the checkout. When this case was
    // written the scan read 90 files, 1.9 MB, in 22 ms, and the claim was 5 s for the whole scan. On
    // 2 November 2026 it read 6,826 files, 114.9 MiB, in 1.5 to 1.7 s alone: 13 to 15 ms per MiB,
    // near the first 12 ms per MB. At a 1-minute load of 35 to 44 on 20 CPUs the whole case took
    // 5.1 s, so at most 45 ms per MiB. 150 ms per MiB is ten times the rate alone and three times
    // that loaded rate. A scan that slows per byte is red here; a scan that reads node_modules, dist
    // or data is red on the paths below.
    const mib = idx.listIndexedFiles(WORKSPACE).reduce((sum, file) => sum + file.sizeBytes, 0) / (1024 * 1024)
    expect(scan.scanMs / mib, `${String(scan.scanMs)} ms for ${String(scan.fileCount)} files, ${mib.toFixed(1)} MiB`).toBeLessThan(150)

    const self = idx.indexedFile('src/server/lib/sourceindex.ts', WORKSPACE)
    expect(self?.language).toBe('typescript')
    expect(self?.exports).toContain('unclaimedFiles')
    expect(self?.imports).toContain('../db/client.ts')
    // This file's own header quotes `from '../../server/lib/summary.ts'` in prose. If that ever
    // appears here, the comment stripper has stopped working on the file most likely to break it.
    expect(self?.imports).not.toContain('../../server/lib/summary.ts')

    for (const file of idx.listIndexedFiles(WORKSPACE)) {
      expect(file.path).not.toMatch(/^(node_modules|dist|data|\.|_)/)
    }
    // THE CASE MAY TAKE 60 S, not vitest's 5 s for a case that starts nothing. At that load it took
    // 5,144 ms and ran out of time. At the claim's 150 ms per MiB, today's 115 MiB take 17 s, so the
    // claim goes red before the case's time runs out.
  }, 60_000)
})

// ================================================ the API this index is served through

describe('the routes in api/source.ts serve exactly what this file stored', () => {
  /**
   * One implementation, one set of tables, and a route file that must stay a route file. These
   * tests are what would notice a scanner growing back inside it: every number below is compared
   * against the rows this file wrote, so a second opinion cannot hide behind an HTTP status.
   */
  const repo = () => fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

  /** The four endpoints, on a throwaway Fastify app, against the database this test opened. */
  async function serve(): Promise<{ inject: FastifyInstance['inject']; close: () => Promise<void> }> {
    const { sourceRoutes } = await import('../src/server/api/source.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    const Fastify = (await import('fastify')).default
    const app = Fastify({ logger: false })
    installErrorHandling(app)
    await app.register(sourceRoutes, { prefix: '/api' })
    await app.ready()
    return { inject: app.inject.bind(app), close: () => app.close() }
  }

  it('hands back the stored rows themselves, field for field, and dates them from the same scan', async () => {
    idx.rebuildIndex({ workspaceId: WORKSPACE, root: repo() })
    const app = await serve()
    try {
      const reply = await app.inject({ method: 'GET', url: '/api/source', headers: { 'x-mole-office-workspace': WORKSPACE } })
      expect(reply.statusCode).toBe(200)
      const body = reply.json() as { index: SourceIndexStamp; files: SourceFile[] }
      const status = idx.indexStatus(WORKSPACE)!

      // Not "the same number of files": the same files, with the same size, lines, language,
      // imports, exports and modification time. A scanner rebuilt inside the route file would
      // agree about the count long before it agreed about this.
      expect(body.files).toEqual(idx.listIndexedFiles(WORKSPACE))
      expect(body.index.fileCount).toBe(status.fileCount)
      expect(body.index.builtAt).toBe(status.builtAt)
      expect(body.index.builtBy).toBe(status.builtBy)
      expect(body.index.root).toBe(status.root)
      expect(body.index.skipped).toEqual(status.skipped)
      // The age is worked out on the request and never stored, so it dates the scan rather than
      // the answer: a stored age is wrong the moment it is written, and wrong silently.
      expect(body.index.ageSeconds).toBeGreaterThanOrEqual(0)
      expect(body.index.age).toMatch(/^\d+[smhd]/)
    } finally {
      await app.close()
    }
    // THIS CASE AND THE NEXT MAY TAKE 60 S, as the case above that scans the real repository may. Each scans the whole
    // repository again, and this one is the first to import the route module, http.ts and Fastify. On 12 November 2026
    // the merge queue's run of the related files timed this case out at vitest's 5 s, and the file was green alone on
    // the same tree. The claim of 150 ms per MiB above holds the scan's speed; this time does not.
  }, 60_000)

  it('serves import lists with the comments stripped, so a documented import is not a dependency', async () => {
    idx.rebuildIndex({ workspaceId: WORKSPACE, root: repo() })
    const app = await serve()
    try {
      const body = (await app.inject({ method: 'GET', url: '/api/source', headers: { 'x-mole-office-workspace': WORKSPACE } })).json() as { files: SourceFile[] }
      // The concrete case, on a real file: HomePage.tsx documents its own use with an import line
      // in its header comment. The route serving that as a dependency is what the second scanner
      // did, and it is the reason this one survived the merge.
      const home = body.files.find((f) => f.path === 'src/web/pages/HomePage.tsx')
      expect(home, 'HomePage.tsx is not in the served index').toBeDefined()
      expect(home?.imports).not.toContain('./pages/HomePage.tsx')
      expect(home?.imports).toContain('react')
    } finally {
      await app.close()
    }
  }, 60_000)

  it('compares two stored file lists without inventing a change', () => {
    const root = tree({ 'src/a.ts': "import './b.ts'\nexport const a = 1\n", 'src/b.ts': 'export const b = 2\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })

    // `reindexReport` compares two file lists; feeding it rows read back out of the database
    // proves the shape it expects is the shape that came out of storage, which is the assertion
    // that used to be made across the two implementations.
    const report = idx.reindexReport(idx.listIndexedFiles(WORKSPACE), idx.listIndexedFiles(WORKSPACE), idx.indexStatus(WORKSPACE)!.builtAt)
    expect(report.unchanged).toBe(2)
    expect(report.added).toEqual([])
    expect(report.changed).toEqual([])
  })

  it('says nothing about content when the stored index left no hashes behind', () => {
    // Databases like this exist: every index written before the two scanners were merged has file
    // rows and no hashes, because the copy in api/source.ts did not know that table existed. The
    // rows are removed by hand here because nothing supported produces that state any more.
    const root = tree({ 'a.ts': 'export const a = 1\n', 'b.ts': 'export const b = 2\n' })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    t.client.sqlite.prepare('DELETE FROM source_file_hashes WHERE workspace_id = ?').run(WORKSPACE)
    expect(idx.storedHashes(WORKSPACE).size).toBe(0)

    const outcome = idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    // Not one file may be reported as having changed CONTENTS, because none has. With no hash to
    // compare against, the report says nothing about content rather than something false.
    for (const change of outcome.report.changed) {
      expect(change.what).not.toContain('contents changed')
    }
    expect(outcome.report.unchanged).toBe(2)
  })

  it('resolves a claim to the same files this file resolves it to', async () => {
    const root = tree({
      'src/web/App.tsx': 'export const App = 1\n',
      'src/web/lib/layout.ts': 'export const layout = 1\n',
      'src/server/index.ts': 'export const server = 1\n',
    })
    idx.rebuildIndex({ workspaceId: WORKSPACE, root })
    theRepositoryScanned(root)
    moduleClaiming('Browser app', ['src/web/**'])

    const app = await serve()
    try {
      const reply = await app.inject({ method: 'GET', url: '/api/source/coverage', headers: { 'x-mole-office-workspace': WORKSPACE } })
      expect(reply.statusCode).toBe(200)
      const body = reply.json() as { coverage: { unclaimed: string[]; claimedFiles: number } }
      // The coverage engine is this file's, and the route is a caller of it. They have to agree
      // exactly — the day they do not, the route has grown an opinion of its own.
      expect(body.coverage.claimedFiles).toBe(idx.coverage(WORKSPACE).claimedFiles)
      expect(body.coverage.unclaimed).toEqual(idx.coverage(WORKSPACE).unclaimed)
      expect(body.coverage.unclaimed).toEqual(['src/server/index.ts'])
    } finally {
      await app.close()
    }
  })
})
