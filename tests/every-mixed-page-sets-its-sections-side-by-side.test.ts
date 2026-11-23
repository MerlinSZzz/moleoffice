// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PAGES WHOSE SECTIONS DIFFER IN KIND SET THEM SIDE BY SIDE ABOVE 1180 PIXELS, BY ONE RULE.
 *
 * src/web/components/SideBySide.tsx is the one place that says where the switch is and what the two
 * columns are. This file holds four page lists, which share one seeded office, one page server and
 * one browser:
 *   - the first group: Agent conversations, the regulations, Work to do, Decisions, Reports, a
 *     record's own page, and a project's own page;
 *   - group A: a problem's own page, a run's own page, and the Working page's list;
 *   - group B's pages with two kinds of section: a plan, a counter, a person's own page, a notebook
 *     and the Embassy;
 *   - group B's one-kind pages, which take only the measure swap: the pipelines page and one
 *     pipeline's drawing, the schedule, the goals, the counters list, missing and unused, the
 *     placeholders, a new role card, and an agent's page.
 *
 * WHAT IS MEASURED, in a test office seeded with the made-up corpus of scripts/reset.ts, plus two
 * made-up chapters, one made-up regulation, one made-up report nobody has read, one made-up plan
 * and one made-up notebook entry:
 *   1. each two-column page of group B draws its columns with the shared element and sets neither
 *      the switch width nor the two-column grid itself;
 *   2. at 1440 the first group's pages, group A's pages and group B's two-column pages have two
 *      columns: the two start on one line, the second starts right of where the first ends, and no
 *      Reports title is squeezed under 200 pixels;
 *   3. at 390 each of those pages has one column, the two parts one above the other at one left
 *      edge; group B's two-column pages are also measured at 1180, the width just under the switch;
 *   4. no page scrolls sideways at the widths measured;
 *   5. a report's own page keeps one column at 1440, with its facts under the document, because a
 *      report is read as a document and keeps the whole width.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST:
 *   1. in SideBySide.tsx, set WIDE_SCREEN to (min-width: 60rem) → the 1440 cases fail, and group B's
 *      stack case fails at 1180.
 *   2. in SideBySide.tsx, set WIDE_SCREEN to (min-width: 100rem) → the 1440 cases fail.
 *   3. in RecordPage.tsx, give a report's facts the end column like every other kind → the report
 *      case fails.
 *
 * ONE LOAD FOR EACH PAGE IN A CASE. A case that measures one page at several widths loads it at the first width and
 * resizes the window to each of the others; every open is one load, with the look in the address. Before this was
 * changed, every reading was taken both ways, after a fresh load at the width and after a resize to it; the two were the
 * same in each.
 *
 * PICTURES. With TEST_SHOTS naming a folder, the run's own cases photograph the pages of each list
 * at four widths in both looks, and at 1440 in Chinese, into mixed-pages and width-rule-b under it.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { WIDE_SCREEN } from '../src/web/components/SideBySide.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

/** The first group of pages that follow the rule: their source file, their address, and the class of their two columns. */
// HOME LEFT THIS LIST: its person chooses its columns, and its first layout leaves the second column empty, so it
// is one column at every width. tests/home-draws-the-kept-layout.test.ts holds its columns.
const PAGES = [
  { name: 'Agent conversations', file: 'src/web/pages/AgentsPage.tsx', address: '#/conversations', box: 'px-ac-layout' },
  { name: 'Office regulations', file: 'src/web/pages/RegulationsPage.tsx', address: '#/regulations', box: 'ofc-read' },
  { name: 'Work to do', file: 'src/web/pages/family/WorkPage.tsx', address: '#/work', box: 'wk-sides' },
  { name: 'Decisions', file: 'src/web/pages/GovernancePage.tsx', address: '#/governance', box: 'gq-sides' },
  { name: 'Reports', file: 'src/web/pages/family/NotesPage.tsx', address: '#/notes', box: 'rpts-sides' },
  { name: 'A record', file: 'src/web/pages/RecordPage.tsx', address: '#/r/', box: 'rp-sides' },
  // A PROJECT'S OWN PAGE: its cards in the first column and the modules panel, a different kind of
  // section, in the second.
  { name: 'A project', file: 'src/web/pages/CategoryPage.tsx', address: '#/project', box: 'px-category-sides' },
] as const

// ============================================================ group A of the width work
/**
 * THREE MORE PAGES ON THE ONE RULE. Two columns, each checked as the first group's pages are, in the
 * same seeded office:
 *   - a problem's own page, #/problem/<id>, which draws the record page's own columns (rp-sides), so
 *     a problem reads the same at both of its addresses;
 *   - a run's own page, #/session/<id>: what the run did in the first column, its facts in the second;
 *   - the detailed list of the Office Map, #/working: the roster in the first column, the notes about
 *     what the reading could not see in the second.
 */
const GROUP_A = [
  { name: 'A problem', file: 'src/web/pages/ProblemPage.tsx', address: '#/problem/', box: 'rp-sides' },
  { name: 'A run', file: 'src/web/pages/SessionPage.tsx', address: '#/session/', box: 'sp-sides' },
  { name: 'The Working page list', file: 'src/web/pages/WorkingPage.tsx', address: '#/working', box: 'wrk-sides' },
] as const

/**
 * Pages of group B that set two kinds of section side by side. `address` is filled in once the
 * office is seeded.
 */
const SIDES = [
  { name: 'One plan', file: 'src/web/pages/plans/OnePlanPage.tsx', address: 'plan', box: 'op-plan' },
  { name: 'One counter', file: 'src/web/pages/CountersPage.tsx', address: 'counter', box: 'cnt-sides' },
  { name: "A person's own page", file: 'src/web/pages/ProfilePage.tsx', address: `#/who/person/${THE_PERSON}`, box: 'prof-sides' },
  { name: 'A notebook', file: 'src/web/pages/NotebookPage.tsx', address: '#/who/agent/seed-secretary/notebook', box: 'nb-sides' },
  { name: 'The Embassy', file: 'src/web/pages/EmbassyPage.tsx', address: '#/embassy', box: 'emb-sides' },
] as const

/** The pages of group B whose parts are one kind: the measure swap only. */
const ONE_KIND = [
  { name: 'Pipelines', address: '#/pipeline' },
  { name: 'One pipeline', address: 'pipeline' },
  { name: 'Schedule', address: '#/plan' },
  { name: 'Goals', address: '#/horizons' },
  { name: 'Counters', address: '#/counters' },
  { name: 'Missing and unused', address: '#/missing' },
  { name: 'Placeholders', address: '#/placeholders' },
  { name: 'A new role card', address: '#/roles/new' },
  { name: 'An agent (one column)', address: '#/who/agent/seed-secretary' },
] as const

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const shots = process.env.TEST_SHOTS === undefined || process.env.TEST_SHOTS === '' ? null : testShots('mixed-pages')
const groupBShots = process.env.TEST_SHOTS === undefined || process.env.TEST_SHOTS === '' ? null : testShots('width-rule-b')

let app: LiveApp
let recordId = ''
let reportId = ''
let seedDir = ''
const found: Record<string, string> = {}

async function post(body: unknown): Promise<{ record: { id: string } }> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBe(201)
  return reply.json() as Promise<{ record: { id: string } }>
}

async function send(path: string, body: unknown): Promise<unknown> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return reply.json()
}

beforeAll(async () => {
  // THE MADE-UP CORPUS, into a database of this test's own under the temporary folder, which the
  // last afterAll deletes. The server is then started on that file, once, for every page list here.
  seedDir = aTestDatabaseFolder('width-rule-seed')
  const seeded = join(seedDir, 'panelx.db')
  const run = spawnSync(join(process.cwd(), 'node_modules', '.bin', 'tsx'), ['scripts/reset.ts'], {
    env: { ...process.env, MOLE_OFFICE_DB: seeded },
    encoding: 'utf8',
  })
  expect(run.status, `the seed failed: ${run.stderr}${run.stdout}`).toBe(0)
  app = await liveApp({ name: 'width-rule', workspace: 'default', viewport: { width: 1440, height: 1000 }, database: seeded })
  // THE LOOK COMES FROM THE ADDRESS, and is put where the page reads it before each load.
  await app.context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  // A REPORT NOBODY HAS READ, so Reports has something that needs you.
  reportId = (await post({ kind: 'report', title: 'Test pond survey', data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-01' } })).record.id
  // A REGULATION AND TWO CHAPTERS, so the regulations page has a document beside its list.
  await post({ kind: 'regulation', title: 'Test ferry rule', data: { sentence: 'Nobody takes the ferry out after dark.', binds: 'person', since: '2026-09-02' } })
  for (const [n, title, conclusion] of [[1, 'The ferry', 'The ferry is shared.'], [2, 'The pier', 'The pier is swept at dawn.']] as const) {
    await post({
      kind: 'module',
      title,
      summary: conclusion,
      data: {
        context: 'Made up for this test.',
        parts: [{ id: 'p1', name: 'Part one', items: [] }],
        extra: { chapter: n },
        summaryBlocks: [{ id: 'r1', type: 'text', heading: `Rule of ${title.toLowerCase()}`, text: 'Made up for this test.' }],
        source: 'made up for this test',
      },
    })
  }
  // A PLAN, with lines for its table and a sentence for its writing.
  const plan = (await send('/api/plans', {
    title: 'Test footbridge walk',
    body: '# Route\n- [x] Check the footbridge\n- [ ] Pack the lunch\n- [ ] Walk to the pier\n\nWe go on Saturday if the weather holds.',
  })) as { plan: { id: string } }
  found.plan = `#/plans/${plan.plan.id}`
  // AN ENTRY IN THE SEED SECRETARY'S NOTEBOOK, so the notebook has something written beside its form.
  await send('/api/agents/seed-secretary/notebook/entries', { entryKind: 'the-persons-preferences', text: 'Test entry: the person reads the ferry timetable before lunch.' })
  // THE RECORDS THE PAGE LISTS NEED: a task, a problem, a run, a counter and a pipeline.
  const listed = await fetch(`${app.api}/api/records?shape=narrow`, { headers: PERSON })
  const records = ((await listed.json()) as { records: { id: string; kind: string; title: string }[] }).records
  for (const kind of ['task', 'problem', 'session', 'counter', 'pipeline'] as const) {
    const one = records.find((record) => record.kind === kind)
    expect(one, `the seed has no ${kind}`).toBeDefined()
    found[kind] = one!.id
  }
  recordId = found.task!
  found.counter = `#/counters/${found.counter!}`
  found.pipeline = `#/pipeline/${found.pipeline!}`
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (seedDir !== '') rmSync(seedDir, { recursive: true, force: true })
})

const pageAddress = (page: (typeof PAGES)[number]): string => (page.address === '#/r/' ? `#/r/${recordId}` : page.address)
const writtenAddress = (written: string): string => (written.startsWith('#/') ? written : found[written]!)
const where = (page: (typeof GROUP_A)[number]): string =>
  page.address === '#/problem/' ? `#/problem/${found.problem!}` : page.address === '#/session/' ? `#/session/${found.session!}` : page.address

/** The switch widths a page might write by hand: the rule's own, and the ones pages used before it. */
function ownSwitches(): string[] {
  const width = /\d+(?:\.\d+)?(?:rem|px)/.exec(WIDE_SCREEN)?.[0]
  expect(width, 'the switch names no width').toBeDefined()
  return [width!, '1200px', '1180px', '73.75rem', '56rem']
}

async function open(written: string, width: number, language = 'en', theme: 'light' | 'dark' = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  // A NEW HASH ON THE SAME PAGE IS NOT A NEW LOAD, and the look is read when the page loads: so the page leaves for a
  // blank one first, and the address carries the look.
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=${theme}${written}`)
  await waitForThePage(app.page, 60_000)
}

/** Resize the open page to another width, and wait until it has drawn itself there. */
async function resize(width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await theResizeIsDrawn(app.page)
}

async function openColumns(written: string, box: string, width: number, language = 'en', theme: 'light' | 'dark' = 'light'): Promise<void> {
  await open(written, width, language, theme)
  await app.page.locator(`.${box} > [data-column="end"]:not(:empty)`).waitFor({ state: 'attached', timeout: 30_000 })
  await app.page.locator(`.${box} > [data-column="start"]`).waitFor({ state: 'attached', timeout: 30_000 })
}

async function openBothColumns(written: string, box: string, width: number, language = 'en', theme: 'light' | 'dark' = 'light'): Promise<void> {
  await open(written, width, language, theme)
  await bothColumnsOf(box)
}

async function openA(page: (typeof GROUP_A)[number], width: number, language = 'en', theme: 'light' | 'dark' = 'light'): Promise<void> {
  await open(where(page), width, language, theme)
  await bothColumnsOf(page.box)
}

/** Wait until both columns of `box` hold something. */
async function bothColumnsOf(box: string): Promise<void> {
  await app.page.locator(`.${box} > [data-column="end"]:not(:empty)`).waitFor({ state: 'attached', timeout: 30_000 })
  await app.page.locator(`.${box} > [data-column="start"]:not(:empty)`).waitFor({ state: 'attached', timeout: 30_000 })
}

interface Layout {
  tracks: number
  start: { left: number; right: number; top: number; bottom: number; shown: boolean }
  end: { left: number; right: number; top: number; bottom: number; shown: boolean }
  scroll: number
  viewport: number
}

async function measure(box: string): Promise<Layout> {
  return app.page.evaluate((one) => {
    const grid = document.querySelector<HTMLElement>(`.${one}`)!
    const part = (column: string) => {
      const element = grid.querySelector<HTMLElement>(`:scope > [data-column="${column}"]`)!
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, shown: getComputedStyle(element).display !== 'none' && rect.height > 0 }
    }
    return {
      tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
      start: part('start'),
      end: part('end'),
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }
  }, box)
}

describe('the pages in the browser', () => {
  it('sets the two columns side by side at 1440, starting on one line', async () => {
    for (const page of PAGES) {
      await openColumns(pageAddress(page), page.box, 1440)
      const layout = await measure(page.box)
      const said = `${page.name} at 1440: ${JSON.stringify(layout)}`
      expect(layout.tracks, said).toBe(2)
      expect(layout.start.shown && layout.end.shown, said).toBe(true)
      expect(Math.abs(layout.start.top - layout.end.top), `${said}: the two do not start on one line`).toBeLessThan(2)
      expect(layout.end.left, `${said}: the second column does not start right of the first`).toBeGreaterThanOrEqual(layout.start.right)
      expect(layout.scroll, `${said}: the page scrolls sideways`).toBeLessThanOrEqual(layout.viewport)
      // A REPORTS TITLE BESIDE NEEDS YOU IS NOT SQUEEZED: a title that wraps onto a second line is at
      // least 200 pixels wide, the bound tests/family-list-columns-hold-at-660.test.ts holds wrapped
      // words to. Only Reports is asked: its rows are the ones whose fact columns take a fixed 40rem.
      // (Work to do's rows wrap their titles narrower than this at 1440 before and after the columns,
      // which is its rows' own design and is written down for the next round.)
      const squeezed = await app.page.locator(`.${page.box} .rpts-title`).evaluateAll((nodes) =>
        nodes
          .map((one) => ({ rect: one.getBoundingClientRect(), lines: one.getClientRects().length, line: Number.parseFloat(getComputedStyle(one).lineHeight) || 20 }))
          .filter(({ rect, lines, line }) => rect.width > 0 && (lines > 1 || rect.height > line * 1.5))
          .map(({ rect }) => rect.width)
          .filter((width) => width < 200))
      expect(squeezed, `${said}: a title is squeezed`).toEqual([])
    }
  }, 300_000)

  it('keeps a report in one column at 1440, with its facts under it, because a report is read as a document', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.goto(`${app.site}/#/r/${reportId}`)
    await waitForThePage(app.page, 60_000)
    await app.page.locator('.rp-sides > [data-column="start"]').waitFor({ state: 'attached', timeout: 30_000 })
    const said = await app.page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('.rp-sides')!
      return {
        tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        facts: grid.querySelector(':scope > [data-column="across"]') !== null,
        end: grid.querySelector(':scope > [data-column="end"]') !== null,
      }
    })
    expect(said).toEqual({ tracks: 1, facts: true, end: false })
  }, 120_000)

  it('stacks the two columns at 390, without scrolling sideways', async () => {
    for (const page of PAGES) {
      await openColumns(pageAddress(page), page.box, 390)
      const layout = await measure(page.box)
      const said = `${page.name} at 390: ${JSON.stringify(layout)}`
      expect(layout.tracks, said).toBe(1)
      // AGENT CONVERSATIONS SHOWS ONE OF ITS TWO AT A TIME HERE, so only a page drawing both is lined up.
      if (layout.start.shown && layout.end.shown) {
        expect(Math.abs(layout.start.left - layout.end.left), `${said}: the two do not share a left edge`).toBeLessThan(2)
        const above = layout.start.bottom <= layout.end.top + 1 || layout.end.bottom <= layout.start.top + 1
        expect(above, `${said}: the two are not one above the other`).toBe(true)
      }
      expect(layout.scroll, `${said}: the page scrolls sideways`).toBeLessThanOrEqual(layout.viewport)
    }
  }, 300_000)

  it.runIf(shots !== null)('photographs the pages of the first group at four widths in both looks, and at 1440 in Chinese', async () => {
    const folder = shots as string
    for (const page of PAGES) {
      const slug = page.box
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          await open(pageAddress(page), width, 'en', theme)
          await app.page.screenshot({ path: join(folder, `${slug}-${String(width)}-${theme}-en.png`), fullPage: true })
        }
      }
      await open(pageAddress(page), 1440, 'zh', 'light')
      await app.page.screenshot({ path: join(folder, `${slug}-1440-light-zh.png`), fullPage: true })
    }
  }, 600_000)
})

describe('group A: a problem, a run and the Office Map list follow the rule', () => {
  it('sets the two columns side by side at 1440, tops level, and stacks them at 390 without scrolling sideways', async () => {
    for (const page of GROUP_A) {
      // ONE LOAD FOR EACH PAGE, at 1440; the window is then resized to 390.
      await openA(page, 1440)
      for (const width of [1440, 390]) {
        await resize(width)
        await bothColumnsOf(page.box)
        const layout = await measure(page.box)
        const said = `${page.name} at ${String(width)}: ${JSON.stringify(layout)}`
        expect(layout.start.shown && layout.end.shown, said).toBe(true)
        expect(layout.scroll, `${said}: the page scrolls sideways`).toBeLessThanOrEqual(layout.viewport)
        if (width === 1440) {
          expect(layout.tracks, said).toBe(2)
          expect(Math.abs(layout.start.top - layout.end.top), `${said}: the two do not start on one line`).toBeLessThan(2)
          expect(layout.end.left, `${said}: the second column does not start right of the first`).toBeGreaterThanOrEqual(layout.start.right)
        } else {
          expect(layout.tracks, said).toBe(1)
          expect(Math.abs(layout.start.left - layout.end.left), `${said}: the two do not share a left edge`).toBeLessThan(2)
          const above = layout.start.bottom <= layout.end.top + 1 || layout.end.bottom <= layout.start.top + 1
          expect(above, `${said}: the two are not one above the other`).toBe(true)
        }
      }
    }
  }, 600_000)

  it.runIf(shots !== null)('photographs the three pages at four widths in both looks, and at 1440 in Chinese', async () => {
    const folder = shots as string
    for (const page of GROUP_A) {
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          await openA(page, width, 'en', theme)
          await app.page.screenshot({ path: join(folder, `a-${page.box}-${String(width)}-${theme}-en.png`), fullPage: true })
        }
      }
      await openA(page, 1440, 'zh', 'light')
      await app.page.screenshot({ path: join(folder, `a-${page.box}-1440-light-zh.png`), fullPage: true })
    }
  }, 600_000)
})

// ============================================================ group B of the width work
describe('group B: the rule is written in one place', () => {
  it('has each two-column page draw its columns with the shared element, and set neither the switch nor the grid', () => {
    for (const page of SIDES) {
      const source = readFileSync(page.file, 'utf8')
      expect(source, `${page.name} does not import the shared rule`).toMatch(/from '(?:\.\.\/)+(?:components\/)?SideBySide\.tsx'/)
      expect(source, `${page.name} does not draw its columns with the shared element`).toMatch(new RegExp(`<SideBySide[^>]*className="${page.box}"`))
      expect(source, `${page.name} draws no start column`).toContain('data-column="start"')
      expect(source, `${page.name} draws no end column`).toMatch(/data-column=(?:"end"|\{[^}]*'end'[^}]*\})/)
      for (const own of ownSwitches()) {
        expect(source.includes(`(min-width: ${own})`) || source.includes(`(max-width: ${own})`), `${page.name} writes the switch ${own} itself`).toBe(false)
      }
      const rules = [...source.matchAll(new RegExp(`\\.${page.box}(?:\\[[^\\]]*\\])?\\s*\\{([^}]*)\\}`, 'g'))].map((one) => one[1] ?? '')
      for (const body of rules) {
        expect(body, `${page.name} sets the grid of its two columns itself`).not.toMatch(/grid-template-columns|grid-template-areas|display\s*:/)
      }
    }
  })
})

describe('group B: the pages in the browser', () => {
  it('sets the two columns side by side at 1440, starting on one line', async () => {
    for (const page of SIDES) {
      await openBothColumns(writtenAddress(page.address), page.box, 1440)
      const layout = await measure(page.box)
      const said = `${page.name} at 1440: ${JSON.stringify(layout)}`
      expect(layout.tracks, said).toBe(2)
      expect(layout.start.shown && layout.end.shown, said).toBe(true)
      expect(Math.abs(layout.start.top - layout.end.top), `${said}: the two do not start on one line`).toBeLessThan(2)
      expect(layout.end.left, `${said}: the second column does not start right of the first`).toBeGreaterThanOrEqual(layout.start.right)
      expect(layout.scroll, `${said}: the page scrolls sideways`).toBeLessThanOrEqual(layout.viewport)
    }
  }, 300_000)

  it('stacks the two columns at 1180 and 390, without scrolling sideways', async () => {
    for (const page of SIDES) {
      // ONE LOAD FOR EACH PAGE, at 1180; the window is then resized to each of the other widths.
      await openBothColumns(writtenAddress(page.address), page.box, 1180)
      for (const width of [1180, 390]) {
        await resize(width)
        await bothColumnsOf(page.box)
        const layout = await measure(page.box)
        const said = `${page.name} at ${String(width)}: ${JSON.stringify(layout)}`
        expect(layout.tracks, said).toBe(1)
        expect(layout.start.shown && layout.end.shown, said).toBe(true)
        expect(Math.abs(layout.start.left - layout.end.left), `${said}: the two do not share a left edge`).toBeLessThan(2)
        expect(layout.start.bottom <= layout.end.top + 1, `${said}: the first is not above the second`).toBe(true)
        expect(layout.scroll, `${said}: the page scrolls sideways`).toBeLessThanOrEqual(layout.viewport)
      }
    }
  }, 600_000)

  it('does not scroll sideways on a one-kind page of the group at 1440 or 390', async () => {
    const wide: string[] = []
    for (const page of ONE_KIND) {
      // ONE LOAD FOR EACH PAGE, at 1440; the window is then resized to each of the other widths.
      await open(writtenAddress(page.address), 1440)
      for (const width of [1440, 390]) {
        await resize(width)
        const scroll = await app.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }))
        if (scroll.scroll > scroll.viewport) wide.push(`${page.name} at ${String(width)}: ${JSON.stringify(scroll)}`)
      }
    }
    expect(wide).toEqual([])
  }, 600_000)

  it.runIf(groupBShots !== null)('photographs the pages of the group', async () => {
    const folder = groupBShots as string
    const snap = async (name: string): Promise<void> => {
      await app.page.screenshot({ path: join(folder, name), fullPage: true })
    }
    for (const page of SIDES) {
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          await open(writtenAddress(page.address), width, 'en', theme)
          await snap(`${page.box}-${String(width)}-${theme}-en.png`)
        }
      }
      await open(writtenAddress(page.address), 1440, 'zh', 'light')
      await snap(`${page.box}-1440-light-zh.png`)
      if (page.name === 'The Embassy') {
        await open(writtenAddress(page.address), 1440, 'xx', 'light')
        await snap(`${page.box}-1440-light-xx.png`)
      }
    }
    for (const page of ONE_KIND) {
      await open(writtenAddress(page.address), 1440, 'en', 'light')
      // A DRAWING LOADS ITS ENGINE AFTER THE PAGE SAYS IT IS READY, so the picture waits for it.
      await app.page.waitForTimeout(3000)
      const slug = page.name.toLowerCase().replace(/[^a-z]+/g, '-')
      await snap(`${slug}-1440-light-en.png`)
    }
  }, 600_000)
})
