// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROMOTED PLANNING VALUE BECOMES, AND WHERE A PERSON WRITING CAN STILL SEE IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE INVARIANT THESE TESTS EXIST FOR
 * ---------------------------------------------------------------------------------------
 *
 * A line may say how big it is, when it is to be done and which project it is in, in its own words:
 *
 *     - Build the controller {size: 15h} {time: 15h this week} {project: default}
 *
 * Filing the line as work moves each of those to the place Mole Office keeps that kind of fact and takes
 * it out of the line's words, because the same fact in two places is the defect this repository
 * keeps finding.
 *
 * That is right for storage and it broke the screen: the values then existed nowhere a person
 * writing could see them. Avoiding duplicate storage must not make
 * canonical facts disappear from one of the two Plan views.
 *
 * SO THE INVARIANT IS:
 *
 *   For every line, the planning values a reader can reach from the Writing view are exactly the
 *   union of what is in its text and what is derived from its record. NOTHING IS REACHABLE ONLY
 *   FROM THE TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE HALF OF IT THAT IS EASY TO BREAK BY "FIXING" IT
 * ---------------------------------------------------------------------------------------
 *
 * The obvious repair is to put the promoted groups back into the text box. That is forbidden and one
 * of these tests fails if anybody does it. The box is what the person typed: a stored value written
 * into it becomes editable as prose, so a typo becomes a record write — and once it is in there
 * nothing can tell it from what they wrote, which is the second store arriving through another door.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so the pages are rendered to static markup and `fetch` is
 * pointed at a real Fastify app through `app.inject`, exactly as tests/plans-pages.test.ts does it.
 * Every reply read here is one the server really wrote.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { weekKey } from '../src/shared/planning.ts'
import { bodyOfLines } from '../src/shared/plandoc.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let onePlan: OnePlanModule
/** The one place in this app that says what a period is called. Loaded like every other web file. */
let planning: typeof import('../src/web/components/Planning.tsx')

let planId: string
/** The line whose size, hours and project were all promoted. */
let promotedLineId: string
/** The line whose time could not be read, so the words were kept instead. */
let keptLineId: string
/** The line nobody has filed, which still carries its own words. */
let unfiledLineId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

const PROMOTED = '- Build the controller {size: 15h} {time: 15h this week} {project: default}'
const KEPT = '- Write the report {time: sometime next week}'
const UNFILED = '- Think about the mount {size: 3h}'

const BODY = ['# Week of 17 August', '', PROMOTED, KEPT, UNFILED].join('\n')

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
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  planning = await import('../src/web/components/Planning.tsx')

  const written = await webApi.api.newPlan('August plans', BODY)
  planId = written.plan.id
  promotedLineId = written.lines.find((line) => line.text === PROMOTED)!.id
  keptLineId = written.lines.find((line) => line.text === KEPT)!.id
  unfiledLineId = written.lines.find((line) => line.text === UNFILED)!.id

  await webApi.api.fileLineAsWork(planId, promotedLineId, { kind: 'task', workspaceId: 'default' })
  await webApi.api.fileLineAsWork(planId, keptLineId, { kind: 'task', workspaceId: 'default' })
})

afterAll(async () => {
  await app.close()
  db.close()
})

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

async function read(): Promise<PlanBlocksReply> {
  return webApi.api.planBlocks(planId)
}

/**
 * What this week is CALLED on screen, from the one function in the app that names a period.
 *
 * Written this way rather than as a fixed string so that a run in any week asserts the same thing,
 * and so this test cannot become a second namer of weeks.
 */
function namedWeek(): string {
  return planning.periodSaid(weekKey(new Date()), null).name
}

/** The Writing view of this plan, as the page draws it. */
async function writingView(): Promise<React.ReactElement> {
  const [reply, since, reviews] = await Promise.all([
    read(),
    webApi.api.planSinceRead(planId),
    webApi.api.planReviews(planId),
  ])
  return h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} })
}

// ============================================================ what promotion did to the words

describe('a promoted value leaves the line', () => {
  /**
   * THE STORED LINE HOLDS NONE OF THE THREE. This is the storage half of the invariant and it is
   * the half that was already true; it is here so that the reading half below cannot be made to
   * pass by putting the values back in the text.
   */
  it('takes the size, the hours and the project out of the stored text', async () => {
    const reply = await read()
    const line = reply.lines.find((entry) => entry.line.id === promotedLineId)!
    expect(line.line.text).toBe('- Build the controller')
    expect(line.line.text).not.toContain('size')
    expect(line.line.text).not.toContain('time')
    expect(line.line.text).not.toContain('project')
    expect(line.line.planning).toEqual([])
  })

  /**
   * AND THE DOCUMENT THE WRITING BOX IS SEEDED FROM HOLDS NONE OF THEM EITHER.
   *
   * This is the test that fails if somebody "fixes" the disappearance by writing the promoted groups
   * back into the box. The box's characters are exactly these lines joined, so a value re-injected
   * anywhere on the way to the screen shows up here.
   */
  it('never puts a promoted value back into the writing', async () => {
    const reply = await read()
    const document = bodyOfLines(reply.lines.map((entry) => entry.line.text))
    expect(document).toContain('- Build the controller')
    expect(document).not.toContain('{size: 15h}')
    expect(document).not.toContain('{project: default}')
    expect(document).not.toContain('{time: 15h this week}')
    // AND THE ONE THAT WAS NEVER PROMOTED IS STILL THERE. `{time: sometime next week}` names no
    // hours and no period, so filing wrote no allocation and it reached no canonical home. It
    // therefore never left the writing, and this line is what fails if filing starts taking it out
    // again — which is what it did until 17 August 2026, and what the owner's phase-gate run caught.
    expect(document).toContain('{time: sometime next week}')
    // The line nobody filed still says everything it said, because nothing moved it. It is the
    // control: this assertion is what stops the three above passing on an empty document.
    expect(document).toContain(UNFILED)
    expect(document).toContain('{size: 3h}')
  })
})

// ============================================================ what the read hands back instead

describe('the plan read carries what the values became', () => {
  /**
   * THE INVARIANT TEST THE DESIGN ASKS FOR, in one place: a line with a promoted size, time and
   * project surfaces all three from the plan read, each naming the record it was read from, and the
   * stored text holds none of them.
   */
  it('surfaces the size, the hours and the project, each naming its record', async () => {
    const reply = await read()
    const line = reply.lines.find((entry) => entry.line.id === promotedLineId)!
    const recordId = line.line.recordId
    expect(recordId).not.toBeNull()

    const byKey = new Map(line.derived.map((value) => [value.key, value]))
    expect([...byKey.keys()].sort()).toEqual(['project', 'size', 'time'])

    expect(byKey.get('size')!.says).toBe('15 hours')
    expect(byKey.get('time')!.says).toBe(`15 hours in ${weekKey(new Date())}`)
    // THE PROJECT'S NAME, NOT ITS STORED ID. `default` is what the column holds; `Default` is what
    // the project is called, and this value is prose a screen draws. The Table of the same plan
    // draws this very string, so the two views of one plan cannot come to call one project two
    // things.
    expect(byKey.get('project')!.says).toBe('Default')
    for (const value of line.derived) {
      expect(value.recordId, value.key).toBe(recordId)
      expect(value.canonical, value.key).toBe(true)
      expect(value.storedIn.length, value.key).toBeGreaterThan(0)
    }
  })

  /**
   * WORDS NOTHING COULD BE MADE OF STAY IN THE LINE, AND NOTHING IS DRAWN AS TIME PLANNED.
   *
   * `{time: sometime next week}` cannot be read as a period, so filing scheduled nothing from it.
   * Until 17 August 2026 filing took the words off the line anyway and wrote them into
   * `planning_intents`, which reads like a promotion and is not one: an intent nobody has
   * interpreted enters no total and answers no question. The words had left the box the person was
   * typing in without becoming a fact anywhere. They stay now, exactly as `{size: 3h}` does on the
   * unfiled line below, and the Writing box is where they live.
   */
  it('leaves words nothing was made of in the line, and derives no time from them', async () => {
    const reply = await read()
    const line = reply.lines.find((entry) => entry.line.id === keptLineId)!
    // THE WORDS ARE STILL IN THE LINE, and the plan read hands them back as a planning value the
    // Writing box and the Table both draw from one place.
    expect(line.line.text).toBe('- Write the report {time: sometime next week}')
    expect(line.line.planning).toEqual([{ key: 'time', value: 'sometime next week' }])
    // AND NOTHING WAS DERIVED FROM THEM. Filing wrote no allocation, so there is no canonical time
    // to read back, and no second copy of the words was written for the read to draw either.
    expect(line.derived.filter((value) => value.key === 'time')).toEqual([])
    // And nothing was invented from it: no hours were given to that record.
    expect(line.derived.some((value) => value.key === 'time' && value.canonical)).toBe(false)
  })

  /**
   * A LINE NOBODY FILED HAS NOTHING DERIVED, and that is the read refusing to invent.
   *
   * Its words still carry its size, which is where an unfiled line's planning intent lives. A read
   * that answered with a derived value here would be reading a record the line does not name.
   */
  it('derives nothing for a line that was never filed', async () => {
    const reply = await read()
    const line = reply.lines.find((entry) => entry.line.id === unfiledLineId)!
    expect(line.line.recordId).toBeNull()
    expect(line.derived).toEqual([])
    expect(line.line.planning).toEqual([{ key: 'size', value: '3h' }])
  })
})

// ============================================================ and what the Writing view draws

describe('the Writing view shows what the lines became', () => {
  /**
   * NOTHING IS REACHABLE ONLY FROM THE TABLE. The three promoted values are on the Writing screen,
   * beside the writing, without being in it.
   */
  it('draws the size, the hours and the project beside the writing', async () => {
    const said = words(await writingView())
    expect(said).toContain('What these lines became')
    // RENAMED 17 AUGUST 2026 by the owner: Estimate and Schedule, one question each.
    expect(said).toContain('Estimate')
    expect(said).toContain('15 hours')
    expect(said).toContain('Schedule')
    // THE WEEK IS NAMED THE WAY A PERSON SAYS IT, AND THE STORED KEY IS NOT ON THE SCREEN.
    // CHANGED 17 AUGUST 2026, and it is stricter than what it replaces: this used to require the
    // key itself here, and a person must not need to know
    // an internal date representation. The key is not gone from the product; Inspect still draws
    // the whole sentence, which tests/no-stored-week-key-in-normal.test.ts holds.
    expect(said).toContain(`15 hours in ${namedWeek()}`)
    expect(said).not.toContain(weekKey(new Date()))
    expect(said).toContain('Project')
    expect(said).toContain('Default')
    // The stored id is not what a person is shown.
    expect(said).not.toMatch(/\bdefault\b/)
    // AND NORMAL MODE NO LONGER SAYS WHERE THE VALUE IS STORED. It used to, once per value, and the
    // owner read the result on 16 August 2026 and asked for it to stop: normal mode is for using the
    // product. The account is not deleted — it is in Inspect, whole, and
    // tests/plan-writing-carries-values.test.ts is what fails if it stops being reachable there.
    expect(said).not.toContain('Stored in the estimate on the work this line is filed as')
  })

  /**
   * THEY ARE A READING AND NOT A FIELD. No box, no border and nothing to type into: a stored value
   * that looks editable is a lie a reader spends time on, and editing one here would write a record
   * from a text box.
   */
  it('offers nothing to type these values into', async () => {
    const markup = body(await writingView())
    // The panel has to be there before "it holds no field" means anything.
    expect(markup).toContain('pw-became')
    const panel = markup.slice(markup.indexOf('pw-became'))
    expect(panel).not.toContain('<input')
    expect(panel).not.toContain('<textarea')
    expect(panel).not.toContain('contenteditable')
  })

  /**
   * WORDS NOBODY COULD INTERPRET ARE ON THE SCREEN, AND NOTHING DRAWS THEM AS TIME PLANNED. A screen
   * that drew "sometime next week" the same way it draws "15 hours in 2026-W34" would be claiming an
   * interpretation nobody made, which is the eighth rule broken in pixels.
   *
   * WHERE THOSE WORDS NOW ARE, AND WHY THIS TEST CHANGED ON 17 AUGUST 2026. They are in the writing
   * itself, because filing no longer takes them out of it: nothing canonical was made of them, so
   * nothing earned their removal. Before this they were taken off the line and drawn only in the
   * panel below the box, marked "not scheduled yet" — and the owner's phase-gate run found that
   * panel below the fold at 1440x800, 1280x720 and 390x844. The invariant this test defends is
   * unchanged and is now checked from both sides: the words are on the screen, and the panel of what
   * lines BECAME says nothing about them at all.
   */
  it('shows words nothing was made of in the writing, and draws them nowhere as time planned', async () => {
    const said = words(await writingView())
    expect(said).toContain('sometime next week')
    // THE PANEL IS THERE AND DRAWS REAL HOURS, so the two assertions after this cannot pass on a
    // page that simply stopped drawing the panel.
    expect(said).toContain('What these lines became')
    // The week is named rather than keyed here too — see the test above for why this changed.
    expect(said).toContain(`Schedule 15 hours in ${namedWeek()}`)
    expect(said).not.toContain(weekKey(new Date()))
    // AND IT CLAIMS NOTHING ABOUT THE ROUGH WORDS. No time is listed for them and nothing is marked
    // as waiting to be scheduled, because nothing was made of them to list.
    expect(said).not.toContain('Schedule sometime next week')
    expect(said).not.toContain('not scheduled yet')
  })
})
