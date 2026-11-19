// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE DEAD-LETTER SWEEP READS NO ENDED RUN THAT HOLDS NO MESSAGE TO HAND OVER WHOLE.
 *
 * Round 160 of wave 13y. The sweep runs on the server's own timer every five minutes and never yields, so the server
 * answers nobody while it runs. On a made-up office at the live counts of 11 November 2026 (21,970 runs, about 57 KB of
 * data each), the first sweep held the server for 17.2 to 19.4 seconds, and each sweep after it for 12.8 to 13.7. The
 * reach of each rung a letter walks past was worked out from every run record of the project, read whole
 * (`everyRunRow`), and those rows were kept to the end of the sweep. Of one sweep of 13.7 seconds, 3.9 went to that read
 * and 6.9 to the garbage collector.
 *
 * A reach reads only the runs that say `running` and the runs that hold a message to hand over. src/server/lib/worker.ts
 * says why those rows give the same answer as every run row, above `theRunRowsOfOneReach`. An ended run that holds no
 * message is neither, so the sweep now reads only those rows, of every agent at once, once per project
 * (`theRunRowsAnyReachReads`). An ended run that still holds a message is read whole, because the conversation it holds
 * is picked up again from it. On the same office the first sweep then held the server for 8.0 seconds and the next for
 * 3.4, and both gave the same answers as before, byte for byte.
 *
 * WHAT IS HELD HERE. A made-up office with a letter to a retired agent, whose walk passes two rungs nothing answers as,
 * one run of another agent waiting for its next message, one ended run that still holds a message, one run whose wait a
 * said goodbye line has ended, and ENDED_RUNS ended runs of the two rungs. Every statement the database runs is
 * watched from the moment it is opened, with what it gave back. Each run's data carries a mark of its own, and only a
 * read of the run's data whole gives the mark back.
 *   1. Over two sweeps each letter finds no owner that can receive it and waits. The sweeps read the waiting run whole,
 *      so the watcher sees the reach of the rungs worked out. They read no ended run that holds no message whole: at
 *      most THE_ENDED_RUNS_A_SWEEP_MAY_READ_WHOLE. On the code before the change this fails: they read all ENDED_RUNS.
 *   2. A read of every run row (`everyRunRow`) gives every ended run's mark, so the watcher sees such a read.
 *   3. Each agent's reach read from the rows any reach reads is its reach read from every run row. Among them is the
 *      agent of the waiting run, which is not retired: the reach of a retired agent is answered from the registry
 *      before any run is read, and only the reach of an agent that is not retired reads the waiting runs
 *      (`theAnsweringReading`). That agent is answering through its waiting run, so the narrower rows must hold it. The
 *      agent of the ended run that holds a message is answered as nobody, and the agent whose wait a goodbye line has
 *      ended is answered as nobody rather than as the waiting run's null. The rows any reach reads are looked up by
 *      name in src/server/lib/worker.ts, so this file runs on the code before the change, and fails there with a
 *      sentence saying they are missing.
 *   4. An ended run that still holds a message is read whole: over two sweeps its mark is among what the statements
 *      gave back.
 *
 * Every agent, run and letter here is made up.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

/**
 * THE ENDED RUNS ONE SWEEP MAY READ WHOLE: none, among the ended runs that hold no message to hand over. An ended run
 * that holds no message neither runs nor holds a message, so it cannot change the reach of any agent, and every run the
 * office has kept is one more to read and free on every sweep. An ended run that still holds a message is read whole,
 * because the conversation it holds is picked up again from it.
 */
export const THE_ENDED_RUNS_A_SWEEP_MAY_READ_WHOLE = 0

const PROJECT = 'default'
const ENDED_RUNS = 40
// ONE INSTANT FOR THE WHOLE FILE, so every stamp below and the office's own clock read the same moment.
const THE_MOMENT = new Date(2026, 10, 12, 9, 0, 0)
const THE_WAITING_MARK = 'the mark of the made-up run waiting for its next message'
const THE_KEEPER_MARK = 'the mark of the made-up ended run that holds a message'
const anEndedMark = (n: number): string => `the mark of made-up ended run ${n}`

let t: TestDb
let watcher: ReturnType<typeof watchTheStatements>
/** The made-up agents by handle, with their registry ids. */
const agents = new Map<string, string>()

/**
 * EVERY STATEMENT THE DATABASE RUNS, with what it gave back, while `during` runs its act. Statements kept from before the
 * act (`listParticipants` keeps its own) are seen too: each statement is wrapped as it is prepared, from the moment the
 * database is opened, as in tests/the-dead-letter-sweep-reads-each-thing-once-per-project.test.ts.
 */
function watchTheStatements(db: TestDb): { during: (act: () => void) => { sql: string; gave: string }[] } {
  const sqlite = db.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare.bind(sqlite)
  let ran: { sql: string; gave: string }[] | null = null
  const note = (sql: string, gave: unknown): void => {
    ran?.push({ sql, gave: JSON.stringify(gave, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? '' })
  }
  sqlite.prepare = (sql: string): unknown => {
    const statement = original(sql) as object
    const wrapped: unknown = new Proxy(statement, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown
        if (typeof value !== 'function') return value
        const call = (...args: unknown[]): unknown => (value as (...a: unknown[]) => unknown).apply(target, args)
        if (prop === 'all' || prop === 'get') {
          return (...args: unknown[]) => {
            const gave = call(...args)
            note(sql, gave)
            return gave
          }
        }
        if (prop === 'iterate') {
          return function* (...args: unknown[]) {
            for (const row of call(...args) as Iterable<unknown>) {
              note(sql, row)
              yield row
            }
          }
        }
        // THESE GIVE BACK THE STATEMENT ITSELF, and the wrapped one must come back so what it gives is seen.
        if (prop === 'raw' || prop === 'pluck' || prop === 'expand' || prop === 'bind' || prop === 'safeIntegers') {
          return (...args: unknown[]) => {
            call(...args)
            return wrapped
          }
        }
        return call
      },
    })
    return wrapped
  }
  return {
    during(act) {
      ran = []
      try {
        act()
        return ran
      } finally {
        ran = null
      }
    },
  }
}

/** The marks of the ended runs that some statement gave back. */
function theEndedRunsReadWhole(ran: { gave: string }[]): number[] {
  return Array.from({ length: ENDED_RUNS }, (_, n) => n).filter((n) => ran.some((one) => one.gave.includes(anEndedMark(n))))
}

/** An agent of the made-up office, by handle, and its registry id. */
function anAgent(handle: string): string {
  t.api.createRecord({ workspaceId: PROJECT, kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' }, actor: t.api.HUMAN })
  const id = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  agents.set(handle, id)
  return id
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  // THE WHOLE FILE'S CLOCK, fixed after the database is opened, so every stamp below is the one the office reads.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(THE_MOMENT)
  watcher = watchTheStatements(t)
  // WHAT THE SERVER READS AS IT STARTS, and the session records below need.
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const sqlite = t.client.sqlite
  // THE CHAIN: the person started the root; the root owns the middle rung, and the middle rung owns the retired leaf.
  const root = anAgent('made-up-root')
  const middle = anAgent('made-up-mid')
  const leaf = anAgent('made-up-leaf')
  const writer = anAgent('made-up-writer')
  const bystander = anAgent('made-up-bystander')
  // OUTSIDE THE CHAIN: an agent with an ended run that holds a message, and an agent whose waiting run a line has ended.
  const keeper = anAgent('made-up-keeper')
  const saidGoodbye = anAgent('made-up-said-goodbye')
  const startedBy = sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
  startedBy.run('person', THE_PERSON, root)
  startedBy.run('agent', root, middle)
  startedBy.run('agent', middle, leaf)
  const owner = { run: (ownerId: string, _again: string, agentId: string) => setFixtureOwner(sqlite, ownerId, agentId) }
  owner.run(root, root, middle)
  owner.run(middle, middle, leaf)
  sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the made-up piece of work is done' WHERE id = ?").run(leaf)
  const anHourAhead = localStamp(new Date(THE_MOMENT.getTime() + 60 * 60 * 1000))

  // ONE RUN OF ANOTHER AGENT IS WAITING FOR ITS NEXT MESSAGE, inside its wait, so a reach reads the runs that hold one.
  t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'A made-up run waiting for its next message',
    data: {
      state: 'idle',
      runtime: 'claude-code',
      servingAgentId: bystander,
      servingAgent: 'made-up-bystander',
      deliveringMessage: 'made-up-message',
      providerSession: 'made-up-conversation',
      waitsUntil: anHourAhead,
      doing: THE_WAITING_MARK,
    },
    actor: t.api.HUMAN,
  })

  // ONE ENDED RUN STILL HOLDS A MESSAGE TO HAND OVER, so a reach reads it whole: the conversation it holds is picked up
  // again from it. Its state is paused, because the record door refuses a finished run that declares no submission and
  // its agent has no work area; a paused run is ended all the same.
  t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'A made-up ended run that holds a message',
    data: {
      state: 'paused',
      runtime: 'claude-code',
      servingAgentId: keeper,
      servingAgent: 'made-up-keeper',
      deliveringMessage: 'made-up-message',
      providerSession: 'made-up-conversation',
      doing: THE_KEEPER_MARK,
    },
    actor: t.api.HUMAN,
  })

  // THE ENDED RUNS OF THE TWO RUNGS, which stopped two hours ago. A run ends finished, crashed, paused or orphaned; a
  // finished run is written with what it submits, and none of the four is running or holds a message to hand over.
  const twoHoursAgo = localStamp(new Date(THE_MOMENT.getTime() - 2 * 60 * 60 * 1000))
  for (let n = 0; n < ENDED_RUNS; n++) {
    t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'session',
      title: `A made-up ended run ${n}`,
      data: {
        state: 'crashed',
        runtime: 'claude-code',
        servingAgentId: n % 2 === 0 ? root : middle,
        servingAgent: n % 2 === 0 ? 'made-up-root' : 'made-up-mid',
        lastOutputAt: twoHoursAgo,
        doing: anEndedMark(n),
      },
      actor: t.api.HUMAN,
    })
  }

  // ONE RUN WAITING FOR ITS NEXT MESSAGE AND A LINE ALREADY SAID ABOUT IT, so the wait is over before it runs out.
  const saidGoodbyeRun = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'A made-up run whose wait a line has ended',
    data: {
      state: 'idle',
      runtime: 'claude-code',
      servingAgentId: saidGoodbye,
      servingAgent: 'made-up-said-goodbye',
      deliveringMessage: 'made-up-message',
      providerSession: 'made-up-conversation',
      waitsUntil: anHourAhead,
    },
    actor: t.api.HUMAN,
  }).id
  t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'message',
    title: 'A made-up goodbye line',
    data: {
      body: SYSTEM_LINES.aRunWaitedAndEnded(0).line,
      aboutRun: saidGoodbyeRun,
      to: [{ kind: 'agent', id: saidGoodbye }],
    },
    actor: t.api.HUMAN,
  })

}, 60_000)

/** File a fresh letter for each measured sweep; the ordinary send door would already route it. */
let letterNumber = 0
function aLetterForTheSweep(): string {
  letterNumber += 1
  const id = `made-up-letter-${String(letterNumber)}`
  const now = localStamp(THE_MOMENT)
  const leaf = agents.get('made-up-leaf')!
  const data = {
    body: 'A made-up letter to an agent that has since retired.',
    to: [{ kind: 'agent', id: leaf }],
    sentBy: { kind: 'agent', id: agents.get('made-up-writer')! },
    writtenIn: { project: PROJECT },
  }
  t.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
      "VALUES (?, 'message-centre', ?, ?, ?, 'message', 'A made-up letter', NULL, ?, NULL, 'authored')",
  ).run(id, THE_PERSON, now, now, JSON.stringify(data))
  t.client.sqlite.prepare(
    "INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)",
  ).run(`delivery-${id}`, id, leaf, now)
  return id
}

afterAll(() => {
  vi.useRealTimers()
  t?.close()
  vi.unstubAllEnvs()
})

it('1. reads the waiting run whole and no ended run that holds no message, on the first sweep and the one after it', async () => {
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  const by = { type: 'system' as const, id: 'mole-office' }
  let first: ReturnType<typeof sweepDeadLetters> | null = null
  let next: ReturnType<typeof sweepDeadLetters> | null = null
  const letters: string[] = []
  const ran = watcher.during(() => {
    letters.push(aLetterForTheSweep())
    first = sweepDeadLetters(by)
    letters.push(aLetterForTheSweep())
    next = sweepDeadLetters(by, new Date(THE_MOMENT.getTime() + 10 * 60 * 1000))
  })

  // EACH LETTER WAITS: no owner up the chain can receive it, so no route is written and nothing goes to the person.
  expect(first!.waiting).toEqual({ fromThePerson: 0, fromAgents: 1 })
  expect(next!.waiting).toEqual({ fromThePerson: 0, fromAgents: 2 })
  for (const id of letters) {
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const stored = JSON.parse(row.data) as { routed?: unknown }
    expect(stored.routed).toBeUndefined()
    const delivered = t.client.sqlite.prepare("SELECT COUNT(*) AS count FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'").get(id) as { count: number }
    expect(delivered.count).toBe(0)
  }
  expect(ran.some((one) => one.gave.includes(THE_WAITING_MARK)), 'the sweeps read the waiting run whole, for the reach of the rungs').toBe(true)
  expect(theEndedRunsReadWhole(ran).length, 'the ended runs that hold no message that the two sweeps read whole').toBeLessThanOrEqual(THE_ENDED_RUNS_A_SWEEP_MAY_READ_WHOLE)
}, 60_000)

it('2. sees a read of every run row read every ended run whole', async () => {
  const worker = await import('../src/server/lib/worker.ts')
  const ran = watcher.during(() => worker.everyRunRow(PROJECT))
  expect(theEndedRunsReadWhole(ran)).toHaveLength(ENDED_RUNS)
})

it('3. gives each agent the reach from the rows any reach reads that it has from every run row', async () => {
  const worker = await import('../src/server/lib/worker.ts')
  const superiors = await import('../src/server/lib/superiors.ts')
  const narrower = (worker as unknown as Record<string, unknown>)['theRunRowsAnyReachReads']
  if (typeof narrower !== 'function') throw new Error('src/server/lib/worker.ts has no theRunRowsAnyReachReads, the run rows any reach reads.')
  const fromTheNarrower = superiors.theReadingsForOneSend(PROJECT, narrower as typeof worker.everyRunRow)
  const fromEveryRun = superiors.theReadingsForOneSend(PROJECT)
  const reaches = new Map<string, ReturnType<typeof fromEveryRun.reachOf>>()
  const ran = watcher.during(() => {
    for (const [handle, id] of agents) reaches.set(handle, fromTheNarrower.reachOf(id))
  })
  for (const [handle, id] of agents) expect(reaches.get(handle), handle).toEqual(fromEveryRun.reachOf(id))

  // THE NARROWER READING READ THE WAITING RUNS: it read the waiting run whole, and the goodbye line, which only the
  // reading of the waiting runs (`runsWaitingAmong`) reads.
  expect(ran.some((one) => one.gave.includes(THE_WAITING_MARK)), 'the narrower rows hold the waiting run').toBe(true)
  expect(reaches.get('made-up-said-goodbye'), 'the said-goodbye agent is not answering through the run its line ended').not.toBeNull()
  // NOT EMPTY ANSWERS ON BOTH SIDES. The agent of the waiting run is answering through it, so its reach is null; the
  // rungs and the writer, whose waiting runs are none, are answered as nobody; the leaf is retired; and the keeper and
  // the said-goodbye agent hold runs that are not waiting, so they are answered as nobody too.
  expect(Object.fromEntries([...reaches].map(([handle, reach]) => [handle, reach === null ? null : reach.was]))).toEqual({
    'made-up-root': 'nothing answering',
    'made-up-mid': 'nothing answering',
    'made-up-leaf': 'retired',
    'made-up-writer': 'nothing answering',
    'made-up-bystander': null,
    'made-up-keeper': 'nothing answering',
    'made-up-said-goodbye': 'nothing answering',
  })
})

it('4. reads an ended run that still holds a message whole, on the first sweep and the one after it', async () => {
  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  const by = { type: 'system' as const, id: 'mole-office' }
  const ran = watcher.during(() => {
    aLetterForTheSweep()
    sweepDeadLetters(by)
    aLetterForTheSweep()
    sweepDeadLetters(by, new Date(THE_MOMENT.getTime() + 10 * 60 * 1000))
  })
  expect(ran.some((one) => one.gave.includes(THE_KEEPER_MARK)), 'the sweeps read the ended run that holds a message whole').toBe(true)
})
