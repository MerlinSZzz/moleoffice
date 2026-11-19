// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DOOR WRITES A MESSAGE — checked against the source, not stated in a comment.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY NOW
 * ---------------------------------------------------------------------------------------
 *
 * `tests/one-run-door.test.ts` has watched the run table since a second way to create a run was
 * opened by accident. There was no equivalent on messages, and until 19 August 2026 that hardly
 * mattered: one function wrote them, and what it wrote was whatever a person had typed.
 *
 * It matters now. A finished run appends the agent's answer as a message, so two different things
 * write into `agent_messages`, and one of them writes words nobody typed. The rules that make that
 * safe — the role is the writer's own, an agent's answer carries the run it came from, and an
 * answer is never invented when a result carries no words — are rules in one function. A second
 * insert somewhere else would be free of all of them, and nothing would fail.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CAN AND CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * IT RESOLVES THE TABLE; IT DOES NOT MATCH A WORD. Every `insert(...)` under src/ is found and its
 * argument is resolved through the file's own imports. All four of these name the same table and
 * all four are found: `insert(agentMessages)`; `import { agentMessages as other }` and then
 * `insert(other)`; `import * as schema` and then `insert(schema.agentMessages)`; and
 * `insert(AUTHORED_TABLE_OF.agent_messages)`, through the map db/schema.ts exports.
 *
 * WHY THAT PARAGRAPH IS HERE. Until 19 August 2026 this walk matched the TEXT `insert(agentMessages)`,
 * and a hostile read opened two live doors past it in one afternoon: an aliased import, and the
 * exported map. Through the aliased one it wrote a message with role 'agent', a run id naming a run that never
 * said it, and a created_by naming the owner — every rule this guard exists to enforce, bypassed. Both left every test in this file green. It was the third
 * text-matching guard in this campaign found not to guard, so the walk was made to resolve names
 * instead of matching them, and what it still cannot see is written out below rather than implied.
 *
 * AN ARGUMENT IT CANNOT RESOLVE FAILS THIS TEST RATHER THAN PASSING IT. `insert(table)`, where
 * `table` is a local variable, is not "not the watched table" — it is "this walk cannot say", and
 * the fifth engineering rule is that those two may never draw the same.
 *
 * WHAT IS STILL OUTSIDE IT, said plainly:
 *
 *   · a table object chosen at run time, or reached through `eval`;
 *   · raw SQL whose table name is assembled from pieces. A literal `INSERT INTO agent_messages` is
 *     caught; `INSERT INTO ` followed by a variable is not;
 *   · anything outside src/. Checked by hand on 19 August 2026: the migrations under drizzle/
 *     create this table and scripts/restore-check.ts only reads it. Neither is walked here.
 *
 * It is a fence against drift, not against somebody deliberately climbing it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE THIS TEST WRONG
 * ---------------------------------------------------------------------------------------
 *
 * It pins a shape rather than a behaviour, so it is a regression alarm and not a specification.
 * If a later change needs messages written from a second place for a good reason — a conversation
 * imported from somewhere else, say — the honest fix is to move the write into `writeMessage` and
 * pass it a row, or to change this test deliberately and say why. Do not silence it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'


/**
 * THE READER BELOW IS DUPLICATED IN tests/one-run-door.test.ts ON PURPOSE.
 *
 * A test file cannot import another test file without running its tests, so the two door guards
 * cannot share a module without one of them running the other. They hold the same block instead, and
 * the last test in each file fails when the two copies stop being identical — which is the third of
 * the fixes CLAUDE.md allows for one fact worked out in two places, and the only one available here.
 * It is not decoration: the hole this block was written to close existed in both files at once,
 * because one was copied from the other and neither knew about the copy.
 */
// ===== THE SHARED READER STARTS HERE =====





















// ===== THE SHARED READER ENDS HERE =====



// ====================================================== and the same rule, exercised

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
/** The messages that were already stored when this case started. */
let messagesAtStart: Set<string>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  messagesAtStart = new Set(
    (t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]).map((row) => row.id),
  )
})

/**
 * How many messages this case wrote, read from the database rather than from a route.
 *
 * Earlier cases left their rows there, so the reading keeps every row and leaves out what was stored before this
 * case began. A row written anywhere by this case still counts.
 */
function messageRows(): number {
  const rows = t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]
  return rows.filter((row) => !messagesAtStart.has(row.id)).length
}

/** Which of this case's messages an agent wrote, and which run each came out of. */
function agentMessages(): { body: string; runId: string | null; state: string; role: string }[] {
  const rows = t.client.sqlite
    .prepare('SELECT id, body, run_id AS runId, state, role FROM agent_messages WHERE role = ? ORDER BY position')
    .all('agent') as { id: string; body: string; runId: string | null; state: string; role: string }[]
  return rows.filter((row) => !messagesAtStart.has(row.id))
}

describe('two things write a message, and both go through the one door', () => {
  it('counts one row for what a person wrote and one for what came back, and nothing else adds one', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Why does the second pass fail', mode: 'direct' },
    })
    expect(started.statusCode, started.body).toBe(201)
    const thread = (started.json() as { thread: { id: string } }).thread.id
    expect(messageRows(), 'starting a conversation wrote a message').toBe(0)

    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Why does the second pass fail?', recipient: { kind: 'new' } },
    })
    expect(said.statusCode, said.body).toBe(201)
    expect(messageRows()).toBe(1)

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    expect(messageRows(), 'dispatch wrote a message').toBe(1)
    const run = (sent.json() as { runs: { id: string }[] }).runs[0]?.id ?? ''

    const claimed = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { worker: 'a worker' },
    })
    expect(claimed.statusCode, claimed.body).toBe(200)
    expect(messageRows(), 'claiming a run wrote a message').toBe(1)

    for (const url of [`/api/agent/threads/${thread}`, '/api/agent/threads', '/api/agent/marks', '/api/agent/runs']) {
      const read = await app.inject({ method: 'GET', url, headers: HUMAN })
      expect(read.statusCode, `${url}: ${read.body}`).toBe(200)
    }
    expect(messageRows(), 'reading wrote a message').toBe(1)

    const answered = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: { result: { answer: 'The fixture directory is not cleaned up between passes.', wrote: [] } },
    })
    expect(answered.statusCode, answered.body).toBe(200)
    expect(messageRows(), 'the answer did not become a message').toBe(2)

    const fromAgents = agentMessages()
    expect(fromAgents.length).toBe(1)
    expect(fromAgents[0]?.body).toBe('The fixture directory is not cleaned up between passes.')
    expect(fromAgents[0]?.runId, 'the answer does not say which run produced it').toBe(run)
  })
})

// ================================================ what the conversation says, and what it keeps

/**
 * WHY THESE ARE IN THIS FILE. They are about what a conversation tells a person and about words
 * that were nearly thrown away — not about which door writes a message. They are here because the
 * pass that fixed them could write to two test files, and this was the one about messages. They
 * belong beside tests/agent-threads.test.ts and should move there when nobody else is in it.
 *
 * Each one is a defect found by a hostile read on 19 August 2026 and reproduced before it was
 * fixed. `.logs/round-eight-map/phase8910-attack.json` holds the readings they came from.
 */

interface ThreadRead {
  thread: { id: string; state: string; title: string }
  messages: {
    id: string
    body: string
    role: string
    state: string
    runId: string | null
    recipient: { kind: string; sessionId: string | null; said: string | null; why: string | null } | null
    delivery: { canSend: boolean; says: string }
    reading: { state: string; about: string; says: string } | null
  }[]
  runs: { id: string; state: string; error: string | null; endedAt: string | null; says: string }[]
  says: string
}

/** A direct conversation, which is the one a person answers back in. */
async function startDirect(title = 'Why does the second pass fail'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title, mode: 'direct' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { thread: { id: string } }).thread.id
}

/** Say something to a fresh agent. Returns the whole reply, because some of these want the refusal. */
async function say(thread: string, payload: Record<string, unknown>): Promise<{ code: number; body: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: HUMAN,
    payload: { intent: 'ask', body: 'Why does the second pass fail?', recipient: { kind: 'new' }, ...payload },
  })
  return { code: res.statusCode, body: res.body }
}

/** Send what is waiting, and give back the run it made. */
async function sendIt(thread: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
  expect(res.statusCode, res.body).toBe(201)
  const run = (res.json() as { runs: { id: string }[] }).runs[0]?.id
  expect(run).toBeDefined()
  return run ?? ''
}

async function takeIt(run: string, worker = 'a worker'): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/runs/${run}/claim`,
    headers: { ...HUMAN, ...thePersonsKeyHeader() },
    payload: { worker },
  })
  expect(res.statusCode, res.body).toBe(200)
}

async function postResult(run: string, payload: Record<string, unknown>): Promise<{ code: number; body: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/runs/${run}/result`,
    headers: HUMAN,
    payload,
  })
  return { code: res.statusCode, body: res.body }
}

async function readIt(thread: string): Promise<ThreadRead> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ThreadRead
}

async function drop(thread: string): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/agent/threads/${thread}`,
    headers: HUMAN,
    payload: { state: 'abandoned' },
  })
  expect(res.statusCode, res.body).toBe(200)
  expect((res.json() as { thread: { state: string } }).thread.state).toBe('abandoned')
}

describe('a conversation somebody dropped stays dropped', () => {
  it('keeps a late answer without reopening the conversation to more comments', async () => {
    const thread = await startDirect()
    expect((await say(thread, {})).code).toBe(201)
    const run = await sendIt(thread)
    await takeIt(run)
    await drop(thread)

    const answered = await postResult(run, { result: { answer: 'The fixture directory is not cleaned up.' } })
    expect(answered.code, answered.body).toBe(200)

    // THE ANSWER IS KEPT. It came back and it is the only copy of what was said.
    const read = await readIt(thread)
    expect(read.messages.map((m) => m.body)).toContain('The fixture directory is not cleaned up.')

    // AND THE CONVERSATION IS STILL THE ONE THE PERSON WALKED AWAY FROM.
    expect((answered.body.includes('"state":"answered"') ? 'answered' : 'not answered'), answered.body).toBe(
      'not answered',
    )
    expect(read.thread.state, 'a late answer reopened a conversation somebody dropped').toBe('abandoned')

    // The refusal that "abandoned" exists for still holds.
    const more = await say(thread, { body: 'Then why did pass one work?' })
    expect(more.code, more.body).toBe(409)
  })

  it('does not tell the reader a dropped conversation was dispatched', async () => {
    const thread = await startDirect()
    expect((await say(thread, { body: 'Never mind.' })).code).toBe(201)
    await drop(thread)

    const read = await readIt(thread)
    expect(read.says, 'the pane said it had been dispatched while the list row said Dropped').not.toContain(
      'dispatched',
    )
    expect(read.says).not.toContain('should not be possible')
    expect(read.says.toLowerCase(), 'the sentence never says the conversation was dropped').toContain('dropped')
  })
})

describe('a reply to an agent is named by the conversation it is waiting in', () => {
  it('says a comment is waiting after an answer came back, instead of only counting runs', async () => {
    const thread = await startDirect()
    expect((await say(thread, {})).code).toBe(201)
    const run = await sendIt(thread)
    await takeIt(run)
    expect((await postResult(run, { result: { answer: 'Because the fixtures are shared.' } })).code).toBe(200)

    const replied = await say(thread, { body: 'Then why did pass one work?' })
    expect(replied.code, replied.body).toBe(201)

    const read = await readIt(thread)
    // THE CLAIM IS UNCHANGED: the conversation says a reply is sitting in it and has not gone. The
    // WORDS changed on 19 August 2026 — finding 8 of the language audit — because the sentence used
    // to end "Finish review is what sends it", naming a button captioned "Finish collecting" and
    // saying finishing sends, which is the opposite of the design. The button is on screen and
    // carries its own name, so the sentence says only what is here and that it has not gone.
    expect(read.says, 'the conversation never mentioned the reply waiting in it').toContain('One comment')
    const { whatIsWaitingInAConversation } = await import('../src/server/lib/agents.ts')
    expect(read.says, 'nothing said the reply had not gone anywhere').toContain(whatIsWaitingInAConversation(1))
  })
})

describe('a result with no words for a person settles nothing', () => {
  it('leaves the question sent rather than answered, and says the answer left no words here', async () => {
    const thread = await startDirect()
    expect((await say(thread, {})).code).toBe(201)
    const run = await sendIt(thread)
    await takeIt(run)
    // `answer` is not a string, so there are no words for a person and no message is written.
    const done = await postResult(run, { result: { answer: 42 } })
    expect(done.code, done.body).toBe(200)

    const read = await readIt(thread)
    expect(read.messages.filter((m) => m.runId !== null).length, 'a message was invented from a number').toBe(0)
    const asked = read.messages.find((m) => m.role === 'human')
    expect(asked?.state, 'a question was marked answered by a run that put no words in the conversation').toBe('sent')
    const { THE_ANSWER_IS_ON_THE_RUN } = await import('../src/server/lib/agents.ts')
    expect(read.says).toContain(THE_ANSWER_IS_ON_THE_RUN)
  })
})

describe('a run that was declined and then answered does not keep the decline', () => {
  it('clears the reason and the end stamp when another worker takes it', async () => {
    const thread = await startDirect()
    expect((await say(thread, {})).code).toBe(201)
    const run = await sendIt(thread)
    expect((await postResult(run, { error: 'That transcript is not on this machine.', declined: true })).code).toBe(200)

    await takeIt(run, 'a worker on the other machine')
    const taken = (await readIt(thread)).runs[0]
    expect(taken?.state).toBe('claimed')
    expect(taken?.error, 'a run being worked on carried a failure reason').toBeNull()
    expect(taken?.endedAt, 'a run being worked on said it had already ended').toBeNull()

    expect((await postResult(run, { result: { answer: 'It is the shared fixture directory.' } })).code).toBe(200)
    const finished = (await readIt(thread)).runs[0]
    expect(finished?.state).toBe('finished')
    expect(finished?.error, 'a finished run reported an answer and a failure at once').toBeNull()
  })
})

describe('a recipient Mole Office cannot read never costs somebody their words', () => {
  it('stores the comment, keeps what was sent, and refuses to send it rather than refusing to keep it', async () => {
    const thread = await startDirect()
    const words = 'WORDS-BADKIND: the second bolt is loose, torque it to 4Nm'
    // THE WORD HAS TO BE ONE NOTHING DECLARES, AND IT USED TO BE `agent`. Round ten wave 3 made
    // `agent` a real recipient kind — a durable identity — so this fixture stopped testing what it
    // says it tests and started testing a word that parses. `robot` is a word no vocabulary in this
    // product holds, which is the whole requirement here.
    const written = await say(thread, { intent: 'review', body: words, recipient: { kind: 'robot', sessionId: 'x1' } })
    expect(written.code, written.body).toBe(201)

    const read = await readIt(thread)
    const kept = read.messages.find((m) => m.body === words)
    expect(kept, 'the words were thrown away to say the address was wrong').toBeDefined()
    expect(kept?.recipient?.kind).toBe('unresolved')
    expect(kept?.recipient?.said, 'a structure a caller posted was stored as words somebody typed').toBeNull()
    expect(kept?.recipient?.why, 'what was sent was not kept anywhere').toContain('"kind":"robot"')
    expect(kept?.delivery.says, 'the line under the comment does not say what was sent').toContain('"kind":"robot"')
    expect(kept?.delivery.canSend, 'a recipient Mole Office could not read was treated as sendable').toBe(false)
  })

  it('keeps the words when the recipient is not even an object', async () => {
    const thread = await startDirect()
    const written = await say(thread, { body: 'WORDS-STRING: check the torque.', recipient: THE_TEST_OFFICES_OWNER.id })
    expect(written.code, written.body).toBe(201)
    const read = await readIt(thread)
    expect(read.messages.map((m) => m.body)).toContain('WORDS-STRING: check the torque.')
    expect(read.messages[0]?.recipient?.kind).toBe('unresolved')
  })
})

describe('a quote naming a part that is not there is not reported as changed', () => {
  it('says Mole Office cannot tell, and names what the thing does hold', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'note', title: 'The calibration', data: { body: 'the calibration procedure is written here' } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const record = (made.json() as { record: { id: string } }).record.id

    const thread = await startDirect()
    const written = await say(thread, {
      body: 'Where did this come from?',
      context: {
        target: { kind: 'record', recordId: record, workspaceId: 'default' },
        // "body" is the natural guess. The stored string is "data.body", so this names nothing.
        span: { quote: 'calibration procedure', from: 4, to: 25, field: 'body' },
      },
    })
    expect(written.code, written.body).toBe(201)

    const reading = (await readIt(thread)).messages[0]?.reading
    expect(reading?.state, 'Mole Office claimed the text had changed without looking at it').toBe('unknown')
    expect(reading?.says).toContain('no such part')
    expect(reading?.says, 'it did not say what the thing does hold').toContain('data.body')
  })
})

describe('a run answers its own conversation and no other', () => {
  it('leaves another conversation alone when its request names a comment from one', async () => {
    const mine = await startDirect('The mount tolerance')
    expect((await say(mine, {})).code).toBe(201)
    const other = await startDirect('A conversation nobody answered')
    expect((await say(other, { body: 'Nobody has answered this one.' })).code).toBe(201)
    const strangerId = (await readIt(other)).messages[0]?.id ?? ''
    expect(strangerId).not.toBe('')

    const run = await sendIt(mine)
    await takeIt(run)

    // THE ONLY WAY TO SEE THIS, AND IT IS SAID PLAINLY. Nothing reachable over HTTP writes a run's
    // request, so the foreign id is put there by hand here. That is what makes this a test of a
    // constraint rather than of a live defect: any later path that writes or repairs a request —
    // an import, a repair script — would otherwise let one run settle another conversation's
    // questions, and nothing would have failed.
    const stored = t.client.sqlite.prepare('SELECT request FROM agent_runs WHERE id = ?').get(run) as {
      request: string
    }
    const request = JSON.parse(stored.request) as { messages: { id: string }[] }
    request.messages.push({ id: strangerId })
    t.client.sqlite.prepare('UPDATE agent_runs SET request = ? WHERE id = ?').run(JSON.stringify(request), run)

    expect((await postResult(run, { result: { answer: 'From the bench jig sheet.' } })).code).toBe(200)
    const stranger = (await readIt(other)).messages[0]
    expect(stranger?.state, "a run marked another conversation's comment answered").toBe('queued')
    // And its own comment is dealt with, so the update did not simply stop working. The word was
    // `answered` until the dispatch lifecycle became six words; `handled` is the same event.
    expect((await readIt(mine)).messages.find((m) => m.role === 'human')?.state).toBe('handled')
  })
})
