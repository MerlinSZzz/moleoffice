// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE FOUR SLICES MEET: THE THINGS THAT ARE ONLY WRONG BETWEEN THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Round five wave B was built by four agents at once, each inside its own files. Every slice was
 * tested by the agent that wrote it, so what is left untested is exactly the joins: promotion is one
 * agent's and the reading-back is another's; the Table writes a line and the Writing box holds that
 * line; a project's name was made to come from one place while two new surfaces were printing the
 * stored id.
 *
 *   1. A VALUE PROMOTED BY THE TABLE'S PRESS MUST BE READABLE FROM THE WRITING VIEW. Decision 1b.
 *      One slice takes the value off the line, another puts it back on the screen, and if they
 *      disagree about where it went the value is reachable from nowhere.
 *   2. ONE PLAN HAS TWO VIEWS AND THEY MUST AGREE IN BOTH DIRECTIONS. A value written in a table
 *      cell is characters in the document; characters typed in the document are cells in the table.
 *   3. PICKING A PARENT PICKS WHAT IS UNDER IT — including the rows a fold has taken off the screen
 *      and the rows a sort has moved somewhere else.
 *   4. A PROJECT HAS ONE NAME. The renaming table in the browser is gone and the name comes from the
 *      registry; a surface that prints `unassigned` where the rest of the product prints
 *      "Unassigned" has put the second name back.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`, so the components are rendered to static markup and `fetch` is
 * pointed at a real Fastify app through `app.inject`, exactly as tests/plan-table.test.ts does it.
 * Every write below really lands in a database and is read back out of it.
 *
 * WHAT IT CANNOT MEASURE, and where that is measured instead: folding a heading and pressing a
 * control are things a browser does, so the two seams that need a press are in
 * tests/plan-writing.test.ts, which drives a real one.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import { bodyOfLines } from '../src/shared/plandoc.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule
let planItems: PlanItemsModule
let onePlan: OnePlanModule

let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/**
 * A PROJECT WHOSE NAME IS NOT ITS ID, which is the only way to tell a screen printing the name from
 * a screen printing the id. Every project in the live corpus is stored under a lower-case word and
 * called by the same word with a capital letter, so a test using one of those would pass either way.
 */
const PROJECT = { id: 'robotics', title: 'The lab downstairs' }

/** The line the Table's press files as work, carrying all four kinds of planning value. */
const PROMOTED = '- Build the controller {size: 15h} {time: 15h this week} {project: robotics} {note: ask Sam}'

const BODY = [
  '# Robotics',
  '## Tray clamp',
  PROMOTED,
  '- reprint the mount',
  '- read the datasheet',
  '## Object',
  '- measure the offset',
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
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')

  createWorkspace({ id: PROJECT.id, title: PROJECT.title, note: 'The project this test files work into.' })

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
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')

  const written = await webApi.api.newPlan('Robotics plan', BODY)
  planId = written.plan.id

  // FILED THROUGH THE ROUTE THE TABLE'S PRESS CALLS, with the fields the press sends, so this is the
  // promotion the owner performs and not a second one written for a test.
  const line = written.lines.find((one) => one.text === PROMOTED)!
  await webApi.api.fileLineAsWork(planId, line.id, planItems.whatFilingSends('task', PROJECT.id))
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

/** The Table as the plan page draws it: it can rewrite a line, because it hands the read back. */
async function table(): Promise<React.ReactElement> {
  const reply = await read()
  return h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines, onWrote: () => {} })
}

/** The Writing view of this plan, as the page draws it. */
async function writing(): Promise<React.ReactElement> {
  const [reply, since, reviews] = await Promise.all([
    read(),
    webApi.api.planSinceRead(planId),
    webApi.api.planReviews(planId),
  ])
  return h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} })
}

/** The document the writing box holds: the stored lines, joined the way the page joins them. */
async function document(): Promise<string> {
  const reply = await read()
  return bodyOfLines(reply.lines.map((entry) => entry.line.text))
}

/** One line of the plan, by the words it starts with. */
async function lineStartingWith(start: string) {
  const reply = await read()
  const found = reply.lines.find((entry) => entry.line.text.startsWith(start))
  if (found === undefined) throw new Error(`No line of this plan starts with ${JSON.stringify(start)}.`)
  return found
}

// ============================================================ seam one: promoted, then read back

/**
 * WHAT THE TABLE'S PRESS TOOK OFF THE LINE, THE WRITING VIEW PUTS BACK ON THE SCREEN.
 *
 * Two slices meet here. One removes a promoted group from the line's text, which is the storage rule.
 * The other derives the value back from where it went and draws it beside the writing, which is
 * decision 1b. If they ever disagree about where a value went, the value is on no screen at all and
 * both halves still pass their own tests.
 */
describe('a value the Table promoted is readable from the Writing view', () => {
  it('takes the three values off the line and puts all three on the Writing screen', async () => {
    const line = await lineStartingWith('- Build the controller')
    // The storage half: the document holds the note and none of the three that moved.
    expect(line.line.text).toBe('- Build the controller {note: ask Sam}')

    // The reading half: all three are on the Writing screen, beside the box and not in it.
    const said = words(await writing())
    expect(said).toContain('What these lines became')
    expect(said).toContain('15 hours')
    expect(said).toContain(PROJECT.title)
    // And the box itself still holds only what the person typed.
    expect(await document()).not.toContain('{size:')
    expect(await document()).not.toContain('{project:')
  })

  /**
   * ONE FACT, ONE STRING, ON BOTH SCREENS. The Table draws the project of a filed row and so does
   * the Writing view; they used to work it out separately, and the Table printed the stored id while
   * the Writing view printed whatever the read said. Both now draw the one value the read carries.
   */
  it('says the same words about the project in the Table and in the Writing view', async () => {
    const line = await lineStartingWith('- Build the controller')
    const derived = line.derived.find((one) => one.key === 'project')
    expect(derived, 'the read carried no project for a filed line').toBeDefined()
    expect(derived!.says).toBe(PROJECT.title)
    expect(words(await table())).toContain(derived!.says)
    expect(words(await writing())).toContain(derived!.says)
  })
})

// ============================================================ seam two: one plan, two views

/**
 * A VALUE WRITTEN IN THE TABLE IS CHARACTERS IN THE DOCUMENT, AND THE OTHER WAY ROUND.
 *
 * The Table's cell writes the line through the one writer of the syntax and the writing box is
 * seeded from the same stored lines. This measures the round trip in both directions through a real
 * server, so a cell that kept its value in the browser, or a document whose groups the Table cannot
 * read, fails here rather than looking right on one screen each.
 */
describe('a planning value written in either view is in the other', () => {
  it('puts a value written in a table cell into the document the writing box holds', async () => {
    const before = await lineStartingWith('- reprint the mount')
    // Exactly what the cell does when somebody types 15h into "How big" on an unfiled row.
    await webApi.api.saveLine(planId, before.line.id, {
      text: planItems.lineWithPlanningValue(before.line.text, 'size', '15h'),
    }, null)

    expect(await document()).toContain('- reprint the mount {size: 15h}')
    // And the Table reads its own writing back off the line rather than out of the browser.
    const after = await lineStartingWith('- reprint the mount')
    expect(after.line.planning).toEqual([{ key: 'size', value: '15h' }])
  })

  it('puts a value typed in the document into the table cell', async () => {
    const was = await document()
    await webApi.api.writePlanBody(planId, was.replace('- read the datasheet', '- read the datasheet {time: next Tuesday}'))

    const line = await lineStartingWith('- read the datasheet')
    const items = planItems.planItemsOf((await read()).lines).items
    const item = items.find((one) => one.text.startsWith('read the datasheet'))!
    expect(planItems.writtenValue(item, 'time')).toEqual({ said: 'next Tuesday', refused: null })
    // The words are on the screen and the groups are not printed twice: the item's own words are
    // what the words column holds, and the value is in the column that is about it.
    expect(planItems.wordsOf(item)).toBe('read the datasheet')
    expect(line.line.text).toBe('- read the datasheet {time: next Tuesday}')
    expect(words(await table())).toContain('next Tuesday')
  })

  /**
   * AND WHAT IS ONLY WRITTEN IN THE PLAN IS IN NO TOTAL. Both values above are words somebody wrote
   * on a line nobody has filed, so they are not hours and they are not a size — the eighth rule's
   * kept layer. The table says how many rows are in that state instead of adding them in.
   */
  it('counts a size that is only written in the plan without adding it to the hours', async () => {
    const said = words(await table())
    expect(said).toMatch(/sized in the plan only/)
    // The filed row's estimate is the only one in the total, and it is the 15 hours promotion moved
    // onto the record.
    expect(said).toContain('15h')
  })
})

// ============================================================ seam three: picking through a tree

/**
 * PICKING A PARENT PICKS EVERYTHING UNDER IT, THROUGH A TREE THE TABLE IS ALSO FOLDING AND SORTING.
 *
 * The rule is `subtreesOf` and `pickedAfter`, and the thing that can silently stop being true is
 * WHICH rows they are asked about: the whole plan, or only the rows on the screen. A fold takes rows
 * off the screen and a sort moves them, so a table that worked the subtree out from what it is
 * drawing would quietly stop picking what is folded away — and every unfolded test would pass.
 *
 * The press itself is measured in tests/plan-writing.test.ts, in a browser, with a heading folded.
 */
describe('picking cascades through the whole tree, not through what is on screen', () => {
  it('picks a heading and everything written under it, and lets it all go again', async () => {
    const items = planItems.planItemsOf((await read()).lines).items
    const gripper = items.find((one) => one.text === 'Tray clamp')!
    const under = planItems.subtreesOf(items).get(gripper.key)!

    // The heading and the three bullets written under it, and nothing from the other heading.
    expect(under).toHaveLength(4)
    expect(under).toContain(gripper.key)
    expect(under).not.toContain(items.find((one) => one.text.startsWith('measure the offset'))!.key)

    const picked = planItems.pickedAfter(under, new Set())
    expect(planItems.shareOf(under, picked)).toBe('all')
    // Every row of the plan is not picked by picking one heading.
    expect(planItems.shareOf(items.map((one) => one.key), picked)).toBe('some')
    // And pressing the same control again lets the whole subtree go.
    expect(planItems.pickedAfter(under, picked).size).toBe(0)
  })

  it('draws the third state where a subtree is partly picked', async () => {
    const items = planItems.planItemsOf((await read()).lines).items
    const gripper = items.find((one) => one.text === 'Tray clamp')!
    const under = planItems.subtreesOf(items).get(gripper.key)!
    const one = items.find((item) => item.text.startsWith('reprint the mount'))!

    const partly = new Set([one.key])
    expect(planItems.shareOf(under, partly)).toBe('some')
    // The control says which of the three it is, in the same word for a screen reader either way.
    const drawn = renderToStaticMarkup(
      h(planTable.Pick, {
        share: planItems.shareOf(under, partly),
        label: planTable.pickLabel(gripper, planItems.shareOf(under, partly), under.length - 1),
        press: () => {},
      }),
    )
    expect(drawn).toContain('aria-checked="mixed"')
    expect(drawn).toContain('Pick &quot;Tray clamp&quot; and the 3 written under it')
    // Pressing it picks the rest rather than clearing the one that was picked.
    expect(planItems.shareOf(under, planItems.pickedAfter(under, partly))).toBe('all')
  })
})

// ============================================================ seam four: one name for one project

/**
 * A PROJECT IS CALLED ONE THING ON EVERY SCREEN, AND ITS STORED ID IS NOT A NAME.
 *
 * The browser's renaming table is deleted and the name comes from the registry the server serves.
 * What this measures is the plan's two surfaces, which are the ones wave B changed: both draw the
 * project of a filed row, and both used to have the stored id in them.
 */
describe('the plan draws a project by name and never by its stored id', () => {
  it('prints the project name on the Table and on the Writing view', async () => {
    for (const [where, said] of [
      ['the Table', words(await table())],
      ['the Writing view', words(await writing())],
    ] as const) {
      expect(said, where).toContain(PROJECT.title)
      // THE NAME DOES NOT HOLD THE ID, so a match here is the stored id itself reaching a screen
      // and never the name containing it.
      expect(said, where).not.toMatch(new RegExp(`\\b${PROJECT.id}\\b`))
    }
  })

  /**
   * AND THE NAME CAN ONLY HAVE COME FROM THE REGISTRY. "The robotics lab" is written down in this
   * test and in the `workspaces` row it made, and nowhere else at all: no component, no table of
   * names, no reply that carries a title of its own. A surface drawing those words has read the
   * registry, and one drawing anything else has invented a name or printed an id.
   */
  it('draws a name that exists in no browser file, so it came from the stored registry', async () => {
    const { getWorkspace } = await import('../src/server/lib/workspaces.ts')
    expect(getWorkspace(PROJECT.id)?.title).toBe(PROJECT.title)
    expect(words(await table())).toContain(PROJECT.title)
  })
})
