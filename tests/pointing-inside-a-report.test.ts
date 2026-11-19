// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * POINTING AT A PASSAGE, A ROW AND A CELL — and saying what the revision it was written against held.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER COULD NOT DO, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Selecting text inside a Report must target the selected passage, not the whole Report.
 * Round seven could point at three things — a record, a line of a plan,
 * a block on the week — so a comment on one paragraph of a twenty-block report was a comment on the
 * report.
 *
 * This file is the proof that a block, a row and a cell are now things in their own right, and that
 * each one is looked up rather than assumed: a block id nothing holds is `gone` with a sentence
 * naming the block ids that ARE there, and a row number past the end of the table says how many
 * rows there are.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE SENTENCE THAT USED TO BE A GUESS
 * ---------------------------------------------------------------------------------------
 *
 * Round seven could say *the text has changed* and could not say what the text used to be. The
 * revision ledger changes that: a comment may name the revision it was written against, and the
 * reading then says which revision that was and WHAT THAT REVISION HELD THERE. Nothing is repaired
 * and nothing is re-anchored — the old text is shown, not restored.
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

const PROSE = 'The mount holds calibration through a full handover. What moved was the mast.'

/** A report with one paragraph and one table in it, which is what the whole file points into. */
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
          { id: 'b-1', type: 'text', heading: 'What I found', text: PROSE },
          {
            id: 'b-2',
            type: 'table',
            columns: [{ label: 'run' }, { label: 'reprojection error (px)', align: 'right' }],
            rows: [{ cells: ['before the knock', 0.4] }, { cells: ['after the knock', 1.9] }],
            caption: 'Forty checkerboard frames each.',
          },
        ],
      },
    },
  })
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
  writtenAgainst?: { seq: number; inTheLedger: boolean; heldThere: string | null; field: string | null; says: string }
}

/** Write one comment and hand back what Mole Office says it is about. */
async function say(thread: string, context: unknown): Promise<{ status: number; reading: Reading; error: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: HUMAN,
    payload: { intent: 'ask', body: 'Where did this come from?', context },
  })
  const body = res.json() as { message?: { reading: Reading }; error?: string }
  return { status: res.statusCode, reading: body.message?.reading ?? ({} as Reading), error: body.error ?? '' }
}

/** What Mole Office now says about every comment in this conversation. */
async function readings(thread: string): Promise<Reading[]> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { messages: { reading: Reading }[] }).messages.map((m) => m.reading)
}

/** The newest revision of a record, as a writer would read it before pointing at it. */
async function newestRevision(record: string): Promise<{ seq: number; contentHash: string }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${record}/revisions`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const list = (res.json() as { revisions: { seq: number; contentHash: string }[] }).revisions
  const newest = list[0]
  expect(newest, 'the record has no revisions at all').toBeDefined()
  return { seq: newest!.seq, contentHash: newest!.contentHash }
}

// ============================================================ a block of a report

describe('a comment on one block of a report is about that block, not about the report', () => {
  it('names the block, the report and the kind of record it is in', async () => {
    const report = await aReport()
    const thread = await startReview()
    const said = await say(thread, { target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' } })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state).toBe('there')
    expect(said.reading.about).toContain('b-1')
    expect(said.reading.about).toContain('Round six, what the review found')
    expect(said.reading.about).toContain('report')
  })

  it('finds a quote inside the block, and says which stored string it came from', async () => {
    const report = await aReport()
    const thread = await startReview()
    const quote = 'What moved was the mast'
    const said = await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      span: {
        quote,
        from: PROSE.indexOf(quote),
        to: PROSE.indexOf(quote) + quote.length,
        field: 'data.blocks[#b-1].text',
      },
    })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state).toBe('there')
    expect(said.reading.says).toContain('same place')
    expect(said.reading.quote?.field).toBe('data.blocks[#b-1].text')
  })

  it('says a block that is not there is gone, and names the ones that are', async () => {
    const report = await aReport()
    const thread = await startReview()
    const said = await say(thread, { target: { kind: 'reportBlock', recordId: report, blockId: 'b-9' } })
    expect(said.status, said.error).toBe(404)
    expect(said.error).toContain('no block with the id b-9')
    // The refusal names what IS there, so the caller's next request is right rather than another guess.
    expect(said.error).toContain('b-1')
    expect(said.error).toContain('b-2')
  })

  it('refuses a block of a record that holds no blocks at all, and says which kinds do', async () => {
    const task = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'task', title: 'Measure the mount tolerance', data: { state: 'todo' } },
    })
    expect(task.statusCode, task.body).toBe(201)
    const id = (task.json() as { record: { id: string } }).record.id
    const thread = await startReview()
    const said = await say(thread, { target: { kind: 'reportBlock', recordId: id, blockId: 'b-1' } })
    expect(said.status, said.error).toBe(404)
    // WHICH KINDS DO IS READ OFF THE DECLARATION AND NOT WRITTEN OUT IN THE MESSAGE, so this asks
    // for the two kinds and the two field names rather than for one sentence somebody typed. A
    // third kind given a block field appears in this message without anybody editing it, and this
    // assertion keeps holding.
    expect(said.error).toContain('a task holds no blocks')
    expect(said.error).toContain('a report in `blocks`')
    expect(said.error).toContain('a module in `summaryBlocks`')
  })
})

// ============================================================ a row and a cell

describe('a comment on a row or a cell of a table', () => {
  it('reads the cells of the row it names, counting from 1 as a person does', async () => {
    const report = await aReport()
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'tableRow', recordId: report, blockId: 'b-2', rowKey: '2' },
      span: { quote: 'after the knock', from: 0, to: 15, field: 'data.blocks[#b-2].rows[1].cells[0]' },
    })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state).toBe('there')
    // WHAT THE READING NAMES, AND WHAT THAT COST. It read *row 2 of the table b-2*; the comment is
    // now stored as the part of the record that row is, so the reading names the part by its path.
    // That is a path where there was a sentence, and it is the price of a stored comment that
    // cannot stop the server coming up — `theRegionItNames` in src/server/lib/targets.ts says so in
    // the same words. It is the reading every other part of a record has had since round ten, and
    // giving a region reader better words is worth doing and is a separate piece of work.
    expect(said.reading.about).toContain('data.blocks[#b-2].rows[1]')
    expect(said.reading.quote?.field).toBe('data.blocks[#b-2].rows[1].cells[0]')
  })

  it('reads one cell, and says how many there are when the column is past the end', async () => {
    const report = await aReport()
    const thread = await startReview()
    const there = await say(thread, {
      target: { kind: 'tableCell', recordId: report, blockId: 'b-2', rowKey: '2', columnKey: '1' },
    })
    expect(there.status, there.error).toBe(201)
    // The cell, named as the part of the record it is. See the note on the row above.
    expect(there.reading.about).toContain('data.blocks[#b-2].rows[1].cells[0]')

    const past = await say(thread, {
      target: { kind: 'tableCell', recordId: report, blockId: 'b-2', rowKey: '2', columnKey: '9' },
    })
    expect(past.status, past.error).toBe(404)
    expect(past.error).toContain('2 cells')
  })

  it('says a row past the end of the table is gone, with the number of rows there are', async () => {
    const report = await aReport()
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'tableRow', recordId: report, blockId: 'b-2', rowKey: '7' },
    })
    expect(said.status, said.error).toBe(404)
    expect(said.error).toContain('2 rows')
  })

  it('refuses a row of a block that is not a table, rather than reading whatever is there', async () => {
    const report = await aReport()
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'tableRow', recordId: report, blockId: 'b-1', rowKey: '1' },
    })
    expect(said.status, said.error).toBe(404)
    expect(said.error).toContain('is not a table')
  })

  it('reports a row that now holds something else, because a row key is a position', async () => {
    // A STORED TABLE ROW HAS NO ID, so the key is where the row sits and a row inserted above moves
    // it. Mole Office does not pretend the comment followed the words: the quote is what survives, and
    // the reading says the text has changed.
    const report = await aReport()
    const thread = await startReview()
    const quote = 'after the knock'
    await say(thread, {
      target: { kind: 'tableRow', recordId: report, blockId: 'b-2', rowKey: '2' },
      span: { quote, from: 0, to: quote.length, field: 'data.blocks[#b-2].rows[1].cells[0]' },
    })

    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${report}`,
      headers: HUMAN,
      payload: {
        dataPatch: {
          blocks: [
            { id: 'b-1', type: 'text', heading: 'What I found', text: PROSE },
            {
              id: 'b-2',
              type: 'table',
              columns: [{ label: 'run' }, { label: 'reprojection error (px)', align: 'right' }],
              rows: [
                { cells: ['before the knock', 0.4] },
                { cells: ['the mast was re-seated', 0.5] },
                { cells: ['after the knock', 1.9] },
              ],
              caption: 'Forty checkerboard frames each.',
            },
          ],
        },
      },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(200)

    const [reading] = await readings(thread)
    expect(reading?.state, reading?.says).toBe('changed')
    expect(reading?.quote?.words).toBe(quote)
    // It did not silently follow the words down to row 3.
    expect(reading?.says).toContain('no longer in')
  })
})

// ============================================================ the revision it was written against

describe('a comment can say which revision it was written against', () => {
  it('refuses a revision the ledger does not hold, rather than storing a number nothing answers to', async () => {
    const report = await aReport()
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      revision: { seq: 99, contentHash: 'not-a-hash' },
    })
    expect(said.status, said.error).toBe(404)
    expect(said.error).toContain('no revision 99')
  })

  it('refuses a seq and a hash that name different revisions, because one of them is wrong', async () => {
    const report = await aReport()
    const revision = await newestRevision(report)
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      revision: { seq: revision.seq, contentHash: 'a-hash-of-something-else' },
    })
    expect(said.status, said.error).toBe(400)
    expect(said.error).toContain('name different content')
  })

  it('refuses a revision on a target that has no ledger, because revisions are of records', async () => {
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'page', route: '/records' },
      revision: { seq: 1, contentHash: 'anything' },
    })
    expect(said.status, said.error).toBe(400)
    expect(said.error).toContain('has no revisions')
  })

  it('says which revision it was written against AND what that revision held there', async () => {
    // THE SENTENCE ROUND SEVEN COULD NOT SAY. It could report that the words had gone; it could not
    // show the text they were sitting in when somebody wrote about them.
    const report = await aReport()
    const revision = await newestRevision(report)
    const thread = await startReview()
    // THE READING IS OVER EVERY MESSAGE THE OFFICE HOLDS, with no filter, so it still catches a row
    // written anywhere. What this case reads is the row its own comment added, found by comparing
    // with the ids that were there before it was written.
    const messagesBefore = new Set(
      (t.client.sqlite.prepare('SELECT id FROM agent_messages').all() as { id: string }[]).map((one) => one.id),
    )
    const quote = 'What moved was the mast'
    const said = await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      span: {
        quote,
        from: PROSE.indexOf(quote),
        to: PROSE.indexOf(quote) + quote.length,
        field: 'data.blocks[#b-1].text',
      },
      revision,
    })
    expect(said.status, said.error).toBe(201)

    // Somebody rewrites the paragraph the comment was about.
    const rewritten = await app.inject({
      method: 'PATCH',
      url: `/api/records/${report}`,
      headers: HUMAN,
      payload: {
        dataPatch: {
          blocks: [
            { id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount holds calibration. Nothing moved.' },
          ],
        },
      },
    })
    expect(rewritten.statusCode, rewritten.body).toBe(200)

    const [reading] = await readings(thread)
    expect(reading?.state, reading?.says).toBe('changed')
    expect(reading?.writtenAgainst?.seq).toBe(revision.seq)
    expect(reading?.writtenAgainst?.inTheLedger).toBe(true)
    expect(reading?.writtenAgainst?.field).toBe('data.blocks[#b-1].text')
    // WHAT THAT REVISION HELD THERE — the whole point.
    expect(reading?.writtenAgainst?.heldThere).toBe(PROSE)
    expect(reading?.says).toContain('What that revision held')
    expect(reading?.says).toContain(PROSE)
    // And nothing was repaired: the comment still holds the words and the offsets it was written with.
    const stored = (
      t.client.sqlite.prepare('SELECT id, context FROM agent_messages').all() as { id: string; context: string }[]
    ).filter((one) => !messagesBefore.has(one.id))
    expect(stored, 'the comment this case wrote is not the one the reading found').toHaveLength(1)
    const held = JSON.parse(stored[0]!.context) as Context
    // THROUGH THE ONE ACCESSOR. A span is written down in one of two fields — see `spanNamedBy` in
    // src/shared/targets.ts — and what is asserted here is that neither the words nor the offset was
    // repaired, which is true of either field.
    expect(spanNamedBy(held)?.quote).toBe(quote)
    expect(spanNamedBy(held)?.from).toBe(PROSE.indexOf(quote))
    expect(held.revision?.seq).toBe(revision.seq)
  })

  it('says nothing about an older revision when the comment named none', async () => {
    // Leaving it out is a real answer: nobody recorded which version was on screen. It must not be
    // filled in from "the newest revision as of now", which would claim the author read that one.
    const report = await aReport()
    const thread = await startReview()
    await say(thread, { target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' } })
    const [reading] = await readings(thread)
    expect(reading?.writtenAgainst).toBeUndefined()
  })
})
