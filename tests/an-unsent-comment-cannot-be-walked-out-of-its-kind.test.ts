// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KIND-CHANGE HOLE, RUN AND NOT READ — ON A COMMENT NOBODY HAS SENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE FILE FROM `a-sent-note-is-not-rewritten.test.ts`
 * ---------------------------------------------------------------------------------------
 *
 * That file runs the same three writes against a comment that HAS gone to somebody, where the
 * words-are-fixed gate refuses them. This one runs them against a comment nobody has sent, where
 * that gate says nothing at all and only the AUTHORSHIP gate stands — the third of the three, added
 * on 19 August 2026, and the widest. A comment is `queued` for most of its life, including the whole
 * of the time it sits in a review nobody has sent, and while it was `queued` anybody could rewrite
 * another person's words.
 *
 * ---------------------------------------------------------------------------------------
 * THE SEQUENCE, AND WHAT IT USED TO ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * The build plan asks for exactly this, run rather than reasoned about: turn an unsent comment into
 * a note, rewrite its body as a different actor, turn it back — and assert TWO REFUSALS, not two
 * 200s.
 *
 * The refusals live inside `if (kind === 'annotation' || nextKind === 'annotation')`, and the first
 * half of that condition is the repair. When the gate asked only about the kind the record was
 * BECOMING, the first write of this sequence — `{"kind":"note"}` — walked past every one of the
 * three refusals, because a note is not an annotation; and the second write — the body — walked past
 * them too, because by then the record WAS a note and neither half of the condition held. Two 200s,
 * and the person's words were gone.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SEQUENCE THAT IS ASSERTED, NOT ONE WRITE OF IT
 * ---------------------------------------------------------------------------------------
 *
 * Each case below presses every button of the attack in order and then reads the record back. A
 * test asserting only the middle refusal would pass with the kind changed and the words still safe,
 * which is not what anybody cares about: what matters is that the words the person wrote are the
 * words that are stored at the end.
 *
 * Every failing case here was proved by mutation — the three refusals moved back inside
 * `if (nextKind === 'annotation')` — with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-1',
  'x-mole-office-workspace': WORKSPACE,
}

const WORDS = 'This does not match the run log.'
const FIRST = 'The mount holds calibration through a full handover.'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function aReport(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'Round ten, what the review found',
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-26', blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text: FIRST }] },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A comment the PERSON wrote, which nobody has sent. */
async function aQueuedComment(report: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: 'Which of the two was measured?',
      data: {
        body: WORDS,
        context: { target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' } },
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AGENT,
): Promise<{ status: number; error?: string; detail?: string }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  const body = res.json() as { error?: string; detail?: string }
  return { status: res.statusCode, error: body.error, detail: body.detail }
}

async function dataOf(id: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  return (res.json() as { record: { kind: string; data: Record<string, unknown> } }).record.data
}

async function kindOf(id: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  return (res.json() as { record: { kind: string } }).record.kind
}

describe('a comment nobody has sent still belongs to whoever wrote it', () => {
  it('refuses the kind change AND the rewrite, and the words are the ones the person wrote', async () => {
    const report = await aReport()
    const comment = await aQueuedComment(report)

    // WRITE ONE — out of the rule. This is the write that used to answer 200, because the gate
    // asked only what the record was BECOMING and a note is not an annotation.
    const out = await patch(comment, { kind: 'note' })
    expect(out.status, out.error).toBe(403)
    expect(out.error, 'the refusal does not say who wrote it').toContain(`human:${THE_TEST_OFFICES_OWNER.id}`)
    expect(out.error, 'the refusal does not say what to do instead').toContain('supersedes')

    // WRITE TWO — the words. It is refused for the same reason, and the record is still a comment,
    // so it is refused by the same gate rather than by luck.
    const rewrite = await patch(comment, { dataPatch: { body: 'REWRITTEN BY AN AGENT' } })
    expect(rewrite.status, rewrite.error).toBe(403)
    expect(rewrite.error).toContain('supersedes')

    // WRITE THREE — back in. Nothing to bring back, because nothing left.
    const back = await patch(comment, { kind: 'annotation' })
    expect(back.status, back.error).toBe(200)

    // AND THE END STATE, which is the only thing that matters.
    expect(await kindOf(comment)).toBe('annotation')
    expect((await dataOf(comment))['body']).toBe(WORDS)
  })

  it('refuses moving what an unsent comment points at, as the same one act', async () => {
    // `body` and `context` are ONE fact. A comment moved onto a different paragraph says something
    // else about something else, and the quote is the evidence the comment survives on.
    const report = await aReport()
    const comment = await aQueuedComment(report)
    const moved = await patch(comment, {
      dataPatch: { context: { target: { kind: 'record', recordId: report } } },
    })
    expect(moved.status, moved.error).toBe(403)
    expect(moved.error).toContain('what it points at')
  })

  it('lets the person who wrote it do all three, so the rule is about authorship and not about comments', async () => {
    const report = await aReport()
    const comment = await aQueuedComment(report)
    expect((await patch(comment, { kind: 'note' }, HUMAN)).status).toBe(200)
    expect((await patch(comment, { dataPatch: { body: 'What I meant was something else.' } }, HUMAN)).status).toBe(200)
    expect((await patch(comment, { kind: 'annotation' }, HUMAN)).status).toBe(200)
    expect((await dataOf(comment))['body']).toBe('What I meant was something else.')
  })

  it('lets an agent do everything else to somebody else\'s unsent comment', async () => {
    // THE OTHER HALF OF THE RULE, and a too-wide refusal would break it. Only the words and what
    // they point at are fixed. A reading stored beside them, and the title, still move. (It named
    // `state` as a third until window B took that field off the annotation kind.)
    const report = await aReport()
    const comment = await aQueuedComment(report)
    expect((await patch(comment, { dataPatch: { interpretation: 'Reads as a question about which figure.' } })).status).toBe(200)
    expect((await patch(comment, { title: 'Which figure was measured?' })).status).toBe(200)
  })
})
