// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN API KEY IN A LOGIN FILE OF A SANDBOX IS FOUND, AND NAMED BY ITS FILE, ITS ENTRY AND ITS MARK, AND WHILE THE PROVIDER
 * ROUTER IS ON IT STOPS A CHECK FROM BEING SIGNED IN.
 *
 * OLD: with MOLE_OFFICE_PROVIDER_ROUTER on, a sandbox's home could hold an API key in a file a harness signs in from or
 * takes a key from, and the launcher and the inspector started a run that read it: a Codex login made with an API key, an
 * OpenCode login, a key in Claude Code's or OpenCode's settings, Claude Code's own API key, or an older copy of dsh's env
 * file in the sandbox's folder.
 * NEW: tools/key-router/login-files.mjs reads each of those files at the entries where its harness keeps a key:
 *   1. a sandbox folder holding a made-up key in each of them is found, each by its file, its entry and the key's mark,
 *      and neither what is found nor the sentence that refuses the start holds a key;
 *   2. a folder holding only subscription logins and OpenCode's reference to a key by name holds none, and so does a
 *      folder with no login file;
 *   3. a login file that is not what its harness writes refuses the start, naming the file;
 *   4. while the router is on, the inspector does not sign a Codex check in from a login in the check's private home or
 *      from a login seed when either was made with an API key, nor a Claude Code check whose private home holds Claude
 *      Code's API key, and each file is left as it was; with the setting off, the seed signs the Codex check in as before;
 *   5. while the router is on, the inspector does not sign in a Codex check that has no login and whose declared secrets
 *      are API keys, which it is not handed, and says so in the sentence an ordinary Codex run with no login is refused in.
 *
 * WHAT IS REAL AND WHAT IS NOT. The functions are the shipped ones. Every file is written by this test in a folder of its
 * own, and every key and login in them is made up for it.
 *
 * MUTATIONS, each alone and put back:
 *   M1. THE_LOGIN_FILES_OF_A_HOME leaves out Codex's login: cases 1 and 4 go red.
 *   M2. aLoginForTheModel signs the model in without reading the check's login files: case 4 goes red.
 *   M3. aLoginForTheModel signs Codex in with its declared secrets while the router is on: case 5 goes red.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_ROUTER_SETTING, aSecretsMark } from '../src/config/provider-router.mjs'
import { aLoginForTheModel } from '../tools/inspector-sandbox.mjs'
import { THE_LOGIN_FILES_OF_A_SANDBOX, theApiKeysInLoginFiles, whyAStartIsRefusedForTheLoginFiles } from '../tools/key-router/login-files.mjs'
import { aCodexRunHasNoKeyThroughTheRouter } from '../tools/provider-router-host.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const made = randomUUID().slice(0, 8)
/** A made-up key for each login file, none of them a part of another. */
const KEY = Object.fromEntries(['codex', 'opencode', 'opencode-settings', 'claude-settings', 'claude', 'dsh'].map((one) => [one, `made-up-${one}-key-${made}`]))
/** A Codex login of the subscription's shape, which holds no API key. */
const A_CODEX_SUBSCRIPTION = { OPENAI_API_KEY: null, tokens: { id_token: 'made-up', access_token: 'made-up', refresh_token: 'made-up', account_id: 'made-up' }, last_refresh: '2026-11-17T00:00:00Z' }
/** A Codex login made with an API key. */
const A_CODEX_API_KEY_LOGIN = { auth_mode: 'apikey', OPENAI_API_KEY: KEY.codex, tokens: null }

let folder = ''
let made_ = 0
let setting: string | undefined

beforeAll(() => {
  folder = aTestDatabaseFolder('lf')
  setting = process.env[THE_ROUTER_SETTING]
})
afterEach(() => {
  if (setting === undefined) delete process.env[THE_ROUTER_SETTING]; else process.env[THE_ROUTER_SETTING] = setting
})
afterAll(() => {
  removeThisTestFolder(folder)
})

/** A new folder of this test's, with these files written in it, each JSON but a string. */
function aFolderHolding(files: Record<string, unknown>): string {
  made_ += 1
  const at = join(folder, `f${String(made_)}`)
  mkdirSync(at, { recursive: true, mode: 0o700 })
  for (const [file, held] of Object.entries(files)) {
    mkdirSync(dirname(join(at, file)), { recursive: true, mode: 0o700 })
    writeFileSync(join(at, file), typeof held === 'string' ? held : JSON.stringify(held), { mode: 0o600 })
  }
  return at
}

const bySortedEntry = <T extends { file: string; entry: string }>(found: T[]) => [...found].sort((a, b) => `${a.file} ${a.entry}`.localeCompare(`${b.file} ${b.entry}`))
const noKeyIn = (text: string) => { for (const key of Object.values(KEY)) expect(text).not.toContain(key) }

/** Subscription logins beside each key, and OpenCode's reference to a key by name: none of them is an API key. */
const SUBSCRIPTIONS = {
  'home/.claude/.credentials.json': { claudeAiOauth: { accessToken: 'made-up-access', refreshToken: 'made-up-refresh', expiresAt: 0 } },
  'home/.codex/auth.json': A_CODEX_SUBSCRIPTION,
  'home/.local/share/opencode/auth.json': { 'opencode-go': { type: 'oauth', refresh: 'made-up-refresh', access: 'made-up-access', expires: 0 } },
  'home/.config/opencode/opencode.json': { provider: { openai: { options: { apiKey: '{env:OPENAI_API_KEY}' } } }, permission: { external_directory: 'allow' } },
  'home/.claude/settings.json': { env: { MADE_UP_SETTING: 'made-up' }, includeCoAuthoredBy: false },
  'home/.claude.json': { userID: 'made-up' },
  'dsh/env': 'DSH_MADE_UP_SETTING=made-up\n',
}

describe('the login files of a sandbox', () => {
  // Case 1. M1.
  it('finds a made-up key in each, by its file, its entry and its mark, and neither what is found nor the refusal holds a key', () => {
    const at = aFolderHolding({
      ...SUBSCRIPTIONS,
      'home/.codex/auth.json': A_CODEX_API_KEY_LOGIN,
      'home/.local/share/opencode/auth.json': { ...SUBSCRIPTIONS['home/.local/share/opencode/auth.json'], deepseek: { type: 'api', key: KEY.opencode } },
      'home/.config/opencode/opencode.json': { provider: { openai: { options: { apiKey: '{env:OPENAI_API_KEY}' } }, openrouter: { options: { apiKey: KEY['opencode-settings'] } } } },
      'home/.claude/settings.json': { env: { MADE_UP_SETTING: 'made-up', ANTHROPIC_API_KEY: KEY['claude-settings'] } },
      'home/.claude.json': { userID: 'made-up', primaryApiKey: KEY.claude },
      'dsh/env': `DSH_MADE_UP_SETTING=made-up\nDEEPSEEK_API_KEY=${KEY.dsh}\n`,
    })
    const found = theApiKeysInLoginFiles(at, THE_LOGIN_FILES_OF_A_SANDBOX)
    expect(bySortedEntry(found)).toEqual(bySortedEntry([
      { file: 'home/.codex/auth.json', entry: 'OPENAI_API_KEY', mark: aSecretsMark(KEY.codex) },
      { file: 'home/.local/share/opencode/auth.json', entry: 'deepseek.key', mark: aSecretsMark(KEY.opencode) },
      { file: 'home/.config/opencode/opencode.json', entry: 'provider.openrouter.options.apiKey', mark: aSecretsMark(KEY['opencode-settings']) },
      { file: 'home/.claude/settings.json', entry: 'env.ANTHROPIC_API_KEY', mark: aSecretsMark(KEY['claude-settings']) },
      { file: 'home/.claude.json', entry: 'primaryApiKey', mark: aSecretsMark(KEY.claude) },
      { file: 'dsh/env', entry: 'DEEPSEEK_API_KEY', mark: aSecretsMark(KEY.dsh) },
    ]))
    noKeyIn(JSON.stringify(found))
    const refusal = whyAStartIsRefusedForTheLoginFiles(at, THE_LOGIN_FILES_OF_A_SANDBOX, 'The made-up folder')
    expect(refusal).not.toBeNull()
    for (const one of found) for (const part of [one.file, one.entry, one.mark]) expect(refusal).toContain(part)
    noKeyIn(refusal!)
  })

  // Case 2.
  it('finds none in subscription logins and a reference to a key by name, nor in a folder with no login file', () => {
    for (const at of [aFolderHolding(SUBSCRIPTIONS), aFolderHolding({})]) {
      expect(theApiKeysInLoginFiles(at, THE_LOGIN_FILES_OF_A_SANDBOX)).toEqual([])
      expect(whyAStartIsRefusedForTheLoginFiles(at, THE_LOGIN_FILES_OF_A_SANDBOX, 'The made-up folder')).toBeNull()
    }
  })

  // Case 3.
  it.each([['not JSON', 'not json'], ['a JSON list', '[]']])('refuses the start, naming the file, when a login file is %s', (_what, written) => {
    const at = aFolderHolding({ ...SUBSCRIPTIONS, 'home/.claude.json': written })
    const refusal = whyAStartIsRefusedForTheLoginFiles(at, THE_LOGIN_FILES_OF_A_SANDBOX, 'The made-up folder')
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('home/.claude.json')
  })
})

describe("the inspector's sign-in while the provider router is on", () => {
  /** A check's private home and the inspector's shared home, holding these files, and a template that declares these secrets. */
  function aCheck(files: Record<string, unknown>, secrets: { name: string; readBy: string[]; value: string }[] = []) {
    const at = aFolderHolding(files)
    const templateDir = join(at, 'template')
    const secretsFile = join(at, 'secrets.env')
    mkdirSync(templateDir)
    writeFileSync(secretsFile, secrets.map(({ name, value }) => `${name}=${value}\n`).join(''), { mode: 0o600 })
    writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { hostFile: secretsFile, names: secrets.map(({ name, readBy }) => ({ name, readBy })) } }))
    return { at, sandbox: { home: join(at, 'private'), sharedHome: join(at, 'shared'), templateDir, checkDir: join(at, 'check'), login: null, loginSeeds: [] as unknown[] } }
  }
  /** What aLoginForTheModel threw, or null when it signed the model in. */
  function whyNotSignedIn(sandbox: unknown, runtime: string, home: string): string | null {
    try {
      aLoginForTheModel(sandbox, { runtime, minutes: 1, home })
      return null
    } catch (why) {
      return why instanceof Error ? why.message : String(why)
    }
  }

  // Case 4. M1 and M2.
  it('refuses a Codex login and a Codex login seed made with an API key, and a Claude Code API key, and leaves each file as it was', () => {
    process.env[THE_ROUTER_SETTING] = 'on'
    const cases = [
      { what: "a Codex login in the check's private home", runtime: 'codex', file: 'private/.codex/auth.json', held: A_CODEX_API_KEY_LOGIN, entry: 'OPENAI_API_KEY', key: KEY.codex, secrets: [] },
      { what: 'a Codex login seed', runtime: 'codex', file: 'shared/.codex/auth.json', held: A_CODEX_API_KEY_LOGIN, entry: 'OPENAI_API_KEY', key: KEY.codex, secrets: [] },
      { what: "Claude Code's API key in the check's private home", runtime: 'claude-code', file: 'private/.claude.json', held: { primaryApiKey: KEY.claude }, entry: 'primaryApiKey', key: KEY.claude,
        secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'], value: 'made-up-claude-login' }] },
    ]
    for (const one of cases) {
      const { at, sandbox } = aCheck({ [one.file]: one.held, 'private/.made-up': '' }, one.secrets)
      const before = readFileSync(join(at, one.file))
      const why = whyNotSignedIn(sandbox, one.runtime, at)
      expect(why, one.what).not.toBeNull()
      for (const part of [one.file.slice(one.file.indexOf('/') + 1), one.entry, aSecretsMark(one.key)]) expect(why, one.what).toContain(part)
      noKeyIn(why!)
      expect(readFileSync(join(at, one.file)), `${one.what} is left as it was`).toEqual(before)
    }
    // A CODEX LOGIN SEED OF THE SUBSCRIPTION'S SHAPE signs the check in.
    const { at, sandbox } = aCheck({ 'shared/.codex/auth.json': A_CODEX_SUBSCRIPTION, 'private/.made-up': '' })
    expect(whyNotSignedIn(sandbox, 'codex', at)).toBeNull()
    expect(sandbox.loginSeeds).toHaveLength(1)
  })

  // Case 5. M3.
  it('refuses a Codex check with no login whose declared secrets are API keys, in the sentence an ordinary Codex run is refused in', () => {
    process.env[THE_ROUTER_SETTING] = 'on'
    const { at, sandbox } = aCheck({ 'private/.made-up': '' }, [{ name: 'OPENAI_API_KEY', readBy: ['codex'], value: KEY.codex! }])
    const why = whyNotSignedIn(sandbox, 'codex', at)
    expect(why).toContain(aCodexRunHasNoKeyThroughTheRouter(''))
    noKeyIn(why!)
  })

  it('refuses a provider-row Codex check before changing its private API-key login', () => {
    process.env[THE_ROUTER_SETTING] = 'on'
    const file = 'private/.codex/auth.json'
    const { at, sandbox } = aCheck({ [file]: A_CODEX_API_KEY_LOGIN })
    const before = readFileSync(join(at, file))
    let why: string | null = null
    try {
      aLoginForTheModel(sandbox, { runtime: 'codex', minutes: 1, home: at, provider: { id: 'made-up', native: 'openai' } })
    } catch (error) {
      why = error instanceof Error ? error.message : String(error)
    }
    expect(why).not.toBeNull()
    for (const part of ['.codex/auth.json', 'OPENAI_API_KEY', aSecretsMark(KEY.codex)]) expect(why).toContain(part)
    noKeyIn(why!)
    expect(readFileSync(join(at, file))).toEqual(before)
  })

  it('signs a Codex check in from a login seed made with an API key, as before, while the setting is off', () => {
    process.env[THE_ROUTER_SETTING] = 'off'
    const { at, sandbox } = aCheck({ 'shared/.codex/auth.json': A_CODEX_API_KEY_LOGIN, 'private/.made-up': '' })
    expect(whyNotSignedIn(sandbox, 'codex', at)).toBeNull()
    expect(sandbox.loginSeeds).toHaveLength(1)
  })
})
