// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every path, plugin and test title here is made up. */
import { expect, it } from 'vitest'
import { STANDARD_KINDS, whatAStandardDeclarationFinds, type StandardKind, type WhatTheToolReadOfAStandardChange } from '../src/shared/standard-change.ts'

const changed = (...paths: string[]) => paths.map((path) => ({ path, deleted: false }))
/** What the check tool would hand on for these paths when nothing is protected, no case is lost and only words changed. */
function readOf(paths: string[]): WhatTheToolReadOfAStandardChange {
  return {
    neverStandard: [],
    cases: paths.filter((path) => path.startsWith('tests/') || path.includes('.test.')).map((path) => ({ path, removed: [] })),
    words: paths.map((path) => ({ path, plain: true, why: 'Only words changed.' })),
  }
}
const finds = (kind: unknown, paths: string[], read = readOf(paths)) => whatAStandardDeclarationFinds(kind, changed(...paths), read)

/** For each kind, a change that is only of that kind, and one file outside it. */
const EXAMPLES: Record<StandardKind, { inside: string[]; outside: string }> = {
  'one-plugin': { inside: ['plugins/made-up-plugin/src/index.ts', 'plugins/made-up-plugin/tests/made-up.test.ts'], outside: 'plugins/another-made-up/src/index.ts' },
  words: { inside: ['src/shared/words/en-wave-13r.ts', 'src/shared/words/zh.ts', 'src/config/word-sources.mjs'], outside: 'src/shared/words/joined.ts' },
  tests: { inside: ['tests/made-up-thing.test.ts', 'tests/made-up-helper.ts'], outside: 'src/server/lib/made-up.ts' },
  documents: { inside: ['docs/made-up-guide.md', 'notes/made-up.txt'], outside: 'docs/made-up-data.json' },
}

it('lists the four kinds the owner named, in their order', () => {
  expect(STANDARD_KINDS).toEqual(['one-plugin', 'words', 'tests', 'documents'])
})

it('matches each of the four kinds when every changed file is of it, and says why', () => {
  for (const kind of STANDARD_KINDS) {
    const found = finds(kind, EXAMPLES[kind].inside)
    expect(found, kind).toMatchObject({ declared: kind, matches: true })
    expect(found.why, kind).toMatch(/^Every one of the 2 changed files is |^Every one of the 3 changed files is /)
  }
  expect(finds('one-plugin', EXAMPLES['one-plugin'].inside).why).toBe(
    'Every one of the 2 changed files is inside plugins/made-up-plugin/ and its manifest is unchanged.',
  )
  expect(finds('documents', ['docs/made-up-guide.md']).why).toBe('The one changed file is a document.')
})

it('sends each kind the ordinary way when one file outside it is added, and names that file', () => {
  for (const kind of STANDARD_KINDS) {
    const paths = [...EXAMPLES[kind].inside, EXAMPLES[kind].outside]
    const found = finds(kind, paths)
    expect(found, kind).toMatchObject({ declared: kind, matches: false })
    expect(found.why, kind).toMatch(/so it goes the ordinary way\.$/)
    if (kind !== 'one-plugin') expect(found.why, kind).toContain(EXAMPLES[kind].outside)
  }
  expect(finds('one-plugin', ['plugins/made-up-plugin/plugin.json']).why).toContain('it changes the manifest of made-up-plugin')
})

it('matches a deleted test file, a deleted test inside a plugin and a removed case as the kind they are inside, and still refuses a case reading the tool did not give', () => {
  const deleted = whatAStandardDeclarationFinds('tests', [{ path: 'tests/made-up-thing.test.ts', deleted: true }, { path: 'tests/made-up-helper.ts', deleted: false }], readOf(['tests/made-up-helper.ts']))
  expect(deleted).toMatchObject({ declared: 'tests', matches: true })
  expect(deleted.why).toBe('Every one of the 2 changed files is under tests/.')
  const inAPlugin = whatAStandardDeclarationFinds('one-plugin', [{ path: 'plugins/made-up-plugin/src/a.test.ts', deleted: true }], readOf([]))
  expect(inAPlugin).toMatchObject({ declared: 'one-plugin', matches: true })
  expect(inAPlugin.why).toBe('The one changed file is inside plugins/made-up-plugin/ and its manifest is unchanged.')
  const read = readOf(['tests/made-up-thing.test.ts'])
  read.cases = [{ path: 'tests/made-up-thing.test.ts', removed: ['"says hello to a made-up person"'] }]
  const removed = finds('tests', ['tests/made-up-thing.test.ts'], read)
  expect(removed).toMatchObject({ declared: 'tests', matches: true })
  expect(removed.why).toBe('The one changed file is under tests/.')
  // A changed test file the tool said nothing about is not taken as one that lost nothing.
  const unsaid = finds('tests', ['tests/made-up-thing.test.ts'], { ...readOf([]), cases: [] })
  expect(unsaid.matches).toBe(false)
  expect(unsaid.why).toContain('the check tool did not say which cases tests/made-up-thing.test.ts lost')
  expect(finds('tests', ['tests/made-up-thing.test.ts'], { ...readOf([]), cases: null }).matches).toBe(false)
})

it('sends no declaration, and a word that is not a kind, the ordinary way', () => {
  expect(finds(undefined, ['docs/made-up-guide.md'])).toEqual({ declared: null, matches: false, why: 'The seal declares no standard kind, so it goes the ordinary way.' })
  expect(finds(null, ['docs/made-up-guide.md']).matches).toBe(false)
  const unknown = finds('docs', ['docs/made-up-guide.md'])
  expect(unknown).toMatchObject({ declared: null, matches: false })
  expect(unknown.why).toContain('"docs", which is not one of the standard kinds')
  expect(finds('documents', []).why).toContain('the seal changes no file')
})

it('never passes a migration, the merge tool, the role cards, the house rules or a path the tool names as protected', () => {
  expect(finds('documents', ['drizzle/made-up-notes.md']).why).toContain('a database migration')
  expect(finds('tests', ['tests/house-rules.mjs']).why).toContain('the inventory of house rules')
  expect(finds('documents', ['design/rules/made-up.md']).why).toContain('the office rules')
  expect(finds('documents', ['AGENTS.md']).matches).toBe(false)
  expect(finds('documents', ['.claude/made-up.md']).matches).toBe(false)
  const protectedPath = readOf(['design/made-up.md'])
  protectedPath.neverStandard = [{ path: 'design/made-up.md', why: 'it is protected by design/ in .mole-office/protected.json' }]
  const found = finds('documents', ['design/made-up.md'], protectedPath)
  expect(found.matches).toBe(false)
  expect(found.why).toContain('design/made-up.md (it is protected by design/ in .mole-office/protected.json)')
  const queue = readOf(['tests/sentences.ts'])
  queue.neverStandard = [{ path: 'tests/sentences.ts', why: "it is the merge queue's own code" }]
  expect(finds('tests', ['tests/sentences.ts'], queue).matches).toBe(false)
  // A list the tool could not read is not an empty one.
  expect(finds('documents', ['docs/made-up-guide.md'], { ...readOf(['docs/made-up-guide.md']), neverStandard: null }).why).toContain('could not read which changed paths are protected')
})

it('passes a words change only when the tool says each word file changed only words', () => {
  const read = readOf(['src/shared/words/en.ts'])
  read.words = [{ path: 'src/shared/words/en.ts', plain: false, why: 'line 12 changes code, not a word' }]
  expect(finds('words', ['src/shared/words/en.ts'], read).why).toContain('src/shared/words/en.ts changes more than words: line 12 changes code, not a word')
  expect(finds('words', ['src/shared/words/en.ts'], { ...read, words: [] }).why).toContain('did not say whether only words changed in src/shared/words/en.ts')
  expect(finds('words', ['src/shared/words/en.ts'], { ...read, words: null }).matches).toBe(false)
})
