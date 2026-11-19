// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A COMMENT A REVIEW HOLDS IS NOT IN ITS AGENT'S OWN READS, AND THE REVIEW'S SEND GIVES THE AGENT THE WORDS ONCE.
 * Problem CvxDlivkfqXf, wave 13s round 209.
 *
 * A comment that names its own agent has a delivery row to that agent, queued from the moment it is written. The
 * worker holds it while a review that has not been sent holds the comment (criterion M28,
 * tests/a-review-holds-its-comments-until-it-is-sent.test.ts, which stays as it is). The agent's own reads did not:
 * GET /api/messages?only=waiting-for-me, the waiter and the hook that reads that list listed the comment at once.
 * The send then gave the agent the same words a second time, in the review's one message.
 *
 *   1. the waiting list leaves out a comment a collecting review holds, and says so in `keptBackByAReview`;
 *   2. the waiter leaves it out too, and says so;
 *   3. the hook after a tool call attaches a plain message to the agent and not the comment;
 *   4. after the send, each comment's own row is archived, names the review's message (`carried_in`) and has a
 *      sentence naming it, and the waiting list gives the agent that message and not the comments;
 *   5. a press on a sent comment asks for the run of the review's message, and the worker starts that run;
 *   6. a writer's own `carries` is dropped from its message, and a patch naming `carries` is refused by name.
 *
 * RED AT THE OLD CODE, 5 November 2026: cases 1 to 6 each red (6 of 6). Case 1 on the list holding the comment, case 2
 * on the waiter's rows, case 3 on the hook's attached words, case 4 on the comment's mark, case 5 on the message
 * the press answered with, and case 6 on its first write, because the old message kind had no `carries` field.
 *
 * MUTATIONS, 5 November 2026, each run alone after a green control, the file restored after each:
 *   - the holding read always empty (lib/reviews.ts) reddened cases 1 to 5; case 4 because the lists of cases 1 and 3
 *     had handed the comments over, so the send found no queued row to archive, and case 5 for the same reason;
 *   - the holding read taking ended reviews in place of open ones reddened cases 1 to 5, the same way;
 *   - the holding read holding only the first comment reddened cases 1, 2 and 3 on the second comment, and case 4 on
 *     the second comment's mark;
 *   - the waiting list not leaving held comments out (api/messages.ts) reddened cases 1, 3, 4 and 5;
 *   - the waiting list leaving out every message reddened case 3 on the plain message and case 4 on the review's
 *     message; the list leaving out the carrying message too reddened case 4 on the review's message;
 *   - the waiter not leaving them out (api/handles.ts) reddened case 2 on its rows;
 *   - the waiter not saying what it left out reddened case 2 on `keptBackByAReview`;
 *   - the list not saying it reddened cases 1 and 4; the list saying only the held count reddened case 4;
 *   - the send's own select asking for `seen` rows in place of `queued` ones, so it archives nothing, reddened case 4
 *     on the mark and case 5 on the press's message; the send naming another record in its sentence reddened case 4
 *     on the sentence;
 *   - the send not naming its message on the row, or naming the comment there, reddened case 4 on `carried_in` and
 *     case 5 on the press's message; so did lib/messages.ts not passing `carriedIn` on from the archive, and the mark
 *     writer not writing it;
 *   - the list not leaving carried comments out, reading a carried comment by a `seen` row in place of an `archived`
 *     one, or asking about another kind of recipient, reddened case 4 on the list; the list leaving out only the first
 *     carried comment reddened case 4 on the second;
 *   - the send not storing `carries`, or lib/records.ts dropping it, reddened case 4 on the review's message;
 *   - the press taking the comment as its message (lib/worker.ts) reddened case 5 on the message; its answer naming
 *     the message without the word "message" reddened case 5 on the sentence; `carriedComment` naming the message
 *     reddened case 5 on it; the press's mark written on the comment in place of the message reddened case 5 on the
 *     run the worker started;
 *   - the patch guard leaving `carries` out (lib/records.ts) reddened case 6 on the refusal: the writer's own rule
 *     still refused the patch, but in words that did not name the field, which is why the case reads the name;
 *   - the message write keeping a writer's own `carries` reddened case 6 on the stored message.
 * The expects on the send's status, on its one message for one agent, on the hook's exit status and on cases 5 and 6
 * finding case 4's message are what the cases stand on, and no mutation of this change reaches them.
 * The restore run after the last mutation: 6 of 6 green.
 */

import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, fakeTranscript, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const POST_TOOL_USE = fileURLToPath(new URL('../tools/dsh-hooks/post-tool-use.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api = ''
let settings: WorkerSettings
let watching: Parameters<typeof onePass>[1] = []
const made: string[] = []

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HANDLE = 'review-reads-agent'
const AS_THE_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
}

let sessionId = ''
let aboutId = ''

function aScratchDirectory(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-review-reads-${what}-`))
  made.push(dir)
  return dir
}

async function file(kind: string, title: string, data: Record<string, unknown>, answers: 201 | 409 = 201): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(answers)
  return (res.json() as { record: { id: string } }).record.id
}

async function ask<T>(method: 'GET' | 'POST', path: string, headers: Record<string, string>, payload?: Record<string, unknown>): Promise<T> {
  const res = await app.inject({ method, url: path, headers, ...(payload === undefined ? {} : { payload }) })
  expect(res.statusCode, res.body).toBe(method === 'POST' && path === '/api/reviews' ? 201 : 200)
  return res.json() as T
}

/** A comment on a record, addressed to the agent the way the composer addresses one. */
async function comment(body: string, on: string): Promise<string> {
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  return file('message', body.slice(0, 40), {
    body,
    chosenRecipient: { kind: 'session', sessionId, why: 'It wrote this page.' },
    target: { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } },
  }, 409)
}

interface KeptBack {
  held: number
  carried: number
  says: string
}

/** The agent's own waiting list, the one the hooks read. */
async function theAgentsList(): Promise<{ ids: string[]; keptBack: KeptBack | undefined }> {
  const read = await ask<{ messages: { id: string }[]; keptBackByAReview?: KeptBack }>('GET', '/api/messages?only=waiting-for-me', AS_THE_AGENT)
  return { ids: read.messages.map((one) => one.id), keptBack: read.keptBackByAReview }
}

/** Run the hook after a tool call as the bridge does, and answer the words it attached. */
function theHookAttaches(): Promise<{ status: number | null; context: string; stderr: string }> {
  const env: Record<string, string> = { ...withoutInheritedEffort() } as Record<string, string>
  delete env['FORCE_COLOR']
  delete env['NO_COLOR']
  Object.assign(env, { MOLE_OFFICE_AGENT: HANDLE, MOLE_OFFICE_SESSION: sessionId, MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: api, MOLE_OFFICE_DB: t.file })
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [POST_TOOL_USE], { cwd: aScratchDirectory('hook'), env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.stdin.on('error', () => {
      // The child stopped reading, which is its right; the run is still reported below.
    })
    child.on('close', (status) => {
      const said = stdout.trim() === '' ? {} : (JSON.parse(stdout) as { hookSpecificOutput?: { additionalContext?: string } })
      resolve({ status, context: said.hookSpecificOutput?.additionalContext ?? '', stderr })
    })
    child.stdin.write(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash' }))
    child.stdin.end()
  })
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: aScratchDirectory('outputs'),
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
  const agentRecordId = await file('agent', 'Review reads agent', { handle: HANDLE, runtime: 'claude-code', state: 'active' })
  // A RUN MOLE OFFICE COULD REALLY PICK UP AGAIN, as M28's file files one: the send refuses a run with no transcript.
  const externalId = 'review-reads-run'
  sessionId = await file('session', 'A run of the review reads agent', {
    state: 'idle',
    runtime: 'claude-code',
    ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
    extra: {
      discovered: {
        tool: 'claude-code',
        externalId,
        logPath: fakeTranscript(externalId),
        resumeCommand: `claude --resume ${externalId}`,
        observedState: 'idle',
        stateReason: 'its log last grew 40 minutes ago and a process still names it',
        filesTouched: [],
        filesComplete: true,
        at: '2026-11-05 01:00:00',
      },
    },
  })
  aboutId = await file('note', 'The page a review collects from', { body: 'Two claims and a table.' })
}, 120_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('two comments for one agent while a review collects, and then its send', () => {
  let reviewId = ''
  let first = ''
  let second = ''
  let reviewsMessage = ''

  beforeAll(async () => {
    reviewId = (await ask<{ review: { id: string } }>('POST', '/api/reviews', HUMAN, { entry: { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } } })).review.id
    first = await comment('This claim needs the repository it was written against.', aboutId)
    second = await comment('The second paragraph says the same thing as the first.', aboutId)
  }, 120_000)

  it('1: the waiting list leaves both out, and says a review that has not been sent holds them', async () => {
    const list = await theAgentsList()
    expect(list.ids, 'the agent can read a comment the person has not sent').not.toEqual(expect.arrayContaining([first]))
    expect(list.ids).not.toEqual(expect.arrayContaining([second]))
    const { whatAReviewKeptBack } = await import('../src/server/lib/reviews.ts')
    expect(list.keptBack, 'the list does not say what it left out').toEqual(whatAReviewKeptBack(2))
  })

  it('2: the waiter leaves both out too, and says so', async () => {
    const read = await ask<{ waiting: { messageId: string }[]; keptBackByAReview?: KeptBack }>('GET', `/api/handles/${HANDLE}/waiting`, AS_THE_AGENT)
    const ids = read.waiting.map((one) => one.messageId)
    expect(ids, 'the waiter hands over a comment the person has not sent').not.toEqual(expect.arrayContaining([first]))
    expect(ids).not.toEqual(expect.arrayContaining([second]))
    expect(read.keptBackByAReview?.held, 'the waiter does not say what it left out').toBe(2)
  })

  it('3: the hook after a tool call attaches a plain message to the agent and not the comments', async () => {
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    const plain = await file('message', 'a plain message', { body: 'A plain message, in no review.', to: [{ kind: 'agent', id: HANDLE }] }, 409)
    const ran = await theHookAttaches()
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.context, 'the hook attached nothing at all, so it proves nothing').toContain(`THE MESSAGE, record ${plain}:`)
    expect(ran.context, 'the hook handed the agent a comment the person has not sent').not.toContain(`record ${first}`)
    expect(ran.context).not.toContain(`record ${second}`)
  })

  it('4: after the send, each comment is archived for the review’s message, and the list gives that message alone', async () => {
    // FINISH COLLECTING FIRST, which the send asks for and which releases nothing (M28's case 5).
    await ask('POST', `/api/reviews/${reviewId}/finish-collecting`, HUMAN)
    const sent = await app.inject({
      method: 'POST', url: `/api/reviews/${reviewId}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() }, payload: { to: [], only: [first, second] },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    const messages = (sent.json() as { messages: { id: string }[] }).messages
    expect(messages.length, 'the send wrote no message, or more than one, for one agent').toBe(1)
    reviewsMessage = messages[0]?.id ?? ''
    const { aReviewsMessageCarriesIt, whatAReviewKeptBack } = await import('../src/server/lib/reviews.ts')
    for (const id of [first, second]) {
      const read = await ask<{ message: { deliveries: { mark: string; because: string | null }[] } }>('GET', `/api/messages/${id}`, HUMAN)
      expect(read.message.deliveries.map((one) => one.mark), `${id} can still be handed over on its own`).toEqual(['archived'])
      expect(read.message.deliveries.map((one) => one.because), `${id}'s row does not say which message carries it`).toEqual([aReviewsMessageCarriesIt(reviewsMessage)])
    }
    // WHAT THE LIST AND THE PRESS READ: the message each comment's own row names, and the comments the message names.
    const named = t.client.sqlite.prepare('SELECT message_id AS id, carried_in AS carriedIn FROM message_delivery WHERE message_id IN (?, ?)').all(first, second)
    expect(named, 'a comment’s row does not name the message that carries it').toEqual(
      expect.arrayContaining([{ id: first, carriedIn: reviewsMessage }, { id: second, carriedIn: reviewsMessage }]),
    )
    // AS A SET: two comments written in the same second are not always numbered in the order this file wrote them.
    const carrier = await ask<{ record: { data: { carries?: string[] } } }>('GET', `/api/records/${reviewsMessage}`, HUMAN)
    expect([...(carrier.record.data.carries ?? [])].sort(), 'the review’s message does not name the comments it carries').toEqual([first, second].sort())
    const list = await theAgentsList()
    expect(list.ids, 'the review’s message is not in the agent’s list').toContain(reviewsMessage)
    expect(list.ids, 'the agent is given the words twice').not.toEqual(expect.arrayContaining([first]))
    expect(list.ids).not.toEqual(expect.arrayContaining([second]))
    expect(list.keptBack, 'the list does not say why the comments are left out').toEqual(whatAReviewKeptBack(0, 2))
  }, 120_000)

  it('5: a press on a sent comment starts the run of the review’s message', async () => {
    expect(reviewsMessage, 'case 4 found no message of the review').not.toBe('')
    const pressed = await ask<{ message: string; carriedComment?: string; says: string }>('POST', `/api/messages/${first}/start-an-agent`, HUMAN, {})
    expect(pressed.message, 'the press asked for a run of a comment the review’s message carries').toBe(reviewsMessage)
    expect(pressed.carriedComment).toBe(first)
    expect(pressed.says, 'the answer does not name the message that carries the comment').toContain(`went out in message ${reviewsMessage}`)
    const pass = await onePass(settings, watching)
    expect(pass.started.map((one) => one.messageId), 'no run was started for the review’s message').toContain(reviewsMessage)
  }, 120_000)

  it('6: no writer says its own message carries a comment, and no patch changes what the review’s message carries', async () => {
    expect(reviewsMessage, 'case 4 found no message of the review').not.toBe('')
    const own = await file('message', 'a message that says it carries', { body: 'This says it carries a comment.', to: [{ kind: 'agent', id: HANDLE }], carries: [second] })
    const stored = await ask<{ record: { data: { carries?: string[] } } }>('GET', `/api/records/${own}`, HUMAN)
    expect(stored.record.data.carries, 'a writer put `carries` on its own message').toBeUndefined()
    const res = await app.inject({ method: 'PATCH', url: `/api/records/${reviewsMessage}`, headers: HUMAN, payload: { dataPatch: { carries: [] } } })
    expect({ status: res.statusCode, namesTheField: res.body.includes('`carries`') }, res.body).toEqual({ status: 403, namesTheField: true })
  })
})
