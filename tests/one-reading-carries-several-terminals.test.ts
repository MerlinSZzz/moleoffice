// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE READING CARRIES SEVERAL TERMINALS, AND THE PERSON NAMES, GROUPS AND TAGS EACH. A page that shows several terminals
 * at once reads them on one stream, GET /api/terminals/stream?terminals=<id>,<id>, rather than one stream a terminal.
 * Every event on it names the terminal it is about. Each terminal in the reading is under the same authority as its own
 * stream, GET /api/terminals/:id/stream, and a reading that names one the reader may not read is refused whole, as that
 * terminal's own stream is. The person sets a name, a group and tags for a terminal through POST
 * /api/terminals/:id/name, and the list gives them back.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. It listens on 127.0.0.1 on a
 * port the system gives it. A terminal holder of its own runs in a place of its own (tests/terminal-holder-stand.ts), and
 * for case 7 an older holder stands in front of a real one. The terminals run /bin/sh. Two secretaries, one of them
 * raised, and a worker are made-up agents, and the person's words are made up. Every record here is synthetic.
 *
 * THE CASES, EACH THROUGH THE ROUTE:
 *   1. one reading of two terminals gives each one's screen and then each one's output, every event marked with its
 *      terminal, and no output under the other's mark;
 *   2. one reading of three does the same, and a terminal closed in it is said closed while the others go on;
 *   3. a terminal the reader may not read is refused in the reading, as on its own stream: a secretary's own key reads a
 *      terminal it prepared alone, and is refused when the reading also names the person's shell; another secretary and a
 *      worker are refused; a reading that names no terminal, one twice or too many is refused;
 *   4. the person sets a name, a group and tags, the list and the reading give them back, a terminal never named has none,
 *      and setting none takes them off again;
 *   5. a name, a group or a tag that is blank, too long or has a control character is refused, and a tag twice; nothing
 *      changes, and the holder refuses each in its own words when it is sent to the holder's socket directly;
 *   6. a secretary with its own key may not name a terminal; under the grant, with the row at may-press, it may, and the
 *      press is written down;
 *   7. a holder older than this office refuses the naming with its code, and nothing changes.
 */

import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  askTheHolder,
  THE_LONGEST_TERMINAL_GROUP,
  THE_LONGEST_TERMINAL_NAME,
  THE_LONGEST_TERMINAL_TAG,
  THE_MOST_TAGS_ON_A_TERMINAL,
  theTerminalHolderLog,
  theTerminalHolderSocket,
} from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MOST_TERMINALS_IN_ONE_READING } from '../src/shared/terminals.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import {
  aPlace,
  groups,
  sleep,
  startAHolder,
  startAnOlderHolder,
  stopEverything,
  type Place,
  type StreamEvent,
} from './terminal-holder-stand.ts'

const RAISED = 'several-grant-secretary'
const OWN_KEY = 'several-plain-secretary'
const OTHER = 'several-other-secretary'
const WORKER = 'several-plain-worker'

let t: TestDb
let app: FastifyInstance
let place: Place
let api = ''
let grantId = ''
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let forgetWhatThisProcessBound: () => void = () => undefined
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
const readings = new Set<AReading>()
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

/** A shell the person opened through the office. */
async function aShell(): Promise<string> {
  const opened = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/sh', args: [], keeping: false })
  expect(opened.status, opened.raw).toBe(201)
  return String(opened.body.terminal.id)
}

/** The person types into one terminal, through the door they type through. */
async function thePersonTypes(terminal: string, data: string): Promise<void> {
  const typed = await call('POST', `/api/terminals/${terminal}/input`, PERSON, { data })
  expect(typed.status, typed.raw).toBe(200)
}

/** One terminal as the list gives it now. */
async function listed(terminal: string): Promise<Record<string, unknown>> {
  const list = await call('GET', '/api/terminals', PERSON)
  expect(list.status, list.raw).toBe(200)
  const one = (list.body.terminals as Record<string, unknown>[]).find((each) => each['id'] === terminal)
  expect(one, `the list does not hold ${terminal}`).toBeDefined()
  return one!
}

/** One reading of several terminals, read as it comes until it is closed. A refused reading has a status and its body. */
interface AReading {
  status: number
  refusal: string
  events: StreamEvent[]
  /** Wait until the events read so far satisfy `ready`. Fails with what was read when they do not within `ms`. */
  until: (ready: (events: StreamEvent[]) => boolean, ms?: number) => Promise<StreamEvent[]>
  close: () => void
}

/** The address of one reading of several terminals. */
const theReadingOf = (terminals: string[]): string => `${api}/api/terminals/stream?terminals=${terminals.map(encodeURIComponent).join(',')}`

/**
 * OPEN ONE READING of these terminals with these headers, and read it in the background. The server-sent events are
 * read as tests/terminal-holder-stand.ts reads one terminal's stream.
 */
async function openTheReading(terminals: string[], headers: Record<string, string>): Promise<AReading> {
  const aborter = new AbortController()
  const events: StreamEvent[] = []
  const got = await fetch(theReadingOf(terminals), { headers, signal: aborter.signal })
  const reading: AReading = {
    status: got.status,
    refusal: '',
    events,
    until: async (ready, ms = 10_000) => {
      const deadline = Date.now() + ms
      while (!ready(events)) {
        if (Date.now() > deadline) throw new Error(`The reading did not give what was waited for within ${String(ms)} ms. It gave: ${JSON.stringify(events).slice(0, 3_000)}`)
        await sleep(50)
      }
      return events
    },
    close: () => aborter.abort(),
  }
  readings.add(reading)
  if (!got.ok || got.body === null) {
    reading.refusal = await got.text()
    return reading
  }
  const reader = got.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        pending += decoder.decode(value, { stream: true })
        let end = pending.indexOf('\n\n')
        while (end >= 0) {
          const block = pending.slice(0, end)
          pending = pending.slice(end + 2)
          end = pending.indexOf('\n\n')
          let name = 'message'
          let data = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) name = line.slice(7)
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (data !== '') events.push({ event: name, data: JSON.parse(data) as Record<string, unknown> })
        }
      }
    } catch (err) {
      if (!aborter.signal.aborted) throw err
    }
  })()
  return reading
}

/** The terminals the reading's events name, each event's mark. */
const theMarks = (events: StreamEvent[]): unknown[] => events.map((one) => one.data['terminal'])

/** Everything the reading gave as output under one terminal's mark, joined. */
const theOutputOf = (events: StreamEvent[], terminal: string): string =>
  events.filter((one) => one.event === 'output' && one.data['terminal'] === terminal).map((one) => String(one.data['data'])).join('')

/** The screens the reading gave, by the terminal each is marked with. */
const theScreens = (events: StreamEvent[]): Map<unknown, Record<string, unknown>> =>
  new Map(events.filter((one) => one.event === 'screen').map((one) => [one.data['terminal'], one.data]))

/** A refused reading: its status, and its code. Nothing was streamed. */
async function refusedReading(terminals: string[], headers: Record<string, string>, status: number): Promise<Record<string, unknown>> {
  const reading = await openTheReading(terminals, headers)
  expect(reading.status, reading.refusal).toBe(status)
  expect(reading.events, 'a refused reading streamed events').toEqual([])
  return JSON.parse(reading.refusal) as Record<string, unknown>
}

/** The person's words for one prepared line in this place's folder, as a secretary carries them. */
function thePersonsWordsToPrepare(line: string): Record<string, unknown> {
  return {
    saidBy: THE_PERSON,
    words: 'Made-up words: open a terminal with that line for me.',
    where: 'terminal',
    when: '2026-11-21 10:00',
    for: [`terminals.open:${JSON.stringify({ folder: place.dir, line })}`],
  }
}

const NAMED = { name: 'The build', group: 'Wave two', tags: ['server', 'slow'] }
const NONE = { name: null, group: null, tags: [] }

/** Naming one terminal. */
const nameIt = (terminal: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<AReply> =>
  call('POST', `/api/terminals/${terminal}/name`, headers, body)

/** The name, the group and the tags as the list gives them for one terminal. */
async function theNamesOf(terminal: string): Promise<{ name: unknown; group: unknown; tags: unknown }> {
  const one = await listed(terminal)
  return { name: one['name'], group: one['group'], tags: one['tags'] }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  // THE HOLDER IS THIS DATABASE'S, in a place of this file's own: its socket is inside the place, never the live one.
  const made = aPlace('sr')
  setTheEnvironment('XDG_CONFIG_HOME', made.config)
  setTheEnvironment('MOLE_OFFICE_TERMINAL_HOLDER', 'on')
  // A PREPARED TERMINAL RUNS THE SHELL ITS ENVIRONMENT NAMES, so the shell here is /bin/sh.
  setTheEnvironment('SHELL', '/bin/sh')
  place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
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
  for (const reading of readings) reading.close()
  readings.clear()
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

describe('one reading of several terminals', () => {
  it('1: one reading of two terminals gives each one’s screen and output, every event marked with its terminal', async () => {
    const a = await aShell()
    const b = await aShell()
    const reading = await openTheReading([a, b], PERSON)
    expect(reading.status, reading.refusal).toBe(200)
    await reading.until((events) => theScreens(events).size === 2)
    const screens = theScreens(reading.events)
    for (const terminal of [a, b]) {
      const screen = screens.get(terminal)
      expect(screen, `no screen for ${terminal}`).toBeDefined()
      expect((screen!['reading'] as { id: string }).id).toBe(terminal)
      expect(typeof screen!['screen']).toBe('string')
    }

    await thePersonTypes(a, 'echo from-a-$((1+1))\r')
    await thePersonTypes(b, 'echo from-b-$((2+2))\r')
    await reading.until((events) => theOutputOf(events, a).includes('from-a-2') && theOutputOf(events, b).includes('from-b-4'))
    expect(theOutputOf(reading.events, a), 'b’s output was marked as a’s').not.toContain('from-b-4')
    expect(theOutputOf(reading.events, b), 'a’s output was marked as b’s').not.toContain('from-a-2')
    expect(theMarks(reading.events).filter((mark) => mark !== a && mark !== b), 'an event was not marked with a terminal it reads').toEqual([])
  }, 60_000)

  it('2: one reading of three does the same, and a terminal closed in it is said closed while the others go on', async () => {
    const [a, b, c] = [await aShell(), await aShell(), await aShell()]
    const reading = await openTheReading([a, b, c], PERSON)
    expect(reading.status, reading.refusal).toBe(200)
    await reading.until((events) => theScreens(events).size === 3)
    expect([...theScreens(reading.events).keys()].sort()).toEqual([a, b, c].sort())
    for (const [terminal, n] of [[a, 3], [b, 5], [c, 7]] as const) await thePersonTypes(terminal, `echo three-${String(n)}-$((${String(n)}*10))\r`)
    await reading.until((events) => theOutputOf(events, a).includes('three-3-30') && theOutputOf(events, b).includes('three-5-50') && theOutputOf(events, c).includes('three-7-70'))
    expect(theMarks(reading.events).filter((mark) => mark !== a && mark !== b && mark !== c)).toEqual([])

    const closed = await call('POST', `/api/terminals/${c}/close`, PERSON, {})
    expect(closed.status, closed.raw).toBe(200)
    await reading.until((events) => events.some((one) => one.event === 'closed' && one.data['terminal'] === c))
    await thePersonTypes(a, 'echo after-the-close-$((4*4))\r')
    await reading.until((events) => theOutputOf(events, a).includes('after-the-close-16'))
    expect(reading.events.filter((one) => one.event === 'closed').map((one) => one.data['terminal'])).toEqual([c])
  }, 60_000)

  it('3: a terminal the reader may not read is refused in the reading, as on its own stream', async () => {
    const shell = await aShell()
    const line = 'echo read-in-one-reading'
    const prepared = await call('POST', '/api/terminals', as(OWN_KEY), { folder: place.dir, line, warrant: thePersonsWordsToPrepare(line) })
    expect(prepared.status, prepared.raw).toBe(201)
    const mine = String(prepared.body.terminal.id)

    const alone = await openTheReading([mine], as(OWN_KEY))
    expect(alone.status, alone.refusal).toBe(200)
    await alone.until((events) => theScreens(events).has(mine))
    alone.close()
    // THE PERSON'S SHELL IS NOT THE SECRETARY'S TO READ on its own stream, so a reading that also names it is refused whole.
    expect(await refusedReading([mine, shell], as(OWN_KEY), 403)).toMatchObject({ code: 'terminalsOnlyThePerson' })
    expect(await refusedReading([shell], as(OWN_KEY), 403)).toMatchObject({ code: 'terminalsOnlyThePerson' })
    for (const who of [OTHER, WORKER]) expect(await refusedReading([mine], as(who), 403)).toMatchObject({ code: 'terminalsOnlyThePerson' })

    // A READING NAMES ONE TERMINAL OR MORE, EACH ONCE, AND NO MORE THAN ONE READING MAY CARRY.
    expect(await refusedReading([], PERSON, 400)).toMatchObject({ code: 'terminalsReadingRefused', values: {} })
    expect(await refusedReading([shell, shell], PERSON, 400)).toMatchObject({ code: 'terminalsReadingRefused', values: {} })
    const tooMany = Array.from({ length: THE_MOST_TERMINALS_IN_ONE_READING + 1 }, (_, n) => `${shell}${String(n)}`)
    expect(await refusedReading(tooMany, PERSON, 400)).toMatchObject({ code: 'terminalsReadingRefused', values: {} })
    expect(await refusedReading([shell, 'no-such-terminal'], PERSON, 400)).toMatchObject({ code: 'terminalNotHeld' })
  }, 60_000)
})

describe('a name, a group and tags', () => {
  it('4: the person sets them, the list and the reading give them back, and setting none takes them off', async () => {
    const shell = await aShell()
    const other = await aShell()
    expect(await theNamesOf(shell), 'a terminal never named').toEqual(NONE)
    const named = await nameIt(shell, PERSON, NAMED)
    expect(named.status, named.raw).toBe(200)
    expect(named.body.terminal).toMatchObject({ id: shell, ...NAMED })
    expect(await theNamesOf(shell)).toEqual(NAMED)
    expect(await theNamesOf(other), 'naming one terminal named another').toEqual(NONE)

    const reading = await openTheReading([shell, other], PERSON)
    expect(reading.status, reading.refusal).toBe(200)
    await reading.until((events) => theScreens(events).size === 2)
    expect(theScreens(reading.events).get(shell)!['reading']).toMatchObject(NAMED)
    reading.close()

    // WHAT THE PERSON WROTE IS SHOWN BACK AS IT IS KEPT: the spaces around each are taken off.
    const loose = await nameIt(shell, PERSON, { name: '  The build  ', group: ' Wave two', tags: [' server ', 'slow'] })
    expect(loose.status, loose.raw).toBe(200)
    expect(loose.body.terminal).toMatchObject(NAMED)

    const cleared = await nameIt(shell, PERSON, NONE)
    expect(cleared.status, cleared.raw).toBe(200)
    expect(await theNamesOf(shell)).toEqual(NONE)
  }, 60_000)

  it('5: a blank, too long or keyed name, group or tag is refused, and a tag twice; the holder refuses each itself', async () => {
    const shell = await aShell()
    expect((await nameIt(shell, PERSON, NAMED)).status).toBe(200)
    const refusedBodies: Record<string, unknown>[] = [
      { ...NAMED, name: '' },
      { ...NAMED, name: '   ' },
      { ...NAMED, name: 'x'.repeat(THE_LONGEST_TERMINAL_NAME + 1) },
      { ...NAMED, name: 'a name\nwith a newline' },
      { ...NAMED, name: 'a name\u009b8m' },
      { ...NAMED, group: '' },
      { ...NAMED, group: 'x'.repeat(THE_LONGEST_TERMINAL_GROUP + 1) },
      { ...NAMED, group: 'a\tgroup' },
      { ...NAMED, tags: [''] },
      { ...NAMED, tags: ['x'.repeat(THE_LONGEST_TERMINAL_TAG + 1)] },
      { ...NAMED, tags: ['a\x1btag'] },
      { ...NAMED, tags: ['server', ' server'] },
      { ...NAMED, tags: Array.from({ length: THE_MOST_TAGS_ON_A_TERMINAL + 1 }, (_, n) => `tag-${String(n)}`) },
      { name: 'The build', group: 'Wave two' },
      { ...NAMED, colour: 'red' },
    ]
    // THE FIRST FIVE ARE THE NAME'S, the next three the group's and the next five the tags'; the last two are the shape's.
    const theCodeOf = (n: number): string | undefined => (n < 5 ? 'terminalNameRefused' : n < 8 ? 'terminalGroupRefused' : n < 13 ? 'terminalTagsRefused' : undefined)
    for (const [n, body] of refusedBodies.entries()) {
      const refused = await nameIt(shell, PERSON, body)
      expect(refused.status, `${JSON.stringify(body)}: ${refused.raw}`).toBe(400)
      const code = theCodeOf(n)
      if (code !== undefined) expect(refused.body, `${JSON.stringify(body)}: ${refused.raw}`).toMatchObject({ code, values: {} })
      expect(await theNamesOf(shell), `${JSON.stringify(body)} changed the names`).toEqual(NAMED)
    }

    // THE HOLDER ASKED DIRECTLY, past the door: it refuses in its own words and keeps the names it had.
    for (const body of refusedBodies.slice(0, 13)) {
      const asked = await askTheHolder(place.socket, { op: 'nameATerminal', terminal: shell, ...body })
      expect(asked.ok, `${JSON.stringify(body)}: ${JSON.stringify(asked)}`).toBe(false)
      expect(await theNamesOf(shell), `${JSON.stringify(body)} changed the names in the holder`).toEqual(NAMED)
    }
  }, 60_000)

  it('6: a secretary with its own key may not name a terminal; under the grant at may-press it may, and the press is written down', async () => {
    const shell = await aShell()
    for (const who of [OWN_KEY, WORKER]) {
      const refused = await nameIt(shell, as(who), NAMED)
      expect(refused.status, `${who}: ${refused.raw}`).toBe(403)
      expect(refused.body.code).toBe('terminalsOnlyThePerson')
    }
    expect(await theNamesOf(shell)).toEqual(NONE)

    answer('terminals.name', 'may-press')
    const presses = theLast('presses_for_the_person')
    const named = await nameIt(shell, as(RAISED), { ...NAMED, ...FOR_THE_PERSON })
    expect(named.status, named.raw).toBe(200)
    expect(await theNamesOf(shell)).toEqual(NAMED)
    const pressed = t.client.sqlite.prepare('SELECT agent_id, grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(presses)
    expect(pressed).toEqual([{ agent_id: RAISED, grant_id: grantId, operation: 'terminals.name' }])
  }, 60_000)
})

describe('a holder older than this office', () => {
  it('7: refuses the naming with its code, and nothing changes', async () => {
    // A SECOND PLACE FOR THE SAME DATABASE, so the office in this process finds the older holder while this case runs.
    const made = aPlace('so')
    const old: Place = { ...made, database: place.database, socket: theTerminalHolderSocket(place.database, made.env), log: theTerminalHolderLog(place.database, made.env) }
    const older = await startAnOlderHolder(old)
    process.env['XDG_CONFIG_HOME'] = old.env.XDG_CONFIG_HOME
    try {
      expect('understands' in (await askTheHolder(old.socket, { op: 'hello' }))).toBe(false)
      // A SHELL THE PERSON OPENS ON THE OLDER HOLDER, which an older holder can open.
      const shell = await aShell()
      const before = JSON.stringify((await askTheHolder(old.socket, { op: 'list' }))['terminals'])
      expect(before).toContain(shell)
      const refused = await nameIt(shell, PERSON, NAMED)
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.body).toMatchObject({ code: 'terminalHolderTooOldToName', values: {} })
      expect(refused.error).toContain('Nothing was changed')
      expect(JSON.stringify((await askTheHolder(old.socket, { op: 'list' }))['terminals'])).toBe(before)
    } finally {
      process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
      await older.close()
    }
  }, 60_000)
})
