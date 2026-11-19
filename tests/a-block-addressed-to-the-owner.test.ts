// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `forOwner`, THE KEY THAT SAYS A BLOCK IS ADDRESSED TO THE OWNER, IN ALL FOUR PLACES IT LIVES.
 *
 * What was chosen: an optional key on any block saying it is
 * addressed to the owner, so a marked block is promoted at every level of semantic zoom including
 * the lowest. `design/problem-02/OWNER-ANSWERS.md` §1 is the answer;
 * `design/problem-02/ACCEPTANCE.md` C12 and C2.1 are what it has to do and why it is called this.
 *
 * FOUR PLACES, AND ONLY ONE OF THEM BINDS ITSELF. This is the same shape of problem
 * `tests/audience.test.ts` was written for, so this file is written the same way.
 *
 *   - The TYPE, `BlockCommon` in `src/shared/types.ts`. It binds itself: reading a property off a
 *     discriminated union requires every member to declare it, so a missed interface is a compile
 *     error. There is nothing here to test.
 *   - The CHECKER, `blockCommon` in `src/server/lib/summary.ts`. It does not bind itself. A schema
 *     that dropped the key would still compile and would answer 400 to a mark. MEASURED on 29
 *     August 2026 by taking `forOwner` out of that one line and re-sending a report that had just
 *     been stored: `400 — The curated summary is not usable: summary block 1 (finding):
 *     Unrecognized key: "forOwner"`.
 *   - The SERVED SCHEMA, `BLOCK_COMMON_FIELDS` in `src/shared/kinds.ts`. Nor does this one, and it
 *     is the half an agent reads. MEASURED the same way, by deleting its entry and re-sending the
 *     same report: `400 — unknown key "forOwner" — a FindingBlock has no field by that name.`
 *   - The REGION FACT, `Region.forOwner` in `src/shared/regions.ts`. Nothing in the type checker
 *     connects the stored key to the derived region: `blockRegions` could stop reading the block
 *     and every region would simply be unmarked, silently, and the projection that is meant to
 *     promote a gate would promote nothing.
 *
 * WHICH LEVELS DRAW A MARKED BLOCK, WHICH IS NOW A FIFTH THING AND IS AT THE FOOT OF THIS FILE.
 * The sentence above said the promotion was promised at every level including the lowest. It was
 * built that way, and on report `FPf58Hfk7_z_`, block `b-seed`, it went wrong: a box labelled
 * *addressed to you* could not be got rid of at any level, which is clearly unreasonable. The mark
 * moved up to reading length 4 first, and then the whole box was taken out at every level. So the
 * mark now decides NOTHING about which level draws the block: it is drawn at Full, with every other
 * block, and at no shorter length. The mark itself is unchanged and all four places above are
 * unchanged. The last describe in this file holds that answer, because a reader coming here to find
 * out what the mark does should not have to go somewhere else for it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SHAPE_SPECS } from '../src/shared/kinds.ts'
import { flatten, regionsOf, type Region } from '../src/shared/regions.ts'
import { reportAt } from '../src/shared/reportrungs.ts'
import type { DetailSource } from '../src/shared/detail.ts'
import { SUMMARY_BLOCK_TYPES, type SummaryBlock } from '../src/shared/types.ts'
import type { FastifyInstance } from 'fastify'
import { apiApp, exampleBlock, freshDb, shapeNameFor, type TestDb } from './helpers.ts'

type SummaryApi = typeof import('../src/server/lib/summary.ts')

let t: TestDb
let s: SummaryApi
let app: FastifyInstance

// freshDb names a throwaway database first, so importing the checker — which reaches the SQLite
// client through records.ts — never opens the operator's file. One office serves the whole file.
beforeAll(async () => {
  t = await freshDb()
  s = await import('../src/server/lib/summary.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

const validateSummaryBlocks = (blocks: unknown) => s.validateSummaryBlocks(blocks)

/**
 * A PUBLISHED EXAMPLE BLOCK WITH THE MARK TAKEN BACK OUT.
 *
 * `exampleBlock` builds from what `GET /api/kinds` publishes, and the published example for
 * `forOwner` is `true` — a real valid value, which is what a published example has to be. So every
 * block built from the examples arrives marked, and a test that wants an unmarked one has to say so.
 * `tests/audience.test.ts` handles `audience` the same way and for the same reason.
 *
 * THIS WAS MEASURED, NOT REASONED. The first run of this file had three failures, all of them a
 * block this test called unmarked arriving marked.
 */
function unmarkedExample(type: string, id?: string): Record<string, unknown> {
  const { forOwner: _mark, ...rest } = exampleBlock(type)
  return id === undefined ? rest : { ...rest, id }
}

/** What the checker said when it refused, or the empty string if it did not refuse. */
function refusalFor(blocks: unknown): string {
  try {
    validateSummaryBlocks(blocks)
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  return ''
}

describe('a block can say it is addressed to the owner', () => {
  it('accepts the mark on every block type there is, quote included', () => {
    // THE LOOP IS OVER THE DECLARED LIST, not a list written here, so a twenty-second block type
    // that forgets the spread is red the day it is added.
    const accepted: string[] = []
    for (const type of SUMMARY_BLOCK_TYPES) {
      const parsed = validateSummaryBlocks([{ ...exampleBlock(type), forOwner: true }])
      expect(parsed[0]?.forOwner, type).toBe(true)
      accepted.push(type)
    }
    expect(accepted).toHaveLength(SUMMARY_BLOCK_TYPES.length)
  })

  it('accepts it on a quote, where `audience` is refused, because the two rules are about different things', () => {
    // A quote may not be marked for developers: hiding somebody else's words is classifying away
    // the original. Saying a quoted passage is addressed to the owner hides nothing and takes
    // nothing away from whoever said it, so the quote rule does not reach this field.
    const parsed = validateSummaryBlocks([{ ...exampleBlock('quote'), forOwner: true }])
    expect(parsed[0]?.forOwner).toBe(true)
    expect(refusalFor([{ ...exampleBlock('quote'), audience: 'developers' }])).not.toBe('')
  })

  it('accepts false, and false means what leaving it out means', () => {
    const parsed = validateSummaryBlocks([{ ...exampleBlock('text'), forOwner: false }])
    expect(parsed[0]?.forOwner).toBe(false)
    // The one reader of the field asks `=== true`, so there is one answer to "is it marked".
    expect(markedIds([{ ...exampleBlock('text'), forOwner: false } as SummaryBlock])).toEqual([])
  })

  it('leaves an unmarked block alone: nothing is filled in on the way through', () => {
    const parsed = validateSummaryBlocks([unmarkedExample('text')])
    expect('forOwner' in (parsed[0] ?? {})).toBe(false)
  })

  it('refuses anything that is not true or false, on every block type', () => {
    for (const type of SUMMARY_BLOCK_TYPES) {
      for (const wrong of ['yes', 1, null, 'owner']) {
        const said = refusalFor([{ ...exampleBlock(type), forOwner: wrong }])
        expect(said, `${type} must refuse forOwner ${JSON.stringify(wrong)}`).not.toBe('')
        expect(said, `${type} refusal names the field`).toContain('forOwner')
      }
    }
  })

  it('publishes the key on every block shape it serves, so an agent can learn it exists', () => {
    // THE SERVED-SCHEMA GUARD. Without this, a forgotten entry fails nothing: the checker's tests
    // pass, the type checker binds a different file, and the agent reading GET /api/kinds is told
    // the field does not exist while the checker would have accepted it.
    const missing: string[] = []
    for (const type of SUMMARY_BLOCK_TYPES) {
      const shape = SHAPE_SPECS[shapeNameFor(type)]
      if (!(shape?.fields ?? []).some((f) => f.key === 'forOwner')) missing.push(type)
    }
    expect(missing).toEqual([])
  })

  it('publishes an example the checker accepts, on every block type', () => {
    // An example that is not a valid value is worse than no example: an agent copies it and gets a
    // 400 for doing what it was told. `exampleBlock` builds from the published examples, so this
    // asserts the published `forOwner` example is one of them and that it survives the checker.
    for (const type of SUMMARY_BLOCK_TYPES) {
      const published = SHAPE_SPECS[shapeNameFor(type)]?.fields.find((f) => f.key === 'forOwner')
      expect(published?.type, type).toBe('boolean')
      expect(published?.required, type).toBe(false)
      const parsed = validateSummaryBlocks([{ ...exampleBlock(type), forOwner: published?.example }])
      expect(parsed[0]?.forOwner, type).toBe(true)
    }
  })
})

/** Every region derived from these blocks that carries the mark, by region id. */
function markedIds(blocks: readonly SummaryBlock[]): string[] {
  return flatten(regionsOf({ field: 'blocks', blocks })).filter((r) => r.forOwner).map((r) => r.id)
}

/**
 * THE REGION FACT, WHICH IS THE HALF THE PROJECTION WILL READ.
 *
 * A stored key nothing can see from a region is a stored key the outline cannot promote. Nothing in
 * the type checker connects the two: `blockRegions` could stop reading the block and every region
 * would come out unmarked, with no error anywhere.
 */
describe('the mark is visible from the region the block becomes', () => {
  it('lands on the region of the marked block, on every block type, and on no other', () => {
    for (const type of SUMMARY_BLOCK_TYPES) {
      const example = exampleBlock(type)
      const blocks = validateSummaryBlocks([{ ...example, forOwner: true }, unmarkedExample('text', 'b-beside-it')])
      // Exactly one region, and it is the block's own — the id the published example carries. Not
      // the paragraph inside it, and not the unmarked block standing beside it.
      expect(markedIds(blocks), type).toEqual([`data.blocks[#${String(example.id)}]`])
    }
  })

  it('does not run down the tree, so "which blocks did the author mark" stays answerable', () => {
    // A `text` block derives a region for the block and a region for each paragraph inside it. The
    // mark is a statement its author made about ONE block; copying it onto everything underneath
    // would make the tree unable to say which block was marked. A reader that wants everything
    // under a marked region already has `children`.
    const blocks = validateSummaryBlocks([
      { id: 'b-two-paragraphs', type: 'text', text: 'The first paragraph.\n\nThe second paragraph.', forOwner: true },
    ])
    const root = regionsOf({ field: 'blocks', blocks })
    const block = root.children[0] as Region
    expect(block.forOwner).toBe(true)
    expect(block.children.length).toBeGreaterThan(1)
    expect(block.children.map((c) => c.forOwner)).toEqual(block.children.map(() => false))
  })

  it('never marks the report body itself, because the body is not a block anybody wrote', () => {
    const blocks = validateSummaryBlocks([{ ...exampleBlock('text'), forOwner: true }])
    expect(regionsOf({ field: 'blocks', blocks }).forOwner).toBe(false)
  })

  it('leaves every region unmarked when no block carries the key', () => {
    // THE CONTROL. Without it, a derivation that marked everything would pass the test above.
    const blocks = validateSummaryBlocks(SUMMARY_BLOCK_TYPES.map((type) => unmarkedExample(type, `b-${type}`)))
    expect(markedIds(blocks)).toEqual([])
  })
})

/**
 * THE DOORS A WRITER ACTUALLY USES.
 *
 * Every test above calls the checker directly, and `tests/audience.test.ts` records what that
 * missed once: the write path refuses through `validateRecordData` before the checker is reached,
 * formats its own message, and a sentence proved against the checker reached nobody. So the mark is
 * proved through the routes as well, on both doors, and the PATCH uses `dataPatch` — `data` on a
 * PATCH replaces the whole object, so a refusal proved with it is a create wearing a patch's name.
 */
describe('the mark survives the write path a writer uses', () => {
  const HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

  /** A whole report: one block addressed to the owner, one not, and the two fields a report needs. */
  const aReportWithAGate = (forOwner: unknown = true) => ({
    kind: 'report',
    title: 'A report with one thing waiting on the owner',
    data: {
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-08-29',
      blocks: [
        { id: 'b-open', type: 'text', text: 'What this round did, in one paragraph.' },
        { id: 'b-gate', type: 'finding', state: 'blocked', text: 'Which of the three ways is the one you want?', forOwner },
      ],
    },
  })

  it('stores the mark and serves it back on the block that carried it', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: HEADERS, payload: aReportWithAGate() })
    expect(made.statusCode, made.body).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id

    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HEADERS })
    const blocks = (read.json() as { record: { data: { blocks: { id: string; forOwner?: boolean }[] } } }).record.data.blocks
    expect(blocks.find((b) => b.id === 'b-gate')?.forOwner).toBe(true)
    // AND THE OTHER BLOCK IS UNTOUCHED. A write path that filled the key in everywhere would pass
    // the line above and would have invented a statement its author never made.
    expect('forOwner' in (blocks.find((b) => b.id === 'b-open') ?? {})).toBe(false)
  })

  it('marking a block does not make the record incomplete', async () => {
    // THE OWNER'S THIRD ANSWER: projection availability is separate from record completeness. Marking a
    // block is a statement about the writing; it is not an obligation the record now fails to meet.
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: HEADERS, payload: aReportWithAGate() })
    expect(made.statusCode, made.body).toBe(201)
    expect((made.json() as { incomplete: unknown[] }).incomplete).toEqual([])

    const without = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { ...aReportWithAGate(), data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-29', blocks: [{ id: 'b-open', type: 'text', text: 'No mark anywhere.' }] } },
    })
    expect((without.json() as { incomplete: unknown[] }).incomplete).toEqual([])
  })

  it('refuses a value that is not true or false on POST, and says what a correct one looks like', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/records', headers: HEADERS, payload: aReportWithAGate('yes') })
    expect(res.statusCode, res.body).toBe(400)
    const said = JSON.stringify(res.json())
    expect(said).toContain('forOwner')
    expect(said).toContain('true or false')
    // AND THE RULE BEHIND THE SHAPE. A writer told only that a boolean was wanted goes looking for
    // a typo; this field exists next to `audience`, which answers a different question, and the
    // refusal says so rather than leaving them to find out by sending the other one.
    expect(said).toContain('audience')
  })

  it('refuses it on PATCH with dataPatch, and stores nothing', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: HEADERS, payload: aReportWithAGate() })
    const id = (made.json() as { record: { id: string } }).record.id

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HEADERS,
      payload: { dataPatch: { blocks: [{ id: 'b-gate', type: 'finding', state: 'blocked', text: 'x', forOwner: 'yes' }] } },
    })
    expect(res.statusCode, res.body).toBe(400)

    // AND NOTHING WAS WRITTEN. A refusal that stored the blocks anyway would be the failure with a
    // 400 painted on it: the report still has both its blocks and the gate still reads true.
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HEADERS })
    const blocks = (read.json() as { record: { data: { blocks: { id: string; forOwner?: boolean }[] } } }).record.data.blocks
    expect(blocks).toHaveLength(2)
    expect(blocks.find((b) => b.id === 'b-gate')?.forOwner).toBe(true)
  })

  it('refuses a misspelt key rather than storing a mark nothing will ever read', async () => {
    // STRICT KEYS ARE THE POINT. `forOwnerr: true` stored and ignored is a block its author believes
    // is addressed to the owner and which no projection will ever promote.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { kind: 'report', title: 'A misspelt mark', data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-29', blocks: [{ id: 'b-1', type: 'text', text: 'x', forOwnerr: true }] } },
    })
    expect(res.statusCode, res.body).toBe(400)
    expect(JSON.stringify(res.json())).toContain('forOwner')
  })
})

/**
 * WHAT A LEVEL DRAWS OF A MARKED BLOCK, WHICH IS THE FIFTH PLACE THE MARK LIVES.
 *
 * NOTHING, UNTIL FULL, AND THAT IS ON PURPOSE RATHER THAN AN OVERSIGHT. The mark used to move the
 * block up the reading ladder — it was promoted at every level, then from level 4 — and then
 * everything under the written form was removed at every level. A marked block is a block, so it is
 * drawn where blocks are drawn, which is Full.
 *
 * THE MARK STILL MEANS SOMETHING and the describes above are where that is checked: it is stored,
 * served back, refused when misspelt, and visible on the region the block becomes, which is what a
 * surface reads to draw the block differently.
 */
describe('a marked block is drawn at Full, with the rest of the report, and at no shorter length', () => {
  const FOR_THE_OWNER = 'Two decisions are yours before the trials can be booked.'
  const MARKED: SummaryBlock[] = [
    { id: 'b-open', type: 'text', text: 'The prose this report opens with, which is not addressed to anybody.' },
    { id: 'b-gate', type: 'text', forOwner: true, text: FOR_THE_OWNER },
  ]
  const SOURCE: DetailSource = {
    title: 'A report with a block addressed to the owner',
    summary: null,
    declaresShortForms: true,
    shortForms: { label: { text: 'Two decisions', writtenBy: 'agent' } },
    body: { field: 'data.blocks', written: true },
  }

  it('is drawn at Full, like every other block', () => {
    const drawn = reportAt(SOURCE, MARKED, 'full').blocks
    expect(drawn).toEqual([0, 1])
  })

  it('is drawn at none of the six shorter lengths, which is the owner\'s ruling of 2 September', () => {
    for (const rung of ['label', 'title', 'gist', 'outline', 'sketch', 'digest'] as const) {
      const drawn = reportAt(SOURCE, MARKED, rung).blocks
      expect(drawn, `the box the owner could not get rid of is back at ${rung}`).toEqual([])
    }
  })

  it('does not make the level draw one block while leaving the rest, at any length', () => {
    // THE WHOLE REPORT OR NONE OF IT, so a rule that promoted one marked block would show up here
    // as a length drawing some blocks and not others.
    for (const rung of ['label', 'title', 'gist', 'outline', 'sketch', 'digest', 'full'] as const) {
      const drawn = reportAt(SOURCE, MARKED, rung).blocks
      expect([0, MARKED.length], `${rung} drew ${String(drawn.length)} of ${String(MARKED.length)} blocks`).toContain(drawn.length)
    }
  })
})
