// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ALL RECORDS AND COUNTERS READ ACROSS PROJECTS, IN A REAL BROWSER. A decision the owner made on
 * 29 September 2026: the general pages stand under All projects and read across projects, and each
 * keeps one plain choice to show a single project.
 *
 * This test starts the app on a temporary database (`liveApp`), makes a second project, Robotics,
 * files records and a counter in each project, and opens #/records and #/counters. It reads what the
 * pages draw:
 *
 *   1. ROWS FROM TWO PROJECTS. With Every project chosen, the rows of both projects are drawn, and
 *      each row names its project (All records: the Project column; Counters: the card).
 *   2. THE SINGLE-PROJECT CHOICE. The page starts at the project it was opened from, shown chosen in
 *      the control. Choosing Robotics draws only Robotics's rows. The old reading by the header,
 *      GET /api/records with no projects word, still answers the header's project alone.
 *   3. THE COUNTS ACROSS PROJECTS. The count line adds up over what is chosen and says what it is
 *      counted over.
 *   4. A READER WHO MAY NOT READ SOMETHING SEES NONE OF IT. No rule keeps a reader out of a whole
 *      project today (src/shared/disclosure.ts; the secretary's message Ux8NxlYa-f4o). The rule that is true
 *      is the message rule: a made-up message between two other agents in
 *      Robotics is not drawn for an agent that is no party to it, with Every project chosen, and it is
 *      drawn for the person.
 *   5. NEW RECORD SAYS WHERE IT FILES. With Every project chosen, the form draws a Project field, and
 *      a record filed there goes into the project chosen in it.
 *   6. A COUNTER IN ANOTHER PROJECT CAN BE PAUSED FROM THE LIST: the press goes to the counter's own
 *      project, not to the project in the switcher.
 *
 * When W13J_ACROSS_SHOTS names a folder, both pages are photographed there at 1440, 990, 660 and 390
 * in both themes, and at 1440 in Chinese, with Every project chosen. The pictures go nowhere else.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const HERE = 'default'
const THERE = 'robotics'
const shots = process.env.W13J_ACROSS_SHOTS

const person = (workspace: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})
const agent = (handle: string, workspace: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let app: LiveApp
let page: Page

async function call<T>(path: string, headers: Record<string, string>, method = 'GET', body?: unknown, expected?: number): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (expected === undefined ? !reply.ok : reply.status !== expected) throw new Error(`${method} ${path} answered ${reply.status}: ${text}`)
  return JSON.parse(text) as T
}

const HERE_NOTE = 'Seed tray notes from the second bench'
const HERE_IDEA = 'A cooler bench for the seed trays'
const THERE_NOTE = 'Gripper calibration notes'
const PRIVATE_TITLE = 'Kelp forest ledger for bo'
const HERE_COUNTER = 'Tray trials'
const THERE_COUNTER = 'Gripper trials'

beforeAll(async () => {
  app = await liveApp({ name: 'across-projects-pages', workspace: HERE, viewport: { width: 1440, height: 1000 } })
  page = app.page
  await call('/api/workspaces', person(HERE), 'POST', { id: THERE, title: 'Robotics' })
  await call('/api/records', person(HERE), 'POST', { kind: 'note', title: HERE_NOTE })
  await call('/api/records', person(HERE), 'POST', { kind: 'idea', title: HERE_IDEA, data: {} })
  await call('/api/records', person(THERE), 'POST', { kind: 'note', title: THERE_NOTE })

  // THREE MADE-UP AGENTS, AND ONE MESSAGE FROM ada TO bo IN ROBOTICS. dee is no party to it.
  for (const handle of ['across-ada', 'across-bo', 'across-dee', 'across-keeper']) {
    await call('/api/agents/started', person(HERE), 'POST', { handle, name: `Made-up ${handle}` })
  }
  const listed = await call<{ agents: { id: string; handle: string }[] }>('/api/participants', person(HERE))
  const bo = listed.agents.find((one) => one.handle === 'across-bo')?.id
  if (bo === undefined) throw new Error('across-bo was registered and is not listed')
  // NOTHING HOLDS bo IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The message is
  // stored all the same, and case 4 reads it.
  await call('/api/records', agent('across-ada', THERE), 'POST', {
    kind: 'message',
    title: PRIVATE_TITLE,
    data: { body: 'A made-up line only bo is meant to read.', to: [{ kind: 'agent', id: bo }] },
  }, 409)

  // ONE COUNTER IN EACH PROJECT, filed by a registered agent through the counters' own door.
  for (const [workspace, title] of [
    [HERE, HERE_COUNTER],
    [THERE, THERE_COUNTER],
  ] as const) {
    await call('/api/counters', agent('across-keeper', workspace), 'POST', {
      title,
      counts: `Made-up trials counted for ${title}.`,
      triggers: [{ kind: 'count', n: 5 }],
      action: { kind: 'task', title: `Look at ${title}` },
    })
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open a page fresh, in the default project, as the person unless an agent is named. */
async function open(address: string, opts: { width?: number; language?: string; as?: string } = {}): Promise<void> {
  await page.setViewportSize({ width: opts.width ?? 1440, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${opts.language ?? 'en'}#/`, { timeout: 60_000 })
  await page.evaluate(
    ({ workspace, as }) => {
      window.localStorage.setItem('mole-office.workspace', workspace)
      if (as === undefined) window.localStorage.removeItem('mole-office.actor')
      else window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: as }))
    },
    { workspace: HERE, as: opts.as },
  )
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${opts.language ?? 'en'}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/**
 * Choose a project in the page's one control, and wait until the page has drawn that choice's answer:
 * the door's reply for it has arrived, and no read is still under way (the loading mark and the
 * re-read line are both gone), so the rows on screen are the new choice's and not the last one's.
 */
async function choose(value: string, door: '/api/records?' | '/api/counters?'): Promise<void> {
  const answered = page.waitForResponse((reply) => reply.url().includes(door) && reply.url().includes(`projects=${value}`), { timeout: 30_000 })
  await page.locator('main.page .pch-select').selectOption(value)
  await answered
  await settled()
}

/** No read under way on the page: no loading mark and no re-read line. */
async function settled(): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('main.page .px-loading') === null && document.querySelector('.px-reread-what') === null,
    undefined,
    { timeout: 30_000 },
  )
}

/** Choose a kind on All records, and wait until the rows of that kind are drawn. */
async function chooseKind(kind: string): Promise<void> {
  const answered = page.waitForResponse((reply) => reply.url().includes('/api/records?') && reply.url().includes(`kind=${kind}`), { timeout: 30_000 })
  await page.locator('main.page .rec-filterbar select').nth(1).selectOption(kind)
  await answered
  await settled()
}

const recordRow = (title: string) => page.locator('main.page .rec tbody tr', { hasText: title })
const recordTitles = () => page.locator('main.page .rec tbody tr td[data-col="title"] .rec-cell-title').allInnerTexts()

// ============================================================================ All records

describe('All records reads across projects', () => {
  it('starts at the project it was opened from, shown chosen in the control', async () => {
    await open('/records')
    await page.locator('main.page .rec tbody tr').first().waitFor({ timeout: 30_000 })
    expect(await page.locator('main.page .pch-select').inputValue()).toBe(HERE)
    const titles = await recordTitles()
    expect(titles).toContain(HERE_NOTE)
    expect(titles).not.toContain(THERE_NOTE)
  }, 120_000)

  it('draws the rows of both projects with Every project chosen, each naming its project', async () => {
    await open('/records')
    await choose('all', '/api/records?')
    await recordRow(THERE_NOTE).waitFor({ timeout: 30_000 })
    expect(await recordRow(THERE_NOTE).locator('td[data-col="project"]').innerText()).toBe('Robotics')
    expect(await recordRow(HERE_NOTE).locator('td[data-col="project"] [data-project]').getAttribute('data-project')).toBe(HERE)
  }, 120_000)

  it('draws only Robotics’s rows when Robotics is chosen, and the header’s reading is unchanged', async () => {
    await open('/records')
    await choose(THERE, '/api/records?')
    await recordRow(THERE_NOTE).waitFor({ timeout: 30_000 })
    const projects = await page.locator('main.page .rec tbody tr td[data-col="project"] [data-project]').evaluateAll((all) =>
      all.map((one) => one.getAttribute('data-project')),
    )
    // A MESSAGE IN ROBOTICS'S VIEW IS KEPT IN THE MESSAGE CENTRE, so its row names the centre.
    expect(projects).toContain(THERE)
    expect(new Set(projects.filter((one) => one !== 'message-centre'))).toEqual(new Set([THERE]))
    expect(await recordTitles()).not.toContain(HERE_NOTE)
    // THE OLD READING, by the header and with no projects word, still answers the header's project alone.
    const old = await call<{ records: { workspaceId: string; title: string; kind: string }[] }>('/api/records?shape=light', person(HERE))
    // EVERY ROW BUT A MESSAGE IS THE HEADER'S PROJECT'S. A message in its view is kept in the message centre.
    expect(new Set(old.records.filter((row) => row.kind !== 'message').map((row) => row.workspaceId))).toEqual(new Set([HERE]))
    for (const row of old.records.filter((one) => one.kind === 'message')) expect(row.workspaceId, row.title).toBe('message-centre')
    expect(old.records.map((row) => row.title)).toContain(HERE_NOTE)
  }, 120_000)

  it('adds the count up across projects and says what it is counted over', async () => {
    const each = await Promise.all(
      [HERE, THERE].map(async (id) => (await call<{ matched: number }>(`/api/records?projects=${id}&shape=light&limit=1`, person(HERE))).matched),
    )
    const listed = await call<{ workspaces: { id: string }[] }>('/api/workspaces', person(HERE))
    const every = (
      await Promise.all(listed.workspaces.map(async (w) => (await call<{ matched: number }>(`/api/records?projects=${w.id}&shape=light&limit=1`, person(HERE))).matched))
    ).reduce((sum, n) => sum + n, 0)
    await open('/records')
    await choose('all', '/api/records?')
    const line = await page.locator('main.page .rec-count').innerText()
    expect(line).toContain(`${String(every)} records.`)
    expect(line).toContain(en['acrossProjects.countedEvery'])
    const all = await page.locator('main.page .rec-facet').first().locator('.rec-facet-n').innerText()
    expect(Number(all.replace(/,/g, ''))).toBe(every)

    await choose(THERE, '/api/records?')
    await page.waitForFunction((n) => document.querySelector('main.page .rec-count')?.textContent?.includes(`${String(n)} record`) === true, each[1], { timeout: 30_000 })
    expect(await page.locator('main.page .rec-count').innerText()).toContain('Counted in Robotics.')
  }, 120_000)

  it('draws no message an agent may not read, in any project, and draws it for the person', async () => {
    await open('/records', { as: 'across-dee' })
    await choose('all', '/api/records?')
    await chooseKind('message')
    expect(await page.locator('main.page .rec').innerText()).not.toContain(PRIVATE_TITLE)

    await open('/records')
    await choose('all', '/api/records?')
    await chooseKind('message')
    await recordRow(PRIVATE_TITLE).waitFor({ timeout: 30_000 })
    // The message's cell uses the same name the count line gives the default project.
    const listed = await call<{ workspaces: { id: string; title: string }[] }>('/api/workspaces', person(HERE))
    const name = listed.workspaces.find((workspace) => workspace.id === HERE)?.title
    expect(name).toBeTruthy()
    expect(await recordRow(PRIVATE_TITLE).locator('td[data-col="project"]').innerText()).toBe(name)
  }, 180_000)

  it('names a message project as the count names the default project at each table width', async () => {
    const listed = await call<{ workspaces: { id: string; title: string }[] }>('/api/workspaces', person(HERE))
    const name = listed.workspaces.find((workspace) => workspace.id === HERE)?.title
    expect(name).toBeTruthy()
    for (const theme of ['light', 'dark']) for (const width of [1440, 990, 660]) {
      await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await open('/records', { width })
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      await choose('all', '/api/records?')
      await chooseKind('message')
      const cell = recordRow(PRIVATE_TITLE).locator('td[data-col="project"]')
      await cell.waitFor({ timeout: 30_000 })
      expect(await cell.innerText(), `${width}, ${theme}`).toBe(name)
    }
  }, 180_000)

  it('says which project New record files into, and files it there', async () => {
    await open('/records')
    await choose('all', '/api/records?')
    await page.locator('main.page .rec-head-act .px-btn[data-variant="primary"]').click()
    const form = page.locator('main.page form.rec-form')
    await form.waitFor({ timeout: 30_000 })
    const into = form.locator('select').first()
    expect(await into.inputValue(), 'the form starts at the project the page was opened from, and shows it').toBe(HERE)
    await into.selectOption(THERE)
    await form.locator('input').first().fill('A record filed into Robotics from every project')
    await form.locator('button[type="submit"]').click()
    await page.waitForFunction(() => window.location.hash.startsWith('#/r/'), undefined, { timeout: 30_000 })
    const there = await call<{ records: { title: string }[] }>(`/api/records?projects=${THERE}&shape=light`, person(HERE))
    expect(there.records.map((row) => row.title)).toContain('A record filed into Robotics from every project')
    const here = await call<{ records: { title: string }[] }>('/api/records?shape=light', person(HERE))
    expect(here.records.map((row) => row.title)).not.toContain('A record filed into Robotics from every project')
  }, 120_000)
})

// ============================================================================ Counters

describe('Counters reads across projects', () => {
  const card = (title: string) => page.locator('main.page .cnt-entry', { hasText: title })

  it('starts at the project it was opened from, and draws the cards of both projects with Every project chosen', async () => {
    await open('/counters')
    await card(HERE_COUNTER).waitFor({ timeout: 30_000 })
    expect(await page.locator('main.page .pch-select').inputValue()).toBe(HERE)
    expect(await card(THERE_COUNTER).count()).toBe(0)

    await choose('all', '/api/counters?')
    await card(THERE_COUNTER).waitFor({ timeout: 30_000 })
    expect(await card(THERE_COUNTER).locator('.cnt-project').innerText()).toBe('Robotics')
    expect(await card(HERE_COUNTER).locator('.cnt-project [data-project]').getAttribute('data-project')).toBe(HERE)
  }, 120_000)

  it('draws only Robotics’s counter when Robotics is chosen', async () => {
    await open('/counters')
    await choose(THERE, '/api/counters?')
    await card(THERE_COUNTER).waitFor({ timeout: 30_000 })
    expect(await page.locator('main.page .cnt-entry').count()).toBe(1)
    expect(await card(HERE_COUNTER).count()).toBe(0)
    expect(await page.locator('main.page .cnt-group-head').textContent()).toBe('In Robotics')
  }, 120_000)

  it('adds the count up across projects and says what it is counted over', async () => {
    await open('/counters')
    await choose('all', '/api/counters?')
    await card(THERE_COUNTER).waitFor({ timeout: 30_000 })
    expect(await page.locator('main.page .cnt-says').innerText()).toBe(`2 counters; 2 active and 0 paused. ${en['acrossProjects.countedEvery']}`)
    expect(await page.locator('main.page .cnt-group-head').textContent()).toBe(en['g7a.counters.listEvery'])
  }, 120_000)

  it('pauses a counter of another project from the list, in that counter’s own project', async () => {
    await open('/counters')
    await choose('all', '/api/counters?')
    const there = card(THERE_COUNTER)
    await there.locator('.cnt-fold-sum').click()
    await there.locator('.cnt-because').fill('A made-up pause from the list of every project.')
    await there.getByRole('button', { name: 'Pause it' }).click()
    await there.locator('.cnt-said').waitFor({ timeout: 30_000 })
    const read = await call<{ counters: { title: string; paused: unknown }[] }>(`/api/counters?projects=${THERE}`, person(HERE))
    expect(read.counters.find((one) => one.title === THERE_COUNTER)?.paused).not.toBeNull()
    if (shots !== undefined) await photograph()
  }, 360_000)
})

/** Both pages at four widths in both themes, and at 1440 in Chinese, with Every project chosen. */
async function photograph(): Promise<void> {
  if (shots === undefined) return
  mkdirSync(shots, { recursive: true })
  for (const [address, rows, name] of [
    ['/records', '/api/records?', 'records'],
    ['/counters', '/api/counters?', 'counters'],
  ] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark']) {
        for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
          await open(address, { width, language })
          await choose('all', rows)
          await page.evaluate((next) => {
            document.documentElement.dataset.theme = next
          }, theme)
          await page.screenshot({ path: join(shots, `${name}-${String(width)}-${theme}-${language}.png`), fullPage: true })
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
