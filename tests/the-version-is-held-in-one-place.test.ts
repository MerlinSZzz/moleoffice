// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VERSION IS HELD IN ONE PLACE (decision sKPFWjOuQVEe; wave 13t, round 15).
 *
 * `version` in package.json is the one place. Everything else that names the version reads it there,
 * or, in a bundle, which has no package.json, from the stamp scripts/bundle.mjs copied it into.
 *
 *   2. theVersion(), which the server's start line and the window's About line show, is package.json's
 *      in a checkout. A bundle's stamp carries a version, and readTheBuildStamp reads it back; a stamp
 *      that recorded none reads as null, never as a guess.
 *   4. Importing src/config/settings.mjs reads no package.json; only asking for the version does. The
 *      session hook, the waiter's one-file bundle and several tests' own small checkouts import it from
 *      folders with no package.json, and round 15's read at import broke all of them (merge entry
 *      6hg4ung2B0VL; round 15c).
 *
 * The bundle's stamp and start line are proved on a real bundle in tests/the-office-runs-from-a-bundle.test.ts,
 * the window's About line in tests/the-window-finds-its-office.test.ts, and the installers' names and
 * the .deb's version, where Debian writes the beta's hyphen as a tilde, by scripts/the-packed-app.mjs
 * when the installers are made.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-version-is-held-in-one-place.test.ts
 * MUTATIONS:
 *   - readTheVersion in src/config/settings.mjs returns a fixed '0.0.1': red, case 2;
 *   - readTheBuildStamp drops the version: red, case 2;
 *   - the Chinese About line leaves out the version: red, case 3;
 *   - (round 15c) settings.mjs reads the version when it is imported: red, case 4, ENOENT on package.json.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { writeTheBuildStamp } from '../src/config/build-stamp.mjs'
import { readTheBuildStamp, theVersion } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { SETTINGS_MODULE, whatACopyOfSettingsCarries } from './what-a-copy-of-settings-carries.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const own = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }
const folders: string[] = []

afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('the version', () => {
  it("is package.json's in a checkout, and a bundle's stamp carries it, or reads as none", () => {
    expect(theVersion()).toBe(own.version)
    const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}version-`)
    folders.push(dir)
    writeTheBuildStamp(join(dir, 'with'), { version: own.version })
    writeTheBuildStamp(join(dir, 'without'))
    const withOne = readTheBuildStamp(join(dir, 'with'))
    const withoutOne = readTheBuildStamp(join(dir, 'without'))
    expect(withOne.state === 'read' ? withOne.version : withOne).toBe(own.version)
    expect(withoutOne.state === 'read' ? withoutOne.version : withoutOne).toBeNull()
  })


  it('is read when it is asked for, so settings.mjs imports in a folder with no package.json', () => {
    const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}version-no-package-`)
    folders.push(dir)
    // settings.mjs with what it imports, read from its imports so a module it starts to import is copied too.
    for (const file of whatACopyOfSettingsCarries(REPO)) {
      mkdirSync(join(dir, file, '..'), { recursive: true })
      copyFileSync(join(REPO, file), join(dir, file))
    }
    const module = join(dir, SETTINGS_MODULE)
    const run = (code: string): string => execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(run(`await import(${JSON.stringify(module)}); process.stdout.write('imported')`)).toBe('imported')
    expect(() => run(`const m = await import(${JSON.stringify(module)}); m.theVersion()`)).toThrow('package.json')
  })
})
