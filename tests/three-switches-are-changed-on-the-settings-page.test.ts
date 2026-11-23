// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE SWITCHES ARE CHANGED ON THE SETTINGS PAGE, AND EACH IS READ WHEN IT IS USED (wave 13r round 19; step 0 of the
 * agreed flow design). Before this round each of the three could be changed only in .env,
 * with a restart:
 *   - MOLE_OFFICE_CONFLICT_RESOLVING, tier 2 of the conflict rules: a conflict no rule joins goes to the entry's own
 *     supervisor for an hour instead of bouncing. src/config/conflict-resolving.mjs reads it.
 *   - MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND: a whole-suite red opens a fix round. src/config/whole-suite-red.mjs reads it,
 *     for the office, the merge tool and the fix-round programs.
 *   - MOLE_OFFICE_CHECKS_AN_HOUR: at most this many checks start in one lane in an hour, 1 to 6.
 *     src/server/lib/checks-an-hour.ts reads it, from the environment the message worker merges on each pass.
 *
 * WHAT THIS FILE PROVES:
 * 1. A choice saved through the settings door is used at once, with no restart, over the environment: by the office's
 *    readers, by the merge tool's own read in a program of its own, and by the fix-round programs, which pass this
 *    process's environment. An environment a caller builds is still its own, and opens no database.
 * 2. With no saved choice, a line in .env wins over the default, and with no line the default is used. A saved choice
 *    wins over .env, and taking it away gives .env back. The .env here is a made-up file handed to the shared reader,
 *    because each switch's own function reads this checkout's .env.
 * 3. The door refuses 0 and 7 checks an hour, and a switch value that is not 0 or 1, in one plain sentence each. It
 *    keeps nothing and writes no change.
 * 4. Each change is a row of the change log: who, when, the value before and after, and the reason. A secretary with
 *    its own key may change a switch. Saving nothing puts the earlier value back, and that is a row too.
 * 5. The door's row for each switch says it is changed on the page and needs no restart. Its words are plain, with no
 *    name from the code, and a switch's words say what 0 and 1 mean. It gives the value and where it is from.
 *
 * Every value, reason and agent here is made up, in a fresh test database. Nothing reaches the live office.
 *
 * MUTATIONS, each after a green control and restored after (logs named in the round's report):
 *   - whole-suite-red.mjs reading this process's environment without the saved choice: case 1 red.
 *   - conflict-resolving.mjs reading the environment without the saved choice: case 1 red.
 *   - the door's check of the bounds of checks an hour taken out: case 3 red.
 *   - the door's check of a switch's value taken out: case 3 red.
 *   - the door writing no change row: case 4 red.
 *   - the shared reader not reading the .env file: case 2 red.
 *   - the switches' words taken out of the English list: case 5 red.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CONFLICT = 'MOLE_OFFICE_CONFLICT_RESOLVING'
const FIX = 'MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'
const CHECKS = 'MOLE_OFFICE_CHECKS_AN_HOUR'
const THREE = [CONFLICT, FIX, CHECKS]
const AS_THE_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

let t: TestDb, app: FastifyInstance
const made: string[] = []
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); t.close(); for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })

interface Row { name: string; what: string; value: string | null; source: string; currentValue: string | null; currentSource: string; chosen: string | null; writable: boolean; restartRequired: boolean; pendingRestart: boolean; place: string | null; usedOutsideTheOffice: string | null; lastChange: { by: { type: string; id: string } } | null }

function save(changes: { name: string; value: string | null }[], because = 'Made-up reason for a switch', headers: Record<string, string> = AS_THE_OWNER) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers, payload: { changes, because } })
}
async function theRows(): Promise<Row[]> { return (await app.inject({ method: 'GET', url: '/api/office/settings', headers: AS_THE_OWNER })).json().settings }

/** This process's environment holds `values` for the three, as names .env set when the office started would, and nothing else of them. */
async function withTheEnvironment<T>(values: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(THREE.map((name) => [name, process.env[name]]))
  for (const name of THREE) { if (values[name] === undefined) delete process.env[name]; else process.env[name] = values[name] }
  try { return await run() } finally { for (const name of THREE) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name] } }
}

/**
 * THE MERGE TOOL'S OWN READ, in a program of its own: tools/merge-tool/land.mjs and testing.mjs call wholeSuiteFixRoundIsOn()
 * with nothing. Its environment says 0. The message worker starts the real tool with no database path, and the tool
 * finds the database through .env; here the path of the test's database is handed to it instead.
 */
function theMergeToolReads(): boolean {
  const script = "const { wholeSuiteFixRoundIsOn } = await import('./src/config/whole-suite-red.mjs'); console.log(JSON.stringify(wholeSuiteFixRoundIsOn()))"
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, MOLE_OFFICE_DB: t.file, [FIX]: '0' }, timeout: 15_000, encoding: 'utf8' })
  return JSON.parse(output.trim().split('\n').at(-1)!) as boolean
}

it('uses a saved choice of each switch at once, in this office, the merge tool and the fix-round programs, over the environment', async () => {
  const { conflictResolvingIsOn } = await import('../src/config/conflict-resolving.mjs')
  const { wholeSuiteFixRoundIsOn } = await import('../src/config/whole-suite-red.mjs')
  const { howManyChecksAnHour } = await import('../src/server/lib/checks-an-hour.ts')
  const { mergedEnvironment } = await import('../src/config/settings.mjs')
  await withTheEnvironment({ [CONFLICT]: '0', [FIX]: '0', [CHECKS]: '5' }, async () => {
    expect([conflictResolvingIsOn(), wholeSuiteFixRoundIsOn(), wholeSuiteFixRoundIsOn(process.env)]).toEqual([false, false, false])
    expect(howManyChecksAnHour(mergedEnvironment())).toEqual({ most: 5 })
    expect(theMergeToolReads()).toBe(false)

    const saved = await save([{ name: CONFLICT, value: '1' }, { name: FIX, value: '1' }, { name: CHECKS, value: '2' }])
    expect(saved.statusCode, saved.body).toBe(200)
    expect(conflictResolvingIsOn()).toBe(true)
    expect(wholeSuiteFixRoundIsOn()).toBe(true)
    // THE FIX-ROUND PROGRAMS pass their own environment (tools/main-suite-fix-round.mjs, tools/periodic-main-suite.mjs).
    expect(wholeSuiteFixRoundIsOn(process.env)).toBe(true)
    // THE MESSAGE WORKER merges the environment once on each pass, and paces each check with it.
    expect(howManyChecksAnHour(mergedEnvironment())).toEqual({ most: 2 })
    expect(theMergeToolReads()).toBe(true)
    // AN ENVIRONMENT A CALLER BUILDS IS ITS OWN, and opens no database.
    expect(wholeSuiteFixRoundIsOn({ [FIX]: '0' })).toBe(false)
    expect(conflictResolvingIsOn({})).toBe(false)

    const back = await save([{ name: CONFLICT, value: '0' }, { name: FIX, value: '0' }, { name: CHECKS, value: '6' }])
    expect(back.statusCode, back.body).toBe(200)
    expect([conflictResolvingIsOn(), wholeSuiteFixRoundIsOn(), wholeSuiteFixRoundIsOn(process.env)]).toEqual([false, false, false])
    expect(howManyChecksAnHour(mergedEnvironment())).toEqual({ most: 6 })
    expect(theMergeToolReads()).toBe(false)
  })
}, 90_000)

it('reads .env for a switch with nothing saved, the default with no line, and a saved choice over .env', async () => {
  const { readSettingHere, mergedEnvironment } = await import('../src/config/settings.mjs')
  const { howManyChecksAnHour } = await import('../src/server/lib/checks-an-hour.ts')
  const folder = mkdtempSync(join(tmpdir(), 'three-switches-env-'))
  made.push(folder)
  const file = join(folder, '.env')
  writeFileSync(file, `# Made-up .env for a test office\n${CONFLICT}=1\n${FIX}=1\n${CHECKS}=3\n`)
  const noLine = join(folder, 'no-line.env')
  writeFileSync(noLine, '# Made-up .env with no line for the three switches\n')
  await withTheEnvironment({}, async () => {
    for (const name of [CONFLICT, FIX]) {
      expect(readSettingHere(name, process.env, file), name).toMatchObject({ value: '1', source: '.env' })
      expect(readSettingHere(name, process.env, noLine), name).toMatchObject({ value: '0', source: 'the built-in default' })
    }
    expect(readSettingHere(CHECKS, process.env, file)).toMatchObject({ value: '3', source: '.env' })
    expect(howManyChecksAnHour(mergedEnvironment(process.env, file))).toEqual({ most: 3 })
    expect(readSettingHere(CHECKS, process.env, noLine)).toMatchObject({ value: '6', source: 'the built-in default' })
    expect(howManyChecksAnHour(mergedEnvironment(process.env, noLine))).toEqual({ most: 6 })

    const saved = await save([{ name: CONFLICT, value: '0' }, { name: FIX, value: '0' }, { name: CHECKS, value: '2' }])
    expect(saved.statusCode, saved.body).toBe(200)
    for (const name of [CONFLICT, FIX]) expect(readSettingHere(name, process.env, file), name).toMatchObject({ value: '0', source: 'the office database' })
    expect(howManyChecksAnHour(mergedEnvironment(process.env, file))).toEqual({ most: 2 })

    const removed = await save(THREE.map((name) => ({ name, value: null })))
    expect(removed.statusCode, removed.body).toBe(200)
    for (const name of [CONFLICT, FIX]) expect(readSettingHere(name, process.env, file), name).toMatchObject({ value: '1', source: '.env' })
    expect(howManyChecksAnHour(mergedEnvironment(process.env, file))).toEqual({ most: 3 })
  })
})

it('refuses 0 and 7 checks an hour, and a switch value that is not 0 or 1, in a plain sentence, and keeps nothing', async () => {
  const kept = () => t.client.sqlite.prepare('SELECT name FROM runtime_settings WHERE name IN (?, ?, ?)').all(...THREE)
  const rows = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE record_id LIKE 'setting:runtime:%'").get() as { n: number }).n
  for (const value of ['0', '7']) {
    const refused = await save([{ name: CHECKS, value }])
    expect(refused.statusCode, value).toBe(400)
    expect(refused.json().error, value).toBe('Use a whole number from 1 to 6. At most 6 checks may start in one lane in an hour. Nothing was changed.')
  }
  for (const name of [CONFLICT, FIX]) for (const value of ['2', 'on', '01']) {
    const refused = await save([{ name, value }])
    expect(refused.statusCode, `${name} ${value}`).toBe(400)
    expect(refused.json().error, `${name} ${value}`).toBe('Use 1 to turn it on, or 0 to turn it off. Nothing was changed.')
  }
  expect(kept()).toEqual([])
  expect(rows()).toBe(0)
  for (const [name, value] of [[CHECKS, '1'], [CHECKS, '6'], [CONFLICT, '1'], [CONFLICT, '0'], [FIX, '1'], [FIX, '0']] as const) {
    const saved = await save([{ name, value }])
    expect(saved.statusCode, `${name} ${value}: ${saved.body}`).toBe(200)
  }
})

it('keeps each change as a row of who, when, the value before and after, and the reason, and puts a value back', async () => {
  const { conflictResolvingIsOn } = await import('../src/config/conflict-resolving.mjs')
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_OWNER, payload: { handle: 'switch-clerk', name: 'Made-up switch clerk', role: 'secretary' } })
  expect(registered.statusCode, registered.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const clerk = agentByHandle('switch-clerk')!
  const asTheClerk = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': clerk.id, 'x-mole-office-key': makeAnAgentKey(clerk.id, null) }
  const changesOf = async (name: string) =>
    (await app.inject({ method: 'GET', url: `/api/changes?recordId=${encodeURIComponent(`setting:runtime:${name}`)}`, headers: AS_THE_OWNER })).json().changes as { op: string; actorType: string; actorId: string; at: string; oldValue: string; newValue: string }[]

  expect((await save([{ name: CONFLICT, value: '1' }], 'Made-up reason: try tier 2')).statusCode).toBe(200)
  const byTheClerk = await save([{ name: CHECKS, value: '3' }], 'Made-up reason: fewer checks', asTheClerk)
  expect(byTheClerk.statusCode, byTheClerk.body).toBe(200)

  const [on] = await changesOf(CONFLICT)
  expect(on).toMatchObject({ op: 'update', actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id })
  expect(on!.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/)
  expect(JSON.parse(on!.oldValue)).toMatchObject({ value: '0', chosen: null })
  expect(JSON.parse(on!.newValue)).toMatchObject({ value: '1', chosen: '1', because: 'Made-up reason: try tier 2' })
  const [three] = await changesOf(CHECKS)
  expect(three).toMatchObject({ op: 'update', actorType: 'agent', actorId: clerk.id })
  expect(JSON.parse(three!.oldValue)).toMatchObject({ value: '6', chosen: null })
  expect(JSON.parse(three!.newValue)).toMatchObject({ value: '3', chosen: '3', because: 'Made-up reason: fewer checks' })

  // PUT BACK: saving nothing gives the earlier value, and that is a row of its own.
  expect((await save([{ name: CONFLICT, value: null }], 'Made-up reason: put tier 2 back')).statusCode).toBe(200)
  expect(conflictResolvingIsOn()).toBe(false)
  const history = await changesOf(CONFLICT)
  expect(history).toHaveLength(2)
  expect(JSON.parse(history[0]!.oldValue)).toMatchObject({ value: '1', chosen: '1', because: 'Made-up reason: try tier 2' })
  expect(JSON.parse(history[0]!.newValue)).toMatchObject({ value: '0', chosen: null, because: 'Made-up reason: put tier 2 back' })
})

it('shows each switch as one the page changes with no restart, in plain words, with its value and where it is from', async () => {
  for (const row of (await theRows()).filter((one) => THREE.includes(one.name))) {
    expect(row, row.name).toMatchObject({ writable: true, restartRequired: false, pendingRestart: false, place: null, usedOutsideTheOffice: null })
    expect([row.currentValue, row.currentSource], row.name).toEqual([row.value, row.source])
    expect(row.what, row.name).not.toMatch(/⟦|MOLE_OFFICE_|\b[A-Z]+_[A-Z_]+\b|\b[a-z]+[A-Z]\w*/)
    if (row.name !== CHECKS) expect(row.what, row.name).toMatch(/\b1\b[^.]*\.[^]*\b0\b|\b0\b[^.]*\.[^]*\b1\b/)
  }
  expect((await theRows()).filter((one) => THREE.includes(one.name))).toHaveLength(3)
  const saved = await save([{ name: CONFLICT, value: '1' }])
  expect(saved.statusCode, saved.body).toBe(200)
  const row = (await theRows()).find((one) => one.name === CONFLICT)!
  expect(row).toMatchObject({ value: '1', source: 'the office database', currentValue: '1', currentSource: 'the office database', chosen: '1', pendingRestart: false })
  expect(row.lastChange?.by).toMatchObject({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
})
