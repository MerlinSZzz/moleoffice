// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DATA FOLDER DOOR: WHO MAY PRESS, WHAT A MOVE MAY START ON, AND WHAT THE PANEL READS.
 *
 * Criteria DF17 to DF21 of design/window/the-data-folder-move.criteria.md. Every case runs on a scratch office in
 * process, on a database this file made. No case touches the live office, the owner's data folder or the owner's
 * home folder.
 *
 * THE MOVER IS A REAL PROCESS OF THIS FILE'S OWN. The ways the door is given are this file's: a mark path and a log in
 * a folder it made, a bundle reading it chooses, and a start that records what it was handed and starts a small node
 * program in a group of its own. That program writes the mark through the module's own `writeTheMoveMark`, with its
 * own pid and start time, and then waits until this file stops its group. Every process a case starts is stopped by
 * its group after the case, and the case fails if the process is still there.
 *
 * THE REAL SERVICE COMMAND IS STARTED ONCE, for the system layer's own case, with a database in a folder this file
 * made and a place it refuses before it writes anything.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REPO_ROOT, THE_INSTALL } from '../src/config/settings.mjs'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** A refusal of the mover's check, as a code and its values. */
type ARefusal = ReturnType<typeof import('../src/config/the-data-folder-move.mjs')['thePlaceIsNotAFullPathRefusal']>

/** One way the door may start the mover, as this file hands it in. */
type TheWaysToMove = {
  session: string
  workspaceId: string
  fromABundle: () => boolean
  markPath: () => string
  runsAtWork: () => any[]
  whyRefused: (to: string) => ARefusal | null
  startTheMover: (input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }) => ChildProcess
  waitMs: number
}

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
// IMPORTED AFTER `freshDb`, which says which database the server's modules open.
let door: typeof import('../src/server/api/data-folder.ts')
let move: typeof import('../src/config/the-data-folder-move.mjs')
let worldauthority: typeof import('../src/server/lib/worldauthority.ts')

const RAISED = 'door-secretary'
const UNRAISED = 'door-plain-secretary'
const PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const answers = new Set<string>()

let scratch = ''
let markPath = ''
let envFile = ''
let session = ''
let moverScript = ''
let moverBehaviour: 'writes' | 'nothing' | 'exits' = 'writes'
const startCalls: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }[] = []
const children: ChildProcess[] = []

const as = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: any; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, text: reply.body }
}

function aFolder(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** The log the mover is handed, beside the mark this file gave it. */
function logPath(): string {
  return join(dirname(markPath), move.THE_MOVER_LOG)
}

/**
 * ONE START OF THE MOVER. The child is in a group of its own, writes its output to the log it was handed, and does
 * what the case asked: write the mark and wait, wait and write nothing, or end before writing the mark.
 */
function startTheMover(input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }): ChildProcess {
  startCalls.push(input)
  const log = openSync(input.logPath, 'a')
  try {
    const child =
      moverBehaviour === 'writes'
        ? spawn(
            process.execPath,
            [
              moverScript,
              JSON.stringify({
                markPath,
                from: dirname(t.file),
                to: input.to,
                database: basename(t.file),
              }),
            ],
            { cwd: input.cwd, detached: true, stdio: ['ignore', log, log], env: input.env },
          )
        : moverBehaviour === 'nothing'
          ? spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
              cwd: input.cwd,
              detached: true,
              stdio: ['ignore', log, log],
              env: input.env,
            })
          : spawn(
              process.execPath,
              ['-e', "process.stderr.write('the mover stopped before it wrote the mark\\n'); process.exit(1)"],
              { cwd: input.cwd, detached: true, stdio: ['ignore', log, log], env: input.env },
            )
    children.push(child)
    return child
  } finally {
    closeSync(log)
  }
}

/** A start-at-login reading of a computer with no login unit, as the facts carry it. */
function noLoginUnit(): { unit: 'none'; unitPath: string; startsAtLogin: false; activeWord: null; fromAnAppImage: false } {
  return { unit: 'none', unitPath: join(scratch, 'no-unit', 'mole-office.service'), startsAtLogin: false, activeWord: null, fromAnAppImage: false }
}

/** The mover's own check, with the facts of a data folder this file made, for the cases that ask it. */
function theRealCheck(to: string): ARefusal | null {
  return move.whyAMoveThereIsRefused(to, move.theFactsOfAMove(to, noLoginUnit(), envFile))
}

/** The ways a case hands the door, with only what the case changes. */
function theWays(overrides: Partial<TheWaysToMove> = {}): TheWaysToMove {
  return {
    session,
    workspaceId: 'default',
    fromABundle: () => true,
    markPath: () => markPath,
    runsAtWork: () => [],
    // A CASE THAT ACCEPTS A MOVE LETS THE CHECK THROUGH: which places it refuses is the mover's own test, and this file
    // hands the mover the check itself only in the cases that ask about a refusal.
    whyRefused: () => null,
    startTheMover,
    waitMs: 3_000,
    ...overrides,
  }
}

function theDoorGiven(ways: TheWaysToMove): void {
  door.thisOfficeMovesItsDataFolderWith(ways as never)
}

/** Whether the process under a pid is still there, asked until it is gone or the wait runs out. */
async function theProcessIsGone(pid: number): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise((done) => setTimeout(done, 20))
  }
  return false
}

/** The target a move asks for: the parent exists, and the place is not there. */
function aPlace(): string {
  return join(scratch, `a-new-place-${String(Date.now())}-${String(Math.random()).slice(2)}`)
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  delete process.env['MOLE_OFFICE_WORLD_SECRETARIES']
  scratch = aFolder('data-folder-door-')
  markPath = join(scratch, 'data-folder-move.json')
  envFile = join(scratch, '.env')
  t = await freshDb()
  move = await import('../src/config/the-data-folder-move.mjs')
  worldauthority = await import('../src/server/lib/worldauthority.ts')
  door = await import('../src/server/api/data-folder.ts')
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  session = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'Synthetic session of the data folder door test',
    data: { state: 'running' },
    actor: { type: 'system', id: 'the-data-folder-door-test' },
  }).id
  // THE MOVER THIS FILE STARTS: it writes the mark with its own pid and start, read the way `theMoverIsAlive` reads it,
  // and then waits for this file to stop its group.
  const use = (path: string) => pathToFileURL(join(ROOT, 'src', 'config', path)).href
  moverScript = join(scratch, 'the-mover.mjs')
  writeFileSync(
    moverScript,
    [
      `import { writeTheMoveMark } from ${JSON.stringify(use('the-data-folder-move.mjs'))}`,
      `import { theProcessAt } from ${JSON.stringify(use('session-process.mjs'))}`,
      `import { localStampOf } from ${JSON.stringify(use('stopped-run-cause.mjs'))}`,
      "const input = JSON.parse(process.argv[2])",
      'const at = theProcessAt(process.pid)',
      "if (!at.here || at.startedAt === null) { process.stderr.write('this process has no start time\\n'); process.exit(1) }",
      'writeTheMoveMark(input.markPath, {',
      '  version: 1, from: input.from, to: input.to, database: input.database,',
      "  state: 'stopping', mover: { pid: process.pid, startedAt: localStampOf(new Date(at.startedAt)) },",
      "  earlier: [], manifest: null, says: null, at: '2026-01-01 00:00:00',",
      '})',
      'setInterval(() => {}, 1000)',
      '',
    ].join('\n'),
  )
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [
    [RAISED, 'secretary'],
    [UNRAISED, 'secretary'],
  ] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.text.slice(0, 300)).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.text.slice(0, 300)).toBe(201)
  theDoorGiven(theWays())
}, 60_000)

beforeEach(() => {
  moverBehaviour = 'writes'
  startCalls.length = 0
  rmSync(markPath, { force: true })
  rmSync(logPath(), { force: true })
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  worldauthority.forgetTheWorldsOwnAuthority()
  theDoorGiven(theWays())
})

afterEach(async () => {
  door.thisOfficeMovesItsDataFolderWith(null)
  for (const answered of answers) setThisOfficesAnswer(answered, 'default', { type: 'human', id: THE_PERSON } as never)
  answers.clear()
  for (const child of children.splice(0)) {
    const pid = child.pid
    if (pid === undefined) continue
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // The group has already gone.
    }
    expect(await theProcessIsGone(pid), `a process this case started is still running as pid ${String(pid)}`).toBe(true)
  }
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  worldauthority.forgetTheWorldsOwnAuthority()
  rmSync(markPath, { force: true })
  rmSync(logPath(), { force: true })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('who may press, and what a test world does', () => {
  it('DF18: an unraised secretary is refused at both presses, and nothing is started', async () => {
    const to = aPlace()
    const moved = await call('POST', '/api/office/data-folder/move', as(UNRAISED), { to })
    expect(moved.status, moved.text.slice(0, 300)).toBe(403)
    expect(moved.body.code).toBe('dataFolderOnlyThePerson')
    expect(moved.body.values).toEqual({})
    const confirmed = await call('POST', '/api/office/data-folder/confirm', as(UNRAISED))
    expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(403)
    expect(confirmed.body.code).toBe('dataFolderOnlyThePerson')
    expect(startCalls).toEqual([])
    expect(existsSync(markPath)).toBe(false)
  })

  it('DF18: a raised secretary presses the move for the person where this office says the grant may', async () => {
    setThisOfficesAnswer('office.move-data-folder', 'may-press', { type: 'human', id: THE_PERSON } as never)
    answers.add('office.move-data-folder')
    const moved = await call('POST', '/api/office/data-folder/move', as(RAISED), { to: aPlace(), ...FOR_THE_PERSON })
    expect(moved.status, moved.text.slice(0, 500)).toBe(202)
    expect(startCalls).toHaveLength(1)
  })

  it("DF18: a raised secretary with no answer is refused in the check's words, and nothing is started", async () => {
    const moved = await call('POST', '/api/office/data-folder/move', as(RAISED), { to: aPlace(), ...FOR_THE_PERSON })
    expect(moved.status, moved.text.slice(0, 500)).toBe(403)
    expect(moved.body.error).toContain('The secretary card keeps office.move-data-folder for the person')
    // THE GRANT'S OWN CHECK THREW, so the refusal carries its code, its sentence as the page's value, and its status.
    expect(moved.body.code).toBe('dataFolderNotUnderTheGrant')
    expect(moved.body.values).toEqual({ why: moved.body.error })
    expect(sayInEnglish('server.dataFolderNotUnderTheGrant', { why: moved.body.error })).toBe(moved.body.error)
    expect(startCalls).toEqual([])
    expect(existsSync(markPath)).toBe(false)
  })

  it("DF18: the person's own press gets 202 and leaves the ledger row the door writes", async () => {
    const to = aPlace()
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to })
    expect(moved.status, moved.text.slice(0, 500)).toBe(202)
    const pid = moved.body.mover.pid as number
    expect(Number.isInteger(pid)).toBe(true)
    const row = t.client.sqlite
      .prepare('SELECT session_record_id, `key`, detail FROM session_resources WHERE `key` = ?')
      .get(String(pid)) as { session_record_id: string; key: string; detail: string } | undefined
    expect(row?.session_record_id, 'the mover row was not filed under the session the ways name').toBe(session)
    expect(row?.detail, 'the mover row does not say what it is').toContain('the data folder mover')
  })

  it('DF18: a test world refuses the move and the confirm with dataFolderTestWorld, and starts nothing', async () => {
    process.env['MOLE_OFFICE_WORLD_STARTED_BY'] = 'a-test-world'
    worldauthority.forgetTheWorldsOwnAuthority()
    try {
      const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to: aPlace() })
      expect(moved.status, moved.text.slice(0, 300)).toBe(409)
      expect(moved.body.code).toBe('dataFolderTestWorld')
      const confirmed = await call('POST', '/api/office/data-folder/confirm', PERSON)
      expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(409)
      expect(confirmed.body.code).toBe('dataFolderTestWorld')
      expect(startCalls).toEqual([])
      expect(existsSync(markPath)).toBe(false)
    } finally {
      delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
      worldauthority.forgetTheWorldsOwnAuthority()
    }
  })
})

describe('the reading', () => {
  it('DF19: names the folder, the database and who chose it, and has no mark before a move', async () => {
    const seen = await call('GET', '/api/office/data-folder', PERSON)
    expect(seen.status, seen.text.slice(0, 300)).toBe(200)
    expect(seen.body.folder).toBe(dirname(t.file))
    expect(seen.body.database).toBe(basename(t.file))
    expect(seen.body.chosenBy).toBe('the process environment')
    expect(seen.body.chosenBySays).toBe(move.theChosenByWords('the process environment'))
    expect(seen.body.fromABundle).toBe(true)
    expect(seen.body.mark).toEqual({ state: 'absent' })
    expect(seen.body.mayMove).toBe(true)
    expect(seen.body.mayConfirm).toBe(true)
    expect(seen.body.wouldRefuse).toBeUndefined()
  })

  it("DF19: a mark a living mover wrote is read, with moverAlive true while the mover's process lives", async () => {
    const to = aPlace()
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to })
    expect(moved.status, moved.text.slice(0, 500)).toBe(202)
    const pid = moved.body.mover.pid as number
    const seen = await call('GET', '/api/office/data-folder', PERSON)
    expect(seen.status, seen.text.slice(0, 300)).toBe(200)
    expect(seen.body.mark.state).toBe('read')
    expect(seen.body.mark.mark.to).toBe(to)
    expect(seen.body.mark.mark.mover.pid).toBe(pid)
    expect(seen.body.mark.moverAlive, 'the mover this case started reads as gone').toBe(true)
  })

  it('DF19: mayMove is false for an unraised secretary, and true for the person', async () => {
    const person = await call('GET', '/api/office/data-folder', PERSON)
    expect(person.body.mayMove).toBe(true)
    expect(person.body.mayConfirm).toBe(true)
    const secretary = await call('GET', '/api/office/data-folder', as(UNRAISED))
    expect(secretary.status, secretary.text.slice(0, 300)).toBe(200)
    expect(secretary.body.mayMove).toBe(false)
    expect(secretary.body.mayConfirm).toBe(false)
  })

  it('DF19: the reading says whether the caller is the person, true for the person and false for a secretary the grant may press', async () => {
    const person = await call('GET', '/api/office/data-folder', PERSON)
    expect(person.status, person.text.slice(0, 300)).toBe(200)
    expect(person.body.theCallerIsThePerson).toBe(true)
    // THE OFFICE'S OWN LIST MAY OPEN THIS DOOR TO THE GRANT, so mayMove is true, and the caller still is not the person.
    setThisOfficesAnswer('office.move-data-folder', 'may-press', { type: 'human', id: THE_PERSON } as never)
    answers.add('office.move-data-folder')
    const secretary = await call('GET', '/api/office/data-folder', as(RAISED))
    expect(secretary.status, secretary.text.slice(0, 300)).toBe(200)
    expect(secretary.body.theCallerIsThePerson).toBe(false)
    expect(secretary.body.mayMove).toBe(true)
  })

  it("DF19: ?to= answers the real check's code, values and English for a relative place and writes no mark and no log", async () => {
    theDoorGiven(theWays({ whyRefused: theRealCheck }))
    const place = 'a/relative/place'
    const seen = await call('GET', `/api/office/data-folder?to=${encodeURIComponent(place)}`, PERSON)
    expect(seen.status, seen.text.slice(0, 300)).toBe(200)
    const refused = move.thePlaceIsNotAFullPathRefusal(place, process.platform === 'win32' ? 'win32' : 'linux')
    expect(seen.body.wouldRefuse).toEqual({
      to: place,
      why: move.theRefusalInEnglish(refused),
      code: refused.code,
      values: refused.values,
    })
    expect(seen.body.wouldRefuse.why).toContain(JSON.stringify(place))
    expect(existsSync(markPath)).toBe(false)
    expect(existsSync(logPath())).toBe(false)
    expect(startCalls).toEqual([])
  })

  it('DF19: ?to= of a place the check lets through answers null for the English, the code and the values', async () => {
    const place = aPlace()
    const seen = await call('GET', `/api/office/data-folder?to=${encodeURIComponent(place)}`, PERSON)
    expect(seen.status, seen.text.slice(0, 300)).toBe(200)
    expect(seen.body.wouldRefuse).toEqual({ to: place, why: null, code: null, values: null })
    expect(existsSync(markPath)).toBe(false)
    expect(startCalls).toEqual([])
  })

  it('DF19: with no ways the reading uses the real mark path and answers from a bundle as the real one does', async () => {
    door.thisOfficeMovesItsDataFolderWith(null)
    const seen = await call('GET', '/api/office/data-folder', PERSON)
    expect(seen.status, seen.text.slice(0, 300)).toBe(200)
    expect(seen.body.fromABundle).toBe(THE_INSTALL.from === 'bundle')
    expect(seen.body.folder).toBe(move.whereTheDataIs().folder)
    expect(seen.body.mark).toEqual(move.readTheMoveMark(move.theMoveMarkPath()))
  })
})

describe('starting the mover', () => {
  it('DF20: a checkout is refused with dataFolderNotABundle, and nothing is started', async () => {
    theDoorGiven(theWays({ fromABundle: () => false }))
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to: aPlace() })
    expect(moved.status, moved.text.slice(0, 300)).toBe(409)
    expect(moved.body.code).toBe('dataFolderNotABundle')
    expect(moved.body.error).toContain('checkout')
    expect(startCalls).toEqual([])
    expect(existsSync(markPath)).toBe(false)
  })

  it('DF20: a run at work is refused with dataFolderRunsAtWork, naming its agent, and nothing is started', async () => {
    theDoorGiven(
      theWays({
        runsAtWork: () => [
          {
            session: 'a-run-at-work',
            workspaceId: 'default',
            agent: { id: 'a-worker', handle: 'the-worker-at-work' },
            message: null,
            since: '2026-01-01 00:00:00',
            conversation: null,
            pausable: true,
            says: 'A shutdown would pause it.',
          },
        ],
      }),
    )
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to: aPlace() })
    expect(moved.status, moved.text.slice(0, 300)).toBe(409)
    expect(moved.body.code).toBe('dataFolderRunsAtWork')
    expect(moved.body.values).toEqual({ runs: 'the-worker-at-work' })
    expect(moved.body.error).toContain('the-worker-at-work')
    expect(startCalls).toEqual([])
    expect(existsSync(markPath)).toBe(false)
  })

  it('DF20: a refused place is refused with the check’s own code and values and its English, and nothing is started', async () => {
    theDoorGiven(theWays({ whyRefused: theRealCheck }))
    const place = 'a/relative/place'
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to: place })
    expect(moved.status, moved.text.slice(0, 500)).toBe(409)
    const refused = move.thePlaceIsNotAFullPathRefusal(place, process.platform === 'win32' ? 'win32' : 'linux')
    expect(moved.body.code).toBe(refused.code)
    expect(moved.body.values).toEqual(refused.values)
    expect(moved.body.error).toBe(move.theRefusalInEnglish(refused))
    expect(startCalls).toEqual([])
    expect(existsSync(markPath)).toBe(false)
  })

  it('DF20: a second press while the first waits answers dataFolderMoveStarting', async () => {
    moverBehaviour = 'nothing'
    theDoorGiven(theWays({ waitMs: 1_500 }))
    const first = app.inject({ method: 'POST', url: '/api/office/data-folder/move', headers: PERSON, payload: { to: aPlace() } })
    await new Promise((done) => setTimeout(done, 150))
    const second = await call('POST', '/api/office/data-folder/move', PERSON, { to: aPlace() })
    expect(second.status, second.text.slice(0, 300)).toBe(409)
    expect(second.body.code).toBe('dataFolderMoveStarting')
    const firstAnswer = await first
    expect(firstAnswer.statusCode, firstAnswer.body.slice(0, 300)).toBe(503)
    expect((firstAnswer.json() as { code: string }).code).toBe('dataFolderMoverNotSeen')
    expect(startCalls).toHaveLength(1)
  })

  it('DF20: the accepted press answers 202 with the mark naming the process, and hands the mover its four facts', async () => {
    const to = aPlace()
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to })
    expect(moved.status, moved.text.slice(0, 500)).toBe(202)
    expect(moved.body.mark.to).toBe(to)
    expect(moved.body.mover.pid).toBe(children[0]?.pid)
    expect(startCalls).toHaveLength(1)
    const handed = startCalls[0]!
    expect(handed.to).toBe(to)
    expect(handed.cwd).toBe(REPO_ROOT)
    expect(handed.logPath).toBe(move.theMoverLogPath(markPath))
    expect(handed.env).toEqual(move.theEnvironmentTheMoverIsHanded())
    expect(handed.env, "the mover was handed this server's own environment object").not.toBe(process.env)
    expect(moved.body.mark.mover.pid).toBe(moved.body.mover.pid)
    expect(moved.body.logPath).toBe(move.theMoverLogPath(markPath))
    expect(moved.body.says).toBe(door.theMoveStartedWords(moved.body.mover.pid, move.theMoverLogPath(markPath)))
  })

  it('DF20: a mover that ends before it writes the mark answers dataFolderMoverEnded with the end of its log', async () => {
    moverBehaviour = 'exits'
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to: aPlace() })
    expect(moved.status, moved.text.slice(0, 500)).toBe(409)
    expect(moved.body.code).toBe('dataFolderMoverEnded')
    expect(moved.body.values.log).toContain('the mover stopped before it wrote the mark')
    expect(moved.body.error).toBe(door.theMoverEndedWords(moved.body.values.log))
    expect(existsSync(markPath)).toBe(false)
  })

  it('DF20: a mover that writes nothing answers dataFolderMoverNotSeen after a short wait', async () => {
    moverBehaviour = 'nothing'
    theDoorGiven(theWays({ waitMs: 800 }))
    const moved = await call('POST', '/api/office/data-folder/move', PERSON, { to: aPlace() })
    expect(moved.status, moved.text.slice(0, 500)).toBe(503)
    expect(moved.body.code).toBe('dataFolderMoverNotSeen')
    expect(moved.body.values.group).toBe(String(children[0]?.pid))
    expect(moved.body.values.log).toBe(move.theMoverLogPath(markPath))
    expect(moved.body.error).toBe(door.theMoverNotSeenWords(moved.body.values.group, moved.body.values.log))
    expect(existsSync(markPath)).toBe(false)
  })

  it('DF20: the Linux probe starts the real service command, which refuses a relative place in its log', async () => {
    const { osProbe } = await import('../src/server/lib/resources.ts')
    const folder = aFolder('data-folder-mover-probe-')
    const database = join(folder, 'mole-office.db')
    const log = join(folder, 'the-mover.log')
    const start = osProbe().startTheDataFolderMover
    expect(start, 'the Linux probe has no way to start the mover').toBeDefined()
    const probe = osProbe()
    const child = probe.startTheDataFolderMover!({ to: 'a/relative/place', cwd: ROOT, logPath: log, env: { ...process.env, MOLE_OFFICE_DB: database } })
    children.push(child)
    const [code] = (await once(child, 'exit')) as [number | null, string | null]
    expect(code).toBe(1)
    expect(readFileSync(log, 'utf8')).toContain(
      move.theRefusalInEnglish(move.thePlaceIsNotAFullPathRefusal('a/relative/place', process.platform === 'win32' ? 'win32' : 'linux')),
    )
    expect(existsSync(database), 'the refused move wrote a database').toBe(false)
    rmSync(folder, { recursive: true, force: true })
  })

  it("DF20: the door's real ways start the mover through this system's probe, which refuses a relative place in its log", async () => {
    const folder = aFolder('data-folder-mover-real-ways-')
    const database = join(folder, 'mole-office.db')
    const log = join(folder, 'the-mover.log')
    const child = door.theRealWaysToMove('a-session', 'default').startTheMover({
      to: 'a/relative/place',
      cwd: ROOT,
      logPath: log,
      env: { ...process.env, MOLE_OFFICE_DB: database },
    })
    children.push(child)
    const [code] = (await once(child, 'exit')) as [number | null, string | null]
    expect(code).toBe(1)
    expect(readFileSync(log, 'utf8')).toContain(
      move.theRefusalInEnglish(move.thePlaceIsNotAFullPathRefusal('a/relative/place', process.platform === 'win32' ? 'win32' : 'linux')),
    )
    expect(existsSync(database), 'the refused move wrote a database').toBe(false)
    rmSync(folder, { recursive: true, force: true })
  })

  it("DF4: the door hands the check this computer's login unit", async () => {
    const startAtLogin = await import('../src/config/start-at-login.mjs')
    const home = aFolder('data-folder-door-home-')
    const emptyPath = aFolder('data-folder-door-path-')
    const unitPath = startAtLogin.theStartAtLoginUnitPath(home)
    mkdirSync(dirname(unitPath), { recursive: true })
    writeFileSync(unitPath, `${startAtLogin.START_AT_LOGIN_UNIT_MARK}\n`)
    const place = join(aFolder('data-folder-door-unit-place-'), 'new-data')
    const beforeHome = process.env['HOME']
    const beforePath = process.env['PATH']
    try {
      process.env['HOME'] = home
      process.env['PATH'] = emptyPath
      const reading = startAtLogin.readStartAtLogin({ home, office: startAtLogin.theOfficeThisServerIs() })
      expect(reading.systemd, 'no systemctl is found in the empty PATH').toBe('no answer')
      expect(reading.unit, 'the file this case wrote is the unit the reading finds').not.toBe('none')
      expect(move.theLoginUnitWouldStartTheOldFolder(reading)).toBe(true)

      const refused = door.theRealWaysToMove('a-session', 'default').whyRefused(place)

      expect(refused).toEqual(move.theLoginUnitKeepsTheOldFolderRefusal(reading))
    } finally {
      if (beforeHome === undefined) delete process.env['HOME']
      else process.env['HOME'] = beforeHome
      if (beforePath === undefined) delete process.env['PATH']
      else process.env['PATH'] = beforePath
    }
  })

  // THE READING IS ONE OF AN APPIMAGE when APPIMAGE and APPDIR are set and APPDIR holds the office's command
  // (theAppImageFolderHolding, src/config/systems/the-installer-of-a-folder.mjs). The AppImage file need not be there.
  it("DF4: in an AppImage the door hands the check the reading's AppImage", async () => {
    const startAtLogin = await import('../src/config/start-at-login.mjs')
    const home = aFolder('data-folder-door-home-')
    const emptyPath = aFolder('data-folder-door-path-')
    const unitPath = startAtLogin.theStartAtLoginUnitPath(home)
    mkdirSync(dirname(unitPath), { recursive: true })
    writeFileSync(unitPath, `${startAtLogin.START_AT_LOGIN_UNIT_MARK}\n`)
    const place = join(aFolder('data-folder-door-unit-place-'), 'new-data')
    const image = join(aFolder('data-folder-door-appimage-'), 'Mole-Office.AppImage')
    const beforeHome = process.env['HOME']
    const beforePath = process.env['PATH']
    const beforeAppDir = process.env['APPDIR']
    const beforeAppImage = process.env['APPIMAGE']
    try {
      process.env['HOME'] = home
      process.env['PATH'] = emptyPath
      process.env['APPDIR'] = dirname(startAtLogin.theOfficeThisServerIs().command)
      process.env['APPIMAGE'] = image
      const reading = startAtLogin.readStartAtLogin({ home, office: startAtLogin.theOfficeThisServerIs() })
      expect(reading.fromAnAppImage, 'APPDIR holds the office command').toBe(true)
      expect(reading.systemd, 'in an AppImage systemd is not asked').toBe('not asked')
      expect(reading.unit, 'the file this case wrote is the unit the reading finds').not.toBe('none')

      const refused = await door.theRealWaysToMove('a-session', 'default').whyRefused(place)

      expect(refused).toEqual(move.theLoginUnitKeepsTheOldFolderRefusal(reading))
      expect(refused?.code).toBe('dataFolderLoginUnitInAnAppImage')
      expect(move.theRefusalInEnglish(refused!)).not.toContain('on again')
    } finally {
      if (beforeHome === undefined) delete process.env['HOME']
      else process.env['HOME'] = beforeHome
      if (beforePath === undefined) delete process.env['PATH']
      else process.env['PATH'] = beforePath
      if (beforeAppDir === undefined) delete process.env['APPDIR']
      else process.env['APPDIR'] = beforeAppDir
      if (beforeAppImage === undefined) delete process.env['APPIMAGE']
      else process.env['APPIMAGE'] = beforeAppImage
    }
  })
})

describe('the confirm press', () => {
  /** A mark that says a move started, from an old folder into the folder this scratch office opened. */
  function aStartedMarkWith(oldFolder: string): { markPath: string; unchanged: string[]; changed: string } {
    mkdirSync(join(oldFolder, 'backups'), { recursive: true })
    mkdirSync(join(oldFolder, 'report-files'), { recursive: true })
    writeFileSync(join(oldFolder, 'keys.json'), 'a key file\n')
    writeFileSync(join(oldFolder, 'backups', 'unchanged.db'), 'a backup kept by two names\n')
    writeFileSync(join(oldFolder, 'report-files', 'stored.txt'), 'a stored file\n')
    const walk = move.theFilesOf(oldFolder)
    const manifest = move.theManifestOf(oldFolder, walk)
    const mark = {
      version: 1 as const,
      from: oldFolder,
      to: dirname(t.file),
      database: basename(t.file),
      state: 'started' as const,
      mover: { pid: process.pid, startedAt: '2026-01-01 00:00:00' },
      earlier: [],
      manifest,
      says: null,
      at: '2026-01-01 00:00:00',
    }
    move.writeTheMoveMark(markPath, mark)
    writeFileSync(join(oldFolder, 'report-files', 'stored.txt'), 'changed after the move\n')
    return { markPath, unchanged: Object.keys(manifest).filter((name) => name !== 'report-files/stored.txt'), changed: 'report-files/stored.txt' }
  }

  it("DF21: a started mark is confirmed, and the answer names what went and what stayed", async () => {
    const oldFolder = aFolder('data-folder-door-old-')
    const made = aStartedMarkWith(oldFolder)
    const confirmed = await call('POST', '/api/office/data-folder/confirm', PERSON)
    expect(confirmed.status, confirmed.text.slice(0, 500)).toBe(200)
    expect([...confirmed.body.removed].sort()).toEqual([...made.unchanged].sort())
    expect(confirmed.body.kept).toEqual([made.changed])
    for (const name of made.unchanged) expect(existsSync(join(oldFolder, name)), `${name} is still there`).toBe(false)
    expect(readFileSync(join(oldFolder, made.changed), 'utf8')).toBe('changed after the move\n')
    expect(confirmed.body.says).toBe(door.theMoveConfirmedWords(confirmed.body.removed, confirmed.body.kept))
    const read = move.readTheMoveMark(markPath)
    expect(read.state).toBe('read')
    if (read.state === 'read') expect(read.mark.state).toBe('confirmed')
    rmSync(oldFolder, { recursive: true, force: true })
  })

  it("DF21: a mark that says the move was switched back answers the confirm's own code and values", async () => {
    const oldFolder = aFolder('data-folder-door-switched-back-')
    mkdirSync(oldFolder, { recursive: true })
    move.writeTheMoveMark(markPath, {
      version: 1,
      from: oldFolder,
      to: dirname(t.file),
      database: basename(t.file),
      state: 'switched-back',
      mover: { pid: process.pid, startedAt: '2026-01-01 00:00:00' },
      earlier: [],
      manifest: null,
      says: 'the office was put back',
      at: '2026-01-01 00:00:00',
    })
    const confirmed = await call('POST', '/api/office/data-folder/confirm', PERSON)
    expect(confirmed.status, confirmed.text.slice(0, 500)).toBe(409)
    expect(confirmed.body.code).toBe('dataFolderConfirmNeedsAStartedMove')
    expect(confirmed.body.values).toEqual({ mark: markPath, state: 'switched-back' })
    expect(confirmed.body.error).toBe(move.theRefusalInEnglish(move.theConfirmNeedsAStartedMoveRefusal(markPath, 'switched-back')))
    rmSync(oldFolder, { recursive: true, force: true })
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'DF21: a mark that cannot be written after the removal is a fault, not nothing to confirm (skipped on Windows and as root, where a read-only folder still takes a write)',
    async () => {
      const oldFolder = aFolder('data-folder-door-unwritable-mark-')
      const made = aStartedMarkWith(oldFolder)
      chmodSync(dirname(markPath), 0o500)
      let confirmed: Awaited<ReturnType<typeof call>>
      try {
        confirmed = await call('POST', '/api/office/data-folder/confirm', PERSON)
      } finally {
        chmodSync(dirname(markPath), 0o700)
      }
      expect(confirmed.status, confirmed.text.slice(0, 500)).toBe(500)
      expect(confirmed.body.code).toBeUndefined()
      for (const name of made.unchanged) expect(existsSync(join(oldFolder, name)), `${name} is still there`).toBe(false)
      const read = move.readTheMoveMark(markPath)
      expect(read.state).toBe('read')
      if (read.state === 'read') expect(read.mark.state).toBe('started')
      rmSync(oldFolder, { recursive: true, force: true })
    },
  )

  it('DF21: an unraised secretary is refused, and the mark is left as it was', async () => {
    const oldFolder = aFolder('data-folder-door-unraised-')
    const made = aStartedMarkWith(oldFolder)
    const before = readFileSync(markPath, 'utf8')
    const confirmed = await call('POST', '/api/office/data-folder/confirm', as(UNRAISED))
    expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(403)
    expect(confirmed.body.code).toBe('dataFolderOnlyThePerson')
    expect(readFileSync(markPath, 'utf8')).toBe(before)
    for (const name of made.unchanged) expect(existsSync(join(oldFolder, name)), `${name} was removed`).toBe(true)
    rmSync(oldFolder, { recursive: true, force: true })
  })
})

describe('the earlier data folders the mark lists', () => {
  it("DF17: answers none for no mark, the mark's earlier folders for one that lists them, and the unreadable value for a mark it cannot read", () => {
    const folder = aFolder('data-folder-door-earlier-')
    try {
      const absent = join(folder, 'no-mark.json')
      expect(door.theEarlierDataFoldersOfTheMark(absent)).toEqual([])

      const listed = join(folder, 'listed.json')
      move.writeTheMoveMark(listed, {
        version: 1,
        from: '/a/old/data',
        to: '/a/new/data',
        database: 'mole-office.db',
        state: 'confirmed',
        mover: { pid: process.pid, startedAt: '2026-01-01 00:00:00' },
        earlier: ['/a/first/data', '/a/second/data'],
        manifest: null,
        says: null,
        at: '2026-01-01 00:00:00',
      })
      expect(door.theEarlierDataFoldersOfTheMark(listed)).toEqual(['/a/first/data', '/a/second/data'])

      const broken = join(folder, 'broken.json')
      writeFileSync(broken, '{ this is not a mark')
      const read = move.readTheMoveMark(broken)
      expect(read.state).toBe('unreadable')
      if (read.state !== 'unreadable') throw new Error('the mark should be unreadable')
      // THE VALUE IS NOT A LIST, so no caller can take an unreadable mark for a mark that lists no earlier folder.
      expect(door.theEarlierDataFoldersOfTheMark(broken)).toEqual({ state: 'unreadable', mark: broken, why: read.why })
      expect(sayInEnglish('server.dataFolderMarkUnreadable', { mark: broken, why: read.why })).toBe(
        door.theStoredFilesNeedTheMarkWords(broken, read.why),
      )
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  // THE MARK SAYS WHICH EARLIER FOLDERS TO READ FROM, so while it cannot be read a path is refused only when a store's
  // folder above its last name could hold it in one of them. Every other path is read as it is, as it is for every
  // list of earlier folders: a path that is a store's own folder is in no store.
  it("DF17: while the mark cannot be read, refuses only a path with a store's folder above its last name, and reads any other path as it is", async () => {
    const { whereStoredFilesAreNow, whereAStoreIs, STORES_BESIDE_THE_DATABASE } = await import('../src/server/api/files.ts')
    const folder = aFolder('data-folder-door-narrow-')
    try {
      const mark = join(folder, 'data-folder-move.json')
      writeFileSync(mark, '{ this is not a mark')
      const read = move.readTheMoveMark(mark)
      expect(read.state).toBe('unreadable')
      const why = read.state === 'unreadable' ? read.why : ''
      const dataFolder = dirname(whereAStoreIs('report-files'))
      const isNow = whereStoredFilesAreNow(door.theEarlierDataFoldersOfTheMark(mark))
      const name = 'Kq3mNarrow7x.png'

      // NO STORE'S FOLDER IS ABOVE THIS LAST NAME, so no list of earlier folders would read it from anywhere else.
      const underPictures = join(folder, 'pictures', name)
      expect(isNow(underPictures)).toBe(underPictures)

      for (const store of STORES_BESIDE_THE_DATABASE) {
        // A PATH THAT IS A STORE'S OWN FOLDER IS IN NO STORE: the folder above its last name is what is asked.
        const theStoreFolder = join(folder, store)
        expect(isNow(theStoreFolder)).toBe(theStoreFolder)
        // A FOLDER WHOSE NAME HOLDS A STORE'S NAME IS NOT THAT STORE.
        const notTheStore = join(folder, `old-${store}`, name)
        expect(isNow(notTheStore)).toBe(notTheStore)
      }

      // A FILE IN A STORE, OR IN A FOLDER BELOW ONE, MAY NAME A FILE IN A STORE OF AN EARLIER DATA FOLDER. The mark is
      // named, because the earlier folders are not known.
      for (const store of STORES_BESIDE_THE_DATABASE) {
        for (const insideTheStore of [join(folder, store, name), join(folder, store, 'sub', name)]) {
          let refused: unknown = null
          try {
            isNow(insideTheStore)
          } catch (error) {
            refused = error
          }
          expect(refused).toMatchObject({
            message: door.theStoredFilesNeedTheMarkWords(mark, why),
            status: 503,
            code: 'dataFolderMarkUnreadable',
            values: { mark, why },
          })
        }
      }

      // THE DATA FOLDER IN USE PLACES THIS PATH, so it is read as before even though a store's folder is above it.
      const inAStoreInUse = join(dataFolder, 'report-files', name)
      expect(isNow(inAStoreInUse)).toBe(inAStoreInUse)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe("the words the page draws", () => {
  it('DF20: every coded refusal the door throws is the English it declares, and the answers are built in code', () => {
    const runs = [
      {
        session: 'a-run',
        workspaceId: 'default',
        agent: { id: 'a-worker', handle: 'a-worker-handle' },
        message: null,
        since: '2026-01-01 00:00:00',
        conversation: null,
        pausable: true,
        state: 'running' as const,
        says: 'A shutdown would pause it.',
      },
    ]
    const cases: { code: string; values: Record<string, string>; says: string }[] = [
      { code: 'dataFolderTestWorld', values: {}, says: door.theTestWorldWords() },
      { code: 'dataFolderNoWayToStart', values: {}, says: door.theNoWayToStartWords() },
      { code: 'dataFolderNotABundle', values: {}, says: door.theNotABundleWords() },
      { code: 'dataFolderRunsAtWork', values: door.theRunsAtWorkValues(runs), says: door.theRunsAtWorkWords(runs) },
      { code: 'dataFolderMoveStarting', values: {}, says: door.theMoveStartingWords() },
      {
        code: 'dataFolderMoveRefused',
        values: { why: 'a made-up sentence' },
        says: move.theRefusalInEnglish({ code: 'dataFolderMoveRefused', values: { why: 'a made-up sentence' } }),
      },
      { code: 'dataFolderMoverEnded', values: { log: 'the end of a log' }, says: door.theMoverEndedWords('the end of a log') },
      {
        code: 'dataFolderMoverNotSeen',
        values: { group: '4321', log: '/a/log' },
        says: door.theMoverNotSeenWords('4321', '/a/log'),
      },
    ]
    for (const one of cases) {
      expect(sayInEnglish(`server.${one.code}` as never, one.values), one.code).toBe(one.says)
    }
  })

  it('DF21: the confirm answer is built from what was removed and what was kept', () => {
    const says = door.theMoveConfirmedWords(['backups/a.db'], ['report-files/b.txt'])
    expect(says).toContain('1 copied file was removed')
    expect(says).toContain('1 file was kept as it is')
    expect(says).not.toContain('could not be read')
    expect(says).toContain('earlier data folders')
  })

  it('DF16: the confirm sentence has a form for one kept folder and a form for more, and carries the count', () => {
    const one = door.theMoveConfirmedWords([], ['backups/'])
    const two = door.theMoveConfirmedWords([], ['backups/', 'report-files/stored/'])
    expect(one).not.toBe(two)
    expect(one).toMatch(/\b1 folder\b/)
    expect(two).toMatch(/\b2 folders\b/)
    // A KEPT FOLDER IS COUNTED APART FROM THE KEPT FILES, and each count is carried into its own form.
    const mixed = door.theMoveConfirmedWords([], ['report-files/b.txt', 'backups/'])
    expect(mixed).toMatch(/\b1 folder\b/)
    expect(mixed).toMatch(/\b1 file\b/)
  })

  it('DF21: a kept folder the confirm could not read or remove is counted apart from the kept files', () => {
    const says = door.theMoveConfirmedWords(['keys.json'], ['backups/', 'report-files/b.txt', 'report-files/c.txt'])
    expect(says).toContain('2 files were kept as they are')
    expect(says).toContain('1 folder could not be read or removed, so it was kept with whatever it holds.')
  })
})
