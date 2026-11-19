// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESENCE CLOCK'S LOOK READS EACH AGENT ONCE, AND SAYS WHAT IT SAID BEFORE.
 *
 * Once a minute, while a person's page is open, the server looks again at everybody's presence and at who is answering
 * as each agent (`thePresenceClocksLook` in src/server/api/events.ts). Its cost grew with the agents times the projects
 * the person's pages watch. For each agent in each project it asked SQLite whether one run of the agent is recorded, for
 * the word Inactive. It read both registries again for each reader, and the registry and whom each agent is replying to
 * again for each project, though neither depends on the project.
 *
 * Now the word Inactive reads, once per project, the first bindings of the project's runs and the runs in the fallback
 * bucket (`aRunRanAsOneOfForEveryAgent` in src/server/lib/presence.ts), and asks about one agent alone only when those
 * cannot say. Both registries are read once for every reader, and the registry and whom each agent is replying to once
 * for the whole look (src/server/lib/answering-told.ts).
 *
 * WHAT IS HELD HERE, with the person's pages open on two projects:
 *   1. in each project, every agent's reading in the clock's read of everybody is the reading the agent's own read
 *      gives, and that read asks `aRunRanAsOneOf` itself. The words are pinned too: a run bound to the agent by its own
 *      record, by its handle, or second in a list of bindings gives Offline; a run bound to it in the other project,
 *      and no run at all, give Inactive;
 *   2. one look reads one agent's runs alone only for the agent the bindings cannot answer for, reads the agents'
 *      registry twice (once for presence and once for who is answering), and reads whom each agent is replying to once
 *      for each agent. A look after which nothing changed announces nothing;
 *   3. after a run is filed for an agent that had none, and a turn draft is held by another, the next look announces
 *      what the agents' own readings say changed and nothing else. That is presence for the first, and who is
 *      answering for the second in both projects.
 *
 * Before the code, 2 is red and 1 and 3 are green: 1 and 3 hold what must not change.
 *
 * EACH CASE WAITS FOR THE LOOK TO END, and counts its statements until then: the look may give the thread back between
 * its parts (wave 13y round 166).
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. In `aRunRanAsOneOfForEveryAgent`, answer yes for references that meet a first binding, without asking
 *      `aRunRanAsOneOf`. 1 and 2 go red.
 *   2. In `answeringLookNow`, keep whom each agent is replying to from one look to the next. 2 and 3 go red.
 *   3. In `presenceMayHaveChanged`, read both registries again for each reader. 2 goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every agent, run and draft
 * here is made up. The runs and the draft are written straight into the table, so no door announces them.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TURN } from '../src/shared/turn-drafts.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

const HERE = 'default'
const THERE = 'made-up-second-project'
const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PERSON: ParticipantRef = { kind: 'person', id: THE_PERSON }

/** The agents with a run of their own, and the agents with none, by handle. */
const BOUND = ['made-up-by-its-record', 'made-up-by-its-handle', 'made-up-second-in-a-list', 'made-up-bound-elsewhere', 'made-up-in-the-second-project']
const COLD = ['made-up-never-ran', 'made-up-replying', ...Array.from({ length: 10 }, (_, n) => `made-up-cold-${n + 1}`)]

let t: TestDb
let app: FastifyInstance
let clock: typeof import('../src/server/api/events.ts')
let presence: typeof import('../src/server/lib/presence.ts')
let told: typeof import('../src/server/lib/answering-told.ts')
let worker: typeof import('../src/server/lib/worker.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let references: typeof import('../src/server/lib/agent-references.ts')
let aliases: typeof import('../src/server/lib/registry-aliases/runs.ts')
let turns: typeof import('../src/server/lib/turn-drafts.ts')

/** The made-up agents by their handles: registry id and the id of the agent's own record. */
const agents = new Map<string, { id: string; record: string }>()
const idOf = (handle: string): string => agents.get(handle)!.id

/** What the pages were told, as `presence.changed <agent>` and `answering.changed <project>#<agent>`. */
const heard = new Set<string>()
const theHeard = (): string[] => [...heard].sort()
/** What the look wrote in the log, which is only a look it could not finish. */
const logged: string[] = []
const look = async (): Promise<void> => {
  await clock.thePresenceClocksLook((line) => logged.push(line))
}

async function anAgent(handle: string): Promise<void> {
  const body = { kind: 'agent', title: `Made-up ${handle}`, data: { handle, state: 'active', runtime: 'claude-code' } }
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: OWNER, payload: JSON.stringify(body) })
  expect(made.statusCode, made.body).toBe(theAnswerToAWriteInATestOffice(OWNER, body))
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })
  const id = ((listed.json() as { agents?: { id: string; handle: string }[] }).agents ?? []).find((one) => one.handle === handle)?.id ?? ''
  expect(id).not.toBe('')
  agents.set(handle, { id, record: (made.json() as { record: { id: string } }).record.id })
}

let rows = 0
/** A made-up row written straight into the table. */
function aRow(workspaceId: string, kind: string, data: Record<string, unknown>): void {
  rows += 1
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, ?, 'owner', '2026-11-13 09:00:00', '2026-11-13 09:00:00', ?, ?, null, ?, null, 'fixture')`,
    )
    .run(`made-up-row-${rows}`, workspaceId, kind, `Made-up ${kind} ${rows}`, JSON.stringify(data))
}

/** An ended run in `workspaceId`, bound as `ranAs` says. */
const anEndedRun = (workspaceId: string, ranAs: { workspaceId: string; agentId: string }[]): void => aRow(workspaceId, 'session', { runtime: 'claude-code', state: 'crashed', ranAs })

/** A turn draft the agent holds now, for one made-up reader. */
function aHeldTurnDraft(agentId: string): void {
  const turn = { run: 'a-made-up-run', agent: { kind: 'agent', id: agentId }, readers: 'person:made-up-reader', heldAt: '2026-11-13 09:00:00', writes: 1, sendIds: [], fields: {}, toAPerson: false }
  aRow(HERE, 'draft', { body: 'Made up for this test.', for: [], becomes: 'message', [TURN]: turn })
}

/** What a page draws of each agent, from the agent's own read, by `<project>#<agent id>`. */
function whatEachAgentsOwnReadDraws(now: Date): Map<string, string> {
  const out = new Map<string, string>()
  for (const project of [HERE, THERE]) {
    for (const { id } of participants.listParticipants().agents) {
      const [own] = presence.thePresenceOf([{ kind: 'agent', id }], project, now, PERSON, false)
      out.set(`${project}#${id}`, JSON.stringify([own!.colour, own!.word, own!.state, own!.stateMayBeStale, own!.choice, own!.residentSleep]))
    }
  }
  return out
}

/**
 * WHO IS ANSWERING AS EACH AGENT, read as the look read it before the change: in each project, the registry and whom
 * each agent is replying to read again. By `<project>#<agent id>`, as the JSON the look compares.
 */
function eachAgentsAnsweringReadProjectByProject(at: number): Map<string, string> {
  const sqlite = t.client.sqlite
  const filed = aliases.theFiledAliasesReadOnce(sqlite)
  const out = new Map<string, string>()
  for (const project of [HERE, THERE]) {
    const registered = participants.listParticipants().agents
    const identityOf = references.everyAgentsIdentityReadOnce(sqlite)
    const shared = presence.thePresenceReadingsOf(project, undefined, identityOf, undefined, true, undefined, undefined, filed)
    const facts = presence.theAgentFactsReadOnce(new Date(at), true, () => registered, identityOf, () => shared.waiting().map((one) => one.session))
    for (const { id } of registered) {
      const reading = worker.theAnsweringReading(id, project, shared.sessions(), shared.waiting(), {
        machine: shared.machine,
        readOnly: true,
        at,
        runningRows: shared.runningRows,
        messageRows: shared.messageRows,
        hold: facts.hold(id),
        cardOf: facts.cardOf,
        runOrigin: facts.runOrigin,
        identityOf,
        aliases: filed,
      })
      const couldNotTell = worker.whatAReadingSaysOfReach(reading)?.was === 'could not tell'
      out.set(`${project}#${id}`, JSON.stringify([reading.answering.how, reading.answering.session, couldNotTell, turns.whomAnAgentIsReplyingTo(id)]))
    }
  }
  return out
}

/** The source of every statement run until `run` ends, kept ones included: the prototype's own methods are wrapped. */
async function theStatementsRunDuring(run: () => Promise<void>): Promise<string[]> {
  type Methods = Record<'all' | 'get' | 'iterate' | 'run', (...args: unknown[]) => unknown>
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Methods
  const kept: Methods = { all: proto.all, get: proto.get, iterate: proto.iterate, run: proto.run }
  const ran: string[] = []
  for (const method of ['all', 'get', 'iterate', 'run'] as const) {
    proto[method] = function (this: { source: string }, ...args: unknown[]) {
      ran.push(this.source)
      return kept[method].apply(this, args)
    }
  }
  try {
    await run()
  } finally {
    Object.assign(proto, kept)
  }
  return ran
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  clock = await import('../src/server/api/events.ts')
  presence = await import('../src/server/lib/presence.ts')
  told = await import('../src/server/lib/answering-told.ts')
  worker = await import('../src/server/lib/worker.ts')
  participants = await import('../src/server/lib/participants.ts')
  references = await import('../src/server/lib/agent-references.ts')
  aliases = await import('../src/server/lib/registry-aliases/runs.ts')
  turns = await import('../src/server/lib/turn-drafts.ts')
  t.client.sqlite.prepare("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, 'Made-up second project', '2026-11-13 09:00:00', '2026-11-13 09:00:00')").run(THERE)
  // THE AGENTS, filed while no person's page is open, so their writes are told to nobody.
  for (const handle of [...BOUND, ...COLD]) await anAgent(handle)
  anEndedRun(HERE, [{ workspaceId: HERE, agentId: agents.get('made-up-by-its-record')!.record }])
  anEndedRun(HERE, [{ workspaceId: HERE, agentId: 'made-up-by-its-handle' }])
  // A RUN IN THE FALLBACK BUCKET: its first binding names nobody, and its second is the agent in this project.
  anEndedRun(HERE, [{ workspaceId: THERE, agentId: 'made-up-nobody' }, { workspaceId: HERE, agentId: idOf('made-up-second-in-a-list') }])
  // A RUN OF THIS PROJECT BOUND FIRST TO THE AGENT, but in the other project: no run of this project ran as it.
  anEndedRun(HERE, [{ workspaceId: THERE, agentId: idOf('made-up-bound-elsewhere') }])
  anEndedRun(THERE, [{ workspaceId: THERE, agentId: idOf('made-up-in-the-second-project') }])
  // THE PERSON'S PAGES, and the first look, which only remembers.
  const events = await import('../src/server/lib/events.ts')
  const send = ({ event }: { event: unknown }): void => {
    const one = event as { name: string; who?: { id: string }; workspaceId?: string }
    if (one.name === 'presence.changed') heard.add(`${one.name} ${one.who?.id}`)
    if (one.name === 'answering.changed') heard.add(`${one.name} ${one.workspaceId}#${one.who?.id}`)
  }
  for (const project of [HERE, THERE]) events.pageOpened({ workspaceId: project, who: PERSON, send })
  clock.forgetWhatPagesWereToldOfPresence()
  told.forgetWhatPagesWereToldOfAnswering()
  await look()
  expect(theHeard()).toEqual([])
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("the presence clock's look", () => {
  it("1. gives each agent, in each project, the reading the agent's own read gives", () => {
    const now = new Date()
    const sessions = presence.presenceSessionRowsForOneClock()
    const words = new Map<string, string>()
    for (const project of [HERE, THERE]) {
      const everybody = presence.everybodysPresence(project, now, PERSON, false, sessions)
      for (const reading of everybody) {
        if (reading.who.kind !== 'agent') continue
        const [own] = presence.thePresenceOf([reading.who], project, now, PERSON, false)
        expect(reading, `${project}: ${reading.who.id}`).toEqual(own)
        words.set(`${project}#${reading.who.id}`, reading.word)
      }
    }
    const { offline, inactive } = presence.GREY_PRESENCE_WORDS
    const wordsOf = (project: string): Record<string, string | undefined> =>
      Object.fromEntries([...BOUND, ...COLD].map((handle) => [handle, words.get(`${project}#${idOf(handle)}`)]))
    const everyOneInactive = Object.fromEntries([...BOUND, ...COLD].map((handle) => [handle, inactive]))
    expect(wordsOf(HERE)).toEqual({ ...everyOneInactive, 'made-up-by-its-record': offline, 'made-up-by-its-handle': offline, 'made-up-second-in-a-list': offline })
    expect(wordsOf(THERE)).toEqual({ ...everyOneInactive, 'made-up-in-the-second-project': offline })
  })

  it('2. reads one agent alone only where the bindings cannot say, and each registry and draft once', async () => {
    const ran = await theStatementsRunDuring(look)
    expect(logged).toEqual([])
    expect(theHeard()).toEqual([])
    const agentsInTheRegistry = participants.listParticipants().agents.length
    expect(agentsInTheRegistry).toBeGreaterThanOrEqual(BOUND.length + COLD.length)
    const counted = {
      // `aRunRanAsOneOf`'s read, which names both binding buckets and a limit: for the agent bound first in the other
      // project, one read that finds that run and one that reads every run bound to it, in this project only.
      'the runs of one agent': ran.filter((sql) => sql.includes('records_session_first_binding_agent_idx') && sql.includes('records_session_reference_fallback_idx') && /\blimit\b/i.test(sql)).length,
      'the agents registry': ran.filter((sql) => sql.startsWith('SELECT * FROM agents ORDER BY')).length,
      'whom an agent is replying to': ran.filter((sql) => sql.startsWith('SELECT DISTINCT') && sql.includes('records_held_turn_draft_agent_idx')).length,
    }
    expect(counted).toEqual({ 'the runs of one agent': 2, 'the agents registry': 2, 'whom an agent is replying to': agentsInTheRegistry })
  })

  it("3. announces after a change what the agents' own readings say changed, and nothing else", async () => {
    const at = Date.now()
    const drawnBefore = whatEachAgentsOwnReadDraws(new Date(at))
    const answeringBefore = eachAgentsAnsweringReadProjectByProject(at)
    anEndedRun(HERE, [{ workspaceId: HERE, agentId: idOf('made-up-never-ran') }])
    aHeldTurnDraft(idOf('made-up-replying'))
    const drawnAfter = whatEachAgentsOwnReadDraws(new Date(at))
    const answeringAfter = eachAgentsAnsweringReadProjectByProject(at)
    const presenceChanged = new Set([...drawnAfter].filter(([key, drawn]) => drawnBefore.get(key) !== drawn).map(([key]) => `presence.changed ${key.slice(key.indexOf('#') + 1)}`))
    const answeringChanged = [...answeringAfter].filter(([key, reading]) => answeringBefore.get(key) !== reading).map(([key]) => `answering.changed ${key}`)
    heard.clear()
    await look()
    expect(logged).toEqual([])
    expect(theHeard()).toEqual([...presenceChanged, ...answeringChanged].sort())
    expect(theHeard()).toEqual(
      expect.arrayContaining([
        `presence.changed ${idOf('made-up-never-ran')}`,
        `answering.changed ${HERE}#${idOf('made-up-replying')}`,
        `answering.changed ${THERE}#${idOf('made-up-replying')}`,
      ]),
    )
  })
})
