// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT OF ANY HARNESS REGISTERS, HOLDS ITS HEARTBEAT AND IS SERVED.
 *
 * The agent kind's `runtime` takes any harness's word. The list of runtimes the office has an adapter for decides only
 * what the office can start by itself. A harness outside that list is still registered, holds its handle, and has its
 * messages wait for its own waiter.
 *
 * WHAT IS PROVED HERE, through the doors a caller drives, against a test office in this process:
 *
 *   1. An agent registered as `workbuddy`, and one registered under a word made up here, keeps that word on its page
 *      reading, holds its handle with the word stored as given, and the hold's answer says the one sentence that the
 *      office cannot start it. A message to it is handed out by the waiting door its waiter reads.
 *   2. A known runtime holds as before, and its answer carries no such sentence.
 *   3. The chat's reading: while the hold of such a harness beats, the handle door says a live session answers and the
 *      dot is green, with a sentence saying the office cannot see inside that harness. After the hold lapses, neither.
 *      A known harness is read by the same rule: while a claude-code hold beats and nothing the office can read of its
 *      session shows it gone, it is a live session, and the dot's sentence says it rests on the hold alone.
 *   4. The message worker says it cannot start such a harness, and the waiter's table says what it does with one.
 *
 * WHAT IS NOT PROVED HERE: the waiter as a process (tests/the-waiter-of-any-harness-prints-no-claude-line.test.ts),
 * and the model doors and pages (tests/an-agent-of-any-harness-chooses-its-model-itself.test.ts).
 *
 * THE LAPSE WINDOW IS TURNED DOWN for the case that waits for it, through the settings the product reads, and put back
 * after every case.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoIsAnsweringSays } from '../src/shared/handles.ts'
import { whatTheOfficeDoesForAHarnessWithNoAdapter } from '../src/shared/participants.ts'
import { whatTheWaiterDoes } from '../src/shared/waking.ts'
import { readStoredWord } from '../src/shared/i18n.ts'

/** A made-up person key, so a new handle's registration is admitted at once. */
const PERSON_KEY = randomBytes(32).toString('hex')

/** The harness this package was asked about, and a word made up here that no list names. */
const WORKBUDDY = 'workbuddy'
const MADE_UP = 'a-harness-made-up-here'

/** A folder that is neither the root nor a home. It is only a word on the registration; nothing is made there. */
const FOLDER = '/tmp/mole-office-any-harness-test/work'

const BEAT = 'MOLE_OFFICE_HANDLE_BEAT_SECONDS'
const LAPSE = 'MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS'
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'

let t: TestDb
let app: FastifyInstance
let here = ''

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

/** One agent as the registration left it: its handle, its key's headers and the session record it filed. */
interface Registered {
  handle: string
  headers: Record<string, string>
  session: string
}

/**
 * Register a session as itself, over the loopback listener, because `POST /api/agents/register-myself` is a `local`
 * route, exactly as tests/a-registration-records-its-start-folder.test.ts asks it.
 */
async function register(handle: string, runtime: string): Promise<Registered> {
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: { ...asAgent(handle), 'x-mole-office-key': PERSON_KEY },
    body: JSON.stringify({ handle, name: `Agent ${handle}`, runtime, workingDirectory: FOLDER }),
  })
  const text = await res.text()
  expect(res.status, text.slice(0, 400)).toBe(201)
  // `record` IS THE AGENT RECORD AND `session` THE SESSION RECORD the registration filed (api/participants.ts).
  const said = JSON.parse(text) as { session: string; headers: Record<string, string> }
  return { handle, headers: { ...asAgent(handle), ...said.headers }, session: said.session }
}

async function hold(who: { handle: string; headers: Record<string, string> }, session: string, runtime: string) {
  return await app.inject({
    method: 'POST',
    url: `/api/handles/${who.handle}/hold`,
    headers: who.headers,
    payload: { session, machine: 'a-machine', runtime },
  })
}

/** The registry id behind a handle, which is what a message is addressed to. */
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

async function theDot(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: `/api/presence/agent/${await idOf(handle)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { presence: { colour: string } }).presence.colour
}

/** The dot's colour and the sentence beside it. */
async function theDotsWords(handle: string): Promise<{ colour: string; says: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/presence/agent/${await idOf(handle)}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { presence: { colour: string; says: string } }).presence
}

/** A stored sentence's words before the part the reading fills in, read from the one place the sentence is made. */
function theWordsBeforeTheReading(key: 'heldSession.rests.onTheHoldAlone'): string {
  return readStoredWord(key).split('{read}')[0] ?? ''
}

/** An agent and a session filed straight onto the records, with no process and no transcript the office can read. */
function anAgentWithASession(handle: string, runtime: string): { handle: string; headers: Record<string, string>; session: string } {
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
    data: { state: 'running', runtime, doing: `answering as ${handle}` },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  return { handle, headers: asAgent(handle), session }
}

const letTimePass = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Every hold a case took, let go after it through the door a session uses. */
const taken: { handle: string; headers: Record<string, string>; session: string }[] = []

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterEach(async () => {
  delete process.env[BEAT]
  delete process.env[LAPSE]
  delete process.env[GRACE]
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
})

describe('an agent of a harness the office has no adapter for', () => {
  for (const [handle, word] of [
    ['a-workbuddy-agent', WORKBUDDY],
    ['a-made-up-harness-agent', MADE_UP],
  ] as const) {
    it(`registers as ${word}, keeps the word, holds its heartbeat with the one sentence, and its message is handed to its waiter`, async () => {
      const made = await register(handle, word)

      // THE PAGE READER GIVES THE STORED WORD, and no adapter runtime for it.
      const page = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}/profile`, headers: AS_THE_PERSON })
      expect(page.statusCode, page.body.slice(0, 300)).toBe(200)
      const participant = (page.json() as { participant: { harness?: string | null; runtime?: string | null } }).participant
      expect(participant.harness).toBe(word)
      expect(participant.runtime).toBeNull()

      // THE HOLD REFUSES NO HARNESS WORD, stores it as given, and says the one sentence.
      const held = await hold(made, made.session, word)
      expect(held.statusCode, held.body.slice(0, 400)).toBe(201)
      taken.push(made)
      const said = held.json() as { hold: { runtime: string }; cannotStart: string | null }
      expect(said.hold.runtime).toBe(word)
      // READ FROM THE ONE PLACE THE SENTENCE IS MADE, so a copy here cannot stay green while the answer goes out of date.
      expect(said.cannotStart).toBe(whatTheOfficeDoesForAHarnessWithNoAdapter(word))

      // A MESSAGE TO IT WAITS FOR ITS OWN WAITER, and the waiting door its waiter reads hands it out. A person's letter
      // to an agent may answer 409 in a test office, and the letter is stored either way.
      const letter = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: AS_THE_PERSON,
        payload: { kind: 'message', title: `a letter for ${word}`, data: { body: `a letter for ${word}`, to: [{ kind: 'agent', id: await idOf(handle) }] } },
      })
      expect([201, 409], letter.body.slice(0, 400)).toContain(letter.statusCode)
      const messageId = (letter.json() as { record: { id: string } }).record.id
      const waiting = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers: made.headers })
      expect(waiting.statusCode, waiting.body.slice(0, 400)).toBe(200)
      expect((waiting.json() as { waiting: { messageId: string }[] }).waiting.map((m) => m.messageId)).toContain(messageId)
    }, 30_000)
  }

  it('a known runtime holds as before, and its answer carries no sentence about a harness the office cannot start', async () => {
    const made = await register('a-claude-code-agent', 'claude-code')

    const held = await hold(made, made.session, 'claude-code')

    expect(held.statusCode, held.body.slice(0, 400)).toBe(201)
    taken.push(made)
    const said = held.json() as { hold: { runtime: string }; cannotStart: string | null }
    expect(said.hold.runtime).toBe('claude-code')
    expect(said.cannotStart).toBeNull()
  }, 30_000)
})

describe('the chat reads such an agent by its hold', () => {
  it('shows it answering while its hold beats, says the office cannot see inside that harness, and not after the hold lapses', async () => {
    const agent = anAgentWithASession('a-workbuddy-in-the-chat', WORKBUDDY)
    process.env[BEAT] = '1'
    process.env[LAPSE] = '2'
    process.env[GRACE] = '3'
    expect((await hold(agent, agent.session, WORKBUDDY)).statusCode).toBe(201)
    taken.push(agent)

    const beating = await theHandleDoor(agent.handle)
    expect(beating.how).toBe('a live session')
    expect(beating.says).toBe(whoIsAnsweringSays('a live session', { machine: 'a-machine', runtime: WORKBUDDY }))
    expect(beating.says).toContain(`cannot see inside ${WORKBUDDY}`)
    expect(await theDot(agent.handle)).toBe('green')

    await letTimePass(3500)

    // THE HOLD HAS LAPSED, and is released by this read. Only now is the agent not answering.
    expect((await theHandleDoor(agent.handle)).how).toBe('nobody')
    expect(await theDot(agent.handle)).not.toBe('green')
  }, 30_000)

  it('reads a known harness by the same rule: a beating claude-code hold with nothing read of its session is a live session on its hold', async () => {
    const agent = anAgentWithASession('a-claude-code-in-the-chat', 'claude-code')
    expect((await hold(agent, agent.session, 'claude-code')).statusCode).toBe(201)
    taken.push(agent)

    const reading = await theHandleDoor(agent.handle)

    // THE HOLD BEATS, and its session has no process and no transcript on record. Nothing read turns it grey, so the
    // hold is the answer, and the dot's sentence says that is all it rests on.
    expect(reading.how).toBe('a live session')
    const dot = await theDotsWords(agent.handle)
    expect(dot.colour).toBe('green')
    expect(dot.says).toContain(theWordsBeforeTheReading('heldSession.rests.onTheHoldAlone'))
    expect(dot.says).toContain('no transcript was recorded for it')
  }, 30_000)
})

describe('what the office does with such a harness when a message arrives', () => {
  it('the message worker says it cannot start it, and the waiter prints the message and stops', async () => {
    // THE FIXTURE tests/a-message-to-a-dsh-worker-waits-and-says-why.test.ts gives the same function, with this harness.
    const { whyNotNow } = await import('../src/worker/index.ts')
    const waiting = { handle: 'a-workbuddy-agent', runtime: WORKBUDDY, retired: false, inspection: false } as unknown as Parameters<typeof whyNotNow>[0]
    const settings = { checkout: process.cwd(), runs: 2, env: { PATH: '/usr/bin' } } as unknown as Parameters<typeof whyNotNow>[1]
    expect(whyNotNow(waiting, settings, 0)).toEqual({
      because: readStoredWord('devWords.runtime.noAdapterNoRun', { handle: 'a-workbuddy-agent', runtime: WORKBUDDY }),
    })
    expect(whatTheWaiterDoes(WORKBUDDY, null)).toEqual({
      act: 'print-it-and-stop',
      says: readStoredWord('devWords.waking.notMeasured', { runtime: WORKBUDDY }),
    })
  })
})
