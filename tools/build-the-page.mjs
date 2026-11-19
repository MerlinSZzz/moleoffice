// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * BUILD THE BROWSER APP, AND WRITE THE STAMP THAT SAYS WHAT THE BUILD TOOK IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE BUILD GOES SOMEWHERE ELSE FIRST
 * ---------------------------------------------------------------------------------------
 *
 * S1 of design/ground/ACCEPTANCE.md section 9 asks that a build that fails keeps the last good
 * build serving, so the page is never blank. `vite build` with `emptyOutDir` deletes the output
 * folder before it writes anything, so building straight into `dist/web` would leave NOTHING there
 * on a failure — the exact blank page the criterion forbids, and the failure would erase the
 * evidence of what it replaced.
 *
 * So the build is written into a staging folder beside the real one, and only a build that finished
 * is moved into place. The stamp is written into the staging folder before the move, so the built
 * page and the record of what it was built from appear together or not at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE STAMP IS
 * ---------------------------------------------------------------------------------------
 *
 * The newest source file the page is built from, read at the moment the build begins, and the
 * commit the checkout was at. src/config/build-stamp.mjs says why both are there and how the door
 * reads them. This file is the only writer.
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_PAGES_ENTRY, newestSourceBuiltFrom } from '../src/config/newest-source.mjs'
import { writeTheBuildStamp } from '../src/config/build-stamp.mjs'
import { localStamp } from '../src/shared/time.ts'

/** The folder a build is written into before it is moved over the last good one. */
export const THE_STAGING_FOLDER = 'dist/web-next'

/**
 * THE FIRST FILE A BUILD SAID WAS WRONG, or null because its output named none.
 *
 * The output of a failed `vite build` is a stack of its own words, and what a person needs is the
 * file. This reads the first path under the checkout that looks like source. It is one reading and
 * the whole output is kept beside it, so a reader is never given a guess with nothing behind it.
 *
 * @param {string} output everything the build printed
 * @returns {string | null}
 */
export function theFileABuildFailedOn(output) {
  const found = /(?:^|[\s('"[])((?:[A-Za-z]:)?[^\s:()'"]*?src[/\\][^\s:()'"]+\.(?:tsx?|jsx?|css|html|json))/m.exec(output)
  if (found === null || found[1] === undefined) return null
  const path = found[1].replace(/\\/g, '/')
  const at = path.indexOf('src/')
  return at === -1 ? path : path.slice(at)
}

/** The commit this checkout is at, or null because git could not say. */
export function theCommitOf(root = REPO_ROOT) {
  const ran = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  if (ran.status !== 0) return null
  const said = String(ran.stdout ?? '').trim()
  return said === '' ? null : said
}

/**
 * Run one command to completion, with everything it printed.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} where
 * @returns {Promise<{ code: number, output: string }>}
 */
function run(command, args, where) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: where.cwd, env: where.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      output += `\nthe build command could not be started (${err instanceof Error ? err.message : String(err)})\n`
      done({ code: -1, output })
    })
    child.on('exit', (code, signal) => {
      done({ code: signal === null ? (code ?? -1) : -1, output })
    })
  })
}

/**
 * BUILD THE PAGE FOR ONE CHECKOUT, keeping the last good build if this one fails.
 *
 * @param {object} [options]
 * @param {string} [options.root] the checkout. The build runs there.
 * @param {(line: string) => void} [options.say] where the plain lines go
 * @returns {Promise<{ ok: true, file: string, builtAt: string, newestSourceFile: string | null }
 *   | { ok: false, file: string | null, output: string }>}
 */
export async function buildThePage(options = {}) {
  const root = options.root ?? REPO_ROOT
  const say = options.say ?? (() => {})
  const staging = join(root, THE_STAGING_FOLDER)
  const target = join(root, 'dist', 'web')
  // WHAT THE BUILD IS ABOUT TO TAKE IN, read before it starts. A file saved while the build runs
  // is then newer than the stamp, and the door says the page is behind — the safe direction.
  const newestSource = newestSourceBuiltFrom(THE_PAGES_ENTRY, root)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  const vite = join(root, 'node_modules', '.bin', 'vite')
  // A PRODUCTION PAGE, WHATEVER NODE_ENV THE CALLER HAS. Vite keeps a NODE_ENV it inherits, and under
  // anything but `production` React is built in development mode, with the absolute path of every
  // source file in the page. A test that calls this has vitest's `test`. tests/helpers.ts sets it the
  // same way for its own build ("BUILT FOR PRODUCTION").
  const ran = await run(vite, ['build', '--outDir', staging, '--emptyOutDir'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (ran.code !== 0) {
    const file = theFileABuildFailedOn(ran.output)
    rmSync(staging, { recursive: true, force: true })
    return { ok: false, file, output: ran.output }
  }
  const at = new Date()
  writeTheBuildStamp(staging, { at, newestSource, commit: theCommitOf(root) })
  // THE MOVE. The last good build is removed and the finished one put in its place. There is a
  // moment between the two where the folder is absent; it is two filesystem calls wide, and the
  // alternative — emptying the folder before a build that may fail — leaves nothing at all.
  rmSync(target, { recursive: true, force: true })
  renameSync(staging, target)
  // LOCAL WALL-CLOCK TIME, as the build stamp beside it is (chapter 4 rule 8; acceptance finding 63).
  say(`[build] the page was built from ${newestSource === null ? 'no files at all' : newestSource.file} at ${localStamp(at)}.`)
  return { ok: true, file: target, builtAt: localStamp(at), newestSourceFile: newestSource?.file ?? null }
}
