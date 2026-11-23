// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MERGE-TOOL LIBRARY RUN AS A PROGRAM REFUSES (wave 13u, item 54). tools/merge-tool/owner-content.mjs is a library
 * with no command line. Run with node, it exited 0 and screened nothing, so a round that ran it by hand reported its
 * screen clean. Until 30 October 2026, 24 of the folder's 43 libraries exited 0 the same way, and the other 19 printed
 * the merge tool's usage, because they read its arguments when they load. Given those arguments, all 43 exited 0.
 *
 * WHAT THIS FILE PROVES:
 * 1. Each file of tools/merge-tool that is not one of its programs, run with node and no arguments, exits 2. Nothing
 *    goes to stdout, and stderr is one sentence that begins with the file's path.
 * 2. The sentence of owner-content.mjs, addresses.mjs and commit-addresses.mjs names the module that runs the check,
 *    integrate.mjs, and the functions a check by hand imports from the library. Every other library the office tool
 *    loads has a sentence naming the command that loads it, node tools/the-merger.mjs, and that program's imports do
 *    reach it. A library a project-only program loads names its own loader in the guard's map, and the office tool
 *    must not reach it: the office never uses the local keeper.
 * 3. Imported, no library refuses. A program outside the folder that imports every file of it, as the merge tool does,
 *    exits 0. So does a process started on one of the folder's own programs, as the cleanup watcher, a merge driver git
 *    starts and the trial replay are, when it loads the guard. This file, run by vitest, imports the three gates itself.
 * 4. The folder's programs are the files that read their own command line, `process.argv[1]` or `process.argv[2]` as
 *    cleanup.mjs reads its --watch, and the guard's list of programs names exactly those.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs). Each goes red where named:
 *   - neither owner-content.mjs nor owner-content-allowed.mjs, the one file of the folder it imports, imports the
 *     guard: cases 1 and 2;
 *   - arguments.mjs does not import the guard, and log-and-state.mjs imports it after arguments.mjs: case 1;
 *   - the guard refuses in a process started on one of the folder's programs too: case 3;
 *   - the guard refuses whenever it is loaded: vitest cannot load this file, so no case runs;
 *   - the three gates' sentence names no function to import: case 2;
 *   - the guard's list of programs leaves out cleanup.mjs: cases 3 and 4.
 *
 * Every fixture is synthetic: the home, the work folder and the importing program are made under the temporary
 * directory and removed after, and the office address the child processes get is one that nothing answers on.
 * Nothing reaches an office.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import * as addresses from '../tools/merge-tool/addresses.mjs'
import { THE_LIBRARIES_A_PROJECT_LOADS } from '../tools/merge-tool/a-library-is-not-a-program.mjs'
import * as commitAddresses from '../tools/merge-tool/commit-addresses.mjs'
import * as ownerContent from '../tools/merge-tool/owner-content.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FOLDER = join(ROOT, 'tools', 'merge-tool')
const GUARD = join(FOLDER, 'a-library-is-not-a-program.mjs')
const made: string[] = []
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

function scratch(prefix: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `library-not-a-program-${prefix}-`)))
  made.push(dir)
  return dir
}

const FILES = readdirSync(FOLDER).filter((name) => name.endsWith('.mjs')).sort()
/** A program reads its own command line, as `if (process.argv[1] === ...)`; every other file is a library. */
const PROGRAMS = FILES.filter((name) => /\bprocess\.argv\[[12]\] ===/.test(readFileSync(join(FOLDER, name), 'utf8')))
const LIBRARIES = FILES.filter((name) => !PROGRAMS.includes(name))
/** The gates a supervisor runs by hand, with the functions a check by hand imports from each. */
const GATES: Record<string, string[]> = {
  'owner-content.mjs': ['screenTheAddedLines', 'theScreenSaid'],
  'addresses.mjs': ['screenTheAddedLines', 'theScreenSaid'],
  'commit-addresses.mjs': ['screenTheCommits', 'theScreenSaid'],
}

/** The merge tool's own arguments, which its arguments module accepts, with the work folder they name in `home`. */
const theMergeToolsArguments = (home: string) => ['--entry', 'synthetic-entry', '--session', 'synthetic-run', '--workdir', join(home, 'workdir'), '--api', '']

/** A child's environment: its own home, no run key, and an office address on a port nothing answers on. */
function anEnvironment(home: string) {
  const env: Record<string, string | undefined> = { ...process.env, HOME: home, MOLE_OFFICE_API: 'http://127.0.0.1:9' }
  delete env.MOLE_AGENT_KEY
  return env
}

/** One library run with node and no arguments, in a home of its own. */
function runAlone(name: string) {
  const home = scratch('home')
  return { home, ran: spawnSync(process.execPath, [join(FOLDER, name)], { cwd: home, encoding: 'utf8', env: anEnvironment(home), timeout: 30_000 }) }
}

/** Every library run once with node and no arguments. Cases 1 and 2 both read these runs, so each library starts once. */
let theRunsAlone: Map<string, ReturnType<typeof runAlone>> | undefined
function eachLibraryRunAlone() {
  theRunsAlone ??= new Map(LIBRARIES.map((name) => [name, runAlone(name)]))
  return theRunsAlone
}

/** Each library run with node and no arguments, and what it did that a refusal would not. */
function runEach() {
  const wrong: unknown[] = []
  for (const [name, { home, ran }] of eachLibraryRunAlone()) {
    const sentence = ran.stderr
    const refused = ran.status === 2 && ran.stdout === '' && /^[^\n]+\.\n$/.test(sentence) && sentence.startsWith(`tools/merge-tool/${name} `)
    const madeAFolder = existsSync(join(home, 'workdir'))
    if (!refused || madeAFolder) wrong.push({ name, status: ran.status, stdout: ran.stdout.slice(0, 200), stderr: sentence.slice(0, 300), madeAFolder })
  }
  return wrong
}

/** The files a program's imports reach, static and dynamic, following every relative specifier. */
function reachedFrom(program: string) {
  const seen = new Set<string>()
  const waiting = [program]
  const SPECIFIER = /(?:from\s*|import\s*\(\s*|^import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm
  while (waiting.length > 0) {
    const file = waiting.pop()!
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    for (const found of readFileSync(file, 'utf8').matchAll(SPECIFIER)) waiting.push(resolve(dirname(file), found[1]!))
  }
  return seen
}

it('each library of the merge tool, run with node and no arguments, exits 2 with one sentence', () => {
  expect(LIBRARIES.length).toBeGreaterThan(40)
  expect(runEach()).toEqual([])
}, 120_000)

it('the three gates name the module that runs them; the office tool names the rest, and a project-only library names its own loader', () => {
  const merger = reachedFrom(join(ROOT, 'tools', 'the-merger.mjs'))
  const said: Record<string, string> = {}
  for (const [name, { ran }] of eachLibraryRunAlone()) said[name] = ran.stderr
  for (const [name, functions] of Object.entries(GATES)) {
    expect(said[name], name).toContain('tools/merge-tool/integrate.mjs')
    for (const one of functions) expect(said[name], name).toContain(one)
  }
  for (const [name, loader] of Object.entries(THE_LIBRARIES_A_PROJECT_LOADS)) {
    expect(LIBRARIES, `${name} is a library of the folder`).toContain(name)
    expect(said[name], name).toContain(loader)
    expect(merger.has(join(FOLDER, name)), `the office tool must not reach ${name}, which ${loader} loads`).toBe(false)
  }
  for (const name of LIBRARIES.filter((one) => !Object.hasOwn(GATES, one) && !Object.hasOwn(THE_LIBRARIES_A_PROJECT_LOADS, one))) {
    expect(said[name], name).toContain('node tools/the-merger.mjs')
    expect(merger.has(join(FOLDER, name)), `tools/the-merger.mjs reaches ${name}`).toBe(true)
  }
}, 120_000)

it('imported, no library refuses: not in a program outside the folder, nor in one started on the folder\'s programs', () => {
  expect(typeof ownerContent.screenTheAddedLines).toBe('function')
  expect(typeof addresses.screenTheAddedLines).toBe('function')
  expect(typeof commitAddresses.screenTheCommits).toBe('function')
  const home = scratch('importer')
  const importer = join(home, 'imports.mjs')
  // THE MERGE TOOL'S ARGUMENTS MODULE READS THEM WHEN IT LOADS, so the importer gives it the merge tool's arguments, and
  // says node was started on `program`: the importer itself, or one of the folder's programs.
  writeFileSync(importer, [
    'const [program, urls] = process.argv.slice(2)',
    `process.argv = [process.argv[0], program, ...${JSON.stringify(theMergeToolsArguments(home))}]`,
    'for (const url of JSON.parse(urls)) await import(url)',
    "process.stdout.write(`imported ${String(JSON.parse(urls).length)}\\n`)",
  ].join('\n'))
  const asked = [
    { program: importer, files: FILES },
    ...PROGRAMS.map((name) => ({ program: join(FOLDER, name), files: [basename(GUARD)] })),
  ]
  const answered = asked.map(({ program, files }) => {
    const urls = JSON.stringify(files.map((name) => pathToFileURL(join(FOLDER, name)).href))
    const ran = spawnSync(process.execPath, [importer, program, urls], { cwd: home, encoding: 'utf8', env: anEnvironment(home), timeout: 60_000 })
    return { program: basename(program), status: ran.status, stdout: ran.stdout, ...(ran.status === 0 ? {} : { stderr: ran.stderr.slice(0, 300) }) }
  })
  expect(answered).toEqual(asked.map(({ program, files }) => ({ program: basename(program), status: 0, stdout: `imported ${String(files.length)}\n` })))
}, 120_000)

it('the guard\'s list of programs names exactly the files that read their own command line', async () => {
  expect(PROGRAMS.length).toBeGreaterThan(0)
  const { THE_PROGRAMS } = await import(pathToFileURL(GUARD).href)
  expect([...THE_PROGRAMS].sort()).toEqual(PROGRAMS)
})
