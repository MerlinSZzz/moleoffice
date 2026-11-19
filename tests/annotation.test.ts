// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * A PERSON POINTED AT SOMETHING AND SAID SOMETHING. That is the whole of an annotation.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A RECORD AND NOT A MESSAGE
 * ---------------------------------------------------------------------------------------
 *
 * Round seven stored a review comment as a row in `agent_messages`, so a comment only existed
 * inside a conversation with an agent. Three things followed, and all three were measured:
 *
 *   it could not outlive the thread;
 *   it could not be collected by a second review;
 *   and it was REFUSED OUTRIGHT when the agent it named was a fixture row — 66 of the 91 session
 *   records in the owner's corpus are fixture rows, so that was the likely case rather than the
 *   rare one, and the person's words were gone before anything was stored.
 *
 * The atomic fact is the annotation. Whether it is ever sent to anybody is a later and separate
 * question, and this file's central test is that one: AN ANNOTATION IS NEVER REFUSED BECAUSE OF WHO
 * IT MIGHT BE SENT TO.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE WORDS ARE NOT REWRITTEN AFTER THEY HAVE GONE
 * ---------------------------------------------------------------------------------------
 *
 * Before it is sent a person may change it or delete it, because nothing has been said to anybody.
 * After it is sent the words are fixed and a correction is a NEW annotation with a `supersedes`
 * link. Nothing is rewritten in place, so an answer can always be read against the question that
 * produced it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'
import { spanNamedBy, type Context } from '../src/shared/targets.ts'
import { SHOWN_CHARACTERS, shortenToWords } from '../src/shared/shortening.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Each case files the notes, reports and threads it acts on. The one case
 * that counts every message in the office reads the count at its own start and compares what was
 * added since, because the shared office holds the messages other cases sent.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const PROSE = 'The mount holds calibration through a full handover. What moved was the mast.'

async function aReport(prose = PROSE): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'Round six, what the review found',
      data: {
        for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
        date: '2026-08-14',
          blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text: prose }],
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

interface Written {
  status: number
  id: string
  error: string
  detail: string
  incomplete: { path: string }[]
}

async function annotate(data: Record<string, unknown>, title = 'Which number was measured?'): Promise<Written> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'annotation', title, data },
  })
  const body = res.json() as {
    record?: { id: string }
    error?: string
    detail?: string
    incomplete?: { path: string }[]
  }
  return {
    status: res.statusCode,
    id: body.record?.id ?? '',
    error: body.error ?? '',
    // THE WIRE HALF OF A REFUSAL. `error` is the sentence a person reads and no longer carries the
    // raw id; `detail` is the same refusal with the id in it, and it is what an agent and Developer
    // mode read. See PanelError in src/server/lib/records.ts.
    detail: body.detail ?? '',
    incomplete: body.incomplete ?? [],
  }
}

// ============================================================ the words, kept

describe('a note somebody left on something is stored whatever else is true', () => {
  it('the agent door stores a cut quote only when its flag is true', async () => {
    // EVERY MESSAGE IN THE OFFICE IS COUNTED HERE. The office is shared by the file and holds the
    // messages the other cases send, so the count is read at the start of the case and each reading
    // below is what was added since.
    const atStart = (t.client.sqlite.prepare('SELECT count(*) AS count FROM agent_messages').get() as { count: number }).count
    const opened = shortenToWords(Array.from({ length: 8 }, () => PROSE).join(' '))
    expect(opened.shortened).toBe(true)

    const made = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'A cut quote', mode: 'direct' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const thread = (made.json() as { thread: { id: string } }).thread.id
    const context = {
      target: { kind: 'page', route: '/' },
      place: { at: 'quote', words: opened.words, cut: true },
    }
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Where did the selection end?', context },
    })
    expect(accepted.statusCode, accepted.body).toBe(201)
    const stored = t.client.sqlite.prepare('SELECT count(*) AS count FROM agent_messages').get() as { count: number }
    expect(stored.count - atStart).toBe(1)

    const refused = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${thread}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'This flag is not a cut.',
        context: { ...context, place: { ...context.place, cut: false } },
      },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    const after = t.client.sqlite.prepare('SELECT count(*) AS count FROM agent_messages').get() as { count: number }
    expect(after.count - atStart).toBe(1)
  })

  it('is written against a passage of a report, with the words, the place and the revision', async () => {
    const report = await aReport()
    const revisions = await app.inject({ method: 'GET', url: `/api/records/${report}/revisions`, headers: HUMAN })
    const newest = (revisions.json() as { revisions: { seq: number; contentHash: string }[] }).revisions[0]!
    const quote = 'What moved was the mast'

    const written = await annotate({
      body: 'This does not match the run log. Which of the two was measured?',
      context: {
        target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
        span: {
          quote,
          from: PROSE.indexOf(quote),
          to: PROSE.indexOf(quote) + quote.length,
          field: 'data.blocks[#b-1].text',
        },
        revision: { seq: newest.seq, contentHash: newest.contentHash },
      },
    })
    expect(written.status, written.error).toBe(201)
    expect(written.incomplete, 'a complete annotation reported something missing').toEqual([])

    // THE WORDS ARE KEPT EXACTLY, and so is everything about where they came from.
    const read = await app.inject({ method: 'GET', url: `/api/records/${written.id}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const record = (read.json() as { record: { data: Record<string, unknown> } }).record
    expect(record.data['body']).toBe('This does not match the run log. Which of the two was measured?')
    // THE WORDS ARE READ THROUGH `spanNamedBy`, THE ONE ACCESSOR. A span is written down in one of
    // two fields — a bare `span`, or inside a `words` place — and src/shared/targets.ts says every
    // reader asks this rather than the field. What this test is about is that the quote and the
    // offset came back exactly as they were sent, and that is true of either field.
    const context = record.data['context'] as Context
    // THE BLOCK IT WAS WRITTEN ON, under the one name a part of a record is stored by. It was sent
    // as `{kind:'reportBlock', blockId:'b-1'}` and this read `blockId`; the door spells the same
    // block as the part of the record it is, so that a stored comment cannot stop the server coming
    // up — `theRegionItNames` in src/server/lib/targets.ts has the whole argument.
    expect((context.target as unknown as { regionId: string }).regionId).toBe('data.blocks[#b-1]')
    expect(spanNamedBy(context)?.quote).toBe(quote)
    expect(spanNamedBy(context)?.from).toBe(PROSE.indexOf(quote))
  })

  it('IS NEVER REFUSED BECAUSE OF WHO IT MIGHT BE SENT TO', async () => {
    // THE POINT OF THE WHOLE KIND. Round seven refused a comment addressed to a session record that
    // came in through the generated corpus, BEFORE storing it, so the person's words were gone. A
    // recipient here is a HINT in the person's own words and nothing routes anything from it, so
    // there is nothing to refuse.
    const report = await aReport()
    const written = await annotate({
      body: 'Ask whoever ran this on Tuesday what the second figure was.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
      recipientHint: 'the agent that has been working on controller calibration, if it is still alive',
    })
    expect(written.status, written.error).toBe(201)
    const read = await app.inject({ method: 'GET', url: `/api/records/${written.id}`, headers: HUMAN })
    const data = (read.json() as { record: { data: Record<string, unknown> } }).record.data
    expect(data['recipientHint']).toBe('the agent that has been working on controller calibration, if it is still alive')
  })

  it('survives the thing it points at being deleted, with the words it quoted', async () => {
    // "If the human typed it and Mole Office claimed it was stored, it must not disappear."
    const report = await aReport()
    const written = await annotate({
      body: 'This number is wrong.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
    })
    expect(written.status, written.error).toBe(201)
    expect((await app.inject({ method: 'DELETE', url: `/api/records/${report}`, headers: HUMAN })).statusCode).toBe(200)

    const read = await app.inject({ method: 'GET', url: `/api/records/${written.id}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    expect((read.json() as { record: { data: Record<string, unknown> } }).record.data['body']).toBe('This number is wrong.')
  })
})

// ============================================================ what it points at is checked

describe('what a note points at is checked on the way in, on both write paths', () => {
  it('refuses a false cut flag and an unmarked long place before either comment is written', async () => {
    const long = Array.from({ length: 8 }, () => 'The mount holds calibration through a full handover.').join(' ')
    const report = await aReport(long)
    const before = (t.client.sqlite.prepare("SELECT count(*) AS count FROM records WHERE kind = 'annotation'").get() as { count: number }).count
    const falseCut = await annotate({
      body: 'A false cut flag must not be kept.',
      context: {
        target: { kind: 'page', route: '/' },
        place: { at: 'quote', words: 'short words', cut: false },
      },
    })
    expect(falseCut.status, falseCut.error).toBe(400)
    expect(falseCut.error).toContain('only ever true')
    expect((t.client.sqlite.prepare("SELECT count(*) AS count FROM records WHERE kind = 'annotation'").get() as { count: number }).count).toBe(before)

    expect(long.length).toBeGreaterThan(SHOWN_CHARACTERS)
    const unmarked = await annotate({
      body: 'An unmarked long quote must not be kept.',
      context: {
        target: { kind: 'page', route: '/' },
        place: { at: 'quote', words: long },
      },
    })
    expect(unmarked.status, unmarked.error).toBe(400)
    expect(unmarked.error).toContain('cut: true')
    expect((t.client.sqlite.prepare("SELECT count(*) AS count FROM records WHERE kind = 'annotation'").get() as { count: number }).count).toBe(before)

    const unmarkedSpan = await annotate({
      body: 'An unmarked long span must not be kept.',
      context: {
        target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
        place: {
          at: 'words',
          span: { quote: long, from: 0, to: long.length, field: 'data.blocks[#b-1].text' },
        },
      },
    })
    expect(unmarkedSpan.status, unmarkedSpan.error).toBe(400)
    expect(unmarkedSpan.error).toContain('cut: true')
    expect((t.client.sqlite.prepare("SELECT count(*) AS count FROM records WHERE kind = 'annotation'").get() as { count: number }).count).toBe(before)
  })

  it('keeps a bounded opening and resolves it at the whole selected range', async () => {
    const long = Array.from({ length: 8 }, () => 'The mount holds calibration through a full handover.').join(' ')
    const opened = shortenToWords(long)
    const report = await aReport(long)
    const written = await annotate({
      body: 'These opening words are where I left this note.',
      context: {
        target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
        place: {
          at: 'words',
          span: { quote: opened.words, from: 0, to: long.length, field: 'data.blocks[#b-1].text' },
          cut: true,
        },
      },
    })
    expect(written.status, written.error).toBe(201)

    const read = await app.inject({ method: 'GET', url: `/api/records/${written.id}`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const stored = (read.json() as { record: { data: Record<string, unknown> } }).record.data['context'] as Context
    expect(stored.place).toEqual({
      at: 'words',
      span: { quote: opened.words, from: 0, to: long.length, field: 'data.blocks[#b-1].text' },
      cut: true,
    })

    const annotation = await app.inject({ method: 'GET', url: `/api/annotations/${written.id}`, headers: HUMAN })
    expect(annotation.statusCode, annotation.body).toBe(200)
    const view = annotation.json() as {
      where: { quote: { words: string; from: number; to: number } | null }
      reading: { state: string; quote?: { words: string; stillThere: boolean; at: number | null } }
    }
    expect(view.where.quote).toEqual({
      words: `${opened.words} …`,
      from: 0,
      to: long.length,
      field: 'data.blocks[#b-1].text',
    })
    expect(view.reading.state).toBe('there')
    expect(view.reading.quote).toMatchObject({ words: `${opened.words} …`, stillThere: true, at: 0 })
  })

  it('refuses a note against a record nobody has', async () => {
    const written = await annotate({
      body: 'About this.',
      context: { target: { kind: 'record', recordId: 'nDx9NOTHINGHERE', workspaceId: WORKSPACE } },
    })
    expect(written.status, written.error).toBe(404)
    // WHICH RECORD WAS NOT FOUND IS STILL SAID, and it is said where an id belongs. The sentence a
    // person reads stopped carrying it on 19 August 2026 (finding 10 of the language audit); the
    // claim this test makes is unchanged and is now checked against `detail`.
    expect(written.detail).toContain('nDx9NOTHINGHERE')
  })

  it('refuses a revision the ledger does not hold', async () => {
    const report = await aReport()
    const written = await annotate({
      body: 'About this.',
      context: {
        target: { kind: 'record', recordId: report, workspaceId: WORKSPACE },
        revision: { seq: 97, contentHash: 'nothing' },
      },
    })
    expect(written.status, written.error).toBe(404)
    expect(written.error).toContain('no revision 97')
  })

  it('refuses a span that ends before it starts, from the shared structural check', async () => {
    const report = await aReport()
    const written = await annotate({
      body: 'About this.',
      context: {
        target: { kind: 'record', recordId: report, workspaceId: WORKSPACE },
        span: { quote: 'the mast', from: 60, to: 20 },
      },
    })
    expect(written.status, written.error).toBe(400)
    expect(written.error).toContain('ends before it starts')
  })

  it('refuses a moved context on a PATCH too, so one write path is not stricter than the other', async () => {
    const report = await aReport()
    const written = await annotate({
      body: 'About this.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
    })
    expect(written.status, written.error).toBe(201)
    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/records/${written.id}`,
      headers: HUMAN,
      payload: { dataPatch: { context: { target: { kind: 'record', recordId: 'nDx9NOTHINGHERE', workspaceId: WORKSPACE } } } },
    })
    expect(moved.statusCode, moved.body).toBe(404)
  })
})

// ============================================================ the words are fixed once they go

describe('the words may be changed until they have gone, and not after', () => {
  async function queued(): Promise<string> {
    const report = await aReport()
    const written = await annotate({
      body: 'First thought.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
    })
    expect(written.status, written.error).toBe(201)
    return written.id
  }

  /**
   * PUT ONE COMMENT'S WORDS IN FRONT OF SOMEBODY, which is what fixes them.
   *
   * Three requests instead of one PATCH, and the extra two are the point: what fixes a person's
   * words is that somebody was given them, and that fact lives in the messages that carried them.
   */
  async function sendTheWordsToSomebody(annotationId: string): Promise<void> {
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Reading that comment', mode: 'direct' },
    })
    expect(thread.statusCode, thread.body).toBe(201)
    const threadId = (thread.json() as { thread: { id: string } }).thread.id
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'First thought.', fromAnnotationId: annotationId, recipient: { kind: 'new' } },
    })
    expect(said.statusCode, said.body).toBe(201)
    const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${threadId}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(sent.statusCode, sent.body).toBe(201)
  }

  it('lets a person rewrite what they wrote while nothing has been said to anybody', async () => {
    const id = await queued()
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Second thought, which is what I mean.' } },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
    expect((read.json() as { record: { data: Record<string, unknown> } }).record.data['body']).toBe(
      'Second thought, which is what I mean.',
    )
  })

  it('lets a person delete it entirely while it is still waiting', async () => {
    const id = await queued()
    expect((await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: HUMAN })).statusCode).toBe(200)
  })

  it('refuses to rewrite the words once it has been sent, and says what to do instead', async () => {
    const id = await queued()
    // SENDING IT IS SENDING IT. This used to be a PATCH writing `state: 'sent'` on the record, and
    // that field is no longer what says a comment has gone out — it could be wrong in both
    // directions and it could be undone. The gate asks whether a message carrying these words has
    // gone out, so the fixture writes one and presses Send.
    await sendTheWordsToSomebody(id)

    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Actually I meant something else.' } },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(409)
    const error = (rewritten.json() as { error: string }).error
    expect(error).toContain('cannot be changed')
    expect(error, 'the refusal does not say what to do instead').toContain('supersedes')

    // AND THE WORDS ARE STILL THERE, unchanged.
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
    expect((read.json() as { record: { data: Record<string, unknown> } }).record.data['body']).toBe('First thought.')
  })

  it('still lets a sent note be given an interpretation, because only the words are fixed', async () => {
    // The words are fixed; everything else about the note still moves. Storing what Mole Office made of
    // them is exactly what is supposed to happen to a note that has gone out.
    const id = await queued()
    await sendTheWordsToSomebody(id)
    const handled = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: {
        dataPatch: { interpretation: 'Reads as a question about which of two numbers was measured.' },
      },
    })
    expect(handled.statusCode, handled.body).toBe(200)
  })

  it('lets a correction be a new note that supersedes the old one, with both readable', async () => {
    const report = await aReport()
    const first = await annotate({
      body: 'First thought.',
      context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
    })
    await app.inject({ method: 'PATCH', url: `/api/records/${first.id}`, headers: HUMAN, payload: { dataPatch: { state: 'sent' } } })
    const second = await annotate(
      {
        body: 'What I actually mean is that the second figure is the measured one.',
        context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
      },
      'Which number was measured — corrected',
    )
    expect(second.status, second.error).toBe(201)
    const linked = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: HUMAN,
      payload: { fromId: second.id, toId: first.id, type: 'supersedes' },
    })
    expect(linked.statusCode, linked.body).toBe(201)

    // BOTH ARE STILL THERE. Nothing was rewritten in place.
    for (const id of [first.id, second.id]) {
      expect((await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })).statusCode).toBe(200)
    }
  })
})

// ============================================================ the words on it

describe('the state words are the ones this product already says', () => {
  it('has one writer of where a comment has got to, and it is not this kind', async () => {
    // The claim the pin above used to make, made about the thing that is actually load-bearing:
    // there is one function in src/ that writes `agent_messages.state`. `tests/one-dispatch-door.
    // test.ts` proves that over the whole tree, from the source and at runtime; this asserts that
    // the function a reader would look for is the one that exists, so a rename cannot quietly leave
    // that file scanning for something nobody calls.
    const dispatch = await import('../src/server/lib/dispatch.ts')
    expect(typeof dispatch.moveMessageTo).toBe('function')
    expect(typeof dispatch.hasGoneOut).toBe('function')
    expect(dispatch.dispatchDoorGuard().installed, dispatch.dispatchDoorGuard().why).toBe(true)
  })

})
