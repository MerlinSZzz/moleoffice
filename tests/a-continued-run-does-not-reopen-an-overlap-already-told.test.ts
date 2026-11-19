// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT RESUMES AN UNSEALED RUN OF THE SAME AGENT DOES NOT REOPEN AN OVERLAP ALREADY TOLD.
 *
 * On 1 November 2026, between 16:58 and 17:01, the sandboxes' login reached its weekly limit and five runs that had
 * stopped mid-work, without a seal, were resumed as new runs. Each new run wrote its territory again, and the office
 * opened a fresh group for every pair whose territories overlapped: the second or third group that day for the same
 * two agents and the same path. The round launcher files every run that continues another with a `derived_from` link
 * to it, a resumed round and a line's next round alike. A run now inherits what the run it continues was told only
 * when that run holds no seal. A run after a sealed run is a new round with new work, and it is told as before.
 * When a line in the two lines' group already told an earlier run of the line, and covers every place where the two
 * territories meet, nothing is written and the overlap's entry names that group. A new path, a run after a sealed
 * run, or a group that holds the "Overlap ended" line, is said in the group again. Two agents in one starter chain
 * still get no group, and a pair where neither run continues another run of its agent is compared as before.
 *
 * ONE GROUP FOR TWO LINES (wave 13u round 183). The group is keyed by the two agents now, so a meeting that is not told
 * is one new line in the same group, and never a second group. A third agent gets a group of its own. So each case
 * here counts the group's lines as well as its groups.
 * tests/two-lines-that-meet-again-keep-one-overlap-group.test.ts measures the line's words and who it is delivered to.
 *
 * Each case owns its agents in one office database and HOME. Measures the record door's territory write, the groups
 * it opens and the lines it writes. The continued run is filed the way the launcher files it: the link with the run,
 * the territory after. Since round 194 two runs meet only where the paths they changed meet. Each run has a worktree of
 * its own in that HOME (a-worktree-of-its-own.ts), in which it changed `tools/a-tool.mjs`. Both lines declare
 * `tools/**`, a folder two agents declare and so shared, and they meet at the one file both changed.
 *
 * MUTATIONS, WITH A CONTROL RUN FIRST:
 * Control: every case green on the finished code.
 * - Never find the overlap told (theOverlapWasTold returns false): the told pair, the loop, the both-sides and the
 *   sealed-then-resumed cases turn red.
 * - Take only the run itself into its line, without its predecessors: the told pair, the loop, the both-sides and
 *   the sealed-then-resumed cases turn red.
 * - Take every run of the same agent into its line, linked or sealed or not: the no-link, the sealed-then-resumed
 *   and the walk-past cases turn red.
 * - Key every territory group the same, whoever the agents are: the other agent's link case turns red, with every
 *   other case but the one-chain case.
 * - Read every line of a group, those before its "Overlap ended" line too (theRunPairsAGroupTold): the closed
 *   group case turns red.
 * - Read every new meeting place as covered: the new path case turns red.
 * - Count an overlap only when its group is opened: the told pair case turns red on the count.
 * - Remove the starter-chain check: the one-chain case turns red.
 * - Take a sealed run into its line like an unsealed one: the sealed-then-resumed and the walk-past cases turn red.
 * Round 194 ran three of its own, each one line of src/server/lib/claims.ts:
 * - Do not add the paths both runs changed (whereTwoRunsMeet): every case but the one-chain case turns red.
 * - Answer told for every pair (theOverlapWasTold): the new path, the closed group, the no-link, the sealed-then-resumed
 *   and the walk-past cases turn red.
 * - Take a continued pair as told when any one path where they meet was told, not every one: the new path case turns
 *   red alone.
 * Restore each changed source from its saved finished copy, compare the two byte for byte, then run green again.
 * The visited set in the walk has no mutation of its own. Without it the loop case never returns, and a case's time
 * limit cannot stop a loop that never yields. The loop case returning at all is its proof. The same-agent check on a
 * predecessor has no case of its own since round 183: a group of two agents holds lines naming only their runs, so a
 * run of another agent taken into a line could never match a told pair.
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

const settingName = 'MOLE_OFFICE_GATE_TERRITORIES'
const owner = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
type Agent = { id: string; handle: string; headers: Record<string, string> }
/** The file every run here changed, unless a case says which. */
const changed = 'tools/a-tool.mjs'
let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')
/** The agents this case registered, so a count sees only the groups this case opened. */
let agentsThisCase: Set<string>

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'continued-territory-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv(settingName, undefined)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
}, 60_000)

beforeEach(() => {
  agentsThisCase = new Set()
  t.client.sqlite.prepare('DELETE FROM gate_counts').run()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, so a territory is compared with this case's runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
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

async function agent(starter?: Agent): Promise<Agent> {
  const handle = randomUUID()
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: starter?.headers ?? owner,
    payload: { handle, name: 'A test participant', role: 'supervisor', runtime: 'claude-code', workArea: [`tests/${randomUUID()}`] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = participants.agentByHandle(handle)!
  agentsThisCase.add(row.id)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}
function actorOf(who: Agent) {
  return { type: 'agent' as const, id: who.id, provedBy: 'an-agent-key' as const, keyHolder: who.id }
}
/**
 * A run of this agent, running, in a worktree of its own where it changed these paths, with a territory stored without
 * a comparison when one is given.
 */
function run(who: Agent, territory?: string[], changes: string[] = [changed]): string {
  const at = aWorktreeOfItsOwn(home)
  theRunChanges(at.workingDirectory, changes)
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A continued territory test run',
    actor: actorOf(who),
    data: { state: 'running', runtime: 'claude-code', servingAgentId: who.id, ...at, ...(territory === undefined ? {} : { territory }) },
  }).id
  return id
}
/** The run stops, as a run stops when its login reaches its limit. */
function ends(id: string): void {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE id = ?").run(id)
}
/**
 * The run is sealed. Only what the comparison reads is written: the state a sealed run has and a seal's id in
 * `sealedTip`. No seal is made, and nothing else in this office reads this one.
 */
function seals(id: string): void {
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'finished', '$.sealedTip', ?) WHERE id = ?")
    .run(`a-test-seal-${randomUUID()}`, id)
}
/** A new run of the same agent that continues `before`, filed with its link as the round launcher files it. */
function continues(before: string, who: Agent, changes?: string[]): string {
  const next = run(who, undefined, changes)
  t.api.createLink({ fromId: next, toId: before, type: 'derived_from', actor: actorOf(who) })
  return next
}
function patch(id: string, territory: string[], by: Agent) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch: { territory } } })
}
/** Write a territory through the record door and answer its overlaps. */
async function claim(id: string, territory: string[], by: Agent): Promise<{ run: string; agent: string; paths: string[]; group?: string }[]> {
  const reply = await patch(id, territory, by)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().territoryOverlaps.overlaps
}
function groups(): { id: string; about: string }[] {
  const rows = t.client.sqlite.prepare("SELECT id, about FROM groups WHERE about LIKE 'territory|%' ORDER BY rowid").all() as { id: string; about: string }[]
  return rows.filter((one) => one.about.split('|').slice(1).some((agentId) => agentsThisCase.has(agentId)))
}
async function linesIn(group: string): Promise<number> {
  const { messagesInAGroup } = await import('../src/server/lib/messages.ts')
  const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
  return messagesInAGroup(group, EVERY_PROJECT).length
}
function reminded(): number {
  const row = t.client.sqlite.prepare("SELECT reminded FROM gate_counts WHERE gate = 'file-territories'").get() as { reminded: number } | undefined
  return row?.reminded ?? 0
}
/** Two agents in different chains whose runs meet where both changed, and the one group the office opened for them. */
async function aToldPair(path: string[], theirs = path, theirChanges?: string[]) {
  const first = await agent(), second = await agent()
  const firstRun = run(first, path), secondRun = run(second, undefined, theirChanges)
  const told = await claim(secondRun, theirs, second)
  expect(told).toHaveLength(1)
  expect(groups()).toHaveLength(1)
  return { first, second, firstRun, secondRun, group: groups()[0]!.id }
}

it('opens no group for a continued run whose pair and path were told, and names the told group', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const before = await linesIn(group)
  ends(firstRun)
  const next = continues(firstRun, first)
  expect(await claim(next, ['tools/**'], first)).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  // NO LINE IS WRITTEN INTO THE TOLD GROUP: its members are the agents, and a continuation changes neither.
  expect(await linesIn(group)).toBe(before)
  // THE GATE STILL COUNTS THE OVERLAP IT FOUND, told or not.
  expect(reminded()).toBe(2)
  // A THIRD RUN IN THE SAME LINE inherits it too, through the run it continues.
  ends(next)
  const third = continues(next, first)
  expect(await claim(third, ['tools/a-tool.mjs'], first)).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
})

it('opens no group when both sides have continued, as the 16:58 and 17:00 pair did', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const before = await linesIn(group)
  ends(firstRun)
  const firstNext = continues(firstRun, first)
  expect((await claim(firstNext, ['tools/**'], first))[0]?.group).toBe(group)
  ends(secondRun)
  const secondNext = continues(secondRun, second)
  expect(await claim(secondNext, ['tools/**'], second)).toEqual([{ run: firstNext, agent: first.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before)
})

it('says a continued run that overlaps the same pair on a new path in the pair\'s group', async () => {
  const both = [changed, 'src/web/App.tsx']
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'], ['tools/**', 'src/web/**'], both)
  const before = await linesIn(group)
  ends(firstRun)
  const next = continues(firstRun, first, both)
  const overlaps = await claim(next, ['tools/**', 'src/web/App.tsx'], first)
  expect(overlaps).toHaveLength(1)
  expect(overlaps[0]).toMatchObject({ run: secondRun, agent: second.id, paths: ['src/web/App.tsx', changed], group })
  expect(groups().map((one) => one.id)).toEqual([group])
  expect(groups()[0]!.about).toBe(['territory', ...[first.id, second.id].sort()].join('|'))
  expect(await linesIn(group)).toBe(before + 1)
})

it('says the next meeting in the pair\'s group after it holds the overlap ended line', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const { writeASystemLine } = await import('../src/server/lib/groups.ts')
  const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
  writeASystemLine(group, 'default', SYSTEM_LINES.theOverlapEnded('the two lines settled it'), { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  const before = await linesIn(group)
  ends(firstRun)
  const next = continues(firstRun, first)
  const overlaps = await claim(next, ['tools/**'], first)
  expect(overlaps).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before + 1)
})

it('opens no group for two agents in one starter chain, continued or not', async () => {
  const first = await agent(), second = await agent(first)
  const firstRun = run(first, ['tools/**']), secondRun = run(second)
  expect(await claim(secondRun, ['tools/**'], second)).toEqual([])
  ends(firstRun)
  const next = continues(firstRun, first)
  expect(await claim(next, ['tools/**'], first)).toEqual([])
  expect(groups()).toHaveLength(0)
})

it('compares a run with no continuation link as before, and says it in its pair\'s group', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const before = await linesIn(group)
  ends(firstRun)
  const unlinked = run(first)
  const overlaps = await claim(unlinked, ['tools/**'], first)
  expect(overlaps).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before + 1)
})

it('does not take a link to another agent run as a continuation', async () => {
  const { second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const third = await agent()
  ends(firstRun)
  // THE THIRD AGENT'S RUN NAMES THE FIRST AGENT'S RUN: it is no continuation of it, so nothing was told to it.
  const linked = continues(firstRun, third)
  const overlaps = await claim(linked, ['tools/**'], third)
  expect(overlaps).toHaveLength(1)
  expect(overlaps[0]).toMatchObject({ run: secondRun, agent: second.id, paths: [changed] })
  expect(overlaps[0]!.group).not.toBe(group)
  expect(groups()).toHaveLength(2)
})

it('ends its walk on a loop of continuation links and still finds the told group', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const before = await linesIn(group)
  ends(firstRun)
  const next = continues(firstRun, first)
  // A LINK BACK makes the two runs continue each other. Nothing refuses it, so the walk has to end on its own.
  t.api.createLink({ fromId: firstRun, toId: next, type: 'derived_from', actor: actorOf(first) })
  expect(await claim(next, ['tools/**'], first)).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before)
})

it('says the next round after a sealed run in the pair\'s group, and nothing for that round resumed without a seal', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const before = await linesIn(group)
  // THE FIRST LINE'S ROUND IS SEALED. Its next round is new work on the same path, so both lines are told of it again.
  seals(firstRun)
  const nextRound = continues(firstRun, first)
  expect(await claim(nextRound, ['tools/**'], first)).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before + 1)
  // THAT ROUND STOPS WITHOUT A SEAL and is resumed. The resumed run was told through the next round's line.
  ends(nextRound)
  const resumed = continues(nextRound, first)
  expect(await claim(resumed, ['tools/**'], first)).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before + 1)
})

it('does not walk past a sealed run to the line its round was told by', async () => {
  const { first, second, firstRun, secondRun, group } = await aToldPair(['tools/**'])
  const before = await linesIn(group)
  seals(firstRun)
  // THE NEXT ROUND STOPS BEFORE IT WRITES A TERRITORY, so nothing was told to its work.
  const nextRound = continues(firstRun, first)
  ends(nextRound)
  const resumed = continues(nextRound, first)
  expect(await claim(resumed, ['tools/**'], first)).toEqual([{ run: secondRun, agent: second.id, paths: [changed], group }])
  expect(groups()).toHaveLength(1)
  expect(await linesIn(group)).toBe(before + 1)
})
