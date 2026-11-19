// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CELL MAY NOT DENY THE HOURS IT IS PRINTING.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, MEASURED IN CHROMIUM ON 17 AUGUST 2026 ON THE OWNER'S OWN CORPUS
 * ---------------------------------------------------------------------------------------
 *
 * Two rows of one plan table, at 1440, in one screenshot:
 *
 *     Build the arm controller   2026-W35 20h
 *                                next week    not scheduled
 *     Wire the encoder           2026-W35 6h
 *                                next month   not scheduled
 *
 * Both pieces of work really do have hours in 2026-W35 — 20 and 6 — and the cell that prints them
 * printed "not scheduled" on the very next line. The question was whether any surface prints
 * 'not scheduled' beside hours that are scheduled. It did, twice, on one screen.
 *
 * WHY THE WORDS WERE WRONG RATHER THAN THE LAYOUT. "not scheduled" has no subject. It was written
 * for the cell that holds nothing else, where the only thing it can be about is the work, and it
 * was then drawn under a stored allocation, where a reader takes it to be about the work as well.
 * The fact it means to carry is about the WORDS: Mole Office kept them and no hours came from them.
 *
 * "gave nothing any time" is a verb phrase whose subject is the words immediately to its left, so
 * it cannot be read as a claim about the work. It is true in every case the mark is drawn, because
 * these are by definition the values Mole Office could not turn into hours. It shares no word with the
 * two marks it sits beside: "no hours" is the Absence meaning the WORK has none, and a mark reading
 * "gave no hours" beside 20 stored hours would have been the same defect one step quieter.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ALLOWED TO CONCLUDE
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here presses a button. The components are rendered to static markup, and `fetch` is
 * pointed at a real Fastify app, so every allocation below really is written to a database and
 * read back out of it. The harness is the one tests/plan-table-cells.test.ts uses.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aDayThatIsNotFriday, freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply, WorkListReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planItems: PlanItemsModule

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The day every cell below is read against: Wednesday 19 August 2026, local time like every date. */
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
})

afterAll(async () => {
  await app.close()
  db.close()
})

async function aPlan(words: string): Promise<{ planId: string; lineId: string }> {
  const written = await webApi.api.newPlan(`Plan for ${words}`, ['# Robotics', `- ${words}`].join('\n'))
  const line = written.lines.find((one) => one.text === `- ${words}`)
  if (line === undefined) throw new Error(`The plan has no line reading "- ${words}".`)
  return { planId: written.plan.id, lineId: line.id }
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

describe('the Time given cell, when the work has hours AND the line kept words', () => {
  it('prints the hours and does not deny them', async () => {
    const { planId, lineId } = await aPlan('build the arm controller')
    await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    const day = planItems.serverDay((await webApi.api.today()).day)

    // WORDS PANELX KEEPS AND SCHEDULES NOTHING FROM, and then real hours in a real week.
    await planItems.giveItemTimeFromWords(planId, await itemOf(planId, lineId), 'sometime next week', '', day)
    await planItems.giveItemTimeFromWords(planId, await itemOf(planId, lineId), 'this week', '20h', day)

    const said = words(h(planItems.ItemHours, { item: await itemOf(planId, lineId), acts: await actsFor(planId) }))

    // The hours really are there, in the week they were given to.
    expect(said).toContain('20h')
    // The words really are there, beside the hours rather than instead of them.
    expect(said).toContain('sometime next week')

    // THE DEFECT. A cell printing 20h may not print a bare denial of a schedule under it.
    expect(said).not.toContain('not scheduled')
    // AND WHAT IT SAYS INSTEAD NAMES ITS SUBJECT: the WORDS gave nothing any time, and the work
    // is not empty. It must also share no word with the Absence that means the work has none.
    expect(said).toContain('gave nothing any time')
    expect(said).not.toContain('no hours')
  })

  it('says the same thing about the words when the work has no hours at all', async () => {
    // THE CONTROL FOR THE ONE ABOVE. The mark is one phrase in both cases, because it is a fact
    // about the words and the words did not change. Two phrasings for one fact is how a surface
    // comes to disagree with itself, which is the defect this file exists for.
    const { planId, lineId } = await aPlan('order the bearings')
    await webApi.api.fileLineAsWork(planId, lineId, { kind: 'task', workspaceId: 'default' })
    // See `aDayThatIsNotFriday`: on a Friday these words read as a date and nothing is kept.
    const day = aDayThatIsNotFriday(planItems.serverDay((await webApi.api.today()).day))
    await planItems.giveItemTimeFromWords(planId, await itemOf(planId, lineId), 'before Friday', '', day)

    const said = words(h(planItems.ItemHours, { item: await itemOf(planId, lineId), acts: await actsFor(planId) }))

    expect(said).toContain('before Friday')
    expect(said).toContain('gave nothing any time')
    expect(said).not.toContain('not scheduled')
    // And it does not claim the work is empty either — the words are the answer to "what time".
    expect(said).not.toContain('nobody has given it any')
  })

  it('says it the same way on a line nobody has filed as work', async () => {
    const { planId, lineId } = await aPlan('shim the mount')
    const day = planItems.serverDay((await webApi.api.today()).day)
    await planItems.giveItemTimeFromWords(
      planId,
      await itemOf(planId, lineId),
      'the first half of September',
      '',
      day,
    )

    const said = words(
      h(planItems.ItemPlanned, {
        item: await itemOf(planId, lineId),
        acts: await actsFor(planId),
        which: 'time',
        canRewrite: true,
      }),
    )
    expect(said).toContain('the first half of September')
    expect(said).toContain('gave nothing any time')
  })

  it('leaves the reading of an unfiled line saying "not scheduled", because nothing there can be', () => {
    // NOT EVERY "not scheduled" IS WRONG. This one is about a PERIOD Mole Office read out of the words,
    // on a line nobody has filed, where no hours can exist at all — so it cannot be beside hours
    // and it cannot be misread. Deleting it would take away the one thing that stops "2026-W35"
    // looking like a week something was put in.
    const said = words(h(planItems.ReadOfTimeWords, { said: 'next week', today: WEDNESDAY }))
    expect(said).toContain('not scheduled')
  })
})
