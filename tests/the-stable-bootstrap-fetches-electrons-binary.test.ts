// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STABLE BOOTSTRAP FETCHES ELECTRON'S BINARY (tools/stable/bootstrap-stable.criteria.md, item 7). npm ci installs
 * the electron package but does not run its install.js, which is what fetches the binary. So after npm ci the bootstrap
 * runs that install.js in the stable checkout, and reads that the file path.txt names is in node_modules/electron/dist.
 * When path.txt is missing, the preparation stops and the original office serves on.
 *
 * These cases use the per-step fixture (tests/stable-bootstrap-step-fixture.ts), which runs no command. Its stand-in
 * for the step's group writes a made-up path.txt and made-up bytes in place of the binary, so nothing is downloaded.
 * The offices, the repositories and the database there are made up too.
 *
 * The cases are:
 *   1. a preparation that ends: the step runs the electron package's install.js in the stable checkout after npm ci and
 *      before the type check, the stable checkout has the binary path.txt names, and the journal records the binary
 *      and its bytes;
 *   2. install.js writes no path.txt: the preparation fails naming path.txt, and the original office serves on.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { THE_MADE_UP_ELECTRON_BINARY, THE_MADE_UP_ELECTRON_BYTES, fixture, theOriginalServesOn } from './stable-bootstrap-step-fixture.ts'

/** The electron package's folder in a checkout, as the bootstrap reads it. */
const THE_PACKAGE = 'node_modules/electron'

/** The rows of the bootstrap's journal, in the order they were written. */
const rowsOf = (journal: string): Array<Record<string, any>> => readFileSync(journal, 'utf8').trimEnd().split('\n').map(line => JSON.parse(line))

it('fetches the binary after npm ci and before the type check, and the stable checkout has it', async () => {
  const f = await fixture(), result = await f.prepare()
  expect(result.state, JSON.stringify(result)).toBe('PREPARED')
  const stable = f.valid.config.stableCheckout
  expect(f.groups.find(group => group.name === 'fetch-electron-binary')).toMatchObject({ command: process.execPath, args: [join(THE_PACKAGE, 'install.js')], gate: { cwd: stable } })
  const named = readFileSync(join(stable, THE_PACKAGE, 'path.txt'), 'utf8')
  expect(named).toBe(THE_MADE_UP_ELECTRON_BINARY)
  expect(readFileSync(join(stable, THE_PACKAGE, 'dist', named), 'utf8')).toBe(THE_MADE_UP_ELECTRON_BYTES)
  const journal = rowsOf(f.paths.journal)
  const at = (step: string, phase: string) => journal.findIndex(row => row.step === step && row.phase === phase)
  expect(at('install-locked-dependencies-exit', 'done')).toBeGreaterThanOrEqual(0)
  expect(at('fetch-electron-binary', 'attempt')).toBeGreaterThan(at('install-locked-dependencies-exit', 'done'))
  expect(at('fetch-electron-binary', 'verified')).toBeGreaterThan(at('fetch-electron-binary-exit', 'done'))
  expect(at('typecheck-candidate', 'attempt')).toBeGreaterThan(at('fetch-electron-binary', 'verified'))
  expect(journal[at('fetch-electron-binary', 'verified')]).toMatchObject({ binary: join(THE_PACKAGE, 'dist', THE_MADE_UP_ELECTRON_BINARY), bytes: Buffer.byteLength(THE_MADE_UP_ELECTRON_BYTES) })
}, 60000)

it('stops the preparation when install.js writes no path.txt, names path.txt, and the original office serves on', async () => {
  const f = await fixture()
  f.writeNoElectronPath()
  const failed = await f.prepare()
  expect(failed.state, JSON.stringify(failed)).toBe('unchanged')
  expect(failed.failure).toContain(join(f.valid.config.stableCheckout, THE_PACKAGE, 'path.txt'))
  expect(failed.failure).toContain('not fetched')
  theOriginalServesOn(f, failed, 'install.js wrote no path.txt')
  const journal = rowsOf(f.paths.journal)
  expect(journal.some(row => row.step === 'fetch-electron-binary-exit' && row.phase === 'done'), 'install.js ran').toBe(true)
  expect(journal.some(row => row.step === 'fetch-electron-binary' && row.phase === 'verified'), 'no binary was verified').toBe(false)
  expect(journal.some(row => row.step === 'typecheck-candidate'), 'the type check did not start').toBe(false)
}, 60000)
