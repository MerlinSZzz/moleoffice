// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIRED DEVELOPMENT CHECKOUT READS THE SETTINGS THE OFFICE STORES, read-only, and a reader that could not read one
 * refuses by the setting's name instead of taking 0, an empty string or a default.
 *
 * Once the handoff wrote MOLE_OFFICE_STABLE_CHECKOUT into the development .env, every runtime setting read from the
 * development checkout came back null with the source "not read". tools/register-a-run.mjs took Number(null), which is
 * 0, and waited 0 seconds for the office. tools/sandbox.mjs passed no commit address, so a run's commits carried the
 * placeholder. The fixture here is that pairing: a development checkout whose .env names a stable checkout and the
 * database, and a real database with the runtime_settings table the office keeps its choices in. Every other opener
 * still refuses that database (tests/the-stable-office-database-guard.test.ts).
 *
 * MUTATIONS, each run after the control and then restored:
 *   - storedRuntimeValue asks the guard again (no stored value is read, and each register tool refuses where it should wait);
 *   - settingValue gives null for a not-read reading (register-a-run waits 0 seconds on a file it could not read);
 *   - storedRuntimeValue lets SQLite's error through (no not-read reading, and no setting named);
 *   - mergedEnvironment writes undefined for an unread name (a direct reader takes it for unset).
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
const REGISTER_TOOLS = ['tools/register-a-run.mjs', 'tools/register-a-started-agent.mjs']
let root: string
let dev: string
let stable: string
let database: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'development-reads-stored-settings-'))
  dev = join(root, 'development'); stable = join(root, 'stable'); database = join(root, 'office.sqlite')
  mkdirSync(dev); mkdirSync(join(root, 'home'))
  for (const name of ['src', 'tools', 'for-agents', 'package.json', 'tsconfig.json']) {
    cpSync(join(SOURCE, name), join(dev, name), { recursive: true })
  }
  symlinkSync(join(SOURCE, 'node_modules'), join(dev, 'node_modules'))
  for (const checkout of [dev, stable]) expect(spawnSync('git', ['init', '--quiet', checkout]).status).toBe(0)
  writeFileSync(join(dev, '.env'), [
    'MOLE_OFFICE_PORT=41326', `MOLE_OFFICE_DB=${database}`, `MOLE_OFFICE_STABLE_CHECKOUT=${stable}`,
    'MOLE_OFFICE_COMMIT_EMAIL=from-the-env-file@fixture.example', '',
  ].join('\n'))
  const db = new Database(database)
  db.exec('CREATE TABLE runtime_settings (name TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)')
  db.close()
}, 60_000)
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** What the office stores, and nothing else. */
function theOfficeStores(choices: Record<string, string>) {
  const db = new Database(database)
  db.exec('DELETE FROM runtime_settings')
  const put = db.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)')
  for (const [name, value] of Object.entries(choices)) put.run(name, value)
  db.close()
}

/** Node in the development checkout, with no MOLE_ setting in its environment. */
function inDevelopment(args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, HOME: join(root, 'home') }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  return spawnSync(process.execPath, args, { cwd: dev, env, encoding: 'utf8', timeout: 60_000 })
}

/** A few lines against the development checkout's settings module, as `s`. An error is printed and exits 1. */
function withTheSettings(code: string) {
  return inDevelopment(['--input-type=module', '-e', `try { const s=await import('./src/config/settings.mjs'); ${code} } catch (error) { console.error(error.message); process.exitCode=1 }`])
}

describe('the paired development checkout reads what the office stores', () => {
  it('is paired: the guard refuses this database to every other opener', () => {
    const read = withTheSettings(`console.log(s.whyThisCheckoutMayNotOpenTheDatabase(${JSON.stringify(database)}))`)
    expect(read.status, read.stderr).toBe(0)
    expect(read.stdout).toContain(`MOLE_OFFICE_STABLE_CHECKOUT names ${stable}`)
  })

  for (const tool of REGISTER_TOOLS) {
    it(`${tool} waits the default 60 seconds when the office stores no timeout`, () => {
      theOfficeStores({})
      const said = inDevelopment([tool, '--help'])
      expect(said.status, said.stdout + said.stderr).toBe(2)
      expect(said.stderr).toContain('Waits 60 seconds for Mole Office to answer')
    })

    it(`${tool} waits the number of seconds the office stores`, () => {
      theOfficeStores({ MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS: '45' })
      const said = inDevelopment([tool, '--help'])
      expect(said.status, said.stdout + said.stderr).toBe(2)
      expect(said.stderr).toContain('Waits 45 seconds for Mole Office to answer')
    })
  }

  it('reads the commit address the office stores, and says it came from the office database', () => {
    theOfficeStores({ MOLE_OFFICE_COMMIT_EMAIL: 'from-the-office@fixture.example' })
    const read = withTheSettings("const r=s.readSettingHere('MOLE_OFFICE_COMMIT_EMAIL'); console.log(JSON.stringify({value:r.value,source:r.source,plain:s.settingValue('MOLE_OFFICE_COMMIT_EMAIL')}))")
    expect(read.status, read.stderr).toBe(0)
    expect(JSON.parse(read.stdout)).toEqual({ value: 'from-the-office@fixture.example', source: 'the office database', plain: 'from-the-office@fixture.example' })
  })

  it('reads the commit address from .env when the office stores none', () => {
    theOfficeStores({})
    const read = withTheSettings("const r=s.readSettingHere('MOLE_OFFICE_COMMIT_EMAIL'); console.log(JSON.stringify({value:r.value,source:r.source}))")
    expect(read.status, read.stderr).toBe(0)
    expect(JSON.parse(read.stdout)).toEqual({ value: 'from-the-env-file@fixture.example', source: '.env' })
  })

  it('gives a model reader the model the office stores', () => {
    theOfficeStores({ MOLE_OFFICE_AGENT_MODEL: 'claude-opus-5-5' })
    const read = inDevelopment(['--input-type=module', '-e', "const m=await import('./src/config/agent-model.mjs'); console.log(JSON.stringify(m.theModelASettingNamed()))"])
    expect(read.status, read.stderr).toBe(0)
    expect(JSON.parse(read.stdout)).toBe('claude-opus-5-5')
  })
})

describe('a reader that gets "not read" refuses, and says which setting and why', () => {
  beforeAll(() => {
    renameSync(database, `${database}.aside`)
    writeFileSync(database, 'These bytes are not a SQLite database.\n'.repeat(200))
  })
  afterAll(() => {
    rmSync(database)
    renameSync(`${database}.aside`, database)
  })

  it('reads "not read", with SQLite\'s words, from a database file it could not read', () => {
    const read = withTheSettings("console.log(JSON.stringify(s.readSettingHere('MOLE_OFFICE_COMMIT_EMAIL')))")
    expect(read.status, read.stderr).toBe(0)
    const reading = JSON.parse(read.stdout)
    expect(reading).toMatchObject({ value: null, source: 'not read' })
    expect(reading.why).toContain(database)
    expect(reading.why).toContain('file is not a database')
  })

  for (const [reader, code, name] of [
    ['settingValue', "console.log(s.settingValue('MOLE_OFFICE_COMMIT_EMAIL'))", 'MOLE_OFFICE_COMMIT_EMAIL'],
    ['settingWasSet', "console.log(s.settingWasSet('MOLE_OFFICE_COMMIT_EMAIL'))", 'MOLE_OFFICE_COMMIT_EMAIL'],
    ['mergedEnvironment', "console.log(JSON.stringify(s.mergedEnvironment()['MOLE_OFFICE_AGENT_MODEL']))", 'MOLE_OFFICE_AGENT_MODEL'],
  ] as const) {
    it(`${reader} refuses, and names ${name}`, () => {
      const read = withTheSettings(code)
      expect(read.status, read.stdout + read.stderr).toBe(1)
      expect(read.stdout).toBe('')
      expect(read.stderr).toContain(`${name} was not read`)
      expect(read.stderr).toContain('file is not a database')
    })
  }

  for (const tool of REGISTER_TOOLS) {
    it(`${tool} refuses before it waits, and names MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS`, () => {
      const said = inDevelopment([tool, '--help'])
      expect(said.status, said.stdout + said.stderr).toBe(2)
      expect(said.stderr).toContain('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS was not read')
      expect(said.stderr).toContain('file is not a database')
      expect(said.stderr).not.toContain('Waits')
    })
  }
})
