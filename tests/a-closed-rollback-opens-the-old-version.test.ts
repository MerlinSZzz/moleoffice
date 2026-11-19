// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED ROLLBACK OPENS THE OLD VERSION (tools/stable/upgrade-stable.criteria.md, "A closed rollback opens the old
 * version (item 24)").
 *
 * (a) On the made-up office in WAL mode, a closed upgrade that rolls back opens the old version: once after its target
 * verifier exits 1, and once when the rollback begins before the snapshot and takes it first. The first also sees that
 * both verifiers ran without the development pairing. (c) Before anything
 * closes, a dry run refuses each of the four faults, and a real run refuses one of them the same way; the dry plan
 * quotes the verifier's dry form, or says that it was not run.
 *
 * The repositories, the database, the services and the verifier stand-in are the made-up ones of
 * tests/stable-upgrade-fixture.ts and tests/a-closed-stable-upgrade.ts. The verifier the faults are tried on is
 * tools/stable/verify-the-target.mjs, or a copy of it in a made-up checkout. Nothing of anybody's is read.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { theUpgradeMarkPath } from '../src/config/the-upgrade-mark.mjs'
import { baselineIsBack, remember, stableUpgradeFixture, track } from './stable-upgrade-fixture.ts'
import { LIMITS, closed, rows, type Fixture } from './a-closed-stable-upgrade.ts'
import { THE_VERIFIER, aMadeUpVerifierCheckout, whereBetterSqliteIsFoundFrom } from './a-made-up-verifier-checkout.ts'

const CHECKS = ['health', 'records', 'reads', 'migrations', 'settings']
const NODE = realpathSync(process.execPath)
const aWalOffice = () => stableUpgradeFixture(false, false, false, false, false, true)

/** Bytes 18 and 19 of a SQLite header: 2 and 2 in WAL mode, 1 and 1 in DELETE mode. */
function theJournalModeBytes(path: string) {
  const header = Buffer.alloc(2), fd = openSync(path, 'r')
  try { readSync(fd, header, 0, 2, 18) } finally { closeSync(fd) }
  return [...header]
}

/** The made-up configuration with a closed verification of these command words, checks and timeoutMs. */
function verifiedBy(f: Fixture, words: string[], checks: string[] = CHECKS, timeoutMs = 4000) {
  return { ...f.config, closedVerification: { command: [NODE, ...words], timeoutMs, checks, ...LIMITS } }
}

/** Nothing closed: no lock, no mark, no recovery files, no notice filed, and the old version serves. */
async function nothingClosed(f: Fixture) {
  expect(existsSync(join(f.stable, '.git/stable-upgrade.lock'))).toBe(false)
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  expect(readdirSync(f.config.recoveryRoot)).toEqual([])
  expect(f.requests.filter((r) => r.method !== 'GET')).toEqual([])
  expect((await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()).world.head).toBe(f.baseline.slice(0, 7))
}

/** The old version takes a write. The made-up office's row has a fixed key, so it takes one, and a test asks once. */
async function itTakesAWrite(f: Fixture) {
  expect((await fetch(`http://127.0.0.1:${f.config.servicePort}/api/fixture-write`, { method: 'POST' })).status).toBe(200)
}

it('opens the old version in WAL mode after a closed rollback whose target verifier exits 1', async () => {
  const f = await aWalOffice()
  expect(theJournalModeBytes(f.database)).toEqual([2, 2])
  let snapshot: { bytes: number[]; sha256: string } | null = null
  // Each verifier writes down the development pairing it was given, or "none".
  const pairing = join(f.folder, 'verifier-pairing')
  const writesItsPairing = `appendFileSync(${JSON.stringify(pairing)},(process.env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT??'none')+'\\n');`
  const result = remember(await upgradeStable(closed(f, `${writesItsPairing}process.exit(1);`, writesItsPairing), { ...f.options, onStep(e: any) {
    track(e)
    if (e.step === 'stable-fetch' && e.phase === 'before') snapshot = { bytes: theJournalModeBytes(e.paths.privateDatabase), sha256: createHash('sha256').update(readFileSync(e.paths.privateDatabase)).digest('hex') }
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(snapshot, 'the snapshot was looked at right after private-backup').not.toBeNull()
  expect(snapshot!.bytes).toEqual([1, 1])
  expect(rows(result.paths.journal).find((e) => e.step === 'database-snapshot' && e.phase === 'ready')?.sha256).toBe(snapshot!.sha256)
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('target\nrecovery\n')
  expect(readFileSync(pairing, 'utf8')).toBe('none\nnone\n')
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  await baselineIsBack(f)
  expect(theJournalModeBytes(f.database)).toEqual([2, 2])
}, 120_000)

it('opens the old version in WAL mode after a closed rollback that takes its snapshot first', async () => {
  const f = await aWalOffice()
  const result = remember(await upgradeStable(closed(f), { ...f.options, onStep(e: any) {
    track(e)
    // The last point before the snapshot: every old group is stopped and the database guarded, and private-backup has
    // not begun. The sanitized backup that came first is no longer taken, so its before is gone.
    if (e.step === 'private-backup' && e.phase === 'before') throw Error('Synthetic failure before the snapshot')
  } }))
  expect(result.state, JSON.stringify(result)).toBe('restored')
  const journal = rows(result.paths.journal)
  const at = (step: string, phase: string) => journal.findIndex((e) => e.step === step && e.phase === phase)
  expect(at('recover-snapshot', 'attempt')).toBeGreaterThan(0)
  expect(at('database-snapshot', 'ready')).toBeGreaterThan(at('recover-snapshot', 'attempt'))
  expect(readFileSync(join(f.folder, 'verified-phases'), 'utf8')).toBe('recovery\n')
  expect(existsSync(theUpgradeMarkPath(f.database))).toBe(false)
  await baselineIsBack(f)
  expect(theJournalModeBytes(f.database)).toEqual([2, 2])
}, 120_000)

it('refuses each of the four faults in a dry run, before anything closes', async () => {
  const f = await aWalOffice()
  const cannotLoad = aMadeUpVerifierCheckout('none')
  expect(whereBetterSqliteIsFoundFrom(cannotLoad)).toBeNull()
  const faults: Array<[string, object, RegExp]> = [
    ['a check the verifier does not know', verifiedBy(f, [THE_VERIFIER, '--within', '3000'], ['health', 'no-such-check']), /dry form exited 2[\s\S]*"no-such-check"/],
    ['a --within not below timeoutMs', verifiedBy(f, [THE_VERIFIER, '--within', '4000']), /dry form exited 2[\s\S]*--within 4000 ms is not below/],
    ['a verifier whose checkout cannot load better-sqlite3', verifiedBy(f, [cannotLoad, '--within', '3000']), /dry form exited 2[\s\S]*better-sqlite3 could not be loaded/],
    ['a verifier named by an absolute path inside the stable checkout', verifiedBy(f, [join(f.stable, 'tools/serve-dev.mjs'), '--within', '3000']), /names a path inside the stable checkout/],
    ['a verifier named by a relative path that exists in the stable checkout', verifiedBy(f, ['tools/serve-dev.mjs', '--within', '3000']), /names a path inside the stable checkout/],
  ]
  for (const [name, config, refusal] of faults) {
    await expect(upgradeStable(config, { ...f.options, dry: true }), name).rejects.toThrow(refusal)
    await nothingClosed(f)
  }
  await itTakesAWrite(f)
}, 120_000)

it('refuses a check the verifier does not know in a real run the same way, before anything closes', async () => {
  const f = await aWalOffice()
  await expect(upgradeStable(verifiedBy(f, [THE_VERIFIER, '--within', '3000'], ['health', 'no-such-check']), f.options)).rejects.toThrow(/dry form exited 2[\s\S]*"no-such-check"/)
  await nothingClosed(f)
  await itTakesAWrite(f)
}, 120_000)

it("quotes the verifier's dry form in the dry plan, or says that it was not run", async () => {
  const f = await aWalOffice()
  const line = await new Promise<string>((ok, no) => execFile(NODE, [THE_VERIFIER, '--within', '3000', '--dry', '4000', ...CHECKS], { cwd: f.folder, timeout: 20_000 }, (error, stdout) => error ? no(error) : ok(stdout.trim())))
  expect(line).not.toBe('')
  const quoted = await upgradeStable(verifiedBy(f, [THE_VERIFIER, '--within', '3000']), { ...f.options, dry: true })
  expect(quoted.state, JSON.stringify(quoted)).toBe('dry')
  expect(quoted.plan).toContain(`Before anything closes, the verifier's dry form said: ${line}`)
  const notRun = await upgradeStable(closed(f), { ...f.options, dry: true })
  expect(notRun.state, JSON.stringify(notRun)).toBe('dry')
  expect(notRun.plan.join('\n')).toContain('does not name tools/stable/verify-the-target.mjs, so it is not run before anything closes, and its checks, its limit and its loading of better-sqlite3 were not checked.')
  expect(existsSync(join(f.folder, 'verified-phases'))).toBe(false)
  await nothingClosed(f)
  await itTakesAWrite(f)
}, 120_000)
