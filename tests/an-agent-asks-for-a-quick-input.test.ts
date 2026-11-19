// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT ASKS FOR AN INPUT FROM THE OWNER'S LIST, AND THE OFFICE TYPES IT INTO THAT AGENT'S OWN TERMINAL ONLY WHEN ALL
 * THREE CONDITIONS HOLD. Wave 13u, round 21: POST /api/terminals/quick-input, the list's two
 * doors and the asks door (src/server/api/quick-inputs.ts), and the holder's quickInput request (src/holder/index.mjs).
 *
 * NO REAL AGENT PROGRAM IS STARTED. A stand-in named claude is put first on the PATH the scratch server gives its
 * terminals, and it reads lines from its terminal:
 *   - `ASK <input>` asks for the input with its own run, its own key and its own name, as an agent in that terminal
 *     would, and prints `ASKED <status> <code or ->`;
 *   - `ASK-FOR <run> <input>` does the same naming another run;
 *   - `ASK-FOR-WITHOUT-KEY <run> <input>` names another run and sends no key;
 *   - `ASK-WHEN <file> <input>` waits until the file exists, then asks as ASK does, so the person can leave a line half
 *     typed while the ask is on its way;
 *   - an empty line prints `EMPTY LINE`, so an Enter pressed on nothing shows on the screen;
 *   - any other line prints `LINE <line>`, so a typed input and its Enter show on the screen as `LINE /context`.
 * Of the key it prints only whether it is set. A real holder and a real scratch server run on a database in the test's
 * own folder (tests/terminal-holder-stand.ts). Agents A and B are opened in terminals with the person's key, so each run
 * has a key of its own; agent C is opened the same way in case c, so its ten minutes are its own.
 *
 *   1. The list starts as /context and /compact, stamped as written by migration 0272. The person clears it: there is
 *      no list, the read says so, and it names the person as who cleared it. A asks for /context: 409 no-list, nothing
 *      is typed, and the ask is kept.
 *   2. The person sets the list. An agent's write is refused 403 with its code and changes nothing. Each broken rule is
 *      refused 400 with a code of its own and values naming the input it concerns (its place in the list and what a
 *      person can see of it): "yes", "y" and "1" do not begin with "/", a line with a newline inside it holds a key,
 *      and a 201-character input is too long. The rules about the whole list (not a list, an empty list, more than 20
 *      inputs) name what was wrong with the list. Nothing is written by any of them.
 *   3. B asks for /context naming A's run with its own key: 403 before the door reads it, since a key names only a run
 *      it holds (src/server/lib/the-run-a-key-holds.ts), nothing is typed and nothing is kept. B asks the same with no
 *      key: 403 not-the-agent, nothing is typed, and the ask is kept under A with B as the asker.
 *   4. A asks for /not-listed: 409 not-on-the-list, nothing is typed.
 *   5. A asks for /context: 200, the input and its Enter reach A's terminal, the ask is kept as typed, the next input
 *      may be typed ten minutes later, and A's typing sources hold one input from an agent's ask.
 *   a. With keeping on, the quick input is not the person's typing: the kept note and the holder's waiting lines hold
 *      only the lines the person typed, and the last line offered is the person's, never /context.
 *   6. A asks for /compact: 429 too-soon, nothing is typed.
 *   b. With a line the person has half typed in B's terminal, B's ask for /compact is kept as not-typed, nothing is put
 *      on the line, and the ten minutes do not start.
 *   7. B asks for /compact with its own run: 200, and it reaches B's terminal, because the ten minutes are counted for
 *      each agent.
 *   8. The asks door for A lists the asks of 1, 3, 4, 5 and 6, newest first, with who asked each.
 *   c. The person presses Enter on C's line in the holder's pause, after /context is typed and before the holder's
 *      Enter (wave 13s, round 87). The line is sent once, with the person's part on it, and no second Enter follows.
 *      The ask is refused with the code the secretary's door gives for the same thing, and kept as typed-without-enter.
 *      The line is never the person's: it is not their last line, and the kept note counts it as typed by another and
 *      holds neither part of it.
 *   And the CHECK on the stored outcome names every outcome of QUICK_INPUT_OUTCOMES, and no other.
 *
 * NOT PROVED HERE: the `unknown` outcome, when the holder gives no answer the office can read. The server asks the holder
 * its hello before every quick input, and the holder answers both in milliseconds, so a stand that pauses the holder
 * makes the hello go unanswered and the ask is kept as not-typed, with nothing sent. Only a holder that answers the
 * hello and not the quick input reaches `unknown`, and that would be a fake holder.
 *
 * MUTATIONS (each after a control run; the report has the runs and the logs):
 *   - lib/quick-inputs.ts decideAnAsk does not ask condition 1 (the run's own key): B's ask for A's run with no key
 *     types into A's terminal, case 3 goes red.
 *   - lib/quick-inputs.ts decideAnAsk does not ask whether the input is on the list: /not-listed is typed, case 4 goes red.
 *   - lib/quick-inputs.ts decideAnAsk does not ask condition 3 (the ten minutes): /compact is typed, case 6 goes red.
 *   - holder/index.mjs quickInput reads its input and its Enter as the person's typing (it calls readTheTyping): /context
 *     is kept in the note and offered as the last line, case a goes red.
 *   - holder/index.mjs quickInput does not refuse a half-typed line before it types: the input is put on the person's
 *     line, case b goes red.
 * Round 87's, of the mark put on a quick input before it is written:
 *   - holder/index.mjs quickInput does not ask its pause to check the mark: the holder presses a second Enter after the
 *     person's, case c goes red.
 *   - holder/index.mjs quickInput does not mark the input before it writes it: every quick input is answered as a line
 *     the person ended, and no Enter follows it, so cases 5, a, 7 and 8 go red; in case c the tail of the mixed line is
 *     the person's last line, and c goes red too.
 *   - holder/index.mjs quickInput does not take the mark off after its own Enter: the person's next line is left out as
 *     typed by another, case a goes red.
 *   - api/quick-inputs.ts has no answer of its own for a line the person ended: the door answers 502
 *     quickInputTypedWithoutEnter, case c goes red.
 * Round 175's, of what a failed wait in typeAs says:
 *   - lib/quick-inputs.ts theNextTimeFor counts every agent's asks, not only this agent's: cases b, 7 and c go red,
 *     and case 7's failure lists the last lines B's screen showed in place of "ASKED 200 -".
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { QUICK_INPUT_OUTCOMES } from '../src/shared/quick-inputs.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  holder,
  readTheStream,
  sleep,
  startAHolder,
  startAServer,
  stopEverything,
  theStreamsScreen,
  until,
  watch,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'
import { thePersonsKeyHeader } from './helpers.ts'

let place: Place
let server: ScratchServer
let asThePerson: Record<string, string>
const A = { handle: 'qi-a', id: '', run: '', terminal: '' }
const B = { handle: 'qi-b', id: '', run: '', terminal: '' }
const C = { handle: 'qi-c', id: '', run: '', terminal: '' }
/** Every line the person typed into A's terminal, in order: the note kept for it must hold exactly these. */
const typedIntoA: string[] = []

/** The stand-in agent program. It prints whether it has a key and never the key itself. */
function theStandIn(): string {
  return `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
const env = process.env
const ask = async (run, input, keyed = true) => {
  const got = await fetch(env.MOLE_OFFICE_API + '/api/terminals/quick-input', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': env.MOLE_OFFICE_WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': env.MOLE_OFFICE_AGENT, 'x-mole-office-session': run, ...(keyed ? { 'x-mole-office-key': env.MOLE_AGENT_KEY ?? '' } : {}) },
    body: JSON.stringify({ input }),
  })
  const body = await got.json().catch(() => ({}))
  out('ASKED ' + String(got.status) + ' ' + (typeof body.code === 'string' ? body.code : '-'))
}
const whenItExists = async (file) => {
  const { existsSync } = await import('node:fs')
  while (!existsSync(file)) await new Promise((done) => setTimeout(done, 50))
}
const heard = (line) => {
  const words = line.split(' ')
  const failed = (err) => out('ASK FAILED ' + String(err))
  if (words[0] === 'ASK' && words.length === 2) ask(env.MOLE_OFFICE_SESSION, words[1]).catch(failed)
  else if (words[0] === 'ASK-FOR' && words.length === 3) ask(words[1], words[2]).catch(failed)
  else if (words[0] === 'ASK-FOR-WITHOUT-KEY' && words.length === 3) ask(words[1], words[2], false).catch(failed)
  else if (words[0] === 'ASK-WHEN' && words.length === 3) whenItExists(words[1]).then(() => ask(env.MOLE_OFFICE_SESSION, words[2])).catch(failed)
  else out('LINE ' + line)
}
let pending = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  pending += chunk
  let at = pending.search(/[\\r\\n]/)
  while (at >= 0) {
    const line = pending.slice(0, at)
    pending = pending.slice(at + 1)
    if (line !== '') heard(line)
    else out('EMPTY LINE')
    at = pending.search(/[\\r\\n]/)
  }
})
out('KEY ' + (env.MOLE_AGENT_KEY === undefined ? 'unset' : 'set'))
out('STAND-IN READY')
`
}

/** Read the scratch office's database, read-only. */
function theDatabase<T>(read: (db: Database.Database) => T): T {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try {
    return read(db)
  } finally {
    db.close()
  }
}

/** Register an agent as the person, with a start folder, and open it in a terminal with the person's key. */
async function anAgentInATerminal(agent: typeof A): Promise<void> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle: agent.handle, name: agent.handle, role: 'worker', runtime: 'claude-code' } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  agent.id = String((registered.body['agent'] as { id: string }).id)
  const folder = join(place.dir, agent.handle)
  mkdirSync(folder, { recursive: true })
  const set = await ask(server.api, `/api/participants/agent/${agent.handle}/start-folder`, { method: 'POST', body: { startFolder: folder, because: 'the test opens it in a terminal' } })
  expect(set.status, JSON.stringify(set.body)).toBe(200)
  const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: asThePerson, body: { agent: agent.handle, cols: 120, rows: 60 } })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  expect((opened.body['key'] as { given: boolean }).given).toBe(true)
  const terminal = opened.body['terminal'] as { id: string; pid: number; keeping: boolean }
  groups.add(terminal.pid)
  expect(terminal.keeping).toBe(true)
  agent.run = String(opened.body['session'])
  agent.terminal = terminal.id
  const screen = await until(() => theScreen(agent), (lines) => lines.includes('STAND-IN READY'), 20_000)
  expect(screen).toContain('KEY set')
}

/** The terminal's screen as trimmed lines. */
async function theScreen(agent: typeof A): Promise<string[]> {
  return (await theStreamsScreen(server.api, agent.terminal)).map((line) => line.trim())
}

/** How many lines of the screen read exactly `line`. */
async function howMany(agent: typeof A, line: string): Promise<number> {
  return (await theScreen(agent)).filter((one) => one === line).length
}

/**
 * Type a line into an agent's terminal as the person, Enter included, and wait until the screen shows `shows`.
 *
 * WHEN THE WAIT ENDS WITHOUT IT, the failure says how long the wait was and what the screen's last lines were. Problem
 * `i5iWViv0JYRJ`: case 7 went red in two whole suites with only "the screen never showed", so nobody could tell whether
 * the stand-in printed a different answer, printed nothing, or never read the line.
 */
async function typeAs(agent: typeof A, line: string, shows: string, times = 1): Promise<void> {
  const typed = await ask(server.api, `/api/terminals/${agent.terminal}/input`, { method: 'POST', body: { data: `${line}\r` } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
  if (agent === A) typedIntoA.push(line)
  const started = Date.now()
  const screen = await until(() => theScreen(agent), (lines) => lines.filter((one) => one === shows).length >= times, 15_000)
  const lastLines = screen.filter((one) => one !== '').slice(-12)
  expect(
    screen.filter((one) => one === shows).length,
    `the screen never showed "${shows}" ${String(times)} time(s) in ${String(Date.now() - started)} ms; its last lines were ${JSON.stringify(lastLines)}`,
  ).toBeGreaterThanOrEqual(times)
}

/** Give the holder a moment to type anything it was wrongly sent, so a check that nothing was typed means something. */
const aMoment = () => sleep(600)

interface Kept {
  id: string
  at: string
  agent: { id: string; handle: string | null }
  run: string
  terminal: string
  input: string
  outcome: string
  askedBy: { kind: string; id: string; provedBy: string | null }
  says: string
}

const theAsksOf = async (agent: typeof A, limit?: number): Promise<{ asks: Kept[]; left: number; nextAllowedAt: string | null }> => {
  const read = await ask(server.api, `/api/office/quick-inputs/asks?agent=${agent.handle}${limit === undefined ? '' : `&limit=${String(limit)}`}`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return read.body as unknown as { asks: Kept[]; left: number; nextAllowedAt: string | null }
}

const theList = async (headers = AS_THE_PERSON): Promise<Record<string, unknown>> => {
  const read = await ask(server.api, '/api/office/quick-inputs', { headers })
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return read.body
}

/** A local stamp read as local time, in milliseconds. */
const msOf = (stamp: string): number => new Date(stamp.replace(' ', 'T')).getTime()

interface Keeping {
  on: boolean
  note: { id: string; lines: number; leftOut: Record<string, number> } | null
}

const keeping = async (agent: typeof A): Promise<Keeping> => {
  const read = await ask(server.api, `/api/terminals/${agent.terminal}/keeping`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return read.body as unknown as Keeping
}

/** Wait until the note kept for the terminal holds `lines` lines; answers its body. */
async function theKeptNote(agent: typeof A, lines: number): Promise<string> {
  const kept = await until(() => keeping(agent), (k) => k.note !== null && k.note.lines === lines, 10_000)
  expect(kept.note, 'nothing was kept for the terminal').not.toBeNull()
  const note = (await ask(server.api, `/api/records/${kept.note!.id}`)).body['record'] as { data: Record<string, unknown> }
  return String(note.data['body'])
}

const AS_AGENT_A = (): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': A.handle })

beforeAll(async () => {
  place = aPlace('quick')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), theStandIn())
  chmodSync(join(bin, 'claude'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  asThePerson = { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(dirname(place.database), 'keys.json')) }
  await anAgentInATerminal(A)
  await anAgentInATerminal(B)
}, 180_000)

afterAll(stopEverything, 60_000)

describe('an agent asks for a quick input', () => {
  it('the CHECK on the stored outcome names every outcome of QUICK_INPUT_OUTCOMES, and no other', () => {
    const sql = theDatabase((db) => (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'quick_input_asks'").get() as { sql: string }).sql)
    const listed = /`outcome` text NOT NULL CHECK \(`outcome` IN \(([^)]*)\)\)/.exec(sql)
    expect(listed, sql).not.toBeNull()
    expect(listed![1]!.split(',').map((one) => one.trim().replace(/^'|'$/g, ''))).toEqual([...QUICK_INPUT_OUTCOMES])
  })

  it('1: the list starts as the migration wrote it; the person clears it, and A is refused as no-list, with nothing typed', async () => {
    const starting = await theList()
    expect(starting).toMatchObject({ reading: { state: 'set', inputs: ['/context', '/compact'] }, setBy: { kind: 'migration', id: '0272' }, says: null, refusal: null })
    // AN AGENT READS THE SAME LIST, with the words the write door would refuse it with.
    expect(typeof (await theList(AS_AGENT_A()))['refusal']).toBe('string')

    const cleared = await ask(server.api, '/api/office/quick-inputs', { method: 'POST', headers: asThePerson, body: { clear: true } })
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect(cleared.body).toMatchObject({ reading: { state: 'none' }, setBy: { kind: 'human', id: THE_PERSON } })
    expect(String(cleared.body['says'])).toContain('There is no list of quick inputs now')
    expect(await theList()).toMatchObject({ reading: { state: 'none' }, setBy: { kind: 'human', id: THE_PERSON } })

    await typeAs(A, 'ASK /context', 'ASKED 409 quickInputNoList')
    await aMoment()
    expect(await howMany(A, 'LINE /context')).toBe(0)
    const kept = await theAsksOf(A)
    expect(kept.asks).toHaveLength(1)
    expect(kept.asks[0]).toMatchObject({ input: '/context', outcome: 'no-list', run: A.run, terminal: A.terminal, askedBy: { kind: 'agent', id: A.handle } })
    expect(kept.nextAllowedAt).toBeNull()
  }, 90_000)

  it('2: the person sets the list; an agent may not, and a list that is not one is refused with nothing written', async () => {
    const set = await ask(server.api, '/api/office/quick-inputs', { method: 'POST', headers: asThePerson, body: { inputs: ['/context', ' /compact '] } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    // WHAT THE OFFICE MADE OF IT IS SHOWN BACK: the spaces round /compact are gone.
    expect(set.body).toMatchObject({ reading: { state: 'set', inputs: ['/context', '/compact'] }, setBy: { kind: 'human', id: THE_PERSON }, says: null })
    const before = await theList()

    const byAnAgent = await ask(server.api, '/api/office/quick-inputs', { method: 'POST', headers: AS_AGENT_A(), body: { inputs: ['/context', '/compact', '/agent-wants-this'] } })
    expect(byAnAgent.status, JSON.stringify(byAnAgent.body)).toBe(403)
    expect(byAnAgent.body['code']).toBe('quickInputListOnlyThePerson')
    expect(await theList()).toEqual(before)

    // ONE CODE FOR EACH BROKEN RULE, carrying the input it concerns: its place in the list, and what a person can see
    // of it. "/x\ny" is named as "/x", the part before the key, never with the newline in it. A rule about the whole
    // list carries what was wrong with the list instead.
    const refusedLists: [unknown, string, Record<string, string | number>][] = [
      ['words, not a list', 'quickInputListNotAList', {}],
      [[], 'quickInputListEmpty', {}],
      [Array.from({ length: 21 }, (_, n) => `/in-${String(n)}`), 'quickInputListTooMany', { most: 20, count: 21 }],
      [['/context', 7], 'quickInputListItemNotWords', { place: 2 }],
      [['/context', '  '], 'quickInputListItemEmpty', { place: 2 }],
      [['/context', `/${'a'.repeat(200)}`], 'quickInputListItemTooLong', { place: 2, longest: 200, input: `/${'a'.repeat(39)}` }],
      [['/context', '/x\ny'], 'quickInputListItemHoldsAKey', { place: 2, input: '/x' }],
      [['/context', 'yes'], 'quickInputListItemNoSlash', { place: 2, input: 'yes' }],
      [['/context', '/context'], 'quickInputListItemTwice', { place: 2, input: '/context' }],
    ]
    for (const [inputs, code, values] of refusedLists) {
      const refused = await ask(server.api, '/api/office/quick-inputs', { method: 'POST', headers: asThePerson, body: { inputs } })
      expect(refused.status, `${JSON.stringify(inputs)}: ${JSON.stringify(refused.body)}`).toBe(400)
      expect(refused.body['code'], JSON.stringify(inputs)).toBe(code)
      expect(refused.body['values'], JSON.stringify(inputs)).toEqual(values)
      expect(String(refused.body['error'])).toContain('Nothing was written.')
      expect(await theList()).toEqual(before)
    }
  }, 60_000)

  it("3: B asks for A's run, and is refused as not the agent, with nothing typed and the ask kept under A", async () => {
    await typeAs(B, `ASK-FOR ${A.run} /context`, 'ASKED 403 -')
    await aMoment()
    expect((await theAsksOf(A)).asks.filter((one) => one.askedBy.id === B.handle), 'an ask the header refused was kept').toHaveLength(0)
    await typeAs(B, `ASK-FOR-WITHOUT-KEY ${A.run} /context`, 'ASKED 403 quickInputNotTheAgent')
    await aMoment()
    expect(await howMany(A, 'LINE /context')).toBe(0)
    expect(await howMany(B, 'LINE /context')).toBe(0)
    const kept = await theAsksOf(A)
    expect(kept.asks[0]).toMatchObject({ input: '/context', outcome: 'not-the-agent', run: A.run, agent: { id: A.id }, askedBy: { kind: 'agent', id: B.handle } })
    expect(kept.nextAllowedAt).toBeNull()
    expect((await theAsksOf(B)).asks).toHaveLength(0)
  }, 60_000)

  it('4: A asks for an input not on the list, and is refused, with nothing typed', async () => {
    await typeAs(A, 'ASK /not-listed', 'ASKED 409 quickInputNotOnTheList')
    await aMoment()
    expect(await howMany(A, 'LINE /not-listed')).toBe(0)
    expect((await theAsksOf(A)).asks[0]).toMatchObject({ input: '/not-listed', outcome: 'not-on-the-list' })
  }, 60_000)

  it("5: A asks for /context, and it is typed into A's terminal with Enter, kept as typed, and counted as an agent's ask", async () => {
    await typeAs(A, 'ASK /context', 'ASKED 200 -')
    const screen = await until(() => theScreen(A), (lines) => lines.includes('LINE /context'), 10_000)
    expect(screen.filter((one) => one === 'LINE /context')).toHaveLength(1)

    const kept = await theAsksOf(A)
    expect(kept.asks[0]).toMatchObject({ input: '/context', outcome: 'typed', run: A.run, terminal: A.terminal, askedBy: { kind: 'agent', id: A.handle } })
    expect(kept.nextAllowedAt).not.toBeNull()
    // TEN MINUTES, rounded up to the next whole second.
    const wait = msOf(kept.nextAllowedAt!) - msOf(kept.asks[0]!.at)
    expect(wait).toBeGreaterThanOrEqual(600_000)
    expect(wait).toBeLessThanOrEqual(601_000)

    const read = await readTheStream(server.api, A.terminal, AS_THE_PERSON)
    const typedFrom = read.events.find((e) => e.event === 'screen')?.data['typedFrom'] as { runs: Record<string, unknown>[] } | undefined
    expect(typedFrom, `the stream gave no screen: ${String(read.status)} ${read.refusal}`).toBeDefined()
    const fromAnAsk = typedFrom!.runs.filter((run) => run['level'] === "an agent's ask")
    expect(fromAnAsk).toHaveLength(1)
    expect(fromAnAsk[0]).toMatchObject({ how: "an agent's ask", inputs: 1, agentHandle: A.handle, account: { id: A.id, proof: "the run's key", device: null } })
  }, 60_000)

  it("a: with keeping on, the quick input is not the person's typing: the note, the waiting lines and the last line hold only the person's", async () => {
    // THE PERSON'S THREE LINES SO FAR, and not /context.
    expect(await theKeptNote(A, typedIntoA.length)).toBe(typedIntoA.join('\n'))
    expect(await holder(place, { op: 'takeLines', terminal: A.terminal })).toMatchObject({ lines: [], waiting: 0 })
    const last = await ask(server.api, `/api/terminals/${A.terminal}/last-line`)
    expect(last.status, JSON.stringify(last.body)).toBe(200)
    expect(last.body).toMatchObject({ line: { text: 'ASK /context' }, why: null })

    // THE PERSON TYPES A LINE AND ENTER AFTER IT, and only that line is added.
    await typeAs(A, 'the persons own words', 'LINE the persons own words')
    await sleep(600)
    const body = await theKeptNote(A, typedIntoA.length)
    expect(body).toBe(typedIntoA.join('\n'))
    expect(body.split('\n')).not.toContain('/context')
    expect((await ask(server.api, `/api/terminals/${A.terminal}/last-line`)).body).toMatchObject({ line: { text: 'the persons own words' } })
  }, 60_000)

  it('6: A asks for /compact inside its ten minutes, and is refused as too soon, with nothing typed', async () => {
    await typeAs(A, 'ASK /compact', 'ASKED 429 quickInputTooSoon')
    await aMoment()
    expect(await howMany(A, 'LINE /compact')).toBe(0)
    const kept = await theAsksOf(A)
    expect(kept.asks[0]).toMatchObject({ input: '/compact', outcome: 'too-soon' })
    expect(kept.asks[0]!.says).toContain('An input was typed for this agent at')
  }, 60_000)

  it("b: a line the person has half typed in B's terminal keeps B's ask as not-typed, puts nothing on the line, and starts no wait", async () => {
    const go = join(place.dir, 'go-b')
    await typeAs(B, `ASK-WHEN ${go} /compact`, `ASK-WHEN ${go} /compact`)
    const half = await ask(server.api, `/api/terminals/${B.terminal}/input`, { method: 'POST', body: { data: 'half' } })
    expect(half.status, JSON.stringify(half.body)).toBe(200)
    await until(() => theScreen(B), (lines) => lines.includes('half'), 10_000)
    // B'S SCREEN ALREADY SHOWS THE ANSWER TO CASE 3, so the answer looked for here is the one after it.
    const answered = (lines: string[]) => lines.filter((one) => one.includes('ASKED '))
    const before = answered(await theScreen(B)).length
    writeFileSync(go, '')
    const screen = await until(() => theScreen(B), (lines) => answered(lines).length > before, 15_000)
    expect(answered(screen)).toHaveLength(before + 1)
    expect(answered(screen).at(-1)).toContain('ASKED 409 quickInputNotTyped')
    await aMoment()
    const now = await theScreen(B)
    expect(now.some((one) => one.includes('/compact') && !one.startsWith('ASK-WHEN'))).toBe(false)
    expect(now.filter((one) => one.startsWith('LINE '))).toEqual([])

    const kept = await theAsksOf(B)
    expect(kept.asks[0]).toMatchObject({ input: '/compact', outcome: 'not-typed', run: B.run })
    expect(kept.asks[0]!.says).toContain('half typed')
    expect(kept.nextAllowedAt).toBeNull()
    // THE PERSON CLEARS THE HALF LINE with Ctrl+U, which the holder reads as clearing it too.
    const clear = await ask(server.api, `/api/terminals/${B.terminal}/input`, { method: 'POST', body: { data: '\u0015' } })
    expect(clear.status, JSON.stringify(clear.body)).toBe(200)
  }, 60_000)

  it("7: B asks for /compact with its own run, and it is typed, because A's ten minutes are A's own", async () => {
    await typeAs(B, 'ASK /compact', 'ASKED 200 -')
    await until(() => theScreen(B), (lines) => lines.includes('LINE /compact'), 10_000)
    expect(await howMany(B, 'LINE /compact')).toBe(1)
    expect(await howMany(A, 'LINE /compact')).toBe(0)
    expect((await theAsksOf(B)).asks[0]).toMatchObject({ input: '/compact', outcome: 'typed', run: B.run })
  }, 60_000)

  it("8: the asks door lists A's asks newest first, with who asked each, a page at a time", async () => {
    const all = await theAsksOf(A)
    expect(all.left).toBe(0)
    expect(all.asks.map((one) => [one.input, one.outcome, one.askedBy.id])).toEqual([
      ['/compact', 'too-soon', A.handle],
      ['/context', 'typed', A.handle],
      ['/not-listed', 'not-on-the-list', A.handle],
      ['/context', 'not-the-agent', B.handle],
      ['/context', 'no-list', A.handle],
    ])
    for (const one of all.asks) expect(one.agent).toEqual({ id: A.id, handle: A.handle })
    const two = await theAsksOf(A, 2)
    expect(two.asks.map((one) => one.outcome)).toEqual(['too-soon', 'typed'])
    expect(two.left).toBe(3)
    const tooMany = await ask(server.api, `/api/office/quick-inputs/asks?agent=${A.handle}&limit=26`)
    expect(tooMany.status, JSON.stringify(tooMany.body)).toBe(400)
    expect(tooMany.body['code']).toBe('quickInputAsksBadLimit')
  }, 60_000)

  it("c: the person presses Enter on C's line in the holder's pause, and the line is sent once and is never the person's", async () => {
    await anAgentInATerminal(C)
    const seen = await watch(place, C.terminal)
    const typed = await ask(server.api, `/api/terminals/${C.terminal}/input`, { method: 'POST', body: { data: 'ASK /context\r' } })
    expect(typed.status, JSON.stringify(typed.body)).toBe(200)
    // ONCE IN THE PERSON'S LINE AND ONCE AS THE HOLDER TYPES IT: then the holder's pause has begun. The person's keys go
    // straight to the holder, as the server's input door sends them, so they land inside the pause.
    const timesShown = () => seen.output().split('/context').length - 1
    const deadline = Date.now() + 10_000
    while (timesShown() < 2 && Date.now() < deadline) await sleep(2)
    expect(timesShown(), 'the holder never typed /context').toBeGreaterThanOrEqual(2)
    await holder(place, { op: 'write', terminal: C.terminal, data: ' person-part\r' })
    seen.close()
    await until(() => theScreen(C), (lines) => lines.some((one) => one.startsWith('ASKED ')), 15_000)
    await aMoment()
    const screen = await theScreen(C)
    expect(screen.filter((one) => one === 'LINE /context person-part')).toHaveLength(1)
    expect(screen.filter((one) => one === 'EMPTY LINE'), 'the holder pressed a second Enter').toEqual([])
    expect(screen.filter((one) => one.startsWith('ASKED '))).toEqual(['ASKED 409 terminalTypedWithoutEnterThePersonEndedTheLine'])

    const kept = await theAsksOf(C)
    expect(kept.asks).toHaveLength(1)
    expect(kept.asks[0]).toMatchObject({ input: '/context', outcome: 'typed-without-enter', run: C.run, terminal: C.terminal })
    expect(kept.nextAllowedAt).not.toBeNull()
    // THE PERSON'S LAST LINE IS STILL THE ONE THEY TYPED BEFORE THE ASK.
    const last = await ask(server.api, `/api/terminals/${C.terminal}/last-line`)
    expect(last.status, JSON.stringify(last.body)).toBe(200)
    expect(last.body).toMatchObject({ line: { text: 'ASK /context' }, why: null })

    // THE NEXT LINE THE PERSON TYPES takes every waiting line into the note: the person's two lines are kept, and the
    // mixed line is counted as typed by another, with neither part of it in the body.
    await typeAs(C, 'the persons next words', 'LINE the persons next words')
    const settled = await until(() => keeping(C), (k) => k.note !== null && k.note.lines >= 2, 10_000)
    expect(settled.note, 'nothing was kept for the terminal').not.toBeNull()
    const note = (await ask(server.api, `/api/records/${settled.note!.id}`)).body['record'] as { data: Record<string, unknown> }
    expect(String(note.data['body'])).toBe('ASK /context\nthe persons next words')
    expect(settled.note!.leftOut['typedByAnother']).toBe(1)
  }, 90_000)
})
