// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IS WHAT THIS COMMENT WAS ABOUT STILL THERE? Three answers, and never a repaired offset.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE QUOTE IS STORED
 * ---------------------------------------------------------------------------------------
 *
 * A comment on a span of text keeps the words it was about. So when somebody rewrites the
 * paragraph underneath it, the comment still says what it referred to — and Mole Office says THE TEXT
 * HAS CHANGED rather than pretending an offset still holds and pointing at whatever is now at
 * character 34.
 *
 * Three answers and no fourth:
 *
 *   there    — it is there, and for a quote the words are still where they were
 *   changed  — it is there and the words moved or went. The comment is not wrong; the text moved
 *   gone     — what it points at is not there any more, or has been deleted
 *
 * Nothing here re-anchors a comment onto different words, and nothing reports a near match as the
 * same words. When Mole Office cannot say where a comment now points, saying so IS the answer.
 *
 * All four kinds of context are exercised: a record, a line of a plan, a block on the week, and a
 * span of text inside one of them.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { spanNamedBy, type Context } from '../src/shared/targets.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

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

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: HUMAN, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function startReview(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title: 'Round six, read again', mode: 'review' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { thread: { id: string } }).thread.id
}

interface Reading {
  state: string
  about: string
  says: string
  quote?: { words: string; stillThere: boolean; at: number | null; field: string | null }
}

async function say(thread: string, context: unknown, body = 'Where did this come from?'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: HUMAN,
    payload: { intent: 'ask', body, context },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { message: { id: string } }).message.id
}

/** What Mole Office now says about each comment in this conversation. */
async function readings(thread: string): Promise<Reading[]> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { messages: { reading: Reading }[] }).messages.map((m) => m.reading)
}

// ====================================================== a whole object

describe('a comment on an object says whether the object is still there', () => {
  it('says it is there, and names it the way a person would', async () => {
    const report = await file('note', 'Round six', { body: 'The mount tolerance is 0.2 mm.' })
    const thread = await startReview()
    await say(thread, { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } })

    const [reading] = await readings(thread)
    expect(reading?.state).toBe('there')
    expect(reading?.about).toContain('note')
    expect(reading?.about).toContain('Round six')
    expect(reading?.about).toContain(report)
    expect(reading?.says).toContain('Still there')
  })

  it('says it is gone once the record is deleted, and does not pretend otherwise', async () => {
    const report = await file('note', 'Round six', { body: 'The mount tolerance is 0.2 mm.' })
    const thread = await startReview()
    await say(thread, { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } })

    const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${report}`, headers: HUMAN })
    expect(deleted.statusCode, deleted.body).toBe(200)

    const [reading] = await readings(thread)
    expect(reading?.state).toBe('gone')
    const { noLongerThere } = await import('../src/server/lib/agents.ts')
    expect(reading?.says).toContain(noLongerThere(reading?.about ?? ''))
    expect(reading?.about).toContain(report)
  })

  it('reads a line of a plan, and says when the line has gone', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: HUMAN,
      payload: { title: 'This week', body: 'Test the gripper\nWrite up round six' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const plan = made.json() as { plan: { id: string }; lines: { id: string; text: string }[] }
    const line = plan.lines.find((l) => l.text.includes('gripper'))
    expect(line).toBeDefined()

    const thread = await startReview()
    await say(thread, { target: { kind: 'planLine', planId: plan.plan.id, lineId: line!.id } })

    const [before] = await readings(thread)
    expect(before?.state).toBe('there')
    expect(before?.about).toContain('Test the gripper')
    expect(before?.about).toContain('This week')

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${plan.plan.id}/lines/${line!.id}`,
      headers: HUMAN,
      payload: { reason: 'the test removes the line the agent was about to read' },
    })
    expect(removed.statusCode, removed.body).toBe(200)

    const [after] = await readings(thread)
    expect(after?.state).toBe('gone')
    const { noLongerThere } = await import('../src/server/lib/agents.ts')
    expect(after?.says).toContain(noLongerThere(after?.about ?? ''))
  })

  it('reads a block on the week by the days it covers and the work it is about', async () => {
    const task = await file('task', 'Test the gripper')
    const placed = await app.inject({
      method: 'POST',
      url: '/api/planning/windows',
      headers: HUMAN,
      payload: { recordId: task, startsOn: '2026-08-20', endsOn: '2026-08-26', note: 'Grip slips above 15 N.' },
    })
    expect(placed.statusCode, placed.body).toBe(201)
    const window = (placed.json() as { window: { id: string } }).window.id

    const thread = await startReview()
    await say(thread, { target: { kind: 'scheduleBlock', windowId: window } })

    const [before] = await readings(thread)
    expect(before?.state).toBe('there')
    expect(before?.about).toContain('2026-08-20')
    expect(before?.about).toContain('2026-08-26')
    expect(before?.about).toContain('Test the gripper')

    const taken = await app.inject({ method: 'DELETE', url: `/api/planning/windows/${window}`, headers: HUMAN })
    expect(taken.statusCode, taken.body).toBe(200)

    const [after] = await readings(thread)
    expect(after?.state).toBe('gone')
  })
})

// ====================================================== a span of text

describe('a comment on a span of text keeps the words, so it survives the text changing', () => {
  const BODY = 'The mount tolerance is 0.2 mm and nobody measured it.'
  const QUOTE = 'nobody measured it'

  async function commentOnTheSpan(): Promise<{ thread: string; report: string }> {
    const report = await file('note', 'Round six', { body: BODY })
    const thread = await startReview()
    await say(thread, {
      target: { kind: 'record', recordId: report, workspaceId: WORKSPACE },
      span: {
        quote: QUOTE,
        from: BODY.indexOf(QUOTE),
        to: BODY.indexOf(QUOTE) + QUOTE.length,
        field: 'data.body',
      },
    })
    return { thread, report }
  }

  it('says the words are still where they were', async () => {
    const { thread } = await commentOnTheSpan()
    const [reading] = await readings(thread)
    expect(reading?.state).toBe('there')
    expect(reading?.says).toContain('same place')
    expect(reading?.quote?.stillThere).toBe(true)
    expect(reading?.quote?.at).toBe(BODY.indexOf(QUOTE))
    expect(reading?.quote?.field).toBe('data.body')
  })

  it('says the text has changed when the words move, and says where they are now', async () => {
    // THE MESSAGE TABLE IS READ WHOLE BELOW. The office is shared by the file and holds the comments
    // the other cases wrote, so the ids are taken at the start of the case and the reading is the
    // first row added since.
    const atStart = new Set((t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]).map((r) => r.id))
    const { thread, report } = await commentOnTheSpan()
    const moved = 'Measured on the bench jig. The mount tolerance is 0.2 mm and nobody measured it.'
    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${report}`,
      headers: HUMAN,
      payload: { dataPatch: { body: moved } },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(200)

    const [reading] = await readings(thread)
    expect(reading?.state).toBe('changed')
    expect(reading?.says).toContain('The text has changed around it')
    expect(reading?.quote?.stillThere).toBe(true)
    expect(reading?.quote?.at, 'it reported where the words are now').toBe(moved.indexOf(QUOTE))
    // AND IT DID NOT REPAIR THE STORED OFFSET. The comment still holds what it was written with.
    //
    // READ THROUGH `spanNamedBy` AND NOT OFF THE COLUMN. The fact being asserted is the offset, and
    // src/shared/targets.ts says in as many words that a span lives in one of two fields — a bare
    // `span` on a context written before places, and `place.span` on one written since — and that
    // every reader asks the one accessor rather than the field. This assertion was reading the
    // field, so it was an assertion about WHERE the offset is written down as much as about what it
    // is, and only one of those two is the point of this test.
    const stored = (t.client.sqlite.prepare('SELECT id, context FROM agent_messages').all() as { id: string; context: string }[]).find(
      (r) => !atStart.has(r.id),
    ) as { context: string }
    expect(spanNamedBy(JSON.parse(stored.context) as Context)?.from).toBe(BODY.indexOf(QUOTE))
  })

  it('says the words are gone when the paragraph is rewritten, and does not guess a replacement', async () => {
    const { thread, report } = await commentOnTheSpan()
    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${report}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'The mount tolerance was measured on the bench jig at 0.18 mm.' } },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(200)

    const [reading] = await readings(thread)
    expect(reading?.state).toBe('changed')
    expect(reading?.says).toContain('no longer in')
    const { WHAT_REPLACED_THEM_IS_NOT_GUESSED } = await import('../src/server/lib/agents.ts')
    expect(reading?.says).toContain(WHAT_REPLACED_THEM_IS_NOT_GUESSED)
    expect(reading?.quote?.stillThere).toBe(false)
    expect(reading?.quote?.at).toBeNull()
    // The comment still says what it was about, which is the whole reason the quote is stored.
    expect(reading?.quote?.words).toBe(QUOTE)
  })

  it('says the object is gone and still shows the words the comment was about', async () => {
    const { thread, report } = await commentOnTheSpan()
    expect((await app.inject({ method: 'DELETE', url: `/api/records/${report}`, headers: HUMAN })).statusCode).toBe(200)

    const [reading] = await readings(thread)
    expect(reading?.state).toBe('gone')
    expect(reading?.says).toContain(QUOTE)
    expect(reading?.quote?.stillThere).toBe(false)
  })

  /**
   * REWRITTEN 18 AUGUST 2026. It used to assert `changed`, and that was Mole Office saying something it
   * had not measured.
   *
   * A comment written without a field never recorded WHICH part of the object its words came from.
   * The `from` on it is an offset into a field nobody named, so it means nothing. Reading that as
   * "the text has changed around it" printed sentences like "now at character 12 of summary, not
   * 12" — a claim about somebody's text that nothing checked, and it fired on every fieldless
   * quote rather than in some corner.
   *
   * What is true is smaller: the words are still in the object, and Mole Office cannot say whether they
   * moved inside it, because it never knew where they were.
   */
  it('finds the words with no field to look in, and does not claim to know whether they moved', async () => {
    const report = await file('note', 'Round six', { body: BODY })
    const thread = await startReview()
    await say(thread, {
      target: { kind: 'record', recordId: report, workspaceId: WORKSPACE },
      span: { quote: QUOTE, from: 0, to: QUOTE.length },
    })

    const [reading] = await readings(thread)
    expect(reading?.state).toBe('there')
    expect(reading?.quote?.stillThere).toBe(true)
    expect(reading?.quote?.field).toBe('data.body')
    // `lookedEverywhere` is on the library's reading and NOT on the served reply, so a screen can
    // only learn this from the sentence. That is why the sentence has to carry it.
    // It says what it could not find out, rather than being silent about it.
    const { WHICH_PART_IS_NOT_RECORDED } = await import('../src/server/lib/agents.ts')
    expect(reading?.says).toContain(WHICH_PART_IS_NOT_RECORDED)
    // And it never states an offset it did not measure.
    expect(reading?.says).not.toContain('not 0')
  })
})
