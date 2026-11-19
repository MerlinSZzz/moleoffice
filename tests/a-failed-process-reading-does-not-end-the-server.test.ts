// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROCESS READING THAT FAILS INSIDE A LOOK DOES NOT END THE SERVER.
 *
 * A look is asked for by code that has no caller to throw to: the presence clock, a stream that opened or closed, and
 * a write's stored step. Each look reads the process of the sessions it looks at, and a reader can throw while doing
 * so: on the Mac an lsof that times out does. A throw out of a timer ends the server. So a look catches it on every
 * system, logs the look's name and what failed, and announces nothing more on that pass. That pass takes no process
 * for another program and no agent for gone.
 *
 * The cases open a person's page on the server's channel and hand the session a stand-in process reader that fails
 * only for the pid the session's record names:
 *
 *   1. The presence clock's tick, built as the clock builds it, throws nothing, reaches the failing reading, logs the
 *      stand-in's own sentence, sends no answering.changed event for the agent, and leaves the conversation door
 *      saying what it said before. The case waits for the look the tick starts, which may give the thread back
 *      between its parts (wave 13y round 166), and its promise does not reject.
 *   2. The look a write's stored step asks for, answeringMayHaveChanged outside a transaction, throws nothing,
 *      reaches the failing reading, warns the stand-in's own sentence, and announces nothing for the agent.
 *
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit message that added the catch, "A failed process reading
 * inside a look does not end the server"): no-catch and caught-unsaid turn both cases red, and what-failed-unsaid
 * turns both red on the logged line. Each line is restored and checked with cmp against a saved copy.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnsweringChanged, EventOnTheWire } from '../src/shared/events.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

// THE ONE READER: while a case runs, `theProcessReader()` is the stand-in reader that case gave it.
const THE_READER = vi.hoisted(() => ({ current: null as null | object }))
vi.mock('../src/config/process-reader.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/process-reader.mjs')>()
  return { ...real, theProcessReader: () => THE_READER.current ?? real.theProcessReader() }
})

type ProcessReader = ReturnType<(typeof import('../src/config/process-reader.mjs'))['theProcessReader']>

const HERE = 'default'
const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const HANDLE = 'failed-reading-worker'
/** A pid no process has. */
const P = 3999999
/** When the recorded process began, to the second, as the record stamps it. */
const STARTED_AT = new Date(Math.floor((Date.now() - 3_600_000) / 1000) * 1000)
const STARTED_STAMP = localStampOf(STARTED_AT)
const THE_COMMAND_LINE = 'claude --resume a-made-up-conversation'
/** The sentence the Mac's reader writes when an lsof times out. */
const THE_FAILING_MESSAGE = `The program file of process ${P} is unknown: lsof could not be run: spawnSync lsof ETIMEDOUT`

let t: TestDb
let app: FastifyInstance
let resources: typeof import('../src/server/lib/resources.ts')
let events: typeof import('../src/server/lib/events.ts')
let eventsApi: typeof import('../src/server/api/events.ts')
let answeringTold: typeof import('../src/server/lib/answering-told.ts')
let agent = ''
let session = ''
let page = -1
/** What the person's page was sent while a case runs. */
let heard: EventOnTheWire[] = []
/** What the conversation door said of the agent before the failed look. */
let beforeAnswering: { how: string; couldNotTell: boolean }
/** Each call of the failing reader's executable reading. */
let failingReadings = 0
let trustingReader: ProcessReader
let failingReader: ProcessReader
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-failed-reading-'))

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url, headers: OWNER, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) })
  expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
  return reply.json() as Record<string, unknown>
}

/** What the conversation door says of the agent now: the two parts the answering event carries. */
async function whatTheDoorSays(): Promise<{ how: string; couldNotTell: boolean }> {
  const reply = await call('GET', `/api/messages/conversation?kind=agent&id=${agent}`)
  return { how: (reply['answering'] as { how: string }).how, couldNotTell: reply['couldNotTell'] as boolean }
}

/** The `answering.changed` events for this agent that the person's page was sent. */
function changedForTheAgent(): AnsweringChanged[] {
  return heard.map((one) => one.event).filter((one): one is AnsweringChanged => one.name === 'answering.changed' && one.who.id === agent)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  resources = await import('../src/server/lib/resources.ts')
  events = await import('../src/server/lib/events.ts')
  eventsApi = await import('../src/server/api/events.ts')
  answeringTold = await import('../src/server/lib/answering-told.ts')

  // TWO COPIES OF THE REAL READER, each changed for the recorded pid alone. Every other pid goes to the real methods.
  const real = await vi.importActual<typeof import('../src/config/process-reader.mjs')>('../src/config/process-reader.mjs')
  const asItReads = real.theProcessReader()
  trustingReader = {
    ...asItReads,
    nameOf: (pid: number) => (pid === P ? 'claude' : asItReads.nameOf(pid)),
    commandLineOf: (pid: number) => (pid === P ? THE_COMMAND_LINE : asItReads.commandLineOf(pid)),
    startTimeOf: (pid: number) => (pid === P ? STARTED_AT : asItReads.startTimeOf(pid)),
  }
  failingReader = {
    ...asItReads,
    nameOf: (pid: number) => (pid === P ? 'node' : asItReads.nameOf(pid)),
    commandLineOf: (pid: number) => (pid === P ? THE_COMMAND_LINE : asItReads.commandLineOf(pid)),
    executableOf: (pid: number) => {
      if (pid !== P) return asItReads.executableOf(pid)
      failingReadings += 1
      throw new Error(THE_FAILING_MESSAGE)
    },
  }
  THE_READER.current = trustingReader

  await call('POST', '/api/records', { kind: 'agent', title: 'A worker whose process reading fails', data: { handle: HANDLE, state: 'active', runtime: 'claude-code' } })
  const listed = (await call('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
  agent = (listed.agents ?? []).find((one) => one.handle === HANDLE)?.id ?? ''
  expect(agent).not.toBe('')

  // A SESSION THAT IS ANSWERING: a transcript just written, its own process recorded as the stand-in says, and a live
  // process row for it, this test's own, as tests/answering-changes-are-announced.test.ts makes one.
  const logPath = join(transcripts, 'made-up.jsonl')
  writeFileSync(logPath, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'made-up' }] } })}\n`)
  const discovered = { tool: 'claude-code', externalId: 'failed-reading-session', logPath, resumeCommand: null, startedAt: null, entryPoint: null, pid: P, pidStartedAt: STARTED_STAMP }
  const filed = await call('POST', '/api/records', { kind: 'session', title: 'A made-up terminal session', data: { state: 'running', runtime: 'claude-code', doing: 'made-up', extra: { discovered } } })
  session = (filed['record'] as { id: string }).id
  resources.registerResource({ workspaceId: HERE, sessionRecordId: session, type: 'process', key: String(process.pid), actor: { type: 'human', id: THE_PERSON } })

  // A PERSON'S PAGE, and the first looks taken for it, which only remember.
  heard = []
  page = events.pageOpened({ workspaceId: HERE, who: { kind: 'person', id: THE_PERSON }, send: (one) => heard.push(one) })
  eventsApi.presenceMayHaveChanged([])
  answeringTold.forgetWhatPagesWereToldOfAnswering()
  expect(answeringTold.answeringLookNow([])).toEqual([])

  const hold = await call('POST', `/api/handles/${HANDLE}/hold`, { session, machine: 'a-machine', runtime: 'claude-code' })
  expect((hold['hold'] as { session: string }).session).toBe(session)
  beforeAnswering = await whatTheDoorSays()
  expect(beforeAnswering).toEqual({ how: 'a live session', couldNotTell: false })
}, 120_000)

afterAll(async () => {
  events.pageClosed(page)
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

describe('a failed process reading inside a look', () => {
  it("1: does not end the presence clock's tick, and announces nothing", async () => {
    const logged: string[] = []
    const log = (line: string): void => {
      logged.push(line)
    }
    const tick = (await import('../src/server/lib/named-timers.ts')).named('the presence clock', log, () => eventsApi.thePresenceClocksLook(log))
    failingReadings = 0
    heard = []
    THE_READER.current = failingReader
    try {
      await expect(Promise.resolve().then(() => tick() as unknown)).resolves.toBeUndefined()
    } finally {
      THE_READER.current = trustingReader
    }
    expect(failingReadings, 'the tick did not reach the failing process reading').toBeGreaterThan(0)
    expect(logged.some((line) => line.includes(THE_FAILING_MESSAGE)), `the tick logged ${JSON.stringify(logged)}`).toBe(true)
    expect(changedForTheAgent()).toEqual([])
    expect(await whatTheDoorSays()).toEqual(beforeAnswering)
  })

  it("2: does not end the look a write's stored step asks for, and warns nothing changed", async () => {
    const warned: string[] = []
    const warning = vi.spyOn(console, 'warn').mockImplementation((...parts: unknown[]) => {
      warned.push(parts.map(String).join(' '))
    })
    failingReadings = 0
    heard = []
    THE_READER.current = failingReader
    try {
      expect(() => answeringTold.answeringMayHaveChanged([agent])).not.toThrow()
    } finally {
      warning.mockRestore()
      THE_READER.current = trustingReader
    }
    expect(failingReadings, 'the look did not reach the failing process reading').toBeGreaterThan(0)
    expect(warned.some((line) => line.includes(THE_FAILING_MESSAGE)), `the look warned ${JSON.stringify(warned)}`).toBe(true)
    expect(changedForTheAgent()).toEqual([])
  })
})
