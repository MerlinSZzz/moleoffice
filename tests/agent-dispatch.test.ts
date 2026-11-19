// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FINISH REVIEW: one press, one act, one run per recipient — and a refusal that sends nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A review may be split between agents without stopping being one act: PanelX may split one
 * review into the right agents' work rather than sending every comment to one agent, and the
 * review stays one durable human action.
 *
 * So four things have to be true at once, and each has a test here:
 *
 *   1. The comments are grouped by who they are for, and ONE RUN IS WRITTEN PER RECIPIENT, every
 *      one of them naming the same conversation.
 *   2. A comment nobody could route STAYS BEHIND and is named, with the sentence saying why. The
 *      rest go. It is still queued, still editable, and the next press sends it. When not one
 *      comment can go there is no half to send, so that answers 409 and writes nothing.
 *   3. A comment addressed to a run Mole Office has no resume id for is one of those, because sending it
 *      would start an agent that has never heard of the work and report that as the answer. That is
 *      the second engineering rule on the path most likely to break it.
 *   4. The request each worker is given is written once, carries IDS AND A SENTENCE rather than
 *      copies of records, and says what each comment was about.
 *
 * POINT 2 SAID THE OPPOSITE UNTIL 19 AUGUST 2026 — one bad address refused the whole review — and
 * the two tests under "what could not be sent" carry the reason it changed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'
import { handleFromTitle } from '../src/server/db/agent-identity.ts'

const WORKSPACE = 'default'
const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let app: FastifyInstance
/** Each case's own number, so a session title it makes is not one an earlier case already used. */
let caseNumber = 0

/** A directory that exists and stays empty, so a stamp can name a transcript nobody wrote. */
const transcriptsGone = mkdtempSync(join(tmpdir(), 'mole-office-agent-dispatch-gone-'))

afterAll(() => { rmSync(transcriptsGone, { recursive: true, force: true }) })

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
  caseNumber += 1
  // THE RUN AND MESSAGE TABLES ARE THE WHOLE OFFICE THIS FILE READS, and each case counts them
  // exactly. Taking them back to no rows at the start of a case is what a fresh database gave it,
  // and every counting reading below still runs over every row that is there.
  t.client.sqlite.exec('DELETE FROM agent_runs')
  t.client.sqlite.exec('DELETE FROM agent_messages')
})

/** File a record through the route, and hand back its id. */
async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * A run Mole Office could really pick up again: a session record carrying what discovery stamps on one.
 *
 * `stampOf` in lib/sessions.ts needs `tool`, `externalId` and `logPath`, and it is the one reader of
 * that stamp in the product — so a fixture that writes the stamp is exercising the same path a
 * discovered session takes rather than a second idea of where a resume id lives.
 */
async function resumableSession(title: string, externalId: string, runtime = 'claude-code'): Promise<string> {
  // THE TRANSCRIPT HAS TO REALLY BE THERE. Since 18 August 2026 dispatch asks `pickUpOf` — the same
  // reading the recipient list shows a person before they press Send — and that reading looks for
  // the file. A stamp pointing at a path nothing wrote is a run that cannot be picked up, which is
  // what `stampedButGone` below is for. This one writes a real file so the sent case is real.
  const logPath = fakeTranscript(externalId)
  return file('session', title, {
    state: 'idle',
    runtime,
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath,
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

/**
 * A run Mole Office has an id for and CANNOT pick up: the stamp is there and the transcript is not.
 *
 * This is the case the whole idea turns on. Before 18 August 2026 the recipient list said this run
 * could not be picked up and dispatch sent to it anyway, so the refusal a person read before
 * pressing Send was advice rather than a rule.
 */
async function stampedButGone(title: string, externalId: string): Promise<string> {
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        // Named but never written, so this run cannot be picked up.
        logPath: join(transcriptsGone, externalId + '.jsonl'),
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago',
        filesTouched: [],
        filesComplete: true,
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

/** A session record nothing has ever stamped: Mole Office has no id for its conversation. */
async function unresumableSession(title: string): Promise<string> {
  return file('session', title, { state: 'idle', runtime: 'claude-code' })
}

async function startReview(title = 'Round six, read again'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title, mode: 'review' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { thread: { id: string } }).thread.id
}

interface Said {
  intent?: string
  body: string
  context?: unknown
  recipient?: unknown
}

async function say(thread: string, said: Said): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: HUMAN,
    payload: { intent: said.intent ?? 'review', body: said.body, context: said.context, recipient: said.recipient },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { message: { id: string } }).message.id
}

interface RunShape {
  id: string
  threadId: string
  recipientSessionId: string | null
  resume: { externalId: string } | null
  runtime: string
  state: string
  says: string
}

/** Every row of the run table, read from the database rather than from the route under test. */
function runRows(): Record<string, unknown>[] {
  return t.client.sqlite.prepare('SELECT * FROM agent_runs ORDER BY rowid').all() as Record<string, unknown>[]
}

function messageStates(): string[] {
  return (t.client.sqlite.prepare('SELECT state FROM agent_messages ORDER BY position').all() as { state: string }[]).map(
    (r) => r.state,
  )
}

// ====================================================== one run per recipient

describe('a review is partitioned by recipient and stays one act', () => {
  it('writes one run per recipient, all naming the same conversation, and says so in words', async () => {
    const cameraRun = await resumableSession('The wrist camera run', 'aaaa1111-0000-0000-0000-00000000aaaa')
    const gripperRun = await resumableSession('The gripper calibration run', 'bbbb2222-0000-0000-0000-00000000bbbb')
    const thread = await startReview()

    for (const n of [1, 2, 3, 4]) {
      await say(thread, {
        body: `Comment ${String(n)} about the camera write-up.`,
        recipient: { kind: 'session', sessionId: cameraRun, why: 'It filed this report on 15 August.' },
      })
    }
    for (const n of [1, 2]) {
      await say(thread, {
        body: `Comment ${String(n)} about the gripper numbers.`,
        recipient: { kind: 'session', sessionId: gripperRun, why: 'It changed this task twice yesterday.' },
      })
    }
    await say(thread, { body: 'Nobody has looked at the mount tolerance at all.', recipient: { kind: 'new' } })

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    const out = sent.json() as { runs: RunShape[]; sent: number; note: string; thread: { state: string } }

    expect(out.runs.length, 'three recipients should produce three runs').toBe(3)
    expect(out.sent).toBe(7)
    expect(new Set(out.runs.map((r) => r.threadId)), 'the runs came out of one review').toEqual(new Set([thread]))
    expect(out.thread.state).toBe('dispatched')

    // The reply says it in words, which is what the screen shows.
    expect(out.note).toContain('3 agents')
    expect(out.note).toContain('4 comments to "The wrist camera run"')
    expect(out.note).toContain('2 comments to "The gripper calibration run"')
    expect(out.note).toContain('1 comment to a new agent')

    // And the rows say it too, so the reply is not the only place this is true.
    const rows = runRows()
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r['recipient_session_id']).sort()).toEqual([cameraRun, gripperRun, null].sort())
    expect(rows.every((r) => r['state'] === 'queued')).toBe(true)

    // Each run carries what a worker needs to pick that agent up again, or null for the new one.
    const camera = out.runs.find((r) => r.recipientSessionId === cameraRun)
    expect(camera?.resume?.externalId).toBe('aaaa1111-0000-0000-0000-00000000aaaa')
    expect(camera?.runtime).toBe('claude-code')
    const fresh = out.runs.find((r) => r.recipientSessionId === null)
    expect(fresh?.resume, 'a deliberately new agent has nothing to resume').toBeNull()
    const { WAITING_FOR_A_WORKER } = await import('../src/server/lib/agents.ts')
    expect(fresh?.says, 'a run nobody has taken says so').toBe(WAITING_FOR_A_WORKER)

    // Every comment went out, and each run holds only the comments addressed to its own recipient.
    expect(messageStates()).toEqual(['sent', 'sent', 'sent', 'sent', 'sent', 'sent', 'sent'])
    const carried = rows.map((row) => {
      const request = JSON.parse(String(row['request'])) as { messages: { body: string }[] }
      return request.messages.map((m) => m.body)
    })
    expect(carried.map((c) => c.length).sort()).toEqual([1, 2, 4])
    for (const bodies of carried) {
      const subjects = new Set(bodies.map((b) => (b.includes('camera') ? 'camera' : b.includes('gripper') ? 'gripper' : 'new')))
      expect(subjects.size, 'a run carried comments meant for more than one agent').toBe(1)
    }
  })

  it('sends a direct message as one run without any of that machinery', async () => {
    const thread = (await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Why is this test flaky', mode: 'direct' },
    })) as { statusCode: number; body: string; json: () => { thread: { id: string } } }
    expect(thread.statusCode, thread.body).toBe(201)
    const id = thread.json().thread.id

    await say(id, { intent: 'ask', body: 'Why does this test only fail on the second run?', recipient: { kind: 'new' } })
    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${id}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    const out = sent.json() as { runs: RunShape[]; note: string }
    expect(out.runs.length).toBe(1)
    expect(out.note).toContain('Not picked up yet')
  })
})

// ====================================================== what could not be sent

/**
 * THESE TWO TESTS CHANGED ON 19 AUGUST 2026 BECAUSE THE PRODUCT BECAME MORE HONEST.
 *
 * They used to assert that one comment nobody could route refused the WHOLE dispatch: a review with
 * four good comments and one bad address sent nothing. design/ROUND-EIGHT.md names that as a defect
 * and not a feature, and the reasoning that had defended it — that sending half would leave a
 * person working out which of their comments had gone — is answered by naming every comment that
 * stayed, keeping each one queued and editable, and sending it on the next press.
 *
 * So what is pinned here now is the property that survived the change: NOTHING IS LOST AND NOTHING
 * IS AMBIGUOUS. A comment either went, or is still here with a sentence saying why it did not.
 */
describe('dispatch sends what it can and says what it could not', () => {
  it('sends the routable comments, keeps the rest, and names each one that stayed', async () => {
    const cameraRun = await resumableSession('The wrist camera run', 'cccc3333-0000-0000-0000-00000000cccc')
    const thread = await startReview()
    const good = await say(thread, {
      body: 'The exposure table is unlabelled.',
      recipient: { kind: 'session', sessionId: cameraRun },
    })
    await say(thread, {
      body: 'Somebody should check the mount tolerance.',
      recipient: { kind: 'unresolved', said: 'the agent working on controller calibration', why: 'two runs matched those words' },
    })
    await say(thread, { body: 'And this figure has no units.' })

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    const out = sent.json() as { sent: number; held: { messageId: string; quotedBody: string; why: string }[]; note: string }

    // The one that could be sent went, and only that one.
    expect(out.sent).toBe(1)
    expect(runRows().length).toBe(1)
    expect(messageStates()).toEqual(['sent', 'queued', 'queued'])

    // Each comment that stayed is named, with its own words and the reason it stayed.
    expect(out.held.length).toBe(2)
    const heldBodies = out.held.map((one) => one.quotedBody)
    expect(heldBodies).toContain('Somebody should check the mount tolerance.')
    expect(heldBodies).toContain('And this figure has no units.')
    expect(heldBodies, 'a comment that went out was reported as held').not.toContain('The exposure table is unlabelled.')
    const why = out.held.map((one) => one.why).join('\n')
    expect(why).toContain('the agent working on controller calibration')
    expect(why).toContain('two runs matched those words')
    expect(why).toContain('No recipient chosen yet')
    // And the same words are in the note, so a screen that only shows the note still says it.
    expect(out.note).toContain('stayed behind')
    expect(out.note).toContain('And this figure has no units.')

    // THE CONVERSATION IS NOT "SENT" WHILE SOMETHING IS STILL WAITING IN IT. That is what keeps the
    // held comments editable and lets a second press send them.
    const still = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
    const detail = still.json() as {
      thread: { state: string }
      says: string
      messages: { id: string; state: string; delivery: { canSend: boolean; says: string } }[]
    }
    expect(detail.thread.state).toBe('open')
    const { runsSent } = await import('../src/server/lib/agents.ts')
    expect(detail.says, 'the conversation said nothing had been sent while a run was out').toContain(runsSent(1))

    // Every comment carries the same reading dispatch acted on, so the screen and the reply agree.
    const held = detail.messages.filter((m) => m.state === 'queued')
    expect(held.length).toBe(2)
    for (const one of held) expect(one.delivery.canSend).toBe(false)
    const wentOut = detail.messages.find((m) => m.id === good)
    expect(wentOut?.state).toBe('sent')
    expect(wentOut?.delivery.canSend, 'the comment that went out reads as unsendable').toBe(true)
  })

  it('sends nothing at all when not one comment can go, and loses nothing', async () => {
    const thread = await startReview()
    await say(thread, { body: 'And this figure has no units.' })
    await say(thread, {
      body: 'Somebody should check the mount tolerance.',
      recipient: { kind: 'unresolved', said: 'the agent working on controller calibration', why: 'two runs matched those words' },
    })

    const before = messageStates()
    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })

    expect(sent.statusCode, sent.body).toBe(409)
    const why = (sent.json() as { error: string }).error
    expect(why).toContain('Nothing was sent')
    expect(why).toContain('And this figure has no units.')
    expect(why).toContain('the agent working on controller calibration')

    expect(runRows(), 'a refused dispatch wrote a run').toEqual([])
    expect(messageStates(), 'a refused dispatch moved a comment').toEqual(before)
    expect(messageStates()).toEqual(['queued', 'queued'])

    const still = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
    expect((still.json() as { thread: { state: string } }).thread.state, 'the conversation was moved on').toBe('open')
  })

  it('sends what stayed behind after one correction, and only that', async () => {
    const cameraRun = await resumableSession('The wrist camera run', 'dddd4444-0000-0000-0000-00000000dddd')
    const thread = await startReview()
    await say(thread, { body: 'The exposure table is unlabelled.', recipient: { kind: 'session', sessionId: cameraRun } })
    const stray = await say(thread, { body: 'And this figure has no units.' })

    const first = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(first.statusCode, first.body).toBe(201)
    expect((first.json() as { sent: number }).sent).toBe(1)

    const fixed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${stray}`,
      headers: HUMAN,
      payload: { recipient: { kind: 'new', why: 'nothing has worked on this yet' } },
    })
    expect(fixed.statusCode, fixed.body).toBe(200)

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
    const out = sent.json() as { sent: number; held: unknown[] }
    expect(out.sent, 'the second press sent the comment that stayed, and not the one already sent').toBe(1)
    expect(out.held).toEqual([])
    expect(runRows().length, 'two presses, two runs, one comment each').toBe(2)
    expect(messageStates()).toEqual(['sent', 'sent'])

    const done = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
    expect(
      (done.json() as { thread: { state: string } }).thread.state,
      'the conversation stayed open with nothing waiting in it',
    ).toBe('dispatched')
  })

  it('refuses a comment addressed to a run it cannot pick up again, rather than starting a fresh agent', async () => {
    const stranger = await unresumableSession('A run somebody typed in by hand')
    const thread = await startReview()
    await say(thread, {
      body: 'Carry on where you left off with the tolerance.',
      recipient: { kind: 'session', sessionId: stranger, why: 'It is filed under the same pipeline.' },
    })

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(409)
    const why = (sent.json() as { error: string }).error
    expect(why).toContain('A run somebody typed in by hand')
    expect(why).toContain('cannot be picked up')
    // The two honest choices, said out loud. Never a silent substitution.
    expect(why).toContain('Address it to a new agent on purpose, or leave it.')
    expect(runRows()).toEqual([])
    expect(messageStates()).toEqual(['queued'])
  })

  it('refuses a run Mole Office has an id for and cannot pick up, which is where the two answers used to disagree', async () => {
    // MEASURED BEFORE THIS RULE EXISTED: the recipient list answered "the transcript this run left
    // is not on this machine any more" and this same dispatch answered 201 and wrote a queued run.
    // One question, two answers, and the wrong one on the path where being wrong means starting an
    // agent that has never heard of the work and reporting that as the answer.
    const gone = await stampedButGone('a run whose transcript is gone', 'ffff6666-0000-0000-0000-00000000ffff')
    const thread = await startReview()
    await say(thread, {
      body: 'Pick this up where you left it.',
      recipient: { kind: 'session', sessionId: gone, why: 'It filed this report.' },
    })

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(409)
    const why = (sent.json() as { error: string }).error
    expect(why).toContain('cannot be picked up')
    expect(why).toContain('Address it to a new agent on purpose, or leave it.')
    // Nothing was written and nothing was lost: one correction sends the whole review.
    expect(runRows()).toEqual([])
    expect(messageStates()).toEqual(['queued'])
  })

  it('lets a direct conversation carry on, and refuses to reopen a finished review', async () => {
    // A DIRECT CONVERSATION IS A CONVERSATION. You say a thing, it goes, an answer comes back, and
    // you say the next thing. A review is one act and closes when it is finished.
    const opened = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Why is this test flaky', mode: 'direct' },
    })
    expect(opened.statusCode, opened.body).toBe(201)
    const direct = (opened.json() as { thread: { id: string } }).thread.id

    await say(direct, { intent: 'ask', body: 'Why does this only fail on the second run?', recipient: { kind: 'new' } })
    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${direct}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)

    await say(direct, { intent: 'ask', body: 'And what about the third?', recipient: { kind: 'new' } })
    const again = await app.inject({ method: 'POST', url: `/api/agent/threads/${direct}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(again.statusCode, again.body).toBe(201)
    // The second send carried the second comment only. The first had already gone.
    expect((again.json() as { sent: number }).sent).toBe(1)
    expect(runRows().length).toBe(2)

    const review = await startReview('Round six, read again')
    await say(review, { body: 'One thing.', recipient: { kind: 'new' } })
    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${review}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)
    const late = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${review}/messages`,
      headers: HUMAN,
      payload: { intent: 'review', body: 'One more thing.' },
    })
    expect(late.statusCode, late.body).toBe(409)
    expect((late.json() as { error: string }).error).toContain('A review is one act')
  })

  it('refuses an empty review rather than writing a run with nothing in it', async () => {
    const thread = await startReview()
    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(409)
    expect((sent.json() as { error: string }).error).toContain('nothing waiting')
    expect(runRows()).toEqual([])
  })

  it('refuses a second dispatch of the same review', async () => {
    const thread = await startReview()
    await say(thread, { body: 'One thing.', recipient: { kind: 'new' } })
    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)
    const again = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(again.statusCode, again.body).toBe(409)
    expect(runRows().length, 'the second press wrote a second run').toBe(1)
  })
})

// ====================================================== the request, written once

describe('the request is what the worker was actually given', () => {
  it('carries the project, the conversation, each comment with a sentence saying what it was about', async () => {
    const report = await file('note', 'Round six, what the review found', {
      body: 'The gripper slipped above 15 N in four of twenty trials.',
    })
    const thread = await startReview()
    await say(thread, {
      intent: 'change',
      body: 'Say which trials, by number.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
      recipient: { kind: 'new' },
    })

    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)

    const row = runRows()[0]
    expect(row).toBeDefined()
    const request = JSON.parse(String(row!['request'])) as {
      workspaceId: string
      actorId: string
      thread: { id: string; title: string; mode: string }
      messages: { id: string; intent: string; body: string; contextSaid: string; contextState: string; context: unknown }[]
      contextNote: string
    }

    expect(request.workspaceId).toBe(WORKSPACE)
    expect(request.thread.id).toBe(thread)
    expect(request.thread.mode).toBe('review')
    expect(request.messages.length).toBe(1)
    expect(request.messages[0]?.intent).toBe('change')
    expect(request.messages[0]?.body).toBe('Say which trials, by number.')

    // THE SENTENCE. "the report Round six…, <id>" — what it is, what it is called, and the handle.
    expect(request.messages[0]?.contextSaid).toContain('note')
    expect(request.messages[0]?.contextSaid).toContain('Round six, what the review found')
    expect(request.messages[0]?.contextSaid).toContain(report)
    expect(request.messages[0]?.contextState).toBe('there')
    // WHAT IT POINTS AT, WHICH IS THE TARGET. A stored context carries more than the caller sent —
    // where in the thing the writer was — and what this line is about is that the request names the
    // record by id rather than inlining it, which the next assertion measures.
    expect((request.messages[0]?.context as { target?: unknown } | undefined)?.target).toEqual({
      kind: 'record',
      recordId: report,
      workspaceId: WORKSPACE,
    })

    // IDS AND A SENTENCE, NOT CONTENT. The agent reads Mole Office over the API, which is the boundary,
    // and a copy taken at dispatch would be stale by the time it was read — and believed anyway.
    const whole = String(row!['request'])
    expect(whole, 'the request inlined the record it points at').not.toContain('slipped above 15 N in four of twenty')
    expect(request.contextNote).toContain('through the Mole Office API')
    expect(request.contextNote).toContain(WORKSPACE)
  })

  it('tells the agent it is being picked up again, and which run it is', async () => {
    const title = `The gripper calibration run ${String(caseNumber)}`
    const run = await resumableSession(title, 'eeee5555-0000-0000-0000-00000000eeee')
    const thread = await startReview()
    await say(thread, {
      body: 'Finish the calibration table.',
      recipient: { kind: 'session', sessionId: run, why: 'It filed this report on 15 August.' },
    })
    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)

    const request = JSON.parse(String(runRows()[0]?.['request'])) as {
      actorId: string
      recipient: { kind: string; sessionRecordId: string; why: string }
      resume: { runtime: string; externalId: string }
      contextNote: string
    }
    expect(request.recipient.kind).toBe('session')
    expect(request.recipient.sessionRecordId).toBe(run)
    expect(request.recipient.why).toBe('It filed this report on 15 August.')
    expect(request.resume.externalId).toBe('eeee5555-0000-0000-0000-00000000eeee')
    expect(request.resume.runtime).toBe('claude-code')
    // THE HANDLE IS THE ONE THIS TITLE MINTS, read from the function that mints it rather than
    // copied here: a second session of one title is handled with a suffix, and the office is shared.
    expect(request.actorId, 'the run writes as the registered holder of its key').toBe(handleFromTitle(title))
    expect(request.contextNote).toContain('picked up again')
    expect(request.contextNote).toContain(title)
  })

  it('says when what a comment pointed at has changed since it was written', async () => {
    const report = await file('note', 'Round six', { body: 'The mount tolerance is 0.2 mm.' })
    const thread = await startReview()
    await say(thread, {
      body: 'Where did this number come from?',
      context: {
        target: { kind: 'record', recordId: report, workspaceId: WORKSPACE },
        span: {
          quote: 'the mount tolerance is 0.2 mm',
          from: 0,
          to: 29,
          field: 'data.body',
        },
      },
      recipient: { kind: 'new' },
    })

    // Somebody rewrites the paragraph the comment was about, between writing it and sending it.
    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${report}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'The mount tolerance was never measured.' } },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(200)

    expect((await app.inject({ method: 'POST', url: `/api/agent/threads/${thread}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })).statusCode).toBe(201)
    const request = JSON.parse(String(runRows()[0]?.['request'])) as {
      messages: { contextState: string }[]
      contextNote: string
    }
    expect(request.messages[0]?.contextState).toBe('changed')
    expect(request.contextNote).toContain('has changed since')
    const { WHAT_REPLACED_THEM_IS_NOT_GUESSED } = await import('../src/server/lib/agents.ts')
    expect(request.contextNote).toContain(WHAT_REPLACED_THEM_IS_NOT_GUESSED)
  })
})
