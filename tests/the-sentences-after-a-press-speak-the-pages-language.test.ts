// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * WHAT A REVIEW SAYS AFTER SEND, AND AFTER A READING IS KEPT, IN THE PAGE'S LANGUAGE. Wave 13n's round 33 found the
 * review panel's sentences from src/server/lib/reviews.ts English on Chinese pages (report GMFtAC2grPQg, block b-3).
 * Round 10 moved the plan's lines and sentence to the word lists; the two sentences drawn after a press stayed English:
 * the one after Send (`.px-send-said`, with dispatch's own part from src/server/lib/agents.ts) and the one after a
 * reading is kept (`.px-org-said`). Wave 13r round 12 sends both as facts beside the English, and one composer says
 * them (src/shared/send-plan-words.ts): `sayTheSend`, `sayTheDispatch` and `sayTheKeptReading`.
 *
 * WHAT THIS FILE PROVES:
 *   1. in English the composers give back, word for word, every sentence the server wrote before, part by part;
 *   2. with the Chinese reader they say the same facts in Chinese, with no English word left in the sentence and no
 *      space after a Chinese stop, comma or colon;
 *   3. over the real doors, a Send and a kept reading answer with facts whose sentence is the server's own English, so
 *      the English and the page's sentence cannot drift apart.
 *
 * MUTATIONS: let dispatch keep its own English `note` with one word changed, and case 3 fails; give a Chinese word an
 * English part, and case 2 fails; change one English word, and case 1 fails.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, fakeTranscript, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import {
  sayTheKeptReading,
  sayTheLine,
  sayTheSend,
  type DispatchFacts,
  type KeptReadingFacts,
  type SendFacts,
  type SendPlanSentence } from '../src/shared/send-plan-words.ts'

const chinese = createI18n('zh').t

const run = (title: string) => ({ run: title })

/** The facts of a dispatch, with nothing held and nothing gone before, changed by `over`. */
const dispatch = (over: Partial<DispatchFacts>): DispatchFacts => ({ total: 1, alreadyGone: 0, agents: 1, shares: [], held: [], ...over })



// ============================================================================ over the real doors

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
let t: TestDb
let app: FastifyInstance

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A run Mole Office could pick up again: a session record carrying what discovery stamps on one. */
async function resumableSession(title: string, externalId: string): Promise<string> {
  return file('session', title, {
    state: 'idle',
    runtime: 'claude-code',
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
        at: '2026-08-17 09:00:00',
      },
    },
  })
}

async function remark(on: string, body: string): Promise<string> {
  return file('annotation', body.slice(0, 40), { body, context: { target: { kind: 'record', recordId: on, workspaceId: 'default' } } })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('over the real doors, the facts say exactly the English the server sent', () => {
  it('after a kept reading, and after Send of one comment in the review', async () => {
    const kiln = await file('module', 'The kiln', { context: 'x' })
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HUMAN,
      payload: { entry: { target: { kind: 'record', recordId: kiln, workspaceId: 'default' } } },
    })
    expect(started.statusCode, started.body).toBe(201)
    const review = (started.json() as { review: { id: string } }).review.id
    const one = await remark(kiln, 'The firing log says 1240 and the dial says 1220.')
    const two = await remark(kiln, 'The shelf on the left is cracked.')
    const three = await remark(kiln, 'Nobody wrote down which glaze went in.')
    const finished = await app.inject({ method: 'POST', url: `/api/reviews/${review}/finish-collecting`, headers: HUMAN })
    expect(finished.statusCode, finished.body).toBe(200)

    const organised = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/organise`,
      headers: HUMAN,
      payload: {
        comments: [
          { commentId: one, reading: 'They ask which of two numbers was measured.', intents: ['ask'], artefacts: ['problem'] },
          { commentId: two, reading: 'A shelf needs replacing.', intents: ['change'], artefacts: ['task'] },
          { commentId: three, reading: 'Nobody recorded the glaze.', intents: ['ask'], artefacts: ['problem'] },
        ],
        groups: [],
      },
    })
    expect(organised.statusCode, organised.body).toBe(200)
    const keptReply = organised.json() as { says: string; told: KeptReadingFacts }
    expect(keptReply.says).toBe(sayTheKeptReading(keptReply.told))

    const kilnRun = await resumableSession('The kiln run', 'ext-kiln-run')
    for (const comment of [one, two, three]) {
      const chose = await app.inject({
        method: 'PATCH',
        url: `/api/records/${comment}`,
        headers: HUMAN,
        payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: kilnRun } } },
      })
      expect(chose.statusCode, chose.body).toBe(200)
    }
    const send = async (only: string[]) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/reviews/${review}/send`,
        headers: { ...HUMAN, ...thePersonsKeyHeader() },
        payload: { to: [], only },
      })
      expect(res.statusCode, res.body).toBe(200)
      return res.json() as { says: string; told: SendFacts }
    }
    // ONE COMMENT OF THE THREE, so the sentence has dispatch's part and the part about the two it was not asked to send.
    const first = await send([one])
    expect(first.told.dispatch.shares).toEqual([{ to: { run: 'The kiln run' }, comments: 1 }])
    expect(first.told.notAskedFor).toBe(2)
    expect(first.says).toBe(sayTheSend(first.told))

    // AFTER THE SEND, THE LINE UNDER THE COMMENT THAT WENT SAYS WHERE IT WENT WITH THIS REVIEW, not that it had already
    // gone before (report cu3k8UH1DiRT), in English and in the page's Chinese.
    const plan = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: HUMAN })
    expect(plan.statusCode, plan.body).toBe(200)
    const lines = (plan.json() as { comments: { id: string; says: string; sentence?: SendPlanSentence }[] }).comments
    const went = lines.find((line) => line.id === one)
    expect(went?.says, JSON.stringify(lines)).toMatch(/^Sent with this review to "The kiln run"\. It is now "[^"]+"\.$/)
    expect(went?.sentence).toBeDefined()
    expect(sayTheLine(went!.sentence!, chinese)).toMatch(/^已随这次评审发给“The kiln run”。它现在是“[^”]+”。$/)
    for (const other of [two, three]) {
      expect(lines.find((line) => line.id === other)?.says, 'a comment that stayed was said to have gone').not.toContain('Sent with this review')
    }
  }, 120_000)
})
