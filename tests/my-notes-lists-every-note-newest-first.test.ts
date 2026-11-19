// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MY NOTES, IN A BROWSER: point QN-3 of the quick-notes package (wave 13y round 167), in a test office of its own.
 *
 * The point's own words: "A My notes page lists every note, newest first, with each note's first words and a small
 * picture of its drawing; a note opens from it and can be changed; notes do not appear under Reports."
 *
 * WHAT THIS FILE PROVES.
 *   1. With no note, the page says in words that there is no note yet.
 *   2. With notes in two projects, the page lists every one, the newest started first. Each card shows the note's
 *      first words, and a small picture when the note holds a drawing, with the note's own strokes, boxes and lines.
 *   3. A card opens its note floating over My notes, where it can be changed.
 *   4. The Reports page neither lists a note nor counts one, and the count of reports waiting does not move.
 *   5. A search narrows the cards, and each choice above the list carries the count the office gives, over every note
 *      the search keeps. A choice narrows the cards, and the page says so in words when nothing is left.
 *   6. The counts and the week headings are the office's, over every note, and not the cards loaded so far: with more
 *      notes than one reading gives, the first choice and the oldest week count notes the page has not loaded yet.
 *      Show more loads the rest. The weeks are this week, last week and an older one, under the headings the page
 *      gives them.
 *   7. A note holding a picture is moved into another project from its card. The card then names that project, the
 *      note opens from My notes with its own project chosen, and its picture still shows there.
 *
 * Everything here is made up and its words say so. The database is the test's own.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { quickNoteTitleOf, type QuickNotePart } from '../src/shared/kinds/quick-note.ts'
import { stampInZone, theClockZone } from '../src/shared/time.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { switchTheProject, theProjectIdOnScreen, waitForTheProjects } from './switch-the-project.ts'

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const en = createI18n('en')
const PROJECTS = [
  { id: 'test-made-up-kilns', title: 'Made-up kilns' },
  { id: 'test-made-up-garden', title: 'Made-up garden' },
]

async function send(app: LiveApp, method: 'GET' | 'POST', path: string, workspace: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await reply.text()
  expect(reply.status, `${method} ${path}: ${text.slice(0, 300)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, unknown>
}

/** A made-up note, filed as the note page files one, in one project. */
async function aNote(app: LiveApp, workspace: string, parts: QuickNotePart[], fromPage?: { address: string; name: string }): Promise<string> {
  const made = await send(app, 'POST', '/api/records', workspace, {
    kind: 'quick_note',
    title: quickNoteTitleOf(parts) ?? 'A made-up note with no words',
    data: { parts, ...(fromPage === undefined ? {} : { from_page: fromPage }) },
  })
  return String((made['record'] as { id: string }).id)
}

/** What the Reports page and the sidebar's Reports count read, as numbers that must not move for a note. */
async function whatReportsCounts(app: LiveApp): Promise<{ matched: number; kinds: unknown; noteRows: number; waiting: unknown }> {
  const reports = await send(app, 'GET', '/api/records/reports-and-notes?show=both&limit=100&offset=0', 'default')
  const rows = reports['rows'] as { kind: string }[]
  const home = await send(app, 'GET', '/api/attention?machine=omit&shape=home', 'default')
  return {
    matched: Number(reports['matched']),
    kinds: reports['kinds'],
    noteRows: rows.filter((row) => row.kind === 'quick_note').length,
    waiting: home['reportCounts'],
  }
}

async function open(app: LiveApp, page: Page): Promise<void> {
  // A FRESH LOAD EVERY TIME: going to the address the page is already on would keep what it read before.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/my-notes`)
  await waitForThePage(page, 30_000)
  await waitForTheProjects(page)
}

/** A made-up picture one pixel across, stored as the note page stores one. */
const A_PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')

const PICTURE_WORDS = 'A made-up picture'

/** The count each choice above the list draws, by choice. */
async function theChoiceCounts(page: Page): Promise<Record<string, string>> {
  const pairs = await page
    .locator('[data-choice]')
    .evaluateAll((all) => all.map((one) => [one.getAttribute('data-choice') ?? '', one.querySelector('[data-part="choice-count"]')?.textContent ?? '']))
  return Object.fromEntries(pairs)
}

/** The ids of the cards on the page, in the order drawn. */
async function theCards(page: Page): Promise<(string | null)[]> {
  return page.locator('[data-note]').evaluateAll((all) => all.map((card) => card.getAttribute('data-note')))
}

/** One second apart, so each note is started in a second of its own and the order is the order of starting. */
const aSecond = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1_100))

it('says why moving a note is off when there is no other project or no choice yet', async () => {
  const app = await liveApp({ name: 'my-notes-one-project', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  try {
    const id = await aNote(app, 'default', [{ id: 'w', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up note for moving' }])
    const page = app.page
    await open(app, page)
    const card = page.locator(`[data-note="${id}"]`)
    await card.waitFor()
    expect(await page.getByText(en.t('sheet.button.offWithNoReason'), { exact: true }).count(), en.t('sheet.button.offWithNoReason')).toBe(0)
    await card.getByRole('button', { name: en.t('myNotes.move') }).click({ force: true })
    await card.getByText(en.t('agentMove.noOther'), { exact: true }).waitFor()

    await send(app, 'POST', '/api/workspaces', 'default', PROJECTS[0])
    await open(app, page)
    await card.waitFor()
    await card.getByRole('button', { name: en.t('myNotes.move') }).click()
    const move = card.getByRole('button', { name: en.t('myNotes.moveNow'), exact: true })
    await move.click({ force: true })
    await card.getByText(en.t('agentMove.choose'), { exact: true }).waitFor()
    expect(await page.getByText(en.t('sheet.button.offWithNoReason'), { exact: true }).count(), en.t('sheet.button.offWithNoReason')).toBe(0)
  } finally {
    await app.stop()
  }
}, 180_000)

describe('My notes, in a browser', () => {
  let app: LiveApp
  const notes = { first: '', drawn: '', last: '' }
  let before: Awaited<ReturnType<typeof whatReportsCounts>>

  beforeAll(async () => {
    app = await liveApp({ name: 'my-notes', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    for (const project of PROJECTS) await send(app, 'POST', '/api/workspaces', 'default', project)
    // A made-up report, so the Reports page has something it does list.
    await send(app, 'POST', '/api/records', PROJECTS[0]!.id, { kind: 'report', title: 'A made-up report', summary: 'Made-up words.' })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('says in words that there is no note yet', async () => {
    before = await whatReportsCounts(app)
    await open(app, app.page)
    await app.page.getByText(en.t('myNotes.none')).waitFor()
    expect(await app.page.locator('[data-note]').count()).toBe(0)
  }, 120_000)

  it('lists the notes of every project, the newest started first, with first words and a small picture', async () => {
    notes.first = await aNote(app, PROJECTS[0]!.id, [
      { id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up first note\nIts made-up second line.' },
    ])
    await aSecond()
    notes.drawn = await aNote(
      app,
      PROJECTS[1]!.id,
      [
        { id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up drawn note' },
        { id: 'b-1', type: 'box', x: 40, y: 180, width: 160, height: 72, text: 'Made-up step one' },
        { id: 'b-2', type: 'box', x: 280, y: 180, width: 160, height: 72 },
        { id: 'l-1', type: 'line', from: 'b-1', to: 'b-2' },
        { id: 's-1', type: 'stroke', colour: 'red', width: 2, points: [40, 120, 52, 124, 70, 131] },
        { id: 's-2', type: 'stroke', colour: 'blue', width: 3, points: [300, 100, 320, 110] },
      ],
      { address: '#/records', name: 'Everything' },
    )
    await aSecond()
    notes.last = await aNote(app, PROJECTS[0]!.id, [])

    const page = app.page
    await open(app, page)
    const cards = page.locator('[data-note]')
    await cards.nth(2).waitFor()
    expect(await cards.evaluateAll((all) => all.map((card) => card.getAttribute('data-note')))).toEqual([notes.last, notes.drawn, notes.first])

    // FIRST WORDS: the title by the kind's rule, then the lines after it. A note with no words says so.
    expect(await page.locator(`[data-note="${notes.first}"] [data-part="title"]`).textContent()).toBe('Made-up first note')
    expect(await page.locator(`[data-note="${notes.first}"] [data-part="first-words"]`).textContent()).toBe('Its made-up second line.')
    expect(await page.locator(`[data-note="${notes.last}"] [data-part="title"]`).textContent()).toBe(en.t('quickNote.untitled'))

    // THE SMALL PICTURE, only on the note that holds a drawing, with its own parts.
    expect(await page.locator('[data-part="small-picture"]').count()).toBe(1)
    const picture = page.locator(`[data-note="${notes.drawn}"] svg[data-part="small-picture"]`)
    expect(await picture.locator('polyline').count()).toBe(2)
    expect(await picture.locator('rect').count()).toBe(2)
    expect(await picture.locator('line').count()).toBe(1)
    expect(await picture.locator('polyline').evaluateAll((all) => all.map((one) => one.getAttribute('data-colour')))).toEqual(['red', 'blue'])

    // WHERE IT WAS STARTED, as a link to that page, and nothing where it was started from no page.
    const started = page.locator(`[data-note="${notes.drawn}"] [data-part="started-on"] a`)
    expect(await started.getAttribute('href')).toBe('#/records')
    expect(await started.textContent()).toBe('Everything')
    expect(await page.locator(`[data-note="${notes.first}"] [data-part="started-on"]`).count()).toBe(0)
  }, 120_000)

  it('opens a note floating over My notes from its card', async () => {
    const page = app.page
    await open(app, page)
    const link = page.locator(`[data-note="${notes.drawn}"] a[data-part="open"]`)
    expect(await link.getAttribute('href')).toBe(`#${recordPath(notes.drawn, 'quick_note')}`)
    await link.click()
    await page.locator('[data-quick-note-beside] .qn-note').waitFor({ timeout: 30_000 })
    expect(new URL(page.url()).hash).toBe('#/my-notes')
  }, 120_000)

  it('leaves the notes out of the Reports page and out of its count', async () => {
    const after = await whatReportsCounts(app)
    expect(after.noteRows).toBe(0)
    expect(after).toEqual(before)
    expect(after.matched).toBeGreaterThan(0)
  }, 120_000)

  it('searches, and draws the count the office gives each choice over every note the search keeps', async () => {
    const page = app.page
    await open(app, page)
    await page.locator('[data-note]').nth(2).waitFor()
    expect(await theChoiceCounts(page)).toEqual({ all: '3', 'from-a-page': '1', 'from-no-page': '2', drawn: '1' })
    expect(await page.locator('[data-choice="all"]').getAttribute('aria-pressed')).toBe('true')

    // A BOX'S WORDS are searched, so the drawn note is found by the words in its first box.
    await page.locator('input.mn-search').fill('Made-up step one')
    await page.waitForFunction(() => document.querySelector('[data-choice="all"] [data-part="choice-count"]')?.textContent === '1')
    expect(await theCards(page)).toEqual([notes.drawn])
    expect(await theChoiceCounts(page)).toEqual({ all: '1', 'from-a-page': '1', 'from-no-page': '0', drawn: '1' })

    // A CHOICE THAT KEEPS NONE OF WHAT THE SEARCH FOUND says so, and the counts stay those of the search.
    await page.locator('[data-choice="from-no-page"]').click()
    await page.getByText(en.t('myNotes.noneOfThisChoice')).waitFor()
    expect(await page.locator('[data-choice="from-no-page"]').getAttribute('aria-pressed')).toBe('true')
    expect(await theChoiceCounts(page)).toEqual({ all: '1', 'from-a-page': '1', 'from-no-page': '0', drawn: '1' })

    await page.locator('input.mn-search').fill('Made-up words no note holds')
    await page.getByText(en.t('myNotes.noneHoldIt')).waitFor()

    await page.locator('input.mn-search').fill('')
    await page.waitForFunction(() => document.querySelectorAll('[data-note]').length === 2)
    expect(await theCards(page)).toEqual([notes.last, notes.first])
    expect(await theChoiceCounts(page)).toEqual({ all: '3', 'from-a-page': '1', 'from-no-page': '2', drawn: '1' })
  }, 120_000)

  it('counts over every note and not the cards loaded, under the week each note was started in', async () => {
    // TWENTY-FIVE MORE, started a week ago and two weeks ago, so there are more notes than one reading gives.
    const older: { id: string; daysAgo: number }[] = []
    for (let i = 0; i < 25; i += 1) {
      const id = await aNote(app, PROJECTS[i % 2]!.id, [{ id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: `Made-up older note ${String(i + 1)}` }])
      older.push({ id, daysAgo: i === 0 ? 7 : 14 })
    }
    const held = new Database(join(app.dir, 'panelx.db'))
    try {
      for (const one of older) {
        held.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stampInZone(Date.now() - one.daysAgo * 86_400_000, theClockZone()), one.id)
      }
    } finally {
      held.close()
    }

    const page = app.page
    await open(app, page)
    const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    const office = await send(app, 'GET', `/api/records/my-notes?zone=${encodeURIComponent(zone)}`, 'default')
    const weeks = office['weeks'] as { starts: string; count: number }[]
    expect(weeks.map((week) => week.count)).toEqual([3, 1, 24])

    await page.locator('[data-note]').nth(24).waitFor()
    expect(await page.locator('[data-note]').count()).toBe(25)
    expect((await theChoiceCounts(page))['all']).toBe('28')
    const heading = (starts: string) => page.locator(`section[data-week="${starts}"] > h2`)
    expect(await heading(weeks[0]!.starts).locator('span').first().textContent()).toBe(en.t('myNotes.thisWeek'))
    expect(await heading(weeks[1]!.starts).locator('span').first().textContent()).toBe(en.t('myNotes.lastWeek'))
    for (const week of weeks) expect(await heading(week.starts).locator('[data-part="week-count"]').textContent()).toBe(String(week.count))
    // THE OLDEST WEEK COUNTS TWENTY-FOUR while twenty-one of its cards are loaded.
    expect(await page.locator(`section[data-week="${weeks[2]!.starts}"] [data-note]`).count()).toBe(21)

    await page.getByRole('button', { name: en.t('myNotes.more') }).click()
    await page.locator('[data-note]').nth(27).waitFor()
    expect(await page.locator(`section[data-week="${weeks[2]!.starts}"] [data-note]`).count()).toBe(24)
    expect(await page.getByRole('button', { name: en.t('myNotes.more') }).count()).toBe(0)
    expect(new Set(await theCards(page)).size).toBe(28)
  }, 180_000)

  it('moves a note with a picture into another project, and opens it there from My notes with its picture', async () => {
    const stored = (await send(app, 'POST', '/api/report-files', PROJECTS[0]!.id, { bytes: A_PICTURE.toString('base64'), name: 'made-up-picture.png' }))[
      'file'
    ] as { path: string; name: string; size: number; hash: string }
    const id = await aNote(app, PROJECTS[0]!.id, [
      { id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up note with a picture' },
      { id: 'p-1', type: 'picture', x: 40, y: 80, width: 120, height: 90, path: stored.path, name: stored.name, size: stored.size, hash: stored.hash, alt: PICTURE_WORDS },
    ])

    const page = app.page
    await open(app, page)
    await switchTheProject(page, PROJECTS[0]!.id)
    await page.locator(`[data-note="${id}"]`).waitFor()
    const card = page.locator(`[data-note="${id}"]`)
    expect(await card.locator('[data-part="besides"]').textContent()).toBe(en.t('myNotes.pictures', { n: 1 }))
    expect(await card.locator('[data-part="project"]').textContent()).toBe(PROJECTS[0]!.title)

    await card.getByRole('button', { name: en.t('myNotes.move') }).click()
    await card.locator('select').selectOption(PROJECTS[1]!.id)
    await card.getByRole('button', { name: en.t('myNotes.moveNow') }).click()
    await card.locator('[data-part="moved"]').waitFor()
    await page.waitForFunction(
      ([note, title]) => document.querySelector(`[data-note="${note}"] [data-part="project"]`)?.textContent === title,
      [id, PROJECTS[1]!.title] as const,
    )
    const record = (await send(app, 'GET', `/api/records/${id}`, PROJECTS[1]!.id))['record'] as { workspaceId: string }
    expect(record.workspaceId).toBe(PROJECTS[1]!.id)

    // OPENED FROM MY NOTES while the switcher still shows the project the note was moved out of.
    expect(await theProjectIdOnScreen(page)).toBe(PROJECTS[0]!.id)
    await card.locator('a[data-part="open"]').click()
    await page.locator('[data-quick-note-beside] .qn-note').waitFor({ timeout: 30_000 })
    expect(new URL(page.url()).hash).toBe('#/my-notes')
    await page.waitForFunction((project) => document.querySelector('.sbp-block')?.getAttribute('data-project') === project, PROJECTS[1]!.id)
    // THE PICTURE, FOUND BY THE WORDS STORED WITH IT: the note page asks the office for its bytes in the project the
    // note is in now, and draws it only when they arrive.
    await page.locator(`[data-quick-note-beside] img[alt="${PICTURE_WORDS}"]`).first().waitFor({ timeout: 30_000 })
    await page.waitForFunction(
      (alt) => [...document.querySelectorAll<HTMLImageElement>('[data-quick-note-beside] img')].some((one) => one.alt === alt && one.complete && one.naturalWidth > 0),
      PICTURE_WORDS,
    )
  }, 180_000)
})
