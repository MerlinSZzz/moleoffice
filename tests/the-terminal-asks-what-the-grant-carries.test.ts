// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL ASKS WHAT THE GRANT CARRIES. Eighteen doors of the office's terminals, of the agents opened in them and of
 * the agent tools they list were the person's alone. Each now asks the one check (`aRaiseCarriesIt` in lib/records.ts)
 * after the person, so a secretary holding the person's grant presses it for them where this office's list of what the
 * grant carries says `may-press`. An office that changed nothing behaves as before: the secretary card keeps each door.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. It listens on a port the
 * system gives it, so a terminal's stream can be read and an agent's terminal can be told where its office is. A
 * terminal holder of its own runs in a place of its own (tests/terminal-holder-stand.ts). The agent's program and tmux
 * are stand-ins first on the PATH, as tests/an-agents-tmux-pane-is-watched-without-moving-the-persons.test.ts puts
 * them, so no real claude and no real tmux runs. Two secretaries, one of them raised, and two workers are made-up
 * agents. Every record here is synthetic.
 *
 * FOR EACH DOOR, THROUGH ITS ROUTE:
 * The open-agent, list, pane, way-back and steps doors now admit a secretary's own key first.
 * The grant cases below continue to guard every remaining door, including bringing a run back
 * without a key. For the five ordinary doors, even a held grant and a kept row do not narrow
 * the secretary's own authority.
 *   1. no grant: the unraised secretary hears the door's old refusal and code, even with this office's row at
 *      may-press, and nothing changes;
 *   2. granted, no row: the raised secretary is refused 403 in the check's words, naming the door, and nothing changes;
 *   3. the row at kept: the refusal says it is this office's answer, and nothing changes;
 *   4. the row at may-press: the press goes through, and no change row names the person as the one who did it. A write
 *      is written down once, as the secretary's under the grant; a read, the stream of a terminal included, writes no
 *      press row.
 * The holder's restart goes first, because it ends every terminal. Typing asks the check too since round 83, for one
 * whole line sent as `line`, and tests/a-secretary-types-a-line-in-a-terminal.test.ts holds its cases. Installing the
 * agent tools asks the list since round 81, and tests/installing-the-agent-tools-asks-the-list.test.ts holds its cases.
 *
 * WHAT A PRESS UNDER THE GRANT DOES NOT GET. An agent it opens or brings back is given no run key, and the answer says
 * so. A terminal it opens names the secretary as who opened it, never the person.
 *
 * MUTATIONS, after a control run: take `aRaiseCarriesIt` out of one door's guard, and that door's case 4 goes red.
 * Write a press row for the stream of a terminal before it is handed over, and its case 4 goes red.
 *
 * MUTATIONS RUN ON 23 OCTOBER 2026 for opening, closing and keeping a line, each alone after green, then restored:
 *   1. Opening asks onlyThePerson alone: opening cases 2, 3 and 4 went red.
 *   5. The agent-run check on closing is removed: the agent-terminal refusal case went red.
 *   6. Opening records the person as who opened it: opening case 4 went red on who.
 *   7. Keeping a line asks onlyThePerson alone: keep-line cases 2, 3 and 4 went red.
 * Typing mutations 2, 3 and 4 were withdrawn by the supervisor, because typing stayed the person's alone in that round.
 * Typing asks the check since round 83, and its mutations are in tests/a-secretary-types-a-line-in-a-terminal.test.ts.
 */

import type { FastifyInstance } from 'fastify'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { operationNamed } from '../src/shared/ops.ts'
import type { TerminalReading } from '../src/shared/terminals.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { REPO, aPlace, groups, holder, openThroughTheHolder, readTheStream, startAHolder, stopEverything, until, type HeldTerminal, type Place } from './terminal-holder-stand.ts'

const RAISED = 'terminal-grant-secretary'
const UNRAISED = 'terminal-plain-secretary'
const WORKER = 'terminal-grant-worker'
const PANED = 'terminal-paned-worker'

// Read the shared refusal after freshDb has selected this test's database.
let THE_TERMINAL_PERMISSION: string
const THE_TOOLS_OLD_WORDS =
  "Only the person or a secretary holding the person's grant may read or install the agent tools the office runs. The secretary presses only where this office's list of what the grant carries says so. Any other agent is refused, and nothing from a sandbox counts as the person."

/** The viewer the holder runs, as src/server/lib/agent-pane.ts names it. */
const THE_PANE_VIEW = join(REPO, 'src', 'config', 'tmux-pane-view.mjs')

const CLAUDE_STAND_IN = `#!${process.execPath}
process.stdout.write('STAND-IN claude ARGS ' + JSON.stringify(process.argv.slice(2)) + '\\r\\n')
setInterval(() => undefined, 1 << 30)
`

/**
 * THE STAND-IN TMUX, as tests/an-agents-tmux-pane-is-watched-without-moving-the-persons.test.ts writes it. It reads the
 * state the test writes, and logs every command it is given.
 */
function aTmuxStandIn(state: string, calls: string): string {
  return `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
const log = (entry) => fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(entry) + '\\n')
const state = () => JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
log({ args })
const flag = (name) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1])
const pane = (id) => state().panes.find((one) => one.id === id)
const fail = (line) => { process.stderr.write(line + '\\n'); process.exit(1) }
if (args[0] === 'list-panes') {
  if (state().noServer) fail('no server running on /tmp/tmux-test/default')
  for (const one of state().panes) process.stdout.write([one.id, one.target, one.tty, one.cols, one.rows].join(' ') + '\\n')
} else if (args[0] === 'display-message') {
  const one = pane(flag('-t'))
  if (one === undefined) fail("can't find pane: " + flag('-t'))
  process.stdout.write(args[args.length - 1].includes('cursor') ? one.id + ' ' + state().cursor + '\\n' : one.id + '\\n')
} else if (args[0] === 'capture-pane') {
  if (pane(flag('-t')) === undefined) fail("can't find pane: " + flag('-t'))
  process.stdout.write(state().screen + '\\n')
} else if (args[0] === 'new-session' || args[0] === 'kill-session') {
  // Nothing to do: the log is what a test reads.
} else if (args[0] === '-C') {
  process.stdout.write('%begin 1 1 0\\n%end 1 1 0\\n')
  let sent = 0
  setInterval(() => {
    const outputs = state().outputs
    for (; sent < outputs.length; sent += 1) process.stdout.write('%output ' + outputs[sent][0] + ' ' + outputs[sent][1] + '\\n')
  }, 200)
  let typed = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    typed += chunk
    let at
    while ((at = typed.indexOf('\\n')) !== -1) { log({ typed: typed.slice(0, at) }); typed = typed.slice(at + 1) }
  })
  process.stdin.on('end', () => process.exit(0))
} else {
  fail('the stand-in tmux does not know ' + args.join(' '))
}
`
}

let t: TestDb
let app: FastifyInstance
let api = ''
let place: Place
let stateFile = ''
let grantId = ''
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let forgetWhatThisProcessBound: () => void = () => undefined
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
/** What this file changed in its own process's environment, put back after. */
const saved = new Map<string, string | undefined>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

interface AReply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  error: string
  raw: string
}

function aReplyOf(status: number, raw: string): AReply {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = JSON.parse(raw)
  } catch {
    body = {}
  }
  return { status, body, error: typeof body?.error === 'string' ? body.error : '', raw }
}

/**
 * EVERY PROCESS A REPLY NAMES GOES INTO `groups` AT ONCE: a holder started, a terminal opened, a view of a pane. Each
 * leads a process group of its own, so `stopEverything` stops it, even where a case fails before it looks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function keepTheGroupsOf(body: any): void {
  for (const pid of [body?.holder?.pid, body?.terminal?.pid, body?.view?.pid]) if (typeof pid === 'number') groups.add(pid)
}

async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<AReply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  const said = aReplyOf(reply.statusCode, reply.body)
  keepTheGroupsOf(said.body)
  return said
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

const theLast = (table: string): number => (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

function rowsSince(mark: number): { record_id: string; actor_type: string; actor_id: string; elevation: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, elevation FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { record_id: string; actor_type: string; actor_id: string; elevation: string | null }[]
}

function pressesSince(mark: number): { agent_id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { agent_id: string; grant_id: string; operation: string; reason: string | null }[]
}

const readAll = (sql: string, ...values: unknown[]): string => JSON.stringify(t.client.sqlite.prepare(sql).all(...values))

function extraOf(data: Record<string, unknown>): Record<string, unknown> {
  const extra = data['extra']
  return typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>) : {}
}

async function theTerminals(): Promise<TerminalReading[]> {
  return (await holder(place, { op: 'list' }))['terminals'] as TerminalReading[]
}

/** Every terminal the holder holds now, as far as any door here could change it. */
async function theTerminalsNow(): Promise<string> {
  return JSON.stringify((await theTerminals()).map((one) => ({ id: one.id, state: one.state, cols: one.cols, rows: one.rows, keeping: one.keeping, who: one.who })))
}

const theHolderNow = async (): Promise<string> => String((await holder(place, { op: 'hello' }))['pid'])

let first: HeldTerminal | null = null

/** One terminal opened past the server, after the restart, for the doors that act on one terminal. */
async function theFirstTerminal(): Promise<HeldTerminal> {
  first ??= await openThroughTheHolder(place, { cols: 80, rows: 24 })
  return first
}

async function theFirstTerminalNow(): Promise<TerminalReading> {
  const id = (await theFirstTerminal()).id
  const one = (await theTerminals()).find((each) => each.id === id)
  if (one === undefined) throw new Error(`The holder holds no terminal ${id}.`)
  return one
}

/** The runs of an agent the office filed. */
const theRunsOf = (handle: string): string => readAll("SELECT id FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = ? ORDER BY id", handle)

interface APress {
  method: 'GET' | 'POST' | 'PUT'
  url: string
  /** The body of a write. A read is sent none, because it needs no reason. */
  body?: Record<string, unknown>
  /** What the press may change, read before it and after. */
  state: () => string | Promise<string>
  /** How the press is sent where one inject cannot: a terminal's stream is read over the port. */
  send?: (headers: Record<string, string>) => Promise<AReply>
}

interface ADoor {
  /** A secretary now presses this door on its own key, before the grant is considered. */
  ownKey?: true
  door: string
  /** The door's refusal before it asked the check, which a caller with no grant still hears. */
  oldWords: () => string
  oldCode: string
  make: () => Promise<APress>
  /** What a press that went through shows, beyond its press row: its reply, and its state before and after. */
  went: (done: AReply, before: string, after: string) => void | Promise<void>
}

function send(press: APress, headers: Record<string, string>): Promise<AReply> {
  if (press.send !== undefined) return press.send(headers)
  return call(press.method, press.url, headers, press.method === 'GET' ? undefined : { ...press.body, ...FOR_THE_PERSON })
}

async function refusedAndNothingChanged(press: APress, who: string, words: string): Promise<AReply> {
  const before = await press.state()
  const changes = theLast('changes')
  const presses = theLast('presses_for_the_person')
  const refused = await send(press, as(who))
  expect(refused.status, refused.raw).toBe(403)
  expect(refused.error).toContain(words)
  expect(await press.state(), 'a refused press changed something').toBe(before)
  expect(rowsSince(changes), 'a refused press wrote a change row').toEqual([])
  expect(pressesSince(presses), 'a refused press was written down as a press').toEqual([])
  return refused
}

function theFourCases(one: ADoor): void {
  describe(one.door, () => {
    let press: APress
    beforeAll(async () => {
      press = await one.make()
    }, 60_000)

    it('1: with no grant and a may-press row, follows the door’s own permission', async () => {
      answer(one.door, 'may-press')
      if (one.ownKey) {
        const read = await send(press, as(UNRAISED))
        expect(read.status, read.raw).toBeLessThan(300)
        return
      }
      const refused = await refusedAndNothingChanged(press, UNRAISED, one.oldWords())
      expect(refused.body.code, refused.raw).toBe(one.oldCode)
    }, 60_000)

    it('2: granted, with no row, refuses in the check’s words naming the door', async () => {
      if (one.ownKey) {
        const done = await send(press, as(RAISED))
        expect(done.status, done.raw).toBeLessThan(300)
        return
      }
      const refused = await refusedAndNothingChanged(press, RAISED, `The secretary card keeps ${one.door} for the person`)
      expect(refused.body.code, 'the check’s refusal is dressed as the door’s own').not.toBe(one.oldCode)
    }, 60_000)

    it('3: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      if (one.ownKey) {
        const done = await send(press, as(RAISED))
        expect(done.status, done.raw).toBeLessThan(300)
        return
      }
      const refused = await refusedAndNothingChanged(press, RAISED, `keeps ${one.door} for the person`)
      expect(refused.error).toContain("This office's list of what the grant carries, since")
    }, 60_000)

    it('4: with the row at may-press, goes through, and a write is written down as the secretary’s press under the grant', async () => {
      answer(one.door, 'may-press')
      const before = await press.state()
      const changes = theLast('changes')
      const presses = theLast('presses_for_the_person')
      const done = await send(press, as(RAISED))
      expect(done.status, `${one.door}: ${done.raw}`).toBeLessThan(300)
      if (one.ownKey || operationNamed(one.door)?.effect === 'read') {
        expect(pressesSince(presses), `${one.door} is a read, and it wrote a press row`).toEqual([])
      } else {
        expect(pressesSince(presses), `${one.door} was not written down once, as the secretary's press under the grant`).toEqual([
          { agent_id: RAISED, grant_id: grantId, operation: one.door, reason: press.method === 'GET' ? null : A_TESTS_REASON_FOR_THE_PERSON },
        ])
      }
      const rows = rowsSince(changes)
      expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
      expect(rows.filter((row) => row.actor_id === RAISED && row.elevation === null), 'a change row of the secretary does not name the grant').toEqual([])
      await one.went(done, before, await press.state())
    }, 90_000)
  })
}

/** What an agent opened in a terminal under the grant must say: no key, and the secretary as who opened it. */
function anAgentOpenedUnderTheGrant(done: AReply, handle: string): Record<string, unknown> {
  expect(done.status, done.raw).toBe(201)
  const terminal = done.body.terminal as TerminalReading
  expect(done.body.key.given, 'a press under the grant was given a run key').toBe(false)
  expect(done.body.key.says).toContain(`under the person's grant ${grantId}`)
  expect(done.body.says).toContain(done.body.key.says)
  expect(terminal.envNames, 'a terminal opened under the grant holds a run key').not.toContain('MOLE_AGENT_KEY')
  expect(terminal.who, 'the terminal does not say the secretary opened it').toEqual({ kind: 'agent', id: ids.get(RAISED) })
  expect(terminal.agent).toEqual({ kind: 'agent', id: ids.get(handle) })
  const data = t.api.getRecord(String(done.body.session))!.data
  expect(extraOf(data)['openedBy']).toEqual({ type: 'agent', id: RAISED, underTheGrant: grantId })
  expect(String(data['doing'])).toContain(RAISED)
  expect(String(data['doing'])).toContain(grantId)
  return data
}

/** The terminal a process runs on, as ps names it. */
function theTerminalOfTheProcess(pid: number): Promise<string> {
  return new Promise<string>((done) => {
    const ps = spawn('ps', ['-o', 'tty=', '-p', String(pid)])
    let out = ''
    ps.stdout.on('data', (chunk) => (out += String(chunk)))
    ps.on('close', () => done(out.trim()))
  })
}

function setTheEnvironment(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name])
  process.env[name] = value
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  THE_TERMINAL_PERMISSION = (await import('../src/server/api/terminals.ts')).THE_TERMINAL_PERMISSION
  // THE HOLDER IS THIS DATABASE'S, in a place of this file's own: its socket is inside the place, never the live one.
  const made = aPlace('g')
  setTheEnvironment('XDG_CONFIG_HOME', made.config)
  setTheEnvironment('MOLE_OFFICE_TERMINAL_HOLDER', 'on')
  place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  stateFile = join(place.dir, 'tmux-state.json')
  writeFileSync(stateFile, JSON.stringify({ noServer: false, panes: [], screen: '', cursor: '0 0', outputs: [] }))
  writeFileSync(join(bin, 'claude'), CLAUDE_STAND_IN)
  writeFileSync(join(bin, 'tmux'), aTmuxStandIn(stateFile, join(place.dir, 'tmux-calls.log')))
  chmodSync(join(bin, 'claude'), 0o755)
  chmodSync(join(bin, 'tmux'), 0o755)
  setTheEnvironment('PATH', `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}`)
  await startAHolder(place)

  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  const bound = await import('../src/server/lib/bound-address.ts')
  forgetWhatThisProcessBound = bound.forgetWhatThisProcessBound
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  bound.rememberWhatThisProcessBound(app.server)
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))

  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker'], [PANED, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role, ...(role === 'worker' ? { runtime: 'claude-code' } : {}) })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  for (const handle of [WORKER, PANED]) {
    const startFolder = join(place.dir, handle)
    mkdirSync(startFolder)
    const set = await call('POST', `/api/participants/agent/${handle}/start-folder`, PERSON, { startFolder, because: 'A made-up folder this test opens it in.' })
    expect(set.status, set.raw).toBe(200)
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
}, 120_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  forgetWhatThisProcessBound()
  t?.close()
  await stopEverything()
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}, 60_000)

describe('the terminal asks what the grant carries', () => {
  // FIRST, because a restart ends every terminal the holder holds.
  theFourCases({
    door: 'terminals.restart-holder',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      const listed = await call('GET', '/api/terminals', PERSON)
      expect(listed.status, listed.raw).toBe(200)
      expect(listed.body.holder.state, listed.raw).toBe('running')
      const terminals = (listed.body.terminals as TerminalReading[]).map((one) => one.id)
      return {
        method: 'POST',
        url: '/api/terminals/holder/restart',
        body: { expect: { pid: listed.body.holder.pid, startedAt: listed.body.holder.startedAt, terminals } },
        state: theHolderNow,
      }
    },
    went: (done, before, after) => {
      expect(done.body.stopped.pid).toBe(Number(before))
      expect(done.body.holder.state).toBe('running')
      expect(after, 'no new holder answers').toBe(String(done.body.holder.pid))
      expect(after).not.toBe(before)
      const released = t.client.sqlite.prepare("SELECT released_by, release_note FROM session_resources WHERE type = 'process' AND key = ?").all(before) as {
        released_by: string | null
        release_note: string | null
      }[]
      expect(released.map((row) => row.released_by)).toEqual([`agent:${RAISED}`])
      expect(released[0]!.release_note).toContain(`restarted by ${RAISED} for the person under their grant ${grantId}`)
      const underTheGrant = rowsSince(0).filter((row) => row.actor_id === RAISED && row.elevation !== null && (JSON.parse(row.elevation) as { id?: string }).id === grantId)
      expect(underTheGrant.length, 'no change row says the secretary released the holder under the grant').toBeGreaterThan(0)
    },
  })

  theFourCases({
    door: 'terminals.start-holder',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({ method: 'POST', url: '/api/terminals/holder/start', body: {}, state: theHolderNow }),
    went: (done, before, after) => {
      expect(done.status).toBe(200)
      expect(done.body.started, 'a holder that runs was started again').toBe(false)
      expect(done.body.holder.state).toBe('running')
      expect(after).toBe(before)
    },
  })

  theFourCases({
    door: 'terminals.list',
    ownKey: true,
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      await theFirstTerminal()
      return { method: 'GET', url: '/api/terminals', state: theTerminalsNow }
    },
    went: async (done) => {
      expect(done.body.holder.state).toBe('running')
      expect((done.body.terminals as TerminalReading[]).map((one) => one.id)).toContain((await theFirstTerminal()).id)
    },
  })

  theFourCases({
    door: 'terminals.read',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      const id = (await theFirstTerminal()).id
      return {
        method: 'GET',
        url: `/api/terminals/${id}/stream`,
        state: theTerminalsNow,
        send: async (headers) => {
          const read = await readTheStream(api, id, headers)
          if (read.refusal !== '') return aReplyOf(read.status, read.refusal)
          return { status: read.status, body: { events: read.events }, error: '', raw: JSON.stringify(read.events).slice(0, 2_000) }
        },
      }
    },
    went: (done) => {
      expect((done.body.events as { event: string }[]).some((event) => event.event === 'screen'), done.raw).toBe(true)
    },
  })

  theFourCases({
    door: 'terminals.resize',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({
      method: 'POST',
      url: `/api/terminals/${(await theFirstTerminal()).id}/resize`,
      body: { cols: 100, rows: 30 },
      state: async () => {
        const one = await theFirstTerminalNow()
        return `${String(one.cols)}x${String(one.rows)}`
      },
    }),
    went: (done, before, after) => {
      expect(before).toBe('80x24')
      expect(after).toBe('100x30')
      expect([done.body.terminal.cols, done.body.terminal.rows]).toEqual([100, 30])
    },
  })

  theFourCases({
    door: 'terminals.last-line',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({ method: 'GET', url: `/api/terminals/${(await theFirstTerminal()).id}/last-line`, state: theTerminalsNow }),
    went: (done) => {
      expect(done.body, done.raw).toMatchObject({ line: null, why: 'none', looksLikeAKey: false })
    },
  })

  theFourCases({
    door: 'terminals.keeping',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({ method: 'GET', url: `/api/terminals/${(await theFirstTerminal()).id}/keeping`, state: theTerminalsNow }),
    went: (done) => {
      expect(done.body.on, done.raw).toBe(false)
    },
  })

  theFourCases({
    door: 'terminals.set-keeping',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({
      method: 'PUT',
      url: `/api/terminals/${(await theFirstTerminal()).id}/keeping`,
      body: { on: true },
      state: async () => String((await theFirstTerminalNow()).keeping),
    }),
    went: (done, before, after) => {
      expect(before).toBe('false')
      expect(after).toBe('true')
      expect(done.body.on).toBe(true)
    },
  })

  theFourCases({
    door: 'terminals.way-back',
    ownKey: true,
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({ method: 'GET', url: `/api/terminals/agents/${WORKER}/way-back`, state: () => theRunsOf(WORKER) }),
    went: (done) => {
      expect(done.body.agent, done.raw).toEqual({ id: ids.get(WORKER), handle: WORKER })
    },
  })

  theFourCases({
    door: 'terminals.agent-pane',
    ownKey: true,
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({ method: 'GET', url: `/api/terminals/agents/${WORKER}/pane`, state: theTerminalsNow }),
    went: (done) => {
      expect(done.body.agent, done.raw).toEqual({ id: ids.get(WORKER), handle: WORKER })
      expect(done.body.state).toBe('no-run')
    },
  })

  theFourCases({
    door: 'terminals.agent-steps',
    ownKey: true,
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({ method: 'GET', url: `/api/terminals/agents/${WORKER}/steps`, state: () => theRunsOf(WORKER) }),
    went: (done) => {
      expect(done.body.agent, done.raw).toEqual({ id: ids.get(WORKER), handle: WORKER })
      expect(done.body.state).toBe('no-run')
    },
  })

  theFourCases({
    door: 'harnesses.list',
    oldWords: () => THE_TOOLS_OLD_WORDS,
    oldCode: 'harnessesOnlyThePerson',
    // THE DECLARED LIST, which asks no program and no registry.
    make: async () => ({ method: 'GET', url: '/api/harnesses?part=list', state: theTerminalsNow }),
    went: (done) => {
      expect((done.body.harnesses as unknown[]).length, done.raw).toBeGreaterThan(0)
    },
  })

  theFourCases({
    door: 'terminals.open-an-agent',
    ownKey: true,
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({
      method: 'POST',
      url: '/api/terminals/agents',
      body: { agent: WORKER, cols: 100, rows: 30 },
      state: async () => theRunsOf(WORKER) + (await theTerminalsNow()),
    }),
    went: (done, before, after) => {
      expect(after).not.toBe(before)
      expect(done.body.key.given).toBe(true)
      expect(done.body.terminal.who).toEqual({ kind: 'agent', id: ids.get(RAISED) })
      expect(extraOf(t.api.getRecord(String(done.body.session))!.data)['openedBy']).toEqual({ type: 'agent', id: RAISED })
    },
  })

  theFourCases({
    door: 'terminals.bring-back',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      // A RUN OF THE WORKER THAT HAS ENDED, filed by the person in the shape the session hook files one.
      const conversation = randomUUID()
      const filed = await call('POST', '/api/records', PERSON, {
        kind: 'session',
        title: 'A made-up run to bring back',
        data: {
          state: 'running',
          servingAgent: WORKER,
          runtime: 'claude-code',
          providerSession: conversation,
          workingDirectory: join(place.dir, WORKER),
          extra: { discovered: { tool: 'claude-code', externalId: conversation, pidCommand: 'claude --dangerously-skip-permissions --model test-model -p say hello' } },
        },
      })
      expect(filed.status, filed.raw).toBe(201)
      const session = String(filed.body.record?.id ?? filed.body.id)
      return {
        method: 'POST',
        url: `/api/terminals/agents/${WORKER}/way-back`,
        body: { session, cols: 100, rows: 30 },
        state: async () => theRunsOf(WORKER) + (await theTerminalsNow()),
      }
    },
    went: (done, before, after) => {
      expect(after).not.toBe(before)
      const data = anAgentOpenedUnderTheGrant(done, WORKER)
      expect(typeof extraOf(data)['wayBackOf']).toBe('string')
    },
  })

  theFourCases({
    door: 'terminals.show-pane',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      // THE SHOWN AGENT RUNS IN ONE OF THE OFFICE'S TERMINALS, opened by the person, so its process has a real terminal.
      const opened = await call('POST', '/api/terminals/agents', PERSON, { agent: PANED, cols: 100, rows: 30 })
      expect(opened.status, opened.raw).toBe(201)
      // Keep the real stand-in process, but model a run in tmux rather than an office-held screen.
      t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.extra.inATerminal') WHERE id = ?").run(String(opened.body.session))
      const tty = await theTerminalOfTheProcess((opened.body.terminal as TerminalReading).pid)
      expect(tty).toMatch(/^pts\/\d+$/)
      writeFileSync(
        stateFile,
        JSON.stringify({ noServer: false, panes: [{ id: '%7', target: 'recover:1.3', tty: `/dev/${tty}`, cols: 100, rows: 30 }], screen: 'TEST SCREEN LINE', cursor: '0 1', outputs: [] }),
      )
      return {
        method: 'POST',
        url: `/api/terminals/agents/${PANED}/pane`,
        body: {},
        state: async () => JSON.stringify((await theTerminals()).filter((one) => one.args[0] === THE_PANE_VIEW).map((one) => one.id)),
      }
    },
    went: (done, before, after) => {
      expect(done.status, done.raw).toBe(201)
      expect(done.body.opened).toBe(true)
      expect(after).not.toBe(before)
      const view = done.body.view as TerminalReading
      expect(view.args.slice(0, 5)).toEqual([THE_PANE_VIEW, '--session', 'recover', '--pane', '%7'])
      expect(view.who, 'the view does not say the secretary opened it').toEqual({ kind: 'agent', id: ids.get(RAISED) })
      expect(view.agent).toEqual({ kind: 'agent', id: ids.get(PANED) })
    },
  })

  theFourCases({
    door: 'terminals.open',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => ({
      method: 'POST', url: '/api/terminals',
      body: { folder: place.dir, command: '/bin/cat', args: [], keeping: false },
      state: theTerminalsNow,
    }),
    went: async (done, before, after) => {
      expect(done.status, done.raw).toBe(201)
      expect(after).not.toBe(before)
      const terminal = done.body.terminal as TerminalReading
      expect(terminal.who, 'the terminal does not say the secretary opened it').toEqual({ kind: 'agent', id: ids.get(RAISED) })
      expect((await theTerminals()).find((one) => one.id === terminal.id)?.who).toEqual(terminal.who)
      expect(terminal.agent).toBeNull()
    },
  })

  theFourCases({
    door: 'terminals.close',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      const opened = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/cat', args: [], keeping: false })
      expect(opened.status, opened.raw).toBe(201)
      return { method: 'POST', url: `/api/terminals/${opened.body.terminal.id}/close`, body: {}, state: theTerminalsNow }
    },
    went: (done, before, after) => {
      expect(typeof done.body.closed).toBe('string')
      expect(done.body.wasRunning).toBe(true)
      expect(JSON.parse(after).some((one: TerminalReading) => one.id === done.body.closed)).toBe(false)
      expect(after).not.toBe(before)
    },
  })

  it('terminals.close: under the grant refuses an agent terminal before closing anything or ending its run as the person', async () => {
    const opened = await call('POST', '/api/terminals/agents', PERSON, { agent: WORKER })
    expect(opened.status, opened.raw).toBe(201)
    const terminal = opened.body.terminal as TerminalReading
    const session = String(opened.body.session)
    const before = JSON.stringify(t.api.getRecord(session)!.data)
    answer('terminals.close', 'may-press')
    const refused = await refusedAndNothingChanged({
      method: 'POST', url: `/api/terminals/${terminal.id}/close`, body: {},
      state: async () => (await theTerminalsNow()) + JSON.stringify(t.api.getRecord(session)!.data),
    }, RAISED, "Under the person's grant, a secretary may close only a terminal no agent runs in. Nothing was closed.")
    expect(refused.body.code).toBe('terminalHoldsAnAgentsRun')
    expect((await theTerminals()).find((one) => one.id === terminal.id)?.state).toBe('running')
    expect(JSON.stringify(t.api.getRecord(session)!.data)).toBe(before)
    expect(JSON.stringify(t.api.getRecord(session)!.data)).not.toContain('The person closed its terminal')
  }, 60_000)

  theFourCases({
    door: 'terminals.keep-line',
    oldWords: () => THE_TERMINAL_PERMISSION,
    oldCode: 'terminalsOnlyThePerson',
    make: async () => {
      const opened = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/cat', args: [], keeping: false })
      expect(opened.status, opened.raw).toBe(201)
      const id = String(opened.body.terminal.id)
      const text = 'A made-up line typed in the terminal.'
      const typed = await call('POST', `/api/terminals/${id}/input`, PERSON, { data: `${text}\r` })
      expect(typed.status, typed.raw).toBe(200)
      await until(() => call('GET', `/api/terminals/${id}/last-line`, PERSON), (read) => read.body.line?.text === text, 5_000)
      return {
        method: 'POST', url: `/api/terminals/${id}/keep-my-line`, body: { text },
        state: () => readAll("SELECT id, data FROM records WHERE kind = 'note' ORDER BY id"),
      }
    },
    went: async (done, before, after) => {
      expect(done.status, done.raw).toBe(201)
      expect(after).not.toBe(before)
      expect(done.body.says).toBe("The line was typed in the terminal. The secretary kept it as its note under the person's grant. It does not count as the person's own words.")
      const id = String(done.body.record.id)
      expect(t.api.getRecord(id)!.data['body']).toBe('A made-up line typed in the terminal.')
      expect(t.api.getRecord(id)!.data['typed_in_terminal']).toContain('/bin/cat')
      const writers = t.client.sqlite.prepare("SELECT actor_type, actor_id, elevation FROM changes WHERE record_id = ? AND op = 'create'").all(id) as { actor_type: string; actor_id: string; elevation: string | null }[]
      expect(writers.map((one) => [one.actor_type, one.actor_id])).toEqual([['agent', RAISED]])
      expect(JSON.parse(writers[0]!.elevation!)).toMatchObject({ id: grantId })
      const { whoseRecordsAreThese } = await import('../src/server/lib/the-persons-own-words.ts')
      expect(whoseRecordsAreThese([id]).get(id)).toMatchObject({ own: false, because: 'notTheirs' })
    },
  })
})
