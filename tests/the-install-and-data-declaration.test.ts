// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALL-AND-DATA DECLARATION: FROM A CHECKOUT NOTHING MOVED, AND IT IS THE ONLY PLACE THAT
 * NAMES THE DATA FOLDER. Packaging step 1 (plan l1RSxzw-j4P7, row 12; wave 13t round 12).
 *
 * src/config/settings.mjs says, in THE INSTALL AND ITS DATA, how the office tells a checkout from a
 * bundle and where each keeps its data. This file reads the declaration as the test process sees it,
 * which is a checkout, and the source of every program the office runs.
 *
 *   1. From a checkout everything is where it was: the install's root and the data root are the
 *      checkout, the database is its data/mole-office.db, the keys and the service lock are beside it,
 *      .env is found the way findEnvFile finds it, the custom portraits are under its data/, and the
 *      server and the worker start through tsx from their source.
 *   2. The per-user data folder is the one each system keeps an application's data in, the folder
 *      Electron calls appData, with mole-office in it.
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-install-and-data-declaration.test.ts
 * MUTATIONS:
 *   - src/config/settings.mjs gives a checkout the per-user data folder as its data root: case 1 red;
 *   - src/config/settings.mjs keeps a macOS user's data under ~/.config: case 2 red;
 *   - (round 13) src/config/settings.mjs gives a checkout the built page as its public folder: case 1 red;
 *   - (wave 13w round 24) src/config/settings.mjs names an attention-thread entry that is not in the
 *     checkout: case 1 red.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import {
  DATA_ROOT,
  ENV_FILE,
  REPO_ROOT,
  THE_BUNDLES,
  THE_THREAD_BUNDLES,
  THE_INSTALL,
  THE_MIGRATIONS_FOLDER,
  THE_PUBLIC_FOLDER,
  THE_SERVER_ENTRY,
  THE_WORKER_ENTRY,
  databasePathFrom,
  findEnvFile,
  howToStart,
  theInstallsNode,
  keysPathFrom,
  serviceLockPathFrom,
  thePerUserDataFolder,
  whereThePublicFileIs,
} from '../src/config/settings.mjs'
import { freshDb, type TestDb } from './helpers.ts'

/** This checkout's root, found the way a checkout always found it. */
const CHECKOUT = fileURLToPath(new URL('../', import.meta.url))

// The portraits module opens a database when it is imported, so the test gives it one of its own first.
const t: TestDb = await freshDb()
const { portraitDirectory } = await import('../src/server/lib/portraits.ts')
afterAll(() => t.close())

/** A home this file makes, for the case that reads a home folder. */
const A_HOME = mkdtempSync(join(tmpdir(), 'mole-office-a-home-'))
afterAll(() => rmSync(A_HOME, { recursive: true, force: true }))

describe('the install-and-data declaration', () => {
  it('leaves everything where it was when the office runs from a checkout', () => {
    expect(THE_INSTALL.from).toBe('checkout')
    expect(THE_INSTALL.build).toBeNull()
    expect(REPO_ROOT).toBe(CHECKOUT)
    expect(DATA_ROOT).toBe(CHECKOUT)
    const env = { MOLE_OFFICE_DB: undefined }
    expect(databasePathFrom(env)).toBe(join(CHECKOUT, 'data', 'mole-office.db'))
    expect(databasePathFrom({ MOLE_OFFICE_DB: './data/elsewhere.db' })).toBe(join(CHECKOUT, 'data', 'elsewhere.db'))
    expect(keysPathFrom(env)).toBe(join(CHECKOUT, 'data', 'keys.json'))
    expect(serviceLockPathFrom(env)).toBe(join(CHECKOUT, 'data', 'mole-office.db.service.json'))
    expect(ENV_FILE).toBe(findEnvFile(CHECKOUT).path)
    expect(THE_MIGRATIONS_FOLDER).toBe(join(CHECKOUT, 'drizzle'))
    // ROUND 13: a checkout reads public/ where it is; only a bundle reads it from the built page.
    expect(THE_PUBLIC_FOLDER).toBe(join(CHECKOUT, 'public'))
    expect(whereThePublicFileIs('public/avatars')).toBe(join(CHECKOUT, 'public', 'avatars'))
    // And it runs on the Node that runs it, as it always has, with nothing added to the environment of what it starts.
    expect(theInstallsNode()).toEqual({ program: process.execPath, environment: {} })
    expect(portraitDirectory('custom', 'someone')).toBe(join(CHECKOUT, 'data', 'portraits', 'custom', 'someone'))
    expect(howToStart('server')).toEqual({ command: process.execPath, args: ['--import', 'tsx', THE_SERVER_ENTRY], environment: {} })
    expect(howToStart('worker')).toEqual({ command: join(CHECKOUT, 'node_modules', '.bin', 'tsx'), args: [THE_WORKER_ENTRY], environment: {} })
    expect(howToStart('command').args).toEqual([join(CHECKOUT, 'src', 'config', 'the-service-command.mjs')])
    // Every bundle is made from an entry that is in this checkout.
    for (const entry of [...Object.keys(THE_BUNDLES), ...Object.keys(THE_THREAD_BUNDLES)]) expect(statSync(join(CHECKOUT, entry)).isFile(), entry).toBe(true)
  })

  it('names the folder each system keeps an application’s data in, with mole-office in it', () => {
    expect(thePerUserDataFolder({ HOME: A_HOME }, 'linux')).toBe(join(A_HOME, '.config', 'mole-office'))
    expect(thePerUserDataFolder({ HOME: A_HOME, XDG_CONFIG_HOME: '/srv/sam-config' }, 'linux')).toBe('/srv/sam-config/mole-office')
    expect(thePerUserDataFolder({ HOME: A_HOME }, 'darwin')).toBe(join(A_HOME, 'Library', 'Application Support', 'mole-office'))
    expect(thePerUserDataFolder({ APPDATA: 'C:\\Users\\sam\\AppData\\Roaming' }, 'win32')).toContain('mole-office')
    // Nobody can say where the folder is: it is refused, not guessed.
    expect(() => thePerUserDataFolder({}, 'linux')).toThrow('HOME is not set')
    expect(() => thePerUserDataFolder({}, 'win32')).toThrow('APPDATA is not set')
  })
})
