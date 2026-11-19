// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE TOOL PRINTS THE OFFICE VARIABLES, MASKED, SO NO AGENT PRINTS THEM BY HAND.
 *
 * An agent once printed an office tool's settings through a mask of its own. The mask failed, and the run's key went
 * into the run's transcript. tools/office-variables.mjs is the one way to see them. It prints each MOLE_OFFICE_* and
 * SANDBOX_* name the process holds, MOLE_AGENT_KEY, and in a sandbox's command each secret the sandbox's template
 * declares, and it says where each came from: the environment, the sandbox's secret lines or the settings file.
 *
 * WHAT IT PRINTS FOR A VALUE:
 *   - A value whose name holds KEY, TOKEN, SECRET or PASSWORD, in any case, or that looks like a key to
 *     src/config/secret-shapes.mjs, prints only as "set, sha256 <the first 12 hex digits of its sha256>".
 *   - A number, a word, a path, a URL or a login prints through maskedAsAPrintedLine, as every printed line does: an
 *     address, a login and a home folder are masked, and a port prints whole.
 *   - An empty value prints "set, empty", whatever its name, so a key set to nothing does not read as a key that is set.
 *   - Any other value prints "set, not shown".
 *
 * Every case runs the tool in a made-up checkout: links to this worktree's code, a made-up settings file and a made-up
 * sandbox template, in a folder of its own, with a made-up environment. It never reads a real settings file or a real
 * secret.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { aTestDatabaseFolder } from './helpers.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const TOOL = 'tools/office-variables.mjs'

/** Made-up values. None is a real key, login or address. */
const RUN_KEY = 'c0ffee'.repeat(10) + 'beef'
const SANDBOX_RUN_KEY = '5eed'.repeat(16)
const API_KEY = 'sk-madeup' + 'Q2w9E4r7T1y6U3i8O5p0'
const KEY_SHAPED = 'Q7mZp2Lx9Rt4Vb8Nc3Kd6Wf1Hs5J'
const PLAIN_UNDER_A_PASSWORD_NAME = 'plainword'
const ADDRESS = '192.0.2.17'
const LOGIN = 'made-up-person@example.com'
const HOME_FOLDER = '/home/made-up-person'
const FACTS = JSON.stringify({ instance: 'made-up-sandbox', template: 'made-up-template', container: 'made-up-container' })
const TOOL_FILE_KEY = 'd00d'.repeat(16)

const sha = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12)

/**
 * The folders of code the tool runs from. Each is a link to this worktree's, and the tool runs with Node's
 * --preserve-symlinks, so its modules keep the made-up checkout's paths and the settings module takes that checkout
 * as the checkout it runs from: its settings file and its sandbox templates are the made-up ones.
 */
const CODE_FOLDERS = ['src', 'tools', 'for-agents', 'node_modules']

/** A made-up checkout: the links to the code, and a settings file and a sandbox template when asked. */
function aCheckout(made: { settings?: string, secrets?: string[] } = {}): string {
  const checkout = aTestDatabaseFolder('office-variables')
  for (const folder of CODE_FOLDERS) symlinkSync(realpathSync(join(root, folder)), join(checkout, folder))
  if (made.settings !== undefined) writeFileSync(join(checkout, '.env'), made.settings, { mode: 0o600 })
  if (made.secrets !== undefined) {
    mkdirSync(join(checkout, 'sandboxes', 'made-up-template'), { recursive: true })
    writeFileSync(join(checkout, 'sandboxes', 'made-up-template', 'sandbox.json'), JSON.stringify({
      template: 'made-up-template',
      secrets: { hostFile: '~/.config/made-up/secrets.env', names: made.secrets.map((name) => ({ name, readBy: ['claude'] })) },
    }))
  }
  mkdirSync(join(checkout, 'home'))
  return checkout
}

/** The tool's output in that checkout, with only the given variables, PATH, HOME and LANG in its environment. */
function run(checkout: string, variables: Record<string, string>, args: string[] = []) {
  const ran = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', join(checkout, TOOL), ...args], {
    cwd: checkout, encoding: 'utf8', timeout: 30_000,
    env: { PATH: process.env['PATH'] ?? '', HOME: join(checkout, 'home'), LANG: 'C', ...variables },
  })
  return { code: ran.status, out: ran.stdout, err: ran.stderr, all: `${ran.stdout}\n${ran.stderr}` }
}

/** Every piece of 8 characters of a value, so a value that is cut or quoted is still found. */
function noPieceOf(text: string, value: string) {
  for (let at = 0; at + 8 <= value.length; at++) expect(text.includes(value.slice(at, at + 8)), `a piece of a value at ${at}`).toBe(false)
}

describe('tools/office-variables.mjs prints the office variables masked', () => {
  it('prints a run key, an API key and a key-shaped value under an innocent name only as "set, sha256 <12 hex>"', () => {
    const ran = run(aCheckout(), {
      MOLE_AGENT_KEY: RUN_KEY,
      SANDBOX_RUN_KEY,
      MOLE_OFFICE_MADE_UP_API_KEY: API_KEY,
      MOLE_OFFICE_NOTE: KEY_SHAPED,
      MOLE_OFFICE_db_password: PLAIN_UNDER_A_PASSWORD_NAME,
    })
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(`MOLE_AGENT_KEY: set, sha256 ${sha(RUN_KEY)} (from the environment)`)
    expect(ran.out).toContain(`SANDBOX_RUN_KEY: set, sha256 ${sha(SANDBOX_RUN_KEY)} (from the environment)`)
    expect(ran.out).toContain(`MOLE_OFFICE_MADE_UP_API_KEY: set, sha256 ${sha(API_KEY)} (from the environment)`)
    expect(ran.out).toContain(`MOLE_OFFICE_NOTE: set, sha256 ${sha(KEY_SHAPED)} (from the environment)`)
    expect(ran.out).toContain(`MOLE_OFFICE_db_password: set, sha256 ${sha(PLAIN_UNDER_A_PASSWORD_NAME)} (from the environment)`)
    for (const value of [RUN_KEY, SANDBOX_RUN_KEY, API_KEY, KEY_SHAPED, PLAIN_UNDER_A_PASSWORD_NAME]) noPieceOf(ran.all, value)
  })

  it('masks an address, a login and a home folder as every printed line does, and prints a plain value, a port, whole', () => {
    const ran = run(aCheckout(), {
      MOLE_OFFICE_API: `http://${ADDRESS}:28788`,
      MOLE_OFFICE_COMMIT_EMAIL: LOGIN,
      MOLE_OFFICE_DSH_DIR: `${HOME_FOLDER}/dsh`,
      MOLE_OFFICE_PORT: '28799',
      MOLE_OFFICE_AGENT: 'made-up-agent',
    })
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('MOLE_OFFICE_API: http://<an address, not shown>:28788 (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_COMMIT_EMAIL: <a login, not shown> (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_DSH_DIR: ~/dsh (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_PORT: 28799 (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_AGENT: made-up-agent (from the environment)')
    expect(ran.all).not.toContain(ADDRESS)
    expect(ran.all).not.toContain('made-up-person')
  })

  it('prints "set, not shown" for a value of no kind it knows, and "set, empty" for an empty one', () => {
    const ran = run(aCheckout({ secrets: [] }), {
      SANDBOX_FACTS: FACTS,
      MOLE_OFFICE_ODD: 'two words; and a third',
      MOLE_OFFICE_NOTHING: '',
      MOLE_OFFICE_EMPTY_TOKEN: '',
    })
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('SANDBOX_FACTS: set, not shown (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_ODD: set, not shown (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_NOTHING: set, empty (from the environment)')
    expect(ran.out).toContain('MOLE_OFFICE_EMPTY_TOKEN: set, empty (from the environment)')
    expect(ran.all).not.toContain('made-up-container')
    expect(ran.all).not.toContain('two words')
  })

  it('says which names came from the settings file, and that the environment wins over it', () => {
    const checkout = aCheckout({ settings: `MOLE_OFFICE_PORT=28801\nMOLE_OFFICE_DB=${HOME_FOLDER}/office.db\nMOLE_OFFICE_SETTINGS_TOKEN=${API_KEY}\nOTHER_MADE_UP=1\n` })
    const ran = run(checkout, { MOLE_OFFICE_PORT: '28799' })
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('MOLE_OFFICE_PORT: 28799 (from the environment; the settings file names it too, and is not read for it)')
    expect(ran.out).toContain('MOLE_OFFICE_DB: ~/office.db (from the settings file)')
    expect(ran.out).toContain(`MOLE_OFFICE_SETTINGS_TOKEN: set, sha256 ${sha(API_KEY)} (from the settings file)`)
    expect(ran.out).not.toContain('28801')
    expect(ran.out).not.toContain('OTHER_MADE_UP')
    noPieceOf(ran.all, API_KEY)
  })

  it("says which names came from the sandbox's secret lines in a sandbox's command, and prints them only there", () => {
    const checkout = aCheckout({ secrets: ['MADE_UP_API_KEY', 'MADE_UP_GROUP_ID', 'MADE_UP_NOT_HELD_TOKEN'] })
    const inTheSandbox = run(checkout, { SANDBOX_FACTS: FACTS, MADE_UP_API_KEY: API_KEY, MADE_UP_GROUP_ID: '4217' })
    expect(inTheSandbox.code, inTheSandbox.err).toBe(0)
    expect(inTheSandbox.out).toContain(`MADE_UP_API_KEY: set, sha256 ${sha(API_KEY)} (from the sandbox's secret lines)`)
    expect(inTheSandbox.out).toContain("MADE_UP_GROUP_ID: 4217 (from the sandbox's secret lines)")
    expect(inTheSandbox.out).not.toContain('MADE_UP_NOT_HELD_TOKEN')
    noPieceOf(inTheSandbox.all, API_KEY)

    const outside = run(checkout, { MADE_UP_API_KEY: API_KEY, MADE_UP_GROUP_ID: '4217' })
    expect(outside.code, outside.err).toBe(0)
    expect(outside.out).not.toContain('MADE_UP_API_KEY')
    expect(outside.out).not.toContain('MADE_UP_GROUP_ID')
    expect(outside.out).toContain("not started in a sandbox, so no name came from the sandbox's secret lines")
  })

  it("says so, and exits 1, when the sandbox's template cannot be read here", () => {
    const ran = run(aCheckout(), { SANDBOX_FACTS: FACTS, MADE_UP_API_KEY: API_KEY, MOLE_OFFICE_PORT: '28799' })
    expect(ran.code).toBe(1)
    expect(ran.out).toContain("so no name is traced to the sandbox's secret lines")
    expect(ran.out).toContain('MOLE_OFFICE_PORT: 28799 (from the environment)')
    noPieceOf(ran.all, API_KEY)
  })

  it('prints no other name the process holds, and never what the office tool configuration holds', () => {
    const checkout = aCheckout()
    const configuration = join(checkout, 'tool-configuration.json')
    writeFileSync(configuration, JSON.stringify({ mcpServers: { mole_office: { env: { MOLE_AGENT_KEY: TOOL_FILE_KEY } } } }), { mode: 0o600 })
    const ran = run(checkout, { MOLE_OFFICE_TOOL_CONFIGURATION: configuration, OTHER_MADE_UP_SECRET: API_KEY, MOLEOFFICE_PORT: '1' })
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(`MOLE_OFFICE_TOOL_CONFIGURATION: ${configuration} (from the environment)`)
    for (const name of ['OTHER_MADE_UP_SECRET', 'MOLEOFFICE_PORT', 'PATH:', 'HOME:', 'LANG:']) expect(ran.out).not.toContain(name)
    expect(ran.out).toMatch(/office-variables: 1 name\.\n?$/)
    noPieceOf(ran.all, TOOL_FILE_KEY)
    noPieceOf(ran.all, API_KEY)
  })

  it('refuses an argument, prints no variable, and exits 2', () => {
    const ran = run(aCheckout(), { MOLE_OFFICE_PORT: '28799' }, ['--all'])
    expect(ran.code).toBe(2)
    expect(ran.all).not.toContain('28799')
  })
})
