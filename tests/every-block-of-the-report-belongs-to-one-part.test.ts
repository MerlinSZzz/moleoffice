// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUMMARY WRITTEN BY PART MAY NOT LEAVE A PART OF THE REPORT OUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Reading levels 4, 5 and 6 are written by part: for each part of the report a heading of at most
 * ten words, a text of at most thirty, a text of at most a hundred and twenty, and the ids of the
 * blocks that part covers. The whole design rests on one rule, and this file is that rule:
 *
 *   EVERY BLOCK OF THE REPORT IS COVERED BY EXACTLY ONE PART.
 *
 * A box of lines copied out of a report, under the words *Selected from the report, not
 * summarised*, still misled the reader, who could not tell which parts were missing. A label
 * admitting a selection is a selection does not cure that. What cures it is making the state
 * unwritable: a summary that covers every block cannot leave one out, so there is nothing for a
 * reader to be misled about.
 *
 * ---------------------------------------------------------------------------------------
 * A RULE ON ONE WRITE PATH IS NOT A RULE
 * ---------------------------------------------------------------------------------------
 *
 * `data.shortForms` has two doors: `POST /api/records/<id>/short-forms` and a plain
 * `PATCH /api/records/<id>`. Both go through `patchRecord`, and the checks are in there rather than
 * in the route, so both get them. Section 6 sends the same broken structures through the PATCH and
 * expects the same refusals. That pairing has caught a real defect on this field before —
 * 19 August 2026, when a plain PATCH could store a revision the record did not have.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   delete the uncovered-blocks arm of `checkPartsAgainstBody` → section 3 goes red.
 *   delete the covered-twice arm → section 4 goes red.
 *   delete the unknown-id arm → section 2 goes red.
 *   delete the empty-`covers` arm of `partsProblems` → section 5 goes red.
 *   widen a budget in `PART_TEXT_SPECS` → section 5's budget tests go red.
 *   delete the `isCutOf` loop in `checkPartsAgainstBody` → section 7 goes red.
 *   delete the retired-keys loop in `settleShortForms` → section 8's PATCH test goes red.
 *   drop the three `z.never` keys from the write route's `forms` → section 8's POST test goes red.
 *   stop passing `checkPartsAgainstBody` the body in `checkModuleSummary` → sections 2, 3, 4 and 7
 *     all go red at once.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { apiApp, exampleBlock, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { PART_TEXT_SPECS, SHORT_FORM_SPECS, type StoredPart } from '../src/shared/zoom.ts'
import { SEVEN_RUNGS_NAMED } from '../src/shared/detail.ts'

type ZoomLib = typeof import('../src/server/lib/zoom.ts')
type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

/**
 * A REPORT WITH FIVE BLOCKS, TWO OF WHICH ARE MEDIA.
 *
 * The media are here because the rule says *pictures and charts included*: a chart that belonged to
 * no part would be a chart the reader never learns about at levels 4 to 6, which is the same harm as
 * a missing paragraph and is the one somebody would be tempted to exempt.
 */
const BODY = [
  { id: 'b-1', type: 'heading', text: 'What broke' },
  // THIS BLOCK IS LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole
  // record fits in, and the conclusion's own budget is 60 words — so a report shorter than that has
  // no level 4, 5 or 6 and the write door refuses a summary written by part on it. A fixture this
  // file writes parts to has to be a report with room for them.
  {
    id: 'b-2',
    type: 'text',
    text:
      'Three of four printed wrist mounts cracked at about fifteen newtons, at the thin section behind the bolt circle.' +
      ' The jig was reset between pulls and the load cell was zeroed each time, so the three numbers are comparable with one another. The fourth mount held to twenty-two newtons and had been printed at half the layer height, which was a mistake in the print queue rather than a decision anybody made, and nobody has repeated it since.',
  },
  // THE TWO MEDIA BLOCKS ARE BUILT FROM THE DECLARATION'S OWN EXAMPLES, so this fixture cannot
  // drift from what the product accepts. A hand-written picture block here was refused for eight
  // fields at once, which is the schema being right and the fixture being a copy.
  { ...exampleBlock('image'), id: 'b-3', type: 'image' },
  { id: 'b-4', type: 'heading', text: 'What is still open' },
  { ...exampleBlock('chart'), id: 'b-5', type: 'chart' },
]

/** Two parts that cover all five blocks between them, and break nothing. */
const GOOD: StoredPart[] = [
  {
    id: 'p-1',
    heading: 'Printed mounts broke below the load the trials need',
    text30: 'Three of four printed mounts failed between fourteen and sixteen newtons, under the twenty the handover trials need.',
    text120:
      'Four printed wrist mounts were pulled on the bench jig and three broke at the thin section behind the bolt ' +
      'circle, at 14.2, 15.1 and 15.4 newtons. The handover trials need twenty, so the printed part is out of them.',
    covers: ['b-1', 'b-2', 'b-3'],
  },
  {
    id: 'p-2',
    heading: 'An aluminium mount is on order and nothing waits',
    text30: 'An aluminium mount of the same geometry has been ordered. No other handover work is waiting on it.',
    text120:
      'An aluminium mount of the same geometry has been ordered and is expected next week. Nothing else on the ' +
      'handover work is waiting on it, because the trials that need twenty newtons are the last in the sequence.',
    covers: ['b-4', 'b-5'],
  },
]

/** What an agent's requests carry. */
const AS_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/builder-i-ladder',
  'x-mole-office-session': 'sess-parts',
}

interface Harness {
  t: TestDb
  app: FastifyInstance
  zoom: ZoomLib
  revisions: RevisionsLib
  report: string
}

/** What the whole file shares: the database, the server and the two libraries it reads. */
let shared: Omit<Harness, 'report'>

let h: Harness

/**
 * THE OFFICE IS MADE ONCE FOR THE FILE. What each case needs of its own is the report it writes the
 * parts to, because a part is stored on the report and one case's parts must not be read by another.
 * The modules are imported after `freshDb`, so they are the ones the server reads.
 */
beforeAll(async () => {
  const t = await freshDb()
  const zoom = await import('../src/server/lib/zoom.ts')
  const revisions = await import('../src/server/lib/revisions.ts')
  const { app } = await apiApp()
  await app.ready()
  shared = { t, app, zoom, revisions }
}, 60_000)

afterAll(async () => {
  await shared.app.close()
  shared.t.close()
})

beforeEach(() => {
  const report = shared.t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'Wrist mount pull test, round eight',
    data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-03' },
    actor: shared.t.api.HUMAN,
  }).id
  h = { ...shared, report }
})

/** The newest entry of the report's ledger: the pair a writer has to send. */
function newest(): { seq: number; contentHash: string } {
  const entry = h.revisions.listRevisions(h.report).revisions[0]
  if (entry === undefined) throw new Error('the seeded report has no revisions')
  return { seq: entry.seq, contentHash: entry.contentHash }
}

/** Write a set of parts through the front door. */
function writeParts(parts: unknown): Promise<LightMyRequestResponse> {
  return h.app.inject({
    method: 'POST',
    url: `/api/records/${h.report}/short-forms`,
    payload: { madeFrom: newest(), forms: { parts } },
    headers: { ...AS_AGENT },
  })
}

/** The same write as an ordinary record edit, which is the second door onto the same field. */
function patchParts(parts: unknown): Promise<LightMyRequestResponse> {
  return h.app.inject({
    method: 'PATCH',
    url: `/api/records/${h.report}`,
    payload: {
      dataPatch: { shortForms: { parts: { madeFrom: newest(), writtenBy: 'agent', parts } } },
    } as InjectOptions['payload'],
    headers: { ...AS_AGENT },
  })
}

/**
 * THE REFUSAL'S OWN SENTENCE, read out of the reply rather than off the raw body.
 *
 * A raw body is JSON, so every quotation mark in it is escaped and a test looking for a quoted
 * block id would be looking for characters the sentence does not contain. Reading the field is how
 * a caller reads it.
 */
function refusal(res: LightMyRequestResponse): string {
  return (res.json() as { error?: string }).error ?? res.body
}

/** One part of the good set, with something changed. */
function part(id: string, changes: Partial<StoredPart>): StoredPart {
  const base = GOOD.find((one) => one.id === id)
  if (base === undefined) throw new Error(`no fixture part ${id}`)
  return { ...base, ...changes }
}

// ============================================================ 1. a whole set is accepted

describe('a set of parts that covers the report exactly is stored', () => {
  it('is accepted, and comes back as two parts at each of the three lengths written by part', async () => {
    const wrote = await writeParts(GOOD)
    expect(wrote.statusCode, wrote.body).toBe(200)
    const back = wrote.json() as {
      levels: { rung: string; state: string; parts: { written: boolean; count: number | null } | null }[]
    }
    const byPart = back.levels.filter((one) => one.parts !== null)
    expect(byPart.map((one) => one.rung)).toEqual(['outline', 'sketch', 'digest'])
    for (const one of byPart) {
      expect(one.parts?.written, one.rung).toBe(true)
      expect(one.parts?.count, one.rung).toBe(2)
      expect(one.state, one.rung).toBe('current')
    }
  })

  it('stores the parts under shortForms.parts, in the order they were sent', async () => {
    await writeParts(GOOD)
    const record = h.t.api.getRecord(h.report)
    const held = (record?.data as { shortForms?: { parts?: { parts?: StoredPart[] } } }).shortForms?.parts
    expect(held?.parts?.map((one) => one.id)).toEqual(['p-1', 'p-2'])
    expect(held?.parts?.[0]?.covers).toEqual(['b-1', 'b-2', 'b-3'])
  })

  it('reports the seven positions of the ladder, and Full as the record itself', async () => {
    const back = (await writeParts(GOOD)).json() as { levels: { rung: string; state: string }[] }
    expect(back.levels.map((one) => one.rung)).toEqual([
      'label',
      'title',
      'gist',
      'outline',
      'sketch',
      'digest',
      'full',
    ])
    expect(back.levels.at(-1)?.state).toBe('is_the_record')
  })
})

// ============================================================ 2. a block the report does not hold

describe('a part may not cover a block this report has no such block for', () => {
  it('refuses it and names the id that is not there', async () => {
    const refused = await writeParts([part('p-1', { covers: ['b-1', 'b-2', 'b-3', 'b-99'] }), part('p-2', {})])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('"b-99"')
    expect(refusal(refused)).toContain('no such block')
  })

  it('names the blocks the report does hold, so the writer can fix it without a second request', async () => {
    const refused = await writeParts([part('p-1', { covers: ['b-1', 'b-2', 'b-3', 'nowhere'] }), part('p-2', {})])
    for (const id of ['b-1', 'b-2', 'b-3', 'b-4', 'b-5']) expect(refusal(refused), id).toContain(`"${id}"`)
  })
})

// ============================================================ 3. a block covered by nothing

describe('a set of parts may not leave a block of the report uncovered', () => {
  it('refuses it and names the uncovered id', async () => {
    const refused = await writeParts([part('p-1', {}), part('p-2', { covers: ['b-4'] })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('"b-5"')
    expect(refusal(refused)).toContain('covered by no part')
  })

  it('names every uncovered id and not only the first', async () => {
    const refused = await writeParts([part('p-1', { covers: ['b-1'] })])
    expect(refused.statusCode, refused.body).toBe(400)
    for (const id of ['b-2', 'b-3', 'b-4', 'b-5']) expect(refusal(refused), id).toContain(`"${id}"`)
  })

  it('refuses an uncovered picture and an uncovered chart like any other block', async () => {
    // MEDIA IS THE ARM SOMEBODY WOULD EXEMPT. A picture never counts as words, and a reader is
    // still entitled to know it is there. Both media blocks are dropped here and nothing else is.
    const refused = await writeParts([
      part('p-1', { covers: ['b-1', 'b-2'] }),
      part('p-2', { covers: ['b-4'] }),
    ])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('"b-3"')
    expect(refusal(refused)).toContain('"b-5"')
  })

  it('stores nothing when it refuses', async () => {
    await writeParts([part('p-1', { covers: ['b-1'] })])
    const record = h.t.api.getRecord(h.report)
    expect((record?.data as { shortForms?: unknown }).shortForms).toBeUndefined()
  })
})

// ============================================================ 4. a block covered twice

describe('two parts may not cover the same block', () => {
  it('refuses it and names the doubled id and both parts', async () => {
    const refused = await writeParts([part('p-1', {}), part('p-2', { covers: ['b-3', 'b-4', 'b-5'] })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('"b-3"')
    expect(refusal(refused)).toContain('p-1')
    expect(refusal(refused)).toContain('p-2')
    expect(refusal(refused)).toContain('more than one part')
  })
})

// ============================================================ 5. what one part has to be

describe('one part on its own', () => {
  it('may not cover nothing at all', async () => {
    const refused = await writeParts([part('p-1', { covers: [] }), part('p-2', {})])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('covers no block')
  })

  it('is held to the three budgets the owner set, by their numbers', () => {
    // THE NUMBERS AND NOT ONLY THE RULE. Every over-budget test below builds its text from
    // `PART_TEXT_SPECS`, which proves the door reads the declaration — and moves with it, so a
    // widened budget would leave all three of them green. The rule is
    // specific: level 4 at most what level 2 allows, level 5 at most what level 3 allows, level 6
    // at most 120. These are those numbers, and changing one has to change this line.
    expect(PART_TEXT_SPECS.heading.maxWords).toBe(10)
    expect(PART_TEXT_SPECS.text30.maxWords).toBe(30)
    expect(PART_TEXT_SPECS.text120.maxWords).toBe(120)
    // AND READING LENGTH 3, WHICH THE PART BUDGETS ARE SET AGAINST. It was 30 words, widened to 40
    // first, and then to 60 when the level became the record's own `summary` column, with a target
    // of 20 to 60 words. Criterion A14b. Level 5's budget is the part budget above and did not
    // follow it: level 5 is at most what level 3 allows, and 30 is still at most 60.
    expect(SHORT_FORM_SPECS.gist.maxWords, 'reading length 3 is 20 to 60 words').toBe(60)
    expect(SHORT_FORM_SPECS.gist.minWords).toBe(20)
    expect(
      PART_TEXT_SPECS.text30.maxWords <= SHORT_FORM_SPECS.gist.maxWords,
      'a part at level 5 is allowed more words than the whole conclusion at level 3',
    ).toBe(true)
  })

  it('refuses a heading over its budget, and says what the budget is', async () => {
    const long = Array.from({ length: PART_TEXT_SPECS.heading.maxWords + 1 }, (_, n) => `word${String(n)}`).join(' ')
    const refused = await writeParts([part('p-1', { heading: long }), part('p-2', {})])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain(String(PART_TEXT_SPECS.heading.maxWords))
  })

  it('refuses a 30-word text over its budget', async () => {
    const long = Array.from({ length: PART_TEXT_SPECS.text30.maxWords + 1 }, (_, n) => `word${String(n)}`).join(' ')
    const refused = await writeParts([part('p-1', { text30: long }), part('p-2', {})])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain(String(PART_TEXT_SPECS.text30.maxWords))
  })

  it('refuses a 120-word text over its budget', async () => {
    const long = Array.from({ length: PART_TEXT_SPECS.text120.maxWords + 1 }, (_, n) => `word${String(n)}`).join(' ')
    const refused = await writeParts([part('p-1', { text120: long }), part('p-2', {})])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain(String(PART_TEXT_SPECS.text120.maxWords))
  })

  it('refuses two parts that carry one id', async () => {
    const refused = await writeParts([part('p-1', {}), part('p-2', { id: 'p-1' })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('p-1')
  })

  it('refuses an empty list of parts, rather than storing a report with no parts in it', async () => {
    const refused = await writeParts([])
    expect(refused.statusCode, refused.body).toBe(400)
  })
})

// ============================================================ 6. the same rules on the other door

describe('a plain PATCH of the record gets every one of those checks', () => {
  it('refuses an uncovered block', async () => {
    const refused = await patchParts([part('p-1', {}), part('p-2', { covers: ['b-4'] })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('"b-5"')
  })

  it('refuses a doubled block', async () => {
    const refused = await patchParts([part('p-1', {}), part('p-2', { covers: ['b-3', 'b-4', 'b-5'] })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('"b-3"')
  })

  it('refuses a heading over its budget', async () => {
    const long = Array.from({ length: PART_TEXT_SPECS.heading.maxWords + 1 }, (_, n) => `word${String(n)}`).join(' ')
    const refused = await patchParts([part('p-1', { heading: long }), part('p-2', {})])
    expect(refused.statusCode, refused.body).toBe(400)
  })

  it('accepts a whole set, and derives who wrote it from the actor headers', async () => {
    const wrote = await patchParts(GOOD)
    expect(wrote.statusCode, wrote.body).toBe(200)
    const record = h.t.api.getRecord(h.report)
    const held = (record?.data as { shortForms?: { parts?: { by?: string; at?: string } } }).shortForms?.parts
    expect(held?.by).toBe('claude-code/builder-i-ladder')
    expect(held?.at).toMatch(/^\d{4}-\d{2}-\d{2} /)
  })
})

// ============================================================ 7. a cut is not a summary

describe('no part of a summary may be the opening of the report itself', () => {
  it('refuses a heading cut from the report’s own prose', async () => {
    const refused = await writeParts([
      part('p-1', { heading: 'What broke Three of four printed' }),
      part('p-2', {}),
    ])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('cutting rather than written')
  })

  it('refuses a 30-word text cut from the report’s own prose', async () => {
    const refused = await writeParts([
      part('p-1', {
        text30: 'What broke Three of four printed wrist mounts cracked at about fifteen newtons, at the thin section',
      }),
      part('p-2', {}),
    ])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('cutting rather than written')
  })
})

// ============================================================ 8. the three retired keys

describe('a new write to a retired length is refused, and what is stored under one is left alone', () => {
  it('refuses card, brief and account on the write route, naming the seven levels', async () => {
    for (const key of ['card', 'brief', 'account']) {
      const refused = await h.app.inject({
        method: 'POST',
        url: `/api/records/${h.report}/short-forms`,
        payload: { madeFrom: newest(), forms: { [key]: SHORT_FORM_SPECS.gist.example } },
        headers: { ...AS_AGENT },
      })
      expect(refused.statusCode, `${key}: ${refused.body}`).toBe(400)
      expect(refusal(refused), key).toContain(key)
    }
  })

  it('refuses one on a plain PATCH too, with a message naming the seven levels', async () => {
    const refused = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      payload: {
        dataPatch: {
          shortForms: {
            card: { text: SHORT_FORM_SPECS.gist.example, madeFrom: newest(), writtenBy: 'agent' },
          },
        },
      } as InjectOptions['payload'],
      headers: { ...AS_AGENT },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    for (const rung of SEVEN_RUNGS_NAMED.replace(/ and /g, ', ').split(', ')) {
      expect(refusal(refused), rung).toContain(rung)
    }
  })

  it('lets a record that already holds one be written to, rather than freezing it', async () => {
    // WHAT IS STORED STAYS. A record holding a retired length was written before the length was
    // retired, and refusing every later edit to it would be this change deleting somebody's report
    // from the product without deleting it from the disk.
    writeDataBypassingTheGate(h.t, h.report, {
      blocks: BODY,
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-09-03',
      shortForms: { card: { text: SHORT_FORM_SPECS.gist.example, madeFrom: newest(), writtenBy: 'agent' } },
    })
    const wrote = await writeParts(GOOD)
    expect(wrote.statusCode, wrote.body).toBe(200)
    const record = h.t.api.getRecord(h.report)
    const held = (record?.data as { shortForms?: Record<string, unknown> }).shortForms
    expect(held?.['card'], 'the retired form is still on disk, untouched').toMatchObject({
      text: SHORT_FORM_SPECS.gist.example,
    })
  })
})
