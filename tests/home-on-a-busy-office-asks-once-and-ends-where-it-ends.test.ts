// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME ON AN OFFICE OF THE LIVE SHAPE ASKS FOR WHAT IT DRAWS, ONCE, AND ITS PAGE ENDS WHERE ITS CONTENT ENDS.
 *
 * Round 31 of wave 13k acted on a decision of the owner's. Home was slow, its agent column
 * seemed to keep loading, and its scroll ran far past what it showed. Measured on the made-up office in
 * tests/an-office-of-the-live-shape.ts (400 active agents in four projects, 1,536 open runs), Home
 * asked each project for its whole roster, 681 KB for one project, to draw a name, a dot and a
 * sentence per agent; and it asked for every record of the project every minute (237 KB) to find the
 * pipelines that stand still.
 *
 * WHAT THIS FILE HOLDS, on that office:
 *   1. Home asks each door it reads at most the number of times it needs, and nothing again while the
 *      page stands open with nothing changing: each project's roster in Home's shape once, never the
 *      whole roster, the pipelines and their steps once and never every record. Each roster row
 *      carries only the fields the column draws, and the rows are the active agents and no more.
 *      MUTATIONS: (a) the readers in src/web/components/home/HomeSections.tsx ask `api.whoIsWorking`
 *      again, the whole roster: red on the whole roster asked and on the row fields. (a2) the second
 *      shape of the query in src/server/api/working.ts takes `only` as well: red on the refusal of
 *      both at once. (b) HomePage
 *      asks `api.listRecords(undefined, 'home')` again: red on the whole record list. (c) the roster's
 *      read is put on a two-second timer: red on the quiet window.
 *   2. A project's roster is read again when the event stream says its agents changed, and no other
 *      project's is. A new agent registered in one project is drawn without a reload.
 *      MUTATION: the `useChannel` ear in `useRosterRereads` is removed: red, the new agent never appears.
 *   3. The page is no taller than its content, at 1440 and at 390: the document's scroll height is at
 *      most the bottom of the lowest thing drawn plus the page's own padding.
 *      MUTATION: `.hm-page` is given `min-height: 5000vh` in HOME_SECTIONS_CSS, taller than this office's
 *      30,700 px of content: red at both widths.
 *      This case was green before the round's change as well. On this office the scroll is long
 *      because the agent column is 400 rows long beside a short main column, which is content; folding
 *      the column is the other half of the round. This case holds that nothing else adds height.
 *
 * ROUND 31b OF WAVE 13k ADDS, on the same office:
 *   4. Home asks which runs serve a project's agents only to count the agents that are stuck, so only in a
 *      project whose late or stuck alarms include a run, each agent once, and never more agents in one read
 *      than the door takes (case 1).
 *   5, 6. The cases that opened a group of agents and marked one "Needs you" left with the groups, when
 *      Agents at work became one bar per project. tests/home-agent-bars.test.ts holds the bars' counts.
 *   7. A project card whose open count cannot be given says why in words on the card (Default and Tide
 *      tables hold tasks that never wrote a state). MUTATION: the sentence is not drawn: red.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Request } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { anOfficeOfTheLiveShape, LIVE_SHAPE } from './an-office-of-the-live-shape.ts'
import { photographWithNothingOver, TEST_SHOTS, testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DOING_ASKED_AT_ONCE } from '../src/shared/working.ts'

let app: LiveApp
let remove: () => void = () => {}

/** The made-up office's active agents, which is every agent Agents at work accounts for. */
const ACTIVE = LIVE_SHAPE.projects.reduce((sum, one) => sum + one.agents, 0) + LIVE_SHAPE.starters

/** How long the page is watched while nothing changes, after it says it has finished drawing. */
const QUIET_MS = 2_000

/** Where the page's pictures go, only when TEST_SHOTS names a folder. */
const busyShots = process.env[TEST_SHOTS] ? testShots('home-busy-office') : undefined

/** The fields a row of the roster in Home's shape carries, which are the fields the column draws. */
const DRAWN_FIELDS = ['agentId', 'participant', 'presence']

beforeAll(async () => {
  const office = await anOfficeOfTheLiveShape()
  remove = office.remove
  app = await liveApp({ name: 'home-busy-office', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: office.file })
}, 600_000)

afterAll(async () => {
  await app?.stop()
  remove()
}, 60_000)

interface Asked {
  at: number
  path: string
  query: URLSearchParams
  project: string | null
  request: Request
}

/** Open Home and keep every request to the API it makes, with when it was made. */
async function openHome(page: Page, width: number, language = 'en'): Promise<{ asked: Asked[]; readyAt: number; stop: () => void }> {
  await page.setViewportSize({ width, height: 1000 })
  const asked: Asked[] = []
  const started = Date.now()
  const watch = (request: Request): void => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return
    asked.push({ at: Date.now() - started, path: url.pathname, query: url.searchParams, project: request.headers()['x-mole-office-workspace'] ?? null, request })
  }
  page.on('request', watch)
  await page.goto(`${app.site}/?home-busy=${String(Date.now())}&lang=${language}#/`, { timeout: 120_000 })
  await waitForThePage(page, 120_000)
  // AGENTS AT WORK HAS DRAWN WHEN EVERY PROJECT'S BAR IS COUNTED, from rosters that hold every active agent (at least
  // the seeded ones: a later case adds one). Each bar carries the number of active agents its roster held.
  await page.waitForFunction((active) => {
    const bars = Array.from(document.querySelectorAll('[data-home-bar]'))
    return bars.length > 0 && bars.every((one) => one.getAttribute('data-bar-read') === 'yes')
      && bars.reduce((sum, one) => sum + Number(one.getAttribute('data-agent-count')), 0) >= active
  }, ACTIVE, { timeout: 60_000 })
  return { asked, readyAt: Date.now() - started, stop: () => page.removeListener('request', watch) }
}

/** The doors Home itself reads. A request to one of them while nothing changes is a loop. */
const HOME_DOORS = ['/api/working', '/api/records', '/api/attention', '/api/waiting', '/api/planning', '/api/claims', '/api/groups', '/api/workspaces']

describe('Home on an office of the live shape', () => {
  it('asks each door it reads once, for the rows it draws, and nothing again while nothing changes', async () => {
    const { asked, readyAt, stop } = await openHome(app.page, 1440)
    await app.page.waitForTimeout(QUIET_MS)
    stop()

    const roster = asked.filter((one) => one.path === '/api/working' && one.query.get('only') === null && !one.query.has('doing'))
    expect(roster.filter((one) => one.query.get('shape') !== 'home').map((one) => one.request.url()), 'Home asked for the whole roster').toEqual([])
    const projects = roster.map((one) => one.project ?? '(no project)').sort()
    expect(projects, 'each project\'s roster in Home\'s shape, once').toEqual(LIVE_SHAPE.projects.map((one) => one.id).sort())

    const records = asked.filter((one) => one.path === '/api/records')
    expect(records.filter((one) => one.query.get('kind') === null).map((one) => one.request.url()), 'Home asked for every record of the project').toEqual([])
    expect(records.map((one) => one.query.get('kind')).sort(), 'the pipelines and their steps, once each').toEqual(['block', 'pipeline'])

    // NOTHING AGAIN WHILE NOTHING CHANGES. Everything Home asks for is asked by the time the page has
    // drawn its agents; the minute's re-read is the only timer and it is a minute away.
    const late = asked.filter((one) => one.at > readyAt + 2_000 && HOME_DOORS.some((door) => one.path.startsWith(door)))
    expect(late.map((one) => `${String(one.at)} ms ${one.request.url()}`), 'Home asked again while nothing changed').toEqual([])

    // THE ROWS ARE THE ACTIVE AGENTS, AND EACH CARRIES ONLY WHAT THE COLUMN DRAWS.
    let rows = 0
    for (const one of roster) {
      const reply = (await (await one.request.response())?.json()) as { rows: Record<string, unknown>[]; counts: { active: number; retired: number } }
      expect(reply.rows.length, `${String(one.project)}: the rows are the active agents`).toBe(reply.counts.active)
      for (const row of reply.rows) expect(Object.keys(row).sort(), `${String(one.project)}: a row carries a field the column does not draw`).toEqual(DRAWN_FIELDS)
      rows += reply.rows.length
    }
    expect(rows, 'every active agent of the office, and no retired one').toBe(ACTIVE)

    // WHICH RUNS SERVE THE AGENTS IS ASKED ONLY TO COUNT THE STUCK ONES: each asked agent is an active agent of the
    // project asked, none is asked twice, and no read asks more than the door takes at once.
    const active = new Map<string, Set<string>>()
    for (const one of roster) {
      const reply = (await (await one.request.response())?.json()) as { rows: { agentId: string }[] }
      active.set(one.project ?? '', new Set(reply.rows.map((row) => row.agentId)))
    }
    const doing = asked.filter((one) => one.path === '/api/working' && one.query.has('doing'))
    const doingIds = doing.flatMap((one) => (one.query.get('doing') ?? '').split(',').map((agentId) => ({ project: one.project ?? '', agentId })))
    for (const one of doing) expect((one.query.get('doing') ?? '').split(',').length, 'a doing read asks more than the door takes').toBeLessThanOrEqual(DOING_ASKED_AT_ONCE)
    expect(doingIds.filter((one) => active.get(one.project)?.has(one.agentId) !== true), 'a doing read asks an agent its project does not hold').toEqual([])
    expect(new Set(doingIds.map((one) => `${one.project}:${one.agentId}`)).size, 'a doing read asks an agent twice').toBe(doingIds.length)

    // THE TWO NARROW READINGS ARE TWO QUESTIONS: asking for both at once is refused, not half answered.
    const both = await fetch(`${app.api}/api/working?only=unregistered&shape=home`, {
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' },
    })
    expect(both.status, (await both.text()).slice(0, 300)).toBe(400)
  }, 300_000)

  it('reads one project\'s roster again when the event stream says its agents changed, and draws the change', async () => {
    const { asked, stop } = await openHome(app.page, 1440)
    const before = asked.length
    const reply = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'greenhouse' },
      body: JSON.stringify({ kind: 'agent', title: 'Made-up newcomer', data: { handle: 'made-up-newcomer', runtime: 'claude-code', state: 'active' } }),
    })
    expect(reply.status, (await reply.text()).slice(0, 300)).toBeLessThan(300)
    // THE ROSTER'S NEXT ASK WAITS ITS FLOOR after the last answer (src/web/lib/oneask.ts), so the
    // change is drawn within that bound rather than inside the old five-second gap.
    await app.page.waitForFunction((active) => Array.from(document.querySelectorAll('[data-home-bar]')).reduce((sum, one) => sum + Number(one.getAttribute('data-agent-count')), 0) === active + 1, ACTIVE, { timeout: 60_000 })
    stop()
    const again = asked.slice(before).filter((one) => one.path === '/api/working')
    expect(again.filter((one) => !one.query.has('doing')).map((one) => `${one.path}?${one.query.toString()} for ${String(one.project)}`), 'only the project that changed is read again').toEqual([
      '/api/working?shape=home for greenhouse',
    ])
  }, 300_000)

  for (const width of [1440, 390]) {
    it(`is no taller than its content at ${String(width)}`, async () => {
      const { stop } = await openHome(app.page, width)
      stop()
      const measured = await app.page.evaluate(() => {
        // THE LOWEST THING DRAWN: an element with a box and no child element, or an image, that is
        // visible and not inside a closed <details>. A box that only holds other boxes is not counted,
        // because a column stretched to its neighbour's height holds nothing below its last child.
        let lowest = 0
        for (const element of Array.from(document.body.querySelectorAll('*'))) {
          if (element.children.length > 0 && !(element instanceof SVGSVGElement) && element.tagName !== 'IMG') continue
          if (element.closest('details:not([open]) > :not(summary)') !== null) continue
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          if (box.height < 2 || box.width < 2 || style.visibility === 'hidden' || style.display === 'none' || style.position === 'fixed') continue
          lowest = Math.max(lowest, box.bottom + window.scrollY)
        }
        // THE PAGE'S OWN PADDING: what every ancestor of Home's page adds below it.
        let padding = 0
        for (let at: Element | null = document.querySelector('.hm-page'); at !== null; at = at.parentElement) {
          const style = getComputedStyle(at)
          padding += Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderBottomWidth) + Number.parseFloat(style.marginBottom)
        }
        const page = document.querySelector('.hm-page')?.getBoundingClientRect()
        const agents = document.querySelector('[data-home-section="agents"]')?.getBoundingClientRect()
        return {
          agentsHeight: agents === undefined ? null : Math.ceil(agents.height),
          bars: document.querySelectorAll('[data-home-bar]').length,
          cannotTell: document.querySelector('[data-home-bars-cannot-tell]') !== null,
          viewport: window.innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
          lowest: Math.ceil(lowest),
          padding: Math.ceil(padding),
          pageBottom: page === undefined ? null : Math.ceil(page.bottom + window.scrollY),
        }
      })
      expect(measured.lowest, 'nothing was measured, so this proves nothing').toBeGreaterThan(1000)
      expect(measured.scrollHeight, `the page runs past its content: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.lowest + measured.padding + 2)
      // AND AGENTS AT WORK IS ONE BAR PER PROJECT, not a row per agent. Measured in round 31 before the column was
      // folded: 400 rows, 30,709 px.
      expect(measured.bars, `one bar per project: ${JSON.stringify(measured)}`).toBe(LIVE_SHAPE.projects.length)
      // EVERY ROW OF THIS OFFICE'S WAITING LIST NAMES THE AGENT IT CAME FROM, so the bars have nothing they cannot tell.
      expect(measured.cannotTell, 'the bars draw no cannot-tell note when every waiting row names its agent').toBe(false)
      expect(measured.agentsHeight ?? Infinity, `Agents at work runs long: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.viewport * 1.5)
    }, 300_000)
  }

  it.runIf(busyShots !== undefined)('takes the pictures, when TEST_SHOTS names a folder', async () => {
    const folder = busyShots!
    for (const language of ['en', 'zh'] as const) for (const theme of ['light', 'dark'] as const) for (const width of [1440, 990, 660, 390]) {
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.goto(`${app.site}/?lang=${language}#/`, { timeout: 120_000 })
      const { stop } = await openHome(app.page, width, language)
      stop()
      await app.page.evaluate(() => window.scrollTo(0, 0))
      await app.page.screenshot({ path: join(folder, `home-${language}-${theme}-${String(width)}.png`), fullPage: true })
      await photographWithNothingOver(app.page, '[data-home-section="agents"]', join(folder, `agents-${language}-${theme}-${String(width)}.png`))
    }
  }, 900_000)
})
