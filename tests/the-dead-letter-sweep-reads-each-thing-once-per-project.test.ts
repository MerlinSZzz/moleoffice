// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE DEAD-LETTER SWEEP READS THE REGISTRY AND A PROJECT'S WAITING RUNS ONCE, HOWEVER MANY LETTERS IT WALKS.
 *
 * Wave 13u round 22. The sweep runs on the server's own timer and never yields, so the server answers
 * nobody while it runs. On a made-up office at the live counts it held the server for 41 to 49 seconds,
 * and for 312 seconds when most runs were the message worker's. Two readings were made again for every
 * letter from an agent, and neither depends on the letter:
 *
 *   · every agent in the registry, read and built again by the walk up the chain of starters;
 *   · the runs of the project waiting for the next message, read again for the reach of every rung,
 *     and with them every goodbye line in the message centre.
 *
 * `theReadingsForOneSend` in src/server/lib/superiors.ts reads each once per project, when a walk first
 * needs it, and the reach of each rung once. The sweep keeps one set of readings per project for its whole
 * run. After the change the same made-up offices held the server for 1.1 to 1.6 seconds.
 *
 * WHAT IS MEASURED. Pairs of offices that differ only in how many letters an agent wrote to retired
 * agents: 2 and 8. Every letter walks two rungs that nothing answers as, and one run of another agent in
 * the project is waiting, so the goodbye lines are read. The statements the database runs during one
 * sweep are counted, and each count is at least one, so the counter is seen to count it.
 *
 *   · When every walk passes the same two rungs, the registry and the live holds are read as often for
 *     8 letters as for 2. A rung's reach reads its hold, so the second count is the reach of the rungs.
 *   · When every walk passes a rung of its own, the goodbye lines are read as often for 8 letters as for
 *     2. Without the shared waiting runs, each new rung would read them again.
 *
 * MUTATIONS in `theReadingsForOneSend`, each of which turned this file red:
 *   (a) `agents: () => listParticipants().agents`, reading the registry on every walk: 13 registry reads
 *       for 8 letters against 7 for 2;
 *   (b) `whyThisAgentCannotBeReached(agentId, workspaceId, rows)`, with no waiting reader, so each rung
 *       works the waiting runs out again: 9 goodbye reads against 3;
 *   (c) delete `if (held !== undefined) return held`, so a rung's reach is read again for every walk:
 *       16 hold reads against 4.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb | null = null

beforeEach(() => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
})

afterEach(() => {
  t?.close()
  t = null
  vi.unstubAllEnvs()
})

const PROJECT = 'default'
const THE_REGISTRY = /^SELECT \* FROM agents ORDER BY handle, rowid$/
const THE_GOODBYE_LINES = /LIKE '%"aboutRun"%'/
// THE LIVE HOLD ON ONE AGENT'S HANDLE, which the reach of every rung reads.
const THE_HOLDS = /from "handle_holds"/i

/**
 * EVERY STATEMENT THE DATABASE RUNS, counted while `counting` is true. The registry's statements are
 * prepared once and kept (`listParticipants`), so a count of prepares would miss them. Each statement is
 * wrapped as it is prepared, from the moment the database is opened, and its runs are counted.
 */
function countRuns(db: TestDb): { during: (act: () => void) => string[] } {
  const sqlite = db.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare.bind(sqlite)
  let ran: string[] | null = null
  sqlite.prepare = (sql: string): unknown => {
    const statement = original(sql) as object
    const wrapped: unknown = new Proxy(statement, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown
        if (typeof value !== 'function') return value
        const call = (...args: unknown[]): unknown => (value as (...a: unknown[]) => unknown).apply(target, args)
        if (prop === 'all' || prop === 'get' || prop === 'run' || prop === 'iterate') {
          return (...args: unknown[]) => {
            ran?.push(sql.replace(/\s+/g, ' ').trim())
            return call(...args)
          }
        }
        // THESE GIVE BACK THE STATEMENT ITSELF, and the wrapped one must come back so its runs are counted.
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
 * ONE MADE-UP OFFICE AND ONE SWEEP OF IT. The person started `made-up-root`, which started the middle
 * rungs, which started the leaves. The leaves are retired, and nothing answers as the root or a middle
 * rung. An agent wrote one letter to each leaf. With `middles` 'one', every leaf has the same middle rung,
 * so every walk passes the same two rungs; with 'one for each letter', each walk passes a rung of its own.
 *
 * THE LETTERS ARE PUT IN AS ROWS, the shape the record door stores for a letter written while its addressee
 * could still be reached. The door routes a letter to an addressee nothing answers as when it is written,
 * and the sweep leaves a routed letter alone, so a letter the sweep walks is one the door never routed.
 */
async function aSweepOf(letters: number, middles: 'one' | 'one for each letter') {
  t?.close()
  t = await freshDb()
  const db = t
  const counter = countRuns(db)
  // WHAT THE SERVER READS AS IT STARTS, and the session record below needs.
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: db.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  const sqlite = db.client.sqlite
  const root = anAgent(db, 'made-up-root')
  const writer = anAgent(db, 'made-up-writer')
  const bystander = anAgent(db, 'made-up-bystander')
  const startedBy = sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
  // The fixture also sets the ownership chain when that separate field exists.
  const hasOwner = (sqlite.pragma('table_info(agents)') as {name:string}[]).some((column) => column.name === 'owner_id')
  const setStarterAndOwner = (kind: 'person' | 'agent', starter: string, id: string) => {
    startedBy.run(kind, starter, id)
    if (hasOwner) setFixtureOwner(sqlite, kind === 'agent' ? starter : null, id, 'id')
  }
  setStarterAndOwner('person', THE_PERSON, root)
  const aMiddle = (handle: string): string => {
    const mid = anAgent(db, handle)
    setStarterAndOwner('agent', root, mid)
    return mid
  }
  const theOneMiddle = middles === 'one' ? aMiddle('made-up-mid') : null
  const leaves: string[] = []
  for (let i = 0; i < letters; i++) {
    const leaf = anAgent(db, `made-up-leaf-${i}`)
    setStarterAndOwner('agent', theOneMiddle ?? aMiddle(`made-up-mid-${i}`), leaf)
    sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the made-up piece of work is done' WHERE id = ?").run(leaf)
    leaves.push(leaf)
  }

  // ONE RUN OF ANOTHER AGENT IS WAITING FOR ITS NEXT MESSAGE, so the reach of a rung reads the goodbye lines.
  const inAnHour = localStamp(new Date(Date.now() + 60 * 60 * 1000))
  db.api.createRecord({
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
      waitsUntil: inAnHour,
    },
    actor: db.api.HUMAN,
  })

  const now = localStamp(new Date())
  const aRecord = sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
      "VALUES (?, 'message-centre', ?, ?, ?, 'message', 'A made-up letter', NULL, ?, NULL, 'authored')",
  )
  const aDelivery = sqlite.prepare(
    "INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)",
  )
  leaves.forEach((leaf, i) => {
    const data = {
      body: 'A made-up letter to an agent that has since retired.',
      to: [{ kind: 'agent', id: leaf }],
      sentBy: { kind: 'agent', id: writer },
      writtenIn: { project: PROJECT },
    }
    aRecord.run(`madeUpLetter${i}`, THE_PERSON, now, now, JSON.stringify(data))
    aDelivery.run(`madeUpDelivery${i}`, `madeUpLetter${i}`, leaf, now)
  })

  const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
  let result: ReturnType<typeof sweepDeadLetters> | null = null
  const ran = counter.during(() => {
    result = sweepDeadLetters({ type: 'system', id: 'mole-office' })
  })
  return {
    result: result!,
    registry: ran.filter((one) => THE_REGISTRY.test(one)).length,
    goodbyes: ran.filter((one) => THE_GOODBYE_LINES.test(one)).length,
    holds: ran.filter((one) => THE_HOLDS.test(one)).length,
  }
}

it('reads the registry, and the reach of each rung, as often for 8 letters as for 2', async () => {
  const two = await aSweepOf(2, 'one')
  const eight = await aSweepOf(8, 'one')

  // EVERY LETTER WAS WALKED UP THE CHAIN: each ends at the person, and with no secretary named it waits.
  expect(two.result.waiting).toEqual({ fromThePerson: 0, fromAgents: 2 })
  expect(eight.result.waiting).toEqual({ fromThePerson: 0, fromAgents: 8 })

  expect(two.registry, 'the counter saw the registry read').toBeGreaterThan(0)
  expect(two.holds, 'the counter saw the holds read').toBeGreaterThan(0)
  expect(eight.registry, 'the registry is read the same number of times for 8 letters as for 2').toBe(two.registry)
  expect(eight.holds, 'the two rungs are read the same number of times for 8 letters as for 2').toBe(two.holds)
  // TWO OFFICES ARE MADE, which takes about four seconds alone, so a slow machine is not read as a failure.
}, 60_000)

it('reads the waiting runs once, however many rungs the walks pass', async () => {
  const two = await aSweepOf(2, 'one for each letter')
  const eight = await aSweepOf(8, 'one for each letter')

  expect(two.result.waiting).toEqual({ fromThePerson: 0, fromAgents: 2 })
  expect(eight.result.waiting).toEqual({ fromThePerson: 0, fromAgents: 8 })

  // EACH WALK PASSES A RUNG OF ITS OWN, so more rungs are read for 8 letters, and the waiting runs are not.
  expect(eight.holds, 'the six more middle rungs are read').toBeGreaterThan(two.holds)
  expect(two.goodbyes, 'the counter saw the goodbye lines read').toBeGreaterThan(0)
  expect(eight.goodbyes, 'the goodbye lines are read the same number of times for 8 letters as for 2').toBe(two.goodbyes)
}, 60_000)
