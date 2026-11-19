// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST THAT COPIES THE CODE'S WORDS IS NAMED BEFORE THE SEAL, AND NEVER REFUSES IT. The owner's rule: a test never
 * copies a value that can change; it reads the value from the code. A copied sentence or limit drifts: the code changes
 * and the test keeps the old words, or the test changes with the code and proves nothing. The check before the seal
 * reminds and does not refuse: for each test file the run changed, it names each string of 30 characters or more that
 * is also a literal under src/, tools/ or a plugin's src/, and each bare number on a line naming a limit that a line of the code naming
 * a limit also holds, with both places. It also names a copied value: a list of two or more strings that equals an
 * exported list as a set, and a named number of at least 1000 that equals an exported numeric constant, when the
 * test's own name shares the code's name. Inline numbers of at least 30 are compared when four numeric contexts
 * match on a pair of lines in the two files. Common numbers are excluded. A run keeps one by writing "<key>: kept,
 * because <reason>" in a linked report.
 * The finder is src/server/lib/copied-test-literals.ts; the reminder names its items (before-the-seal-rules.ts) and
 * the seal reads the code at the tip it seals (before-the-seal.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A sentence of exactly 30 characters, in a test line the run adds and in the code, is one likely item, keyed by
 *      the test file, which names both places and refuses nothing.
 *   2. A sentence of 29 characters is not named, nor a relative path such as ../src/x.mjs: a test that names a file
 *      the code moved fails loudly, so the copy cannot drift.
 *   3. A limit is named only when both lines name a limit; the common numbers are not named.
 *   4. A literal in another test, or in a generated words file, is no source; the reminder says what it did not check.
 *   5. Only the run's own added lines are checked.
 *   6. A report line keeps the item, under the same key, with its reason, and it still refuses nothing.
 *   7. Unreadable git names no copied item and says so; an unread source leaves a copied item unjudged.
 *   8. Escapes, literal-only joins and template pieces are read; a regular expression's text is not.
 *   9. The code is read at the tip, not in the worktree.
 *  10. Through the records door: a test the run adds that copies a sentence its own commit adds to the code is named
 *      with both places; the same test reading the sentence from the code's export is not named.
 *  11. At block, a run whose test copies the code's words still seals, and the seal records the item as still found.
 *  12. A string, or a template, that begins with SELECT, INSERT, UPDATE, DELETE, CREATE, WITH or PRAGMA, in any case,
 *      is code and is not named. A sentence that only begins with the same letters still is.
 *  13. The code is read without holding the server's thread: another request is answered while it reads, and no one
 *      hold of the thread is half of the reading.
 *  14. The thread turns while git is read, before the first file is matched, and again between each two files matched.
 *      This counts turns of the thread, not time, so it holds however fast git and the matching are.
 *  15. A list of two or more strings that equals an exported list as a set is named when it is the argument of an
 *      it.each of two or more members, or a named constant whose name shares a word with the exported one; it names
 *      both places and says to read it from there instead.
 *  16. A plain number equal to an exported numeric constant is named when it is a named constant of at least 1000
 *      whose name is made of the exported constant's words, with both places and the same sentence.
 *  17. An arithmetic expression of literals is folded before it is compared, so 50 * 1024 * 1024 is named.
 *  18. A list that only shares some members is not named, and neither is a named constant whose name shares no word.
 *  19. A small common number is not named.
 *  20. A list in a file that is not a test file is not named.
 *  21. Two- and three-member it.each lists are named.
 *  22. Through the records door, a copied list and a copied number are both named before the seal.
 *  23. Frozen exported arrays and Sets are sources.
 *  24. Inline numeric geometry copied from source is named, including a clearance and a body box.
 *  25. The captured Git tip includes plugin source when the reminder reads it.
 *  26. The real Git selection carries only this run's changed plugin test lines to the reminder.
 *
 * Every repository is made here, under a folder of this test's own; every sentence, run and report is made up. The
 * made-up sentence is put together from pieces, so no line of this file is a copy the finder would name.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION AND RESTORE: in the round's report.
 * ---------------------------------------------------------------------------------------
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { candidatesIn, copiedIn } from '../src/server/lib/copied-test-literals.ts'
import { theCommitsReadWith, theComparableItems, theMigrationItemsRefusingASeal, whatAnInspectorWouldMostLikelyRefuse, type TheFactsBeforeTheSeal } from '../src/server/lib/before-the-seal-rules.ts'
import { aReportInForm } from './a-run-in-form.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/**
 * THE FILES THE FINDER READS, for case 14: while `counting`, each file the finder is given records how many times the
 * thread had turned by then. The finder itself is the real one, and every other case reads through it unchanged.
 */
const theReads = vi.hoisted(() => ({ counting: false, turns: 0, at: [] as number[] }))
vi.mock('../src/server/lib/copied-test-literals.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/copied-test-literals.ts')>()
  return {
    ...real,
    aCopiedWordsFinder: (...args: Parameters<typeof real.aCopiedWordsFinder>) => {
      const finder = real.aCopiedWordsFinder(...args)
      return { ...finder, read: (file: Parameters<typeof finder.read>[0]) => { if (theReads.counting) theReads.at.push(theReads.turns); finder.read(file) } }
    },
  }
})

/** Thirty characters, put together so that no line of this file holds them. */
const SENTENCE = ['abcdefghij', 'klmnopqrst', 'uvwxyz1234'].join('')
const testPath = 'tests/made-up.test.ts'
const sourcePath = 'src/made-up.ts'
type Lines = { path: string; added: { line: number; text: string }[] }[]
const aLine = (text: string, line = 7): Lines => [{ path: testPath, added: [{ line, text }] }]
const source = (text: string, path = sourcePath) => [{ path, text }]
const find = (lines: Lines, files: ReturnType<typeof source>) => copiedIn(candidatesIn(lines), files)
const facts = (findings: ReturnType<typeof copiedIn>, reportText = ''): TheFactsBeforeTheSeal => ({
  runTitle: 'A made-up run',
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => false, testLinesAtTheTip: [] },
  reports: [{ id: 'report', title: 'A made-up report', data: { chaptersRead: [1], blocks: [{ type: 'text', text: reportText }] } }],
  sameTitleElsewhere: {},
  mustRead: [1],
  checkAlso: [],
  copiedTestLiterals: { findings },
})
const named = (f: TheFactsBeforeTheSeal) => whatAnInspectorWouldMostLikelyRefuse(f).items.filter((one) => one.key.startsWith('copied:'))

// ================================================================================================== the finder

describe('the finder', () => {
  it('1: a thirty-character sentence is one likely item that names both places and refuses nothing', () => {
    expect(SENTENCE).toHaveLength(30)
    const items = named(facts(find(aLine(`expect(value).toBe('${SENTENCE}')`), source(`const value = '${SENTENCE}'\n`))))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: `copied:${testPath}`, about: 'test proof', mechanical: false })
    expect(items[0]!.says).toContain(`${testPath}:7`)
    expect(items[0]!.says).toContain(`${sourcePath}:1`)
    expect(theMigrationItemsRefusingASeal(items)).toEqual([])
  })

  it('2: a twenty-nine-character sentence is not named, nor a relative path, which fails loudly when it moves', () => {
    const short = SENTENCE.slice(0, -1)
    expect(short).toHaveLength(29)
    expect(find(aLine(`expect(value).toBe('${short}')`), source(`const value = '${short}'\n`))).toEqual([])
    const path = `../src/${SENTENCE}.mjs`
    expect(find(aLine(`const read = await import('${path}')`), source(`const read = await import('${path}')\n`))).toEqual([])
    expect(find(aLine(`const read = await import('${path.slice(1)}')`), source(`const read = await import('${path.slice(1)}')\n`))).toEqual([])
  })

  it('3: a limit is named when both lines name a limit, and not otherwise', () => {
    const sql = 'const sql = `SELECT ${what} FROM rows LIMIT 200`\n'
    const found = find(aLine('expect(rows.length).toBeLessThanOrEqual(200) // the limit'), source(sql))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ path: testPath, line: 7, kind: 'number', value: '200', sources: [{ path: sourcePath, line: 1 }] })
    expect(find(aLine('expect(rows.length).toBe(200)'), source(sql))).toEqual([])
    expect(find(aLine('expect(rows.length).toBe(200)', 8), source('const rows = 200\n'))).toEqual([])
    expect(find(aLine('const limit = 200'), source('const sql = `LIMIT -200`'))).toEqual([])
    expect(find(aLine('const limit = -200'), source('const sql = `LIMIT 200`'))).toEqual([])
    expect(find(aLine('const limit = 200'), source("const sql = 'SELECT 200' // limit"))).toHaveLength(1)
    expect(find(aLine('const limit = 200'), source("const sql = 'SELECT 200'"))).toEqual([])
    expect(find(aLine('const MAX_ROWS = 200'), source('const LIMIT_ROWS = 200'))).toHaveLength(1)
    expect(find(aLine('const limit = 100'), source('const limit = 100'))).toEqual([])
  })

  it('4: another test and a generated words file are no source, and the reminder says what it did not check', () => {
    const copied = find(aLine(`expect(value).toBe('${SENTENCE}')`), [
      { path: 'tests/other.test.ts', text: `const x = '${SENTENCE}'` },
      { path: 'src/shared/words/es-made-from.ts', text: `const x = '${SENTENCE}'` },
    ])
    expect(copied).toEqual([])
    const notes = whatAnInspectorWouldMostLikelyRefuse(facts(copied)).notChecked.join(' ')
    expect(notes).toContain('generated files')
    expect(notes).toContain('src/shared/words/*-made-from.ts')
    expect(notes).toMatch(/Complex JSX.*may be missed/u)
  })

  it('6: a report line keeps the item under the same key, with its reason, and it refuses nothing', () => {
    const found = find(aLine(`expect(value).toBe('${SENTENCE}')`), source(`const x = '${SENTENCE}'`))
    const first = named(facts(found))[0]!
    const reason = 'the wording itself is what the test proves'
    const kept = named(facts(found, `${first.key}: kept, because ${reason}`))[0]!
    expect(kept.key).toBe(first.key)
    expect(kept.says).toContain(`kept, because ${reason}`)
    expect(kept.mechanical).toBe(false)
    expect(theMigrationItemsRefusingASeal([kept])).toEqual([])
  })

  it('7: unreadable git names no copied item and says so; an unread source leaves a copied item unjudged', () => {
    const f = facts([])
    f.git = { couldNotRead: 'made-up unreadable git' }
    const result = whatAnInspectorWouldMostLikelyRefuse(f)
    expect(result.items.filter((one) => one.key.startsWith('copied:'))).toEqual([])
    expect(result.notChecked.join(' ')).toContain('git could not be read')
    const copied = { key: `copied:${testPath}`, about: 'test proof' as const, says: 'A made-up item.', mechanical: false }
    const certain = { key: 'report:none', about: 'report' as const, says: 'A made-up item.', mechanical: true }
    expect(theComparableItems([copied, certain], false)).toEqual({ judged: [certain], notJudged: [copied.key] })
  })

  it('8: escapes, literal-only joins and template pieces are read; a regular expression is not', () => {
    const first = SENTENCE.slice(0, 15), second = SENTENCE.slice(15)
    const joined: Lines = [{ path: testPath, added: [{ line: 2, text: `const value = '${first}' +` }, { line: 3, text: `  '${second}'` }] }]
    expect(find(joined, source(`const value = '${SENTENCE}'`))[0]?.line).toBe(2)
    const escaped = `${SENTENCE.slice(0, 5)}\\u0066${SENTENCE.slice(6)}`
    expect(find(aLine(`const value = '${escaped}'`), source(`const value = '${SENTENCE}'`))).toHaveLength(1)
    expect(find(aLine(`const re = /"${SENTENCE}"/`), source(`const value = '${SENTENCE}'`))).toEqual([])
    expect(find(aLine(`const value = \`${SENTENCE}\${part}\``), source(`const value = '${SENTENCE}'`))).toHaveLength(1)
    expect(find(aLine(`const value = \`${first}\${part}${second}\``), source(`const value = '${SENTENCE}'`))).toEqual([])
    const animal = '🦊'
    expect(find(aLine(`const value = '${animal.repeat(29)}'`), source(`const value = '${animal.repeat(29)}'`))).toEqual([])
    expect(find(aLine(`const value = '${animal.repeat(30)}'`), source(`const value = '${animal.repeat(30)}'`))).toHaveLength(1)
  })

  it('12: a string or a template that begins with an SQL word is code and is not named; a long sentence still is', () => {
    for (const word of ['SELECT', 'insert', 'Update', 'DELETE', 'create', 'WITH', 'pragma']) {
      const sql = `  ${word} ${SENTENCE}`
      expect(find(aLine(`const sql = '${sql}'`), source(`const sql = '${sql}'\n`)), word).toEqual([])
      const template = `\`${word} \${what} FROM ${SENTENCE}\``
      expect(find(aLine(`const sql = ${template}`), source(`const sql = ${template}\n`)), word).toEqual([])
    }
    expect(find(aLine(`const x = '${SENTENCE}'`), source(`const x = '${SENTENCE}'\n`))).toHaveLength(1)
    expect(find(aLine(`const x = 'Selected ${SENTENCE}'`), source(`const x = 'Selected ${SENTENCE}'\n`))).toHaveLength(1)
  })

  it('15: a list that equals an exported list, in a named constant whose name shares a word, is named with both places', () => {
    const found = find(aLine("const MADE_UP_WORDS = ['alpha', 'beta']"), source("export const THE_MADE_UP_WORDS = ['beta', 'alpha']\n"))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      path: testPath, line: 7, kind: 'list', members: ['alpha', 'beta'],
      sources: [{ path: sourcePath, line: 1, name: 'THE_MADE_UP_WORDS' }],
    })
    const [item] = named(facts(found))
    expect(item!.says).toContain(`${testPath}:7`)
    expect(item!.says).toContain(`${sourcePath}:1`)
    expect(item!.says).toContain('THE_MADE_UP_WORDS')
    expect(item!.says).toContain('Read it from there instead')
    expect(theMigrationItemsRefusingASeal([item!])).toEqual([])
  })

  it('16: a plain number equal to an exported constant, in a constant named from the code, is named', () => {
    const found = find(aLine('const MADE_UP_BYTES = 4000'), source('export const THE_MADE_UP_BYTES = 4000\n'))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      path: testPath, line: 7, kind: 'value', value: '4000', number: 4000,
      sources: [{ path: sourcePath, line: 1, name: 'THE_MADE_UP_BYTES' }],
    })
    const [item] = named(facts(found))
    expect(item!.says).toContain('repeats the number 4000 from')
    expect(item!.says).toContain('THE_MADE_UP_BYTES')
    expect(item!.says).toContain('Read it from there instead')
  })

  it('17: an arithmetic expression of literals is folded, so 50 * 1024 * 1024 is named', () => {
    const found = find(aLine('const MADE_UP_BYTES = 50 * 1024 * 1024'), source('export const THE_MADE_UP_BYTES = 50 * 1024 * 1024\n'))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'value', value: '52428800', number: 52428800 })
    expect(named(facts(found))[0]!.says).toContain('repeats the number 52428800 from')
  })

  it('18: a list that only shares some members is not named, nor a distinct name that shares no word', () => {
    expect(find(aLine("const MADE_UP_WORDS = ['alpha', 'gamma']"), source("export const THE_MADE_UP_WORDS = ['alpha', 'beta']\n"))).toEqual([])
    expect(find(aLine("const OTHER_NAMES = ['alpha', 'beta']"), source("export const THE_MADE_UP_WORDS = ['alpha', 'beta']\n"))).toEqual([])
    expect(find(aLine('const OTHER_BYTES = 4000'), source('export const THE_MADE_UP_BYTES = 4000\n'))).toEqual([])
  })

  it('19: a small common number is not named', () => {
    expect(find(aLine('const MADE_UP_COUNT = 10'), source('export const THE_MADE_UP_COUNT = 10\n'))).toEqual([])
  })

  it('20: a list in a file that is not a test file is not named', () => {
    const lines: Lines = [{ path: 'src/made-up-other.ts', added: [{ line: 3, text: "const MADE_UP_WORDS = ['alpha', 'beta']" }] }]
    expect(find(lines, source("export const THE_MADE_UP_WORDS = ['alpha', 'beta']\n"))).toEqual([])
  })

  it('21: two- and three-member it.each lists are named', () => {
    expect(find(aLine("it.each(['alpha', 'beta'])('a made-up case', () => {})"), source("export const THE_MADE_UP_WORDS = ['alpha', 'beta']\n"))).toHaveLength(1)
    const found = find(aLine("it.each(['alpha', 'beta', 'gamma'])('a made-up case', () => {})"), source("export const THE_MADE_UP_WORDS = ['alpha', 'beta', 'gamma']\n"))
    expect(found).toHaveLength(1)
    expect(found[0]!.kind).toBe('list')
  })

  it('23: frozen exported arrays and Sets are sources', () => {
    for (const value of ["Object.freeze(['alpha', 'beta'])", "Object.freeze(new Set(['alpha', 'beta']))"]) {
      const found = find(aLine("const MADE_UP_WORDS = ['alpha', 'beta']"), source(`export const THE_MADE_UP_WORDS = ${value}\n`))
      expect(found).toHaveLength(1)
      expect(found[0]!.sources[0]!.name).toBe('THE_MADE_UP_WORDS')
    }
  })

  it('24: inline clearance and body-box numbers are found in plugin source', () => {
    const lines = [{ path: 'plugins/made-up/tests/layout.test.ts', added: [
      { line: 1, text: 'const clear = distance >= 96' },
      { line: 2, text: 'const box = { x: point.x - 59, y: point.y - 120, width: 118, height: 122 }' },
    ] }]
    const files = source('export function clear(distance) { return distance >= 96 }\nexport const bodyBox = point => ({ x: point.x - 59, y: point.y - 120, width: 118, height: 122 })\n', 'plugins/made-up/src/layout.ts')
    const found = find(lines, files)
    expect(found.some((one) => one.line === 1 && one.sources.some((s) => s.line === 1))).toBe(true)
    expect(found.some((one) => one.line === 2 && one.sources.some((s) => s.line === 2))).toBe(true)
  })
})

// ================================================================================================== git

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
/** Commit everything at a given author time, in seconds since 1970. */
function commitAt(dir: string, seconds: number, message: string): string {
  git(dir, 'add', '.')
  execFileSync('git', ['-C', dir, 'commit', '-qm', message], { env: { ...process.env, GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` } })
  return git(dir, 'rev-parse', 'HEAD').trim()
}

/** The folder of this file's own, under the system's temporary folder, that every repository here is made in. */
let own = ''
let repositories = 0
beforeAll(() => {
  own = mkdtempSync(join(tmpdir(), 'mole-office-copied-words-'))
})
afterAll(() => {
  if (own !== '') rmSync(own, { recursive: true, force: true })
})
function aRepository(): string {
  const dir = join(own, `repository-${(repositories += 1)}`)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic copied-words test')
  git(dir, 'config', 'user.email', 'copied-words@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  return dir
}

it('25: the captured tip reads plugin source', async () => {
  const dir = aRepository()
  write(dir, 'plugins/made-up/src/layout.ts', 'export const bodyBox = point => ({ x: point.x - 59, y: point.y - 120, width: 118, height: 122 })\n')
  const tip = commitAt(dir, 1_000_000, 'Synthetic plugin source')
  const lines: Lines = [{ path: 'plugins/made-up/tests/layout.test.ts', added: [{ line: 1, text: 'const box = { x: point.x - 59, y: point.y - 120, width: 118, height: 122 }' }] }]
  const result = await theCopiedTestLiteralsAt(dir, tip, lines)
  expect('findings' in result && result.findings.some((f) => f.sources.some((s) => s.path === 'plugins/made-up/src/layout.ts'))).toBe(true)
})

describe('the lines and the code, read from git', () => {
  it('26: a changed plugin test reaches the reminder through the real Git selection', async () => {
    const dir = aRepository()
    const pluginSource = 'plugins/made-up/src/layout.ts'
    const earlierTest = 'plugins/made-up/tests/earlier.test.ts'
    const changedTest = 'plugins/made-up/tests/layout.test.ts'
    write(dir, pluginSource, `export const value = '${SENTENCE}'\n`)
    const base = commitAt(dir, 1_000_000, 'Synthetic base')
    write(dir, earlierTest, `const x = '${SENTENCE}'\n`)
    commitAt(dir, 1_000_100, 'Synthetic earlier commit')
    write(dir, changedTest, `const x = '${SENTENCE}'\n`)
    write(dir, 'plugins/made-up/src/not-a-test.ts', 'export const other = 123\n')
    const tip = commitAt(dir, 1_000_600, 'Synthetic run commit')
    const selected = theCommitsReadWith((...args) => git(dir, ...args), base, tip, 1_000_500_000)
    expect((selected.testLinesAtTheTip ?? []).map((one) => one.path)).toEqual([changedTest])
    const result = await theCopiedTestLiteralsAt(dir, tip, selected.testLinesAtTheTip ?? [])
    expect('findings' in result ? result.findings.map((one) => ({ path: one.path, sources: one.sources })) : result)
      .toEqual([{ path: changedTest, sources: [{ path: pluginSource, line: 1 }] }])
  })

  it("5: only the run's own added lines are checked, beside an earlier test that copies the same sentence", () => {
    const dir = aRepository()
    write(dir, sourcePath, `const x = '${SENTENCE}'\n`)
    const base = commitAt(dir, 1_000_000, 'Synthetic base')
    git(dir, 'switch', '-qc', 'worker')
    write(dir, 'tests/earlier.test.ts', `const x = '${SENTENCE}'\n`)
    commitAt(dir, 1_000_100, 'Synthetic earlier commit')
    write(dir, testPath, `const y = '${SENTENCE}'\n`)
    const tip = commitAt(dir, 1_000_600, 'Synthetic run commit')
    const read = theCommitsReadWith((...args) => git(dir, ...args), base, tip, 1_000_500_000)
    expect(copiedIn(candidatesIn(read.testLinesAtTheTip ?? []), source(`const x = '${SENTENCE}'`)).map((one) => one.path)).toEqual([testPath])
  })

  it('9: the code is read at the tip, not in the worktree, and unreadable git is said', async () => {
    const dir = aRepository()
    write(dir, sourcePath, `const x = '${SENTENCE}'\n`)
    const tip = commitAt(dir, 1_100_000, 'Synthetic tip')
    write(dir, sourcePath, "const x = 'the worktree has other words in it'\n")
    const read = await theCopiedTestLiteralsAt(dir, tip, aLine(`const x = '${SENTENCE}'`))
    expect('findings' in read ? read.findings.map((one) => one.sources) : read).toEqual([[{ path: sourcePath, line: 1 }]])
    expect(await theCopiedTestLiteralsAt(join(dir, 'absent'), tip, aLine('const n = 7'))).toEqual({ findings: [] })
    expect(await theCopiedTestLiteralsAt(join(dir, 'absent'), tip, aLine(`const x = '${SENTENCE}'`))).toHaveProperty('couldNotRead')
  })

  it("13: the code is read without holding the server's thread, so another request is answered while it reads", async () => {
    const dir = aRepository()
    // FILES WHOSE MATCHING IS SLOW, as on the real code, where matching takes about three times as long as git. Each is
    // a chain of 400 short strings joined by +, which the finder joins again from every start. One file holds the sentence.
    const chain = Array.from({ length: 400 }, (_, i) => `'m${i}'`).join(' + ')
    for (let i = 0; i < 12; i++) write(dir, `src/made-up-${i}.ts`, `export const made_up = ${chain}\n`)
    write(dir, sourcePath, `const x = '${SENTENCE}'\n`)
    const tip = commitAt(dir, 1_200_000, 'Synthetic large tip')
    const server = createServer((_, reply) => reply.end('answered'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const order: string[] = []
      // THE LONGEST HOLD: the longest time between two turns of the thread while the code is read.
      let reading = true, last = performance.now(), longest = 0
      const turn = (): void => { const now = performance.now(); longest = Math.max(longest, now - last); last = now; if (reading) setImmediate(turn) }
      const started = performance.now()
      setImmediate(turn)
      const read = Promise.resolve(theCopiedTestLiteralsAt(dir, tip, aLine(`const x = '${SENTENCE}'`))).then((one) => { reading = false; order.push('the code read'); return one })
      const asked = new Promise<string>((resolve, reject) => {
        get({ host: '127.0.0.1', port, path: '/' }, (reply) => { let body = ''; reply.on('data', (chunk) => (body += chunk)); reply.on('end', () => resolve(body)) }).on('error', reject)
      }).then((body) => { order.push(`another request ${body}`) })
      const [found] = await Promise.all([read, asked])
      const took = performance.now() - started
      expect(order).toEqual(['another request answered', 'the code read'])
      expect('findings' in found ? found.findings.map((one) => one.sources) : found).toEqual([[{ path: sourcePath, line: 1 }]])
      expect(longest, `the thread was held ${Math.round(longest)} ms at once, of ${Math.round(took)} ms of reading`).toBeLessThan(took / 2)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  }, 60_000)

  it('14: the thread turns while git is read, before the first file is matched, and again between each two files', async () => {
    const dir = aRepository()
    for (let i = 0; i < 4; i++) write(dir, `src/made-up-${i}.ts`, `export const made_up_${i} = 'm${i}'\n`)
    write(dir, sourcePath, `const x = '${SENTENCE}'\n`)
    const tip = commitAt(dir, 1_300_000, 'Synthetic tip of five files')
    // A TICKER THAT COUNTS THE THREAD'S TURNS: it runs once each time the thread is let go, until the reading ends.
    let reading = true
    const turn = (): void => { theReads.turns += 1; if (reading) setImmediate(turn) }
    Object.assign(theReads, { counting: true, turns: 0, at: [] })
    setImmediate(turn)
    try {
      const found = await theCopiedTestLiteralsAt(dir, tip, aLine(`const x = '${SENTENCE}'`))
      expect('findings' in found ? found.findings.map((one) => one.sources) : found).toEqual([[{ path: sourcePath, line: 1 }]])
    } finally {
      reading = false
      theReads.counting = false
    }
    const at = theReads.at
    expect(at, 'the finder was not given the five files, so this case would prove nothing').toHaveLength(5)
    expect(at[0], 'the thread never turned while git was read, before the first file was matched').toBeGreaterThan(0)
    expect(at.slice(1).filter((turns, i) => turns === at[i]), `two files were matched with no turn of the thread between them (turns at each file: ${at.join(', ')})`).toEqual([])
  })
})

// ================================================================================================== the seal

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-whose-test-copies-the-code'

let t: TestDb
let app: FastifyInstance
/** Imported once the made-up office is open, because the module opens the database it names. */
let theCopiedTestLiteralsAt: typeof import('../src/server/lib/before-the-seal.ts')['theCopiedTestLiteralsAt']

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

/**
 * A run filed by the office's worker at commit A, with commit B on its branch adding the code's sentence to
 * src/made-up.ts and a test with these lines, as a round adds code and the test of it in one go.
 */
async function aRunWhoseTestSays(lines: string[], sourceText = `export const THE_WORDS = '${SENTENCE}'\n`): Promise<{ id: string; key: string; b: string }> {
  const dir = aRepository()
  write(dir, 'work/a.txt', 'before\n')
  const a = commitAt(dir, Math.floor(Date.now() / 1000) - 60, 'Synthetic commit A')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic run whose test copies the code',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: PanelRecord; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  write(dir, sourcePath, sourceText)
  write(dir, testPath, `${lines.join('\n')}\n`)
  return { id: body.record.id, key, b: commitAt(dir, Math.ceil(Date.now() / 1000) + 1, 'Synthetic commit B') }
}

const theFinish = (tip: string) => ({ dataPatch: { state: 'finished', tip } })

/** The copied items the reminder's reply named. */
function theCopiedItems(reply: { json: () => unknown }): { key: string; says: string; mechanical?: boolean }[] {
  const items = (reply.json() as { beforeTheSeal?: { items?: { key: string; says: string; mechanical?: boolean }[] } }).beforeTheSeal?.items
  expect(items, 'the first finish gave no reminder, so this file would prove nothing').toBeDefined()
  return items!.filter((one) => one.key.startsWith('copied:'))
}

beforeAll(async () => {
  t = await freshDb()
  theCopiedTestLiteralsAt = (await import('../src/server/lib/before-the-seal.ts')).theCopiedTestLiteralsAt
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work', 'src', 'tests'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('the seal', () => {
  it("10: a test that copies the code's sentence is named with both places; one that reads the code's export is not", async () => {
    const copies = await aRunWhoseTestSays(['const said = sayIt()', `expect(said).toBe('${SENTENCE}')`])
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${copies.id}`, headers: asTheRun(copies.id, copies.key), payload: theFinish(copies.b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const items = theCopiedItems(first)
    expect(items.map((one) => one.key)).toEqual([`copied:${testPath}`])
    expect(items[0]!.says).toContain(`${testPath}:2`)
    expect(items[0]!.says).toContain(`${sourcePath}:1`)
    expect(items[0]!.mechanical).toBe(false)

    const reads = await aRunWhoseTestSays(["import { THE_WORDS } from '../src/made-up.ts'", 'expect(sayIt()).toBe(THE_WORDS)'])
    const other = await app.inject({ method: 'PATCH', url: `/api/records/${reads.id}`, headers: asTheRun(reads.id, reads.key), payload: theFinish(reads.b) })
    expect(other.statusCode, other.body.slice(0, 600)).toBe(200)
    expect(theCopiedItems(other)).toEqual([])
  })

  it('22: through the records door, a copied list and a copied number are both named before the seal', async () => {
    const copies = await aRunWhoseTestSays(
      ["const MADE_UP_WORDS = ['beta', 'alpha']", 'const MADE_UP_BYTES = 50 * 1024 * 1024'],
      "export const MADE_UP_WORDS = ['alpha', 'beta']\nexport const MADE_UP_BYTES = 50 * 1024 * 1024\n",
    )
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${copies.id}`, headers: asTheRun(copies.id, copies.key), payload: theFinish(copies.b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const [item] = theCopiedItems(first)
    expect(item!.key).toBe(`copied:${testPath}`)
    expect(item!.says).toContain(`${testPath}:1`)
    expect(item!.says).toContain(`${testPath}:2`)
    expect(item!.says).toContain(`${sourcePath}:1`)
    expect(item!.says).toContain(`${sourcePath}:2`)
    expect(item!.says).toContain('MADE_UP_WORDS')
    expect(item!.says).toContain('MADE_UP_BYTES')
    expect(item!.says).toContain('Read it from there instead')
    expect(item!.mechanical).toBe(false)
  })

  it('11: at block, a run whose test copies the code still seals, and the seal records the item as still found', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    try {
      const { id, key, b } = await aRunWhoseTestSays([`expect(sayIt()).toBe('${SENTENCE}')`])
      const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
      expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
      const [item] = theCopiedItems(first)
      expect(item?.key).toBe(`copied:${testPath}`)
      expect(t.api.getRecord(id)!.data['sealedTip']).toBeUndefined()
      // THE CERTAIN ITEMS ANSWERED, as a run at block must, so only the likely items stand at the seal: a report in form.
      await aReportInForm(t, id, HANDLE)
      const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
      expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
      expect(t.api.getRecord(id)!.data['sealedTip']).toEqual(expect.any(String))
      const held = t.api.getRecord(id)!.data['remindedBeforeTheSeal'] as { atTheSeal?: { stillFound?: string[] } }
      expect(held.atTheSeal?.stillFound).toContain(item!.key)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
