// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A SEND READS EACH AGENT'S REACH FROM THAT AGENT'S OWN RUNS, AND ROUTES AS IT DID WHEN IT READ EVERY RUN. Wave 13u
 * round 36.
 *
 * A message to an agent asks whether the addressee can be reached, and when it cannot, which agent up its chain of
 * starters gets a copy. Each of those readings read every session record of the project with its data: 7,700 rows and
 * 84 ms inside SQLite for one message on the made-up office of the live counts. The record door now asks
 * `theReadingsForOneMessage` in src/server/lib/superiors.ts, and each reach reads only the runs that may serve the agent
 * asked about (`theRunRowsOfOneReach` in src/server/lib/worker.ts). The dead-letter sweep and the notice of what an ended
 * run left open still read every run once (`theReadingsForOneSend`). They are timer steps, and they are not changed.
 *
 * Every id, handle, sandbox and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. WHO IS ROUTED WHERE DOES NOT CHANGE (chapter 7). For every agent of one office, the reach read the new way is the
 *      reach read from every run. So is the walk up its chain, sent by the person, by two agents and by nobody. The
 *      office holds each state the reach reads runs for:
 *        a. a run the office started, holding the handle;
 *        b. a live sandbox run with no hold, naming its agent by registry id, by handle, or by the id of its agent record;
 *        c. a run waiting for the next message;
 *        d. a conversation whose newest run's wait is over, with an older run of it still inside its wait;
 *        e. a run inside its wait whose goodbye line was already written;
 *        f. a supervisor's own conversation, past its wait;
 *        g. a live session holding the handle;
 *        h. a hold whose session is gone, alone, and with a live sandbox run of the agent under it;
 *        i. nothing at all, and a retired agent.
 *      Each answers as it was made to, so the comparison is not of two empty answers.
 *   2. A PERSON'S SEND READS NO RUN OF AN AGENT IT DOES NOT ASK ABOUT. The send goes to an agent nothing answers as, and
 *      the walk passes one agent and reaches a third. Every value any statement gives back is seen, and the session
 *      records among them are exactly the runs of those three agents. The routing stored on the message is the one read
 *      from every run before it was sent. The send is written through `createRecord`, the write the record door makes.
 *
 * THE LIMITS.
 *   · A run is read when its `servingAgentId` or `servingAgent` holds the agent's id, its handle or the id of one of its
 *     agent records anywhere in its text, and each reader then keeps only the runs that serve the agent. So a run of
 *     another agent whose serving field holds the asked agent's name inside a longer one is read, and thrown away. No
 *     name in this office holds another. Case 2 would be red if one did.
 *   · The record door's reply adds the list of what is already filed near the new record (`namesWhatIsAlreadyFiled`),
 *     and that list reads the id, kind and title of every record of the project, the runs among them. It reads no
 *     run's data and it is not the reach, so case 2 writes through `createRecord`. Round 34 of wave 13u named it.
 *   · An agent's own send is first asked who may write to whom (`whyThisAgentCannotReceiveAMessage`). Until round 37
 *     of wave 13u that check read every running run of the project, so case 2 is sent by the person. It now reads no
 *     run with the setting off and only the addressee's own with it on, and
 *     tests/the-check-before-an-agents-send-reads-no-other-agents-runs.test.ts holds that with an agent's send.
 *
 * WHAT TURNS EACH RED, each tried in wave 13u round 36:
 *   · case 1, in src/server/lib/worker.ts: leave the running runs out of `theRunRowsOfOneReach` (b by registry id
 *     reads as nothing answering; case 2 is red too); leave the handle out of `aRunMayServe` (b by handle); give the
 *     rows of `theRunRowsOfOneReach` in the opposite order (d reads as reachable); give `theReachOfEachAgentAlone` no
 *     goodbye lines (e reads as reachable);
 *   · case 2: in src/server/lib/worker.ts, let `theReachOfEachAgentAlone` read `everyRunRow` again; in
 *     src/server/lib/records.ts, let the send ask `theReadingsForOneSend` again, as it did before this round.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const at = localStamp(new Date())
const inMinutes = (minutes: number): string => localStamp(new Date(Date.now() + minutes * 60_000))

interface Agent {
  id: string
  record: string
  handle: string
}

let t: TestDb
let app: FastifyInstance
let worker: typeof import('../src/server/lib/worker.ts')
let superiors: typeof import('../src/server/lib/superiors.ts')
/** True while case 2's send runs; every value a statement gives back meanwhile is kept in `gaveBack`. */
let recording = false
const gaveBack = new Map<unknown, string>()
/** Every real child this file started, stopped by its group afterwards. */
const started: ChildProcess[] = []
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-reach-from-its-own-runs-'))
let made = 0

/** Each agent of the office by the state it was made in, and what its reach was made to say: null, or the reading's `was`. */
const office = new Map<string, Agent>()
const madeToSay = new Map<string, string | null>()

const BY_ID = 'b. a live sandbox run naming its agent by registry id'
const WAITING = 'c. a run waiting for the next message'
const SUPERVISOR = 'f. a supervisor whose own conversation is past its wait'
const GONE_WITH_A_RUN = 'h. a hold whose session is gone, with a sandbox run under it'
const NOTHING = 'i. nothing at all, started by the agent of b by id'
const ADDRESSEE = 'i. nothing at all, started by the agent of i, and case 2 sends to it'

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE RECORDER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const answer = run.apply(this, args)
        if (!recording) return answer
        if (method === 'iterate') return keepingEach(answer as Iterable<unknown>, text)
        for (const row of method === 'all' ? (answer as unknown[]) : [answer]) keepTheValuesOf(row, text)
        return answer
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  superiors = await import('../src/server/lib/superiors.ts')

  // a.
  {
    const agent = await anAgent('made-up-office-run-holder', 'a. a run the office started, holding the handle', null)
    const run = aSession({ state: 'running', runtime: 'claude-code', servingAgent: agent.id, startedByMoleOffice: true, sandbox: aSandbox('office-run') })
    await hold(agent.handle, run)
  }
  // b.
  const byName = {
    [BY_ID]: (x: Agent) => ({ servingAgentId: x.id }),
    'b. a live sandbox run naming its agent by handle': (x: Agent) => ({ servingAgent: x.handle }),
    'b. a live sandbox run naming its agent by the id of its agent record': (x: Agent) => ({ servingAgent: x.record }),
  }
  let letter = 0
  for (const [state, naming] of Object.entries(byName)) {
    letter += 1
    const agent = await anAgent(`made-up-sandbox-runner-${String(letter)}`, state, null)
    await aLiveProcessFor(aSession({ state: 'running', runtime: 'claude-code', ...naming(agent), sandbox: aSandbox(`sandbox-run-${String(letter)}`) }))
  }
  // c.
  {
    const agent = await anAgent('made-up-waiter', WAITING, null)
    aSession(aWaitingRun(agent, 'made-up-waiting-conversation', inMinutes(30)))
  }
  // d. THE OLDER RUN IS FILED FIRST, so the newer one, whose wait is over, is the one still in the conversation.
  {
    const agent = await anAgent('made-up-moved-on', 'd. a conversation whose newest run is past its wait', 'nothing answering')
    aSession(aWaitingRun(agent, 'made-up-moved-on-conversation', inMinutes(30)))
    aSession(aWaitingRun(agent, 'made-up-moved-on-conversation', inMinutes(-1)))
  }
  // e.
  {
    const agent = await anAgent('made-up-said-goodbye', 'e. a run inside its wait whose goodbye line is written', 'nothing answering')
    const run = aSession(aWaitingRun(agent, 'made-up-ended-conversation', inMinutes(30)))
    made += 1
    record(`made-up-goodbye-${String(made)}`, 'message', { body: SYSTEM_LINES.aRunWaitedAndEnded(0).line, aboutRun: run, sentBy: { kind: 'agent', id: 'mole-office' } }, 'message-centre')
  }
  // f.
  {
    const agent = await anAgent('made-up-supervisor', SUPERVISOR, null)
    t.client.sqlite.prepare("UPDATE agents SET role = 'supervisor' WHERE id = ?").run(agent.id)
    aSession(aWaitingRun(agent, 'made-up-kept-conversation', inMinutes(-1)))
  }
  // g.
  {
    const agent = await anAgent('made-up-terminal-holder', 'g. a live session holding the handle', null)
    await hold(agent.handle, await aLiveSession())
  }
  // h.
  {
    const agent = await anAgent('made-up-left-behind', 'h. a hold whose session is gone', 'nothing answering')
    await hold(agent.handle, aSession({ state: 'running', runtime: 'claude-code', doing: 'A made-up terminal that has gone.' }))
  }
  {
    const agent = await anAgent('made-up-left-with-a-run', GONE_WITH_A_RUN, null)
    await hold(agent.handle, aSession({ state: 'running', runtime: 'claude-code', doing: 'Another made-up terminal that has gone.' }))
    await aLiveProcessFor(aSession({ state: 'running', runtime: 'claude-code', servingAgentId: agent.id, sandbox: aSandbox('under-a-gone-hold') }))
  }
  // i. Each has a run that held a message and ended, so its reach has a run to read and passes it by.
  const nothing = await anAgent('made-up-quiet', NOTHING, 'nothing answering', BY_ID)
  aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: nothing.id, deliveringMessage: 'made-up-answered-message' })
  const addressee = await anAgent('made-up-addressee', ADDRESSEE, 'nothing answering', NOTHING)
  aSession(aWaitingRun(addressee, 'made-up-over-conversation', inMinutes(-1)))
  const retired = await anAgent('made-up-retired', 'i. a retired agent, started by the agent of i', 'retired', NOTHING)
  await aLiveProcessFor(aSession({ state: 'running', runtime: 'claude-code', servingAgentId: retired.id }))
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'a made-up piece of work is done' WHERE id = ?").run(retired.id)
  // AND ONE UNDER EACH OTHER REACHABLE STATE THAT ENDS A WALK, so the walks end at more than one kind of rung.
  for (const [state, starter] of [
    ['i. nothing at all, started by the agent of c', WAITING],
    ['i. nothing at all, started by the agent of f', SUPERVISOR],
    ['i. nothing at all, started by the agent of h with a run', GONE_WITH_A_RUN],
  ] as const) {
    made += 1
    await anAgent(`made-up-quiet-${String(made)}`, state, 'nothing answering', starter)
  }
}, 120_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file tests.
    }
  }
  await app?.close()
  t?.close()
  rmSync(transcripts, { recursive: true, force: true })
})

/** Keep each value of one row, with the first statement that gave it back, for a failure's message. */
function keepTheValuesOf(row: unknown, text: string): void {
  const values = Array.isArray(row) ? row : typeof row === 'object' && row !== null ? Object.values(row) : [row]
  for (const value of values) if (!gaveBack.has(value)) gaveBack.set(value, text.replace(/\s+/g, ' ').slice(0, 300))
}

function* keepingEach(rows: Iterable<unknown>, text: string): Generator<unknown> {
  for (const row of rows) {
    keepTheValuesOf(row, text)
    yield row
  }
}

/**
 * Register an agent through the real door, started by the person or by the agent of another state, and write down what
 * its reach was made to say. Gives back its registry id and the id of its agent record.
 */
async function anAgent(handle: string, state: string, says: string | null, startedBy?: string): Promise<Agent> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const listed = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })
  const agents = (JSON.parse(listed.body) as { agents: { id: string; handle: string }[] }).agents
  const id = one(agents.filter((row) => row.handle === handle), `the registry row for ${handle}`).id
  const by: ParticipantRef = startedBy === undefined ? { kind: 'person', id: THE_PERSON } : { kind: 'agent', id: office.get(startedBy)!.id }
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(by.kind, by.id, id)
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, by.kind === 'agent' ? by.id : null, id, 'id')
  }
  const agent = { id, record: (JSON.parse(filed.body) as { record: { id: string } }).record.id, handle }
  office.set(state, agent)
  madeToSay.set(state, says)
  return agent
}

/** One stored row, written as the fixtures of tests/a-check-row-reads-only-its-own-agents-runs.test.ts are. */
function record(id: string, kind: string, data: object, workspace: string): void {
  t.client.sqlite
    .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
      VALUES (?, ?, ?, ?, ?, ?, 'A made-up record', ?, 'fixture')`)
    .run(id, workspace, THE_PERSON, at, at, kind, JSON.stringify(data))
}

/** A session record of this file's own. */
function aSession(data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up session', data, actor: t.api.HUMAN }).id
}

/** A run the message worker started that has answered, holding its conversation open until `until`. */
function aWaitingRun(agent: Agent, conversation: string, until: string): Record<string, unknown> {
  return {
    state: 'finished',
    runtime: 'claude-code',
    servingAgentId: agent.id,
    deliveringMessage: 'made-up-answered-message',
    providerSession: conversation,
    waitsUntil: until,
  }
}

/** A sandbox whose folder ends in its own name. */
const aSandbox = (name: string) => ({ template: 'a-made-up-template', folder: `/made/up/sandboxes/${name}` })

/** A real process of this file's own, in its own group, registered against the session. */
async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: PROJECT, sessionRecordId, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

/** A terminal somebody opened, with a live process and a transcript written now, as the hook files one. */
async function aLiveSession(): Promise<string> {
  made += 1
  const logPath = join(transcripts, `session-${String(made)}.jsonl`)
  writeFileSync(
    logPath,
    `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'answering' }] } })}\n`,
  )
  const session = aSession({
    state: 'running',
    runtime: 'claude-code',
    doing: 'A made-up terminal.',
    extra: { discovered: { tool: 'claude-code', externalId: `made-up-${String(made)}`, logPath, resumeCommand: null, startedAt: null, entryPoint: null } },
  })
  await aLiveProcessFor(session)
  return session
}

/** The session takes the agent's handle through the real door. */
async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_PERSON,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** Every session record of the office, with its data. */
function everyRun(): { id: string; data: Record<string, unknown> }[] {
  return (t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'session'").all() as { id: string; data: string }[]).map((row) => ({
    id: row.id,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }))
}

describe('a send reads each reach from the runs of the agent asked about', () => {
  it('1. each agent reads as it did from every run, and every walk ends where it did', () => {
    const fromEveryRun = superiors.theReadingsForOneSend(PROJECT)
    const fromItsOwn = superiors.theReadingsForOneMessage(PROJECT)
    const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
    const senders: (ParticipantRef | null)[] = [person, { kind: 'agent', id: office.get(BY_ID)!.id }, { kind: 'agent', id: office.get(WAITING)!.id }, null]
    const said = new Map<string, string | null>()
    const endsAt = new Map<string, string | null>()
    for (const [state, agent] of office) {
      const before = fromEveryRun.reachOf(agent.id)
      const after = fromItsOwn.reachOf(agent.id)
      expect(after, state).toEqual(before)
      said.set(state, after === null ? null : after.was)
      if (after === null || after.was === 'could not tell') continue
      const addressee: ParticipantRef = { kind: 'agent', id: agent.id }
      for (const sender of senders) {
        const walked = superiors.theRoutingOfOneAddressee(addressee, after, sender, fromItsOwn)
        expect(walked, `${state}, sent by ${JSON.stringify(sender)}`).toEqual(superiors.theRoutingOfOneAddressee(addressee, before as typeof after, sender, fromEveryRun))
        if (sender === person) endsAt.set(state, walked.to === null ? null : walked.to.kind === 'person' ? 'the person' : [...office].find(([, one]) => one.id === walked.to!.id)?.[0] ?? walked.to.id)
      }
    }
    // NOT TWO EMPTY ANSWERS: each state answered as it was made to, and the walks end at four kinds of rung.
    expect(Object.fromEntries(said)).toEqual(Object.fromEntries(madeToSay))
    expect(Object.fromEntries(endsAt)).toEqual({
      'd. a conversation whose newest run is past its wait': null,
      'e. a run inside its wait whose goodbye line is written': null,
      'h. a hold whose session is gone': null,
      [NOTHING]: BY_ID,
      [ADDRESSEE]: BY_ID,
      'i. a retired agent, started by the agent of i': BY_ID,
      'i. nothing at all, started by the agent of c': WAITING,
      'i. nothing at all, started by the agent of f': SUPERVISOR,
      'i. nothing at all, started by the agent of h with a run': GONE_WITH_A_RUN,
    })
  })

  it('2. a person\'s send reads the runs of the addressee and of the agents its walk asks, and no other run', async () => {
    const addressee = office.get(ADDRESSEE)!
    // Change the historical starter after ownership is set, so the measured walk must use the owner.
    t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run('person', THE_PERSON, addressee.id)
    const asked = new Set([addressee.id, office.get(NOTHING)!.id, office.get(BY_ID)!.id])
    const fromEveryRun = superiors.theReadingsForOneSend(PROJECT)
    const reach = fromEveryRun.reachOf(addressee.id)
    expect(reach?.was).toBe('nothing answering')
    const asItWas = superiors.theRoutingOfOneAddressee({ kind: 'agent', id: addressee.id }, reach as NonNullable<typeof reach> & { was: 'nothing answering' }, { kind: 'person', id: THE_PERSON }, fromEveryRun)
    expect(asItWas.passedOver.map((one) => one.who.id)).toEqual([office.get(NOTHING)!.id])
    expect(asItWas.to).toEqual({ kind: 'agent', id: office.get(BY_ID)!.id })

    const runs = everyRun()
    gaveBack.clear()
    recording = true
    // THROUGH `createRecord`, THE WRITE THE RECORD DOOR MAKES, and not the door: see the limits above.
    let stored = ''
    try {
      stored = t.api.createRecord({
        workspaceId: PROJECT,
        kind: 'message',
        title: 'A made-up question',
        data: { body: 'A made-up question.', to: [{ kind: 'agent', id: addressee.id }] },
        actor: t.api.HUMAN,
      }).id
    } finally {
      recording = false
    }

    const read = runs.filter((run) => gaveBack.has(run.id)).map((run) => run.id).sort()
    const theirs = runs.filter((run) => asked.has(worker.theAgentARunServes(run.data)?.id ?? '')).map((run) => run.id).sort()
    const others = read.filter((id) => !theirs.includes(id)).map((id) => `${id} from ${gaveBack.get(id) ?? ''}`)
    expect(read, `the runs the send read. Read and not theirs: ${others.join(' | ')}`).toEqual(theirs)
    // NOT VACUOUS: each of the three has a run to read, and most of the office's runs are another agent's.
    expect(theirs.length).toBe(3)
    expect(runs.length - theirs.length).toBeGreaterThan(10)

    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(stored) as { data: string }).data) as Record<string, unknown>
    expect(data['routed'], 'the routing the send stored').toEqual([JSON.parse(JSON.stringify(asItWas))])
  })
})
