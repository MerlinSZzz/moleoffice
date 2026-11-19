// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CELL OF THE PLANNING TABLE SAYS BACK, AND HOW MANY ANSWERS IT GIVES TO ONE QUESTION.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DEFECTS THIS FILE IS ABOUT, BOTH MEASURED IN A BROWSER ON 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * 1. BEFORE A LINE WAS FILED, PANELX NEVER SAID WHAT IT MADE OF THE WORDS. Typing "next week" into
 *    the Time given cell of a line nobody had filed kept the words perfectly — through both views,
 *    a save and a reload — and offered no reading at all. The live reading lived inside the "Give
 *    it time" control, and that press is only drawn on a row already filed as work. So a scheduling
 *    surface answered "when" and "how much" everywhere and "what did Mole Office understand" on one side
 *    of filing only.
 *
 * 2. AFTER FILING, THE How big CELL GAVE TWO ANSWERS TO ONE QUESTION. It said "not sized" in the
 *    box that holds the record's estimate and, under it, "probably large" in the line's own words.
 *    Both are true — nobody had put hours on the record, and the line really does say that — and at
 *    a glance the second contradicted the first.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH ASSERTION BELOW WOULD HAVE CAUGHT
 * ---------------------------------------------------------------------------------------
 *
 *   an unfiled row says what was read          the whole of defect 1
 *   it says "not scheduled" in the same breath  a reading that looked like a schedule, which is the
 *                                               eighth rule broken at the layer meant to show the
 *                                               interpretation without committing it
 *   a row with no time words says nothing       the control: a reading printed unconditionally
 *                                               would pass every assertion above it
 *   no day, no reading                          a browser reading "next week" against its own clock
 *   "not sized" only where nothing else answers defect 2
 *   the words are still there either way        a fix for defect 2 that dropped the person's words
 *                                               instead of the duplicate answer
 *
 * HOW IT LOOKS LIKE THIS. The runner's environment is `node`, so there is no DOM: the components are
 * rendered to static markup and `fetch` is pointed at a real Fastify app through `app.inject`, as
 * tests/plan-table.test.ts does it. Every line drawn below was really stored and read back.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply, WorkListReply } from '../src/web/api.ts'
import { timeWordsSaid } from '../src/shared/planning.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planItems: PlanItemsModule
let planId: string
let workList: WorkListReply

/**
 * THE DAY EVERY READING BELOW IS READ AGAINST: Wednesday 19 August 2026, local time.
 *
 * It is handed in rather than taken from the clock, exactly as the browser hands in the day the
 * server reported. A test that read the machine's own date would say a different week every week it
 * ran, and "next week" would be untestable.
 *
 * Its week is 2026-W34 and the week after it is 2026-W35. Those are written out below rather than
 * computed from the reader, because computing them with the code under test proves nothing.
 */
const WEDNESDAY = new Date(2026, 7, 19)

/**
 * A plan written the way somebody plans roughly: words about when, words about how big, and one
 * line that says both halves in one sentence.
 */
const BODY = [
  '# Round six',
  '- calibrate the wrist {time: next week}',
  '- write the driver {time: 15h this week}',
  '- the vague one {time: sometime in September}',
  '- nothing about time at all',
  '- file me unsized {size: probably large}',
  '- file me sized',
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
  webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  planItems = await import('../src/web/components/plans/planitems.tsx')

  const written = await webApi.api.newPlan('Round six', BODY)
  planId = written.plan.id

  // TWO LINES ARE FILED AS WORK, because the How big cell only holds a record's estimate once there
  // is a record. One keeps words filing could not turn into hours; the other is sized on the record.
  const unsized = written.lines.find((line) => line.text.startsWith('- file me unsized'))!
  await webApi.api.fileLineAsWork(planId, unsized.id, { kind: 'task', workspaceId: 'default' })
  const sized = written.lines.find((line) => line.text === '- file me sized')!
  const filed = await webApi.api.fileLineAsWork(planId, sized.id, { kind: 'task', workspaceId: 'default' })
  await webApi.api.updateRecord(filed.recordId, { dataPatch: { effort_hours: 6 } })

  workList = await webApi.api.work()
})

afterAll(async () => {
  await app.close()
  db.close()
})

async function read(): Promise<PlanBlocksReply> {
  return webApi.api.planBlocks(planId)
}

/** The row whose words start with these, out of a real read of the stored plan. */
async function rowFor(words: string) {
  const reply = await read()
  const item = planItems.planItemsOf(reply.lines).items.find((one) => one.text.startsWith(words))
  if (item === undefined) throw new Error(`The plan read back without a row for "${words}".`)
  return item
}

/** Everything a cell needs to draw itself, with the day the browser would have handed it. */
function actsWith(today: Date | null) {
  return { planId, reload: async () => {}, behind: false, workList, today, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE }
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

/** The Time given cell of one row, drawn as the table draws it on a line nobody has filed. */
async function timeCell(rowWords: string, today: Date | null = WEDNESDAY): Promise<string> {
  const item = await rowFor(rowWords)
  return words(
    h(planItems.ItemPlanned, { item, acts: actsWith(today), which: 'time' as const, canRewrite: true }),
  )
}

/** The How big cell of one row, drawn as the table draws it. */
async function sizeCell(rowWords: string): Promise<string> {
  const item = await rowFor(rowWords)
  return body(h(planItems.ItemEstimate, { item, acts: actsWith(WEDNESDAY), canRewrite: true }))
}

// ============================================================================ the reader's sentence

describe('the sentence a cell prints about somebody time words', () => {
  /**
   * IT IS THE TWO READERS AND NOTHING ELSE. `readPeriodWords` and `readHoursWords` do the reading;
   * this puts their answers into the words the Time given column already prints on a filed row, so
   * what Mole Office understood before filing and what it shows after filing are the same characters.
   */
  it('says the period and the hours in the words this column already uses', () => {
    expect(timeWordsSaid('next week', WEDNESDAY).read).toBe('2026-W35')
    expect(timeWordsSaid('this week', WEDNESDAY).read).toBe('2026-W34')
    expect(timeWordsSaid('15h this week', WEDNESDAY).read).toBe('2026-W34, 15h')
    expect(timeWordsSaid('next month', WEDNESDAY).read).toBe('2026-09')
  })

  /**
   * NOTHING READ IS NULL AND NOT A GUESS. "Absence beats a guess" is the fifth rule, and this is the
   * layer the eighth rule stops at when it cannot go on: keep the intent, never invent the reading.
   */
  it('reads nothing out of words that settle nothing, and says why', () => {
    const vague = timeWordsSaid('sometime in September', WEDNESDAY)
    expect(vague.read).toBeNull()
    expect(vague.how).toContain('sometime')
    expect(timeWordsSaid('before Friday', WEDNESDAY).read).toBeNull()
  })
})

// ============================================================================ before a line is filed

describe('the Time given cell of a line nobody has filed', () => {
  /**
   * THE PERIOD IS NAMED IN WORDS HERE, AND THAT CHANGED ON 17 AUGUST 2026.
   *
   * These three assertions read `toContain('2026-W35')`. That is the stored key, and the owner met
   * it in this very column: "Do not require me to know an internal date representation." Normal mode
   * now says "Week of 24 August" — Monday of 2026-W35, written out here for the same reason the week
   * numbers above are, because computing it with the code under test would prove nothing. The key is
   * Inspect's and is not gone.
   *
   * EACH ONE IS STRICTER THAN WHAT IT REPLACES, not looser: the old assertion would still pass on a
   * cell that printed the name AND the key, and the added line forbids the key.
   */
  it('says what Mole Office read out of the words, and says nothing was scheduled from it', async () => {
    const said = await timeCell('calibrate the wrist')
    expect(said).toContain('next week')
    expect(said).toContain('Week of 24 August')
    expect(said).not.toContain('2026-W35')
    // WITHOUT THIS THE READING LOOKS LIKE A SCHEDULE. Nothing is in that week and nothing can be
    // until the line is work, because a period needs a record to give hours to.
    expect(said).toContain('not scheduled')
  })

  /** Both halves of one sentence, each read by its own reader. `15h this week` is hours AND a week. */
  it('reads the hours and the period out of one sentence', async () => {
    const said = await timeCell('write the driver')
    expect(said).toContain('Week of 17 August')
    expect(said).not.toContain('2026-W34')
    expect(said).toContain('15h')
    expect(said).toContain('not scheduled')
  })

  /**
   * THE WORDS SURVIVE AND THE READING SAYS IT READ NOTHING. This is the third answer a cell may
   * give: unresolved, in a concise state, with the person's own words untouched beside it.
   */
  it('keeps words it cannot read and says it read no date, without inventing one', async () => {
    const said = await timeCell('the vague one')
    expect(said).toContain('sometime in September')
    expect(said).toContain('no date read')
    expect(said).not.toContain('2026-')
  })

  /**
   * THE CONTROL. A cell that printed a reading whatever the line said would pass every assertion
   * above this one, and would put two more lines on every row of a dense table.
   */
  it('says nothing at all on a row whose line says nothing about time', async () => {
    const said = await timeCell('nothing about time at all')
    expect(said).not.toContain('not scheduled')
    expect(said).not.toContain('no date read')
    expect(said).not.toContain('2026-')
  })

  /**
   * NO DAY, NO READING. "next week" is only a week once you know the day it is read from, and this
   * browser's clock is not that day — the schedule is written with the server's. A cell that had no
   * day and read the words anyway would be wrong at every day boundary and look right.
   */
  it('reads nothing while the day has not arrived, rather than using the machine clock', async () => {
    const said = await timeCell('calibrate the wrist', null)
    expect(said).toContain('next week')
    expect(said).not.toContain('2026-W')
    expect(said).not.toContain('not scheduled')
  })

  /**
   * READING WORDS COSTS NOTHING AND COMMITS NOTHING, so a surface that may not rewrite the line says
   * it too. It was the press that writes which carried the reading, which is why the reading only
   * existed where something could be written.
   */
  it('says it where the words cannot be rewritten either', async () => {
    const item = await rowFor('calibrate the wrist')
    const said = words(
      h(planItems.ItemPlanned, { item, acts: actsWith(WEDNESDAY), which: 'time' as const, canRewrite: false }),
    )
    expect(said).toContain('Week of 24 August')
    expect(said).not.toContain('2026-W35')
    expect(said).toContain('not scheduled')
  })
})

// ============================================================================ after a line is filed

describe('the How big cell of a line filed as work', () => {
  /**
   * ONE CELL, ONE ANSWER. "not sized" is an answer — nobody has said how long this takes — and so is
   * "probably large". Drawn together they were two answers to one question, the second contradicting
   * the first. The box now says what you type into it instead, which is not an answer.
   */
  it('does not say "not sized" while the line\'s own words already say how big', async () => {
    const said = await sizeCell('file me unsized')
    expect(said).not.toContain('not sized')
    expect(said).toContain('probably large')
    expect(said).toContain('placeholder="hours"')
  })

  /**
   * AND NEITHER FACT IS LOST. The box is still empty, which is the whole of "no hours are stored on
   * this record", and it is still the box that stores them.
   */
  it('keeps the empty box that stores the hours, so nothing that was true stopped being said', async () => {
    const said = await sizeCell('file me unsized')
    expect(said).toContain('class="pi-hours"')
    expect(said).toContain('value=""')
  })

  /**
   * THE CONTROL, AND IT IS THE ROW THIS PRODUCT DRAWS MOST. Almost no work in the live corpus has an
   * estimate, so a fix that dropped "not sized" everywhere would be wrong on nearly every filed row.
   */
  it('still says "not sized" where nothing else in the cell says how big', async () => {
    const item = await rowFor('file me sized')
    // The record is sized, so empty its estimate to reach the row the corpus is full of.
    const workId = item.entry.work!.id
    await webApi.api.updateRecord(workId, { dataPatch: { effort_hours: null } })
    const said = body(
      h(planItems.ItemEstimate, {
        item: await rowFor('file me sized'),
        acts: { ...actsWith(WEDNESDAY), workList: await webApi.api.work() },
        canRewrite: true,
      }),
    )
    expect(said).toContain('placeholder="not sized"')
    // And put it back, so the row this file leaves behind is the one it was handed.
    await webApi.api.updateRecord(workId, { dataPatch: { effort_hours: 6 } })
  })

  /**
   * A record that is sized says its number and puts no words beside it. It is the third case, and
   * the emptiness asserted here is what "one cell, one answer" means when the record has answered.
   *
   * THE ABSENCE IS ASKED OF THE SCREEN AND NOT OF THE MARKUP. A box holding 6 still carries a
   * placeholder in its attributes and no reader ever sees it, so `not.toContain('not sized')` on the
   * markup would be an assertion about something nobody can read.
   */
  it('says the stored number where the record has one, and nothing beside it', async () => {
    expect(await sizeCell('file me sized')).toContain('value="6"')
    const item = await rowFor('file me sized')
    const seen = words(h(planItems.ItemEstimate, { item, acts: actsWith(WEDNESDAY), canRewrite: true }))
    expect(seen).toBe('')
  })
})
