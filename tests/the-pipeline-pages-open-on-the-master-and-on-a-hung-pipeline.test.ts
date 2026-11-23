// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINE PAGES OPEN ON THE MASTER PIPELINE AND ON A HUNG PIPELINE, AND THE CANVAS DRAWS THE STORED STEP LINKS.
 * Wave 13u round 216, package BV, point BV-5; and the order of a pipeline page's
 * three parts, set on 13 November 2026.
 *
 * WHAT IS PROVED, in a test office with a made-up project:
 *   1. `#/pipeline/drawing` names no pipeline, and the project marks a master: the detail under the drawing draws the
 *      master, while the index still puts another pipeline first.
 *   2. A pipeline that is part of a step is named on that step's line of the drawn pipeline, and pressing its name
 *      opens `#/pipeline/<its id>`, which draws it.
 *   3. `#/project-graph` draws each stored `feeds` and `blocks` link between two steps at both of its ends, in the
 *      link's own word for that end, and the other step's title opens that step.
 *   4. A pipeline's page is in three parts, in this order: its summary at the top, the drawing, and its own body text
 *      at the bottom, one paragraph for each paragraph stored.
 *   5. `#/project-graph` draws no key strip and no source-map line under the drawing. Its body text says what the
 *      source map door answered in this office, right after the heading and before the first lane. Wave 13u round
 *      217: a picture carries no small print. CRITERION CHANGE, as decided: the lead and the sentences on how to read
 *      the drawing are gone, and the source map's absence is a short state word.
 *   6. `#/project-graph` draws each step once. A step that a drawn pipeline lists is not drawn again as a loose step.
 *
 * Pictures are taken only when TEST_SHOTS names a folder: the canvas with its step links, four widths, both themes.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in the pipeline page, open on the first pipeline whether or not one is marked: case 1 goes red.
 *   2. in src/shared/blocks.ts, read no `part_of` link from a pipeline to a step: case 2 goes red.
 *   3. in the canvas's model, draw only `blocks` links: case 3 goes red.
 *   4. in the pipeline page, draw the body text above the drawing: case 4 goes red.
 * Round 217's three, each restored with git checkout and checked with an empty git diff:
 *   5. in the canvas's drawing, draw the key strip again: case 5 goes red.
 *   6. in the canvas's drawing, draw the source-map line under the drawing again: case 5 goes red.
 *   7. in the canvas's drawing, draw every step outside a module as a loose step again: case 6 goes red.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { testShots } from './where-shots-go.ts'

const PROJECT = { id: 'test-master', title: 'Example office with a master pipeline (made up)' }
const MASTER = 'Example master pipeline (made up)'
const FIRST = 'Example pipeline that comes first (made up)'
const HUNG = 'Example pipeline under a step (made up)'
const SUMMARY = 'Example summary of the master pipeline, stored on its record (made up).'
const CONTEXT = ['Example first paragraph of the body (made up).', 'Example second paragraph of the body (made up).']

let app: LiveApp
const id: Record<string, string> = {}
/** The name of every step the seed made, in the order it made them. */
const steps: string[] = []

function asThePerson(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': PROJECT.id,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const headers = asThePerson()
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.ok, `${method} ${path}: ${text}`).toBe(true)
  return JSON.parse(text) as unknown
}

async function aPipeline(name: string, title: string, extra: { summary?: string; context?: string } = {}): Promise<string> {
  const made = await call('POST', '/api/records', {
    kind: 'pipeline',
    title,
    data: { blockIds: [], ...(extra.context === undefined ? {} : { context: extra.context }) },
    ...(extra.summary === undefined ? {} : { summary: extra.summary }),
  })
  return (id[name] = made.record.id as string)
}

async function aStep(pipeline: string, name: string, state: 'todo' | 'doing' | 'done' | 'failed'): Promise<string> {
  const made = await call('POST', `/api/records/${id[pipeline]!}/blocks`, { name: `Example step ${name} (made up)`, state })
  steps.push(name)
  return (id[name] = made.record.id as string)
}

async function aLink(from: string, to: string, type: 'part_of' | 'feeds' | 'blocks' | 'implements'): Promise<void> {
  await call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type })
}

beforeAll(async () => {
  app = await liveApp({ name: 'pipeline-master-and-hung', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await call('POST', '/api/workspaces', PROJECT)

  // The pipeline that comes first in the index: it holds a failed step, and the index puts those first. A blocked step
  // would not do it: the index does not count one (question 18).
  await aPipeline('first', FIRST)
  await aStep('first', 'held up', 'failed')
  await aStep('first', 'waiting', 'todo')
  // The master, with three steps carried by one module, a feeds link and a blocks link between them.
  await aPipeline('master', MASTER, { summary: SUMMARY, context: CONTEXT.join('\n\n') })
  await aStep('master', 'cut', 'doing')
  await aStep('master', 'join', 'todo')
  await aStep('master', 'check', 'todo')
  const made = await call('POST', '/api/records', { kind: 'module', title: 'Example module (made up)', data: {} })
  id['module'] = made.record.id as string
  for (const step of ['cut', 'join', 'check']) await aLink('module', step, 'implements')
  await aLink('cut', 'join', 'feeds')
  await aLink('join', 'check', 'blocks')
  // A pipeline hung from the first step of the master.
  await aPipeline('hung', HUNG)
  await aStep('hung', 'measure', 'todo')
  await aStep('hung', 'mark', 'todo')
  await aLink('hung', 'cut', 'part_of')
  await call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: id['master']! })

  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('theme') ?? 'light')
  }, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

let loads = 0

async function open(path: string, ready: string, theme = 'light'): Promise<void> {
  loads += 1
  await app.page.goto(`${app.site}/?lang=en&theme=${theme}&load=${String(loads)}#${path}`)
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  // Attached, not visible: the index rows and the step lines are in folds the page draws closed.
  await app.page.locator(ready).first().waitFor({ state: 'attached' })
}

/** Press one of the project graph's levels, and wait until the page says it is at that level. */
async function toLevel(level: string): Promise<void> {
  await app.page.locator(`button[data-level="${level}"]`).click()
  await app.page.waitForFunction((want) => document.querySelector('[data-graph-level]')?.getAttribute('data-graph-level') === want, level)
}

describe('the pipeline pages and the project canvas', () => {
  it('1. open the drawing on the master pipeline when the address names none', async () => {
    await open('/pipeline/drawing', '.pp-entry')
    const page = app.page
    expect((await page.locator('.pp-entry').first().textContent()) ?? '', 'the index still puts the pipeline with a failed step first').toContain(FIRST)
    const current = page.locator('.pp-entry[data-current="1"]')
    expect(await current.count()).toBe(1)
    expect((await current.textContent()) ?? '').toContain(MASTER)
  })

  it('2. name a hung pipeline on its step, and open it from there', async () => {
    await open(`/pipeline/${id['master']!}`, '.pp-entry')
    const page = app.page
    const hung = page.locator(`[data-hung-pipeline="${id['hung']!}"]`)
    expect(await hung.count(), 'the hung pipeline is named on the step it hangs from').toBe(1)
    expect((await page.locator('.pp-tiers-list li', { has: hung }).textContent()) ?? '').toContain('Example step cut (made up)')
    // The step lines are in the fold that names the drawn pipeline, so it is opened first.
    await page.locator('details.px-explain', { has: hung }).locator(':scope > summary').click()
    await hung.locator('a').click()
    await page.waitForURL(`**#/pipeline/${id['hung']!}`)
    await page.locator('[data-pipeline-part="summary"] h2', { hasText: HUNG }).waitFor()
    expect((await page.locator('.pp-entry[data-current="1"]').textContent()) ?? '').toContain(HUNG)
  })

  it('3. draw the stored feeds and blocks links between two steps on the project canvas', async () => {
    await open('/project-graph', '[data-graph-level]')
    const page = app.page
    await page.locator('button[data-level="countsAndBoundaries"]').click()
    await page.waitForFunction(() => document.querySelector('[data-graph-level]')?.getAttribute('data-graph-level') === 'countsAndBoundaries')
    const end = (step: string, type: string, direction: string, other: string) =>
      page.locator(`[data-block="${id[step]!}"] [data-step-link="${type}"][data-direction="${direction}"][data-to="${id[other]!}"]`).first()
    const seen = async (step: string, type: string, direction: string, other: string) => ((await end(step, type, direction, other).textContent()) ?? '').trim()
    expect(await seen('cut', 'feeds', 'forward', 'join')).toBe('feeds Example step join (made up)')
    expect(await seen('join', 'feeds', 'reverse', 'cut')).toBe('fed by Example step cut (made up)')
    expect(await seen('join', 'blocks', 'forward', 'check')).toBe('blocks Example step check (made up)')
    expect(await seen('check', 'blocks', 'reverse', 'join')).toBe('blocked by Example step join (made up)')
    // A step of the hung pipeline has no step link, so it draws none.
    expect(await page.locator(`[data-block="${id['measure']!}"] [data-step-link]`).count()).toBe(0)
    await end('cut', 'feeds', 'forward', 'join').locator('a').click()
    await page.waitForURL(`**#/r/${id['join']!}*`)
  })

  it("4. put a pipeline's summary at the top, the drawing in the middle and its body at the bottom", async () => {
    await open(`/pipeline/${id['master']!}`, '[data-pipeline-part="context"]')
    const page = app.page
    const order = await page.evaluate(() => {
      const summary = document.querySelector('[data-pipeline-part="summary"]')
      const drawing = document.querySelector('.pp .gx')
      const detail = document.querySelector('.pp-entry')
      const context = document.querySelector('[data-pipeline-part="context"]')
      if (summary === null || drawing === null || detail === null || context === null) return 'a part is missing'
      const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      return before(summary, drawing) && before(drawing, detail) && before(detail, context) ? 'in order' : 'out of order'
    })
    expect(order).toBe('in order')
    expect((await page.locator('[data-pipeline-part="summary"] .pp-own-words').textContent())?.trim()).toBe(SUMMARY)
    expect(await page.locator('[data-pipeline-part="context"] .pp-own-words').allTextContents()).toEqual(CONTEXT)
  })

  it('5. say what the source map gave in its body text, with no key strip and no line under it', async () => {
    // WHAT THIS OFFICE'S GRAPH SAYS ABOUT ITS SOURCE INDEX, and then what the source map door answers, asked as the page
    // asks them. A project with no index has no map yet, so the page says that and asks the coverage door nothing; a
    // project that has one and whose door fails says the map could not be read; a project that has one and whose door
    // answers says the counts.
    const graph = await fetch(`${app.api}/api/project-graph`, { headers: asThePerson() })
    const graphReply = (await graph.json()) as { sourceIndexBuilt?: boolean }
    const door = await fetch(`${app.api}/api/source/coverage`, { headers: asThePerson() })
    const doorSaid = `GET /api/source/coverage answered ${String(door.status)} in this test office`
    const map = door.ok ? ((await door.json()) as { coverage: { totalFiles: number; claimedFiles: number; unclaimedFiles: number } }).coverage : null
    const coverage =
      graphReply.sourceIndexBuilt === false
        ? sayInEnglish('projectGraph.coverage.noMap')
        : map === null
          ? sayInEnglish('projectGraph.coverage.notRead')
          : `${sayInEnglish('projectGraph.coverage', { total: map.totalFiles, claimed: map.claimedFiles, n: map.totalFiles })} ${sayInEnglish('projectGraph.coverage.unclaimed', { n: map.unclaimedFiles })}`

    // The first lane is drawn once the page's read has answered, so nothing below is asked of a page still loading.
    await open('/project-graph', '.gph-lane')
    const page = app.page
    for (const level of ['countsAndBoundaries', 'modules']) {
      await toLevel(level)
      expect(await page.locator('.gph-legend').count(), `${level}: no key strip`).toBe(0)
      expect(await page.locator('.gph-coverage').count(), `${level}: no source-map line under the drawing`).toBe(0)
      expect(await page.getByText(sayInEnglish('projectGraph.legend')).count(), `${level}: no "${sayInEnglish('projectGraph.legend')}"`).toBe(0)
      expect(((await page.locator('[data-graph-says="coverage"]').textContent()) ?? '').trim(), `${level}: ${doorSaid}`).toBe(coverage)
      const order = await page.evaluate(() => {
        const says = document.querySelector('[data-graph-says="coverage"]')
        const first = document.querySelector('.gph-lane, .gph-zone')
        if (says === null || first === null) return 'a part is missing'
        return (says.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? 'before' : 'after'
      })
      expect(order, `${level}: the source-map line comes before the first lane or zone`).toBe('before')
    }
  })

  it('6. draw each step once on the project graph', async () => {
    await open('/project-graph', '.gph-lane')
    const page = app.page
    expect(steps.length, 'the seed made seven steps').toBe(7)
    for (const level of ['countsAndBoundaries', 'summaries']) {
      await toLevel(level)
      await page.locator(`[data-block="${id[steps[0]!]!}"]`).first().waitFor({ state: 'attached' })
      const drawn: Record<string, number> = {}
      for (const name of steps) drawn[name] = await page.locator(`[data-block="${id[name]!}"]`).count()
      expect(drawn, `${level}: how many times each step is drawn`).toEqual(Object.fromEntries(steps.map((name) => [name, 1])))
    }
  })

  it('takes its pictures of the canvas at four widths in both themes, when asked', async () => {
    if (process.env['TEST_SHOTS'] === undefined || process.env['TEST_SHOTS'] === '') return
    const dir = testShots('project-graph-step-links')
    try {
      for (const theme of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          await app.page.setViewportSize({ width, height: 900 })
          await open('/project-graph', '[data-graph-level]', theme)
          await app.page.locator('button[data-level="countsAndBoundaries"]').click()
          await app.page.locator(`[data-block="${id['cut']!}"] [data-step-link]`).first().waitFor({ state: 'attached' })
          await app.page.screenshot({ path: join(dir, `project-graph-${String(width)}-${theme}.png`), fullPage: true })
        }
      }
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 900 })
    }
  }, 300_000)
})
