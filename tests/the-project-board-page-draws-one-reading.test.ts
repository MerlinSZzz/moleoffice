// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT BOARD'S PAGE DRAWS ONE READING. Wave 13u round 216, package BV, point BV-3: the table by block, with
 * the view by line and the quick view as tabs. Wave 13u round 242 added a fourth tab, people and packages, which
 * reads its own door when it is chosen.
 *
 * WHAT IS PROVED, in a test office with a made-up project:
 *   1. All pages draws one row for Board in the project's group, its link opens `#/board`, and the page's title is
 *      the row's own word. Test change, wave 13y round 165: a project's own pages now stand on All
 *      pages and show in the sidebar's project block only when pinned, so case 1 no longer looks in the block.
 *   2. The "By block" tab has one row for each step of the master pipeline, in the door's order and in the door's
 *      groups, and each row's numbers are the door's, so nothing on it is typed by hand. A step with no pipeline
 *      under it stands in the last group.
 *   3. A closed row holds nothing. Opened, it lists each unfinished step with its state and its age in days, and
 *      each step is a link to its own record.
 *   4. The "By line" and "Quick view" tabs draw the same answer. The board door is asked once while all three tabs
 *      are opened, the run that acts stands in its line's "Now" lane, and the quick view's runs per block are the
 *      rows' own counts.
 *   5. No small print, in any of the four tabs: no superscript, no footnote mark and no list of notes. A cell with no
 *      value is blank.
 *   6. In a project with no master pipeline, the page draws no sentence and no tab: its only text is its title. The
 *      board door still answers that no master is marked, which is where an agent reads why.
 *   7. Each row says, under its block's name, why it is in its group. The words are the page's `theReasonOfARow` of
 *      the door's row, so they agree with the row's own numbers, and none of them is the group's heading. For four
 *      rows of the seed the English is written here as it must read, so a fault in the function cannot hide behind
 *      the function.
 *   8. The quick view draws no number it does not know. A day the merge queue's measure knows no hour of has no
 *      words and no bar, and its row is marked as not known. This test office has no repository, so its landings
 *      are not read, and the quick view draws no landings chart and no landings heading.
 *   9. On a board with a master, nothing stands between the title and the tabs, and no sentence the page drew above
 *      the tabs or in place of them is on the page, in any of the four tabs. The board shows people no explanatory
 *      text: agents read the reasons in the board door's answer and its note.
 *  10. The "By line" and "Quick view" tabs read the records again when the page is opened again: a run that starts
 *      acting under a row joins its line's "Now" lane and adds one to that row's count, and every other row's count
 *      stays the same.
 *
 * Pictures are taken only when TEST_SHOTS names a folder: four widths, both themes, each tab and the page of the
 * project with no master, each of the whole page.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in the page, draw what is under a row before the row is opened: case 3 goes red.
 *   2. in the page, have the quick view ask the board door again: case 4 goes red.
 *   3. in the page, write 0 as the oldest age of a row with no unfinished step: case 5 goes red.
 *   4. in theReasonOfARow, give the group's heading word for every row: case 7 goes red.
 *   5. in theReasonOfARow, leave out the stalled part: case 7 goes red, at the row whose step has stopped short.
 *   6. in RedHours, write the red and known hours for a day with no known hour: case 8 goes red.
 *   7. draw the landings section whatever the landings' state: case 8 goes red.
 *   8. in the page, draw one paragraph above the tabs again, with one of the sentences it no longer draws: case 9 goes
 *      red.
 *   9. in the page, draw a sentence again for a board with no master: case 6 goes red.
 */
import { basename, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import type { QueueMeasures } from '../src/shared/merge-queue-measures.ts'
import type { BoardRow, ProjectBoard } from '../src/shared/project-board.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProject, waitForTheProjects } from './switch-the-project.ts'
import { testShots } from './where-shots-go.ts'

const PROJECT = { id: 'test-board', title: 'Example office (made-up data)' }
const NO_MASTER = { id: 'test-board-none', title: 'Example office with no master (made-up data)' }

/**
 * THE SENTENCES THE BOARD NO LONGER DRAWS, in English as they read before it stopped: the body text above the tabs
 * and the sentence in place of them when the master is not marked. Their words are gone from the word list, so they
 * are written out here. Where the page put a value, as {master}, each part on either side of it is looked for.
 */
const NO_LONGER_DRAWN: Readonly<Record<string, string>> = {
  'board.master.unmarked': 'This project has no master pipeline, so the board has no rows. The owner, or a secretary with a reason, marks which pipeline is the master.',
  'board.master.notThere': 'The master pipeline this project names is not in the office, so the board has no rows.',
  'board.master.deleted': 'The master pipeline this project names was deleted, so the board has no rows.',
  'board.master.notAPipeline': 'The record this project names as its master pipeline is not a pipeline, so the board has no rows.',
  'board.master.inAnotherProject': 'The master pipeline this project names is in another project, so the board has no rows.',
  'board.body.rows': 'Each row is one step of the master pipeline, {master}. A row counts what is under its step: the pipelines that are part of it, at any depth, their steps, the modules that implement those steps, and the runs filed under or related to any of them.',
  'board.body.acting.one': 'A run counts as acting only when it sent the office a request in the last hour.',
  'board.body.acting.many': 'A run counts as acting only when it sent the office a request in the last {hours} hours.',
  'board.body.actingPlace': 'The hours are the idle reminder setting, so the board and the reminder count the same runs as quiet.',
  'board.body.groups': 'The rows are in groups, with what most needs a person first. "Not known who is on it" means a run is acting that is filed under no row, so it may be working on that row.',
  'board.body.age': "A step's age is the days since it last changed state, or, where no change of state was recorded, since its record last changed.",
  'board.body.stalled': 'A step is stalled when it is blocked or failed and no pause holds it.',
  'board.body.open': 'Open a row to see its pipelines, its unfinished steps, its runs, its packages, its backlog items and its landings.',
  'board.body.landings': 'A landing is a commit the merge queue or a merge put on main in the last 7 days. It counts for a row when it changed a file in a place stated for a module under that row.',
  'board.body.lines': 'By line, "Landed" is what a line landed in the last 24 hours, "Now" its runs acting, "Next" its open packages and "Later" its backlog items still to do.',
  'board.body.red': "The hours main was red come from the merge queue's own measure, the one its page shows. An hour is not known when the queue holds no result of the whole suite on main from before it, and a day with no known hour is left blank.",
  'board.body.estimate': 'The board shows no estimate, because no way of working one out from the records has been chosen yet.',
  'board.body.landingsNotRead.noRepository': 'The landings were not read, because this project has no repository.',
  'board.body.landingsNotRead.noFolder': 'The landings were not read, because no repository of this project has a folder on this machine.',
  'board.body.landingsNotRead.gitDidNotAnswer': 'The landings were not read, because git did not answer: {detail}',
  'board.body.noState.one': 'One backlog item has no state, so it is counted neither as open nor as done.',
  'board.body.noState.many': '{count} backlog items have no state, so they are counted neither as open nor as done.',
}

let app: LiveApp
const id: Record<string, string> = {}

async function call(method: string, path: string, body?: unknown, project = PROJECT.id, extra: Record<string, string> = {}): Promise<any> {
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': project,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
    ...extra,
  }
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.ok, `${method} ${path}: ${text}`).toBe(true)
  return JSON.parse(text) as unknown
}

async function aPipeline(name: string, title: string): Promise<string> {
  const made = await call('POST', '/api/records', { kind: 'pipeline', title, data: { blockIds: [] } })
  return (id[name] = made.record.id as string)
}

async function aStep(pipeline: string, name: string, state: 'todo' | 'doing' | 'done' | 'blocked'): Promise<string> {
  const made = await call('POST', `/api/records/${id[pipeline]!}/blocks`, { name: `Example step ${name} (made up)`, state })
  return (id[name] = made.record.id as string)
}

async function aLink(from: string, to: string, type: 'part_of'): Promise<void> {
  await call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type })
}

beforeAll(async () => {
  app = await liveApp({ name: 'project-board-page', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await call('POST', '/api/workspaces', PROJECT)
  await call('POST', '/api/workspaces', NO_MASTER, NO_MASTER.id)

  // The master and its four rows: one with work under it, one with all its work done, one whose only step has stopped
  // short, and one with no pipeline. The third is there so that case 7 reads a reason with a stalled part.
  await aPipeline('master', 'Example master pipeline (made up)')
  await aStep('master', 'row-with-work', 'done')
  await aStep('master', 'row-all-done', 'done')
  await aStep('master', 'row-stalled', 'done')
  await aStep('master', 'row-with-no-pipeline', 'done')
  await aPipeline('under-work', 'Example pipeline with work (made up)')
  await aLink('under-work', 'row-with-work', 'part_of')
  await aStep('under-work', 'to-do', 'todo')
  await aStep('under-work', 'doing', 'doing')
  await aStep('under-work', 'finished', 'done')
  await aPipeline('under-done', 'Example pipeline, all done (made up)')
  await aLink('under-done', 'row-all-done', 'part_of')
  await aStep('under-done', 'long-done', 'done')
  await aPipeline('under-stalled', 'Example pipeline that has stopped (made up)')
  await aLink('under-stalled', 'row-stalled', 'part_of')
  await aStep('under-stalled', 'stuck', 'blocked')
  await call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: id['master']! })

  // One run that acts under the first row: it has sent the office a request in the last hour.
  const run = await call('POST', '/api/records', { kind: 'session', title: 'Example run (made up)', data: { state: 'running', servingAgent: 'wave-13x-supervisor' } })
  id['run'] = run.record.id as string
  await aLink('run', 'under-work', 'part_of')
  await call('GET', `/api/records/${id['run']}`, undefined, PROJECT.id, { 'x-mole-office-session': id['run'] })

  // The page keeps the project in the browser's storage and not in its address. The address's "project" is read here,
  // by the test, so a picture can open the project with no master at a width where the project switch is in a menu.
  await app.page.addInitScript((project) => {
    const asked = new URL(location.href).searchParams
    localStorage.setItem('mole-office.workspace', asked.get('project') ?? project)
    localStorage.setItem('mole-office.preset.theme', asked.get('theme') ?? 'light')
  }, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

let loads = 0
const boardAsks: string[] = []

async function open(width = 1440, theme = 'light', project = PROJECT.id): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  loads += 1
  await app.page.goto(`${app.site}/?lang=en&theme=${theme}&project=${project}&load=${String(loads)}#/board`)
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
  // The board has been read once the page's own element carries the master's state. No text is waited for, because a
  // board with no master draws none.
  await app.page.locator('.pb[data-board-master]').waitFor()
}

/** No part of any sentence the board no longer draws is anywhere on the page. */
async function noSentenceItNoLongerDrawsIsOnThePage(where: string): Promise<void> {
  const text = await app.page.locator('body').innerText()
  for (const [key, sentence] of Object.entries(NO_LONGER_DRAWN)) {
    const parts = sentence
      .split(/\{\w+\}/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 20)
    expect(parts.length, `${key} has a part long enough to look for`).toBeGreaterThan(0)
    for (const part of parts) expect(text, `${where}: the page draws the words of ${key}`).not.toContain(part)
  }
}

async function theDoor(): Promise<ProjectBoard> {
  return (await call('GET', `/api/projects/${PROJECT.id}/board`)) as ProjectBoard
}

async function aTab(tab: 'block' | 'line' | 'quick' | 'people'): Promise<void> {
  await app.page.locator(`button.pb-tab[data-tab="${tab}"]`).click()
  await app.page.locator(`[data-board-view="${tab}"]`).waitFor()
}

/**
 * A PICTURE OF THE WHOLE PAGE, from the top bar to the end of the last section. In a window 900 pixels tall a long tab
 * went on below the picture's foot, so the window is first made as tall as the page needs. A box scrolls when it holds
 * more than its own height and may scroll: the page's main element, each of its parents, and the document's scrolling
 * element are read. The window grows by what each of them holds below its foot, and is read again until none
 * scrolls. Each picture's log line names the boxes that scrolled. Then the page goes to its top, `before` runs, the
 * picture is taken, and the window is set back to 900.
 */
async function aWholePagePicture(path: string, before?: () => Promise<void>): Promise<void> {
  const page = app.page
  const width = page.viewportSize()?.width ?? 1440
  for (let measured = 1; ; measured += 1) {
    await page.evaluate(async () => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    })
    const seen = await page.evaluate(() => {
      const boxes: Element[] = []
      for (let box: Element | null = document.querySelector('main.page'); box !== null; box = box.parentElement) boxes.push(box)
      const scrolling = document.scrollingElement
      if (scrolling !== null && !boxes.includes(scrolling)) boxes.push(scrolling)
      const name = (box: Element): string => box.tagName.toLowerCase() + (box.id === '' ? '' : `#${box.id}`) + [...box.classList].map((one) => `.${one}`).join('')
      return {
        window: window.innerHeight,
        scrolls: boxes
          .filter((box) => box.scrollHeight > box.clientHeight && (box === scrolling || ['auto', 'scroll'].includes(getComputedStyle(box).overflowY)))
          .map((box) => ({ box: name(box), scrollHeight: box.scrollHeight, clientHeight: box.clientHeight })),
      }
    })
    if (seen.scrolls.length === 0) break
    console.log(`${basename(path)}: ${seen.scrolls.map((one) => `${one.box} scrolls, ${String(one.scrollHeight)} tall in ${String(one.clientHeight)}`).join('; ')}; the window is ${String(seen.window)} tall`)
    expect(measured, `${basename(path)}: a box still scrolls after the window was made taller ${String(measured - 1)} times: ${JSON.stringify(seen.scrolls)}`).toBeLessThan(4)
    await page.setViewportSize({ width, height: seen.window + seen.scrolls.reduce((more, one) => more + one.scrollHeight - one.clientHeight, 0) })
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await before?.()
  await page.screenshot({ path, fullPage: true })
  await page.setViewportSize({ width, height: 900 })
}

/** The quick view's last section is the ages chart: its last row must be inside the window before the picture. */
async function theAgesChartIsInTheWindow(): Promise<void> {
  const box = await app.page.locator('[data-board-chart="ages"] .pb-bar-row').last().boundingBox()
  const height = app.page.viewportSize()?.height ?? 0
  expect(
    box !== null && box.y >= 0 && box.y + box.height <= height,
    `the last row of the ages chart is not inside the window before the picture (${JSON.stringify(box)} in a window ${String(height)} pixels tall), so the picture would cut it off`,
  ).toBe(true)
}

describe('the project board page', () => {
  it("1. is one row of All pages' project group, whose link opens #/board, titled with the row's own word", async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    loads += 1
    await page.goto(`${app.site}/?lang=en&theme=light&load=${String(loads)}#${pathFor('allPages')}`)
    await waitForThePage(page, 30_000)
    await waitForTheProjects(page)
    // A project's own pages stand in the project's group on All pages, and in the sidebar's block only when pinned.
    const group = page.locator('.ap-group[data-group="project"]')
    await group.waitFor()
    const row = group.locator('a[href="#/board"]')
    expect(await row.count()).toBe(1)
    const word = (await row.locator('span').first().textContent())?.trim()
    await row.click()
    await page.locator('[data-board-master]').first().waitFor()
    expect((await page.locator('h1.pb-title').textContent())?.trim()).toBe(word)
  })

  it("2. has one row for each step of the master, in the door's order and groups, with the door's numbers", async () => {
    const door = await theDoor()
    expect(door.master.state).toBe('marked')
    expect(new Set(door.rows.map((row) => row.id))).toEqual(new Set([id['row-with-work'], id['row-all-done'], id['row-stalled'], id['row-with-no-pipeline']]))
    expect(door.rows.find((row) => row.id === id['row-with-no-pipeline'])?.group).toBe('no-pipeline')
    expect(door.rows.find((row) => row.id === id['row-with-work'])?.acting.map((run) => run.id)).toEqual([id['run']])

    await open()
    const page = app.page
    const drawn = await page.locator('[data-board-group]').evaluateAll((groups) =>
      groups.map((group) => ({
        group: group.getAttribute('data-board-group'),
        rows: [...group.querySelectorAll('[data-board-row]')].map((row) => ({
          id: row.getAttribute('data-board-row'),
          cells: Object.fromEntries([...row.querySelectorAll('.pb-cell')].map((cell) => [cell.getAttribute('data-column'), cell.querySelector('.pb-cell-value')?.textContent ?? null])),
        })),
      })),
    )
    const groupsInOrder = [...new Set(door.rows.map((row) => row.group))]
    expect(drawn.map((one) => one.group)).toEqual(groupsInOrder)
    expect(drawn.flatMap((one) => one.rows.map((row) => row.id))).toEqual(groupsInOrder.flatMap((group) => door.rows.filter((row) => row.group === group).map((row) => row.id)))
    expect(drawn.at(-1)?.group).toBe('no-pipeline')
    for (const row of door.rows) {
      const cells = drawn.flatMap((one) => one.rows).find((one) => one.id === row.id)!.cells
      expect(cells['board.col.acting'], row.title).toBe(String(row.acting.length))
      expect(cells['board.col.agents'], row.title).toBe(String(row.agents.length))
      expect(cells['board.col.packages'], row.title).toBe(String(row.packages.length))
      expect(cells['board.col.backlog'], row.title).toBe(String(row.backlog.length))
      expect(cells['board.col.unfinished'], row.title).toBe(String(row.unfinished.length))
      expect(cells['board.col.stalled'], row.title).toBe(String(row.unfinished.filter((step) => step.stalled).length))
    }
  })

  it('3. a closed row holds nothing; opened, it lists each unfinished step with its state, its age in days and its link', async () => {
    await open()
    const page = app.page
    const row = page.locator(`details[data-board-row="${id['row-with-work']!}"]`)
    expect(await row.getAttribute('open')).toBeNull()
    expect(await row.locator('.pb-under').count()).toBe(0)
    await row.locator('summary').click()
    await row.locator('.pb-under').waitFor()
    const door = await theDoor()
    const unfinished = door.rows.find((one) => one.id === id['row-with-work'])!.unfinished
    expect(unfinished.map((step) => step.id).sort()).toEqual([id['to-do'], id['doing']].sort())
    const steps = await row.locator('[data-board-step]').evaluateAll((all) =>
      all.map((one) => ({
        id: one.getAttribute('data-board-step'),
        state: one.getAttribute('data-state'),
        href: one.querySelector('a')?.getAttribute('href') ?? null,
        text: one.textContent ?? '',
      })),
    )
    expect(steps.map((step) => step.id)).toEqual(unfinished.map((step) => step.id))
    for (const step of unfinished) {
      const drawnStep = steps.find((one) => one.id === step.id)!
      expect(drawnStep.href).toContain(step.id)
      expect(drawnStep.state).toBe(step.state)
      expect(drawnStep.text).toMatch(new RegExp(`\\b${String(step.days)} days?\\b`, 'u'))
    }
  })

  it('4. the line view and the quick view draw the same answer, asked once', async () => {
    boardAsks.length = 0
    const listen = (request: { url: () => string }): void => {
      if (/\/api\/projects\/[^/]+\/board(\?|$)/u.test(request.url())) boardAsks.push(request.url())
    }
    app.page.on('request', listen)
    try {
      await open()
      const door = await theDoor()
      await aTab('line')
      const lane = app.page.locator('[data-board-line="13x"]')
      expect(await lane.locator(`a[href*="${id['run']!}"]`).count()).toBe(1)
      await aTab('quick')
      const acting = await app.page.locator('[data-board-chart="acting"] .pb-bar-row').evaluateAll((all) =>
        all.map((one) => [one.querySelector('.pb-bar-label')?.textContent ?? '', one.querySelector('.pb-bar-words')?.textContent ?? '']),
      )
      expect(acting).toEqual(door.rows.map((row) => [row.title, String(row.acting.length)]))
      // The landings chart is drawn only when the landings were read, which case 8 holds; the other three always are.
      const landingsHeading = app.page.getByRole('heading', { name: t('board.quick.landings'), exact: true })
      expect(await app.page.locator('.pb-chart').filter({ hasNot: landingsHeading }).count()).toBe(3)
      await aTab('block')
      expect(boardAsks).toHaveLength(1)
    } finally {
      app.page.off('request', listen)
    }
  })

  it('5. has no small print, and a cell with no value is blank', async () => {
    await open()
    const page = app.page
    for (const tab of ['block', 'line', 'quick', 'people'] as const) {
      await aTab(tab)
      expect(await page.locator('.pb sup, .pb small').count(), tab).toBe(0)
      expect(await page.locator('.pb').innerText(), tab).not.toMatch(/[¹²³⁴⁵⁶⁷⁸⁹⁰†‡*]/u)
      expect(await page.locator('.pb').innerText(), tab).not.toMatch(/^\s*Notes\s*$/mu)
    }
    await aTab('block')
    const done = page.locator(`details[data-board-row="${id['row-all-done']!}"]`)
    expect(await done.locator('[data-column="board.col.oldest"] .pb-cell-value').textContent()).toBe('')
  })

  it('6. in a project with no master pipeline, draws no sentence and no tab: its only text is its title, and the door still says why', async () => {
    await open()
    const page = app.page
    await switchTheProject(page, NO_MASTER.id)
    await page.locator('.pb[data-board-master="unmarked"]').waitFor()
    expect(await page.locator('.pb-tab').count()).toBe(0)
    expect(await page.locator('[data-board-row]').count()).toBe(0)
    expect(await page.locator('.pb p').count()).toBe(0)
    expect((await page.locator('.pb').innerText()).trim()).toBe(t('nav.board'))
    await noSentenceItNoLongerDrawsIsOnThePage('no master')
    // Why the board has no rows is for agents now, and the board door still answers it.
    const door = (await call('GET', `/api/projects/${NO_MASTER.id}/board`, undefined, NO_MASTER.id)) as ProjectBoard
    expect(door.master.state).toBe('unmarked')
    expect(door.rows).toEqual([])
  })

  it('7. each row says why it is in its group, from its own numbers and never in its group heading\'s words', async () => {
    // Read from the module when the case runs, so this file type-checks before the page exports the function.
    const theReasonOfARow = Reflect.get(await import('../src/web/pages/ProjectBoardPage.tsx'), 'theReasonOfARow') as ((row: BoardRow) => string) | undefined
    expect(theReasonOfARow, 'the page exports theReasonOfARow').toBeTypeOf('function')
    const door = await theDoor()
    await open()
    const drawn = await app.page.locator('[data-board-group]').evaluateAll((groups) =>
      groups.flatMap((group) => {
        const title = group.querySelector('.pb-group-title')
        const heading = (title?.textContent ?? '').replace(title?.querySelector('.pb-count')?.textContent ?? '', '').trim()
        return [...group.querySelectorAll('[data-board-row]')].map((row) => ({
          id: row.getAttribute('data-board-row'),
          heading,
          reasons: [...row.querySelectorAll('[data-board-reason]')].map((one) => one.textContent ?? ''),
        }))
      }),
    )
    expect(drawn.map((row) => row.id).sort()).toEqual(door.rows.map((row) => row.id).sort())
    for (const row of door.rows) {
      const one = drawn.find((each) => each.id === row.id)!
      expect(one.reasons, row.title).toEqual([theReasonOfARow!(row)])
      expect(one.heading, row.title).not.toBe('')
      expect(one.reasons[0], row.title).not.toBe(one.heading)
    }
    // The seed's rows as they must read: worked out from beforeAll, not from the function.
    const reasonsOf = (name: string): string[] | undefined => drawn.find((row) => row.id === id[name])?.reasons
    expect(reasonsOf('row-with-no-pipeline')).toEqual(['No pipeline found for this block'])
    expect(reasonsOf('row-with-work')).toEqual(['1 run on it, 2 steps open'])
    expect(reasonsOf('row-stalled')).toEqual(['No run on it, 1 step open, 1 stalled'])
    expect(reasonsOf('row-all-done')).toEqual(['All steps done'])
  })

  it('8. the quick view draws no number it does not know: no red hours for a day with no known hour, and no landings chart when they were not read', async () => {
    const measures = (await call('GET', '/api/merge-queue/measures?days=7')) as QueueMeasures
    const notKnown = measures.measures.flatMap((day, index) => (day.mainRed.unknown >= day.hours ? [{ day: day.day, index }] : []))
    expect(
      notKnown.length,
      `no day of this test office's measures is wholly not known, so this case proves nothing: ${JSON.stringify(measures.measures.map((day) => ({ day: day.day, hours: day.hours, mainRed: day.mainRed })))}`,
    ).toBeGreaterThan(0)
    await open()
    await aTab('quick')
    const page = app.page
    await page.locator('[data-board-chart="red"]').waitFor()
    const rows = await page.locator('[data-board-chart="red"] .pb-bar-row').evaluateAll((all) =>
      all.map((one) => ({ notKnown: one.hasAttribute('data-not-known'), words: one.querySelector('.pb-bar-words')?.textContent ?? null, text: one.textContent ?? '' })),
    )
    expect(rows).toHaveLength(measures.measures.length)
    for (const { day, index } of notKnown) {
      expect(rows[index]?.notKnown, day).toBe(true)
      expect(rows[index]?.words, day).toBe('')
      expect(rows[index]?.text, day).not.toContain('h red')
    }

    expect((await theDoor()).landings.state).not.toBe('read')
    expect(await page.locator('[data-board-chart="landings"]').count()).toBe(0)
    expect(await page.getByRole('heading', { name: t('board.quick.landings'), exact: true }).count()).toBe(0)
  })

  it('9. on a board with a master, nothing stands between the title and the tabs, and no sentence it no longer draws is on the page', async () => {
    await open()
    const page = app.page
    const afterTheTitle = await page.locator('h1.pb-title').evaluate((title) => {
      let next = title.nextSibling
      while (next !== null && (next.nodeType === Node.COMMENT_NODE || (next.nodeType === Node.TEXT_NODE && (next.textContent ?? '').trim() === ''))) next = next.nextSibling
      if (next === null) return 'nothing'
      if (!(next instanceof Element)) return `text: ${next.textContent ?? ''}`
      return `${next.tagName.toLowerCase()}${[...next.classList].map((one) => `.${one}`).join('')}[role=${next.getAttribute('role') ?? ''}]`
    })
    expect(afterTheTitle, 'what the page draws next after its title').toBe('div.pb-tabs[role=tablist]')
    for (const tab of ['block', 'line', 'quick', 'people'] as const) {
      await aTab(tab)
      await noSentenceItNoLongerDrawsIsOnThePage(tab)
    }
  })

  it('takes its pictures of the whole page at four widths in both themes, each tab and the page with no master, when asked', async () => {
    if (process.env['TEST_SHOTS'] === undefined || process.env['TEST_SHOTS'] === '') return
    const dir = testShots('project-board')
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await open(width, theme)
        await app.page.locator(`details[data-board-row="${id['row-with-work']!}"] summary`).click()
        await app.page.locator(`details[data-board-row="${id['row-with-work']!}"] .pb-under`).waitFor()
        await aWholePagePicture(join(dir, `project-board-block-${String(width)}-${theme}.png`))
        await aTab('line')
        await aWholePagePicture(join(dir, `project-board-line-${String(width)}-${theme}.png`))
        await aTab('quick')
        await app.page.locator('[data-board-chart="red"]').waitFor()
        await aWholePagePicture(join(dir, `project-board-quick-${String(width)}-${theme}.png`), theAgesChartIsInTheWindow)
        await open(width, theme, NO_MASTER.id)
        await app.page.locator('.pb[data-board-master="unmarked"]').waitFor()
        await aWholePagePicture(join(dir, `project-board-no-master-${String(width)}-${theme}.png`))
      }
    }
    // Four pictures at each width and theme, where there were three, so a third more time.
  }, 400_000)

  it('10. the line view and the quick view both change when a run starts acting under a row', async () => {
    await open()
    const page = app.page
    await aTab('line')
    const lineLinks = async (): Promise<string[]> =>
      page.locator('[data-board-line="13x"] a').evaluateAll((all) => all.map((one) => one.getAttribute('href') ?? ''))
    const linksBefore = await lineLinks()
    await aTab('quick')
    const actingRows = async (): Promise<string[][]> =>
      page.locator('[data-board-chart="acting"] .pb-bar-row').evaluateAll((all) =>
        all.map((one) => [one.querySelector('.pb-bar-label')?.textContent ?? '', one.querySelector('.pb-bar-words')?.textContent ?? '']),
      )
    const actingBefore = await actingRows()

    // A second run acting under the row, made as beforeAll made the first.
    const second = await call('POST', '/api/records', { kind: 'session', title: 'Example second run (made up)', data: { state: 'running', servingAgent: 'wave-13x-supervisor' } })
    id['second-run'] = second.record.id as string
    await aLink('second-run', 'under-work', 'part_of')
    await call('GET', `/api/records/${id['second-run']!}`, undefined, PROJECT.id, { 'x-mole-office-session': id['second-run']! })

    await open()
    const door = await theDoor()
    await aTab('line')
    const linksAfter = await lineLinks()
    expect(linksAfter.filter((href) => href.includes(id['run']!))).toHaveLength(1)
    expect(linksAfter.filter((href) => href.includes(id['second-run']!))).toHaveLength(1)
    expect(linksAfter).toEqual(expect.arrayContaining(linksBefore))

    await aTab('quick')
    const actingAfter = await actingRows()
    expect(actingAfter).toEqual(door.rows.map((row) => [row.title, String(row.acting.length)]))
    for (const row of door.rows) {
      const was = actingBefore.find(([label]) => label === row.title)
      expect(was, row.title).toBeDefined()
      expect(actingAfter.find(([label]) => label === row.title)?.[1], row.title).toBe(String(Number(was![1]) + (row.id === id['row-with-work'] ? 1 : 0)))
    }
  })
})
