// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK DOOR ANSWERS OTHER REQUESTS WHILE GIT READS A RUN'S SEAL FOR IT, AND SAYS ITS PARTS IN THE LOG (item 2o of
 * the requirement list, criterion a, and the part timers).
 *
 * The prompt door, the assembly door and the verdict door read a run's seal again before they answer, and that read was
 * git on the server's own thread: on the office's repository, about 275 ms in which no other request was read. Now it
 * runs on a thread of its own (src/server/lib/the-seal-read-apart.ts). The door that reads a check, GET
 * /api/checks/:run, read the seal on the server's thread for longer, until round CJ; it now reads it on the same thread
 * as the others, with the seal-read header and without it.
 *
 * PROVED BY THE ORDER OF THE ANSWERS, NOT BY A TIME. A git that waits (tests/a-seal-read-fixture.ts) holds the first git
 * of the door's read that this test names, and says when it got there. Only then is another request sent, and only after
 * that request has been answered is the held git let go. So the other request is answered first exactly when the server
 * read it while the door's read was held. A read held on the server's own thread holds this test too, and the held git
 * goes on by itself after ten seconds: the door then answers first, and the case is red.
 *
 * AND, FOR THE DOOR THAT READS A CHECK, BY A TIME: the other request is answered within 2,000 ms of the moment the held git
 * started waiting. A read held on the server's own thread puts that answer at least ten seconds after it, because the
 * held git goes on by itself only then, and nothing else lets this test's thread run. A read on a thread of its own puts
 * it about one record read after it: the test looks for the held git every 10 ms, and one record read on a made-up
 * office takes tens of milliseconds. The 2,000 ms leave room for a test machine running other tests, and stay far below
 * the ten seconds, so the two cannot be taken for each other.
 *
 * THE PARTS. Each door writes one info line when its answer has been sent, naming its parts in the order they ran, with
 * the time of each and the time outside them (src/server/lib/the-parts-of-a-check-door.ts). The line must name every
 * part below, and the parts and the time outside them must add up to the door's whole time. The door that reads a check
 * writes one too, since round DQ, and a refused read names only the parts it ran. Its answer keeps the fields it had.
 *
 * MUTATIONS (wave 13n round U), each after a control run, each put back:
 *   - the seal read on the server's thread again (each door handing no read to the reading): the three order cases go red.
 *   - one part timer dropped from a door: that door's parts case goes red.
 * MUTATION (wave 13n round CJ), after a control run, put back:
 *   - the door that reads a check handing no read to the reading: its two cases go red, on the time and on the order.
 * MUTATIONS (wave 13n round DQ), each after a control run, each put back:
 *   - the door that reads a check timing its seal read as a part of its own thread, not as a wait: its line case goes red.
 *   - that door always saying nobody has assembled a check: the case on its answer's fields goes red after an assembly.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FROM_ITS_COMMIT, SEAL_READ_HEADER } from '../src/config/seal-read-header.mjs'
import { aGitThatWaits, aRepository, aSealedRun, AS_THE_PERSON, asAgent, THE_INSPECTOR, theOfficesCheckers, type AGitThatWaits } from './a-seal-read-fixture.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'

type APartSaid = { name: string; ms: number; inSqlite: { ms: number; statements: number } | null }
type TheLine = { msg: string; checkDoorParts: { door: string; ms: number; outside: number; parts: APartSaid[] } }

/** The server's log, line by line, as pino writes it. */
class TheLog {
  readonly lines: Record<string, unknown>[] = []
  private waiting = ''

  write(msg: string): void {
    this.waiting += msg
    for (let end = this.waiting.indexOf('\n'); end !== -1; end = this.waiting.indexOf('\n')) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.lines.push(JSON.parse(line) as Record<string, unknown>)
    }
  }

  /** The parts lines of `door`, oldest first. */
  partsOf(door: string): TheLine[] {
    return this.lines.filter((one): one is TheLine => (one['checkDoorParts'] as { door?: unknown } | undefined)?.door === door)
  }
}

const THE_PARTS_BEFORE = ['the refusals before the seal is read', 'the seal read on its own thread', 'the refusals again after the seal was read']
const THE_READING = ['the reading of the run', 'the base', 'the changes in the work area', 'the paths that need judgment', 'the assembly of the prompt']
const THE_PARTS: Record<string, string[]> = {
  'check.prompt': [...THE_PARTS_BEFORE, ...THE_READING],
  'check.assembled': [...THE_PARTS_BEFORE, ...THE_READING, 'keeping what the check would read'],
  'check.answer': [
    ...THE_PARTS_BEFORE,
    'who answers the check',
    'the chapters the check says it read',
    'the release or the refusal',
    'the merge queue hearing the verdict',
    'the starter told of a refusal',
  ],
  'check.read': [
    'the refusals before the seal is read',
    'the seal read on its own thread',
    'the reading of the run',
    'the saved chapters',
    'the precedents of its chapters',
    'the work area',
    'the check the office asked for',
    'what the check would read',
  ],
}

let t: TestDb
let app: FastifyInstance
let log: TheLog
let scratch = ''
let repository = ''
let held: AGitThatWaits
let runs = 0

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-check-door-answers-others-'))
  // FIRST ON PATH BEFORE THE THREAD STARTS, which copies this process's environment when it starts.
  held = aGitThatWaits(scratch)
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  log = new TheLog()
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: log })).app
  await app.ready()
  await theOfficesCheckers(app)
  repository = aRepository(join(scratch, 'repository'))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  held?.remove()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

const AS_THE_INSPECTOR = { ...asAgent(THE_INSPECTOR), 'content-type': 'application/json' }
type AReply = Awaited<ReturnType<FastifyInstance['inject']>>

/** A sealed run, and the three doors' bodies for it, as the inspector's tool sends them. */
async function aRunToCheck(): Promise<{ run: string; prompt: () => Promise<AReply>; assembled: () => Promise<AReply>; answer: () => Promise<AReply> }> {
  runs += 1
  const { run, directory, changed } = await aSealedRun(app, repository, `run-${String(runs)}`)
  const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_INSPECTOR) })
  expect(read.statusCode, read.body.slice(0, 400)).toBe(200)
  const { submission } = read.json() as { submission: { id: string; seal: { hash: string; git: { commit: string; forkBase: string } } } }
  const changes = changed.map((path) => ({ path, changes: `The work of run-${String(runs)}.` }))
  const base = { ref: submission.seal.git.forkBase, how: 'fork point', says: 'The sealed fork base.' }
  const whatWasRead = { sealKind: 'git', worktree: directory, tip: submission.seal.git.commit, ofItsOwn: true, sealId: submission.id, sealHash: submission.seal.hash, says: 'Read the exact seal.' }
  const post = (url: string, payload: Record<string, unknown>) => () => app.inject({ method: 'POST', url, headers: AS_THE_INSPECTOR, payload: JSON.stringify(payload) })
  return {
    run,
    prompt: post(`/api/checks/${run}/prompt`, { changes, base }),
    assembled: post(`/api/checks/${run}/assembled`, { changes, base, read: whatWasRead }),
    answer: post(`/api/checks/${run}`, {
      verdict: 'released',
      traced: syntheticTrace(t, changed),
      check: 'A synthetic release by a test. No model ran.',
      missing: [],
      chaptersRead: [],
      read: whatWasRead,
    }),
  }
}

/**
 * THE ORDER IN WHICH THE DOOR AND ANOTHER REQUEST WERE ANSWERED, the other request sent only once the door's read has
 * reached the held git, and the held git let go only once the other request has been answered.
 */
async function theOrderOfTheAnswers(run: string, door: () => Promise<AReply>, heldAt: string): Promise<{ order: string[]; door: AReply; other: AReply }> {
  const order: string[] = []
  held.holdAt(heldAt)
  const doorAnswered = door().then((reply) => {
    order.push('the check door')
    return reply
  })
  await held.reached()
  const other = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: asAgent(THE_INSPECTOR) })
  order.push('the other request')
  held.letGo()
  return { order, door: await doorAnswered, other }
}

describe('a check door answers other requests while git reads the seal for it', () => {
  it('the prompt door', async () => {
    const run = await aRunToCheck()
    const answered = await theOrderOfTheAnswers(run.run, run.prompt, 'ls-files')
    expect(answered.door.statusCode, answered.door.body.slice(0, 400)).toBe(200)
    expect(answered.other.statusCode, answered.other.body.slice(0, 400)).toBe(200)
    expect(answered.order).toEqual(['the other request', 'the check door'])
  })

  it('the assembly door', async () => {
    const run = await aRunToCheck()
    expect((await run.prompt()).statusCode).toBe(200)
    const answered = await theOrderOfTheAnswers(run.run, run.assembled, 'ls-files')
    expect(answered.door.statusCode, answered.door.body.slice(0, 400)).toBe(201)
    expect(answered.other.statusCode, answered.other.body.slice(0, 400)).toBe(200)
    expect(answered.order).toEqual(['the other request', 'the check door'])
  })

  it('the verdict door, which reads the seal from its sealed commit', async () => {
    const run = await aRunToCheck()
    expect((await run.prompt()).statusCode).toBe(200)
    expect((await run.assembled()).statusCode).toBe(201)
    const answered = await theOrderOfTheAnswers(run.run, run.answer, 'cat-file')
    expect(answered.door.statusCode, answered.door.body.slice(0, 600)).toBe(201)
    expect(answered.other.statusCode, answered.other.body.slice(0, 400)).toBe(200)
    expect(answered.order).toEqual(['the other request', 'the check door'])
  })
})

describe('the door that reads a check answers other requests while git reads the seal for it', () => {
  /**
   * THE ORDER, AND HOW LONG AFTER THE HELD GIT STARTED WAITING THE OTHER REQUEST WAS ANSWERED, for a read of the check of
   * a new sealed run with `headers` added.
   */
  async function theCheckReadWhileItIsHeld(heldAt: string, headers: Record<string, string>): Promise<{ order: string[]; door: AReply; other: AReply; afterTheHold: number }> {
    runs += 1
    const { run } = await aSealedRun(app, repository, `run-${String(runs)}`)
    const order: string[] = []
    held.holdAt(heldAt)
    const doorAnswered = app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: { ...asAgent(THE_INSPECTOR), ...headers } }).then((reply) => {
      order.push('the check door')
      return reply
    })
    const waitingSince = await held.reached()
    const other = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: asAgent(THE_INSPECTOR) })
    const afterTheHold = Date.now() - waitingSince
    order.push('the other request')
    held.letGo()
    return { order, door: await doorAnswered, other, afterTheHold }
  }

  function expectTheOtherRequestAnsweredMeanwhile(answered: { order: string[]; door: AReply; other: AReply; afterTheHold: number }): void {
    expect(answered.door.statusCode, answered.door.body.slice(0, 400)).toBe(200)
    expect(answered.other.statusCode, answered.other.body.slice(0, 400)).toBe(200)
    expect((answered.door.json() as { submissionStatus?: unknown }).submissionStatus).toBe('sealed')
    expect.soft(answered.afterTheHold, 'ms from the held git starting to wait to the other request being answered').toBeLessThan(2_000)
    expect.soft(answered.order).toEqual(['the other request', 'the check door'])
  }

  it('the read the inspector makes first, which reads the seal under a later commit', async () => {
    expectTheOtherRequestAnsweredMeanwhile(await theCheckReadWhileItIsHeld('ls-files', {}))
  })

  it('the read just before a verdict, which reads the seal from its sealed commit', async () => {
    expectTheOtherRequestAnsweredMeanwhile(await theCheckReadWhileItIsHeld('cat-file', { [SEAL_READ_HEADER]: FROM_ITS_COMMIT }))
  })
})

/** The newest parts line of `door`, once the log has it. */
async function theNewestLineOf(door: string, before: number): Promise<TheLine> {
  for (let waited = 0; log.partsOf(door).length <= before; waited += 10) {
    if (waited >= 5_000) throw new Error(`The door ${door} answered and wrote no line of its parts.`)
    await new Promise((done) => setTimeout(done, 10))
  }
  const line = log.partsOf(door).at(-1)
  if (line === undefined) throw new Error(`No line of the parts of ${door}.`)
  return line
}

function expectThePartsOf(line: TheLine, door: string): void {
  const said = line.checkDoorParts
  expect(said.parts.map((one) => one.name)).toEqual(THE_PARTS[door])
  for (const one of said.parts) {
    expect(one.ms, one.name).toBeGreaterThanOrEqual(0)
    if (one.name === 'the seal read on its own thread') expect(one.inSqlite, one.name).toBeNull()
    else expect(one.inSqlite?.statements, one.name).toBeGreaterThanOrEqual(0)
    expect(line.msg, `the sentence leaves out ${one.name}`).toContain(`${one.name} `)
  }
  expect(said.outside).toBeGreaterThanOrEqual(0)
  expect(said.ms).toBeCloseTo(said.parts.reduce((sum, one) => sum + one.ms, 0) + said.outside, 6)
  expect(line.msg.startsWith(`the door ${door} took `), line.msg).toBe(true)
}

describe('each check door says its parts in the log, and they add up to its whole time', () => {
  it('the prompt door, the assembly door and the verdict door', async () => {
    const run = await aRunToCheck()
    for (const [door, call, status] of [
      ['check.prompt', run.prompt, 200],
      ['check.assembled', run.assembled, 201],
      ['check.answer', run.answer, 201],
    ] as const) {
      const before = log.partsOf(door).length
      const reply = await call()
      expect(reply.statusCode, reply.body.slice(0, 600)).toBe(status)
      expectThePartsOf(await theNewestLineOf(door, before), door)
    }
  })
})

describe('the door that reads a check says its parts in the log, as the doors that write one do', () => {
  /** The line written by one read of the check of `run` by the inspector, which must be answered with `status`. */
  async function theLineOfARead(run: string, status: number): Promise<TheLine> {
    const before = log.partsOf('check.read').length
    const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_INSPECTOR) })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(status)
    const line = await theNewestLineOf('check.read', before)
    expect(log.partsOf('check.read').length, 'lines of check.read written by one read').toBe(before + 1)
    return line
  }

  it('one read writes one line naming its eight parts in order, and the seal read is a wait on another thread', async () => {
    runs += 1
    const { run } = await aSealedRun(app, repository, `run-${String(runs)}`)
    const line = await theLineOfARead(run, 200)
    const said = line.checkDoorParts
    expect(said.parts.map((one) => one.name)).toEqual(THE_PARTS['check.read'])
    for (const one of said.parts) {
      if (one.name === 'the seal read on its own thread') expect(one.inSqlite, one.name).toBeNull()
      else expect(one.inSqlite, one.name).not.toBeNull()
    }
    expect(line.msg).toMatch(/the seal read on its own thread [\d.]+ ms, waited on another thread/)
  })

  it('its parts and the time outside them add up to its whole time', async () => {
    runs += 1
    const { run } = await aSealedRun(app, repository, `run-${String(runs)}`)
    expectThePartsOf(await theLineOfARead(run, 200), 'check.read')
  })

  it('a refused read writes one line, naming only the parts it ran', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'message', title: 'A message to the secretary', data: { body: 'A message the inspector is no party to.', to: [{ kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }] } },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(sent.statusCode, sent.body.slice(0, 400)).toBe(409)
    const message = (sent.json() as { record: { id: string } }).record.id
    // A MESSAGE THE INSPECTOR MAY NOT READ is refused in the first part. AN ID NAMING NO RECORD passes the first part,
    // and the seal read refuses it, so that part is named too. Neither reaches the reading of the run.
    for (const [id, ran] of [
      [message, ['the refusals before the seal is read']],
      ['no-record-has-this-id', ['the refusals before the seal is read', 'the seal read on its own thread']],
    ] as const) {
      const line = await theLineOfARead(id, 404)
      expect(line.checkDoorParts.parts.map((one) => one.name), id).toEqual(ran)
    }
  })

  // A GUARD, green before the door named its parts: it reads no line, so only a change to the answer turns it red.
  it('its answer has the fields it had, and after an assembly says what the assembly kept', async () => {
    const run = await aRunToCheck()
    const aRead = async (): Promise<Record<string, unknown>> => {
      const reply = await app.inject({ method: 'GET', url: `/api/checks/${run.run}`, headers: asAgent(THE_INSPECTOR) })
      expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
      return reply.json() as Record<string, unknown>
    }
    const fields = [
      'run', 'title', 'stands', 'agent', 'brief', 'chapters', 'chaptersSays', 'savedChapters', 'precedents', 'reports', 'wrote',
      'decisions', 'decisionsComplete', 'workArea', 'workAreaSays', 'filesArea', 'checkout', 'submission', 'submissionStatus',
      'theCheck', 'whatTheCheckWouldRead', 'whatTheCheckWouldReadSays', 'workspaceId', 'narrowedByPermission',
    ]
    const before = await aRead()
    expect(Object.keys(before)).toEqual(fields)
    expect(before['run']).toBe(run.run)
    expect(before['title']).toBe(`The run run-${String(runs)}`)
    expect(before['submissionStatus']).toBe('sealed')
    expect(before['savedChapters']).toBeNull()
    expect(typeof before['workAreaSays']).toBe('string')
    expect(before['whatTheCheckWouldRead']).toBeNull()
    expect(before['whatTheCheckWouldReadSays']).toContain('Nobody has assembled a check for this run yet')

    expect((await run.prompt()).statusCode).toBe(200)
    const assembled = await run.assembled()
    expect(assembled.statusCode, assembled.body.slice(0, 400)).toBe(201)
    const kept = (assembled.json() as { whatTheCheckWouldRead: { says: string } }).whatTheCheckWouldRead
    const after = await aRead()
    expect(Object.keys(after)).toEqual(fields)
    expect(after['whatTheCheckWouldRead']).toEqual(kept)
    expect(after['whatTheCheckWouldReadSays']).toBe(kept.says)
  })
})
