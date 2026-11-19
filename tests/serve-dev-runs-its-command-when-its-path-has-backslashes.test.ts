// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SERVE-DEV RUNS ITS COMMAND WHEN THE PATH IT WAS RUN BY HAS BACKSLASHES, AS WINDOWS GIVES IT.
 *
 * tools/serve-dev.mjs runs its command only when the path Node was given for it ends in tools/serve-dev.mjs, so a file
 * that imports it starts nothing. Windows gives that path with `\`. On a Windows 11 machine (wave 13t, round W9, the
 * first label) `node checkout\tools\serve-dev.mjs` ended after 0.2 seconds with exit code 0. It said nothing and started
 * nothing: a success that did nothing. The check now reads `\` as `/`.
 *
 * WHAT IS CLAIMED. Each case runs Node with one entry file of this test's folder, which imports the real
 * tools/serve-dev.mjs. The database carries an upgrade mark, so serve-dev's command, when it runs, refuses at once with
 * the mark's sentence and exit code 1, before it starts anything. The database's path is a folder, so a start that
 * missed the mark could not open it either.
 *   1. Run by D:\a-checkout\tools\serve-dev.mjs, as Windows gives the path, it runs the command as tools/serve-dev.mjs
 *      itself does: exit code 1, and the same sentence.
 *   2. Imported by a file with a name of its own, it starts nothing: exit code 0, and nothing said.
 *   3. Run by D:\a-checkout\elsewhere\serve-dev.mjs, it starts nothing either: the folder counts, not the name alone.
 * Linux cannot run a file by a path in Windows form. Node refuses a module whose file name holds `\`
 * (ERR_INVALID_MODULE_SPECIFIER). So the entries of cases 1 and 3 set process.argv[1], the path Node was given, to the
 * one Windows would give, and only then import serve-dev.
 *
 * MUTATIONS, each after a control run:
 *   - the check compares the path as it is, as before this file: case 1 goes red;
 *   - the check is always true: cases 2 and 3 go red;
 *   - the check reads only the file's name: case 3 goes red.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theResumeCommand, writeTheUpgradeMark } from '../src/config/the-upgrade-mark.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { commandUnderTheOwnerWatchingGate } from './the-owner-watching-gate.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SERVE_DEV = join(ROOT, 'tools/serve-dev.mjs')
const MARK = { from: '1'.repeat(40), to: '2'.repeat(40), tag: 'stable-2026-10-31-made-up', closedAt: '2026-10-31 09:00:00' }

let folder = ''
let database = ''
let home = ''

/** A port that was free a moment ago. Nothing binds it here: the command refuses before it starts a server. */
function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address !== null ? resolvePort(address.port) : reject(new Error('no port'))))
    })
  })
}

/**
 * An entry file of this test's folder, named `name`, that imports the real tools/serve-dev.mjs and does nothing else.
 * With `runBy`, it first sets the path Node was given for it to that one.
 */
function anEntry(name: string, runBy?: string): string {
  const entry = join(folder, name)
  const given = runBy === undefined ? '' : `process.argv[1] = ${JSON.stringify(runBy)}\n`
  writeFileSync(entry, `${given}await import(${JSON.stringify(pathToFileURL(SERVE_DEV).href)})\n`)
  return entry
}

/** Node run on `entry`, as `npm run serve` runs serve-dev, to its end, for at most 60 seconds. */
async function ranThrough(entry: string): Promise<{ code: number | null; stderr: string }> {
  const gated = commandUnderTheOwnerWatchingGate([entry, '--built', '--prepared'])
  const env = { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database, MOLE_OFFICE_PORT: String(await freePort()), MOLE_OFFICE_MESSAGE_WORKER: 'off' }
  const child = spawn(gated.command, gated.args, { cwd: ROOT, detached: true, env, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  const limit = setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGTERM')
    } catch {
      // already gone
    }
  }, 60_000)
  const code = await new Promise<number | null>((ended) => child.once('exit', (exit) => ended(exit)))
  clearTimeout(limit)
  return { code, stderr }
}

beforeAll(() => {
  folder = aTestDatabaseFolder('serve-dev-backslashes')
  database = join(folder, 'made-up.db')
  home = join(folder, 'home')
  mkdirSync(database)
  mkdirSync(home)
  const stable = join(folder, 'made-up-stable')
  const lock = join(stable, '.git/stable-upgrade.lock')
  writeTheUpgradeMark(database, { ...MARK, lock, resume: theResumeCommand(stable, lock) })
})

afterAll(() => {
  removeThisTestFolder(folder)
})

describe('the path serve-dev was run by', () => {
  it('1: D:\\a-checkout\\tools\\serve-dev.mjs, as Windows gives it, runs the command as tools/serve-dev.mjs does', async () => {
    const itself = await ranThrough(SERVE_DEV)
    expect(itself.code, itself.stderr).toBe(1)
    expect(itself.stderr).toContain(`from ${MARK.from} to ${MARK.to} (tag ${MARK.tag}) closed it at ${MARK.closedAt}`)
    const asWindowsGivesIt = await ranThrough(anEntry('run-by-tools.mjs', 'D:\\a-checkout\\tools\\serve-dev.mjs'))
    expect(asWindowsGivesIt).toEqual(itself)
  }, 120_000)

  it('2: of a file with a name of its own, which imports serve-dev, starts nothing and says nothing', async () => {
    expect(await ranThrough(anEntry('an-entry-of-its-own.mjs'))).toEqual({ code: 0, stderr: '' })
  }, 60_000)

  it('3: D:\\a-checkout\\elsewhere\\serve-dev.mjs starts nothing either', async () => {
    expect(await ranThrough(anEntry('run-by-elsewhere.mjs', 'D:\\a-checkout\\elsewhere\\serve-dev.mjs'))).toEqual({ code: 0, stderr: '' })
  }, 60_000)
})
