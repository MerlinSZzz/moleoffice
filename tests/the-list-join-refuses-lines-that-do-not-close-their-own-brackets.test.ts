// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LIST JOIN NEVER PUTS ONE SIDE'S LINES INSIDE THE OTHER SIDE'S NEW BLOCK (wave 13u round 62). When main adds a column
 * at the end of a table and a new table after it, git's diff may lay main's new table's closing line against the old
 * table's. Main's added lines are then a column, the old table's closing line and the new table's head, and the join,
 * which puts the entry's added lines after main's, put the entry's column into main's new table with no line red. The
 * join now refuses a hunk where one side's added lines at one place close a bracket they did not open or leave one
 * open. Git's conflict then stands and the entry goes back to its own line, as any refused hunk does.
 *
 * WHAT THIS FILE PROVES:
 * 1. On the real src/server/db/schema.ts, that hunk is refused, the rebase in a clone with the driver stops there, and
 *    the early probe does not call the stop one the rebase may join.
 * 2. A side whose added lines leave a bracket open is refused too.
 * 3. Two plain lines added at the end of one list still join, and a comment line among them is not counted.
 * 4. Four more files are list files: src/shared/kinds.ts, src/shared/surfaces.ts, tests/how-long-a-test-may-take.ts and
 *    tests/the-test-lists.ts. In each, two entries added at one place are joined and the joined file still parses. In
 *    tests/the-test-lists.ts, whose entries are blocks of several lines, the shape of point 1 is refused. Since the
 *    split of kinds.ts into files, each kind it hands on is one export line, and two exports of one line added after a
 *    real one are joined. The case also puts one made-up block of several lines into that list, so that the shape of
 *    point 1 is still tried on kinds.ts, and it is refused there.
 * 5. src/server/db/schema-parts/index.ts is a list file as schema.ts is (wave 13u round 73). Wave 13s round 89 makes it,
 *    in merge entry 9WupbqB4Ae8I, and this tree's main has none yet, so its text here is made up, in the shape 13s's
 *    report gives it: one line for each part file. While main has no such file, an entry that makes it lands it as the
 *    entry wrote it; once main has it, two part lines added at one place join in a real rebase. Two part lines added at
 *    the end join and parse, and a side whose added lines leave a bracket open is refused.
 *
 * MUTATIONS, each alone in tools/merge-tool/list-join.mjs, each restored byte for byte:
 * - the bracket check is not called: cases 1 and 2, and the refused shapes of case 4, red;
 * - a line that closes a bracket the lines did not open is let through: case 1 red;
 * - lines that leave a bracket open are let through: case 2 red;
 * - a line that is wholly a comment is counted: the comment line of case 3 red;
 * - one of the four files is taken off THE_LIST_FILES: its case red;
 * - src/server/db/schema-parts/index.ts is taken off THE_LIST_FILES: both cases of point 5 red.
 */
import {execFileSync, spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterEach, describe, expect, it} from 'vitest'
import {canItJoin} from '../tools/merge-tool/early-conflicts.mjs'
import {LIST_JOINS_SAID, LIST_JOIN_REFUSED, THE_RULES, howAFileJoins, joinOneHunk, joinTheListTexts, joinTheListsInThisClone, theThreeWayMergeOfTexts} from '../tools/merge-tool/list-join.mjs'
import {aTestAddress} from './the-test-commit-address.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}) })

const SCHEMA = 'src/server/db/schema.ts'
const textOf = (path: string) => readFileSync(join(REPO, path), 'utf8')
const linesOf = (path: string) => textOf(path).split('\n')
const put = (lines: string[], at: number, added: string[]) => [...lines.slice(0, at), ...added, ...lines.slice(at)]
/** The index of the first line from `from` on that `found` accepts; a test whose anchor has gone fails here, saying which. */
function lineWhere(lines: string[], what: string, found: (line: string, i: number) => boolean, from = 0) {
  const at = lines.findIndex((line, i) => i >= from && found(line, i))
  if (at < 0) throw Error(`The anchor of this case is no longer in the file: ${what}`)
  return at
}
/** Whether a TypeScript text parses: Node's own type stripper throws on a syntax error. */
function parses(text: string) {
  stripTypeScriptTypes(text)
  return true
}

/** schema.ts with main's column and new table after the first table, and the entry's column at the end of that table. */
function theSchemaSides() {
  const ancestor = linesOf(SCHEMA)
  const table = lineWhere(ancestor, 'the first sqliteTable', (line) => line.startsWith('export const ') && line.includes('sqliteTable('))
  const end = lineWhere(ancestor, "the first table's closing line", (line) => /^\}/.test(line), table)
  const main = put(put(ancestor, end + 1, ['', "export const madeUpForATest = sqliteTable('made_up_for_a_test', {", "  id: text('id').primaryKey(),", ancestor[end]!]), end, ["  mainColumn: text('main_column'),"])
  const entry = put(ancestor, end, ["  entryColumn: text('entry_column'),"])
  return {ancestor: ancestor.join('\n'), main: main.join('\n'), entry: entry.join('\n'), closer: ancestor[end]!}
}

describe('the shape that put a column into another table', () => {
  it('is refused on the real schema.ts, naming the line that closes a bracket main\'s lines did not open', () => {
    const {ancestor, main, entry, closer} = theSchemaSides()
    expect(theThreeWayMergeOfTexts(SCHEMA, ancestor, main, entry).conflicts, 'git alone stops on it').toBe(true)
    const joined = joinTheListTexts(SCHEMA, ancestor, main, entry)
    if (!('refused' in joined)) throw Error(`It was joined, with the entry's column after main's new table head:\n${joined.text.split('\n').filter((line) => /mainColumn|entryColumn|madeUpForATest|^\}/.test(line)).slice(0, 8).join('\n')}`)
    expect(joined.refused).toContain(`${SCHEMA} at line `)
    expect(joined.refused).toContain(`by ${THE_RULES.added}: main's added lines close a bracket they did not open, at \`${closer.trim()}\``)
  })

  it('stops the rebase in a clone with the driver, and the early probe does not call it a stop the rebase may join', () => {
    const {ancestor, main, entry} = theSchemaSides()
    const root = mkdtempSync(join(tmpdir(), 'synthetic-bracket-join-'))
    roots.push(root)
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim()
    const write = (text: string) => { mkdirSync(dirname(join(root, SCHEMA)), {recursive: true}); writeFileSync(join(root, SCHEMA), text) }
    const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
    git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
    write(ancestor); commit('Synthetic base')
    git('checkout', '-qb', 'entry'); write(entry); const tip = commit('Synthetic entry adds a column')
    git('checkout', '-q', 'main'); write(main); const mainTip = commit('Synthetic main adds a column and a table')
    const probe = (cwd: string, args: string[]) => { const r = spawnSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}); return {status: r.status, stdout: r.stdout, stderr: r.stderr} }
    expect(canItJoin(root, mainTip, tip, probe)).not.toHaveProperty('mayJoin')
    git('checkout', '-q', 'entry')
    joinTheListsInThisClone(root, (pair: string[]) => git('config', ...pair))
    expect(spawnSync('git', ['-C', root, 'rebase', '--quiet', mainTip], {encoding: 'utf8'}).status).not.toBe(0)
    expect(git('diff', '--name-only', '--diff-filter=U')).toBe(SCHEMA)
    const refused = join(root, '.git', LIST_JOIN_REFUSED)
    expect(existsSync(refused) ? readFileSync(refused, 'utf8') : '').toContain("main's added lines close a bracket they did not open")
    git('rebase', '--abort')
  })

  it('refuses a side whose added lines leave a bracket open, naming the line that opened it', () => {
    const parts = {main: ['  madeUp: {', '    deep: 1,'], ancestor: [], entry: ['    other: 2,']}
    expect(joinOneHunk('src/shared/refusal-codes.ts', 7, parts)).toEqual({refused: `src/shared/refusal-codes.ts at line 7 was not joined by ${THE_RULES.added}: main's added lines leave a bracket open, from \`madeUp: {\`; a join there could put the other side's lines inside another entry, so it was left to git.`})
    const mirrored = {main: ['    other: 2,'], ancestor: [], entry: ['  madeUp: {', '    deep: 1,']}
    expect(joinOneHunk('src/shared/refusal-codes.ts', 7, mirrored)).toMatchObject({refused: expect.stringContaining("the entry's added lines leave a bracket open")})
  })
})

describe('what still joins', () => {
  const codes = (...keys: string[]) => `export const SOME_REFUSAL_CODES = {\n${keys.map((key) => `  ${key}: {},\n`).join('')}} as const\n`

  it('joins two plain lines added at the end of one list', () => {
    expect(joinTheListTexts('src/shared/refusal-codes.ts', codes('a'), codes('a', 'fromMain'), codes('a', 'fromEntry'))).toEqual({
      text: codes('a', 'fromMain', 'fromEntry'), joined: ["src/shared/refusal-codes.ts at line 3: main's 1 added line and then the entry's 1"], rules: [THE_RULES.added],
    })
  })

  it('does not count a line that is wholly a comment, though it holds a bracket', () => {
    const withComment = codes('a', 'fromMain').replace('  fromMain', '  /** Made up: this comment opens one bracket ( and closes none. */\n  fromMain')
    const joined = joinTheListTexts('src/shared/refusal-codes.ts', codes('a'), withComment, codes('a', 'fromEntry'))
    if (!('text' in joined)) throw Error(joined.refused)
    expect(joined.text).toBe(withComment.replace('  fromMain: {},\n', '  fromMain: {},\n  fromEntry: {},\n'))
  })
})

/** Joins `main` and `entry`, each the file with lines added at one place, and checks the join keeps both, main's first, and parses. */
function joinsAndParses(path: string, ancestor: string[], at: number, mainAdds: string[], entryAdds: string[]) {
  expect(howAFileJoins(path)).toBe('list')
  expect(parses(ancestor.join('\n')), 'the file parses before the join').toBe(true)
  const joined = joinTheListTexts(path, ancestor.join('\n'), put(ancestor, at, mainAdds).join('\n'), put(ancestor, at, entryAdds).join('\n'))
  if (!('text' in joined)) throw Error(joined.refused)
  expect(joined.text).toBe(put(ancestor, at, [...mainAdds, ...entryAdds]).join('\n'))
  expect(parses(joined.text), 'the joined file parses').toBe(true)
}

describe('the four files added to the list', () => {
  it('src/shared/kinds.ts: two exports of one line join after a real one, two blocks join after a made-up block, and a property with a block after it against a property is refused', () => {
    const path = 'src/shared/kinds.ts'
    const ancestor = linesOf(path)
    const moved = lineWhere(ancestor, 'the comment above the kinds it hands on', (line) => line.startsWith('// THE KINDS THAT HAVE MOVED TO src/shared/kinds/'))
    const table = lineWhere(ancestor, 'the first kind file it hands on', (line) => /^export \* from '\.\/kinds\/[a-z-]+\.ts'$/.test(line), moved)
    joinsAndParses(path, ancestor, table + 1, ["export * from './kinds/made-up-by-main.ts'"], ["export * from './kinds/made-up-by-the-entry.ts'"])
    const kind = (name: string) => [`const ${name} = {`, `  kind: '${name}',`, "  purpose: 'Made up for a test.',", '  fields: [],', '}']
    const withABlock = put(ancestor, table + 1, kind('madeUpFirst'))
    const end = lineWhere(withABlock, "the made-up block's closing line", (line) => line === '}', table + 1)
    joinsAndParses(path, withABlock, end + 1, kind('madeUpByMain'), kind('madeUpByTheEntry'))
    const rotated = joinTheListTexts(path, withABlock.join('\n'), put(put(withABlock, end + 1, kind('madeUpByMain')), end, ['  mainProperty: 1,']).join('\n'), put(withABlock, end, ['  entryProperty: 2,']).join('\n'))
    expect(rotated).toMatchObject({refused: expect.stringContaining("main's added lines close a bracket they did not open")})
  })

  it('src/shared/surfaces.ts: two surfaces added at the end of the list join', () => {
    const path = 'src/shared/surfaces.ts'
    const ancestor = linesOf(path)
    const list = lineWhere(ancestor, 'the list of surfaces', (line) => /^export const SURFACES\b/.test(line))
    const end = lineWhere(ancestor, "the list's closing line", (line) => line.startsWith('} as const'), list)
    joinsAndParses(path, ancestor, end, ["  'made.up.by.main': 'Made up by main',"], ["  'made.up.by.the.entry': 'Made up by the entry',"])
  })

  it('tests/how-long-a-test-may-take.ts: two starters added at the end of the list join', () => {
    const path = 'tests/how-long-a-test-may-take.ts'
    const ancestor = linesOf(path)
    const list = lineWhere(ancestor, 'the list of starters', (line) => /^export const STARTERS\b/.test(line))
    const end = lineWhere(ancestor, "the list's closing line", (line) => line === ']', list)
    joinsAndParses(path, ancestor, end, ["  { name: 'madeUpByMain', from: null, starts: 'a made-up process' },"], ["  { name: 'madeUpByTheEntry', from: null, starts: 'a made-up process' },"])
  })

  it('tests/the-test-lists.ts: two key forms of several lines added at the end of the list join, and the shifted shape is refused', () => {
    const path = 'tests/the-test-lists.ts'
    const ancestor = linesOf(path)
    const list = lineWhere(ancestor, 'the list of key forms', (line) => /^export const EVERY_KEY_FORMS\b/.test(line))
    const end = lineWhere(ancestor, "the list's closing line", (line) => line === ']', list)
    const form = (name: string) => ['  {', `    form: '${name}',`, `    example: '${name}()',`, '    related: false,', '  },']
    joinsAndParses(path, ancestor, end, form('madeUpByMain'), form('madeUpByTheEntry'))
    const shifted = joinTheListTexts(path, ancestor.join('\n'), put(put(ancestor, end, form('madeUpByMain')), end - 1, ["    mainProperty: 'm',"]).join('\n'), put(ancestor, end - 1, ["    entryProperty: 'e',"]).join('\n'))
    expect(shifted).toMatchObject({refused: expect.stringContaining("main's added lines close a bracket they did not open")})
  })
})

describe('src/server/db/schema-parts/index.ts, which wave 13s round 89 makes', () => {
  const PARTS = 'src/server/db/schema-parts/index.ts'
  /** Made up, in the shape 13s's report gives the file: one line for each part file. The real one is not on this tree's main. */
  const madeUp = (...parts: string[]) => ['/** Synthetic: made up for a test, in the shape of the parts of the schema. */', ...parts.map((part) => `export * from './${part}.ts'`), '']
  const partLine = (part: string) => `export * from './${part}.ts'`

  it('joins two part files added at the end and the file parses, and refuses a side whose added lines leave a bracket open', () => {
    const ancestor = madeUp('made-up-first')
    joinsAndParses(PARTS, ancestor, 2, [partLine('made-up-by-main')], [partLine('made-up-by-the-entry')])
    const open = joinTheListTexts(PARTS, ancestor.join('\n'), put(ancestor, 2, ['export {', '  madeUpByMain,']).join('\n'), put(ancestor, 2, [partLine('made-up-by-the-entry')]).join('\n'))
    expect(open).toMatchObject({refused: expect.stringContaining("main's added lines leave a bracket open, from `export {`")})
  })

  it('lands the file as an entry made it while main has none, and joins two part lines once main has it', () => {
    const root = mkdtempSync(join(tmpdir(), 'synthetic-schema-parts-join-'))
    roots.push(root)
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim()
    const write = (path: string, lines: string[]) => { mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), lines.join('\n')) }
    const commit = (message: string) => { git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD') }
    const said = (name: string) => (existsSync(join(root, '.git', name)) ? readFileSync(join(root, '.git', name), 'utf8') : '')
    git('init', '-qb', 'main'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', aTestAddress('fixture'))
    write(SCHEMA, ['/** Synthetic: made up for a test. */', 'export const MADE_UP = 1', '']); commit('Synthetic base')
    git('checkout', '-qb', 'makes-it'); write(PARTS, madeUp('made-up-first')); commit('Synthetic entry makes the parts file')
    git('checkout', '-q', 'main'); write('src/made-up.ts', ['export const ELSEWHERE = 1', '']); const mainTip = commit('Synthetic main changes another file')
    git('checkout', '-q', 'makes-it')
    joinTheListsInThisClone(root, (pair: string[]) => git('config', ...pair))
    expect(spawnSync('git', ['-C', root, 'rebase', '--quiet', mainTip], {encoding: 'utf8'}).status, 'the entry that makes the file lands on a main without it').toBe(0)
    expect(readFileSync(join(root, PARTS), 'utf8')).toBe(madeUp('made-up-first').join('\n'))
    expect(said(LIST_JOIN_REFUSED)).toBe('')

    git('checkout', '-q', 'main'); git('merge', '-q', '--ff-only', 'makes-it')
    git('checkout', '-qb', 'adds-a-part'); write(PARTS, madeUp('made-up-first', 'made-up-by-the-entry')); commit('Synthetic entry adds a part')
    git('checkout', '-q', 'main'); write(PARTS, madeUp('made-up-first', 'made-up-by-main')); const mainHasIt = commit('Synthetic main adds a part')
    git('checkout', '-q', 'adds-a-part')
    const rebase = spawnSync('git', ['-C', root, 'rebase', '--quiet', mainHasIt], {encoding: 'utf8'})
    expect(rebase.status, `${said(LIST_JOIN_REFUSED)}${rebase.stderr}`).toBe(0)
    expect(readFileSync(join(root, PARTS), 'utf8')).toBe(madeUp('made-up-first', 'made-up-by-main', 'made-up-by-the-entry').join('\n'))
    expect(said(LIST_JOINS_SAID)).toContain(`joined ${PARTS} at line 3: main's 1 added line and then the entry's 1`)
  })
})
