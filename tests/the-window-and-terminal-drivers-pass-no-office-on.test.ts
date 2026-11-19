// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW DRIVER AND THE TERMINAL DRIVER PASS NO OFFICE ON (wave 13t, round 19; problem JQ3yaANBi1JC).
 *
 * tests/installed/drive-the-window.mjs and tests/installed/open-an-agents-terminal.mjs (wave 13u's) start an
 * installed window. The office service that window starts reads MOLE_OFFICE_API as its own address and tells
 * every agent that registers with it that its office is there (src/server/api/participants.ts). So a driver
 * run from an agent's shell, which names the owner's live office, must give the window none of the shell's
 * office: round 18 made both drivers start it with aPlainEnvironment (tests/installed/ask-until.mjs). Round
 * 18 proved this for the agent driver against a stand-in office
 * (tests/the-installed-office-carries-what-an-agent-starts-with.test.ts, case 3); this file proves it for
 * these two.
 *
 * Each case runs the driver from an agent's shell whose office is a stand-in this test listens on, with a
 * home of its own. The window is a stand-in program in place of an installed app: it writes down which of
 * the shell's office variables it was given and, when it was given MOLE_OFFICE_API, does what the office
 * service does with it and calls that office. It answers the driver's inspector with no window and ends,
 * so the driver finds no window and stops. An installed app needs the inspector fuse on, a display and the
 * container run, and what is proved here is only what the driver gives the program it starts.
 *
 *   1. drive-the-window.mjs gives the program it starts no MOLE_OFFICE_ variable and no MOLE_AGENT_KEY,
 *      and nothing reaches the shell's office. The one exception is MOLE_OFFICE_WINDOW_DEBUGGING, which
 *      names no office: since round 23 the window refuses --inspect without it (THE_WINDOW_MAY_BE_DEBUGGED).
 *   2. open-an-agents-terminal.mjs: the same.
 *   3. Each driver, started twice at the same time, gives its two windows two different inspector ports,
 *      and each window could listen on its own.
 * Each case first checks that the stand-in program ran, so a run that never started cannot pass.
 *
 * ROUND 19b. The drivers gave their windows fixed inspector ports, 9229 and 9230, and cases 1 and 2 asked
 * first that the port was free. Run side by side with
 * tests/the-window-driver-keeps-its-pictures-out-of-dev-shm.test.ts, which runs drive-the-window.mjs too, the
 * two files met at 9229 and one went red every time (the inspector's check n9aXRJuZT_a5). Both drivers now
 * ask the system for a free port (aFreePort in tests/installed/ask-until.mjs). Case 3 is what fails if a
 * fixed port comes back, in this file alone and whatever runs beside it.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-window-and-terminal-drivers-pass-no-office-on.test.ts
 * MUTATIONS, each run on 5 October 2026:
 *   - drive-the-window.mjs starts the window with process.env, as before round 18: red, case 1;
 *   - open-an-agents-terminal.mjs starts the window with process.env, as before round 18: red, case 2.
 * MUTATION (round 19b), run on 5 October 2026 with this file and the dev-shm file side by side, as the full
 * suite runs files: both drivers given their fixed ports back (9229 and 9230): red, case 3 for each driver,
 * because the second window could not listen on the port the first held. The dev-shm file stayed green.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anAgentsShell, aStandInForTheShellsOffice, runToItsEnd, type TheShellsOffice } from './the-shells-office-stand-in.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let dir = ''

/** Each driver, with what it needs besides --app, --name and --out. */
const DRIVERS = [
  ['drive-the-window.mjs', ['--lang', 'en']],
  ['open-an-agents-terminal.mjs', []],
] as const
let theShellsOffice: TheShellsOffice | null = null

/**
 * The stand-in for the window's program. It is given the file to write to after the driver's `--`, and the
 * inspector's port as --inspect=<port>. It never runs as an office and never opens a window.
 */
const THE_STAND_IN_WINDOW = `#!${process.execPath}
'use strict'
const { writeFileSync } = require('node:fs')
const { createServer } = require('node:http')
const words = process.argv.slice(2)
const report = words.find((word) => !word.startsWith('--'))
const port = Number((words.find((word) => word.startsWith('--inspect=')) ?? '').slice('--inspect='.length))
const given = Object.keys(process.env).filter((name) => name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY').sort()
writeFileSync(report, JSON.stringify({ given, port }))
const api = process.env.MOLE_OFFICE_API
// As the office service does with the address it was given: it tells a registering agent to go there.
const call = api === undefined ? Promise.resolve() : fetch(api + '/api/agents/register-myself', { method: 'POST' }).catch(() => undefined)
// The driver's inspector is answered with no window, so it keeps asking until this program ends.
const inspector = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end('[]')
})
inspector.on('error', (err) => {
  writeFileSync(report, JSON.stringify({ given, port, inspector: String(err) }))
  process.exit(3)
})
inspector.listen(port, '127.0.0.1', () => {
  void call.then(() => setTimeout(() => process.exit(0), 1000))
})
`

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'drivers-pass-no-office-'))
  writeFileSync(join(dir, 'the-window'), THE_STAND_IN_WINDOW)
  chmodSync(join(dir, 'the-window'), 0o755)
  theShellsOffice = await aStandInForTheShellsOffice()
})

afterAll(async () => {
  await theShellsOffice?.close()
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe('the window driver and the terminal driver pass no office on', () => {
  for (const [driver, more] of DRIVERS) {
    it(`${driver} gives the window it starts none of the shell's office, and nothing reaches that office`, async () => {
      const name = driver.replace(/\.mjs$/, '')
      const home = join(dir, `${name}-home`)
      const out = join(dir, `${name}-out`)
      const given = join(dir, `${name}-given.json`)
      mkdirSync(home, { recursive: true })
      // Only what reached the stand-in during this case's own run counts here.
      const before = theShellsOffice?.reached.length ?? 0
      const run = await runToItsEnd(
        process.execPath,
        [join(REPO, 'tests', 'installed', driver), '--app', join(dir, 'the-window'), '--name', 'stand-in', '--out', out, ...more, '--', given],
        { cwd: dir, env: { PATH: process.env['PATH'], HOME: home, ...anAgentsShell(String(theShellsOffice?.address)) }, timeoutMs: 90_000 },
      )
      const said = `${run.stdout}\n${run.stderr}`
      expect(existsSync(given), `the stand-in window was never started\n${said}`).toBe(true)
      expect(theShellsOffice?.reached.slice(before), `the window ${driver} started reached the office the agent's shell names\n${said}`).toEqual([])
      expect(JSON.parse(readFileSync(given, 'utf8')), `${driver} gave the window it started the shell's office, or its window could not listen on its inspector port\n${said}`).toEqual({ given: ['MOLE_OFFICE_WINDOW_DEBUGGING'], port: expect.any(Number) })
      // The driver found no window and said so, rather than ending some other way.
      expect(run.stdout).toContain('FAIL stand-in')
      expect(run.stdout).toContain('the window opens')
    }, 120_000)
  }

  for (const [driver, more] of DRIVERS) {
    it(`${driver}, started twice at the same time, gives the two windows two inspector ports`, async () => {
      const name = driver.replace(/\.mjs$/, '')
      const runs = await Promise.all(['first', 'second'].map(async (which) => {
        const home = join(dir, `${name}-${which}-home`)
        const given = join(dir, `${name}-${which}-given.json`)
        mkdirSync(home, { recursive: true })
        const run = await runToItsEnd(
          process.execPath,
          [join(REPO, 'tests', 'installed', driver), '--app', join(dir, 'the-window'), '--name', which, '--out', join(dir, `${name}-${which}-out`), ...more, '--', given],
          { cwd: dir, env: { PATH: process.env['PATH'], HOME: home }, timeoutMs: 90_000 },
        )
        const said = `${run.stdout}\n${run.stderr}`
        expect(existsSync(given), `the ${which} stand-in window was never started\n${said}`).toBe(true)
        return { said, report: JSON.parse(readFileSync(given, 'utf8')) as { port: number, inspector?: string } }
      }))
      for (const { said, report } of runs) {
        expect(report.inspector, `a window ${driver} started could not listen on the inspector port it was given\n${said}`).toBeUndefined()
      }
      expect(runs[0]?.report.port, `${driver} gave both windows the inspector port ${String(runs[0]?.report.port)}`).not.toBe(runs[1]?.report.port)
    }, 120_000)
  }
})
