// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TICK IN THE DOCUMENT AND A STATE ON THE RECORD ARE TWO FACTS, AND THE ROW SAYS WHEN THEY
 * DISAGREE.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS FOR, MEASURED BY TWO TESTERS ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Focus the tick box on a tracked plan line and press Space. The tick goes on. The state mark on the
 * SAME ROW still reads "to do", and nothing anywhere says why. One tester photographed the blue tick
 * and the "to do" mark in one frame. Underneath, the tick had written `- [x]` into the plan's text
 * and touched no record at all.
 *
 * The answer taken is that the tick stays the document's, the state stays the record's, and the row
 * SAYS when the two disagree, with the press that settles it. `TickAgainstState` in
 * src/web/components/plans/planitems.tsx carries the reasoning and what the other answer would have
 * cost. This file is what goes red if the row goes quiet again.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CAN SILENTLY STOP BEING TRUE HERE
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE ROW GOES QUIET AGAIN and the tick and the state disagree in silence, which is the
 *      measured defect exactly.
 *   2. IT SPEAKS WHERE THERE IS NO DISAGREEMENT. A plain bullet is not a mark in anybody's document
 *      — ticking one WRITES the box — so an unticked bullet beside finished work is not a
 *      contradiction and a sentence about it is noise on a dense table.
 *   3. THE FINISHING WORD STOPS BEING THE KIND'S. A task finishes at `done`, an obligation at
 *      `fulfilled` or `cancelled`, and a direction has no state at all. A press writing `done` on
 *      all three writes a value the server refuses on two of them.
 *   4. THE TICK STARTS WRITING THE RECORD. That is the answer this pass deliberately did not take,
 *      and nothing but this file would notice it being taken later.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM: the component is rendered to static markup
 * and `fetch` is pointed at a real Fastify app through `app.inject`, exactly as tests/plan-table.ts
 * does it. Every state below is a state the server really stored.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule
let planItems: PlanItemsModule

let planId: string
/** The record each line below was filed as, by the words of the line. */
const filed = new Map<string, string>()

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * EIGHT LINES, ONE PER CASE, so that one render answers every question at once.
 *
 * The four cases that must speak and the four that must stay quiet are in one plan on purpose: a
 * test that rendered only the speaking rows would pass with a component that speaks on every row.
 */
const TICKED_AND_UNFINISHED = 'ticked task nobody has started'
const UNTICKED_AND_FINISHED = 'unticked task somebody finished'
const TICKED_AND_FINISHED = 'ticked task somebody finished'
const UNTICKED_AND_UNFINISHED = 'unticked task nobody has started'
const TICKED_AND_UNTRACKED = 'ticked and tracked as nothing'
const A_BULLET_THAT_IS_FINISHED = 'a bullet with no box, finished'
const TICKED_OBLIGATION = 'ticked obligation still owed'
const TICKED_DIRECTION = 'ticked direction taken nowhere'

const BODY = [
  '# The plan',
  `- [x] ${TICKED_AND_UNFINISHED}`,
  `- [ ] ${UNTICKED_AND_FINISHED}`,
  `- [x] ${TICKED_AND_FINISHED}`,
  `- [ ] ${UNTICKED_AND_UNFINISHED}`,
  `- [x] ${TICKED_AND_UNTRACKED}`,
  `- ${A_BULLET_THAT_IS_FINISHED}`,
  `- [x] ${TICKED_OBLIGATION}`,
  `- [x] ${TICKED_DIRECTION}`,
].join('\n')

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  db = await freshDb()

  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { workRoutes } = await import('../src/server/api/work.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
    }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_HUMAN })
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')

  const written = await webApi.api.newPlan('Ticks and states', BODY)
  planId = written.plan.id

  /**
   * File one line as work, and remember the record so a state can be written on it later.
   *
   * THE WHOLE LINE IS MATCHED, MARKER AND ALL. Matching on the words alone picked the wrong line:
   * "unticked task somebody finished" ends with "ticked task somebody finished", so a suffix match
   * filed one line twice and the server refused the second.
   */
  const track = async (words: string, kind: 'task' | 'obligation' | 'direction') => {
    const whole = BODY.split('\n').find((one) => one.replace(/^[-\s]*(\[[ x]\]\s*)?/, '') === words)
    const line = written.lines.find((one) => one.text === whole)
    if (line === undefined) throw new Error(`no line of the plan reads "${words}"`)
    const reply = await webApi.api.fileLineAsWork(planId, line.id, {
      ...planItems.whatFilingSends(kind, 'default'),
    })
    filed.set(words, reply.recordId)
  }

  await track(TICKED_AND_UNFINISHED, 'task')
  await track(UNTICKED_AND_FINISHED, 'task')
  await track(TICKED_AND_FINISHED, 'task')
  await track(UNTICKED_AND_UNFINISHED, 'task')
  await track(A_BULLET_THAT_IS_FINISHED, 'task')
  await track(TICKED_OBLIGATION, 'obligation')
  await track(TICKED_DIRECTION, 'direction')

  // THE THREE THAT ARE FINISHED ARE FINISHED ON THE RECORD, through the ordinary record route. The
  // rest keep the state filing wrote, which is `todo` for a task and `open` for an obligation.
  for (const words of [UNTICKED_AND_FINISHED, TICKED_AND_FINISHED, A_BULLET_THAT_IS_FINISHED]) {
    await webApi.api.updateRecord(filed.get(words) as string, { dataPatch: { state: 'done' } })
  }
})

afterAll(async () => {
  await app.close()
  db.close()
})

async function read(): Promise<PlanBlocksReply> {
  return webApi.api.planBlocks(planId)
}

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: React.ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The whole table, drawn the way the plan page draws it. */
async function table(): Promise<React.ReactElement> {
  const reply = await read()
  return h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} })
}

/** How many rows are saying that their tick and their state disagree. */
function rowsSayingTheyDisagree(markup: string): number {
  return (markup.match(/class="pi-apart"/g) ?? []).length
}

// ============================================================================ the measured defect

describe('a tick and a state that disagree say so on the row', () => {
  /**
   * THE PHOTOGRAPH, TURNED INTO AN ASSERTION. A ticked line and a record reading "to do" was the
   * whole defect, and the row now carries both facts and the press that settles them.
   */
  it('says the work is not finished on a ticked line, and offers the word that finishes it', async () => {
    const said = words(await table())

    expect(said).toContain('You ticked this line. Where the work stands is still “to do”.')
    // The finishing word is written as a press, and it is the word a task actually ends at.
    expect(said).toContain('Say it is done')
  })

  /** AND THE OTHER DIRECTION, which is the half a tick that wrote the state could never have fixed. */
  it('says the line is not ticked when the record says the work is finished', async () => {
    const said = words(await table())

    expect(said).toContain('Where the work stands is “done”. This line is not ticked.')
  })

  /**
   * THE FINISHING WORD IS THE KIND'S, read from the declaration `POST /api/records` validates
   * against. An obligation ends two ways and Mole Office picks neither: both are presses.
   */
  it('offers every word the kind ends at, and no word it does not', async () => {
    const said = words(await table())

    expect(said).toContain('Say it is fulfilled')
    expect(said).toContain('Say it is cancelled')
    // Three presses on the whole table: one for the task, two for the obligation. The direction
    // gets none, and neither does any row whose tick and state agree.
    expect(said.match(/Say it is /g) ?? []).toHaveLength(3)
  })

  /** A KIND WITH NO WORD FOR FINISHED GETS NO PRESS AND A SENTENCE. A direction records how far it
   * has been taken, on a different ladder, so there is nothing here to write. */
  it('says so where the kind does not record being finished at all', async () => {
    const said = words(await table())

    expect(said).toContain('A direction does not record being finished, so the tick is all there is.')
  })

  /**
   * AND IT IS SILENT ON EVERY ROW WHERE THE TWO AGREE, INCLUDING THE BULLET.
   *
   * A plain bullet reads as "not ticked" only because ticking one writes a box into the line. That
   * is an offer, not a mark in the document, so a finished bullet is not a contradiction. Four of
   * the eight rows here must say nothing at all.
   */
  it('says nothing on a row where the two agree, on an untracked line, or on a plain bullet', async () => {
    const markup = body(await table())

    expect(rowsSayingTheyDisagree(markup)).toBe(4)

    // The eight rows are all really on the screen, so the four silences are silences and not four
    // rows that failed to draw.
    const said = words(await table())
    for (const line of [
      TICKED_AND_UNFINISHED,
      UNTICKED_AND_FINISHED,
      TICKED_AND_FINISHED,
      UNTICKED_AND_UNFINISHED,
      TICKED_AND_UNTRACKED,
      A_BULLET_THAT_IS_FINISHED,
      TICKED_OBLIGATION,
      TICKED_DIRECTION,
    ]) {
      expect(said).toContain(line)
    }
  })
})

// ============================================================================ what a tick writes

describe('a tick writes the document and the state stays the record own answer', () => {
  /**
   * THE DECISION, PINNED. Ticking a line writes `- [x]` into the plan's text and writes no record,
   * and the row then says the two disagree. If a later pass makes the tick write the state instead,
   * the second half of this goes red and whoever does it has to come and read the reasoning.
   *
   * The write below is `api.saveLine`, which is the call the tick box itself makes through
   * `storeOneLine`. What it cannot press is the checkbox; what it proves is what that press stores.
   */
  it('puts the box in the text, leaves the record alone, and the row then says the two differ', async () => {
    const before = await read()
    const items = planItems.planItemsOf(before.lines).items
    const row = items.find((one) => one.text === UNTICKED_AND_UNFINISHED)
    if (row === undefined) throw new Error('the unticked, unfinished row is not on the table')
    expect(row.ticked, 'the row this is about starts unticked').toBe(false)
    expect(row.entry.work?.state, 'and its record starts at the state filing wrote').toBe('todo')
    expect(rowsSayingTheyDisagree(body(await table())), 'and nothing is said about it yet').toBe(4)

    await webApi.api.saveLine(planId, row.entry.line.id, { text: planItems.lineWithTick(row, true) }, null)

    // THE DOCUMENT HAS THE TICK.
    const after = await read()
    const now = planItems.planItemsOf(after.lines).items.find((one) => one.text === UNTICKED_AND_UNFINISHED)
    expect(now?.entry.line.text).toBe(`- [x] ${UNTICKED_AND_UNFINISHED}`)
    // THE RECORD DOES NOT. Nothing about the work was claimed by a keystroke in a document.
    expect(now?.entry.work?.state).toBe('todo')
    // AND THE ROW SAYS SO, which is the whole fix: five rows now, not four.
    expect(rowsSayingTheyDisagree(body(await table()))).toBe(5)
  })

  /**
   * AND THE SENTENCE FOLLOWS THE RECORD. Writing the finishing word — the same call the press makes,
   * `api.setWorkState` — takes the sentence off the row.
   */
  it('goes quiet on the row once the work is really finished', async () => {
    const recordId = filed.get(TICKED_AND_UNFINISHED) as string
    // THE CONTROL. Five rows disagree at this point and two of them are ticked tasks nobody has
    // finished, because the test above ticked one more.
    expect(rowsSayingTheyDisagree(body(await table())), 'the control, before the state is written').toBe(5)
    expect(words(await table()).match(/Say it is done/g) ?? []).toHaveLength(2)

    await webApi.api.setWorkState(recordId, 'done', 'default')

    // One row fewer, and one press fewer, which is the row this write was about and no other.
    expect(rowsSayingTheyDisagree(body(await table()))).toBe(4)
    expect(words(await table()).match(/Say it is done/g) ?? []).toHaveLength(1)
  })

  /**
   * A RECORD NOBODY HAS WRITTEN A STATE FOR IS NOT A RECORD SAYING "not finished". Absence beats a
   * guess, and the sentence says which of the two this is.
   */
  it('says nobody has written where the work stands, rather than inventing a state', async () => {
    const recordId = filed.get(TICKED_OBLIGATION) as string
    await webApi.api.updateRecord(recordId, { dataPatch: { state: null } })

    const said = words(await table())
    expect(said).toContain('You ticked this line. Nobody has written where the work stands.')
    // And the presses are still the obligation's own two words, because the kind has not changed.
    expect(said).toContain('Say it is fulfilled')
    expect(said).toContain('Say it is cancelled')
  })
})
