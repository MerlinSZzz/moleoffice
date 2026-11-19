// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN TABLE'S CELLS: SAY WHEN, AND LOOK EDITABLE.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE DEFECTS THIS PINS, ALL OF THEM MEASURED IN A BROWSER ON 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 *   1. A FIELD AND A RULED LINE WERE THE SAME PIXEL. Every typable cell drew its rule from
 *      var(--border) — the DECORATION token — which is the same declaration `.pt-table td` draws
 *      its row rules with, at 1.48:1 against the page. tokens.css states the rule this broke:
 *      --border-strong is "the line that IS the object — the edge of a button, an input, a select".
 *      The only other sign of a field was a hover and a focus, and neither exists for somebody
 *      scanning a page or holding a phone.
 *   2. FOUR OF THE FIVE TYPABLE COLUMNS DREW A COMPLETELY BLANK CELL when the line said nothing.
 *      The owner found that My note accepted the owner's typing by clicking empty space to see what would
 *      happen, and wrote: "Do not count the user can eventually discover that an empty area is
 *      clickable as successful UX."
 *   3. A FIFTH OF EVERY CELL WAS DEAD SPACE. The cell measured 122 by 26.5 pixels and the box
 *      inside it 110 by 21, so a press near the cell's edge landed on the cell and did nothing —
 *      on space drawn exactly like the field.
 *   4. THERE WAS NO WAY TO TYPE A PERIOD AT ALL. The scheduling control held three fixed presses —
 *      today, this week, this month — and one box labelled Hours. A tester reached "next week" only
 *      by typing it into the hours box, which the owner found by reading the page's markup. Worse, the
 *      press that KEEPS words was disabled until one of the three canonical periods had been
 *      pressed, so the only way to preserve "next week" was to first tell Mole Office it was this week.
 *   5. THE TABLE AND THE WRITING VIEW ASSERTED OPPOSITE THINGS ABOUT ONE LINE. After a line was
 *      filed, the words Mole Office had kept vanished from the Table: the cell read "no hours", whose
 *      sentence is "Mole Office read the hours for this work and nobody has given it any", while the
 *      Writing view an inch below read "next week — you wrote this and nothing has been scheduled
 *      from it". One plan, two views, two contradicting claims.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so there is no DOM: the components are rendered to static
 * markup and `fetch` is pointed at a real Fastify app through `app.inject`, exactly as
 * tests/plan-table-editing.test.ts does it. Every write below really lands in a database and is
 * read back out of it.
 *
 * NOTHING HERE PRESSES A BUTTON, so every rule a press follows is a function the press calls and
 * this file calls the same function. `whatGivingTimeWillDo` is the whole of what the control makes
 * of its two boxes, and `giveItemTimeFromWords` is the whole of what one press writes.
 *
 * THE TWO STYLESHEETS ARE READ RATHER THAN RE-TYPED. The cells' sheet is the exported constant the
 * table renders; the table's own is read out of the source of the file that renders it. Nothing
 * here restates a declaration, because the whole point of reading both is to fail when the one
 * number they share stops agreeing with itself.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aDayThatIsNotFriday, freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply, WorkListReply } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type PlanningLib = typeof import('../src/server/lib/planning.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule
let planItems: PlanItemsModule
let planningLib: PlanningLib

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

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
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')
  planningLib = await import('../src/server/lib/planning.ts')
})

afterAll(async () => {
  await app.close()
  db.close()
})

// ---------------------------------------------------------------------------- reading the screen

/** A plan of one heading and one bullet. Each test gets its own, so none can affect another. */
async function aPlan(words: string): Promise<{ planId: string; lineId: string }> {
  const written = await webApi.api.newPlan(`Plan for ${words}`, ['# Robotics', `- ${words}`].join('\n'))
  const line = written.lines.find((one) => one.text === `- ${words}`)
  if (line === undefined) throw new Error(`The plan has no line reading "- ${words}".`)
  return { planId: written.plan.id, lineId: line.id }
}

async function itemOf(planId: string, lineId: string): Promise<PlanItemsModule extends never ? never : ReturnType<PlanItemsModule['planItemsOf']>['items'][number]> {
  const reply: PlanBlocksReply = await webApi.api.planBlocks(planId)
  const item = planItems.planItemsOf(reply.lines).items.find((one) => one.entry.line.id === lineId)
  if (item === undefined) throw new Error('The plan read back without the line that was just written.')
  return item
}

/** Everything a cell needs to draw itself, with a real work list read out of the running app. */
async function actsFor(planId: string): Promise<{
  planId: string
  reload: () => Promise<void>
  behind: boolean
  workList: WorkListReply
  today: Date
  versionToWriteOn: typeof THIS_TEST_ONLY_DRAWS_THE_TABLE
}> {
  // A FIXED WEDNESDAY, so a cell that says what it read out of "next week" reads the same week on
  // every run. The browser takes this day from the server; a test that took it from the clock would
  // pass or fail depending on which week it ran in.
  return { planId, reload: async () => {}, behind: false, workList: await webApi.api.work(), today: WEDNESDAY, versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE }
}

/** The day every cell below is read against: Wednesday 19 August 2026, local time like every date. */
const WEDNESDAY = new Date(2026, 7, 19)

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================ 1. a field is drawn as a field

// ============================================================ 2. an empty cell says what goes in it

// ============================================================ 3. saying when, in your own words

describe('the scheduling control lets a person say when they mean', () => {
  it('reads a period out of ordinary words nobody could press a button for', async () => {
    const today = await webApi.api.today()
    const day = planItems.serverDay(today.day)
    expect(day, 'the server day did not read back as itself').not.toBeNull()

    const will = planItems.whatGivingTimeWillDo('next week', '15h', day)
    expect(will.press).toBe('give')
    expect(will.period?.horizon).toBe('week')
    // NOT THIS WEEK. The old control could only say this one, so "next week" had to be told to
    // Mole Office as a lie before it could be kept.
    expect(will.period?.key).not.toBe(today.week)
    // THE READING IS ON SCREEN BEFORE ANYTHING IS WRITTEN, and it names both halves.
    expect(will.reading).toContain(will.period?.key ?? 'no period')
    expect(will.reading).toContain('15 hours')
    expect(will.why).toBeNull()
  })

  it('the three shortcuts are the same words read the same way, so they cannot mean two weeks', async () => {
    const today = await webApi.api.today()
    const day = planItems.serverDay(today.day)
    // ONE CLOCK. The shortcuts type their own words into the when box and those words go through
    // the product's one reader, against the SERVER's day. A browser working out its own week is the
    // same question answered in two places, and an hour given here would land in a week the
    // schedule does not agree exists.
    expect(planItems.whatGivingTimeWillDo('today', '', day).period?.key).toBe(today.day)
    expect(planItems.whatGivingTimeWillDo('this week', '', day).period?.key).toBe(today.week)
    expect(planItems.whatGivingTimeWillDo('this month', '', day).period?.key).toBe(today.month)
  })

  it('keeps words it cannot read, never guesses a date from them, and says so shortly', async () => {
    const today = await webApi.api.today()
    // NOT A FRIDAY, and the helper says why: "before Friday" written on a Friday is a window one
    // day long, which is a date, so the line would rightly be scheduled and this test's subject
    // would have gone. See `aDayThatIsNotFriday`.
    const day = aDayThatIsNotFriday(planItems.serverDay(today.day))

    for (const said of ['sometime next week', 'before Friday', 'the first half of September']) {
      const will = planItems.whatGivingTimeWillDo(said, '', day)
      expect(will.press, said).toBe('keep')
      // ABSENCE BEATS A GUESS. Nothing is scheduled and no period is invented.
      expect(will.period, said).toBeNull()
      // SHORT ON THE NORMAL PATH. The reader's own sentence names which word stopped it and runs to
      // three lines, so it is behind a press instead.
      expect((will.reading ?? '').length, said).toBeLessThan(120)
      expect(will.why, said).not.toBeNull()
      expect((will.why ?? '').length, said).toBeGreaterThan((will.reading ?? '').length)
    }
  })

  it('never disables the keep path, and stops only where there is nothing at all to keep', async () => {
    const today = await webApi.api.today()
    const day = planItems.serverDay(today.day)

    // THE DEFECT IN ONE ASSERTION. "Keep these words" used to be disabled until one of three
    // canonical periods had been pressed.
    expect(planItems.whatGivingTimeWillDo('sometime next week', '', day).press).toBe('keep')
    // Words in the hours box alone are still somebody's words and are still kept.
    expect(planItems.whatGivingTimeWillDo('', 'about half a day', day).press).toBe('keep')
    // Two empty boxes is the one case with nothing to write and nothing to keep.
    expect(planItems.whatGivingTimeWillDo('', '', day).press).toBe('nothing')
    expect(planItems.whatGivingTimeWillDo('   ', '', day).press).toBe('nothing')
  })

  it('reads no date at all when Mole Office has no day to read against, and still keeps the words', () => {
    // The server's clock did not answer. A browser reading "next week" for itself here is the guess
    // the fifth invariant forbids, so it reads nothing — and the words are still kept.
    const will = planItems.whatGivingTimeWillDo('next week', '', null)
    expect(will.press).toBe('keep')
    expect(will.period).toBeNull()
    expect(will.why).toContain('could not read the day')
  })

  it('draws a when box first, labelled with the word when, with the three shortcuts beside it', async () => {
    const { planId, lineId } = await aPlan('calibrate the wrist')
    const item = await itemOf(planId, lineId)
    const acts = await actsFor(planId)
    const drawn = body(h(planItems.GiveItTime, { items: [item], acts, onDone: () => {} }))

    expect(drawn).toContain('class="pi-when"')
    // WHEN COMES BEFORE HOURS, because when is the question this control exists to answer.
    expect(drawn.indexOf('When')).toBeGreaterThan(-1)
    expect(drawn.indexOf('When')).toBeLessThan(drawn.indexOf('Hours'))
    // THE PLACEHOLDER IS THREE REAL ANSWERS, so nobody has to be told what shape a date takes.
    expect(drawn).toContain('placeholder="next week, Tuesday, 2026-09-07"')
    for (const shortcut of ['today', 'this week', 'this month']) {
      expect(drawn, shortcut).toContain(`>${shortcut}</button>`)
    }
  })
})

// ============================================================ 4. what one press writes

describe('one press of the scheduling control', () => {
  it('writes hours in the week the words named, without anybody pressing a period', async () => {
    const { planId, lineId } = await aPlan('replace the coupling')
    const filed = await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const today = await webApi.api.today()
    const day = planItems.serverDay(today.day)
    const item = await itemOf(planId, lineId)

    const outcome = await planItems.giveItemTimeFromWords(planId, item, 'next week', '15h', day)
    expect(outcome.ok, outcome.said).toBe(true)

    const rows = planningLib.allocationsOf(filed.recordId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.plannedHours).toBe(15)
    expect(rows[0]?.period).toBe(planItems.whatGivingTimeWillDo('next week', '', day).period?.key)
    expect(rows[0]?.period).not.toBe(today.week)
  })

  it('keeps words that name no date exactly as typed, and schedules nothing from them', async () => {
    const { planId, lineId } = await aPlan('rewrite the controller')
    const filed = await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const today = await webApi.api.today()
    const item = await itemOf(planId, lineId)

    const outcome = await planItems.giveItemTimeFromWords(
      planId,
      item,
      'sometime next week',
      '',
      planItems.serverDay(today.day),
    )
    expect(outcome.ok, outcome.said).toBe(true)
    expect(planningLib.allocationsOf(filed.recordId)).toHaveLength(0)

    const kept = planningLib.listIntents({ planLineId: lineId })
    expect(kept).toHaveLength(1)
    expect(kept[0]?.said).toBe('sometime next week')
    expect(kept[0]?.period).toBeNull()
    expect(kept[0]?.state).toBe('kept')
  })

  it('loses neither box when neither can be read, because a line holds one answer about time', async () => {
    const { planId, lineId } = await aPlan('service the arm')
    await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const today = await webApi.api.today()
    const item = await itemOf(planId, lineId)

    const outcome = await planItems.giveItemTimeFromWords(
      planId,
      item,
      'before Friday',
      'about half a day',
      // See `aDayThatIsNotFriday`: on a Friday these words are a date and nothing would be kept.
      aDayThatIsNotFriday(planItems.serverDay(today.day)),
    )
    expect(outcome.ok, outcome.said).toBe(true)

    // ONE ROW, HOLDING BOTH. Writing two rows was tried and measured: the server replaces what a
    // line last said about time on every write, so the second box took the first box's words away
    // and only "about half a day" was left in the database.
    const kept = planningLib.listIntents({ planLineId: lineId })
    expect(kept).toHaveLength(1)
    expect(kept[0]?.said).toContain('before Friday')
    expect(kept[0]?.said).toContain('about half a day')
    expect(kept[0]?.period).toBeNull()
  })
})

// ============================================================ 5. one plan, one answer, both views

describe('the Time given cell shows what the Writing view shows', () => {
  it('never says nobody gave it any time while the line still carries words', async () => {
    const { planId, lineId } = await aPlan('bolt down the frame')
    const filed = await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const today = await webApi.api.today()
    const before = await itemOf(planId, lineId)
    await planItems.giveItemTimeFromWords(planId, before, 'sometime next week', '', planItems.serverDay(today.day))

    const item = await itemOf(planId, lineId)
    const acts = await actsFor(planId)
    const said = words(h(planItems.ItemHours, { item, acts }))

    // THE WORDS ARE IN THE TABLE. They were only in the Writing view, which is how one plan came to
    // have two views saying opposite things about one line.
    expect(said).toContain('sometime next week')
    // AND THE STATE IS SAID IN WORDS, not in a tooltip that only exists under a pointer.
    //
    // THE MARK USED TO READ "not scheduled" AND NOW NAMES ITS SUBJECT. Measured in Chromium on
    // 17 August 2026, the same two words were drawn directly under "2026-W35 20h" on work that
    // really had those hours, so a reader met a denial of the number an inch above it. This
    // assertion is not the old one relaxed: it still requires the state in words, and the two
    // lines under it now forbid the wording that could be read as a claim about the work.
    // See tests/no-denial-beside-hours.test.ts.
    expect(said).toContain('gave nothing any time')
    expect(said).not.toContain('not scheduled')
    // AND THE CONTRADICTION IS GONE. This cell read "no hours", whose sentence is "Mole Office read the
    // hours for this work and nobody has given it any".
    expect(said).not.toContain('no hours')
    expect(said).not.toContain('nobody has given it any')

    // Nothing entered any total, which is the other half of keeping words.
    expect(planningLib.allocationsOf(filed.recordId)).toHaveLength(0)
  })

  it('shows the hours and the kept words together once both exist', async () => {
    const { planId, lineId } = await aPlan('tram the spindle')
    await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const today = await webApi.api.today()
    // See `aDayThatIsNotFriday`. The week below is unaffected: Friday and Saturday are one week.
    const day = aDayThatIsNotFriday(planItems.serverDay(today.day))

    await planItems.giveItemTimeFromWords(planId, await itemOf(planId, lineId), 'before Friday', '', day)
    await planItems.giveItemTimeFromWords(planId, await itemOf(planId, lineId), 'this week', '4h', day)

    const said = words(h(planItems.ItemHours, { item: await itemOf(planId, lineId), acts: await actsFor(planId) }))
    // THE STORED ALLOCATION, NAMED THE WAY A PERSON NAMES A WEEK.
    //
    // THIS ASSERTION CHANGED ON 17 AUGUST 2026 AND IS NOT THE OLD ONE RELAXED. It read
    // `toContain(today.week)`, which is the stored key `2026-W34` — the owner met that on this very
    // cell and said "Do not require me to know an internal date representation". So the key is now
    // Inspect's and Normal mode says the week in words. The line under this one is new and forbids
    // the key outright, which is stricter than what it replaces: the old assertion would still pass
    // if the cell printed both.
    expect(said).toContain('Week of')
    expect(said).not.toContain(today.week)
    expect(said).toContain('4h')
    // AND THE WORDS NOTHING WAS SCHEDULED FROM, beside it rather than instead of it.
    expect(said).toContain('before Friday')
    // THIS IS THE ROW THE OWNER MET. It prints 4h and it used to print "not scheduled" under them.
    // The mark now names the words as its subject, and the denial is forbidden here by name.
    expect(said).toContain('gave nothing any time')
    expect(said).not.toContain('not scheduled')
  })

  it('shows words kept on a line nobody has filed yet, in the same cell', async () => {
    const { planId, lineId } = await aPlan('order the bearings')
    const today = await webApi.api.today()
    // NOTHING IS FILED. A plan line may hold what somebody wrote about time before it is work.
    await planItems.giveItemTimeFromWords(
      planId,
      await itemOf(planId, lineId),
      'the first half of September',
      '',
      planItems.serverDay(today.day),
    )

    const item = await itemOf(planId, lineId)
    const acts = await actsFor(planId)
    const said = words(h(planItems.ItemPlanned, { item, acts, which: 'time', canRewrite: true }))
    expect(said).toContain('the first half of September')
    expect(said).toContain('gave nothing any time')
  })

  it('reads the same rows the Writing view reads, so the two cannot drift', async () => {
    const { planId, lineId } = await aPlan('shim the mount')
    await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const today = await webApi.api.today()
    await planItems.giveItemTimeFromWords(
      planId,
      await itemOf(planId, lineId),
      'ask Sam and then decide',
      '',
      planItems.serverDay(today.day),
    )

    const item = await itemOf(planId, lineId)
    // The Writing view draws `entry.derived`. So does the cell, through `keptWordsOf`, which is why
    // there is one answer rather than two that have to agree.
    const fromDerived = item.entry.derived.filter((one) => one.key === 'time' && !one.canonical).map((one) => one.says)
    expect(fromDerived).toEqual(['ask Sam and then decide'])
    expect(planItems.keptWordsOf(item, 'time')).toEqual(fromDerived)
  })
})
