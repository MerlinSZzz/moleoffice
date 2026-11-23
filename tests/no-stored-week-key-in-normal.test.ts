// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NORMAL MODE NAMES A WEEK THE WAY A PERSON SAYS IT, AND KEEPS THE STORED KEY FOR INSPECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, IN CHROMIUM, ON 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * A person typed "next week" into the plan table, gave the line 20 hours, and Normal mode answered
 * with the stored key four times over:
 *
 *   1. in the scheduling panel   — `"next week" is 2026-W35, 2026-08-24 to 2026-08-30. 20 hours.`
 *   2. in the confirmation       — `One allocation written in 2026-W35, and it records that…`
 *   3. under the writing box     — `Time given · 20 hours in 2026-W35`
 *   4. in the notice after a rename — `This plan can no longer see: Time given · 20 hours in 2026-W35`
 *
 * The rule: **a person is never required to know an internal date representation.**
 * `2026-W35` is ISO-8601, Monday first, and the year in it is the week-year rather than the calendar
 * year. It is exactly right and no reader should have to know it.
 *
 * `PeriodInWords` had already fixed the two table cells, where a period arrives on its own. These
 * four have it inside a sentence Mole Office composed, so `periodsInWords` names the keys in the sentence
 * and leaves every other word as it was written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS HOLD, AND WHY BOTH HALVES ARE HERE
 * ---------------------------------------------------------------------------------------
 *
 * Normal mode says the week's name and does not print the key. Developer mode still shows the
 * sentence exactly as it was sent — nothing is destroyed and nothing becomes unreachable, which is
 * `docs/UX-CONTRACT.md`'s rule for the two modes. Both halves are asserted everywhere, because a
 * drawing that simply stopped saying anything would pass a check that only looked for the key.
 *
 * THE SENTENCES ARE REAL. The two on screen come back from a real Fastify app through `app.inject`,
 * so the day the server writes a key somewhere new these tests see it.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { weekKey } from '../src/shared/planning.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { PlanWritingState } from '../src/web/pages/plans/PlanWriting.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type WebApi = typeof import('../src/web/api.ts')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')
type ItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type PlanningModule = typeof import('../src/web/components/Planning.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let writing: WritingModule
let planItems: ItemsModule
let planning: PlanningModule
let mode: ModeModule

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A day inside a week, so "this week" reads as one period rather than as nothing. */
const TODAY = new Date(2026, 7, 17, 9, 0, 0)

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
    location: { hash: '', search: '' },
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
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')
  planning = await import('../src/web/components/Planning.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(el: React.ReactElement): string {
  return renderToStaticMarkup(el)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The same element read in one of the two modes, and the mode put back afterwards. */
function screen(el: React.ReactElement, which: 'normal' | 'inspect'): string {
  mode.setMode(which)
  try {
    return words(el)
  } finally {
    mode.setMode('normal')
  }
}

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

async function openAgain(id: string): Promise<PlanWritingState> {
  return openPage(await webApi.api.planBlocks(id))
}

/** This week's stored key, and what the product calls that week. Never two namings. */
const thisWeek = (): string => weekKey(TODAY)
const named = (): string => planning.periodSaid(thisWeek(), null).name

/**
 * A plan with one line filed as work and given hours, written through the product's own doors.
 */
async function planWithHours(): Promise<{
  planId: string
  text: string
  outcome: { ok: boolean; said: string }
}> {
  const text = `- reprint the mount ${Math.random()}`
  const made = await webApi.api.newPlan(`A week of hours ${Math.random()}`, `${text} {size: 3h}\n- gaze`)
  const planId = made.plan.id
  const opened = await webApi.api.planBlocks(planId)
  const first = opened.lines[0]!
  await webApi.api.fileLineAsWork(planId, first.line.id, { kind: 'task', workspaceId: 'default' })

  const now = await webApi.api.planBlocks(planId)
  const item = planItems.planItemsOf(now.lines).items.find((one) => one.entry.line.id === first.line.id)
  if (item === undefined) throw new Error('the filed line is not an item of the plan')
  const outcome = await planItems.giveItemTimeFromWords(planId, item, 'this week', '3', TODAY)
  return { planId, text, outcome }
}

// ============================================================ the reader itself

describe('naming the periods in a sentence Mole Office wrote', () => {
  it('names a week key and leaves every other word alone', () => {
    expect(planning.periodsInWords('One allocation written in 2026-W35, and it records that.')).toBe(
      'One allocation written in Week of 24 August, and it records that.',
    )
  })

  it('names a month key', () => {
    expect(planning.periodsInWords('20 hours in 2026-09 — dropped')).toBe('20 hours in September 2026 — dropped')
  })

  it('leaves a date alone, because a date is something a person reads', () => {
    // The same sentence carries both: the key is named, the two dates beside it are not touched.
    expect(planning.periodsInWords('"next week" is 2026-W35, 2026-08-24 to 2026-08-30.')).toBe(
      '"next week" is Week of 24 August, 2026-08-24 to 2026-08-30.',
    )
  })

  it('leaves a key nothing can place on a calendar exactly as it is stored', () => {
    // ABSENCE BEATS A GUESS. There is no week 99, so there is no name for it, and the stored key is
    // then the only true thing that can be said.
    const said = 'Nothing was written for 2026-W99.'
    expect(planning.periodsInWords(said)).toBe(said)
  })

  it('leaves ordinary words alone', () => {
    // THE CONTROL FOR THE READER. A rewriter that damaged sentences with no period in them would
    // pass every test above.
    const said = 'The work itself was not changed, and 3 of 4 lines were written.'
    expect(planning.periodsInWords(said)).toBe(said)
  })
})

// ============================================================ on the screen

describe('what a person is shown after giving a line hours', () => {
  it('is the server’s own sentence, and the server writes the stored key into it', async () => {
    // THE CONTROL FOR EVERYTHING BELOW. Without it, a page that stopped saying anything at all
    // would pass every "no key on screen" check in this file.
    const { outcome } = await planWithHours()
    expect(outcome.ok).toBe(true)
    expect(outcome.said).toContain(`in ${thisWeek()}`)
  })

  it('names the week in Normal mode and prints no stored key', async () => {
    const { text, outcome } = await planWithHours()
    const drawn = screen(h(planItems.PressReport, { results: [{ text, outcome }] }), 'normal')

    expect(drawn).toContain(`One allocation written in ${named()}`)
    expect(drawn).not.toContain(thisWeek())
    // AND THE REST OF THE SENTENCE IS STILL THE SENTENCE.
    expect(drawn).toContain('it records that it came from this line')
    expect(drawn).toContain('The work itself was not changed')
  })

  it('still shows the stored key in Developer mode', async () => {
    const { text, outcome } = await planWithHours()
    const drawn = screen(h(planItems.PressReport, { results: [{ text, outcome }] }), 'inspect')
    expect(drawn).toContain(thisWeek())
  })
})

describe('the panel under the writing box', () => {
  it('names the week, keeps the hours, and prints no stored key in Normal mode', async () => {
    const { planId } = await planWithHours()
    const page = h(writing.PlanWriting, { state: await openAgain(planId) })

    const normal = screen(page, 'normal')
    expect(normal).toContain('What these lines became')
    expect(normal).toContain(`3 hours in ${named()}`)
    expect(normal).not.toContain(thisWeek())
    // AND DEVELOPER MODE KEEPS THE READING WHOLE.
    expect(screen(page, 'inspect')).toContain(`3 hours in ${thisWeek()}`)
  })
})

/**
 * WHAT CHANGED HERE ON 17 AUGUST 2026. This used to lose the work by RENAMING the filed line. The
 * owner reversed that rule — editing prose is normal planning behaviour and must not cost you the
 * work you filed — so a renamed line keeps its row and its record and there is no notice to draw.
 * The line is taken out of the plan instead, which is what a real loss is now. The claim is the one
 * it was: the notice names the week and prints no stored key at a reader in Normal mode.
 */
describe('the notice after a filed line is taken out of the plan', () => {
  it('names the week the hours sat in, and prints no stored key in Normal mode', async () => {
    const { planId } = await planWithHours()
    const page = openPage(await webApi.api.planBlocks(planId))
    page.write('- gaze')
    const done = await page.saveNow()
    if (done.did !== 'stored') throw new Error(`the save did not store: ${done.did}`)

    const drawn = h(writing.PlanWriting, { state: await openAgain(planId) })
    const normal = screen(drawn, 'normal')
    expect(normal).toContain('This plan can no longer see:')
    expect(normal).toContain(`3 hours in ${named()}`)
    expect(normal).not.toContain(thisWeek())
    // CRITERION CHANGE, as decided: the notice no longer adds that nothing was deleted.
    expect(screen(drawn, 'inspect')).toContain(`3 hours in ${thisWeek()}`)
  })
})

/**
 * THE FOURTH PLACE, AND WHY IT IS HALF A TEST AND SAYS SO.
 *
 * The scheduling panel writes its sentence while somebody is typing, and it waits on the server for
 * the day it reads the words against. A static render never gets that day, so the panel cannot be
 * driven here and the drawing itself is not asserted. What is asserted is the sentence it draws and
 * the reader it draws it through, which is where a mistake would be.
 *
 * THE DRAWING WAS MEASURED IN CHROMIUM instead, on 17 August 2026 at 1440x900, on a plan whose line
 * was given 20 hours from the words "next week": the panel read `"next week" is Week of 24 August,
 * 2026-08-24 to 2026-08-30. 20 hours.` and no key was on the screen.
 */
describe('the scheduling panel, before anything is written', () => {
  it('composes a sentence with the stored key in it, and the reader names the week in it', () => {
    const will = planItems.whatGivingTimeWillDo('this week', '3', TODAY)
    if (will.reading === null) throw new Error('the panel said nothing about the words')
    expect(will.reading).toContain(thisWeek())
    expect(planning.periodsInWords(will.reading)).toContain(named())
    expect(planning.periodsInWords(will.reading)).not.toContain(thisWeek())
    // AND THE HOURS SURVIVE THE NAMING, which is the half of it a rewriter could quietly eat.
    expect(planning.periodsInWords(will.reading)).toContain('3 hours')
  })
})
