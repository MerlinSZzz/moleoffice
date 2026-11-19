// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINK A REMINDER BEFORE THE SEAL OFFERS CAN BE SENT AS WRITTEN.
 *
 * When a run has no report linked to it, two places in src/server/lib/before-the-seal-rules.ts say so and show the
 * request that links one: the reminder before the seal (`whatAnInspectorWouldMostLikelyRefuse`), and what the merge
 * queue reads of a run's report (`whatTheReportLacks`). Each showed the body as {fromId: <report>, ...}. Its keys were
 * not in quotes, so the body was not JSON, and the links door could not read it as written.
 *
 * WHAT IS CLAIMED, for each of the two places: the body after "POST /api/links" is JSON, and it names `fromId`, `toId`
 * and the type "about". The two places in brackets stay places for the writer to fill in.
 *
 * THE REQUEST THAT WRITES A RUN'S DOING LINE had the same fault. When a run has no doing line, what the merge queue
 * reads shows the change that writes one, and its body was {dataPatch: {doing: ...}}, with no key in quotes. Case 3
 * claims that the body after "PATCH /api/records/<run>" is JSON, and that it writes `doing` through `dataPatch`.
 *
 * THE RUN, ITS COMMITS AND ITS REPORTS ARE MADE UP for this file.
 *
 * MUTATIONS, each after a control run (the commit that adds this file names the logs):
 *   1. both bodies put back with their keys out of quotes: cases 1 and 2 go red;
 *   2. the doing line's body put back with its keys out of quotes: case 3 goes red.
 */
import { describe, expect, it } from 'vitest'

import {
  whatAnInspectorWouldMostLikelyRefuse,
  whatTheReportLacks,
  type TheFactsBeforeTheSeal,
} from '../src/server/lib/before-the-seal-rules.ts'

/** A made-up run with no commits and no report linked to it. */
const facts: TheFactsBeforeTheSeal = {
  runTitle: 'Made-up round',
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => false },
  reports: [],
  sameTitleElsewhere: {},
  mustRead: [1, 9],
  checkAlso: [],
}

/** The body a sentence shows after "POST /api/links ", read as JSON. */
function theLinkBody(sentence: string): unknown {
  const shown = /POST \/api\/links (\{.*\})/u.exec(sentence)
  if (shown === null) throw new Error(`The sentence shows no link request: ${sentence}`)
  return JSON.parse(shown[1]!)
}

/** The body a sentence shows after "PATCH /api/records/<run> ", read as JSON. */
function theChangeBody(sentence: string): unknown {
  const shown = /PATCH \/api\/records\/\S+ (\{.*\})/u.exec(sentence)
  if (shown === null) throw new Error(`The sentence shows no change request: ${sentence}`)
  return JSON.parse(shown[1]!)
}

describe('the link a reminder before the seal offers', () => {
  // MUTATION 1: red.
  it('1. the reminder before the seal shows a link body that is JSON', () => {
    const item = whatAnInspectorWouldMostLikelyRefuse(facts).items.find((one) => one.about === 'report')
    expect(item, 'the reminder did not say that no report is linked').toBeDefined()
    expect(theLinkBody(item!.says)).toEqual({ fromId: '<report>', toId: '<this run>', type: 'about' })
  })

  // MUTATION 1: red.
  it("2. what the merge queue reads of a run's report shows a link body that is JSON", () => {
    const lacks = whatTheReportLacks({ ...facts, doing: 'Made up.' }).lacks.filter((one) => one.includes('POST /api/links'))
    expect(lacks, 'what the report lacks does not show a link request').toHaveLength(1)
    expect(theLinkBody(lacks[0]!)).toEqual({ fromId: '<report>', toId: '<run>', type: 'about' })
  })

  // MUTATION 2: red.
  it("3. what the merge queue reads of a run with no doing line shows a change body that is JSON", () => {
    const lacks = whatTheReportLacks({ ...facts, doing: null }).lacks.filter((one) => one.includes('PATCH /api/records/'))
    expect(lacks, 'what the report lacks does not show the request that writes a doing line').toHaveLength(1)
    expect(theChangeBody(lacks[0]!)).toEqual({ dataPatch: { doing: '<what the run did>' } })
  })
})
