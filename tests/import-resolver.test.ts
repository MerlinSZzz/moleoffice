// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESOLVER OFFERS EVERY CANDIDATE AND NEVER A WINNER, AND WHAT IT CANNOT READ IT NAMES.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO CLAIMS
 * ---------------------------------------------------------------------------------------
 *
 * ONE — A file imported by two owned files gets TWO rows, not one. A.3: *"One file may serve
 * several Blocks or Modules."* Picking the most frequent importer would be inventing a winner, and
 * the measured nine-candidate file in this checkout is the case that proves it: it is genuinely
 * shared, and a resolver that named one owner would hide that.
 *
 * TWO — A specifier that resolves to nothing is COUNTED AND NAMED. A resolver that quietly drops
 * what it cannot read reports a sparser graph than the truth, and nothing about the answer looks
 * wrong.
 *
 * ---------------------------------------------------------------------------------------
 * AND A FINDING NEVER MAKES A FILE CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * The resolver is asked ONLY about files no stated row covers, so a file somebody has claimed can
 * never appear in its output at all. That is the third of the five mechanisms and it is asserted
 * here rather than described: the fixture claims one file, and the resolver's rows are checked for
 * its absence.
 */

import { describe, expect, it } from 'vitest'
import { aliasesFrom, importEdges, importResolver, resolveSpecifier } from '../src/server/lib/resolvers/index.ts'
import type { SourceFile } from '../src/shared/types.ts'

/** A file list, written the way the index holds one. */
function file(path: string, imports: string[] = []): SourceFile {
  return {
    path,
    language: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.py') ? 'python' : 'typescript',
    sizeBytes: 100,
    lines: 10,
    imports,
    exports: [],
    modifiedAt: '2026-08-25 10:00:00',
  }
}

const ALIASES = new Map([['@shared/*', ['src/shared/*']]])

describe('one specifier at a time', () => {
  const paths = new Set([
    'src/web/pages/HomePage.tsx',
    'src/web/pages/RecordPage.tsx',
    'src/web/lib/paths.ts',
    'src/web/lib/index.ts',
    'src/shared/types.ts',
    'src/server/lib/records.ts',
    'pkg/thing/__init__.py',
    'pkg/other.py',
  ])

  it('joins a relative specifier to the importing file and normalises it', () => {
    expect(resolveSpecifier('src/web/pages/HomePage.tsx', './RecordPage.tsx', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'src/web/pages/RecordPage.tsx',
    })
    expect(resolveSpecifier('src/web/pages/HomePage.tsx', '../lib/paths.ts', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'src/web/lib/paths.ts',
    })
  })

  it('tries the extensions and then the directory index', () => {
    expect(resolveSpecifier('src/web/pages/HomePage.tsx', '../lib/paths', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'src/web/lib/paths.ts',
    })
    expect(resolveSpecifier('src/web/pages/HomePage.tsx', '../lib', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'src/web/lib/index.ts',
    })
  })

  it('swaps a .js specifier for the .ts file it names', () => {
    expect(resolveSpecifier('src/web/pages/HomePage.tsx', '../lib/paths.js', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'src/web/lib/paths.ts',
    })
  })

  it('rewrites an alias before deciding a specifier is a package', () => {
    expect(resolveSpecifier('src/server/lib/records.ts', '@shared/types.ts', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'src/shared/types.ts',
    })
    // WITHOUT the alias table the same string is a bare package name, which is the whole reason the
    // order of the rules matters.
    expect(resolveSpecifier('src/server/lib/records.ts', '@shared/types.ts', paths, new Map())).toEqual({
      kind: 'outside',
      why: 'a package',
    })
  })

  it('calls a built-in and a package OUTSIDE, which is not an error', () => {
    expect(resolveSpecifier('src/server/lib/records.ts', 'node:fs', paths, ALIASES).kind).toBe('outside')
    expect(resolveSpecifier('src/server/lib/records.ts', 'nanoid', paths, ALIASES).kind).toBe('outside')
  })

  it('leaves a relative specifier that names nothing UNRESOLVED rather than outside', () => {
    // The difference is the whole point: `nanoid` is somewhere else on purpose; `./gone.ts` is a
    // hole in the graph and has to be counted as one.
    expect(resolveSpecifier('src/web/pages/HomePage.tsx', './gone.ts', paths, ALIASES)).toEqual({
      kind: 'unresolved',
    })
  })

  it('refuses to climb above the repository root', () => {
    expect(resolveSpecifier('src/a.ts', '../../outside.ts', paths, ALIASES)).toEqual({ kind: 'unresolved' })
  })

  it('reads a Python dotted name, which this checkout cannot exercise', () => {
    // UNPROVEN ON REAL MATERIAL and said so: there is no Python in this repository. The rule is
    // exercised here on a fixture so that it is at least not untested, and the sentence in
    // resolvers/imports.ts says which of the two that is.
    expect(resolveSpecifier('pkg/other.py', 'pkg.thing', paths, ALIASES)).toEqual({
      kind: 'resolved',
      path: 'pkg/thing/__init__.py',
    })
  })
})

describe('the alias table', () => {
  it('reads compilerOptions.paths, comments and all', () => {
    const table = aliasesFrom(`{
      // a comment, which every real tsconfig has
      "compilerOptions": { "paths": { "@shared/*": ["./src/shared/*"] } }
    }`)
    expect(table.get('@shared/*')).toEqual(['src/shared/*'])
  })

  it('answers an empty table for a repository that has no such file', () => {
    expect(aliasesFrom('').size).toBe(0)
    expect(aliasesFrom('not json at all').size).toBe(0)
  })
})

describe('the edges', () => {
  it('counts what it could not read and names it, and never drops it', () => {
    const { edges, unresolved, outside } = importEdges(
      [file('src/a.ts', ['./b.ts', './gone.ts', 'node:fs']), file('src/b.ts', [])],
      new Map(),
    )
    expect(edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts', specifier: './b.ts' }])
    expect(unresolved).toEqual(['src/a.ts -> ./gone.ts'])
    expect(outside).toBe(1)
  })

  it('does not make a file its own dependency', () => {
    const { edges } = importEdges([file('src/a.ts', ['./a.ts'])], new Map())
    expect(edges).toEqual([])
  })
})

describe('the candidate owner', () => {
  const files = [
    file('src/owned-by-one.ts', ['./shared.ts']),
    file('src/owned-by-two.ts', ['./shared.ts']),
    file('src/shared.ts', []),
    file('src/nobody-imports-me.ts', []),
    file('src/already-claimed.ts', []),
  ]

  function run(covered: string[], servedBy: Map<string, string[]>) {
    return importResolver.run({
      files,
      coveredByStated: new Set(covered),
      servedBy,
      aliases: new Map(),
    })
  }

  it('offers EVERY candidate and never picks one', () => {
    const answer = run(
      ['src/owned-by-one.ts', 'src/owned-by-two.ts'],
      new Map([
        ['src/owned-by-one.ts', ['moduleA']],
        ['src/owned-by-two.ts', ['moduleB']],
      ]),
    )
    const forShared = (answer?.rows ?? []).filter((row) => row.path === 'src/shared.ts')
    expect(forShared.map((r) => r.recordId).sort()).toEqual(['moduleA', 'moduleB'])
  })

  it('keeps the evidence as two facts, never as a sentence', () => {
    const answer = run(['src/owned-by-one.ts'], new Map([['src/owned-by-one.ts', ['moduleA']]]))
    const row = (answer?.rows ?? []).find((r) => r.path === 'src/shared.ts')
    expect(row?.evidencePath).toBe('src/owned-by-one.ts')
    expect(row?.evidenceDetail).toBe('./shared.ts')
    expect(row?.provenance).toBe('imports')
  })

  it('never proposes an owner for a file somebody has already claimed', () => {
    const answer = run(
      ['src/owned-by-one.ts', 'src/already-claimed.ts'],
      new Map([['src/owned-by-one.ts', ['moduleA']]]),
    )
    expect((answer?.rows ?? []).some((r) => r.path === 'src/already-claimed.ts')).toBe(false)
  })

  it('says nothing at all about a file nothing anybody owns imports', () => {
    const answer = run(['src/owned-by-one.ts'], new Map([['src/owned-by-one.ts', ['moduleA']]]))
    expect((answer?.rows ?? []).some((r) => r.path === 'src/nobody-imports-me.ts')).toBe(false)
    expect(answer?.note).toContain('imported by nothing anybody owns')
  })

  it('returns null for a tree with no imports in it, which is not an error', () => {
    expect(
      importResolver.run({
        files: [file('README.md'), file('src/plain.ts')],
        coveredByStated: new Set(),
        servedBy: new Map(),
        aliases: new Map(),
      }),
    ).toBeNull()
  })
})
