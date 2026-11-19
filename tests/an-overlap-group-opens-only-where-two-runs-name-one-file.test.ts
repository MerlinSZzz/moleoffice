// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OVERLAP GROUP OPENS ONLY WHERE TWO RUNS NAME ONE FILE, AND SINCE ROUND 194 ONLY WHERE TWO RUNS'
 * CHANGED PATHS MEET. The first rule came in wave 13u round 174, by a decision.
 *
 * On 7 November 2026 eight rounds started at once and their territories opened 14 groups. Each territory named whole
 * folders such as tests, a folder covered every file in it, and in most groups the two lines changed no file in
 * common. Their secretary was copied on each one. Round 174 opened a group only where two territories met at a file.
 * Round 194 opens one only at a path one of the two runs changed since its cut: a path both changed, or a path one
 * changed under a narrow entry of the other's territory. A folder two or more agents declare is shared and meets
 * nothing by itself. The name of this file is round 174's; its cases are measured on round 194's rule.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, through the record door, in an office database and HOME of its own
 * ---------------------------------------------------------------------------------------
 *
 *   1. A folder two lines declare is shared. Runs that change different files in it meet nowhere, and a folder only
 *      one line declares meets nothing that no other run changed.
 *   2. Two runs that both change one file in a folder both lines declare get one group, named for the file.
 *   3. A folder one line declares, written `folder/**` or plain, meets each path another run changed in it, and no
 *      path outside it by whole segments.
 *   4. A run with no worktree is answered as not checked, in words, and no group opens.
 *   5. A secretary that is not one of the two lines is not added to the group, and it still reads the group's
 *      messages through GET /api/messages?group=<id>. A secretary that is one of the two lines is a member.
 *   6. At block, a write is not refused whose run meets the other only at a shared folder.
 *
 * Every worktree is a Git repository made in this file's HOME (tests/a-worktree-of-its-own.ts), and every path, agent
 * and run is made up. The words are read from the word list, so a change of the words does not turn this red.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the finished code. Each mutation is in src/server/lib/claims.ts.
 *
 * Round 174 proved its rule with seven mutations of theTerritoryRead, whereTwoEntriesMeet, theFolderItChanges and
 * theMembersOfAWorkAreaGroup. whereTwoEntriesMeet was taken out in round 194, which ran these:
 *
 *   1. `whereTwoRunsMeet`: do not pass over a shared folder → 1, 4 and 6 red.
 *   2. `whereTwoRunsMeet`: do not add the paths both runs changed → 2 red.
 *   3. `whereTwoRunsMeet`: do not add the paths under a narrow entry → 3 red.
 *   4. `whereTwoRunsMeet`: say nothing of a run whose changes are not known → 4 red.
 *   5. `theMembersOfAWorkAreaGroup`: leave out the secretary check → 5 red.
 *
 * Restore each changed source from its saved finished copy, compare the two by sha256, then run green again.
 */
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aWorktreeOfItsOwn, theRunChanges } from './a-worktree-of-its-own.ts'

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
let say: (key: string, values: Record<string, string>) => string
let theOverlapLine: (path: string, first: string, second: string) => string
/** The agents this case registered, so a count sees only the groups this case opened. */
let agentsThisCase: Set<string>

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'file-level-territory-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv(settingName, undefined)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
  const words = await import('../src/shared/i18n.ts')
  // READ AS ANY KEY, since the words are added by the code this file measures.
  say = words.sayInEnglish as (key: string, values: Record<string, string>) => string
  const lines = await import('../src/shared/groups.ts')
  theOverlapLine = (path, first, second) => lines.SYSTEM_LINES.territoriesInConflict(path, first, second).line
}, 60_000)

beforeEach(async () => {
  agentsThisCase = new Set()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  vi.stubEnv(settingName, undefined)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, so a territory is compared with this case's runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
  // A TERRITORY AN EARLIER CASE STORED IS TAKEN OFF, since each agent's latest territory says which folders are shared.
  t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.territory') WHERE kind = 'session'").run()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

async function agent(starter?: Agent | null, role = 'supervisor'): Promise<Agent> {
  const handle = randomUUID()
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: starter?.headers ?? owner,
    payload: { handle, name: 'A made-up participant', role, runtime: 'claude-code', ...(role === 'secretary' ? {} : { workArea: [`tests/${randomUUID()}`] }) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = participants.agentByHandle(handle)!
  agentsThisCase.add(row.id)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}
/**
 * A running run of this agent with a worktree of its own that has changed these paths since its cut, or with no
 * `workingDirectory` and no cut when they are null.
 */
function run(who: Agent, changed: readonly string[] | null, territory?: string[]): string {
  const at = changed === null ? null : aWorktreeOfItsOwn(home)
  if (at !== null) theRunChanges(at.workingDirectory, changed!)
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up territory run',
    actor: { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id },
    data: { state: 'running', runtime: 'claude-code', servingAgentId: who.id, ...(at ?? {}), ...(territory === undefined ? {} : { territory }) },
  }).id
  return id
}
async function territory(id: string, paths: string[], by: Agent) {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch: { territory: paths } } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().territoryOverlaps
}
function groups(): { id: string; about: string; name: string }[] {
  const rows = t.client.sqlite.prepare("SELECT id, about, name FROM groups WHERE about LIKE 'territory|%' ORDER BY rowid").all() as { id: string; about: string; name: string }[]
  return rows.filter((one) => one.about.split('|').slice(1).some((agentId) => agentsThisCase.has(agentId)))
}
function members(group: string): string[] {
  const rows = t.client.sqlite.prepare('SELECT member_id FROM group_members WHERE group_id = ? AND left_at IS NULL').all(group) as { member_id: string }[]
  return rows.map((one) => one.member_id).sort()
}
function set(value: string) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers: owner,
    payload: { changes: [{ name: settingName, value }], because: 'Measure the territory gate on file-level overlaps.' } })
}

it('1. reads a folder two lines declare as shared, which meets no file either changed in it', async () => {
  const first = await agent(), second = await agent(), third = await agent()
  const earlier = run(first, ['tests/one-made-up.test.ts'])
  expect(await territory(earlier, ['tests'], first)).toEqual({ compared: true, overlaps: [] })
  expect(await territory(run(second, ['tests/a-made-up.test.ts']), ['tests/a-made-up.test.ts'], second)).toEqual({ compared: true, overlaps: [] })
  expect(await territory(run(third, ['tests/three-made-up.test.ts', 'tools/a-made-up.mjs']), ['tests', 'tools'], third))
    .toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
})

it('2. opens one group where two runs change one file in a shared folder, and names it for the file', async () => {
  const first = await agent(), second = await agent(), file = 'src/server/lib/a-made-up-file.ts'
  const earlier = run(first, [file], ['tests', 'src/server/lib'])
  const answer = await territory(run(second, [file]), ['src/server/lib'], second)
  expect(groups()).toHaveLength(1)
  const group = groups()[0]!
  expect(answer).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [file], group: group.id }] })
  expect(group.name).toContain(file)
  expect(members(group.id)).toEqual([first.id, second.id].sort())
})

it('3. meets each path another run changed in a folder one line declares, written folder/** or plain, and none outside it', async () => {
  const first = await agent(), second = await agent(), third = await agent(), fourth = await agent(), fifth = await agent()
  const earlier = run(first, [], ['tools/**'])
  expect((await territory(run(second, ['tools/a-made-up.mjs', 'src/a-made-up.ts']), ['src/a-made-up.ts'], second)).overlaps)
    .toEqual([{ run: earlier, agent: first.id, paths: ['tools/a-made-up.mjs'], group: expect.any(String) }])
  expect((await territory(run(third, ['toolshed/a-made-up.mjs']), ['src/another-made-up.ts'], third)).overlaps, 'a folder meets by whole segments').toEqual([])
  const plain = run(fourth, ['docs/a-made-up.md'], ['docs'])
  expect((await territory(run(fifth, ['docs/another-made-up.md']), ['src/a-third-made-up.ts'], fifth)).overlaps)
    .toEqual([{ run: plain, agent: fourth.id, paths: ['docs/another-made-up.md'], group: expect.any(String) }])
  expect(groups()).toHaveLength(2)
})

it('4. answers a run with no worktree as not checked, in words, and opens no group', async () => {
  const first = await agent(), second = await agent()
  const unread = run(first, null, ['tools'])
  expect(await territory(run(second, ['tools/a-made-up.mjs']), ['tools'], second)).toEqual({ compared: true, overlaps: [],
    notChecked: [{ run: unread, agent: first.id, says: say('territory.notRead', { run: unread, because: say('territory.notReadNoWorktree', {}) }) }] })
  expect(groups()).toHaveLength(0)
})

it('5. leaves out a secretary that is not one of the two lines, which still reads the group, and keeps one that is', async () => {
  const secretary = await agent(null, 'secretary')
  const first = await agent(secretary), second = await agent(secretary), stranger = await agent(secretary)
  const file = 'src/shared/a-made-up-file.ts'
  const firstRun = run(first, [file], [file]), secondRun = run(second, [file])
  await territory(secondRun, [file], second)
  expect(groups()).toHaveLength(1)
  const group = groups()[0]!
  expect(members(group.id)).toEqual([first.id, second.id].sort())
  // EACH SIDE OF THE LINE NAMES THE AGENT AND ITS RUN (wave 13u round 183).
  const side = (who: Agent, runId: string) => say('territory.aLineAndItsRun', { agent: who.handle, run: runId })
  const line = theOverlapLine(file, side(second, secondRun), side(first, firstRun))
  const read = async (who: Agent) => {
    const reply = await app.inject({ method: 'GET', url: `/api/messages?group=${group.id}&full=1`, headers: who.headers })
    expect(reply.statusCode, reply.body).toBe(200)
    return (reply.json().messages as { body: string }[]).map((one) => one.body)
  }
  expect(await read(secretary)).toContain(line)
  expect(await read(stranger), 'an agent that is neither in the group nor a secretary').not.toContain(line)
  // THE SECRETARY'S OWN RUN, with a supervisor the person started: the secretary is one of the two lines.
  const own = await agent()
  run(secretary, ['tools/a-made-up.mjs'], ['tools/a-made-up.mjs'])
  await territory(run(own, ['tools/a-made-up.mjs']), ['tools/a-made-up.mjs'], own)
  expect(groups()).toHaveLength(2)
  expect(members(groups()[1]!.id)).toEqual([secretary.id, own.id].sort())
})

it('6. refuses no write at block whose run meets the other only at a shared folder', async () => {
  const first = await agent(), second = await agent()
  run(first, ['tests/one-made-up.test.ts'], ['tests'])
  expect((await set('block')).statusCode).toBe(200)
  expect(await territory(run(second, ['tests/a-made-up.test.ts']), ['tests', 'tests/a-made-up.test.ts'], second))
    .toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
})
