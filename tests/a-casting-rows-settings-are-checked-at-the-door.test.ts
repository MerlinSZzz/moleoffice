// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASTING ROW'S OWN PROGRAM SETTINGS AT THE DOOR (wave 13n round CS). A row's native data may carry `settings`, a list of
 * {name, value}, which the launcher passes to the row's program. src/config/the-launchers-own-settings.mjs says what may be
 * stored and which names the launcher sets itself, and the door asks it on every write that sets settings and
 * on every program change of a row that has some.
 *
 * What this file proves:
 *
 *   1. The shape: a list is stored as written and read back; an empty list is stored as no key; two settings with the same
 *      parts, a null value, a value holding a null, an over-long name and an over-long value are refused, and nothing is
 *      written.
 *   2. Each rule of the list, with a refused and a passing name: (a) equal to a listed name, under one, or holding one;
 *      (b) a Codex name whose last part is sandbox_mode or approval_policy, under any prefix, and in a table's value too;
 *      (c) parts compared unquoted and exactly; (d) an environment name the launcher keeps, ignoring case, and `env` whole.
 *   3. A Codex name with a part Codex's -c cannot name is refused: a part holding a dot or an equals sign, a first part
 *      that begins with a space and a last part that ends with one. A space inside, and the same name for another
 *      program, are taken.
 *   4. A program change of a row with settings is checked against the new program's list, and a row with no program or
 *      with kimi holds none.
 *   5. The selection carries native.settings only when the row has some, and a settings change mints a new selection
 *      revision and clears the row's hold.
 *   6. The identity reader reads a stored image with settings: each name is read, and each value blocks as an open bag.
 *   7. The row form's Save sends the row's stored settings with the three boxes, so a native change keeps them.
 *
 * Every test runs against a throwaway database through the real routes. No model is called.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { CastingReading, CastingRow, CastingWritten } from '../src/shared/casting.ts'
import { theRowsNativeToSave } from '../src/web/components/CastingNativeFields.tsx'
import { readStoredColumn } from '../src/server/lib/registry-aliases/historical-reader.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })

let t: TestDb
let app: FastifyInstance

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: PERSON, ...(payload === undefined ? {} : { payload: payload as never }) })
}

/** Both tables, whole, to prove a refused write changed nothing. */
function stored(): string {
  return JSON.stringify([
    t.client.sqlite.prepare('SELECT * FROM casting_rows ORDER BY id').all(),
    t.client.sqlite.prepare('SELECT * FROM casting_row_changes ORDER BY id').all(),
  ])
}

type Setting = { name: string; value: unknown }
const native = (settings?: Setting[]) => ({ model: `test-native-${randomUUID()}`, provider: null, variant: null, ...(settings === undefined ? {} : { settings }) })

/** A new row for a program, with these settings, added through the door. */
async function add(program: string | null, settings?: Setting[]): Promise<CastingRow> {
  const reply = await call('POST', '/api/casting/worker', { ...(program === null ? {} : { program: { value: program } }), model: { value: `test-office-${randomUUID()}` }, native: native(settings) })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as CastingWritten).casting
}

/** A write the door refuses with 400, its code and words, and nothing written. */
async function refused(method: 'POST' | 'PATCH', url: string, payload: unknown, code: string | null, words: string) {
  const before = stored()
  const reply = await call(method, url, payload)
  expect(reply.statusCode, reply.body).toBe(400)
  if (code !== null) expect(reply.json().code).toBe(code)
  expect(reply.json().error).toContain(words)
  expect(stored()).toBe(before)
}

/** A new row for a program whose one setting the door refuses, in the guarded words. */
async function aNewRowIsRefused(program: string, setting: Setting, guards: string) {
  await refused('POST', '/api/casting/worker', { program: { value: program }, native: native([setting]) }, 'castingNewRowSetsAGuardedName',
    `This new Casting row sets ${setting.name} for ${program}, which the launcher sets itself (${guards}). A row may not set it. Nothing was changed.`)
}

/** A row of a program that the door takes with this one setting, stored as written. */
async function aRowTakes(program: string, setting: Setting) {
  const row = await add(program, [setting])
  expect(row.native?.settings).toEqual([setting])
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const secretary = await call('POST', '/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
  expect(secretary.statusCode, secretary.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: 'test-settings-worker', name: 'Test settings worker', role: 'worker', runtime: 'claude-code', workArea: ['src'] } })
  expect(worker.statusCode, worker.body).toBe(201)
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the shape of a row\'s settings', () => {
  it('stores a list as written, every JSON type, and reads it back from the table and the history', async () => {
    // Claude Code, since Codex's -c cannot name a part that holds a dot.
    const settings = [
      { name: 'test_string', value: 'test "quoted" value' },
      { name: 'test_section."test.dotted"', value: 3.5 },
      { name: "test_section.'test single'", value: false },
      { name: 'test_list', value: [1, 'two', { three: true }] },
      { name: 'test_table', value: { inner: { deep: 'x' } } },
    ]
    const row = await add('claude-code', settings)
    expect(row.native).toMatchObject({ settings })
    const history = await call('GET', `/api/casting/worker/history?casting=${String(row.id)}`)
    expect(history.statusCode, history.body).toBe(200)
    expect(history.json().changes[0].after.native.settings).toEqual(settings)
  })

  it('is read by the identity reader, which reads each name and blocks each value as an open bag', async () => {
    const row = await add('codex', [{ name: 'test_a', value: 'x' }, { name: 'test_b', value: { inner: [1] } }])
    const image = t.client.sqlite.prepare('SELECT "after" FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1').get(row.id) as { after: string }
    const read = readStoredColumn(t.client.sqlite, 'casting_row_changes.after', JSON.parse(image.after))
    expect(read.blocks.map(one => [one.path, one.reason])).toEqual([['after.native.settings[0].value', 'open-bag'], ['after.native.settings[1].value', 'open-bag']])
  })

  it('stores an empty list as no key, on a new row and on a change', async () => {
    const row = await add('codex', [])
    expect(row.native).toBeDefined()
    expect(Object.hasOwn(row.native!, 'settings')).toBe(false)
    const withOne = await add('codex', [{ name: 'test_option', value: 1 }])
    const changed = await call('PATCH', `/api/casting/rows/${String(withOne.id)}`, { native: { model: withOne.native!.model, provider: null, variant: null, settings: [] } })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(Object.hasOwn(changed.json().casting.native, 'settings')).toBe(false)
    const image = t.client.sqlite.prepare('SELECT "after" FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1').get(withOne.id) as { after: string }
    expect(Object.hasOwn(JSON.parse(image.after).native, 'settings')).toBe(false)
  })

  it('refuses two settings with the same parts, or one under another, and writes nothing', async () => {
    const url = '/api/casting/worker'
    await refused('POST', url, { program: { value: 'codex' }, native: native([{ name: 'test_a.test_b', value: 1 }, { name: "'test_a'.\"test_b\"", value: 2 }]) }, null,
      `Settings test_a.test_b and 'test_a'."test_b" name the same setting.`)
    await refused('POST', url, { program: { value: 'codex' }, native: native([{ name: 'test_a', value: { x: 1 } }, { name: 'test_a.test_b', value: 2 }]) }, null,
      'Setting test_a.test_b lies under setting test_a, so one would undo the other.')
  })

  it('refuses a null value, a value holding a null, an over-long name and an over-long value, and writes nothing', async () => {
    const url = '/api/casting/worker'
    await refused('POST', url, { program: { value: 'codex' }, native: native([{ name: 'test_null', value: null }]) }, null, 'Setting test_null has no value a program can take')
    await refused('POST', url, { program: { value: 'codex' }, native: native([{ name: 'test_inner', value: { x: [1, null] } }]) }, null, 'Setting test_inner has no value a program can take')
    await refused('POST', url, { program: { value: 'codex' }, native: native([{ name: 'x'.repeat(4097), value: 1 }]) }, null, 'Setting 1 has no name a row may store')
    await refused('POST', url, { program: { value: 'codex' }, native: native([{ name: 'test_long', value: 'x'.repeat(4095) }]) }, null, 'Setting test_long has a value longer than 4096 characters as JSON text.')
    // The longest value that is stored: its JSON text is 4096 characters.
    await aRowTakes('codex', { name: 'test_long', value: 'x'.repeat(4094) })
  })
})

describe('the names the launcher sets itself', () => {
  const MODEL = "the row's own native model, which the row's model fields set"
  const OFFICE_TOOL = "the office's own tool, office_request"

  it('(a) refuses a name equal to a listed name, under one, or holding one, and takes a name beside them', async () => {
    await aNewRowIsRefused('codex', { name: 'model', value: 'test-model' }, MODEL)
    await aNewRowIsRefused('codex', { name: 'mcp_servers.mole_office.command', value: 'test-command' }, OFFICE_TOOL)
    await aNewRowIsRefused('codex', { name: 'mcp_servers', value: { test_server: { command: 'x' } } }, OFFICE_TOOL)
    await aRowTakes('codex', { name: 'model_verbosity', value: 'low' })
    await aRowTakes('codex', { name: 'mcp_servers.test_server.command', value: 'test-command' })
  })

  it('(b) refuses a Codex name whose last part is sandbox_mode or approval_policy, under any prefix and inside a table', async () => {
    await aNewRowIsRefused('codex', { name: 'test_section.approval_policy', value: 'never' }, "the run's approval policy")
    await aNewRowIsRefused('codex', { name: 'profiles.test', value: { sandbox_mode: 'read-only' } }, "the run's sandbox")
    await aRowTakes('codex', { name: 'test_section.approval_policy_words', value: 'x' })
    await aRowTakes('codex', { name: 'profiles.test', value: { test_note: 'x' } })
  })

  it('(c) unquotes each part before comparing, and compares exactly', async () => {
    await aNewRowIsRefused('codex', { name: '"model"', value: 'test-model' }, MODEL)
    await aRowTakes('opencode', { name: '"mcp.mole_office"', value: 'x' })
    await aRowTakes('codex', { name: 'Model', value: 'x' })
  })

  it('(d) refuses an environment name the launcher keeps, ignoring case, and env whole', async () => {
    for (const [name, guards] of [
      ['env.TEST_API_KEY', "the run's keys and logins"],
      ['env.test_token', "the run's keys and logins"],
      ['env.MOLE_TEST', "the office's own variables for the run"],
      ['env.OPENCODE_TEST', "OpenCode's own variables, which the launcher sets"],
      ['env.DSH_TEST', "dsh's own variables, which the launcher sets"],
      ['env.TEST_BASE_URL', 'where the program sends its model requests'],
      ['env.home', "the run's own home, where its program keeps its configuration and login"],
      ['env', "the run's environment, which holds its key and its identity"],
    ] as const) await aNewRowIsRefused('claude-code', { name, value: 'x' }, guards)
    await aRowTakes('claude-code', { name: 'env.TEST_KEYBOARD_LAYOUT', value: 'x' })
  })

  it('refuses the OpenCode output cap a row names, which the launcher sets', async () => {
    await aNewRowIsRefused('opencode', { name: 'env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX', value: '1' }, 'the output cap the launcher gives every OpenCode run')
  })
})

describe('a Codex name with a part its -c cannot name', () => {
  const SPLITS = 'Codex splits a -c name at every dot and at its first equals sign, and trims the spaces at its two ends.'
  const words = (row: string, name: string, part: string) => `${row} sets ${name} for codex, and Codex's -c cannot name its part "${part}". ${SPLITS} Nothing was changed.`

  it('refuses a part with a dot or an equals sign, a first part that begins with a space and a last part that ends with one', async () => {
    for (const [name, part] of [
      ['test_table."test.part"', 'test.part'],
      ['test_table."test=part"', 'test=part'],
      // Codex trims the name's two ends, so this would reach mcp_servers.mole_office, which the guarded names keep.
      ['" mcp_servers".mole_office.command', ' mcp_servers'],
      ['test_table."test_part "', 'test_part '],
    ] as const) {
      await refused('POST', '/api/casting/worker', { program: { value: 'codex' }, native: native([{ name, value: 'x' }]) }, 'castingNewRowSetsAPartCodexCannotName',
        words('This new Casting row', name, part))
    }
  })

  it('refuses one on a change and on a move to codex, and takes a space inside and the same name for another program', async () => {
    const codex = await add('codex', [{ name: 'test_option', value: 1 }])
    await refused('PATCH', `/api/casting/rows/${String(codex.id)}`, { native: { ...native([{ name: 'test_table."test.part"', value: 1 }]), model: codex.native!.model } },
      'castingRowSetsAPartCodexCannotName', words(`Casting row ${String(codex.id)}`, 'test_table."test.part"', 'test.part'))
    const claude = await add('claude-code', [{ name: 'test_table."test.part"', value: 1 }])
    await refused('PATCH', `/api/casting/rows/${String(claude.id)}`, { program: { value: 'codex' } },
      'castingRowSetsAPartCodexCannotName', words(`Casting row ${String(claude.id)}`, 'test_table."test.part"', 'test.part'))
    await aRowTakes('codex', { name: 'test_table." test inner ".test_key', value: 'x' })
  })
})

describe('a program change of a row with settings', () => {
  it('checks the settings against the new program\'s list, and a row with no program or with kimi holds none', async () => {
    const row = await add('codex', [{ name: 'permission', value: 'test-value' }])
    const url = `/api/casting/rows/${String(row.id)}`
    await refused('PATCH', url, { program: { value: 'opencode' } }, 'castingRowSetsAGuardedName',
      `Casting row ${String(row.id)} sets permission for opencode, which the launcher sets itself (the run's permissions). A row may not set it. Nothing was changed.`)
    await refused('PATCH', url, { program: { value: null } }, 'castingRowSettingsWithNoProgram', `Casting row ${String(row.id)} has no program, so it cannot hold settings`)
    await refused('PATCH', url, { program: { value: 'kimi' } }, 'castingRowSettingsNotForProgram', `Casting row ${String(row.id)} runs kimi, which takes no settings from a Casting row.`)
    const moved = await call('PATCH', url, { program: { value: 'claude-code' } })
    expect(moved.statusCode, moved.body).toBe(200)
    expect(moved.json().casting.cells.program.value).toBe('claude-code')
    await refused('POST', '/api/casting/worker', { model: { value: 'test-office-model' }, native: native([{ name: 'test_option', value: 1 }]) }, 'castingNewRowSettingsWithNoProgram', 'This new Casting row has no program')
  })
})

describe('the selection a row gives the launcher', () => {
  async function theSelection(row: CastingRow) {
    const read = await call('GET', `/api/casting/rows/${String(row.id)}/selection`)
    expect(read.statusCode, read.body).toBe(200)
    return read.json().selection
  }

  it('carries native.settings only when the row has some', async () => {
    const none = await theSelection(await add('codex'))
    expect(Object.hasOwn(none.native, 'settings')).toBe(false)
    const settings = [{ name: 'test_option', value: { inner: [1, 'x'] } }]
    const some = await theSelection(await add('codex', settings))
    expect(some.native.settings).toEqual(settings)
    expect(Object.keys(some.native)).toEqual(['model', 'provider', 'variant', 'effort', 'settings'])
  })

  it('a settings change mints a new selection revision and clears the row\'s hold', async () => {
    const row = await add('codex', [{ name: 'test_option', value: 1 }])
    const selection = await theSelection(row)
    const run = await call('POST', '/api/records', { kind: 'session', title: 'Synthetic run with a row\'s settings', data: {
      runtime: selection.runtime, model: selection.model, servingAgent: 'test-settings-worker', state: 'running', extra: { launcherSelection: selection } } })
    expect(run.statusCode, run.body).toBe(201)
    const refusal = { kind: 'option', code: 'invalid_option', said: 'Synthetic native program refused the selected option.' }
    const held = await call('POST', `/api/casting/rows/${String(row.id)}/hold`, { revision: selection.casting.revision, run: run.json().record.id, refusal })
    expect(held.statusCode, held.body).toBe(200)
    expect(held.json()).toMatchObject({ held: true, first: true })
    const changed = await call('PATCH', `/api/casting/rows/${String(row.id)}`, { native: { model: row.native!.model, provider: null, variant: null, settings: [{ name: 'test_option', value: 2 }] } })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(changed.json().casting.hold).toBeNull()
    expect(changed.json().casting.selectionRevision).not.toBe(selection.casting.revision)
    const after = await theSelection(row)
    expect(after.native.settings).toEqual([{ name: 'test_option', value: 2 }])
    expect(after.casting.revision).toBe(changed.json().casting.selectionRevision)
  })
})

describe('the row form\'s Save', () => {
  it('sends the row\'s stored settings with the three boxes, so a native change keeps them', async () => {
    const settings = [{ name: 'test_option', value: { inner: [1, 'x'] } }]
    const row = await add('codex', settings)
    // The row as the page reads it.
    const read = await call('GET', '/api/casting')
    expect(read.statusCode, read.body).toBe(200)
    const shown = (read.json() as CastingReading).roles.flatMap(card => card.scopes.flatMap(scope => scope.castings)).find(one => one.id === row.id)!
    expect(shown.native?.settings).toEqual(settings)
    const model = `test-native-${randomUUID()}`
    const changed = await call('PATCH', `/api/casting/rows/${String(row.id)}`, { native: theRowsNativeToSave({ model, provider: null, variant: null }, shown) })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(changed.json().casting.native).toEqual({ model, provider: null, variant: null, settings })
    // A row with none sends none, and the add form has none to keep.
    const none = await add('codex')
    expect(theRowsNativeToSave({ model, provider: null, variant: null }, none)).toEqual({ model, provider: null, variant: null })
  })
})
