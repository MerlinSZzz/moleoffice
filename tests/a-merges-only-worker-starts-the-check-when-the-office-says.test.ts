// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A WORKER IN MERGES-ONLY MODE STARTS THE CHECK THE OFFICE ASKS FOR, ONLY WHILE THE OFFICE SAYS CHECKS RUN IN THAT MODE.
 * Wave 13j round loop-1, task "every round ends sealed or says why". 13k round 47b was sealed and its check sat six hours
 * unstarted: the live worker runs with MOLE_OFFICE_MESSAGE_WORKER=merges-only, and in that mode it started nothing but the
 * merge tool. The control is GET and POST /api/office/checks-in-merges-only, kept on the installation row (migration 0251).
 *
 * WHAT IS PROVED HERE, against a real office process and the real worker pass:
 *
 *   1. THE CONTROL CASE. With the control as nobody set it (off), a pass in merges-only mode starts nothing for a queued
 *      check, and the check stays unstarted. So case 2 is the control and not a worker that started checks anyway.
 *   2. With the control on, one pass in merges-only mode starts that check as the office's check tool, and starts no agent
 *      run and writes no held sentence for the messages to agents beside it.
 *   3. How many run at once is the office's setting, read from the switch's reading (the round after X4FMBW2bGWp-). With
 *      it set to 1 and two checks queued, one pass starts one and holds the other in the sentence that names 1.
 *
 * WHAT IS NOT REAL. The check tool is tests/fake-inspection-tool.mjs, named by MOLE_OFFICE_FAKE_INSPECTION_TOOL, so no model
 * is called. The run it checks worked in a throwaway git repository made under the system's temporary folder.
 *
 * MUTATION, RUN ON 11 OCTOBER 2026. A control run first: 2 cases green. Then, in `startOne` in src/worker/index.ts, the
 * condition `!(one.inspection !== undefined && settings.checksInMergesOnly === true)` was removed, so the mode refuses every
 * check again. Case 2 went red ("the check started"). Restored, and the control run again: 2 green.
 *
 * MUTATION FOR CASE 3, RUN ON 16 OCTOBER 2026. A control run first: 3 green. Then in `onePass` in src/worker/index.ts the
 * number handed to `whyNoFurtherCheckNow` was the old constant 3 instead of the reading's: case 3 went red (both checks
 * started). Restored with cp, checked with cmp, and the control run again: green.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whatOnMeans } from '../src/shared/checks-in-merges-only.ts'
import { onePass, whatTheWorkerLastSaidAbout, type WorkerSettings } from '../src/worker/index.ts'

let app: LiveApp
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
const checkout = process.cwd()
let worktree = ''
let theRun = ''
let theCheckMessage = ''
let groupMessage = ''
let inspectorId = ''
let permission = ''
const worktrees: string[] = []

function aThrowawayRepository(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'merges-only-check-')))
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic merges-only check fixture')
  mkdirSync(join(dir, 'src', 'server', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'src', 'server', 'lib', 'fixture.ts'), 'export const before = 1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  git('switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', 'server', 'lib', 'fixture.ts'), 'export const before = 1\nexport const after = 2\n')
  git('commit', '-q', '-am', 'Synthetic work')
  return dir
}

const asPerson = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
/**
 * THE BUILDER WITH ITS OWN KEY, the one the office answered when the builder was registered. A run's own agent ends the
 * run only with a key, even while the key window is open, so the builder finishes its runs with it.
 */
let builderKey = ''
const asTheBuilder = () => ({ ...asAgent('builder-fixture'), 'x-mole-office-key': builderKey })

interface RecordRead { record: { id: string; data: Record<string, unknown> & { theCheck?: { message: string; execution?: { session: string; endedAt?: string } } } } }

async function request<T>(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = asPerson): Promise<T> {
  const res = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`)
  return JSON.parse(text) as T
}
const record = (id: string) => request<RecordRead>(`/api/records/${id}`)

/** A builder's run in a throwaway repository of its own, finished, so the office asks for its check. Its id. */
async function aFinishedRun(title: string): Promise<string> {
  const dir = aThrowawayRepository()
  worktrees.push(dir)
  const tip = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const made = await request<RecordRead>('/api/records', 'POST', {
    kind: 'session', title,
    data: { state: 'running', servingAgent: 'builder-fixture', workingDirectory: dir, cutFrom: 'main', tip, deliveringMessage: groupMessage, doing: 'Synthetic fixture.', extra: { traceFixturePermission: permission } },
  }, asAgent('builder-fixture'))
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
  return made.record.id
}

/** Passes until every check this file started has ended, so nothing it started outlives it. */
async function untilTheChecksEnd(runs: string[]): Promise<void> {
  const until = Date.now() + 20_000
  const ended = async (): Promise<boolean> => (await Promise.all(runs.map(async (run) => (await record(run)).record.data.theCheck?.execution?.endedAt !== undefined))).every(Boolean)
  while (!(await ended()) && Date.now() < until) {
    await onePass(settings, watching, [])
    await new Promise((go) => setTimeout(go, 100))
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'merges-only-check', viewport: { width: 1440, height: 1000 } })
  worktree = aThrowawayRepository()
  await request('/api/agents/started', 'POST', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  inspectorId = (await request<{ agent: { id: string } }>('/api/agents/started', 'POST', { handle: 'inspector-fixture', name: 'Synthetic Inspector', runtime: 'claude-code', role: 'inspector' })).agent.id
  builderKey = (await request<{ whatToGiveIt: { key: string } }>('/api/agents/started', 'POST', { handle: 'builder-fixture', name: 'Synthetic Builder', runtime: 'claude-code', role: 'worker', chapters: ['5:full'], workArea: ['src/server/lib'] }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))).whatToGiveIt.key
  const opened = await request<{ group: { id: string } }>('/api/groups', 'POST', { name: 'Synthetic merges-only check conversation', because: 'Synthetic worker fixture.', members: [THE_TEST_OFFICES_SECRETARY.handle, 'builder-fixture'].map((id) => ({ who: { kind: 'agent', id }, because: 'Synthetic test participant.' })) })
  const conversation = await request<{ messages: { id: string }[] }>(`/api/groups/${opened.group.id}`)
  groupMessage = conversation.messages[0]!.id
  settings = {
    api: app.api, workspace: 'default', session: null, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(app.dir, 'runs'), mergesOnly: true,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(checkout, 'tests/fake-inspection-tool.mjs'), MOLE_OFFICE_FAKE_RUNTIME: join(checkout, 'tests/fake-runtime.mjs'),
      FAKE_INSPECTION_TOOL_KEY_FILE: join(app.dir, 'keys.json'), MOLE_OFFICE_DB: join(app.dir, 'panelx.db') },
  }
  permission = (await request<RecordRead>('/api/records', 'POST', { kind: 'note', title: 'Synthetic permission for the merges-only check fixture',
    summary: 'Synthetic permission for the test to change src/server/lib/fixture.ts.', data: {} })).record.id
  const tip = execFileSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const made = await request<RecordRead>('/api/records', 'POST', {
    kind: 'session', title: 'Synthetic run sealed while the worker is merges-only',
    data: { state: 'running', servingAgent: 'builder-fixture', workingDirectory: worktree, cutFrom: 'main', tip, deliveringMessage: groupMessage, doing: 'Synthetic fixture.', extra: { traceFixturePermission: permission } },
  }, asAgent('builder-fixture'))
  await request(`/api/records/${made.record.id}`, 'PATCH', { dataPatch: { state: 'finished' } }, asTheBuilder())
  theRun = made.record.id
  theCheckMessage = (await record(theRun)).record.data.theCheck!.message
}, 180_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The merges-only check test ended.')
  await app?.stop()
  if (worktree !== '') rmSync(worktree, { recursive: true, force: true })
  for (const dir of worktrees) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('a merges-only worker and the checks the office asks for', () => {
  it('starts nothing for a queued check while the control is as nobody set it', async () => {
    const control = await request<{ on: boolean; nobodyChose: boolean }>('/api/office/checks-in-merges-only')
    expect(control).toMatchObject({ on: false, nobodyChose: true })
    const pass = await onePass(settings, watching, [])
    expect(pass.started).toEqual([])
    expect(pass.held).toEqual([])
    expect(watching).toEqual([])
    expect((await record(theRun)).record.data.theCheck?.execution).toBeUndefined()
  })

  it('starts the check, and nothing else, once the control is switched on', async () => {
    const switched = await request<{ on: boolean }>('/api/office/checks-in-merges-only', 'POST', { on: true, because: 'Synthetic: the test switches it on.' },
      { ...asPerson, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
    expect(switched.on).toBe(true)
    const pass = await onePass(settings, watching, [])
    const started = pass.started.find((one) => one.messageId === theCheckMessage)
    expect(started, `the check started: ${JSON.stringify(pass)}`).toBeDefined()
    expect(started!.runtime).toBe('inspection-tool')
    expect(pass.started).toHaveLength(1)
    expect(pass.held).toEqual([])
    expect((await record(theRun)).record.data.theCheck?.execution?.session).toBe(started!.session)
    // THE CHECK IS LET RUN TO ITS END, so nothing this file started outlives it.
    await untilTheChecksEnd([theRun])
    expect(watching).toEqual([])
  })

  it('starts as many checks at once as the office\'s setting says, and holds the next in the sentence that names it', async () => {
    const set = await request<{ limits: { checksAtOnce: number; checksAtOnceFrom: string } }>('/api/office/checks-in-merges-only', 'POST',
      { checksAtOnce: 1, because: 'Synthetic: the test allows one check at a time.' }, { ...asPerson, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
    expect(set.limits).toMatchObject({ checksAtOnce: 1, checksAtOnceFrom: 'set here' })
    const first = await aFinishedRun('Synthetic first run checked one at a time')
    const second = await aFinishedRun('Synthetic second run checked one at a time')
    const asked = [(await record(first)).record.data.theCheck!.message, (await record(second)).record.data.theCheck!.message]
    const pass = await onePass(settings, watching, [])
    const startedNow = pass.started.filter((one) => asked.includes(one.messageId))
    const heldNow = pass.held.filter((one) => asked.includes(one.messageId))
    expect(startedNow, JSON.stringify(pass)).toHaveLength(1)
    expect(heldNow, JSON.stringify(pass)).toEqual([{ messageId: asked.find((id) => id !== startedNow[0]!.messageId), because: '1 checks are running, and at most 1 run at once.' }])
    expect(whatTheWorkerLastSaidAbout({ messageId: heldNow[0]!.messageId, to: { kind: 'agent', id: inspectorId } })).toBe(`The check waits: ${whatOnMeans(1)}.`)
    expect(whatOnMeans(1)).toContain('at most 1 at once')
    // THE HELD ONE STARTS ONCE THE FIRST HAS ENDED, in one of these passes, so both are let run to their ends.
    await untilTheChecksEnd([first, second])
    expect(watching).toEqual([])
  })
})
