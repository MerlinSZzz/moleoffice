// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEARCH PATH OF AN ENVIRONMENT IS READ IN ANY CASE ON WINDOWS, AND AS `PATH` ALONE ON LINUX AND THE MAC.
 *
 * Windows reads a variable's name in any case, and its window hands the office the search path as `Path`. A plain copy
 * of an environment keeps that spelling. A reader of `PATH` alone found nothing in it, so every tool was called not
 * installed. Every reader of a search path in src/ now reads it through `theSearchPathIn` of the system
 * (src/config/systems/the-system.mjs).
 *
 * Windows is stood in by naming the platform, 'win32', or by a made-up system whose files are a table. Nothing on
 * `process` is changed, and nothing is written outside a test folder of this file's own.
 *
 * WHAT IS PROVED:
 *   1. the piece reads `Path`, `PATH` and `path` on Windows, and only `PATH` on Linux;
 *   2. on Windows two spellings with one value are one search path, and two with different values are refused in a
 *      sentence that names each of them, before the program finder looks for anything;
 *   3. the program finder, on a Windows stand-in, finds a program from an environment keyed `Path`, and on Linux finds
 *      none from the same environment;
 *   4. on this Linux host a made-up run (tests/fake-runtime.mjs) asked to start from an environment keyed `Path` is
 *      refused in words, with nothing started, because `Path` is not the search path on Linux; the same folder under
 *      `PATH` starts it, and it answers;
 *   5. no file in src/ but the piece's own reads an environment's search path by its name.
 *
 * NOT PROVED HERE: a start on a Windows machine. A made-up run cannot start from `Path` on this host without pretending
 * the start is Windows', so none does. A walk on a Windows machine proves the real start.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type TheSystem, whereIsThisTool } from '../src/config/runtimes.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import type { RunRequest } from '../src/worker/runtimes/adapter.ts'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const THE_PIECES_OWN_FILE = join(SRC, 'config', 'systems', 'the-system.mjs')

const WINDOWS = theSystemFor('win32')
const LINUX = theSystemFor('linux')

/** A made-up system whose files are `files`, which writes down every file it is asked about. */
function aStandIn(platform: string, files: readonly string[]): TheSystem & { asked: string[] } {
  const asked: string[] = []
  return {
    platform,
    pathext: '.COM;.EXE;.BAT;.CMD',
    comspec: undefined,
    isThere: (path) => {
      asked.push(path)
      return files.includes(path)
    },
    asked,
  }
}

let dir: string
let n = 0

/** One run request, into a folder of this file's own. */
function ask(prompt: string): RunRequest {
  n += 1
  return {
    session: `a-session-id-${String(n)}`,
    agent: 'builder-x',
    prompt,
    cwd: dir,
    api: 'http://127.0.0.1:29999',
    workspace: 'panelx',
    outputPath: join(dir, `run-${String(n)}.out`),
  }
}

/** Wait for a run to end, or say it did not. */
async function ends(adapter: FakeAdapter, handle: ReturnType<FakeAdapter['start']>, within = 10_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    if (!adapter.alive(handle)) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 25))
  }
}

beforeAll(() => {
  dir = aTestDatabaseFolder('search-path')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('1. the piece reads each spelling as its system does', () => {
  it('reads Path, PATH and path on Windows', () => {
    expect(WINDOWS.theSearchPathIn({ Path: 'C:\\nodejs' })).toBe('C:\\nodejs')
    expect(WINDOWS.theSearchPathIn({ PATH: 'C:\\nodejs' })).toBe('C:\\nodejs')
    expect(WINDOWS.theSearchPathIn({ path: 'C:\\nodejs' })).toBe('C:\\nodejs')
    expect(WINDOWS.theSearchPathIn({ PATHEXT: '.EXE' })).toBeUndefined()
  })

  it('reads PATH alone on Linux, because Path and path are other variables there', () => {
    expect(LINUX.theSearchPathIn({ Path: '/usr/bin' })).toBeUndefined()
    expect(LINUX.theSearchPathIn({ PATH: '/usr/bin' })).toBe('/usr/bin')
    expect(LINUX.theSearchPathIn({ path: '/usr/bin' })).toBeUndefined()
    expect(LINUX.theSearchPathIn({ Path: '/elsewhere', PATH: '/usr/bin' })).toBe('/usr/bin')
  })
})

describe('2. two spellings on Windows', () => {
  it('are one search path when their values are the same', () => {
    expect(WINDOWS.theSearchPathIn({ Path: 'C:\\nodejs', PATH: 'C:\\nodejs' })).toBe('C:\\nodejs')
  })

  it('are refused in a sentence naming each of them when their values differ, and nothing is looked for', () => {
    expect(() => WINDOWS.theSearchPathIn({ Path: 'C:\\nodejs', PATH: 'C:\\tools' })).toThrowError(
      'This environment holds the search path under "Path" and "PATH", and their values differ. ' +
        'Nothing was looked up, because the office does not pick one of them.',
    )
    expect(() => WINDOWS.theSearchPathIn({ Path: 'C:\\nodejs', PATH: 'C:\\tools', path: 'C:\\nodejs' })).toThrowError(
      'This environment holds the search path under "Path", "PATH" and "path", and their values differ. ' +
        'Nothing was looked up, because the office does not pick one of them.',
    )
    const system = aStandIn('win32', ['C:\\nodejs\\node.exe', 'C:\\tools\\node.exe'])
    expect(() => whereIsThisTool('node', { Path: 'C:\\nodejs', PATH: 'C:\\tools' }, system)).toThrowError(/their values differ/u)
    expect(system.asked).toEqual([])
  })
})

describe('3. the program finder and an environment keyed Path', () => {
  it('finds the program on a Windows stand-in', () => {
    const system = aStandIn('win32', ['C:\\Program Files\\nodejs\\node.exe'])
    expect(whereIsThisTool('node', { Path: 'C:\\Windows\\system32;C:\\Program Files\\nodejs' }, system)).toBe('C:\\Program Files\\nodejs\\node.exe')
  })

  it('finds none from the same environment on Linux, and finds it when the folder is under PATH', () => {
    const system = aStandIn('linux', ['/opt/node/bin/node'])
    expect(whereIsThisTool('node', { Path: '/usr/bin:/opt/node/bin' }, system)).toBeNull()
    expect(system.asked).toEqual([])
    expect(whereIsThisTool('node', { PATH: '/usr/bin:/opt/node/bin' }, system)).toBe('/opt/node/bin/node')
  })
})

describe('4. a made-up run on this Linux host', () => {
  it.skipIf(process.platform !== 'linux')('is refused from an environment keyed Path, and starts from the same folder under PATH', async () => {
    const folder = dirname(process.execPath)
    const refused = new FakeAdapter(FAKE, { Path: folder, MOLE_OFFICE_AGENT_MODEL: 'opus' })
    const notStarted = ask('hello, and record abcdefghijkl')
    expect(() => refused.start(notStarted)).toThrowError(
      'node is not installed on this machine, so a run of fake cannot be started. Nothing was started and no message was marked delivered.',
    )
    expect(existsSync(notStarted.outputPath)).toBe(false)

    const started = new FakeAdapter(FAKE, { PATH: folder, MOLE_OFFICE_AGENT_MODEL: 'opus' })
    const handle = started.start(ask('hello, and record abcdefghijkl'))
    expect(await ends(started, handle)).toBe(true)
    const result = started.readResult(handle)
    expect(result.endedHow).toBe('answered')
    expect(result.text).toContain('abcdefghijkl')
  })
})

describe('5. src/ reads a search path only through the piece', () => {
  /** A read of a search path by its name: `env['PATH']`, `env.Path`, or `{ PATH } = process.env`. */
  const A_READ = /\[\s*['"`](?:PATH|Path)['"`]\s*\]|\.(?:PATH|Path)\b|\{[^{}]*\b(?:PATH|Path)\b[^{}]*\}\s*=\s*[\w.]*env\b/u

  /** Each line of a source file under src/ that reads a search path by its name, as "file:line". */
  function theReadsIn(files: readonly string[]): string[] {
    return files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => (A_READ.test(line) ? [`${relative(SRC, file)}:${String(index + 1)}`] : [])),
    )
  }

  const SOURCES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(?:ts|tsx|mts|cts|mjs|cjs|js)$/u.test(name))
    .map((name) => join(SRC, name))

  it('finds the one read in the piece\'s own file, so the check can see a read', () => {
    expect(SOURCES).toContain(THE_PIECES_OWN_FILE)
    expect(theReadsIn([THE_PIECES_OWN_FILE])).not.toEqual([])
  })

  it('finds no other file that reads one', () => {
    expect(theReadsIn(SOURCES.filter((file) => file !== THE_PIECES_OWN_FILE))).toEqual([])
  })
})
