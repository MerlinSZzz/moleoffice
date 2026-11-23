// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT OF ANY TOOL READS AS ANSWERING WHILE ITS HOLD BEATS, AND WHAT THE OFFICE READS ONLY TURNS THAT GREY.
 *
 * THE RULE. A hold that beats is the base answer for every tool: while it beats, the agent reads as answering. For a
 * tool whose session the office can read inside, which is claude-code and codex today, four signs turn that answer to
 * not answering, and nothing the office reads turns it back:
 *
 *   1. the transcript's last real line is a stop cause the person must act on;
 *   2. a message was handed over after the transcript last grew, and has waited unread longer than the unread limit;
 *   3. a process recorded as the session's own has ended now, and its transcript has not grown within the lapse;
 *   4. the session's record names an office terminal, and its run in that terminal has ended.
 *
 * A check that cannot read anything leaves the answer standing and changes only the sentence. The sentence beside the
 * dot says what the answer rests on: the hold alone, or the hold and what was read. A hold past its lapse is no hold.
 *
 * WHAT IS PROVED HERE, through the handle door and the presence door of a test office in this process:
 *
 *   1. an opencode agent and a kimi agent, each registered through the registration door, with its waiter holding the
 *      handle and nothing else of it registered, read answering while the hold beats, and the sentence says the office
 *      cannot read inside that tool; once the hold has lapsed, neither reads answering;
 *   2. each of the four signs turns a beating claude-code or codex hold grey, with its own sentence on the handle door
 *      and beside the dot;
 *   3. a claude-code hold with no transcript on record, and one whose transcript cannot be read, read answering, and
 *      the sentence says the answer rests on the hold alone and names what could not be read;
 *   4. a recorded process that has ended does not turn the hold grey while the transcript is fresh, and the sentence
 *      says the answer rests on the hold and the transcript.
 *
 * WHAT IS NOT PROVED HERE:
 *
 *   · a run the office started in its own terminal. Its record says the office started it for an agent, so the handle
 *     door reads its hold as a run before it reads the session behind the hold, and sign 4 is not reached for it. The
 *     sign 4 case here names an office terminal on a session record that is not such a run;
 *   · a kept hold, past its lapse and inside its grace: it reads as it did before this rule, by the older tests of
 *     answering;
 *   · the waiter as a process, and a process of the session that is still alive.
 *
 * NOTHING HERE IS REAL. There is no real office, nothing on port 28787, and nothing in the home folder: HOME points at a
 * folder of this file's own for the whole file, because a codex session's rollout is looked for under it, and is put
 * back afterwards. The transcripts are in a folder of this file's own, removed afterwards. A pid above any pid a
 * machine hands out stands for a recorded process that has ended. The timing settings are set per case and put back
 * after each.
 */

import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoIsAnsweringSays } from '../src/shared/handles.ts'
import { readStoredWord } from '../src/shared/i18n.ts'

/** A made-up person key, so a new handle's registration is admitted at once. */
const PERSON_KEY = randomBytes(32).toString('hex')

/** A folder that is neither the root nor a home. It is only a word on the registration; nothing is made there. */
const FOLDER = '/tmp/mole-office-any-tool-hold-test/work'

const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'
const UNREAD = 'MOLE_OFFICE_HANDLE_UNREAD_AFTER_SECONDS'
const SETTINGS = [BEAT, LAPSE, GRACE, UNREAD] as const

/**
 * PIDS NO PROCESS CAN RUN UNDER. Linux hands out pids up to 4194304 at most, macOS up to 99998, so nothing runs under
 * these, and a record that names one names a process that has ended.
 */
const ENDED_CLAUDE_PID = 2147483100
const ENDED_CLAUDE_PID_FRESH_LOG = 2147483101
const ENDED_BRIDGE_PID = 2147483102
const TERMINAL_HOLDER_PID = 2147483103

/** The words of the limit line, as a provider writes them. Made up here in the measured shape. */
const THE_LIMIT_WORDS = "You've hit your session limit · resets 7:10pm (Europe/London)"

/** The office terminal the sign 4 case names, and the sentence its ended record carries. Both made up here. */
const A_TERMINAL = 'a-terminal-made-up-here'
const WHY_ITS_RUN_ENDED = 'Its program in the terminal ended, as this test wrote it.'

let t: TestDb
let app: FastifyInstance
let here = ''
/** The words the unread sentence opens with after its opening, read from answering.ts once it is loaded. */
let itHasReadNothingSince = ''

/** HOME as it was before this file, put back after it. */
const homeBefore = process.env['HOME']
/** This file's own home, so a codex rollout is looked for here and never in a real one. */
const home = mkdtempSync(join(tmpdir(), 'mole-office-any-tool-hold-home-'))
/** This file's own transcripts. */
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-any-tool-hold-transcripts-'))

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** One agent with the session it holds for: its handle, the headers it sends and its session record. */
interface Held {
  handle: string
  headers: Record<string, string>
  session: string
}

/** Every hold a case took, let go after it through the door a session uses. */
const taken: Held[] = []

/** The keys of the stored sentences this rule says, so each is read from the one place it is made. */
type WordKeyHere = Parameters<typeof readStoredWord>[0]

/**
 * THE FIXED PIECES OF A STORED SENTENCE, the words between the parts a reading fills in. A sentence that carries every
 * piece in order is that sentence, whatever was filled in.
 */
function thePiecesOf(key: WordKeyHere): string[] {
  const words = readStoredWord(key)
  expect(words.startsWith('⟦'), `no words are stored under ${key}`).toBe(false)
  return words
    .split(/\{[a-zA-Z]+\}/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
}

/** That a sentence is the stored one under `key`: every fixed piece, in order. */
function expectTheSentence(says: string, key: WordKeyHere): void {
  let from = 0
  for (const piece of thePiecesOf(key)) {
    const at = says.indexOf(piece, from)
    expect(at, `"${piece}" of ${key} is not in order in: ${says}`).toBeGreaterThanOrEqual(0)
    from = at + piece.length
  }
}

/**
 * Register a session as itself, over the loopback listener, because `POST /api/agents/register-myself` is a `local`
 * route, as tests/an-agent-of-any-harness-holds-its-heartbeat.test.ts asks it.
 */
async function register(handle: string, runtime: string): Promise<Held> {
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: { ...asAgent(handle), 'x-mole-office-key': PERSON_KEY },
    body: JSON.stringify({ handle, name: `Agent ${handle}`, runtime, workingDirectory: FOLDER }),
  })
  const text = await res.text()
  expect(res.status, text.slice(0, 400)).toBe(201)
  const said = JSON.parse(text) as { session: string; headers: Record<string, string> }
  return { handle, headers: { ...asAgent(handle), ...said.headers }, session: said.session }
}

/** The waiter's hold, through the door the waiter uses, with the runtime it says. */
async function hold(who: Held, runtime: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${who.handle}/hold`,
    headers: who.headers,
    payload: { session: who.session, machine: 'a-machine', runtime },
  })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
  const said = reply.json() as { hold: { runtime: string; state: string }; cannotStart: string | null }
  expect(said.hold.runtime).toBe(runtime)
  taken.push(who)
}

/** The registry id behind a handle, which is what a message and the presence door are addressed to. */
async function idOf(handle: string): Promise<string> {
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as {
    agents?: { id: string; handle: string }[]
  }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function theHandleDoor(handle: string): Promise<{ how: string; says: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${handle}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { answering: { how: string; says: string } }).answering
}

/** The dot's colour and the sentence beside it. */
async function theDotsWords(handle: string): Promise<{ colour: string; says: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/presence/agent/${await idOf(handle)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { presence: { colour: string; says: string } }).presence
}

/** One transcript line, as Claude Code writes an assistant turn. */
function aTurnAt(at: Date, text: string): string {
  return `${JSON.stringify({ type: 'assistant', timestamp: at.toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`
}

/** A claude-code transcript of this file's own, whose last line is the one given. */
function aTranscript(name: string, lines: string): string {
  const path = join(transcripts, `${name}.jsonl`)
  writeFileSync(path, lines)
  return path
}

/** The claude-code limit line, in the shape measured on a machine: a synthetic assistant line with HTTP 429. */
function aLimitLineAt(at: Date): string {
  return `${JSON.stringify({
    type: 'assistant',
    timestamp: at.toISOString(),
    error: 'rate_limit',
    isApiErrorMessage: true,
    apiErrorStatus: 429,
    message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: THE_LIMIT_WORDS }] },
  })}\n`
}

/** The discovery stamp of a claude-code transcript, as the session hook files it. */
function aStamp(name: string, logPath: string): Record<string, unknown> {
  return { tool: 'claude-code', externalId: `any-tool-${name}`, logPath, resumeCommand: null, startedAt: null, entryPoint: null }
}

/** An agent and its session filed straight onto the records, with what the case says of the session and nothing else. */
function anAgentWithASession(handle: string, runtime: string, data: Record<string, unknown> = {}): Held {
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: `Agent ${handle}`,
    data: { handle, runtime, state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })
  const session = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `A ${runtime} session`,
    data: { state: 'running', runtime, doing: `answering as ${handle}`, ...data },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  return { handle, headers: asAgent(handle), session }
}

/** That the handle door and the dot both read this agent as not answering, with the same sentence. */
async function expectGrey(handle: string): Promise<string> {
  const door = await theHandleDoor(handle)
  expect(door.how, door.says).toBe('nobody')
  const dot = await theDotsWords(handle)
  expect(dot.colour, dot.says).toBe('grey')
  expect(dot.says).toBe(door.says)
  return door.says
}

/** That the handle door and the dot both read this agent as a live session, and the dot's sentence. */
async function expectGreen(handle: string): Promise<string> {
  const door = await theHandleDoor(handle)
  expect(door.how, door.says).toBe('a live session')
  const dot = await theDotsWords(handle)
  expect(dot.colour, dot.says).toBe('green')
  return dot.says
}

const letTimePass = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(async () => {
  // THE HOME IS THIS FILE'S OWN, SET BEFORE ANY MODULE READS IT, and put back in afterAll.
  process.env['HOME'] = home
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  itHasReadNothingSince = (await import('../src/server/lib/answering.ts')).IT_HAS_READ_NOTHING_SINCE
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterEach(async () => {
  for (const setting of SETTINGS) delete process.env[setting]
  for (const took of taken.splice(0)) {
    await app.inject({
      method: 'POST',
      url: `/api/handles/${took.handle}/release`,
      headers: took.headers,
      payload: { session: took.session, because: 'the test that took it has finished' },
    })
  }
})

afterAll(async () => {
  await app.close()
  t.close()
  if (homeBefore === undefined) delete process.env['HOME']
  else process.env['HOME'] = homeBefore
  rmSync(home, { recursive: true, force: true })
  rmSync(transcripts, { recursive: true, force: true })
})

// ============================================================ a tool the office cannot read inside

describe('an agent of a tool the office cannot read inside', () => {
  for (const runtime of ['opencode', 'kimi'] as const) {
    it(`reads answering while its ${runtime} waiter's hold beats, says the office cannot read inside ${runtime}, and not once the hold has lapsed`, async () => {
      process.env[BEAT] = '1'
      process.env[LAPSE] = '2'
      process.env[GRACE] = '3'
      const agent = await register(`an-${runtime}-agent`, runtime)
      await hold(agent, runtime)

      // THE HOLD BEATS, and nothing else of the session is registered. The hold is the answer.
      const door = await theHandleDoor(agent.handle)
      expect(door.how, door.says).toBe('a live session')
      expect(door.says).toBe(whoIsAnsweringSays('a live session', { machine: 'a-machine', runtime }))
      expect(door.says).toContain(`cannot see inside ${runtime}`)
      const dot = await theDotsWords(agent.handle)
      expect(dot.colour, dot.says).toBe('green')
      // THE BASIS: the hold alone, because the office cannot read inside this tool.
      expectTheSentence(dot.says, 'heldSession.rests.onTheHoldInsideUnread')
      expect(dot.says).toContain(runtime)

      await letTimePass(3500)

      // THE HOLD HAS LAPSED, past its grace too, and is released by this read. Only now is the agent not answering.
      expect((await theHandleDoor(agent.handle)).how).toBe('nobody')
      expect((await theDotsWords(agent.handle)).colour).not.toBe('green')
    }, 30_000)
  }
})

// ============================================================ the hold alone, for a tool the office can read

describe('a beating claude-code hold where nothing could be read', () => {
  it('reads answering with no transcript on record, and the sentence says it rests on the hold alone', async () => {
    const agent = anAgentWithASession('a-claude-code-with-no-transcript', 'claude-code')
    await hold(agent, 'claude-code')

    const says = await expectGreen(agent.handle)

    expectTheSentence(says, 'heldSession.rests.onTheHoldAlone')
    expect(says).toContain('no transcript was recorded for it')
    expect(says).toContain('no process was recorded for it')
  }, 30_000)

  it('reads answering when its transcript cannot be read, and the sentence says what could not be read', async () => {
    const missing = join(transcripts, 'a-transcript-never-written.jsonl')
    const agent = anAgentWithASession('a-claude-code-with-a-missing-transcript', 'claude-code', {
      extra: { discovered: aStamp('missing', missing) },
    })
    await hold(agent, 'claude-code')

    const says = await expectGreen(agent.handle)

    expectTheSentence(says, 'heldSession.rests.onTheHoldAlone')
    expect(says).toContain('its transcript could not be read')
  }, 30_000)
})

// ============================================================ the four signs

describe('what the office reads of a claude-code or codex session turns a beating hold grey', () => {
  it('sign 1: the transcript ends on a stop cause the person must act on', async () => {
    const logPath = aTranscript('sign-1', aTurnAt(new Date(Date.now() - 60_000), 'working') + aLimitLineAt(new Date()))
    const agent = anAgentWithASession('a-claude-code-at-its-limit', 'claude-code', { extra: { discovered: aStamp('sign-1', logPath) } })
    await hold(agent, 'claude-code')

    const says = await expectGrey(agent.handle)

    // THE SENTENCE QUOTES THE PROVIDER'S OWN WORDS and says it is not answering.
    expect(says).toContain(agent.session)
    expect(says).toContain(`"${THE_LIMIT_WORDS}"`)
    expect(says).toContain('so it is not answering.')
  }, 30_000)

  it('sign 2: a message handed over after the transcript last grew waits unread past the limit', async () => {
    process.env[UNREAD] = '1'
    const logPath = aTranscript('sign-2', aTurnAt(new Date(Date.now() - 30_000), 'the last thing it did'))
    const agent = anAgentWithASession('a-claude-code-that-read-nothing', 'claude-code', { extra: { discovered: aStamp('sign-2', logPath) } })
    await hold(agent, 'claude-code')

    // BEFORE THE HAND-OVER the hold beats and the transcript grew within the lapse: answering, on both.
    const before = await expectGreen(agent.handle)
    expectTheSentence(before, 'heldSession.rests.onTheHoldAndWhatWasRead')
    expect(before).toContain('its transcript last grew')

    const letter = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'message', title: 'a question', data: { body: 'a question', to: [{ kind: 'agent', id: await idOf(agent.handle) }] } },
    })
    expect([201, 409], letter.body.slice(0, 400)).toContain(letter.statusCode)
    const messageId = (letter.json() as { record: { id: string } }).record.id
    const took = await app.inject({
      method: 'POST',
      url: `/api/handles/${agent.handle}/took`,
      headers: AS_THE_PERSON,
      payload: { session: agent.session, message: messageId },
    })
    expect(took.statusCode, took.body.slice(0, 400)).toBe(200)

    // PAST THE LIMIT, with a margin for the stored stamp's whole seconds. The hold still beats.
    await letTimePass(1600)
    const says = await expectGrey(agent.handle)

    expect(says).toContain(agent.session)
    expect(says).toContain(itHasReadNothingSince)
    expect(says).toContain('so it is not answering.')
  }, 30_000)

  it("sign 3, claude-code: its recorded process has ended and its transcript has not grown within the lapse", async () => {
    const logPath = aTranscript('sign-3', aTurnAt(new Date(Date.now() - 2 * 60 * 60 * 1000), 'two hours ago'))
    const agent = anAgentWithASession('a-claude-code-whose-process-ended', 'claude-code', {
      extra: { discovered: { ...aStamp('sign-3', logPath), pid: ENDED_CLAUDE_PID, pidStartedAt: '2026-01-01 00:00:00' } },
    })
    await hold(agent, 'claude-code')

    const says = await expectGrey(agent.handle)

    expectTheSentence(says, 'heldSession.grey.itsProcessEnded')
    expect(says).toContain(agent.session)
    expect(says).toContain(String(ENDED_CLAUDE_PID))
    expect(says).toContain('its transcript last grew')
  }, 30_000)

  it('sign 3, codex: the bridge its record names has ended and no rollout of it grew', async () => {
    const thread = 'a-codex-thread-made-up-here'
    const agent = anAgentWithASession('a-codex-whose-bridge-ended', 'codex', {
      providerSession: thread,
      extra: { codexBridge: { pid: ENDED_BRIDGE_PID, script: 'a-bridge-made-up-here.mjs', thread } },
    })
    await hold(agent, 'codex')

    const says = await expectGrey(agent.handle)

    expectTheSentence(says, 'heldSession.grey.itsProcessEnded')
    expect(says).toContain(agent.session)
    expect(says).toContain(String(ENDED_BRIDGE_PID))
  }, 30_000)

  it('sign 3 waits for the transcript: an ended process beside a transcript that grew within the lapse still answers', async () => {
    const logPath = aTranscript('sign-3-fresh', aTurnAt(new Date(), 'speaking now'))
    const agent = anAgentWithASession('a-claude-code-speaking-after-pid-ended', 'claude-code', {
      extra: { discovered: { ...aStamp('sign-3-fresh', logPath), pid: ENDED_CLAUDE_PID_FRESH_LOG, pidStartedAt: '2026-01-01 00:00:00' } },
    })
    await hold(agent, 'claude-code')

    const says = await expectGreen(agent.handle)

    // THE BASIS NAMES BOTH: the transcript that grew, and the recorded process that has ended.
    expectTheSentence(says, 'heldSession.rests.onTheHoldAndWhatWasRead')
    expect(says).toContain('its transcript last grew')
    expect(says).toContain(String(ENDED_CLAUDE_PID_FRESH_LOG))
  }, 30_000)

  it('sign 4: the session names an office terminal and its run there has ended', async () => {
    const logPath = aTranscript('sign-4', aTurnAt(new Date(), 'speaking now'))
    const agent = anAgentWithASession('a-claude-code-in-an-office-terminal', 'claude-code', {
      extra: {
        discovered: aStamp('sign-4', logPath),
        inATerminal: { terminal: A_TERMINAL, holder: { pid: TERMINAL_HOLDER_PID, startedAt: null } },
      },
    })
    await hold(agent, 'claude-code')

    // WHILE ITS RUN THERE HAS NOT ENDED, the hold beats and the transcript is fresh: answering.
    expectTheSentence(await expectGreen(agent.handle), 'heldSession.rests.onTheHoldAndWhatWasRead')

    // THE TERMINAL'S RUN ENDS, as the office writes it on the record when the program in the terminal exits.
    t.api.patchRecord(agent.session, { dataPatch: { state: 'finished', closedBecause: WHY_ITS_RUN_ENDED } }, { type: 'human', id: THE_PERSON })

    const says = await expectGrey(agent.handle)

    expectTheSentence(says, 'heldSession.grey.itsTerminalEnded')
    expect(says).toContain(agent.session)
    expect(says).toContain(A_TERMINAL)
    expect(says).toContain(WHY_ITS_RUN_ENDED)
  }, 30_000)
})
