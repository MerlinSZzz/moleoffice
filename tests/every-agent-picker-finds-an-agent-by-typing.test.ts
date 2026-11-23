// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY AGENT PICKER FINDS AN AGENT BY TYPING, ON A MADE-UP OFFICE OF SEVERAL THOUSAND AGENTS.
 *
 * Every picker where a person chooses an agent draws the one shared picker, src/web/components/agent/AgentPicker.tsx.
 * This test opens two of them in a real browser: the "Who answers for this agent" panel on an agent's page, and the
 * sender picker on the Messages page. It checks the picker the way a person meets it:
 *   - the people come first, then the secretaries, the supervisors, the agents working now and the rest, each group
 *     in the order of its names;
 *   - no retired agent is drawn before the person asks for them, not even when part of its handle is typed;
 *   - typing part of a handle finds that agent, when the name does not hold those letters;
 *   - the panel offers no retired agent at all, because a retired agent cannot answer for another and its door refuses
 *     one; the Messages page's sender picker does offer them, and after its press a typed retired worker is found.
 * It runs at 1440 by 1000 and 390 by 900, in the light theme. It fails only on a wrong order, a missing match, a
 * retired agent shown before the press, or a page that does not draw.
 *
 * WITH TEST_SHOTS SET it takes 2 pictures, open-picker-1440-light.png and open-picker-390-light.png: the starter
 * panel with the picker's list open and nothing typed, with a made-up label as a strip outside the page.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and every agent in it is made up and
 * made through the doors a person uses, with no SQL. Every name says "Made-up".
 *   - 2 secretaries and 3 supervisors.
 *   - 5 working agents. Each has a running session and a held handle, as tools/hold-the-handle.mjs takes one, so the
 *     chat's dot reads it as online.
 *   - 1 agent whose page is opened.
 *   - 190 workers that are not working.
 *   - 2,800 retired workers: registered, then retired at the retire door.
 * That is 3,001 agents. A handle here never holds the letters typed to find it by its name, and a name never holds
 * the letters typed to find it by its handle, so a match by handle is a match by handle.
 */

import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { fakeTranscript, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'
import { t } from '../src/shared/i18n.ts'

const SHOTS = (process.env[TEST_SHOTS] ?? '') === '' ? null : testShots('every-agent-picker-finds-an-agent-by-typing')

/** One line at 390, so the strip is about 34 pixels tall. */
const THE_LABEL = 'Made-up data, in a test office.'

type Theme = 'light' | 'dark'

/** The order the picker draws its groups in. A row's `data-group` says which group it is in. */
const THE_GROUP_ORDER = ['people', 'secretary', 'supervisor', 'working', 'rest'] as const

interface MadeUpAgent {
  handle: string
  name: string
  role: string
}

/** Each list is written out of name order, so a picker that kept the order of registration fails. */
const SECRETARIES: readonly MadeUpAgent[] = [
  { handle: 'mu-sec-1', name: 'Made-up secretary Birch', role: 'secretary' },
  { handle: 'mu-sec-2', name: 'Made-up secretary Alder', role: 'secretary' },
]
const SUPERVISORS: readonly MadeUpAgent[] = [
  { handle: 'mu-sup-1', name: 'Made-up supervisor Cedar', role: 'supervisor' },
  { handle: 'mu-sup-2', name: 'Made-up supervisor Aspen', role: 'supervisor' },
  { handle: 'mu-sup-3', name: 'Made-up supervisor Beech', role: 'supervisor' },
]
const WORKING: readonly MadeUpAgent[] = [
  { handle: 'mu-work-1', name: 'Made-up working agent Larch', role: 'worker' },
  { handle: 'mu-work-2', name: 'Made-up working agent Elm', role: 'worker' },
  { handle: 'mu-work-3', name: 'Made-up working agent Oak', role: 'worker' },
  { handle: 'mu-work-4', name: 'Made-up working agent Fir', role: 'worker' },
  { handle: 'mu-work-5', name: 'Made-up working agent Hazel', role: 'worker' },
]
const THE_ONE_OPENED: MadeUpAgent = { handle: 'mu-opened', name: 'Made-up agent whose page is opened', role: 'worker' }
const four = (i: number): string => String(i).padStart(4, '0')
const RESTING: readonly MadeUpAgent[] = Array.from({ length: 190 }, (_, i) => ({ handle: `mu-rest-${four(i + 1)}`, name: `Made-up worker ${four(i + 1)}`, role: 'worker' }))
const RETIRED: readonly MadeUpAgent[] = Array.from({ length: 2800 }, (_, i) => ({ handle: `mu-old-${four(i + 1)}`, name: `Made-up retired worker ${four(i + 1)}`, role: 'worker' }))

/** The registry id and key of each agent, by handle, read back from the door that registered it. */
const registered = new Map<string, { id: string; key: string }>()
/** The session each working agent's hold is on, by handle. */
const sessions = new Map<string, string>()

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

function asTheAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': registered.get(handle)!.key,
  }
}

async function send(method: string, url: string, body: object, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** An agent registered through the door the product registers agents at. */
async function register(agent: MadeUpAgent): Promise<void> {
  const made = await send('POST', '/api/agents/started', agent)
  registered.set(agent.handle, { id: made['agent'].id as string, key: made['whatToGiveIt'].key as string })
}

/** Some calls at a time, so thousands of registrations do not wait for each other one by one. */
async function inTurns<T>(items: readonly T[], each: (item: T) => Promise<void>, atOnce = 8): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: atOnce }, async () => {
      while (next < items.length) {
        const item = items[next]!
        next += 1
        await each(item)
      }
    }),
  )
}

/**
 * MAKE ONE AGENT WORK: a running session whose transcript grew just now, with a hold taken on its handle, asked as
 * tools/hold-the-handle.mjs asks it. As tests/the-cannot-reach-list-follows-the-answering.test.ts does.
 */
async function itWorks(agent: MadeUpAgent): Promise<void> {
  const { id } = registered.get(agent.handle)!
  const made = await send(
    'POST',
    '/api/records',
    {
      kind: 'session',
      title: `A made-up session of ${agent.handle}`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        servingAgent: agent.handle,
        ranAs: [{ workspaceId: 'default', agentId: id }],
        extra: { discovered: { tool: 'claude-code', externalId: agent.handle, logPath: fakeTranscript(agent.handle), resumeCommand: null, startedAt: null, entryPoint: null } },
      },
    },
    { ...PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
  )
  const session = made['record'].id as string
  sessions.set(agent.handle, session)
  await send('POST', `/api/handles/${agent.handle}/hold`, { session, machine: 'a-made-up-machine', runtime: 'claude-code' }, asTheAgent(agent.handle))
}

/** A hold lapses after 90 seconds without a beat, so each look beats every hold and grows every transcript first. */
async function theyStillWork(): Promise<void> {
  for (const agent of WORKING) {
    fakeTranscript(agent.handle)
    await send('POST', `/api/handles/${agent.handle}/beat`, { session: sessions.get(agent.handle)! }, asTheAgent(agent.handle))
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'every-agent-picker-finds-an-agent-by-typing', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // Each made-up retired worker is retired as soon as it is registered, because a retirement takes longer the more
  // agents are not retired. Retiring all of them after registering them all took longer than the test's run is allowed.
  await inTurns(RETIRED, async (agent) => {
    await register(agent)
    await send('POST', `/api/participants/agent/${registered.get(agent.handle)!.id}/retire`, { because: 'A made-up retirement, for a test office.' })
  })
  await inTurns([...SECRETARIES, ...SUPERVISORS, ...WORKING, THE_ONE_OPENED, ...RESTING], register)
  for (const agent of WORKING) await itWorks(agent)
}, 1_200_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The panel that holds the picker on the opened agent's page. */
const thePanel = (page: Page): Locator =>
  page.locator('section.px-panel').filter({ has: page.getByRole('heading', { name: t('starterMove.title') }) })

/** Open the opened agent's page at one width and in one theme, with the theme set before it opens. */
async function openThePage(page: Page, theme: Theme, width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 })
  const where = `${app.site}/?lang=en#/who/agent/${registered.get(THE_ONE_OPENED.handle)!.id}`
  if (!page.url().startsWith(app.site)) {
    await page.goto(where, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
  }
  await page.evaluate((look) => {
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  await page.goto('about:blank')
  await page.goto(where, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await thePanel(page).getByRole('button', { name: t('starterMove.change') }).waitFor({ state: 'visible', timeout: 60_000 })
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
}

/** The Messages page in the theme already set, with its filters open. It returns the sender picker itself, whose root carries the class px-ms-sender. A lookup inside it names what is below the picker's root, so such a lookup does not begin with `.agp`. */
async function theSenderPicker(page: Page): Promise<Locator> {
  await page.goto(`${app.site}/?lang=en#/messages`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-ms-narrow-open').click()
  const sender = page.locator('.px-ms-filters .px-ms-sender')
  await sender.getByLabel(t('messages.page.bySender')).waitFor({ state: 'visible', timeout: 60_000 })
  return sender
}

interface ADrawnRow {
  value: string
  group: string
  handle: string
}

/** Every row the picker inside this part of the page draws, in the order it draws them. */
async function theRows(panel: Locator): Promise<ADrawnRow[]> {
  return panel.locator('.agp-row').evaluateAll((rows) =>
    rows.map((row) => ({
      value: (row as HTMLElement).dataset['value'] ?? '',
      group: (row as HTMLElement).dataset['group'] ?? '',
      handle: row.querySelector('.agp-handle')?.textContent ?? '',
    })),
  )
}

/** The handles of these made-up agents in the order of their names, which is the order the picker draws them in. */
const inNameOrder = (agents: readonly MadeUpAgent[]): string[] =>
  [...agents].sort((a, b) => a.name.localeCompare(b.name)).map((one) => one.handle)

/** The made-up rows of one group, in the order they are drawn. */
const drawnIn = (rows: readonly ADrawnRow[], group: string, agents: readonly MadeUpAgent[]): string[] => {
  const handles = new Set(agents.map((one) => one.handle))
  return rows.filter((row) => row.group === group && handles.has(row.handle)).map((row) => row.handle)
}

const isRetired = new Set(RETIRED.map((one) => one.handle))

/** No row of a retired agent is drawn. */
function noRetiredRow(rows: readonly ADrawnRow[]): void {
  expect(rows.filter((row) => row.group === 'retired' || isRetired.has(row.handle))).toEqual([])
}

/** Type into the picker's search box and wait until a row answers what was typed, or the box says nothing matches. */
async function typeIn(panel: Locator, typed: string): Promise<void> {
  await panel.getByLabel(t('starterMove.to')).fill(typed)
  await expect.poll(async () => panel.locator('.agp').getAttribute('data-typed'), { timeout: 30_000 }).toBe(typed)
}

/** One picture of the window, with the made-up label as a strip along its top. */
async function photograph(page: Page, panel: Locator, name: string): Promise<void> {
  if (SHOTS === null) return
  await panel.scrollIntoViewIfNeeded()
  await putTheMadeUpLabelIn(page, THE_LABEL, panel, name, { stripOutsideThePage: true })
  await page.mouse.move(0, 0)
  await page.screenshot({ path: join(SHOTS, `${name}.png`) })
  await takeTheMadeUpLabelOut(page)
}

for (const width of [1440, 390] as const) {
  const theme = 'light'
    it(`finds a made-up agent by typing, in order and with no retired agent before the press, at ${String(width)} ${theme}`, async () => {
      const page = app.page
      await theyStillWork()
      await openThePage(page, theme, width)
      const panel = thePanel(page)
      await panel.getByRole('button', { name: t('starterMove.change') }).click()
      const box = panel.getByLabel(t('starterMove.to'))
      await box.waitFor({ state: 'visible', timeout: 60_000 })
      await box.click()

      // 1. NOTHING TYPED: THE GROUPS IN ORDER, AND THE FIVE WORKING AGENTS ONCE PRESENCE IS READ.
      await expect
        .poll(async () => drawnIn(await theRows(panel), 'working', WORKING), { timeout: 60_000 })
        .toEqual(inNameOrder(WORKING))
      const rows = await theRows(panel)
      noRetiredRow(rows)
      expect(rows[0], 'the person is the first row').toEqual(expect.objectContaining({ group: 'people', value: THE_TEST_OFFICES_OWNER.id }))
      const groups = rows.map((row) => THE_GROUP_ORDER.indexOf(row.group as (typeof THE_GROUP_ORDER)[number]))
      expect(groups.filter((at) => at === -1), 'every row is in one of the five groups').toEqual([])
      expect(groups, 'the groups are drawn in their order').toEqual([...groups].sort((a, b) => a - b))
      expect(drawnIn(rows, 'secretary', SECRETARIES)).toEqual(inNameOrder(SECRETARIES))
      expect(drawnIn(rows, 'supervisor', SUPERVISORS)).toEqual(inNameOrder(SUPERVISORS))
      expect(drawnIn(rows, 'rest', RESTING).length, 'the rest are drawn after the working agents').toBeGreaterThan(0)
      if (theme === 'light') await photograph(page, panel, `open-picker-${String(width)}-light`)

      // 2. PART OF A HANDLE FINDS ITS AGENT. Neither name holds the letters typed.
      for (const [typed, handle] of [['sup-2', 'mu-sup-2'], ['rest-0123', 'mu-rest-0123'], ['work-4', 'mu-work-4']] as const) {
        await typeIn(panel, typed)
        const found = await theRows(panel)
        noRetiredRow(found)
        expect(found.map((row) => row.handle), `typing "${typed}"`).toContain(handle)
      }

      // 3. THE PANEL OFFERS NO RETIRED WORKER, typed or not, and no press to show one: none may answer for another.
      await typeIn(panel, 'old-1234')
      noRetiredRow(await theRows(panel))
      expect(await panel.locator('.agp-retired').count(), 'the panel offers retired agents, which cannot answer').toBe(0)

      // 4. ON THE MESSAGES PAGE A TYPED RETIRED WORKER IS NOT FOUND BEFORE THE PRESS, AND IS FOUND AFTER IT.
      const sender = await theSenderPicker(page)
      await sender.getByLabel(t('messages.page.bySender')).fill('old-1234')
      await expect.poll(async () => sender.getAttribute('data-typed'), { timeout: 30_000 }).toBe('old-1234')
      noRetiredRow(await theRows(sender))
      await sender.locator('.agp-retired').click()
      await expect
        .poll(async () => (await theRows(sender)).filter((row) => row.group === 'retired').map((row) => row.handle), { timeout: 30_000 })
        .toContain('mu-old-1234')
    }, 300_000)
}
