// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The two guards of the merge tool's integrate step that refused an entry since 9 October (wave 13r round L).
const INTEGRATION_GUARDS = ['owner-content-in-what-ships', 'integrated-tree-builds']
// Five checks the office's own server makes, from round H's table, which offer no reminder (wave 13r round N).
const THE_OFFICES_OWN_CHECKS = ['giving-back-a-held-seat', 'writes-that-empty-fields', 'writes-from-a-stale-copy', 'writes-over-unseen-checklist-lines', 'worker-cuts-the-sandbox-cannot-use']
// Six guards of the merge queue's own steps, which allow only block (wave 13r round Z).
const THE_QUEUES_OWN_GUARDS = ['the-seal-matches-the-entry', 'pinned-content-is-the-submission', 'files-entry-bytes-are-sealed', 'files-entry-matches-its-files-seal', 'landing-only-on-the-tested-main', 'only-what-was-tested-lands']
// Six guards of the merge tool's own steps: four allow only block, two allow block and remind (wave 13r round Z2).
const THE_MERGE_TOOLS_OWN_GUARDS = ['pinned-commit-is-what-was-sealed', 'resolution-replayed-from-its-own-ref', 'tested-clone-is-the-integrated-result', 'withdrawn-entry-tool-stops', 'plugin-pages-built-before-landing', 'office-healthy-after-landing']
// Six more checks of the office's own, from round H's table, which allow only block (wave 13r round AA).
const THE_OFFICES_OWN_BLOCK_ONLY_CHECKS = ['every-setting-value-is-known', 'a-dsh-checks-transcript-is-its-own', 'old-setting-names-stop-the-office', 'an-act-at-a-keyed-door-needs-a-key', 'a-test-world-trusts-only-its-own-keys', 'the-role-cards-file-is-usable']
// Two checks of the office's own start, from round H's table, which allow one position each and start there (wave 13r round AC).
const THE_OFFICES_OWN_START_CHECKS: Record<string, string> = {'a-start-refusal-stops-the-retries': 'remind', 'the-office-starts-once': 'block'}
const AS_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const CLASSES = ['safety', 'privacy', 'quality', 'house-rules', 'process']
interface DeclaredGate { id: string; class: string; group: string; setting: string; positions: {kind: 'switch'} | {kind: 'number'; fewest: number; most: number} | {kind: 'block-remind-off'; allowed: string[]}; defaults: {buildsMoleOffice: string; ordinary: string} }
interface GateList { GATES: DeclaredGate[]; GATE_CLASSES: string[]; GATE_GROUPS: {class: string; group: string}[]; gateValueIsAllowed: (row: DeclaredGate, value: string) => boolean }
async function list(): Promise<GateList> { const path = '../src/config/gates.mjs'; return import(path) }
interface SettingsFunctions {
  officeKindFrom: (from: 'checkout' | 'bundle') => {kind: string; because: string}
  officeKind: () => {kind: string; because: string}
  gateDefaultHere: (row: {defaults: {buildsMoleOffice: string; ordinary: string}}, from?: 'checkout' | 'bundle') => string
  gatePosition: (id: string, env?: Record<string, string | undefined>) => string | null
}
async function functions(): Promise<SettingsFunctions> { return await import('../src/config/settings.mjs') as unknown as SettingsFunctions }
let t: TestDb, app: FastifyInstance
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); t.close() })
function save(name: string, value: string | null, headers = AS_OWNER) { return app.inject({ method: 'POST', url: '/api/office/settings', headers, payload: {changes: [{name, value}], because: 'Made-up reason for a gate'} }) }

// Each row keeps its old default. The retire gate offers only block and off because the retire press shows no reminder.
// Each who-may-act row offers only block and off as well: its rule is kept or not, at block in both kinds of office.
// So do the two integration guards of round L, which the next case pins.
// The sandbox tools' rows offer only the positions they were given (d6SnhY430pQe), and
// tests/the-sandbox-tools-checks-are-gate-rows.test.ts pins them row by row.
// The six guards of the merge queue's own steps allow only block, and
// tests/the-merge-queue-server-gates-are-counted-rows.test.ts pins them row by row.
// The six guards of the merge tool's own steps allow block, or block and remind, and
// tests/the-merge-tool-gate-rows-move-only-as-decided.test.ts pins them row by row.
// Six more checks of the office's own allow only block, and
// tests/six-checks-of-the-offices-own-are-block-only-rows.test.ts pins them row by row.
// The two checks of the office's own start allow one position each, and start there in both kinds of office.
// Mutation: give either a second position or another default.
it('keeps each merge-queue and reminder gate at its old default, gives each its allowed positions, and refuses a value a row lacks', async () => {
  const {GATES, gateValueIsAllowed} = await list()
  const row = (id: string) => GATES.find(one => one.id === id)!
  expect(row('house-rule-reds')).toMatchObject({class: 'house-rules', group: 'the-merge-queue', setting: 'MOLE_OFFICE_GATE_HOUSE_RULES', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, defaults: {buildsMoleOffice: 'block', ordinary: 'block'}})
  expect(row('file-territories')).toMatchObject({class: 'process', group: 'reminders', setting: 'MOLE_OFFICE_GATE_TERRITORIES', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, defaults: {buildsMoleOffice: 'remind', ordinary: 'remind'}})
  expect(row('before-the-seal')).toMatchObject({class: 'process', group: 'reminders', setting: 'MOLE_OFFICE_GATE_BEFORE_THE_SEAL', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, defaults: {buildsMoleOffice: 'remind', ordinary: 'remind'}})
  expect(row('retire-while-owed')).toEqual({id: 'retire-while-owed', class: 'process', group: 'reminders', setting: 'MOLE_OFFICE_GATE_RETIRE_WHILE_OWED', positions: {kind: 'block-remind-off', allowed: ['block', 'off']}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: 'block', ordinary: 'block'}, countedBy: 'the-server', looksAgain: null})
  expect(row('few-feature-reds')).toMatchObject({class: 'quality', group: 'the-merge-queue', setting: 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, defaults: {buildsMoleOffice: 'block', ordinary: 'block'}})
  expect(row('flaky-tests')).toEqual({id: 'flaky-tests', class: 'quality', group: 'the-merge-queue', setting: 'MOLE_OFFICE_GATE_FLAKY', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: 'off', ordinary: 'off'}, countedBy: 'the-server', looksAgain: null})
  expect(row('wide-red')).toEqual({id: 'wide-red', class: 'quality', group: 'the-merge-queue', setting: 'MOLE_OFFICE_GATE_WIDE_RED', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: 'block', ordinary: 'block'}, countedBy: 'the-server', looksAgain: null})
  for (const one of GATES) if (one.positions.kind === 'block-remind-off' && one.id !== 'retire-while-owed' && one.group !== 'who-may-act' && !INTEGRATION_GUARDS.includes(one.id) && !THE_OFFICES_OWN_CHECKS.includes(one.id) && one.group !== 'the-sandbox-tools' && !THE_QUEUES_OWN_GUARDS.includes(one.id) && !THE_MERGE_TOOLS_OWN_GUARDS.includes(one.id) && !THE_OFFICES_OWN_BLOCK_ONLY_CHECKS.includes(one.id) && !Object.hasOwn(THE_OFFICES_OWN_START_CHECKS, one.id)) expect(one.positions.allowed, one.id).toEqual(['block', 'remind', 'off'])
  for (const [id, only] of Object.entries(THE_OFFICES_OWN_START_CHECKS)) expect(row(id), id).toMatchObject({positions: {kind: 'block-remind-off', allowed: [only]}, defaults: {buildsMoleOffice: only, ordinary: only}})
  for (const id of THE_OFFICES_OWN_CHECKS) expect(row(id), id).toMatchObject({positions: {kind: 'block-remind-off', allowed: ['block', 'off']}, defaults: {buildsMoleOffice: 'block', ordinary: 'block'}})
  for (const one of GATES) if (one.group === 'who-may-act') expect(one, one.id).toMatchObject({class: 'process', positions: {kind: 'block-remind-off', allowed: ['block', 'off']}, whoMayChange: 'the-person', defaults: {buildsMoleOffice: 'block', ordinary: 'block'}})
  for (const value of ['1', 'Remind', '', 'on']) expect(gateValueIsAllowed(row('file-territories'), value), value).toBe(false)
  for (const value of ['block', 'remind', 'off']) expect(gateValueIsAllowed(row('file-territories'), value), value).toBe(true)
  for (const value of ['0', 'on', 'BLOCK']) expect(gateValueIsAllowed(row('house-rule-reds'), value), value).toBe(false)
  const {readSetting} = await import('../src/config/settings.mjs')
  expect(() => readSetting('MOLE_OFFICE_GATE_TERRITORIES', {MOLE_OFFICE_GATE_TERRITORIES: 'on'})).toThrow('MOLE_OFFICE_GATE_TERRITORIES is "on", and it must be block or remind or off. Nothing was guessed from it.')
  expect(() => readSetting('MOLE_OFFICE_GATE_HOUSE_RULES', {MOLE_OFFICE_GATE_HOUSE_RULES: 'on'})).toThrow('MOLE_OFFICE_GATE_HOUSE_RULES is "on", and it must be block or remind or off. Nothing was guessed from it.')
  expect(() => readSetting('MOLE_OFFICE_GATE_FEW_FEATURE_REDS', {MOLE_OFFICE_GATE_FEW_FEATURE_REDS: 'wide'})).toThrow('MOLE_OFFICE_GATE_FEW_FEATURE_REDS is "wide", and it must be block or remind or off. Nothing was guessed from it.')
  expect(() => readSetting('MOLE_OFFICE_GATE_FLAKY', {MOLE_OFFICE_GATE_FLAKY: 'on'})).toThrow('MOLE_OFFICE_GATE_FLAKY is "on", and it must be block or remind or off. Nothing was guessed from it.')
  expect(() => readSetting('MOLE_OFFICE_GATE_WIDE_RED', {MOLE_OFFICE_GATE_WIDE_RED: 'land'})).toThrow('MOLE_OFFICE_GATE_WIDE_RED is "land", and it must be block or remind or off. Nothing was guessed from it.')
  const flakyRefused = await save('MOLE_OFFICE_GATE_FLAKY', 'on')
  expect(flakyRefused.statusCode, flakyRefused.body).toBe(400)
  expect(flakyRefused.body).toContain('it must be block or remind or off')
  const refused = await save('MOLE_OFFICE_GATE_TERRITORIES', 'on')
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.body).toContain('it must be block or remind or off')
  for (const [name, value] of [['MOLE_OFFICE_GATE_TERRITORIES', 'block'], ['MOLE_OFFICE_GATE_FLAKY', 'block'], ['MOLE_OFFICE_GATE_WIDE_RED', 'off']] as const) {
    const blocked = await save(name, value)
    expect(blocked.statusCode, blocked.body).toBe(200)
  }
  expect((await functions()).gatePosition('wide-red')).toBe('off')
  const saved = await save('MOLE_OFFICE_GATE_HOUSE_RULES', 'remind')
  expect(saved.statusCode, saved.body).toBe(200)
  expect((await functions()).gatePosition('house-rule-reds')).toBe('remind')
})

// THE TWO INTEGRATION GUARDS (wave 13r round L, item 4 of briefs/REQUIREMENTS.md): the owner-content guard and the build
// of the integrated tree. Each offers only block and off, and starts at block in both kinds of office, which is what the
// merge tool did before the row. Only the person may change the owner-content guard. Each reader gives the position, and
// a position its row lacks is refused by name; nothing is guessed in its place.
// Mutation: start either at off, give either remind, let a secretary change the owner-content guard, or have a reader
// take a value its row lacks.
it('declares the owner-content and integrated-build guards at block with only block and off, and reads nothing else', async () => {
  const {GATES, gateValueIsAllowed} = await list()
  const guard = (id: string, kind: string, setting: string, whoMayChange: string) => ({id, class: kind, group: 'the-merge-queue', setting,
    positions: {kind: 'block-remind-off', allowed: ['block', 'off']}, whoMayChange, defaults: {buildsMoleOffice: 'block', ordinary: 'block'}, countedBy: 'the-merge-tool', looksAgain: null})
  expect(GATES.find(one => one.id === 'owner-content-in-what-ships')).toEqual(guard('owner-content-in-what-ships', 'privacy', 'MOLE_OFFICE_GATE_OWNER_CONTENT', 'the-person'))
  expect(GATES.find(one => one.id === 'integrated-tree-builds')).toEqual(guard('integrated-tree-builds', 'quality', 'MOLE_OFFICE_GATE_INTEGRATED_BUILD', 'the-person-or-a-secretary'))
  const path = '../src/config/integration-guards.mjs'
  const readers = await import(path) as Record<string, (env?: Record<string, string | undefined>) => string>
  const reader = {'owner-content-in-what-ships': readers['ownerContentPosition']!, 'integrated-tree-builds': readers['integratedBuildPosition']!}
  for (const id of INTEGRATION_GUARDS) {
    const row = GATES.find(one => one.id === id)!
    const read = reader[id as keyof typeof reader]
    expect(read({}), id).toBe(row.defaults.buildsMoleOffice)
    for (const value of row.positions.kind === 'block-remind-off' ? row.positions.allowed : []) {
      expect(gateValueIsAllowed(row, value), `${id}: ${value}`).toBe(true)
      expect(read({[row.setting]: value}), `${id}: ${value}`).toBe(value)
    }
    for (const value of ['remind', 'on', 'BLOCK', '']) expect(gateValueIsAllowed(row, value), `${id}: ${value}`).toBe(false)
    // The refusal names the setting and the value it was given.
    for (const value of ['remind', 'on']) expect(() => read({[row.setting]: value}), `${id}: ${value}`).toThrow(new RegExp(`${row.setting} is "${value}"`))
    const refused = await save(row.setting, 'remind')
    expect(refused.statusCode, refused.body).toBe(400)
  }
  // A secretary with its own key may change the build guard, and not the owner-content guard.
  const registered = await app.inject({method: 'POST', url: '/api/agents/started', headers: AS_OWNER, payload: {handle: 'made-up-guard-secretary', name: 'Made-up guard secretary', role: 'secretary'}})
  expect(registered.statusCode, registered.body).toBe(201)
  const {agentByHandle} = await import('../src/server/lib/participants.ts')
  const {makeAnAgentKey} = await import('../src/server/lib/keys.ts')
  const who = agentByHandle('made-up-guard-secretary')!
  const secretary = {...AS_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': who.id, 'x-mole-office-key': makeAnAgentKey(who.id, null)}
  const build = await save('MOLE_OFFICE_GATE_INTEGRATED_BUILD', 'off', secretary)
  expect(build.statusCode, build.body).toBe(200)
  expect(readers['integratedBuildPosition']!()).toBe('off')
  const ownerContent = await save('MOLE_OFFICE_GATE_OWNER_CONTENT', 'off', secretary)
  expect(ownerContent.statusCode, ownerContent.body).toBe(403)
  expect(readers['ownerContentPosition']!()).toBe('block')
  const saved = await save('MOLE_OFFICE_GATE_OWNER_CONTENT', 'off')
  expect(saved.statusCode, saved.body).toBe(200)
  expect(readers['ownerContentPosition']!()).toBe('off')
})

it('pins the related-tests-only row at the whole-suite default and reads only its two switch values', async () => {
  const {GATES, gateValueIsAllowed} = await list()
  const row = GATES.find(one => one.id === 'related-tests-only')!
  expect(row).toEqual({id: 'related-tests-only', class: 'quality', group: 'the-merge-queue', setting: 'MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY', positions: {kind: 'switch'}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: '0', ordinary: '0'}, countedBy: 'the-merge-tool', looksAgain: null})
  const {readSetting} = await import('../src/config/settings.mjs')
  expect(readSetting('MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY', {}).value).toBe('0')
  expect(readSetting('MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY', {MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY: '1'}).value).toBe('1')
  for (const value of ['0', '1']) expect(gateValueIsAllowed(row, value), value).toBe(true)
  for (const value of ['on', 'block', '']) expect(gateValueIsAllowed(row, value), value).toBe(false)
})

// A change to a switch needs its reason. Sent with none, an empty one or only spaces, the settings door refuses it and
// stores nothing; the same change with a reason saves, so the refusal is about the reason alone.
// Mutation: make the reason optional in the settings door's body shape, and the reasonless changes save.
it('refuses a switch change that comes with no reason, an empty reason or only spaces, and stores nothing', async () => {
  const {GATES} = await list()
  const row = GATES.find(one => one.id === 'red-fixing')!
  const f = await functions()
  const before = f.gatePosition(row.id)
  const other = before === '1' ? '0' : '1'
  const reading = async () => (await app.inject({method: 'GET', url: '/api/office/gates', headers: AS_OWNER})).json().classes
    .flatMap((one: {groups: {rows: {id: string}[]}[]}) => one.groups.flatMap(group => group.rows)).find((one: {id: string}) => one.id === row.id)
  for (const reason of [{}, {because: ''}, {because: '   '}]) {
    const refused = await app.inject({method: 'POST', url: '/api/office/settings', headers: AS_OWNER, payload: {changes: [{name: row.setting, value: other}], ...reason}})
    expect(refused.statusCode, `${JSON.stringify(reason)}: ${refused.body}`).toBe(400)
    expect(refused.json().code, JSON.stringify(reason)).toBe('runtimeSettingsBadValue')
    expect(f.gatePosition(row.id), JSON.stringify(reason)).toBe(before)
    expect(await reading(), JSON.stringify(reason)).toMatchObject({chosen: null, lastChange: null})
  }
  const control = await save(row.setting, other)
  expect(control.statusCode, control.body).toBe(200)
  expect(f.gatePosition(row.id)).toBe(other)
})

// The gate itself is tools/merge-tool/commit-addresses.mjs, which blocked with no setting until it had this row. Block
// stays its default in both columns, since main's history cannot be changed afterwards. The row sits in its group
// right after flaky-tests; where that is in the list is read from the list, never counted here.
it('declares the placeholder-address gate in the merge queue after flaky-tests, with block, remind and off, at block in both columns, and refuses another word', async () => {
  const {GATES} = await list()
  const ids = GATES.map(one => one.id)
  expect(ids.indexOf('placeholder-addresses'), 'the row follows flaky-tests').toBe(ids.indexOf('flaky-tests') + 1)
  expect(GATES.find(one => one.id === 'placeholder-addresses')).toEqual({id: 'placeholder-addresses', class: 'quality', group: 'the-merge-queue', setting: 'MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES', positions: {kind: 'block-remind-off', allowed: ['block', 'remind', 'off']}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: 'block', ordinary: 'block'}, countedBy: 'the-merge-tool', looksAgain: null})
  const {readSetting} = await import('../src/config/settings.mjs')
  expect(() => readSetting('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES', {MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES: 'on'})).toThrow('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is "on", and it must be block or remind or off. Nothing was guessed from it.')
  const saved = await save('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES', 'off')
  expect(saved.statusCode, saved.body).toBe(200)
  expect((await functions()).gatePosition('placeholder-addresses')).toBe('off')
})

it('uses only the installation form for the office kind and chooses the matching default column', async () => {
  const f = await functions()
  expect(f.officeKindFrom('checkout')).toEqual({kind: 'builds-mole-office', because: 'runs-from-a-checkout'})
  expect(f.officeKindFrom('bundle')).toEqual({kind: 'ordinary', because: 'runs-from-an-installed-build'})
  const madeUp = {defaults: {buildsMoleOffice: '1', ordinary: '0'}}
  expect(f.gateDefaultHere(madeUp, 'checkout')).toBe('1')
  expect(f.gateDefaultHere(madeUp, 'bundle')).toBe('0')
  const {SETTINGS} = await import('../src/config/settings.mjs')
  for (const row of (await list()).GATES) expect(SETTINGS.find(setting => setting.name === row.setting)?.fallback, row.id).toBe(row.defaults[f.officeKind().kind === 'builds-mole-office' ? 'buildsMoleOffice' : 'ordinary'])
})

it('reads a saved gate choice at once over the environment and names an unknown id in its error', async () => {
  const f = await functions()
  const name = 'MOLE_OFFICE_CONFLICT_RESOLVING'
  const before = process.env[name]
  process.env[name] = '0'
  try {
    expect(f.gatePosition('conflict-resolving')).toBe('0')
    const saved = await save(name, '1')
    expect(saved.statusCode, saved.body).toBe(200)
    expect(f.gatePosition('conflict-resolving')).toBe('1')
    expect(f.gatePosition('conflict-resolving', {[name]: '0'})).toBe('0')
    expect(() => f.gatePosition('made-up-unknown-gate')).toThrow('made-up-unknown-gate')
  } finally { if (before === undefined) delete process.env[name]; else process.env[name] = before }
})

it('reads all five classes, the list groups, the live choice and latest change, and the settings door permission', async () => {
  const read = await app.inject({method: 'GET', url: '/api/office/gates', headers: AS_OWNER})
  expect(read.statusCode, read.body).toBe(200)
  const initial = read.json()
  expect(initial.classes.map((one: {class: string}) => one.class)).toEqual(CLASSES)
  const {GATES, GATE_GROUPS} = await list()
  for (const name of CLASSES) expect(initial.classes.find((one: {class: string}) => one.class === name).groups.map((one: {group: string}) => one.group), name).toEqual(GATE_GROUPS.filter(one => one.class === name).map(one => one.group))
  const rows = initial.classes.flatMap((one: {groups: {rows: unknown[]}[]}) => one.groups.flatMap(group => group.rows))
  expect(rows).toHaveLength(GATES.length)
  for (const row of GATES) expect(rows).toContainEqual(expect.objectContaining({...row, defaultHere: row.defaults.buildsMoleOffice, chosen: null, ranOut: null, lastChange: null, counts: null}))
  expect(initial.mayChange).toBe(true)
  const saved = await save('MOLE_OFFICE_CHECKS_AN_HOUR', '2')
  expect(saved.statusCode, saved.body).toBe(200)
  const next = (await app.inject({method: 'GET', url: '/api/office/gates', headers: AS_OWNER})).json()
  const chosen = next.classes.flatMap((one: {groups: {rows: {id: string}[]}[]}) => one.groups.flatMap(group => group.rows)).find((one: {id: string}) => one.id === 'checks-an-hour')
  expect(chosen).toMatchObject({id: 'checks-an-hour', value: '2', source: 'the office database', chosen: {value: '2', until: null}, lastChange: {by: {type: 'human', id: THE_TEST_OFFICES_OWNER.id, name: expect.any(String)}, from: '6', to: '2', because: 'Made-up reason for a gate', until: null, ranOut: false}})
  const settings = saved.json().settings
  for (const row of GATES) expect(settings.find((one: {name: string}) => one.name === row.setting).gate).toBe(row.id)
  expect(settings.find((one: {name: string}) => one.name === 'MOLE_OFFICE_AGENT_MODEL').gate).toBeNull()
  const registered = await app.inject({method: 'POST', url: '/api/agents/started', headers: AS_OWNER, payload: {handle: 'made-up-gate-worker', name: 'Made-up gate worker', role: 'worker'}})
  expect(registered.statusCode, registered.body).toBe(201)
  const {agentByHandle} = await import('../src/server/lib/participants.ts')
  const {makeAnAgentKey} = await import('../src/server/lib/keys.ts')
  const who = agentByHandle('made-up-gate-worker')!
  const headers = {...AS_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': who.id, 'x-mole-office-key': makeAnAgentKey(who.id, null)}
  const denied = await save('MOLE_OFFICE_CHECKS_AN_HOUR', '3', headers)
  expect(denied.statusCode, denied.body).toBe(403)
  const theirs = await app.inject({method: 'GET', url: '/api/office/gates', headers})
  expect(theirs.statusCode, theirs.body).toBe(200)
  expect(theirs.json().mayChange).toBe(false)
})

// The answer on the release spacing keeps 180 minutes between two stable releases, as a setting the owner may change later.
// The release tool decides and counts it. Like the other owner-decided settings, a change needs the person's words.
// Mutation: drop the setting from the owner-decided list, and the secretary's change below saves.
it('keeps the release spacing at the owner\'s 180 minutes in both columns, counted by the release tool, and refuses a secretary\'s change without the person\'s words', async () => {
  const {GATES, gateValueIsAllowed} = await list()
  const spacing = GATES.find(one => one.id === 'release-spacing')!
  expect(spacing).toEqual({id: 'release-spacing', class: 'process', group: 'numbers', setting: 'MOLE_OFFICE_RELEASE_SPACING_MINUTES', positions: {kind: 'number', fewest: 1, most: 1440}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: '180', ordinary: '180'}, countedBy: 'the-release-tool', looksAgain: null})
  for (const value of ['0', '1441', '180.5', '', 'three hours']) expect(gateValueIsAllowed(spacing, value), value).toBe(false)
  for (const value of ['1', '180', '1440']) expect(gateValueIsAllowed(spacing, value), value).toBe(true)
  const {DECIDED_SETTING_NAMES} = await import('../src/config/runtime-settings.mjs')
  expect(DECIDED_SETTING_NAMES).toContain('MOLE_OFFICE_RELEASE_SPACING_MINUTES')
  const registered = await app.inject({method: 'POST', url: '/api/agents/started', headers: AS_OWNER, payload: {handle: 'made-up-spacing-secretary', name: 'Made-up spacing secretary', role: 'secretary'}})
  expect(registered.statusCode, registered.body).toBe(201)
  const {agentByHandle} = await import('../src/server/lib/participants.ts')
  const {makeAnAgentKey} = await import('../src/server/lib/keys.ts')
  const who = agentByHandle('made-up-spacing-secretary')!
  const secretary = {...AS_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': who.id, 'x-mole-office-key': makeAnAgentKey(who.id, null)}
  // The control: the same secretary may change a number nobody decided.
  const control = await save('MOLE_OFFICE_CHECKS_AN_HOUR', '3', secretary)
  expect(control.statusCode, control.body).toBe(200)
  const refused = await save('MOLE_OFFICE_RELEASE_SPACING_MINUTES', '120', secretary)
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json().error).toBe('These exact values need the owner’s words. A raise alone is not enough. Nothing was changed.')
  const reading = async () => (await app.inject({method: 'GET', url: '/api/office/gates', headers: AS_OWNER})).json().classes
    .flatMap((one: {groups: {rows: {id: string}[]}[]}) => one.groups.flatMap(group => group.rows))
  expect((await reading()).find((one: {id: string}) => one.id === 'release-spacing')).toMatchObject({value: '180', chosen: null, ownerDecided: true})
  expect((await reading()).find((one: {id: string}) => one.id === 'checks-an-hour')).toMatchObject({ownerDecided: false})
  const saved = await save('MOLE_OFFICE_RELEASE_SPACING_MINUTES', '240')
  expect(saved.statusCode, saved.body).toBe(200)
  expect((await reading()).find((one: {id: string}) => one.id === 'release-spacing')).toMatchObject({value: '240', chosen: {value: '240', until: null}, ownerDecided: true})
})

// THE NUMBERS THAT MAKE WORK WAIT OR SEND IT BACK (round E made the numbers in
// them settings). Each default is the number the office used before it was a row, so nothing changes until somebody sets
// one, except the broadcast pause. Its default is 0, which is off in both kinds of office: no broadcast pauses until
// somebody sets a number. Zero is allowed for the hops, the run messages and the broadcast pause. The four that refuse a
// message or send an entry back have a group of their own, so the numbers group's heading stays true.
// Mutation: start any of them at another number, give one other bounds, or let a number outside its row through.
it('declares the nine numbers that make work wait or send it back at the numbers the office used before, and refuses a number outside its row', async () => {
  const {GATES, GATE_GROUPS, gateValueIsAllowed} = await list()
  const number = (id: string, group: string, setting: string, fewest: number, most: number, value: string) => ({id, class: 'process', group, setting,
    positions: {kind: 'number' as const, fewest, most}, whoMayChange: 'the-person-or-a-secretary', defaults: {buildsMoleOffice: value, ordinary: value}, countedBy: 'the-server', looksAgain: null})
  const expected = [
    number('broadcast-pause', 'numbers', 'MOLE_OFFICE_BROADCAST_UNANSWERED_LIMIT', 0, 100, '0'),
    number('worker-runs', 'numbers', 'MOLE_OFFICE_WORKER_RUNS', 1, 64, '2'),
    number('agent-hops', 'numbers', 'MOLE_OFFICE_AGENT_HOPS', 0, 100, '3'),
    number('browser-test-seats', 'numbers', 'MOLE_OFFICE_BROWSER_TEST_SLOTS', 1, 64, '4'),
    number('counter-spacing', 'numbers', 'MOLE_OFFICE_COUNTER_SPACING_MINUTES', 30, 1440, '30'),
    number('run-messages', 'limits', 'MOLE_OFFICE_RUN_MESSAGES', 0, 1000, '5'),
    number('conflict-minutes', 'limits', 'MOLE_OFFICE_CONFLICT_RESOLVING_MINUTES', 15, 1440, '60'),
    number('landing-attempts', 'limits', 'MOLE_OFFICE_LANDING_ATTEMPTS', 1, 20, '3'),
    number('tool-runs-in-one-place', 'limits', 'MOLE_OFFICE_TOOL_RUNS_IN_ONE_PLACE', 1, 20, '3'),
  ]
  for (const row of expected) expect(GATES.find(one => one.id === row.id), row.id).toEqual(row)
  const numbersAt = GATE_GROUPS.findIndex(one => one.group === 'numbers')
  expect(GATE_GROUPS.slice(numbersAt, numbersAt + 2)).toEqual([{class: 'process', group: 'numbers'}, {class: 'process', group: 'limits'}])
  for (const row of expected) {
    const {fewest, most} = row.positions
    for (const value of [String(fewest), String(most)]) expect(gateValueIsAllowed(row, value), `${row.id}: ${value}`).toBe(true)
    for (const value of [...(fewest > 0 ? [String(fewest - 1)] : []), String(most + 1), '2.5', '', 'many']) expect(gateValueIsAllowed(row, value), `${row.id}: ${value}`).toBe(false)
  }
  // One reader for every number row: it gives the number, or refuses and names the value. It never uses another number.
  const {gateNumber} = await import('../src/config/settings.mjs') as unknown as {gateNumber: (id: string, env?: Record<string, string | undefined>) => number}
  expect(gateNumber('agent-hops', {MOLE_OFFICE_AGENT_HOPS: '0'})).toBe(0)
  expect(gateNumber('worker-runs', {})).toBe(2)
  expect(gateNumber('conflict-minutes', {})).toBe(60)
  expect(() => gateNumber('worker-runs', {MOLE_OFFICE_WORKER_RUNS: '65'})).toThrow('MOLE_OFFICE_WORKER_RUNS is "65", and it has to be a whole number from 1 to 64. No other number was used in its place.')
  expect(() => gateNumber('counter-spacing', {MOLE_OFFICE_COUNTER_SPACING_MINUTES: '29'})).toThrow('MOLE_OFFICE_COUNTER_SPACING_MINUTES is "29", and it has to be a whole number from 30 to 1440. No other number was used in its place.')
  expect(() => gateNumber('wide-red')).toThrow('The gate "wide-red" is not a number, so it has no number to read.')
  // The settings door refuses a number outside the row, and keeps zero where zero was allowed.
  const under = await save('MOLE_OFFICE_COUNTER_SPACING_MINUTES', '29')
  expect(under.statusCode, under.body).toBe(400)
  expect(under.json().error).toBe('Use a whole number from 30 to 1440. Nothing was changed.')
  const over = await save('MOLE_OFFICE_WORKER_RUNS', '65')
  expect(over.statusCode, over.body).toBe(400)
  expect(over.json().error).toBe('Use a whole number from 1 to 64. Nothing was changed.')
  for (const name of ['MOLE_OFFICE_AGENT_HOPS', 'MOLE_OFFICE_RUN_MESSAGES']) {
    const zero = await save(name, '0')
    expect(zero.statusCode, `${name}: ${zero.body}`).toBe(200)
  }
})
