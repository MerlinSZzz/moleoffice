// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY BUNDLE CARRIES THE TERMINAL HOLDER. Wave 13t, round 17.
 *
 * Wave 13u's report rJKD_1quy9KN, block b-10, item 4: only scripts/package-linux.mjs put holder.mjs and node-pty into a
 * bundle, so a bundle made by `npm run bundle` alone refused to start the holder. Item 5: the terminal is made of five
 * packages, and the notices were written before the holder was put in, so three of them were not named. This test makes
 * a bundle with `node scripts/bundle.mjs --out <its own folder>`, as `npm run bundle` does, and checks:
 *
 *   1. it holds holder.mjs, and node-pty beside it with its LICENSE and the native file for this system and processor;
 *   2. howToStart('holder'), asked from inside that bundle, starts holder.mjs with this Node, and holder.mjs, run from the
 *      folder, answers on its socket and holds a shell that prints 你好.
 *
 * It needs the built page (`npm run build`), as every bundle does.
 *
 * Three-run proofs and the mutations are in the commit message that added this file:
 *   - scripts/bundle.mjs does not put the terminal in: red, cases 1 and 2.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { thePtyNativeFile, THE_PTY_MODULE } from '../scripts/the-terminal-in-a-bundle.mjs'
import { askTheHolder } from '../src/config/the-terminal-holder.mjs'
import { THE_HOLDER_BUNDLE } from '../src/config/settings.mjs'
import { aPlace, groups, openThroughTheHolder, REPO, stopEverything, until, untilTheScreenShows, type Place } from './terminal-holder-stand.ts'

let place: Place
let bundle = ''
let made: ReturnType<typeof spawnSync>

beforeAll(() => {
  place = aPlace('every-bundle')
  bundle = join(place.dir, 'bundle')
  made = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', bundle], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
}, 320_000)

afterAll(async () => {
  await stopEverything()
})

describe('a bundle made by npm run bundle carries the terminal holder', () => {
  it('0. the bundle is made', () => {
    expect(made.status, `${String(made.stdout)}\n${String(made.stderr)}`).toBe(0)
  })

  it('1. it holds holder.mjs, and node-pty beside it with its licence and its native file', () => {
    expect(existsSync(join(bundle, THE_HOLDER_BUNDLE))).toBe(true)
    const pty = join(bundle, 'node_modules', THE_PTY_MODULE)
    expect(existsSync(join(pty, thePtyNativeFile()))).toBe(true)
    expect(readdirSync(pty).sort()).toEqual(['LICENSE', 'lib', 'package.json', 'prebuilds'])
  })

  it("2. howToStart('holder') in that bundle starts holder.mjs, and holder.mjs holds a shell that prints 你好", async () => {
    // A PROGRAM THAT RUNS FROM THE BUNDLE, so settings.mjs inside it sees the bundle, as the installed service does.
    const ask = join(bundle, 'ask.mjs')
    await build({
      stdin: {
        contents: `import { howToStart } from ${JSON.stringify(join(REPO, 'src', 'config', 'settings.mjs'))}\n` +
          "try { process.stdout.write(JSON.stringify(howToStart('holder'))) } catch (err) { process.stdout.write(JSON.stringify({ threw: err.message })) }\n",
        resolveDir: REPO,
        loader: 'js',
      },
      outfile: ask,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'warning',
    })
    const asked = spawnSync(process.execPath, [ask], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, ...place.env } })
    expect(asked.status, asked.stderr).toBe(0)
    const how = JSON.parse(asked.stdout) as { command?: string; args?: string[]; environment?: Record<string, string>; threw?: string }
    // On Linux a bundle's Node is the program that runs it, told to run as Node; plain Node reads nothing in that variable.
    const environment = process.platform === 'linux' ? { ELECTRON_RUN_AS_NODE: '1' } : {}
    expect(how).toEqual({ command: process.execPath, args: [join(bundle, THE_HOLDER_BUNDLE)], environment })

    const child = spawn(how.command as string, [...(how.args as string[]), '--database', place.database], {
      cwd: bundle,
      env: { ...process.env, ...place.env, ...how.environment, LANG: 'C.UTF-8' },
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
})
