// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S TERRITORY REMINDS TWO LINES AND, AT REMIND, NEVER REFUSES THEIR OVERLAP. The setting's block position,
 * which refuses the later overlapping write, is measured in a file of its own.
 *
 * Measures the runtime setting, the territory's own path rule, the run and starter writers,
 * and one group per pair of running runs in different starter chains. Each case owns its office
 * database and HOME. No claim is needed for a run's territory to be compared.
 *
 * A TERRITORY NAMES FOLDERS AND FILES AT ANY DEPTH (wave 13u round 62). It used to be checked with the
 * worker card's work-area rule, which refuses a file inside a folder, so no run could name one shared
 * file: only its whole folder. Now it has its own rule, which refuses only what is not a path inside
 * the repository. Two runs that name the same file get a group; two that name different files in one
 * folder get none.
 *
 * TWO RUNS MEET ONLY WHERE THEIR CHANGED PATHS MEET (wave 13u round 194): a path both changed since their cuts, or a
 * path one changed under a narrow entry of the other's territory. A folder two or more agents declare is shared and
 * meets nothing by itself. So each run here has a made-up worktree of its own, with a cut, and each case says which
 * paths each run changed. A group is named for the paths where the two runs meet.
 * tests/an-overlap-group-opens-only-where-changed-paths-meet.test.ts measures the rule itself.
 *
 * MUTATIONS, WITH A CONTROL RUN FIRST:
 * Control: every case green on the finished code.
 * - Return no overlaps from the new claims function: the overlapping runs case turns red.
 * - Remove its starter-chain check: the one-chain case turns red.
 * - Ignore the stored setting and always remind: the off case turns red.
 * - Remove the territory writer check: the unrelated writer's 403 case turns red.
 * - Check the territory with the worker card's work-area rule again: the file at any depth, the same
 *   file and the different files cases turn red.
 * - Let validateATerritory return the entries unchecked: the refused path cases turn red.
 * - Let whereTwoEntriesMeet say two different files meet: the different files case turns red.
 * - Let whereTwoEntriesMeet say two equal paths do not meet: the same file case turns red.
 * whereTwoEntriesMeet was taken out in round 194. That round's mutation of whereTwoRunsMeet:
 * - Do not add the paths under a narrow entry: the overlapping runs, off, new running session, one above each
 *   worker, failed group opening, filer and counting cases turn red. The same file case stays green under a mutation
 *   that adds no path both runs changed, because each run names that file and so meets the other under a narrow entry.
 * Restore each changed source with git checkout and verify a clean status, then run green again.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aWorktreeOfItsOwn, theRunChanges } from './a-worktree-of-its-own.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'

const settingName = 'MOLE_OFFICE_GATE_TERRITORIES'
const owner = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
type Agent = { id: string; handle: string; headers: Record<string, string> }
let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')
/** The agents this case registered, so a count sees only the groups this case opened. */
let agentsThisCase: Set<string>

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'territory-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv(settingName, undefined)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
}, 60_000)

beforeEach(() => {
  agentsThisCase = new Set()
  // THE SETTING AND THE GATE COUNTS ARE THE OFFICE'S, so each case starts them where a new office does.
  t.client.sqlite.prepare('DELETE FROM gate_counts').run()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  vi.stubEnv(settingName, undefined)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, so a territory is compared with this case's runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
  // A TERRITORY AN EARLIER CASE STORED IS TAKEN OFF, since each agent's latest territory says which folders are shared.
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.territory') WHERE kind = 'session'").run()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

async function agent(starter?: Agent, role = 'supervisor'): Promise<Agent> {
  const handle = randomUUID()
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: starter?.headers ?? owner,
    payload: { handle, name: 'A test participant', role, runtime: 'claude-code', workArea: [`tests/${randomUUID()}`] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = participants.agentByHandle(handle)!
  agentsThisCase.add(row.id)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}
/** A run with a worktree of its own, which has changed these paths since its cut. */
function run(who: Agent, state = 'running', territory?: string[], changed: readonly string[] = []): string {
  const at = aWorktreeOfItsOwn(home)
  theRunChanges(at.workingDirectory, changed)
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A territory test run',
    actor: { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id },
    data: { state, runtime: 'claude-code', servingAgentId: who.id, ...at, ...(territory === undefined ? {} : { territory }) },
  }).id
  return id
}
function patch(id: string, dataPatch: Record<string, unknown>, by: Agent) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch } })
}
function groups(): { id: string; about: string; name: string }[] {
  const rows = t.client.sqlite.prepare("SELECT id, about, name FROM groups WHERE about LIKE 'territory|%'").all() as { id: string; about: string; name: string }[]
  // A GROUP OPENED FOR AN EARLIER CASE names none of this case's agents, so it is not this case's to count.
  return rows.filter((one) => one.about.split('|').slice(1).some((agentId) => agentsThisCase.has(agentId)))
}
function stored(id: string): unknown { return t.api.getRecord(id)?.data['territory'] }
function set(value: string) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers: owner,
    payload: { changes: [{ name: settingName, value }], because: 'Measure the territory reminder setting.' } })
}

it('declares the setting and field, defaults to remind, and accepts block, remind and off', async () => {
  const config = await import('../src/config/settings.mjs')
  const runtime = await import('../src/config/runtime-settings.mjs')
  expect(config.SETTINGS.find(one => one.name === settingName)).toMatchObject({ kind: 'word', fallback: 'remind' })
  expect(runtime.RUNTIME_SETTING_NAMES).toContain(settingName)
  expect(config.readSetting(settingName, {}).value).toBe('remind')
  expect(config.GATE_TERRITORIES_MODES).toEqual(['block', 'remind', 'off'])
  expect(KIND_SPECS.session.fields.find(one => one.key === 'territory')).toMatchObject({ type: 'string[]', required: false, example: expect.any(Array) })
  const refused = await set('on')
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.body).toContain(settingName)
  for (const value of ['block', 'off', 'remind']) {
    const saved = await set(value)
    expect(saved.statusCode, saved.body).toBe(200)
    expect(config.settingValue(settingName)).toBe(value)
    expect(saved.json().settings.find((one: { name: string }) => one.name === settingName)).toMatchObject({ value, restartRequired: false })
  }
})

it('stores normalized folders and root files from the run agent and its registered starter', async () => {
  const starter = await agent(), who = await agent(starter), id = run(who)
  const own = await patch(id, { territory: [' src/server/ ', 'package.json'] }, who)
  expect(own.statusCode, own.body).toBe(200)
  expect(stored(id)).toEqual(['src/server', 'package.json'])
  expect(own.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  const above = await patch(id, { territory: ['src/shared'] }, starter)
  expect(above.statusCode, above.body).toBe(200)
  expect(stored(id)).toEqual(['src/shared'])
})

it('stores territory from the run own key using the existing record-door proof', async () => {
  const who = await agent(), id = run(who)
  const { makeARunKey } = await import('../src/server/lib/keys.ts')
  const minted = makeARunKey(who.id, null)
  t.api.recordTheOriginalRunKeyMint(id, minted.heldKeyId, { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id })
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`,
    headers: { ...who.headers, 'x-mole-office-key': minted.key, 'x-mole-office-session': id },
    payload: { dataPatch: { territory: ['src/server'] } } })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(id)).toEqual(['src/server'])
})

it('refuses an unrelated writer with 403 and writes nothing', async () => {
  const who = await agent(), stranger = await agent(), id = run(who)
  const before = t.api.getRecord(id)
  const refused = await patch(id, { territory: ['src/server'] }, stranger)
  expect(refused.statusCode, refused.body).toBe(403)
  expect(refused.json().error).toMatch(/run.*starter.*Nothing was written\.$/)
  expect(t.api.getRecord(id)).toEqual(before)
})

it('stores a file at any depth, normalized, beside a folder', async () => {
  const who = await agent(), id = run(who)
  const reply = await patch(id, { territory: ['src/server/lib/records.ts', ' ./src/shared/paths.ts ', 'tests/'] }, who)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(id)).toEqual(['src/server/lib/records.ts', 'src/shared/paths.ts', 'tests'])
})

it.each(['/absolute', '..', '.', '../outside/file.ts', 'C:/repository/file.ts'])('refuses an invalid territory path with 400 and writes nothing: %s', async path => {
  const who = await agent(), id = run(who), before = t.api.getRecord(id)
  const refused = await patch(id, { territory: [path] }, who)
  expect(refused.statusCode, refused.body).toBe(400)
  const claims = await import('../src/server/lib/claims.ts')
  let sentence = ''
  try { claims.validateATerritory([path]) } catch (error) { sentence = (error as Error).message }
  expect(sentence).not.toBe('')
  expect(sentence).not.toContain('work area')
  expect(refused.json().error).toBe(sentence)
  expect(t.api.getRecord(id)).toEqual(before)
})

it('stores overlapping running runs and opens exactly one group for the pair', async () => {
  // THE EARLIER RUN CHANGED A FILE IN A FOLDER ONLY THE LATER RUN'S LINE DECLARES, so the two meet at that file.
  const file = 'src/server/lib/records.ts'
  const first = await agent(), second = await agent(), earlier = run(first, 'running', undefined, [file]), later = run(second)
  expect((await patch(earlier, { territory: ['src/server/**'] }, first)).statusCode).toBe(200)
  const reply = await patch(later, { territory: ['src/server/lib'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual(['src/server/lib'])
  expect(groups()).toHaveLength(1)
  const group = groups()[0]!
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [file], group: group.id }] })
  // THE GROUP IS THE TWO LINES', keyed by their agents, so their next rounds are said in it (wave 13u round 183).
  expect(group.about).toBe(['territory', ...[first.id, second.id].sort()].join('|'))
  for (const word of [first.handle, second.handle, file]) expect(group.name).toContain(word)
  const members = t.client.sqlite.prepare('SELECT member_kind,member_id FROM group_members WHERE group_id=? AND left_at IS NULL').all(group.id)
  expect(members).toEqual(expect.arrayContaining([{ member_kind: 'agent', member_id: first.id }, { member_kind: 'agent', member_id: second.id }]))
  expect(members).toHaveLength(2)
  for (const [id, who, territory] of [[earlier, first, ['src/server/**', 'src/shared']], [later, second, ['src/server/lib', 'tests']]] as const) {
    const again = await patch(id, { territory }, who)
    expect(again.statusCode, again.body).toBe(200)
    expect(again.json().territoryOverlaps.overlaps[0].group).toBe(group.id)
    expect(groups()).toHaveLength(1)
  }
})

it('opens one group for two running runs that name the same file', async () => {
  const file = 'src/server/lib/records.ts'
  const first = await agent(), second = await agent(), earlier = run(first, 'running', undefined, [file]), later = run(second, 'running', undefined, [file])
  expect((await patch(earlier, { territory: [file] }, first)).statusCode).toBe(200)
  const reply = await patch(later, { territory: [file] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual([file])
  expect(groups()).toHaveLength(1)
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [file], group: groups()[0]!.id }] })
})

it('opens no group for two running runs that name different files in one folder', async () => {
  const first = await agent(), second = await agent()
  const earlier = run(first, 'running', undefined, ['src/server/lib/records.ts']), later = run(second, 'running', undefined, ['src/server/lib/claims.ts'])
  expect((await patch(earlier, { territory: ['src/server/lib/records.ts'] }, first)).statusCode).toBe(200)
  const reply = await patch(later, { territory: ['src/server/lib/claims.ts'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual(['src/server/lib/claims.ts'])
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
})

it('stores territory inside one starter chain with empty overlaps and no group', async () => {
  const first = await agent(), second = await agent(first)
  const earlier = run(first, 'running', ['src/server/**'], ['src/server/lib/records.ts']), later = run(second)
  const reply = await patch(later, { territory: ['src/server/lib'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(earlier)).toEqual(['src/server/**'])
  expect(stored(later)).toEqual(['src/server/lib'])
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
})

it('compares disjoint territories without opening a group', async () => {
  const first = await agent(), second = await agent()
  run(first, 'running', ['src/shared'], ['src/shared/paths.ts'])
  const reply = await patch(run(second, 'running', undefined, ['src/server/index.ts']), { territory: ['src/server'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
})

it('reads off from the stored runtime setting on the next territory write', async () => {
  const first = await agent(), second = await agent()
  run(first, 'running', ['src/server/**'], ['src/server/lib/records.ts'])
  expect((await set('off')).statusCode).toBe(200)
  const id = run(second), reply = await patch(id, { territory: ['src/server/lib'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(id)).toEqual(['src/server/lib'])
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{run: expect.any(String), agent: first.id, paths: ['src/server/lib/records.ts'], notOpened: 'No group was opened because MOLE_OFFICE_GATE_TERRITORIES is off.'}] })
  expect(t.client.sqlite.prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'file-territories'").get()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
  expect(groups()).toHaveLength(0)
  expect((await set('remind')).statusCode).toBe(200)
  expect((await patch(id, { territory: ['src/server/lib', 'tests'] }, second)).json().territoryOverlaps.overlaps).toHaveLength(1)
  expect(t.client.sqlite.prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'file-territories'").get()).toEqual({would_stop: 2, stopped: 0, reminded: 1})
})

it('omits the reminder on other writes and an unchanged territory', async () => {
  const who = await agent(), id = run(who, 'running', ['src/server'])
  for (const data of [{ doing: 'Checking repository paths.' }, { territory: ['src/server'] }, { territory: [' src/server/ '] }]) {
    const reply = await patch(id, data, who)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).not.toHaveProperty('territoryOverlaps')
  }
})

it('checks territory on create and leaves a nonrunning run without a group', async () => {
  const who = await agent()
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: who.headers,
    payload: { kind: 'session', title: 'A new territory run', data: { state: 'crashed', runtime: 'claude-code', servingAgentId: who.id, territory: ['src/server'] } } })
  expect(reply.statusCode, reply.body).toBe(201)
  expect(stored(reply.json().record.id)).toEqual(['src/server'])
  expect(reply.json()).toHaveProperty('territoryOverlaps')
  expect(groups()).toHaveLength(0)
})

it('opens a group on a new running session filed by its own proved agent', async () => {
  const first = await agent(), second = await agent()
  const earlier = run(first, 'running', ['src/server/**'], ['src/server/lib/records.ts'])
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: second.headers,
    payload: { kind: 'session', title: 'A self-filed territory run', data: { state: 'running', runtime: 'claude-code', ...aWorktreeOfItsOwn(home), territory: ['src/server/lib'] } } })
  expect(reply.statusCode, reply.body).toBe(201)
  expect(reply.json().territoryOverlaps.overlaps).toEqual([{ run: earlier, agent: first.id, paths: ['src/server/lib/records.ts'], group: groups()[0]?.id }])
  expect(groups()).toHaveLength(1)
})

it('adds the one above each worker by its card and leaves the owner out', async () => {
  const aboveFirst = await agent(), aboveSecond = await agent()
  const first = await agent(aboveFirst, 'worker'), second = await agent(aboveSecond, 'worker')
  run(first, 'running', ['src/server/**'], ['src/server/lib/records.ts'])
  const reply = await patch(run(second), { territory: ['src/server/lib'] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  const group = groups()[0]!
  const members = t.client.sqlite.prepare('SELECT member_id FROM group_members WHERE group_id=? AND left_at IS NULL').all(group.id) as { member_id: string }[]
  expect(members.map(one => one.member_id).sort()).toEqual([first.id, second.id, aboveFirst.id, aboveSecond.id].sort())
  const { messagesInAGroup } = await import('../src/server/lib/messages.ts')
  const lines = messagesInAGroup(group.id, { oneProject: 'default' })
  expect(JSON.stringify(lines)).toContain('Overlap on src/server/lib/records.ts:')
})

it('keeps the territory write and names only the group opening that failed', async () => {
  const first = await agent(), second = await agent(), third = await agent()
  run(first, 'running', ['src/server/**'], ['src/server/lib/records.ts'])
  run(second, 'running', ['src/server/**'], ['src/server/lib/claims.ts'])
  const team = await import('../src/server/lib/groups.ts')
  vi.spyOn(team, 'openAGroupAndSayWhy').mockImplementationOnce(() => { throw new Error('The test group could not be opened.') })
  const id = run(third), reply = await patch(id, { territory: ['src/server/lib'] }, third)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(id)).toEqual(['src/server/lib'])
  const overlaps = reply.json().territoryOverlaps.overlaps
  expect(overlaps).toHaveLength(2)
  expect(overlaps.filter((one: { notOpened?: string }) => one.notOpened)).toEqual([expect.objectContaining({ notOpened: 'The test group could not be opened.' })])
  expect(overlaps.filter((one: { group?: string }) => one.group)).toHaveLength(1)
  expect(groups()).toHaveLength(1)
})

it('skips another run of the same agent and a run that has stopped working', async () => {
  const who = await agent(), ended = await agent()
  run(who, 'running', ['src/server/**'], ['src/server/lib/records.ts'])
  run(ended, 'crashed', ['src/server/**'], ['src/server/lib/records.ts'])
  const reply = await patch(run(who), { territory: ['src/server/lib'] }, who)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
})


/** The fold keeps filer fallback and ambiguity, and always prefers the served registry row. */
it('uses the same territory agent for a filer, a serving agent and an ambiguous stored stamp', async () => {
  const first = await agent(), filer = await agent(), serving = await agent(filer)
  const earlier = run(first, 'running', ['src/server/**'], ['src/server/lib/records.ts'])
  const filed = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A run without a served agent',
    actor: { type: 'agent', id: filer.id, provedBy: 'an-agent-key', keyHolder: filer.id }, data: { state: 'running', ...aWorktreeOfItsOwn(home) } }).id
  const records = await import('../src/server/lib/records.ts')
  expect(records.theAgentOfATerritoryRun(t.api.getRecord(filed)!)).toMatchObject({ id: filer.id })
  const written = await patch(filed, { territory: ['src/server/lib'] }, filer)
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().territoryOverlaps.overlaps).toEqual([{ run: earlier, agent: first.id, paths: ['src/server/lib/records.ts'], group: groups()[0]?.id }])
  const served = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A served run with another filer',
    actor: { type: 'agent', id: filer.id, provedBy: 'an-agent-key', keyHolder: filer.id }, data: { state: 'running', servingAgentId: serving.id, ...aWorktreeOfItsOwn(home) } }).id
  expect(records.theAgentOfATerritoryRun(t.api.getRecord(served)!)).toMatchObject({ id: serving.id })
  const servedWrite = await patch(served, { territory: ['src/server/lib'] }, serving)
  expect(servedWrite.statusCode, servedWrite.body).toBe(200)
  const members = t.client.sqlite.prepare('SELECT member_id FROM group_members WHERE group_id=?').all(servedWrite.json().territoryOverlaps.overlaps[0].group)
  expect(members).toContainEqual({ member_id: serving.id })
  expect(members).not.toContainEqual({ member_id: filer.id })
  const retired = await agent()
  t.client.sqlite.prepare('UPDATE agents SET retired = 1, handle = ? WHERE id = ?').run(filer.handle, retired.id)
  for (const table of ['changes', 'revisions']) t.client.sqlite.prepare(`UPDATE ${table} SET actor_id = ? WHERE record_id = ? AND op = 'create'`).run(filer.handle, filed)
  expect(records.theAgentOfATerritoryRun(t.api.getRecord(filed)!)).toBeNull()
  const claims = await import('../src/server/lib/claims.ts')
  expect(claims.openTheGroupsForATerritory(t.api.getRecord(filed)!, { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, new Map())).toEqual({ compared: true, overlaps: [] })
  expect(records.theAgentOfATerritoryRun({ id: '', workspaceId: 'default', data: {} })).toBeNull()
})

it('counts each overlapping run on each changed territory even when its group already exists', async () => {
  const first = await agent(), second = await agent(), third = await agent()
  run(first, 'running', ['src/server/**'], ['src/server/lib/deep/one.ts'])
  run(second, 'running', ['src/server/lib/**'], ['src/server/lib/deep/two.ts'])
  const id = run(third)
  for (const [territory, total] of [[['src/server/lib/deep'], 2], [['src/server/lib/deep', 'tests'], 4]] as const) {
    const reply = await patch(id, {territory: [...territory]}, third)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json().territoryOverlaps.overlaps).toHaveLength(2)
    expect(t.client.sqlite.prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'file-territories'").get()).toEqual({would_stop: total, stopped: 0, reminded: total})
    expect(groups()).toHaveLength(2)
  }
})
