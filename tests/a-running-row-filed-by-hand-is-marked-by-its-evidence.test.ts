// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN FILED BY HAND THAT SAYS IT IS RUNNING IS MARKED BY WHAT THE OFFICE CAN SEE OF ITS PROCESS.
 *
 * A run filed with no log has only its writer's word for its state. Wave 13y round 29 measured the running list on two
 * copies of the office: most of its rows were such runs, and each was drawn as plainly running. The secretary decided how they are
 * drawn (4o6XEDnlZUOd): "Such a session stays in the running list, marked by its evidence. A record whose process the
 * office can see running says so. A record with no log and no process the office can see says "running, by its own word;
 * no process seen", in the page's language. Do not move it out of the list, and do not draw it as plainly running."
 *
 * THE OFFICE'S OWN ROWS ARE READ ANOTHER WAY (the secretary's answer NWERRgH9KKNV). The API server, the message worker, the
 * browser app and the terminal holder each file a row by hand with the pid of their own process, which is node and not
 * the claude program. So they are read by `theRecordedProcessIsGone` in src/config/own-rows.mjs, which checks the start
 * time without asking which program it is, and every other row by `whetherTheRecordedProcessRuns` in
 * src/config/session-process.mjs. Where something runs under a row's pid and the reader cannot show it is the row's own,
 * the row says "running, by its own word; its process is not shown to be its own", with the reader's sentence.
 *
 * WHAT IS PROVED, through the sessions door on a real database and real processes:
 *   - each case answers its `itsProcess` reading, the same in the narrowed and the unnarrowed answer;
 *   - a run that is not a hand-filed running run has no reading;
 *   - the state sentence says what the office saw, without the pid, so the narrowed answer can still say it once;
 *   - the page's reader keeps the reading, and says so when it cannot read one;
 *   - the row and the run's page draw the mark beside the state word.
 *
 * The real processes are a `claude` script this file starts and stops by its own process group, a child that has
 * already exited, and the test's own node process.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { theProcessBehindTheHook } from '../src/config/session-process.mjs'
import { wholeRows } from '@shared/sessions-said-once.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

const NOW = new Date('2026-10-14T09:00:00Z')
const AS_THE_OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AS_THE_OFFICE = { type: 'agent', id: 'vitest/own-rows' } as const

let db: TestDb
let home: string
let scratch: string
let app: FastifyInstance | null = null
let workspaces: typeof import('../src/server/lib/workspaces.ts')
/** The project one case files its runs into, so the sessions answer holds only that case's runs. */
let WORKSPACE = 'default'
let caseNumber = 0
const started: ChildProcess[] = []

beforeAll(async () => {
  db = await freshDb()
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  const built = Fastify()
  installErrorHandling(built)
  await built.register(sessionRoutes, { prefix: '/api', env: envWith })
  await built.ready()
  app = built
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `running-row-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: 'A made-up project for one running-row case' })
  home = mkdtempSync(join(tmpdir(), 'mole-office-home-'))
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-its-process-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

afterAll(async () => {
  for (const child of started) await stopped(child)
  if (app) await app.close()
  app = null
  db.close()
})

function envWith(): AdapterEnv {
  return { homeDir: home, now: NOW, scanProcesses: () => ({ ok: true, processes: [] }), runningWithinSeconds: 5 * 60, orphanAfterSeconds: 6 * 60 * 60 }
}

/**
 * THE ONE SERVER IS BUILT IN beforeAll, over an empty machine: no transcripts, so every run in this
 * file is one filed by hand. This keeps each case's steps in the order they were written.
 */
async function serve(): Promise<FastifyInstance> {
  return app!
}

/** The headers that name the project this case made for itself. */
const inThisProject = (): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE })

/** A run filed by the person, saying the state it is in, with the process block `discovered` when one is given. */
function aRun(state: string, discovered: Record<string, unknown> | null, more: Record<string, unknown> = {}): string {
  return db.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a run filed by hand',
    data: { state, runtime: 'claude-code', ...more, ...(discovered === null ? {} : { extra: { discovered } }) },
    actor: AS_THE_OWNER,
  }).id
}

/** One of the office's own rows, as its start files it: by title, with the process block of its node process. */
function anOwnRow(discovered: Record<string, unknown>): string {
  return db.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'The API server',
    data: { state: 'running', runtime: 'mole-office', extra: { ownPart: { role: 'The API server' }, discovered } },
    actor: AS_THE_OFFICE,
  }).id
}

/** A `claude` script in its own process group, read the way the hook reads it. It ends by itself after five minutes. */
async function aClaudeProcess(): Promise<{ pid: number; pidStartedAt: string }> {
  const folder = join(scratch, `claude-${String(started.length)}`)
  mkdirSync(folder)
  const path = join(folder, 'claude')
  writeFileSync(path, '#!/bin/sh\ni=0\nwhile [ "$i" -lt 300 ]; do sleep 1; i=$((i + 1)); done\n', { mode: 0o755 })
  const child = spawn(path, [], { detached: true, stdio: 'ignore' })
  started.push(child)
  const pid = child.pid!
  let facts = theProcessBehindTheHook(pid)
  for (let tries = 0; !facts.recorded && tries < 50; tries += 1) {
    await new Promise((done) => setTimeout(done, 50))
    facts = theProcessBehindTheHook(pid)
  }
  expect(facts.recorded, `the script was not read as the claude program: ${String(facts.why)}`).toBe(true)
  return { pid: facts.pid!, pidStartedAt: facts.pidStartedAt! }
}

/** Stop a process this file started, by its own process group, and wait until it has been collected. */
async function stopped(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const gone = new Promise<void>((done) => child.once('exit', () => done()))
  try {
    process.kill(-child.pid!, 'SIGTERM')
  } catch {
    return
  }
  await gone
}

/** A pid the operating system no longer has, from a child this test started and let exit. */
async function aPidThatIsGone(): Promise<number> {
  const child = spawn('true', [], { stdio: 'ignore' })
  const pid = child.pid!
  await new Promise<void>((done) => child.once('exit', () => done()))
  const { osProbe } = await import('../src/server/lib/resources.ts')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (osProbe().processById(pid) === null) return pid
    await new Promise((go) => setTimeout(go, 25))
  }
  throw new Error(`pid ${String(pid)} never went away`)
}

/** When this test's own process began, as the probe the office's own rows are read with reads it. */
async function thisProcessStartedAt(): Promise<string> {
  const { osProbe } = await import('../src/server/lib/resources.ts')
  const live = osProbe().processById(process.pid)
  expect(live, 'the probe cannot read this test’s own process').not.toBeNull()
  return live!.startedAt
}

interface ARow { recordId: string | null; state: string; stateReason: string; itsProcess?: unknown }

/** Every row of one answer, made whole again, by its record. */
async function rowsOf(url: string): Promise<Map<string, ARow> & { body: Record<string, unknown> }> {
  const res = await app!.inject({ method: 'GET', url, headers: inThisProject() })
  expect(res.statusCode, res.body).toBe(200)
  const body = JSON.parse(res.body) as Record<string, unknown>
  const rows = wholeRows(body['sessions'] as unknown[], body['saidOnce']) as ARow[]
  return Object.assign(new Map(rows.map((row) => [row.recordId ?? '', row])), { body })
}

const RUNNING_LIST = '/api/sessions?only=running'

describe('a hand-filed run that says it is running is marked by what the office sees of its process', () => {
  it('a run with no process recorded: no process seen, and nobody recorded one', async () => {
    const id = aRun('running', null)
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row, 'the run left the running list').toBeDefined()
    expect(row!.state).toBe('running')
    expect(row!.itsProcess).toEqual({ seen: 'none', says: 'no process was recorded for it' })
  })

  it('a run whose recorded process has ended: no process seen', async () => {
    const pid = await aPidThatIsGone()
    const id = aRun('running', { pid, pidStartedAt: '2026-10-14 08:00:00' })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.state).toBe('running')
    expect(row!.itsProcess).toEqual({ seen: 'none', says: `its recorded process ${String(pid)} is not alive` })
  })

  it('a run whose claude process runs with the start time it recorded: its process is running', async () => {
    const claude = await aClaudeProcess()
    const id = aRun('running', claude)
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'running', says: `its recorded process ${String(claude.pid)} is the one that was recorded` })
  })

  it('a run whose pid names a process that is not the claude program: not shown to be its own', async () => {
    const id = aRun('running', { pid: process.pid, pidStartedAt: await thisProcessStartedAt() })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'not-its-own', says: `its recorded process ${String(process.pid)} is not the claude program` })
  })

  it('a run whose claude process began at another time than the one recorded: not shown to be its own', async () => {
    const claude = await aClaudeProcess()
    const id = aRun('running', { pid: claude.pid, pidStartedAt: '2026-01-01 00:00:00' })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'not-its-own', says: `its recorded process ${String(claude.pid)} is not the process that was recorded` })
  })

  it('a run that names another computer: this computer does not look, and no process is seen', async () => {
    const id = aRun('running', { pid: process.pid, pidStartedAt: await thisProcessStartedAt() }, { machine: 'a-computer-this-test-made-up' })
    expect(db.api.getRecord(id)!.data['machine']).toBe('a-computer-this-test-made-up')
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'none', says: 'it names another computer, so this computer cannot look for its process' })
  })
})

describe('the office’s own rows are read by their start time, not by which program they are', () => {
  it('an own row whose node process runs with the start time it recorded: its process is running', async () => {
    const id = anOwnRow({ pid: process.pid, pidStartedAt: await thisProcessStartedAt() })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'running', says: `its recorded process ${String(process.pid)} is running, and began at the time that was recorded` })
  })

  it('an own row whose recorded process has ended: no process seen', async () => {
    const pid = await aPidThatIsGone()
    const id = anOwnRow({ pid, pidStartedAt: '2026-10-14 08:00:00' })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'none', says: `its recorded process ${String(pid)} is not alive` })
  })

  it('an own row whose pid now names a process that began at another time: no process seen', async () => {
    const id = anOwnRow({ pid: process.pid, pidStartedAt: '2026-01-01 00:00:00' })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'none', says: `its recorded process ${String(process.pid)} has ended, and another process now has that number` })
  })

  it('an own row that recorded no start time: something runs, and it is not shown to be its own', async () => {
    const id = anOwnRow({ pid: process.pid })
    await serve()
    const row = (await rowsOf(RUNNING_LIST)).get(id)
    expect(row!.itsProcess).toEqual({ seen: 'not-its-own', says: `its recorded process ${String(process.pid)} is running, and no start time was recorded to show it is the one` })
  })
})

describe('what carries no reading, and what the reading says in the state sentence', () => {
  it('a run that says another state has no reading, and neither answer differs on a running one', async () => {
    const idle = aRun('idle', { pid: process.pid })
    const finished = aRun('finished', null)
    const pid = await aPidThatIsGone()
    const running = aRun('running', { pid, pidStartedAt: '2026-10-14 08:00:00' })
    await serve()
    const all = await rowsOf('/api/sessions')
    expect(all.get(idle)!.itsProcess).toBeNull()
    expect(all.get(finished)!.itsProcess).toBeNull()
    const narrowed = await rowsOf(RUNNING_LIST)
    expect(narrowed.get(running)!.itsProcess).toEqual(all.get(running)!.itsProcess)
    expect(narrowed.get(running)!.stateReason).toBe(all.get(running)!.stateReason)
  })

  it('says in the state sentence what the office saw, without the pid, so rows that saw alike say it alike', async () => {
    const one = aRun('running', { pid: await aPidThatIsGone(), pidStartedAt: '2026-10-14 08:00:00' })
    const two = aRun('running', { pid: await aPidThatIsGone(), pidStartedAt: '2026-10-14 08:00:00' })
    const none = aRun('running', null)
    const other = aRun('running', { pid: process.pid, pidStartedAt: await thisProcessStartedAt() })
    const claude = await aClaudeProcess()
    const seen = aRun('running', claude)
    await serve()
    const rows = await rowsOf(RUNNING_LIST)
    expect(rows.get(one)!.stateReason).toBe(rows.get(two)!.stateReason)
    expect(rows.get(one)!.stateReason).toContain('says it is "running"')
    expect(rows.get(one)!.stateReason).toContain('The office looked for its recorded process, and it is not running.')
    expect(rows.get(none)!.stateReason).toContain('No process was recorded for it, so the office could not look for one.')
    expect(rows.get(other)!.stateReason).toContain('Something runs under its recorded process number, and the office cannot show that it is this run’s process.')
    expect(rows.get(seen)!.stateReason).toContain('The office can see its recorded process running, and it began at the time that was recorded.')
    for (const row of rows.values()) expect(row.stateReason).not.toMatch(/\d{3,}/)
    // TWO ROWS THAT SAW ALIKE SHARE ONE SENTENCE, so the narrowed answer says it once and neither row carries it.
    const body = rows.body
    expect((body['saidOnce'] as { stateReason: string }).stateReason).toBe(rows.get(one)!.stateReason)
    const sent = body['sessions'] as Record<string, unknown>[]
    expect(sent.filter((row) => row['recordId'] === one || row['recordId'] === two).every((row) => !Object.hasOwn(row, 'stateReason'))).toBe(true)
  })
})

describe('the page reads the reading and draws it beside the state word', () => {
  const RUNNING_WORD = 'its process is running'
  const NONE_WORD = 'by its own word; no process seen'
  const NOT_ITS_OWN_WORD = 'by its own word; its process is not shown to be its own'

  async function theLines(): Promise<Map<string, import('../src/web/components/SessionPanel.tsx').SessionLine>> {
    const sp = await import('../src/web/components/SessionPanel.tsx')
    const res = await app!.inject({ method: 'GET', url: RUNNING_LIST, headers: inThisProject() })
    const read = sp.readSessionsPayload(JSON.parse(res.body))
    expect(read.problems).toEqual([])
    return new Map(sp.joinSessionRecords(read.sessions, null).map((line) => [line.recordId ?? '', line]))
  }

  it('the reader keeps each row’s reading, and says so when one cannot be read', async () => {
    const none = aRun('running', null)
    const other = aRun('running', { pid: process.pid, pidStartedAt: await thisProcessStartedAt() })
    await serve()
    const lines = await theLines()
    expect(lines.get(none)!.itsProcess).toEqual({ seen: 'none', says: 'no process was recorded for it' })
    expect(lines.get(other)!.itsProcess).toEqual({ seen: 'not-its-own', says: `its recorded process ${String(process.pid)} is not the claude program` })

    const sp = await import('../src/web/components/SessionPanel.tsx')
    const res = await app!.inject({ method: 'GET', url: '/api/sessions', headers: inThisProject() })
    const body = JSON.parse(res.body) as { sessions: Record<string, unknown>[] }
    for (const row of body.sessions) if (row['recordId'] === none) row['itsProcess'] = { seen: 'somewhere', says: 3 }
    const read = sp.readSessionsPayload(body)
    expect(read.sessions.find((one) => one.recordId === none)!.itsProcess).toBeNull()
    expect(read.problems.join('\n')).toContain('itsProcess')
  })

  it('each row draws its mark beside the running chip, and the third mark carries the reader’s sentence', async () => {
    const none = aRun('running', null)
    const other = aRun('running', { pid: process.pid, pidStartedAt: await thisProcessStartedAt() })
    const own = anOwnRow({ pid: process.pid, pidStartedAt: await thisProcessStartedAt() })
    await serve()
    const sp = await import('../src/web/components/SessionPanel.tsx')
    const lines = await theLines()
    const drawn = (id: string) => renderToStaticMarkup(h(sp.SessionLineRow, { line: lines.get(id)!, now: NOW.getTime() })).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

    const noneHtml = drawn(none)
    expect(noneHtml).toContain(NONE_WORD)
    expect(noneHtml).toContain('no process was recorded for it')
    expect(noneHtml).not.toContain(RUNNING_WORD)

    const otherHtml = drawn(other)
    expect(otherHtml).toContain(NOT_ITS_OWN_WORD)
    // THE READER'S SENTENCE IS WRITTEN AFTER THE THIRD MARK, as text a reader sees. Its place in the mark's title
    // alone would not do: a title is read only by somebody who points at the mark.
    expect(otherHtml).toContain(`>its recorded process ${String(process.pid)} is not the claude program<`)

    const ownHtml = drawn(own)
    expect(ownHtml).toContain(RUNNING_WORD)
    expect(ownHtml).not.toContain('by its own word')

    // A ROW WITH NO READING DRAWS NO MARK.
    const bare = { ...lines.get(none)!, itsProcess: null }
    const bareHtml = renderToStaticMarkup(h(sp.SessionLineRow, { line: bare, now: NOW.getTime() }))
    for (const word of [RUNNING_WORD, NONE_WORD, NOT_ITS_OWN_WORD]) expect(bareHtml).not.toContain(word)
  })

  it('the run’s own page draws the mark beside its state', async () => {
    const none = aRun('running', null)
    await serve()
    const detail = await app!.inject({ method: 'GET', url: `/api/sessions/${none}`, headers: inThisProject() })
    expect(detail.statusCode, detail.body).toBe(200)
    const timeline = await app!.inject({ method: 'GET', url: `/api/sessions/${none}/timeline`, headers: inThisProject() })
    expect(timeline.statusCode, timeline.body).toBe(200)
    const { TheRunView } = await import('../src/web/pages/SessionPage.tsx')
    const reply = JSON.parse(detail.body) as { session: never; startThisOfficeRead: null }
    const html = renderToStaticMarkup(
      h(TheRunView, {
        run: {
          record: db.api.getRecord(none)!,
          session: reply.session,
          timeline: JSON.parse(timeline.body) as never,
          everybody: { people: [], agents: [] },
          workers: null,
          askedForBy: null,
          startThisOfficeRead: reply.startThisOfficeRead,
        },
      }),
    )
    expect(html).toContain(NONE_WORD)
  })
})
