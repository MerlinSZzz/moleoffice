// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STOP HOOK ASKS THE OFFICE ONCE WHICH WORKERS STILL RUN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * At every end of a supervisor's turn the Stop hook asks which of the agents that supervisor
 * started still have a run in state running. It used to read `GET /api/participants`, then one
 * profile for every worker, then the children of the supervisor's run and one record per open
 * child: about 2.1 seconds and 1,750 statements per profile on the live office, and one office
 * held for about 2.5 minutes for a supervisor with 74 workers.
 *
 * The repair is one light door, `GET /api/handles/<handle>/running-workers`, whose reading lives
 * in src/server/lib/running-workers.ts: the registry rows of the workers, each agent's record in
 * this project in one query, and the project's running session rows read through the partial index
 * `records_session_running_idx`. `runningWorkers` in tools/dsh-hooks/office.mjs now makes exactly
 * one request to that door.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office. The
 * door is driven through a real listener, as a hook drives it, and through `runningWorkers` itself
 * where the case is about the hook.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE DOOR. It names a worker the handle started that has a running run bound by `ranAs`. It
 *      does not name a worker whose runs are all finished, a retired worker with a running run, or
 *      another agent's worker with a running run.
 *   2. THE CHILD RUNS UNDER ONE SESSION. With `session` given the door names a running child under
 *      that session that another agent filed. It does not name a child closed while its state
 *      still says running, or one that finished. Without `session` the child is not named and the
 *      note says child runs were not looked at.
 *   3. GUARD. The door and the profile agree: for each worker of case 1, the worker's profile has
 *      a run in state running exactly when the door names it. This is a guard for the door's
 *      reading of `ranAs`, not a repair of the profile door.
 *   4. GUARD. `runningWorkers` makes exactly one request, to the new door, for a supervisor with
 *      three workers and one child.
 *   5. THE READING IS CHEAP. Every statement the door runs was recorded. A statement that reads
 *      records for sessions uses `records_session_running_idx` or the primary key in EXPLAIN QUERY
 *      PLAN, and the number of statements is the same for a supervisor with 1 worker and with 30
 *      workers.
 *   6. THE HONESTY RULE. A read that failed still lets the stop go when nothing else holds it, and
 *      both stop scripts print one sentence saying the stop was allowed and naming what could not
 *      be read.
 *   7. REFUSALS. An unknown handle is 404. A `session` that is not a session, or is in another
 *      project, is refused with the sentence `attachmentRecord` gives.
 *   8. THE DOOR READS OPEN AS THE ATTACHMENT DOES. For a running child under a session, the door
 *      names the child exactly when `attachmentOf` reads that child's record as open: no `closedAt`
 *      at all, a stored JSON null, an empty string and the number 0 are open; a readable date and a
 *      string that is not a date are closed.
 *   9. THE SENTENCE FOR ONE WORKER WITH NO RUNNING RUN. When the handle started exactly one worker
 *      and that worker has no run in state running, the note says "The one agent this handle started
 *      has no run in state running." and never the old "None of the one agent…", with and without a
 *      session asked about, and the sentence about the child runs is unchanged each time.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run
 * ---------------------------------------------------------------------------------------
 *
 *   M1: in the door's library function, compare `started_by_id` with the handle instead of the
 *       registry id → the minted-supervisor test (its own file) goes red.
 *   M2: leave out the child part of the reading → the child case here and the live-child cases in
 *       tests/the-dsh-hooks-carry-messages-to-a-dsh-agent.test.ts go red.
 *   M3: count a child that has a `closedAt` → the closed-child cases here and there go red.
 *   M4: leave out the de-duplication by handle → the twice-found worker here and in the dsh-hooks
 *       file is named twice.
 *   M5: put the old `runningWorkers` back (from 00e25d668) → case 4 goes red, because it is no
 *       longer one request to the new door.
 *   M6: read the running rows without the index words, as a plain `eq(records.kind, 'session')`
 *       with `json_extract(...)` → case 5 goes red, because the plan no longer uses the index.
 *   M7: make the hook answer `{ running: [] }` on a failed read → case 6 goes red, because the
 *       stop scripts then say nothing about the read that failed.
 *   M8: put the old `closedAt` check back in the child filter of the door's library → case 8b goes
 *       red and 8a stays green, which is why 8b exists.
 *   M9: put the old `closedAt` check back in `minutesSinceARunOfThisAgentSpoke` in presence.ts →
 *       case 8b goes red.
 *   M10: drop the open test from the child filter → case 8a goes red on the date and the "soon"
 *       children, and case 2 goes red on its closed child.
 *   M11: read open as `closedAt === undefined` in the child filter → case 8a goes red on the JSON
 *       null child.
 *   M12: make `theAttachmentIsOpen` itself call an empty string closed → case 8a's written-down
 *       value for the empty string goes red, and its comparison of the door with `attachmentOf`
 *       stays green, because both move together.
 *   M13: put the old sentence back in `whatTheRunningWorkersAre` → case 9 goes red.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL LISTENER AND NOT app.inject()
 * ---------------------------------------------------------------------------------------
 *
 * `runningWorkers` is a function of the office's HTTP surface: it fetches one door over a socket,
 * and the test drives the very same function. A real listener makes that request the one the hook
 * really makes, and it is also what the small proxies in cases 4 and 6 stand in front of.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { runningWorkers } from '../tools/dsh-hooks/office.mjs'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const STOP = fileURLToPath(new URL('../tools/dsh-hooks/stop.mjs', import.meta.url))
const CLAUDE_STOP = fileURLToPath(new URL('../tools/dsh-hooks/claude-code-stop.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

interface Ran {
  text: string
  args: unknown[]
}

let recording = false
const ran: Ran[] = []

/** Every directory this file makes, removed after it. */
const made: string[] = []
function aScratchDirectory(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-running-workers-${what}-`))
  made.push(dir)
  return dir
}

/** What `fn` ran, recorded while it ran, as tests/a-check-row-reads-only-its-own-agents-runs.test.ts records. */
async function whatRan(fn: () => unknown): Promise<Ran[]> {
  ran.length = 0
  recording = true
  try {
    await fn()
  } finally {
    recording = false
  }
  return [...ran]
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json }
}

/** The door's own answer for one handle, with an optional session. */
async function theDoor(
  handle: string,
  session?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const query = session === undefined ? '' : `?session=${encodeURIComponent(session)}`
  return ask('GET', `/api/handles/${encodeURIComponent(handle)}/running-workers${query}`, AS_THE_PERSON)
}

/** One agent registered through the real door, with the record this project filed for it. */
interface StartedRow {
  id: string
  handle: string
  name: string
  record: string
}
async function started(handle: string, name: string, role?: string): Promise<StartedRow> {
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, {
    handle,
    name,
    ...(role === undefined ? {} : { role }),
  })
  expect(made.status, JSON.stringify(made.json)).toBe(201)
  const listed = await ask('GET', '/api/participants', AS_THE_PERSON)
  expect(listed.status, JSON.stringify(listed.json)).toBe(200)
  const found = one(
    ((listed.json['agents'] ?? []) as StartedRow[]).filter((row) => row.handle === handle),
    `the registry row of ${handle}`,
  )
  return found
}

/** One agent started by another, through the real door, so `started_by_kind` and `started_by_id` are real. */
async function startedBy(startedByHandle: string, handle: string, name: string): Promise<StartedRow> {
  const made = await ask('POST', '/api/agents/started', asAgent(startedByHandle), { handle, name })
  expect(made.status, JSON.stringify(made.json)).toBe(201)
  const listed = await ask('GET', '/api/participants', AS_THE_PERSON)
  const found = one(
    ((listed.json['agents'] ?? []) as StartedRow[]).filter((row) => row.handle === handle),
    `the registry row of ${handle}`,
  )
  return found
}

/**
 * ONE RUN OF ONE AGENT, bound by `ranAs` the way the office writes it: a session record filed by
 * the agent it worked as, so the binding names that agent's record. The other keys are the ones a
 * child run carries.
 */
async function aRunOf(
  actorHandle: string,
  agentRecord: string,
  state: 'running',
  extra: Record<string, unknown> = {},
): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(actorHandle), {
    kind: 'session',
    title: 'a made-up run',
    data: { state, ranAs: [{ workspaceId: 'default', agentId: agentRecord }], ...extra },
  })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

/** A run with no agent named: the shape a plain run that is over is filed in, as the dsh-hooks test files one. */
async function aRunThatIsOver(actorHandle: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(actorHandle), {
    kind: 'session',
    title: 'a made-up run that is over',
    data: { state: 'finished' },
  })
  expect(filed.status, JSON.stringify(filed.json)).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

/**
 * ONE RUN OF ONE AGENT THAT IS OVER, still bound by `ranAs` to that agent's record. A run an agent
 * finishes has to declare what it submits, so this is the shape the dsh-hooks test uses: the run is
 * opened for the agent's record, a report is filed about it, and the finishing write names that
 * report as the submission.
 */
async function anEndedRunOf(worker: StartedRow, starterHandle: string): Promise<string> {
  // THE STARTER OPENS IT, because a run is ended by its own agent or by the agent that started or
  // filed it, and this case needs the run to end.
  const opened = await ask('POST', '/api/attachments', asAgent(starterHandle), {
    title: 'a made-up run that ended',
    agentId: worker.record,
    workingDirectory: '/made/up/worktrees/w13j',
    runtime: 'dsh',
  })
  expect(opened.status, JSON.stringify(opened.json)).toBe(200)
  const run = (opened.json['attachment'] as { id: string }).id
  const report = await ask('POST', '/api/records', asAgent(worker.handle), {
    kind: 'report',
    title: 'the made-up run is over',
    data: {},
    links: [{ type: 'about', toId: run }],
  })
  expect(report.status, JSON.stringify(report.json)).toBe(201)
  const reportId = (report.json['record'] as { id: string }).id
  const ended = await ask('PATCH', `/api/records/${run}`, asAgent(starterHandle), {
    dataPatch: { state: 'finished', submission: { kind: 'records', records: [reportId] } },
  })
  expect(ended.status, JSON.stringify(ended.json)).toBe(200)
  return run
}

/** The state the profile's own runs reading reports for one handle. */
async function theProfilesRunningRuns(handle: string): Promise<string[]> {
  const read = await ask('GET', `/api/participants/agent/${encodeURIComponent(handle)}/profile`, AS_THE_PERSON)
  expect(read.status, JSON.stringify(read.json)).toBe(200)
  const runs = (read.json['agentRuns'] as { runs?: { id: string; state: string }[] } | null)?.runs ?? []
  return runs.filter((run) => run.state === 'running').map((run) => run.id)
}

/** A door in front of the test office that passes every request through and remembers each one it saw. */
async function anOfficeThatCountsTheRequests(): Promise<{ url: string; server: Server; seen: string[] }> {
  const seen: string[] = []
  const server = createServer((req, res) => {
    void (async () => {
      seen.push(req.url ?? '')
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && (name.startsWith('x-mole-office-') || name === 'content-type')) headers[name] = value
      }
      const answer = await fetch(`${api}${req.url ?? ''}`, {
        method: req.method ?? 'GET',
        headers,
        ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
      })
      res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
      res.end(Buffer.from(await answer.arrayBuffer()))
    })()
  })
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, server, seen }
}

/** A door in front of the test office that answers the new door 500 and passes every other request through. */
async function anOfficeThatRefusesTheRunningWorkersRead(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    void (async () => {
      if ((req.url ?? '').includes('/running-workers')) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'This read failed.' }))
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && (name.startsWith('x-mole-office-') || name === 'content-type')) headers[name] = value
      }
      const answer = await fetch(`${api}${req.url ?? ''}`, {
        method: req.method ?? 'GET',
        headers,
        ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
      })
      res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
      res.end(Buffer.from(await answer.arrayBuffer()))
    })()
  })
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, server }
}

interface HookRan {
  status: number | null
  stdout: string
  stderr: string
}

/** Run one stop script exactly as the bridge would: payload on stdin, the run's identity in the env. */
function runStop(script: string, handle: string, session: string, office: string, cwd: string): Promise<HookRan> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  delete env['MOLE_AGENT_KEY']
  env['MOLE_OFFICE_AGENT'] = handle
  env['MOLE_OFFICE_SESSION'] = session
  env['MOLE_OFFICE_WORKSPACE'] = 'default'
  env['MOLE_OFFICE_API'] = office
  env['MOLE_OFFICE_DB'] = t.file
  return new Promise((resolve) => {
    void (async () => {
      const { spawn } = await import('node:child_process')
      const child = spawn(process.execPath, [script], { cwd, env })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += String(chunk)))
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      child.stdin.on('error', () => {})
      child.on('close', (status) => resolve({ status, stdout, stderr }))
      child.stdin.write(JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }))
      child.stdin.end()
    })()
  })
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE RECORDER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'run', 'iterate', 'values'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        if (recording) ran.push({ text, args })
        return run.apply(this, args)
      }
    }
    return statement
  }
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('1. the door names the workers with a run still running, and no others', () => {
  it('names the worker whose run is running and leaves out finished, retired and another agent’s workers', async () => {
    const supervisor = await started('made-up-stop-sup', 'The Stop Supervisor', 'supervisor')
    const live = await startedBy(supervisor.handle, 'made-up-stop-worker-live', 'The Live Worker')
    const over = await startedBy(supervisor.handle, 'made-up-stop-worker-over', 'The Over Worker')
    const retired = await startedBy(supervisor.handle, 'made-up-stop-worker-retired', 'The Retired Worker')
    const otherSupervisor = await started('made-up-other-sup', 'The Other Supervisor', 'supervisor')
    const theirs = await startedBy(otherSupervisor.handle, 'made-up-other-worker', 'The Other Worker')

    const liveRun = await aRunOf(live.handle, live.record, 'running')
    await anEndedRunOf(over, supervisor.handle)
    await aRunOf(retired.handle, retired.record, 'running')
    await aRunOf(theirs.handle, theirs.record, 'running')

    const retiredAnswer = await ask('POST', `/api/participants/agent/${retired.id}/retire`, AS_THE_PERSON, {
      because: 'A made-up retirement for this case.',
    })
    expect(retiredAnswer.status, JSON.stringify(retiredAnswer.json)).toBe(200)

    const read = await theDoor(supervisor.handle)
    expect(read.status, JSON.stringify(read.json)).toBe(200)
    expect(read.json['handle']).toBe(supervisor.handle)
    expect(read.json['agent']).toBe(supervisor.id)
    // THE RETIRED WORKER IS NOT COUNTED: `workers` is the unretired agents this handle started.
    expect(read.json['workers']).toBe(2)
    expect(read.json['running']).toEqual([{ handle: live.handle, name: live.name, runs: [liveRun] }])
    expect(read.json['session']).toBeNull()
    expect(String(read.json['note']), 'the note does not say how many of the workers run').toContain(
      '1 of the 2 agents this handle started have a run in state running',
    )
    expect(String(read.json['note']), 'the note does not say children were not looked at').toContain('were not looked at')
    expect(String(read.json['note']), 'the note claims something about children it did not read').not.toMatch(/\bnone\b/i)
    expect(read.json['workspaceId']).toBe('default')
  })
})

describe('2. the child runs under the session asked about', () => {
  it('names a running child another agent filed, and leaves out a closed one and a finished one', async () => {
    const supervisor = await started('made-up-child-sup', 'The Child Supervisor', 'supervisor')
    const filer = await started('made-up-child-filer', 'The Child Filer')
    // THE FILER FILES THE SESSION ITS RUNS HANG UNDER, because a caller may name as a parent its own
    // session and a session that serves no agent, and this one is both.
    const parent = await aRunThatIsOver(filer.handle)

    const runningChild = await aRunOf(filer.handle, filer.record, 'running', { parentAttachment: parent, servingAgent: filer.handle })
    const closedChild = await aRunOf(filer.handle, filer.record, 'running', {
      parentAttachment: parent,
      servingAgent: filer.handle,
      closedAt: '2026-10-18 05:00:00',
      closedHow: 'provider-event',
      closedBecause: 'a made-up end for this case',
    })
    const finishedChild = await ask('POST', '/api/records', asAgent(filer.handle), {
      kind: 'session',
      title: 'a made-up child that finished',
      // NO AGENT IS NAMED: an agent that finishes a run it worked as must declare what it submits,
      // and a row whose state is not running is left out of the reading whether it is bound or not.
      data: { state: 'finished', parentAttachment: parent },
    })
    expect(finishedChild.status, JSON.stringify(finishedChild.json)).toBe(201)
    expect([runningChild, closedChild, (finishedChild.json['record'] as { id: string }).id].every((id) => id !== parent)).toBe(true)

    const withSession = await theDoor(supervisor.handle, parent)
    expect(withSession.status, JSON.stringify(withSession.json)).toBe(200)
    expect(withSession.json['session']).toBe(parent)
    expect(withSession.json['running']).toEqual([{ handle: filer.handle, name: filer.name, runs: [runningChild] }])
    expect(String(withSession.json['note']), 'the note does not say the session was looked at').toContain('were looked at')

    const withoutSession = await theDoor(supervisor.handle)
    expect(withoutSession.status, JSON.stringify(withoutSession.json)).toBe(200)
    expect(withoutSession.json['running'], 'a child was named with no session asked about').toEqual([])
    expect(String(withoutSession.json['note'])).toContain('were not looked at')
  })
})

describe('3. GUARD: the door and the profile agree about who runs', () => {
  it('names each worker exactly when its profile has a run in state running', async () => {
    const supervisor = await started('made-up-agree-sup', 'The Agreeing Supervisor', 'supervisor')
    const runningWorker = await startedBy(supervisor.handle, 'made-up-agree-running', 'The Running Worker')
    const overWorker = await startedBy(supervisor.handle, 'made-up-agree-over', 'The Over Worker')
    const runningRun = await aRunOf(runningWorker.handle, runningWorker.record, 'running')
    await anEndedRunOf(overWorker, supervisor.handle)

    const read = await theDoor(supervisor.handle)
    expect(read.status, JSON.stringify(read.json)).toBe(200)
    const named = ((read.json['running'] ?? []) as { handle: string }[]).map((one) => one.handle)

    for (const worker of [runningWorker, overWorker]) {
      const profileRuns = await theProfilesRunningRuns(worker.handle)
      expect(named.includes(worker.handle), `${worker.handle}: the door and the profile disagree`).toBe(profileRuns.length > 0)
    }
    expect(named).toContain(runningWorker.handle)
    expect(named).not.toContain(overWorker.handle)
    expect(await theProfilesRunningRuns(runningWorker.handle)).toEqual([runningRun])
  })
})

describe('4. GUARD: runningWorkers makes exactly one request', () => {
  it('asks the new door once for a supervisor with three workers and one child', async () => {
    const supervisor = await started('made-up-one-request-sup', 'The One Request Supervisor', 'supervisor')
    const one1 = await startedBy(supervisor.handle, 'made-up-one-request-1', 'The First Worker')
    const one2 = await startedBy(supervisor.handle, 'made-up-one-request-2', 'The Second Worker')
    const one3 = await startedBy(supervisor.handle, 'made-up-one-request-3', 'The Third Worker')
    const parent = await aRunOf(supervisor.handle, supervisor.record, 'running')
    await aRunOf(one1.handle, one1.record, 'running')
    await aRunOf(one1.handle, one1.record, 'running', { parentAttachment: parent, servingAgent: one1.handle })
    await aRunOf(one2.handle, one2.record, 'running')
    await aRunOf(one3.handle, one3.record, 'running')

    const counted = await anOfficeThatCountsTheRequests()
    try {
      const read = await runningWorkers(counted.url, { handle: supervisor.handle, session: parent, workspace: 'default' })
      expect('failed' in read, 'the one request did not answer').toBe(false)
      const running = (read as { running: { handle: string }[] }).running
      expect(running.map((one) => one.handle).sort()).toEqual([one1.handle, one2.handle, one3.handle].sort())
      expect(counted.seen, 'runningWorkers made more than one request, or asked another door').toEqual([
        `/api/handles/${encodeURIComponent(supervisor.handle)}/running-workers?session=${encodeURIComponent(parent)}`,
      ])
    } finally {
      await new Promise<void>((closed) => counted.server.close(() => closed()))
    }
  })
})

describe('5. the door never reads every session record', () => {
  it('reads sessions through the running index or the primary key, and makes the same number of statements for 1 worker and 30', async () => {
    const small = await started('made-up-wide-sup', 'The Small Supervisor', 'supervisor')
    const smallWorker = await startedBy(small.handle, 'made-up-wide-worker', 'The One Worker')
    await aRunOf(smallWorker.handle, smallWorker.record, 'running')

    const wide = await started('made-up-wide-many-sup', 'The Wide Supervisor', 'supervisor')
    for (let n = 1; n <= 30; n += 1) {
      const worker = await startedBy(wide.handle, `made-up-wide-worker-${String(n)}`, `The Worker ${String(n)}`)
      await aRunOf(worker.handle, worker.record, 'running')
    }

    const statementsOf = async (handle: string): Promise<Ran[]> =>
      whatRan(async () => {
        const read = await theDoor(handle)
        expect(read.status, JSON.stringify(read.json)).toBe(200)
      })

    const oneWorker = await statementsOf(small.handle)
    const thirtyWorkers = await statementsOf(wide.handle)
    expect(oneWorker.length, 'the case recorded no statements').toBeGreaterThan(0)
    expect(thirtyWorkers.length, 'the number of statements grew with the number of workers').toBe(oneWorker.length)

    // THE STATEMENTS THAT READ RECORDS FOR SESSIONS carry the session kind or the stored running
    // state in their own words, and the running rows reader is the one this case is about. EXPLAIN
    // QUERY PLAN is asked of each.
    const readingSessions = [...new Map(
      oneWorker
        .filter((one) => /\brecords\b/.test(one.text) && (one.text.includes('session') || one.text.includes('json_extract')))
        .map((one) => [one.text, one]),
    ).values()]
    expect(readingSessions.length, 'no statement that reads records for sessions was recorded').toBeGreaterThan(0)
    for (const statement of readingSessions) {
      const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement.text}`).all(...statement.args) as { detail?: unknown }[]
      const detail = plan.map((row) => String(row.detail ?? '')).join(' | ')
      expect(
        detail,
        `this statement does not read sessions through the running index or the primary key: ${statement.text}`,
      ).toMatch(/records_session_running_idx|USING INTEGER PRIMARY KEY|sqlite_autoindex_records/)
    }
  })
})

describe('6. THE HONESTY RULE: a failed read still lets the stop go, and says so', () => {
  it('both stop scripts let the stop go and name the read that could not be made', async () => {
    const supervisor = await started('made-up-honest-sup', 'The Honest Supervisor', 'supervisor')
    const own = await aRunThatIsOver(supervisor.handle)
    // THE SUPERVISOR'S INBOX IS EMPTY, so the workers read is the only thing that can hold it.
    const unseen = await ask('GET', '/api/messages?only=waiting-for-me', asAgent(supervisor.handle))
    for (const message of (unseen.json['messages'] ?? []) as { id: string }[]) {
      const marked = await ask('POST', `/api/messages/${message.id}/mark`, asAgent(supervisor.handle), { mark: 'seen' })
      expect(marked.status, JSON.stringify(marked.json)).toBe(200)
    }

    const refusing = await anOfficeThatRefusesTheRunningWorkersRead()
    try {
      for (const script of [STOP, CLAUDE_STOP]) {
        const done = await runStop(script, supervisor.handle, own, refusing.url, aScratchDirectory('honest'))
        expect(done.status, done.stderr).toBe(0)
        expect(done.stdout, `${script} printed a decision for a read that failed`).toBe('')
        const lines = done.stderr.trim().split('\n')
        expect(lines.length, `${script} said more than one sentence: ${done.stderr}`).toBe(1)
        expect(lines[0], `${script} did not say the stop was allowed`).toContain('so the stop was allowed')
        expect(lines[0], `${script} did not name the read that could not be made`).toContain(
          `about the agents "${supervisor.handle}" started`,
        )
        expect(lines[0], `${script} did not say what the office answered`).toContain('Mole Office answered 500 at')
      }
    } finally {
      await new Promise<void>((closed) => refusing.server.close(() => closed()))
    }
  })
})

describe('7. refusals', () => {
  it('refuses an unknown handle, and a session that is not a session or is another project’s', async () => {
    const unknown = await theDoor('made-up-nobody-at-all')
    expect(unknown.status, JSON.stringify(unknown.json)).toBe(404)
    expect(String(unknown.json['error'] ?? unknown.json['message'] ?? '')).toContain(
      'No durable agent in this installation has the handle "made-up-nobody-at-all".',
    )

    const supervisor = await started('made-up-refusal-sup', 'The Refusal Supervisor', 'supervisor')
    const notASession = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'report',
      title: 'a made-up report that is not a session',
      data: {},
    })
    expect(notASession.status, JSON.stringify(notASession.json)).toBe(201)
    const reportId = (notASession.json['record'] as { id: string }).id
    const reportRead = await theDoor(supervisor.handle, reportId)
    expect(reportRead.status, JSON.stringify(reportRead.json)).toBe(400)
    expect(String(reportRead.json['error'] ?? reportRead.json['message'] ?? '')).toContain('and not an attachment')

    const elsewhere = await ask('POST', '/api/workspaces', AS_THE_PERSON, { id: 'made-up-elsewhere', title: 'A made-up other project' })
    expect([201, 409], JSON.stringify(elsewhere.json)).toContain(elsewhere.status)
    const otherSession = await ask('POST', '/api/records', { ...AS_THE_PERSON, 'x-mole-office-workspace': 'made-up-elsewhere' }, {
      kind: 'session',
      title: 'a made-up run in another project',
      data: { state: 'running' },
    })
    expect(otherSession.status, JSON.stringify(otherSession.json)).toBe(201)
    const otherId = (otherSession.json['record'] as { id: string }).id
    const otherRead = await theDoor(supervisor.handle, otherId)
    expect(otherRead.status, JSON.stringify(otherRead.json)).toBe(404)
    expect(String(otherRead.json['error'] ?? otherRead.json['message'] ?? '')).toContain(
      `is an attachment in "made-up-elsewhere" and this request is about "default".`,
    )
  })
})

describe('8. the door reads open the way the attachment does', () => {
  /**
   * GUARD. The door must name a child exactly when `attachmentOf` reads that child's record as
   * open, for every stored shape of `closedAt`. M10 turns this case red on the date and the "soon"
   * children, M11 on the JSON null child, and M12 on the written-down value for the empty string.
   * The store refuses most of these values on a write, so this case first shows each one refused
   * through the door and then writes it straight into this file's throwaway database; a value the
   * store accepted would be a fault and is a failure here.
   */
  it('names each child exactly when attachmentOf reads it open, over every stored value of closedAt', async () => {
    // IMPORTED HERE AND NOT AT THE TOP OF THE FILE: attachments.ts reaches src/server/db/client.ts,
    // which refuses to open a database before freshDb() has named this file's throwaway one. With the
    // import at the top the whole file fails to start.
    const { attachmentOf } = await import('../src/server/lib/attachments.ts')
    const supervisor = await started('made-up-open-sup', 'The Open Supervisor', 'supervisor')
    const filer = await started('made-up-open-filer', 'The Open Filer')
    const parent = await aRunThatIsOver(filer.handle)

    const refusedByTheStore: { what: string; value: unknown }[] = [
      { what: 'a JSON null', value: null },
      { what: 'an empty string', value: '' },
      { what: 'the number 0', value: 0 },
      { what: 'a string that is not a date', value: 'soon' },
    ]
    for (const one of refusedByTheStore) {
      const filed = await ask('POST', '/api/records', asAgent(filer.handle), {
        kind: 'session',
        title: 'a made-up child the store must refuse',
        data: { state: 'running', parentAttachment: parent, closedAt: one.value },
      })
      expect(filed.status, `${one.what} was not refused on a write: ${JSON.stringify(filed.json)}`).toBe(400)
    }

    // WHAT attachmentOf READS FOR EACH VALUE TODAY. It is written down here so the case cannot pass
    // with every child left out: four of the six values are open, and the open ones must be named.
    const theValues: { what: string; value?: unknown; open: boolean }[] = [
      { what: 'a missing closedAt', open: true },
      { what: 'a JSON null', value: null, open: true },
      { what: 'an empty string', value: '', open: true },
      { what: 'the number 0', value: 0, open: true },
      { what: 'a readable date', value: '2026-10-18 05:00:00', open: false },
      { what: 'a string that is not a date', value: 'soon', open: false },
    ]

    const children = new Map<string, { what: string; writtenDown: boolean; open: boolean }>()
    for (const one of theValues) {
      const extra: Record<string, unknown> = { parentAttachment: parent, servingAgent: filer.handle }
      const throughTheDoor = one.value === '2026-10-18 05:00:00'
      if (throughTheDoor) {
        extra['closedAt'] = one.value
        extra['closedHow'] = 'provider-event'
        extra['closedBecause'] = 'a made-up end for this case'
      }
      // EVERY CHILD IS FILED WITH NO closedAt, then the refused value is written straight into this
      // file's throwaway database, because no door would accept it. The date goes through the door,
      // which is the shape case 2's closed child has.
      const id = await aRunOf(filer.handle, filer.record, 'running', extra)
      if (!throughTheDoor && one.value !== undefined) {
        const stored = t.client.sqlite
          .prepare("UPDATE records SET data = json_set(data, '$.closedAt', json(?)) WHERE id = ?")
          .run(JSON.stringify(one.value), id)
        expect(stored.changes, `${one.what} was not written into the database`).toBe(1)
      }
      // READ THE CHILD BACK AND WORK OUT WHAT THE ATTACHMENT CALLS IT, then expect the door to agree.
      const back = await ask('GET', `/api/records/${id}`, AS_THE_PERSON)
      expect(back.status, JSON.stringify(back.json)).toBe(200)
      children.set(id, {
        what: one.what,
        writtenDown: one.open,
        open: attachmentOf(back.json['record'] as PanelRecord).open,
      })
    }
    expect(children.size, 'the case lost a child').toBe(6)

    const read = await theDoor(supervisor.handle, parent)
    expect(read.status, JSON.stringify(read.json)).toBe(200)
    const named = (read.json['running'] ?? []) as { handle: string; runs: string[] }[]
    const runs = named.find((one) => one.handle === filer.handle)?.runs ?? []

    // THE DOOR AND THE ATTACHMENT ARE COMPARED FIRST, THEN THE WRITTEN-DOWN VALUE. Each child's door
    // membership is checked against attachmentOf's reading, and attachmentOf's reading against the
    // value written down above. Under a change to theAttachmentIsOpen itself both readings move
    // together and only the written-down comparison fails; under a change to one reader alone the
    // door comparison fails.
    for (const [id, one] of children) {
      expect(
        runs.includes(id),
        `${one.what}: the door ${runs.includes(id) ? 'named' : 'left out'} the child, and attachmentOf read it as ${
          one.open ? 'open' : 'closed'
        }`,
      ).toBe(one.open)
      expect(
        one.open,
        `${one.what}: attachmentOf read open as ${String(one.open)}, and this case says ${String(one.writtenDown)}`,
      ).toBe(one.writtenDown)
    }

    // THE OPEN CHILDREN REALLY ARE NAMED, and nothing else is. A case that left every row out would
    // otherwise compare two empty answers and pass without exercising the rule at all.
    const openIds = [...children].filter(([, one]) => one.open).map(([id]) => id)
    expect(openIds.length, 'no child of this case is open, so this guard would prove nothing').toBe(4)
    expect([...runs].sort()).toEqual([...openIds].sort())
    for (const id of openIds) expect(runs, 'an open child was not named').toContain(id)
  })
})

describe('9. the sentence for one worker with no running run', () => {
  /**
   * One worker whose run is over, so no run is in state running. The old note said "None of the one
   * agent this handle started has a run in state running." — true and clumsy. M13 puts it back and
   * turns this case red.
   */
  it('says plainly that the one agent this handle started has no run in state running', async () => {
    const supervisor = await started('made-up-plain-sup', 'The Plain Supervisor', 'supervisor')
    const worker = await startedBy(supervisor.handle, 'made-up-plain-worker', 'The Plain Worker')
    await anEndedRunOf(worker, supervisor.handle)
    const session = await aRunThatIsOver(supervisor.handle)

    const withoutSession = await theDoor(supervisor.handle)
    expect(withoutSession.status, JSON.stringify(withoutSession.json)).toBe(200)
    expect(withoutSession.json['workers'], 'this case does not have exactly one worker').toBe(1)
    expect(withoutSession.json['running'], 'a run is still named, so none of the sentence is about this case').toEqual([])
    expect(String(withoutSession.json['note']), 'the note does not say the one agent has no running run').toContain(
      'The one agent this handle started has no run in state running.',
    )
    expect(String(withoutSession.json['note']), 'the old clumsy sentence is still there').not.toContain('None of the one agent')
    expect(String(withoutSession.json['note']), 'the child-runs sentence changed with no session').toContain(
      'Runs filed under a session were not looked at.',
    )

    const withSession = await theDoor(supervisor.handle, session)
    expect(withSession.status, JSON.stringify(withSession.json)).toBe(200)
    expect(withSession.json['session']).toBe(session)
    expect(String(withSession.json['note']), 'the note does not say the one agent has no running run').toContain(
      'The one agent this handle started has no run in state running.',
    )
    expect(String(withSession.json['note']), 'the old clumsy sentence is still there').not.toContain('None of the one agent')
    expect(String(withSession.json['note']), 'the child-runs sentence changed with a session').toContain(
      'Runs filed under the session asked about were looked at too.',
    )
  })
})
