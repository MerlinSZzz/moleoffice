// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEVEN WITHDRAWN DESIGNS OF 11 SEPTEMBER GO ON THE SAME SHELF. CRITERION S3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * `design/PLAN-2026-09-11.md` line 18 lists seven things withdrawn on 11 September 2026. Each one
 * is a shelved direction holding a short note saying it existed and why it did not go on, so a later
 * reader finds it on the shelf and not in a code comment. This file writes all seven through the
 * real write door, on its own scratch database, and reads them back off the Shelved page by name.
 *
 * NOTHING HERE IS FILED ON THE OWNER'S LIVE SERVER. The three decisions those bodies link to are inserted
 * into the scratch database with made-up ids, because a link needs both ends to exist; the seven
 * directions are created through `createRecord` and linked through `createLink`, which are the same
 * two doors a person and an agent use.
 *
 * THE MAPPING IS NOT INVENTED HERE. Each body quotes the decision that withdrew it, and the test
 * carries the decision's own `because` verbatim. Where a decision does not name one of the seven —
 * presence beside a step, and the escalation ladder — the body's note says so, and the report says
 * so as well. A reason nobody recorded is not a reason.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { RecordListItem } from '../src/web/api.ts'
import { shelvedNewestFirst, TheShelf } from '../src/web/pages/ShelvedPage.tsx'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const PROJECT = 'default'

/** The owner, filing on the owner's own behalf in this scratch world. */
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const

/**
 * The three decisions, with the words each holds. These are the live records' own values,
 * except the ids, which are made up.
 */
const DECISIONS = {
  leases: {
    id: 'Madeup200004',
    title: 'The leases design is withdrawn and archived with why',
    because:
      'The owner’s words in the terminal, 11 September 2026: 3. 同意。这个可以分为过度设计，没有遇到确实需要租约的情况下我们不应该直接硬上这个设计（可以封存这种设计，简答描述下存在过这种设计，什么原因没有继续下去即可）',
    optionTaken: 'withdraw the leases; keep the process-in-directory check; archive the design with why',
  },
  budgets: {
    id: 'Madeup200005',
    title: 'The starting budget table is withdrawn',
    because: 'The owner’s words in the terminal, 11 September 2026: 10. 好的撤掉吧. The table hung on a cycle nobody started and steps nobody built.',
    optionTaken: 'withdrawn; re-decided when steps exist',
  },
  overDesign: {
    id: 'Madeup200006',
    title: 'The grant contract, the budget ladder and the step log are withdrawn; the over-design is an incident',
    because:
      'The owner’s words in the terminal, 11 September 2026: 4. 同意，先撤掉吧，office flow这部分的过度设计记录为事故，我自己需要担一部分责 —— 事故这个部分的优先级可以往前排一排',
    optionTaken: 'withdraw the four; record the incident; incidents move up',
  },
} as const

/** The depth that is true of a design that was written and then withdrawn: read, and nothing run. */
const WITHDRAWN_DEPTH = 'read'
const WITHDRAWN_DEPTH_REASON = 'The design was written and read, then withdrawn before anything was built or measured.'

/**
 * The seven, exactly as they would be filed. `decision` names which of the three decisions withdrew
 * it; `covered` says whether that decision names this design in its own words.
 */
const SEVEN = [
  {
    key: 'gates',
    title: 'The flow records with hard and soft gates',
    summary:
      'A withdrawn design: the flow records with hard and soft gates (F3, F4), where a step in a flow declared whether a gate blocked all the way or only to a named stage. Withdrawn by decision Madeup200006, which names "the flow records as gates".',
    decision: 'overDesign',
    restartWhen: 'nothing named',
  },
  {
    key: 'budgets',
    title: 'The step budgets and the budget script',
    summary:
      'A withdrawn design: the step budgets and the budget script (F5). Withdrawn by decision Madeup200006 as "the budget ladder"; that decision does not use the words "step budgets" or "budget script".',
    decision: 'overDesign',
    restartWhen: 'nothing named',
  },
  {
    key: 'presence',
    title: 'Presence drawn beside a flow step',
    summary:
      'A withdrawn design: presence drawn beside a flow step (F6). It is moot without steps. Decision Madeup200006 covers the over-design round it belonged to and does not name it.',
    decision: 'overDesign',
    restartWhen: 'nothing named',
  },
  {
    key: 'steplog',
    title: 'The step log',
    summary: 'A withdrawn design: the step log (F8). Withdrawn by decision Madeup200006, which names "the step log".',
    decision: 'overDesign',
    restartWhen: 'nothing named',
  },
  {
    key: 'budgettable',
    title: 'The starting budget table',
    summary:
      'A withdrawn design: the starting budget table. Withdrawn by decision Madeup200005, because the table hung on a cycle nobody started and steps nobody built.',
    decision: 'budgets',
    restartWhen: 're-decided when steps exist',
  },
  {
    key: 'leases',
    title: 'The leases of the check',
    summary:
      'A withdrawn design: the leases of the check. Withdrawn by decision Madeup200004 as over-design met before any real need; the one check that did real work, a directory with a live process in it is not removed, stays.',
    decision: 'leases',
    restartWhen: 'nothing named',
  },
  {
    key: 'grant',
    title: 'The grant contract and the escalation ladder',
    summary:
      'A withdrawn design: the grant contract and the escalation ladder. Withdrawn by decision Madeup200006, whose words cover "the authorization contract"; that decision does not name the escalation ladder itself.',
    decision: 'overDesign',
    restartWhen: 'nothing named',
  },
] as const

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
  // THE THREE DECISIONS, INSERTED WITH MADE-UP IDS. A link needs both ends to exist, and the seven
  // bodies must link to the decisions they came from. Written straight into the table because a
  // decision may only be created by the person through the write door, and these are not this
  // test's decisions to make — they are the owner's, already made.
  const at = '2026-09-11 14:47:22'
  const insert = t.client.sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const decision of [DECISIONS.leases, DECISIONS.budgets, DECISIONS.overDesign]) {
    insert.run(
      decision.id,
      PROJECT,
      THE_TEST_OFFICES_OWNER.id,
      at,
      at,
      'decision',
      decision.title,
      null,
      JSON.stringify({
        decided_on: '2026-09-11',
        because: decision.because,
        option_taken: decision.optionTaken,
        decided_by: 'the owner',
        authority: 'the owner said so',
        authority_reference: 'UA3zsaFvmQ6m',
        recorded_by: `agent ${THE_TEST_OFFICES_SECRETARY.handle}`,
      }),
      'authored',
    )
  }
})

afterEach(() => {
  t.close()
})

/** File one of the seven through the real door and link it to its decision. */
function fileOne(entry: (typeof SEVEN)[number]): string {
  const made = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'direction',
    title: entry.title,
    summary: entry.summary,
    data: {
      depth: WITHDRAWN_DEPTH,
      depth_reason: WITHDRAWN_DEPTH_REASON,
      shelved: {
        since: '2026-09-11',
        because: DECISIONS[entry.decision].because,
        restart_when: entry.restartWhen,
      },
    },
    actor: PERSON,
  })
  t.api.createLink({ fromId: made.id, toId: DECISIONS[entry.decision].id, type: 'about', actor: PERSON })
  return made.id
}

describe('the seven withdrawn designs of 11 September are on the shelf', () => {
  it('writes all seven through the door, links each to its decision, and carries the leases by name', () => {
    const ids = SEVEN.map(fileOne)
    expect(ids).toHaveLength(7)

    // EVERY LIVE RECORD, the way the page fetches it, so the decisions the directions link to are
    // there to name beside them. `shelvedNewestFirst` is what narrows to the shelf.
    const records: RecordListItem[] = t.api
      .listRecords({ workspaceId: PROJECT })
      .map((record) => ({ ...record, incompleteCount: t.api.incompletenessOf(record).length }))
    const links = t.api.allGatedLinks(PROJECT)
    const shelved = shelvedNewestFirst(records)
    expect(shelved).toHaveLength(7)
    for (const entry of SEVEN) {
      expect(shelved.some((one) => one.record.title === entry.title), `${entry.title} is not on the shelf`).toBe(true)
    }

    // EACH ONE CARRIES ITS DECISION’S OWN WORDS, AND ITS OWN RESTART CONDITION.
    for (const entry of SEVEN) {
      const held = shelved.find((one) => one.record.title === entry.title)
      expect(held?.shelf.because, `${entry.title} lost its reason`).toBe(DECISIONS[entry.decision].because)
      expect(held?.shelf.restartWhen, `${entry.title} lost its restart condition`).toBe(entry.restartWhen)
      expect(held?.shelf.since).toBe('2026-09-11')
    }

    // EACH ONE IS LINKED TO ITS DECISION. Criterion change, wave 13j round 11: this was read off the
    // Shelved page's "Travels with" list, which the family lists' design takes off the row (report
    // n9Mjk3c_sJRu block b-17); the direction's own page draws its links. So the link is read from
    // the links themselves.
    for (const [i, entry] of SEVEN.entries()) {
      const decisionId = DECISIONS[entry.decision].id
      expect(
        links.some((link) => link.fromId === ids[i] && link.toId === decisionId && link.type === 'about'),
        `${entry.title} is not linked to its decision`,
      ).toBe(true)
    }

    // THE PAGE DRAWS EVERY ONE, AND THE LEASES DIRECTION IS THERE BY NAME, WITH ITS REASON.
    const markup = renderToStaticMarkup(h(TheShelf, { records }))
    for (const entry of SEVEN) {
      expect(markup, `${entry.title} is not on the page`).toContain(entry.title)
    }
    expect(markup).toContain('The leases of the check')
    expect(markup).toContain(DECISIONS.leases.because)
  })
})
