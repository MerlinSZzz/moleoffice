// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
/**
 * THE BY-PART DOOR IS ASKED OF THE RECORD AS IT WILL STAND, AND IT KNOWS A CUT FROM A SUMMARY.
 *
 * ---------------------------------------------------------------------------------------
 * TWO HOLES THE FIFTH VERIFICATION MEASURED, BOTH IN THE SAME DOOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion A15 says a stored set of parts covers every block of the report exactly once, and that
 * a part's writing is a summary rather than a cut. Both were escapable on 3 September 2026.
 *
 *   THE WRITE THAT TAKES THE BODY AWAY. The coverage rules ran only when the write carried the
 *   body, so `PATCH {"data": <its own data with the blocks key removed>}` answered 200 and left a
 *   report with no blocks whose parts still covered the ids it used to hold. Problem `IQgOSySmbyOh`.
 *
 *   THE CUT NOBODY LOOKED FOR. The cut check compared a part's text with the opening of the WHOLE
 *   report, so a heading set to the first nine words of a block's own body text went through with a
 *   200. The verifier stored one on a live report to prove it.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD SECTION IS THE ONE THAT KEEPS THIS HONEST
 * ---------------------------------------------------------------------------------------
 *
 * A rule that refuses cuts is worthless if it also refuses summaries. A 30-word summary of a
 * one-sentence finding honestly begins the way the finding begins, and section 3 asserts that such
 * a text is stored. Measured against the corpus while this was written: of the 726 part texts
 * stored across the 27 reports of this project, the rule refuses none.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   make `bodyAfterThisWrite` return `bodyBeingWritten(kind, data)` → section 1 goes red.
 *   delete the block-opening arm of `checkPartsAgainstBody` → section 2's first test goes red.
 *   delete the whole-sentence arm → section 2's second test goes red.
 *   drop the `words < WORDS_THAT_MAKE_A_COPY` guard and compare shared openings instead → section 3
 *     goes red: an honest summary is refused.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { StoredPart } from '../src/shared/zoom.ts'

type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

/**
 * A REPORT OF FOUR BLOCKS, BUILT FOR THE THREE THINGS THIS FILE ASKS.
 *
 * `b-2` is long enough that its first nine words fit a heading's ten-word budget, and it holds a
 * SECOND sentence, so a text can be a whole sentence of the report taken from the middle rather
 * than from the opening. `b-4` is one short sentence, so an honest 30-word summary of it begins the
 * way it begins — which is section 3.
 */
const BODY = [
  { id: 'b-1', type: 'heading', text: 'What broke' },
  {
    id: 'b-2',
    type: 'text',
    text:
      'Three of four printed wrist mounts cracked at about fifteen newtons, at the thin section behind the bolt ' +
      'circle. The jig was reset between pulls and the load cell was zeroed each time.',
  },
  { id: 'b-3', type: 'heading', text: 'What is still open' },
  { id: 'b-4', type: 'finding', text: 'Nobody has pulled the aluminium mount, because the blanks are not bought.' },
  // A FIFTH BLOCK, SO THE REPORT IS LONGER THAN ONE PART OF LEVEL 5. The first four came to 51
  // words, and `rungsFor` stops a record's ladder at the first length the whole record fits in —
  // 60 words is the conclusion's budget, so a 51-word report has no level 4, 5 or 6 at all and a
  // set of parts stored on it would be drawn nowhere. The write door refuses that now (section 4),
  // so a fixture the rest of this file writes parts to has to be a report with room for them.
  {
    id: 'b-5',
    type: 'text',
    text:
      'The next run pulls four aluminium mounts and one printed one for comparison, on the same jig and the ' +
      'same load cell, and the numbers go on the pipeline rather than in this report. Nothing here changes ' +
      'the order of the handover work, which is held by the gripper calibration and not by the mount.',
  },
]

/** The first nine words of `b-2`'s own body text. Nine words, so a heading may hold them. */
const THE_OPENING_OF_A_BLOCK = 'Three of four printed wrist mounts cracked at about'

/** The second sentence of `b-2`, whole. Fourteen words, and nowhere near the report's opening. */
const A_WHOLE_SENTENCE = 'The jig was reset between pulls and the load cell was zeroed each time.'

/** Two parts that cover all four blocks and paraphrase them. */
const GOOD: StoredPart[] = [
  {
    id: 'p-broke',
    heading: 'The printed mount fails below the trial load',
    text30: 'Three of four printed mounts failed between fourteen and sixteen newtons, under the twenty the handover trials need.',
    text120:
      'Four printed wrist mounts were pulled on the bench jig and three broke at the thin section behind the bolt ' +
      'circle, below the twenty newtons the handover trials need, so the printed part is out of those trials.',
    covers: ['b-1', 'b-2'],
  },
  {
    id: 'p-open',
    heading: 'The aluminium mount has not been pulled yet',
    text30: 'An aluminium mount of the same geometry has been ordered, and no other handover work is waiting on it.',
    text120:
      'An aluminium mount of the same geometry has been ordered and is expected next week. Nothing else on the ' +
      'handover work is waiting on it, because the trials that need twenty newtons are the last in the sequence.',
    covers: ['b-3', 'b-4', 'b-5'],
  },
]

const AS_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/builder-k-ladder-fixes',
  'x-mole-office-session': 'sess-door',
}

interface Harness {
  t: TestDb
  app: FastifyInstance
  revisions: RevisionsLib
  report: string
}

let h: Harness

beforeAll(async () => {
  const t = await freshDb()
  // The app's own module instance: `freshDb` resets the module registry, so this import comes after it.
  const revisions = await import('../src/server/lib/revisions.ts')
  const { app } = await apiApp()
  await app.ready()
  h = { t, app, revisions, report: '' }
}, 60_000)

afterAll(async () => {
  await h.app.close()
  h.t.close()
})

beforeEach(() => {
  // Each case files its own report, so the write door is asked of a record no other case has touched.
  h.report = h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'Wrist mount pull test, round eight',
    data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-03' },
    actor: h.t.api.HUMAN,
  }).id
})

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

/** One part of the good set, with something changed. */
function part(id: string, changes: Partial<StoredPart>): StoredPart {
  const base = GOOD.find((one) => one.id === id)
  if (base === undefined) throw new Error(`no fixture part ${id}`)
  return { ...base, ...changes }
}

function refusal(res: LightMyRequestResponse): string {
  return (res.json() as { error?: string }).error ?? res.body
}

/** What the record holds now, whole. */
function stored(): Record<string, unknown> {
  const record = h.t.api.getRecord(h.report)
  return (record?.data ?? {}) as Record<string, unknown>
}

// ============================================================ 1. the write that takes the body away

describe('a write that would leave the record with no blocks is refused while parts still stand', () => {
  it('refuses a wholesale data write with the blocks key removed, naming the ids the parts cover', async () => {
    expect((await writeParts(GOOD)).statusCode, 'the setup write').toBe(200)
    const { blocks: _dropped, ...withoutTheBody } = stored()

    const refused = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      payload: { data: withoutTheBody } as InjectOptions['payload'],
      headers: { ...AS_AGENT },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    for (const id of ['b-1', 'b-2', 'b-3', 'b-4']) {
      expect(refusal(refused), id).toContain(id)
    }
    expect((stored()['blocks'] as unknown[]).length, 'nothing was stored').toBe(BODY.length)
  })

  it('refuses a patch that clears the blocks and leaves the parts, by the same rule', async () => {
    expect((await writeParts(GOOD)).statusCode, 'the setup write').toBe(200)
    const refused = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      payload: { dataPatch: { blocks: null } } as InjectOptions['payload'],
      headers: { ...AS_AGENT },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('no blocks at all')
    expect((stored()['blocks'] as unknown[]).length, 'nothing was stored').toBe(BODY.length)
  })

  it('lets the same write through when the parts go out with the body', async () => {
    // THE RULE IS ABOUT THE PAIR, NOT ABOUT THE BODY. A record may lose its body; what it may not do
    // is keep a summary written by part of a report it no longer holds.
    expect((await writeParts(GOOD)).statusCode, 'the setup write').toBe(200)
    const { blocks: _dropped, shortForms: _also, ...neither } = stored()
    const wrote = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${h.report}`,
      // `replace: true` says the two fields taken out above are meant to go. Dropping them IS the
      // write this test is about, so it says so rather than being exempted from the question.
      payload: { data: neither, replace: true } as InjectOptions['payload'],
      headers: { ...AS_AGENT },
    })
    expect(wrote.statusCode, wrote.body).toBe(200)
  })

  it('leaves a record that never had a body alone', async () => {
    // A note holds no blocks at all, so this door has nothing to say about it and must say nothing. The agent that
    // changes the note wrote it: the words of a note the person wrote are the person's alone (check ekidFZV6r1Yt).
    const note = h.t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A note, which holds no body',
      data: { body: 'Nothing here is a report.' },
      actor: { type: 'agent', id: AS_AGENT['x-mole-office-actor-id'], sessionId: AS_AGENT['x-mole-office-session'] },
    }).id
    const wrote = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${note}`,
      payload: { dataPatch: { body: 'Still nothing here is a report.' } } as InjectOptions['payload'],
      headers: { ...AS_AGENT },
    })
    expect(wrote.statusCode, wrote.body).toBe(200)
  })
})

// ============================================================ 2. the cut nobody looked for

describe("a part's writing may not be the opening of a block, or a sentence of the report", () => {
  it("refuses a heading that is the opening of a block's own body text, naming the block", async () => {
    const refused = await writeParts([part('p-broke', { heading: THE_OPENING_OF_A_BLOCK }), GOOD[1]])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('b-2')
    expect(refusal(refused)).toContain('cutting rather than written')
    // THE REFUSAL SAYS WHAT A COPY IS, in the words the check applies, so a writer is not guessing.
    expect(refusal(refused)).toContain('8 or more words in the same order')
    expect(stored()['shortForms'], 'nothing was stored').toBeUndefined()
  })

  it('refuses a text that is a whole sentence of the report taken from the middle of it', async () => {
    const refused = await writeParts([part('p-broke', { text30: A_WHOLE_SENTENCE }), GOOD[1]])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('a sentence of this report, word for word')
    expect(stored()['shortForms'], 'nothing was stored').toBeUndefined()
  })

  it('still refuses a heading that is the opening of the whole report, which is the older rule', async () => {
    const refused = await writeParts([part('p-broke', { heading: 'What broke' }), GOOD[1]])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('cutting rather than written')
  })
})

// ============================================================ 3. a summary is not a cut

describe('writing that summarises is stored, including when it opens the way its block opens', () => {
  it('stores the paraphrasing set', async () => {
    const wrote = await writeParts(GOOD)
    expect(wrote.statusCode, wrote.body).toBe(200)
  })

  it('stores a summary of a one-sentence finding that begins the way the finding begins', async () => {
    // Nine words in common with `b-4` and then its own. A rule that refused this would refuse the
    // honest summary of every short block in the corpus.
    const wrote = await writeParts([
      GOOD[0],
      part('p-open', {
        text30:
          'Nobody has pulled the aluminium mount, because the blanks have not been bought and nothing else is ' +
          'waiting on it.',
      }),
    ])
    expect(wrote.statusCode, wrote.body).toBe(200)
  })

  it('stores a short heading that shares a few words with a block, because a few words are not a copy', async () => {
    const wrote = await writeParts([GOOD[0], part('p-open', { heading: 'Nobody has pulled it yet' })])
    expect(wrote.statusCode, wrote.body).toBe(200)
  })
})

// ============================== 4. a record with no room for a level written by part

/**
 * NO LEVEL MAY SAY MORE THAN THE RECORD, AND THAT INCLUDES THE ONES WRITTEN BY PART.
 *
 * `rungsFor` in @shared/detail.ts stops a record's ladder at the first length the whole record fits
 * in, so a two-line module has no level above its conclusion and its card draws no part. The write
 * door took the parts anyway. Somebody's writing was stored, drawn nowhere, and the card said
 * nobody had written it — two surfaces disagreeing about one record. Problem `OHqsLjYxAXLB`.
 */
describe('a summary written by part is refused on a record with no room for one', () => {
  /** A module whose whole content is one short block: shorter than one part of level 4. */
  function twoLineModule(): string {
    return h.t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'Cable loom',
      summary: 'One line about the loom.',
      data: {
        state: 'active',
        parts: [],
        summaryBlocks: [{ id: 'b-1', type: 'finding', text: 'The loom is tied back along the upper arm.' }],
      },
      actor: h.t.api.HUMAN,
    }).id
  }

  function writePartsOn(recordId: string, parts: unknown): Promise<LightMyRequestResponse> {
    const entry = h.revisions.listRevisions(recordId).revisions[0]
    if (entry === undefined) throw new Error('the record has no revisions')
    return h.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/short-forms`,
      payload: { madeFrom: { seq: entry.seq, contentHash: entry.contentHash }, forms: { parts } },
      headers: { ...AS_AGENT },
    })
  }

  it('refuses parts on a record shorter than one part, and names the record’s own length', async () => {
    const loom = twoLineModule()
    const res = await writePartsOn(loom, [{ ...GOOD[0], covers: ['b-1'] }])
    expect(res.statusCode, 'a record with no room for level 4 took a summary written by part').toBe(400)
    const said = refusal(res)
    expect(said, 'the refusal does not say the record has no level to draw them at').toContain(
      'no reading level above the conclusion',
    )
    expect(said, 'the refusal does not name the record’s own length').toContain('9 words')
    expect((h.t.api.getRecord(loom)?.data as Record<string, unknown>)['shortForms'], 'something was stored').toBeUndefined()
  })

  it('takes the same parts on a record long enough to have the level', async () => {
    // THE CONTROL FOR THE RULE ABOVE. A rule that refused everything would pass the first test.
    expect((await writeParts(GOOD)).statusCode, 'the report the ladder does reach level 4 on').toBe(200)
  })
})

// ============ 5. the coverage check reads the field the kind declares, not `blocks` by name

/**
 * A MODULE'S PARTS COVER ITS `summaryBlocks`; A REPORT'S COVER ITS `blocks`.
 *
 * Since 6a579e6 every kind that declares a `SummaryBlock[]` field carries the by-part shape —
 * `shortFormsField(kind, holdsBlocks)` in src/shared/kinds.ts reads that off the declaration — so a
 * module has levels 4, 5 and 6 exactly as a report does. What a part covers is therefore the field
 * the KIND keeps its blocks in, and `blocksFieldOf` is the one function that names it.
 *
 * WHAT THE SECOND VERIFICATION READ AS "ONLY A REPORT MAY HOLD THEM". Its measurement was a part
 * covering nothing, written onto a module that has no `summaryBlocks` at all, and the refusal it
 * got — about a part covering no block — said "the report" in a sentence about a module. This
 * section is the door asked the question directly, both ways round.
 */
describe('a part covers the blocks of the field its own kind declares', () => {
  function moduleWithBlocks(): string {
    return h.t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'Wrist mount pull rig',
      summary: 'The bench jig, the load cell and what has been pulled on them so far this month.',
      data: { state: 'active', parts: [], summaryBlocks: BODY },
      actor: h.t.api.HUMAN,
    }).id
  }

  function writePartsOn(recordId: string, parts: unknown): Promise<LightMyRequestResponse> {
    const entry = h.revisions.listRevisions(recordId).revisions[0]
    if (entry === undefined) throw new Error('the record has no revisions')
    return h.app.inject({
      method: 'POST',
      url: `/api/records/${recordId}/short-forms`,
      payload: { madeFrom: { seq: entry.seq, contentHash: entry.contentHash }, forms: { parts } },
      headers: { ...AS_AGENT },
    })
  }

  it('stores a module’s parts when they cover its summaryBlocks', async () => {
    const module = moduleWithBlocks()
    const res = await writePartsOn(module, GOOD)
    expect(res.statusCode, res.body).toBe(200)
    const stored = (h.t.api.getRecord(module)?.data ?? {}) as Record<string, unknown>
    const forms = stored['shortForms'] as Record<string, unknown>
    expect((forms['parts'] as { parts: unknown[] }).parts.length, 'the module’s parts were not stored').toBe(2)
  })

  it('refuses a module’s parts that leave one of its summaryBlocks uncovered, naming that field', async () => {
    const module = moduleWithBlocks()
    const res = await writePartsOn(module, [{ ...GOOD[0], covers: ['b-1', 'b-2'] }])
    expect(res.statusCode, 'a module’s uncovered block went through').toBe(400)
    const said = refusal(res)
    expect(said, 'the refusal does not name the blocks left out').toContain('"b-3"')
    expect(said, 'the refusal calls a module a report').not.toContain('the report')
  })

  it('names the module’s own field when a part covers an id the module has not got', async () => {
    const module = moduleWithBlocks()
    const res = await writePartsOn(module, [
      { ...GOOD[0], covers: ['b-1', 'b-2', 'b-9'] },
      { ...GOOD[1], covers: ['b-3', 'b-4', 'b-5'] },
    ])
    expect(res.statusCode, 'an unknown block id went through').toBe(400)
    const said = refusal(res)
    expect(said, 'the refusal does not point at the field this kind keeps its blocks in').toContain(
      'data.summaryBlocks',
    )
    expect(said, 'the refusal points a module’s writer at a report’s field').not.toContain('data.blocks')
  })

  it('still names a report’s own field on a report', async () => {
    // THE CONTROL. A change that renamed the field for every kind would pass the test above.
    const res = await writeParts([
      { ...GOOD[0], covers: ['b-1', 'b-2', 'b-9'] },
      { ...GOOD[1], covers: ['b-3', 'b-4', 'b-5'] },
    ])
    expect(res.statusCode).toBe(400)
    expect(refusal(res)).toContain('data.blocks')
  })
})
