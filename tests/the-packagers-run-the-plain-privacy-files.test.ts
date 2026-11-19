// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The packagers run every plain privacy file against their checkout before bundling.
 * Made-up trees, their node_modules links, runner scripts, reports and homes live under
 * one temporary folder; afterAll removes it, and the test-folder helper also removes it on exit.
 *
 * Mutations: omit report coverage, exit agreement, disk presence, environment filtering, runner words,
 * the browser check or the browser folder; each turns its own case red. The implementation is restored
 * byte for byte after each.
 * The runner starts a child process through spawnSync, so this file gets the long test budget.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { runThePlainPrivacyFiles } from '../scripts/the-plain-privacy-run.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const temporary = aTestDatabaseFolder('privacy-run')
afterAll(() => removeThisTestFolder(temporary))
let serial = 0
const passing = "import { it, expect } from 'vitest'; it('a plain case', () => expect(1).toBe(1))\n"

function tree(rows = ["'tests/a-plain.test.ts': { class: 'P', kind: 'naming' },"]) {
  const folder = join(temporary, String(++serial))
  const root = join(folder, 'tree')
  const work = join(folder, 'work')
  mkdirSync(join(root, 'tests'), { recursive: true })
  mkdirSync(work)
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir')
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  writeFileSync(join(root, 'tests/house-rules.mjs'), `export const HOUSE_RULES = {\n${rows.join('\n')}\n}\n`)
  writeFileSync(join(root, 'tests/a-plain.test.ts'), passing)
  const lines: string[] = []
  return { root, work, lines, say: (line: string) => lines.push(line) }
}

function standIn(place: ReturnType<typeof tree>, results: unknown[], exit = 0) {
  const vitest = join(place.root, 'stand-in.mjs')
  writeFileSync(vitest, [
    "import { writeFileSync } from 'node:fs'",
    "writeFileSync(new URL('./started', import.meta.url), 'yes')",
    "const report = process.argv.find(value => value.startsWith('--outputFile=')).slice('--outputFile='.length)",
    `writeFileSync(report, JSON.stringify({ testResults: ${JSON.stringify(results)} }))`,
    `process.exit(${exit})`,
  ].join('\n'))
  return vitest
}

const passed = (root: string) => ({ name: join(root, 'tests/a-plain.test.ts'), status: 'passed', assertionResults: [{ status: 'passed', fullName: 'a plain case' }] })

describe('the packagers run the plain privacy files', () => {
  it('only the two plain P rows run, in path order, in one runner with the checkout as root and cwd', () => {
    const place = tree([
      "'tests/b-plain.test.ts': { class: 'P', kind: 'naming' },",
      "'tests/a-plain.test.ts': { class: 'P', kind: 'naming' },",
      "'tests/c-marked.test.ts': { class: 'P', kind: 'privacy-marker', mark: 'mixed' },",
      "'tests/d-house.test.ts': { class: 'H', kind: 'wording' },",
    ])
    writeFileSync(join(place.root, 'tests/b-plain.test.ts'), passing)
    for (const file of ['c-marked', 'd-house']) writeFileSync(join(place.root, `tests/${file}.test.ts`), 'throw new Error("must not run")')
    const answer = runThePlainPrivacyFiles(place)
    expect(answer.files).toEqual(['tests/a-plain.test.ts', 'tests/b-plain.test.ts'])
    expect(answer.red).toEqual([])
    expect(answer.noResult).toEqual([])
    expect(place.lines).toHaveLength(3)
    expect(place.lines.slice(0, 2).every(line => line.includes('passed'))).toBe(true)
    expect(place.lines.at(-1)).toMatch(/2 passed.*0 red.*0 no result/)
    const report = JSON.parse(readFileSync(answer.report, 'utf8'))
    expect(report.testResults.map((row: { name: string }) => relative(place.root, row.name)).sort()).toEqual(answer.files)
  })

  it('a red plain P file is answered and said by name with its first failed case', () => {
    const place = tree()
    writeFileSync(join(place.root, 'tests/a-plain.test.ts'), "import { it, expect } from 'vitest'; it('the failed case', () => expect(1).toBe(2))")
    const answer = runThePlainPrivacyFiles(place)
    expect(answer.red).toEqual([{ file: 'tests/a-plain.test.ts', firstFailedCase: 'the failed case' }])
    expect(answer.noResult).toEqual([])
    expect(place.lines[0]).toMatch(/red.*tests\/a-plain.test.ts.*the failed case/)
    expect(place.lines.at(-1)).toMatch(/0 passed.*1 red.*0 no result/)
  })

  it('a listed file not on disk is refused by name before the runner starts', () => {
    const place = tree(["'tests/absent.test.ts': { class: 'P', kind: 'naming' },"])
    const vitest = standIn(place, [])
    expect(() => runThePlainPrivacyFiles({ ...place, vitest })).toThrow(/tests\/absent.test.ts.*not.*(disk|file|there)/)
    expect(existsSync(join(place.root, 'started'))).toBe(false)
  })

  it('no house-rule list is refused by name', () => {
    const place = tree()
    // A separate empty tree leaves the prepared fixture intact.
    const root = join(temporary, 'no-list')
    mkdirSync(root)
    expect(() => runThePlainPrivacyFiles({ ...place, root })).toThrow(/tests\/house-rules.mjs/)
  })

  it('a report that leaves a listed file out gives that file no result', () => {
    const place = tree()
    const answer = runThePlainPrivacyFiles({ ...place, vitest: standIn(place, []) })
    expect(answer.red).toEqual([])
    expect(answer.noResult).toEqual([{ file: 'tests/a-plain.test.ts', reason: expect.stringMatching(/report.*(name|missing)/) }])
    expect(place.lines[0]).toMatch(/no result.*tests\/a-plain.test.ts.*report/)
    expect(place.lines.at(-1)).toMatch(/0 passed.*0 red.*1 no result/)
  })

  it('an exit code disagreeing with an all-passed report gives no result', () => {
    const place = tree()
    const answer = runThePlainPrivacyFiles({ ...place, vitest: standIn(place, [passed(place.root)], 1) })
    expect(answer.noResult).toEqual([{ file: 'tests/a-plain.test.ts', reason: expect.stringMatching(/exit.*1.*0 red/) }])
    expect(place.lines[0]).toMatch(/no result.*tests\/a-plain.test.ts.*exit/)
    expect(place.lines.at(-1)).toMatch(/0 passed.*0 red.*1 no result/)
  })

  it('an exit code of zero with a red report also gives no result', () => {
    const place = tree()
    const row = { ...passed(place.root), status: 'failed', assertionResults: [{ status: 'failed', fullName: 'failed case' }] }
    const answer = runThePlainPrivacyFiles({ ...place, vitest: standIn(place, [row]) })
    expect(answer.red).toHaveLength(1)
    expect(answer.noResult[0]).toMatchObject({ file: 'tests/a-plain.test.ts', reason: expect.stringMatching(/exit.*0.*1 red/) })
  })

  it('the child sees no office variables or agent key and gets a home under work', () => {
    const place = tree()
    const names = ['MOLE_OFFICE_PRIVACY_PROOF', 'MOLE_AGENT_KEY']
    const before = names.map(name => process.env[name])
    try {
      for (const name of names) process.env[name] = 'fixture-only'
      writeFileSync(join(place.root, 'tests/a-plain.test.ts'), `
        import { it, expect } from 'vitest'
        import { existsSync, writeFileSync } from 'node:fs'
        import { join, relative, isAbsolute } from 'node:path'
        it('the child environment is its own', () => {
          expect(Object.keys(process.env).filter(name => name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY')).toEqual([])
          const home = process.env.HOME
          expect(existsSync(home)).toBe(true)
          const inside = relative(${JSON.stringify(place.work)}, home)
          expect(inside.length > 0 && !inside.startsWith('..') && !isAbsolute(inside)).toBe(true)
          expect(process.cwd()).toBe(${JSON.stringify(place.root)})
          writeFileSync(join(home, 'child-wrote-here'), 'yes')
        })
      `)
      const answer = runThePlainPrivacyFiles(place)
      expect(answer.red, place.lines.join('\n')).toEqual([])
      expect(answer.noResult).toEqual([])
      expect(process.env[names[0]!]).toBe('fixture-only')
    } finally {
      names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index] })
    }
  })

  it('everything the module writes is under work', () => {
    const place = tree()
    const before = readdirSync(place.root, { recursive: true }).sort()
    const answer = runThePlainPrivacyFiles(place)
    expect(resolve(answer.report).startsWith(resolve(place.work) + sep)).toBe(true)
    expect(readdirSync(place.root, { recursive: true }).sort()).toEqual(before)
    const made = readdirSync(place.work, { recursive: true, withFileTypes: true })
    expect(made.some(entry => entry.isDirectory())).toBe(true)
    expect(made.some(entry => entry.isFile())).toBe(true)
  })

  it('a file that failed to load gives no result, even when named in the report', () => {
    const place = tree()
    writeFileSync(join(place.root, 'tests/a-plain.test.ts'), 'throw new Error("cannot load this file")')
    const answer = runThePlainPrivacyFiles(place)
    expect(answer.red).toEqual([])
    expect(answer.noResult[0]).toMatchObject({ file: 'tests/a-plain.test.ts', reason: expect.stringMatching(/(load|case)/) })
    expect(place.lines.at(-1)).toMatch(/0 passed.*0 red.*1 no result/)
  })

  it('a loaded passed file may also have cases the suite has set aside', () => {
    const place = tree()
    const row = { ...passed(place.root), assertionResults: [
      { status: 'passed', fullName: 'the active case' },
      { status: 'pending', fullName: 'the case already set aside' },
    ] }
    const answer = runThePlainPrivacyFiles({ ...place, vitest: standIn(place, [row]) })
    expect(answer.red).toEqual([])
    expect(answer.noResult).toEqual([])
    expect(place.lines.at(-1)).toMatch(/1 passed.*0 red.*0 no result/)
  })

  it('a runner that writes no report gives no result naming the missing report', () => {
    const place = tree()
    const vitest = join(place.root, 'no-report.mjs')
    writeFileSync(vitest, 'process.exit(0)')
    const answer = runThePlainPrivacyFiles({ ...place, vitest })
    expect(answer.noResult[0]).toMatchObject({ file: 'tests/a-plain.test.ts', reason: expect.stringContaining(answer.report) })
    expect(place.lines.at(-1)).toMatch(/0 passed.*0 red.*1 no result/)
  })

  it('a missing report includes the last runner words from stderr, or stdout when stderr is empty', () => {
    for (const stream of ['stderr', 'stdout']) {
      const place = tree()
      const vitest = join(place.root, 'stopped-runner.mjs')
      const sentence = `The runner stopped before writing its report on ${stream}.`
      writeFileSync(vitest, `process.${stream}.write('old output '.repeat(100) + '\\n' + ${JSON.stringify(sentence)}); process.exit(1)`)
      const answer = runThePlainPrivacyFiles({ ...place, vitest })
      const reason = answer.noResult[0]!.reason
      expect(reason).toContain(answer.report)
      expect(reason).toContain("Runner's words:")
      expect(reason).toContain(sentence)
      expect(reason.split("Runner's words: ")[1]!.split(' The runner exit')[0]!.length).toBeLessThanOrEqual(400)
      expect(place.lines[0]).toContain(sentence)
      expect(place.lines.at(-1)).toMatch(/0 passed.*0 red.*1 no result/)
    }
  })

  it('a plain file that imports playwright, with no browser where the run will look, is refused before the runner starts, naming how to install one', () => {
    const place = tree()
    writeFileSync(join(place.root, 'tests/a-plain.test.ts'), "import { it } from 'vitest'\nit('draws a page', async () => { const { chromium } = await import('playwright'); await (await chromium.launch()).close() })\n")
    const vitest = standIn(place, [passed(place.root)])
    const browsers = join(place.work, 'no-browser-here')
    mkdirSync(browsers)
    const before = process.env['PLAYWRIGHT_BROWSERS_PATH']
    let refusal = ''
    try {
      process.env['PLAYWRIGHT_BROWSERS_PATH'] = browsers
      runThePlainPrivacyFiles({ ...place, vitest })
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error)
    } finally {
      if (before === undefined) delete process.env['PLAYWRIGHT_BROWSERS_PATH']
      else process.env['PLAYWRIGHT_BROWSERS_PATH'] = before
    }
    expect(refusal).toContain('The plain privacy file tests/a-plain.test.ts needs a browser')
    expect(refusal).toContain(`no browser is installed where the run will look (${browsers}/`)
    expect(refusal).toContain('PLAYWRIGHT_BROWSERS_PATH=0 node node_modules/playwright/cli.js install chromium')
    expect(existsSync(join(place.root, 'started'))).toBe(false)
  })

  it("the child looks for a browser where this process says, or in the checkout's node_modules when it says nothing, and a file with no import of playwright needs none", () => {
    for (const given of [undefined, join(temporary, 'browsers-named-here')]) {
      const place = tree()
      writeFileSync(join(place.root, 'tests/a-plain.test.ts'), `
        import { it, expect } from 'vitest'
        it('looks for a browser in the folder it was given', () => expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(${JSON.stringify(given ?? '0')}))
      `)
      const before = process.env['PLAYWRIGHT_BROWSERS_PATH']
      try {
        if (given === undefined) delete process.env['PLAYWRIGHT_BROWSERS_PATH']
        else process.env['PLAYWRIGHT_BROWSERS_PATH'] = given
        const answer = runThePlainPrivacyFiles(place)
        expect(answer.red, place.lines.join('\n')).toEqual([])
        expect(answer.noResult, place.lines.join('\n')).toEqual([])
        expect(process.env['PLAYWRIGHT_BROWSERS_PATH']).toBe(given)
      } finally {
        if (before === undefined) delete process.env['PLAYWRIGHT_BROWSERS_PATH']
        else process.env['PLAYWRIGHT_BROWSERS_PATH'] = before
      }
    }
  })
})
