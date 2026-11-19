// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TIME GIVEN CELL STAYS EDITABLE AFTER A LINE IS FILED, AND IT NAMES A WEEK IN WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, MEASURED IN CHROMIUM ON 17 AUGUST 2026, AT 1440 BY 900, ON ONE ROW
 * ---------------------------------------------------------------------------------------
 *
 * A row of a plan table, filed as work, holding 20 hours in a week and one rough phrase:
 *
 *     Do this next week...    2026-W35  20h
 *                             next week    gave nothing any time
 *
 * `next week` there is a KEPT PHRASE: words a person wrote about when, which Mole Office could not turn
 * into hours, stored exactly as typed and in no total. The Table drew them as a read-only chip.
 * Measured in the laid-out page: that row had no box with the label "Time given" for this item, in
 * your own words, while the unfiled row beside it did — and the How big column of the SAME row had
 * two boxes, the canonical hours and "probably large". One column let a person change their own
 * words and its neighbour did not.
 *
 * A tester spent 45 seconds trying to change or clear those words from the Table and gave up.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE SAME CELL PRINTED A STORED KEY
 * ---------------------------------------------------------------------------------------
 *
 *     Do this next week...    2026-W35  20h
 *                             next week    gave nothing any time
 *
 * `2026-W35` is the stored period key. The owner: "Do not require me to know an internal date
 * representation." Nothing about what is stored or sent changes here; the drawing does.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ALLOWED TO CONCLUDE
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here presses a button: the runner has no DOM. The components are rendered to static
 * markup, and `fetch` is pointed at a real Fastify app, so every plan, every filing and every
 * kept phrase below really is written to a database and read back out of it. The write the box
 * makes is `changeKeptWords`, which is the function the box itself calls — the same arrangement
 * `giveItemTimeFromWords` has, and the reason both are exported. The harness is the one
 * tests/no-denial-beside-hours.test.ts uses.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aDayThatIsNotFriday, freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply, WorkListReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planItems: PlanItemsModule
let mode: ModeModule

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * The day every reading below is read against: Wednesday 19 August 2026, local time.
 *
 * Its week is 2026-W34, which starts on Monday 17 August, and the week after it is 2026-W35, which
 * starts on Monday 24 August. Those four facts are written out rather than computed, because
 * computing them with the code under test would prove nothing.
 */
const WEDNESDAY = new Date(2026, 7, 19)

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
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
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
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => res.body }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_HUMAN })
  planItems = await import('../src/web/components/plans/planitems.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** One plan with one line, in the shape the owner gives one. */
async function aPlan(line: string): Promise<{ planId: string; lineId: string }> {
  const written = await webApi.api.newPlan(`Plan for ${line}`, ['# Round six', `- ${line}`].join('\n'))
  const found = written.lines.find((one) => one.text === `- ${line}`)
  if (found === undefined) throw new Error(`The plan has no line reading "- ${line}".`)
  return { planId: written.plan.id, lineId: found.id }
}

async function itemOf(planId: string, lineId: string) {
  const reply: PlanBlocksReply = await webApi.api.planBlocks(planId)
  const item = planItems.planItemsOf(reply.lines).items.find((one) => one.entry.line.id === lineId)
  if (item === undefined) throw new Error('The plan read back without the line that was just written.')
  return item
}

async function actsFor(planId: string): Promise<{
  planId: string
  reload: () => Promise<void>
  behind: boolean
  workList: WorkListReply
  today: Date
  versionToWriteOn: typeof THIS_TEST_ONLY_DRAWS_THE_TABLE
}> {
  return { planId, reload: async () => {}, behind: false, workList: await webApi.api.work(), today: WEDNESDAY, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE }
}

/** The markup as the browser would receive it, tags and all. */
function markup(el: ReactElement): string {
  return renderToStaticMarkup(el)
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: ReactElement): string {
  return renderToStaticMarkup(el)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The box this whole file is about, by the label a person's screen reader would announce. */
// RENAMED 17 AUGUST 2026: the column and this box are called Schedule now. See PLANNING_WORDS.
const THE_BOX = 'aria-label="&quot;Schedule&quot; for this item, in your own words"'

/** The Time given cell of a filed row, drawn as the plan table draws it. */
async function filedTimeCell(planId: string, lineId: string): Promise<string> {
  return markup(h(planItems.ItemHours, { item: await itemOf(planId, lineId), acts: await actsFor(planId) }))
}

/**
 * A line filed as work, holding one rough phrase about when that nothing was scheduled from.
 *
 * IT IS WRITTEN THE WAY THE PRODUCT WRITES IT. `giveItemTimeFromWords` is what the "Give it time"
 * press in this very cell calls, and words it can read no date from are kept exactly as typed — the
 * eighth rule's first layer. Nothing here reaches into the intents table to arrange the fixture.
 */
async function aFiledLineHolding(line: string, roughWords: string): Promise<{ planId: string; lineId: string }> {
  const { planId, lineId } = await aPlan(line)
  await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
  // NOT A FRIDAY. Every caller passes words meant to be KEPT, and "before Friday" written on a
  // Friday is a one-day window, which is a date. See `aDayThatIsNotFriday`.
  const day = aDayThatIsNotFriday(planItems.serverDay((await webApi.api.today()).day))
  const kept = await planItems.giveItemTimeFromWords(planId, await itemOf(planId, lineId), roughWords, '', day)
  if (!kept.ok) throw new Error(`The words were not kept: ${kept.said}`)
  return { planId, lineId }
}

/**
 * A LINE HOLDING TWO PHRASES ABOUT TIME, in a known order. There is no route that makes one.
 *
 * `createIntent` keeps a line to one answer about time, so a line holding two is a database written
 * before that rule — and this installation's own corpus is one of them, which is why the reader
 * still hands back a list and why a box has to behave correctly on such a row. The rows are written
 * directly for the same reason tests/plan-writing-carries-values.test.ts writes its pair directly.
 *
 * THE STAMPS ARE WRITTEN OUT AND A SECOND APART, and that is not decoration. `keptWordsOfLine`
 * orders by stamp and falls back to the id, and an id here is a random `nanoid` — so a pair written
 * inside one second would come back in whichever order the two ids happened to sort in. This test
 * asserted an order and passed alone and failed in the full suite until the stamps were fixed.
 */
async function aFiledLineHoldingTwo(
  line: string,
  first: string,
  second: string,
): Promise<{ planId: string; lineId: string }> {
  const { planId, lineId } = await aPlan(line)
  const filed = await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
  const { db: intentStore } = await import('../src/server/db/client.ts')
  const { planningIntents } = await import('../src/server/db/schema.ts')
  const said = [
    { id: `${lineId}-one`, said: first, createdAt: '2026-08-01 09:00:00' },
    { id: `${lineId}-two`, said: second, createdAt: '2026-08-01 09:00:01' },
  ]
  for (const row of said) {
    intentStore
      .insert(planningIntents)
      .values({
        ...row,
        recordId: filed.recordId,
        planLineId: lineId,
        // NOTHING WAS READ OUT OF THESE WORDS, which is what makes them kept rather than offered.
        horizon: null,
        period: null,
        hours: null,
        state: 'kept',
        createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      })
      .run()
  }
  return { planId, lineId }
}

// ============================================================================ the words stay editable

describe('the Time given cell after a line is filed as work', () => {
  /**
   * THE OWNER'S OWN SENTENCE, FILED. This is the exact path the owner measured, and the assertion is
   * the exact thing the owner could not do: change the words from the Table.
   */
  it('still offers the same box for the words, holding what the person wrote', async () => {
    const unfiled = await aPlan('Do this next week {time: next week}')
    const before = markup(
      h(planItems.ItemPlanned, {
        item: await itemOf(unfiled.planId, unfiled.lineId),
        acts: await actsFor(unfiled.planId),
        which: 'time' as const,
        canRewrite: true,
      }),
    )
    // BEFORE ANYTHING IS FILED there is a box and it holds the words as written. This is the control for the
    // assertion under it: a column that never had a box would pass the whole file without it.
    expect(before).toContain(THE_BOX)
    expect(before).toContain('next week')

    const { planId, lineId } = await aFiledLineHolding('Do this next week', 'next week, if the parts arrive')
    const filed = await itemOf(planId, lineId)
    // THE WORDS ARE KEPT AND THEY ARE NOT IN THE PROSE, so this cell is the only place left.
    expect(filed.entry.line.text).not.toContain('{time:')
    expect(planItems.keptWordsOf(filed, 'time')).toEqual(['next week, if the parts arrive'])

    const after = await filedTimeCell(planId, lineId)
    expect(after).toContain(THE_BOX)
    expect(after).toContain('next week, if the parts arrive')
    // AND THE MARK IS STILL THERE. An editable box must not turn kept words into something that
    // looks scheduled: nothing came out of them and the cell goes on saying so.
    expect(words(h(planItems.ItemHours, { item: filed, acts: await actsFor(planId) }))).toContain(
      'gave nothing any time',
    )
  })

  /** The whole point of a box: the words that come back are the new ones, from the server. */
  it('writes the new words to the line and reads them back', async () => {
    const { planId, lineId } = await aFiledLineHolding('calibrate the wrist', 'sometime next week')

    const item = await itemOf(planId, lineId)
    const row = planItems.keptRowsOf(item, 'time')[0]
    if (row === undefined) throw new Error('The line kept no words.')

    const change = await planItems.changeKeptWords(item, row, 'the week after next, if the parts arrive')
    expect(change.did).toBe('kept')
    expect(change.outcome.ok).toBe(true)
    // NOTHING ELSE WENT WITH IT. The line held one phrase and one phrase replaced it.
    expect(change.alsoWent).toEqual([])

    const again = await itemOf(planId, lineId)
    expect(planItems.keptWordsOf(again, 'time')).toEqual(['the week after next, if the parts arrive'])
    // EXACTLY AS TYPED, and it is on the screen in the box.
    expect(await filedTimeCell(planId, lineId)).toContain('the week after next, if the parts arrive')
    // AND STILL NOTHING IS SCHEDULED. Keeping words is the first layer of the eighth rule; a write
    // that quietly became hours would be the whole rule broken by a text box.
    const planningLib = await import('../src/server/lib/planning.ts')
    expect(planningLib.allocationsOf(again.entry.line.recordId ?? '')).toHaveLength(0)
  })

  /** Clearing is the other half. A surface that can write and cannot remove leaves a person stuck. */
  it('takes the words off the line when the box is emptied', async () => {
    const { planId, lineId } = await aFiledLineHolding('order the bearings', 'sometime in September')

    const item = await itemOf(planId, lineId)
    const row = planItems.keptRowsOf(item, 'time')[0]
    if (row === undefined) throw new Error('The line kept no words.')

    const change = await planItems.changeKeptWords(item, row, '   ')
    expect(change.did).toBe('forgotten')
    expect(change.outcome.ok).toBe(true)

    const again = await itemOf(planId, lineId)
    expect(planItems.keptWordsOf(again, 'time')).toEqual([])
    expect(planItems.keptRowsOf(again, 'time')).toEqual([])
    // AN EMPTY PHRASE WAS NOT STORED IN ITS PLACE. "nobody wrote anything about when" and "somebody
    // wrote nothing" must not be two rows that draw the same.
    const planningLib = await import('../src/server/lib/planning.ts')
    expect(planningLib.keptWordsOfLine(lineId)).toEqual([])
  })

  /** The same characters are not a write. A box that stored on every blur would restamp the row. */
  it('writes nothing when the words have not changed', async () => {
    const { planId, lineId } = await aFiledLineHolding('shim the mount', 'before Friday')
    const item = await itemOf(planId, lineId)
    const row = planItems.keptRowsOf(item, 'time')[0]
    if (row === undefined) throw new Error('The line kept no words.')

    const change = await planItems.changeKeptWords(item, row, 'before Friday')
    expect(change.did).toBe('nothing')
    const planningLib = await import('../src/server/lib/planning.ts')
    const held = planningLib.keptWordsOfLine(lineId)
    expect(held.map((one) => one.id)).toEqual([row.id])
  })

  /**
   * THE CONTROL FOR THE BOX ITSELF: a cell may not offer two boxes for one question.
   *
   * A filed line can hold BOTH — its own `{time: …}` in the prose and a kept phrase beside it — and
   * then `ItemKept` draws the box for the prose value and these words stay a chip. That is the rule
   * `StoredEstimate` states for the How big cell, applied to this one. Without it, the same label
   * would be on two boxes in one cell holding two different phrases.
   */
  it('does not draw a second box where the line still says something about time', async () => {
    const { planId, lineId } = await aFiledLineHolding('tram the spindle', 'ask Sam first')
    // The prose says something about time as well, which is what a cell with two boxes would need.
    const item = await itemOf(planId, lineId)
    await webApi.api.saveLine(planId, lineId, {
      text: planItems.lineWithPlanningValue(item.entry.line.text, 'time', 'Tuesday afternoon'),
    }, null)

    const again = await itemOf(planId, lineId)
    expect(planItems.writtenValue(again, 'time').said).toBe('Tuesday afternoon')
    expect(planItems.keptWordsOf(again, 'time')).toEqual(['ask Sam first'])

    const cell = await filedTimeCell(planId, lineId)
    // The kept words are drawn, and they are NOT a box: the line's own value has the box, and
    // `ItemKept` draws that one in the same cell.
    expect(cell).toContain('ask Sam first')
    expect(cell).not.toContain(THE_BOX)
  })

  /**
   * ONE LIST, TWO READERS, AND THIS IS WHAT KEEPS THEM FROM DRIFTING.
   *
   * `keptWordsOf` reads the derived list the Writing view draws. `keptRowsOf` reads the rows the box
   * writes to. The server builds the first from the second, in one place; if that ever stops being
   * true, the Table would edit one phrase while showing another.
   */
  it('reads the same words the Writing view reads, in the same order', async () => {
    // TWO ROWS, BECAUSE ONE PROVES NOTHING ABOUT ORDER. See `aFiledLineHoldingTwo`.
    const { planId, lineId } = await aFiledLineHoldingTwo(
      'wire the encoder',
      'ask Sam and then decide',
      'or the week after',
    )
    const both = await itemOf(planId, lineId)
    expect(planItems.keptWordsOf(both, 'time')).toEqual(['ask Sam and then decide', 'or the week after'])
    expect(planItems.keptRowsOf(both, 'time').map((one) => one.said)).toEqual(planItems.keptWordsOf(both, 'time'))
    // A size and a project have no intent layer, so there is nothing for a box to write to there.
    expect(planItems.keptRowsOf(both, 'size')).toEqual([])
    expect(planItems.keptRowsOf(both, 'project')).toEqual([])
  })

  /**
   * NEVER SILENT ABOUT WORDS THAT WENT. A line holds one answer about time, so typing in one box on
   * a line that holds two phrases takes the other one away. Replacing your own words is not news;
   * losing a phrase you wrote somewhere else is, and the person is told which.
   */
  it('says which other words the write took off the line', async () => {
    const { planId, lineId } = await aFiledLineHoldingTwo(
      'bleed the brake',
      'ask Sam and then decide',
      'or the week after',
    )
    const both = await itemOf(planId, lineId)
    const first = planItems.keptRowsOf(both, 'time')[0]
    if (first === undefined) throw new Error('The line kept no words.')
    const change = await planItems.changeKeptWords(both, first, 'when the parts arrive')
    expect(change.did).toBe('kept')
    // THE ROW BEING RETYPED IS NOT REPORTED BACK AT THE PERSON WHO JUST RETYPED IT.
    expect(change.alsoWent.map((one) => one.said)).toEqual(['or the week after'])
    expect(planItems.keptWordsOf(await itemOf(planId, lineId), 'time')).toEqual(['when the parts arrive'])
  })
})

// ============================================================================ the week in words

describe('the period a cell prints', () => {
  /**
   * 2026-W35 is ISO-8601, Monday first, and the year in it is the week-year rather than the calendar
   * year. It is exactly right and nobody should have to know it to read their own plan.
   */
  it('names a week the way a person names it, and does not print the stored key', () => {
    const said = words(h(planItems.PeriodInWords, { period: '2026-W35' }))
    expect(said).toBe('Week of 24 August')
    expect(said).not.toContain('2026-W35')
  })

  it('names a month and a day the same way', () => {
    expect(words(h(planItems.PeriodInWords, { period: '2026-09' }))).toBe('September 2026')
    expect(words(h(planItems.PeriodInWords, { period: '2026-09-07' }))).toBe('Mon 7 September')
  })

  /** Nothing is destroyed and nothing becomes unreachable — docs/UX-CONTRACT.md, Normal and Inspect. */
  it('keeps the exact key for Inspect', () => {
    mode.setMode('inspect')
    try {
      const said = words(h(planItems.PeriodInWords, { period: '2026-W35' }))
      expect(said).toContain('Week of 24 August')
      expect(said).toContain('2026-W35')
    } finally {
      mode.setMode('normal')
    }
  })

  /**
   * A KEY NOTHING CAN PLACE ON A CALENDAR IS PRINTED AS IT IS STORED. Absence beats a guess: there is
   * no week to name, so the stored characters are the only true thing to draw.
   */
  it('prints a key it cannot place on a calendar exactly as it is stored', () => {
    expect(words(h(planItems.PeriodInWords, { period: '2026-W99' }))).toBe('Unknown period')
  })

  /** The stored hours are drawn beside the named week, on the row the owner met. */
  it('draws the hours a piece of work has beside the week, in words', async () => {
    const { planId, lineId } = await aPlan('build the arm controller')
    await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    await webApi.api.giveLineTime(planId, lineId, { horizon: 'week', period: '2026-W35', plannedHours: 20 })

    const said = words(h(planItems.ItemHours, { item: await itemOf(planId, lineId), acts: await actsFor(planId) }))
    expect(said).toContain('Week of 24 August')
    expect(said).toContain('20h')
    expect(said).not.toContain('2026-W35')
  })
})
