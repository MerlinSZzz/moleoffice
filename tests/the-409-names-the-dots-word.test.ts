// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE 409 FOR A REGISTERED AGENT NOTHING HOLDS NAMES THE PRESENCE DOT'S OWN GREY WORD.
 *
 * A requirement, decision `60sbc5I-bwKx` and message `lAyNRBpLTU-J` are behind this test, and the requirement is filed
 * as a decision. A person's send to an agent that is registered, not retired, and that nothing
 * holds — no session holds its handle and no run is going for it — is stored addressed to it, routed up its chain of
 * starters as before, and answered 409 with the routing and a reason in the dot's own word. The word is not a new
 * label: it is chosen by the dot's one chooser, from the addressee's own latest session rows, read only when the
 * person's send needs the reason. An agent's send to the same addressee stays 201 with the routing, a reachable
 * addressee stays 201, a retired addressee keeps its 409 and its retired reason, and a message to a person or a group
 * stays 201.
 *
 * WHAT IS MEASURED, each case with its own assertion:
 *   · a person to an unheld agent: the letter is stored with `data.to` unchanged, `data.routed` holds
 *     one entry whose `to` is the reachable starter, the answer is 409, `error` is the routed line,
 *     and `reason` contains the dot's word (read once through `participantPresence`) and not
 *     "retired". The reason names nobody to write to instead: not the person's name from the person's
 *     row, and not the opening words of the "write to … instead" clause. The routed line names the
 *     starter the letter reached (message 4VgZaaDwjwVY, problem 715SyTdn87k4);
 *   · a person to a reachable agent: 201 with no routing;
 *   · a person to a retired agent: 409 with the unchanged retired reason;
 *   · an agent to the same unheld agent: 201, routed, no `error` and no `reason`;
 *   · a person to a person and a person to a group: 201;
 *   · an id no row answers: the door's existing refusal, unchanged;
 *   · a person to an agent whose handle a session holds, with nothing behind the hold: 201, no `error`
 *     and no `reason`, because the waiter holding the handle takes the message when it comes. The
 *     reach still reads it as nothing answering, which is checked first, so the case is the one that
 *     answered 409 by mistake (problem u6BDSdOAbeYK);
 *   · POST /api/records/check for the unheld addressee: 200, `wouldAnswerStatus` 409 and the same
 *     reason in the dot's word, naming nobody to write to instead, and nothing stored; for the
 *     reachable addressee 201 and no reason;
 *   · THE LIMIT OF THE WORD, at its edge: an agent with a run in one of the office's terminals that has
 *     not ended, and `THE_LAST_RUNS_READ` - 1 newer runs, gets the dot's word, In a terminal. With
 *     `THE_LAST_RUNS_READ` newer runs the dot still says In a terminal and the 409 does not. The limit
 *     is said at `theGreyWordOfAnUnansweredAgent` in src/server/lib/presence.ts.
 *
 * The failed presence read is not here: tests/a-message-to-an-agent-the-office-could-not-tell-about-
 * is-not-routed.test.ts measures it, and it must stay `notRouted` rather than become a 409.
 *
 * THE CHAIN IS BUILT SO THE SUCCESSOR IS REACHABLE AND IS NOT THE PERSON: the unheld addressee is
 * started by an agent with a run waiting for the next message, which the reach reads as reachable
 * with no process and no browser. This file starts neither.
 *
 * MUTATIONS, each after a control run and each restored:
 *   · in `whyThisAgentCannotBeReached` (src/server/lib/worker.ts), the line that returns a held handle's
 *     reach with no word taken out: the held case is red;
 *   · in the check path of POST /api/records (src/server/api/records.ts), the 409 taken out of the
 *     check's status: the check case is red;
 *   · in `theGreyWordOfAnUnansweredAgent`, every run read instead of `THE_LAST_RUNS_READ`: the case past
 *     the edge is red;
 *   · in `theReasonOfAnUnheldAgent` (src/server/lib/records.ts), the whole line of `theCannotReceiveLine`
 *     said again, with the person named first as someone to write to: the unheld case and the check case
 *     are red;
 *   · the same whole line with no name recorded for the person, so it says "the person": the same two
 *     cases are red, on the opening words of the clause;
 *   · in the English words, `{reached}` taken out of the routed line's ending for a starter: the unheld
 *     case is red, on the starter's name.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { IN_A_TERMINAL_WORD } from '../src/shared/terminals.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** One routed entry, as the reply and the stored record carry it. */
interface TheRouting {
  for: { kind: string; id: string }
  because: string
  to: { kind: string; id: string } | null
  line: string
}

/** A reply, as this file reads it. */
interface Said {
  status: number
  said: Record<string, unknown>
}

let t: TestDb
let app: FastifyInstance

/** The name `reachable` is registered under, which the routed line names as where the letter went. */
const REACHABLE_NAME = 'Reachable Agent'
/** The agent with a run waiting for the next message, so the reach reads it as reachable. */
let reachable = ''
/** The registered, not retired addressee nothing holds, started by `reachable`. */
let unheld = ''
/** The retired addressee. */
let retired = ''
/** A registered agent that may send to `unheld`. */
let sender = ''
/** A group the person and `reachable` are in. */
let group = ''
/** A registered agent whose handle a session holds, with no live session or run behind the hold. */
let held = ''
/** An agent at work in a terminal, with one run fewer after it than the 409's word reads. */
let atTheEdge = ''
/** The same, with as many runs after it as the 409's word reads. */
let pastTheEdge = ''

/** Register an agent through the real door and give back its registry id. */
async function register(handle: string, name: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name, runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** Point one agent's registry row at its starter. */
function startedBy(agentId: string, starter: { kind: string; id: string }): void {
  t.client.sqlite
    .prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
    .run(starter.kind, starter.id, agentId)
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, starter.kind === 'agent' ? starter.id : null, agentId, 'id')
  }
}

/** A run of this agent waiting for the next message: the reach reads this agent as reachable. */
function aRunWaitingForTheNextMessage(agentId: string): void {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'A made-up run waiting for the next message',
    data: {
      state: 'finished',
      runtime: 'claude-code',
      servingAgentId: agentId,
      deliveringMessage: 'made-up-answered-message',
      providerSession: 'made-up-conversation',
      waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)),
    },
    actor: t.api.HUMAN,
  })
}

/** Take the handle for one session, through the door a waiter uses. */
async function hold(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/hold`,
    headers: AS_THE_PERSON,
    payload: { session, machine: 'made-up-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A session record of this agent, with `data` as given. */
function aSessionOf(agentId: string, handle: string, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title,
    data: { runtime: 'claude-code', servingAgent: handle, servingAgentId: agentId, ...data },
    actor: t.api.HUMAN,
  }).id
}

/**
 * An agent started by `reachable`, with a run in one of the office's terminals that has not ended, and `newer` finished
 * runs after it. The terminal run is moved to an older time, so it is older than each of them by time and not only by
 * filing.
 */
async function anAgentInATerminalBehind(handle: string, newer: number): Promise<string> {
  const id = await register(handle, `Agent ${handle}`)
  startedBy(id, { kind: 'agent', id: reachable })
  const terminalRun = aSessionOf(id, handle, 'A made-up run in a terminal', {
    state: 'running',
    workingDirectory: '/made-up/the-folder',
    extra: { inATerminal: { terminal: 'made-up-terminal' } },
  })
  const stamp = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(terminalRun) as { at: string }).at
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2020${stamp.slice(4)}`, terminalRun)
  // THE FINISHED RUNS ARE FIXTURES, filed as the presence tests file theirs: a finish through the ordinary write needs a
  // submission, and these runs submit nothing.
  for (let i = 0; i < newer; i++) {
    historicalSession(t, {
      workspaceId: WORKSPACE,
      kind: 'session',
      title: `A made-up finished run ${String(i)}`,
      data: { state: 'finished', runtime: 'claude-code', servingAgent: handle, servingAgentId: id },
      actor: t.api.HUMAN,
    })
  }
  return id
}

/**
 * THE 409'S REASON NAMES NOBODY TO WRITE TO INSTEAD: not the person, who is the one who sent the letter, and not the
 * opening of the clause that names whom to write to. The person's name is read from the person's own row, which is
 * the row the office reads, and the fixture is checked to hold one, so the first check is not empty.
 */
async function expectNobodyToWriteTo(reason: string): Promise<void> {
  const { readParticipant } = await import('../src/server/lib/participants.ts')
  const thePersonsName = readParticipant({ kind: 'person', id: THE_PERSON })?.name.trim() ?? ''
  expect(thePersonsName, 'the fixture: the person has a name on their row').not.toBe('')
  expect(reason, 'the reason names the person who sent the letter').not.toContain(thePersonsName)
  const theInsteadOpening = en['cannotReceive.instead'].split('{whom}')[0] ?? ''
  expect(theInsteadOpening, 'the fixture: the clause has words before whom it names').not.toBe('')
  expect(reason, 'the reason tells the sender whom to write to instead').not.toContain(theInsteadOpening)
}

/** One check over the check door of the same write. */
async function checkAs(headers: Record<string, string>, data: Record<string, unknown>): Promise<Said> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records/check',
    headers,
    payload: { kind: 'message', title: String(data['body']).slice(0, 40), data },
  })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** How many message records the office holds. */
function messagesStored(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

/** One send over the one door every message write arrives at. */
async function sendAs(headers: Record<string, string>, data: Record<string, unknown>): Promise<Said> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: String(data['body']).slice(0, 40), data },
  })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The record a reply named. */
function theRecord(said: Record<string, unknown>): { id: string; data: Record<string, unknown> } {
  return said['record'] as { id: string; data: Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  reachable = await register('made-up-reachable', REACHABLE_NAME)
  aRunWaitingForTheNextMessage(reachable)
  unheld = await register('made-up-unheld', 'Quiet Agent')
  startedBy(unheld, { kind: 'agent', id: reachable })
  retired = await register('made-up-retired', 'Pike')
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'a made-up piece of work is done' WHERE id = ?").run(retired)
  sender = await register('made-up-sender', 'Sender Agent')
  held = await register('made-up-held', 'Held Agent')
  startedBy(held, { kind: 'agent', id: reachable })
  await hold('made-up-held', aSessionOf(held, 'made-up-held', 'A made-up session holding the handle', { state: 'running' }))
  const { THE_LAST_RUNS_READ } = await import('../src/server/lib/presence.ts')
  atTheEdge = await anAgentInATerminalBehind('made-up-at-the-edge', THE_LAST_RUNS_READ - 1)
  pastTheEdge = await anAgentInATerminalBehind('made-up-past-the-edge', THE_LAST_RUNS_READ)

  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: AS_THE_PERSON,
    payload: {
      name: 'The made-up gripper group',
      because: 'The person and the reachable agent talk here.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
        { who: { kind: 'agent', id: reachable }, because: 'It works on the gripper.' },
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  group = (opened.json() as { group: { id: string } }).group.id
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

// ============================================================ the unheld addressee

describe("a person's send to a registered agent nothing holds", () => {
  it('stores the letter addressed to it, routes it, answers 409 and names the dot’s own word', async () => {
    const body = 'A note to an agent nothing holds'
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: unheld }], body })

    // THE LETTER IS STORED, STILL ADDRESSED TO THE AGENT.
    expect(said.status, JSON.stringify(said.said)).toBe(409)
    const record = theRecord(said.said)
    expect(record.data['to']).toEqual([{ kind: 'agent', id: unheld }])
    expect(record.data['body']).toBe(body)

    // THE ROUTING IS STORED AND IN THE REPLY, AND ITS `to` IS THE REACHABLE STARTER.
    const routed = record.data['routed'] as TheRouting[]
    expect(routed).toHaveLength(1)
    expect(routed[0]!.for).toEqual({ kind: 'agent', id: unheld })
    expect(routed[0]!.to).toEqual({ kind: 'agent', id: reachable })
    expect((said.said['routed'] as TheRouting[])[0]!.line).toBe(routed[0]!.line)

    // THE WHOLE REFUSAL IS THE ROUTED LINE, AS BEFORE.
    expect(said.said['error']).toBe(routed[0]!.line)

    // THE SHORT REASON NAMES THE DOT'S OWN GREY WORD, read once for this same agent, and is not
    // the retired sentence.
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    const word = participantPresence({ kind: 'agent', id: unheld }, WORKSPACE).word
    const reason = String(said.said['reason'] ?? '')
    expect(reason, 'the answer carries no reason').not.toBe('')
    expect(reason.toLowerCase(), `the reason does not name ${word}`).toContain(word.toLowerCase())
    expect(reason.toLowerCase(), 'the reason calls an unheld agent retired').not.toContain('retired')

    // THE REASON NAMES NOBODY TO WRITE TO, AND THE ROUTED LINE NAMES WHERE THE LETTER WENT (4VgZaaDwjwVY,
    // problem 715SyTdn87k4). Only the person gets this 409, so naming the person would tell the sender to write to the
    // sender.
    await expectNobodyToWriteTo(reason)
    expect(String(said.said['error']), 'the routed line does not name the starter the letter reached').toContain(REACHABLE_NAME)
  })
})

// ============================================================ the cases that stay as they were

describe('the cases the new 409 does not change', () => {
  it('answers 201 for a person’s send to a reachable agent, with no routing', async () => {
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: reachable }], body: 'A note somebody can take' })
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(said.said['routed']).toBeUndefined()
    expect(said.said['error']).toBeUndefined()
    expect(said.said['reason']).toBeUndefined()
    expect(theRecord(said.said).data['to']).toEqual([{ kind: 'agent', id: reachable }])
  })

  it('keeps the retired 409 and its unchanged reason', async () => {
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: retired }], body: 'A note a retired agent cannot take' })
    expect(said.status, JSON.stringify(said.said)).toBe(409)
    expect((said.said['routed'] as TheRouting[])[0]!.line).toBe(said.said['error'])
    expect(said.said['reason']).toBe('Pike is retired.')
  })

  it('answers 409 and routes an agent’s send to the same unheld agent', async () => {
    const said = await sendAs(asAgent(sender), { to: [{ kind: 'agent', id: unheld }], body: 'A note from another agent' })
    expect(said.status).toBe(409)
    expect(theRecord(said.said).data['to']).toEqual([{ kind: 'agent', id: unheld }])
    const routed = said.said['routed'] as TheRouting[]
    expect(routed, 'an agent’s routed send lost its routing').toHaveLength(1)
    expect(routed[0]!.to).toEqual({ kind: 'agent', id: reachable })
    expect(said.said['error']).toBe(routed[0]!.line)
    expect(typeof said.said['reason']).toBe('string')
  })

  it('answers 201 for a person’s send to a person', async () => {
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'person', id: THE_PERSON }], body: 'A note to the person' })
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(said.said['routed']).toBeUndefined()
  })

  it('answers 201 for a person’s send to a group', async () => {
    const said = await sendAs(AS_THE_PERSON, { toGroup: group, body: 'A note into the group' })
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(said.said['routed']).toBeUndefined()
  })

  it('keeps the door’s existing refusal for an id no row answers', async () => {
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: 'made-up-no-agent-answers' }], body: 'A note to nobody at all' })
    expect(said.status).toBe(400)
    expect(String(said.said['error'])).toContain('Nothing is registered as the agent "made-up-no-agent-answers"')
    expect(said.said['routed']).toBeUndefined()
  })
})

// ============================================================ a handle a session holds

describe('a person’s send to an agent whose handle a session holds', () => {
  it('stays 201 with no error and no reason, though nothing is answering behind the hold', async () => {
    // THE CONTROL: the reach reads this agent as nothing answering, with a hold, which is the case that answered 409.
    const { theAnsweringReading, whyThisAgentCannotBeReached } = await import('../src/server/lib/worker.ts')
    expect(theAnsweringReading(held, WORKSPACE).hold, 'the fixture: a session holds the handle').not.toBeNull()
    expect(whyThisAgentCannotBeReached(held, WORKSPACE)?.was, 'the fixture: nothing is answering behind the hold').toBe('nothing answering')

    const body = 'A note to an agent whose handle is held'
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: held }], body })
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(said.said['error']).toBeUndefined()
    expect(said.said['reason']).toBeUndefined()
    expect(theRecord(said.said).data['to']).toEqual([{ kind: 'agent', id: held }])
  })
})

// ============================================================ the check door

describe('POST /api/records/check reads the same 409 as the send', () => {
  it('says a send to the unheld agent would answer 409, with the reason in the dot’s word, and stores nothing', async () => {
    const before = messagesStored()
    const said = await checkAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: unheld }], body: 'A checked note to an agent nothing holds' })
    expect(said.status, JSON.stringify(said.said)).toBe(200)
    expect(said.said['wouldAnswerStatus']).toBe(409)
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    const word = participantPresence({ kind: 'agent', id: unheld }, WORKSPACE).word
    const reason = String(said.said['reason'] ?? '')
    expect(reason, 'the check carries no reason').not.toBe('')
    expect(reason.toLowerCase(), `the check's reason does not name ${word}`).toContain(word.toLowerCase())
    await expectNobodyToWriteTo(reason)
    expect(messagesStored(), 'the check stored a message').toBe(before)
  })

  it('says a send to the reachable agent would answer 201, with no reason', async () => {
    const said = await checkAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: reachable }], body: 'A checked note somebody can take' })
    expect(said.status, JSON.stringify(said.said)).toBe(200)
    expect(said.said['wouldAnswerStatus']).toBe(201)
    expect(said.said['reason']).toBeUndefined()
  })
})

// ============================================================ the limit of the word

describe('the limit of the 409’s word: it reads the agent’s newest runs only', () => {
  const inATerminal = sayInEnglish('cannotReceive.state.inATerminal')

  it('names In a terminal, as the dot does, for a terminal run one inside the runs it reads', async () => {
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    expect(participantPresence({ kind: 'agent', id: atTheEdge }, WORKSPACE).word, 'the fixture: the dot').toBe(IN_A_TERMINAL_WORD)
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: atTheEdge }], body: 'A note to an agent at work in a terminal' })
    expect(said.status, JSON.stringify(said.said)).toBe(409)
    expect(String(said.said['reason'] ?? '')).toContain(inATerminal)
  })

  it('does not name it for a terminal run just past them, while the dot still does', async () => {
    const { participantPresence } = await import('../src/server/lib/presence.ts')
    expect(participantPresence({ kind: 'agent', id: pastTheEdge }, WORKSPACE).word, 'the fixture: the dot').toBe(IN_A_TERMINAL_WORD)
    const said = await sendAs(AS_THE_PERSON, { to: [{ kind: 'agent', id: pastTheEdge }], body: 'A note to an agent whose terminal run is older' })
    expect(said.status, JSON.stringify(said.said)).toBe(409)
    const reason = String(said.said['reason'] ?? '')
    expect(reason, 'the answer carries no reason').not.toBe('')
    expect(reason).not.toContain(inATerminal)
  })
})
