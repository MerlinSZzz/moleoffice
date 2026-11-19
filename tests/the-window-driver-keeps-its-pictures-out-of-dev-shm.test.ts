// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW DRIVER KEEPS ITS PICTURES OUT OF /dev/shm (wave 13t, round 19; problem TKH0KMph-bMR).
 *
 * In round 16's container run, a picture of the Chinese check page ended the window: the browser refused the
 * picture the GPU process sent ("rejected by interface viz.mojom.CopyOutputResultSender"), killed the GPU
 * process (exit 9), and on the third time said "GPU process isn't usable. Goodbye." Round 19 found why. Without
 * Chromium's sandbox the picture comes back through a file in /dev/shm. A container's /dev/shm is 64 MB, and
 * the window alone used about 45 MB of it. Round 19 filled /dev/shm to 3 MB free after a page had drawn, and
 * the same three lines and the same end followed, in English as well as Chinese. With
 * --disable-dev-shm-usage, which keeps that memory in /tmp, all ten pictures were taken in both languages.
 *
 * tests/installed/drive-the-window.mjs starts a window it pictures with that switch, and says so. This test
 * runs the driver against a stand-in program that writes down the arguments it was given and ends, so the
 * driver finds no window and stops. It needs no display and no installed app: what is proved is only what
 * the driver gives the program it starts.
 *
 *   1. With --pictures the window is given --disable-dev-shm-usage, and the driver says so in a NOTE.
 *   2. Without --pictures it is not given it: the switch is for pictures, and the installed window is
 *      otherwise run as a person runs it.
 * Each case first checks that the stand-in program ran, so a run that never started cannot pass.
 *
 * ROUND 19b. This file asked that port 9229, the driver's fixed inspector port, was free before each case.
 * Run side by side with tests/the-window-and-terminal-drivers-pass-no-office-on.test.ts, whose stand-in window
 * held 9229, its second case went red every time (the inspector's check n9aXRJuZT_a5). The driver now asks
 * the system for a free port, so this file holds no port and asks for none.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-window-driver-keeps-its-pictures-out-of-dev-shm.test.ts
 * MUTATIONS, each run on 5 October 2026:
 *   - the driver gives the switch to no window: red, case 1;
 *   - the driver gives the switch to every window: red, case 2.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { runToItsEnd } from './the-shells-office-stand-in.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const DRIVER = join(REPO, 'tests', 'installed', 'drive-the-window.mjs')

let dir = ''

/** The stand-in for the window's program: it writes the arguments it was given to the file named after the driver's `--`, and ends. */
const THE_STAND_IN_WINDOW = `#!${process.execPath}
'use strict'
const words = process.argv.slice(2)
require('node:fs').writeFileSync(words.find((word) => !word.startsWith('--')), JSON.stringify(words))
`

async function whatTheWindowIsGiven(pictures: boolean): Promise<{ given: string[]; stdout: string }> {
  const name = pictures ? 'pictured' : 'unpictured'
  const home = join(dir, `${name}-home`)
  const given = join(dir, `${name}-given.json`)
  mkdirSync(home, { recursive: true })
  const run = await runToItsEnd(
    process.execPath,
    [DRIVER, '--app', join(dir, 'the-window'), '--name', name, '--lang', 'zh', '--out', join(dir, `${name}-out`), ...(pictures ? ['--pictures'] : []), '--', given],
    { cwd: dir, env: { PATH: process.env['PATH'], HOME: home }, timeoutMs: 90_000 },
  )
  expect(existsSync(given), `the stand-in window was never started\n${run.stdout}\n${run.stderr}`).toBe(true)
  // The driver found no window and said so, rather than ending some other way.
  expect(run.stdout).toContain(`FAIL ${name} zh the window opens`)
  return { given: JSON.parse(readFileSync(given, 'utf8')) as string[], stdout: run.stdout }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pictures-out-of-dev-shm-'))
  writeFileSync(join(dir, 'the-window'), THE_STAND_IN_WINDOW)
  chmodSync(join(dir, 'the-window'), 0o755)
})

afterAll(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

it('gives a window it pictures --disable-dev-shm-usage, and says so', async () => {
  const { given, stdout } = await whatTheWindowIsGiven(true)
  expect(given).toContain('--disable-dev-shm-usage')
  expect(stdout).toContain('NOTE pictured zh the window is started with --disable-dev-shm-usage')
}, 120_000)

it('does not give it to a window it does not picture', async () => {
  const { given, stdout } = await whatTheWindowIsGiven(false)
  expect(given).not.toContain('--disable-dev-shm-usage')
  expect(stdout).not.toContain('--disable-dev-shm-usage')
}, 120_000)
