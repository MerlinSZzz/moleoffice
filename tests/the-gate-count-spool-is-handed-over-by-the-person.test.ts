// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every spool, line, world, agent and reason here is made up in a test folder; nothing reads the machine's own spool. */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { GATES } from '../src/config/gates.mjs'
import { GATE_COUNT_SPOOL, aGateCountLine } from '../src/config/gate-count-spool.mjs'

// THE PERSON HANDS THE GATE-COUNT SPOOL TO ANOTHER WORLD WITH A PRESS (wave 13r round W, item 12). An office whose
// world does not own the spool counts nothing from it. The press, in that office, removes the spool's .world so the
// office claims the spool at once. Only the person presses it, proved as the person; no grant and no raise does. It
// removes .world only when this office reads the spool, another world owns it now, .world still names the world the
// person saw, and the person gave a reason, and otherwise it refuses with a code of its own and changes nothing. It
// writes its line in the rejects file before the removal, and a removal that fails adds a second line. A day file this
// office has a row for continues from that row, and the answer and the line say in one sentence that those lines may be
// counted again; a day file it has no row for starts at the end of its last whole line at the press.
//
// No refusal's words are copied here: each refusal is told by its status and its code.
//
// MUTATIONS, each after a control run, each run alone and restored, each turning red the cases it names:
//   1. the door lets every caller press (case 1);
//   2. the reading tells every caller it may press (case 1);
//   3. a scratch office keeps its reader, so the press works there (case 2);
//   4. the press leaves out the check of the world the person saw (case 2);
//   5. the door takes a reason that is only spaces (case 2);
//   6. the rejects line is written after the removal, not before it (case 4);
//   7. a removal that fails adds no second line (case 4);
//   8. a day file with no row starts at byte 0 (cases 3 and 5);
//   9. a day file with no row starts at its length, inside a line still being written (case 3);
//  10. a day file with a row starts at the press as well (case 5);
//  11. the answer and the line leave out the sentence about rows read before (case 5);
//  12. the press does not start the reading again (cases 3 and 5).
//
// The gates reading carries the spool's block only while another world owns the spool: cases 1, 2 and 3 read it.

// The press's removal is made to fail by one case, through this switch, and goes through to the real removal otherwise.
// `vi.hoisted` puts the switch where the mock's factory can read it.
const failTheRemoval = vi.hoisted(() => ({on: false}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    unlinkSync: (path: Parameters<typeof actual.unlinkSync>[0]) => {
      if (failTheRemoval.on) throw Object.assign(new Error('EPERM: this removal was made to fail by the test'), {code: 'EPERM'})
      return actual.unlinkSync(path)
    },
  }
})
type Reader = typeof import('../src/server/lib/gate-count-spool.ts')
type World = typeof import('../src/server/lib/world.ts')
type List = typeof import('../src/server/lib/what-the-grant-carries.ts')
let t: TestDb, app: Awaited<ReturnType<typeof apiApp>>, reader: Reader, world: World, list: List, spool: string, logged: string[]
let asPerson: Record<string, string> = {}

const WORKSPACE = 'default'
const THE_DOOR = '/api/office/gate-count-spool/hand-over'
const THE_PRESS = 'office.hand-over-gate-count-spool'
const ANOTHER_WORLD = 'a-made-up-world'
const A_THIRD_WORLD = 'a-third-made-up-world'
const BECAUSE = 'Made-up reason: this made-up office counts the spool from now on.'
const WORKER = 'made-up-spool-worker'
const SECRETARY = 'made-up-spool-secretary'
// Long enough that no timer the reader starts fires while a case runs.
const AN_HOUR = 3_600_000
// The row is read from the list, so no gate's id or position is written here a second time.
const SPOOL_ROW = GATES.find(row => row.countedBy === 'the-sandbox-spool')!
const ITS_POSITION = SPOOL_ROW.positions.kind === 'block-remind-off' ? SPOOL_ROW.positions.allowed[0]! : ''
const DAY = '2026-10-20'
const ANOTHER_DAY = '2026-10-21'
const A_LINE = {gate: SPOOL_ROW.id, position: ITS_POSITION, at: `${DAY} 09:15:00`, sandbox: 'made-up-sandbox'}
const aLineAt = (at: string) => aGateCountLine({...A_LINE, at})

beforeEach(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  reader = await import('../src/server/lib/gate-count-spool.ts')
  world = await import('../src/server/lib/world.ts')
  list = await import('../src/server/lib/what-the-grant-carries.ts')
  spool = join(aTestDatabaseFolder('spool-press'), GATE_COUNT_SPOOL.folder)
  mkdirSync(spool, {mode: 0o700})
  chmodSync(spool, 0o700)
  logged = []
  asPerson = {'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader()}
}, 60_000)
afterEach(async () => { failTheRemoval.on = false; await app?.app.close(); t?.close() })

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: Record<string, unknown>): Promise<{status: number; said: string; body: Record<string, any>}> {
  const reply = await app.app.inject({method, url, headers: payload === undefined ? headers : {'content-type': 'application/json', ...headers}, ...(payload === undefined ? {} : {payload})})
  let body: Record<string, any> = {}
  try { body = reply.json() as Record<string, any> } catch { body = {} }
  return {status: reply.statusCode, said: String(body['error'] ?? reply.body), body}
}
function press(headers: Record<string, string>, body: Record<string, unknown> = {saw: ANOTHER_WORLD, because: BECAUSE}) {
  return ask('POST', THE_DOOR, headers, body)
}
async function theSpoolInTheReading(headers: Record<string, string>): Promise<unknown> {
  const read = await ask('GET', '/api/office/gates', headers)
  expect(read.status, read.said).toBe(200)
  expect(read.body, 'the gates reading has no spool field').toHaveProperty('spool')
  return read.body['spool']
}
/** An agent the person starts, with its own key. */
async function anAgentWithItsOwnKey(handle: string, role: string): Promise<Record<string, string>> {
  const made = await ask('POST', '/api/agents/started', asPerson, {handle, name: `Made-up ${role}`, role})
  expect(made.status, made.said).toBe(201)
  return {'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': String(made.body['whatToGiveIt']?.key ?? '')}
}
function refusedWith(reply: {status: number; said: string; body: Record<string, any>}, status: number, code: string) {
  expect({status: reply.status, code: reply.body['code']}, reply.said).toEqual({status, code})
}
/** This office's world, which the test database has: a null here would leave nothing to hand the spool to. */
function thisWorld(): string {
  const here = world.theWorldThisDatabaseIs()
  expect(here, 'the test database has no identity').not.toBeNull()
  return here!
}
function startTheReader(standing: 'canonical' | 'scratch' = 'canonical') {
  return reader.startReadingTheGateCountSpool(standing, line => logged.push(line), spool, AN_HOUR)
}
function append(text: string, day = DAY) { appendFileSync(join(spool, `${day}.jsonl`), text, {mode: GATE_COUNT_SPOOL.fileMode}) }
function theWorldFile() { return join(spool, GATE_COUNT_SPOOL.world) }
function theRejectsFile() { return join(spool, GATE_COUNT_SPOOL.rejects) }
function ownedBy(name: string) {
  rmSync(theWorldFile(), {force: true})
  writeFileSync(theWorldFile(), `${name}\n`, {mode: GATE_COUNT_SPOOL.fileMode})
}
function whatTheWorldFileHolds(): string | null { return existsSync(theWorldFile()) ? readFileSync(theWorldFile(), 'utf8') : null }
function theRejectsLines(): Record<string, unknown>[] {
  return readFileSync(theRejectsFile(), 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)
}
function theRowsRead(): {file: string; bytes: number}[] {
  return t.client.sqlite.prepare('SELECT file, bytes FROM gate_count_spool_reads ORDER BY file').all() as {file: string; bytes: number}[]
}
/** Every line counted from the spool, on every day, read past every door. */
function linesCounted(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS n FROM gate_counts').get() as {n: number}).n
}
/** Nothing the press could change has changed: .world holds what it held, no line went into the rejects file, and no row was stored. */
function nothingChanged(held: string | null) {
  expect(whatTheWorldFileHolds()).toBe(held)
  expect(existsSync(theRejectsFile()), 'the press wrote in the rejects file').toBe(false)
  expect(theRowsRead()).toEqual([])
  expect(linesCounted()).toBe(0)
}

// Case 1.
it('refuses agents with their own keys, a secretary, and a secretary the person raised where this office lets the grant press the door, and changes nothing', async () => {
  ownedBy(ANOTHER_WORLD)
  append(aLineAt(`${DAY} 09:15:00`))
  expect(startTheReader().watch).toBeNull()
  const worker = await anAgentWithItsOwnKey(WORKER, 'worker')
  const secretary = await anAgentWithItsOwnKey(SECRETARY, 'secretary')
  for (const headers of [worker, secretary]) refusedWith(await press(headers), 403, 'gateCountSpoolOnlyThePerson')
  const raised = await ask('POST', `/api/roles/elevation/${SECRETARY}`, asPerson, {reason: 'A test raises it.', endsWhen: 'when you say'})
  expect(raised.status, raised.said).toBe(201)
  list.setThisOfficesAnswer(THE_PRESS, 'may-press', {type: 'human', id: THE_PERSON} as never)
  refusedWith(await press(secretary, {saw: ANOTHER_WORLD, because: BECAUSE, ...FOR_THE_PERSON}), 403, 'gateCountSpoolOnlyThePerson')
  nothingChanged(`${ANOTHER_WORLD}\n`)
  // The reading tells the page the same: the person may press, the raised secretary may not.
  expect(await theSpoolInTheReading(secretary)).toMatchObject({itsWorld: ANOTHER_WORLD, mayPress: false})
  expect(await theSpoolInTheReading(asPerson)).toMatchObject({itsWorld: ANOTHER_WORLD, mayPress: true})
}, 60_000)

// Case 2.
it('refuses each condition with its own status and code, and changes nothing', async () => {
  const here = thisWorld()
  ownedBy(ANOTHER_WORLD)
  // This office does not read the spool: no reader was started, or a scratch office's was.
  refusedWith(await press(asPerson), 409, 'gateCountSpoolNotRead')
  expect(startTheReader('scratch').watch).toBeNull()
  refusedWith(await press(asPerson), 409, 'gateCountSpoolNotRead')
  expect(await theSpoolInTheReading(asPerson)).toBeNull()
  nothingChanged(`${ANOTHER_WORLD}\n`)
  startTheReader()
  // A body of another shape, and a reason that is only spaces.
  refusedWith(await press(asPerson, {saw: ANOTHER_WORLD, because: BECAUSE, more: 'made-up'}), 400, 'gateCountSpoolBadBody')
  refusedWith(await press(asPerson, {because: BECAUSE}), 400, 'gateCountSpoolBadBody')
  refusedWith(await press(asPerson, {saw: ANOTHER_WORLD, because: '   '}), 400, 'gateCountSpoolNoReason')
  // The page showed one world and another owns the spool now.
  const notSeen = await press(asPerson, {saw: A_THIRD_WORLD, because: BECAUSE})
  refusedWith(notSeen, 409, 'gateCountSpoolNotWhatYouSaw')
  expect(notSeen.body['values']).toEqual({saw: A_THIRD_WORLD, now: ANOTHER_WORLD})
  nothingChanged(`${ANOTHER_WORLD}\n`)
  // No other world owns it: this office's world does, a .world it cannot trust is there, or none is.
  ownedBy(here)
  const ours = await press(asPerson)
  refusedWith(ours, 409, 'gateCountSpoolNotAnotherWorlds')
  expect(ours.body['values']?.reason).toContain(here)
  nothingChanged(`${here}\n`)
  ownedBy(ANOTHER_WORLD)
  chmodSync(theWorldFile(), 0o644)
  const untrusted = await press(asPerson)
  refusedWith(untrusted, 409, 'gateCountSpoolNotAnotherWorlds')
  expect(untrusted.body['values']?.reason).toContain('0644')
  nothingChanged(`${ANOTHER_WORLD}\n`)
  rmSync(theWorldFile())
  refusedWith(await press(asPerson), 409, 'gateCountSpoolNotAnotherWorlds')
  nothingChanged(null)
}, 60_000)

// Case 3.
it('writes its line in the rejects file, removes .world, starts a fresh database at the end of each day file\'s last whole line, and reads the spool again at once', async () => {
  const here = thisWorld()
  ownedBy(ANOTHER_WORLD)
  // Two whole lines and the start of a third, which the other world's writer is still writing, and a second day file.
  const whole = aLineAt(`${DAY} 09:15:00`) + aLineAt(`${DAY} 09:16:00`)
  const third = aLineAt(`${DAY} 09:17:00`)
  append(whole + third.slice(0, 12))
  const onAnotherDay = aLineAt(`${ANOTHER_DAY} 08:00:00`)
  append(onAnotherDay, ANOTHER_DAY)
  expect(startTheReader().watch).toBeNull()
  expect(await theSpoolInTheReading(asPerson)).toEqual({folder: spool, itsWorld: ANOTHER_WORLD, thisWorld: here, mayPress: true})
  const pressed = await press(asPerson)
  expect(pressed.status, pressed.said).toBe(200)
  const countingFrom = [
    {file: `${DAY}.jsonl`, way: 'starts at the press', byte: Buffer.byteLength(whole)},
    {file: `${ANOTHER_DAY}.jsonl`, way: 'starts at the press', byte: Buffer.byteLength(onAnotherDay)},
  ]
  // The reply hook adds `narrowedByPermission` to every reply; the rest is the press's own answer.
  const {narrowedByPermission: _, ...theAnswer} = pressed.body
  expect(theAnswer).toEqual({removed: theWorldFile(), itNamed: ANOTHER_WORLD, givenTo: here, countingFrom, readBefore: null, readsItNow: true, said: expect.any(Array)})
  expect(theRejectsLines()).toEqual([{
    removing: GATE_COUNT_SPOOL.world, itNamed: ANOTHER_WORLD, givenTo: here, pressedBy: THE_PERSON,
    provedBy: expect.objectContaining({key: 'the-person-key'}), because: BECAUSE, countingFrom, readBefore: null, at: expect.any(String),
  }])
  // The reader started again in this process, claimed the spool for this office's world, and said so in the log.
  expect(whatTheWorldFileHolds()).toBe(`${here}\n`)
  expect(logged.filter(line => line.includes(here)), logged.join('\n')).not.toEqual([])
  expect(logged.at(-1), logged.join('\n')).toContain(spool)
  expect(theRowsRead()).toEqual(countingFrom.map(({file, byte}) => ({file, bytes: byte})))
  expect(linesCounted()).toBe(0)
  expect(await theSpoolInTheReading(asPerson)).toBeNull()
  // The line that was being written is counted whole once it ends, and nothing written before the press is counted.
  append(third.slice(12) + aLineAt(`${DAY} 09:18:00`))
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 2, rejected: 0, refused: null})
  expect(linesCounted()).toBe(2)
}, 60_000)

// Case 4.
it('adds a second line and leaves .world when the removal fails, under the line written before it', async () => {
  ownedBy(ANOTHER_WORLD)
  append(aLineAt(`${DAY} 09:15:00`))
  startTheReader()
  failTheRemoval.on = true
  const failed = await press(asPerson)
  failTheRemoval.on = false
  refusedWith(failed, 500, 'gateCountSpoolNotRemoved')
  expect(whatTheWorldFileHolds()).toBe(`${ANOTHER_WORLD}\n`)
  const written = theRejectsLines()
  expect(written).toHaveLength(2)
  expect(written[0]).toMatchObject({removing: GATE_COUNT_SPOOL.world, itNamed: ANOTHER_WORLD, because: BECAUSE})
  expect(written[1]).toEqual({notRemoved: GATE_COUNT_SPOOL.world, why: expect.stringContaining('this removal was made to fail by the test'), at: expect.any(String)})
  expect(theRowsRead()).toEqual([])
  expect(await theSpoolInTheReading(asPerson)).toMatchObject({itsWorld: ANOTHER_WORLD})
}, 60_000)

// Case 5.
it('continues a day file from this office\'s own row, and its answer and its line say in one sentence that those lines may be counted again', async () => {
  const here = thisWorld()
  // This office owned the spool first and counted one line.
  append(aLineAt(`${DAY} 09:15:00`))
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 1, refused: null})
  const [itsRow] = theRowsRead()
  expect(itsRow).toBeDefined()
  // Another world's office took the spool and counted two more lines, in its own database.
  ownedBy(ANOTHER_WORLD)
  append(aLineAt(`${DAY} 09:16:00`) + aLineAt(`${DAY} 09:17:00`))
  const onAnotherDay = aLineAt(`${ANOTHER_DAY} 08:00:00`)
  append(onAnotherDay, ANOTHER_DAY)
  startTheReader()
  const pressed = await press(asPerson)
  expect(pressed.status, pressed.said).toBe(200)
  const countingFrom = [
    {file: `${DAY}.jsonl`, way: 'continues from this office\'s row', byte: itsRow!.bytes},
    {file: `${ANOTHER_DAY}.jsonl`, way: 'starts at the press', byte: Buffer.byteLength(onAnotherDay)},
  ]
  expect(pressed.body).toMatchObject({givenTo: here, countingFrom, readsItNow: true})
  expect(pressed.body['readBefore']).toBe(reader.A_ROW_READ_BEFORE_THE_PRESS)
  expect(theRejectsLines()).toEqual([expect.objectContaining({countingFrom, readBefore: reader.A_ROW_READ_BEFORE_THE_PRESS})])
  // As that sentence says: the two lines the other world counted are counted here again.
  expect(linesCounted()).toBe(3)
}, 60_000)
