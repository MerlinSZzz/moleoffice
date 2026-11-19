// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY OF ANY PROSE FIELD OF A BLOCK IS A CUT, NOT ONLY A COPY OF THE BLOCK'S FIRST FIELD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The cut rule compared a part's writing with `proseOfBlocks([block])`, which joins ALL of a
 * block's prose fields in order: a callout gives its title and then its text, a finding its
 * headline and then its detail, a text block its heading and then its paragraph. So it caught a
 * copy only where the copy began at the block's FIRST field.
 *
 * The fifth verification measured it on the live corpus, on report `FPf58Hfk7_z_`, whose first
 * block is a callout titled *The short answer*: a part heading set to the first nine words of that
 * callout's TEXT — `Yes, the old name ships. **17,808 occurrences across 1,563` — was answered 200
 * and stored. That is the exact string the defect was filed with and the exact string the commit
 * that was meant to fix it quotes. A finding's `detail` went through the same way. Problem
 * `PaZ8ijY_4moz`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED NOW
 * ---------------------------------------------------------------------------------------
 *
 * Each prose field of each block, on its own, as well as the block's prose whole and every sentence
 * of the report. The list of which fields hold prose is `proseFieldsOfBlocks` in
 * src/shared/waitingclaims.ts, which is the same walk `proseOfBlocks` is the join of — one list, so
 * a block kind that gains a field cannot gain it in one reading and not the other.
 *
 * The refusal names the block AND the field, because "is the opening of the block" read as covering
 * a block while it covered the block's first field.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIMIT IS NOT WIDENED, AND SECTION 3 IS WHAT HOLDS THAT
 * ---------------------------------------------------------------------------------------
 *
 * A copy is still eight words or more, and still the WHOLE of what was written. An "opens with the
 * same eight words" rule over the whole text was measured and refuses honest summaries, so the
 * three paraphrases the by-part door's own test accepts are asserted here again against the wider
 * comparison. Measured over the corpus with `scripts/corpus-cut-sweep.ts` on 3 September 2026: of
 * 747 stored part texts across 27 reports, the new rule refuses 0.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT PROVES THIS
 * ---------------------------------------------------------------------------------------
 *
 *   delete the field arm of `checkPartsAgainstBody` in src/server/lib/summary.ts — the three tests
 *     of section 1 go red and section 2 and 3 stay green.
 *   make `proseFieldsOfBlocks` give a callout only its title — the callout test of section 1 goes
 *     red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { StoredPart } from '../src/shared/zoom.ts'

type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

/**
 * A REPORT SHAPED LIKE THE ONE THE VERIFIER USED.
 *
 * `b-answer` is a callout, so its prose opens with its TITLE and its text begins three words in —
 * which is what made the old rule miss it. `b-stale` is a finding, whose `detail` is its second
 * field. `b-plain` is a text block with no heading, so its first field IS its text: the old rule
 * caught that one, and it must still be caught.
 */
const BODY = [
  {
    id: 'b-answer',
    type: 'callout',
    tone: 'note',
    title: 'The short answer',
    text:
      'Yes, the old name ships. It appears seventeen thousand times across one and a half thousand tracked ' +
      'files, and the database is not among them.',
  },
  {
    id: 'b-stale',
    type: 'finding',
    state: 'blocked',
    text: 'The headline count in the audit is stale.',
    detail:
      'It says the name appears about seven thousand times, which was true in July and is not true now. The ' +
      'file has not been touched since.',
  },
  {
    id: 'b-plain',
    type: 'text',
    text:
      'The audit was written on the twenty-seventh of August and is linked from the readme, so a newcomer ' +
      'meets it before anything else.',
  },
]

/** The first nine words of the callout's TEXT. Nine words, so a heading may hold them. */
const OPENING_OF_A_CALLOUTS_TEXT = 'Yes, the old name ships. It appears seventeen thousand'

/** Fourteen words of the finding's DETAIL, its second field. */
const OPENING_OF_A_FINDINGS_DETAIL = 'It says the name appears about seven thousand times, which was true in July'

/** Fourteen words of the text block, whose first field this is. The older arm caught this one. */
const OPENING_OF_A_TEXT_BLOCK = 'The audit was written on the twenty-seventh of August and is linked from the'

/** Two parts covering all three blocks, every text a summary rather than a copy. */
const GOOD: StoredPart[] = [
  {
    id: 'p-answer',
    heading: 'The name is in the repository, the data is not',
    text30: 'Seventeen thousand mentions sit in the tracked files, while the database itself never leaves this machine.',
    text120:
      'The count is large and it is all in files that are tracked. What is not tracked is the data: the ' +
      'database, the environment file and the data directory are all ignored, so none of them leaves the machine.',
    covers: ['b-answer'],
  },
  {
    id: 'p-audit',
    heading: 'An audit exists and its headline number has aged',
    text30: 'A readable audit is already linked from the readme, but the number at the top of it belongs to July.',
    text120:
      'An audit of the name was written in August and the readme points at it, so a newcomer meets it early. ' +
      'Its headline number is two months old and nobody has been back to it since, so a reader who trusts ' +
      'the top line gets a figure from July.',
    covers: ['b-stale', 'b-plain'],
  },
]

const AS_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/builder-l-ladder-fixes-2',
  'x-mole-office-session': 'sess-fields',
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
  const revisions = await import('../src/server/lib/revisions.ts')
  const { app } = await apiApp()
  await app.ready()
  h = { t, app, revisions, report: '' }
}, 60_000)

beforeEach(() => {
  h.report = h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'Does the old name leak when this repository is opened up',
    data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-03' },
    actor: h.t.api.HUMAN,
  }).id
})

afterAll(async () => {
  await h.app.close()
  h.t.close()
})

function newest(): { seq: number; contentHash: string } {
  const entry = h.revisions.listRevisions(h.report).revisions[0]
  if (entry === undefined) throw new Error('the seeded report has no revisions')
  return { seq: entry.seq, contentHash: entry.contentHash }
}

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

/** What the record holds now. */
function storedForms(): unknown {
  const record = h.t.api.getRecord(h.report)
  return ((record?.data ?? {}) as Record<string, unknown>)['shortForms']
}

// ================================================== 1. every prose field of a block, not just the first

describe('a part text copied from any prose field of a block is refused, and the refusal names the field', () => {
  it("refuses the verifier's own case: a heading copied from a callout's text, whose first field is its title", async () => {
    const refused = await writeParts([part('p-answer', { heading: OPENING_OF_A_CALLOUTS_TEXT }), GOOD[1]])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused), 'names the block').toContain('b-answer')
    expect(refusal(refused), 'names the field').toContain('the text of the block')
    expect(refusal(refused)).toContain('cutting rather than written')
    expect(storedForms(), 'nothing was stored').toBeUndefined()
  })

  it("refuses a text copied from a callout's text, at the 30-word length", async () => {
    const refused = await writeParts([part('p-answer', { text30: OPENING_OF_A_CALLOUTS_TEXT }), GOOD[1]])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('the text of the block "b-answer"')
    expect(storedForms(), 'nothing was stored').toBeUndefined()
  })

  it("refuses a text copied from a finding's detail, which is its second field", async () => {
    const refused = await writeParts([GOOD[0], part('p-audit', { text30: OPENING_OF_A_FINDINGS_DETAIL })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('the detail of the block "b-stale"')
    expect(storedForms(), 'nothing was stored').toBeUndefined()
  })

  it('still refuses a copy of a block whose first field it is, which is the arm that was already there', async () => {
    const refused = await writeParts([GOOD[0], part('p-audit', { text30: OPENING_OF_A_TEXT_BLOCK })])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('b-plain')
    expect(storedForms(), 'nothing was stored').toBeUndefined()
  })
})

// ================================================== 2. a copy that runs from one field into the next

describe("a copy that spans a block's fields is still refused, by the block's prose whole", () => {
  it("refuses a finding's headline followed by the opening of its detail", async () => {
    // Neither field alone opens with these words, so only the whole-block arm can catch it. It is
    // the case the fifth verification confirmed was already right, and this is what holds it there.
    // The finding is used rather than the callout because the callout is the report's FIRST block,
    // so a copy of its opening is also the opening of the whole report and the older arm answers.
    const refused = await writeParts([
      GOOD[0],
      part('p-audit', { text30: 'The headline count in the audit is stale. It says the name appears about seven' }),
    ])
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refusal(refused)).toContain('the opening of the block "b-stale"')
    expect(storedForms(), 'nothing was stored').toBeUndefined()
  })
})

// ================================================== 3. the limit is not widened

describe('writing that summarises is still stored, so the wider comparison has not frozen the corpus', () => {
  it('stores the paraphrasing set whole', async () => {
    const wrote = await writeParts(GOOD)
    expect(wrote.statusCode, wrote.body).toBe(200)
  })

  it("stores a summary that opens the way a block's second field opens and then says its own thing", async () => {
    // Ten words in common with the finding's `detail` and then eleven of its own. The whole of it is
    // not the field's opening, so it is writing, and a rule that refused it would refuse the honest
    // summary of every short block in the corpus.
    const wrote = await writeParts([
      GOOD[0],
      part('p-audit', {
        text30: 'It says the name appears about seven thousand times, a figure nobody has checked since July ended.',
      }),
    ])
    expect(wrote.statusCode, wrote.body).toBe(200)
  })

  it('stores a heading that shares a few words with a field, because a few words are not a copy', async () => {
    const wrote = await writeParts([part('p-answer', { heading: 'Yes, the old name ships' }), GOOD[1]])
    expect(wrote.statusCode, wrote.body).toBe(200)
  })
})
