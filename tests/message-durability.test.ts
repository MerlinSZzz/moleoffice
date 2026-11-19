// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT SOMEBODY WROTE SURVIVES, WHOEVER IT WAS ADDRESSED TO — AND THE ANSWER COMES BACK AS A REPLY.
 *
 * ---------------------------------------------------------------------------------------
 * THE INVARIANT
 * ---------------------------------------------------------------------------------------
 *
 * **Message durability must not depend on recipient liveness.** A comment is stored first and
 * always. Who it is for is a property of it that may be unresolved, may be wrong, and may be
 * changed afterwards.
 *
 * Until 19 August 2026 that was half true. A comment addressed to a session record that came in
 * through the generated corpus was refused BEFORE it was stored, so the person's words were gone
 * and the screen showed an error where their sentence had been. 66 of the 91 session records in the
 * owner's corpus are fixture rows, so that was the likely case and not the rare one. A comment to a
 * run Mole Office could no longer pick up was already stored, and that half was already right.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE SECOND HALF: A THREAD WITH NO REPLY IN IT
 * ---------------------------------------------------------------------------------------
 *
 * A finished run wrote its answer into `agent_runs.result` and inserted nothing, so a conversation
 * read as things a person said and no reply, and replying was impossible because there was nothing
 * to reply to. The answer is now a message with `role: 'agent'` carrying the run that produced it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE THESE TESTS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * They pin behaviour a person can see, so most of them should outlive any rewrite. Two would have
 * to change if the product got better in a particular direction, and they say so where they sit:
 * the one that pins `intent: 'discuss'` on an agent's answer (there is no word for what an agent
 * meant, and a sixth one is owed), and the one that pins that a result with no `answer` string adds
 * no message (a later result shape might carry the words somewhere else).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const OTHER = { ...HUMAN, 'x-mole-office-workspace': 'panelx' }

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

interface MessageShape {
  id: string
  body: string
  role: string
  intent: string
  state: string
  runId: string | null
  recipient: { kind: string; sessionId: string | null; said: string | null } | null
  delivery: { canSend: boolean; says: string }
}

/** File a record through the route, and hand back its id. */
async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = HUMAN): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A run that really can be picked up again: a stamp, and a transcript at the path it names. */
async function resumableSession(title: string, externalId: string, headers = HUMAN): Promise<string> {
  const logPath = fakeTranscript(externalId)
  return file(
    'session',
    title,
    {
      state: 'idle',
      runtime: 'claude-code',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId,
          logPath,
          resumeCommand: `claude --resume ${externalId}`,
          observedState: 'idle',
          stateReason: 'its log last grew 40 minutes ago',
          filesTouched: [],
          filesComplete: true,
          at: '2026-08-18 09:00:00',
        },
      },
    },
    headers,
  )
}

async function startThread(mode: 'direct' | 'review', title: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/agent/threads', headers: HUMAN, payload: { title, mode } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { thread: { id: string } }).thread.id
}

/** Say something. Hands back the whole message, because what Mole Office made of it is the subject here. */
async function say(thread: string, body: string, recipient?: unknown): Promise<MessageShape> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: HUMAN,
    payload: { intent: 'review', body, recipient },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { message: MessageShape }).message
}

/**
 * What this case really wrote into the message table, read from the database and not from a route.
 *
 * A case that ran before this one left its own rows there, so the reading keeps every row and leaves out the ones
 * that were stored before this case started. A row written anywhere by this case still shows up.
 */
function storedBodies(): string[] {
  const rows = t.client.sqlite
    .prepare('SELECT id, body FROM agent_messages ORDER BY position')
    .all() as { id: string; body: string }[]
  return rows.filter((row) => !messagesAtStart.has(row.id)).map((row) => row.body)
}

async function readThread(id: string): Promise<{
  thread: { state: string }
  messages: MessageShape[]
  runs: { id: string; state: string }[]
  says: string
}> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { thread: { state: string }; messages: MessageShape[]; runs: { id: string; state: string }[]; says: string }
}

// ====================================================== the words are stored, whoever they are for

describe('a comment is stored whatever its recipient turns out to be', () => {
  it('keeps the words of a comment addressed to a fixture row, and says it cannot be sent', async () => {
    // A session record that came in through the generated corpus. `origin` is stamped by the seed;
    // what matters to routing is that nothing ever recorded a transcript for it, which is what
    // `pickUpOf` reads and what 66 of the owner's 91 session records look like.
    const fixtureRun = await file('session', 'A run from the generated corpus', { state: 'idle', runtime: 'claude-code' })
    const thread = await startThread('review', 'Round six, read again')

    const written = await say(thread, 'The exposure table is unlabelled.', { kind: 'session', sessionId: fixtureRun })

    // THE WORDS ARE THERE. This is the whole point: the write is not refused.
    expect(storedBodies()).toEqual(['The exposure table is unlabelled.'])
    expect(written.body).toBe('The exposure table is unlabelled.')
    expect(written.recipient?.sessionId, 'the address somebody chose was not kept as they chose it').toBe(fixtureRun)

    // AND THE ANSWER TO "CAN THIS GO" COMES BACK WITH IT, in a sentence rather than an error.
    expect(written.delivery.canSend).toBe(false)
    expect(written.delivery.says).toContain('cannot be picked up')
    expect(written.delivery.says).toContain('Address it to a new agent on purpose, or leave it.')
  })

  it('keeps the words of a comment addressed to a record that is not a run at all', async () => {
    const task = await file('task', 'Re-run the tolerance sweep')
    const thread = await startThread('direct', 'One thing')

    const written = await say(thread, 'This needs doing before Friday.', { kind: 'session', sessionId: task })

    expect(storedBodies()).toEqual(['This needs doing before Friday.'])
    expect(written.delivery.canSend).toBe(false)
    expect(written.delivery.says).toContain('is a task')
    expect(written.delivery.says).toContain('not a run')
  })

  it('keeps the words of a comment addressed to nothing that exists', async () => {
    const thread = await startThread('direct', 'One thing')
    const written = await say(thread, 'Where did the second table go?', { kind: 'session', sessionId: 'NoSuchId1234' })

    expect(storedBodies()).toEqual(['Where did the second table go?'])
    expect(written.delivery.canSend).toBe(false)
    // WHAT IT IS STORED AS CHANGED ON 31 AUGUST 2026, AND THE WORDS DID NOT.
    //
    // It used to be stored as `session` naming an id nothing has, and the reading said "no run has
    // that id any more". That row made a SERVER START THROW: the identity migration refuses a whole
    // corpus over a choice pointing at a run that is not there, and that refusal reaches
    // `prepareToServe` as a stack rather than as a refusal anybody can read. So a choice nothing
    // durable can stand behind is now stored as `unresolved` with the id in the sentence, which is
    // the shape this product already had for a recipient it could not work out.
    expect(written.recipient?.kind, 'what a choice naming nothing is stored as').toBe('unresolved')
    expect(written.delivery.says).toContain('No record has the id NoSuchId1234')
    expect(written.delivery.says, 'the id somebody chose is not recoverable from the reading').toContain('NoSuchId1234')
  })

  it('keeps the words of a comment addressed to a run in another project, and will not send it there', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: 'panelx', title: 'Mole Office itself' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const elsewhere = await resumableSession('A run in another project', 'eeee5555-0000-0000-0000-00000000eeee', OTHER)
    const thread = await startThread('direct', 'One thing')

    const written = await say(thread, 'Does this affect the other project too?', {
      kind: 'session',
      sessionId: elsewhere,
    })

    expect(storedBodies()).toEqual(['Does this affect the other project too?'])
    expect(written.delivery.canSend).toBe(false)
    expect(written.delivery.says).toContain('is a run in "Mole Office itself"')
  })

  it('keeps the words when the recipient says "an agent" and does not say which', async () => {
    const thread = await startThread('direct', 'One thing')
    const written = await say(thread, 'Somebody should look at the mount.', { kind: 'session' })

    expect(storedBodies()).toEqual(['Somebody should look at the mount.'])
    expect(written.delivery.canSend).toBe(false)
    expect(written.delivery.says).toContain('does not say which one')
  })

  it('keeps the words when nothing could be resolved and the typed words were not kept either', async () => {
    const thread = await startThread('direct', 'One thing')
    const written = await say(thread, 'Ask whoever did the calibration.', { kind: 'unresolved' })

    expect(storedBodies()).toEqual(['Ask whoever did the calibration.'])
    expect(written.delivery.canSend).toBe(false)
    expect(written.delivery.says).toContain(sayInEnglish('sendPlan.line.unresolvedNothingKept'))
  })

  it('says where a good one is going, in the same field', async () => {
    const run = await resumableSession('The wrist camera run', 'ffff6666-0000-0000-0000-00000000ffff')
    const thread = await startThread('direct', 'One thing')

    const toARun = await say(thread, 'Carry on with the exposure table.', { kind: 'session', sessionId: run })
    expect(toARun.delivery.canSend).toBe(true)
    expect(toARun.delivery.says).toContain('The wrist camera run')

    const toAnybody = await say(thread, 'And start the tolerance sweep.', { kind: 'new' })
    expect(toAnybody.delivery.canSend).toBe(true)
    expect(toAnybody.delivery.says).toContain('new agent')
  })

  it('lets the address be corrected afterwards, which is the point of storing it wrong', async () => {
    const fixtureRun = await file('session', 'A run from the generated corpus', { state: 'idle', runtime: 'claude-code' })
    const thread = await startThread('direct', 'One thing')
    const written = await say(thread, 'The exposure table is unlabelled.', { kind: 'session', sessionId: fixtureRun })

    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${written.id}`,
      headers: HUMAN,
      payload: { recipient: { kind: 'new', why: 'nothing that ran can be picked up' } },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)
    const after = (fixed.json() as { message: MessageShape }).message
    expect(after.body, 'correcting the address changed the words').toBe('The exposure table is unlabelled.')
    expect(after.delivery.canSend).toBe(true)

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    expect((sent.json() as { sent: number }).sent).toBe(1)
  })
})

// ====================================================== the answer is a message

describe("an agent's answer is a message in the conversation", () => {
  /** Start a conversation, say one thing to a new agent, send it, and claim the run. */
  async function upToARun(body = 'Why does the second pass fail?'): Promise<{ thread: string; run: string }> {
    const thread = await startThread('direct', 'Why does the second pass fail')
    await say(thread, body, { kind: 'new' })
    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    const run = (sent.json() as { runs: { id: string }[] }).runs[0]?.id ?? ''
    const claimed = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { worker: 'a worker on this machine' },
    })
    expect(claimed.statusCode, claimed.body).toBe(200)
    return { thread, run }
  }

  it('appends the answer as a message carrying the run that produced it', async () => {
    const { thread, run } = await upToARun()

    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: {
        result: { answer: 'The fixture directory is not cleaned up between passes.', wrote: [] },
        tookMs: 21_000,
      },
    })
    expect(posted.statusCode, posted.body).toBe(200)
    const finished = posted.json() as { answer: MessageShape | null; note: string }

    expect(finished.answer, 'a finished run produced no message').not.toBeNull()
    expect(finished.answer?.body).toBe('The fixture directory is not cleaned up between passes.')
    expect(finished.answer?.role).toBe('agent')
    expect(finished.answer?.runId).toBe(run)
    expect(finished.answer?.recipient, 'an answer was addressed to somebody').toBeNull()
    expect(finished.note).toContain('reply')

    const detail = await readThread(thread)
    expect(detail.messages.length, 'the conversation does not hold the question and the answer').toBe(2)
    expect(detail.messages[1]?.role).toBe('agent')
    expect(detail.messages[1]?.body).toBe('The fixture directory is not cleaned up between passes.')
    // It is not waiting to go anywhere, so it can never be swept into a dispatch.
    expect(detail.messages[1]?.state).not.toBe('queued')
    expect(detail.messages[1]?.delivery.canSend).toBe(false)
    expect(detail.messages[1]?.delivery.says).toContain(run)
  })

  it('lets a person answer the answer, which is the whole point of it being a message', async () => {
    const { thread, run } = await upToARun()
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: { result: { answer: 'The fixture directory is not cleaned up between passes.', wrote: [] } },
    })
    const detail = await readThread(thread)
    const answer = detail.messages[1]
    expect(answer).toBeDefined()

    // POINTING AT A FEW WORDS OF THE REPLY AND CARRYING ON FROM THEM. An agent message is one entry
    // in the same target vocabulary as a record or a block and needs nothing of its own.
    const back = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'Which fixture directory, and who cleans it?',
        context: {
          target: { kind: 'agentMessage', messageId: answer?.id ?? '' },
          span: { quote: 'fixture directory', from: 4, to: 21, field: 'body' },
        },
        recipient: { kind: 'new' },
      },
    })
    expect(back.statusCode, back.body).toBe(201)
    const reply = back.json() as { message: { reading: { state: string; quote?: { words: string } } | null } }
    expect(reply.message.reading?.state, 'the words of the answer could not be pointed at').toBe('there')
    expect(reply.message.reading?.quote?.words).toBe('fixture directory')
  })

  it('refuses to change or remove what an agent said', async () => {
    const { thread, run } = await upToARun()
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: { result: { answer: 'The fixture directory is not cleaned up between passes.', wrote: [] } },
    })
    const detail = await readThread(thread)
    const answer = detail.messages[1]?.id ?? ''

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${answer}`,
      headers: HUMAN,
      payload: { body: 'It said something else.' },
    })
    expect(edited.statusCode, edited.body).toBe(409)
    expect((edited.json() as { error: string }).error).toContain("agent's words")

    const removed = await app.inject({ method: 'DELETE', url: `/api/agent/messages/${answer}`, headers: HUMAN })
    expect(removed.statusCode, removed.body).toBe(409)
    expect(storedBodies().length, 'an agent message was removed').toBe(2)
  })

  it('writes no message when the result carries no words, and says so instead of inventing one', async () => {
    // THIS TEST WOULD HAVE TO CHANGE if a later result shape carried the words for a person
    // somewhere other than `answer`. What must not change is the rule: Mole Office does not write a
    // sentence into a conversation that an agent did not say.
    const { thread, run } = await upToARun()

    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: { result: { wrote: [{ id: 'abc', what: 'filed a problem' }] } },
    })
    expect(posted.statusCode, posted.body).toBe(200)
    const finished = posted.json() as { answer: MessageShape | null; note: string }
    expect(finished.answer).toBeNull()
    expect(finished.note).toContain('no words')

    const detail = await readThread(thread)
    expect(detail.messages.length, 'something was written into the conversation anyway').toBe(1)
  })

  it('writes no message for a failure and none for a decline', async () => {
    const failed = await upToARun()
    const wentWrong = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${failed.run}/result`,
      headers: HUMAN,
      payload: { error: 'claude exited 1. It printed nothing on the error channel.' },
    })
    expect(wentWrong.statusCode, wentWrong.body).toBe(200)
    expect((wentWrong.json() as { answer: unknown }).answer).toBeNull()
    expect((await readThread(failed.thread)).messages.length).toBe(1)

    const declined = await upToARun()
    const cannot = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${declined.run}/result`,
      headers: HUMAN,
      payload: { declined: true, error: 'That transcript is not on this machine.' },
    })
    expect(cannot.statusCode, cannot.body).toBe(200)
    expect((cannot.json() as { answer: unknown }).answer).toBeNull()
    expect((await readThread(declined.thread)).messages.length).toBe(1)
  })

  it('stores "discuss" as the answer\'s intent, which is the nearest of five words for a thing none of them means', async () => {
    // A KNOWN WRONG LABEL, PINNED SO IT IS NOT FORGOTTEN. `intent` is what the writer meant by
    // writing something, and all five words are things a PERSON wants: ask, discuss, review, change,
    // start. An agent answering means none of them. The column cannot be null, and a sixth word
    // needs a matching entry in INTENT_WORDS in src/web/components/agent/context.ts — a file this
    // change may not touch, and one where a missing entry is a type error rather than a bad label.
    //
    // THIS TEST SHOULD BE DELETED WHEN THAT WORD IS ADDED. It pins today's compromise, not a rule.
    const { thread, run } = await upToARun()
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: { result: { answer: 'It is the fixture directory.' } },
    })
    const detail = await readThread(thread)
    expect(detail.messages[1]?.intent).toBe('discuss')
  })

  it('leaves a conversation open when a comment is still waiting in it, so the answer does not strand it', async () => {
    // A run coming back used to mark the whole conversation "answered", and a review that had one
    // comment held back would then refuse both the correction and the second send: the comment
    // would be stranded where nothing could reach it.
    const thread = await startThread('review', 'Round six, read again')
    await say(thread, 'The exposure table is unlabelled.', { kind: 'new' })
    await say(thread, 'And this figure has no units.')

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    const run = (sent.json() as { runs: { id: string }[] }).runs[0]?.id ?? ''
    await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/claim`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { worker: 'a worker' },
    })
    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${run}/result`,
      headers: HUMAN,
      payload: { result: { answer: 'The table now has units.' } },
    })
    expect(posted.statusCode, posted.body).toBe(200)

    const detail = await readThread(thread)
    expect(detail.thread.state, 'the conversation closed over a comment still waiting in it').toBe('open')

    // And the held comment can still be corrected and sent.
    const held = detail.messages.find((m) => m.state === 'queued')
    expect(held).toBeDefined()
    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${held?.id ?? ''}`,
      headers: HUMAN,
      payload: { recipient: { kind: 'new' } },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)
    const again = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(again.statusCode, again.body).toBe(201)
  })
})
