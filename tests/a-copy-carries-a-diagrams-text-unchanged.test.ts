// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A COPY DOES WITH A DIAGRAM: NEVER A PICTURE, AND THE CHARACTERS UNCHANGED WHEREVER THEY GO.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEST THIS WAS ASKED TO BE, AND WHAT MEASURING FIRST FOUND
 * ---------------------------------------------------------------------------------------
 *
 * The critic's objection 11 asked for a test that copies the supervisor's report and compares the
 * diagram's text, and said the test must assert THAT THE REPORT'S BODY IS IN THE COPY before it
 * compares anything — because a comparison of two strings that both lack the diagram passes whether
 * or not the feature exists.
 *
 * That assertion was made first, and it is false, and it is false at every rung. Measured on 8
 * September 2026 against the live office, read-only, `GET /api/bundles/preview?scope=nzxeAPEFDAFV
 * &preset=continue&detail=<rung>`:
 *
 *   detail=title     9,819 bytes    0 fences   0 flowcharts
 *   detail=gist     17,550 bytes    0 fences   0 flowcharts
 *   detail=outline  18,887 bytes    0 fences   0 flowcharts
 *   detail=sketch   21,830 bytes    0 fences   0 flowcharts
 *   detail=digest   24,805 bytes    0 fences   0 flowcharts
 *   detail=full     REFUSED — "Full is the record itself, and a copy stops below it"
 *
 * A COPY NEVER CARRIES A RECORD'S BODY. The seventh rung is the record itself and a copy is drawn
 * at one of the six below it, so what a copy holds about a report is its title, its summary and its
 * written parts — never its blocks. The design sentence "the mermaid text kept exactly as written
 * for copies" rests on a premise the product does not hold, and the comparison the criticism asked
 * for cannot be written today. That is a fact about the copy door and not a defect in it: the
 * refusal above says why the ladder stops there.
 *
 * ---------------------------------------------------------------------------------------
 * SO WHAT THIS FILE HOLDS INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE MEASUREMENT, WRITTEN DOWN. No copy of a report carries any of its diagrams, at any rung.
 *      The day that changes this test goes red and whoever changed it writes the comparison that
 *      could not be written today. This is the same idiom as the sideways-scroll allowlist: a fact
 *      somebody wrote down, which speaks when the world moves under it.
 *   2. NO COPY CARRIES A PICTURE. A copy is text; a drawing has no place in one, and a component
 *      that put its rendered SVG anywhere a copy reads would show up here.
 *   3. WHEREVER A DIAGRAM'S CHARACTERS DO REACH A COPY, THEY REACH IT UNCHANGED. Vacuous today by
 *      the measurement above, and written so that it stops being vacuous by itself.
 *
 * Nothing here reads the live office. The measurement above was taken on one real report. Since 2
 * October 2026 the report written into a throwaway database here is an invented one,
 * tests/fixtures/an-invented-report-for-a-copy.ts, with two diagrams; that file says which of the
 * test's needs each of its parts is there for.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import * as report from './fixtures/an-invented-report-for-a-copy.ts'

const WORKSPACE = 'default'
const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

/** THE DOOR, THE PRESET AND THE RUNGS THIS FILE NAMES, rather than leaving any of the three implied. */
const DOOR = '/api/bundles/preview'
const PRESET = 'continue'
/** Every rung a copy may be drawn at. `full` is refused — it is the record itself. */
const RUNGS = ['title', 'gist', 'outline', 'sketch', 'digest'] as const

const blocks = (): SummaryBlock[] => report.blocks

/** The diagrams as they are stored: the characters between the fences, exactly. */
function diagramsStored(): string[] {
  const out: string[] = []
  for (const block of blocks()) {
    if (block.type !== 'text') continue
    for (const found of block.text.matchAll(/^```mermaid\n([\s\S]*?)^```/gm)) out.push(found[1] ?? '')
  }
  return out
}

let t: TestDb
let app: FastifyInstance
let reportId = ''

/** The office is made once for the file; each case files the report it copies. */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HEADERS,
    payload: {
      kind: 'report',
      title: report.title,
      summary: report.summary,
      data: { blocks: blocks() },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  reportId = (made.json() as { record: { id: string } }).record.id
})

/** One copy of the report, drawn at one rung. */
async function copyAt(rung: string): Promise<{ status: number; text: string; body: string }> {
  const res = await app.inject({
    method: 'GET',
    url: `${DOOR}?scope=${reportId}&preset=${PRESET}&detail=${rung}`,
    headers: HEADERS,
  })
  const said = res.json() as { text?: string; error?: string }
  return { status: res.statusCode, text: said.text ?? '', body: res.body }
}

describe('a copy of a report, at every rung a copy can be drawn at', () => {
  it('is reading a report that still holds its two diagrams', () => {
    const found = diagramsStored()
    expect(found.length, 'its two diagrams').toBe(2)
    for (const one of found) expect(one).toContain('flowchart TD')
  })

  it('draws a copy at every rung, and refuses the seventh because a copy stops below the record', async () => {
    for (const rung of RUNGS) {
      const copy = await copyAt(rung)
      expect(copy.status, `${rung}: ${copy.body.slice(0, 200)}`).toBe(200)
      expect(copy.text.length, `${rung} produced no text`).toBeGreaterThan(500)
      // A copy that is not about the report is not a copy this file can say anything about.
      expect(copy.text, `${rung} does not name the report`).toContain(report.title)
    }
    const full = await copyAt('full')
    expect(full.status, 'a copy at the record itself is refused').toBe(400)
    expect(full.body).toContain('a copy stops below it')
  })

  /**
   * THE MEASUREMENT, WRITTEN DOWN SO IT SPEAKS WHEN IT STOPS BEING TRUE.
   *
   * When this goes red, somebody has made a report's body reachable from a copy. That is the day
   * the comparison objection 11 asked for becomes writable, and the person who made it possible is
   * the person to write it: take the count below out, and assert instead that every one of the
   * report's diagrams is in the copy character for character.
   */
  it('carries none of the diagrams, at any rung, because a copy never carries a body', async () => {
    for (const rung of RUNGS) {
      const copy = await copyAt(rung)
      const carried = diagramsStored().filter((one) => copy.text.includes(one.trim()))
      expect(
        carried.length,
        `${rung}: a copy now carries ${String(carried.length)} of the report's diagrams. That is new. Write the ` +
          `comparison this file could not: every diagram in the copy, character for character.`,
      ).toBe(0)
    }
  })

  it('carries no drawing anywhere, at any rung', async () => {
    for (const rung of RUNGS) {
      const copy = await copyAt(rung)
      expect(copy.text, `${rung} carries an SVG`).not.toContain('<svg')
      expect(copy.text, `${rung} carries the diagram box`).not.toContain('sb-diagram')
    }
  })

  it('carries what it does carry of the writing unchanged', async () => {
    // The parts of the report a copy really does hold: its title and its summary. If a copy ever
    // reworded either of them, the diagram's text would not be safe in one either.
    const summary = report.summary
    expect(summary.length, 'the report has a summary to compare').toBeGreaterThan(40)
    for (const rung of RUNGS) {
      const copy = await copyAt(rung)
      expect(copy.text, `${rung} changed the title`).toContain(report.title)
    }
    const digest = await copyAt('digest')
    expect(digest.text, 'the longest rung does not carry the summary word for word').toContain(summary)
  })

  /**
   * WHEREVER A DIAGRAM'S CHARACTERS DO REACH A COPY, THEY REACH IT UNCHANGED.
   *
   * Vacuous today and deliberately kept: it is written so that the day a body reaches a copy, a
   * copy that reflows or re-indents a fence fails here rather than being noticed by a reader.
   */
  it('never half-carries a diagram: any fence line in a copy belongs to a whole stored diagram', async () => {
    for (const rung of RUNGS) {
      const copy = await copyAt(rung)
      const linesOfDiagrams = new Set(
        diagramsStored().flatMap((one) => one.split('\n').map((line) => line.trim())).filter((line) => line !== ''),
      )
      const inTheCopy = copy.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => linesOfDiagrams.has(line) && line.length > 12)
      for (const line of inTheCopy) {
        const whole = diagramsStored().find((one) => copy.text.includes(one.trim()))
        expect(
          whole,
          `${rung}: the line "${line}" of one of the diagrams is in the copy, but no whole diagram is`,
        ).toBeDefined()
      }
    }
  })
})
