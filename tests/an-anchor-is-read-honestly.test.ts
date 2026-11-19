// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A COMMENT POINTS AT, READ BACK WITHOUT A GUESS IN IT.
 *
 * ---------------------------------------------------------------------------------------
 * TWO WAYS THE READING LIED, BOTH MEASURED 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE SAME WORDS TWICE. The reading found the quote with `indexOf`, which is the FIRST place the
 *    words appear, and never used the offset the comment stored. Two consequences, and they are
 *    opposite lies:
 *
 *      · a comment written on the SECOND of two identical phrases came back from its own POST as
 *        `changed` — a false alarm on text nobody had touched, drawn in the alarm colour a second
 *        after it was written;
 *      · and when the annotated copy was DELETED and the other copy survived, the reading said the
 *        words were still there and that the comment still pointed at them. The words somebody
 *        wrote about were gone and Mole Office asserted they were not.
 *
 *    The stored offset is EVIDENCE. It is not repaired and it is not followed; it is what tells two
 *    identical phrases apart. src/shared/targets.ts says the quote exists so Mole Office can say the text
 *    changed instead of pretending an offset holds — and the same is true in the other direction.
 *
 * 2. A ROW IS A POSITION. A comment on a table row or cell with no quote answered "Still there" for
 *    ever, because the row number resolves whatever the row now holds. Insert a row above and row 2
 *    is a different row. src/shared/targets.ts promises the opposite in so many words on the
 *    `rowKey` identifier: "a row inserted above this one moves it, and Mole Office reports that the row
 *    now holds something else rather than pretending the comment followed it."
 *
 *    NOTHING WAS RECORDED TO COMPARE WITH. A text anchor carries its quote for exactly this reason;
 *    a row anchor with no quote carries nothing, so the honest answer is that Mole Office cannot say —
 *    which is a real answer and one this reading already has a word for.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. Each case files its own report, conversation and comment, and every
 * reading it takes names its own thread, so no case reads another's work.
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

/** One paragraph that says the same fourteen characters twice. */
const TWICE = 'the mast moved during the handover, and then the mast moved again after the second run.'
const QUOTE = 'the mast moved'
const FIRST_COPY = TWICE.indexOf(QUOTE)
const SECOND_COPY = TWICE.lastIndexOf(QUOTE)

interface Reading {
  state: string
  about: string
  says: string
  quote?: { words: string; stillThere: boolean; at: number | null; field: string | null }
}

async function aReport(blocks: unknown[]): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'Same words twice, nothing edited',
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-14', blocks },
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
    payload: { title: 'Read it again', mode: 'review' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { thread: { id: string } }).thread.id
}

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

async function readAgain(thread: string): Promise<Reading> {
  const res = await app.inject({ method: 'GET', url: `/api/agent/threads/${thread}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  const readings = (res.json() as { messages: { reading: Reading }[] }).messages.map((m) => m.reading)
  const first = readings[0]
  expect(first, 'the conversation came back with no comment in it').toBeDefined()
  return first as Reading
}

async function rewriteBlock(report: string, text: string): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/records/${report}`,
    headers: HUMAN,
    payload: { dataPatch: { blocks: [{ id: 'b-1', type: 'text', heading: 'What I found', text }] } },
  })
  expect(res.statusCode, res.body).toBe(200)
}

// ============================================================ the same words twice

describe('the offset the comment stored is what tells two identical phrases apart', () => {
  const onTheSecondCopy = async (): Promise<{ thread: string; report: string }> => {
    const report = await aReport([{ id: 'b-1', type: 'text', heading: 'What I found', text: TWICE }])
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      span: { quote: QUOTE, from: SECOND_COPY, to: SECOND_COPY + QUOTE.length, field: 'data.blocks[#b-1].text' },
    })
    expect(said.status, said.error).toBe(201)
    return { thread, report }
  }

  it('raises no alarm on a comment written on the second copy, with nothing edited', async () => {
    // THE FALSE ALARM. It used to come back `changed` from its own POST, saying the words were
    // "now at character 0, not 45" — about a report twelve seconds old that nobody had written to.
    expect(SECOND_COPY, 'the fixture no longer says the same words twice').toBeGreaterThan(FIRST_COPY)
    const report = await aReport([{ id: 'b-1', type: 'text', heading: 'What I found', text: TWICE }])
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      span: { quote: QUOTE, from: SECOND_COPY, to: SECOND_COPY + QUOTE.length, field: 'data.blocks[#b-1].text' },
    })
    expect(said.reading.state, said.reading.says).toBe('there')
    expect(said.reading.says).toContain('same place')
    expect(said.reading.quote?.at).toBe(SECOND_COPY)
  })

  it('does not claim the comment still points at the words when its own copy was deleted', async () => {
    // THE OPPOSITE LIE. The annotated copy goes and the other one stays. Mole Office cannot tell whether
    // the text moved or whether that is a different place reading the same, so it says so and moves
    // nothing.
    const { thread, report } = await onTheSecondCopy()
    await rewriteBlock(report, 'the mast moved during the handover.')

    const reading = await readAgain(thread)
    expect(reading.state, reading.says).toBe('changed')
    expect(reading.says, 'it still asserts the comment points at the surviving copy').not.toContain(
      'still points at them',
    )
    expect(reading.says).toContain('cannot tell')
    // The words it was written on are named, because that is what survives.
    expect(reading.quote?.words).toBe(QUOTE)
  })

  it('says how many places hold the words when it cannot choose between them', async () => {
    const { thread, report } = await onTheSecondCopy()
    // The annotated copy moves along by one character, so neither copy is where the comment said.
    await rewriteBlock(report, ` ${TWICE}`)

    const reading = await readAgain(thread)
    expect(reading.state, reading.says).toBe('changed')
    expect(reading.says).toContain('2 places')
    expect(reading.quote?.at, 'it picked one of the two and called it the answer').toBeNull()
  })

  it('still says where the words are when there is only one place they could be', async () => {
    // ONE COPY IS THE ORDINARY CASE and the sentence for it is unchanged: the words moved, Mole Office
    // says where to, and the stored offset is left exactly as it was written.
    const report = await aReport([
      { id: 'b-1', type: 'text', heading: 'What I found', text: 'the mast moved during the handover.' },
    ])
    const thread = await startReview()
    await say(thread, {
      target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' },
      span: { quote: QUOTE, from: 0, to: QUOTE.length, field: 'data.blocks[#b-1].text' },
    })
    await rewriteBlock(report, 'On Tuesday, the mast moved during the handover.')

    const reading = await readAgain(thread)
    expect(reading.state, reading.says).toBe('changed')
    expect(reading.says).toContain('The text has changed around it')
    expect(reading.quote?.at).toBe('On Tuesday, '.length)
  })
})

// ============================================================ a row is a position

describe('a comment on a row or a cell with no quote does not claim the row is unchanged', () => {
  const aTable = (rows: unknown[]): unknown[] => [
    {
      id: 'b-2',
      type: 'table',
      columns: [{ label: 'run' }, { label: 'note' }],
      rows,
      caption: 'Forty checkerboard frames each.',
    },
  ]

  const twoRows = [{ cells: ['before the knock', 'fine'] }, { cells: ['after the knock', 'bad'] }]

  it('keeps what a cell holds, so a comment on one can be answered later', async () => {
    // THIS TEST USED TO EXPECT `unknown`, AND THE CODE IS NOW BETTER THAN THE TEST WAS.
    //
    // A cell is named by where it sits, so a comment on one used to be unanswerable: anything
    // inserted above moves it, and with nothing quoted Mole Office could not tell whether what sits
    // there now is what somebody pointed at. `unknown` was the honest answer to a question nobody
    // could answer, and it was also a useless thing to tell a person.
    //
    // A cell holds exactly one run of words, so Mole Office now keeps them as the quote when the writer
    // sent none. That makes `there` and `changed` both answerable. It never replaces a span
    // somebody sent, it never runs on a thing that carries an id of its own, and it keeps nothing
    // for an empty cell — an empty quote would match anywhere and report `there` for a cell
    // somebody has since filled in. A ROW is still `unknown`, and the test below says why: a row
    // holds one run of words per cell, and a span names one stored string.
    const report = await aReport(aTable(twoRows))
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'tableCell', recordId: report, blockId: 'b-2', rowKey: '2', columnKey: '1' },
    })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state, said.reading.says).toBe('there')
    expect(said.reading.quote?.words, 'the cell\'s own words were not kept as evidence').toBeTruthy()
    expect(said.reading.quote?.stillThere).toBe(true)
  })

  it('says the same about a whole row, since a row key is a position too', async () => {
    const report = await aReport(aTable(twoRows))
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'tableRow', recordId: report, blockId: 'b-2', rowKey: '2' },
    })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state, said.reading.says).toBe('unknown')
  })

  it('answers plainly for a block, whose id is a name and not a position', async () => {
    // THE CONTROL. A block carries its own id, so "still there" is a true sentence about one, and
    // this reading must not become a shrug about everything.
    const report = await aReport([{ id: 'b-1', type: 'text', heading: 'What I found', text: TWICE }])
    const thread = await startReview()
    const said = await say(thread, { target: { kind: 'reportBlock', recordId: report, blockId: 'b-1' } })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state, said.reading.says).toBe('there')
    expect(said.reading.says).toContain('Still there')
  })

  it('answers for a row that quoted its words, because then there is something to compare', async () => {
    const report = await aReport(aTable(twoRows))
    const thread = await startReview()
    const said = await say(thread, {
      target: { kind: 'tableRow', recordId: report, blockId: 'b-2', rowKey: '2' },
      span: {
        quote: 'after the knock',
        from: 0,
        to: 'after the knock'.length,
        field: 'data.blocks[#b-2].rows[1].cells[0]',
      },
    })
    expect(said.status, said.error).toBe(201)
    expect(said.reading.state, said.reading.says).toBe('there')
  })
})
