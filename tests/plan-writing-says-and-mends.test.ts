// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE WRITING SURFACE TEACHES, WHAT A SAVE ADMITS, AND WHAT HAPPENS AFTER A LINE LOSES ITS WORK.
 *
 * ---------------------------------------------------------------------------------------
 * THREE MEASUREMENTS, ALL FROM THE SAME ELEVEN-STEP RUN
 * ---------------------------------------------------------------------------------------
 *
 * Three people who had never seen Mole Office planned real work in it and it held. Three things were
 * wrong on the way, and all three are about the product not saying what it knows.
 *
 * ONE. A save that understood nothing reported plain success. They typed an outline indented with
 * spaces and no markers, pressed Ctrl+S, and read "Saved the writing — this plan holds 18 lines."
 * The table beside the box knew the truth and said it — "17 lines of prose, which is writing rather
 * than work" — on the half of the screen they were not looking at.
 *
 * TWO. Nothing taught the shape. All three guessed the syntax from two seeded plans on the list,
 * and the only help on the box said "Indent with spaces instead", which points at the one shape
 * that makes a plan of nothing but items Mole Office cannot see.
 *
 * THREE. A save that dropped the record a line pointed at left one notice with a press that made it
 * go away, gone on reload, while the easiest thing left on screen was the press that files a SECOND
 * piece of work. (Rewriting a filed line was what dropped the record when this was measured. The
 * owner reversed that on 17 August 2026 and a rewritten line keeps its work; the loss these tests
 * hold down is the one Mole Office still cannot follow, and the describe block below says which.)
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS HOLD DOWN
 * ---------------------------------------------------------------------------------------
 *
 *   1. A save says how many lines became items, from the count the table is drawn from, and says
 *      the shape of an item when none did.
 *   2. It says nothing about items when no writing was sent, because a save of the name alone knows
 *      nothing about them.
 *   3. The empty box shows the shape of a plan, and EVERY LINE OF THAT SHAPE IS TRUE OF THE PARSER —
 *      written into a real plan and read back, the lines it draws as items are items and the line it
 *      calls writing is writing.
 *   4. A lost binding survives a reload, names the work, and offers the repair.
 *   5. The repair points the line at the work that already exists. No second record is made.
 *   6. A loss that has been mended elsewhere is not shown again.
 *   7. A repair that the server refuses says so, in the server's own words, and the loss stays on
 *      the page.
 *
 * The harness is tests/plan-stale-save.test.ts's: a real Fastify app through `app.inject`, and a
 * real `usePlanWriting` state handed out of one render.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { PlanWritingState } from '../src/web/pages/plans/PlanWriting.tsx'
import { t } from '../src/shared/i18n.ts'

type WebApi = typeof import('../src/web/api.ts')
type WritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')
type ItemsModule = typeof import('../src/web/components/plans/planitems.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let writing: WritingModule
let planItems: ItemsModule

let planId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The shape the owner's testers typed: indented with spaces, with no marker anywhere. */
const AN_OUTLINE = ['Build a baseline', '  Read the brief', '  Wire the encoder'].join('\n')

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
  writing = await import('../src/web/pages/plans/PlanWriting.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')
})

afterAll(async () => {
  await app.close()
  db.close()
})

beforeEach(async () => {
  const written = await webApi.api.newPlan(`Plan ${Math.random()}`, '- the first thing')
  planId = written.plan.id
})

let handed: PlanWritingState | null = null
function Probe({ reply }: { reply: PlanBlocksReply }) {
  handed = writing.usePlanWriting(reply.plan.id, reply.lines, reply.plan.title, reply.version)
  return null
}

/** One page opened on one read of a plan, with the writing state it really uses. */
function openPage(reply: PlanBlocksReply): PlanWritingState {
  handed = null
  renderToStaticMarkup(h(Probe, { reply }))
  if (handed === null) throw new Error('the writing state was never handed out')
  return handed
}

/** Opening the plan again, as a reload does: a fresh read, a fresh page, nothing carried over. */
async function openAgain(id = planId): Promise<PlanWritingState> {
  return openPage(await webApi.api.planBlocks(id))
}

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

// ============================================================ what a save admits

describe('a save that understood nothing as an item', () => {
  /**
   * IT SAYS SO WHERE THE PERSON IS LOOKING. The press they made was Ctrl+S and the answer to a press
   * is the sentence beside it; the table's own count is on a half of the screen they may not have
   * open at all.
   */
  it('says how many lines it stored and that none of them is an item', async () => {
    const page = await openAgain()
    page.write(AN_OUTLINE)
    const done = await page.saveNow()
    if (done.did !== 'stored') throw new Error(`the save did not store: ${done.did}`)

    expect(done.what.lines).toBe(3)
    expect(done.what.items).toBe(0)

    const said = writing.sayOfSave(done).words
    expect(said).toContain('Saved the writing')
    expect(said).toContain('3 lines and no items')
    // AND THE SHAPE, SHOWN RATHER THAN EXPLAINED. Three characters, in the order they go in.
    expect(said).toContain('A line becomes an item when it starts with "- " or "# " or "1. ".')
  })

  /**
   * AND THE COUNT IS THE TABLE'S COUNT, not a second reckoning of the same document.
   *
   * This is the assertion that fails if somebody ever writes a little parser here to answer "how
   * many items" — the two would then be free to disagree about the same plan, which is the defect
   * this repository keeps finding.
   */
  it('counts items the way the table counts them', async () => {
    const page = await openAgain()
    page.write(['# Week of 17 August', '- Build the controller', 'A thought about it.'].join('\n'))
    const done = await page.saveNow()
    if (done.did !== 'stored') throw new Error(`the save did not store: ${done.did}`)

    const read = planItems.planItemsOf((await webApi.api.planBlocks(planId)).lines)
    expect(done.what.items).toBe(read.items.length)
    expect(done.what.items).toBe(2)
    expect(read.notItems.prose).toBe(1)

    const said = writing.sayOfSave(done).words
    expect(said).toContain('3 lines and 2 items')
    // NOTHING IS TAUGHT TO SOMEBODY WHO ALREADY HAS AN ITEM. A sentence on every save is furniture.
    expect(said).not.toContain('A line becomes an item')
  })

  /**
   * A SAVE OF THE NAME ALONE SAYS NOTHING ABOUT ITEMS, because it sent no writing and read no
   * document. Absence beats a guess, including a guess of zero.
   */
  it('says nothing about items when only the name was sent', async () => {
    const page = await openAgain()
    page.writeName('A better name for this plan')
    const done = await page.saveNow()
    if (done.did !== 'stored') throw new Error(`the save did not store: ${done.did}`)

    expect(done.what.items).toBeNull()
    expect(writing.sayOfSave(done).words).toBe('Saved the name.')
  })
})

// ============================================================ what the box teaches

describe('the shape of a plan, shown in the empty box', () => {
  /** The placeholder as the browser would get it, out of the markup this component really renders. */
  const shapeInTheBox = (state: PlanWritingState): string => {
    const markup = renderToStaticMarkup(h(writing.PlanWriting, { state }))
    const found = /placeholder="([^"]*)"/.exec(markup)
    if (found === null) throw new Error('the writing box has no placeholder at all')
    return found[1]!.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  }

  it('draws a heading, an item, a part of it and a line of writing', async () => {
    const shape = shapeInTheBox(await openAgain())
    expect(shape).toContain('# What this plan is for')
    expect(shape).toContain('- Something to do')
    expect(shape).toContain('  - A smaller part of it')
    expect(shape).toContain('writing rather than work')
  })

  /**
   * AND EVERY LINE OF IT IS TRUE.
   *
   * A shape drawn where somebody is about to type is a promise about what the product will do with
   * it, so it is written into a real plan and read back through the very function the table's rows
   * come from. Four of its lines are items and one is writing, exactly as it says of itself.
   *
   * THIS IS THE TEST THAT FAILS IF THE PARSER MOVES. An example that has drifted from the parser is
   * worse than no example: it teaches the wrong shape with the product's own authority.
   */
  it('is a plan Mole Office really reads that way', async () => {
    const shape = shapeInTheBox(await openAgain())
    const written = await webApi.api.newPlan(`The shape itself ${Math.random()}`, shape)
    const read = planItems.planItemsOf((await webApi.api.planBlocks(written.plan.id)).lines)

    expect(read.items.map((item) => item.kind)).toEqual(['heading', 'bullet', 'bullet', 'tickbox'])
    // The one line with no mark in front of it, which is what that line says about itself.
    expect(read.notItems.prose).toBe(1)
    expect(read.notItems.unreadable).toBe(0)
    // The part is drawn under the item above it, which is the other thing the shape claims.
    expect(read.items[2]!.depth).toBe(read.items[1]!.depth + 1)
  })

  // CRITERION CHANGE, as decided: the help under the box is one sentence on the keys now, and it no
  // longer teaches indenting, so the case that read the indenting sentence is gone.
})

// ============================================================ work that lost its line

/**
 * WHAT CHANGED HERE ON 17 AUGUST 2026, AND WHY EVERY CLAIM BELOW IS THE ONE IT WAS.
 *
 * These tests used to lose the work by rewriting the filed line's words, because that is what
 * saving a document did then. The owner reversed that rule — "a filed/bound line must not lose
 * access to its canonical work merely because its visible words changed. Editing prose is normal
 * planning behaviour" — so a line rewritten where it stood keeps its row and its work.
 *
 * THE LOSS IS NOW CAUSED BY A SHAPE PANELX CANNOT FOLLOW: the filed line is rewritten AND SPLIT IN
 * TWO. One line was removed and two were added in its place, so nothing can say which of the two the
 * old row is, and Mole Office drops the binding rather than guessing at one. Everything after that is
 * exactly as it was: the page remembers the loss, names the work, offers the repair, and forgets it
 * when it is mended.
 */
describe('a line that was filed as work and then split in two', () => {
  /** File the first line of a plan as work and hand back the plan and the record. */
  async function filedPlan(): Promise<{ id: string; recordId: string; text: string }> {
    const text = `- reprint the mount ${Math.random()}`
    const made = await webApi.api.newPlan(`Losing a line ${Math.random()}`, `${text}\n- gaze`)
    const opened = await webApi.api.planBlocks(made.plan.id)
    const first = opened.lines[0]!
    const filed = await webApi.api.fileLineAsWork(made.plan.id, first.line.id, {
      kind: 'task',
      workspaceId: 'default',
    })
    return { id: made.plan.id, recordId: filed.recordId, text }
  }

  /**
   * Rewrite the filed line AND split it into two lines, which is what takes the record off it.
   *
   * Rewriting it on its own keeps the record now. Two lines standing where one stood is the shape
   * Mole Office will not guess at, so this is what a real loss looks like from the writing box.
   */
  async function rewriteIt(id: string, text: string): Promise<PlanWritingState> {
    const page = openPage(await webApi.api.planBlocks(id))
    page.write(`${text} tomorrow\n${text} later\n- gaze`)
    const done = await page.saveNow()
    if (done.did !== 'stored') throw new Error(`the save did not store: ${done.did}`)
    return page
  }

  /**
   * IT IS STILL THERE AFTER A RELOAD, and that is the whole first half of the fix.
   *
   * Nothing on the server records that a line USED to point at a record: the row is deleted and the
   * record simply has no line. So this browser is the only place the loss is written down, and a
   * notice that went away by itself left somebody with a piece of work nothing points at and no way
   * to find out which one.
   */
  it('is still on the page when the plan is opened again', async () => {
    const { id, recordId, text } = await filedPlan()
    await rewriteIt(id, text)

    const reopened = await openAgain(id)
    expect(reopened.removed).toHaveLength(1)
    expect(reopened.removed[0]!.recordId).toBe(recordId)
    expect(reopened.removed[0]!.text).toBe(text)
    expect(reopened.removedFault).toBeNull()
  })

  /**
   * AND THE NOTICE OFFERS THE REPAIR AND NAMES WHAT FILING IT AGAIN WOULD COST.
   *
   * The press that makes the duplicate is in the table beside this box, it is the obvious next
   * thing to do, and nothing over there can say what it would do. So this does.
   */
  it('offers to point a line at the work rather than file it a second time', async () => {
    const { id, recordId, text } = await filedPlan()
    await rewriteIt(id, text)
    const said = words(h(writing.PlanWriting, { state: await openAgain(id) }))

    // CRITERION CHANGE, as decided: the notice counts the lost line and offers the press. It no
    // longer explains what filing again would cost or that it stays after a reload.
    expect(said).toContain(t('planWriting.lostCount', { n: 1 }))
    expect(said).toContain(text)
    expect(said).toContain('Point that line at it')
    // The rewritten line is offered as somewhere to point it, and the record id is not on screen.
    expect(said).toContain(`${text} tomorrow`)
    expect(said).not.toContain(recordId)
  })

  /**
   * THE REPAIR ITSELF: the line points at the work that already exists, and no second record is
   * made.
   *
   * The record id at the end is the one from before the rename. That is the assertion: filing it
   * again would give a different id, leave the first record where it was, and look identical on
   * screen.
   */
  it('points the rewritten line at the work that already exists', async () => {
    const { id, recordId, text } = await filedPlan()
    await rewriteIt(id, text)
    const page = await openAgain(id)

    const target = page.saved.find((entry) => entry.line.text === `${text} tomorrow`)
    if (target === undefined) throw new Error('the rewritten line is not in the plan')
    const done = await page.pointAgain(recordId, target.line.id)
    expect(done).toEqual({ ok: true })

    const after = await webApi.api.planBlocks(id)
    const mended = after.lines.find((entry) => entry.line.id === target.line.id)!
    expect(mended.line.recordId).toBe(recordId)
    expect(mended.work?.id).toBe(recordId)

    // AND THE LOSS IS NOT REMEMBERED ANY MORE, on this page or on the next one to open the plan.
    expect((await openAgain(id)).removed).toHaveLength(0)
  })

  /**
   * AND A MENDED LOSS IS FORGOTTEN RATHER THAN KEPT BESIDE THE NEXT ONE.
   *
   * The repair takes the loss out of what this browser remembers. Rewriting the same line again
   * loses the same work a second time, and the notice must say that once — a page that had kept the
   * first one would name the same piece of work twice and neither entry would be wrong, which is
   * the kind of list a person stops reading.
   */
  it('forgets a loss it has mended, so losing the same work again says it once', async () => {
    const { id, recordId, text } = await filedPlan()
    await rewriteIt(id, text)
    const page = await openAgain(id)
    const target = page.saved.find((entry) => entry.line.text === `${text} tomorrow`)
    if (target === undefined) throw new Error('the rewritten line is not in the plan')
    expect(await page.pointAgain(recordId, target.line.id)).toEqual({ ok: true })

    const again = await openAgain(id)
    again.write(`${text} on Friday\n- gaze`)
    expect((await again.saveNow()).did).toBe('stored')

    const after = await openAgain(id)
    expect(after.removed).toHaveLength(1)
    expect(after.removed[0]!.text).toBe(`${text} tomorrow`)
  })

  /**
   * A LOSS SOMEBODY MENDED SOMEWHERE ELSE IS NOT SHOWN AGAIN.
   *
   * The table can point a line at work too. Nothing tells this browser that it happened, so the
   * remembered list is checked against the lines the plan really holds before it is drawn — a
   * notice saying a record has no line, beside a line pointing straight at it, would be the product
   * lying about its own corpus.
   */
  it('is dropped when a line points at that work again', async () => {
    const { id, recordId, text } = await filedPlan()
    await rewriteIt(id, text)
    expect((await openAgain(id)).removed).toHaveLength(1)

    // The table's own door, so nothing on the writing side knows this happened.
    const now = await webApi.api.planBlocks(id)
    const target = now.lines.find((entry) => entry.line.text === `${text} tomorrow`)!
    await webApi.api.pointLineAtWork(id, target.line.id, { recordId })

    expect((await openAgain(id)).removed).toHaveLength(0)
  })

  /**
   * AND A REPAIR THE SERVER REFUSES IS REPORTED AS A REFUSAL, in the server's own sentence.
   *
   * It names the record the line already points at, which is the only thing a person can act on.
   * The loss stays on the page, because it is still lost.
   */
  it('says why when the line already points at other work, and keeps the loss', async () => {
    const { id, recordId, text } = await filedPlan()
    await rewriteIt(id, text)
    const page = await openAgain(id)

    // The other line in the plan is filed as work of its own, so it is not free to be pointed.
    const other = page.saved.find((entry) => entry.line.text === '- gaze')!
    await webApi.api.fileLineAsWork(id, other.line.id, { kind: 'task', workspaceId: 'default' })

    const done = await page.pointAgain(recordId, other.line.id)
    if (done.ok) throw new Error('pointing a line that already points somewhere was allowed')
    // THE SERVER'S OWN SENTENCE, which names the work the line already points at. Flattening it to
    // "that did not work" would throw away the only half a person can act on.
    expect(done.why).toContain('This line already points at')
    expect((await openAgain(id)).removed).toHaveLength(1)
  })
})
