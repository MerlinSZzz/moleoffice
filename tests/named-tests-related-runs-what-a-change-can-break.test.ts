// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * --list related RUNS THE TEST FILES A CHANGE CAN BREAK, WITH THE WHOLE-TREE LIST, AND NEVER THE WHOLE SUITE.
 *
 * `node tools/run-named-tests.mjs --list related` works out, with tools/related-tests.mjs, every test file that
 * imports a file the change from the merge-base with origin/main to HEAD touched, directly or through other modules,
 * and runs those with the whole-tree list (wave 13j, round 45). Each case here makes a small git checkout of its own
 * in a temporary folder, gives it an origin/main with `git update-ref`, commits a change on top, and asks the tool to
 * --print what it would run there with --root. Nothing is run and this checkout's tests/ are never read.
 *
 * The checkout has twelve test files in its tests folder, so the most --list related runs there is three (a quarter):
 *   - direct.test.ts imports src/thing.ts; through.test.ts imports src/middle.ts, which imports it;
 *   - whole.test.ts imports nothing, and the checkout's own the-test-lists.ts prints it as the whole-tree list;
 *   - nine more import nothing.
 * The two door cases add, on the base, a door of the whole app (THE_DOORS_OF_THE_WHOLE_APP in tools/related-tests.mjs):
 * src/server/index.ts imports thing, and door.test.ts reaches thing only through it. A refused list does not count
 * the files that reach a change only through a door, and says so; a list that is not refused counts them as before
 * (wave 13r round 10, HPXHSI_b_Tqq).
 *
 * MUTATION PROOF, 10 October 2026, each alone, after a control run (the commit message has the logs):
 * - theRelatedTests in tools/related-tests.mjs made to answer an empty Map: the importer case goes red, and so does
 *   the refusal case, because then no change reaches every file;
 * - the refusal for a change that reaches every test file taken out of tools/run-named-tests.mjs: the refusal case goes
 *   red (the quarter bound still refuses, in other words);
 * - the line that adds the whole-tree list to --list related taken out: the whole-tree case goes red.
 * Round 45b, 10 October 2026, after a control run: the `else if (all > most)` branch of takeTheRelatedList deleted,
 * so only the every-file refusal is left. The quarter case goes red, because 4 of 13 files is not every file.
 * Wave 13v round 17, 10 October 2026, after a control run: --base read and then not passed on, so the list works from
 * origin/main again. The --base case goes red, because the change to thing below the named commit reaches direct.test.ts.
 *
 * THE COUNT AFTER THE CUT (wave 13n round N, item 2b). With --leave-out-slower-than, the sentence that says how many
 * files run counted them before the slow files were left out: "2 files run" where 1 ran (13u round 67's drill, report
 * wCw2SUcedwab). The case before the last leaves one file out and reads the count from the files printed.
 *
 * A CHANGE TO EVERY KEY OF A LARGE TABLE (wave 13u round 151). Each changed key of a table owes its own name, and the
 * change that added a language's words changed 10,441 keys. The walk held each key's way as states of its own, ran
 * out of the 4 GB heap after 57 seconds and stopped with SIGABRT, so the merge queue ran the whole suite without
 * knowing why. The last case changes each of 4,000 keys of a table that 250 functions hand on, one after the other,
 * and works out the list with a heap of 128 MB, a thirty-second of the default. Before the fix it stopped with SIGABRT
 * there after about 1.4 seconds; with a 4 GB heap it listed the same two files.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const TOOL = join(import.meta.dirname, '..', 'tools', 'run-named-tests.mjs')
const UNRELATED = Array.from({ length: 9 }, (_, i) => `tests/unrelated-${i + 1}.test.ts`)

let root = ''

/** Writes a file under the case's checkout, making its folders. */
function put(path: string, text: string): void {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}

function git(...words: string[]): string {
  return execFileSync('git', ['-C', root, '-c', 'gc.auto=0', '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...words], { encoding: 'utf8' })
}

/** Commits everything in the checkout as one commit. */
function commit(message: string): void {
  git('add', '-A')
  git('commit', '-q', '-m', message)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'related-tests-'))
  git('init', '-q', '-b', 'work')
  put('vitest.config.ts', 'export default {}\n')
  put('package.json', '{ "type": "module" }\n')
  put('src/thing.ts', 'export function thing() {\n  return 1\n}\n\nexport function other() {\n  return 2\n}\n')
  put('src/middle.ts', "import { thing } from './thing.ts'\n\nexport function middle() {\n  return thing() + 1\n}\n")
  put('tests/direct.test.ts', "import { thing } from '../src/thing.ts'\n\ntest('thing', () => expect(thing()).toBe(1))\n")
  put('tests/through.test.ts', "import { middle } from '../src/middle.ts'\n\ntest('middle', () => expect(middle()).toBe(2))\n")
  put('tests/whole.test.ts', "test('whole', () => {})\n")
  for (const path of UNRELATED) put(path, "test('alone', () => {})\n")
  put('tests/the-test-lists.ts', "if (process.argv[2] === 'whole-tree') console.log('tests/whole.test.ts')\n")
  commit('the base')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A door of the whole app that imports thing, and a test that reaches thing only through it. */
function putTheDoor(): void {
  put('src/server/index.ts', "import { thing } from '../thing.ts'\n\nexport function serve() {\n  return thing()\n}\n")
  put('tests/door.test.ts', "import { serve } from '../src/server/index.ts'\n\ntest('door', () => expect(serve()).toBe(1))\n")
}

/** What a refused list says in place of a count of the files through a door, which it did not make. */
const NOT_COUNTED = 'The test files that reach the change only by starting the whole server or building the whole page were not counted, because the list is refused.'

/** What `--list related --print` says over the case's checkout, with node's own flags, if any, before the tool. */
function printRelatedWith(flags: string[], ...more: string[]) {
  const ran = spawnSync(process.execPath, [...flags, TOOL, '--list', 'related', '--print', '--root', root, ...more], { cwd: root, encoding: 'utf8' })
  const files = ran.stdout.split('\n').filter((line) => line !== '').map((line) => line.slice(root.length + 1))
  return { code: ran.status, signal: ran.signal, files, err: ran.stderr }
}

/** What `--list related --print` says over the case's checkout. */
function printRelated(...more: string[]) {
  return printRelatedWith([], ...more)
}

/** How many keys the large table has, and how many functions hand it on before a test reads one key. */
const KEYS = 4000
const STEPS = 250

/** The large table, each key's value saying `says`. */
function theLargeTable(says: string): string {
  return `export const words = {\n${Array.from({ length: KEYS }, (_, i) => `  key${i}: '${says} ${i}',\n`).join('')}}\n`
}

/** step0 returns the table, and each step after it returns what the one before returns. */
function theSteps(): string {
  const after = Array.from({ length: STEPS - 1 }, (_, i) => `\nexport function step${i + 1}() {\n  return step${i}()\n}\n`)
  return ["import { words } from './words.ts'\n\nexport function step0() {\n  return words\n}\n", ...after].join('')
}

describe('--list related', () => {
  it("runs the test files that import a changed file, directly and through another module, and not the others", () => {
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 2\n}\n')
    commit('a change to thing')
    const run = printRelated()
    expect(run.code, run.err).toBe(0)
    expect(run.files).toContain('tests/direct.test.ts')
    expect(run.files).toContain('tests/through.test.ts')
    for (const path of UNRELATED) expect(run.files).not.toContain(path)
    expect(run.err).toContain('names 1 paths and reaches 2 test files')
  })

  it('refuses a change that reaches every test file, says so, and prints nothing', () => {
    put('vitest.config.ts', 'export default { test: {} }\n')
    commit('a change to the runner')
    const run = printRelated()
    expect(run.code).toBe(2)
    expect(run.files).toEqual([])
    expect(run.err).toContain('reaches every one of the 12 test files, so --list related would be the whole suite')
  })

  it('runs the whole-tree list as well, though the change does not reach it', () => {
    put('src/thing.ts', 'export function thing() {\n  return 1\n}\n\nexport function other() {\n  return 4 - 2\n}\n')
    commit('a change no test reaches')
    const run = printRelated()
    expect(run.code, run.err).toBe(0)
    expect(run.files).toEqual(['tests/whole.test.ts'])
    expect(run.err).toContain('reaches 0 test files; with the whole-tree list 1 files run')
  })

  it('works from the commit --base names, as the merge tool asks it, and refuses --base without --list related', () => {
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 2\n}\n')
    commit('a change to thing, below the named commit')
    const named = git('rev-parse', 'HEAD').trim()
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 4 - 2\n}\n')
    commit('a change no test reaches, above it')
    const run = printRelated('--base', named)
    expect(run.code, run.err).toBe(0)
    expect(run.files).toEqual(['tests/whole.test.ts'])
    expect(run.err).toContain(`the change ${named.slice(0, 12)}..`)
    const alone = spawnSync(process.execPath, [TOOL, '--print', '--root', root, '--base', named, 'tests/whole.test.ts'], { cwd: root, encoding: 'utf8' })
    expect(alone.status).toBe(2)
    expect(alone.stderr).toContain('--base names where --list related works from, and --list related was not asked for.')
  })

  it('refuses a change that reaches more than a quarter of the test files, though not every one', () => {
    // A thirteenth test file that imports thing as well, on the base: the bound is still three (a quarter of 13).
    put('tests/third.test.ts', "import { thing } from '../src/thing.ts'\n\ntest('third', () => expect(thing()).toBe(1))\n")
    commit('a third importer')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 2\n}\n')
    commit('a change to thing')
    const run = printRelated()
    expect(run.code).toBe(2)
    expect(run.files).toEqual([])
    expect(run.err).toContain('reaches 3 test files, 4 with the whole-tree list, and --list related runs at most a quarter of the 13 test files (3)')
    expect(run.err).not.toContain('reaches every one')
  })

  it('refuses a change past the quarter bound without counting the files that reach it only through a door', () => {
    // On the base: a third importer of thing, and a door with a test behind it. 14 test files, so the bound is three.
    put('tests/third.test.ts', "import { thing } from '../src/thing.ts'\n\ntest('third', () => expect(thing()).toBe(1))\n")
    putTheDoor()
    commit('a third importer, and a door')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 2\n}\n')
    commit('a change to thing')
    const run = printRelated()
    expect(run.code).toBe(2)
    expect(run.files).toEqual([])
    expect(run.err).toContain('reaches 3 test files, 4 with the whole-tree list, and --list related runs at most a quarter of the 14 test files (3)')
    expect(run.err).toContain(NOT_COUNTED)
  })

  it('counts the files that reach a change only through a door when the list is not refused', () => {
    // On the base: a door with a test behind it. 13 test files, so the bound is three, and this change takes three.
    putTheDoor()
    commit('a door')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 2\n}\n')
    commit('a change to thing')
    const run = printRelated()
    expect(run.code, run.err).toBe(0)
    expect([...run.files].sort()).toEqual(['tests/direct.test.ts', 'tests/through.test.ts', 'tests/whole.test.ts'])
    expect(run.err).toContain('--list related: 1 more reach the change only by starting the whole server or building the whole page, and are not run')
    expect(run.err).not.toContain(NOT_COUNTED)
  })

  it('counts the files that run after the slow ones are left out, and says how many were left out', () => {
    // direct.test.ts once took 200 seconds, over the bound of 100, so it is left out; through.test.ts and whole.test.ts
    // have no recorded time and stay. Counted before the cut, the sentence said three files run where two did.
    put('src/thing.ts', 'export function thing() {\n  return 3 - 2\n}\n\nexport function other() {\n  return 2\n}\n')
    commit('a change to thing')
    put('times/one.json', JSON.stringify({ testResults: [{ name: '/elsewhere/tests/direct.test.ts', startTime: 0, endTime: 200_000 }] }))
    const run = printRelated('--leave-out-slower-than', '100', '--times', join(root, 'times'))
    expect(run.code, run.err).toBe(0)
    expect([...run.files].sort()).toEqual(['tests/through.test.ts', 'tests/whole.test.ts'])
    const notOnTheWholeTreeList = run.files.filter((file) => file !== 'tests/whole.test.ts').length
    expect(run.err).toContain(`with the whole-tree list ${run.files.length} files run (${notOnTheWholeTreeList} of them not on the whole-tree list)`)
    expect(run.err).toContain(`(${notOnTheWholeTreeList} of them not on the whole-tree list), once 1 slow file is left out.`)
    expect(run.err).toContain('--list related: 1 file left out, whose longest recorded time is over 100 s: tests/direct.test.ts (200 s).')
  })

  it('works out the list for a change to each of 4,000 keys of one table within a heap of 128 MB, and runs the test that reads one', () => {
    // On the base: the table, the steps that hand it on, and a test that reads one key from the last step.
    // 13 test files, so the bound is three.
    put('src/words.ts', theLargeTable('one'))
    put('src/steps.ts', theSteps())
    put('tests/reads-one-key.test.ts', `import { step${STEPS - 1} } from '../src/steps.ts'\n\ntest('one key', () => expect(step${STEPS - 1}().key7).toBe('two 7'))\n`)
    commit('a large table, and a test that reads one key of it')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    put('src/words.ts', theLargeTable('two'))
    commit('every key of the table changed')
    const run = printRelatedWith(['--max-old-space-size=128'])
    expect({ code: run.code, signal: run.signal }, run.err.slice(0, 2000)).toEqual({ code: 0, signal: null })
    expect([...run.files].sort()).toEqual(['tests/reads-one-key.test.ts', 'tests/whole.test.ts'])
    expect(run.err).toContain('names 1 paths and reaches 1 test files')
  })
})
