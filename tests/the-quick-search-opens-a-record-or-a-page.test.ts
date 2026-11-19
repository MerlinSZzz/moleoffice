// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK SEARCH OPENS A RECORD BY ITS ID, OR A PAGE OR A RECORD BY ITS NAME, FROM EVERY PAGE.
 *
 * One press in the sidebar and one key open it over any page. A pasted id opens that record's page at once, in
 * whichever project the record is. Words find the pages whose names hold them, as All pages finds them, and the
 * records of this project whose titles hold them. An id no record has is said in one line. The quick search lists
 * only what the search door answers the reader, so a record the reader may not read is never listed, and its id is
 * answered as an id no record has.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own:
 *   1. The sidebar's press opens the quick search with the focus in its field: open, narrowed, and from the menu at
 *      390. Escape closes it and gives the focus back to the press.
 *   2. The key f opens it on Home, on a record's page, on Settings and on All pages once the focus has left All pages'
 *      field. In a text box f is typed there, and nothing opens.
 *   3. A pasted id opens its record's page, and a record in another project opens in that project.
 *   4. Words find the pages whose names hold them, without case: the same pages, in the same order, that All pages
 *      draws, the plugin's page among them, and then Settings, which stands at the sidebar's foot and not on All pages.
 *      Enter opens the first.
 *   5. Words find the records of this project whose titles hold them. At most eight are listed, and a line says when
 *      there are more. A record found opens its page.
 *   6. The words are asked of the office once the typing stops, not at each key, and one request at a time: words
 *      typed while a request is out are asked when it comes back, the newest only.
 *   7. An id no record has is said in one line, and nothing else is listed.
 *   8. A message an agent is no party to is never listed for that agent, and its id gets the line an id no record has
 *      gets. The person, who reads every message, finds the same message by the same words.
 *
 * THE PICTURES AND THE FILM are taken only when W13Y_QUICK_SEARCH_PICTURES names a folder. They are of a made-up
 * office, and each picture and every frame of the film carries the made-up label.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { isARecordId } from '../src/shared/messages.ts'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { pathFor, pluginPagePath, recordPath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'the-quick-search'
const PICTURES = process.env['W13Y_QUICK_SEARCH_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const ELSEWHERE = { id: 'made-up-elsewhere', title: 'Made-up Harbour Office' }
const AGENTS = ['made-up-qs-ada', 'made-up-qs-bo', 'made-up-qs-dee'] as const
const PLUGIN = { id: 'made-up-tide-table', name: 'Made-up tide table' }
const scratch = aTestDatabaseFolder('the-quick-search')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']
const originalOwnerName = process.env['MOLE_OFFICE_OWNER_NAME']

const asThePerson = (workspace = 'default'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
})
const asAnAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The press in the sidebar, the quick search, its field, the pages and records it lists, and its one line. */
const THE_PRESS = '#shell-side [data-target="uiSurface/rail.quicksearch"]'
const QUICK = '.qs[role="dialog"]'
const FIELD = `${QUICK} input[type="search"]`
const PAGES = `${QUICK} a.qs-page`
const RECORDS = `${QUICK} a.qs-record`
const LINE = `${QUICK} .qs-line`
/** An id of a record's shape that no record of this office has. */
const NOBODYS_ID = 'qsTest4nobod'

const inEnglish = createI18n('en').t
const said = (key: string, values?: Record<string, string | number>): string => inEnglish(key as WordKey, values as Record<string, string>)

const KELP = 'Made-up kelp ledger'
const ELSEWHERE_NOTE = 'Made-up harbour tide notes'
const QUOKKAS = Array.from({ length: 10 }, (_, n) => `Made-up quokka tally ${String(n + 1)}`)
const HERON = 'Made-up heron ledger for bo'

let app: LiveApp
let kelp: string
let elsewhereNote: string
let heron: string

async function call<T>(path: string, headers: Record<string, string>, method = 'GET', body?: unknown, expected?: number): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (expected === undefined ? !reply.ok : reply.status !== expected) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text) as T
}

async function aNote(title: string, workspace = 'default'): Promise<string> {
  return (await call<{ record: { id: string } }>('/api/records', asThePerson(workspace), 'POST', { kind: 'note', title, data: { body: 'Made up.' } })).record.id
}

beforeAll(async () => {
  mkdirSync(join(scratch, 'plugins', PLUGIN.id, 'dist'), { recursive: true })
  writeFileSync(join(scratch, 'plugins', PLUGIN.id, 'plugin.json'), JSON.stringify({
    id: PLUGIN.id,
    name: { en: PLUGIN.name },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 20 },
  }))
  writeFileSync(join(scratch, 'plugins', PLUGIN.id, 'dist', 'main.html'), '<!doctype html><title>Made-up tide table</title><p>made-up tide table</p>')
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  process.env['MOLE_OFFICE_OWNER_NAME'] = 'Made-up caretaker'
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: { width: 1440, height: 900 } })
  await call(`/api/plugins/${PLUGIN.id}/switch`, asThePerson(), 'POST', { on: true })
  await call('/api/workspaces', asThePerson(), 'POST', ELSEWHERE)
  kelp = await aNote(KELP)
  elsewhereNote = await aNote(ELSEWHERE_NOTE, ELSEWHERE.id)
  for (const title of QUOKKAS) await aNote(title)
  // THREE MADE-UP AGENTS, AND ONE MESSAGE FROM ada TO bo. dee is no party to it. Nothing holds bo in the test office,
  // so the office stores the message, routes it and answers 409; the message is stored all the same.
  for (const handle of AGENTS) await call('/api/agents/started', asThePerson(), 'POST', { handle, name: `Made-up ${handle}` })
  const listed = await call<{ agents: { id: string; handle: string }[] }>('/api/participants', asThePerson())
  const bo = listed.agents.find((one) => one.handle === 'made-up-qs-bo')?.id
  if (bo === undefined) throw new Error('made-up-qs-bo was registered and is not listed')
  heron = (await call<{ record: { id: string } }>('/api/records', asAnAgent('made-up-qs-ada'), 'POST', {
    kind: 'message',
    title: HERON,
    data: { body: 'A made-up line only bo is meant to read.', to: [{ kind: 'agent', id: bo }] },
  }, 409)).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  if (originalOwnerName === undefined) delete process.env['MOLE_OFFICE_OWNER_NAME']
  else process.env['MOLE_OFFICE_OWNER_NAME'] = originalOwnerName
  rmSync(scratch, { recursive: true, force: true })
}, 60_000)

type Look = { theme?: 'light' | 'dark'; width?: number; narrowed?: boolean; as?: string; film?: string }

/** A fresh window whose stored choices are set before the app runs, as the person unless an agent is named. */
async function aWindow(look: Look = {}): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? 1440
  const height = width <= 390 ? 844 : 900
  const context = await app.browser.newContext({
    viewport: { width, height },
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(look.film === undefined ? {} : { recordVideo: { dir: look.film, size: { width, height } } }),
  })
  await context.addInitScript(({ actor, theme, narrowed, key }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify(actor))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, narrowed ? 'collapsed' : 'expanded')
    localStorage.setItem('mole-office.workspace', 'default')
  }, {
    actor: look.as === undefined ? { type: 'human', id: THE_TEST_OFFICES_OWNER.id } : { type: 'agent', id: look.as },
    theme: look.theme ?? 'light',
    narrowed: look.narrowed ?? false,
    key: SIDEBAR_KEY,
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00'))
  return { context, page }
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Whether the focus is in the quick search's field. */
async function theFocusIsInTheField(page: Page): Promise<boolean> {
  return page.locator(FIELD).evaluate((field) => document.activeElement === field)
}

/** Open the quick search with its key, from wherever the focus is now. */
async function openByTheKey(page: Page): Promise<void> {
  await page.keyboard.press('f')
  await page.locator(QUICK).waitFor({ timeout: 10_000 })
}

/** Put words on the clipboard and paste them into the quick search's field, as a person pastes them. */
async function paste(page: Page, words: string): Promise<void> {
  await page.evaluate((text) => navigator.clipboard.writeText(text), words)
  await page.locator(FIELD).focus()
  await page.keyboard.press('ControlOrMeta+V')
}

/** The rows the quick search lists, each with where it leads and the words it draws. */
async function theRows(page: Page, which: string): Promise<{ href: string; words: string }[]> {
  return page.locator(which).evaluateAll((all) => all.map((row) => ({
    href: row.getAttribute('href') ?? '',
    words: (row.querySelector('.qs-name')?.textContent ?? '').trim(),
  })))
}

/** The one line the quick search draws, waited for until it says `words`, and every line drawn. */
async function theLineSays(page: Page, words: string): Promise<string[]> {
  await page.locator(LINE, { hasText: words }).waitFor({ timeout: 15_000 })
  return page.locator(LINE).allTextContents()
}

/** Every /api/search request the page sends from now on, with how many were out at once at the most. */
function theSearchesOf(page: Page): { asked: string[]; mostAtOnce: () => number } {
  const asked: string[] = []
  let out = 0
  let most = 0
  const isASearch = (url: string): boolean => new URL(url).pathname.endsWith('/api/search')
  page.on('request', (request) => {
    if (!isASearch(request.url())) return
    asked.push(new URL(request.url()).searchParams.get('q') ?? '')
    out += 1
    most = Math.max(most, out)
  })
  const back = (request: { url(): string }): void => { if (isASearch(request.url())) out -= 1 }
  page.on('requestfinished', back)
  page.on('requestfailed', back)
  return { asked, mostAtOnce: () => most }
}

it('1. the sidebar press opens the quick search, open, narrowed and from the menu at 390, and Escape gives the focus back', async () => {
  for (const look of [{}, { narrowed: true }] as const) {
    const at = look.narrowed === true ? 'narrowed at 1440' : 'open at 1440'
    const { context, page } = await aWindow(look)
    try {
      await open(page, '/')
      await expect(page.locator(QUICK).count(), `${at}: the quick search before the press`).resolves.toBe(0)
      await page.locator(THE_PRESS).click()
      await page.locator(QUICK).waitFor({ timeout: 10_000 })
      expect(await theFocusIsInTheField(page), `${at}: the focus in the field`).toBe(true)
      expect(await page.locator(FIELD).getAttribute('placeholder'), `${at}: the words in the field`).toBe(said('quickSearch.find'))
      await page.keyboard.press('Escape')
      await page.locator(QUICK).waitFor({ state: 'detached', timeout: 10_000 })
      expect(await page.locator(THE_PRESS).evaluate((press) => document.activeElement === press), `${at}: the focus back on the press`).toBe(true)
    } finally {
      await context.close()
    }
  }
  const phone = await aWindow({ width: 390 })
  try {
    await open(phone.page, '/')
    await phone.page.locator('.shell-menu').click()
    await phone.page.locator('#shell-side[data-drawer="open"]').waitFor()
    await phone.page.locator(THE_PRESS).click()
    await phone.page.locator(QUICK).waitFor({ timeout: 10_000 })
    await phone.page.locator('#shell-side[data-drawer="open"]').waitFor({ state: 'detached', timeout: 10_000 })
    await phone.page.waitForTimeout(600)
    expect(await theFocusIsInTheField(phone.page), 'at 390: the focus in the field once the menu has closed').toBe(true)
    const box = await phone.page.locator(QUICK).boundingBox()
    expect(box !== null && box.x >= 0 && box.x + box.width <= 390, `at 390: the quick search inside the window, ${JSON.stringify(box)}`).toBe(true)
  } finally {
    await phone.context.close()
  }
}, 180_000)

it('2. the key f opens the quick search on every kind of page, and in a text box f is typed', async () => {
  const { context, page } = await aWindow()
  try {
    for (const address of ['/', recordPath(kelp, 'note'), pathFor('settings')]) {
      await open(page, address)
      await openByTheKey(page)
      expect(await theFocusIsInTheField(page), `${address}: the focus in the field`).toBe(true)
      // In its own field f is typed, as in any text box.
      await page.keyboard.press('f')
      expect(await page.locator(FIELD).inputValue(), `${address}: f typed in the field`).toBe('f')
      await page.keyboard.press('Escape')
      await page.locator(QUICK).waitFor({ state: 'detached', timeout: 10_000 })
    }
    // ALL PAGES opens with the focus in its own field, so f is typed there; with the focus gone, f opens the quick search.
    await open(page, pathFor('allPages'))
    const allPagesField = page.locator('#main input[type="search"]')
    await allPagesField.waitFor({ timeout: 30_000 })
    await allPagesField.focus()
    await page.keyboard.press('f')
    expect(await allPagesField.inputValue(), "f typed in All pages' field").toBe('f')
    await page.waitForTimeout(400)
    expect(await page.locator(QUICK).count(), "the quick search after f in All pages' field").toBe(0)
    await page.locator('#main h1').click()
    await openByTheKey(page)
    expect(await theFocusIsInTheField(page), 'All pages: the focus in the field').toBe(true)
  } finally {
    await context.close()
  }
}, 180_000)

it("3. a pasted id opens its record's page, in this project and in another", async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    const searches = theSearchesOf(page)
    await openByTheKey(page)
    await paste(page, kelp)
    await page.waitForFunction((to) => location.hash === `#${to}`, recordPath(kelp, 'note'), { timeout: 15_000 })
    await page.locator('#main', { hasText: KELP }).waitFor({ timeout: 30_000 })
    expect(await page.locator(QUICK).count(), 'the quick search once the record is open').toBe(0)
    expect(searches.asked, 'what was asked of the office').toEqual([kelp])

    await openByTheKey(page)
    await paste(page, elsewhereNote)
    await page.waitForFunction((to) => location.hash === `#${to}`, recordPath(elsewhereNote, 'note'), { timeout: 15_000 })
    await page.locator('#main', { hasText: ELSEWHERE_NOTE }).waitFor({ timeout: 30_000 })
    expect(await page.evaluate(() => localStorage.getItem('mole-office.workspace')), 'the project the record is in').toBe(ELSEWHERE.id)
  } finally {
    await context.close()
  }
}, 180_000)

it('4. words find the pages whose names hold them, the same pages All pages draws, and Enter opens the first', async () => {
  const { context, page } = await aWindow()
  try {
    // EVERY NAME ALL PAGES DRAWS, grey or not, the plugin's page among them, in its order, and then the foot's Settings.
    await open(page, pathFor('allPages'))
    await page.locator(`#main a[href="#${pluginPagePath(PLUGIN.id, 'main')}"]`).waitFor({ timeout: 30_000 })
    const allPages = await page.locator('#main a.ap-page, #main a.ap-front').evaluateAll((all) => all.map((link) => ({
      href: link.getAttribute('href') ?? '',
      words: (link.querySelector('span')?.textContent ?? '').trim(),
    })))
    expect(allPages.length, 'the names All pages draws').toBeGreaterThan(10)
    const foot = await page.locator('#shell-side a.sbp-settings').evaluateAll((all) => all.map((link) => ({
      href: link.getAttribute('href') ?? '',
      words: (link.querySelector('.shell-label')?.textContent ?? '').trim(),
    })))
    expect(foot, "the foot's rows").toEqual([{ href: `#${pathFor('settings')}`, words: said('nav.settings') }])
    const everyName = [...allPages, ...foot]
    await open(page, '/')
    for (const words of ['sett', 'REC', 'Plan', 'tide', 'o']) {
      await openByTheKey(page)
      await page.locator(FIELD).fill(words)
      const expected = everyName.filter((name) => name.words.toLowerCase().includes(words.toLowerCase()))
      expect(expected.length, `${words}: All pages has a name that holds it`).toBeGreaterThan(0)
      await page.locator(PAGES).first().waitFor({ timeout: 10_000 })
      expect(await theRows(page, PAGES), `the pages found by "${words}"`).toEqual(expected)
      if (words === 'sett') {
        await page.keyboard.press('Enter')
        await page.waitForFunction((to) => location.hash === to, expected[0]!.href, { timeout: 10_000 })
        // A page opened closes the quick search: it is gone, and not only covered.
        await page.locator(QUICK).waitFor({ state: 'detached', timeout: 10_000 })
      } else {
        await page.keyboard.press('Escape')
        await page.locator(QUICK).waitFor({ state: 'detached', timeout: 10_000 })
      }
    }
  } finally {
    await context.close()
  }
}, 180_000)

it('5. words find the records of this project by their titles, at most eight, and a record found opens its page', async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    await openByTheKey(page)
    await page.locator(FIELD).fill('kelp')
    await page.locator(RECORDS).first().waitFor({ timeout: 15_000 })
    expect(await theRows(page, RECORDS), 'the records found by "kelp"').toEqual([{ href: `#${recordPath(kelp, 'note')}`, words: KELP }])
    expect(await page.locator(LINE).count(), 'a line beside one record found').toBe(0)

    await page.locator(FIELD).fill('quokka')
    await page.locator(LINE, { hasText: said('quickSearch.more') }).waitFor({ timeout: 15_000 })
    const found = await theRows(page, RECORDS)
    expect(found.length, 'how many records are listed').toBe(8)
    expect(found.every((row) => QUOKKAS.includes(row.words)), `the records found by "quokka": ${JSON.stringify(found)}`).toBe(true)
    // A NOTE IN ANOTHER PROJECT is not found by words here: words find this project's records.
    await page.locator(FIELD).fill('harbour tide')
    await theLineSays(page, said('quickSearch.none', { words: 'harbour tide' }))
    expect(await page.locator(RECORDS).count(), 'records found by words only another project holds').toBe(0)

    await page.locator(FIELD).fill('kelp')
    await page.locator(RECORDS).first().waitFor({ timeout: 15_000 })
    await page.locator(RECORDS).first().click()
    await page.waitForFunction((to) => location.hash === `#${to}`, recordPath(kelp, 'note'), { timeout: 10_000 })
    await page.locator(QUICK).waitFor({ state: 'detached', timeout: 10_000 })
  } finally {
    await context.close()
  }
}, 180_000)

it('6. the words are asked once the typing stops, not at each key, and one request at a time', async () => {
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    const searches = theSearchesOf(page)
    await openByTheKey(page)
    await page.keyboard.type('kelp', { delay: 50 })
    await page.locator(RECORDS).first().waitFor({ timeout: 15_000 })
    expect(searches.asked, 'what four keys typed quickly asked of the office').toEqual(['kelp'])

    // EACH ANSWER TAKES A SECOND AND A HALF, so words typed while one is out wait for it.
    await page.route((url) => url.pathname.endsWith('/api/search'), async (route) => {
      await new Promise((done) => setTimeout(done, 1_500))
      await route.continue()
    })
    await page.locator(FIELD).fill('')
    await page.keyboard.type('qu')
    await page.waitForTimeout(400)
    await page.keyboard.type('o')
    await page.waitForTimeout(400)
    await page.keyboard.type('k')
    await page.locator(LINE, { hasText: said('quickSearch.more') }).waitFor({ timeout: 15_000 })
    expect(searches.asked.slice(1), 'what slow typing asked while each answer was out').toEqual(['qu', 'quok'])
    expect(searches.mostAtOnce(), 'the most requests out at once').toBe(1)
    expect((await theRows(page, RECORDS)).length, 'the records listed for the newest words').toBe(8)
  } finally {
    await context.close()
  }
}, 180_000)

it('7. an id no record has is said in one line, and nothing else is listed', async () => {
  expect(isARecordId(NOBODYS_ID), 'the made-up id has the shape of an id').toBe(true)
  const { context, page } = await aWindow()
  try {
    await open(page, pathFor('settings'))
    const before = await page.evaluate(() => location.hash)
    await openByTheKey(page)
    await paste(page, NOBODYS_ID)
    const lines = await theLineSays(page, said('quickSearch.unknownId', { id: NOBODYS_ID }))
    expect(lines, 'the lines drawn for an id no record has').toEqual([said('quickSearch.unknownId', { id: NOBODYS_ID })])
    expect(await page.locator(`${PAGES}, ${RECORDS}`).count(), 'rows listed for an id no record has').toBe(0)
    expect(await page.evaluate(() => location.hash), 'the page under the quick search').toBe(before)
    // Typed instead of pasted, the same line.
    await page.locator(FIELD).fill('')
    await page.locator(FIELD).fill(NOBODYS_ID)
    expect(await theLineSays(page, said('quickSearch.unknownId', { id: NOBODYS_ID }))).toEqual([said('quickSearch.unknownId', { id: NOBODYS_ID })])
  } finally {
    await context.close()
  }
}, 120_000)

it('8. a message an agent may not read is never listed for it, and its id is answered as an id no record has', async () => {
  expect(isARecordId(heron), 'the message id has the shape of an id').toBe(true)
  // THE PERSON reads every message, so the same words find it for the person.
  const person = await aWindow()
  try {
    await open(person.page, '/')
    await openByTheKey(person.page)
    await person.page.locator(FIELD).fill('heron')
    await person.page.locator(RECORDS).first().waitFor({ timeout: 15_000 })
    expect((await theRows(person.page, RECORDS)).map((row) => row.words), 'what "heron" finds for the person').toEqual([HERON])
  } finally {
    await person.context.close()
  }
  const dee = await aWindow({ as: 'made-up-qs-dee' })
  try {
    await open(dee.page, '/')
    await openByTheKey(dee.page)
    await dee.page.locator(FIELD).fill('heron')
    await theLineSays(dee.page, said('quickSearch.none', { words: 'heron' }))
    expect(await dee.page.locator(RECORDS).count(), 'what "heron" finds for an agent no party to the message').toBe(0)
    await dee.page.locator(FIELD).fill('')
    await paste(dee.page, heron)
    const lines = await theLineSays(dee.page, said('quickSearch.unknownId', { id: heron }))
    expect(lines, "the lines drawn for the id of a message the agent may not read").toEqual([said('quickSearch.unknownId', { id: heron })])
    expect(await dee.page.locator(`${PAGES}, ${RECORDS}`).count(), 'rows listed for that id').toBe(0)
    expect(await dee.page.evaluate(() => location.hash), 'the page under the quick search').toBe('#/')
  } finally {
    await dee.context.close()
  }
}, 180_000)

/** Put the made-up label above the quick search's head, or above the page's top when it is closed. */
async function labelled(page: Page, called: string): Promise<void> {
  const quick = page.locator(`${QUICK} > *:not([data-made-up-label])`)
  const above: Locator = (await page.locator(QUICK).count()) > 0 ? quick.first() : page.locator(THE_PAGE_TOP).first()
  await putTheMadeUpLabelIn(page, LABEL, above, called)
}

it.runIf(PICTURES !== undefined)('the pictures: the quick search empty, with a page, with a record and with an unknown id, on two pages', async () => {
  const folder = join(PICTURES!, 'pictures')
  mkdirSync(folder, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      const { context, page } = await aWindow({ theme, width })
      try {
        for (const [where, address] of [['home', '/'], ['record', recordPath(kelp, 'note')]] as const) {
          for (const [state, words] of [['empty', ''], ['page', 'sett'], ['record', 'kelp'], ['unknown', NOBODYS_ID]] as const) {
            await open(page, address)
            await openByTheKey(page)
            if (words !== '') await page.locator(FIELD).fill(words)
            if (state === 'page') await page.locator(PAGES).first().waitFor({ timeout: 10_000 })
            if (state === 'record') await page.locator(RECORDS).first().waitFor({ timeout: 15_000 })
            if (state === 'unknown') await theLineSays(page, said('quickSearch.unknownId', { id: NOBODYS_ID }))
            const called = `${CALLED}-${where}-${state}-${String(width)}-${theme}`
            await labelled(page, called)
            await page.waitForTimeout(400)
            await page.screenshot({ path: join(folder, `${called}.png`) })
          }
        }
      } finally {
        await context.close()
      }
    }
  }
}, 900_000)

it.runIf(PICTURES !== undefined)('the film at 1440: a pasted id opens its record, and words open a page', async () => {
  const dir = join(PICTURES!, 'film')
  mkdirSync(dir, { recursive: true })
  const { context, page } = await aWindow({ film: dir })
  // NO FRAME SHOWS THE PAGE WITHOUT ITS LABEL. The page is hidden until the label is in, and hidden again for each press
  // that opens or closes the quick search, because the label then has a new place.
  await context.addInitScript(() => {
    const unseen = new CSSStyleSheet()
    unseen.replaceSync('html { filter: opacity(0) !important; }')
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, unseen]
    ;(window as unknown as { filmUnseen: CSSStyleSheet }).filmUnseen = unseen
  })
  const hidden = (hide: boolean) => page.evaluate((hide) => {
    const sheet = (window as unknown as { filmUnseen?: CSSStyleSheet }).filmUnseen
    if (sheet === undefined) throw new Error('the film has no sheet to hide the page with')
    document.adoptedStyleSheets = hide ? [...document.adoptedStyleSheets.filter((one) => one !== sheet), sheet] : document.adoptedStyleSheets.filter((one) => one !== sheet)
  }, hide)
  const shown = async (called: string): Promise<void> => {
    await labelled(page, called)
    await hidden(false)
    await page.waitForTimeout(1_200)
  }
  try {
    await open(page, '/')
    await shown('film-home')
    await hidden(true)
    await page.locator(THE_PRESS).click()
    await page.locator(QUICK).waitFor({ timeout: 10_000 })
    await shown('film-open')
    await hidden(true)
    await paste(page, kelp)
    await page.locator('#main', { hasText: KELP }).waitFor({ timeout: 30_000 })
    await shown('film-the-record')
    await hidden(true)
    await openByTheKey(page)
    await shown('film-open-again')
    await page.keyboard.type('sett', { delay: 180 })
    await page.locator(PAGES).first().waitFor({ timeout: 10_000 })
    await page.waitForTimeout(1_200)
    await hidden(true)
    await page.keyboard.press('Enter')
    await page.waitForFunction((to) => location.hash === `#${to}`, pathFor('settings'), { timeout: 10_000 })
    await waitForThePage(page, 60_000)
    await shown('film-the-page')
  } finally {
    await context.close()
  }
}, 300_000)
