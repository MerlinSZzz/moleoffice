// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIT REFUSES AN OUT FILE OUTSIDE ~/.cache/mole-office, BEFORE IT READS OR WRITES ANYTHING.
 *
 * read-new.sh and mark-read.sh used to take the out file's path as given. A bare name put the
 * offset files into the owner's checkout, twice. Chapter 3 of the office regulations says nothing an
 * agent makes goes into the owner's home outside ~/.cache/mole-office, so both scripts now refuse a
 * path that is not an absolute path under that cache folder. The folder holding the out file must
 * exist, and its real path must be the cache folder or lie under it. The out file itself may still
 * be missing, as before.
 *
 * WHAT IS PROVED, FOR EACH OF THE FOUR SCRIPTS: for-agents/read-new.sh, for-agents/mark-read.sh,
 * tools/kit/read-new.sh and tools/kit/mark-read.sh.
 *   1. A bare name is refused with exit 2, the stderr names the rule, and nothing is written in the
 *      working folder.
 *   2. An absolute path in a folder outside the cache is refused, and nothing is written there.
 *   3. A path spelled $HOME/.cache/mole-office/../out/waiter.out is refused.
 *   4. A path through a link inside the cache that points outside it is refused, and nothing is
 *      written outside.
 *   5. A path under $HOME/.cache/mole-office/<folder>/ is taken, and the script does what it did
 *      before: read-new.sh prints the words and writes the pending size; mark-read.sh copies the
 *      pending size to the read point.
 * The case that ran design/agents/kit/read-new.sh now lives in
 * tests/the-old-kit-path-refuses-a-bare-name-through-its-forwarder.test.ts.
 *
 * EVERY RUN GETS ITS OWN FRESH HOME UNDER os.tmpdir() AND ITS OWN FRESH WORKING FOLDER, so nothing
 * here writes into the home this run started with. Each script is started with `detached: true`,
 * the leader of a process group of its own, and waited for; if one has not ended within ten seconds
 * its group is stopped by that id and the case fails (office regulations, chapter 2).
 *
 * MUTATIONS, EACH PROVED AFTER A CONTROL RUN (the round's report has the logs):
 *   - no check in tools/kit/read-new.sh: cases 1 to 4 go red for that script.
 *   - no check in for-agents/mark-read.sh: cases 1 to 4 go red for that script.
 *   - a prefix check on the path as given, with no real path: cases 3 and 4 go red, because the
 *     `..` and the link both pass a prefix check and the script then writes outside the cache.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const THE_FOUR = [
  { name: 'for-agents/read-new.sh', script: fileURLToPath(new URL('../for-agents/read-new.sh', import.meta.url)) },
  { name: 'for-agents/mark-read.sh', script: fileURLToPath(new URL('../for-agents/mark-read.sh', import.meta.url)) },
  { name: 'tools/kit/read-new.sh', script: fileURLToPath(new URL('../tools/kit/read-new.sh', import.meta.url)) },
  { name: 'tools/kit/mark-read.sh', script: fileURLToPath(new URL('../tools/kit/mark-read.sh', import.meta.url)) },
] as const

const THE_RULE =
  "chapter 3 of the office regulations: nothing an agent makes goes into the owner's home outside ~/.cache/mole-office"

/** Every folder this file made, removed when it is done. */
const MADE: string[] = []

afterAll(() => {
  for (const dir of MADE.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A fresh folder under the system's temporary folder, removed after this file's tests. */
function aFreshFolder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  MADE.push(dir)
  return dir
}

/** A fresh home whose cache folder is there, as the rule requires. */
function aHomeWithTheCache(): string {
  const home = aFreshFolder('mole-office-kit-refuses-home-')
  mkdirSync(join(home, '.cache', 'mole-office'), { recursive: true })
  return home
}

interface Ran {
  code: number | null
  out: string
  err: string
}

/** Run one script in a process group of its own, with the given home, working folder and out file. */
async function run(script: string, out: string, home: string, cwd: string): Promise<Ran> {
  const child = spawn('bash', [script, out], {
    cwd,
    detached: true,
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let printed = ''
  let refused = ''
  child.stdout.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (refused += chunk.toString('utf8')))
  let stoppedByTheTimer = false
  const timer = setTimeout(() => {
    stoppedByTheTimer = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, 10_000)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`${script} was still running after ten seconds, so its group was stopped`)
  return { code, out: printed, err: refused }
}

/** The script's own name, as the refusal names it. */
function theScriptsName(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1)
}

describe('the kit refuses an out file outside the cache', () => {
  it.each(THE_FOUR)('case 1: $name refuses a bare name and writes nothing in the working folder', async ({ name, script }) => {
    const home = aHomeWithTheCache()
    const cwd = aFreshFolder('mole-office-kit-refuses-cwd-')
    const ran = await run(script, 'waiter.out', home, cwd)
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain(THE_RULE)
    expect(ran.err).toContain(theScriptsName(name))
    expect(ran.err).toContain('waiter.out')
    expect(ran.err).toContain('Nothing was read or written')
    expect(readdirSync(cwd), 'the refused run wrote in the working folder').toEqual([])
  })

  it.each(THE_FOUR)('case 2: $name refuses an absolute path in a folder outside the cache', async ({ name, script }) => {
    const home = aHomeWithTheCache()
    const cwd = aFreshFolder('mole-office-kit-refuses-cwd-')
    const outside = join(home, 'outside-the-cache')
    mkdirSync(outside)
    const ran = await run(script, join(outside, 'waiter.out'), home, cwd)
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain(THE_RULE)
    expect(ran.err).toContain(theScriptsName(name))
    expect(readdirSync(outside), 'the refused run wrote outside the cache').toEqual([])
  })

  it.each(THE_FOUR)('case 3: $name refuses a path whose .. climbs out of the cache', async ({ name, script }) => {
    const home = aHomeWithTheCache()
    const cwd = aFreshFolder('mole-office-kit-refuses-cwd-')
    const outFolder = join(home, 'out')
    mkdirSync(outFolder)
    const out = `${join(home, '.cache', 'mole-office')}/../out/waiter.out`
    const ran = await run(script, out, home, cwd)
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain(THE_RULE)
    expect(ran.err).toContain(theScriptsName(name))
    expect(readdirSync(outFolder), 'the refused run wrote outside the cache').toEqual([])
  })

  it.each(THE_FOUR)('case 4: $name refuses a path through a link inside the cache that points outside', async ({ name, script }) => {
    const home = aHomeWithTheCache()
    const cwd = aFreshFolder('mole-office-kit-refuses-cwd-')
    const outside = aFreshFolder('mole-office-kit-refuses-outside-')
    symlinkSync(outside, join(home, '.cache', 'mole-office', 'escape'), 'dir')
    const out = join(home, '.cache', 'mole-office', 'escape', 'waiter.out')
    const ran = await run(script, out, home, cwd)
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain(THE_RULE)
    expect(ran.err).toContain(theScriptsName(name))
    expect(readdirSync(outside), 'the refused run wrote through the link').toEqual([])
  })

  it.each(THE_FOUR)('case 5: $name takes an out file under the cache and does what it did before', async ({ name, script }) => {
    const home = aHomeWithTheCache()
    const cwd = aFreshFolder('mole-office-kit-refuses-cwd-')
    const folder = join(home, '.cache', 'mole-office', 'an-agent')
    mkdirSync(folder)
    const out = join(folder, 'waiter.out')
    writeFileSync(out, 'A words.\n')
    if (name.endsWith('read-new.sh')) {
      const ran = await run(script, out, home, cwd)
      expect(ran.code, ran.err).toBe(0)
      expect(ran.out).toBe('A words.\n')
      expect(readFileSync(out + '.read-offset.pending', 'utf8')).toBe('9\n')
    } else {
      writeFileSync(out + '.read-offset.pending', '5\n')
      const ran = await run(script, out, home, cwd)
      expect(ran.code, ran.err).toBe(0)
      expect(readFileSync(out + '.read-offset', 'utf8')).toBe('5\n')
    }
  })
})
