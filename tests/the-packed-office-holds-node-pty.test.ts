// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PACKED OFFICE HOLDS NODE-PTY WHERE ITS OWN NODE CAN LOAD IT. Wave 13u, round 5: the terminal in the Linux
 * installers.
 *
 * scripts/package-linux.mjs calls scripts/the-terminal-in-a-bundle.mjs on the bundle it packs, with the app's own program
 * run as Node. This test does the same on a bundle folder of its own (a folder with a build stamp, as `npm run bundle`
 * leaves one), and checks what an installed office then has:
 *
 *   1. node-pty's native file for this system and processor is at node_modules/node-pty/prebuilds/<system>-<processor>/
 *      pty.node, beside node-pty's package.json, lib/ and LICENSE, and nothing of node-pty's sources or build tree is.
 *   2. The Node the installers carry loads that node-pty from the folder, with no other node_modules on its search path,
 *      and a shell answers through it.
 *   3. holder.mjs, run from the folder, is the program there: it answers on its socket, and holds a shell that prints 你好.
 *   4. howToStart('holder'), asked from inside a bundle, refuses before the holder is put in, and names holder.mjs after.
 *
 * THE NODE. The Windows and Mac installers carry Node THE_SHIPPED_NODE_VERSION. Points 2 and 3 mean something only on that Node, so on any
 * other this file says so and runs nothing.
 *
 * Three-run proofs and the mutations are in the commit message that added this file:
 *   - the module copies no native file: red, because the module's own check refuses before any point runs; with that
 *     check turned off as well, points 1 to 3 red;
 *   - isTheProgramRun does not know holder.mjs as the holder's bundle: point 3 red (holder.mjs runs nothing);
 *   - howToStart refuses in a bundle even with holder.mjs there: point 4 red.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { putTheTerminalIn, theShellAnswersThroughThePty, thePtyNativeFile, THE_PTY_MODULE } from '../scripts/the-terminal-in-a-bundle.mjs'
import { askTheHolder } from '../src/config/the-terminal-holder.mjs'
import { THE_HOLDER_BUNDLE, THE_SHIPPED_NODE_VERSION } from '../src/config/settings.mjs'
import { aPlace, groups, openThroughTheHolder, REPO, stopEverything, until, untilTheScreenShows, type Place } from './terminal-holder-stand.ts'

const WHY_NOT = process.version === `v${THE_SHIPPED_NODE_VERSION}` ? null : `the installers carry Node v${THE_SHIPPED_NODE_VERSION}, and this test runs on ${process.version}`
if (WHY_NOT !== null) console.log(`the-packed-office-holds-node-pty: skipped, because ${WHY_NOT}.`)

let place: Place
let office = ''

/** What howToStart('holder') answers when it runs from inside the bundle folder, or what it threw. */
function howTheBundleStartsTheHolder(): { command?: string; args?: string[]; environment?: Record<string, string>; threw?: string } {
  const ran = spawnSync(process.execPath, [join(office, 'ask.mjs')], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, ...place.env } })
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as { command?: string; args?: string[]; environment?: Record<string, string>; threw?: string }
}

describe.skipIf(WHY_NOT !== null)('the packed office holds node-pty where its own Node can load it', () => {
  let before: ReturnType<typeof howTheBundleStartsTheHolder>

  beforeAll(async () => {
    place = aPlace('packed-pty')
    office = join(place.dir, 'office')
    mkdirSync(office)
    writeFileSync(join(office, 'build-stamp.json'), `${JSON.stringify({ builtAt: '2026-10-04 15:00:00', builtAtMs: Date.UTC(2026, 9, 4, 14), commit: null })}\n`)
    // A PROGRAM THAT RUNS FROM THE BUNDLE, so settings.mjs inside it sees a bundle, as the installed service does.
    await build({
      stdin: {
        contents: `import { howToStart } from ${JSON.stringify(join(REPO, 'src', 'config', 'settings.mjs'))}\n` +
          "try { process.stdout.write(JSON.stringify(howToStart('holder'))) } catch (err) { process.stdout.write(JSON.stringify({ threw: err.message })) }\n",
        resolveDir: REPO,
        loader: 'js',
      },
      outfile: join(office, 'ask.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'warning',
    })
    before = howTheBundleStartsTheHolder()
    await putTheTerminalIn(office, process.execPath)
  }, 120_000)

  afterAll(async () => {
    await stopEverything()
  })

  it("1. node-pty's native file is where node-pty loads it, with only what an installed office needs", () => {
    const pty = join(office, 'node_modules', THE_PTY_MODULE)
    expect(existsSync(join(pty, thePtyNativeFile()))).toBe(true)
    expect(readdirSync(pty).sort()).toEqual(['LICENSE', 'lib', 'package.json', 'prebuilds'])
    expect(readdirSync(join(pty, 'prebuilds'))).toEqual([`${process.platform}-${process.arch}`])
    expect(existsSync(join(office, THE_HOLDER_BUNDLE))).toBe(true)
  })

  it('2. the Node the installers carry loads it from the folder alone, and a shell answers through it', () => {
    // NODE_PATH is emptied, so only the folder's own node_modules can be found.
    const before = process.env['NODE_PATH']
    process.env['NODE_PATH'] = ''
    try {
      expect(theShellAnswersThroughThePty(office, process.execPath)).toEqual({ ok: true, said: 'pty-answers-42' })
    } finally {
      if (before === undefined) delete process.env['NODE_PATH']
      else process.env['NODE_PATH'] = before
    }
  })

  it('3. holder.mjs, run from the folder, is the holder there, and holds a shell that prints 你好', async () => {
    const child = spawn(process.execPath, [join(office, THE_HOLDER_BUNDLE), '--database', place.database], {
      cwd: office,
      env: { ...process.env, ...place.env, LANG: 'C.UTF-8' },
      detached: true,
      stdio: 'ignore',
    })
    expect(child.pid).toBeTypeOf('number')
    groups.add(child.pid as number)
    const hello = await until(() => askTheHolder(place.socket, { op: 'hello' }, 1_000).catch(() => null), (answer) => answer?.['pid'] === child.pid, 15_000)
    expect(hello?.['pid']).toBe(child.pid)
    const terminal = await openThroughTheHolder(place, { command: '/bin/sh', args: ['-c', 'printf "%s\\n" "$(printf "\\344\\275\\240\\345\\245\\275")"; sleep 30'] })
    const screen = await untilTheScreenShows(place, terminal.id, '你好')
    expect(screen.some((line) => line.trim() === '你好'), screen.join('\n')).toBe(true)
  }, 60_000)

  it("4. howToStart('holder') in a bundle refuses without holder.mjs, and starts it with this Node when it is there", () => {
    expect(before.threw).toBe('This bundle does not carry the terminal holder, so the office cannot hold terminals here.')
    // On Linux a bundle's Node is the program that runs it, told to run as Node; plain Node reads nothing in that variable.
    const environment = process.platform === 'linux' ? { ELECTRON_RUN_AS_NODE: '1' } : {}
    expect(howTheBundleStartsTheHolder()).toEqual({ command: process.execPath, args: [join(office, THE_HOLDER_BUNDLE)], environment })
  })
})
