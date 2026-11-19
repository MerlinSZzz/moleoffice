// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GATES READ THE OWNER'S CONTENT FROM THE FILE THE SETTING NAMES. The merge queue's owner-content gate
 * (tools/merge-tool/owner-content.mjs), the bundle scan (scripts/no-owner-content.mjs) and the clean-version tool's line
 * checks (scripts/clean-version.mjs) each run in a process of their own, with every MOLE_OFFICE_ variable taken away and
 * MOLE_OFFICE_OWNER_CONTENT_LIST given:
 *
 *   1. naming an invented file, the gate refuses each of its names, both parts of its real name, its machine name, its
 *      port and its research words on an added line, and reminds each of its handles, with the names and handles the
 *      file marks `merge gate only`; it does not refuse the word the file says is the product's own, and it leaves
 *      nothing unchecked;
 *   2. naming the same file, the bundle scan finds each of them, handles too, as class 4, the research words as
 *      class 1, and exits 1;
 *   3. set empty, the gate and the scan still refuse a home folder, and each says on its own output which named
 *      patterns it did not look for, with the reader's reason;
 *   4. naming a file that is missing, empty or does not parse, the gate and the scan each stop before they read a line,
 *      and the refusal names the setting and not the file's path;
 *   5. naming the invented file, the clean-version tool's line checks find each name, each part of the real name and
 *      each handle, but not those marked `merge gate only`, and the tool would commit as the file's account; set empty,
 *      they find only the home folder and name the three lists they did not look for, with the reader's reason, and
 *      there is no account to commit as.
 *
 * The file is written into a folder of this test's own, under the system's temporary folder. Every name, handle,
 * machine, port and research word in it is made up, and appears nowhere else in the repository.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { THE_OWNERS_CONTENT_SETTING } from './the-owners-content-list.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

function aFolder(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${what}-`))
  made.push(dir)
  return dir
}

/** An invented file of the owner's content, with an entry of every kind and every flag. */
const AN_INVENTED_FILE = [
  '# The content of an invented office, for this test only.',
  '# kind: name',
  'brindlecombe',
  'osterlund -- merge gate only',
  '# kind: real name',
  'thistlewick -- inside longer words',
  'sorrelmoor',
  '# kind: handle',
  'gorsebot',
  'fennelhand -- merge gate only',
  '# kind: research word',
  'tumblestone',
  'spindlefen ?cobblemere',
  '\\w*marlspike\\w* -- inside longer words',
  'gloamwort -- own sense: a word this invented product also says, in a sense of its own',
  '# kind: account name',
  'brindlecombe',
  '# kind: account email',
  'brindlecombe@example.invalid',
  '# kind: machine',
  'larchbox',
  '# kind: port',
  '46813',
  '',
].join('\n')

/** The invented file, written once into a folder of its own. */
const THE_FILE = join(aFolder('owner-content-file'), 'owner-content.txt')
writeFileSync(THE_FILE, AN_INVENTED_FILE)

/** The reason the reader gives when the setting is set empty. */
const SET_EMPTY = `${THE_OWNERS_CONTENT_SETTING} is set empty, which is the same as not set, so no file of the owner's content was read.`

/** The environment of a child: this one's, with no office variable and no key, and the setting as `list`. */
function anEnvironment(list: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_OFFICE_') || name.startsWith('VITEST') || name === 'MOLE_AGENT_KEY') delete env[name]
  return { ...env, [THE_OWNERS_CONTENT_SETTING]: list, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
}

/** Git in a fixture, with no system or user settings and an invented committer. */
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim()
}

/** A repository whose main holds `file` as `export {}`, and an entry on it that adds `line` to it. */
function anEntry(file: string, line: string): { dir: string; base: string; head: string } {
  const dir = aFolder('owner-content-entry')
  git(dir, 'init', '--quiet', '-b', 'main')
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), 'export {}\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '-m', 'main')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'checkout', '--quiet', '-b', 'entry')
  writeFileSync(join(dir, file), `export {}\n${line}\n`)
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '-m', 'entry')
  return { dir, base, head: git(dir, 'rev-parse', 'HEAD') }
}

/**
 * The program the gate runs in: it screens the entry as integrate does, with the patterns
 * tests/the-owners-content-patterns.ts makes, and prints what the screen found.
 */
const THE_GATE = `
import { screenTheAddedLines, theScreenSaid } from ${JSON.stringify(pathToFileURL(join(REPO, 'tools', 'merge-tool', 'owner-content.mjs')).href)}
import { THE_PATTERNS } from ${JSON.stringify(pathToFileURL(join(REPO, 'tests', 'the-owners-content-patterns.ts')).href)}
const [repo, base, head] = process.argv.slice(1)
const screen = screenTheAddedLines({ repo, base, head, patterns: THE_PATTERNS })
const said = (one) => one.pattern + ' ' + one.words
process.stdout.write(JSON.stringify({ refused: screen.refused.map(said), reminded: screen.reminded.map(said), unchecked: screen.unchecked, said: theScreenSaid(screen) }))
`

/** The gate, run on `entry` with the setting as `list`. */
function theGate(list: string, entry: { dir: string; base: string; head: string }) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', THE_GATE, entry.dir, entry.base, entry.head], {
    cwd: REPO,
    encoding: 'utf8',
    env: anEnvironment(list),
    timeout: 20_000,
  })
}

/** The bundle scan's own command line, run on `folder` with the setting as `list`. */
function theScan(list: string, folder: string) {
  return spawnSync(process.execPath, [join(REPO, 'scripts', 'no-owner-content.mjs'), folder], { cwd: REPO, encoding: 'utf8', env: anEnvironment(list), timeout: 20_000 })
}

/** Each finding the scan's refusal names, as its pattern, its class and its words. */
const theFindingsIn = (output: string): string[] =>
  output.split('\n').flatMap((line) => {
    const one = /, class (\d) \(.*\), (P\d+): "(.*)"$/.exec(line)
    return one === null ? [] : [`${String(one[2])} class ${String(one[1])} ${String(one[3])}`]
  })

/** One line with each invented name, part of the real name, handle, machine, port and research word, and a home folder. */
const THE_LINE =
  '// brindlecombe and osterlund asked gorsebot and fennelhand on larchbox:46813 for Thistlewickson and sorrelmoor, with the tumblestone, the spindlefen cobblemere, the marlspikes and the gloamwort, in /home/fixture-user'

/**
 * The program the clean-version tool's line checks run in: it checks the text it is given and prints what they found,
 * and the account the tool commits as when it is given none.
 */
const THE_LINE_CHECKS = `
import { theFindingsIn, THE_NAMES_NOT_LOOKED_FOR } from ${JSON.stringify(pathToFileURL(join(REPO, 'scripts', 'clean-version.mjs')).href)}
import { THE_OWNERS_ACCOUNT } from ${JSON.stringify(pathToFileURL(join(REPO, 'tests', 'neutral-names.ts')).href)}
const found = theFindingsIn('src/server/e.ts', process.argv[1], -1).map((one) => one.check + ' ' + one.line)
process.stdout.write(JSON.stringify({ found, notLookedFor: THE_NAMES_NOT_LOOKED_FOR, account: THE_OWNERS_ACCOUNT }))
`

/** The clean-version tool's line checks, run on `text` with the setting as `list`. */
function theLineChecks(list: string, text: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', THE_LINE_CHECKS, text], { cwd: REPO, encoding: 'utf8', env: anEnvironment(list), timeout: 20_000 })
}

/** A made folder whose one built file carries `line`. */
function aBundle(line: string): string {
  const folder = aFolder('owner-content-bundle')
  writeFileSync(join(folder, 'server.mjs'), `var at = 1;\n${line}\nexport { at };\n`)
  return folder
}

describe("the gates read the owner's content from the file the setting names", () => {
  const entry = anEntry('src/server/e.ts', THE_LINE)

  it('refuses each invented name, part of the real name, machine, port and research word, and reminds each invented handle, on an added line', () => {
    const run = theGate(THE_FILE, entry)
    expect(run.status, run.stderr).toBe(0)
    const screen = JSON.parse(run.stdout) as { refused: string[]; reminded: string[]; unchecked: unknown[]; said: string }
    expect(screen.refused).toEqual([
      'P1 brindlecombe',
      'P1 osterlund',
      'P1 Thistlewick',
      'P1 sorrelmoor',
      'P2 /home/fixture-user',
      'P4 larchbox',
      'P5 46813',
      'P7 tumblestone',
      'P7 spindlefen cobblemere',
      'P7 marlspikes',
    ])
    expect(screen.reminded).toEqual(['P6 gorsebot', 'P6 fennelhand'])
    expect(screen.unchecked).toEqual([])
    expect(screen.said).not.toContain('Not looked for')
  })

  it('finds each of them in a made folder, handles too, as class 4, the research words as class 1, and the scan exits 1', () => {
    const folder = aBundle(THE_LINE)
    const run = theScan(THE_FILE, folder)
    expect(run.status, run.stderr).toBe(1)
    expect(theFindingsIn(run.stdout)).toEqual([
      'P1 class 4 brindlecombe',
      'P1 class 4 osterlund',
      'P1 class 4 Thistlewick',
      'P1 class 4 sorrelmoor',
      'P2 class 4 /home/fixture-user',
      'P4 class 4 larchbox',
      'P5 class 4 46813',
      'P6 class 4 gorsebot',
      'P6 class 4 fennelhand',
      'P7 class 1 tumblestone',
      'P7 class 1 spindlefen cobblemere',
      'P7 class 1 marlspikes',
    ])
    expect(run.stdout).not.toContain('Not looked for')
  })

  it('set empty, still refuses a home folder, and the gate and the scan each say which named patterns they did not look for', () => {
    const notLookedFor = `Not looked for, so not passed: the owner's names (P1), the owner's real name (P1), the owner's machine names (P4), the port of the owner's own office (P5), the agent handles (P6), the owner's research words (P7) and the owner's words or decisions told with the owner's name (P9). ${SET_EMPTY}`
    const gate = theGate('', entry)
    expect(gate.status, gate.stderr).toBe(0)
    const screen = JSON.parse(gate.stdout) as { refused: string[]; reminded: string[]; unchecked: { pattern: string; why: string }[]; said: string }
    expect(screen.refused).toEqual(['P2 /home/fixture-user'])
    expect(screen.reminded).toEqual([])
    expect(screen.unchecked.map(({ pattern, why }) => `${pattern} ${why}`)).toEqual(['P1', 'P1', 'P4', 'P5', 'P6', 'P7', 'P9'].map((pattern) => `${pattern} ${SET_EMPTY}`))
    expect(screen.said).toContain(` ${notLookedFor}`)

    const found = theScan('', aBundle(THE_LINE))
    expect(found.status, found.stderr).toBe(1)
    expect(theFindingsIn(found.stdout)).toEqual(['P2 class 4 /home/fixture-user'])
    expect(found.stdout.trimEnd().split('\n').at(-1)).toBe(notLookedFor)

    const clean = aBundle('// brindlecombe and Thistlewick asked gorsebot about the tumblestone on larchbox:46813')
    const passed = theScan('', clean)
    expect(passed.status, passed.stderr).toBe(0)
    expect(passed.stdout.split('\n')[0]).toBe(`${clean} carries none of the owner's content that was looked for.`)
    expect(passed.stdout.trimEnd().split('\n').at(-1)).toBe(notLookedFor)
  })

  it.for([
    ['is missing', null, 'names a file that could not be read (ENOENT).'],
    ['is empty', '', 'names an empty file.'],
    ['does not parse', 'brindlecombe\n', 'names a file whose line 1 is an entry before any line `# kind: <kind>`.'],
  ] as const)('stops the gate and the scan when the file %s, naming the setting and not the path', ([, text, why]) => {
    const folder = aFolder('owner-content-bad')
    const file = join(folder, 'owner-content.txt')
    if (text !== null) writeFileSync(file, text)
    const refusal = `${THE_OWNERS_CONTENT_SETTING} ${why} No gate that refuses the owner's content can run until it is fixed. The file's path is not repeated here.`
    for (const run of [theGate(file, entry), theScan(file, aBundle(THE_LINE))]) {
      expect(run.error).toBeUndefined()
      expect(run.status, run.stderr).toBe(1)
      expect(run.stdout).toBe('')
      expect(run.stderr).toContain(refusal)
      expect(run.stderr).not.toContain(folder)
    }
  })

  it("finds each invented name, part of the real name and handle in the clean-version tool's line checks, and set empty says which it did not look for and has no account", () => {
    const text = ['brindlecombe', 'osterlund', 'Thistlewickson', 'sorrelmoor', 'gorsebot', 'fennelhand', '/home/fixture-user'].join('\n')
    const withTheFile = theLineChecks(THE_FILE, text)
    expect(withTheFile.status, withTheFile.stderr).toBe(0)
    expect(JSON.parse(withTheFile.stdout)).toEqual({
      found: ['owner 1', 'owner 3', 'owner 4', 'handle 5', 'home 7'],
      notLookedFor: [],
      account: { name: 'brindlecombe', email: 'brindlecombe@example.invalid' },
    })

    const setEmpty = theLineChecks('', text)
    expect(setEmpty.status, setEmpty.stderr).toBe(0)
    expect(JSON.parse(setEmpty.stdout)).toEqual({
      found: ['home 7'],
      notLookedFor: [
        { pattern: 'owner', what: "the owner's names", why: SET_EMPTY },
        { pattern: 'owner', what: "the owner's real name", why: SET_EMPTY },
        { pattern: 'handle', what: 'the agent handles', why: SET_EMPTY },
      ],
      account: null,
    })
  })
})
