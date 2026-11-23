// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HORIZONS PAGE IN A REAL BROWSER, AT FOUR WIDTHS, IN BOTH THEMES. Criterion P5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ADDS TO tests/the-horizons-page.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * The other file renders the page's reading and its markup with no server. This one drives the real
 * page: it writes a small world through the product's own doors, opens `#/horizons`, and reads off
 * the screen that every part of P5 is there — a goal at each horizon, a cluster serving one, parts
 * under it, somebody on a part with a window, a goal nothing serves, and the three planned-against
 * actual sentences. It does that at 1440 and 390 in the light theme, because the parts the page
 * draws do not change with the theme. The picture case still photographs four widths and both looks
 * when a person names a folder for them.
 *
 * CRITERION CHANGE (wave 13j round 11, the goals piece): an agent's goal waiting for Confirm is a row under Needs you,
 * first on the page, with one sentence for the whole group; once confirmed it is drawn in its
 * horizon's group. It was a mark and a press inside the horizon's own list.
 *
 * THE DATA IS THIS TEST'S OWN. `liveApp` starts a fresh, empty database, so nothing here is the
 * owner's corpus and nothing here is seeded demo content.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { t } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page
let partOneId = ''

const AS_HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}
const AS_AGENT = { ...AS_HUMAN, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'perception' }
const AS_KILN = { ...AS_HUMAN, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'kiln' }

async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; as?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${app.api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.as ?? AS_HUMAN,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as T
}

/** A day `n` days from `day`, both in `YYYY-MM-DD`. */
function shiftDay(day: string, by: number): string {
  const at = new Date(`${day}T12:00:00`)
  at.setDate(at.getDate() + by)
  return at.toISOString().slice(0, 10)
}

let todayDay = ''
let agentGoalId = ''
let agentGoalUnconfirmedId = ''
const LONG_GOAL = 'Every transplant carries its measured force'
const DISTANT_GOAL = 'A season of transplants needs nobody watching'
const MEDIUM_GOAL = 'The potting rig transplants without crushing the pad'
const SHORT_GOAL = 'The reprinted clamp holds a pot'
const AGENT_GOAL = 'The transplant rig is watched by nobody'
const AGENT_GOAL_UNCONFIRMED = 'The rig learns from every trial'
const PART_WHAT = 'The clamp closes on a 60 mm pot without slipping.'
const TYPED_OWNER_GOAL = 'The potting rig has a written checklist'
const MET_GOAL = 'The first clamp print is on the bench'

async function goalOwnedBy(title: string, horizon: string, owner: string, state: Record<string, string>): Promise<string> {
  return (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'goal', title, data: { horizon, what: `${title}, and anybody can check it.`, owner, ...state } },
    })
  ).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'horizons', viewport: { width: 1440, height: 1000 } })
  page = app.page
  todayDay = (await callApi<{ day: string }>('/api/planning/today')).day

  const goal = async (title: string, horizon: string, what: string): Promise<string> =>
    (
      await callApi<{ record: { id: string } }>('/api/records', {
        method: 'POST',
        body: { kind: 'goal', title, data: { horizon, what, owner: THE_TEST_OFFICES_OWNER.id, state: 'open' } },
      })
    ).record.id
  const shortGoal = await goal(SHORT_GOAL, 'short', 'The v3 jaw holds a 60 mm pot through twenty trials.')
  const mediumGoal = await goal(MEDIUM_GOAL, 'medium', 'The rig releases a pot without crushing the pad.')
  await goal(LONG_GOAL, 'long', 'Every transplant records the force it met.')
  await goal(DISTANT_GOAL, 'distant', 'The rig is trusted to run a season with nobody watching.')

  // A CLUSTER THAT IS A PLANNED FUTURE, WITH PARTS.
  const partOne = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'planned_state', title: PART_WHAT, data: { what: PART_WHAT } },
    })
  ).record.id
  partOneId = partOne
  const partTwo = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'planned_state', title: 'The force is measured', data: { what: 'The holding force is measured.' } },
    })
  ).record.id
  const trajectory = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: {
        kind: 'trajectory',
        title: 'Tray clamp, step by step',
        data: { plannedStateIds: [partOne, partTwo], because: 'The shape is right before the force matters.' },
      },
    })
  ).record.id
  await callApi('/api/links', { method: 'POST', body: { fromId: trajectory, toId: shortGoal, type: 'serves' } })

  // A CLUSTER THAT IS A MODULE, WITH NO PARTS WRITTEN.
  const module = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'module', title: 'Force bench', data: { state: 'active' } },
    })
  ).record.id
  await callApi('/api/links', { method: 'POST', body: { fromId: module, toId: mediumGoal, type: 'serves' } })

  // SOMEBODY ON THE FIRST PART, AND THE WORK THAT MAKES IT REAL.
  const agent = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'agent', title: 'Perception', data: { handle: 'perception', state: 'active', runtime: 'claude-code' } },
    })
  ).record.id
  await callApi('/api/records', {
    method: 'POST',
    body: { kind: 'agent', title: 'Kiln', data: { handle: 'kiln', state: 'active', runtime: 'claude-code' } },
  })
  const work = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'task', title: 'Reprint the jaw', data: { state: 'doing' } },
    })
  ).record.id
  // TWO `realises` ANSWERS FROM TWO AGENTS AND ONE `instead_of`, each written by an agent so the
  // page has two names and three moments to draw.
  await callApi('/api/links', { method: 'POST', as: AS_AGENT, body: { fromId: work, toId: partOne, type: 'realises' } })
  const secondWork = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'task', title: 'Print the jaw at setting 13', data: { state: 'done' } },
    })
  ).record.id
  await callApi('/api/links', { method: 'POST', as: AS_KILN, body: { fromId: secondWork, toId: partOne, type: 'realises' } })
  const thirdWork = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'task', title: 'Polish the jaw', data: { state: 'done' } },
    })
  ).record.id
  await callApi('/api/links', { method: 'POST', as: AS_AGENT, body: { fromId: thirdWork, toId: partOne, type: 'instead_of' } })
  const domain = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: {
        kind: 'work_domain',
        title: 'Clamp force scope',
        data: { objective: 'Measure the holding force.', agent, writes: ['src/clamp/force.py'] },
      },
    })
  ).record.id
  await callApi('/api/links', { method: 'POST', body: { fromId: domain, toId: partOne, type: 'about' } })

  // A LATE WINDOW ON THAT WORK, MADE BY THE AGENT SO IT IS AN AGENT'S WINDOW.
  await callApi('/api/planning/windows', {
    method: 'POST',
    as: AS_AGENT,
    body: { recordId: work, startsOn: shiftDay(todayDay, -3), endsOn: shiftDay(todayDay, -1) },
  })

  // A DROPPED LINE OF THE PLAN.
  const allocation = await callApi<{ allocation: { id: string } }>('/api/planning/allocations', {
    method: 'POST',
    body: { horizon: 'month', period: todayDay.slice(0, 7), recordId: work, plannedHours: 3 },
  })
  await callApi(`/api/planning/allocations/${allocation.allocation.id}`, {
    method: 'PATCH',
    body: { state: 'dropped', note: 'the reprint slipped' },
  })

  // A PART THAT IS REAL AND IN NO TRAJECTORY.
  const orphan = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'planned_state', title: 'The jaw is reprinted', data: { what: 'The jaw is reprinted at setting 13.' } },
    })
  ).record.id
  const builder = (
    await callApi<{ record: { id: string } }>('/api/records', {
      method: 'POST',
      body: { kind: 'task', title: 'Print the jaw at setting 13', data: { state: 'done' } },
    })
  ).record.id
  await callApi('/api/links', { method: 'POST', body: { fromId: builder, toId: orphan, type: 'realises' } })

  // A GOAL AN AGENT FILED, which P1 marks as the agent's until the person confirms it. The mark's
  // press is what this file's last describe drives: one goal the person confirms, and one left
  // unconfirmed for the agent's view.
  const agentsGoal = async (title: string): Promise<string> =>
    (
      await callApi<{ record: { id: string } }>('/api/records', {
        method: 'POST',
        as: AS_AGENT,
        body: {
          kind: 'goal',
          title,
          data: { horizon: 'long', what: 'The rig runs a season without anything written on paper.', owner: THE_TEST_OFFICES_OWNER.id, state: 'open' },
        },
      })
    ).record.id
  agentGoalId = await agentsGoal(AGENT_GOAL)
  agentGoalUnconfirmedId = await agentsGoal(AGENT_GOAL_UNCONFIRMED)

  // A GOAL WHOSE OWNER IS WRITTEN AS TEXT NO REGISTRY HOLDS, and a goal that has been met.
  await goalOwnedBy(TYPED_OWNER_GOAL, 'medium', 'the potting team', { state: 'open' })
  await goalOwnedBy(MET_GOAL, 'short', THE_TEST_OFFICES_OWNER.id, {
    state: 'met',
    state_at: shiftDay(todayDay, -2),
    state_because: 'The clamp held a pot through twenty trials, measured twice.',
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open an address on a fresh document and wait for the app to be ready. */
async function open(hash: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.hz-title', { timeout: 30_000 })
}

/** Everything the page prints, with the stylesheets taken out so a comment is never evidence. */
async function words(): Promise<string> {
  return page.locator('#main').innerText()
}

describe('the page draws every part of P5', () => {
  it('draws the four horizons, the goals, the clusters, the parts, who is on one and its window', async () => {
    await open('/horizons')
    const said = await words()
    // F draws section headings in uppercase; innerText reads the case drawn by CSS.
    for (const word of ['SHORT GOALS', 'MEDIUM GOALS', 'LONG GOALS', 'DISTANT GOALS']) {
      expect(said, word).toContain(word)
    }
    for (const title of [SHORT_GOAL, MEDIUM_GOAL, LONG_GOAL, DISTANT_GOAL]) {
      expect(said, title).toContain(title)
    }
    expect(said).toContain('Tray clamp, step by step')
    expect(said).toContain(PART_WHAT)
    // Normal mode names the agent on a window by its name, never its handle (report 7FEOshq3mBGG, block b-6).
    expect(said).toContain('Perception')
    expect(said).toContain("Perception's window")
    expect(said).not.toContain("perception's window")
  }, 120_000)

  it('draws a goal nothing serves as such, and a cluster with no parts', async () => {
    const said = await words()
    // Ordinary emptiness is the short mark, not a sentence (report 7FEOshq3mBGG, block b-6).
    expect(said).not.toContain('Nothing serves this goal yet.')
    expect(said).toContain('—')
    expect(said).not.toContain('This cluster has no planned future, so it has no parts.')
  }, 120_000)

  it('names all three planned-against-actual facts in words', async () => {
    const said = await words()
    expect(said).toContain('A late window')
    expect(said).toContain('A dropped line')
    expect(said).toContain('A part built that no plan named')
    expect(said).toContain('was meant to be worked on until')
    expect(said).toContain('was dropped, so that time did not happen')
    expect(said).toContain('made "The jaw is reprinted at setting 13." real')
  }, 120_000)

  it('draws the three answers with their writers and moments, and counts them', async () => {
    await open('/horizons')
    const said = await words()
    expect(said).toContain('3 answers')
    const answers = page.locator('.hz-answer')
    expect(await answers.count(), 'the part does not draw its three answers').toBe(3)
    expect(await answers.filter({ hasText: 'Perception' }).count()).toBeGreaterThan(0)
    expect(await answers.filter({ hasText: 'Kiln' }).count()).toBeGreaterThan(0)
    expect(await answers.locator('time').count(), 'an answer draws no moment').toBe(3)
    const moments = await answers.locator('time').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('datetime') ?? ''),
    )
    for (const at of moments) expect(at, 'an answer draws no stored moment').toMatch(/^\d{4}-\d{2}-\d{2} /)
  }, 120_000)
})

/**
 * THE GOALS PAGE AS DESIGNED AGAIN IN WAVE 13J ROUND 11.
 *
 * The answers to wave 13k's proposal (report n9Mjk3c_sJRu, block b-17 and question 16): what needs
 * the owner first, a grouped list by horizon, then where the plan and what happened differ, and the goal
 * drawing moved here from the Schedule. And problem HO6m_XXWJgtM: a goal drew a bare line of its
 * kind, its owner's stored text and its stored state word, and a module under a goal a dash with no
 * reason. Each case below names the one line of product code its mutation broke.
 */
describe('the Goals page as designed again', () => {
  it('draws Needs you first, each agent goal with its Confirm press, and that goal nowhere else', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await open('/horizons')
    const seen = await page.evaluate(() => ({
      order: Array.from(document.querySelectorAll<HTMLElement>('.hz-group, .hz-needs-none')).map(
        (one) => one.dataset['group'] ?? one.getAttribute('data-target'),
      ),
      rows: Array.from(document.querySelectorAll<HTMLElement>('[data-group="needs-you"] .hz-needrow')).map((row) => ({
        title: row.querySelector('.hz-needlink')?.textContent ?? '',
        presses: Array.from(row.querySelectorAll('button')).map((one) => one.textContent ?? ''),
      })),
      titles: Array.from(document.querySelectorAll('.hz-needlink, .hz-goalname')).map((one) => one.textContent ?? ''),
      drawingLast:
        document.querySelector('.hz-differ') !== null &&
        document.querySelector('.hz-drawing') !== null &&
        (document.querySelector('.hz-differ')!.compareDocumentPosition(document.querySelector('.hz-drawing')!) &
          Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    }))
    expect(seen.order).toEqual([
      'needs-you',
      'uiSurface/horizons.short',
      'uiSurface/horizons.medium',
      'uiSurface/horizons.long',
      'uiSurface/horizons.distant',
      'uiSurface/horizons.against',
    ])
    expect(seen.drawingLast, 'the goal drawing is not after where the plan and what happened differ').toBe(true)
    expect(seen.rows.map((row) => row.title).sort()).toEqual([AGENT_GOAL, AGENT_GOAL_UNCONFIRMED].sort())
    for (const row of seen.rows) expect(row.presses, row.title).toEqual(['Confirm this goal'])
    for (const title of [AGENT_GOAL, AGENT_GOAL_UNCONFIRMED]) {
      expect(seen.titles.filter((one) => one === title), `${title} is drawn more than once`).toHaveLength(1)
    }
  }, 120_000)

  it('lists each goal under its own horizon, and each heading counts the goals under it', async () => {
    const groups = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hz-group[data-target^="uiSurface/horizons."]'))
        .filter((one) => one.getAttribute('data-target') !== 'uiSurface/horizons.against')
        .map((one) => ({
          at: one.getAttribute('data-target'),
          count: one.querySelector('.hz-count')?.textContent ?? '',
          goals: Array.from(one.querySelectorAll('.hz-goalname')).map((name) => name.textContent ?? ''),
        })),
    )
    const at = (name: string) => groups.find((one) => one.at === `uiSurface/horizons.${name}`)!
    expect(at('short').goals.sort()).toEqual([MET_GOAL, SHORT_GOAL].sort())
    expect(at('medium').goals.sort()).toEqual([MEDIUM_GOAL, TYPED_OWNER_GOAL].sort())
    expect(at('long').goals).toEqual([LONG_GOAL])
    expect(at('distant').goals).toEqual([DISTANT_GOAL])
    for (const group of groups) expect(group.count, String(group.at)).toBe(String(group.goals.length))
  }, 120_000)

  it('draws where the plan and what happened differ as three lists side by side at 1440, stacked at 390', async () => {
    const tops = async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.hz-differ .hz-actual')).map((one) => Math.round(one.getBoundingClientRect().top)),
      )
    const wide = await tops()
    expect(wide).toHaveLength(3)
    expect(new Set(wide).size, `the three lists are not on one row at 1440: ${JSON.stringify(wide)}`).toBe(1)
    await page.setViewportSize({ width: 390, height: 844 })
    const narrow = await tops()
    expect(narrow[0]!, 'the lists are not stacked at 390').toBeLessThan(narrow[1]!)
    expect(narrow[1]!, 'the lists are not stacked at 390').toBeLessThan(narrow[2]!)
    await page.setViewportSize({ width: 1440, height: 1000 })
  }, 120_000)

  it('draws the goal drawing on the Goals page', async () => {
    await open('/horizons')
    const drawing = page.locator('.hz-drawing [data-target="uiSurface/plan.toward"]')
    expect(await drawing.count(), 'the Goals page draws no goal drawing').toBe(1)
    expect(await drawing.innerText()).toContain(SHORT_GOAL)
  }, 120_000)

  it('says who owns each goal and where it stands in words, with no kind tag, handle or stored state word', async () => {
    const facts = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hz-goal')).map((goal) => ({
        title: goal.querySelector('.hz-goalname')?.textContent ?? '',
        facts: (goal.querySelector('.hz-facts') as HTMLElement).innerText,
        ownerTitle: goal.querySelector('.hz-owner')?.getAttribute('title') ?? null,
        pieces: Array.from(goal.querySelectorAll('.hz-facts > *')).map((one) => (one.textContent ?? '').trim()),
      })),
    )
    const of = (title: string) => facts.find((one) => one.title === title)!
    expect(of(SHORT_GOAL).facts).toContain(`Owner: ${THE_TEST_OFFICES_OWNER.name}`)
    expect(of(SHORT_GOAL).facts).toContain('Not met yet')
    expect(of(MET_GOAL).facts).toContain(`Met on ${shiftDay(todayDay, -2)}`)
    expect(of(TYPED_OWNER_GOAL).facts).toContain('Owner: “the potting team”')
    expect(of(TYPED_OWNER_GOAL).ownerTitle).toBe(
      'No registered person or agent has this name or handle, so it is shown as it was written.',
    )
    for (const one of facts) {
      expect(one.facts, `${one.title}: the kind is said on the row`).not.toMatch(/\bgoal\b/i)
      expect(one.facts, `${one.title}: the stored handle is drawn`).not.toMatch(new RegExp(`\\b${THE_TEST_OFFICES_OWNER.id}\\b`))
      for (const piece of one.pieces) {
        expect(['open', 'met', 'dropped', 'goal', THE_TEST_OFFICES_OWNER.id], `${one.title}: a stored word is drawn on its own`).not.toContain(piece)
      }
    }
  }, 120_000)

  it('gives every dash on the page its reason, and draws none under a module', async () => {
    const seen = await page.evaluate(() => ({
      dashes: Array.from(document.querySelectorAll<HTMLElement>('.hz .px-absent'))
        .filter((one) => one.closest('.hz-drawing') === null)
        .map((one) => one.getAttribute('title') ?? ''),
      underModule: Array.from(document.querySelectorAll<HTMLElement>('.hz-cluster'))
        .filter((one) => (one.querySelector('.hz-clustername')?.textContent ?? '').includes('Force bench'))
        .map((one) => one.querySelectorAll('.px-absent').length),
    }))
    expect(seen.dashes.length, 'no dash on the page, so this measured nothing').toBeGreaterThan(0)
    for (const reason of seen.dashes) expect(reason.trim(), 'a dash with no reason').not.toBe('')
    expect(seen.underModule, 'the module serving a goal is not drawn').toEqual([0])
  }, 120_000)

  it('leaves the Schedule without the goal drawing', async () => {
    await page.goto('about:blank')
    await page.goto(`${app.site}/#/plan`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-plan-page', { timeout: 30_000 })
    expect(await page.locator('[data-target="uiSurface/plan.toward"]').count(), 'the Schedule still draws the goal drawing').toBe(0)
    expect(await page.locator('.pg').count()).toBe(0)
  }, 120_000)

  it('photographs the page at four widths in both looks, and at 1440 in Chinese, when HORIZONS_SHOTS names a folder', async () => {
    const shots = process.env['HORIZONS_SHOTS']
    if (shots === undefined || shots === '') return
    mkdirSync(shots, { recursive: true })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark']) {
        for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
          const context = await app.browser.newContext({ viewport: { width, height: width < 700 ? 900 : 1000 }, colorScheme: theme as 'light' | 'dark' })
          await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
          const shot = await context.newPage()
          try {
            await shot.goto(`${app.site}/?lang=${language}#/horizons`, { timeout: 60_000 })
            await waitForThePage(shot, 60_000)
            await shot.screenshot({ path: join(shots, `goals-${String(width)}-${theme}-${language}.png`), fullPage: true })
          } finally {
            await context.close()
          }
        }
      }
    }
    for (const theme of ['light', 'dark']) {
      const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme as 'light' | 'dark' })
      await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
      const shot = await context.newPage()
      try {
        await shot.goto(`${app.site}/#/plan`, { timeout: 60_000 })
        await waitForThePage(shot, 60_000)
        await shot.screenshot({ path: join(shots, `schedule-1440-${theme}-en.png`), fullPage: true })
      } finally {
        await context.close()
      }
    }
    // THE OTHER CHANGED SCREEN: the part's record page, with the Links fold open, so the answer
    // line's weight and its fit at every width and in both looks can be looked at.
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark']) {
        const context = await app.browser.newContext({ viewport: { width, height: width < 700 ? 900 : 1000 }, colorScheme: theme as 'light' | 'dark' })
        await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
        const shot = await context.newPage()
        try {
          await shot.goto(`${app.site}/#${recordPath(partOneId)}`, { timeout: 60_000 })
          await waitForThePage(shot, 60_000)
          await shot.waitForSelector('details.rd-fold', { timeout: 30_000 })
          // THE FOLD THAT HOLDS THE ANSWER, not simply the first fold on the page: a record page
          // has more than one fold and the answer's is the one whose rows carry the line.
          const folds = shot.locator('details.rd-fold')
          for (let at = 0; at < await folds.count(); at += 1) {
            if (await folds.nth(at).locator('.lp-answer').count()) {
              await folds.nth(at).locator('summary').click()
              break
            }
          }
          await shot.locator('.lp-answer').first().waitFor({ state: 'visible', timeout: 30_000 })
          await shot.screenshot({ path: join(shots, `record-answer-${String(width)}-${theme}-en.png`), fullPage: true })
        } finally {
          await context.close()
        }
      }
    }
  }, 600_000)
})

describe('the page at 1440 and 390 in light', () => {
  const WIDTHS = [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]
  // LIGHT ONLY. The parts the page draws do not change with the theme.
  for (const theme of ['light']) {
    for (const size of WIDTHS) {
      it(`draws at ${String(size.width)} in ${theme}`, async () => {
        await page.setViewportSize(size)
        await open('/horizons')
        await page.evaluate((name) => document.documentElement.setAttribute('data-theme', name), theme)
        const said = await words()
        expect(said, `${String(size.width)} ${theme}`).toContain(SHORT_GOAL)
        expect(said).toContain('A part built that no plan named')
        // Nothing runs off the side, which is the failure a 390 measurement exists to catch.
        const wide = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          window: window.innerWidth,
        }))
        expect(wide.scroll, `the page scrolls sideways at ${String(size.width)} in ${theme}`).toBeLessThanOrEqual(
          wide.window,
        )
      }, 120_000)
    }
  }
})

describe('the confirm press on an agent-filed goal (criterion P1)', () => {
  it('lets the person press it, sets confirmed_by and takes the mark away without a reload', async () => {
    // The default reader is the person; nothing in this file has acted as anybody else yet.
    await page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
    await open('/horizons')
    const said = await words()
    // CRITERION CHANGE, as decided: the sentence under the heading is gone; the heading's own words
    // say whose move it is. Read as text, because the heading's style may set its case.
    expect(await page.locator('[data-group="needs-you"] .hz-head span').first().textContent()).toBe(t('goals.needsYou'))
    expect(said).toContain('Confirm this goal')
    // The press is on the goal's row under Needs you; the other agent goal keeps its own.
    const row = page.locator('[data-group="needs-you"] .hz-needrow', { hasText: AGENT_GOAL })
    expect(await row.count(), 'the agent goal has no row under Needs you').toBe(1)
    // A MARK OF THE SAME DOCUMENT. If the press reloaded the page this flag would be gone.
    await page.evaluate(() => {
      ;(window as unknown as { __pressRanInPlace: boolean }).__pressRanInPlace = true
    })
    await row.getByRole('button', { name: 'Confirm this goal' }).click()
    // Confirmed, the goal leaves Needs you and is drawn in its own horizon's group, with no press.
    await page.waitForFunction(
      (title) =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-group="needs-you"] .hz-needrow')).every(
          (one) => !one.innerText.includes(title),
        ),
      AGENT_GOAL,
      { timeout: 30_000 },
    )
    expect(await page.evaluate(() => (window as unknown as { __pressRanInPlace: boolean }).__pressRanInPlace)).toBe(true)
    const moved = page.locator('[data-target="uiSurface/horizons.long"] .hz-goal', { hasText: AGENT_GOAL })
    expect(await moved.count(), 'the confirmed goal is not in the long goals').toBe(1)
    expect(await moved.innerText()).not.toContain('Confirm this goal')
    const got = await callApi<{ record: { data: { confirmed_by: { by: string; at: string } } } }>(
      `/api/records/${agentGoalId}`,
    )
    expect(got.record.data.confirmed_by).toMatchObject({ by: THE_TEST_OFFICES_OWNER.id })
  }, 120_000)

  it('shows the agent the mark and no press, and the door refuses the write underneath', async () => {
    await page.goto('about:blank')
    await page.goto(`${app.site}/#/horizons`, { timeout: 60_000 })
    await page.waitForSelector('.hz-title', { timeout: 30_000 })
    await page.evaluate(() =>
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'perception' })),
    )
    await page.reload()
    await page.waitForSelector('.hz-title', { timeout: 30_000 })
    await page.waitForFunction(
      () => !(document.querySelector('#main') as HTMLElement)!.innerText.includes('LOADING'),
      undefined,
      { timeout: 30_000 },
    )
    const said = await words()
    expect(said).toContain(AGENT_GOAL_UNCONFIRMED)
    expect(await page.locator('[data-group="needs-you"] .hz-head span').first().textContent()).toBe(t('goals.waitingForThePerson'))
    expect(said).not.toContain('Confirm this goal')
    const patch = await fetch(`${app.api}/api/records/${agentGoalUnconfirmedId}`, {
      method: 'PATCH',
      headers: AS_AGENT,
      body: JSON.stringify({ dataPatch: { confirmed_by: { by: 'perception', at: todayDay } } }),
    })
    expect(patch.status).toBe(403)
    expect(await patch.text()).toContain('confirmed_by')
    // The person default is back for anything reading this browser later.
    await page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
  }, 120_000)
})
