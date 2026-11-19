// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH LAYER SET A SETTING, ANSWERED TRUTHFULLY AFTER `.env` HAS BEEN LOADED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/runtime` reports where each setting came from, and it said `the environment` for values
 * that were lines in `.env`. The GROUND verifier measured it on the owner's live server: it
 * reported `sources.MOLE_OFFICE_PORT: "the environment"` while nobody had exported it. The same
 * happened on a scratch stack for the port, the browser app's port and the database. Problem
 * `Txe1lTx0hVc9`.
 *
 * The cause is that `src/server/db/client.ts` loads `.env` into `process.env` when it is imported,
 * which is before anything asks. `settings()` then compared `process.env` with the file and found
 * the name in both, so the distinction it keeps on purpose had already been lost.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS TOLD APART NOW
 * ---------------------------------------------------------------------------------------
 *
 * `loadEnvFileIntoProcess` writes down which names it added, at the one moment that is visible:
 * `process.loadEnvFile` does not overwrite a name the shell already set, so the names in the file
 * that were not in `process.env` a moment earlier are exactly the ones the file supplied. That is a
 * reading and not a comparison of values — a shell that happens to set the same value as the file
 * is still the shell, and this says so.
 *
 * ---------------------------------------------------------------------------------------
 * WHY MOST OF THIS RUNS IN A CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The fault only appears once `.env` is really in `process.env`, and the test runner's own
 * `process.env` must not have a test's `.env` loaded into it. So each case is a small `node`
 * program run against a `.env` of its own, which is also the shape the server is in.
 *
 * THERE ARE THREE PLACES A VALUE CAN COME FROM, NOT FOUR. `.env.example` is a template: nothing
 * reads it for a value, checked by grep over the tree on 4 September 2026, and the last test here
 * fails if that changes.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  forgetWhatTheEnvFileSupplied,
  loadEnvFileIntoProcess,
  settings,
  theEnvFileSuppliedThis,
} from '../src/config/settings.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DECLARATION = join(ROOT, 'src/config/settings.mjs')

const made: string[] = []

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
  forgetWhatTheEnvFileSupplied()
})

/** A directory with a `.env` of its own in it. */
function withEnvFile(lines: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-settings-'))
  made.push(dir)
  writeFileSync(join(dir, '.env'), lines)
  return join(dir, '.env')
}

/**
 * Load that `.env` into a fresh Node, then ask the declaration where each value came from.
 *
 * The child is plain `node` with no test runner, so `process.env` is what the shell gave it plus
 * whatever the load put there — exactly the server's situation.
 */
function sourcesAfterLoading(envFile: string, shell: Record<string, string> = {}): Record<string, string> {
  const program = `
    const s = await import(${JSON.stringify(DECLARATION)})
    s.loadEnvFileIntoProcess(${JSON.stringify(envFile)})
    const read = s.settings(process.env, ${JSON.stringify(envFile)})
    console.log(JSON.stringify({ sources: read.sources, apiPort: read.apiPort, databasePath: read.databasePath }))
  `
  const out = execFileSync('node', ['--input-type=module', '-e', program], {
    encoding: 'utf8',
    env: { ...process.env, ...shell },
  })
  return JSON.parse(out.trim()) as Record<string, string>
}

describe('a value that came from .env is reported as having come from .env', () => {
  it('says .env, not the environment, once the file has been loaded into process.env', () => {
    const envFile = withEnvFile('MOLE_OFFICE_PORT=29831\nMOLE_OFFICE_WEB_PORT=29832\n')
    const read = sourcesAfterLoading(envFile) as unknown as {
      sources: Record<string, string>
      apiPort: number
    }
    expect(read.sources['MOLE_OFFICE_PORT']).toBe('.env')
    expect(read.sources['MOLE_OFFICE_WEB_PORT']).toBe('.env')
    // And it is really the file's value, so this is not a label on a value from somewhere else.
    expect(read.apiPort).toBe(29831)
  })

  it('still says the environment when a shell set it, even though .env names it too', () => {
    const envFile = withEnvFile('MOLE_OFFICE_PORT=29831\n')
    const read = sourcesAfterLoading(envFile, { MOLE_OFFICE_PORT: '29833' }) as unknown as {
      sources: Record<string, string>
      apiPort: number
    }
    expect(read.sources['MOLE_OFFICE_PORT']).toBe('the environment')
    expect(read.apiPort).toBe(29833)
  })

  it('calls a shell value the environment even when it matches the file exactly', () => {
    // Two layers can hold the same characters. Which one set it is a different question from what
    // it is, and comparing values would answer the wrong one.
    const envFile = withEnvFile('MOLE_OFFICE_PORT=29831\n')
    const read = sourcesAfterLoading(envFile, { MOLE_OFFICE_PORT: '29831' }) as unknown as {
      sources: Record<string, string>
    }
    expect(read.sources['MOLE_OFFICE_PORT']).toBe('the environment')
  })

  it('says the built-in default for a setting neither layer names', () => {
    const envFile = withEnvFile('MOLE_OFFICE_PORT=29831\n')
    const read = sourcesAfterLoading(envFile) as unknown as { sources: Record<string, string> }
    expect(read.sources['MOLE_OFFICE_WORKSPACE']).toBe('the built-in default')
  })
})

describe('what the load put there is written down while it can still be seen', () => {
  it('records the names it added and not the ones the shell already held', () => {
    const envFile = withEnvFile('MOLE_OFFICE_CHORE_MODEL=opus\n')
    expect(theEnvFileSuppliedThis('MOLE_OFFICE_CHORE_MODEL', envFile)).toBe(false)
    loadEnvFileIntoProcess(envFile)
    try {
      expect(theEnvFileSuppliedThis('MOLE_OFFICE_CHORE_MODEL', envFile)).toBe(true)
      // The name is now in process.env and the record is what tells the two layers apart.
      expect(process.env['MOLE_OFFICE_CHORE_MODEL']).toBe('opus')
    } finally {
      delete process.env['MOLE_OFFICE_CHORE_MODEL']
    }
  })

  it('keeps one file apart from another, so one test cannot answer for another file', () => {
    const mine = withEnvFile('MOLE_OFFICE_CHORE_MODEL=opus\n')
    loadEnvFileIntoProcess(mine)
    try {
      expect(theEnvFileSuppliedThis('MOLE_OFFICE_CHORE_MODEL', mine)).toBe(true)
      expect(theEnvFileSuppliedThis('MOLE_OFFICE_CHORE_MODEL', join(ROOT, '.env'))).toBe(false)
    } finally {
      delete process.env['MOLE_OFFICE_CHORE_MODEL']
    }
  })

  it('reads an environment built by a caller without answering out of this process', () => {
    // A test that hands in its own environment is describing a world of its own. Answering it from
    // what happened to this process would be the declaration telling it about a file it never read.
    const envFile = withEnvFile('MOLE_OFFICE_PORT=29831\n')
    loadEnvFileIntoProcess(envFile)
    try {
      expect(settings({ MOLE_OFFICE_PORT: '29999' }, envFile).sources['MOLE_OFFICE_PORT']).toBe('the environment')
      expect(settings({}, envFile).sources['MOLE_OFFICE_PORT']).toBe('.env')
    } finally {
      delete process.env['MOLE_OFFICE_PORT']
    }
  })
})

