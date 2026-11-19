// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO LINES THAT MEET AGAIN KEEP ONE OVERLAP GROUP (wave 13u round 183, the requirement of 8 November 2026).
 *
 * The question was why the office opens a new group each time. A territory group was keyed by the pair of runs. A line's
 * next round after a seal is a new run, so the same two lines got a new group every round, and the same "Group opened"
 * lines were read again and again. Now a territory group is keyed by the two lines' agents, as a work-area group is.
 * When the same two agents meet again, the office writes one line in their group naming the new runs and the place,
 * and opens nothing. A group whose overlap ended is used again the same way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, through the record door, in an office database and HOME of its own
 * ---------------------------------------------------------------------------------------
 *
 *   1. Two rounds of the same two lines that meet on one file leave one group with two overlap lines, one for each
 *      meeting, each naming its two runs and the file. Writing the same territories again adds no line.
 *   2. A third line that meets one of the two opens its own group, and its next round is said in that group.
 *   3. The second meeting is delivered to the group's members, one line each, and to nobody else: not to the
 *      secretary above both lines.
 *   4. A group that holds the "Overlap ended" line is used again for the next meeting, which is said in it.
 *
 * Each case makes its own agents, so a count sees only the groups between this case's agents. Every path, agent and
 * run is made up. Since round 194 two runs meet only where the paths they changed meet, so each run has a worktree of
 * its own (a-worktree-of-its-own.ts) in which it changed every file its territory names. The line's words are read from the word list, so a change of the words does not turn this red.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the finished code. Each mutation is in src/server/lib/claims.ts.
 *
 *   1. `theTerritoryGroupKey`: key the group by the two runs again → 1, 2, 3 and 4 red.
 *   2. `theOverlapWasTold`: answer true for every pair → 1, 2, 3 and 4 red, as no second line is written.
 *   3. `theOverlapWasTold`: answer false for every pair → 1 red, on the territories written again.
 *   4. `sayAnOverlapLine`: write no `discusses` link from the line to the two runs → 1 red, as above.
 *   5. `theRunPairsAGroupTold`: read every line, including those before "Overlap ended" → 4 red.
 *   6. `theRunsALineHolds`: take a sealed run in like an unsealed one → 1, 2 and 3 red, as a next round is told.
 *   7. `aLineAndItsRun`: name the agent only, without its run → 1, 2, 3 and 4 red, on the line's words.
 *
 * Round 194 gave each run a worktree of its own and ran 2 again (1, 2, 3 and 4 red), and one more:
 * `theMembersOfAWorkAreaGroup`: leave out the secretary check → 3 red.
 *
 * Restore each changed source from its saved finished copy, compare the two byte for byte, then run green again.
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
type Line = { id: string; body: string; notice: string | null }
let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')
let say: (key: string, values: Record<string, string>) => string
let theOverlapLine: (path: string, first: string, second: string) => string
let kinds: { overlap: string; opened: string }
let linesIn: (group: string) => Line[]
/**
 * The agents and runs this case made, so a count sees only the groups this case opened. A group is keyed by its two
 * agents. Before round 183 it was keyed by its two runs, so the runs are here for a control on that code.
 */
let madeThisCase: Set<string>

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'lines-meet-again-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv(settingName, undefined)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
  const words = await import('../src/shared/i18n.ts')
  // READ AS ANY KEY, since the word that names a line and its run is added by the code this file measures.
  say = words.sayInEnglish as (key: string, values: Record<string, string>) => string
  const lines = await import('../src/shared/groups.ts')
  theOverlapLine = (path, first, second) => lines.SYSTEM_LINES.territoriesInConflict(path, first, second).line
  kinds = { overlap: lines.SYSTEM_LINES.territoriesInConflict('', '', '').notice, opened: lines.SYSTEM_LINES.groupOpened('', '').notice }
  const { messagesInAGroup } = await import('../src/server/lib/messages.ts')
  const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
  linesIn = (group) => messagesInAGroup(group, EVERY_PROJECT).map((one) => ({ id: one.id, body: one.body, notice: one.notice }))
}, 60_000)

beforeEach(() => {
  madeThisCase = new Set()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  vi.stubEnv(settingName, undefined)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, so a territory is compared with this case's runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
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
  madeThisCase.add(row.id)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}
function actorOf(who: Agent) {
  return { type: 'agent' as const, id: who.id, provedBy: 'an-agent-key' as const, keyHolder: who.id }
}
/** Each run's worktree, by the run. */
const worktrees = new Map<string, string>()
/**
 * A running run of this agent in a worktree of its own, with a territory stored without a comparison when one is given,
 * whose files the run changed.
 */
function run(who: Agent, territory?: string[]): string {
  const at = aWorktreeOfItsOwn(home)
  theRunChanges(at.workingDirectory, territory ?? [])
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up territory run',
    actor: actorOf(who),
    data: { state: 'running', runtime: 'claude-code', servingAgentId: who.id, ...at, ...(territory === undefined ? {} : { territory }) },
  }).id
  madeThisCase.add(id)
  worktrees.set(id, at.workingDirectory)
  return id
}
/** The run stops without a seal, as a run stops when its login reaches its limit. */
function ends(id: string): void {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE id = ?").run(id)
}
/** The run is sealed. Only what the comparison reads is written: a sealed run's state and a made-up seal id in `sealedTip`. */
function seals(id: string): void {
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'finished', '$.sealedTip', ?) WHERE id = ?")
    .run(`a-made-up-seal-${randomUUID()}`, id)
}
/** The next run of the same agent, filed with its link to `before` as the round launcher files it. */
function continues(before: string, who: Agent): string {
  const next = run(who)
  t.api.createLink({ fromId: next, toId: before, type: 'derived_from', actor: actorOf(who) })
  return next
}
/** The run changes every file of this territory, which is then written through the record door: answer its overlaps. */
async function claim(id: string, territory: string[], by: Agent): Promise<{ run: string; agent: string; paths: string[]; group?: string }[]> {
  theRunChanges(worktrees.get(id)!, territory)
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch: { territory } } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().territoryOverlaps.overlaps
}
/** The territory groups this case opened, oldest first. */
function groups(): { id: string; about: string }[] {
  const rows = t.client.sqlite.prepare("SELECT id, about FROM groups WHERE about LIKE 'territory|%' ORDER BY rowid").all() as { id: string; about: string }[]
  return rows.filter((one) => one.about.split('|').slice(1).every((id) => madeThisCase.has(id)))
}
function members(group: string): string[] {
  const rows = t.client.sqlite.prepare('SELECT member_id FROM group_members WHERE group_id = ? AND left_at IS NULL').all(group) as { member_id: string }[]
  return rows.map((one) => one.member_id).sort()
}
/** The overlap lines in a group, oldest first, as their bodies. */
function overlapLines(group: string): string[] {
  return linesIn(group).filter((one) => one.notice === kinds.overlap).map((one) => one.body)
}
/** One side of an overlap line: the agent's handle and its run, in the word list's words. */
function side(who: Agent, runId: string): string {
  return say('territory.aLineAndItsRun', { agent: who.handle, run: runId })
}
/** Every delivery row the office holds, as recipient and message. */
function deliveries(): { recipient: string; message: string }[] {
  return t.client.sqlite.prepare('SELECT recipient_id AS recipient, message_id AS message FROM message_delivery ORDER BY recipient_id, message_id').all() as { recipient: string; message: string }[]
}

it('1. keeps one group when two rounds of the same two lines meet on one file, with one overlap line for each meeting', async () => {
  const first = await agent(), second = await agent(), file = 'src/server/lib/a-made-up-file.ts'
  const firstRun = run(first, [file]), secondRun = run(second)
  const told = await claim(secondRun, [file], second)
  expect(groups()).toHaveLength(1)
  const group = groups()[0]!.id
  expect(told).toEqual([{ run: firstRun, agent: first.id, paths: [file], group }])
  // THE FIRST LINE'S ROUND IS SEALED, and its next round names the same file.
  seals(firstRun)
  const nextRound = continues(firstRun, first)
  expect(await claim(nextRound, [file], first)).toEqual([{ run: secondRun, agent: second.id, paths: [file], group }])
  expect(groups().map((one) => one.id)).toEqual([group])
  expect(overlapLines(group)).toEqual([
    theOverlapLine(file, side(second, secondRun), side(first, firstRun)),
    theOverlapLine(file, side(first, nextRound), side(second, secondRun)),
  ])
  expect(linesIn(group).filter((one) => one.notice === kinds.opened)).toHaveLength(1)
  // THE SAME TWO RUNS WRITE THEIR TERRITORIES AGAIN, wider: nothing new has met, so nothing is said.
  expect((await claim(nextRound, [file, 'tools/a-made-up.mjs'], first))[0]?.group).toBe(group)
  expect((await claim(secondRun, [file, 'tests/a-made-up.test.ts'], second))[0]?.group).toBe(group)
  expect(overlapLines(group)).toHaveLength(2)
  expect(groups()).toHaveLength(1)
})

it('2. opens its own group for a third line that meets one of the two, and says that line\'s next round in it', async () => {
  const first = await agent(), second = await agent(), third = await agent(), file = 'src/shared/a-made-up-file.ts'
  const firstRun = run(first, [file]), secondRun = run(second)
  await claim(secondRun, [file], second)
  expect(groups()).toHaveLength(1)
  const pair = groups()[0]!.id
  const said = linesIn(pair).length
  ends(secondRun)
  const thirdRun = run(third)
  const met = await claim(thirdRun, [file], third)
  expect(met).toHaveLength(1)
  expect(met[0]).toMatchObject({ run: firstRun, agent: first.id, paths: [file] })
  const own = met[0]!.group!
  expect(own).not.toBe(pair)
  expect(members(own)).toEqual([first.id, third.id].sort())
  // THE THIRD LINE'S NEXT ROUND meets the same line again, and is said in the third line's group.
  seals(thirdRun)
  const thirdNext = continues(thirdRun, third)
  expect(await claim(thirdNext, [file], third)).toEqual([{ run: firstRun, agent: first.id, paths: [file], group: own }])
  expect(groups().map((one) => one.id)).toEqual([pair, own])
  expect(overlapLines(own)).toEqual([
    theOverlapLine(file, side(third, thirdRun), side(first, firstRun)),
    theOverlapLine(file, side(third, thirdNext), side(first, firstRun)),
  ])
  expect(linesIn(pair)).toHaveLength(said)
})

it('3. delivers the second meeting to each member of the group once, and to nobody else', async () => {
  const secretary = await agent(null, 'secretary')
  const first = await agent(secretary), second = await agent(secretary), file = 'tools/a-made-up-tool.mjs'
  const firstRun = run(first, [file]), secondRun = run(second)
  await claim(secondRun, [file], second)
  const group = groups()[0]!.id
  expect(members(group)).toEqual([first.id, second.id].sort())
  const before = deliveries()
  seals(firstRun)
  const nextRound = continues(firstRun, first)
  await claim(nextRound, [file], first)
  const line = linesIn(group).at(-1)!
  expect(line.body).toBe(theOverlapLine(file, side(first, nextRound), side(second, secondRun)))
  const added = deliveries().filter((one) => !before.some((old) => old.recipient === one.recipient && old.message === one.message))
  expect(added).toEqual([first.id, second.id].sort().map((recipient) => ({ recipient, message: line.id })))
})

it('4. says the next meeting in a group whose overlap ended, and opens nothing', async () => {
  const first = await agent(), second = await agent(), file = 'src/web/a-made-up-page.tsx'
  const firstRun = run(first, [file]), secondRun = run(second)
  await claim(secondRun, [file], second)
  const group = groups()[0]!.id
  const { writeASystemLine } = await import('../src/server/lib/groups.ts')
  const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
  writeASystemLine(group, 'default', SYSTEM_LINES.theOverlapEnded('the two lines settled it'), { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  // THE FIRST LINE'S RUN STOPS WITHOUT A SEAL and is resumed. What was told before the end is not told any more.
  ends(firstRun)
  const resumed = continues(firstRun, first)
  expect(await claim(resumed, [file], first)).toEqual([{ run: secondRun, agent: second.id, paths: [file], group }])
  expect(groups().map((one) => one.id)).toEqual([group])
  expect(overlapLines(group)).toEqual([
    theOverlapLine(file, side(second, secondRun), side(first, firstRun)),
    theOverlapLine(file, side(first, resumed), side(second, secondRun)),
  ])
})
