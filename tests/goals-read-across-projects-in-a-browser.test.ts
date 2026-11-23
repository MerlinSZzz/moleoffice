// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOALS PAGE READS ACROSS PROJECTS, IN A REAL BROWSER.
 *
 * Since the owner's decision of 29 September 2026, Goals stands under All projects and reads across
 * projects. Every goal row names its project; one plain choice shows a single project; the
 * project the page was opened from is only where that choice starts, shown chosen; the counts add up
 * over what is chosen and say so; Needs you gathers the goals waiting for Confirm from every chosen
 * project, and Confirm writes in the goal's own project; where the plan and what happened differ is
 * read across the chosen projects. The goal drawing is one project's drawing: with Every project
 * chosen the page draws a line saying so instead.
 *
 * A GOAL WAITING IN ANOTHER PROJECT IS SAID WHERE ONE PROJECT IS CHOSEN. This
 * was in line round 48. The owner opened Goals and found no Confirm press, while the only goal waiting was in
 * another project than the one chosen, and the page said "Nothing needs you". Now the page says how
 * many goals wait in other projects, with a press that shows every project.
 *
 * WHAT "MAY READ" MEANS TODAY. No rule keeps a reader out of a whole project, so the projects a
 * reader may read are every registered project. The Goals page lists no messages, so the message rule
 * has nothing to take out of what it draws. What is measured here is what is
 * true: every reply the page read across projects says `narrowedByPermission: null`, and every row
 * in it is in a project GET /api/workspaces lists.
 *
 * Two projects, each with goals, a trajectory serving one, and a late window; the second holds a goal
 * an agent filed. Everything is this file's own, in a fresh database.
 *
 * MUTATIONS, each red here after a green control run:
 *   1. HorizonsPage.tsx, readThePage: ask `api.listRecords('goal')` with no choice. Every project shows
 *      only the opened project's goals.
 *   2. HorizonsPage.tsx, GoalItem: drop `<RowProject id={project} …/>`. The goal rows name no project.
 *   3. HorizonsPage.tsx, confirm: leave out `reading.projectOf[goalId]`. Confirm on the second
 *      project's goal is refused, and the goal stays unconfirmed.
 *   4. HorizonsPage.tsx: draw `countedOver(EVERY_PROJECT, titles)` whatever is chosen. The counted line
 *      says every project while one is chosen.
 *   5. HorizonsPage.tsx, readThePage: ask `api.windows(from, to)` with no choice. One project's page
 *      names the other project's late window.
 *   6. HorizonsPage.tsx, TheDrawing: draw the PlanGraph whatever is chosen. Every project draws a
 *      drawing and no line.
 *   7. HorizonsPage.tsx, readThePage: count no goal waiting in another project. The opened project
 *      says nothing of the goal waiting in the second project, and the press is not drawn.
 *   8. HorizonsPage.tsx, NeedsYou: the press "Show every project" chooses nothing. The page stays on
 *      one project and the second test waits in vain.
 */

import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page

const HERE = 'default'
const THERE = 'goals-lathe'
const THERE_TITLE = 'Lathe shop'
let hereTitle = ''

const as = (workspace: string, type = 'human', id: string = THE_PERSON): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': workspace,
})

async function callApi<T>(path: string, init: { method?: string; body?: unknown; as?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`${app.api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.as ?? as(HERE),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as T
}

async function file(workspace: string, kind: string, title: string, data: Record<string, unknown>, who = as(workspace)): Promise<string> {
  return (await callApi<{ record: { id: string } }>('/api/records', { method: 'POST', as: who, body: { kind, title, data } })).record.id
}

function shiftDay(day: string, by: number): string {
  const at = new Date(`${day}T12:00:00`)
  at.setDate(at.getDate() + by)
  return at.toISOString().slice(0, 10)
}

const HERE_SHORT = 'The bench vice holds a blank'
const HERE_LONG = 'Every blank on the bench is logged'
const THERE_SHORT = 'The lathe spindle runs true'
const THERE_AGENT = 'The lathe chuck is checked every morning'
const HERE_WORK = 'Plane the bench top'
const THERE_WORK = 'True the spindle'
let thereAgentGoal = ''

beforeAll(async () => {
  app = await liveApp({ name: 'goals-across', workspace: HERE, viewport: { width: 1440, height: 1000 } })
  page = app.page
  await callApi('/api/workspaces', { method: 'POST', body: { id: THERE, title: THERE_TITLE } })
  const listed = await callApi<{ workspaces: { id: string; title: string }[] }>('/api/workspaces')
  hereTitle = listed.workspaces.find((one) => one.id === HERE)!.title
  const today = (await callApi<{ day: string }>('/api/planning/today')).day

  const goal = (workspace: string, title: string, horizon: string) =>
    file(workspace, 'goal', title, { horizon, what: `${title}, and anybody can check it.`, owner: THE_PERSON, state: 'open' })
  const hereShort = await goal(HERE, HERE_SHORT, 'short')
  await goal(HERE, HERE_LONG, 'long')
  const thereShort = await goal(THERE, THERE_SHORT, 'short')

  for (const [workspace, goalId, name, work] of [
    [HERE, hereShort, 'Bench', HERE_WORK],
    [THERE, thereShort, 'Lathe', THERE_WORK],
  ] as const) {
    const part = await file(workspace, 'planned_state', `${name} part`, { what: `${name} part is real.` })
    const trajectory = await file(workspace, 'trajectory', `${name} steps`, { plannedStateIds: [part], because: 'In order.' })
    await callApi('/api/links', { method: 'POST', as: as(workspace), body: { fromId: trajectory, toId: goalId, type: 'serves' } })
    const task = await file(workspace, 'task', work, { state: 'doing' })
    await callApi('/api/planning/windows', {
      method: 'POST',
      as: as(workspace),
      body: { recordId: task, startsOn: shiftDay(today, -3), endsOn: shiftDay(today, -1) },
    })
  }

  // A GOAL AN AGENT FILED IN THE SECOND PROJECT, waiting for the person's Confirm. The agent is
  // registered first, because the office refuses a write from an agent nothing registered.
  await file(HERE, 'agent', 'Lathe keeper', { handle: 'lathe-keeper', state: 'active', runtime: 'claude-code' })
  thereAgentGoal = await file(
    THERE,
    'goal',
    THERE_AGENT,
    { horizon: 'medium', what: 'The chuck is checked before the first cut.', owner: THE_PERSON, state: 'open' },
    as(THERE, 'agent', 'lathe-keeper'),
  )
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/horizons`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.hz-goal', { timeout: 30_000 })
}

/**
 * Choose in the page's one project control, and wait for the page to draw what it read: a goal of
 * this title is drawn, and when one project is chosen every goal drawn names that project.
 */
async function choose(value: string, awaitTitle: string): Promise<void> {
  await page.locator('.hz-top .pch-select').selectOption(value)
  await drawnFor(value, awaitTitle)
}

/** Wait for the page to draw what it read for this choice, however the choice was made. */
async function drawnFor(value: string, awaitTitle: string): Promise<void> {
  await page.waitForFunction(
    ([title, project]) => {
      const goals = Array.from(document.querySelectorAll('.hz-goal, .hz-needrow'))
      const drawn = goals.some((one) => one.querySelector('.hz-goalname, .hz-needlink')?.textContent === title)
      const oneProject = project === 'all' || goals.every((one) => one.querySelector('.pch-name')?.getAttribute('data-project') === project)
      return drawn && oneProject
    },
    [awaitTitle, value] as const,
    { timeout: 30_000 },
  )
}

interface Seen {
  chosen: string
  counted: string
  goals: { title: string; project: string }[]
  needs: { title: string; project: string }[]
  /** The line saying how many goals wait for Confirm in other projects, or '' when none is drawn. */
  elsewhere: string
  /** Whether the page says "Nothing needs you". */
  nothingNeedsYou: boolean
  counts: { at: string; count: string; goals: number }[]
  facts: { said: string; project: string }[]
  drawing: number
}

async function seen(): Promise<Seen> {
  return page.evaluate(() => ({
    chosen: (document.querySelector('.hz-top .pch-select') as HTMLSelectElement).value,
    counted: document.querySelector('.hz-counted')?.textContent ?? '',
    goals: Array.from(document.querySelectorAll<HTMLElement>('.hz-goal')).map((one) => ({
      title: one.querySelector('.hz-goalname')?.textContent ?? '',
      project: one.querySelector('.hz-facts .pch-name')?.getAttribute('data-project') ?? '',
    })),
    needs: Array.from(document.querySelectorAll<HTMLElement>('[data-group="needs-you"] .hz-needrow')).map((one) => ({
      title: one.querySelector('.hz-needlink')?.textContent ?? '',
      project: one.querySelector('.pch-name')?.getAttribute('data-project') ?? '',
    })),
    elsewhere: document.querySelector('[data-group="needs-you"] .hz-elsewhere-said')?.textContent ?? '',
    nothingNeedsYou: document.querySelector('.hz-needs-none') !== null,
    counts: Array.from(document.querySelectorAll<HTMLElement>('.hz-group[data-target^="uiSurface/horizons."]'))
      .filter((one) => one.getAttribute('data-target') !== 'uiSurface/horizons.against')
      .map((one) => ({
        at: one.getAttribute('data-target') ?? '',
        count: one.querySelector('.hz-count')?.textContent ?? '',
        goals: one.querySelectorAll('.hz-goal').length,
      })),
    facts: Array.from(document.querySelectorAll<HTMLElement>('.hz-actualfact')).map((one) => ({
      said: one.textContent ?? '',
      project: one.querySelector('.pch-name')?.getAttribute('data-project') ?? '',
    })),
    drawing: document.querySelectorAll('.hz-drawing [data-target="uiSurface/plan.toward"]').length,
  }))
}

describe('the Goals page reads across projects', () => {
  it('starts at the project it was opened from, shown chosen, and reads only that project', async () => {
    await open()
    const now = await seen()
    expect(now.chosen).toBe(HERE)
    expect(now.goals.map((one) => one.title).sort()).toEqual([HERE_LONG, HERE_SHORT].sort())
    for (const goal of now.goals) expect(goal.project, goal.title).toBe(HERE)
    expect(now.counted).toBe(`Counted in ${hereTitle}.`)
    expect(now.needs).toEqual([])
    // THE AGENT'S GOAL WAITS IN THE SECOND PROJECT, so this one does not say that nothing needs the person: it says how
    // many goals wait elsewhere, with the press that shows them.
    expect(now.nothingNeedsYou).toBe(false)
    expect(now.elsewhere).toBe('A goal in another project is waiting for Confirm.')
    expect(await page.locator('[data-group="needs-you"]').getByRole('button', { name: 'Show every project' }).count()).toBe(1)
    // WHERE THE PLAN AND WHAT HAPPENED DIFFER is this project's alone.
    const late = now.facts.filter((one) => one.said.includes('was meant to be worked on until'))
    expect(late.map((one) => one.project)).toEqual([HERE])
    expect(late[0]!.said).toContain(HERE_WORK)
    // THE DRAWING IS THIS PROJECT'S.
    expect(now.drawing).toBe(1)
  }, 120_000)

  it('reads every project when Show every project is pressed, each row naming its project, and counts over both', async () => {
    const replies: { url: string; body: Record<string, unknown> }[] = []
    const listen = async (response: import('playwright').Response): Promise<void> => {
      if (!response.url().includes('projects=all')) return
      try {
        replies.push({ url: response.url(), body: (await response.json()) as Record<string, unknown> })
      } catch {
        // a reply that is not JSON is not one of the page's reads
      }
    }
    page.on('response', listen)
    await page.locator('[data-group="needs-you"]').getByRole('button', { name: 'Show every project' }).click()
    await drawnFor('all', THERE_SHORT)
    page.off('response', listen)
    const now = await seen()
    expect(now.chosen).toBe('all')
    // EVERY PROJECT IS CHOSEN, so no goal waits in a project left out, and no such line is drawn.
    expect(now.elsewhere).toBe('')
    expect(Object.fromEntries(now.goals.map((one) => [one.title, one.project]))).toEqual({
      [HERE_SHORT]: HERE,
      [HERE_LONG]: HERE,
      [THERE_SHORT]: THERE,
    })
    expect(now.counted).toBe('Counted across every project.')
    const short = now.counts.find((one) => one.at === 'uiSurface/horizons.short')!
    expect(short.count).toBe('2')
    for (const group of now.counts) expect(group.count, group.at).toBe(String(group.goals))
    // NEEDS YOU gathers the agent's goal from the second project, naming that project.
    expect(now.needs).toEqual([{ title: THERE_AGENT, project: THERE }])
    // BOTH LATE WINDOWS, each naming its project.
    const late = now.facts.filter((one) => one.said.includes('was meant to be worked on until'))
    expect(late.map((one) => one.project).sort()).toEqual([HERE, THERE].sort())
    // THE DRAWING IS ONE PROJECT'S, so none is drawn.
    // CRITERION CHANGE, as decided: no line is drawn in its place, and none is checked.
    expect(now.drawing).toBe(0)

    // WHAT THE READER MAY READ: nothing was narrowed, and every row is in a project the office lists.
    const projects = new Set((await callApi<{ workspaces: { id: string }[] }>('/api/workspaces')).workspaces.map((one) => one.id))
    const lists = replies.filter((one) => one.url.includes('/api/records?'))
    expect(lists.length, 'the page read no record list across projects').toBeGreaterThanOrEqual(4)
    for (const reply of replies) expect(reply.body['narrowedByPermission'], reply.url).toBeNull()
    for (const reply of lists) {
      for (const row of reply.body['records'] as { workspaceId: string }[]) {
        expect(projects.has(row.workspaceId), `${reply.url}: ${row.workspaceId}`).toBe(true)
      }
    }
  }, 120_000)

  it('confirms the second project\'s goal in that project, from Every project', async () => {
    const row = page.locator('[data-group="needs-you"] .hz-needrow', { hasText: THERE_AGENT })
    await row.getByRole('button', { name: 'Confirm this goal' }).click()
    await page.waitForFunction(
      (title) => Array.from(document.querySelectorAll('[data-group="needs-you"] .hz-needrow')).every((one) => !(one.textContent ?? '').includes(title)),
      THERE_AGENT,
      { timeout: 30_000 },
    )
    const got = await callApi<{ record: { workspaceId: string; data: { confirmed_by?: { by: string } } } }>(`/api/records/${thereAgentGoal}`, { as: as(THERE) })
    expect(got.record.workspaceId).toBe(THERE)
    expect(got.record.data.confirmed_by).toMatchObject({ by: THE_PERSON })
  }, 120_000)

  it('shows one project when that project is chosen, with its own drawing', async () => {
    await choose(THERE, THERE_SHORT)
    const now = await seen()
    expect(now.chosen).toBe(THERE)
    expect(now.goals.map((one) => one.title).sort()).toEqual([THERE_AGENT, THERE_SHORT].sort())
    for (const goal of now.goals) expect(goal.project, goal.title).toBe(THERE)
    expect(now.counted).toBe(`Counted in ${THERE_TITLE}.`)
    const late = now.facts.filter((one) => one.said.includes('was meant to be worked on until'))
    expect(late.map((one) => one.project)).toEqual([THERE])
    expect(late[0]!.said).toContain(THERE_WORK)
    await page.waitForSelector('.hz-drawing [data-target="uiSurface/plan.toward"]', { timeout: 30_000 })
    expect(await page.locator('.hz-drawing [data-target="uiSurface/plan.toward"]').innerText()).toContain(THERE_SHORT)
  }, 120_000)

  it('photographs the page at four widths in both looks, and at 1440 in Chinese, when GOALS_ACROSS_SHOTS is 1', async () => {
    if (process.env['GOALS_ACROSS_SHOTS'] !== '1') return
    // ONE MORE AGENT'S GOAL WAITS IN THE SECOND PROJECT, because the third test confirmed the first one. The pictures
    // of one project then show the line that says a goal waits elsewhere, and its press.
    await file(
      THERE,
      'goal',
      'The lathe tailstock is oiled each week',
      { horizon: 'short', what: 'The tailstock is oiled every Monday.', owner: THE_PERSON, state: 'open' },
      as(THERE, 'agent', 'lathe-keeper'),
    )
    // THE PICTURES GO INTO THIS TEST'S OWN TEMPORARY FOLDER, named on the screen.
    const shots = mkdtempSync(join(tmpdir(), 'goals-across-shots-'))
    mkdirSync(shots, { recursive: true })
    for (const choice of ['all', HERE]) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark']) {
          for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
            const context = await app.browser.newContext({ viewport: { width, height: width < 700 ? 900 : 1000 }, colorScheme: theme as 'light' | 'dark' })
            await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
            const shot = await context.newPage()
            try {
              await shot.goto(`${app.site}/?lang=${language}#/horizons`, { timeout: 60_000 })
              await waitForThePage(shot, 60_000)
              await shot.waitForSelector('.hz-goal', { timeout: 30_000 })
              if (choice === 'all') {
                await shot.locator('.hz-top .pch-select').selectOption('all')
                await shot.waitForFunction(
                  (title) => Array.from(document.querySelectorAll('.hz-goalname')).some((one) => one.textContent === title),
                  THERE_SHORT,
                  { timeout: 30_000 },
                )
              }
              const wide = await shot.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
              expect(wide, `the page scrolls sideways at ${String(width)} ${theme} ${choice}`).toBe(true)
              await shot.screenshot({ path: join(shots, `goals-${choice}-${String(width)}-${theme}-${language}.png`), fullPage: true })
            } finally {
              await context.close()
            }
          }
        }
      }
    }
    console.log(`GOALS_ACROSS_SHOTS: the pictures are in ${shots}`)
  }, 600_000)
})
