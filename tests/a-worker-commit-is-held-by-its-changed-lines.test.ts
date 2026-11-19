// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER'S COMMIT IS HELD BY THE MERGED RUN WHEN ITS OWN CHANGED LINES ARE THERE, UNCHANGED. The third proof of
 * `whatALaterSealHolds` (src/server/lib/sealed-tip.ts): the same patch-id over a diff with no context lines (-U0).
 * The secretary's decision MHMyFLGfSGLY, on a wave 13k worker's measurement of the thirteen-f runs (report aUYFiA68BGIz).
 *
 * WHAT IS PROVED, on throwaway git repositories this file makes and removes. Every fixture is synthetic: it is built
 * in the SHAPE the measurement found, not copied from any real run.
 *
 *   1. THE SHAPE OF 13f's 73c67688a (runs v9bVVUjH5anE and lQRufu3fGZ3W): main changed a line two lines above the
 *      worker's added import, so the wave's cherry-pick of it has other context lines and another patch-id. The third
 *      proof pairs it, `how` is `same changed lines`, and a commit the second proof already pairs keeps its pair.
 *   2. S1 to S3, damaged copies, are still refused: a copy that lost a new file, one that lost the module, and one
 *      with a comparison inverted.
 *   3. S5, a block of the worker's lines moved elsewhere in the same file, IS ACCEPTED. The measurement named it as the
 *      one kind of copy this proof takes that the second does not; the inspector's check of the wave's tree is what
 *      stands against it. The case's name says so, so nobody reads its green as a refusal.
 *
 * MUTATION (wave 13k round 4): read the third proof with context too (drop `-U0`). Cases 1 and 3 go red.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

// THE READER IS LOADED AFTER A THROWAWAY DATABASE IS CHOSEN: sealed-tip.ts opens MOLE_OFFICE_DB when it loads, and
// this test reads only git, so the database it opens is one of its own and nothing is written to it.
let t: TestDb
let whatALaterSealHolds: typeof import('../src/server/lib/sealed-tip.ts')['whatALaterSealHolds']
beforeAll(async () => {
  t = await freshDb()
  ;({ whatALaterSealHolds } = await import('../src/server/lib/sealed-tip.ts'))
})

// A FOLDER OF ITS OWN under the system's temporary folder, not inside .logs/, which a fresh merge clone does not have
// (problem h09tYuNl1nd9). The repositories here are the test's own, so nothing needs to be inside the checkout.
const base = realpathSync(mkdtempSync(join(tmpdir(), 'changed-lines-')))
afterAll(() => {
  rmSync(base, { recursive: true, force: true })
  t?.close()
})

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function write(dir: string, files: Record<string, string | null>): void {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(dir, path), { force: true })
    else {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
  }
}
function commit(dir: string, files: Record<string, string | null>, subject: string): string {
  write(dir, files)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', subject)
  return git(dir, 'rev-parse', 'HEAD')
}

const IMPORTS = 'import a from "a"\nimport b from "b"\nimport c from "c"\n\nexport const x = 1\n'
const MODULE = 'export function allowed(key: string, held: string): boolean {\n  return key === held\n}\n'
const TEST = 'import { allowed } from "./keyheader"\n\nit("allows the held key", () => {\n  expect(allowed("k", "k")).toBe(true)\n})\n'

/** A repository with a baseline, a worker branch cut from it, and main moved on beside it. */
function aRepository(name: string, files: Record<string, string>): { dir: string; fork: string } {
  const dir = join(base, name)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic changed-lines fixture')
  const fork = commit(dir, files, 'Synthetic baseline')
  return { dir, fork }
}

/** The wave: cut from where main is now, holding the given commits, each made by the function it is given. */
function aWave(dir: string, from: string, make: () => void): { forkBase: string; commit: string } {
  git(dir, 'switch', '-q', '-c', `wave-${String(Math.random()).slice(2, 8)}`, from)
  make()
  return { forkBase: from, commit: git(dir, 'rev-parse', 'HEAD') }
}

describe('the third proof: the same changed lines', () => {
  it('settles a worker commit whose context moved, the shape of 13f\'s 73c67688a (v9bVVUjH5anE, lQRufu3fGZ3W)', () => {
    const { dir, fork } = aRepository('context-moved', { 'src/worker.ts': IMPORTS, 'src/other.ts': 'export const y = 1\n' })
    git(dir, 'switch', '-q', '-c', 'worker')
    const untouched = commit(dir, { 'src/other.ts': 'export const y = 2\n' }, 'The worker changes other')
    const importing = commit(dir, { 'src/worker.ts': IMPORTS.replace('import c from "c"\n', 'import c from "c"\nimport lead from "lead"\n') }, 'The worker adds the lead import')
    // MAIN MOVES the import two lines above the worker's, as main's change beside 73c67688a did.
    git(dir, 'switch', '-q', 'main')
    const mainNow = commit(dir, { 'src/worker.ts': IMPORTS.replace('import a from "a"', 'import a2 from "a"') }, 'Main changes an import nearby')
    const wave = aWave(dir, mainNow, () => git(dir, 'cherry-pick', untouched, importing))

    const held = whatALaterSealHolds(dir, { forkBase: fork, commit: importing }, wave)
    expect(held).toMatchObject({ holds: true, how: 'same changed lines' })
    const picked = git(dir, 'log', '--reverse', '--format=%H', `${mainNow}..${wave.commit}`).split('\n')
    expect(held.holds && held.commits).toEqual([
      { commit: untouched, as: picked[0] },
      { commit: importing, as: picked[1] },
    ])
  })

  it('still refuses the damaged copies S1 to S3: a lost test file, a lost module, an inverted comparison', () => {
    const { dir, fork } = aRepository('damaged', { 'src/index.ts': 'export {}\n' })
    git(dir, 'switch', '-q', '-c', 'worker')
    const work = commit(dir, { 'src/keyheader.ts': MODULE, 'tests/keyheader.test.ts': TEST }, 'The worker adds the key header module and its test')
    git(dir, 'switch', '-q', 'main')
    const mainNow = commit(dir, { 'src/index.ts': 'export {}\nexport const main = 1\n' }, 'Main moves on')
    const copies: Record<string, Record<string, string | null>> = {
      'S1, the test file lost': { 'src/keyheader.ts': MODULE },
      'S2, the module lost': { 'tests/keyheader.test.ts': TEST },
      'S3, the comparison inverted': { 'src/keyheader.ts': MODULE.replace('===', '!=='), 'tests/keyheader.test.ts': TEST },
    }
    for (const [name, files] of Object.entries(copies)) {
      const wave = aWave(dir, mainNow, () => commit(dir, files, 'The worker adds the key header module and its test'))
      const held = whatALaterSealHolds(dir, { forkBase: fork, commit: work }, wave)
      expect(held, name).toEqual({ holds: false, missing: [{ commit: work, subject: 'The worker adds the key header module and its test' }], held: [] })
    }
  })

  it('ACCEPTS S5, a block of the worker\'s lines moved elsewhere in the same file, which this proof cannot tell apart', () => {
    const body = Array.from({ length: 40 }, (_, i) => `export const line${String(i)} = ${String(i)}\n`).join('')
    const block = 'export function added() {\n  return "the worker"\n}\n'
    const { dir, fork } = aRepository('moved-block', { 'src/index.ts': body })
    git(dir, 'switch', '-q', '-c', 'worker')
    const lines = body.split('\n')
    const work = commit(dir, { 'src/index.ts': [...lines.slice(0, 5), block.trimEnd(), ...lines.slice(5)].join('\n') }, 'The worker adds a function')
    git(dir, 'switch', '-q', 'main')
    const wave = aWave(dir, fork, () => commit(dir, { 'src/index.ts': [...lines.slice(0, 35), block.trimEnd(), ...lines.slice(35)].join('\n') }, 'The worker adds a function'))
    const held = whatALaterSealHolds(dir, { forkBase: fork, commit: work }, wave)
    expect(held).toMatchObject({ holds: true, how: 'same changed lines' })
  })
})
