// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S PAGE: one graph of the past, present and live futures. Wave 13s round 241.
 *
 * WHAT THIS CLAIMS, against a real server and a real browser in a fresh workspace:
 *   - the owner's four levels draw exactly the marks marksAtLevel names, and no scale number is asserted;
 *   - the project rail under the lanes draws the revisions of records no lane holds, so level two counts every one;
 *   - a lane title is a real link to the module's record, and the record's own title is drawn there;
 *   - the Evolution block on that record page leads back to the graph;
 *   - a past of one migration baseline draws no revision tick, and the lane says no real revision yet;
 *   - an empty project draws its state word for no lanes, and no lane;
 *   - at 1440 and 390, in the light look, the page is not wider than the window;
 *   - the module record page the Evolution link sits on is photographed at the same two widths in the light look, and
 *     passes the same check.
 *
 * MADE-UP DATA ONLY. Two modules, a pipeline with two blocks, a trajectory with two planned states, a stopping point,
 * a direction branched off another and shelved with a reason, a direction under no module, a proposal, a decision,
 * revisions on two modules by create then PATCH, a plan with one line pointing at a module, and one work window.
 *
 * The pictures go to testShots('project-graph') and testShots('project-graph-record'); with TEST_SHOTS set they are
 * kept under those folders.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { deleteTheCopiedDefaultChapters, liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROJECT_GRAPH_LEVELS, PROJECT_GRAPH_SAYS, type ProjectGraphLevel, type ProjectGraphReply } from '../src/shared/project-graph.ts'
import { buildProjectGraph, marksAtLevel } from '../src/web/components/graph/project-graph-model.ts'
import { recordPath } from '../src/web/components/router.tsx'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const MODULE_A = 'Test pot gripper'
const MODULE_B = 'Test force bench'
const PIPELINE = 'Test assembly line'
const BLOCK_ONE = 'Test clamp the pot'
const BLOCK_TWO = 'Test lower the arm'
const TRAJECTORY = 'Test future of the gripper'
const STATE_ONE = 'Test the clamp holds'
const STATE_TWO = 'Test the arm lifts'
const DIRECTION_ONE = 'Test explore a wider jaw'
const DIRECTION_TWO = 'Test explore a softer grip'
const DIRECTION_PROJECT = 'Test explore what the whole project should become'
const SHELF_REASON = 'Test shelf reason stored on the direction.'
const STOPPING_POINT = 'Test stopping point on the gripper'
const SOURCE_MARKER = 'R42-test'
const PROPOSAL = 'Test proposal about the jaw'
const DECISION = 'Test decision about the jaw'
const PLAN = 'Test plan for the gripper'
const WINDOW_NOTE = 'Test window note.'

const SUMMARY = {
  moduleA: 'Test gripper summary, the record’s own words.',
  moduleB: 'Test force bench summary, the record’s own words.',
  pipeline: 'Test pipeline summary, stored on the pipeline.',
  trajectory: 'Test trajectory summary, stored on the planned future.',
  state: 'Test planned state summary, stored on the state.',
  direction: 'Test direction summary, stored on the direction.',
  checkpoint: 'Test checkpoint summary, stored on the stopping point.',
}

/** A day key this many days from today, in the local wall clock the office uses. */
function dayFromToday(days: number): string {
  const when = new Date()
  when.setDate(when.getDate() + days)
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
}

async function call<T>(api: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: AS_THE_PERSON,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`${method} ${path} answered ${String(response.status)}: ${await response.text()}`)
  return (await response.json()) as T
}

interface Made {
  id: string
}

async function make(api: string, kind: string, title: string, data: Record<string, unknown>, summary?: string): Promise<string> {
  const reply = await call<{ record: Made }>(api, 'POST', '/api/records', {
    kind,
    title,
    data,
    ...(summary === undefined ? {} : { summary }),
  })
  return reply.record.id
}

async function link(api: string, fromId: string, toId: string, type: string): Promise<void> {
  await call(api, 'POST', '/api/links', { fromId, toId, type })
}

async function graphOf(api: string): Promise<ProjectGraphReply> {
  return call<ProjectGraphReply>(api, 'GET', '/api/project-graph')
}

let app: LiveApp
let page: Page
let graph: ProjectGraphReply
let moduleAId = ''
let moduleBId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'project-graph-page', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // THE LOOK IS A STORED PRESET, NOT AN ADDRESS WORD. The address carries the look this test asks for, and this
  // script writes it into the one storage value the app reads before its first paint.
  await page.addInitScript(() => {
    const look = new URLSearchParams(location.search).get('look')
    if (look === 'light' || look === 'dark') localStorage.setItem('mole-office.preset.theme', look)
  })
  const api = app.api
  // A FRESH OFFICE COPIES THE DEFAULT REGULATIONS AS MODULES. Remove them, as the person may, so this workspace
  // holds the made-up data below and no other graph records.
  await deleteTheCopiedDefaultChapters(api)

  // THE PRESENT: two modules, two blocks carried by the first, and one pipeline holding both blocks.
  moduleAId = await make(api, 'module', MODULE_A, {})
  moduleBId = await make(api, 'module', MODULE_B, {})
  const pipelineId = await make(api, 'pipeline', PIPELINE, { blockIds: [] }, SUMMARY.pipeline)
  const blockOne = (await call<{ record: Made }>(api, 'POST', `/api/records/${pipelineId}/blocks`, { name: BLOCK_ONE, state: 'todo' })).record.id
  const blockTwo = (await call<{ record: Made }>(api, 'POST', `/api/records/${pipelineId}/blocks`, { name: BLOCK_TWO, state: 'todo' })).record.id
  await link(api, moduleAId, blockOne, 'implements')
  await link(api, moduleAId, blockTwo, 'implements')

  // THE PAST: real revisions on two records, by create and then PATCH. The second PATCH also stores a summary.
  await call(api, 'PATCH', `/api/records/${moduleAId}`, { summary: SUMMARY.moduleA })
  await call(api, 'PATCH', `/api/records/${moduleBId}`, { summary: SUMMARY.moduleB })

  // One stopping point about the first module, with its source marker stored as written.
  const stoppingId = await make(api, 'stopping_point', STOPPING_POINT, {
    doing: 'Test moving the gripper onto the bench.',
    next: 'Test check the clamp against the wider pot.',
    stoppedAtRevision: SOURCE_MARKER,
  }, SUMMARY.checkpoint)
  await link(api, stoppingId, moduleAId, 'about')

  // A trajectory for the pipeline's module, with two planned states in order.
  const stateOne = await make(api, 'planned_state', STATE_ONE, { what: 'Test the clamp closes on the pot.' }, SUMMARY.state)
  const stateTwo = await make(api, 'planned_state', STATE_TWO, { what: 'Test the arm lifts the pot.' })
  await make(api, 'trajectory', TRAJECTORY, { plannedStateIds: [stateOne, stateTwo], because: 'Test the shape of the future.' }, SUMMARY.trajectory)
  const trajectoryId = (await graphOf(api)).futures.find((future) => future.title === TRAJECTORY)?.id ?? ''
  await link(api, trajectoryId, moduleAId, 'plans_for')

  // Two directions, the second branched off the first and shelved with its stored reason.
  const directionOne = await make(api, 'direction', DIRECTION_ONE, { depth: 'read', question: 'Test which jaw is wider?' }, SUMMARY.direction)
  const directionTwo = await make(api, 'direction', DIRECTION_TWO, {
    depth: 'noticed',
    shelved: { since: dayFromToday(-2), because: SHELF_REASON, restart_when: 'Test the pot arrives.' },
  })
  await link(api, directionOne, moduleAId, 'relates_to')
  await link(api, directionTwo, directionOne, 'relates_to')
  await link(api, directionTwo, moduleAId, 'relates_to')
  // A direction under no module. Its record is in no lane, so its revision is drawn on the project's own past rail.
  await make(api, 'direction', DIRECTION_PROJECT, { depth: 'noticed', question: 'Test how the whole project should change?' })

  // A proposal and a decision, the records the graph counts on the module and does not draw.
  const proposalId = await make(api, 'proposal', PROPOSAL, { question: 'Test which jaw?', options: ['Test the wider jaw.'] })
  await link(api, proposalId, moduleAId, 'about')
  const decisionId = await make(api, 'decision', DECISION, { option_taken: 'Test the wider jaw.', ...governsTheWholeProject(), replaces: [] })
  await link(api, decisionId, proposalId, 'derived_from')

  // A plan with one line naming a module, and one work window on the same module.
  const plan = await call<{ plan: { id: string } }>(api, 'POST', '/api/plans', { title: PLAN, body: '' })
  const line = await call<{ line: { id: string } }>(api, 'POST', `/api/plans/${plan.plan.id}/lines`, {
    text: `Test work on ${MODULE_A}`,
    reason: 'Added for the project graph test.',
  })
  await call(api, 'PATCH', `/api/plans/${plan.plan.id}/lines/${line.line.id}`, { recordId: blockOne })
  await call(api, 'POST', '/api/planning/windows', {
    recordId: blockOne,
    startsOn: dayFromToday(0),
    endsOn: dayFromToday(3),
    note: WINDOW_NOTE,
  })

  graph = await graphOf(api)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

async function openThePage(theme = 'light'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${app.site}/?lang=en&look=${theme}#/project-graph`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-graph-level] [data-mark="module"]').first().waitFor({ timeout: 30_000 })
}

async function chooseLevel(level: ProjectGraphLevel): Promise<void> {
  await page.locator(`button[data-level="${level}"]`).click()
  await page.waitForFunction(
    (one) => document.querySelector('[data-graph-level]')?.getAttribute('data-graph-level') === one,
    level,
  )
}

interface SeenMarks {
  modules: number
  futures: number
  plannedStates: number
  revisions: number
  checkpoints: number
  counts: number
  boundaries: number
  summaries: number
}

async function marksOnThePage(): Promise<SeenMarks> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-graph-level]')
    if (root === null) throw new Error('The graph page is not on screen.')
    const count = (mark: string) => root.querySelectorAll(`[data-mark="${mark}"]`).length
    return {
      modules: count('module'),
      futures: count('future'),
      plannedStates: count('plannedState'),
      revisions: count('revision'),
      checkpoints: count('checkpoint'),
      counts: count('count'),
      boundaries: count('boundary'),
      summaries: count('summary'),
    }
  })
}

describe('the project graph page', () => {
  it('draws exactly the marks of each of the owner’s four levels, and says the project has no source map yet', async () => {
    await openThePage()
    // A FRESH PROJECT HAS NO SOURCE INDEX. The page must say that plainly, not call the expected
    // absence a failed read, and must make no request that would answer 404.
    expect(
      await page.locator('[data-graph-says="coverage"]').textContent(),
      'a project with no source index says its map is not there yet',
    ).toBe(t('projectGraph.coverage.noMap'))
    const built = buildProjectGraph(graph)
    expect(built.unattached.revisions.entries.length, 'the made-up project has a real revision under no module').toBeGreaterThan(0)
    for (const level of PROJECT_GRAPH_LEVELS) {
      await chooseLevel(level)
      const expected = marksAtLevel(built, level)
      const seen = await marksOnThePage()
      expect(seen, `level ${level}`).toEqual(expected)
      expect(await page.locator(`button[data-level="${level}"]`).getAttribute('aria-checked')).toBe('true')
      if (level === 'modules') {
        expect(seen.modules, 'level one draws the module lanes').toBeGreaterThan(0)
        expect(seen.futures, 'level one draws the futures').toBeGreaterThan(0)
        expect(seen.revisions + seen.checkpoints + seen.plannedStates + seen.counts + seen.boundaries + seen.summaries).toBe(0)
        expect(await page.locator('.gph-project-past').count(), 'level one draws no project past rail').toBe(0)
        expect(await page.getByRole('link', { name: PIPELINE, exact: true }).count(), 'level one does not draw a pipeline title').toBe(0)
        expect(await page.getByRole('link', { name: BLOCK_ONE, exact: true }).count(), 'level one does not draw a block title').toBe(0)
        expect(await page.locator('[data-mark="plan"]').count(), 'level one does not draw the plans band').toBe(0)
      }
      if (level === 'revisionsAndCheckpoints') {
        expect(seen.revisions + seen.checkpoints + seen.plannedStates, 'level two adds the past and the planned states').toBeGreaterThan(0)
        expect(seen.counts + seen.boundaries + seen.summaries).toBe(0)
        expect(await page.locator('.gph-past-rail').count(), 'each lane with a real event has one past rail').toBeGreaterThan(0)
        expect(await page.locator('[data-mark="revision"][data-at]').count(), 'every revision tick sits on the rail at its stored time').toBe(expected.revisions)
        expect(await page.locator('[data-mark="checkpoint"][data-at]').count(), 'every checkpoint diamond sits on the rail at its stored time').toBe(expected.checkpoints)
        const projectPast = page.locator('.gph-project-past')
        expect(await projectPast.count(), 'the project has its own past rail for the records no lane holds').toBe(1)
        expect(
          await projectPast.locator('[data-mark="revision"]').count(),
          'the project past rail draws every real revision no lane holds',
        ).toBe(built.unattached.revisions.entries.length)
        expect(await page.getByRole('link', { name: PIPELINE, exact: true }).count(), 'level two still has no pipeline title').toBe(0)
        expect(await page.locator('[data-mark="plan"]').count(), 'level two still has no plans band').toBe(0)
      }
      if (level === 'countsAndBoundaries') {
        expect(seen.counts, 'level three adds the counts').toBeGreaterThan(0)
        expect(seen.boundaries, 'level three adds the boundary around two blocks').toBeGreaterThan(0)
        expect(seen.summaries).toBe(0)
        expect(await page.getByRole('link', { name: PIPELINE, exact: true }).count(), 'level three draws the pipeline title').toBeGreaterThan(0)
        expect(await page.locator('[data-mark="plan"]').count(), 'level three adds the plans band').toBeGreaterThan(0)
        expect(await page.locator('[data-mark="window"]').count(), 'level three draws the work window').toBeGreaterThan(0)
      }
      if (level === 'summaries') expect(seen.summaries, 'level four adds the stored summaries').toBeGreaterThan(0)
    }
    // THE FUTURE IS A CUBIC CURVE, not an orthogonal pipeline route.
    await chooseLevel('modules')
    const curves = page.locator('[data-mark="future"] svg path')
    expect(await curves.count()).toBe(marksAtLevel(buildProjectGraph(graph), 'modules').futures)
    expect(await curves.first().getAttribute('d')).toContain('C')
    // The shelved future is still drawn, muted, with the reason it stored.
    expect(await page.locator('[data-mark="future"][data-muted="1"]').count()).toBe(1)
    await page.getByText(SHELF_REASON, { exact: false }).first().waitFor()
  }, 180_000)

  it('opens a module record from its lane title, and comes back from the Evolution block', async () => {
    await openThePage()
    await page.getByRole('link', { name: MODULE_A, exact: true }).first().click()
    await waitForThePage(page, 60_000)
    expect(await page.evaluate(() => window.location.hash)).toBe(`#${recordPath(moduleAId)}`)
    await page.getByRole('heading', { name: MODULE_A }).first().waitFor({ timeout: 30_000 })
    // The one link into the graph from a module's page sits in the Evolution block.
    await page.getByRole('link', { name: 'The whole project’s past, now and futures are on one page' }).click()
    await waitForThePage(page, 60_000)
    expect(await page.evaluate(() => window.location.hash)).toBe('#/project-graph')
    await page.locator('[data-graph-level]').waitFor({ timeout: 30_000 })
  }, 180_000)

  it('takes a picture at the widest and the narrowest width in the light look, and no width is drawn wider than its window', async () => {
    const shots = testShots('project-graph')
    const widths = [1440, 390] as const
    for (const width of widths) {
      const theme = 'light'
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${app.site}/?lang=en&look=${theme}#/project-graph`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('[data-graph-level]').waitFor({ timeout: 30_000 })
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), `${width}: the ${theme} look is on the page`).toBe(theme)
      expect(
        await page.locator('[data-graph-says="coverage"]').textContent(),
        `${width} ${theme}: the picture carries the no-map sentence`,
      ).toBe(t('projectGraph.coverage.noMap'))
      await chooseLevel('summaries')
      const wider = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        drawn: document.querySelector('.gph-page')?.getBoundingClientRect().width ?? 0,
        window: window.innerWidth,
      }))
      expect(wider.document, `${width} ${theme}: the document is wider than the window`).toBeLessThanOrEqual(wider.window)
      expect(wider.body, `${width} ${theme}: the body is wider than the window`).toBeLessThanOrEqual(wider.window)
      expect(wider.drawn, `${width} ${theme}: the page is drawn wider than the window`).toBeLessThanOrEqual(wider.window)
      const path = join(shots, `project-graph-${String(width)}-${theme}.png`)
      await page.locator('.gph-page').screenshot({ path })
    }
  }, 300_000)

  /**
   * THE MODULE RECORD PAGE THE EVOLUTION LINK SITS ON, at the widest and the narrowest width, in the light look. That
   * nothing is drawn wider than the window does not depend on the colours, so one look is read.
   */
  it('takes the module record page at the widest and the narrowest width in the light look, and no width is drawn wider than its window', async () => {
    const shots = testShots('project-graph-record')
    const widths = [1440, 390] as const
    for (const width of widths) {
      const theme = 'light'
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${app.site}/?lang=en&look=${theme}#${recordPath(moduleAId)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.getByRole('heading', { name: MODULE_A }).first().waitFor({ timeout: 30_000 })
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), `${width}: the ${theme} look is on the record page`).toBe(theme)
      const wider = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        drawn: document.querySelector('article.rp')?.getBoundingClientRect().width ?? 0,
        window: window.innerWidth,
      }))
      expect(wider.document, `${width} ${theme}: the record page is wider than the window`).toBeLessThanOrEqual(wider.window)
      expect(wider.body, `${width} ${theme}: the record page's body is wider than the window`).toBeLessThanOrEqual(wider.window)
      expect(wider.drawn, `${width} ${theme}: the record article is drawn wider than the window`).toBeLessThanOrEqual(wider.window)
      const path = join(shots, `module-record-${String(width)}-${theme}.png`)
      await page.locator('article.rp').screenshot({ path })
    }
  }, 300_000)
})

describe('the project graph on a past that is only a baseline, and on an empty project', () => {
  let sparse: LiveApp
  let sparsePage: Page

  beforeAll(async () => {
    sparse = await liveApp({ name: 'project-graph-sparse', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    // A FRESH OFFICE COPIES THE DEFAULT REGULATIONS AS MODULES. Removing them, as the person may, is what makes
    // this project empty of graph records.
    await deleteTheCopiedDefaultChapters(sparse.api)
    sparsePage = sparse.page
    await sparsePage.addInitScript(() => {
      const look = new URLSearchParams(location.search).get('look')
      if (look === 'light' || look === 'dark') localStorage.setItem('mole-office.preset.theme', look)
    })
  }, 240_000)

  afterAll(async () => {
    await sparse?.stop()
  })

  it('draws no lane for an empty project, then no revision tick for a baseline', async () => {
    await sparsePage.goto(`${sparse.site}/?lang=en&look=light&read=empty#/project-graph`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForThePage(sparsePage, 60_000)
    const empty = await graphOf(sparse.api)
    expect(buildProjectGraph(empty).empty, 'the fresh workspace holds nothing the graph draws').toBe(true)
    expect(empty.says, 'the reply says the project is empty').toContain(PROJECT_GRAPH_SAYS.empty())
    await sparsePage.getByText(t('projectGraph.lanes.none'), { exact: false }).first().waitFor({ timeout: 30_000 })
    expect(await sparsePage.locator('[data-mark="module"]').count(), 'an empty project draws no lane').toBe(0)

    // ONE MODULE, AND THEN EVERY REVISION ROW IN THE WORKSPACE IS MADE A BASELINE. The office may have
    // filed records of kinds this graph does not draw, so the whole project's ledger is turned, which is
    // what "the past is a baseline" is about.
    await make(sparse.api, 'module', MODULE_A, {})
    const database = new DatabaseSync(join(sparse.dir, 'panelx.db'))
    try {
      database.exec("UPDATE revisions SET op = 'baseline'")
    } finally {
      database.close()
    }

    const sparseReply = await graphOf(sparse.api)
    expect(sparseReply.counts.revisions, 'the workspace holds revision rows').toBeGreaterThan(0)
    expect(sparseReply.counts.realRevisions, 'not one revision row is real').toBe(0)
    expect(sparseReply.says.some((said) => said.includes('starting point and not a history')), sparseReply.says.join(' | ')).toBe(true)

    await sparsePage.goto(`${sparse.site}/?lang=en&look=light&read=baseline#/project-graph`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForThePage(sparsePage, 60_000)
    await sparsePage.locator('button[data-level="revisionsAndCheckpoints"]').click()
    await sparsePage.waitForFunction(
      () => document.querySelector('[data-graph-level]')?.getAttribute('data-graph-level') === 'revisionsAndCheckpoints',
    )
    expect(await sparsePage.locator('[data-mark="revision"]').count(), 'a baseline is not drawn as a revision tick').toBe(0)
    await sparsePage.getByText('no real revision yet', { exact: false }).first().waitFor({ timeout: 30_000 })
  }, 240_000)
})
