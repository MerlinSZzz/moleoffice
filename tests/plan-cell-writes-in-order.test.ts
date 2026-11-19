// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPING FAST IN THE PLAN TABLE MUST NOT LOSE A VALUE, AND IT DID.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS FILE IS BUILT FROM
 * ---------------------------------------------------------------------------------------
 *
 * A tester made six cell edits across three rows of one plan inside 134 milliseconds. Both of the
 * sizes a person can count with — "2h" and "6h" — were gone afterwards. The same edits 400
 * milliseconds apart lost nothing. Another tester lost a note that had been on screen for about a
 * second and a half. Nothing failed, nothing was refused, and the rows came back short.
 *
 * WHY. Every cell built the WHOLE new line out of the characters its own row was drawn with, and a
 * row is drawn once and then sits there until the table reads the plan back. Write a size, and
 * before that read lands write a note in the next column: the second write is built on the line as
 * it was before the first one landed, it replaces the whole line, and the size is gone. Four hundred
 * milliseconds is enough for the read to land and the row to be drawn again, which is the whole of
 * why the slow run kept everything. The speed was never the cause; the stale copy was.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE LINE ABOVE THE PLAN SAID "Stored." WHILE IT WAS HAPPENING
 * ---------------------------------------------------------------------------------------
 *
 * Two testers watched the header report success over text that was unsaved and about to be lost.
 * That line answers for the plan, and it could see only the writing box and the name — so a person
 * typing into a cell of the table was typing into the same plan and into the one place the line
 * could not see.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS HOLD DOWN
 * ---------------------------------------------------------------------------------------
 *
 *   1. Six edits across three rows with NOTHING between them keep all six values. The gap is zero,
 *      not a comfortable interval — the defect was invisible at 400ms.
 *   2. A note and a size written into one line with no gap both survive, in either order. The note
 *      goes through the server's own note writer and the size rewrites the characters, so this is
 *      the one pair that could still collide through two different doors.
 *   3. The plan is read back ONCE for a burst, not once per write, so the reads cannot land in the
 *      wrong order and draw an older plan than the one that is stored.
 *   4. A cell never writes from a version of the line this page has not seen. If an agent or the
 *      writing box changed the line, the row on screen is newer news than anything the table is
 *      carrying, and that is what the write is built on.
 *   5. The line above the plan says "Not stored yet." while a cell holds characters nobody has
 *      stored, and "Storing…" while a cell write is on its way.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM: `fetch` is pointed at a real Fastify app
 * through `app.inject`, as tests/plan-writing-split-loss.test.ts does it. Every write below really
 * lands in a database and is read back out of it.
 *
 * NOTHING HERE PRESSES A BUTTON. `storeOneLine` is the whole of what one cell's press does — the
 * cells hand it the line they were drawn with and a function that builds the new one — so these
 * tests call exactly what the press calls. The header is a rendered component reading a real
 * `usePlanWriting` state.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { ItemActs, PlanItem } from '../src/web/components/plans/planitems.tsx'
import type { PlanWritingState } from '../src/web/pages/plans/PlanWriting.tsx'

type WebApi = typeof import('../src/web/api.ts')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planItems: PlanItemsModule
let writing: WritingModule

let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** Three bullets, so three rows of the table. */
const OPENED = ['- Build the controller', '- Measure the offset', '- Write the review'].join('\n')

/** How many times the whole plan has been read, so "one read for a burst" can be counted. */
let reads = 0
let lastReadVersion = ''

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
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const method = init.method ?? 'GET'
    const url = String(input)
    if (method === 'GET' && url.endsWith('/blocks')) reads += 1
    const res = await app.inject({
      method: method as 'GET',
      url,
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
  planItems = await import('../src/web/components/plans/planitems.tsx')
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
})

afterAll(async () => {
  await app.close()
  db.close()
})

beforeEach(async () => {
  const written = await webApi.api.newPlan(`Plan ${Math.random()}`, OPENED)
  planId = written.plan.id
  reads = 0
})

/**
 * THE TABLE AS IT IS DRAWN ONCE, which is the whole point.
 *
 * Every row below is built from ONE read of the plan and the items are then held, exactly as a
 * drawn table holds them. Nothing here reads the plan again between writes, because a browser does
 * not either until a read lands and React draws the rows a second time.
 */
async function drawnOnce(): Promise<PlanItem[]> {
  const reply = await webApi.api.planBlocks(planId)
  lastReadVersion = reply.version
  return [...planItems.planItemsOf(reply.lines).items]
}

/** What the table hands every cell. `reload` is counted, and it never rejects. */
function actsFor(): ItemActs {
  return {
    planId,
    reload: async () => {
      const reply = await webApi.api.planBlocks(planId)
      lastReadVersion = reply.version
    },
    behind: false,
    workList: null,
    today: null,
    // THE VERSION A PAGE THAT HAS JUST READ THE PLAN HOLDS. The first write of a burst is built on it and the rest on
    // the version each write hands back, which is what these tests hold the order of.
    versionToWriteOn: async () => ({ ok: true, version: lastReadVersion }),
  }
}

/** The stored line of one item, read back out of the database. */
async function storedLines(): Promise<string[]> {
  const reply = await webApi.api.planBlocks(planId)
  return reply.lines.map((entry) => entry.line.text)
}

/**
 * Long enough for the read that follows the last write of a burst to have landed.
 *
 * The writes themselves are awaited; this is only about the ONE read `storeOneLine` makes when the
 * queue drains, which nothing hands back a promise for.
 */
function afterTheReadBack(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

/** One cell writing a planning value, exactly as `ItemPlanned` does it. */
function writeValue(item: PlanItem, which: 'size' | 'time' | 'project', value: string): Promise<unknown> {
  return planItems.storeOneLine(actsFor(), item.entry.line.id, item.entry.line.text, (base) => ({
    text: planItems.lineWithPlanningValue(base, which, value),
  }))
}

/** One cell writing the writer's own note, exactly as `ItemNote` does it: through the server. */
function writeNote(item: PlanItem, value: string): Promise<unknown> {
  return planItems.storeOneLine(actsFor(), item.entry.line.id, item.entry.line.text, () => ({
    remark: value,
  }))
}

// ============================================================ the 0ms case

describe('six cell edits across three rows with no gap at all', () => {
  /**
   * THE REPORTED CASE, AT ZERO MILLISECONDS.
   *
   * Six edits are started in one turn with nothing awaited between them, which is faster than the
   * 134ms that lost two sizes. Every one of the six values has to be in the plan afterwards.
   *
   * THE THREE ROWS ARE DELIBERATELY NOT ALIKE, because the two ways a value is written into a line
   * fail differently. A planning value rewrites the whole line from the copy the row was drawn with;
   * a note is written by the server into the line it holds. So a row that gets a value SECOND loses
   * whatever was written first, and a row that gets a note second does not — and a test built only
   * of the second shape passes with the defect in place. Measured: it did.
   */
  it('keeps all six values', async () => {
    const rows = await drawnOnce()
    expect(rows).toHaveLength(3)

    const owed = [
      writeValue(rows[0]!, 'size', '2h'),
      writeValue(rows[0]!, 'time', 'next week'),
      writeValue(rows[1]!, 'size', '6h'),
      writeNote(rows[1]!, 'after the demo'),
      writeNote(rows[2]!, 'next month'),
      writeValue(rows[2]!, 'size', 'maybe half a day'),
    ]
    await Promise.all(owed)
    await afterTheReadBack()

    const lines = await storedLines()
    const whole = lines.join('\n')
    // The two that entered arithmetic and died, and the four beside them.
    expect(whole).toContain('{size: 2h}')
    expect(whole).toContain('{size: 6h}')
    expect(whole).toContain('{size: maybe half a day}')
    expect(whole).toContain('{time: next week}')
    expect(whole).toContain('{note: after the demo}')
    expect(whole).toContain('{note: next month}')
    // AND THE WORDS OF EVERY LINE ARE STILL THERE. A write built on a stale copy takes the words
    // with it as readily as it takes a value.
    expect(whole).toContain('Build the controller')
    expect(whole).toContain('Measure the offset')
    expect(whole).toContain('Write the review')
  })

  /**
   * THE SAME BURST WITH THE SIZE LAST, because the order the values are written in must not decide
   * which of them survives. The tester's third row kept its size and its first two did not.
   */
  it('keeps them when the size is written after the note', async () => {
    const rows = await drawnOnce()
    const owed = [
      writeNote(rows[0]!, 'ask Sam first'),
      writeValue(rows[0]!, 'size', '2h'),
      writeNote(rows[1]!, 'after the demo'),
      writeValue(rows[1]!, 'size', '6h'),
    ]
    await Promise.all(owed)
    await afterTheReadBack()

    const whole = (await storedLines()).join('\n')
    expect(whole).toContain('{size: 2h}')
    expect(whole).toContain('{size: 6h}')
    expect(whole).toContain('{note: ask Sam first}')
    expect(whole).toContain('{note: after the demo}')
  })

  /**
   * FOUR VALUES INTO ONE LINE WITH NO GAP. One row, four columns, one after another as fast as a
   * person can leave a cell. Every one of them is a whole rewrite of the same line.
   */
  it('keeps four values written into one line', async () => {
    const rows = await drawnOnce()
    const one = rows[0]!
    await Promise.all([
      writeValue(one, 'size', '3h'),
      writeValue(one, 'time', 'next week'),
      writeValue(one, 'project', 'yumi'),
      writeNote(one, 'ask Sam first'),
    ])
    await afterTheReadBack()

    const whole = (await storedLines()).join('\n')
    expect(whole).toContain('{size: 3h}')
    expect(whole).toContain('{time: next week}')
    expect(whole).toContain('{project: yumi}')
    expect(whole).toContain('{note: ask Sam first}')
    expect(whole).toContain('Build the controller')
  })

  /**
   * TWO WRITES INTO THE SAME COLUMN OF ONE LINE, no gap. The second is the one that counts and the
   * first must not come back — this is the case where carrying the newest characters forward could
   * go wrong in the other direction and resurrect a value the person replaced.
   */
  it('leaves one answer when the same column is written twice', async () => {
    const rows = await drawnOnce()
    const one = rows[0]!
    await Promise.all([writeValue(one, 'size', '2h'), writeValue(one, 'size', '9h')])
    await afterTheReadBack()

    const whole = (await storedLines()).join('\n')
    expect(whole).toContain('{size: 9h}')
    expect(whole).not.toContain('{size: 2h}')
  })
})

// ============================================================ one read for a burst

describe('the plan is read back once for a burst', () => {
  /**
   * SIX WRITES USED TO MEAN SIX READS RACING EACH OTHER HOME, and a read that lands out of order
   * draws an older plan than the one that is stored — then hands those older words to the writing
   * box beside it as though they were what the server holds.
   */
  it('reads once, not once per write', async () => {
    const rows = await drawnOnce()
    reads = 0
    await Promise.all([
      writeValue(rows[0]!, 'size', '2h'),
      writeValue(rows[0]!, 'time', 'next week'),
      writeValue(rows[1]!, 'size', '6h'),
      writeNote(rows[1]!, 'after the demo'),
      writeNote(rows[2]!, 'next month'),
      writeValue(rows[2]!, 'size', 'maybe half a day'),
    ])
    await afterTheReadBack()
    expect(reads).toBe(1)
  })
})

// ============================================================ somebody else wrote

describe('a version of the line this page has not seen', () => {
  /**
   * THE ROW ON SCREEN WINS WHEN IT SHOWS SOMETHING THIS PAGE HAS NEVER WRITTEN.
   *
   * Carrying the newest characters forward is only safe while they are this page's own. An agent,
   * another tab or the writing box can change a line, and then the row the cell was drawn with is
   * newer news than anything the table is carrying. Guessing the other way would make this fix the
   * defect it removes.
   */
  it('is built on the row it was drawn with, not on what this page was carrying', async () => {
    const first = await drawnOnce()
    await writeValue(first[0]!, 'size', '2h')
    await afterTheReadBack()

    // Somebody else rewrites the line's words. The table reads the plan and draws the row again.
    const id = first[0]!.entry.line.id
    await webApi.api.saveLine(planId, id, { text: '- Build the controller and the harness {size: 2h}' }, null)
    const drawnAgain = await drawnOnce()
    const row = drawnAgain.find((one) => one.entry.line.id === id)
    expect(row).toBeDefined()

    await writeValue(row!, 'time', 'next week')
    await afterTheReadBack()

    const whole = (await storedLines()).join('\n')
    expect(whole).toContain('Build the controller and the harness')
    expect(whole).toContain('{size: 2h}')
    expect(whole).toContain('{time: next week}')
  })
})

// ============================================================ what the header says

/**
 * ONE PAGE OPENED ON ONE READ OF THE PLAN, with the writing state it really uses.
 *
 * The same arrangement tests/plan-writing-split-loss.test.ts uses: the component is rendered once
 * and hands its state out. `useSyncExternalStore` reads its server snapshot here, which is the
 * same function the browser reads on every change, so the word below is the word on the screen.
 */
let handed: PlanWritingState | null = null
function Probe({ reply }: { reply: PlanBlocksReply }) {
  handed = writing.usePlanWriting(reply.plan.id, reply.lines, reply.plan.title, reply.version)
  return null
}

function openPage(reply: PlanBlocksReply): PlanWritingState {
  handed = null
  renderToStaticMarkup(h(Probe, { reply }))
  if (handed === null) throw new Error('the writing state was never handed out')
  return handed
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(state: PlanWritingState): string {
  return renderToStaticMarkup(h(writing.PlanSaveBar, { state }))
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('the line above the plan while a cell is being typed in', () => {
  it('says the plan is stored when nothing is typed anywhere', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const said = words(openPage(reply))
    expect(said).toContain('Stored.')
    expect(said).not.toContain('Not stored yet.')
  })

  /**
   * THE DEFECT, IN THE SMALLEST SPACE THERE IS. A cell holding characters that are not what is
   * stored is the plainest case of the plan not being stored, and the header used to answer for
   * the writing box alone and report success over it.
   */
  it('does not say stored while a cell holds characters nobody has stored', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const line = reply.lines[0]!.line.id
    planItems.markTyped(planId, `${line}:size`, true)
    try {
      const said = words(openPage(reply))
      expect(said).toContain('Not stored yet.')
      expect(said).not.toContain('Stored.')
    } finally {
      planItems.markTyped(planId, `${line}:size`, false)
    }
  })

  it('says the plan is stored again once the cell is emptied of unstored characters', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const line = reply.lines[0]!.line.id
    planItems.markTyped(planId, `${line}:size`, true)
    planItems.markTyped(planId, `${line}:size`, false)
    const said = words(openPage(reply))
    expect(said).toContain('Stored.')
    expect(said).not.toContain('Not stored yet.')
  })

  /** And while the cell's write is actually on its way, which is a different word. */
  it('says it is storing while a cell write is on its way', async () => {
    const rows = await drawnOnce()
    const reply = await webApi.api.planBlocks(planId)
    const owed = writeValue(rows[0]!, 'size', '2h')
    const said = words(openPage(reply))
    expect(said).toContain('Storing…')
    expect(said).not.toContain('Stored.')
    await owed
    await afterTheReadBack()
  })
})
