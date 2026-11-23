// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STABLE UPGRADE FETCHES ELECTRON'S BINARY (tools/stable/upgrade-stable.criteria.md, item 3). npm ci installs the
 * electron package but does not run its install.js, which is what fetches the binary. So after npm ci the upgrade runs
 * that install.js in the candidate, and reads that the file path.txt names is in node_modules/electron/dist. When
 * path.txt or that file is missing, the upgrade stops before the old office stops.
 *
 * The electron package here is made up (aMadeUpElectronPackage in tests/stable-upgrade-fixture.ts): its install.js
 * downloads nothing and writes made-up bytes in place of the binary, so no case depends on the network or on the real
 * Electron. A target commit can ask it to leave out path.txt or the binary. The repositories, the database and the
 * office are made up too.
 *
 * The cases are:
 *   1. a good upgrade: the stable checkout's path.txt names a file in dist that holds the made-up bytes, and the
 *      journal has the step after install and before the type check, with the file it checked;
 *   2. install.js writes no path.txt: the upgrade fails naming path.txt, and the old version serves;
 *   3. install.js writes path.txt but no binary: the upgrade fails naming the file path.txt names, and the old version
 *      serves.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { THE_MADE_UP_ELECTRON_BINARY, THE_MADE_UP_ELECTRON_BYTES, baselineIsBack, remember, stableUpgradeFixture } from './stable-upgrade-fixture.ts'
import { rows } from './a-closed-stable-upgrade.ts'

/** The electron package's folder in a checkout, as the upgrade reads it. */
const THE_PACKAGE = 'node_modules/electron'

/** The upgrade stopped before the old office stopped, with the old version serving and stable at the old commit. */
async function stoppedBeforeTheOldOfficeStops(f: Awaited<ReturnType<typeof stableUpgradeFixture>>, result: { state: string; paths: { journal: string } }) {
  expect(result.state, JSON.stringify(result)).toBe('unchanged')
  const journal = rows(result.paths.journal)
  expect(journal.some((e) => e.step === 'electron-binary' && e.phase === 'done'), 'install.js ran').toBe(true)
  expect(journal.some((e) => e.step === 'electron-binary' && e.phase === 'checked'), 'no binary was checked').toBe(false)
  await baselineIsBack(f)
}

// Each case builds one made-up office and runs one release, as the cases of
// tests/the-stable-release-checks-its-room-before-the-lock.test.ts do, and has their limits. These cases were not
// timed. The first publishes and has the longer limit; the others stop before downtime.
it('fetches the binary after npm ci and before the type check, and the stable checkout has it', async () => {
  const f = await stableUpgradeFixture()
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.state, JSON.stringify(result)).toBe('published')
  const named = readFileSync(join(f.stable, THE_PACKAGE, 'path.txt'), 'utf8')
  expect(named).toBe(THE_MADE_UP_ELECTRON_BINARY)
  expect(readFileSync(join(f.stable, THE_PACKAGE, 'dist', named), 'utf8')).toBe(THE_MADE_UP_ELECTRON_BYTES)
  const journal = rows(result.paths.journal)
  const at = (step: string, phase: string) => journal.findIndex((e) => e.step === step && e.phase === phase)
  expect(at('install', 'done')).toBeGreaterThanOrEqual(0)
  expect(at('electron-binary', 'attempt')).toBeGreaterThan(at('install', 'done'))
  expect(at('electron-binary', 'checked')).toBeGreaterThan(at('electron-binary', 'done'))
  expect(at('candidate-typecheck', 'attempt')).toBeGreaterThan(at('electron-binary', 'checked'))
  expect(journal[at('electron-binary', 'checked')]).toMatchObject({ binary: join(THE_PACKAGE, 'dist', THE_MADE_UP_ELECTRON_BINARY), bytes: Buffer.byteLength(THE_MADE_UP_ELECTRON_BYTES) })
}, 240_000)

it('stops before the old office stops when install.js writes no path.txt, and names path.txt', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 2, 'taken', 0, null, 'done', 'no path')
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.failure).toContain(join(result.paths.candidate, THE_PACKAGE, 'path.txt'))
  expect(result.failure).toContain('not fetched')
  await stoppedBeforeTheOldOfficeStops(f, result)
}, 120_000)

it('stops before the old office stops when the file path.txt names is not in dist, and names that file', async () => {
  const f = await stableUpgradeFixture(false, false, false, false, false, false, 2, 'taken', 0, null, 'done', 'no binary')
  const result = remember(await upgradeStable(f.config, f.options))
  expect(result.failure).toContain(join(result.paths.candidate, THE_PACKAGE, 'dist', THE_MADE_UP_ELECTRON_BINARY))
  await stoppedBeforeTheOldOfficeStops(f, result)
}, 120_000)
