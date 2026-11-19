// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every choice, reason, database, environment file and clock here is made up for a test office. */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_MESSAGE_WORKER_ID, moleOffice } from '../src/shared/participants.ts'
import type { GatesReading, GateRow } from '../src/server/api/runtime-settings.ts'

const NAME = 'MOLE_OFFICE_CONFLICT_RESOLVING'
const FUTURE = '2099-10-21 7:00'
const END = '2099-10-21 07:00:00'
const PAST = '2026-09-30 7:00'
const AS_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const AS_WORKER = {...AS_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID}
const CLOCK_IN_A_PROGRAM = `const RealDate = Date; globalThis.Date = class extends RealDate { constructor(...args) { if (args.length === 0) super(2026, 8, 30, 7, 13, 0); else super(...args) } static now() { return new RealDate(2026, 8, 30, 7, 13, 0).getTime() } };`
let t: TestDb, app: FastifyInstance
const made: string[] = []
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await app.close(); t.close(); for (const dir of made.splice(0)) rmSync(dir, {recursive: true, force: true}) })
function save(changes: {name: string; value: string | null; until?: string}[]) { return app.inject({method: 'POST', url: '/api/office/settings', headers: AS_OWNER, payload: {changes, because: 'Made-up reason for a temporary gate choice'}}) }
async function row(): Promise<GateRow> { const reply = await app.inject({method: 'GET', url: '/api/office/gates', headers: AS_OWNER}); expect(reply.statusCode, reply.body).toBe(200); return reply.json<GatesReading>().classes.flatMap(one => one.groups.flatMap(group => group.rows)).find(one => one.id === 'conflict-resolving')! }
function kept() { return t.client.sqlite.prepare('SELECT value, until FROM runtime_settings WHERE name = ?').get(NAME) }
function changes() { return t.client.sqlite.prepare('SELECT actor_type AS type, actor_id AS id, workspace_id AS workspace, old_value AS before, new_value AS after FROM changes WHERE record_id = ? ORDER BY rowid').all(`setting:runtime:${NAME}`) as {type: string; id: string; workspace: string | null; before: string; after: string}[] }
function endTheChoice() { t.client.sqlite.prepare('UPDATE runtime_settings SET until = ? WHERE name = ?').run(PAST, NAME) }
function fixedClock() { vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date(2026, 8, 30, 7, 13, 0)) }
function program(code: string, server = false): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'gate-choice-program-'))
  made.push(dir)
  const officeFile = (path: string) => JSON.stringify(pathToFileURL(join(process.cwd(), path)).href)
  const script = `${CLOCK_IN_A_PROGRAM} ${server ? `await import(${officeFile('src/server/db/client.ts')});` : ''} const s = await import(${officeFile('src/config/settings.mjs')}); ${code}`
  return JSON.parse(execFileSync(process.execPath, [...(server ? ['--import', import.meta.resolve('tsx')] : []), '--input-type=module', '-e', script], {cwd: dir, env: {...process.env, TSX_TSCONFIG_PATH: join(process.cwd(), 'tsconfig.json'), MOLE_OFFICE_DB: t.file, [NAME]: '0'}, timeout: 60_000, encoding: 'utf8'}).trim().split('\n').at(-1)!)
}

it('stores a typed end with the choice and both change sides, and a later choice without an end clears it', async () => {
  const saved = await save([{name: NAME, value: '1', until: FUTURE}])
  expect(saved.statusCode, saved.body).toBe(200)
  expect(kept()).toEqual({value: '1', until: END})
  expect(await row()).toMatchObject({chosen: {value: '1', until: END}, ranOut: null, lastChange: {until: END, ranOut: false}})
  let history = changes()
  expect(JSON.parse(history[0]!.before)).toMatchObject({until: null})
  expect(JSON.parse(history[0]!.after)).toMatchObject({until: END})
  const replaced = await save([{name: NAME, value: '0'}])
  expect(replaced.statusCode, replaced.body).toBe(200)
  expect(kept()).toEqual({value: '0', until: null})
  history = changes()
  expect(JSON.parse(history[1]!.before)).toMatchObject({until: END})
  expect(JSON.parse(history[1]!.after)).toMatchObject({until: null})
})

it('refuses every unusable end with a coded sentence and saves none of a mixed request', async () => {
  const cases = [
    {change: {name: 'MOLE_OFFICE_AGENT_MODEL', value: 'made-up-model', until: FUTURE}, reason: 'This setting is not a gate, so its choice cannot have an end time.'},
    {change: {name: NAME, value: null, until: FUTURE}, reason: 'Removing a choice has nothing to end, so it cannot have an end time.'},
    {change: {name: NAME, value: '1', until: '2099-10-21'}, reason: 'Use a date and a time in the form YYYY-MM-DD HH:MM.'},
    {change: {name: NAME, value: '1', until: '2000-01-01 7:00'}, reason: 'That end time has already come.'},
  ]
  for (const one of cases) {
    const refused = await save([{name: 'MOLE_OFFICE_CHECKS_AN_HOUR', value: '2'}, one.change])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json()).toMatchObject({code: 'runtimeSettingsBadValue', error: `${one.reason} Nothing was changed.`})
    expect(t.client.sqlite.prepare('SELECT name FROM runtime_settings').all()).toEqual([])
    expect(changes()).toEqual([])
  }
})

it('drops an ended choice in the server and a separate plain JavaScript program, before the pass removes it', async () => {
  fixedClock()
  expect((await save([{name: NAME, value: '1', until: FUTURE}])).statusCode).toBe(200)
  endTheChoice()
  const {gatePosition} = await import('../src/config/settings.mjs')
  expect(gatePosition('conflict-resolving')).toBe('0')
  expect(program("console.log(JSON.stringify(s.gatePosition('conflict-resolving')))" )).toBe('0')
  expect(await row()).toMatchObject({value: '0', source: 'the built-in default', chosen: null, ranOut: {value: '1', until: PAST}})
  expect(kept()).toEqual({value: '1', until: PAST})
  // The one-digit hour must read as a time, even though it sorts after a padded hour as text.
  const {aRaisesEndHasCome} = await import('../src/shared/roles.ts')
  expect(aRaisesEndHasCome(PAST, '2026-09-30 07:13:00')).toBe(true)
})

it('reads a database without the end column in both the server reader and the read-only reader', async () => {
  t.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(NAME, '1')
  t.client.sqlite.exec('ALTER TABLE runtime_settings DROP COLUMN until')
  expect(program("console.log(JSON.stringify(s.gatePosition('conflict-resolving')))" )).toBe('1')
  expect(program("console.log(JSON.stringify(s.gatePosition('conflict-resolving')))", true)).toBe('1')
})

it('lets only the message worker remove ended gate choices, keeps choices still in force, and records the office returning to the default', async () => {
  fixedClock()
  expect((await save([{name: NAME, value: '1'}])).statusCode).toBe(200)
  expect((await save([{name: NAME, value: '0', until: FUTURE}, {name: 'MOLE_OFFICE_CHECKS_AN_HOUR', value: '2', until: FUTURE}, {name: 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND', value: '1'}])).statusCode).toBe(200)
  endTheChoice()
  const denied = await app.inject({method: 'POST', url: '/api/worker/gates/run-out', headers: AS_OWNER})
  expect(denied.statusCode, denied.body).toBe(403)
  const bodyRefused = await app.inject({method: 'POST', url: '/api/worker/gates/run-out', headers: AS_WORKER, payload: {gate: 'conflict-resolving'}})
  expect(bodyRefused.statusCode, bodyRefused.body).toBe(400)
  expect(kept()).toBeDefined()
  const out = await app.inject({method: 'POST', url: '/api/worker/gates/run-out', headers: AS_WORKER})
  expect(out.statusCode, out.body).toBe(200)
  expect(out.json().ranOut).toEqual([{gate: 'conflict-resolving', setting: NAME, until: PAST, backTo: {value: '0', source: 'the built-in default'}}])
  expect(kept()).toBeUndefined()
  expect(t.client.sqlite.prepare('SELECT name FROM runtime_settings').all()).toHaveLength(2)
  const history = changes()
  const latest = history.at(-1)!
  expect(latest).toMatchObject({type: 'system', id: moleOffice().id, workspace: null})
  expect(JSON.parse(latest.before)).toMatchObject({value: '0', chosen: '0', until: PAST})
  expect(JSON.parse(latest.after)).toMatchObject({value: '0', source: 'the built-in default', chosen: null, until: null, ranOut: true})
  expect(await row()).toMatchObject({value: '0', chosen: null, ranOut: null, lastChange: {ranOut: true, until: PAST, from: '0', to: '0'}})
  const count = history.length
  expect((await app.inject({method: 'POST', url: '/api/worker/gates/run-out', headers: AS_WORKER})).json().ranOut).toEqual([])
  expect(changes()).toHaveLength(count)
})

it('returns to the test office’s own .env value and records that source when a choice runs out', async () => {
  expect((await save([{name: NAME, value: '0', until: FUTURE}])).statusCode).toBe(200)
  endTheChoice()
  const dir = mkdtempSync(join(tmpdir(), 'gate-choice-env-')); made.push(dir)
  for (const path of ['src', 'tools', 'for-agents', 'package.json', 'tsconfig.json']) cpSync(path, join(dir, path), {recursive: true})
  symlinkSync(join(process.cwd(), 'node_modules'), join(dir, 'node_modules'))
  execFileSync('git', ['init', '--quiet', dir])
  writeFileSync(join(dir, '.env'), `# Made-up settings for this test office\n${NAME}=1\n`)
  const env: NodeJS.ProcessEnv = {...process.env, MOLE_OFFICE_DB: t.file}
  delete env[NAME]
  const code = `const {buildApp} = await import('./src/server/index.ts'); const {sqlite} = await import('./src/server/db/client.ts'); const {app} = await buildApp({production: false, webDir: 'dist/web', webAppUrl: 'http://127.0.0.1:43210', logLevel: false}); try { await app.ready(); const reply = await app.inject({method:'POST', url:'/api/worker/gates/run-out', headers:${JSON.stringify(AS_WORKER)}}); console.log(JSON.stringify({status: reply.statusCode, body: reply.json(), last: sqlite.prepare('SELECT new_value FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1').get(${JSON.stringify(`setting:runtime:${NAME}`)})})); } finally { await app.close(); sqlite.close(); }`
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {cwd: dir, env, timeout: 60_000, encoding: 'utf8'})
  const result = JSON.parse(output.trim().split('\n').at(-1)!)
  expect(result.status, output).toBe(200)
  expect(result.body.ranOut).toEqual([{gate: 'conflict-resolving', setting: NAME, until: PAST, backTo: {value: '1', source: '.env'}}])
  expect(JSON.parse(result.last.new_value)).toMatchObject({value: '1', source: '.env', ranOut: true})
}, 90_000)
