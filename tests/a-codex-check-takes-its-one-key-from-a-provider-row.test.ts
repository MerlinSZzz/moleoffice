// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODEX CHECK TAKES ITS ONE KEY FROM THE PROVIDER ITS CASTING ROW NAMES.
 *
 * A Codex Casting row for the inspector may name a provider-table row, as a dsh row may. Such a check is handed that
 * provider's key alone, under THE_CODEX_PROVIDER_VARIABLES, in the private file a dsh check's key goes in, and Codex is
 * told the provider by the -c options of theCodexProviderOptions (tools/inspector-sandbox.mjs). No template secret, no
 * Codex login and no default model stands in when the key cannot be had.
 *
 * WHAT IS REAL: the office's own doors on a fresh test database, and a key file of the test's own beside that database,
 * written before the office starts, whose provider entry is set only when a case sets it, with a value made at random;
 * the launcher selection; and runInside and aLoginForTheModel, with tests/inspector-view-stand-in.ts as the launcher,
 * a labelled stand-in that writes the receipt a launcher would. No real key file is read, no provider is called, no
 * container starts and no codex runs: every address below is only stored or handed to the stand-in.
 *
 *   1. The Casting door stores a codex row for the inspector that names a provider row whose key entry is not set, and
 *      the row and its selection read it back with no native provider. The run-models door, asked for a check, then
 *      refuses with codexProviderKeyNotSet, naming the row, the provider and the entry, and ending "Nothing was started.".
 *   2. The door refuses a codex row a provider not for codex, and a codex row for another role than the inspector's,
 *      and a change of the row's program to one the provider is not for, and writes nothing.
 *   3. Once the key file sets the entry, the run-models door answers the provider's fields with its key `set`. No reply
 *      and no stored row holds the value.
 *   4. While the provider router is on, the same door refuses with codexProviderWhileTheRouterIsOn.
 *   5. The selection's revision changes with the provider's base address, and a selection read before is refused.
 *   6. A provider changed to leave codex out is refused at the start with codexProviderNotForCodex, and one that is gone
 *      with codexProviderGone.
 *   7. The launcher's guarded list for codex names the two variables such a check is handed and the settings that
 *      choose its provider and its shell's environment, and the Casting door refuses a codex row's setting of each.
 *   8. The launcher takes a codex selection that names a provider row for a check, keeps the provider options the
 *      command carries, and says the key and address come from the provider row; a start that is not a check is
 *      refused in Codex's words.
 *   9. runInside hands a Codex check's launcher the path of one new file of mode 600, in a folder of mode 700 outside
 *      every mount, holding the key under PROVIDER_ROW_API_KEY and the base address, and no --secret. The value is on no
 *      argument list and in no file the run leaves, and the file is gone when the launcher ends and when it fails.
 *  10. runInside refuses the key, before the launcher is called and before any key file is written, to a Codex command
 *      whose -c options are not theCodexProviderOptions of the key's base address, or that names another model provider
 *      or another shell environment, and to a command whose label or runtime is not codex.
 *  11. aLoginForTheModel signs such a check in with no login seed and reads no template, though the template has Codex
 *      secrets and the shared home has a Codex login, both of which a check without a provider row takes. The folder of
 *      mode 700 that the launcher's CODEX_HOME names, which no seed then makes, is made, and a Codex login left in it is
 *      taken away.
 *  12. The key is masked under its own name in what the view answers.
 *  13. theCodexProviderOptions gives model_provider, and the provider's name, base_url, env_key and wire_api, and one
 *      shell exclude list that names the run's key and the provider's key. The provider id is none of Codex's own, the
 *      key's name is neither name Codex reads of its own, and the inspector masks it.
 *
 * MUTATIONS, NAMED, EACH ALONE AFTER A GREEN CONTROL:
 *   a. In src/server/lib/run-models.ts, refuseAProviderTheCheckCannotTake returning for codex as for any other
 *      program: cases 1, 4 and 6 go red.
 *   b. In src/server/lib/casting.ts, refuseAProviderTheRowCannotName refusing codex as before: case 1 goes red.
 *   c. In src/config/launcher-selection.mjs, whyAStartCannotTakeTheProviderRow refusing codex as before: case 8 goes red.
 *   d. In src/config/the-launchers-own-settings.mjs, the PROVIDER_ROW_API_KEY entry taken out of the codex list: case 7
 *      goes red.
 *   e. In tools/inspector-sandbox.mjs, aProviderKeyFile writing dsh's names for a Codex key: case 9 goes red.
 *   f. In the same file, runInside's check of a Codex command's -c options taken out: case 10 goes red.
 *   g. In the same file, aLoginForTheModel's branch for a Codex provider row taken out: case 11 goes red.
 *   h. In the same file, WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT without MOLE_AGENT_KEY: case 13 goes red.
 *   i. In the same file, EVERY_SECRET_A_CHECK_IS_HANDED without the Codex key's name: case 13 goes red.
 *   j. In the same file, theProviderKeyHanded naming dsh's key for a Codex key: case 12 goes red.
 *   k. In the same file, aLoginForTheModel leaving a Codex login in the check's private home for a provider row: case 11
 *      goes red.
 *   l. In the same file, aLoginForTheModel not making the Codex folder of the check's private home for a provider row:
 *      case 11 goes red.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { applyLauncherSelection, readLauncherSelection, whyAStartCannotTakeTheProviderRow } from '../src/config/launcher-selection.mjs'
import { THE_ROUTER_SETTING } from '../src/config/provider-router.mjs'
import { THE_LAUNCHERS_OWN_SETTINGS } from '../src/config/the-launchers-own-settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR, THE_WORKER } from '../src/shared/roles.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import * as inspectorSandbox from '../tools/inspector-sandbox.mjs'
import { THE_CHECKS_FOLDER, theChecksMarker } from '../tools/sandbox-common.mjs'

/** Made-up values. Nothing here is, or was ever, a key any office issued or any provider takes. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const THE_ENTRYS_VALUE = `made-up-provider-value-${randomBytes(24).toString('hex')}`
const A_TEMPLATE_VALUE = `made-up-template-value-${randomBytes(24).toString('hex')}`
/** The key file's entry the provider names. It is not set until case 3 sets it. */
const THE_ENTRY = 'test-codex-entry'
/** The provider row, for codex, at an address only stored. */
const PROVIDER = 'test-codex-provider'
const { EVERY_SECRET_A_CHECK_IS_HANDED, THE_LOGIN_FILES_IN_A_CHECK_VIEW, aLoginForTheModel, maskedOfWhatTheViewIsHanded, runInside, theSecretNamesOf } = inspectorSandbox
/**
 * WHAT A CODEX CHECK'S PROVIDER ROW ADDS to tools/inspector-sandbox.mjs, read from the module's namespace and not by name,
 * so that where it is not there each case that needs it fails alone, and the cases that do not still run.
 */
const { THE_CODEX_PROVIDER_ID, THE_CODEX_PROVIDER_VARIABLES: NAMES, WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT, theCodexProviderOptions } = inspectorSandbox
const ADDRESS = 'https://provider.example.invalid/v1'
const FLAG = '--provider-key-file'

const WORKSPACE = 'default'
const THE_PERSON_ASKS = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const INSPECTOR = 'codex-provider-inspector'
const keys = new Map<string, string>()

let t: TestDb
let app: FastifyInstance
/** The inspector's row in force, which names PROVIDER. */
let row = 0

type Said = { status: number; body: Record<string, any>; text: string }

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<Said> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any>, text: reply.body }
}

function as(handle: string): Record<string, string> {
  return { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

/** The key file, with the provider entry set or not. Its time is moved on, so the office reads it again. */
function theKeyFileHolds(entries: Record<string, string>): void {
  const file = join(dirname(t.file), 'keys.json')
  writeFileSync(file, `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: entries }, null, 2)}\n`, { mode: 0o600 })
  const later = new Date(Date.now() + 2_000 + Math.floor(Math.random() * 1_000))
  utimesSync(file, later, later)
}

/** A refusal, with its status, its code and its values. */
function expectRefused(said: Said, status: number, code: string, values: Record<string, unknown>): void {
  expect(said.status, `${code}: ${said.text.slice(0, 600)}`).toBe(status)
  expect(said.body['code'], said.text.slice(0, 600)).toBe(code)
  expect(said.body['values'], code).toEqual(values)
}

/** Every Casting row and both provider tables, whole, to prove a refused write changed nothing. */
function stored(): string {
  return JSON.stringify(['casting_rows', 'providers', 'provider_changes'].map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()))
}

/** Every row of every table of the database, as text. */
function everyStoredRow(): string {
  const tables = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
  return tables.map((one) => JSON.stringify(t.client.sqlite.prepare(`SELECT * FROM "${one.name.replaceAll('"', '""')}"`).all())).join('\n')
}

/** A provider, added by the person. */
async function aProvider(id: string, programs: string[]): Promise<void> {
  const added = await ask('POST', '/api/casting/providers', THE_PERSON_ASKS, { id, name: `The test's own ${id}`, programs, baseAddress: `https://${id}.example/v1`, keyName: THE_ENTRY })
  expect(added.status, added.text.slice(0, 600)).toBe(201)
}

/** A row's body for `program`, naming provider row `providerRow`. Codex takes no native provider of its own. */
function aRowBody(program: string, providerRow: unknown, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    program: { value: program },
    model: { value: `office-${randomUUID()}` },
    effort: { value: 'high' },
    native: { model: `native-${randomUUID()}`, provider: null, variant: null, providerRow, ...more },
  }
}

/** The run-models door, asked by the inspector for a check. */
const theCheckAsks = () => ask('GET', `/api/office/run-models/for/${INSPECTOR}?place=check`, as(INSPECTOR))

/** The inspector's row's selection, as its own door reads it. */
async function theSelection(): Promise<{ revision: string; native: Record<string, unknown> }> {
  const read = await ask('GET', `/api/casting/rows/${String(row)}/selection`, THE_PERSON_ASKS)
  expect(read.status, read.text.slice(0, 600)).toBe(200)
  return { revision: String(read.body['selection']?.casting?.revision), native: read.body['selection']?.native }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env[THE_ROUTER_SETTING]
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  theKeyFileHolds({})
  app = (await apiApp()).app
  await app.ready()
  const made = await ask('POST', '/api/agents/started', THE_PERSON_ASKS, { handle: INSPECTOR, name: 'Codex Provider Inspector', role: THE_INSPECTOR, runtime: 'codex', workArea: ['src'] })
  expect(made.status, made.text.slice(0, 600)).toBe(201)
  keys.set(INSPECTOR, String(made.body['whatToGiveIt']?.key ?? ''))
  await aProvider(PROVIDER, ['codex'])
}, 60_000)

afterAll(async () => {
  delete process.env[THE_ROUTER_SETTING]
  await app?.close()
  t?.close()
})

describe('A. the office lets a Codex row name a provider row, and refuses a check it cannot hand the key to', () => {
  it('1: the door stores a codex row for the inspector naming a provider whose key is not set, and a check is refused naming the entry', async () => {
    const written = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody('codex', PROVIDER))
    expect(written.status, written.text.slice(0, 600)).toBe(201)
    row = Number(written.body['casting']?.id)
    expect(written.body['casting']?.native).toMatchObject({ provider: null, providerRow: PROVIDER })
    expect((await theSelection()).native).toMatchObject({ provider: null, providerRow: PROVIDER })
    expect((await ask('GET', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS)).body['key']).toBe('not set')
    const refused = await theCheckAsks()
    expectRefused(refused, 409, 'codexProviderKeyNotSet', { row: String(row), provider: PROVIDER, entry: THE_ENTRY })
    const said = String(refused.body['error'])
    for (const part of [String(row), PROVIDER, THE_ENTRY]) expect(said).toContain(part)
    expect(said.endsWith('Nothing was started.'), said).toBe(true)
  })

  it('2: the door refuses a provider a codex row cannot take, with its code and values, and writes nothing', async () => {
    await aProvider('test-dsh-only', ['dsh'])
    const before = stored()
    expectRefused(await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody('codex', 'test-dsh-only')), 400, 'castingProviderRowNotForTheProgram',
      { provider: 'test-dsh-only', program: 'codex', programs: 'dsh' })
    expectRefused(await ask('POST', `/api/casting/${THE_WORKER}`, THE_PERSON_ASKS, aRowBody('codex', PROVIDER)), 400, 'castingProviderRowOnlyForTheInspector', { provider: PROVIDER, role: THE_WORKER })
    expectRefused(await ask('PATCH', `/api/casting/rows/${String(row)}`, THE_PERSON_ASKS, { program: { value: 'opencode' } }), 400, 'castingProviderRowNotForTheProgram',
      { provider: PROVIDER, program: 'opencode', programs: 'codex' })
    expect(stored()).toBe(before)
  })

  it('3: once the entry is set, a check is told the provider, and never its value', async () => {
    const provider = (await ask('GET', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS)).body
    const refused = await theCheckAsks()
    theKeyFileHolds({ [THE_ENTRY]: THE_ENTRYS_VALUE })
    const answered = await theCheckAsks()
    expect(answered.status, answered.text.slice(0, 600)).toBe(200)
    expect(answered.body['runtime']).toBe('codex')
    expect(answered.body['provider']).toEqual({ row, found: true, id: PROVIDER, programs: ['codex'], baseAddress: provider['baseAddress'], keyName: THE_ENTRY, key: 'set' })
    expect(answered.body['selection']?.native?.providerRow).toBe(PROVIDER)
    for (const said of [refused, answered]) expect(said.text.includes(THE_ENTRYS_VALUE), 'a run-models reply holds the value').toBe(false)
    expect(everyStoredRow().includes(THE_ENTRYS_VALUE), 'a stored row holds the value').toBe(false)
  })

  it('4: a check is refused while the provider router is on', async () => {
    process.env[THE_ROUTER_SETTING] = 'on'
    try {
      expectRefused(await theCheckAsks(), 409, 'codexProviderWhileTheRouterIsOn', { row: String(row), provider: PROVIDER })
    } finally {
      delete process.env[THE_ROUTER_SETTING]
    }
    expect((await theCheckAsks()).status).toBe(200)
  })

  it('5: the revision covers the base address, and a selection read before a change of it is refused', async () => {
    const before = await theSelection()
    const changed = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, baseAddress: `https://${PROVIDER}.example/v2` })
    expect(changed.status, changed.text.slice(0, 600)).toBe(200)
    const after = await theSelection()
    expect(after.revision).not.toBe(before.revision)
    const old = await ask('GET', `/api/casting/rows/${String(row)}/selection?revision=${encodeURIComponent(before.revision)}`, THE_PERSON_ASKS)
    expect(old.status, old.text.slice(0, 600)).toBe(409)
    expect((await theCheckAsks()).body['provider']?.baseAddress).toBe(`https://${PROVIDER}.example/v2`)
  })

  it('6: a provider that leaves codex out, or is gone, is refused at the start', async () => {
    const left = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, programs: ['dsh'] })
    expect(left.status, left.text.slice(0, 600)).toBe(200)
    expectRefused(await theCheckAsks(), 409, 'codexProviderNotForCodex', { row: String(row), provider: PROVIDER, programs: 'dsh' })
    const back = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, programs: ['codex'] })
    expect(back.status, back.text.slice(0, 600)).toBe(200)
    // GONE BEHIND THE DOOR'S BACK, as only a hand in the database could make it, since the door refuses it.
    const held = t.client.sqlite.prepare('SELECT * FROM providers WHERE id = ?').get(PROVIDER) as Record<string, unknown>
    t.client.sqlite.prepare('DELETE FROM providers WHERE id = ?').run(PROVIDER)
    try {
      expectRefused(await theCheckAsks(), 409, 'codexProviderGone', { row: String(row), provider: PROVIDER })
    } finally {
      const names = Object.keys(held)
      t.client.sqlite.prepare(`INSERT INTO providers (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...names.map((name) => held[name]))
    }
    expect((await theCheckAsks()).status).toBe(200)
  })

  it("7: the launcher's guarded list for codex names what such a check is handed and how it is told, and a row may set none of it", async () => {
    const codex = THE_LAUNCHERS_OWN_SETTINGS.codex as readonly Record<string, unknown>[]
    for (const name of [NAMES.key, NAMES.baseAddress]) {
      expect(codex.some((one) => one['environment'] === name), `${name} is not in the codex list`).toBe(true)
    }
    for (const parts of [['model_provider'], ['model_providers'], ['shell_environment_policy']]) {
      expect(codex.some((one) => JSON.stringify(one['parts']) === JSON.stringify(parts)), `${parts.join('.')} is not in the codex list`).toBe(true)
    }
    const before = stored()
    for (const setting of [
      { name: `env.${NAMES.key}`, value: 'made-up' },
      { name: `env.${NAMES.baseAddress}`, value: 'https://elsewhere.example/v1' },
      { name: 'model_provider', value: 'openai' },
      { name: `model_providers.${THE_CODEX_PROVIDER_ID}.base_url`, value: 'https://elsewhere.example/v1' },
      { name: 'shell_environment_policy.exclude', value: [] },
    ]) {
      const refused = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, { ...aRowBody('codex', PROVIDER, { settings: [setting] }), project: WORKSPACE })
      expect(refused.status, `a row setting ${setting.name}: ${refused.text.slice(0, 600)}`).toBe(400)
    }
    expect(stored()).toBe(before)
  })

  it('8: the launcher takes a provider row for a Codex check, keeps its provider options, and refuses a start that is not a check', () => {
    const selection = readLauncherSelection({ runtime: 'codex', model: 'office-codex', native: { model: 'native-codex', provider: null, variant: null, effort: null, providerRow: PROVIDER }, casting: { id: 1, revision: 'a-made-up-revision' } })
    expect(whyAStartCannotTakeTheProviderRow(selection, true)).toBeNull()
    const options = theCodexProviderOptions(ADDRESS)
    const command = ['codex', '-C', '/work', 'exec', '--json', ...options, '--', '-']
    const taken = applyLauncherSelection(command, { runtime: 'codex', model: selection.model, selection, aCheckCarriesTheProvider: true })
    expect(taken.start.words).toContain(`provider row ${PROVIDER}`)
    const at = taken.command.indexOf(options[0]!)
    expect(taken.command.slice(at, at + options.length), 'the provider options, as the command gave them').toEqual(options)
    const notACheck = whyAStartCannotTakeTheProviderRow(selection, false)
    expect(notACheck).toMatch(/^Codex refused the selection: /u)
    expect(() => applyLauncherSelection(command, { runtime: 'codex', model: selection.model, selection })).toThrow(notACheck!)
  })
})

// ============================================================================ B. what runInside hands a Codex check

type View = ReturnType<typeof inspectorViewStandIn>
const views: View[] = []
afterEach(() => { for (const view of views.splice(0)) view.close() })

const PROVIDER_KEY = { value: THE_ENTRYS_VALUE, baseAddress: ADDRESS, program: 'codex', native: null }
const within = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`)
const realOrAsIs = (path: string) => { try { return realpathSync(path) } catch { return path } }

/** Every file under `dir` whose bytes hold `text`, read whole. A link is not followed. */
function filesHolding(dir: string, text: string): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const kind = lstatSync(path)
      if (kind.isDirectory()) walk(path)
      else if (kind.isFile() && readFileSync(path).includes(text)) found.push(path)
    }
  }
  if (existsSync(dir)) walk(dir)
  return found
}

/** What the launcher was handed, read when it was called: its words and the key file they name, as it then was. */
function whatTheLauncherIsHanded(words: string[]) {
  const at = words.indexOf(FLAG)
  const file = at < 0 ? null : words[at + 1]!
  const held = file === null ? null : lstatSync(file), folder = file === null ? null : lstatSync(dirname(file))
  const lines: Record<string, string> = file === null ? {} : Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(line => line !== '')
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
  return { words, file, flags: words.filter(word => word === FLAG).length, secrets: words.filter((_, i) => words[i - 1] === '--secret'),
    isFile: held?.isFile() ?? false, mode: held === null ? null : held.mode & 0o777, folderMode: folder === null ? null : folder.mode & 0o777, lines }
}

/**
 * A stand-in view whose template sets made-up OPENAI_API_KEY and CODEX_API_KEY, with a Codex login in its shared home,
 * and the inspector's own folder for the instance with the check's marker in it, as aSandboxForThisCheck sets them.
 * Its launcher notes what it is handed, and its start says what a key file handed exactly when it was handed one.
 * `says` is written as the command's output. The stand-in writes its evidence under umask 022, as runInside wants it.
 */
function aView({ says = null as string | null, secrets = { OPENAI_API_KEY: A_TEMPLATE_VALUE, CODEX_API_KEY: A_TEMPLATE_VALUE } as Record<string, string> } = {}) {
  const view = inspectorViewStandIn({ secrets })
  views.push(view)
  const sandbox: any = view.sandbox
  sandbox.hostOnly = join(view.root, THE_CHECKS_FOLDER, sandbox.instance)
  sandbox.marker = theChecksMarker(view.root, sandbox.instance, sandbox.asked.check)
  mkdirSync(dirname(sandbox.marker), { recursive: true, mode: 0o700 })
  sandbox.sharedHome = join(view.root, 'shared-home')
  const seed = join(sandbox.sharedHome, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex)
  mkdirSync(dirname(seed), { recursive: true, mode: 0o700 })
  writeFileSync(seed, JSON.stringify({ synthetic: 'A made-up Codex login, never a real one', OPENAI_API_KEY: A_TEMPLATE_VALUE }), { mode: 0o600 })
  const seen: ReturnType<typeof whatTheLauncherIsHanded>[] = []
  let handed = false
  view.changeStart((start: any) => {
    if (handed) start.provider = 'The stand-in launcher was handed a provider key file.'
    if (says !== null) writeFileSync(start.out, says)
  })
  const launcher = async (asked: any, words: string[], command: any = null) => {
    handed = words.includes(FLAG)
    seen.push(whatTheLauncherIsHanded(words))
    process.umask(0o022)
    return view.launcher(asked, words, command)
  }
  return { ...view, sandbox, seen, seed, launcher }
}

/** The array the inspector sends for a Codex check whose row names a provider row, with these -c options. */
const codexArgv = (options = theCodexProviderOptions(ADDRESS), more: string[] = []) =>
  ['codex', '-a', 'never', '-s', 'danger-full-access', '-C', '/work', 'exec', '--json', ...options, ...more, '-m', 'a-made-up-model', '--', '-']

const aCodexRun = (view: ReturnType<typeof aView>, more: Record<string, unknown> = {}) =>
  runInside(view.sandbox, { label: 'codex', runtime: 'codex', cwd: view.work, argv: codexArgv(), limitMs: 5_000, providerKey: PROVIDER_KEY,
    launcher: view.launcher, ...more })

describe('B. runInside hands a Codex check the provider key in a private file, and only with the provider options', () => {
  it('9: hands only the path of a new file of mode 600, in a folder of mode 700 outside every mount, and removes it when the launcher ends or fails', async () => {
    const view = aView()
    const ran = await aCodexRun(view)
    expect(ran.code, ran.why).toBe(0)
    expect(view.seen).toHaveLength(1)
    const at = view.seen[0]!
    expect(at.flags).toBe(1)
    expect(at.secrets, 'no template secret is asked for beside the provider key').toEqual([])
    expect(at.words.join('\n').includes(THE_ENTRYS_VALUE), 'the value is on an argument list').toBe(false)
    expect(at).toMatchObject({ isFile: true, mode: 0o600, folderMode: 0o700 })
    expect(Object.keys(at.lines).sort(), 'the names the key file holds').toEqual([NAMES.key, NAMES.baseAddress].sort())
    expect(at.lines[NAMES.key] === THE_ENTRYS_VALUE, "the key's line holds the value").toBe(true)
    expect(at.lines[NAMES.baseAddress]).toBe(ADDRESS)
    const spec = view.calls[0]!.spec
    for (const dir of [...spec.readOnly, ...spec.private].map((mount: any) => mount.host).concat(spec.outputs.dir)) {
      expect(within(at.file!, dir) || within(at.file!, realOrAsIs(dir)), `${at.file} is inside ${dir}`).toBe(false)
    }
    expect(Object.values(process.env).includes(THE_ENTRYS_VALUE), 'the value is in an environment of this process').toBe(false)
    expect(existsSync(at.file!), 'the file is gone once the launcher has ended').toBe(false)
    expect(filesHolding(view.root, THE_ENTRYS_VALUE), 'files the run leaves that hold the value').toEqual([])
    // THE SAME COMMAND WITHOUT A PROVIDER ROW is handed Codex's own two names, so the case above is not the default.
    expect(theSecretNamesOf('codex'), "Codex's own names").not.toContain(NAMES.key)
    let file: string | null = null
    const failed = await aCodexRun(view, { launcher: async (_asked: unknown, words: string[]) => {
      file = whatTheLauncherIsHanded(words).file
      throw new Error('The stand-in launcher failed after it was handed the file.')
    } })
    expect(failed.code).toBeNull()
    expect(file, 'the failing launcher was handed a file').not.toBeNull()
    expect(existsSync(file!), 'the file is gone once the launcher has failed').toBe(false)
  }, 30_000)

  it.each([
    ['no provider options', () => codexArgv([])],
    ['the options of another base address', () => codexArgv(theCodexProviderOptions('https://elsewhere.example.invalid/v1'))],
    ['a second model provider', () => codexArgv(undefined, ['-c', 'model_provider="openai"'])],
    ['a second model provider, written with spaces', () => codexArgv(undefined, ['-c', ' model_provider = "openai"'])],
    ['a provider of its own, through --config=', () => codexArgv(undefined, ['--config=model_providers.another.base_url="http://127.0.0.1:1/v1"'])],
    ['another shell environment', () => codexArgv(undefined, ['-c', 'shell_environment_policy.inherit="all"'])],
  ])('10a: refuses the key to a Codex command with %s before the launcher is called, and writes no key file', async (_what, argv) => {
    const view = aView()
    const refused = await aCodexRun(view, { argv: argv() })
    expect(refused.code).toBeNull()
    expect(refused.why).toMatch(/theCodexProviderOptions/u)
    expect(view.calls).toHaveLength(0)
    expect(readdirSync(view.root, { recursive: true }).filter(name => String(name).endsWith('.env'))).toEqual([])
    expect(refused.why.includes(THE_ENTRYS_VALUE), 'the value is in the refusal').toBe(false)
    expect((await aCodexRun(view)).code, 'the same view with the options').toBe(0)
  }, 30_000)

  it.each([
    ['a label that is not codex', { label: 'build' }],
    ['a runtime that is not codex', { runtime: 'claude-code', label: 'claude', argv: ['claude', '-p'] }],
  ])('10b: refuses a Codex key to %s before the launcher is called', async (_what, change) => {
    const view = aView()
    const refused = await aCodexRun(view, change)
    expect(refused.code).toBeNull()
    expect(refused.why).toMatch(/read for Codex/u)
    expect(view.calls).toHaveLength(0)
  }, 30_000)

  it('11: signs Codex in from a provider row with no login seed and without reading the template, which a check without one reads', () => {
    const view = aView({ secrets: {} })
    const home = join(view.root, 'a-home-of-its-own')
    // WITHOUT A PROVIDER ROW, Codex takes the shared home's login, since the template sets no secret.
    expect(aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'codex', home })).toContain(view.seed)
    expect(view.sandbox.loginSeeds).toHaveLength(1)
    // NO SEED MAKES THE FOLDER THE LAUNCHER'S CODEX_HOME NAMES, so the sign-in makes it: Codex 0.159.2 does not start
    // when that folder is not there.
    const left = join(view.sandbox.home, THE_LOGIN_FILES_IN_A_CHECK_VIEW.codex)
    const provider = { id: PROVIDER, native: null }
    expect(existsSync(dirname(left))).toBe(false)
    aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'codex', provider, home })
    expect(statSync(dirname(left)).mode & 0o777).toBe(0o700)
    // A COPY LEFT IN THE CHECK'S PRIVATE HOME, as a check that died between the copy and its leaving would leave it.
    writeFileSync(left, readFileSync(view.seed), { mode: 0o600 })
    const said = aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'codex', provider, home })
    for (const part of [PROVIDER, NAMES.key, NAMES.baseAddress]) expect(said).toContain(part)
    expect(view.sandbox.loginSeeds).toEqual([])
    expect(existsSync(left), "a Codex login left in the check's private home").toBe(false)
    // THE TEMPLATE IS GONE, so the sign-in below did not read it, as a check without a provider row would.
    rmSync(join(view.sandbox.templateDir, 'sandbox.json'))
    expect(aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'codex', provider, home })).toBe(said)
    expect(() => aLoginForTheModel(view.sandbox, { minutes: 5, runtime: 'codex', home })).toThrow(/template/u)
  })

  it('12: masks the provider key under its own name, in what the view answers', async () => {
    const view = aView({ says: `The command said ${THE_ENTRYS_VALUE} once.` })
    const ran = await aCodexRun(view)
    expect(ran.code, ran.why).toBe(0)
    expect(ran.out.includes(THE_ENTRYS_VALUE), 'the value is in what the view answers').toBe(false)
    expect(ran.masked).toEqual({ [NAMES.key]: 1 })
    const text = `A transcript with ${THE_ENTRYS_VALUE} and ${THE_ENTRYS_VALUE} in it.`
    const masked = maskedOfWhatTheViewIsHanded(view.sandbox, [], text, { providerKey: PROVIDER_KEY })
    expect(masked.text.includes(THE_ENTRYS_VALUE), 'the value is in the masked text').toBe(false)
    expect(masked.masked).toEqual({ [NAMES.key]: 2 })
  }, 30_000)

  it("13: the provider options tell Codex the provider row's address and key variable, and its shell leaves out both keys", () => {
    const options = theCodexProviderOptions(ADDRESS)
    expect(options.filter((_, i) => i % 2 === 0).every(word => word === '-c')).toBe(true)
    const set = Object.fromEntries(options.filter((_, i) => i % 2 === 1).map(option => {
      const at = option.indexOf('=')
      return [option.slice(0, at), JSON.parse(option.slice(at + 1))]
    }))
    const under = `model_providers.${THE_CODEX_PROVIDER_ID}`
    expect(set).toEqual({ model_provider: THE_CODEX_PROVIDER_ID, [`${under}.name`]: THE_CODEX_PROVIDER_ID, [`${under}.base_url`]: ADDRESS,
      [`${under}.env_key`]: NAMES.key, [`${under}.wire_api`]: 'responses', 'shell_environment_policy.exclude': [...WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT] })
    // CODEX 0.159.2 REFUSES TO REDEFINE THESE, its own providers' ids, as measured for this piece.
    expect(['openai', 'ollama', 'lmstudio']).not.toContain(THE_CODEX_PROVIDER_ID)
    expect(WHAT_A_CODEX_CHECKS_SHELL_LEAVES_OUT).toEqual(expect.arrayContaining(['MOLE_AGENT_KEY', NAMES.key]))
    expect(NAMES.baseAddress.endsWith('_BASE_URL'), 'the launcher reads the address from a *_BASE_URL line').toBe(true)
    for (const own of theSecretNamesOf('codex')) expect([NAMES.key, NAMES.baseAddress]).not.toContain(own)
    expect(EVERY_SECRET_A_CHECK_IS_HANDED).toContain(NAMES.key)
  })
})
