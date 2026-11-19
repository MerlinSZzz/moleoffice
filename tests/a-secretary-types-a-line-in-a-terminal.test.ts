// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY TYPES ONE WHOLE LINE INTO THE PERSON'S TERMINAL. Wave 13s, round 83. The typing door, POST
 * /api/terminals/:id/input, was the person's alone. The person still types through it as before. A secretary may now
 * type one whole line through it, sent as `line`, in two ways: under the person's grant where this office's list of
 * what the grant carries lets the grant press the door, or with the owner's written words for that exact line in that
 * terminal. The holder types it as somebody else's line (typeALine in src/holder/index.mjs), so it is never read as the
 * person's typing: it is never kept in the person's note and never becomes their last line.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. It listens on a port the
 * system gives it. A terminal holder of its own runs in a place of its own (tests/terminal-holder-stand.ts), and for
 * case 7 an older holder stands in front of a real one. The terminals run /bin/sh. Two secretaries, one of them
 * raised, and a worker are made-up agents, and the owner's words are made up. Every record here is synthetic.
 *
 * THE CASES, EACH THROUGH THE ROUTE:
 *   1. a secretary with no grant, with this office's row at may-press, and a worker, hear the door's refusal with its
 *      code, and nothing is typed or written down;
 *   2. under the grant, with the row at kept, at ask-first and with no row, the check refuses in its own words; with no
 *      reason it is a 400; nothing is typed or written down;
 *   3. with the row at may-press the line reaches the screen, and it is never in the person's note nor the person's
 *      last line; the person's next line is kept, the note counts the secretary's line as typed by somebody else, and
 *      the note is the person's. 3b: a secretary that sends `data`, or a line with Enter in it, is refused;
 *   4. the line is written down as one press row naming the secretary and the grant and one change row naming the
 *      terminal, with the same press, and neither row holds the line's text;
 *   5. where it was typed from names the secretary, never the person, and the panel says so;
 *   6. a line the person has half typed refuses with the holder's code, and nothing is typed. 6b: focus in and out, as
 *      the person's terminal view sends them through the door, leave the line as it was: on a plain line the
 *      secretary's line is typed, and on a half-typed line it is refused, and nothing is typed (wave 13s, round 209);
 *   7. a holder older than the office refuses with its code, nothing is typed, and the person's own typing through the
 *      same door still reaches the terminal;
 *   8. on the owner's words for this exact line in this terminal, a secretary types it with the row at kept, the change
 *      row keeps the words, and no press row is written; words for another line, for the terminal alone or for another
 *      terminal are refused, and a worker carrying the words is refused;
 *   9. the person's own typing is unchanged, and the person's lines are kept;
 *  10. when the person types in the holder's pause, the line is typed and its Enter is not sent: the act is written down
 *      and counted, and the answer is a refusal with a code saying why. 10b: when the person also presses Enter in the
 *      pause, the line is sent once, by the person's Enter; the answer is a refusal with its own code saying the office
 *      did not press Enter, and the act is written down so (wave 13s, round 86).
 *  11. when the person types onto the secretary's line in the holder's pause and then takes their own part off again, a
 *      later line is kept off it: the secretary's next line through the door, and a quick input asked of the holder, are
 *      refused with the refusals a line the person half typed gets. Nothing is typed or written down, and nothing sends
 *      the line for the person. The keys the person types next go onto it, and their own Enter sends it once. 11b: the
 *      same after a quick input the person typed onto (wave 13s, round 98, from round 87's END). 11c: a secretary’s line
 *      the person shortened by erasing its last characters in the holder’s pause is not sent: the door refuses with the
 *      code for a line the person typed, the shortened line does not run, and a later line is kept off it until the
 *      person’s own Enter sends it. 11d: the same after a quick input the person shortened with erases in the pause
 *      (wave 13s, round 99).
 * Case 10's other reason, a terminal that ended in the pause, cannot be timed here; its code is sent by a test route in
 * tests/coded-refusals-keep-the-server-english.test.ts.
 *
 * MUTATIONS, each alone after a control run, then restored, 23 October 2026, from the logs of the runs:
 *   1. the door asks the grant check and lets the secretary through whatever it answers: case 1 goes red (1 of 13).
 *   2. the owner's words need to name only the terminal, not the line: cases 8 and 8b go red (2 of 13); 8b's words
 *      for the terminal alone typed the line.
 *   3. the secretary's line and an Enter go through the holder's `write`, as the person's keys do: cases 3, 3b, 6, 7
 *      and 10 go red (5 of 13); case 3 finds the secretary's line kept as the person's last line.
 *   4. where it was typed from names the person for a secretary: cases 3, 5, 8 and 10 go red (4 of 13).
 *   5. no change row is written: cases 4, 8 and 10 go red (3 of 13); in case 10 no press row is written either,
 *      because a refused answer writes no press of its own.
 *   6. typing put back on the list of doors that do not ask the check yet: tests/the-check-and-the-list-name-the-same-
 *      doors.test.ts goes red, "no door that reaches a call is on the list of doors that do not ask the check yet".
 * ROUND 86's MUTATIONS, each alone after a control run, then restored, 23 October 2026, from the logs of the runs:
 *   7. the holder's check for a line the person ended in its pause is taken out: case 10b goes red (1 of 14), answered
 *      200 with Enter pressed.
 *   8. the holder does not mark its line before it writes it: cases 3, 4, 5, 8 and 10 go red (5 of 14).
 *   9. the holder does not take the mark off after its own Enter: case 3 goes red (1 of 14).
 *  10. the office's function does not read the holder's new answer: case 10b goes red (1 of 14), a 502.
 *  11. the door has no answer of its own for a line the person ended: case 10b goes red (1 of 14), answered with the
 *      code for a terminal that ended.
 * ROUND 98's MUTATIONS, of src/holder/index.mjs, each alone after a control run, then restored, 24 October 2026, from the
 * logs of the runs:
 *  12. quickInput leaves its line plain when the person typed in its pause: case 11b goes red (1 of 16), the secretary's
 *      later line answered 200 with Enter pressed after it.
 *  13. quickInput marks its line only when the terminal ended in its pause: case 11b goes red (1 of 16), the same.
 *  14. typeALine leaves its line plain when the person typed in its pause: case 11 goes red (1 of 16), the same.
 *  15. typeALine's check for a half-typed line reads only what the person typed: cases 11 and 11b go red (2 of 16), the
 *      later line typed onto the line.
 *  16. quickInput's check for a half-typed line reads only what the person typed: cases 11 and 11b go red (2 of 16), the
 *      later quick input typed.
 *  17. an erase that leaves nothing typed makes the line plain again: cases 11 and 11b go red (2 of 16), the secretary's
 *      later line answered 200 with Enter pressed after it.
 * ROUND 99'S MUTATIONS, of src/holder/index.mjs, each alone after a control run, then restored, 24 October 2026, from the
 * logs of the runs:
 *  18. the erase on an empty buffer of a line typed by another changes nothing: cases 11c and 11d go red (2 of 18), the
 *      door answered 200 with Enter pressed, the quick input answered ok true with Enter pressed, and each shortened line
 *      ran.
 *  19. the erase's rule asks `!typing.byAnother` instead of `typing.byAnother`: cases 11c and 11d go red (2 of 18), the
 *      same, and no other case went red.
 *  20. the erase's rule marks the line plain (`typing.clean = true`) instead: cases 11c and 11d go red (2 of 18), the
 *      same, and no other case went red.
 * ROUND 209'S MUTATIONS, of src/holder/index.mjs, each alone after a control run, then restored, 5 November 2026, from
 * the logs of the runs:
 *  21. the holder reads a terminal view's reports as typing, as it did before: case 6b goes red (1 of 19), the
 *      secretary's line on the plain line answered 409 with the code for a half-typed line.
 *  22. focus in or out drops the person's line and makes it plain: case 6b goes red (1 of 19), the secretary's line on
 *      the half-typed line answered 200 with Enter pressed after it.
 */

import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { askTheHolder, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TypedFrom } from '../src/shared/terminals.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { TypedFromPanel } from '../src/web/components/TypedFromPanel.tsx'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import {
  aPlace,
  groups,
  holder,
  openThroughTheHolder,
  sleep,
  startAHolder,
  startAnOlderHolder,
  stopEverything,
  theScreenNow,
  until,
  untilTheScreenShows,
  watch,
  type Place,
} from './terminal-holder-stand.ts'
import { drawInABrowser } from './what-the-browser-draws.ts'
import { testShots } from './where-shots-go.ts'

const shots = testShots('a-secretary-types-a-line')
const keepTheShots = (process.env['TEST_SHOTS'] ?? '') !== ''
const en = createI18n('en')

const RAISED = 'line-grant-secretary'
const UNRAISED = 'line-plain-secretary'
const WORKER = 'line-plain-worker'
const DOOR = 'terminals.type'

/** The door's refusal to anybody who is neither the person nor a secretary it lets in. */
let THE_DOORS_REFUSAL = ''

/** How long after an Enter the holder has asked the screen whether it showed the line (its SHOWN_AFTER_MS is 300). */
const AFTER_THE_SCREEN_MS = 500

/** The office's own page stylesheet, so the picture is drawn on the office's page background, less its imports. */
const PAGE_CSS = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '')
const WIDTHS = [1440, 990, 660, 390] as const

let t: TestDb
let app: FastifyInstance
let place: Place
let grantId = ''
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let typedFromOf: (terminal: string) => TypedFrom
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

/** This office's answer about the typing door, as the person gives it, taken back after each case. */
function answer(said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(DOOR, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(DOOR)
}

const theLast = (table: string): number => (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

interface AChangeRow {
  record_id: string
  actor_type: string
  actor_id: string
  field: string | null
  old_value: string | null
  new_value: string | null
  warrant: string | null
  elevation: string | null
  press_id: string | null
}

function rowsSince(mark: number): AChangeRow[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, field, old_value, new_value, warrant, elevation, press_id FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark) as AChangeRow[]
}

interface APressRow {
  id: string
  agent_id: string
  grant_id: string
  operation: string
  reason: string | null
}

function pressesSince(mark: number): APressRow[] {
  return t.client.sqlite
    .prepare('SELECT id, agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ? ORDER BY rowid')
    .all(mark) as APressRow[]
}

/** Every column of every row written since the marks, as one text, to look for what must never be stored. */
function everythingWrittenSince(changes: number, presses: number): string {
  return (
    JSON.stringify(t.client.sqlite.prepare('SELECT * FROM changes WHERE rowid > ?').all(changes)) +
    JSON.stringify(t.client.sqlite.prepare('SELECT * FROM presses_for_the_person WHERE rowid > ?').all(presses))
  )
}

function setTheEnvironment(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name])
  process.env[name] = value
}

/** A shell the person opened through the office. Its keeping is on unless the case says off. */
async function aShell(keeping = true): Promise<string> {
  const opened = await call('POST', '/api/terminals', PERSON, { folder: place.dir, command: '/bin/sh', args: [], cols: 100, rows: 30, keeping })
  expect(opened.status, opened.raw).toBe(201)
  expect(opened.body.terminal.keeping).toBe(keeping)
  return String(opened.body.terminal.id)
}

const typeAsTheSecretary = (terminal: string, who: string, body: Record<string, unknown>): Promise<AReply> =>
  call('POST', `/api/terminals/${terminal}/input`, as(who), body)

/** The owner's written words for one act, as a secretary carries them. */
function theOwnersWords(...acts: string[]): Record<string, unknown> {
  return { saidBy: THE_PERSON, words: 'Made-up words: type that one line for me.', where: 'terminal', when: '2026-10-22 10:00', for: acts }
}

/** The act the owner's words must name for one line in one terminal. */
const typingThisLine = (terminal: string, line: string): string => `${DOOR}:${JSON.stringify({ terminal, line })}`

/**
 * A REFUSED PRESS, AND NOTHING TYPED OR WRITTEN DOWN: the screen's output from before the press shows none of the line,
 * no change row and no press row was written, and where the terminal was typed from is as it was.
 */
async function refusedAndNothingTyped(terminal: string, headers: Record<string, string>, body: Record<string, unknown>, status: number, marker: string): Promise<AReply> {
  const seen = await watch(place, terminal)
  const changes = theLast('changes')
  const presses = theLast('presses_for_the_person')
  const sources = JSON.stringify(typedFromOf(terminal))
  try {
    const refused = await call('POST', `/api/terminals/${terminal}/input`, headers, body)
    expect(refused.status, refused.raw).toBe(status)
    await sleep(AFTER_THE_SCREEN_MS)
    expect(seen.output(), 'a refused line was typed').not.toContain(marker)
    expect(rowsSince(changes), 'a refused line wrote a change row').toEqual([])
    expect(pressesSince(presses), 'a refused line was written down as a press').toEqual([])
    expect(JSON.stringify(typedFromOf(terminal)), 'a refused line was counted as typed').toBe(sources)
    return refused
  } finally {
    seen.close()
  }
}

async function theNoteOf(terminal: string): Promise<{ id: string; lines: number; leftOut: Record<string, number> } | null> {
  const read = await call('GET', `/api/terminals/${terminal}/keeping`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body.note
}

async function theLastLineOf(terminal: string): Promise<{ text: string } | null> {
  const read = await call('GET', `/api/terminals/${terminal}/last-line`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body.line
}

/** What the person types onto a line in the holder's pause, made up. They take it off again with one erase a character. */
const THE_PERSONS_PART = ' person-part'

/** What the door and the holder refuse for a line, with the terminal's id taken out of the words. */
interface TheRefusals {
  door: { status: number; code: unknown; values: unknown; error: string }
  holder: { ok: unknown; code: unknown; error: string }
}

const withoutTheTerminal = (words: unknown, terminal: string): string => String(words).replaceAll(terminal, '<terminal>')

/**
 * WHAT THE DOOR AND THE HOLDER REFUSE FOR A LINE THE PERSON HAS HALF TYPED, read from a terminal of its own, so a case
 * compares its refusals with these and copies none of their words. Case 6 proves the door's refusal itself.
 */
async function theRefusalsOfAHalfLine(): Promise<TheRefusals> {
  const shell = await aShell(false)
  answer('may-press')
  const half = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo half' })
  expect(half.status, half.raw).toBe(200)
  const door = await typeAsTheSecretary(shell, RAISED, { line: 'echo never-on-a-half-line', ...FOR_THE_PERSON })
  const asked = await askTheHolder(place.socket, { op: 'quickInput', terminal: shell, input: 'echo never-on-a-half-line' })
  return {
    door: { status: door.status, code: door.body.code, values: door.body.values, error: withoutTheTerminal(door.error, shell) },
    holder: { ok: asked.ok, code: asked['code'], error: withoutTheTerminal(asked['error'], shell) },
  }
}

/**
 * A LATER LINE IS KEPT OFF A LINE THE PERSON TYPED INTO AND TOOK THEIR PART OFF AGAIN, at the secretary's door and at the
 * holder's quick input, each with the refusal it gives for a line the person has half typed. Nothing is typed or written
 * down, and nothing sends the line for the person: what it runs is not on the screen. The keys the person types next go
 * onto it, and their own Enter sends it, once. `runs` is what the line prints when it is sent.
 */
async function aLaterLineIsKeptOff(terminal: string, halfLine: TheRefusals, runs: string): Promise<void> {
  const seen = await watch(place, terminal)
  try {
    const door = await refusedAndNothingTyped(terminal, as(RAISED), { line: 'echo later-$((3+4))', ...FOR_THE_PERSON }, halfLine.door.status, 'later-')
    const asked = await askTheHolder(place.socket, { op: 'quickInput', terminal, input: 'echo later-quick-$((4+4))' })
    await sleep(AFTER_THE_SCREEN_MS)
    expect({
      door: { status: door.status, code: door.body.code, values: door.body.values, error: withoutTheTerminal(door.error, terminal) },
      holder: { ok: asked.ok, code: asked['code'], error: withoutTheTerminal(asked['error'], terminal) },
    }).toEqual(halfLine)
    expect(seen.output(), 'a later line was typed onto the line').not.toContain('later-')
    expect(seen.output(), 'the line was sent for the person').not.toContain(runs)
  } finally {
    seen.close()
  }
  const mine = await call('POST', `/api/terminals/${terminal}/input`, PERSON, { data: ' mine\r' })
  expect(mine.status, mine.raw).toBe(200)
  const screen = await untilTheScreenShows(place, terminal, `${runs} mine`)
  expect(screen.filter((line) => line.trim() === `${runs} mine`)).toEqual([`${runs} mine`])
}

/** The person takes their own part off the line through the door they type through, one erase for each character. */
async function thePersonTakesTheirPartOff(terminal: string): Promise<void> {
  const erased = await call('POST', `/api/terminals/${terminal}/input`, PERSON, { data: '\x7f'.repeat(THE_PERSONS_PART.length) })
  expect(erased.status, erased.raw).toBe(200)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  THE_DOORS_REFUSAL = (await import('../src/server/api/terminals.ts')).THE_TERMINAL_PERMISSION
  // THE HOLDER IS THIS DATABASE'S, in a place of this file's own: its socket is inside the place, never the live one.
  const made = aPlace('sl')
  setTheEnvironment('XDG_CONFIG_HOME', made.config)
  setTheEnvironment('MOLE_OFFICE_TERMINAL_HOLDER', 'on')
  place = { ...made, database: t.file, socket: theTerminalHolderSocket(t.file, made.env), log: theTerminalHolderLog(t.file, made.env) }
  await startAHolder(place)

  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  typedFromOf = (await import('../src/server/lib/terminal-typed-from.ts')).typedFromOf
  const bound = await import('../src/server/lib/bound-address.ts')
  forgetWhatThisProcessBound = bound.forgetWhatThisProcessBound
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  bound.rememberWhatThisProcessBound(app.server)
  expect((app.server.address() as AddressInfo).port).toBeGreaterThan(0)
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))

  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker']] as const) {
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

describe('a secretary types a line in a terminal', () => {
  it('1: a secretary with no grant, even with the row at may-press, and a worker, hear the door’s refusal, and nothing is typed', async () => {
    const shell = await aShell(false)
    answer('may-press')
    for (const who of [UNRAISED, WORKER]) {
      const refused = await refusedAndNothingTyped(shell, as(who), { line: `echo never-typed-by-${who}`, ...FOR_THE_PERSON }, 403, `never-typed-by-${who}`)
      expect(refused.body.code, refused.raw).toBe('terminalsOnlyThePerson')
      expect(refused.error).toContain(THE_DOORS_REFUSAL)
    }
  }, 60_000)

  it('2: under the grant, the check refuses where the list keeps the door or asks first, and with no reason, and nothing is typed', async () => {
    const shell = await aShell(false)
    const body = { line: 'echo never-typed-under-the-grant', ...FOR_THE_PERSON }
    const byTheCard = await refusedAndNothingTyped(shell, as(RAISED), body, 403, 'never-typed-under-the-grant')
    expect(byTheCard.error).toContain(`The secretary card keeps ${DOOR} for the person`)
    expect(byTheCard.body.code, 'the check’s refusal is dressed as the door’s own').not.toBe('terminalsOnlyThePerson')

    answer('kept')
    const kept = await refusedAndNothingTyped(shell, as(RAISED), body, 403, 'never-typed-under-the-grant')
    expect(kept.error).toContain(`keeps ${DOOR} for the person`)
    expect(kept.error).toContain("This office's list of what the grant carries, since")

    answer('ask-first')
    const askFirst = await refusedAndNothingTyped(shell, as(RAISED), body, 403, 'never-typed-under-the-grant')
    expect(askFirst.error).toContain(`says to ask the person before pressing ${DOOR} for them`)

    answer('may-press')
    const noReason = await refusedAndNothingTyped(shell, as(RAISED), { line: 'echo never-typed-without-a-reason' }, 400, 'never-typed-without-a-reason')
    expect(noReason.error).toContain('reason')
  }, 60_000)

  it('3: with the row at may-press, the line runs, is never the person’s, and the person’s next line is kept in the person’s note', async () => {
    const shell = await aShell(true)
    answer('may-press')
    const done = await typeAsTheSecretary(shell, RAISED, { line: 'echo for-the-person-$((8*8))', ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    expect(done.body).toMatchObject({ entered: true, typedFrom: 'a secretary' })
    expect(done.body.says).toContain(shell)
    await untilTheScreenShows(place, shell, 'for-the-person-64')
    await sleep(AFTER_THE_SCREEN_MS)
    expect(await theLastLineOf(shell), 'the secretary’s line became the person’s last line').toBeNull()
    expect(await theNoteOf(shell), 'the secretary’s line was kept before the person typed').toBeNull()

    const own = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo the-persons-own-$((9*9))\r' })
    expect(own.status, own.raw).toBe(200)
    await untilTheScreenShows(place, shell, 'the-persons-own-81')
    const note = await until(() => theNoteOf(shell), (read) => read !== null && read.lines === 1, 10_000)
    expect(note).toMatchObject({ lines: 1, leftOut: { typedByAnother: 1, notShown: 0, edited: 0, tooLong: 0 } })
    const kept = t.api.getRecord(note!.id)!
    expect(kept.data['body']).toBe('echo the-persons-own-$((9*9))')
    expect(kept.data['left_out_typed_by_another']).toBe(1)
    expect(JSON.stringify(kept.data)).not.toContain('for-the-person')
    expect(await theLastLineOf(shell)).toMatchObject({ text: 'echo the-persons-own-$((9*9))' })
    const writers = t.client.sqlite.prepare("SELECT actor_type, actor_id, elevation FROM changes WHERE record_id = ? AND op = 'create'").all(note!.id) as { actor_type: string; actor_id: string; elevation: string | null }[]
    expect(writers.map((one) => [one.actor_type, one.actor_id, one.elevation])).toEqual([['human', THE_PERSON, null]])
  }, 60_000)

  it('3b: a secretary that sends data, or a line with Enter in it, is refused, and nothing is typed', async () => {
    const shell = await aShell(false)
    answer('may-press')
    for (const body of [{ data: 'echo never-typed-as-data\r' }, { line: 'echo never-typed-as-data', data: '\r' }]) {
      const refused = await refusedAndNothingTyped(shell, as(RAISED), { ...body, ...FOR_THE_PERSON }, 400, 'never-typed-as-data')
      expect(refused.body.code, refused.raw).toBe('terminalASecretaryTypesALine')
      expect(refused.error).toContain('line')
    }
    const withEnter = await refusedAndNothingTyped(shell, as(RAISED), { line: 'echo never-typed-with-enter\r', ...FOR_THE_PERSON }, 400, 'never-typed-with-enter')
    expect(withEnter.error).toContain('without keys such as Enter')
  }, 60_000)

  it('4: the line is one press row naming the secretary and the grant, and one change row naming the terminal, and neither holds the line', async () => {
    const shell = await aShell(false)
    answer('may-press')
    const changes = theLast('changes')
    const presses = theLast('presses_for_the_person')
    const done = await typeAsTheSecretary(shell, RAISED, { line: 'echo kept-out-of-the-ledger-$((3*3))', ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    await untilTheScreenShows(place, shell, 'kept-out-of-the-ledger-9')
    const pressed = pressesSince(presses)
    expect(pressed.length, 'a press is one row').toBe(1)
    expect(pressed[0]).toMatchObject({ agent_id: RAISED, grant_id: grantId, operation: DOOR, reason: A_TESTS_REASON_FOR_THE_PERSON })
    const rows = rowsSince(changes)
    expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who typed').toEqual([])
    const acts = rows.filter((row) => row.record_id === 'setting:terminals')
    expect(acts.length, 'one change row for the line').toBe(1)
    expect(acts[0]).toMatchObject({ actor_type: 'agent', actor_id: RAISED, old_value: null, warrant: null, press_id: pressed[0]!.id })
    expect(acts[0]!.field).toContain(shell)
    expect(acts[0]!.new_value).toBe('entered')
    expect(JSON.parse(acts[0]!.elevation!)).toMatchObject({ id: grantId })
    expect(everythingWrittenSince(changes, presses), 'the line’s text was stored').not.toContain('kept-out-of-the-ledger')
  }, 60_000)

  it('5: where it was typed from names the secretary, never the person, and the panel says so', async () => {
    const shell = await aShell(false)
    answer('may-press')
    const done = await typeAsTheSecretary(shell, RAISED, { line: 'echo from-the-secretary-$((2*5))', ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    await untilTheScreenShows(place, shell, 'from-the-secretary-10')
    const own = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo then-the-person-$((3*5))\r' })
    expect(own.status, own.raw).toBe(200)
    await untilTheScreenShows(place, shell, 'then-the-person-15')

    const typedFrom = typedFromOf(shell)
    expect(typedFrom.runs.map(({ firstAt: _first, lastAt: _last, ...run }) => run)).toEqual([
      { level: 'a secretary', machine: null, how: 'a secretary', program: null, account: { id: ids.get(RAISED), proof: "the secretary's own key", device: null }, agentHandle: RAISED, inputs: 1 },
      expect.objectContaining({ level: 'this computer', account: expect.objectContaining({ id: THE_PERSON }), inputs: 1 }),
    ])

    const panel = renderToStaticMarkup(h(TypedFromPanel, { typedFrom }))
    // AS MARKUP, where React writes an apostrophe as &#x27;.
    const asMarkup = (words: string) => words.replaceAll("'", '&#x27;')
    expect(panel).toContain(asMarkup(en.t('terminals.typedFrom.level.secretary')))
    expect(panel).toContain(asMarkup(en.t('terminals.typedFrom.secretary.who', { agent: RAISED })))
    expect(panel).toContain(asMarkup(en.t('terminals.typedFrom.proof.secretaryKey')))
    expect(panel).toContain('data-level="a secretary"')

    // THE PANEL IN A REAL BROWSER: no width scrolls sideways, and one picture is kept where TEST_SHOTS names a folder.
    const drawn = await drawInABrowser(`<style>${PAGE_CSS}</style><main style="max-width: 44rem; margin: 0 auto; padding: 16px">${panel}</main>`, { width: 990, height: 700 })
    try {
      for (const width of WIDTHS) {
        await drawn.page.setViewportSize({ width, height: 700 })
        expect(await drawn.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${String(width)}: the panel scrolls sideways`).toBe(true)
      }
      if (keepTheShots) {
        await drawn.page.setViewportSize({ width: 990, height: 700 })
        await drawn.palette('light')
        await drawn.page.screenshot({ path: `${shots}/typed-from-after-a-secretarys-line-990-light.png`, fullPage: true })
      }
    } finally {
      await drawn.close()
    }
  }, 90_000)

  it('6: a line the person has half typed refuses with the holder’s code, and nothing is typed', async () => {
    const shell = await aShell(true)
    answer('may-press')
    const half = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo half' })
    expect(half.status, half.raw).toBe(200)
    await untilTheScreenShows(place, shell, 'echo half')
    const refused = await refusedAndNothingTyped(shell, as(RAISED), { line: 'echo never-typed-on-a-half-line', ...FOR_THE_PERSON }, 409, 'never-typed-on-a-half-line')
    expect(refused.body).toMatchObject({ code: 'terminalLineHalfTyped', values: {} })
    expect(refused.error).toContain('half typed')
  }, 60_000)

  it('6b: focus in and out from the person’s view leave the line as it was: a plain one takes the line, a half one refuses it', async () => {
    const shell = await aShell(false)
    answer('may-press')
    for (const report of ['\x1b[I', '\x1b[O']) {
      const sent = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: report })
      expect(sent.status, sent.raw).toBe(200)
    }
    // THE LINE REACHES THE SCREEN. /bin/sh did not ask for focus reports, so it is given them in front of the line, and
    // only the line's echo is looked for here.
    const done = await typeAsTheSecretary(shell, RAISED, { line: 'echo after-focus-$((5*5))', ...FOR_THE_PERSON })
    expect({ status: done.status, entered: done.body.entered }, done.raw).toEqual({ status: 200, entered: true })
    await untilTheScreenShows(place, shell, 'echo after-focus-$((5*5))')

    const half = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo half' })
    expect(half.status, half.raw).toBe(200)
    await untilTheScreenShows(place, shell, 'echo half')
    for (const report of ['\x1b[I', '\x1b[O']) {
      const sent = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: report })
      expect(sent.status, sent.raw).toBe(200)
    }
    await refusedAndNothingTyped(shell, as(RAISED), { line: 'echo never-after-focus-on-a-half-line', ...FOR_THE_PERSON }, 409, 'never-after-focus')
  }, 60_000)
})

describe('a holder older than this office', () => {
  it('7: refuses the secretary’s line with its code, nothing is typed, and the person’s own typing still reaches the terminal', async () => {
    // A SECOND PLACE FOR THE SAME DATABASE, so the office in this process finds the older holder while this case runs.
    const made = aPlace('so')
    const old: Place = { ...made, database: place.database, socket: theTerminalHolderSocket(place.database, made.env), log: theTerminalHolderLog(place.database, made.env) }
    const older = await startAnOlderHolder(old)
    process.env['XDG_CONFIG_HOME'] = old.env.XDG_CONFIG_HOME
    try {
      expect('understands' in (await holder(old, { op: 'hello' }))).toBe(false)
      const shell = (await openThroughTheHolder(old, { cols: 100, rows: 30 })).id
      answer('may-press')
      const seen = await watch(old, shell)
      const changes = theLast('changes')
      const presses = theLast('presses_for_the_person')
      const refused = await typeAsTheSecretary(shell, RAISED, { line: 'echo not-for-an-older-holder', ...FOR_THE_PERSON })
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.body).toMatchObject({ code: 'terminalHolderTooOld', values: {} })
      expect(refused.error).toContain('Nothing was typed')
      await sleep(AFTER_THE_SCREEN_MS)
      expect(seen.output()).not.toContain('not-for-an-older-holder')
      seen.close()
      expect(rowsSince(changes).filter((row) => row.record_id === 'setting:terminals')).toEqual([])
      expect(pressesSince(presses)).toEqual([])

      const own = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo still-serves-$((2*3))\r' })
      expect(own.status, own.raw).toBe(200)
      expect((await untilTheScreenShows(old, shell, 'still-serves-6')).some((line) => line.includes('still-serves-6'))).toBe(true)
    } finally {
      process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
      await older.close()
    }
  }, 60_000)
})

describe('on the owner’s words', () => {
  it('8: a secretary types the line the words name with the row at kept, the change row keeps the words, and no press row is written', async () => {
    const shell = await aShell(false)
    answer('kept')
    for (const [who, line, shows] of [
      [RAISED, 'echo on-the-owners-words-$((4*4))', 'on-the-owners-words-16'],
      [UNRAISED, 'echo also-on-the-owners-words-$((5*5))', 'also-on-the-owners-words-25'],
    ] as const) {
      const changes = theLast('changes')
      const presses = theLast('presses_for_the_person')
      const done = await typeAsTheSecretary(shell, who, { line, warrant: theOwnersWords(typingThisLine(shell, line)) })
      expect(done.status, `${who}: ${done.raw}`).toBe(200)
      expect(done.body).toMatchObject({ entered: true, typedFrom: 'a secretary' })
      await untilTheScreenShows(place, shell, shows)
      expect(pressesSince(presses), `${who}: a press on the owner’s words was written down as a press under the grant`).toEqual([])
      const acts = rowsSince(changes).filter((row) => row.record_id === 'setting:terminals')
      expect(acts.length, `${who}: one change row for the line`).toBe(1)
      expect(acts[0]).toMatchObject({ actor_type: 'agent', actor_id: who, elevation: null, press_id: null })
      expect(JSON.parse(acts[0]!.warrant!)).toMatchObject({ saidBy: THE_PERSON, words: 'Made-up words: type that one line for me.', for: [typingThisLine(shell, line)] })
      expect(acts[0]!.new_value).toBe('entered')
    }
  }, 60_000)

  it('8b: words for another line, for the terminal alone or for another terminal are refused, and nothing is typed', async () => {
    const shell = await aShell(false)
    const other = await aShell(false)
    answer('kept')
    const line = 'echo never-typed-on-other-words'
    for (const words of [
      theOwnersWords(typingThisLine(shell, 'echo another-line')),
      theOwnersWords(`${DOOR}:${JSON.stringify({ terminal: shell })}`),
      theOwnersWords(typingThisLine(other, line)),
    ]) {
      const refused = await refusedAndNothingTyped(shell, as(RAISED), { line, warrant: words }, 403, 'never-typed-on-other-words')
      expect(refused.body, refused.raw).toMatchObject({ code: 'terminalTypingWordsRefused', values: {} })
      expect(refused.error).toContain('Nothing was typed')
    }
  }, 60_000)

  it('8c: a worker carrying the owner’s words for the line is refused in the door’s words, and nothing is typed', async () => {
    const shell = await aShell(false)
    const line = 'echo never-typed-by-a-worker'
    const refused = await refusedAndNothingTyped(shell, as(WORKER), { line, warrant: theOwnersWords(typingThisLine(shell, line)) }, 403, 'never-typed-by-a-worker')
    expect(refused.body.code, refused.raw).toBe('terminalsOnlyThePerson')
    expect(refused.error).toContain(THE_DOORS_REFUSAL)
  }, 60_000)
})

describe('the person’s own typing', () => {
  it('9: is unchanged, and the person’s lines are kept', async () => {
    const shell = await aShell(true)
    const typed = await call('POST', `/api/terminals/${shell}/input`, PERSON, { data: 'echo mine-$((2+2))\r' })
    expect(typed.status, typed.raw).toBe(200)
    expect(typed.body).toEqual({ typed: 'echo mine-$((2+2))\r'.length, typedFrom: 'this computer', narrowedByPermission: null })
    await untilTheScreenShows(place, shell, 'mine-4')
    const note = await until(() => theNoteOf(shell), (read) => read !== null && read.lines === 1, 10_000)
    expect(t.api.getRecord(note!.id)!.data['body']).toBe('echo mine-$((2+2))')
    expect(note!.leftOut['typedByAnother']).toBe(0)
    expect(await theLastLineOf(shell)).toMatchObject({ text: 'echo mine-$((2+2))' })
  }, 60_000)

  it('10: typing in the holder’s pause stops the secretary’s Enter; the line is written down and counted, and the refusal says why', async () => {
    const shell = await aShell(false)
    answer('may-press')
    const seen = await watch(place, shell)
    const changes = theLast('changes')
    const presses = theLast('presses_for_the_person')
    const typing = typeAsTheSecretary(shell, RAISED, { line: 'echo mixed-$((5+5))', ...FOR_THE_PERSON })
    // THE PERSON TYPES ONCE THE LINE IS ON THE SCREEN, inside the holder's pause of 100 ms before its Enter.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('mixed-$((5+5))') && Date.now() < deadline) await sleep(2)
    await holder(place, { op: 'write', terminal: shell, data: ' person-part' })
    const refused = await typing
    seen.close()
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body).toMatchObject({ code: 'terminalTypedWithoutEnterThePersonTyped', values: {} })
    expect(refused.error).toContain('Enter')
    const pressed = pressesSince(presses)
    expect(pressed.length, 'a press is one row').toBe(1)
    const acts = rowsSince(changes).filter((row) => row.record_id === 'setting:terminals')
    expect(acts.length).toBe(1)
    expect(acts[0]).toMatchObject({ actor_id: RAISED, press_id: pressed[0]!.id })
    expect(acts[0]!.new_value).toContain('without its Enter')
    expect(typedFromOf(shell).runs).toEqual([expect.objectContaining({ level: 'a secretary', inputs: 1 })])
  }, 60_000)

  it('10b: Enter pressed by the person in the holder’s pause sends the line once, and the refusal says the office did not press Enter', async () => {
    const shell = await aShell(false)
    answer('may-press')
    const seen = await watch(place, shell)
    const changes = theLast('changes')
    const typing = typeAsTheSecretary(shell, RAISED, { line: 'echo entered-$((6+6))', ...FOR_THE_PERSON })
    // THE PERSON TYPES AND PRESSES ENTER ONCE THE LINE IS ON THE SCREEN, inside the holder's pause of 100 ms.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('entered-$((6+6))') && Date.now() < deadline) await sleep(2)
    await holder(place, { op: 'write', terminal: shell, data: ' by-the-person\r' })
    const refused = await typing
    seen.close()
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body).toMatchObject({ code: 'terminalTypedWithoutEnterThePersonEndedTheLine', values: {} })
    expect(refused.error).toContain('pressed Enter on the line or cleared it')
    await untilTheScreenShows(place, shell, 'entered-12 by-the-person')
    const acts = rowsSince(changes).filter((row) => row.record_id === 'setting:terminals')
    expect(acts.length).toBe(1)
    expect(acts[0]!.new_value).toContain('pressed Enter on it or cleared it')
  }, 60_000)

  it('11: a secretary’s line the person typed into in the pause, then took their part off, keeps a later line off it, and the door says why', async () => {
    const halfLine = await theRefusalsOfAHalfLine()
    const shell = await aShell(false)
    answer('may-press')
    const seen = await watch(place, shell)
    const typing = typeAsTheSecretary(shell, RAISED, { line: 'echo first-$((1+1))', ...FOR_THE_PERSON })
    // THE PERSON TYPES ONCE THE LINE IS ON THE SCREEN, inside the holder's pause of 100 ms before its Enter.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('first-$((1+1))') && Date.now() < deadline) await sleep(2)
    await holder(place, { op: 'write', terminal: shell, data: THE_PERSONS_PART })
    const first = await typing
    seen.close()
    expect(first.body.code, first.raw).toBe('terminalTypedWithoutEnterThePersonTyped')
    await thePersonTakesTheirPartOff(shell)
    await aLaterLineIsKeptOff(shell, halfLine, 'first-2')
  }, 60_000)

  it('11b: a quick input the person typed into in the pause, then took their part off, keeps a later line off it, and the door says why', async () => {
    const halfLine = await theRefusalsOfAHalfLine()
    const shell = await aShell(false)
    answer('may-press')
    const seen = await watch(place, shell)
    // ASKED OF THE HOLDER AS THE QUICK INPUT DOOR ASKS IT (src/server/api/quick-inputs.ts). That door needs an agent's run,
    // its key and its ten minutes, which tests/an-agent-asks-for-a-quick-input.test.ts makes.
    const typing = askTheHolder(place.socket, { op: 'quickInput', terminal: shell, input: 'echo quick-$((2+3))' })
    // THE PERSON TYPES ONCE THE INPUT IS ON THE SCREEN, inside the holder's pause of 100 ms before its Enter.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('quick-$((2+3))') && Date.now() < deadline) await sleep(2)
    await holder(place, { op: 'write', terminal: shell, data: THE_PERSONS_PART })
    const quick = await typing
    seen.close()
    expect(quick, JSON.stringify(quick)).toMatchObject({ ok: true, entered: false, why: 'the-person-typed' })
    await thePersonTakesTheirPartOff(shell)
    await aLaterLineIsKeptOff(shell, halfLine, 'quick-5')
  }, 60_000)

  it('11c: a secretary’s line the person shortened with erase in the pause is not sent, and a later line is kept off it', async () => {
    const halfLine = await theRefusalsOfAHalfLine()
    const shell = await aShell(false)
    answer('may-press')
    const seen = await watch(place, shell)
    // THE LINE’S LAST TWO CHARACTERS ARE MADE UP TO BE ERASED, so the shortened line runs words the whole line does not.
    const typing = typeAsTheSecretary(shell, RAISED, { line: 'echo short-$((40+2))xy', ...FOR_THE_PERSON })
    // THE PERSON ERASES ONCE THE LINE IS ON THE SCREEN, inside the holder’s pause of 100 ms before its Enter.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('short-$((40+2))xy') && Date.now() < deadline) await sleep(2)
    await holder(place, { op: 'write', terminal: shell, data: '\x7f\x7f' })
    const first = await typing
    seen.close()
    await sleep(AFTER_THE_SCREEN_MS)
    const after = await theScreenNow(place, shell)
    expect(
      { status: first.status, code: first.body.code, shortenedLineRan: after.some((line) => line.trim() === 'short-42') },
      first.raw,
    ).toMatchObject({ status: 409, code: 'terminalTypedWithoutEnterThePersonTyped', shortenedLineRan: false })
    await aLaterLineIsKeptOff(shell, halfLine, 'short-42')
  }, 60_000)

  it('11d: a quick input the person shortened with erase in the pause is not sent, and a later line is kept off it', async () => {
    const halfLine = await theRefusalsOfAHalfLine()
    const shell = await aShell(false)
    answer('may-press')
    const seen = await watch(place, shell)
    // ASKED OF THE HOLDER AS THE QUICK INPUT DOOR ASKS IT, and made up so only the shortened line prints quick-short-42.
    const typing = askTheHolder(place.socket, { op: 'quickInput', terminal: shell, input: 'echo quick-short-$((50-8))xy' })
    // THE PERSON ERASES ONCE THE INPUT IS ON THE SCREEN, inside the holder’s pause of 100 ms before its Enter.
    const deadline = Date.now() + 2_000
    while (!seen.output().includes('quick-short-$((50-8))xy') && Date.now() < deadline) await sleep(2)
    await holder(place, { op: 'write', terminal: shell, data: '\x7f\x7f' })
    const quick = await typing
    seen.close()
    await sleep(AFTER_THE_SCREEN_MS)
    const after = await theScreenNow(place, shell)
    expect(
      { ...quick, shortenedLineRan: after.some((line) => line.trim() === 'quick-short-42') },
      JSON.stringify(quick),
    ).toMatchObject({ ok: true, entered: false, why: 'the-person-typed', shortenedLineRan: false })
    await aLaterLineIsKeptOff(shell, halfLine, 'quick-short-42')
  }, 60_000)
})
