// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESENCE CLOCK GIVES THE THREAD BACK BETWEEN THE PARTS OF ITS LOOK, AND TELLS EACH PAGE WHAT IT TOLD BEFORE.
 * Wave 13y round 166.
 *
 * Once a minute, while a person's page is open, the server looks again at everybody's presence and at who is answering
 * as each agent (`thePresenceClocksLook` in src/server/api/events.ts). The look was one synchronous run, so the server
 * answered nobody until it ended: up to 2,228 ms on the live server, and about 180 to 200 ms on a made-up office of the
 * live shape with twelve streams open. The look now runs in parts, each a run of its own, through the run it is given:
 * one part builds the look, then one part takes the reading for each person's page in each project, one tells the
 * pages what changed, and one looks at who is answering. Between two parts the thread is given back.
 *
 * WHAT IS PROVED, with the person's pages open on two projects and one agent's stream open:
 *   1. The look runs as more runs than it has readers, through the run it is given, and between two of them the thread
 *      is given back: what was queued in one run runs before the next starts.
 *   2. The server's tick runs its look so: each part is a run named "the presence clock".
 *   3. After a change, each person's page is told the reading its own reader is told, and the agent's stream is told
 *      the event without a reading, as the look in one run told them. Every stream is told the colour the
 *      participant's own read gives, though the telling reads every changed participant's colour in one read.
 *   4. A newer reading told to a page between the parts, by a write's own look, is not followed by the clock's older
 *      one: the page is told the event without a reading, so it reads the participant itself.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the look running in one run, with no turn between its parts              → cases 1, 2 and 4
 *   the tick not handing its named run to the look                            → case 2
 *   the telling sending every page the clock's own reading                    → case 4
 *   a person's page told the plain event, or the agent's stream a reading     → case 3
 *   the telling sending a colour that is not the participant's own            → case 3
 *
 * WHAT THIS DOES NOT PROVE. How long a part holds the thread. A fresh test office has a few records, so the times are
 * measured on a made-up office of the live shape outside the suite. No case here asserts a time.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every agent and run here
 * is made up. The runs are written straight into the table, so no door announces them.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

const HERE = 'default'
const THERE = 'made-up-second-project'
const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PERSON: ParticipantRef = { kind: 'person', id: THE_PERSON }
const AGENTS = ['made-up-first', 'made-up-second', 'made-up-third']
/** The readers the person's pages give: one for each project they watch. */
const READERS = 2

type ARun = (part: () => void) => void
type TheClocksLook = (log: (line: string) => void, run?: ARun) => Promise<void> | void

let t: TestDb
let app: FastifyInstance
let clock: typeof import('../src/server/api/events.ts')
let presence: typeof import('../src/server/lib/presence.ts')
let told: typeof import('../src/server/lib/answering-told.ts')
let timers: typeof import('../src/server/lib/named-timers.ts')
const ids = new Map<string, string>()
const idOf = (handle: string): string => ids.get(handle)!

/** One event a page was told: which page, and the event as it was sent. */
interface Heard {
  page: string
  name: string
  who?: ParticipantRef
  colour?: unknown
  reading?: Record<string, unknown>
}
const heard: Heard[] = []
/** What the look wrote in the log, which is only a look it could not finish. */
const logged: string[] = []
const log = (line: string): void => {
  logged.push(line)
}
const look = (run?: ARun): Promise<void> | void => (clock.thePresenceClocksLook as TheClocksLook)(log, run)

async function anAgent(handle: string): Promise<void> {
  const body = { kind: 'agent', title: `Made-up ${handle}`, data: { handle, state: 'active', runtime: 'claude-code' } }
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: OWNER, payload: JSON.stringify(body) })
  expect(made.statusCode, made.body).toBe(theAnswerToAWriteInATestOffice(OWNER, body))
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })
  const id = ((listed.json() as { agents?: { id: string; handle: string }[] }).agents ?? []).find((one) => one.handle === handle)?.id ?? ''
  expect(id).not.toBe('')
  ids.set(handle, id)
}

let rows = 0
/** An ended run in `workspaceId` bound first to `agentId`, written straight into the table; its id. */
function anEndedRun(workspaceId: string, agentId: string): string {
  rows += 1
  const id = `made-up-run-${rows}`
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, ?, 'owner', '2026-11-13 09:00:00', '2026-11-13 09:00:00', 'session', ?, null, ?, null, 'fixture')`,
    )
    .run(id, workspaceId, `Made-up run ${rows}`, JSON.stringify({ runtime: 'claude-code', state: 'crashed', ranAs: [{ workspaceId, agentId }] }))
  return id
}

/** Take a row out of the table again, as a delete would, with nothing announced. */
function deleted(id: string): void {
  t.client.sqlite.prepare("update records set deleted_at = '2026-11-13 09:30:00' where id = ?").run(id)
}

/** What a page draws of `who` in `project`, from the participant's own read as the person is told it. */
function whatTheOwnReadDraws(who: ParticipantRef, project: string): string {
  const [own] = presence.thePresenceOf([who], project, new Date(), PERSON, false)
  return JSON.stringify([own!.colour, own!.word, own!.state, own!.stateMayBeStale, own!.choice, own!.residentSleep])
}

/** What a page draws of a reading it was sent. */
function whatAReadingDraws(reading: Record<string, unknown>): string {
  return JSON.stringify([reading['colour'], reading['word'], reading['state'], reading['stateMayBeStale'], reading['choice'], reading['residentSleep']])
}

/** The presence events `page` was told about `id`, in order. */
const toldOf = (page: string, id: string): Heard[] => heard.filter((one) => one.page === page && one.name === 'presence.changed' && one.who?.id === id)

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  clock = await import('../src/server/api/events.ts')
  presence = await import('../src/server/lib/presence.ts')
  told = await import('../src/server/lib/answering-told.ts')
  timers = await import('../src/server/lib/named-timers.ts')
  t.client.sqlite.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, 'Made-up second project', '2026-11-13 09:00:00', '2026-11-13 09:00:00')").run(THERE)
  // THE AGENTS, filed while no person's page is open, so their writes are told to nobody.
  for (const handle of AGENTS) await anAgent(handle)
  // THE PERSON'S PAGES ON BOTH PROJECTS, AN AGENT'S STREAM, and the first look, which only remembers.
  const events = await import('../src/server/lib/events.ts')
  const listen =
    (page: string) =>
    ({ event }: { event: unknown }): void => {
      const one = event as { name: string; who?: ParticipantRef; colour?: unknown; reading?: Record<string, unknown> }
      heard.push({ page, name: one.name, ...(one.who === undefined ? {} : { who: one.who }), colour: one.colour, ...(one.reading === undefined ? {} : { reading: one.reading }) })
    }
  for (const project of [HERE, THERE]) events.pageOpened({ workspaceId: project, who: PERSON, send: listen(`the person's page on ${project}`) })
  events.pageOpened({ workspaceId: HERE, who: { kind: 'agent', id: idOf('made-up-third') }, send: listen("an agent's stream") })
  clock.forgetWhatPagesWereToldOfPresence()
  told.forgetWhatPagesWereToldOfAnswering()
  await look()
  expect(heard.filter((one) => one.name === 'presence.changed')).toEqual([])
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the presence clock's look gives the thread back between its parts", () => {
  it('1. runs as more runs than it has readers, through the run it is given, with a turn between two runs', async () => {
    const order: string[] = []
    let runs = 0
    const run: ARun = (part) => {
      const one = runs++
      order.push(`run ${String(one)} starts`)
      try {
        part()
      } finally {
        setImmediate(() => order.push(`the turn after run ${String(one)}`))
      }
    }
    await look(run)
    expect(logged).toEqual([])
    expect(runs, `the look ran as ${String(runs)} runs: ${order.join(', ')}`).toBeGreaterThan(READERS)
    for (let one = 0; one < runs - 1; one++) {
      const turn = order.indexOf(`the turn after run ${String(one)}`)
      const next = order.indexOf(`run ${String(one + 1)} starts`)
      expect(turn, `what run ${String(one)} queued had not run when run ${String(one + 1)} started: ${order.join(', ')}`).toBeGreaterThanOrEqual(0)
      expect(turn, `what run ${String(one)} queued had not run when run ${String(one + 1)} started: ${order.join(', ')}`).toBeLessThan(next)
    }
  })

  it('2. the server’s tick runs its look so: each part is a run named "the presence clock"', async () => {
    const tick = (clock as unknown as { thePresenceClocksTick?: (log: (line: string) => void) => () => unknown }).thePresenceClocksTick
    expect(tick, 'events.ts gives no tick to run').toBeTypeOf('function')
    timers.forgetTheNamedRuns()
    const began = performance.now()
    await tick!(log)()
    const runs = timers.theNamedRunsAcross(began, performance.now()).filter((one) => one.name === 'the presence clock')
    expect(logged).toEqual([])
    expect(runs.length, 'the tick ran its look in no more runs than it has readers').toBeGreaterThan(READERS + 1)
  })

  it("3. after a change, tells each person's page the reading its own reader is told, and the agent's stream none", async () => {
    const who: ParticipantRef = { kind: 'agent', id: idOf('made-up-first') }
    const before = whatTheOwnReadDraws(who, HERE)
    anEndedRun(HERE, who.id)
    expect(whatTheOwnReadDraws(who, HERE), 'the run changed nothing a page draws, so this case shows nothing').not.toBe(before)
    heard.length = 0
    await look()
    expect(logged).toEqual([])
    // THE COLOUR EVERY STREAM IS TOLD is the participant's own, read as nobody in the first project a page watches.
    const itsOwnColour = presence.participantPresence(who, HERE, new Date()).colour
    for (const project of [HERE, THERE]) {
      const page = `the person's page on ${project}`
      const events = toldOf(page, who.id)
      expect(events, `${page} was told ${JSON.stringify(events)}`).toHaveLength(1)
      expect(events[0]!.reading, `${page} was told no reading`).toBeDefined()
      expect(whatAReadingDraws(events[0]!.reading!)).toBe(whatTheOwnReadDraws(who, project))
      expect(events[0]!.colour, `${page} was told a colour that is not the participant's own`).toBe(itsOwnColour)
    }
    const toTheAgent = toldOf("an agent's stream", who.id)
    expect(toTheAgent, "the agent's stream was not told the change").toHaveLength(1)
    expect(toTheAgent[0]!.reading, "the agent's stream was told a reading").toBeUndefined()
    expect(toTheAgent[0]!.colour, "the agent's stream was told a colour that is not the participant's own").toBe(itsOwnColour)
  })

  it("4. after a newer reading told between the parts, tells the page no older reading but the event alone", async () => {
    const who: ParticipantRef = { kind: 'agent', id: idOf('made-up-second') }
    const page = `the person's page on ${HERE}`
    const asItWas = whatTheOwnReadDraws(who, HERE)
    const run = anEndedRun(HERE, who.id)
    const changed = whatTheOwnReadDraws(who, HERE)
    expect(changed, 'the run changed nothing a page draws, so this case shows nothing').not.toBe(asItWas)
    heard.length = 0
    // AFTER EVERY READER'S PART, before the telling, the run goes again and a write's own look tells the pages so.
    let parts = 0
    let meanwhile = 0
    await look((part) => {
      part()
      parts += 1
      if (parts === READERS + 1) {
        deleted(run)
        meanwhile = clock.presenceMayHaveChanged([who])
      }
    })
    expect(logged).toEqual([])
    expect(meanwhile, 'the look between the parts told nothing, so this case shows nothing').toBe(1)
    expect(whatTheOwnReadDraws(who, HERE)).toBe(asItWas)
    const events = toldOf(page, who.id)
    expect(events.length, `${page} was told ${JSON.stringify(events)}`).toBe(2)
    expect(whatAReadingDraws(events[0]!.reading ?? {}), 'the look between the parts told the newer reading first').toBe(asItWas)
    expect(events[1]!.reading, `the clock told ${page} its older reading after the newer one`).toBeUndefined()
  })
})
