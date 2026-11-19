// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WAITING DAYS ON A USAGE LIMIT IS LISTED AS WAITING, NOT AS RUNNING. Wave 13q round 55, the inspector's refusal.
 *
 * Round 55 made the launcher mark every retry OpenCode reports as a wait on a limit, and tell the run's starter once
 * when the next try is more than an hour away. The refusal's item 1: the lists that draw a run's state still drew such
 * a run as running. Only the run's own page drew the wait (src/web/components/TheStopAndWaitOfARun.tsx). The
 * answer: the lists read the mark and say it waits on a usage limit until <time>, and the state stays running.
 *
 * The mark now keeps OpenCode's next try as `nextTryAt`, and src/config/a-long-wait.mjs decides once which wait is
 * long: a next try more than an hour after the retry was seen. The reset cannot decide it. A retry that names no reset
 * has its reset assumed five hours away, so by its reset a retry of seconds would look long.
 *
 * WHAT IS CLAIMED:
 *
 *   1. `theNextTryOfALongWait` gives the next try of a running run whose next try is more than an hour after the
 *      retry, and nothing for a retry of seconds, a next try an hour exactly after, a run that is not running, or a
 *      mark that keeps no next try.
 *   2. The sessions page draws a run waiting days as waiting on a usage limit until its next try, and not as running.
 *      It draws a retry of seconds as running.
 *   3. All records draws the two runs the same way in the state cell.
 *   4. An agent's runs on its profile draw the two runs the same way.
 *   5. A run's workers draw the two runs the same way.
 *
 * Each list is read through the door its page reads, and each mark is written through the record door, so the door
 * is shown to take `nextTryAt`.
 *
 * MADE-UP RECORDS, in a fresh test database. The sessions door reads a made-up empty home, so every run it lists is
 * one filed by hand.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   aWaitIsLong takes a next try of any distance             → cases 1 to 5, the retry of seconds
 *   theNextTryOfALongWait reads the reset, not the next try   → cases 1 to 5, the retry of seconds
 *   the session shape keeps no `waitingOnALimit`              → case 2
 *   the sessions row draws the stored word again              → case 2
 *   the light shape keeps no `waitingOnALimit`                → case 3
 *   the state cell draws the stored word again                → case 3
 *   the profile's runs carry no `waitsLongUntil`              → case 4
 *   the workers' runs carry no `waitsLongUntil`               → case 5
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { drawnStamp, localStamp, parseAnyStamp } from '../src/shared/time.ts'
import type { TheAgentsRuns } from '../src/shared/profile.ts'
import type { TheWorkerRun, TheWorkersARunStarted } from '../src/shared/worker-runs.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Sessions = typeof import('../src/web/components/SessionPanel.tsx')
type Records = typeof import('../src/web/pages/RecordsPage.tsx')
type AgentsRuns = typeof import('../src/web/components/TheAgentsRuns.tsx')
type Workers = typeof import('../src/web/components/TheWorkersOfARun.tsx')
type I18n = typeof import('../src/shared/i18n.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** When the launcher read both retries. */
const SEEN_AT = '2026-11-06T09:00:00.000+00:00'
/** A next try three days on, which OpenCode named with its reset. */
const DAYS_ON = '2026-11-09T09:00:00.000+00:00'
/** A next try five seconds on, from a retry that named no reset, so its reset is assumed five hours on. */
const SECONDS_ON = '2026-11-06T09:00:05.000+00:00'
const ASSUMED_RESET = '2026-11-06T14:00:00.000+00:00'

/** A mark as the launcher writes it, with the next try given. */
function aMark(nextTryAt: string | undefined, resetsAt: string, resetFrom: string): Record<string, unknown> {
  return {
    provider: 'opencode-go',
    said: 'Synthetic: Go usage limit reached.',
    attempt: 1,
    seenAt: SEEN_AT,
    resetsAt,
    resetFrom,
    key: 'opencode-login',
    ...(nextTryAt === undefined ? {} : { nextTryAt }),
  }
}
const A_WAIT_OF_DAYS = aMark(DAYS_ON, DAYS_ON, 'named by the error, as OpenCode\'s retry read it: "It will reset in 3 days"')
const A_RETRY_OF_SECONDS = aMark(SECONDS_ON, ASSUMED_RESET, 'assumed: the retry named no reset, so five hours from the retry')

let t: TestDb
let app: FastifyInstance
let sessionsDoor: FastifyInstance
let home: string
let sp: Sessions
let rp: Records
let ar: AgentsRuns
let wr: Workers
let words: I18n

let waitsDays = ''
let retriesSoon = ''
let supervisor = ''

/** What a list says of the run waiting days. */
let theWait = ''
/** What a list says of a running run. */
let running = ''

/** Register a made-up agent through the door every agent comes through, and give back its record and its registry id. */
async function anAgent(handle: string, name: string): Promise<{ record: string; id: string }> {
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name, role: 'worker', runtime: 'opencode' } })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  return { record: String((started.json() as { record: string }).record), id }
}

/**
 * A made-up running OpenCode run of one agent, with its wait marked through the record door as the launcher marks it.
 * The door's answer is kept, and each list's case asks it first (`theDoorTookBothMarks`).
 */
async function aWaitingRun(title: string, agentRecord: string, mark: Record<string, unknown>): Promise<string> {
  const id = t.api.createRecord({ kind: 'session', title, data: { state: 'running', runtime: 'opencode' }, workspaceId: 'default', actor: t.api.HUMAN }).id
  writeDataBypassingTheGate(t, id, { state: 'running', runtime: 'opencode', ranAs: [{ workspaceId: 'default', agentId: agentRecord }] })
  const marked = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_PERSON, payload: { dataPatch: { waitingOnALimit: mark } } })
  marking.push(marked.statusCode === 200 ? 'taken' : `${String(marked.statusCode)}: ${marked.body.slice(0, 300)}`)
  return id
}

/** What the record door answered to the two marks, in order. */
const marking: string[] = []
const theDoorTookBothMarks = () => expect(marking, 'the record door takes a mark with its next try').toEqual(['taken', 'taken'])

/** One stored ask whose run was started, as the worker-run door keeps it. */
function anAsk(handle: string, minute: number, run: string): TheWorkerRun {
  return {
    state: 'started',
    askedAt: `2026-11-06 08:${String(minute).padStart(2, '0')}:00`,
    askedBy: { who: { kind: 'agent', id: 'made-up-supervisor' }, session: 'made-up-run' },
    handle,
    brief: { path: '/made/up/briefs/one.md', sha256: 'a'.repeat(64), bytes: 120 },
    sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up-container' },
    starting: {
      at: `2026-11-06 08:${String(minute + 1).padStart(2, '0')}:00`, wrapper: 'made-up-launcher', runtime: 'opencode', model: 'made-up-model',
      casting: 1, castingSays: 'A made-up Casting row.', effort: null, effortFrom: 'none', effortSays: 'No effort is cast.',
    },
    started: { at: `2026-11-06 08:${String(minute + 2).padStart(2, '0')}:00`, run, runKeyId: `k-${handle}` },
  }
}

async function read<T>(url: string): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  return reply.json() as T
}

/** The markup without its style sheets, so a word in a sheet is never read as drawn. */
const drawn = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element).replace(/<style[^>]*>[\s\S]*?<\/style>/gu, '')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  // THE SESSIONS DOOR OVER A MADE-UP EMPTY HOME: no transcripts and no processes, as in
  // tests/a-running-row-filed-by-hand-is-marked-by-its-evidence.test.ts.
  home = mkdtempSync(join(tmpdir(), 'mole-office-a-long-wait-home-'))
  const env = (): AdapterEnv => ({ homeDir: home, now: new Date(SEEN_AT), scanProcesses: () => ({ ok: true, processes: [] }), runningWithinSeconds: 5 * 60, orphanAfterSeconds: 6 * 60 * 60 })
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  sessionsDoor = Fastify()
  installErrorHandling(sessionsDoor)
  await sessionsDoor.register(sessionRoutes, { prefix: '/api', env })
  await sessionsDoor.ready()

  // A WINDOW, so the browser modules load under `renderToStaticMarkup`.
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {},
  }
  sp = await import('../src/web/components/SessionPanel.tsx')
  rp = await import('../src/web/pages/RecordsPage.tsx')
  ar = await import('../src/web/components/TheAgentsRuns.tsx')
  wr = await import('../src/web/components/TheWorkersOfARun.tsx')
  words = await import('../src/shared/i18n.ts')
  ;(await import('../src/web/lib/mode.ts')).setMode('normal')
  const { stateWord } = await import('../src/shared/words.ts')

  const days = await anAgent('long-wait-days', 'Made-up worker waiting days')
  const seconds = await anAgent('long-wait-seconds', 'Made-up worker retrying in seconds')
  waitsDays = await aWaitingRun('Made-up run waiting days on a usage limit', days.record, A_WAIT_OF_DAYS)
  retriesSoon = await aWaitingRun('Made-up run retrying in seconds', seconds.record, A_RETRY_OF_SECONDS)
  supervisor = t.api.createRecord({ kind: 'session', title: 'Made-up supervisor', data: { state: 'running', runtime: 'claude-code' }, workspaceId: 'default', actor: t.api.HUMAN }).id
  writeDataBypassingTheGate(t, supervisor, {
    state: 'running', runtime: 'claude-code',
    workerRuns: { [days.id]: anAsk('long-wait-days', 1, waitsDays), [seconds.id]: anAsk('long-wait-seconds', 10, retriesSoon) },
  })

  theWait = words.t('w13q.longWait.until', { time: drawnStamp(localStamp(parseAnyStamp(DAYS_ON)!)) })
  running = stateWord('running', 'normal', 'session').text
}, 120_000)

afterAll(async () => {
  await sessionsDoor.close()
  await app.close()
  t.close()
  rmSync(home, { recursive: true, force: true })
})

describe('a run waiting days on a usage limit is listed as waiting, and a retry of seconds as running', () => {
  it('1: a wait is long when its next try is more than an hour after the retry, and only on a running run', async () => {
    const { theNextTryOfALongWait } = await import('../src/config/a-long-wait.mjs')
    const run = (mark: Record<string, unknown>, state = 'running') => ({ state, waitingOnALimit: mark })
    expect(theNextTryOfALongWait(run(A_WAIT_OF_DAYS))).toBe(DAYS_ON)
    expect(theNextTryOfALongWait(run(A_RETRY_OF_SECONDS)), 'a retry of seconds whose reset is assumed hours away').toBeNull()
    expect(theNextTryOfALongWait(run(aMark('2026-11-06T10:00:00.000+00:00', DAYS_ON, 'named'))), 'an hour exactly').toBeNull()
    expect(theNextTryOfALongWait(run(aMark('2026-11-06T10:00:01.000+00:00', DAYS_ON, 'named')))).toBe('2026-11-06T10:00:01.000+00:00')
    expect(theNextTryOfALongWait(run(A_WAIT_OF_DAYS, 'finished')), 'a run that is not running').toBeNull()
    expect(theNextTryOfALongWait(run(aMark(undefined, DAYS_ON, 'named'))), 'a mark written before it kept the next try').toBeNull()
    // A RUN FILED BEFORE THE MARK WAS A FIELD keeps it in `extra`, and is read there too.
    expect(theNextTryOfALongWait({ state: 'running', extra: { waitingOnALimit: A_WAIT_OF_DAYS } })).toBe(DAYS_ON)
  })

  it('2: the sessions page draws the wait in place of running, and a retry of seconds as running', async () => {
    theDoorTookBothMarks()
    const reply = await sessionsDoor.inject({ method: 'GET', url: '/api/sessions', headers: { 'x-mole-office-workspace': 'default' } })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const sessions = sp.readSessionsPayload(JSON.parse(reply.body))
    expect(sessions.problems).toEqual([])
    // THE RECORDS AS THE PAGE ASKS FOR THEM, in the session shape (`fetchSessionsPage`).
    const records = (await read<{ records: PanelRecord[] }>('/api/records?kind=session&shape=session')).records
    const lines = sp.joinSessionRecords(sessions.sessions, sp.readSessionRecordFacts(records))
    const row = (id: string) => {
      const line = lines.find((one) => one.recordId === id)
      expect(line, `the sessions door lists ${id}`).toBeDefined()
      expect(line!.state, 'the run is observed as running').toBe('running')
      return drawn(h(sp.SessionLineRow, { line: line!, now: Date.parse(SEEN_AT) }))
    }
    const days = row(waitsDays)
    expect(days).toContain(`>${theWait}<`)
    expect(days).not.toContain(`>${running}<`)
    const seconds = row(retriesSoon)
    expect(seconds).toContain(`>${running}<`)
    expect(seconds).not.toContain(words.t('w13q.longWait.until', { time: '' }).trim())
  })

  it('3: All records draws the wait in the state cell, and a retry of seconds as running', async () => {
    theDoorTookBothMarks()
    const listed = (await read<{ records: (PanelRecord & { incompleteCount: number })[] }>('/api/records?kind=session&shape=light&limit=25')).records
    const cell = (id: string) => {
      const record = listed.find((one) => one.id === id)
      expect(record, `the light list carries ${id}`).toBeDefined()
      return drawn(h('table', null, h('tbody', null, h(rp.CatalogueRow as never, { record, columns: ['state', 'title'], mode: 'normal' } as never))))
    }
    const days = cell(waitsDays)
    expect(days).toContain(`>${theWait}<`)
    expect(days).not.toContain(`>${running}<`)
    const seconds = cell(retriesSoon)
    expect(seconds).toContain(`>${running}<`)
    expect(seconds).not.toContain(words.t('w13q.longWait.until', { time: '' }).trim())
  })

  it("4: an agent's runs on its profile draw the wait, and a retry of seconds as running", async () => {
    theDoorTookBothMarks()
    const runsOf = async (handle: string) => {
      const said = await read<{ agentRuns: TheAgentsRuns | null }>(`/api/participants/agent/${handle}/profile`)
      expect(said.agentRuns, 'an agent page carries its runs').not.toBeNull()
      expect(said.agentRuns!.runs).toHaveLength(1)
      return { reading: said.agentRuns!, html: drawn(h(ar.TheAgentsRuns, { reading: said.agentRuns! })) }
    }
    const days = await runsOf('long-wait-days')
    expect(days.reading.runs[0]!.state, 'the stored state stays running').toBe('running')
    expect(days.reading.runs[0]!.waitsLongUntil).toBe(DAYS_ON)
    expect(days.html).toContain(`>${theWait}<`)
    expect(days.html).not.toContain(`>${running}<`)
    const seconds = await runsOf('long-wait-seconds')
    expect(seconds.reading.runs[0]!.waitsLongUntil).toBeUndefined()
    expect(seconds.html).toContain(`>${running}<`)
  })

  it("5: a run's workers draw the wait, and a retry of seconds as running", async () => {
    theDoorTookBothMarks()
    const answer = await read<{ workers: TheWorkersARunStarted }>(`/api/records/${supervisor}`)
    const ofRun = (run: string) => answer.workers.workers.find((one) => one.runId === run)!
    expect(ofRun(waitsDays).run!.state, 'the stored state stays running').toBe('running')
    expect(ofRun(waitsDays).run!.waitsLongUntil).toBe(DAYS_ON)
    expect(ofRun(retriesSoon).run!.waitsLongUntil).toBeUndefined()
    const html = drawn(h(wr.TheWorkersOfARun, { workers: answer.workers }))
    const one = (name: string) => {
      const at = html.indexOf(name)
      expect(at, `the workers list names ${name}`).toBeGreaterThan(-1)
      return html.slice(at, html.indexOf('</li>', at))
    }
    const days = one('Made-up worker waiting days')
    expect(days).toContain(`>${theWait}<`)
    expect(days).not.toContain(`>${running}<`)
    expect(one('Made-up worker retrying in seconds')).toContain(`>${running}<`)
  })
})
