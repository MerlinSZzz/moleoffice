// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASTING ROW NAMES A PROVIDER-TABLE ROW, AND A DSH CHECK TAKES ITS ONE KEY FROM IT.
 *
 * WHAT IS REAL: the office's own doors on a fresh test database, and a key file of the test's own beside that database,
 * written before the office starts. Its provider entry is set only when a case sets it, with a value this file makes at
 * random. No real key file is read, and no provider is called: every address below is only stored. The inspector is a
 * made-up agent registered by the person, holding the key the office answered.
 *
 *   1. The Casting door stores a dsh row for the inspector that names a provider row whose key entry is not set, and the
 *      row and its selection read the provider row back. CastingNative.provider keeps the program's own route. A row
 *      that also has its own settings, which is read by another path, reads its provider row back too.
 *   2. The door refuses, each with its code and values, and writes nothing: a provider no row has, a provider not for
 *      the row's program, an OpenCode row, a row with no program, a dsh row for another role than the inspector's, a
 *      malformed id, and a change of a stored row's program to one the provider is not for. A Codex row is
 *      tests/a-codex-check-takes-its-one-key-from-a-provider-row.test.ts's.
 *   3. The run-models door, asked for a check, refuses with dshProviderKeyNotSet, naming the row, the provider and the
 *      entry. Once the key file sets the entry, it answers the provider's fields with its key `set`. No reply holds the
 *      value.
 *   4. While the provider router is on, the same door refuses with dshProviderWhileTheRouterIsOn.
 *   5. The selection's revision changes with the provider's base address, its programs or its key name, and not with
 *      its name. A selection read before such a change is refused. The provider is not removed while the row names it,
 *      and is removed once the row names it no more.
 *   6. A provider changed to leave dsh out is refused at the start with dshProviderNotForDsh, and one that is gone with
 *      dshProviderGone.
 *   7. The launcher's guarded list for dsh names each variable a check whose row names a provider is handed, and the
 *      Casting door refuses a row's setting of either.
 *   8. The launcher refuses a selection that names a provider row for OpenCode and Claude Code, and for a dsh start
 *      that is not a check, and takes it for a dsh check. readLauncherSelection keeps the provider row.
 *   9. The door's refusal of an OpenCode row and of a Claude Code row, and the launcher's refusal of either program's
 *      selection, say that a dsh check and a Codex check take a key from a provider, and name no next program.
 *
 * MUTATIONS, NAMED, EACH ALONE AFTER A GREEN CONTROL:
 *   a. In src/server/lib/run-models.ts, the key-not-set refusal taken out of refuseAProviderTheCheckCannotTake: case 3
 *      goes red.
 *   b. In the same function, the router's refusal taken out: case 4 goes red.
 *   c. In src/server/lib/casting.ts, theSelectionRevisionOf answering the stored revision alone: case 5 goes red.
 *   d. In src/server/lib/the-provider-table.ts, removeAProvider's check of the rows that name it taken out: case 5 goes
 *      red.
 *   e. In src/server/lib/casting.ts, the check of the provider's programs taken out of refuseAProviderTheRowCannotName:
 *      case 2 goes red.
 *   f. In the same function, the check of the role taken out: case 2 goes red.
 *   g. In src/config/launcher-selection.mjs, whyAStartCannotTakeTheProviderRow answering null for OpenCode: case 8
 *      goes red.
 *   h. In src/config/the-launchers-own-settings.mjs, the DEEPSEEK_BASE_URL entry taken out of the dsh list: case 7 goes
 *      red.
 *   i. In src/shared/casting.ts, readCastingNative dropping providerRow: case 1 goes red.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { applyLauncherSelection, readLauncherSelection, whyAStartCannotTakeTheProviderRow } from '../src/config/launcher-selection.mjs'
import { THE_ROUTER_SETTING } from '../src/config/provider-router.mjs'
import { THE_LAUNCHERS_OWN_SETTINGS } from '../src/config/the-launchers-own-settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_INSPECTOR, THE_WORKER } from '../src/shared/roles.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { theDshProviderVariables } from '../tools/inspector-sandbox.mjs'

/** Made-up values. Nothing here is, or was ever, a key any office issued or any provider takes. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const THE_ENTRYS_VALUE = `made-up-provider-value-${randomBytes(24).toString('hex')}`
/** The key file's entry the provider names. It is not set until case 3 sets it. */
const THE_ENTRY = 'test-deepseek-entry'
/** The provider row, for dsh, at an address only stored. */
const PROVIDER = 'test-deepseek'
/** The native provider dsh is started on: the one a dsh check maps a key and a base address for. */
const NATIVE = 'deepseek-official'

const WORKSPACE = 'default'
const THE_PERSON_ASKS = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const INSPECTOR = 'provider-row-inspector'
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

/** A row's body for `program`, naming provider row `providerRow`. */
function aRowBody(program: string | null, providerRow: unknown, more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...(program === null ? {} : { program: { value: program } }),
    model: { value: `office-${randomUUID()}` },
    effort: { value: 'high' },
    native: { model: `native-${randomUUID()}`, provider: program === 'dsh' ? NATIVE : null, variant: null, providerRow, ...more },
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
  const made = await ask('POST', '/api/agents/started', THE_PERSON_ASKS, { handle: INSPECTOR, name: 'Provider Row Inspector', role: THE_INSPECTOR, runtime: 'dsh', workArea: ['src'] })
  expect(made.status, made.text.slice(0, 600)).toBe(201)
  keys.set(INSPECTOR, String(made.body['whatToGiveIt']?.key ?? ''))
  await aProvider(PROVIDER, ['dsh', 'codex'])
}, 60_000)

afterAll(async () => {
  delete process.env[THE_ROUTER_SETTING]
  await app?.close()
  t?.close()
})

describe('a Casting row names a provider row', () => {
  it('1: the door stores a dsh row for the inspector naming a provider whose key is not set, and reads it back', async () => {
    const body = aRowBody('dsh', PROVIDER)
    const written = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, body)
    expect(written.status, written.text.slice(0, 600)).toBe(201)
    row = Number(written.body['casting']?.id)
    expect(written.body['casting']?.native).toMatchObject({ provider: NATIVE, providerRow: PROVIDER })
    const selection = await theSelection()
    // THE PROGRAM'S OWN ROUTE AND THE PROVIDER ROW ARE TWO FIELDS, each as it was written.
    expect(selection.native).toMatchObject({ provider: NATIVE, providerRow: PROVIDER })
    const provider = await ask('GET', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS)
    expect(provider.body['key']).toBe('not set')
    // A ROW WITH ITS OWN SETTINGS IS READ BY ANOTHER PATH, and keeps its provider row there too. It is removed after, so
    // the other cases see one row naming the provider.
    const setting = { name: 'bash-sandbox.timeoutMs', value: 600000 }
    const withSettings = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, { ...aRowBody('dsh', PROVIDER, { settings: [setting] }), project: WORKSPACE })
    expect(withSettings.status, withSettings.text.slice(0, 600)).toBe(201)
    const settingsRow = Number(withSettings.body['casting']?.id)
    try {
      const read = await ask('GET', `/api/casting/rows/${String(settingsRow)}/selection`, THE_PERSON_ASKS)
      expect(read.status, read.text.slice(0, 600)).toBe(200)
      expect(read.body['selection']?.native, 'the selection of a row with settings').toMatchObject({ provider: NATIVE, providerRow: PROVIDER, settings: [setting] })
    } finally {
      expect((await ask('DELETE', `/api/casting/rows/${String(settingsRow)}`, THE_PERSON_ASKS)).status).toBe(200)
    }
  })

  it('2: the door refuses a provider the row cannot take, with its code and values, and writes nothing', async () => {
    await aProvider('test-opencode-only', ['opencode'])
    const before = stored()
    expectRefused(await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody('dsh', 'no-such-provider')), 400, 'castingProviderRowNotFound', { provider: 'no-such-provider' })
    expectRefused(await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody('dsh', 'test-opencode-only')), 400, 'castingProviderRowNotForTheProgram',
      { provider: 'test-opencode-only', program: 'dsh', programs: 'opencode' })
    expectRefused(await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody('opencode', 'test-opencode-only')), 400, 'castingProviderRowNotYet', { provider: 'test-opencode-only', program: 'opencode' })
    expectRefused(await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody(null, PROVIDER)), 400, 'castingProviderRowNoProgram', { provider: PROVIDER })
    expectRefused(await ask('POST', `/api/casting/${THE_WORKER}`, THE_PERSON_ASKS, aRowBody('dsh', PROVIDER)), 400, 'castingProviderRowOnlyForTheInspector', { provider: PROVIDER, role: THE_WORKER })
    const malformed = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody('dsh', 'Not_An_Id'))
    expect(malformed.status, malformed.text.slice(0, 600)).toBe(400)
    // A STORED ROW'S PROGRAM CHANGED TO ONE THAT CANNOT TAKE THE PROVIDER is refused as an add is.
    expectRefused(await ask('PATCH', `/api/casting/rows/${String(row)}`, THE_PERSON_ASKS, { program: { value: 'opencode' } }), 400, 'castingProviderRowNotForTheProgram',
      { provider: PROVIDER, program: 'opencode', programs: 'dsh, codex' })
    expect(stored()).toBe(before)
  })

  it('3: a check is refused while the entry is not set, naming it, and told the provider once it is set, never its value', async () => {
    const provider = (await ask('GET', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS)).body
    const refused = await theCheckAsks()
    expectRefused(refused, 409, 'dshProviderKeyNotSet', { row: String(row), provider: PROVIDER, entry: THE_ENTRY })
    theKeyFileHolds({ [THE_ENTRY]: THE_ENTRYS_VALUE })
    const answered = await theCheckAsks()
    expect(answered.status, answered.text.slice(0, 600)).toBe(200)
    expect(answered.body['provider']).toEqual({ row, found: true, id: PROVIDER, programs: provider['programs'], baseAddress: provider['baseAddress'], keyName: THE_ENTRY, key: 'set' })
    expect(answered.body['selection']?.native?.providerRow).toBe(PROVIDER)
    for (const said of [refused, answered]) expect(said.text.includes(THE_ENTRYS_VALUE), 'a run-models reply holds the value').toBe(false)
    expect(everyStoredRow().includes(THE_ENTRYS_VALUE), 'a stored row holds the value').toBe(false)
  })

  it('4: a check is refused while the provider router is on', async () => {
    process.env[THE_ROUTER_SETTING] = 'on'
    try {
      expectRefused(await theCheckAsks(), 409, 'dshProviderWhileTheRouterIsOn', { row: String(row), provider: PROVIDER })
    } finally {
      delete process.env[THE_ROUTER_SETTING]
    }
    expect((await theCheckAsks()).status).toBe(200)
  })

  it('5: the revision covers the provider, an old selection is refused, and the provider is not removed while a row names it', async () => {
    const changes: [string, Record<string, unknown>, boolean][] = [
      ['its name', { name: 'Another name for the test provider' }, false],
      ['its base address', { baseAddress: `https://${PROVIDER}.example/v2` }, true],
      ['its programs', { programs: ['dsh', 'codex', 'opencode'] }, true],
      ['its key name', { keyName: `${THE_ENTRY}-2` }, true],
    ]
    for (const [what, change, moves] of changes) {
      const before = await theSelection()
      const changed = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, ...change })
      expect(changed.status, changed.text.slice(0, 600)).toBe(200)
      const after = await theSelection()
      if (!moves) {
        expect(after.revision, `a change of ${what} moved the revision`).toBe(before.revision)
        continue
      }
      expect(after.revision, `a change of ${what} left the revision`).not.toBe(before.revision)
      const old = await ask('GET', `/api/casting/rows/${String(row)}/selection?revision=${encodeURIComponent(before.revision)}`, THE_PERSON_ASKS)
      expect(old.status, `the selection read before a change of ${what}`).toBe(409)
    }
    const back = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, keyName: THE_ENTRY })
    expect(back.status, back.text.slice(0, 600)).toBe(200)

    const before = stored()
    expectRefused(await ask('DELETE', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS), 409, 'providerNamedByACastingRow', { id: PROVIDER, rows: String(row) })
    expect(stored()).toBe(before)
    // A ROW THAT NAMES ANOTHER PROVIDER, OR NONE, DOES NOT KEEP IT.
    await aProvider('test-for-removal', ['dsh'])
    const other = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, { ...aRowBody('dsh', 'test-for-removal'), project: WORKSPACE })
    expect(other.status, other.text.slice(0, 600)).toBe(201)
    const otherRow = Number(other.body['casting']?.id)
    expectRefused(await ask('DELETE', '/api/casting/providers/test-for-removal', THE_PERSON_ASKS), 409, 'providerNamedByACastingRow', { id: 'test-for-removal', rows: String(otherRow) })
    expect((await ask('DELETE', `/api/casting/rows/${String(otherRow)}`, THE_PERSON_ASKS)).status).toBe(200)
    const removed = await ask('DELETE', '/api/casting/providers/test-for-removal', THE_PERSON_ASKS)
    expect(removed.status, removed.text.slice(0, 600)).toBe(200)
  })

  it('6: a provider that leaves dsh out, or is gone, is refused at the start', async () => {
    const left = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, programs: ['codex'] })
    expect(left.status, left.text.slice(0, 600)).toBe(200)
    expectRefused(await theCheckAsks(), 409, 'dshProviderNotForDsh', { row: String(row), provider: PROVIDER, programs: 'codex' })
    const back = await ask('PATCH', `/api/casting/providers/${PROVIDER}`, THE_PERSON_ASKS, { id: PROVIDER, programs: ['dsh', 'codex'] })
    expect(back.status, back.text.slice(0, 600)).toBe(200)
    // GONE BEHIND THE DOOR'S BACK, as only a hand in the database could make it, since the door refuses it.
    const held = t.client.sqlite.prepare('SELECT * FROM providers WHERE id = ?').get(PROVIDER) as Record<string, unknown>
    t.client.sqlite.prepare('DELETE FROM providers WHERE id = ?').run(PROVIDER)
    try {
      expectRefused(await theCheckAsks(), 409, 'dshProviderGone', { row: String(row), provider: PROVIDER })
    } finally {
      const names = Object.keys(held)
      t.client.sqlite.prepare(`INSERT INTO providers (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...names.map((name) => held[name]))
    }
    expect((await theCheckAsks()).status).toBe(200)
  })

  it("7: the launcher's guarded list names what a provider row's check is handed, and a row may set neither", async () => {
    const handed = theDshProviderVariables(NATIVE)
    for (const name of [handed.key, handed.baseAddress]) {
      expect(THE_LAUNCHERS_OWN_SETTINGS.dsh.some((one) => 'environment' in one && one.environment === name), `${name} is not in the dsh list`).toBe(true)
      const refused = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, { ...aRowBody('dsh', PROVIDER, { settings: [{ name: `env.${name}`, value: 'https://elsewhere.example/v1' }] }), project: WORKSPACE })
      expect(refused.status, `a row setting env.${name}: ${refused.text.slice(0, 600)}`).toBe(400)
    }
  })

  it('8: the launcher takes a provider row for a dsh check alone, and keeps it as read', () => {
    const selectionFor = (runtime: string) => readLauncherSelection({ runtime, model: `office-${runtime}`, native: { model: `native-${runtime}`, provider: runtime === 'dsh' ? NATIVE : null, variant: null, effort: null, providerRow: PROVIDER }, casting: { id: 1, revision: 'a-made-up-revision' } })
    expect(selectionFor('dsh').native.providerRow).toBe(PROVIDER)
    for (const runtime of ['opencode', 'claude-code']) {
      const selection = selectionFor(runtime)
      const why = whyAStartCannotTakeTheProviderRow(selection, true)
      expect(why, `${runtime} takes a provider row`).not.toBeNull()
      expect(() => applyLauncherSelection([], { runtime, model: selection.model, selection, aCheckCarriesTheProvider: true }), runtime).toThrow(why!)
    }
    const dsh = selectionFor('dsh')
    const notACheck = whyAStartCannotTakeTheProviderRow(dsh, false)
    expect(notACheck, 'a dsh start that is not a check takes a provider row').not.toBeNull()
    expect(() => applyLauncherSelection([], { runtime: 'dsh', model: dsh.model, selection: dsh })).toThrow(notACheck!)
    expect(whyAStartCannotTakeTheProviderRow(dsh, true)).toBeNull()
    const taken = applyLauncherSelection([], { runtime: 'dsh', model: dsh.model, selection: dsh, aCheckCarriesTheProvider: true })
    expect(taken.start.words).toContain(`provider row ${PROVIDER}`)
  })

  it('9: OpenCode and Claude Code are refused in words that say dsh and Codex take a key from a provider, and name no next program', async () => {
    await aProvider('test-every-other-program', ['opencode', 'claude-code'])
    const before = stored()
    for (const program of ['opencode', 'claude-code']) {
      const door = await ask('POST', `/api/casting/${THE_INSPECTOR}`, THE_PERSON_ASKS, aRowBody(program, 'test-every-other-program'))
      expectRefused(door, 400, 'castingProviderRowNotYet', { provider: 'test-every-other-program', program })
      const selection = readLauncherSelection({ runtime: program, model: `office-${program}`, native: { model: `native-${program}`, provider: null, variant: null, effort: null, providerRow: PROVIDER }, casting: { id: 1, revision: 'a-made-up-revision' } })
      const launcher = whyAStartCannotTakeTheProviderRow(selection, true)
      for (const [who, said] of [['the door', String(door.body['error'])], ['the launcher', String(launcher)]]) {
        expect(said, `${program}: ${who} names dsh`).toContain('dsh')
        expect(said, `${program}: ${who} names Codex`).toContain('Codex')
        expect(said, `${program}: ${who} names a next program`).not.toMatch(/\bnext\b/u)
      }
    }
    expect(stored()).toBe(before)
  })
})
