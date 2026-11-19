// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OVERLAP GROUP OPENS ONLY WHERE TWO RUNS' CHANGED PATHS MEET (wave 13u round 194).
 *
 * Two runs used to meet wherever their declared territories met, so two lines that declare the same folders met every
 * round, whatever files each changed. Now two runs meet only at a path one of them changed since its cut: a path both
 * changed, or a path one changed under a narrow entry of the other's territory. A folder two or more agents declare is
 * shared and meets nothing by itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, through the record door, in an office database and HOME of its own
 * ---------------------------------------------------------------------------------------
 *
 *   1. Two runs that change different files in one folder both declare open no group and send no line.
 *   2. Two runs that change one file open one group, and its opening line names that path.
 *   3. A path one run changed under a folder only the other run's line declares opens a group, though that other run has
 *      changed nothing.
 *   4. A run that changes a file only after its territory was written is compared again at its first finished send, and
 *      the group opens then.
 *   5. A worktree that cannot be read and a run with no cutFrom are each answered as not checked, in words, with no group.
 *   6. A Git read that does not end is answered as not checked when its deadline passes, and while it waits another
 *      request is answered.
 *
 * Every worktree is a Git repository made in this file's HOME, and every path, agent and run is made up. Words are read
 * by their key and the deadline from its constant, so a change of either does not turn this red.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the finished code. Each mutation is one line of src/server/lib/claims.ts.
 *
 *   1. `whereTwoRunsMeet`: do not pass over a shared folder → 1, 2, 4, 5 and 6 red.
 *   2. `whereTwoRunsMeet`: do not add the paths both runs changed → 2 and 4 red.
 *   3. `whereTwoRunsMeet`: do not add the paths under a narrow entry → 3 red.
 *   4. `theFirstFinishedSendOf`: answer false → 4 red.
 *   5. `whereTwoRunsMeet`: say nothing of a run whose changes are not known → 5 and 6 red.
 *   6. `readTheChangedPaths`: read the cut with a Git that holds the thread → 6 red.
 *
 * Restore each changed source from its saved finished copy, compare the two by sha256, then run green again.
 */
import { afterAll, beforeAll, beforeEach, expect, it, vi, type MockInstance } from 'vitest'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const settingName = 'MOLE_OFFICE_GATE_TERRITORIES'
const owner = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
type Agent = { id: string; handle: string; headers: Record<string, string> }
type AnOverlap = { run: string; agent: string; paths: string[]; group?: string; notChecked?: string }
type TheAnswer = { compared: true; overlaps: AnOverlap[]; notChecked?: { run: string; agent: string; says: string }[] }
let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')
let say: (key: string, values?: Record<string, string>) => string
let theOverlapLine: (path: string, first: string, second: string) => string
let linesIn: (group: string) => string[]
/** The deadline of one worktree's Git read, read from the code this file measures. */
let deadline: number
/** The class each worktree's Git read runs in, whose `close` says that read has ended. */
let theGitSession: { prototype: { close: () => void } }
/** The agents this case registered, so a count sees only the groups this case opened. */
let agentsThisCase: Set<string>

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'changed-paths-territory-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv(settingName, undefined)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  participants = await import('../src/server/lib/participants.ts')
  const words = await import('../src/shared/i18n.ts')
  // READ AS ANY KEY, since the words are added by the code this file measures.
  say = words.sayInEnglish as (key: string, values?: Record<string, string>) => string
  const lines = await import('../src/shared/groups.ts')
  theOverlapLine = (path, first, second) => lines.SYSTEM_LINES.territoriesInConflict(path, first, second).line
  const { messagesInAGroup } = await import('../src/server/lib/messages.ts')
  const { EVERY_PROJECT } = await import('../src/shared/which-projects.ts')
  linesIn = (group) => messagesInAGroup(group, EVERY_PROJECT).map((one) => one.body)
  // READ WITH Reflect.get, since the constant is added by the code this file measures.
  deadline = Reflect.get(await import('../src/server/lib/claims.ts'), 'CHANGED_PATHS_DEADLINE_MS') as number
  theGitSession = Reflect.get(await import('../src/server/lib/async-take-back.ts'), 'GitSession') as typeof theGitSession
}, 60_000)

beforeEach(async () => {
  agentsThisCase = new Set()
  t.client.sqlite.prepare('DELETE FROM runtime_settings WHERE name = ?').run(settingName)
  vi.stubEnv(settingName, undefined)
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, so a territory is compared with this case's runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
})

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

async function agent(): Promise<Agent> {
  const handle = randomUUID()
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: owner,
    payload: { handle, name: 'A made-up participant', role: 'supervisor', runtime: 'claude-code', workArea: [`tests/${randomUUID()}`] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = participants.agentByHandle(handle)!
  agentsThisCase.add(row.id)
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}

/** Git in a made-up repository, with no configuration of this machine's and a made-up author. */
function git(folder: string, ...args: string[]): string {
  return execFileSync('git', ['-C', folder, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'A made-up author', GIT_AUTHOR_EMAIL: 'made-up@example.invalid',
      GIT_COMMITTER_NAME: 'A made-up author', GIT_COMMITTER_EMAIL: 'made-up@example.invalid',
    },
  })
}
/** A made-up worktree whose one commit holds these files: its folder and that commit, which is its cut. */
function worktree(...files: string[]): { folder: string; cut: string } {
  const folder = mkdtempSync(join(home, 'worktree-'))
  git(folder, 'init', '-q')
  for (const file of ['a-made-up-readme.md', ...files]) write(folder, file, 'as it was cut\n')
  git(folder, 'add', '-A')
  git(folder, 'commit', '-q', '-m', 'The made-up cut')
  return { folder, cut: git(folder, 'rev-parse', 'HEAD').trim() }
}
function write(folder: string, file: string, text = 'changed by the run\n') {
  mkdirSync(dirname(join(folder, file)), { recursive: true })
  writeFileSync(join(folder, file), text)
}
/** A running run of this agent, with these of its worktree and cut; a field left out is not stored. */
function run(who: Agent, at: { folder?: string; cut?: string }, territory?: string[]): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up territory run',
    actor: { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id },
    data: { state: 'running', runtime: 'claude-code', servingAgentId: who.id,
      ...(at.folder === undefined ? {} : { workingDirectory: at.folder }), ...(at.cut === undefined ? {} : { cutFrom: at.cut }),
      ...(territory === undefined ? {} : { territory }) },
  }).id
}
function patch(id: string, dataPatch: Record<string, unknown>, by: Agent) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch } })
}
async function territory(id: string, paths: string[], by: Agent): Promise<TheAnswer> {
  const reply = await patch(id, { territory: paths }, by)
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().territoryOverlaps
}
function groups(): { id: string; about: string; name: string }[] {
  const rows = t.client.sqlite.prepare("SELECT id, about, name FROM groups WHERE about LIKE 'territory|%' ORDER BY rowid").all() as { id: string; about: string; name: string }[]
  return rows.filter((one) => one.about.split('|').slice(1).some((agentId) => agentsThisCase.has(agentId)))
}
/** How many lines discuss either run: an overlap line is linked to the two runs it names. */
function linesAbout(...runs: string[]): number {
  const marks = runs.map(() => '?').join(', ')
  return (t.client.sqlite.prepare(`SELECT count(*) AS n FROM links WHERE type = 'discusses' AND to_id IN (${marks})`).get(...runs) as { n: number }).n
}
const side = (who: Agent, runId: string) => say('territory.aLineAndItsRun', { agent: who.handle, run: runId })

it('1. opens no group and writes no line for two runs that change different files in one folder both declare', async () => {
  const first = await agent(), second = await agent(), folder = `src/${randomUUID()}`
  const one = worktree(`${folder}/kept.ts`), two = worktree(`${folder}/kept.ts`)
  write(one.folder, `${folder}/first.ts`)
  write(two.folder, `${folder}/second.ts`)
  const earlier = run(first, one, [folder])
  const later = run(second, two)
  expect(await territory(later, [folder], second)).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
  expect(linesAbout(earlier, later)).toBe(0)
})

it('2. opens one group for two runs that change one file, and its opening line names that path', async () => {
  const first = await agent(), second = await agent(), folder = `src/${randomUUID()}`, file = `${folder}/both.ts`
  const one = worktree(file), two = worktree(file)
  write(one.folder, file)
  write(two.folder, file)
  write(two.folder, `${folder}/only-the-second.ts`)
  const earlier = run(first, one, [folder])
  const later = run(second, two)
  const answer = await territory(later, [folder], second)
  expect(groups()).toHaveLength(1)
  const group = groups()[0]!
  expect(answer).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [file], group: group.id }] })
  expect(linesIn(group.id)).toContain(theOverlapLine(file, side(second, later), side(first, earlier)))
})

it('3. opens a group where one run changed a path under a folder only the other line declares, which changed nothing', async () => {
  const first = await agent(), second = await agent(), own = `tools/${randomUUID()}`, file = `${own}/changed-by-the-second.mjs`
  const one = worktree(`${own}/kept.mjs`), two = worktree(`${own}/kept.mjs`)
  write(two.folder, file)
  const earlier = run(first, one, [own])
  const later = run(second, two)
  const answer = await territory(later, [`src/${randomUUID()}`], second)
  expect(groups()).toHaveLength(1)
  expect(answer).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [file], group: groups()[0]!.id }] })
})

it('4. compares a run again at its first finished send, and opens the group then', async () => {
  const first = await agent(), second = await agent(), folder = `src/${randomUUID()}`, file = `${folder}/both.ts`
  const one = worktree(file), two = worktree(file)
  write(one.folder, file)
  const earlier = run(first, one, [folder])
  const later = run(second, two)
  expect(await territory(later, [folder], second)).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toHaveLength(0)
  write(two.folder, file)
  const finished = await patch(later, { state: 'finished' }, second)
  expect(finished.statusCode, finished.body).toBe(200)
  expect(groups()).toHaveLength(1)
  expect(finished.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [file], group: groups()[0]!.id }] })
})

it('5. answers a worktree that cannot be read and a run with no cutFrom as not checked, in words, and opens no group', async () => {
  const first = await agent(), second = await agent(), third = await agent(), folder = `src/${randomUUID()}`, file = `${folder}/both.ts`
  const gone = join(home, `a-made-up-worktree-${randomUUID()}`)
  const unread = run(first, { folder: gone, cut: worktree().cut }, [folder])
  const uncut = run(second, { folder: worktree(file).folder }, [folder])
  const three = worktree(file)
  write(three.folder, file)
  const later = run(third, three)
  const answer = await territory(later, [folder], third)
  const notRead = (id: string, because: string) => say('territory.notRead', { run: id, because })
  expect(answer.overlaps).toEqual([])
  // IN EITHER ORDER, since two runs filed in one second are listed in an order of their ids.
  expect([...answer.notChecked ?? []].sort((a, b) => a.run.localeCompare(b.run))).toEqual([
    { run: unread, agent: first.id, says: notRead(unread, say('territory.notReadWorktreeGone', { folder: gone })) },
    { run: uncut, agent: second.id, says: notRead(uncut, say('territory.notReadNoCut')) },
  ].sort((a, b) => a.run.localeCompare(b.run)))
  expect(groups()).toHaveLength(0)
})

/** Wait, in real time and for at most the deadline, until this many Git sessions have closed. */
async function untilClosed(closed: MockInstance, count: number) {
  const started = performance.now()
  while (closed.mock.calls.length < count) {
    if (performance.now() - started > deadline) throw new Error(`${closed.mock.calls.length} of ${count} Git sessions closed in ${deadline} ms`)
    // setInterval is not faked here, so this waits in real time.
    await new Promise<void>((resolve) => { const every = setInterval(() => { clearInterval(every); resolve() }, 20) })
  }
}

it('6. answers a Git read that does not end as not checked when its deadline passes, and answers another request meanwhile', async () => {
  const first = await agent(), second = await agent(), folder = `src/${randomUUID()}`, file = `${folder}/both.ts`
  const stuck = worktree(file)
  write(stuck.folder, file)
  // A HEAD THAT IS A NAMED PIPE WITH NO WRITER: Git opens it to see whether the folder is a repository, and waits there.
  rmSync(join(stuck.folder, '.git', 'HEAD'))
  execFileSync('mkfifo', [join(stuck.folder, '.git', 'HEAD')])
  const earlier = run(first, stuck, [folder])
  const two = worktree(file)
  write(two.folder, file)
  const later = run(second, two)
  const closed = vi.spyOn(theGitSession.prototype, 'close')
  // ONLY THE DEADLINE'S CLOCK IS MADE UP: Git, the helper and every other wait run in real time.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    let settled = false
    const waiting = patch(later, { territory: [folder] }, second).finally(() => { settled = true })
    const asked = performance.now()
    const meanwhile = await app.inject({ method: 'GET', url: `/api/records/${earlier}`, headers: second.headers })
    const took = performance.now() - asked
    expect(meanwhile.statusCode, meanwhile.body).toBe(200)
    expect(took, 'the other request waited for the Git read').toBeLessThan(deadline / 2)
    expect(settled, 'the territory write still waits for its Git read when the other request is answered').toBe(false)
    // THE LATER RUN'S OWN WORKTREE IS READ IN FULL FIRST, so only the read that does not end meets the deadline.
    await untilClosed(closed, 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(deadline)
    const reply = await waiting
    expect(reply.statusCode, reply.body).toBe(200)
    const because = say('territory.notReadTooLong', { seconds: String(deadline / 1000) })
    expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [],
      notChecked: [{ run: earlier, agent: first.id, says: say('territory.notRead', { run: earlier, because }) }] })
    expect(groups()).toHaveLength(0)
  } finally {
    vi.useRealTimers()
    closed.mockRestore()
  }
}, 30_000)
