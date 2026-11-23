// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * ONE DEAD-LETTER SWEEP READS THE OFFICE'S ID ONCE, THE LAST LINE'S WAITING LIST ONCE IN A PROCESS, AND EVERY DEAD
 * LETTER ONCE.
 *
 * Wave 14c. The sweep runs on the server's own timer and holds the server while it runs. Three readings were made more
 * often than their answers can change within one sweep:
 *
 *   · the office's own id, read from its registry row for every letter the sweep walked, twice for a letter from an
 *     agent: once to ask whether the office wrote it, and again in `deadLettersNow`;
 *   · the waiting list the last sweep line named, read from the database by every sweep that found a letter waiting;
 *   · `deadLettersNow`, read once for the owner routes left waiting and again for the threshold.
 *
 * Now the sweep makes one test of the office's id (`theMoleOfficeTest`) and hands it to every check, keeps the waiting
 * list it last wrote in the module, and reads the dead letters once, before it writes.
 *
 * THE THRESHOLD USES THAT ONE READING, so it must give the answer a reading after the writes gave. A routed entry that
 * names a receiver makes the dead-letter reading leave out every copy of its letter, so the threshold leaves out every
 * message the sweep routes or gives to somebody (the fourth case).
 *
 * HOW THE STATEMENTS ARE COUNTED. better-sqlite3 gives every statement one prototype, so wrapping its four ways to run
 * catches the statements prepared and kept before the count began, as the office's own row statement is. A wrapped
 * `prepare` would miss those. `aFreshCount` in src/server/lib/slow-requests.ts keeps only the five slowest statements,
 * so a count of one statement cannot be read from it.
 *
 * MUTATIONS in src/server/lib/deadletters.ts, each of which must turn this file red:
 *   (a) the office's id read for each letter: `isMoleOffice` called again in `whatTheSweepDoesWithALetter` or in
 *       `deadLettersNow` (the first case counts 9 reads, not 1);
 *   (b) the waiting list read every sweep: the module's copy never kept, or cleared after each sweep (the second case
 *       counts a read in the second and third sweeps);
 *   (c) the waiting list never read from the database: the copy starts as an empty list, so the first sweep after a
 *       restart writes a line naming the same waiting letters again (the second case);
 *   (d) `deadLettersNow` read again for the threshold (the third case counts 2 reads, not 1);
 *   (e) the one reading used for the threshold with neither of its two filters: neither the messages the sweep routes or
 *       gives to somebody nor the letters the rules covered are left out. The routed letter is broadcast as a dead letter
 *       as well (the third case's second sweep). Taking out only the first filter leaves the third case green, because
 *       the retried letter is also one the rules covered; that is (f);
 *   (f) the one reading used for the threshold without leaving out the messages the sweep routes or gives to somebody
 *       (`goesToSomebody`): the copy of the routed letter for its second addressee, which no rule covers, is broadcast in
 *       the sweep that routes the letter (the fourth case).
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb | null = null
let app: FastifyInstance | null = null

beforeEach(() => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
})

afterEach(async () => {
  await app?.close()
  app = null
  t?.close()
  t = null
  vi.unstubAllEnvs()
})

const PROJECT = 'default'
const BY = { type: 'system' as const, id: 'mole-office' }
/** The statement `moleOfficeIdFromItsRow` in src/server/lib/participants.ts runs each time the office's id is read. */
const THE_OFFICE_ROW = 'SELECT id FROM agents WHERE handle = ? AND retired = 0 LIMIT 2'
/** The reading of the waiting list the last sweep line named, in `theWaitingTheLastLineNamed`. */
const THE_WAITING_LIST = /\$\.deadLetterSweep\.waiting/
/**
 * THE ONE STATEMENT ONLY `deadLettersNow` RUNS: its read of the queued messages, narrowed to the sender and the
 * routing. Every other reading of messages asks for other fields. It runs once for each piece of 500 messages, and these
 * offices hold far fewer, so it runs once for each reading of the dead letters.
 */
const THE_DEAD_LETTERS_READ = /field\.key IN \('sentBy', 'routed'\)/

/** One statement run: its SQL and its first parameter. */
interface ARun {
  sql: string
  first: unknown
}

/** Every statement run on this connection's statements while `act` runs. */
function theStatementsRunDuring(sqlite: TestDb['client']['sqlite'], act: () => void): ARun[] {
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const ran: ARun[] = []
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  for (const name of ['run', 'get', 'all', 'iterate']) {
    const original = prototype[name] as (...args: unknown[]) => unknown
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]): unknown {
      ran.push({ sql: this.source.replace(/\s+/g, ' ').trim(), first: args[0] })
      return original.apply(this, args)
    }
  }
  try {
    act()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
  return ran
}

/** An agent of the made-up office, by handle, and its registry id. */
function anAgent(db: TestDb, handle: string): string {
  db.api.createRecord({
    workspaceId: PROJECT,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: db.api.HUMAN,
  })
  return (db.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/**
 * A MADE-UP OFFICE WHERE `letters` LETTERS FROM AN AGENT WAIT, as in
 * tests/the-dead-letter-sweep-reads-each-thing-once-per-project.test.ts. The person started `made-up-root`, which started
 * `made-up-mid`, which started the retired leaves, and nothing answers as the root or the middle rung. So no owner can
 * receive a leaf's letter, and with no secretary named, every letter waits. The letters are put in as rows, the shape
 * the record door stores for a letter written while its addressee could still be reached.
 */
async function anOfficeWhereLettersWait(letters: number): Promise<TestDb> {
  t?.close()
  t = await freshDb()
  const db = t
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: db.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const sqlite = db.client.sqlite
  const startedBy = sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
  const root = anAgent(db, 'made-up-root')
  startedBy.run('person', THE_PERSON, root)
  setFixtureOwner(sqlite, null, root, 'id')
  const mid = anAgent(db, 'made-up-mid')
  startedBy.run('agent', root, mid)
  setFixtureOwner(sqlite, root, mid, 'id')
  const writer = anAgent(db, 'made-up-writer')
  const now = localStamp(new Date())
  const aRecord = sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
      "VALUES (?, 'message-centre', ?, ?, ?, 'message', 'A made-up letter', NULL, ?, NULL, 'authored')",
  )
  const aDelivery = sqlite.prepare(
    "INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)",
  )
  for (let i = 0; i < letters; i++) {
    const leaf = anAgent(db, `made-up-leaf-${i}`)
    startedBy.run('agent', mid, leaf)
    setFixtureOwner(sqlite, mid, leaf, 'id')
    sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the made-up piece of work is done' WHERE id = ?").run(leaf)
    const data = {
      body: 'A made-up letter to an agent that has since retired.',
      to: [{ kind: 'agent', id: leaf }],
      sentBy: { kind: 'agent', id: writer },
      writtenIn: { project: PROJECT },
    }
    aRecord.run(`madeUpLetter${i}`, THE_PERSON, now, now, JSON.stringify(data))
    aDelivery.run(`madeUpDelivery${i}`, `madeUpLetter${i}`, leaf, now)
  }
  return db
}

/** How many sweep lines have been written. */
function theLinesWritten(db: TestDb): number {
  return (
    db.client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep.said') IS NOT NULL")
      .get() as { n: number }
  ).n
}

/** The headers of a request to the made-up office's API, from a person or an agent. */
const headers = (kind: string, id: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': kind,
  'x-mole-office-actor-id': id,
})

/** A made-up office with its API, for the cases that send through the record door. */
async function anOfficeWithItsApi(): Promise<TestDb> {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  return t
}

/** An agent the person registers through the API, and its registry id. */
async function register(handle: string): Promise<string> {
  const reply = await app!.inject({
    method: 'POST', url: '/api/agents/started', headers: headers('human', THE_PERSON),
    payload: { handle, name: handle, runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** A made-up run of `agent` that waits for its next message, so the office can reach the agent. */
function reachable(db: TestDb, agent: string): void {
  db.api.createRecord({
    workspaceId: PROJECT, kind: 'session', title: 'A made-up owner waiting for its next message',
    data: {
      state: 'finished', runtime: 'claude-code', servingAgentId: agent,
      deliveringMessage: 'made-up-message', providerSession: `made-up-conversation-${agent}`,
      waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)),
    },
    actor: db.api.HUMAN,
  })
}

/**
 * AN AGENT NOTHING ANSWERS AS, WHOSE OWNERS NOTHING ANSWERS AS EITHER, as in
 * tests/a-message-follows-the-owners-of-an-unheld-agent.test.ts: `target` is owned by a middle rung, which is owned by
 * `top`, which holds the secretary card and has no owner. `sender` is an agent to write to it.
 */
async function anOwnerChainNobodyAnswers(db: TestDb, name: string): Promise<{ top: string; target: string; sender: string }> {
  const secretaryCard = (await import('../src/server/lib/roles.ts')).theRoleCards().elevation.onlyThisCardCanHoldIt
  const top = await register(`${name}-top`)
  const middle = await register(`${name}-middle`)
  const target = await register(`${name}-target`)
  const sender = await register(`${name}-sender`)
  db.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(secretaryCard, top)
  setFixtureOwner(db.client.sqlite, middle, target, 'id')
  setFixtureOwner(db.client.sqlite, top, middle, 'id')
  setFixtureOwner(db.client.sqlite, null, top, 'id')
  return { top, target, sender }
}

/** A letter `sender` writes to `to` through the record door. The door stores it and answers 409, because nobody can take it. */
async function aLetterNobodyCanTake(sender: string, to: string[], words: string): Promise<string> {
  const reply = await app!.inject({
    method: 'POST', url: '/api/records', headers: headers('agent', sender),
    payload: { kind: 'message', title: words, data: { to: to.map((id) => ({ kind: 'agent', id })), body: words } },
  })
  expect(reply.statusCode, reply.body).toBe(409)
  return (reply.json() as { record: { id: string } }).record.id
}

/**
 * THE SWEEP'S CLOCK, TWO DAYS AHEAD, handed to `sweepDeadLetters` as its `now`, so that a letter written just now is past
 * a threshold of one day. The count cannot be set under 1, and one letter is never more than 1, so these cases pass the
 * threshold by age. Two days and not one, so that a change of the clocks between the letter's stamp and the sweep still
 * leaves a whole day. The retry reads the owners' reach without the sweep's clock, so a top owner's wait still counts.
 */
const twoDaysAhead = (): Date => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

it("a steady sweep reads the office's id once, however many letters it walks", async () => {
  const db = await anOfficeWhereLettersWait(4)
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')

  // THE FIRST SWEEP FINDS THE LETTERS WAITING, AND SAYS SO IN A LINE.
  const first = sweepDeadLetters(BY)
  expect(first.waiting, 'every letter waits, so the sweep walked each one').toEqual({ fromThePerson: 0, fromAgents: 4 })
  expect(first.lineId, 'the first sweep names the waiting letters in a line').not.toBeNull()

  // THE SECOND FINDS THE SAME, AND HAS NOTHING NEW TO SAY.
  let second: ReturnType<typeof sweepDeadLetters> | null = null
  const ran = theStatementsRunDuring(db.client.sqlite, () => {
    second = sweepDeadLetters(BY)
  })
  expect(second!.waiting, 'the steady sweep walked every letter again').toEqual({ fromThePerson: 0, fromAgents: 4 })
  expect(second!.lineId, 'nothing new, so no line').toBeNull()
  expect(theLinesWritten(db)).toBe(1)
  expect(ran.length, 'the counter saw the sweep run statements').toBeGreaterThan(0)
  const officeReads = ran.filter((one) => one.sql === THE_OFFICE_ROW && one.first === 'mole-office')
  expect(officeReads, "the office's id is read once in the sweep, not once for each letter").toHaveLength(1)
}, 60_000)

it('reads the waiting list from the database once in a process, and once again after a restart', async () => {
  const db = await anOfficeWhereLettersWait(3)
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  const readsOfTheList = (act: () => void): number => theStatementsRunDuring(db.client.sqlite, act).filter((one) => THE_WAITING_LIST.test(one.sql)).length

  // THE FIRST SWEEP AFTER A START READS THE LIST ONCE, finds no line, and writes one.
  let first: ReturnType<typeof sweepDeadLetters> | null = null
  expect(readsOfTheList(() => { first = sweepDeadLetters(BY) }), 'the first sweep reads the list from the database').toBe(1)
  expect(first!.lineId).not.toBeNull()

  // LATER SWEEPS READ IT FROM THE MODULE, and still write no line, because nothing is new.
  for (const which of ['second', 'third']) {
    let later: ReturnType<typeof sweepDeadLetters> | null = null
    expect(readsOfTheList(() => { later = sweepDeadLetters(BY) }), `the ${which} sweep reads no list from the database`).toBe(0)
    expect(later!.waiting).toEqual({ fromThePerson: 0, fromAgents: 3 })
    expect(later!.lineId, `the ${which} sweep has nothing new to say`).toBeNull()
  }
  expect(theLinesWritten(db)).toBe(1)

  // A RESTART FORGETS WHAT THE MODULE HELD: every module is loaded again, on the same database file. The first sweep reads
  // the list from the last line again, and so knows the waiting letters were already named.
  vi.resetModules()
  const client = await import('../src/server/db/client.ts')
  try {
    const roles = await import('../src/server/lib/roles.ts')
    roles.readTheRoleCards({ guardActKeys: db.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    const again = await import('../src/server/lib/deadletters.ts')
    let afterTheRestart: ReturnType<typeof sweepDeadLetters> | null = null
    const reads = theStatementsRunDuring(client.sqlite, () => {
      afterTheRestart = again.sweepDeadLetters(BY)
    }).filter((one) => THE_WAITING_LIST.test(one.sql)).length
    expect(reads, 'the first sweep after a restart reads the list from the database').toBe(1)
    expect(afterTheRestart!.lineId, 'the waiting letters were named before the restart, so no line').toBeNull()
    expect(theLinesWritten(db)).toBe(1)
  } finally {
    client.sqlite.close()
  }
}, 60_000)

it('reads the dead letters once in a sweep that retries an owner route and checks the threshold', async () => {
  // EVERY DEAD LETTER IS PAST THE THRESHOLD, so the threshold's answer shows in each sweep's result: the days are held at
  // 1, and each sweep runs `twoDaysAhead`.
  vi.stubEnv('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', '1')
  const db = await anOfficeWithItsApi()
  const { routedOf, NO_REACHABLE_OWNER_ENDING } = await import('../src/shared/messages.ts')
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  // A LETTER TO AN AGENT NOTHING ANSWERS AS, WHOSE OWNERS NOTHING ANSWERS AS EITHER. The send door stores an owner route
  // that waits.
  const aWaitingOwnerRoute = async (name: string): Promise<{ letter: string; target: string; top: string }> => {
    const { top, target, sender } = await anOwnerChainNobodyAnswers(db, name)
    const letter = await aLetterNobodyCanTake(sender, [target], `A made-up letter for ${name}`)
    const route = routedOf(db.api.getRecord(letter)!.data)
    expect(route.map((one) => [one.to, one.said?.ending.how]), 'the send door stored an owner route that waits').toEqual([[null, NO_REACHABLE_OWNER_ENDING]])
    return { letter, target, top }
  }
  const readsOfTheDeadLetters = (act: () => void): number =>
    theStatementsRunDuring(db.client.sqlite, act).filter((one) => THE_DEAD_LETTERS_READ.test(one.sql)).length

  // ---- THE OWNERS STILL CANNOT RECEIVE IT: the route is retried and still waits, and the letter is past the threshold.
  const grey = await aWaitingOwnerRoute('made-up-grey')
  let first: ReturnType<typeof sweepDeadLetters> | null = null
  expect(readsOfTheDeadLetters(() => { first = sweepDeadLetters(BY, twoDaysAhead()) }), 'the dead letters are read once in the sweep').toBe(1)
  expect(first!.routed).toBe(0)
  expect(first!.addressees, 'the letter nobody can take is broadcast, as before').toContain(grey.target)

  // ---- THE TOP OWNER CAN RECEIVE IT NOW: the retry routes it, and a routed letter is not broadcast as well.
  const routed = await aWaitingOwnerRoute('made-up-routed')
  reachable(db, routed.top)
  let second: ReturnType<typeof sweepDeadLetters> | null = null
  expect(readsOfTheDeadLetters(() => { second = sweepDeadLetters(BY, twoDaysAhead()) }), 'the dead letters are read once in the sweep').toBe(1)
  expect(second!.routed, 'the retry routed the letter to the top owner').toBe(1)
  expect(routedOf(db.api.getRecord(routed.letter)!.data).filter((one) => one.to?.id === routed.top)).toHaveLength(1)
  expect(second!.addressees, 'a letter routed in this sweep is not broadcast in it').not.toContain(routed.target)
}, 120_000)

it('leaves out of the threshold every copy of a letter the sweep routes, not only the copy it routes', async () => {
  // A LETTER TO TWO ADDRESSEES, WHICH THE RETRY ROUTES FOR ONE. The owner route for `target` waits, as in the third case,
  // and the retry routes it once the top owner can receive it. `ownerless` has no owner, so its route waits too, and the
  // retry walks it and leaves it waiting: no rule covers that copy. Before the sweep both copies are dead letters. Once
  // the routing is written, the dead-letter reading leaves out every copy of the letter, so the threshold, which uses the
  // reading taken before the writes, must leave out the copy for `ownerless` as well.
  //
  // A LETTER TO `alone`, WHICH HAS NO OWNER EITHER, waits by itself and is broadcast in the same sweep. That shows the
  // sweep passed the threshold, so the copy for `ownerless` was left out, and was not merely under the threshold.
  vi.stubEnv('MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', '1')
  const db = await anOfficeWithItsApi()
  const { routedOf, NO_REACHABLE_OWNER_ENDING, OWNERLESS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
  const { sweepDeadLetters, deadLettersNow } = await import('../src/server/lib/deadletters.ts')
  const { top, target, sender } = await anOwnerChainNobodyAnswers(db, 'made-up-two')
  const ownerless = await register('made-up-two-ownerless')
  const alone = await register('made-up-alone')
  setFixtureOwner(db.client.sqlite, null, ownerless, 'id')
  setFixtureOwner(db.client.sqlite, null, alone, 'id')
  const letter = await aLetterNobodyCanTake(sender, [target, ownerless], 'A made-up letter for two addressees')
  const byItself = await aLetterNobodyCanTake(sender, [alone], 'A made-up letter for an addressee with no owner')
  expect(routedOf(db.api.getRecord(letter)!.data).map((one) => [one.for.id, one.to, one.said?.ending.how]), 'both routes of the letter wait')
    .toEqual([[target, null, NO_REACHABLE_OWNER_ENDING], [ownerless, null, OWNERLESS_ROUTING_ENDING]])
  const deadCopiesOf = (message: string): string[] =>
    deadLettersNow().filter((one) => one.messageId === message).map((one) => one.to.id).sort()
  expect(deadCopiesOf(letter), 'both copies of the letter are dead letters before the sweep').toEqual([target, ownerless].sort())
  expect(deadCopiesOf(byItself)).toEqual([alone])

  reachable(db, top)
  const swept = sweepDeadLetters(BY, twoDaysAhead())
  expect(routedOf(db.api.getRecord(letter)!.data).filter((one) => one.to?.id === top), 'the retry routed the letter to the top owner').toHaveLength(1)
  expect(swept.addressees, 'the letter that waits by itself is past the threshold and broadcast').toContain(alone)
  expect(swept.addressees, 'the copy no rule covers is left out with the copy the sweep routes').not.toContain(ownerless)
  expect(swept.addressees).not.toContain(target)
}, 120_000)
