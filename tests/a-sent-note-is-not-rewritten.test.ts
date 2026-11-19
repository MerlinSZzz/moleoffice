// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTE THAT HAS GONE TO SOMEBODY IS NOT REWRITTEN, AND A NOTE WHOSE TARGET MOVED IS NOT FROZEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The gate in src/server/lib/records.ts fixed one field of a sent annotation and left three holes.
 * All three were reproduced against a throwaway database before this file was written.
 *
 *   1. THE ANCHOR COULD BE REPLACED. `body` was refused with 409 and `context` was accepted with
 *      200, so the block a note pointed at, the words it quoted and the offsets could all be
 *      swapped after the note had gone out — and an AGENT could do it to a person's note. The quote
 *      IS the evidence a comment survives on, so moving it is rewriting what somebody said about
 *      as much as changing the words is.
 *   2. THE WORDS COULD BE ERASED WITH A 200. The refusal only fired when a body ARRIVED and
 *      differed, so `{"dataPatch":{"body":null}}` and a wholesale `data` that simply left `body` out
 *      both walked past it. Mole Office refused the honest correction and accepted the deletion.
 *   3. A NOTE WAS FROZEN FOREVER ONCE ITS TARGET WAS EDITED. The stored context was re-checked on
 *      every patch that touched `data`, so once the block moved or the record was deleted, no
 *      further write to that note could succeed — not marking it sent, not marking it answered, not
 *      adding an interpretation. A note whose target moved is exactly the note somebody needs to
 *      act on.
 *
 * ---------------------------------------------------------------------------------------
 * AND TWO WAYS ROUND IT, MEASURED 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The three above were all closed, and the gate still asked what state the note is in RIGHT NOW. So
 * a caller that changed the state first and the words second walked past it. Both of these were
 * reproduced against a throwaway database before the tests below were written, and both ended with
 * the record reading `{"body":"REWRITTEN BY AN AGENT","state":"sent"}` — a frozen review stores ids
 * and re-reads the words, so what it contained changed after it froze.
 *
 *   4. STATE BACKWARDS, THREE WRITES AND THREE 200s. `{"dataPatch":{"state":"queued"}}`, then the
 *      body, then `{"dataPatch":{"state":"sent"}}`.
 *   5. KIND OUT AND BACK, ALSO THREE 200s. `{"kind":"note"}`, then the body — which as a note is
 *      ordinary text this rule says nothing about — then `{"kind":"annotation"}`, which brings
 *      `state` and `context` home from "extra" unchanged.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THEY ALL ADD UP TO
 * ---------------------------------------------------------------------------------------
 *
 * What the person wrote and what they were pointing at are ONE fact and both are fixed once the
 * note has gone. Everything else about the note still moves. And what it points at is checked when
 * a write CHANGES it, never re-checked when a write leaves it alone — which is the rule a comment
 * to an agent already follows, and what happens to the target afterwards is `readContext`'s
 * business, said honestly, rather than a refusal.
 *
 * A note that has gone to somebody therefore never goes back to waiting and never stops being a
 * note. Somebody read those words; no later write makes that not have happened.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'
import { spanNamedBy, type Context } from '../src/shared/targets.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-1',
  'x-mole-office-workspace': WORKSPACE,
}

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

const FIRST = 'The mount holds calibration through a full handover.'
const SECOND = 'A different paragraph, about the supplier.'
const QUOTE = 'holds calibration'

/** A report with two paragraphs, so a note can be moved from one to the other. */
async function aReport(): Promise<string> {
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
        blocks: [
          { id: 'b-1', type: 'text', heading: 'What I found', text: FIRST },
          { id: 'b-2', type: 'text', heading: 'What I did not', text: SECOND },
        ],
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** The anchor a person writes when they select the words in the first paragraph. */
function anchor(report: string): Record<string, unknown> {
  return {
    target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
    span: {
      quote: QUOTE,
      from: FIRST.indexOf(QUOTE),
      to: FIRST.indexOf(QUOTE) + QUOTE.length,
      field: 'data.blocks[#b-1].text',
    },
  }
}

/**
 * One note on the first paragraph.
 *
 * IT TAKES NO STATE ANY MORE. Window B took `annotation.data.state` off the kind and off every
 * record in the corpus, so the second argument this helper used to take is a key the write door
 * now refuses. Where a note has to have gone out, `aSentNote` does the thing.
 */
async function aNote(report: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: 'Which of the two was measured?',
      data: { body: 'This does not match the run log.', context: anchor(report) },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * SEND ONE COMMENT'S WORDS TO SOMEBODY, which is what fixes them.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURES USED TO BE `aNote(report)` AND THAT STOPPED BEING THE FACT
 * ---------------------------------------------------------------------------------------
 *
 * The gate read `data.state` on the record, so a fixture could say "this has gone out" by writing a
 * word. It cannot any more, and the reason is the whole of round ten wave 3: that word was a SECOND
 * place where "this has gone out" was written down. It was stamped from the browser after the send,
 * in a `try/catch` that reported its failure and changed nothing, and it could be walked back.
 *
 * The gate now asks `hasGoneOut`, which is true when a message carrying these words is past
 * `queued` — one store, one writer, and nothing un-sends a message. So the fixture has to do the
 * thing: start a conversation, write the comment's words into it naming the comment they came from,
 * and press Send. That is three requests instead of a string, and it is the difference between
 * testing the gate and testing a fixture.
 */
async function sendItToSomebody(noteId: string): Promise<void> {
  const thread = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title: 'Reading the numbers on that page', mode: 'direct' },
  })
  expect(thread.statusCode, thread.body).toBe(201)
  const threadId = (thread.json() as { thread: { id: string } }).thread.id
  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${threadId}/messages`,
    headers: HUMAN,
    payload: {
      intent: 'ask',
      body: 'This does not match the run log.',
      fromAnnotationId: noteId,
      recipient: { kind: 'new' },
    },
  })
  expect(said.statusCode, said.body).toBe(201)
  const sent = await app.inject({ method: 'POST', url: `/api/agent/threads/${threadId}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
  expect(sent.statusCode, sent.body).toBe(201)
}

/** A comment that has gone to somebody: written, then actually sent. */
async function aSentNote(report: string): Promise<string> {
  const note = await aNote(report)
  await sendItToSomebody(note)
  return note
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = HUMAN,
): Promise<{ status: number; error: string; detail: string }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  const body = res.json() as { error?: string; detail?: string }
  // `error` is the sentence a person reads; `detail` is the same refusal with the id, the header or
  // the request in it. See PanelError in src/server/lib/records.ts.
  return { status: res.statusCode, error: body.error ?? '', detail: body.detail ?? '' }
}

async function dataOf(id: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: { data: Record<string, unknown> } }).record.data
}

// ============================================================ the anchor is not moved

describe('what a sent note points at is as fixed as what it says', () => {
  it('refuses an agent moving a person\'s sent note onto different words, and keeps the anchor', async () => {
    const report = await aReport()
    const note = await aSentNote(report)

    const moved = await patch(
      note,
      {
        dataPatch: {
          context: {
            target: { kind: 'reportBlock', recordId: report, blockId: 'b-2' },
            span: {
              quote: 'about the supplier',
              from: SECOND.indexOf('about the supplier'),
              to: SECOND.indexOf('about the supplier') + 'about the supplier'.length,
              field: 'data.blocks[#b-2].text',
            },
          },
        },
      },
      AGENT,
    )
    expect(moved.status, moved.error).toBe(409)
    expect(moved.error, 'the refusal does not say what to do instead').toContain('supersedes')

    // AND THE ANCHOR IS STILL THE ONE THE PERSON WROTE. Read through `spanNamedBy`, the one
    // accessor: src/shared/targets.ts says a span is written down in one of two fields and that no
    // reader asks the field. What this test is about is the four values, not where they sit.
    const context = (await dataOf(note)).context as Context
    // THE STORED TARGET NAMES THE BLOCK AS THE PART OF THE RECORD IT IS. It was written as
    // `{kind:'reportBlock', blockId:'b-1'}` and this assertion read `blockId`; the door now spells
    // the same block as the region it is, so the same fact is read off `regionId`. Nothing about
    // what this test is for changed: the anchor is still block b-1 of the same report.
    expect((context.target as unknown as { regionId: string }).regionId).toBe('data.blocks[#b-1]')
    expect(spanNamedBy(context)?.quote).toBe(QUOTE)
    expect(spanNamedBy(context)?.from).toBe(FIRST.indexOf(QUOTE))
  })

  it('refuses a wholesale write that leaves the anchor off entirely', async () => {
    const report = await aReport()
    const note = await aSentNote(report)
    const gone = await patch(note, { data: { body: 'This does not match the run log.' } })
    expect(gone.status, gone.error).toBe(409)
    expect((await dataOf(note)).context, 'the note stopped being about anything').toBeDefined()
  })

  it('lets the anchor be corrected while nothing has been said to anybody', async () => {
    // THE OTHER HALF OF THE RULE. A queued note is a draft: the person may point it somewhere else,
    // because nobody has read it yet. A gate that refused this would be refusing an ordinary edit.
    const report = await aReport()
    const note = await aNote(report)
    const moved = await patch(note, {
      dataPatch: { context: { target: { kind: 'reportBlock', recordId: report, blockId: 'b-2' } } },
    })
    expect(moved.status, moved.error).toBe(200)
    const context = (await dataOf(note)).context as { target: { regionId: string } }
    // The same block, read off the one name the door stores it under. See the assertion above.
    expect(context.target.regionId).toBe('data.blocks[#b-2]')
  })
})

// ============================================================ the words are not erased

describe('the words of a sent note cannot be deleted, by either spelling of a deletion', () => {
  it('refuses a null body, which used to delete the key with a 200', async () => {
    const report = await aReport()
    const note = await aSentNote(report)
    const erased = await patch(note, { dataPatch: { body: null } })
    expect(erased.status, erased.error).toBe(409)
    expect((await dataOf(note))['body']).toBe('This does not match the run log.')
  })

  it('refuses a wholesale write that simply leaves the body out', async () => {
    const report = await aReport()
    const note = await aSentNote(report)
    const erased = await patch(note, { data: { context: anchor(report) } })
    expect(erased.status, erased.error).toBe(409)
    expect((await dataOf(note))['body']).toBe('This does not match the run log.')
  })

  it('refuses to erase the words of an ANSWERED note too, not only a sent one', async () => {
    const report = await aReport()
    const note = await aSentNote(report)
    const erased = await patch(note, { dataPatch: { body: null } })
    expect(erased.status, erased.error).toBe(409)
    expect((await dataOf(note))['body']).toBe('This does not match the run log.')
  })

  it('lets a person delete their own words while the note is still waiting', async () => {
    const report = await aReport()
    const note = await aNote(report)
    const erased = await patch(note, { dataPatch: { body: null } })
    expect(erased.status, erased.error).toBe(200)
  })
})

// ============================================================ a note whose target moved still moves

describe('a note is not frozen by what happens to the thing it points at', () => {
  it('can still be sent after the block it points at has been replaced', async () => {
    // IT USED TO BE "marked sent", BY WRITING A WORD ON THE RECORD. That word is gone: window B
    // deleted the field and emptied the key. Being sent is now the thing itself — a message
    // carrying these words, past `queued` — so this test does the thing and then asks the store.
    const report = await aReport()
    const note = await aNote(report)
    const edited = await patch(report, {
      dataPatch: { blocks: [{ id: 'b-2', type: 'text', heading: 'What I did not', text: SECOND }] },
    })
    expect(edited.status, edited.error).toBe(200)

    await sendItToSomebody(note)
    const rewrite = await patch(note, { dataPatch: { body: 'REWRITTEN' } }, AGENT)
    expect(rewrite.status, 'the words of a note that has gone out were not fixed').toBe(409)
  })

  it('can still be given an interpretation after its record is deleted', async () => {
    const report = await aReport()
    const note = await aSentNote(report)
    expect((await app.inject({ method: 'DELETE', url: `/api/records/${report}`, headers: HUMAN })).statusCode).toBe(200)

    const handled = await patch(note, {
      dataPatch: { interpretation: 'Reads as a question about which figure was measured.' },
    })
    expect(handled.status, handled.error).toBe(200)
    expect((await dataOf(note))['interpretation']).toContain('which figure was measured')
  })

  it('checks what a record TURNING INTO a note points at, which nothing used to check', async () => {
    // The gate used to ask what kind the record IS, and a kind change rewrites `data` — so a note
    // whose `data.extra` held a context was answered 200 and stored an anchor nothing had looked at.
    // It now asks what kind the record WILL BE, which is the word the pipeline check beside it uses.
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'note',
        title: 'not a note somebody left on something, yet',
        data: {
          date: '2026-08-14',
          body: 'This does not match the run log.',
          extra: {
            context: { target: { kind: 'record', recordId: 'nDx9NOTHINGHERE', workspaceId: WORKSPACE } },
          },
        },
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id

    const became = await patch(id, { kind: 'annotation' })
    expect(became.status, became.error).toBe(404)
    // WHICH RECORD WAS NOT FOUND IS STILL SAID, in `detail`, where an id belongs. The sentence a
    // person reads stopped carrying it on 19 August 2026 — finding 10 of the language audit.
    expect(became.detail).toContain('nDx9NOTHINGHERE')
  })

  it('still refuses a note MOVED onto something that is not there, so nothing was opened up', async () => {
    // The check did not go away; it now runs when the write changes the anchor, and only then.
    const report = await aReport()
    const note = await aNote(report)
    const moved = await patch(note, {
      dataPatch: { context: { target: { kind: 'reportBlock', recordId: report, blockId: 'b-9' } } },
    })
    expect(moved.status, moved.error).toBe(404)
    expect(moved.error).toContain('no block with the id b-9')
  })
})

// ============================================================ the two ways round the gate

/**
 * THE WHOLE SEQUENCE, NOT ONE WRITE OF IT.
 *
 * Each of these presses every button of the attack in order and then reads the record back. A test
 * that only asserted the middle refusal would pass with the state moved and the words still safe,
 * which is not the property anybody cares about: what matters is that the words a person sent are
 * the words that are stored at the end.
 */
describe('a note that has gone to somebody never goes back to where its words can be changed', () => {
  it('refuses the state field outright now, and still refuses the words either way', async () => {
    // THE THREE-WRITE REWRITE, RUN IN FULL, AND IT GETS NOWHERE.
    //
    // THE FIRST WRITE HAS BEEN THREE THINGS AND THIS IS THE THIRD. It was a 409 while the gate
    // read `data.state`; it became a 200 in wave 4, when the gate started asking the dispatch store
    // instead and the field decided nothing; and window B has now taken the field off the kind, so
    // it is a 400 — an unknown key on an annotation. The last line has never moved through any of
    // that, and it is the only line anybody cares about: the words a person sent are the words that
    // are stored at the end.
    const report = await aReport()
    const note = await aSentNote(report)

    const back = await patch(note, { dataPatch: { state: 'queued' } }, AGENT)
    expect(back.status, back.error).toBe(400)
    expect(back.error, 'the refusal did not name the key').toContain('state')

    const rewrite = await patch(note, { dataPatch: { body: 'REWRITTEN BY AN AGENT' } }, AGENT)
    expect(rewrite.status, rewrite.error).toBe(409)
    expect(rewrite.error, 'the refusal does not say what to do instead').toContain('supersedes')
    expect((await dataOf(note))['body']).toBe('This does not match the run log.')
  })

  it('refuses a wholesale write that changes the words, and takes one that does not', async () => {
    const report = await aReport()
    const note = await aSentNote(report)
    // The write changes nothing at all, and is taken. The one below changes the words, and is not.
    // The `state` key is not in either of them, because no annotation has one any more.
    const stateless = await patch(note, {
      data: { body: 'This does not match the run log.', context: anchor(report) },
    })
    expect(stateless.status, stateless.error).toBe(200)
    expect((await dataOf(note))['state'], 'no annotation holds a state key after window B').toBeUndefined()

    const gone = await patch(note, { data: { body: 'REWRITTEN BY AN AGENT', context: anchor(report) } })
    expect(gone.status, gone.error).toBe(409)
    expect((await dataOf(note))['body']).toBe('This does not match the run log.')
  })

  it('refuses the kind changing, so the note cannot be walked outside the rule and back', async () => {
    const report = await aReport()
    const note = await aSentNote(report)

    const out = await patch(note, { kind: 'note' }, AGENT)
    expect(out.status, out.error).toBe(409)
    expect(out.error, 'the refusal does not say what to do instead').toContain('supersedes')

    // AND THE WORDS ARE STILL REFUSED, because the record is still an annotation.
    const rewrite = await patch(note, { dataPatch: { body: 'REWRITTEN BY AN AGENT' } }, AGENT)
    expect(rewrite.status, rewrite.error).toBe(409)
    expect((await dataOf(note))['body']).toBe('This does not match the run log.')
  })

  it('lets everything else about a sent note change, which is the other half of the rule', async () => {
    // THE HALF A TOO-WIDE REFUSAL WOULD BREAK. Only the words and what they point at are fixed;
    // a reading stored beside them, and the title, are exactly what is meant to move afterwards.
    const report = await aReport()
    const note = await aSentNote(report)
    const read = await patch(note, { dataPatch: { interpretation: 'Reads as a question about which number was measured.' } })
    expect(read.status, read.error).toBe(200)
    expect((await dataOf(note))['interpretation']).toContain('which number was measured')
  })

  it('lets a note nobody has read change its words and its kind freely', async () => {
    // A note nobody has been given is a draft: nothing has been said to anybody, so none of this
    // rule applies. It used to change its `state` here; there is no state to change.
    const report = await aReport()
    const note = await aNote(report)
    expect((await patch(note, { dataPatch: { body: 'Reworded before anybody saw it.' } })).status).toBe(200)

    const second = await aNote(report)
    const became = await patch(second, { kind: 'note' })
    expect(became.status, became.error).toBe(200)
  })

  it('says a note has no state field at all, rather than lecturing about sending', async () => {
    // A key no annotation has is answered by `validateRecordData`, and refusing it as an un-send
    // would send the reader to the wrong problem. Until window B this said "the three words a state
    // takes"; the field is gone now, so the refusal names the fields an annotation does have.
    const report = await aReport()
    const note = await aSentNote(report)
    const typo = await patch(note, { dataPatch: { state: 'draft' } })
    expect(typo.status, typo.error).toBe(400)
    expect(typo.error).toContain('no field by that name')
    expect(typo.error, 'a spelling mistake was answered with the sending rule').not.toContain('supersedes')
  })
})
