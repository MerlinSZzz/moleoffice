// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE CHECK BEFORE AN AGENT'S SEND READS ONLY WHAT ITS ANSWER NEEDS, AND ANSWERS AS IT DID. Wave 13u round 37.
 *
 * Before an agent sends, criterion M110 asks whether each addressee can receive (`whatStopsAMessageTo` in
 * src/server/lib/messages.ts). It asked the whole presence reading, and that read every running run of the project:
 * 513 statements and 2,782 rows for one addressee on the made-up office of the live counts. The answer needs less. With
 * the setting that refuses an agent nothing answers as off, as it ships, only a red agent is refused, and red is read
 * from the registry row alone. With the setting on, the reading is asked from the addressee's own runs
 * (`theRunRowsOfOneReach` in src/server/lib/worker.ts).
 *
 * Every id, handle, sandbox and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. WHO MAY WRITE TO WHOM DOES NOT CHANGE (chapter 7). For every agent of one office and an id nothing answers to,
 *      with the setting off and on, the check answers as the old rule answers from the whole reading: green lets the
 *      message through, red refuses it, and grey refuses it only with the setting on. The office holds the states round
 *      36's test holds, an agent at work in an office terminal, and agents never run. Each reads as it was made to, so
 *      the comparison covers green, the three grey words and both reds.
 *   2. WITH THE SETTING OFF THE CHECK READS NO RUN, AND WITH IT ON ONLY THE ADDRESSEE'S OWN. Every value any statement
 *      gives back is seen while the check is asked of each agent. With the setting off no session record is among them.
 *      With it on, the only ones are runs that serve the addressee and the sessions its holds name.
 *   3. AN AGENT'S SEND READS ONLY THE RUNS OF THE AGENTS IT ASKS ABOUT. An agent sends to an agent nothing answers as,
 *      and the walk passes one agent and reaches a third. The session records read are exactly the runs of those three,
 *      and the routing stored is the one read from every run before the send.
 *   4. A LAPSED HOLD ON THE ADDRESSEE IS STILL RELEASED BY AN AGENT'S SEND. The check released it before this round.
 *      The routing's reading of the addressee's reach releases it now.
 *   5. THE DOT AND THE REACH GIVE THE SAME WORD. For a never-run agent and the agent at work in a terminal, the reach is
 *      nothing answering and `theWordOf()` is the dot's own word: Inactive and In a terminal. The dead-hold agent's
 *      hold is current, so its reach has no word and a person's send to it stays 201, while its dot says Offline.
 *   6. THE WORD IS READ ONLY WHEN IT IS ASKED FOR, AND ONLY THE ADDRESSEE'S ROWS. A reach call alone leaves a finished
 *      run that holds no message unread; `theWordOf()` reads it, and no other agent's session row.
 *
 * THE LIMITS.
 *   · Case 1 compares whether the message is let through, and the state and the setting the refusal names. The names
 *     beside them (the agent, its starter, the secretaries and the person) are read from the registry by code this
 *     round does not change, and the old rule is written out below rather than run.
 *   · With the setting on, the reading still lists every live process row of the project and reads each one's session
 *     record, to ask the machine which of them are alive (`listResources` in src/server/lib/resources.ts). The words
 *     beside a grey dot read every live process row with its session's data (`theUnreleasedProcessRows` in
 *     src/server/lib/presence.ts). Case 2 does not count what `listResources` reads, and the second gives back no
 *     session's id. Both are presence's own reading of the machine, and neither is changed here. With the setting off
 *     neither is asked, and case 2 counts everything.
 *   · Cases 3 and 4 write through `createRecord`, the write the record door makes, because the door's reply adds the
 *     list of what is already filed (`namesWhatIsAlreadyFiled`), and that list reads the id of every record.
 *
 * WHAT TURNS EACH RED, each tried in wave 13u round 37:
 *   · cases 2 and 3: put back the check as it was before this round, in src/server/lib/messages.ts;
 *   · case 2: leave out the line that answers from the registry row when the setting is off; hand
 *     `participantPresence` no rows of the addressee's reach;
 *   · case 1: let the setting-off line skip the red reading (a retired agent is let through); leave the running runs
 *     out of `theRunRowsOfOneReach` in src/server/lib/worker.ts (b by registry id reads as offline; case 3 is red too);
 *   · case 4: let `theAnsweringReading` in src/server/lib/worker.ts release no lapsed hold unless it is told to;
 *   · case 5: choose the word anywhere but the dot's one chooser in src/server/lib/presence.ts; let the reach's word
 *     read skip the addressee's rows or read another agent's; give a held handle's reach a word, by taking out the
 *     line in `whyThisAgentCannotBeReached` that returns it with none;
 *   · case 6: attach the word eagerly on the ordinary path, or make the reach's word read every session of the project.
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
let presence: typeof import('../src/server/lib/presence.ts')
let messages: typeof import('../src/server/lib/messages.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let env: typeof import('../src/server/lib/env.ts')
/** True while a check or a send runs; every value a statement gives back meanwhile is kept in `gaveBack`, with each statement that gave it. */
let recording = false
const gaveBack = new Map<unknown, Set<string>>()
/** What a statement is marked with when presence's listing of the live process rows asked it. Case 2 does not count it: see the limits. */
const FOR_THE_MACHINE = ' (asked by listResources)'
/** Every real child this file started, stopped by its group afterwards. */
const started: ChildProcess[] = []
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-the-check-before-a-send-'))
let made = 0

/** Each agent of the office by the state it was made in, and what its dot was made to read. */
const office = new Map<string, Agent>()
const madeToRead = new Map<string, string>()

const BY_ID = 'b. a live sandbox run naming its agent by registry id'
const WAITING = 'c. a run waiting for the next message, and cases 3 and 4 send from it'
const SUPERVISOR = 'f. a supervisor whose own conversation is past its wait'
const GONE_WITH_A_RUN = 'h. a hold whose session is gone, with a sandbox run under it'
const NOTHING = 'i. a run that ended, started by the agent of b by id'
const ADDRESSEE = 'i. a run past its wait, started by the agent of i, and case 3 sends to it'
const NOBODY: ParticipantRef = { kind: 'agent', id: 'made-up-nobody-answers-to-this' }

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
        const said = theMachineAsked() ? `${text}${FOR_THE_MACHINE}` : text
        if (method === 'iterate') return keepingEach(answer as Iterable<unknown>, said)
        for (const row of method === 'all' ? (answer as unknown[]) : [answer]) keepTheValuesOf(row, said)
        return answer
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  superiors = await import('../src/server/lib/superiors.ts')
  presence = await import('../src/server/lib/presence.ts')
  messages = await import('../src/server/lib/messages.ts')
  participants = await import('../src/server/lib/participants.ts')
  env = await import('../src/server/lib/env.ts')

  // a.
  {
    const agent = await anAgent('made-up-office-run-holder', 'a. a run the office started, holding the handle', 'green')
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
    const agent = await anAgent(`made-up-sandbox-runner-${String(letter)}`, state, 'green')
    await aLiveProcessFor(aSession({ state: 'running', runtime: 'claude-code', ...naming(agent), sandbox: aSandbox(`sandbox-run-${String(letter)}`) }))
  }
  // c.
  {
    const agent = await anAgent('made-up-waiter', WAITING, 'green')
    aSession(aWaitingRun(agent, 'made-up-waiting-conversation', inMinutes(30)))
  }
  // d. THE OLDER RUN IS FILED FIRST, so the newer one, whose wait is over, is the one still in the conversation.
  {
    const agent = await anAgent('made-up-moved-on', 'd. a conversation whose newest run is past its wait', 'grey, inactive')
    aSession(aWaitingRun(agent, 'made-up-moved-on-conversation', inMinutes(30)))
    aSession(aWaitingRun(agent, 'made-up-moved-on-conversation', inMinutes(-1)))
  }
  // e.
  {
    const agent = await anAgent('made-up-said-goodbye', 'e. a run inside its wait whose goodbye line is written', 'grey, inactive')
    const run = aSession(aWaitingRun(agent, 'made-up-ended-conversation', inMinutes(30)))
    made += 1
    record(`made-up-goodbye-${String(made)}`, 'message', { body: SYSTEM_LINES.aRunWaitedAndEnded(0).line, aboutRun: run, sentBy: { kind: 'agent', id: 'mole-office' } }, 'message-centre')
  }
  // f.
  {
    const agent = await anAgent('made-up-supervisor', SUPERVISOR, 'green')
    t.client.sqlite.prepare("UPDATE agents SET role = 'supervisor' WHERE id = ?").run(agent.id)
    aSession(aWaitingRun(agent, 'made-up-kept-conversation', inMinutes(-1)))
  }
  // g.
  {
    const agent = await anAgent('made-up-terminal-holder', 'g. a live session holding the handle', 'green')
    await hold(agent.handle, await aLiveSession())
  }
  // h. EACH SESSION NAMES A PROCESS OF ITS OWN THAT NO LONGER RUNS, and has no transcript. A hold that still beats
  // is the session's answer unless what is read of the session says it is gone, and an ended process is that sign.
  // The two numbers are above any pid the system hands out, so nothing runs under them.
  {
    const agent = await anAgent('made-up-left-behind', 'h. a hold whose session is gone', 'grey, offline')
    await hold(agent.handle, aSession({ state: 'running', runtime: 'claude-code', doing: 'A made-up terminal that has gone.', extra: anEndedProcess(2147483000) }))
  }
  {
    const agent = await anAgent('made-up-left-with-a-run', GONE_WITH_A_RUN, 'green')
    await hold(agent.handle, aSession({ state: 'running', runtime: 'claude-code', doing: 'Another made-up terminal that has gone.', extra: anEndedProcess(2147483001) }))
    await aLiveProcessFor(aSession({ state: 'running', runtime: 'claude-code', servingAgentId: agent.id, sandbox: aSandbox('under-a-gone-hold') }))
  }
  // i. Each has a run that held a message and ended, so its reach has a run to read and passes it by.
  const nothing = await anAgent('made-up-quiet', NOTHING, 'grey, inactive', BY_ID)
  aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: nothing.id, deliveringMessage: 'made-up-answered-message' })
  const addressee = await anAgent('made-up-addressee', ADDRESSEE, 'grey, inactive', NOTHING)
  aSession(aWaitingRun(addressee, 'made-up-over-conversation', inMinutes(-1)))
  const retired = await anAgent('made-up-retired', 'i. a retired agent, started by the agent of i', 'red, retired', NOTHING)
  await aLiveProcessFor(aSession({ state: 'running', runtime: 'claude-code', servingAgentId: retired.id }))
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'a made-up piece of work is done' WHERE id = ?").run(retired.id)
  // j. AN AGENT AT WORK IN ONE OF THE OFFICE'S TERMINALS, as lib/terminal-agents.ts files its run.
  {
    const agent = await anAgent('made-up-in-a-terminal', 'j. at work in an office terminal', 'grey, in a terminal')
    aSession({ state: 'running', runtime: 'claude-code', servingAgentId: agent.id, workingDirectory: '/made/up/folder', extra: { inATerminal: { terminal: 'made-up-terminal' } } })
    // AND A FINISHED RUN OF IT THAT HOLDS NO MESSAGE. The ordinary reach reads neither it nor any
    // run for the word; the word read asks for the addressee's latest session rows and finds it.
    aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: agent.id })
  }
  // k. NEVER RUN, one under each other reachable state that ends a walk.
  for (const [state, starter] of [
    ['k. never run, started by the agent of c', WAITING],
    ['k. never run, started by the agent of f', SUPERVISOR],
    ['k. never run, started by the agent of h with a run', GONE_WITH_A_RUN],
  ] as const) {
    made += 1
    await anAgent(`made-up-never-run-${String(made)}`, state, 'grey, inactive', starter)
  }
}, 120_000)

afterAll(async () => {
  delete process.env[env.THE_MESSAGE_DOOR_SETTING]
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

/** Whether the statement now asked is asked from inside `listResources` in src/server/lib/resources.ts. */
function theMachineAsked(): boolean {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 80
  try {
    return /\blistResources\b/.test(new Error().stack ?? '')
  } finally {
    Error.stackTraceLimit = limit
  }
}

/** Keep each value of one row, with each statement that gave it back. */
function keepTheValuesOf(row: unknown, text: string): void {
  const values = Array.isArray(row) ? row : typeof row === 'object' && row !== null ? Object.values(row) : [row]
  const statement = text.replace(/\s+/g, ' ').trim()
  for (const value of values) {
    const statements = gaveBack.get(value)
    if (statements === undefined) gaveBack.set(value, new Set([statement]))
    else statements.add(statement)
  }
}

function* keepingEach(rows: Iterable<unknown>, text: string): Generator<unknown> {
  for (const row of rows) {
    keepTheValuesOf(row, text)
    yield row
  }
}

/** Every value the statements of `act` give back, and what `act` answers. */
function whatItReads<T>(act: () => T): T {
  gaveBack.clear()
  recording = true
  try {
    return act()
  } finally {
    recording = false
  }
}

/**
 * Register an agent through the real door, started by the person or by the agent of another state, and write down what
 * its dot was made to read. Gives back its registry id and the id of its agent record.
 */
async function anAgent(handle: string, state: string, reads: string, startedBy?: string): Promise<Agent> {
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
  madeToRead.set(state, reads)
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

/** The `extra` of a session that recorded a process of its own, under a number nothing runs under. */
function anEndedProcess(pid: number): Record<string, unknown> {
  return { discovered: { pid, pidStartedAt: '2026-01-01 00:00:00' } }
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

/**
 * The runs read while `gaveBack` was kept, leaving out those only the listing of the live process rows gave back when
 * `notTheMachine` is set, and those of them that are not among `allowed`, with the statements that gave each back.
 */
function theRunsRead(runs: readonly { id: string }[], allowed: ReadonlySet<string>, notTheMachine = false): { read: string[]; others: string[] } {
  const by = (id: string): string[] => [...(gaveBack.get(id) ?? [])].filter((text) => !notTheMachine || !text.endsWith(FOR_THE_MACHINE))
  const read = runs.filter((run) => by(run.id).length > 0).map((run) => run.id).sort()
  return { read, others: read.filter((id) => !allowed.has(id)).map((id) => `${id} from ${by(id).map((text) => text.slice(0, 300)).join(' and ')}`) }
}

/** The ids of every run that serves one of these agents, by the one reader of a run's agent. */
function theRunsOf(agents: ReadonlySet<string>, runs: readonly { id: string; data: Record<string, unknown> }[]): Set<string> {
  return new Set(runs.filter((run) => agents.has(worker.theAgentARunServes(run.data)?.id ?? '')).map((run) => run.id))
}

/** With the setting that refuses an agent nothing answers as set to `on`, and as it was afterwards. */
function withTheSetting<T>(on: boolean, act: () => T): T {
  expect(env.theDoorRefusesAnAgentWithNoSessionAndNoRun(), 'this file starts with the setting off, as it ships').toBe(false)
  if (on) process.env[env.THE_MESSAGE_DOOR_SETTING] = '1'
  try {
    return act()
  } finally {
    delete process.env[env.THE_MESSAGE_DOOR_SETTING]
  }
}

/**
 * THE OLD RULE, from the whole reading as the check asked it before this round, with no rows handed in: green lets the
 * message through, red refuses it, and grey refuses it only with the setting on. Gives back what the refusal names.
 */
function theOldAnswer(to: ParticipantRef, now: Date): { state: string; bySetting: boolean } | null {
  const reading = presence.participantPresence(to, PROJECT, now)
  if (reading.colour === 'green') return null
  if (reading.colour === 'red') {
    const row = participants.readParticipant(to)
    return { state: row !== null && 'retired' in row && row.retired ? 'retired' : 'not registered', bySetting: false }
  }
  if (!env.theDoorRefusesAnAgentWithNoSessionAndNoRun()) return null
  const states: Record<string, string> = {
    [presence.GREY_PRESENCE_WORDS.offline]: 'offline',
    [presence.GREY_PRESENCE_WORDS.inactive]: 'inactive',
    [presence.GREY_PRESENCE_WORDS.inATerminal]: 'in a terminal',
  }
  return { state: states[reading.word] ?? `a grey word nobody mapped: ${reading.word}`, bySetting: true }
}

/** Every agent of the office by its state, and the id nothing answers to. */
const everybody = (): [string, ParticipantRef][] => [
  ...[...office].map(([state, agent]): [string, ParticipantRef] => [state, { kind: 'agent', id: agent.id }]),
  ['l. an id nothing answers to', NOBODY],
]

describe('the check before an agent\'s send reads only what its answer needs', () => {
  it('1. every agent and an unknown id is let through or refused as the old rule says, with the setting off and on', () => {
    const now = new Date()
    const read = new Map<string, string>()
    for (const on of [false, true]) {
      withTheSetting(on, () => {
        for (const [state, to] of everybody()) {
          const before = theOldAnswer(to, now)
          const after = messages.whatStopsAMessageTo(to, PROJECT, now)
          expect(after === null ? null : { state: after.state, bySetting: after.bySetting }, `${state}, the setting ${on ? 'on' : 'off'}`).toEqual(before)
          if (on) read.set(state, before === null ? 'green' : `${before.bySetting ? 'grey' : 'red'}, ${before.state}`)
        }
      })
    }
    // NOT TWO EMPTY ANSWERS: each state read as it was made to, so green, the three grey words and both reds are compared.
    expect(Object.fromEntries(read)).toEqual({ ...Object.fromEntries(madeToRead), 'l. an id nothing answers to': 'red, not registered' })
  })

  it('2. with the setting off the check reads no run, and with it on only the runs of the agent it asks about', () => {
    const runs = everyRun()
    const off: string[] = []
    const on: string[] = []
    let readWithTheSettingOn = 0
    for (const [state, to] of everybody()) {
      withTheSetting(false, () => whatItReads(() => messages.whyThisAgentCannotReceiveAMessage(to, PROJECT)))
      off.push(...theRunsRead(runs, new Set()).others.map((one) => `${state}: ${one}`))
      const holds = t.client.sqlite.prepare('SELECT session_record_id AS session FROM handle_holds WHERE agent_id = ?').all(to.id) as { session: string }[]
      const its = new Set([...theRunsOf(new Set([to.id]), runs), ...holds.map((one) => one.session)])
      withTheSetting(true, () => whatItReads(() => messages.whyThisAgentCannotReceiveAMessage(to, PROJECT)))
      const asked = theRunsRead(runs, its, true)
      readWithTheSettingOn += asked.read.length
      on.push(...asked.others.map((one) => `${state}: ${one}`))
    }
    expect(off, 'the runs the check read with the setting off').toEqual([])
    expect(on, 'the runs of another agent the check read with the setting on').toEqual([])
    // NOT VACUOUS: with the setting on the check did read runs, and most of the office's runs serve another agent.
    expect(readWithTheSettingOn).toBeGreaterThan(5)
    expect(runs.length).toBeGreaterThan(15)
  })

  it('3. an agent\'s send reads the runs of the addressee and of the agents its walk asks, and no other run', () => {
    const sender = office.get(WAITING)!
    const addressee = office.get(ADDRESSEE)!
    t.client.sqlite.prepare('UPDATE agents SET started_by_id = ? WHERE id = ?').run(sender.id, addressee.id)
    const asked = new Set([addressee.id, office.get(NOTHING)!.id, office.get(BY_ID)!.id])
    const fromEveryRun = superiors.theReadingsForOneSend(PROJECT)
    const reach = fromEveryRun.reachOf(addressee.id)
    expect(reach?.was).toBe('nothing answering')
    const from: ParticipantRef = { kind: 'agent', id: sender.id }
    const asItWas = superiors.theRoutingOfOneAddressee({ kind: 'agent', id: addressee.id }, reach as NonNullable<typeof reach> & { was: 'nothing answering' }, from, fromEveryRun)
    expect(asItWas.passedOver.map((one) => one.who.id)).toEqual([office.get(NOTHING)!.id])
    expect(asItWas.to).toEqual({ kind: 'agent', id: office.get(BY_ID)!.id })

    const runs = everyRun()
    // THROUGH `createRecord`, THE WRITE THE RECORD DOOR MAKES, and not the door: see the limits above.
    const stored = withTheSetting(false, () =>
      whatItReads(
        () =>
          t.api.createRecord({
            workspaceId: PROJECT,
            kind: 'message',
            title: 'A made-up question from an agent',
            data: { body: 'A made-up question from an agent.', to: [{ kind: 'agent', id: addressee.id }] },
            actor: { type: 'agent', id: sender.handle },
          }).id,
      ),
    )
    const theirs = theRunsOf(asked, runs)
    const { read, others } = theRunsRead(runs, theirs)
    expect(read, `the runs the send read. Read and not theirs: ${others.join(' | ')}`).toEqual([...theirs].sort())
    // NOT VACUOUS: each of the three has a run to read, and most of the office's runs are another agent's.
    expect(theirs.size).toBe(3)
    expect(runs.length - theirs.size).toBeGreaterThan(10)

    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(stored) as { data: string }).data) as Record<string, unknown>
    expect(data['sentBy'], 'the message is the agent\'s own').toEqual(from)
    expect(data['routed'], 'the routing the send stored').toEqual([JSON.parse(JSON.stringify(asItWas))])
  })

  it('4. an agent\'s send releases a lapsed hold on the addressee, as the check did before', async () => {
    const sender = office.get(WAITING)!
    const addressee = await anAgent('made-up-gone-quiet', 'm. a hold that has lapsed', 'grey, offline')
    await hold(addressee.handle, aSession({ state: 'running', runtime: 'claude-code', doing: 'A made-up terminal that went quiet.' }))
    // A DAY WITHOUT A BEAT, which is past every window a hold has.
    t.client.sqlite.prepare('UPDATE handle_holds SET last_heard_at = ? WHERE agent_id = ?').run(localStamp(new Date(Date.now() - 86_400_000)), addressee.id)
    const releasedAt = (): unknown[] =>
      (t.client.sqlite.prepare('SELECT released_at AS releasedAt FROM handle_holds WHERE agent_id = ?').all(addressee.id) as { releasedAt: unknown }[]).map((one) => one.releasedAt)
    expect(releasedAt(), 'the hold is there and not released before the send').toEqual([null])
    withTheSetting(false, () =>
      t.api.createRecord({
        workspaceId: PROJECT,
        kind: 'message',
        title: 'A made-up question to an agent gone quiet',
        data: { body: 'A made-up question to an agent gone quiet.', to: [{ kind: 'agent', id: addressee.id }] },
        actor: { type: 'agent', id: sender.handle },
      }),
    )
    expect(releasedAt(), 'the hold after the send').toEqual([expect.any(String)])
  })

  it('5. the dot and the reach give the same word for the never-run agent and the terminal, and none for a held handle', () => {
    const cases: readonly [string, string][] = [
      ['k. never run, started by the agent of c', presence.GREY_PRESENCE_WORDS.inactive],
      ['j. at work in an office terminal', presence.GREY_PRESENCE_WORDS.inATerminal],
    ]
    for (const [state, word] of cases) {
      const agent = office.get(state)!
      const reach = worker.whyThisAgentCannotBeReached(agent.id, PROJECT) as
        | (NonNullable<ReturnType<typeof worker.whyThisAgentCannotBeReached>> & { theWordOf?: () => string })
        | null
      expect(reach?.was, state).toBe('nothing answering')
      expect(reach?.theWordOf?.(), `${state}: the reach's word`).toBe(word)
      expect(presence.participantPresence({ kind: 'agent', id: agent.id }, PROJECT).word, `${state}: the dot's word`).toBe(word)
    }
    // NOT TWO EMPTY ANSWERS: each word is the one the fixture was made to read.
    expect(cases.map(([, word]) => word)).toEqual(['Inactive', 'In a terminal'])
    // A CURRENT HOLD WHOSE SESSION IS GONE STILL HOLDS THE HANDLE: the waiter takes the message when it comes, so the
    // reach has no word and a person's send stays 201. The dot still says Offline.
    const left = office.get('h. a hold whose session is gone')!
    const reach = worker.whyThisAgentCannotBeReached(left.id, PROJECT) as
      | (NonNullable<ReturnType<typeof worker.whyThisAgentCannotBeReached>> & { theWordOf?: () => string })
      | null
    expect(reach?.was, 'h: nothing is answering behind the hold').toBe('nothing answering')
    expect(reach?.theWordOf, "h: the held handle's reach has a word").toBeUndefined()
    expect(presence.participantPresence({ kind: 'agent', id: left.id }, PROJECT).word, "h: the dot's word").toBe(presence.GREY_PRESENCE_WORDS.offline)
  })

  it('6. the word is read only when it is asked for, and then only the addressee\'s session rows', () => {
    const agent = office.get('j. at work in an office terminal')!
    const runs = everyRun()
    const its = theRunsOf(new Set([agent.id]), runs)
    // THE FINISHED RUN THAT HOLDS NO MESSAGE IS READ BY THE WORD AND BY NOTHING ON THE ORDINARY PATH.
    const onlyTheWordAsksFor = runs.filter((run) => run.data['state'] === 'finished' && worker.theAgentARunServes(run.data)?.id === agent.id)
    expect(onlyTheWordAsksFor, 'the fixture has no run only the word read asks for').toHaveLength(1)
    const theRow = onlyTheWordAsksFor[0]!.id
    const reach = whatItReads(() => worker.whyThisAgentCannotBeReached(agent.id, PROJECT)) as
      | (NonNullable<ReturnType<typeof worker.whyThisAgentCannotBeReached>> & { theWordOf?: () => string })
      | null
    expect(reach?.was).toBe('nothing answering')
    // A REACH CALL ALONE RECORDS NO WORD READ: the row only the word asks for is not touched.
    expect(gaveBack.has(theRow), 'the ordinary reach read the word').toBe(false)
    // THE WORD READ ASKS FOR IT, AND READS NO OTHER AGENT'S SESSION ROWS.
    expect(whatItReads(() => reach?.theWordOf?.())).toBe('In a terminal')
    const { read, others } = theRunsRead(runs, its)
    expect(others, `the word read another agent's runs: ${others.join(' | ')}`).toEqual([])
    expect(read, 'the word read did not read the addressee’s own runs').toContain(theRow)
  })
})
