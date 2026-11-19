// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PATTERN MATCHER, PROVED BY ITS ANSWERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `filesMatching` decides which files a stated pattern covers. Until this wave it was private to
 * `src/server/lib/sourceindex.ts` and had one reader: the module-claims resolver. Two more are
 * coming — the implementation map resolves a stated pattern to the files it covers now, and the
 * work domain resolves a declared scope into paths — and the failure a second copy produces is
 * silent. Two matchers that agree today and disagree in six months about whether `src/web` covers
 * `src/webhooks.ts` would hand a file an owner who has never heard of it, and nothing on any page
 * would look wrong.
 *
 * So the answers are pinned.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { claimProblem, filesMatching, globToRegExp } from '../src/shared/paths.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** Every .ts and .tsx file under src/, as paths relative to src/. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(relative(SRC, full))
  }
  return out.sort()
}

/** The tree the answers below are asked about. Small, and every entry is a case somebody got wrong. */
const TREE = [
  'src/web/App.tsx',
  'src/web/pages/HomePage.tsx',
  'src/web/pages/RecordPage.tsx',
  'src/webhooks.ts',
  'src/server/lib/records.ts',
  'tests/records.test.ts',
  'design/round-ten/design/implementation-map.md',
]

describe('what one pattern covers', () => {
  it('claims a directory and everything under it, whole segments only', () => {
    // src/webhooks.ts is the near miss. A prefix test without the slash hands it to whoever
    // claimed src/web, and no screen would look wrong.
    expect(filesMatching('src/web', TREE)).toEqual([
      'src/web/App.tsx',
      'src/web/pages/HomePage.tsx',
      'src/web/pages/RecordPage.tsx',
    ])
  })

  it('claims one file when the pattern is one file', () => {
    expect(filesMatching('src/webhooks.ts', TREE)).toEqual(['src/webhooks.ts'])
  })

  it('keeps one star inside a segment', () => {
    expect(filesMatching('src/*.ts', TREE)).toEqual(['src/webhooks.ts'])
  })

  it('lets two stars cross segments, including none of them', () => {
    // The zero-directory case is the one people are surprised to lose: this has to find
    // src/web/App.tsx as well as the two a directory deeper.
    expect(filesMatching('src/web/**/*.tsx', TREE)).toEqual([
      'src/web/App.tsx',
      'src/web/pages/HomePage.tsx',
      'src/web/pages/RecordPage.tsx',
    ])
  })

  it('reads a trailing slash and a leading ./ as the same pattern', () => {
    expect(filesMatching('./src/web/', TREE)).toEqual(filesMatching('src/web', TREE))
  })

  it('matches one character with ?', () => {
    expect(globToRegExp('a?c').test('abc')).toBe(true)
    expect(globToRegExp('a?c').test('ac')).toBe(false)
  })

  it('matches nothing for a pattern that is only whitespace', () => {
    expect(filesMatching('   ', TREE)).toEqual([])
  })
})

describe('why a pattern can never match', () => {
  it('names the blank one', () => {
    expect(claimProblem('   ')).toContain('blank')
  })

  it('names an absolute path and says what to write instead', () => {
    const problem = claimProblem(`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx/src/web`)
    expect(problem).toContain('absolute path')
    expect(problem).toContain('src/web/components')
  })

  it('names a backslash and a climb out of the repository', () => {
    expect(claimProblem('src\\web')).toContain('backslash')
    expect(claimProblem('../other/src')).toContain('climbs out of the repository')
  })

  it('has nothing to say about a pattern that is fine', () => {
    expect(claimProblem('src/web/**/*.tsx')).toBeNull()
  })
})

// ============================================================ the walk

