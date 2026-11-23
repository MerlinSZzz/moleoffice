// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PANEL "USAGE NOTICES", IN A BROWSER. Wave 13y round 137, item 79b.
 *
 * Round 136 made two settings: which secretary takes the usage notices of the sandboxes' Claude login, and what the
 * notice at 80% of its seven days says to do, with the usage decision those words come from. They could be read and set
 * only through their doors. This panel puts them on the Settings page, one row each. Each row draws what is set now in
 * short state words, and the person changes it with a press.
 *
 * Round 140, item 79d: the person picks the usage decision with a press and never types its id. The row lists the ten
 * newest decisions of every project, newest first, each by its title and date with a press "Choose", and a press "Show
 * 10 more". An older decision is found by its title with the record picker the flow editor uses. The panel names the
 * decision by its title, and the reading still carries its id for a secretary's door.
 *
 * In a real browser against a Mole Office of its own, with two made-up secretaries registered one after the other, in
 * two different seconds, so that the first is stamped first, and made-up decisions: an older one, then one more than
 * the list shows at first, in a later second, then the one the words come from, in a second later still:
 *   1. the panel is in the Chat category straight after Module reminders, and drawn in normal mode;
 *   2. with nothing set, each row draws the state words of its door's reading, no reason, and no change; the door offers
 *      the two secretaries first appointed first; the picker's first row is "The first secretary appointed", then the
 *      two secretaries, under the agent pickers' order of names (the agent pickers point);
 *   6. the row lists the ten newest decisions of every project, newest first, each with its title, its date and a
 *      press, as GET /api/records reads them; "Show 10 more" adds the next ten;
 *   3. a press chooses the second secretary: the row draws what the door now reads, and says who changed it;
 *   4. words with no full stop at the end, and a decision chosen from the list with a press, are set with a press: the
 *      door holds the words exactly as typed and the decision's id and title, its sentence names the title and not the
 *      id, and the row draws the title and the words, with a link to the decision;
 *   5. "Set nothing" takes the words away: the door reads nothing set, and so does the row;
 *   7. the older decision is not in the list, and is found by a word of its title and chosen with a press: the door
 *      holds it;
 *   8. when TEST_SHOTS names a folder, the panel is photographed with nothing set and with both set, at 1440, 990, 660
 *      and 390, in light and dark, in English and in Chinese. A dark picture whose bytes are its light one's fails.
 *      Each picture is of the window, made as tall as the panel needs, so the whole panel shows in it (round 140,
 *      item 79d: the list of decisions makes the panel taller than a window 1,000 pixels high).
 *
 * MUTATION PROOF (each after a green control; A to E restored with cp and checked with cmp, F to L restored with git
 * checkout and checked by sha256):
 *   A. in src/web/pages/SettingsPage.tsx, give 'settings.usagenotices' the category 'tools': case 1 goes red.
 *   B. in src/web/components/UsageNotices.tsx, keep the first reading of who takes the notices after a press, and never
 *      the door's answer: case 3 goes red.
 *   C. the same file, send the words with a full stop added at the end: case 4 goes red.
 *   D. in src/server/lib/usage-notices.ts, order the secretaries by their stamp newest first: case 2 goes red. Before the
 *      two registrations were a second apart, case 2 went red or green by the order of two random ids.
 *   E. with TEST_SHOTS set, in src/web/components/PresetBar.tsx, draw a stored dark look as the light one: the two
 *      photograph cases go red on a dark picture that is its light one.
 * Round 140, item 79d:
 *   F. in src/web/api-parts/records.ts `newestDecisions`, order the decisions oldest first: case 6 goes red.
 *   G. in src/web/components/UsageNotices.tsx, let "Show 10 more" ask for the first ten again: case 6 goes red.
 *   H. the same file, let "Choose" leave the choice as it was: case 4 goes red.
 *   I. the same file, let a decision picked by its title leave the choice as it was: case 7 goes red.
 *   J. in src/server/lib/usage-notices.ts, name the decision by its id in the reading's sentence: case 4 goes red.
 *   K. with TEST_SHOTS set, in src/web/components/SettingsFolds.tsx, give a panel no room under what sticks above it
 *      when the page lands on it: the two photograph cases go red where the bar lies over the panel's first line.
 * Round 140's refusal, answered:
 *   L. in src/web/components/UsageNotices.tsx, keep DECISIONS_AT_A_TIME and let the list draw one fewer at first: case 6
 *      goes red. The case reads how many the list draws from DECISIONS_AT_A_TIME, so a change to it moves the case too.
 *
 * Everything here is made up: the two secretaries, the decisions and the words.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { DECISIONS_AT_A_TIME } from '../src/web/components/UsageNotices.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { testShots } from './where-shots-go.ts'

const en = englishWords()

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const PANEL = '[data-target="uiSurface/settings.usagenotices"]'
const ENTRY = '[data-settings-panel="settings.usagenotices"]'
const WHO = `${PANEL} .usn-row[data-setting="usage-notice-secretary"]`
const WHAT = `${PANEL} .usn-row[data-setting="usage-decision"]`

const LABEL = 'Made-up data — an invented office, not real office data'

/** The two made-up secretaries, in the order they are registered, so the first is the first appointed. */
const SECRETARIES = [
  ['made-up-sec-one', 'Made-up Secretary One'],
  ['made-up-sec-two', 'Made-up Secretary Two'],
] as const

/** Made-up words of a usage decision, with no full stop at the end. */
const WORDS = 'Made-up words, 7777: hold the long checks until the reset'

/** The made-up decision the words come from, the newest of all, and an older one that the list does not reach. */
const DECISION_TITLE = 'A made-up usage decision'
const OLDER_WORD = 'Quokka'
const OLDER_TITLE = `A made-up older usage decision, ${OLDER_WORD} 4242`
/** How many decisions the list shows at first, and how many more each press adds (item 79d), as the panel reads it. */
const AT_A_TIME = DECISIONS_AT_A_TIME

/** The made-up decisions made between the two, so that more are newer than the older one than the list shows at first. */
const BETWEEN = AT_A_TIME + 1

let app: LiveApp
let decision = ''
let older = ''
const idOf: Record<string, string> = {}
const shots = testShots('the-settings-page-names-who-takes-the-usage-notices')

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: AS_THE_PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status < 300, `${method} ${path}: ${text.slice(0, 400)}`).toBe(true)
  return JSON.parse(text) as Record<string, unknown>
}

interface AReading {
  inForce: Record<string, unknown>
  stored?: string | null
  says: string
  mayBeChosen?: { id: string; handle: string; name: string }[]
}

const whoTakesThem = async (): Promise<AReading> => (await call('GET', '/api/office/usage-notice-secretary')) as unknown as AReading
const whatItSays = async (): Promise<AReading> => (await call('GET', '/api/office/usage-decision')) as unknown as AReading

interface ADecisionRow {
  id: string
  title: string
  at: string
}

/** The decisions of every project, newest first, as the records door reads them for the person. */
async function theNewestDecisions(limit: number): Promise<{ rows: ADecisionRow[]; matched: number }> {
  const read = (await call('GET', `/api/records?kind=decision&shape=narrow&sort=created&direction=desc&limit=${String(limit)}&offset=0&projects=all`)) as {
    records: { id: string; title: string; createdAt: string }[]
    matched: number
  }
  return { rows: read.records.map((one) => ({ id: one.id, title: one.title, at: one.createdAt })), matched: read.matched }
}

const LISTED = `${WHAT} .usn-decisions > li`

/** The decisions the row lists, each by the id it is drawn for, the title drawn and the stamp its date is drawn from. */
async function theListedDecisions(): Promise<ADecisionRow[]> {
  return app.page.locator(LISTED).evaluateAll((all) =>
    all.map((one) => ({
      id: one.getAttribute('data-record') ?? '',
      title: one.querySelector('.usn-decision-title')?.textContent?.trim() ?? '',
      at: one.querySelector('time')?.getAttribute('datetime') ?? '',
    })),
  )
}

/** Waits until the row has listed the decisions it read. */
async function theListIsRead(): Promise<void> {
  await app.page.locator(LISTED).first().waitFor({ timeout: 30_000 })
}

/** Waits until the row's choice is this decision. */
async function theChoiceIs(id: string): Promise<void> {
  await app.page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.getAttribute('data-chosen') === expected,
    { selector: `${WHAT} .usn-chosen`, expected: id },
    { timeout: 15_000 },
  )
}

async function openThePanel(width = 1440, look = 'light', language = 'en'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&mode=normal&look=${look}#/settings/usagenotices`)
  await waitForThePage(app.page, 60_000)
  for (const row of [WHO, WHAT]) {
    await app.page.locator(`${row} .usn-state`).waitFor({ timeout: 30_000 })
    await app.page.locator(`${row} .scl-line`).waitFor({ timeout: 30_000 })
  }
}

const textOf = async (selector: string): Promise<string> => (await app.page.locator(selector).innerText()).trim()

/** Waits until the row's state is the state words of what the door reads now. */
async function theRowIs(row: string, words: string): Promise<void> {
  await app.page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector: `${row} .usn-state`, expected: words },
    { timeout: 15_000 },
  )
}

async function theChangeLineNamesAChange(row: string): Promise<void> {
  await app.page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent?.startsWith('Changed by') ?? false,
    `${row} .scl-line`,
    { timeout: 15_000 },
  )
}

async function photograph(state: string): Promise<void> {
  // EVERY WIDTH, BOTH LOOKS, BOTH LANGUAGES. The dark picture is taken after the light one of its width and language,
  // and a dark picture whose bytes are the light one's is refused: the page never took the dark look, so it is no
  // picture of the dark look.
  for (const language of ['en', 'zh']) {
    for (const width of [1440, 990, 660, 390]) {
      let light: Buffer | null = null
      for (const look of ['light', 'dark']) {
        const name = `usage-notices-${state}-${language}-${String(width)}-${look}`
        await openThePanel(width, look, language)
        await theListIsRead()
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), name).toBe(true)
        await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(PANEL), name)
        await theWholePanelIsInTheWindow(width, name)
        const picture = await app.page.screenshot({ path: `${shots}/${name}.png`, fullPage: false })
        if (look === 'light') light = picture
        else expect(light !== null && light.equals(picture), `the dark picture ${name} is its light one`).toBe(false)
      }
    }
  }
}

/**
 * MAKES THE WINDOW AS TALL AS THE PANEL NEEDS. The list of decisions makes the panel taller than a window 1,000 pixels
 * high. A picture of the whole page would hold every other Settings panel too, and it draws the rail empty. The page
 * itself puts the panel just under what sticks above it, and puts it there again whenever the page changes size, until
 * the person scrolls, presses or types (keepUnderTheList in src/web/components/SettingsFolds.tsx). So the window grows
 * to the panel's foot and 80 pixels more, and the page puts the panel back in its place. Then the panel's first and
 * last lines must be in the window, with nothing lying over them: at 390 the bar and the row of categories can.
 */
async function theWholePanelIsInTheWindow(width: number, name: string): Promise<void> {
  const panel = app.page.locator(PANEL)
  const foot = await panel.evaluate((one) => Math.ceil(one.getBoundingClientRect().bottom))
  await app.page.setViewportSize({ width, height: Math.max(1000, foot + 80) })
  const where = await panel.evaluate(async (one) => {
    for (const frame of [1, 2]) await new Promise((done) => requestAnimationFrame(() => done(frame)))
    const box = one.getBoundingClientRect()
    const shows = (y: number) => one.contains(document.elementFromPoint(box.left + 12, y))
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      window: window.innerHeight,
      firstLineShows: shows(box.top + 4),
      lastLineShows: shows(box.bottom - 4),
    }
  })
  const said = JSON.stringify({ foot, ...where })
  const whole = where.top >= 0 && where.bottom <= where.window && where.firstLineShows && where.lastLineShows
  expect(whole, `the whole panel shows in the window of ${name}: ${said}`).toBe(true)
}

/**
 * WAITS FOR THE CLOCK'S NEXT WHOLE SECOND. The door orders the secretaries by the stamp of their registration, and then
 * by id, and the stamp counts whole seconds. Two registrations in one second would be ordered by their random ids. The
 * server stamped the last registration before its answer came, so a registration after this wait is stamped later.
 * The records door orders decisions by their stamps in the same way, so the decisions are made in three seconds.
 */
async function theNextSecond(): Promise<void> {
  await new Promise((done) => setTimeout(done, 1000 - (Date.now() % 1000) + 50))
}

beforeAll(async () => {
  app = await liveApp({ name: 'usage-notices-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const stamps: string[] = []
  for (const [handle, name] of SECRETARIES) {
    if (stamps.length > 0) await theNextSecond()
    const made = (await call('POST', '/api/agents/started', { handle, name, role: 'secretary' })) as { agent: { id: string; createdAt: string } }
    idOf[handle] = made.agent.id
    stamps.push(made.agent.createdAt)
  }
  expect(stamps[0]! < stamps[1]!, `the second secretary is stamped after the first: ${stamps.join(', ')}`).toBe(true)
  const aDecision = async (title: string): Promise<string> =>
    ((await call('POST', '/api/records', { kind: 'decision', title, data: { governs: [{ wholeProject: true }], replaces: [] } })) as { record: { id: string } }).record.id
  older = await aDecision(OLDER_TITLE)
  await theNextSecond()
  for (let n = 1; n <= BETWEEN; n++) await aDecision(`A made-up decision, number ${String(n)}`)
  await theNextSecond()
  decision = await aDecision(DECISION_TITLE)
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('1: is in the Chat category straight after Module reminders, in normal mode', async () => {
  await openThePanel()
  const chat = await app.page.locator('.set .sf-cat[data-category="chat"] [data-settings-panel]').evaluateAll((all) =>
    all.map((one) => one.getAttribute('data-settings-panel') ?? ''),
  )
  expect(chat.indexOf('settings.usagenotices')).toBe(chat.indexOf('settings.modulereminders') + 1)
  expect((await app.page.locator(`${ENTRY} .sf-title`).textContent())?.trim()).toBe(en['settingsPanel.title.usagenotices'])
}, 120_000)

it('2: with nothing set, each row draws what its door reads, no reason and no change, and the first option the picker offers is "The first secretary appointed"', async () => {
  await openThePanel()
  const who = await whoTakesThem()
  expect(who.inForce['from']).toBe('the first secretary appointed')
  expect(await textOf(`${WHO} .usn-state`)).toBe(`${SECRETARIES[0][1]} · ${t('usageNotices.state.firstAppointed')}`)
  const what = await whatItSays()
  expect(what.inForce).toEqual({ from: 'not set' })
  expect(await textOf(`${WHAT} .usn-state`)).toBe(t('settingsState.notSet'))
  for (const row of [WHO, WHAT]) {
    expect(await app.page.locator(`${row} .usn-because`).count()).toBe(0)
    expect(await textOf(`${row} .scl-line`)).toBe(en['settingsPanel.changed.none'])
  }
  expect(who.mayBeChosen?.map((one) => one.handle), 'the door does not offer the secretaries first appointed first').toEqual(SECRETARIES.map(([handle]) => handle))
  // THE PICKER'S ROWS, once its search box is pressed: the choice that names nobody, then the secretaries by name.
  await app.page.locator(WHO).getByLabel(en['usageNotices.panel.pick'], { exact: true }).click()
  const offered = (await app.page.locator(`${WHO} .agp .agp-row .agp-name`).allInnerTexts()).map((one) => one.trim())
  expect(offered).toEqual([en['usageNotices.panel.pickNobody'], ...SECRETARIES.map(([, name]) => name)])
}, 120_000)

it('6: lists the ten newest decisions of every project, newest first, by title and date, and "Show 10 more" adds the next ten', async () => {
  await openThePanel()
  await theListIsRead()
  const door = await theNewestDecisions(2 * AT_A_TIME)
  expect(door.matched, 'the made-up decisions are more than one list of ten').toBeGreaterThan(AT_A_TIME)
  const stamps = door.rows.map((one) => one.at)
  expect(stamps, 'the door reads the decisions newest first').toEqual([...stamps].sort().reverse())
  expect(await theListedDecisions()).toEqual(door.rows.slice(0, AT_A_TIME))
  for (const date of await app.page.locator(`${LISTED} time`).allInnerTexts()) expect(date.trim()).not.toBe('')
  expect(await app.page.locator(`${LISTED} .usn-button[data-press="choose-decision"]`).count()).toBe(AT_A_TIME)
  await app.page.locator(`${WHAT} .usn-button[data-press="more-decisions"]`).click()
  await app.page.waitForFunction(({ selector, expected }) => document.querySelectorAll(selector).length === expected, { selector: LISTED, expected: door.rows.length }, { timeout: 15_000 })
  expect(await theListedDecisions()).toEqual(door.rows)
  expect(await app.page.locator(`${WHAT} .usn-button[data-press="more-decisions"]`).count()).toBe(door.matched > door.rows.length ? 1 : 0)
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with nothing set', async () => {
  await photograph('nothing-set')
}, 900_000)

it('3: a press chooses the second secretary, and the row draws what the door now reads', async () => {
  await openThePanel()
  const second = idOf[SECRETARIES[1][0]]!
  await app.page.locator(WHO).getByLabel(en['usageNotices.panel.pick'], { exact: true }).fill(SECRETARIES[1][0])
  await app.page.locator(`${WHO} .agp button.agp-row[data-value="${second}"]`).click()
  await app.page.locator(`${WHO} .usn-button[data-press="choose"]`).click()
  await theChangeLineNamesAChange(WHO)
  const who = await whoTakesThem()
  expect(who.stored).toBe(second)
  expect(who.inForce['from']).toBe('set here')
  await theRowIs(WHO, `${SECRETARIES[1][1]} · ${t('settingsState.chosenHere')}`)
}, 120_000)

it('4: words with no full stop and a decision chosen from the list are set with a press, and the row names the decision by its title', async () => {
  await openThePanel()
  await theListIsRead()
  await app.page.locator(`${WHAT} textarea`).fill(WORDS)
  await app.page.locator(`${LISTED}[data-record="${decision}"] .usn-button[data-press="choose-decision"]`).click()
  await theChoiceIs(decision)
  expect(await textOf(`${WHAT} .usn-chosen`)).toContain(DECISION_TITLE)
  await app.page.locator(`${WHAT} .usn-button[data-press="save"]`).click()
  await theChangeLineNamesAChange(WHAT)
  const what = await whatItSays()
  expect(what.inForce).toEqual({ from: 'set here', whatToDo: WORDS, decision, title: DECISION_TITLE })
  expect(what.says).toContain(DECISION_TITLE)
  expect(what.says).not.toContain(decision)
  await theRowIs(WHAT, t('usageNotices.state.decisionSet', { title: DECISION_TITLE, whatToDo: WORDS }))
  expect(await app.page.locator(`${WHAT} .usn-link a[href*="${decision}"]`).count()).toBe(1)
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel with both set', async () => {
  await photograph('both-set')
}, 900_000)

it('5: "Set nothing" takes the words away, and the row draws what the door now reads', async () => {
  await openThePanel()
  await app.page.locator(`${WHAT} .usn-button[data-press="clear"]`).click()
  await app.page.waitForFunction((selector) => document.querySelector(selector) === null, `${WHAT} a[href*="${decision}"]`, { timeout: 15_000 })
  const what = await whatItSays()
  expect(what.inForce).toEqual({ from: 'not set' })
  await theRowIs(WHAT, t('settingsState.notSet'))
}, 120_000)

it('7: a decision older than the list is found by a word of its title and chosen with a press, and the door holds it', async () => {
  await openThePanel()
  await theListIsRead()
  expect(await app.page.locator(`${LISTED}[data-record="${older}"]`).count()).toBe(0)
  await app.page.locator(`${WHAT} textarea`).fill(WORDS)
  await app.page.locator(`${WHAT} .rpk-box`).fill(OLDER_WORD)
  await app.page.locator(`${WHAT} .rpk-one`, { hasText: OLDER_TITLE }).click({ timeout: 15_000 })
  await theChoiceIs(older)
  await app.page.locator(`${WHAT} .usn-button[data-press="save"]`).click()
  await app.page.locator(`${WHAT} .usn-link a[href*="${older}"]`).waitFor({ timeout: 15_000 })
  const what = await whatItSays()
  expect(what.inForce).toEqual({ from: 'set here', whatToDo: WORDS, decision: older, title: OLDER_TITLE })
  await theRowIs(WHAT, t('usageNotices.state.decisionSet', { title: OLDER_TITLE, whatToDo: WORDS }))
}, 120_000)
