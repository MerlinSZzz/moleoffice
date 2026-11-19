// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VERIFIER'S DRY FORM (tools/stable/upgrade-stable.criteria.md, "A closed rollback opens the old version (item 24)",
 * (c)). A closed upgrade runs it before anything closes: the verifier's command, then `--dry`, the upgrade's timeoutMs
 * and the checks. Each case runs it that way in an empty folder with an empty home, and looks at what it printed, how it
 * exited, and whether anything was written in either folder. The made-up checkouts of tests/a-made-up-verifier-checkout.ts
 * have no better-sqlite3, or one that cannot open a database. No office, checkout or database of anybody's is read.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_STAND_IN_SAYS, THE_VERIFIER, aMadeUpVerifierCheckout, whereBetterSqliteIsFoundFrom } from './a-made-up-verifier-checkout.ts'

const CHECKS = ['health', 'records', 'reads', 'migrations', 'settings']

/** The dry form, run as the transaction runs it, in a new empty folder with an empty home. */
async function theDryForm(verifier: string, args: string[]) {
  const folder = realpathSync(aTestDatabaseFolder('verifier-dry'))
  const cwd = join(folder, 'cwd'), home = join(folder, 'home')
  mkdirSync(cwd); mkdirSync(home)
  const ran = await new Promise<{ code: number | null; stdout: string; stderr: string }>((ok) => {
    execFile(process.execPath, [verifier, ...args], { cwd, env: { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, TMPDIR: home, NODE_ENV: 'production' }, timeout: 20_000 },
      (error, stdout, stderr) => ok({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr }))
  })
  return { ...ran, wrote: [...readdirSync(cwd), ...readdirSync(home)] }
}

it('passes, says in one line what it checked, and writes nothing', async () => {
  const r = await theDryForm(THE_VERIFIER, ['--within', '3000', '--dry', '4000', ...CHECKS])
  expect(r.code, r.stderr).toBe(0)
  expect(r.stderr).toBe('')
  const lines = r.stdout.trim().split('\n')
  expect(lines).toHaveLength(1)
  for (const word of [CHECKS.join(', '), '3000 ms', '4000 ms', 'better-sqlite3']) expect(lines[0]).toContain(word)
  expect(r.wrote).toEqual([])
})

for (const [name, args, says] of [
  ['a check it does not know', ['--within', '3000', '--dry', '4000', 'health', 'no-such-check'], '"no-such-check"'],
  ['a --within equal to timeoutMs', ['--within', '4000', '--dry', '4000', ...CHECKS], '--within 4000 ms is not below'],
  ['a --within above timeoutMs', ['--within', '5000', '--dry', '4000', ...CHECKS], '--within 5000 ms is not below'],
] as const) it(`refuses ${name} with exit 2, and writes nothing`, async () => {
  const r = await theDryForm(THE_VERIFIER, [...args])
  expect(r.code, r.stderr).toBe(2)
  expect(r.stdout).toBe('')
  expect(r.stderr).toContain(says)
  expect(r.wrote).toEqual([])
})

it('refuses a checkout that cannot load better-sqlite3 with exit 2, and writes nothing', async () => {
  const verifier = aMadeUpVerifierCheckout('none')
  expect(whereBetterSqliteIsFoundFrom(verifier)).toBeNull()
  const r = await theDryForm(verifier, ['--within', '3000', '--dry', '4000', ...CHECKS])
  expect(r.code, r.stderr).toBe(2)
  expect(r.stdout).toBe('')
  expect(r.stderr).toContain('better-sqlite3 could not be loaded')
  expect(r.wrote).toEqual([])
})

it('refuses a checkout whose better-sqlite3 cannot open a database with exit 2, and writes nothing', async () => {
  const verifier = aMadeUpVerifierCheckout('cannot open')
  expect(whereBetterSqliteIsFoundFrom(verifier)).toBe(join(verifier, '../../../node_modules/better-sqlite3/index.js'))
  const r = await theDryForm(verifier, ['--within', '3000', '--dry', '4000', ...CHECKS])
  expect(r.code, r.stderr).toBe(2)
  expect(r.stdout).toBe('')
  expect(r.stderr).toContain('could not open a database in memory')
  expect(r.stderr).toContain(THE_STAND_IN_SAYS)
  expect(r.wrote).toEqual([])
})
