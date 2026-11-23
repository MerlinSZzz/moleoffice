// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY PREPARES A TERMINAL, AND THE PERSON RUNS IT. A secretary opens a terminal for the person through POST
 * /api/terminals with one line, sent as `line`. The holder types the line as somebody else's and presses no Enter, so the
 * command waits on the screen until the person presses Enter. A secretary may do it in two ways: with the person's words
 * for that line in that folder, carried with its own key, or under the person's grant where this office's list lets the
 * grant open a terminal. The list and the terminal's stream give the whole line and the secretary who prepared it, and
 * the page is told at once. The secretary that prepared it may read its screen while it runs; nobody else gains anything.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. It listens on 127.0.0.1 on a
 * port the system gives it. A terminal holder of its own runs in a place of its own (tests/terminal-holder-stand.ts), and
 * for case 9 an older holder stands in front of a real one. The terminals run /bin/sh. Three secretaries, one of them
 * raised, and a worker are made-up agents, and the person's words are made up. Every record here is synthetic.
 *
 * THE CASES, EACH THROUGH THE ROUTE:
 *   1. with the person's words for that line in that folder, a secretary with its own key opens a terminal with the line
 *      typed and not run; the person's Enter runs it, and it is never the person's last line;
 *   2. under the grant, with the row at may-press, the raised secretary does the same, and its press is written down;
 *   3. the list, the terminal's stream and the page's events say which secretary prepared it, and the list and the stream
 *      give the whole line;
 *   4. the secretary that prepared it reads its screen while it runs, and not after it ended; another secretary and a
 *      worker cannot read it;
 *   5. words for another line, for another folder or for the line alone are refused, and nothing is opened; a worker with
 *      the words is refused in the door's words;
 *   6. a line with a newline, a carriage return, a tab, an escape, DEL or a control character from U+0080 to U+009F is
 *      refused at the door, and nothing is opened; the holder refuses each in its own words when it is sent to the
 *      holder's socket directly, and opens nothing; a prepared line with a command, and a line from the person, are
 *      refused;
 *   7. no Enter is ever typed by the office: the line waits, and the secretary's line door cannot type onto it;
 *   8. the existing line door still types a line and then presses Enter;
 *   9. a holder older than this office refuses a prepared terminal with its code, and nothing is opened;
 *  10. the list of quick inputs refuses as a key every character the holder refuses in a prepared line, and no other, so
 *      the one test of a key cannot differ between the two.
 */

import type { FastifyInstance } from 'fastify'
import { mkdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { askTheHolder, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { AQuickInputListTheOfficeWillNotKeep, readQuickInputList } from '../src/shared/quick-inputs.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import {
  aPlace,
  groups,
  readTheStream,
  sleep,
  startAHolder,
  startAnOlderHolder,
  stopEverything,
  theScreenNow,
  until,
  untilTheScreenShows,
  type Place,
} from './terminal-holder-stand.ts'

const RAISED = 'prepare-grant-secretary'
const OWN_KEY = 'prepare-plain-secretary'
const OTHER = 'prepare-other-secretary'
const WORKER = 'prepare-plain-worker'
const DOOR = 'terminals.open'

/** How long the office is given to press an Enter it must never press: five times the holder's pause before its Enter. */
const LONG_ENOUGH_FOR_AN_ENTER_MS = 500

let t: TestDb
let app: FastifyInstance
let place: Place
let api = ''
let grantId = ''
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let since: typeof import('../src/server/lib/events.ts').since
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

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<AReply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = JSON.parse(reply.body)
  } catch {
    body = {}
  }
  // EVERY TERMINAL A REPLY NAMES GOES INTO `groups` AT ONCE, so `stopEverything` stops it even where a case fails.
  if (typeof body?.terminal?.pid === 'number') groups.add(body.terminal.pid)
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

function setTheEnvironment(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name])
  process.env[name] = value
}

const theLast = (table: string): number => (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

/** The person's written words for one act, as a secretary carries them. */
function thePersonsWords(...acts: string[]): Record<string, unknown> {
  return { saidBy: THE_PERSON, words: 'Made-up words: open a terminal with that line for me.', where: 'terminal', when: '2026-11-21 10:00', for: acts }
}

/** The act the person's words must name for one line in one folder. */
const preparingThisLine = (folder: string, line: string): string => `${DOOR}:${JSON.stringify({ folder, line })}`

/** The party the office names for an agent: its registry id. */
const theAgent = (handle: string): { kind: string; id: string } => ({ kind: 'agent', id: ids.get(handle) ?? '' })

/** Every terminal the holder holds now, by id. */
async function theIdsHeld(): Promise<string[]> {
  const listed = await call('GET', '/api/terminals', PERSON)
  expect(listed.status, listed.raw).toBe(200)
  return (listed.body.terminals as { id: string }[]).map((one) => one.id).sort()
}

/** A prepared terminal the case asks for, which must open: the reply's terminal. */
async function prepared(who: string, body: Record<string, unknown>): Promise<{ id: string; reply: AReply }> {
  const reply = await call('POST', '/api/terminals', as(who), body)
  expect(reply.status, reply.raw).toBe(201)
  return { id: String(reply.body.terminal.id), reply }
}

/** Refused, and nothing opened: the holder holds the same terminals as before. */
async function refusedAndNothingOpened(headers: Record<string, string>, body: Record<string, unknown>, status: number): Promise<AReply> {
  const before = await theIdsHeld()
  const refused = await call('POST', '/api/terminals', headers, body)
  expect(refused.status, refused.raw).toBe(status)
  expect(await theIdsHeld(), 'a refused terminal was opened').toEqual(before)
  return refused
}

/** Whether the screen shows a line that is exactly this text, which the command prints only when it ran. */
const ran = (screen: string[], printed: string): boolean => screen.some((line) => line.trim() === printed)

/** The line is on the screen and the command has not run, long enough after it for any Enter to have come. */
async function typedAndNotRun(terminal: string, line: string, printed: string): Promise<void> {
  await untilTheScreenShows(place, terminal, line)
  await sleep(LONG_ENOUGH_FOR_AN_ENTER_MS)
  expect(ran(await theScreenNow(place, terminal), printed), 'the prepared line ran before the person’s Enter').toBe(false)
}

/** The person presses Enter on the terminal, through the door they type through, and the command runs. */
async function thePersonRunsIt(terminal: string, printed: string): Promise<void> {
  const entered = await call('POST', `/api/terminals/${terminal}/input`, PERSON, { data: '\r' })
  expect(entered.status, entered.raw).toBe(200)
  await until(() => theScreenNow(place, terminal), (screen) => ran(screen, printed), 10_000)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  // THE HOLDER IS THIS DATABASE'S, in a place of this file's own: its socket is inside the place, never the live one.
  const made = aPlace('pp')
  setTheEnvironment('XDG_CONFIG_HOME', made.config)
  setTheEnvironment('MOLE_OFFICE_TERMINAL_HOLDER', 'on')
  // A PREPARED TERMINAL RUNS THE SHELL ITS ENVIRONMENT NAMES, so the shell here is /bin/sh.
  setTheEnvironment('SHELL', '/bin/sh')
  place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
  await startAHolder(place)

  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  since = (await import('../src/server/lib/events.ts')).since
  const bound = await import('../src/server/lib/bound-address.ts')
  forgetWhatThisProcessBound = bound.forgetWhatThisProcessBound
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  bound.rememberWhatThisProcessBound(app.server)
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))

  for (const [handle, role] of [[RAISED, 'secretary'], [OWN_KEY, 'secretary'], [OTHER, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role, ...(role === 'worker' ? { runtime: 'claude-code' } : {}) })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
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

describe('a secretary prepares a terminal', () => {
  it('1: on the person’s words for that line in that folder, the line is typed and not run, and the person’s Enter runs it', async () => {
    const line = 'echo on-the-words-$((6*7))'
    const changes = theLast('changes')
    const presses = theLast('presses_for_the_person')
    const { id, reply } = await prepared(OWN_KEY, { folder: place.dir, line, warrant: thePersonsWords(preparingThisLine(place.dir, line)) })
    expect(reply.body.terminal).toMatchObject({ folder: place.dir, who: theAgent(OWN_KEY), agent: null, prepared: { line, by: theAgent(OWN_KEY) } })
    await typedAndNotRun(id, line, 'on-the-words-42')

    // THE ACT IS WRITTEN DOWN ON THE WORDS: one change row naming the terminal and keeping the words, and no press row.
    const acts = (t.client.sqlite.prepare('SELECT actor_id, field, warrant, press_id FROM changes WHERE rowid > ? AND record_id = ?').all(changes, 'setting:terminals') as {
      actor_id: string
      field: string
      warrant: string | null
      press_id: string | null
    }[])
    expect(acts.length, 'one change row for the prepared terminal').toBe(1)
    expect(acts[0]).toMatchObject({ actor_id: OWN_KEY, press_id: null })
    expect(acts[0]!.field).toContain(id)
    expect(JSON.parse(acts[0]!.warrant!)).toMatchObject({ saidBy: THE_PERSON, for: [preparingThisLine(place.dir, line)] })
    expect(theLast('presses_for_the_person'), 'a terminal prepared on the person’s words was written down as a press').toBe(presses)

    await thePersonRunsIt(id, 'on-the-words-42')
    const last = await call('GET', `/api/terminals/${id}/last-line`, PERSON)
    expect(last.status, last.raw).toBe(200)
    expect(last.body.line, 'the secretary’s line became the person’s last line').toBeNull()
  }, 60_000)

  it('2: under the grant, with the row at may-press, the line is typed and not run, and the press is written down', async () => {
    answer(DOOR, 'may-press')
    const line = 'echo under-the-grant-$((5*5))'
    const presses = theLast('presses_for_the_person')
    const { id, reply } = await prepared(RAISED, { folder: place.dir, line, ...FOR_THE_PERSON })
    expect(reply.body.terminal).toMatchObject({ folder: place.dir, who: theAgent(RAISED), prepared: { line, by: theAgent(RAISED) } })
    await typedAndNotRun(id, line, 'under-the-grant-25')
    const pressed = t.client.sqlite.prepare('SELECT agent_id, grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(presses)
    expect(pressed).toEqual([{ agent_id: RAISED, grant_id: grantId, operation: DOOR }])
    await thePersonRunsIt(id, 'under-the-grant-25')
  }, 60_000)

  it('3: the list, the terminal’s stream and the page’s events name the secretary, and the list and the stream give the whole line', async () => {
    const line = 'echo "a whole line" with   spaces-$((2+2))'
    const { id } = await prepared(OWN_KEY, { folder: place.dir, line, warrant: thePersonsWords(preparingThisLine(place.dir, line)) })
    const expected = { line, by: theAgent(OWN_KEY) }

    const listed = await call('GET', '/api/terminals', PERSON)
    expect(listed.status, listed.raw).toBe(200)
    expect((listed.body.terminals as { id: string; prepared: unknown }[]).find((one) => one.id === id)?.prepared).toEqual(expected)
    const plain = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/sh', args: [] })
    expect(plain.status, plain.raw).toBe(201)
    expect(plain.body.terminal.prepared, 'a terminal the person opened is said to be prepared').toBeNull()

    const read = await readTheStream(api, id, PERSON)
    expect(read.status, read.refusal).toBe(200)
    expect(read.events[0]?.event).toBe('screen')
    expect((read.events[0]?.data['terminal'] as { prepared: unknown }).prepared).toEqual(expected)

    // THE PAGE IS TOLD AT ONCE, on GET /api/events: the terminals list changed, for this terminal and this secretary. The
    // line itself is not on the events, which reach every page; the page reads it from the list.
    const told = since(0, 'default', { kind: 'person', id: THE_PERSON }).events.map((one) => one.event)
    const about = told.filter((event) => event.name === 'list.changed' && (event as { prepared?: { terminal: string } }).prepared?.terminal === id)
    expect(about.length, 'the page was not told of the prepared terminal').toBe(1)
    expect(about[0]).toMatchObject({ lists: ['terminals'], prepared: { terminal: id, by: theAgent(OWN_KEY) } })
    expect(JSON.stringify(about[0]), 'the events carry the line').not.toContain('a whole line')
  }, 60_000)

  it('4: the secretary that prepared it reads its screen while it runs and not after; another secretary and a worker cannot', async () => {
    const line = 'echo read-by-its-secretary'
    const { id } = await prepared(OWN_KEY, { folder: place.dir, line, warrant: thePersonsWords(preparingThisLine(place.dir, line)) })
    const mine = await readTheStream(api, id, as(OWN_KEY))
    expect(mine.status, mine.refusal).toBe(200)
    expect(mine.events[0]?.event).toBe('screen')
    for (const who of [OTHER, WORKER]) {
      const refused = await readTheStream(api, id, as(who))
      expect(refused.status, `${who}: ${refused.refusal}`).toBe(403)
      expect(JSON.parse(refused.refusal)).toMatchObject({ code: 'terminalsOnlyThePerson' })
    }
    // A TERMINAL THE PERSON OPENED is not the secretary's to read, as before.
    const plain = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/sh', args: [] })
    expect(plain.status, plain.raw).toBe(201)
    expect((await readTheStream(api, String(plain.body.terminal.id), as(OWN_KEY))).status).toBe(403)

    // ONCE IT ENDED, its secretary reads it no more: the person clears the line and ends the shell.
    const ended = await call('POST', `/api/terminals/${id}/input`, PERSON, { data: '\x15exit\r' })
    expect(ended.status, ended.raw).toBe(200)
    await until(() => call('GET', '/api/terminals', PERSON), (listed) => (listed.body.terminals as { id: string; state: string }[]).some((one) => one.id === id && one.state === 'ended'), 10_000)
    const after = await readTheStream(api, id, as(OWN_KEY))
    expect(after.status, after.refusal).toBe(403)
    expect(JSON.parse(after.refusal)).toMatchObject({ code: 'terminalsOnlyThePerson' })
  }, 60_000)

  it('5: words for another line, another folder or the line alone are refused, nothing is opened, and a worker is refused', async () => {
    const line = 'echo never-opened-on-other-words'
    const elsewhere = join(place.dir, 'elsewhere')
    mkdirSync(elsewhere, { recursive: true })
    for (const words of [
      thePersonsWords(preparingThisLine(place.dir, 'echo another-line')),
      thePersonsWords(preparingThisLine(elsewhere, line)),
      thePersonsWords(`${DOOR}:${JSON.stringify({ line })}`),
      thePersonsWords(DOOR),
    ]) {
      const refused = await refusedAndNothingOpened(as(OWN_KEY), { folder: place.dir, line, warrant: words }, 403)
      expect(refused.body, refused.raw).toMatchObject({ code: 'terminalPreparingWordsRefused', values: {} })
      expect(refused.error).toContain('Nothing was opened')
    }
    const byAWorker = await refusedAndNothingOpened(as(WORKER), { folder: place.dir, line, warrant: thePersonsWords(preparingThisLine(place.dir, line)) }, 403)
    expect(byAWorker.body.code, byAWorker.raw).toBe('terminalsOnlyThePerson')
    // NO WORDS AND NO GRANT: the secretary's own key alone opens nothing.
    const noWords = await refusedAndNothingOpened(as(OWN_KEY), { folder: place.dir, line }, 403)
    expect(noWords.body.code, noWords.raw).toBe('terminalsOnlyThePerson')
  }, 60_000)

  it('6: a line with a key in it is refused at the door and by the holder, and nothing is opened', async () => {
    answer(DOOR, 'may-press')
    // U+009B STARTS AN ESCAPE SEQUENCE ON THE PERSON'S SCREEN when the terminal echoes it, so `\u009b8m` would hide the
    // rest of the line there; U+0085 is the next-line control. Both are control characters, as the newline is.
    const keysInALine = ['echo never\n', 'echo never\r', 'echo\tnever', 'echo never\x1b[A', 'echo never\x7f', 'echo never\u009b8m; echo hidden', 'echo never\u0085']
    for (const line of keysInALine) {
      // ON WORDS FOR THAT VERY LINE, and under the grant, so the refusal is the line's and not the authority's.
      const onWords = await refusedAndNothingOpened(as(OWN_KEY), { folder: place.dir, line, warrant: thePersonsWords(preparingThisLine(place.dir, line)) }, 400)
      expect(onWords.body, `${JSON.stringify(line)}: ${onWords.raw}`).toMatchObject({ code: 'terminalPreparedLineHasAKey', values: {} })
      expect(onWords.error).toContain('Nothing was opened')
      const underTheGrant = await refusedAndNothingOpened(as(RAISED), { folder: place.dir, line, ...FOR_THE_PERSON }, 400)
      expect(underTheGrant.body.code, underTheGrant.raw).toBe('terminalPreparedLineHasAKey')
    }
    const empty = await refusedAndNothingOpened(as(RAISED), { folder: place.dir, line: '', ...FOR_THE_PERSON }, 400)
    expect(empty.body.code, empty.raw).toBe('terminalPreparedLineHasAKey')

    // THE HOLDER ASKED DIRECTLY, past the door: it refuses in its own words and opens nothing.
    const held = async (): Promise<number> => ((await askTheHolder(place.socket, { op: 'list' }))['terminals'] as unknown[]).length
    const before = await held()
    const doorWords = String(empty.error)
    for (const line of [...keysInALine, '']) {
      const asked = await askTheHolder(place.socket, {
        op: 'open',
        who: theAgent(RAISED),
        agent: null,
        project: 'default',
        command: '/bin/sh',
        args: [],
        folder: place.dir,
        env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color' },
        cols: 80,
        rows: 24,
        keeping: false,
        prepared: { line, by: theAgent(RAISED) },
      })
      expect(asked.ok, `${JSON.stringify(line)}: ${JSON.stringify(asked)}`).toBe(false)
      expect(String(asked['error'])).toContain('prepared line')
      expect(String(asked['error']), 'the holder copied the door’s sentence').not.toBe(doorWords)
    }
    expect(await held(), 'the holder opened a terminal for a refused line').toBe(before)

    // A PREPARED LINE OPENS THE SHELL, so a command beside it is refused; and the person sends no prepared line.
    const withACommand = await refusedAndNothingOpened(as(RAISED), { folder: place.dir, line: 'echo never-with-a-command', command: '/bin/sh', ...FOR_THE_PERSON }, 400)
    expect(withACommand.body, withACommand.raw).toMatchObject({ code: 'terminalPreparedLineWithACommand', values: {} })
    const fromThePerson = await refusedAndNothingOpened(PERSON, { folder: place.dir, line: 'echo never-from-the-person' }, 400)
    expect(fromThePerson.body, fromThePerson.raw).toMatchObject({ code: 'terminalPreparedLineFromThePerson', values: {} })
  }, 60_000)

  it('7: no Enter is typed by the office: the line waits, and the secretary’s line door cannot type onto it', async () => {
    answer(DOOR, 'may-press')
    answer('terminals.type', 'may-press')
    const line = 'echo waits-for-the-person-$((3*3))'
    const { id } = await prepared(RAISED, { folder: place.dir, line, ...FOR_THE_PERSON })
    await typedAndNotRun(id, line, 'waits-for-the-person-9')
    const onto = await call('POST', `/api/terminals/${id}/input`, as(RAISED), { line: 'echo never-onto-it', ...FOR_THE_PERSON })
    expect(onto.status, onto.raw).toBe(409)
    expect(onto.body).toMatchObject({ code: 'terminalLineHalfTyped', values: {} })
    await sleep(LONG_ENOUGH_FOR_AN_ENTER_MS)
    const screen = await theScreenNow(place, id)
    expect(screen.join('\n'), 'a line was typed onto the prepared line').not.toContain('never-onto-it')
    expect(ran(screen, 'waits-for-the-person-9'), 'the prepared line ran without the person’s Enter').toBe(false)
    await thePersonRunsIt(id, 'waits-for-the-person-9')
  }, 60_000)

  it('8: the existing line door still types a line and then presses Enter', async () => {
    answer('terminals.type', 'may-press')
    const plain = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/sh', args: [], keeping: false })
    expect(plain.status, plain.raw).toBe(201)
    const id = String(plain.body.terminal.id)
    const typed = await call('POST', `/api/terminals/${id}/input`, as(RAISED), { line: 'echo the-line-door-$((2*4))', ...FOR_THE_PERSON })
    expect(typed.status, typed.raw).toBe(200)
    expect(typed.body).toMatchObject({ entered: true, typedFrom: 'a secretary' })
    await until(() => theScreenNow(place, id), (screen) => ran(screen, 'the-line-door-8'), 10_000)
  }, 60_000)
})

describe('a holder older than this office', () => {
  it('9: refuses a prepared terminal with its code, and nothing is opened', async () => {
    // A SECOND PLACE FOR THE SAME DATABASE, so the office in this process finds the older holder while this case runs.
    const made = aPlace('po')
    const old: Place = { ...made, database: place.database, socket: theTerminalHolderSocket(place.database, made.env), log: theTerminalHolderLog(place.database, made.env) }
    const older = await startAnOlderHolder(old)
    process.env['XDG_CONFIG_HOME'] = old.env.XDG_CONFIG_HOME
    try {
      expect('understands' in (await askTheHolder(old.socket, { op: 'hello' }))).toBe(false)
      const held = async (): Promise<number> => ((await askTheHolder(old.socket, { op: 'list' }))['terminals'] as unknown[]).length
      const before = await held()
      const line = 'echo not-for-an-older-holder'
      const refused = await call('POST', '/api/terminals', as(OWN_KEY), { folder: place.dir, line, warrant: thePersonsWords(preparingThisLine(place.dir, line)) })
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.body).toMatchObject({ code: 'terminalHolderTooOldToPrepare', values: {} })
      expect(refused.error).toContain('Nothing was opened')
      expect(await held(), 'an older holder opened a terminal it cannot prepare').toBe(before)
    } finally {
      process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
      await older.close()
    }
  }, 60_000)
})

describe('one test of a key', () => {
  it('10: the list of quick inputs refuses as a key every character the holder refuses in a prepared line, and no other', async () => {
    const refusedByTheList: number[] = []
    const refusedByTheHolder: number[] = []
    for (let code = 0; code <= 0xff; code += 1) {
      const character = String.fromCharCode(code)
      try {
        readQuickInputList([`/x${character}y`])
      } catch (err) {
        if (!(err instanceof AQuickInputListTheOfficeWillNotKeep) || err.refused.code !== 'quickInputListItemHoldsAKey') throw err
        refusedByTheList.push(code)
      }
      // A FOLDER THAT IS NOT WHOLE, so the holder opens nothing: it refuses a line with a key for its line, and any other
      // line for the folder.
      const asked = await askTheHolder(place.socket, {
        op: 'open',
        who: theAgent(RAISED),
        agent: null,
        project: 'default',
        command: '/bin/sh',
        args: [],
        folder: 'not-a-whole-path',
        env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color' },
        cols: 80,
        rows: 24,
        keeping: false,
        prepared: { line: `echo x${character}y`, by: theAgent(RAISED) },
      })
      expect(asked.ok, `${String(code)}: ${JSON.stringify(asked)}`).toBe(false)
      if (String(asked['error']).includes('prepared line')) refusedByTheHolder.push(code)
    }
    const from = (first: number, last: number): number[] => Array.from({ length: last - first + 1 }, (_, n) => first + n)
    expect(refusedByTheHolder).toEqual([...from(0x00, 0x1f), ...from(0x7f, 0x9f)])
    expect(refusedByTheList, 'the list of quick inputs and the holder test a key differently').toEqual(refusedByTheHolder)
  }, 60_000)
})
