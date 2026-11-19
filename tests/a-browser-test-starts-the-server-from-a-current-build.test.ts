// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER TEST STARTS THE API SERVER FROM A BUILD, AND NEVER FROM ONE OLDER THAN ITS SOURCES.
 *
 * tests/the-server-browser-tests-start.ts has the account: `liveApp` used to start the server
 * through tsx, which compiled the server again in every browser test file. It now starts a build
 * made once for the run. That is only safe if a test is still served the code of its checkout, so
 * this file asserts three things:
 *   - the build reads its files from the source's own addresses, as tsx does, and is the program run;
 *   - a build older than any file it was built from is seen as stale, with that file named, and is
 *     built again; one that stays stale is refused and nothing is started;
 *   - the server a `liveApp` starts is that build, current.
 *
 * The first two build a small program of their own in a folder of their own, so they change no file
 * of the checkout and no build another test is using.
 *
 * THE MUTATIONS THAT PROVE EACH OF THESE, each run on 11 October 2026 after a control run of this
 * file green (wave 13t, round 32):
 *   `whyTheServerBuildIsNotCurrent` answers null after reading the note, without comparing the files
 *     → *names the file that changed* goes red.
 *   `theServerBrowserTestsStart` returns the file instead of throwing after three builds → *refuses a
 *     build that stays stale* goes red.
 *   the plugin returns the text without putting each module's own address in → *reads its files from
 *     the source's own addresses* goes red.
 *   `startTheStack` in tests/helpers.ts starts tsx again → *is the server a liveApp starts* goes red.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import {
  THE_SERVER_BROWSER_TESTS_START,
  buildTheServer,
  theServerBrowserTestsStart,
  whyTheServerBuildIsNotCurrent,
} from './the-server-browser-tests-start.ts'

/** A two-file program: the entry imports a second file, and says its own address and argv[1]. */
function aSmallProgram(): { dir: string; entry: string; second: string; file: string; lock: string } {
  const dir = mkdtempSync(join(tmpdir(), 'server-build-'))
  const entry = join(dir, 'entry.ts')
  const second = join(dir, 'second.ts')
  writeFileSync(second, 'export const second: string = import.meta.url\n')
  writeFileSync(
    entry,
    "import { second } from './second.ts'\n" +
      'console.log(JSON.stringify({ entry: import.meta.url, second, run: process.argv[1] }))\n',
  )
  return { dir, entry, second, file: join(dir, 'out', 'server.mjs'), lock: join(dir, 'lock') }
}

describe('the build of the server for the browser tests', () => {
  const made: string[] = []
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  it('reads its files from the source\'s own addresses, and is the program run', async () => {
    const program = aSmallProgram()
    made.push(program.dir)
    await buildTheServer(program.entry, program.file)
    const said = JSON.parse(execFileSync(process.execPath, [program.file], { encoding: 'utf8' })) as Record<string, string>
    expect(said).toEqual({
      entry: pathToFileURL(program.entry).href,
      second: pathToFileURL(program.second).href,
      run: program.entry,
    })
  })

  it('names the file that changed, and the file that is gone', async () => {
    const program = aSmallProgram()
    made.push(program.dir)
    await buildTheServer(program.entry, program.file)
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBeNull()

    // The same words, a later time: what tsx would compile is the same, and the build is still
    // older than the file, so it is not current.
    const later = new Date(Date.now() + 5_000)
    utimesSync(program.second, later, later)
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBe(`${program.second} has changed since the build`)

    await buildTheServer(program.entry, program.file)
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBeNull()
    writeFileSync(program.second, 'export const second: string = "another"\n')
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBe(`${program.second} has changed since the build`)

    rmSync(program.second)
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBe(`${program.second}, which it was built from, is gone`)
  })

  it('is built again when it is stale, and then started', async () => {
    const program = aSmallProgram()
    made.push(program.dir)
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBe(`there is no build at ${program.file}`)
    expect(await theServerBrowserTestsStart(program.file, program.entry, buildTheServer, program.lock)).toBe(program.file)
    writeFileSync(program.second, 'export const second: string = "changed"\n')
    expect(await theServerBrowserTestsStart(program.file, program.entry, buildTheServer, program.lock)).toBe(program.file)
    expect(whyTheServerBuildIsNotCurrent(program.file, program.entry)).toBeNull()
    expect(execFileSync(process.execPath, [program.file], { encoding: 'utf8' })).toContain('"second":"changed"')
  })

  it('refuses a build that stays stale, and says which file differs', async () => {
    const program = aSmallProgram()
    made.push(program.dir)
    await buildTheServer(program.entry, program.file)
    writeFileSync(program.second, 'export const second: string = "changed"\n')
    let builds = 0
    const aBuildThatChangesNothing = (): Promise<void> => {
      builds += 1
      return Promise.resolve()
    }
    await expect(theServerBrowserTestsStart(program.file, program.entry, aBuildThatChangesNothing, program.lock)).rejects.toThrow(
      `liveApp will not start the API server from ${program.file}: it is not the build of this checkout's sources ` +
        `(${program.second} has changed since the build), after 3 builds by this process.`,
    )
    expect(builds).toBe(3)
  })
})

describe('the server a liveApp starts', () => {
  let app: LiveApp
  beforeAll(async () => {
    app = await liveApp({ name: 'a browser test starts the server from a current build', viewport: { width: 990, height: 700 } })
  })
  afterAll(async () => {
    await app.stop()
  })

  it('is the build, and the build is current', () => {
    // The server writes its own pid into the service lock beside its database.
    const lock = JSON.parse(readFileSync(join(app.dir, 'panelx.db.service.json'), 'utf8')) as { pid: number; port: number }
    expect(lock.port).toBe(app.apiPort)
    const command = execFileSync('ps', ['-o', 'args=', '-p', String(lock.pid)], { encoding: 'utf8' }).trim()
    expect(command).toBe(`${process.execPath} ${THE_SERVER_BROWSER_TESTS_START} --stop-with-pid=${String(process.pid)}`)
    expect(whyTheServerBuildIsNotCurrent(THE_SERVER_BROWSER_TESTS_START)).toBeNull()
  })
})
