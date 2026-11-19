// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `audience` KEY, IN ALL THREE PLACES A BLOCK'S SHAPE IS DECLARED.
 *
 * `design/round-ten/design/projections.md` §4.3 says a block cannot carry a field the schema does
 * not know: every one of the twenty block schemas is a `z.strictObject`, so an unknown key is a 400
 * and there is no passthrough. So the key had to be declared three times — on the TypeScript union,
 * in the zod checker, and in the schema the product serves at `GET /api/kinds`.
 *
 * ONE OF THOSE THREE BINDS ITSELF AND TWO DO NOT, which is why this file exists.
 *
 *   - The TYPE binds itself. `SummaryBlocks.tsx` reads `block.audience` off the discriminated union,
 *     and reading a property off a union requires every member to declare it. A missed interface is
 *     a compile error, so there is nothing here to test.
 *   - The CHECKER does not. A schema that dropped `...blockCommon` would still compile and would
 *     still accept everything it accepts today; it would simply answer 400 to a mark. The first two
 *     tests below are what holds it.
 *   - The SERVED SCHEMA does not either, and the design's first draft left this half untested. An
 *     agent reading `GET /api/kinds` for `ImageBlock`, finding no `audience`, correctly concludes it
 *     cannot mark a picture — while the checker would have accepted one. Three declarations, two
 *     bound, is this repository's own named defect. The third test is that guard.
 *
 * ONE BLOCK TYPE IS DIFFERENT, AND IT IS THE POINT OF §9.2 RULE 2. A `quote` block may never be
 * marked, by anybody, because a quote is somebody else's words and hiding them from a normal reader
 * is classifying away the original. Both the checker and the served schema say so, and the tests
 * below assert the refusal rather than skipping the type.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AUDIENCES, READERS, readerSees } from '../src/shared/audience.ts'
import { A_QUOTE_MAY_NOT_BE_HIDDEN, SHAPE_SPECS } from '../src/shared/kinds.ts'
import { SUMMARY_BLOCK_TYPES } from '../src/shared/types.ts'
import type { FastifyInstance } from 'fastify'
import { apiApp, exampleBlock, freshDb, shapeNameFor, type TestDb } from './helpers.ts'

type SummaryApi = typeof import('../src/server/lib/summary.ts')

let t: TestDb
let s: SummaryApi

// freshDb names a throwaway database first, so importing the checker — which reaches the SQLite
// client through records.ts — never opens the operator's file.
beforeAll(async () => {
  t = await freshDb()
  s = await import('../src/server/lib/summary.ts')
}, 60_000)
afterAll(() => t.close())

const validateSummaryBlocks = (blocks: unknown) => s.validateSummaryBlocks(blocks)

/**
 * THE BUILDER MOVED TO tests/helpers.ts, IT WAS NOT COPIED. This file wrote `shapeNameFor`,
 * `exampleBlock` and the set of fields published on every block but not valid on every block.
 * `tests/a-block-addressed-to-the-owner.test.ts` needs the same three, and a second copy of them is
 * the defect at the top of CLAUDE.md. The comments explaining each one moved with it.
 */

describe('a block says who it is for', () => {
  it('accepts audience "developers" on every block type but quote, built from the published example', () => {
    // The loop is over the DECLARED list, not over a list written here, so a twenty-first block
    // type that forgets the spread is red the day it is added.
    const accepted: string[] = []
    for (const type of SUMMARY_BLOCK_TYPES) {
      if (type === 'quote') continue
      const block = { ...exampleBlock(type), audience: 'developers' }
      const parsed = validateSummaryBlocks([block])
      expect(parsed[0]?.audience, type).toBe('developers')
      accepted.push(type)
    }
    expect(accepted).toHaveLength(SUMMARY_BLOCK_TYPES.length - 1)
  })

  it('refuses a word that is not an audience, and its message names both real words', () => {
    for (const type of SUMMARY_BLOCK_TYPES) {
      // A quote refuses `nobody` too, but its message is the RULE rather than the enum, and the
      // test below reads that one. Asserting the enum words here would force the quote's message
      // to list a value it does not accept.
      if (type === 'quote') continue
      const block = { ...exampleBlock(type), audience: 'nobody' }
      let message = ''
      try {
        validateSummaryBlocks([block])
      } catch (err) {
        message = err instanceof Error ? err.message : String(err)
      }
      expect(message, `${type} must refuse audience "nobody"`).not.toBe('')
      for (const word of AUDIENCES) expect(message, `${type} refusal names ${word}`).toContain(word)
    }
  })

  it('refuses to mark a quote for developers, and says why in words a writer can act on', () => {
    let message = ''
    try {
      validateSummaryBlocks([{ ...exampleBlock('quote'), audience: 'developers' }])
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).not.toBe('')
    expect(message).toContain('quote')
    expect(message).toContain('code')
    // The rule, not the enum: a message reading only "must be one of everyone" would send the
    // writer to look for a typo instead of telling them a quote may not be hidden at all.
    expect(message.toLowerCase()).toContain('somebody else')
  })

  it('still accepts a quote marked for everyone, because the refusal is about hiding and nothing else', () => {
    const parsed = validateSummaryBlocks([{ ...exampleBlock('quote'), audience: 'everyone' }])
    expect(parsed[0]?.audience).toBe('everyone')
  })

  it('publishes an audience field on every block shape it serves, so an agent can learn the key', () => {
    // THE SERVED-SCHEMA GUARD. Without this, a forgotten spread fails nothing: the checker's tests
    // pass, the type checker binds a different file, and the agent is told the field does not exist.
    const missing: string[] = []
    for (const type of SUMMARY_BLOCK_TYPES) {
      const shape = SHAPE_SPECS[shapeNameFor(type)]
      const has = (shape?.fields ?? []).some((f) => f.key === 'audience')
      if (!has) missing.push(type)
    }
    expect(missing).toEqual([])
  })

  it('serves a quote block a narrower audience type than the other nineteen, matching what the checker does', () => {
    const quote = SHAPE_SPECS[shapeNameFor('quote')]?.fields.find((f) => f.key === 'audience')
    expect(quote?.type).toBe("'everyone'")
    const text = SHAPE_SPECS[shapeNameFor('text')]?.fields.find((f) => f.key === 'audience')
    expect(text?.type).toBe("'everyone' | 'developers'")
  })

  it('leaves a block with no audience alone: nothing is filled in on the way through', () => {
    const { audience: _marked, ...unmarked } = exampleBlock('text')
    const parsed = validateSummaryBlocks([unmarked])
    expect('audience' in (parsed[0] ?? {})).toBe(false)
  })
})

/**
 * THE SENTENCE HAS TO REACH THE WRITER, AND UNTIL 26 AUGUST 2026 IT DID NOT.
 *
 * Every test above calls `validateSummaryBlocks` directly. `design/round-ten/verification/
 * wave-12.json` drove the ROUTES instead and found the authored sentence reaching nobody:
 *
 * > Live on both doors: POST /api/records and PATCH with `dataPatch` both answer
 * > `data.blocks[0].audience must be one of: everyone, but it is the string "developers". A correct
 * > value looks like: "everyone"`. `grep -c 'somebody else'` over both replies: 0.
 *
 * `validateRecordData` refuses the write before the zod checker is ever reached, and formats its
 * own message out of the declaration. So the test above proved a sentence no writer would read.
 *
 * WHY BOTH DOORS, AND WHY THE PATCH USES `dataPatch`. A rule enforced on one write path is not a
 * rule — this repository says so in four places in the write path itself. And `data` on a PATCH
 * REPLACES the whole object, so a refusal proved with it is a refusal proved against a create
 * wearing a patch's name; `dataPatch` merges key by key and is the narrowest thing that touches
 * this field. Three sessions in this campaign have proved a write-path refusal with `data`.
 */
describe('the refusal reaches the writer, through the doors a writer uses', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)
  afterAll(async () => {
    await app.close()
  })

  const HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

  /** A report body holding one quote block, marked for developers. The whole of the refused write. */
  const aHiddenQuote = () => [{ ...exampleBlock('quote'), audience: 'developers' }]

  /** Everything the reply says, whichever field the envelope put it in. */
  const wordsOf = (body: unknown): string => JSON.stringify(body)

  it('says the rule on POST /api/records, not only the enum', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { kind: 'report', title: 'A report quoting somebody', data: { blocks: aHiddenQuote() } },
    })
    expect(res.statusCode, res.body).toBe(400)
    const said = wordsOf(res.json())
    // THE SHAPE IS STILL SAID. The rule is added to the refusal, never in place of it: a caller
    // still has to be told what a correct value looks like.
    expect(said).toContain('everyone')
    // AND THE RULE. This is the assertion the verification's `grep -c` returned 0 for.
    expect(said.toLowerCase()).toContain('somebody else')
    expect(said).toContain('code')
  })

  it('says it on PATCH with dataPatch, which is the narrowest door onto the field', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { kind: 'report', title: 'A report with a clean quote', data: { blocks: [exampleBlock('quote')] } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HEADERS,
      payload: { dataPatch: { blocks: aHiddenQuote() } },
    })
    expect(res.statusCode, res.body).toBe(400)
    const said = wordsOf(res.json())
    expect(said.toLowerCase()).toContain('somebody else')

    // AND NOTHING WAS WRITTEN. A refusal that stored the block anyway would be the failure with a
    // 400 painted on it. The stored block still carries the `everyone` it was filed with — the
    // published example's own value — rather than the `developers` this patch tried to give it.
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HEADERS })
    const blocks = (read.json() as { record: { data: { blocks: { audience?: string }[] } } }).record.data.blocks
    expect(blocks[0]?.audience).toBe('everyone')
  })

  it('leaves every other field\'s refusal exactly as short as it was', async () => {
    // THE CONTROL. `refusal` is optional, and a mechanism that appended something to every 400
    // would make every message in the product longer — which is the opposite of what this product
    // asks of a refusal. A `state` sent wrong must still be answered about `state` and nothing else.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: { kind: 'task', title: 'A task with a bad state', data: { state: 'nearly' } },
    })
    expect(res.statusCode, res.body).toBe(400)
    const said = wordsOf(res.json())
    expect(said).toContain('state')
    expect(said).not.toContain('The rule:')
  })

  it('serves the rule on the kind, so an agent can read it before meeting it', async () => {
    // ONE SENTENCE, TWO PLACES IT IS READ FROM, ONE PLACE IT IS WRITTEN. The served schema carries
    // it as the field's own `refusal`, which is the same string the 400 above quotes and the same
    // string the zod checker throws.
    const quote = SHAPE_SPECS[shapeNameFor('quote')]?.fields.find((f) => f.key === 'audience')
    expect(quote?.refusal).toBe(A_QUOTE_MAY_NOT_BE_HIDDEN)
    let fromTheChecker = ''
    try {
      validateSummaryBlocks(aHiddenQuote())
    } catch (err) {
      fromTheChecker = err instanceof Error ? err.message : String(err)
    }
    expect(fromTheChecker).toContain(A_QUOTE_MAY_NOT_BE_HIDDEN)
  })
})

describe('the rule itself', () => {
  it('shows a marked block to a developer and to an agent, and not to a normal reader', () => {
    expect(readerSees('developers', 'normal')).toBe(false)
    expect(readerSees('developers', 'developer')).toBe(true)
    expect(readerSees('developers', 'agent')).toBe(true)
  })

  it('shows an unmarked block to all three readers', () => {
    for (const reader of READERS) {
      expect(readerSees(undefined, reader), reader).toBe(true)
      expect(readerSees('everyone', reader), reader).toBe(true)
    }
  })
})
