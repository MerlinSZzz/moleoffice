// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOAL DRAWING IS WHOLE AT ITS EDGES, AND FINISHED WHEN THE PAGE SAYS IT IS READY.
 *
 * CRITERION CHANGE (wave 13j round 11, on goals): the drawing is on the Goals page, #/horizons, since the answer
 * to question 16 of wave 13k's proposal (report n9Mjk3c_sJRu) moved it off the Schedule, #/plan. The
 * three measurements are unchanged; the address they are taken at is the Goals page.
 *
 * Wave 13q and wave 13k round 11 photographed the drawing under "What this period is working toward"
 * cut or unfinished. Three causes were found, all on main before round 11:
 *
 *   1. The page marked itself ready while the drawing was still laying out its groups, so a picture
 *      taken at the mark showed "Working out where everything goes." The layout now counts as
 *      something the page is still waiting for (lib/ready.ts).
 *   2. The drawing opens scrolled to the goal it is about, but the widest scroll it allowed left out
 *      the plane's padding, so a goal at the right end of the drawing opened cut in half.
 *   3. A group's heading sticks to the pane's left edge, and the pane's edge fade (InReach.tsx) lay
 *      over its caret and first letter, so a folded group read "olded because". The heading now
 *      stops as far in as the fade is deep.
 *
 * And the sentence under a folded group of one record said it was on this period's plan, when it
 * was folded because it is not.
 *
 * Made-up records in this test's own office; nothing here is a real person's work.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
let goalId: string
/** How many times the page asked for the layout code. Zero would mean the slow load below never happened. */
let layoutCodeAsked = 0
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(reply.status, await reply.clone().text()).toBe(201)
  return ((await reply.json()) as { record: { id: string } }).record.id
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  const reply = await fetch(`${app.api}/api/links`, { method: 'POST', headers, body: JSON.stringify({ fromId, toId, type }) })
  expect(reply.status, await reply.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'plan-drawing-edges', workspace: 'default', viewport: { width: 990, height: 1000 } })
  // A goal at the right end of a drawing five columns wide, which is wider than the pane at 990.
  // Only records one link from a goal, a deadline or a direction are drawn, so the columns
  // alternate: direction, task, deadline, task, goal. Not a straight run, because a straight run is
  // drawn as a row of chips with no layout, so a second task also serves the goal.
  goalId = await file('goal', 'The harbour survey is ready for the port office', {
    horizon: 'short',
    what: 'The port office has the survey and its tide tables.',
    state: 'open',
  })
  const drone = await file('direction', 'Sound the channel from a small drone', {})
  const sound = await file('task', 'Sound the north channel', { state: 'todo' })
  const due = await file('obligation', 'Soundings to the pilots by Friday', { owedTo: 'The pilots', due: '2026-10-02' })
  const tables = await file('task', 'Write the tide tables', { state: 'todo' })
  const letter = await file('task', 'Send the covering letter', { state: 'todo' })
  await link(drone, sound, 'blocks')
  await link(sound, due, 'blocks')
  await link(due, tables, 'blocks')
  await link(tables, goalId, 'serves')
  await link(letter, goalId, 'serves')
  // Two directions with nothing on the plan: each is a group of one record, and starts folded.
  await file('direction', 'Survey by drone instead of by boat', {})
  await file('direction', 'Share the tables with the sailing club', {})

  // THE LAYOUT CODE ARRIVES LATE, ON PURPOSE. Without the delay the layout can finish before the
  // page's ready mark goes on by luck, and the first case below would pass with its fix removed.
  await app.page.route(/elk\.bundled/, async (route) => {
    layoutCodeAsked += 1
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await route.continue()
  })
  await app.page.goto(`${app.site}/#/horizons`)
  await waitForThePage(app.page)
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('the goal drawing on the Goals page, at 990', () => {
  it('is laid out when the page says it is ready', async () => {
    const at = await app.page.evaluate(() => ({
      waiting: document.querySelectorAll('.pg-band-waiting').length,
      planes: document.querySelectorAll('.pg-band-plane').length,
      foot: document.querySelector('.pg-canvas-state')?.textContent ?? null,
    }))
    expect(layoutCodeAsked, 'the page never asked for the layout code, so the slow load was never tested').toBeGreaterThan(0)
    expect(at.planes, `the page said it was ready with no group laid out; the foot said "${String(at.foot)}"`).toBeGreaterThan(0)
    expect(at.waiting, 'the page said it was ready while a group was still working out where its cards go').toBe(0)
  })

  it('opens with the goal it is about whole inside the pane', async () => {
    await app.page.waitForSelector('.pg-band-plane', { timeout: 30_000 })
    await app.page.waitForTimeout(300)
    const seen = await app.page.evaluate((id) => {
      const pane = document.querySelector('.pg-canvas') as HTMLElement
      const card = document.querySelector(`.pg-node[data-record-id="${id}"]`) as HTMLElement | null
      const p = pane.getBoundingClientRect()
      const c = card?.getBoundingClientRect()
      return {
        wider: pane.scrollWidth - pane.clientWidth,
        card: c === undefined ? null : { left: c.left - p.left, right: p.left + pane.clientWidth - c.right },
      }
    }, goalId)
    expect(seen.wider, 'the drawing fits the pane, so this measured nothing').toBeGreaterThan(0)
    expect(seen.card, 'the goal has no card on the drawing').not.toBeNull()
    expect(seen.card!.right, 'the goal card runs past the right edge of the pane').toBeGreaterThanOrEqual(0)
    expect(seen.card!.left, 'the goal card runs past the left edge of the pane').toBeGreaterThanOrEqual(0)
  })

  it('keeps each folded group heading clear of the left edge fade, and says it is folded', async () => {
    const seen = await app.page.evaluate(() => {
      const fade = document.querySelector('.pg-canvas-wrap > .px-reach-edge[data-side="left"]')
      const fadeRight = fade?.getBoundingClientRect().right ?? null
      const heads = [...document.querySelectorAll('.pg-band[data-folded="1"]')].map((band) => ({
        caret: band.querySelector('.pg-band-caret')!.getBoundingClientRect().left,
        why: band.querySelector('.pg-band-why')!.getBoundingClientRect().left,
        whyText: band.querySelector('.pg-band-why')!.textContent,
      }))
      return { fadeRight, heads }
    })
    expect(seen.fadeRight, 'the pane opened with nothing to its left, so there is no fade to measure against').not.toBeNull()
    expect(seen.heads.length, 'no group started folded, so this measured nothing').toBeGreaterThanOrEqual(2)
    for (const head of seen.heads) {
      expect(head.caret, 'a folded group heading starts under the edge fade').toBeGreaterThanOrEqual(seen.fadeRight!)
      expect(head.why, 'the fold sentence starts under the edge fade').toBeGreaterThanOrEqual(seen.fadeRight!)
      expect(head.whyText).toBe(en['g8.graph.folded'])
    }
  })
})
