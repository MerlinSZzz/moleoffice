// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old completed-presence fixture needed no seal. Only its finished session is explicitly historical now; running presence fixtures and every reachability assertion stay the same. */
import { historicalSession } from './synthetic-submission-fixtures.ts'
/**
 * WHETHER A PERSON OR AN AGENT CAN BE REACHED RIGHT NOW: three colours, worked out, never declared.
 *
 * Criterion M4 of design/messages/ACCEPTANCE.md: green is online, grey is offline, red is gone.
 * *A participant's state is short text they set themselves,
 * shown small under the name. Online is worked out, never declared: green when a run serving that
 * agent is alive now (a registered process that answers, or a session record with recent output);
 * grey when no run is alive but the agent exists and could be woken; red when the agent is retired
 * or its registry row is gone … and the page never guesses.*
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO INPUTS THE CRITERION NAMES ARE TESTED WITH REAL ROWS, SINCE 4 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * This file used to quote the sentence above and then test neither of the two things it names. It
 * tested an open connection, an arrival in `api_calls`, quiet, retired, unknown, and the stale-state
 * line. That is why a query that could never match anything shipped: `aProcessIsRunningFor` asked
 * `session_resources` for a bare agent id, and that column holds the actor type, a colon and the
 * actor id, so it matched nothing for every agent, always (problem `yyyb4TyGo-6i`).
 *
 * So both named inputs are now written as the product writes them. A process is registered through
 * `registerResource`, which is the same function `POST /api/resources` calls, and the operating
 * system it is checked against is a probe of this test's own. A run is a `session` record with
 * `ranAs` naming the agent and `lastOutputAt` saying when it last spoke, written by an actor that is
 * NOT that agent — which is the shape problem `WrXtovLyiGeW` measured.
 *
 * AND `api_calls` IS TESTED AS NOT AN INPUT. It was the only input that ever answered, and the top
 * of `src/server/lib/presence.ts` says in capitals that it cannot be one. A test that an input is
 * gone is the only thing that stops it coming back.
 *
 * SINCE 27 SEPTEMBER 2026 THE COLOUR IS THE ANSWERING READING'S (problem h1S1MLK-SQ1I). An agent is
 * green only when something is answering as it, which is what the chat's "Cannot reach" notice
 * reads. An open connection, a live process row and recent output are now said in the words beside
 * a grey dot, and the cases for them below say so.
 *
 * THE INACTIVE WORD (a decision): a grey agent is two facts wearing
 * one dot, and the word under the grey says which. The cases named for it below are proved against
 * this mutation: in `participantPresence`'s grey branch, replacing
 * `word: nobodyHasEverRunIt ? PRESENCE.inactive.word : COLOUR_WORDS.grey.word` with
 * `word: COLOUR_WORDS.grey.word` makes the never-run case red — the word would say Offline for an
 * agent nobody has ever run — while the ran-then-quiet case stays green either way.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { STATE_IS_STALE } from '../src/shared/messages.ts'
import { localStamp } from '../src/shared/time.ts'

type PresenceLib = typeof import('../src/server/lib/presence.ts')
type ChannelLib = typeof import('../src/server/lib/events.ts')
type RegistryLib = typeof import('../src/server/lib/participants.ts')
type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let presence: PresenceLib
let channel: ChannelLib
let registry: RegistryLib
let resources: ResourcesLib

const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
/**
 * The agent every case asks about. Its handle is `builder-x`, and the registry gives it an id of its
 * own when it is registered, so `BUILDER` is filled in by `beforeEach` from the registry row.
 */
let BUILDER: ParticipantRef
const HUMAN = { type: 'human', id: THE_PERSON } as const
const THE_AGENT = { type: 'agent', id: 'builder-x' } as const

/** The registry id of the agent with this handle. A presence reading is asked for by that id. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no registry row holds the handle ${handle}`).toBeDefined()
  return (row as { id: string }).id
}

/** Transcripts this file writes, so a session with a live process has a conversation to read. */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-reached-'))
let transcriptNumber = 0

/** A claude-code transcript written just now, which is what a working session leaves behind. */
function aTranscriptWrittenNow(): string {
  transcriptNumber += 1
  const path = join(transcripts, `reached-${String(transcriptNumber)}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  return path
}

beforeEach(async () => {
  t = await freshDb()
  presence = await import('../src/server/lib/presence.ts')
  channel = await import('../src/server/lib/events.ts')
  registry = await import('../src/server/lib/participants.ts')
  resources = await import('../src/server/lib/resources.ts')
  channel.forgetTheChannel()
  t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'agent',
    title: 'Builder X',
    data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    actor: HUMAN,
  })
  BUILDER = { kind: 'agent', id: theIdOf('builder-x') }
})

afterEach(() => {
  channel.forgetTheChannel()
  t.close()
})

afterAll(() => {
  rmSync(transcripts, { recursive: true, force: true })
})

/** Pretend this participant's messages panel is open, the way GET /api/events does. */
function aPageIsOpenFor(who: ParticipantRef): number {
  return channel.pageOpened({ workspaceId: 'panelx', who, send: () => undefined })
}

/** Something arrived from this actor at this moment. */
function somethingArrivedFrom(actorId: string, atMs: number): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, actor_type, actor_id, ' +
        "identity_source) VALUES (?, ?, 'record.read', 'read', '/api/records', 'GET', 0, 200, 1.0, 'agent', ?, 'headers')",
    )
    .run(`call-${String(atMs)}-${actorId}`, atMs, actorId)
}

/** An operating system holding exactly one process, so a registered pid can read as alive. */
function anOperatingSystemHolding(pid: number): void {
  const live = { pid, pgid: pid, ppid: 1, command: 'node the-run.js', startedAt: '2026-09-04 03:00:00' }
  resources.useOsProbe({
    platform: 'fake',
    processById: (asked: number) => (asked === pid ? live : null),
    processesInGroup: (pgid: number) => (pgid === pid ? [live] : []),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => undefined,
    stopContainer: () => undefined,
  })
}

/**
 * A run this agent registered a live process under, on the resource ledger, as the API writes one.
 *
 * SINCE M126b A LIVE PROCESS ALONE IS NOT ENOUGH: the session it belongs to must also carry a
 * transcript the office can read, or the reading says it cannot tell. So this writes one by
 * default — a session that is really working leaves one — and `readableTranscript: false` builds
 * the case where nothing but the process row is on record.
 */
function aProcessRegisteredBy(
  actor: { type: 'agent' | 'human'; id: string },
  pid: number,
  options: { readableTranscript?: boolean; servingAgent?: string } = {},
): void {
  anOperatingSystemHolding(pid)
  const readable = options.readableTranscript ?? true
  const session = t.api.createRecord({
    workspaceId: 'panelx',
    kind: 'session',
    title: 'the run that started it',
    data: {
      state: 'running',
      runtime: 'claude-code',
      // A RUN, when the case names the agent it serves: the answering reading counts it as a run going.
      ...(options.servingAgent === undefined ? {} : { servingAgent: options.servingAgent }),
      ...(readable
        ? {
            extra: {
              discovered: {
                tool: 'claude-code',
                externalId: `reached-${String(pid)}`,
                logPath: aTranscriptWrittenNow(),
                resumeCommand: null,
                startedAt: null,
                entryPoint: null,
              },
            },
          }
        : {}),
    },
    actor: HUMAN,
  }).id
  resources.registerResource({
    workspaceId: 'panelx',
    sessionRecordId: session,
    type: 'process',
    key: String(pid),
    actor,
  })
}

/**
 * A session record saying it ran as this agent and when it last wrote output.
 *
 * WRITTEN BY THE OWNER AND NOT BY THE AGENT, on purpose. The record says which agent the run served
 * in `ranAs`, which is a durable id; who filed the record is a free actor string and names nobody.
 * Problem `WrXtovLyiGeW` measured exactly this shape reading grey.
 */
function aRunOf(agentId: string, spokeAt: Date, state = 'running'): string {
  return (state === 'finished' ? (input: Parameters<TestDb['api']['createRecord']>[0]) => historicalSession(t, input) : t.api.createRecord)({
    workspaceId: 'panelx',
    kind: 'session',
    title: `a run serving ${agentId}`,
    data: {
      state,
      runtime: 'claude-code',
      ranAs: [{ workspaceId: 'panelx', agentId }],
      lastOutputAt: localStamp(spokeAt),
    },
    actor: HUMAN,
  }).id
}

// ============================================================ red

describe('red means there is nobody to reach', () => {
  it('is red for a name neither registry holds, and says so rather than answering nothing', () => {
    const reading = presence.participantPresence({ kind: 'agent', id: 'nobody-at-all' }, 'panelx')
    expect(reading.colour).toBe('red')
    expect(reading.word).toBe('Gone')
    expect(reading.says).toContain('nobody-at-all')
    expect(reading.from).toBeNull()
  })

  it('is red for a retired agent, and says why', () => {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'agent',
      title: 'Retired Y',
      data: { handle: 'retired-y', runtime: 'claude-code', state: 'retired', retiredBecause: 'the work it did is finished' },
      actor: HUMAN,
    })
    const reading = presence.participantPresence({ kind: 'agent', id: theIdOf('retired-y') }, 'panelx')
    expect(reading.colour).toBe('red')
    expect(reading.says).toContain('the work it did is finished')
  })
})

// ============================================================ a person

/**
 * A PERSON'S PRESENCE IS THEIR OWN ANSWER SINCE 4 SEPTEMBER 2026, AND THAT REPLACED WHAT IS BELOW.
 *
 * This block used to hold four cases proving a person was green while a page of theirs was open and
 * grey otherwise. Decision `wvfrwvuzsKF_` settles it the other way for a
 * person: online by default, and the person may set online, offline or invisible. Criterion M20 is written on it.
 *
 * NOTHING CHANGED FOR AN AGENT, and the block below this one still proves it. M4's rule stands where
 * it applies: an agent is a process, and whether a process is running is a fact about this machine.
 * A person is not a process, and the only thing that could be measured about them — whether a page
 * of theirs is open — is still measured, still reported, and no longer decides the colour.
 */
describe('a person says whether they are here, and the measurement is still reported', () => {
  it('is green before anybody has chosen, and says that is the default rather than a choice', () => {
    const reading = presence.participantPresence(OWNER, 'panelx', new Date(), OWNER)
    expect(reading.colour).toBe('green')
    expect(reading.choice).toBe('online')
    expect(reading.says).toContain('Not chosen')
  })

  it('is grey to everybody when they set themselves away', () => {
    registry.setParticipantPresence(OWNER, 'offline', OWNER)
    aPageIsOpenFor(OWNER)
    expect(presence.participantPresence(OWNER, 'panelx', new Date(), OWNER).colour).toBe('grey')
    expect(presence.participantPresence(OWNER, 'panelx', new Date(), BUILDER).colour).toBe('grey')
  })

  it('still says whether their panel is open, to a reader allowed to know', () => {
    const closed = presence.participantPresence(OWNER, 'panelx', new Date(), OWNER)
    expect(closed.says).toContain('Their messages panel is not open')
    aPageIsOpenFor(OWNER)
    const open = presence.participantPresence(OWNER, 'panelx', new Date(), OWNER)
    expect(open.says).toMatch(/said so \d+ seconds ago/)
    const withinSeconds = open.personAliveWithinSeconds
    const later = new Date(Date.now() + (withinSeconds + 5) * 1000)
    expect(presence.participantPresence(OWNER, 'panelx', later, OWNER).says).toContain(String(withinSeconds))
  })

  it('goes back to the default when the choice is cleared', () => {
    registry.setParticipantPresence(OWNER, 'offline', OWNER)
    expect(presence.participantPresence(OWNER, 'panelx', new Date(), OWNER).colour).toBe('grey')
    registry.setParticipantPresence(OWNER, '', OWNER)
    const reading = presence.participantPresence(OWNER, 'panelx', new Date(), OWNER)
    expect(reading.colour).toBe('green')
    expect(reading.says).toContain('Not chosen')
  })

  it('closes a page without changing the colour, because the page no longer decides it', () => {
    const id = aPageIsOpenFor(OWNER)
    expect(presence.participantPresence(OWNER, 'panelx', new Date(), OWNER).colour).toBe('green')
    channel.pageClosed(id)
    expect(presence.participantPresence(OWNER, 'panelx', new Date(), OWNER).colour).toBe('green')
  })
})

// ============================================================ an agent

describe('an agent is online when something is serving it', () => {
  it('is grey when no process is running for it and no run of it has written anything down', () => {
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.says).toContain('No process of this agent is running')
    expect(reading.from).toBeNull()
  })

  it('reads Inactive — registered, and no run recorded — under the same grey, on the owner\'s decision of 11 September 2026', () => {
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe('Inactive')
    // THE SENTENCE SAYS BOTH THE STATE AND WHAT WAS MEASURED, so a person can check it: this agent
    // is registered and has no run recorded, and the evidence is the three absences below.
    expect(reading.says).toContain('Registered, and no run recorded')
    expect(reading.says).toContain('No process of this agent is running')
    expect(reading.says).toContain('no run of it has written down any output')
  })

  it('draws the never-run agent under the same grey mark offline draws, with Inactive in the row\'s sentence', () => {
    // THE CHAT'S CONTACTS ROW DRAWS THE READING `everybodysPresence` HANDS IT (GET /api/presence):
    // the colour is the mark, and `word` and `says` are the dot's title and the row's sentence. The
    // colour is the same grey an agent that ran before and is quiet now gets, so inactive is not a
    // fourth colour, and only the words differ.
    const row = presence
      .everybodysPresence('panelx')
      .find((one) => one.who.kind === 'agent' && one.who.id === BUILDER.id)
    expect(row, 'the never-run agent is not in the roster the contacts row reads').toBeDefined()
    expect(row?.colour, 'inactive is drawn as a fourth colour').toBe('grey')
    expect(row?.word).toBe('Inactive')
    expect(row?.says).toContain('Registered, and no run recorded')
  })

  it('reads Offline, not Inactive, for an agent that has run before and is quiet now', () => {
    // A run still marked running whose newest output is 90 minutes old: past the alive-within window,
    // so grey, but a run of this agent has spoken, so the word under the grey is Offline, not the
    // never-run Inactive.
    aRunOf(BUILDER.id, new Date(Date.now() - 90 * 60 * 1000))
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe('Offline')
    expect(reading.says).toContain('minutes ago')
  })

  it('is grey while only a connection is held open for it, and says the connection is there (problem h1S1MLK-SQ1I)', () => {
    // AN OPEN CONNECTION CANNOT TAKE A MESSAGE BY ITSELF. Until 27 September 2026 it turned the dot
    // green while the chat drew "Cannot reach" under it. Now the colour is the answering reading's,
    // and the connection is only said in the words.
    aPageIsOpenFor(BUILDER)
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.from).toBeNull()
    expect(reading.says).toContain('Mole Office is holding a connection open for this agent')
    expect(reading.says).toContain('Nothing is answering as this agent right now')
  })

  // ---------------------------------------------------------------- input one: a live process

  it('is grey when a process it registered is alive and nothing answers as it, and says the process is there (problem h1S1MLK-SQ1I)', () => {
    // THE PROBLEM'S OWN CASE: a live process row, no hold and no run. Criterion M126: a live process
    // alone is not read as answering. Until 27 September 2026 this read green.
    aProcessRegisteredBy(THE_AGENT, 4242)
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe('Offline')
    expect(reading.from).toBeNull()
    expect(reading.says).toContain('A process registered for this agent is running on this machine')
    expect(reading.says).toContain('Nothing is answering as this agent right now')
  })

  it('is green when a run serving it has a live process, because the answering reading counts that run', () => {
    aProcessRegisteredBy(THE_AGENT, 4246, { servingAgent: BUILDER.id })
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('green')
    expect(reading.from, 'the reply names what is answering').toBe('a run answering as it')
    expect(reading.says).toContain('A run is going for this agent')
  })

  it('is Offline, with the cannot-read sentence, when the process is alive but no transcript was recorded', () => {
    // M126b: a live process row is not a session that can answer. Where no transcript the office can
    // read is on record, the word and the sentence are the ones the hold path gives — the same
    // judgement, not a second answer worked out here.
    aProcessRegisteredBy(THE_AGENT, 4245, { readableTranscript: false })
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour, 'a live process with no transcript is not online').toBe('grey')
    expect(reading.word).toBe('Offline')
    expect(reading.from).toBeNull()
    expect(reading.says).toContain('a process of it is alive now')
    expect(reading.says).toContain('no transcript was recorded for it')
    expect(reading.says).toContain('could not be read')
  })

  it('does not go green for a process somebody else registered', () => {
    aProcessRegisteredBy(HUMAN, 4243)
    expect(presence.participantPresence(BUILDER, 'panelx').colour).toBe('grey')
  })

  it('does not go green for a process that was released', () => {
    aProcessRegisteredBy(THE_AGENT, 4244)
    t.client.sqlite.prepare("UPDATE session_resources SET released_at = '2026-09-04 03:10:00'").run()
    expect(presence.participantPresence(BUILDER, 'panelx').colour).toBe('grey')
  })

  // ------------------------------------------------- input two: a run that wrote output recently

  it('is grey when a run of this agent only wrote output inside the window, and says how long ago (problem h1S1MLK-SQ1I)', () => {
    // OUTPUT WRITTEN DOWN A MINUTE AGO IS NOT SOMETHING ANSWERING NOW. Until 27 September 2026 it
    // turned the dot green; now it is said in the words beside the grey.
    aRunOf(BUILDER.id, new Date(Date.now() - 60_000))
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.word).toBe('Offline')
    expect(reading.from).toBeNull()
    expect(reading.says).toContain('wrote down output 1 minutes ago')
    expect(reading.says).toContain('Nothing is answering as this agent right now')
  })

  it('is grey again once that output is older than the setting allows, naming the number', () => {
    const withinMinutes = presence.participantPresence(BUILDER, 'panelx').agentAliveWithinMinutes
    aRunOf(BUILDER.id, new Date(Date.now() - (withinMinutes + 1) * 60_000))
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.says).toContain(String(withinMinutes))
  })

  it('does not read a run that has ended, however recently it last spoke', () => {
    aRunOf(BUILDER.id, new Date(), 'finished')
    expect(presence.participantPresence(BUILDER, 'panelx').colour).toBe('grey')
  })

  it('does not read a run that served a different agent', () => {
    aRunOf('somebody-else', new Date())
    expect(presence.participantPresence(BUILDER, 'panelx').colour).toBe('grey')
  })

  it('does not read a run that never wrote down when it last spoke', () => {
    t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'session',
      title: 'a run that says nothing about its clock',
      data: { state: 'running', runtime: 'claude-code', ranAs: [{ workspaceId: 'panelx', agentId: BUILDER.id }] },
      actor: HUMAN,
    })
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour, 'nobody said when it last spoke, so nobody said it is there').toBe('grey')
  })

  // ------------------------------------------------------------- what is deliberately not an input

  it('does not go green because a request arrived carrying this agent as its actor id', () => {
    // FROM BOTH NAMES IT HAS, its handle and its registry id, so neither one can turn it green.
    somethingArrivedFrom('builder-x', Date.now())
    somethingArrivedFrom(BUILDER.id, Date.now())
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour, 'an actor id is a free string and names no durable agent').toBe('grey')
    expect(reading.from).toBeNull()
  })
})

// ============================================================ the state beside the colour

describe('a state is what somebody wrote and the colour is what was measured', () => {
  it('keeps a dead agent state and says beside it that nothing is running to change it', () => {
    registry.setParticipantState(BUILDER, 'working on the wrist camera', BUILDER)
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('grey')
    expect(reading.state, 'the words it wrote are kept exactly').toBe('working on the wrist camera')
    expect(reading.stateMayBeStale).toBe(true)
    expect(reading.stateStaleBecause).toBe(STATE_IS_STALE)
  })

  it('does not call a state stale while something is serving the agent', () => {
    registry.setParticipantState(BUILDER, 'working on the wrist camera', BUILDER)
    aProcessRegisteredBy(THE_AGENT, 4247, { servingAgent: BUILDER.id })
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.colour).toBe('green')
    expect(reading.stateMayBeStale).toBe(false)
    expect(reading.stateStaleBecause).toBeNull()
  })

  it('says nothing about a state nobody has written', () => {
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.state).toBeNull()
    expect(reading.stateMayBeStale).toBe(false)
  })
})

// ============================================================ everybody at once

describe('everybody, in one read', () => {
  it('answers for every person and every agent in the registries', () => {
    const all = presence.everybodysPresence('panelx')
    // AND MOLE OFFICE, which is a participant from part 2e on. Nothing serves it, so it reads offline
    // like any agent with no run — which is the honest answer rather than a fourth colour.
    expect(all.map((one) => one.who.id).sort()).toEqual([THE_PERSON, BUILDER.id, theOfficesOwnId(t)].sort())
    expect(all.every((one) => ['green', 'grey', 'red'].includes(one.colour))).toBe(true)
    expect(all.every((one) => one.says.length > 10)).toBe(true)
  })
})

// ============================================================ presence reads no port row

/**
 * PRESENCE ASKS THE MACHINE ONLY ABOUT PROCESS ROWS (problem FqD2s_8-Ci6A).
 *
 * Until 30 September 2026 a presence read listed every unreleased row of the project, and each port
 * row asked the machine for its listening sockets, which walks /proc, before the rows were narrowed to
 * the agent's process rows. Ten agents in a project with 20 port rows made 200 such walks per read.
 * These cases count the walks with a probe of their own and check that the process judgements (alive,
 * gone, the pid given to another program, no start time to compare) still reach the dot as before.
 *
 * Replacing the SQL type predicate in `readRows` with `? IS NOT NULL` makes the
 * counting cases red. Reading all resources for an empty process list and removing the
 * workspace predicate separately prove the empty-agent and other-project cases.
 */
describe('a presence read asks the machine nothing about port rows', () => {
  const STARTED = '2026-09-04 03:00:00'
  let portWalks = 0

  /** An operating system where these pids run with these start times, counting each socket walk. */
  function aCountingOperatingSystem(running: Record<number, string>, listening: readonly number[] = []): void {
    const proc = (pid: number) =>
      running[pid] === undefined ? null : { pid, pgid: pid, ppid: 1, command: 'node the-run.js', startedAt: running[pid] }
    resources.useOsProbe({
      platform: 'fake',
      processById: (asked: number) => proc(asked),
      processesInGroup: (pgid: number) => {
        const one = proc(pgid)
        return one === null ? [] : [one]
      },
      listeningPorts: () => {
        portWalks += 1
        return listening.map((port) => ({ port, address: '127.0.0.1', protocol: 'tcp' as const, pid: 7000 }))
      },
      gpu: () => ({ available: true, processes: [] }),
      containers: () => ({ available: true, containers: [] }),
      locks: () => ({ files: [], unreadable: [] }),
      ownProcessGroup: () => 999_999,
      killProcessGroup: () => undefined,
      stopContainer: () => undefined,
    })
  }

  /** Three port rows nobody's presence is about, in a session of the owner's, plus one in `session`. */
  function unrelatedPortRows(session: string): void {
    const other = t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'session',
      title: 'a dev server somebody else started',
      data: { state: 'running', runtime: 'claude-code' },
      actor: HUMAN,
    }).id
    for (const port of [41001, 41002, 41003]) {
      resources.registerResource({ workspaceId: 'panelx', sessionRecordId: other, type: 'port', key: String(port), actor: HUMAN })
    }
    // AND ONE IN THE AGENT'S OWN SESSION: presence still has no use for it.
    resources.registerResource({ workspaceId: 'panelx', sessionRecordId: session, type: 'port', key: '41004', actor: THE_AGENT })
  }

  /** The agent's own process row, with its session, and the unrelated port rows beside it. */
  function theAgentsProcessAmongPortRows(pid: number): string {
    aCountingOperatingSystem({ [pid]: STARTED, 7000: STARTED }, [41001, 41002, 41003, 41004])
    const session = t.api.createRecord({
      workspaceId: 'panelx',
      kind: 'session',
      title: 'the run that started it',
      data: {
        state: 'running',
        runtime: 'claude-code',
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId: `ports-${String(pid)}`,
            logPath: aTranscriptWrittenNow(),
            resumeCommand: null,
            startedAt: null,
            entryPoint: null,
          },
        },
      },
      actor: HUMAN,
    }).id
    resources.registerResource({ workspaceId: 'panelx', sessionRecordId: session, type: 'process', key: String(pid), actor: THE_AGENT })
    unrelatedPortRows(session)
    return session
  }

  const LIVE = 'A process registered for this agent is running on this machine'

  it('reads one agent alive with four port rows in the project, and walks the sockets zero times', () => {
    theAgentsProcessAmongPortRows(5101)
    aCountingOperatingSystem({ 5101: STARTED, 7000: STARTED }, [41001, 41002, 41003, 41004])
    portWalks = 0
    const reading = presence.participantPresence(BUILDER, 'panelx')
    expect(reading.says, 'the live process is still found').toContain(LIVE)
    expect(portWalks, 'no port row was checked').toBe(0)
  })

  it('reads the whole roster with the same rows, and walks the sockets zero times', () => {
    theAgentsProcessAmongPortRows(5102)
    aCountingOperatingSystem({ 5102: STARTED, 7000: STARTED }, [41001, 41002, 41003, 41004])
    portWalks = 0
    const builder = presence.everybodysPresence('panelx').find((one) => one.who.id === BUILDER.id)
    expect(builder?.says).toContain(LIVE)
    expect(portWalks).toBe(0)
  })

  it('does not read the process as live once it has exited', () => {
    theAgentsProcessAmongPortRows(5103)
    aCountingOperatingSystem({ 7000: STARTED }, [41001, 41002, 41003, 41004])
    portWalks = 0
    expect(presence.participantPresence(BUILDER, 'panelx').says).not.toContain(LIVE)
    expect(portWalks).toBe(0)
  })

  it('does not read the process as live when its pid now belongs to a program started later', () => {
    theAgentsProcessAmongPortRows(5104)
    aCountingOperatingSystem({ 5104: '2026-09-05 08:00:00', 7000: STARTED }, [41001, 41002, 41003, 41004])
    portWalks = 0
    expect(presence.participantPresence(BUILDER, 'panelx').says).not.toContain(LIVE)
    expect(portWalks).toBe(0)
  })

  it('does not read the process as live when its row has no start time to compare', () => {
    theAgentsProcessAmongPortRows(5105)
    t.client.sqlite.prepare("UPDATE session_resources SET os_started_at = NULL WHERE type = 'process'").run()
    portWalks = 0
    expect(presence.participantPresence(BUILDER, 'panelx').says).not.toContain(LIVE)
    expect(portWalks).toBe(0)
  })

  it('does not probe port rows when the agent has no process rows', () => {
    aCountingOperatingSystem({ 7000: STARTED }, [41001, 41002, 41003, 41004])
    const session = t.api.createRecord({
      workspaceId: 'panelx', kind: 'session', title: 'no process',
      data: { state: 'running', runtime: 'claude-code' }, actor: HUMAN,
    }).id
    unrelatedPortRows(session)
    portWalks = 0
    expect(presence.participantPresence(BUILDER, 'panelx').says).not.toContain(LIVE)
    expect(resources.listResources({ workspaceId: 'elsewhere', type: 'process' })).toEqual([])
    expect(portWalks).toBe(0)
  })

  it('reads nothing of this project for a presence read in another project', () => {
    theAgentsProcessAmongPortRows(5106)
    portWalks = 0
    expect(presence.participantPresence(BUILDER, 'elsewhere').says).not.toContain(LIVE)
    expect(resources.listResources({ workspaceId: 'elsewhere', type: 'process' })).toEqual([])
    expect(portWalks).toBe(0)
  })
})
