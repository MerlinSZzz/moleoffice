// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN THAT ENDED ON ITS ENTRY STILL HAS A RUNNING SESSION ROW. JdaAnCvmgy-P, finding JdaAnCvmgy-P.
 * The merge tool records its ending on the entry before its process and the worker's session row end.
 * If the worker is gone in that gap, the next worker has to read the run's own log and exit-code file
 * and close the row. h4TKLwqtAGpt is the same gap when the exit-code file is missing.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theEntryNeedsNothingMore, theMergeToolEndingLine, theMergeToolFinished } from '../src/config/merge-tool.mjs'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { A_MERGE_TOOL_RUNS_RECEIPT } from '../src/worker/runtimes/merge.ts'
import { USAGE_NUMBERS } from '../src/shared/usage-receipts.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const THE_WORKER = 'mole-office/the-message-worker'

let t: TestDb
let app: FastifyInstance
let api = ''
let settings: WorkerSettings
let main = ''
let outputs = ''
const made: string[] = []

const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asWorker = as('agent', 'merge-ended-worker')
const asTheOffice = as('agent', THE_WORKER)

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const response = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: response.statusCode, body: (response.body === '' ? {} : response.json()) as Record<string, any>, raw: response.body }
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-ended-merge-tree-'))
  made.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic ended merge fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'entry.txt'), 'synthetic merge input\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic merge input')
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'work', 'entry.txt'), 'synthetic submitted change\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submitted change')
  return dir
}

async function aSealedRun(): Promise<string> {
  const dir = tree()
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run for an ended merge tool',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'merge-ended-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'merge-ended-worker', cutFrom: 'main', workingDirectory: dir },
  }).id
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
  expect(finished.status, finished.raw).toBe(200)
  return run
}

async function submit(branch: string): Promise<string> {
  const response = await call('POST', '/api/merge-queue', asWorker, { run: await aSealedRun(), changeset: { adapter: 'git', repository: 'fixture-main', branch } })
  expect(response.status, response.raw).toBe(201)
  return String((response.body['entry'] as Record<string, unknown>)['id'])
}

async function entry(id: string): Promise<Record<string, any>> {
  const response = await call('GET', `/api/merge-queue/${id}`, asPerson)
  expect(response.status, response.raw).toBe(200)
  return response.body['entry'] as Record<string, any>
}

async function sessionData(id: string): Promise<Record<string, any>> {
  const response = await call('GET', `/api/records/${id}`, asPerson)
  expect(response.status, response.raw).toBe(200)
  return response.body['record'].data as Record<string, any>
}

async function theGoingRun(session: string): Promise<Record<string, any>> {
  const response = await call('GET', '/api/worker/merges', asTheOffice)
  expect(response.status, response.raw).toBe(200)
  const found = (response.body['going'] as Record<string, any>[]).find((one) => one.session === session)
  expect(found, `no going row was returned for ${session}`).toBeDefined()
  return found!
}

async function aRunEndedOnItsEntry(input: {
  branch: string
  reason: string
  printed: string
  exitCode?: string
  merged?: boolean
}): Promise<{ entry: string; session: string; log: string }> {
  const id = await submit(input.branch)
  const started = t.api.createRecord({
    kind: 'session',
    title: `Synthetic merge tool run for ${id}`,
    workspaceId: 'default',
    actor: { type: 'agent', id: THE_WORKER },
    origin: 'fixture',
    data: { state: 'finished' },
  }).id
  const session = t.api.createRecord({
    kind: 'session',
    title: `Synthetic merge tool session for ${id}`,
    workspaceId: 'default',
    actor: { type: 'agent', id: THE_WORKER },
    origin: 'fixture',
    data: {
      state: 'running',
      runtime: 'merge-tool',
      startedByMoleOffice: true,
      parentAttachment: started,
      extra: { purpose: 'merge', mergeEntry: id },
    },
  }).id
  const log = join(outputs, `${session}.log`)
  writeFileSync(log, `${input.printed}\n`)
  if (input.exitCode !== undefined) writeFileSync(`${log}.exit-code`, input.exitCode)

  const toolStarted = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log })
  expect(toolStarted.status, toolStarted.raw).toBe(200)
  if (input.merged === true) {
    const queue = await import('../src/server/lib/merge-queue.ts')
    queue.moveEntry({ id, to: 'merged', actor: { type: 'agent', id: THE_WORKER } })
  }
  const toolEnded = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason: input.reason })
  expect(toolEnded.status, toolEnded.raw).toBe(200)
  return { entry: id, session, log }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  const agent = await call('POST', '/api/agents/started', asPerson, { handle: 'merge-ended-worker', name: 'Synthetic merge-ended worker', workArea: ['work'] })
  expect(agent.status, agent.raw).toBe(201)
  main = mkdtempSync(join(tmpdir(), 'mole-office-ended-merge-main-'))
  made.push(main)
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'fixture-main', root: main, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-ended-merge-logs-'))
  made.push(outputs)
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 1,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort() },
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 30_000)

describe('a merge tool run ended on its entry while its session row still says running', () => {
  it('closes the row from the log and exit code, without treating the ended run as a failed start', async () => {
    const reason = 'Synthetic: the entry already recorded that its run ended before landing.'
    const printed = 'Synthetic log ending from the merge tool.'
    const fixture = await aRunEndedOnItsEntry({
      branch: 'synthetic-ended-with-exit-code',
      reason,
      printed: theMergeToolEndingLine({ ok: true, says: printed }),
      exitCode: '17',
    })

    const going = await theGoingRun(fixture.session)
    expect(going).toMatchObject({ endedOnTheEntry: reason, startupFailed: null, pid: null, pgid: null })

    const pass = await onePass(settings, [], [])
    expect(pass.merges.ended).toContainEqual(expect.objectContaining({ entry: fixture.entry, session: fixture.session }))
    const data = await sessionData(fixture.session)
    expect(data['state']).toBe('crashed')
    expect(data['doing']).toContain('The merge tool exited with code 17.')
    expect(data['doing']).toContain(printed)
    expect(data['doing']).toContain(`The entry says: ${reason}`)
    // THE TOOL RUNS NO MODEL, so its run's receipt says so in words and holds no number, not 0.
    expect(data['usageReceipt']).toMatchObject({ runtime: A_MERGE_TOOL_RUNS_RECEIPT.runtime, says: A_MERGE_TOOL_RUNS_RECEIPT.says })
    expect(Object.keys(data['usageReceipt'] as object).filter((name) => (USAGE_NUMBERS as readonly string[]).includes(name))).toEqual([])

    const before = await entry(fixture.entry)
    const repeated = await call('POST', `/api/merge-queue/${fixture.entry}/tool-ended`, asTheOffice, {
      session: fixture.session,
      reason: 'Synthetic: this second ending must not replace the first.',
    })
    expect(repeated.status, repeated.raw).toBe(200)
    expect(repeated.body['entry']).toEqual(before)
  })

  it('finishes a missing-exit-code run when the entry says it merged', async () => {
    // THE SENTENCE THE TOOL REALLY WRITES for an entry already merged, from the one place it is said (check 5PDAmYI1pxq_).
    const reason = theMergeToolFinished(theEntryNeedsNothingMore('merged'))
    const fixture = await aRunEndedOnItsEntry({
      branch: 'synthetic-ended-merged-no-exit-code',
      reason,
      printed: theMergeToolEndingLine({ ok: true, says: reason }),
      merged: true,
    })
    const going = await theGoingRun(fixture.session)
    expect(going).toMatchObject({ endedOnTheEntry: reason, startupFailed: null })

    const pass = await onePass(settings, [], [])
    expect(pass.merges.ended).toContainEqual(expect.objectContaining({ entry: fixture.entry, session: fixture.session }))
    const data = await sessionData(fixture.session)
    expect(data['state']).toBe('finished')
    expect(data['doing']).toBe(reason)
    expect((await entry(fixture.entry)).state).toBe('merged')
  })

  // A ROW NEVER SAYS CRASHED AND MERGED AT ONCE (problem h4TKLwqtAGpt, check 06uOvyWNB10M). The entry is merged, which
  // is the work the run exists for, so the row reads finished; the exit code its process left afterwards is still said.
  it('finishes a run whose entry says it merged though its process exited non-zero, and says the exit code', async () => {
    // THE SENTENCE THE TOOL REALLY WRITES for an entry already merged, from the one place it is said (check 5PDAmYI1pxq_).
    const reason = theMergeToolFinished(theEntryNeedsNothingMore('merged'))
    const printed = 'Synthetic log ending after the merge.'
    const fixture = await aRunEndedOnItsEntry({
      branch: 'synthetic-ended-merged-nonzero-exit',
      reason,
      printed: theMergeToolEndingLine({ ok: true, says: printed }),
      exitCode: '3',
      merged: true,
    })
    const pass = await onePass(settings, [], [])
    expect(pass.merges.ended).toContainEqual(expect.objectContaining({ entry: fixture.entry, session: fixture.session }))
    const data = await sessionData(fixture.session)
    expect(data['state'], 'a row that says the entry is merged does not read crashed').toBe('finished')
    expect(String(data['doing']).startsWith(reason.replace(/\.$/u, ''))).toBe(true)
    expect(data['doing']).toContain('The merge tool exited with code 3.')
    expect(data['doing']).not.toContain('The entry says:')
    expect((await entry(fixture.entry)).state).toBe('merged')
  })

  it('crashes a missing-exit-code run when the entry does not say it merged and explains both facts', async () => {
    const reason = 'The merge tool could not go on: Synthetic refusal before merge.'
    const printed = 'Synthetic log ending says the tool stopped before merge.'
    const fixture = await aRunEndedOnItsEntry({
      branch: 'synthetic-ended-not-merged-no-exit-code',
      reason,
      printed: theMergeToolEndingLine({ ok: false, says: printed }),
    })
    const going = await theGoingRun(fixture.session)
    expect(going).toMatchObject({ endedOnTheEntry: reason, startupFailed: null })

    const pass = await onePass(settings, [], [])
    expect(pass.merges.ended).toContainEqual(expect.objectContaining({ entry: fixture.entry, session: fixture.session }))
    const data = await sessionData(fixture.session)
    expect(data['state']).toBe('crashed')
    expect(data['doing']).toContain('The merge tool ended without a recorded exit code.')
    expect(data['doing']).toContain(printed)
    expect(data['doing']).toContain(`The entry says: ${reason}`)
  })
})
