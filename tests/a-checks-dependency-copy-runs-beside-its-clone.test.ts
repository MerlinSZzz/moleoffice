// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S PRIVATE COPY OF node_modules IS MADE ON A THREAD OF ITS OWN, WHILE THE INSPECTOR WAITS FOR GIT (item 2bb of
 * the requirement list).
 *
 * A check in a sandbox gets a private clone of the run's repository and a physical copy of the worker's node_modules.
 * The inspector made the copy after the clone and the checkout, on its own thread, so the check waited for both, one
 * after the other. The clone runs git as a child process that the inspector's thread waits for, so a copy begun before
 * it makes the check faster only if the copy goes on while that thread waits (tools/inspector-dependency-copy.mjs).
 *
 * WHAT IS PROVED, one case each:
 *   - The copy holds what the inspector's own copy held: the same entries, bytes, modes and link targets as
 *     `cpSync(from, to, { recursive: true, verbatimSymlinks: true })` on the test's own thread, and one link to each
 *     file, which the check view's validator asks of a private file.
 *   - The copy is not done when the call answers, and it is done while the test's thread waits for a child process,
 *     as the inspector's waits for `git clone`.
 *   - A copy that fails says why in the words the same copy throws on the test's own thread.
 *
 * Every file is made up by this test, in a temporary folder of its own that is removed after each case.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, then restored:
 *   - Copy on the calling thread before answering: the case of the waiting thread goes red, because the copy is done
 *     before the thread waits.
 *   - Copy on the calling thread after answering, when it is next free: the same case goes red, because nothing is
 *     copied while the thread waits.
 *   - Copy without verbatimSymlinks: the first case goes red, because a link inside the folder is rewritten.
 */
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { aDependencyCopyBegun } from '../tools/inspector-dependency-copy.mjs'

let scratch = ''
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'a-checks-dependency-copy-'))
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** Every entry under `root`, each as one line: its path, its kind, its mode, and its bytes or its link's target. */
function whatIsIn(root: string): string[] {
  const lines: string[] = []
  const walk = (folder: string) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name)
      const held = lstatSync(path)
      const where = relative(root, path)
      if (held.isSymbolicLink()) lines.push(`${where} link to ${readlinkSync(path)}`)
      else if (held.isDirectory()) {
        lines.push(`${where} folder ${(held.mode & 0o777).toString(8)}`)
        walk(path)
      } else lines.push(`${where} file ${(held.mode & 0o777).toString(8)} links ${String(held.nlink)} ${readFileSync(path, 'base64')}`)
    }
  }
  walk(root)
  return lines
}

describe("a check's private copy of node_modules", () => {
  it("holds what the inspector's own copy held, with one link to each file", async () => {
    const from = join(scratch, 'node_modules')
    mkdirSync(join(from, 'a-dependency', 'lib'), { recursive: true })
    mkdirSync(join(from, '.bin'))
    writeFileSync(join(from, 'a-dependency', 'package.json'), '{"name":"a-dependency","main":"lib/index.js"}\n')
    writeFileSync(join(from, 'a-dependency', 'lib', 'index.js'), 'module.exports = 42\n')
    writeFileSync(join(from, 'a-dependency', 'lib', 'run.js'), '#!/usr/bin/env node\n', { mode: 0o755 })
    symlinkSync('../a-dependency/lib/run.js', join(from, '.bin', 'a-dependency'))
    const expected = join(scratch, 'copied-here')
    cpSync(from, expected, { recursive: true, verbatimSymlinks: true })

    const begun = aDependencyCopyBegun(from, join(scratch, 'copied-there'))
    expect(await begun.copied).toBe(null)

    const there = whatIsIn(begun.to)
    expect(there).toEqual(whatIsIn(expected))
    expect(there).toContain('.bin/a-dependency link to ../a-dependency/lib/run.js')
    expect(there.filter((line) => / file /.test(line) && !/ links 1 /.test(line))).toEqual([])
  })

  it('is not done when the call answers, and is done while the calling thread waits for a child process', async () => {
    const from = join(scratch, 'node_modules')
    const files = 3000
    for (let folder = 0; folder < 30; folder += 1) {
      mkdirSync(join(from, `dependency-${String(folder)}`), { recursive: true })
      for (let file = 0; file < files / 30; file += 1) writeFileSync(join(from, `dependency-${String(folder)}`, `file-${String(file)}.js`), `module.exports = ${String(file)}\n`)
    }
    const to = join(scratch, 'copied')

    const begun = aDependencyCopyBegun(from, to)
    // THE CALLING THREAD IS HELD HERE, as the inspector's is by `git clone`: a shell counts the copied files every 50 ms
    // and ends when all are there, or after 20 seconds.
    const said = execFileSync('sh', ['-c', [
      'count() { find "$1" -type f 2>/dev/null | wc -l; }',
      'if [ "$(count "$1")" -eq "$2" ]; then echo "the copy was done before the thread waited"; exit 0; fi',
      'i=0',
      'while [ "$(count "$1")" -ne "$2" ]; do',
      '  i=$((i + 1)); if [ "$i" -gt 400 ]; then echo "$(count "$1") of $2 files were copied while the thread waited"; exit 0; fi',
      '  sleep 0.05',
      'done',
      'echo "every file was copied while the thread waited"',
    ].join('\n'), 'sh', to, String(files)], { encoding: 'utf8', timeout: 30_000 })

    expect(said.trim()).toBe('every file was copied while the thread waited')
    expect(await begun.copied).toBe(null)
  }, 60_000)

  it('that fails says why, in the words the same copy throws on the calling thread', async () => {
    const from = join(scratch, 'no-node-modules-here')
    const to = join(scratch, 'copied')
    let threw = ''
    try {
      cpSync(from, to, { recursive: true, verbatimSymlinks: true })
    } catch (why) {
      threw = String(why)
    }
    expect(threw).toMatch(/ENOENT/)

    expect(await aDependencyCopyBegun(from, to).copied).toBe(threw)
  })
})
