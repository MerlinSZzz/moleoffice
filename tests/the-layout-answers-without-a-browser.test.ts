// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STATE A PREFERENCE THE LAYOUT MUST REFUSE, AND SEE IT REFUSED FOR A STATED REASON.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS THE ONE THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * An Agent's proportions are preferences within a valid composition, not absolute pixel or
 * percentage commands, and `design/problem-01/OWNER-ANSWER-COMPOSITION.md` names the acceptance
 * test that follows from that, the one that cannot be faked.
 * It is this: state a preference the layout must refuse, and check that it refuses it for a stated
 * reason.
 *
 * A build that stored `9 to 1` and wrote `grid-template-columns: 90% 10%` would pass every test
 * about storage, every test about regions, and would look right in a screenshot at 1440. It would
 * fail here, because here the same field with the same code path gives two different answers in
 * the same box: 9 to 1 is adapted and reported, 6 to 4 is given exactly as asked.
 *
 * AND IT IS ANSWERED WITH NO BROWSER ANYWHERE. That is not a convenience. A refusal only a
 * screenshot can show is a refusal the Agent that wrote the report never finds out about.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT ASSERTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * That these pixels are the pixels a browser draws. Nothing draws a composition yet, and the test
 * that reconciles this arithmetic with real flexbox at twelve widths arrives with the renderer.
 * What is asserted is that the answer is complete, in words, and reachable over HTTP.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { LEAST_REM } from '../src/shared/beside.ts'

/**
 * HOW WIDE THE `narrow` PRESET COMES OUT AT A 16 PIXEL ROOT, READ OUT OF THE STYLESHEET.
 *
 * The route is told this rather than working it out, because the width is declared once, as
 * `--read` in src/web/tokens.css, and a second copy of it in the server would be the defect this
 * repository keeps producing. So this file reads that declaration instead of writing 34 again.
 */
const READ_REM = Number(
  /--read:\s*([\d.]+)rem/.exec(readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8'))?.[1] ??
    Number.NaN,
)
if (!Number.isFinite(READ_REM)) throw new Error('src/web/tokens.css does not declare --read as a length in rem')
/**
 * AND WHO IS ASKING. `reader` is required for the same reason the four widths are: a part of a
 * composition written for developers is not drawn for a normal reader at all. Nothing in this file
 * marks an audience, so all three readers get the same answer here, and `agent` is what this file
 * is — an agent asking over HTTP with no screen anywhere.
 */
const AT_1164 = `?width=1164&gutter=18&rem=16&read=${String(READ_REM * 16)}&reader=agent`

const WORKSPACE = 'default'
const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
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

/** Writing beside a picture, at whatever the report asks the two to be worth. */
const wordsAndPicture = (a: number, b: number): unknown => ({
  blocks: [
    {
      id: 'b-beside',
      type: 'beside',
      parts: [
        {
          id: 'p-words',
          share: a,
          blocks: [{ id: 'bw', type: 'text', text: 'The mast moved 4mm under load, every time, across forty runs.' }],
        },
        {
          id: 'p-shot',
          share: b,
          blocks: [{ id: 'bs', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/mast.png`, alt: 'the mast under load' }],
        },
      ],
    },
  ],
})

const WORDS = 'data.blocks[#b-beside].parts[#p-words]'
const SHOT = 'data.blocks[#b-beside].parts[#p-shot]'

async function report(data: unknown): Promise<{ id: string; layout: any }> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: { kind: 'report', title: 'A composition', data } as object,
    headers: AGENT,
  })
  expect(made.statusCode, made.body).toBe(201)
  const body = made.json()
  return { id: body.record.id as string, layout: body.layout }
}

async function layout(id: string, query: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}/layout${query}`, headers: AGENT })
  return { status: res.statusCode, body: res.json() }
}

describe('what the layout would do with what a report asked for, over HTTP', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Every assertion below is about a composition being FOUND in a
   * stored record. A route that found none would answer `{compositions: []}` and every "no refusal
   * was reported" assertion in this file would pass against nothing at all.
   */
  it('finds the composition in the record at all, which is the control for everything below', async () => {
    const { id } = await report(wordsAndPicture(6, 4))
    const answer = await layout(id, AT_1164)
    expect(answer.status).toBe(200)
    expect(answer.body.compositions).toHaveLength(1)
    expect(answer.body.compositions[0].regionId).toBe('data.blocks[#b-beside]')
    expect(answer.body.compositions[0].parts.map((p: any) => p.regionId)).toEqual([WORDS, SHOT])
  })

  /**
   * THE OWNER'S TEST. 1164 less one 18px gap is 1146; nine tenths of that would put the picture at
   * 114.6, under the floor a picture is never drawn below. So the picture is held at that floor,
   * the writing takes the rest of the 1146, and the part that did not get what it asked for is
   * named.
   *
   * BOTH NUMBERS COME FROM `LEAST_REM` AND NEITHER IS TYPED HERE. The writing side used to be
   * written as 986, which is 1146 less the 160 pixels the floor was until 29 August 2026 — one
   * fact in two places, and the test went red when the floor moved even though nothing was wrong.
   */
  it('adapts 9 to 1, and names the part it refused and why', async () => {
    const { id } = await report(wordsAndPicture(9, 1))
    const answer = await layout(id, AT_1164)
    const one = answer.body.compositions[0]

    expect(one.chosenBy).toBe('the report')
    expect(one.parts.map((p: any) => p.asked)).toEqual([9, 1])
    const floor = LEAST_REM.figure * 16
    expect(one.across).toEqual([
      { regionId: WORDS, px: 1164 - 18 - floor },
      { regionId: SHOT, px: floor },
    ])
    expect(one.honoured).toEqual([])
    expect(one.unhonoured).toHaveLength(1)
    expect(one.unhonoured[0].target).toBe(SHOT)
    expect(one.unhonoured[0].hint).toBe('1')
    expect(one.unhonoured[0].because.length).toBeGreaterThan(40)
    // The reason is in words a person reads, not in the vocabulary of the code that produced it.
    for (const word of ['fit', 'region', 'fr', 'grid', 'container', 'px', 'minmax', 'flex', 'basis']) {
      expect(one.unhonoured[0].because, `the reason uses the word "${word}"`).not.toContain(word)
    }
    // The two widths, in words, are on the answer: what happens above one and below the other.
    expect(one.sentence).toContain('9 to 1')
    expect(one.exactAboveRem).toBeGreaterThan(one.stackBelowRem)
  })

  /** The same two parts in the same box, asked for differently, and nothing is refused. */
  it('gives 6 to 4 exactly, with nothing in the unhonoured list', async () => {
    const { id } = await report(wordsAndPicture(6, 4))
    const one = (await layout(id, AT_1164)).body.compositions[0]
    expect(one.across).toEqual([
      { regionId: WORDS, px: 1146 * 0.6 },
      { regionId: SHOT, px: 1146 * 0.4 },
    ])
    expect(one.unhonoured).toEqual([])
    expect(one.honoured).toEqual(['data.blocks[#b-beside]'])
  })

  /**
   * A WIDTH, A GAP AND A TEXT SIZE ARE FACTS ABOUT A SCREEN, AND THIS SERVER HAS NEVER SEEN ONE.
   * A default for any of them would let the route answer confidently about a screen nobody has,
   * and the answer would look exactly like a true one. The reading measure is the fourth, and it is
   * asked for rather than worked out because its width is declared once, in the stylesheet.
   */
  it('refuses to guess a screen, and names the parameter that was left out', async () => {
    const id = (await report(wordsAndPicture(6, 4))).id
    for (const one of [
      { missing: 'width', query: `?gutter=18&rem=16&read=${String(READ_REM * 16)}&reader=agent` },
      { missing: 'gutter', query: `?width=1164&rem=16&read=${String(READ_REM * 16)}&reader=agent` },
      { missing: 'rem', query: `?width=1164&gutter=18&read=${String(READ_REM * 16)}&reader=agent` },
      { missing: 'read', query: '?width=1164&gutter=18&rem=16&reader=agent' },
      { missing: 'reader', query: `?width=1164&gutter=18&rem=16&read=${String(READ_REM * 16)}` },
    ]) {
      const answer = await layout(id, one.query)
      expect(answer.status, one.missing).toBe(400)
      expect(answer.body.error, one.missing).toContain(`${one.missing} is required`)
    }
    // A misspelt parameter is not "the real one was left out", and the refusal says which is which.
    const typo = await layout(id, `${AT_1164}&witdh=900`)
    expect(typo.status).toBe(400)
    expect(typo.body.error).toContain('witdh')
  })

  /** The parts go one under another when there is no room, and that is said rather than drawn. */
  it('says the parts are one under another on a narrow screen', async () => {
    const id = (await report(wordsAndPicture(3, 2))).id
    const one = (await layout(id, `?width=390&gutter=18&rem=16&read=${String(READ_REM * 16)}&reader=agent`)).body.compositions[0]
    expect(one.across).toBeNull()
    expect(one.unhonoured).toHaveLength(1)
    expect(one.unhonoured[0].target).toBe('data.blocks[#b-beside]')
    expect(one.unhonoured[0].because).toContain('one under another')
  })

  /**
   * THE WRITE RESPONSE SAYS IT TOO, so an Agent learns what will happen to its 9 to 1 at the moment
   * it writes it, rather than from a screenshot or not at all. It is width-free: a write does not
   * know what screen anybody will read it on, and inventing one here would be the same guess the
   * route refuses to make.
   */
  it('tells the Agent what it asked for in the reply to the write itself', async () => {
    const { layout: onTheWrite } = await report(wordsAndPicture(9, 1))
    expect(onTheWrite).toHaveLength(1)
    expect(onTheWrite[0].regionId).toBe('data.blocks[#b-beside]')
    expect(onTheWrite[0].parts.map((p: any) => p.asked)).toEqual([9, 1])
    expect(onTheWrite[0].sentence).toContain('9 to 1')
    expect(JSON.stringify(onTheWrite)).not.toContain('across')
  })

  /** A record with no composition says nothing about layout, rather than an empty report. */
  it('says nothing at all about a report that holds no composition', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      payload: {
        kind: 'report',
        title: 'Ordinary writing',
        data: { blocks: [{ id: 'b1', type: 'text', text: 'One paragraph, and nothing beside it.' }] },
      } as object,
      headers: AGENT,
    })
    expect(made.statusCode, made.body).toBe(201)
    expect('layout' in made.json()).toBe(false)
    const answer = await layout(made.json().record.id as string, AT_1164)
    expect(answer.status).toBe(200)
    expect(answer.body.compositions).toEqual([])
  })

  /**
   * A READING MEASURE COMES BACK THROUGH THE SAME TWO LISTS, and it is refused on its own terms:
   * four tenths of a 573px part is 229, under the 256 that 16rem is at a 16px root. The part is
   * still drawn at 573 — a measure narrows the WRITING and never the part, which is the
   * distinction the owner drew themselves and the one an implementation loses first.
   */
  it('reports a reading measure it could not give, without moving the part', async () => {
    const { id } = await report({
      blocks: [
        {
          id: 'b-beside',
          type: 'beside',
          parts: [
            {
              id: 'p-words',
              share: 1,
              measure: 0.4,
              blocks: [{ id: 'bw', type: 'text', text: 'Four tenths of this part, which is not enough.' }],
            },
            {
              id: 'p-more',
              share: 1,
              measure: 'narrow',
              blocks: [{ id: 'bm', type: 'text', text: 'And a preset on the part beside it.' }],
            },
          ],
        },
      ],
    })
    const one = (await layout(id, AT_1164)).body.compositions[0]
    expect(one.across.map((p: any) => p.px)).toEqual([573, 573])
    expect(one.unhonoured).toHaveLength(1)
    expect(one.unhonoured[0].target).toBe('data.blocks[#b-beside].parts[#p-words]')
    expect(one.unhonoured[0].hint).toBe('measure 0.4')
    expect(one.honoured).toContain('data.blocks[#b-beside].parts[#p-more] measure narrow')
  })
})
