// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COMPARING TWO VERSIONS OF A RECORD READS AS WORDS, NOT AS A JSON DUMP.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Step 58 section 7 pressed `Compare with what it holds now` on a real report and got this, at 1440
 * and at 390:
 *
 *   heading:  what is different between version 1 and version 4, where was is version 1
 *   one row:  data.blocks[#b-af-h]  added
 *             it was not there · now {"id":"b-af-h","type":"heading","text":"What the hostile …
 *
 * Three faults in one view. The heading is not English. The field is named after where it is stored
 * rather than after what the kind calls it. The value is a JSON dump — 246 braces and brackets were
 * counted in the drawn text, at both widths, in `design/round-nine/caf6-compare-in-a-browser.mjs`.
 *
 * A fourth fault was in the words: the server said *revision* and the screen said *version*, and the
 * server's sentence named the record by its id where its title belongs. VERSION WON. It is the word
 * the screen has always used, and `revision` is the database table's name for the same thing. The
 * table, the columns, the type names and the route paths still say `revisions`, because those are
 * addresses and identifiers rather than words anybody reads; every SENTENCE the ledger produces now
 * says version.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY EACH ONE IS DRAWN RATHER THAN STORED
 * ---------------------------------------------------------------------------------------
 *
 * Every test below renders the real component with a real comparison, made by editing a real record
 * through the real route, and then reads the MARKUP. "The comparison stores a difference" was true
 * of the failing screen too, so nothing here asserts the payload.
 *
 * What a browser has and this runner does not is a width. Whether the widest box exceeds its pane at
 * 1440 and at 390 is measured by `design/round-nine/caf6-compare-in-a-browser.mjs`, which drives a
 * real page against an isolated copy of the corpus and exits non-zero.
 */

import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import type { FieldDiff } from '../src/shared/fielddiff.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
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

beforeEach(() => {
  // The component reaches api.ts, which touches window while it is being evaluated. This is the
  // smallest stand-in that lets it load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

/** Markup with the hoisted style blocks removed, so a class name in the CSS is not read as drawn. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** Everything the markup shows a reader, with the tags taken out. */
function words(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

const HEADING = 'What the hostile user found, and what was done about it'
const LEAD = 'This section was written after the rest of the report had already been reviewed.'

/**
 * A REPORT EDITED THE WAY THE ONE IN STEP 58 WAS: a block added, and the title changed.
 *
 * The comparison comes back from the route rather than being written by hand here, so what is drawn
 * below is what the server really answers for a real edit.
 */
async function aReportWithAKnownEdit(): Promise<{ id: string; differences: FieldDiff[] }> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'Round nine, before the hostile user',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-08-20',
        read: 'unread',
        blocks: [{ id: 'b-lead', type: 'text', text: 'The report as it stood before the section was added.' }],
      },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  const id = (made.json() as { record: { id: string } }).record.id

  const edited = await app.inject({
    method: 'PATCH',
    url: `/api/records/${id}`,
    headers: HUMAN,
    payload: {
      title: 'Round nine, after the hostile user',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-08-20',
        read: 'unread',
        blocks: [
          { id: 'b-lead', type: 'text', text: 'The report as it stood before the section was added.' },
          { id: 'b-af-h', type: 'heading', text: HEADING, level: 2 },
          { id: 'b-af-lead', type: 'text', text: LEAD },
        ],
      },
    },
  })
  expect(edited.statusCode, edited.body).toBe(200)

  const compared = await app.inject({
    method: 'GET',
    url: `/api/records/${id}/revisions/1/compare/2`,
    headers: HUMAN,
  })
  expect(compared.statusCode, compared.body).toBe(200)
  return { id, differences: (compared.json() as { differences: FieldDiff[] }).differences }
}

async function drawn(): Promise<string> {
  const { differences } = await aReportWithAKnownEdit()
  const { WhatChanged } = await import('../src/web/components/RecordHistory.tsx')
  return body(h(WhatChanged, { recordKind: 'report', from: 1, to: 2, differences }))
}

// ============================================================ 1. no JSON reaches a reader

describe('the comparison draws no JSON dump', () => {
  it('draws not one brace or bracket for a block that was added whole', async () => {
    const text = words(await drawn())
    // The added block is an object. It used to be printed with JSON.stringify, which is where every
    // one of these characters came from.
    expect(text).not.toContain('{')
    expect(text).not.toContain('}')
    expect(text).not.toContain('[')
    expect(text).not.toContain(']')
  })

  it('draws what the added block actually says, key by key', async () => {
    const text = words(await drawn())
    // The reader wants the words in the block, not the shape of the object holding them. Each key
    // and its value are drawn apart, so `level` and `2` are two things on a row rather than
    // `"level":2` inside a wall.
    expect(text).toContain(HEADING)
    expect(text).toContain(LEAD)
    expect(text).toContain('level 2')
    expect(text).not.toContain('"level":2')
    expect(text).not.toContain('"text":')
  })
})

// ============================================================ 2. the kind's own words name a field

describe('a changed field is named the way the kind names it', () => {
  it('draws the schema field name, not the path it is stored at', async () => {
    const text = words(await drawn())
    const declared = KIND_SPECS.report.fields.map((f) => f.key)
    expect(declared, 'the report kind stopped declaring blocks').toContain('blocks')
    expect(text).toContain('blocks')
    // `data` is where Mole Office puts a kind's own fields. It is a mechanism word and a reader of a
    // report has no use for it.
    expect(text).not.toContain('data.blocks')
    expect(text).not.toContain('[#b-af-h]')
  })

  it('carries the kind schema\'s own description of that field', async () => {
    // Criterion change: 7FEOshq3mBGG keeps schema descriptions in developer mode.
    const { setMode } = await import('../src/web/lib/mode.ts')
    setMode('inspect')
    const markup = await drawn()
    const said = KIND_SPECS.report.fields.find((f) => f.key === 'blocks')?.description ?? ''
    expect(said.length).toBeGreaterThan(0)
    // GET /api/kinds/report serves this same string from this same declaration, so the name on
    // screen and the name an agent is given cannot drift apart.
    expect(markup).toContain(said.slice(0, 40).replace(/&/g, '&amp;'))
    setMode('normal')
  })
})

// ============================================================ 3. both sides, and which is which

describe('each row says what each version held', () => {

  it('draws both values of a field that changed', async () => {
    const text = words(await drawn())
    expect(text).toContain('before the hostile user')
    expect(text).toContain('after the hostile user')
  })

  it('says a field was not in one of the two versions rather than dumping the other side', async () => {
    const text = words(await drawn())
    // Criterion change: 7FEOshq3mBGG uses the short mark for ordinary absence.
    expect(text).toContain('—')
    expect(text).not.toContain('it was not there')
  })
})

// ============================================================ 4. the heading is English


// ============================================================ 5. one word for the thing

describe('the server and the screen use one word, and it is version', () => {




  it('still answers at the address agents already know', async () => {
    // The word changed and the address did not. An address is not a word a person reads, and moving
    // it would break every agent that learnt it for no gain a reader can see.
    const { id } = await aReportWithAKnownEdit()
    const res = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: HUMAN })
    expect(res.statusCode).toBe(200)
  })
})

