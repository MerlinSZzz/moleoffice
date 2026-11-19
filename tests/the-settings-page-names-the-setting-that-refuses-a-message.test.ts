// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTING THAT REFUSES A MESSAGE TO AN OFFLINE OR INACTIVE AGENT HAS A LINE ON THE SETTINGS PAGE,
 * IN NORMAL MODE TOO, AND THE REFUSAL NAMES IT BY THAT LINE'S WORDS, IN THE PAGE'S LANGUAGE.
 *
 * Answer 8 of 2 October 2026 (option B): the "This computer" panel draws a read-only line for
 * MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN, with a plain name of its own and the
 * variable's name on hover. The secretary's choice A (message 4TXyQKeEyRTI, wave 13n round 32): the
 * same line is also drawn in normal mode, in its own panel in the Chat and messages category, and the
 * refusal sentence names that place, so a person who is not in developer mode can find it. The
 * sentence never prints the variable's name and never says "developer mode".
 *
 * WHAT THIS FILE PROVES:
 *   1. GET /api/runtime says how the setting is set: on, off, or not set (a unit case, in this process).
 *   2. In a real browser, "This computer" draws the line with the value the runtime reading gives,
 *      carries the variable's name in its title, and offers nothing to press or type into. The
 *      normal-mode panel "Messages to offline agents" draws the same line, in the Chat and messages
 *      category, in both languages.
 *   3. The picker's "Cannot receive messages now" carries, under the pointer, the door's sentence in
 *      the page's language: in English it holds the line's label exactly as the page drew it and the
 *      place "Settings, Chat and messages"; in Chinese it holds the Chinese label and 设置，聊天和消息,
 *      and no English word is left in it. It never names the person: the picker is drawn for the person,
 *      so its sentence does not tell the person to write to the person.
 *   4. With TEST_SHOTS set, both panels and the picker are photographed at 1440, 990, 660 and 390 in
 *      both looks, in English and in Chinese. A headless browser draws no tooltip, so each picker
 *      picture has a second one, named "test-revealed", in which the test shows the row's off-screen
 *      copy of the sentence in place.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and this file turns the
 * setting on in the environment it hands that server. Every name here is made up.
 *
 * Three-run proofs, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-settings-page-names-the-setting-that-refuses-a-message.test.ts
 * - The line left out: in src/web/components/ThisComputer.tsx, delete the `<Fact>` for the setting.
 *   Case 2 goes red.
 * - The state worked out wrong: in src/server/lib/env.ts, `howTheMessageDoorIsSet`, answer 'off'
 *   where the door refuses. Cases 1 and 2 go red.
 * - The sentence typing its own name: in src/shared/cannot-receive.ts, put any other words where the
 *   sentence reads the word key. Case 3 goes red.
 * - The picker drawing the door's English: in src/web/components/ContactsInOrder.tsx, draw the
 *   English `cannotReceive` instead of building the sentence from `cannotReceiveSaid`. Case 3 goes red
 *   in Chinese.
 * - The normal-mode panel left out: in src/web/pages/SettingsPage.tsx, add 'settings.messagedoor' to
 *   DEVELOPER_ONLY_PANELS. Case 2 goes red.
 * - The picker naming the person: in src/web/components/ContactsInOrder.tsx, `whyTheRowCannotBeChosen`, pass
 *   `false` to `theCannotReceiveLine` instead of `true`. Case 3 goes red.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THIS_COMPUTER_WORDS } from '../src/web/components/ThisComputer.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { testShots } from './where-shots-go.ts'

const SETTING = 'MOLE_OFFICE_REFUSE_MESSAGE_TO_AGENT_WITH_NO_SESSION_AND_NO_RUN'
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const FILER = { name: 'Synthetic quarry agent', handle: 'quarry-survey' }
const NORMAL_PANEL = '[data-target="uiSurface/settings.messagedoor"]'

let app: LiveApp
let reportId = ''
let settingBefore: string | undefined
const shots = testShots('the-settings-page-names-the-setting')

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** The panel, opened in developer mode, in one language and look and at one width. */
async function openThePanel(lang: 'en' | 'zh', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?mode=inspect&lang=${lang}&look=${look}#/settings/thiscomputer`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.tcp-pair[data-setting]').waitFor({ timeout: 30_000 })
}

/** The normal-mode panel that shows the same setting, in one language and look and at one width. */
async function openTheNormalPanel(lang: 'en' | 'zh', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?mode=normal&lang=${lang}&look=${look}#/settings/messagedoor`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator(`${NORMAL_PANEL} .tcp-pair[data-setting]`).waitFor({ timeout: 30_000 })
}

/** THE TRAY KEEPS THE REVIEW'S ROWS AND FINISH COLLECTING BEHIND MORE ABOUT THIS REVIEW, inside the list Show comments
 *  opens, and that list is shut at first (wave 13y round 146, item 73a). */
async function openMore(): Promise<void> {
  await setTheReviewTraysList(app.page, 'open')
  const more = app.page.locator('.px-pane details.px-b-more')
  await more.waitFor({ timeout: 30_000 })
  if (!(await more.evaluate((el) => (el as HTMLDetailsElement).open))) await more.locator('summary').click()
}

/** The picker on the report the filer wrote, opened from the one comment in the review column. */
async function openThePicker(lang: 'en' | 'zh', width = 1440, look = 'light') {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
  // THE SAVED COMMENT IS A MEMBER: a review takes in the comments kept before it when it starts (wave 13r round 15).
  // The review has finished collecting, so the column draws its whole list with no More to open.
  const item = app.page.locator('.px-pane .px-pane-list .px-rev-item').first()
  await item.waitFor({ timeout: 30_000 })
  if ((await item.locator('.px-rev-more').count()) === 0) await item.locator('.px-rev-acts button').first().click()
  // THE PRESS THAT OPENS THE LIST, by its words in each language (review.pane.note.choose).
  await item.locator('.px-rev-more').getByRole('button', { name: createI18n(lang).t('review.pane.note.choose'), exact: true }).click()
  const cannot = item.locator('.px-review-contacts .px-pick-cannot').first()
  await cannot.waitFor({ timeout: 20_000 })
  return cannot
}

beforeAll(async () => {
  // THE SETTING IS ON for the server this file starts, which reads the environment it is handed.
  settingBefore = process.env[SETTING]
  process.env[SETTING] = '1'
  app = await liveApp({ name: 'settings-names-the-setting', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
  })
  // THE FILER: an agent nothing is answering as, which has written to the person, so it is a contact.
  await post('/api/records', { kind: 'agent', title: FILER.name, data: { handle: FILER.handle, runtime: 'claude-code', state: 'active' } })
  await post('/api/records', { kind: 'message', title: 'A note', data: { body: 'The quarry agent has a note.', to: [{ kind: 'person', id: THE_PERSON }] } }, AS(FILER.handle))
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title: 'Synthetic report filed by the quarry agent',
    data: { for: 'Robin Vale', date: '2026-10-02', blocks: [{ id: 'b-1', type: 'text', heading: 'Cuttings', text: 'One place to look at.' }] },
  }, AS(FILER.handle))
  reportId = report.record.id
  const words = 'Synthetic saved comment: is this cutting depth right?'
  await post('/api/records', {
    kind: 'message', title: words.slice(0, 40),
    data: { body: words, target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } } },
  })
  // THE REVIEW STARTED BELOW TAKES THIS COMMENT IN AS A MEMBER (wave 13r round 15).
  await new Promise((resolve) => setTimeout(resolve, 1_200))
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
  // THE REVIEW, started in the column on the report and finished collecting, so the picker is offered.
  await app.page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(app.page)
  if (!(await app.page.locator('.px-pane').isVisible())) await app.page.locator('.px-review-switch').click()
  const pane = app.page.locator('.px-pane')
  const toTheList = pane.getByRole('button', { name: 'Your reviews', exact: true })
  if ((await toTheList.count()) > 0) await toTheList.click()
  await pane.getByRole('button', { name: 'Start a review here', exact: true }).click()
  await openMore()
  await pane.locator('.px-pane-list .px-rev-item').first().waitFor({ timeout: 20_000 })
  await pane.getByRole('button', { name: 'Finish collecting', exact: true }).click()
  const finished = app.page.waitForResponse((response) => response.url().includes('/finish-collecting'))
  await pane.locator('.px-pane-confirm').getByRole('button').last().click()
  expect((await finished).status()).toBe(200)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (settingBefore === undefined) delete process.env[SETTING]
  else process.env[SETTING] = settingBefore
}, 120_000)

it('says how the setting is set: on, off, or not set', async () => {
  const { howTheMessageDoorIsSet } = await import('../src/server/lib/env.ts')
  const was = process.env[SETTING]
  try {
    process.env[SETTING] = '1'
    expect(howTheMessageDoorIsSet()).toEqual({ variable: SETTING, state: 'on' })
    process.env[SETTING] = '0'
    expect(howTheMessageDoorIsSet()).toEqual({ variable: SETTING, state: 'off' })
    delete process.env[SETTING]
    // THE CHECKOUT'S OWN .env MAY SET IT, so not set is asked only where nothing else does.
    const { settingWasSet } = await import('../src/config/settings.mjs')
    if (!settingWasSet(SETTING)) expect(howTheMessageDoorIsSet()).toEqual({ variable: SETTING, state: 'not set' })
  } finally {
    if (was === undefined) delete process.env[SETTING]
    else process.env[SETTING] = was
  }
})

it('draws the line on "This computer" with the value the runtime reading gives, and the variable on hover', async () => {
  const said = await fetch(`${app.api}/api/runtime`, { headers: PERSON })
  expect(said.status, await said.clone().text()).toBe(200)
  const record = (await said.json()) as { messageDoor: { variable: string; state: string } }
  // THE CONTROL: this server was handed the setting on, and the reading says so.
  expect(record.messageDoor).toEqual({ variable: SETTING, state: 'on' })
  await openThePanel('en')
  const line = app.page.locator('.tcp-pair[data-setting]')
  expect(await line.count()).toBe(1)
  expect(await line.locator('.tcp-key').innerText()).toBe(THIS_COMPUTER_WORDS.refuseUnanswered)
  expect(await line.locator('.tcp-val').innerText()).toBe(createI18n('en').t('settingsPanel.computer.refuseUnanswered.on'))
  expect(await line.getAttribute('title')).toBe(SETTING)
  // READ-ONLY: nothing on the panel to press or type into.
  expect(await app.page.locator('[data-target="uiSurface/settings.thiscomputer"]').locator('input, select, textarea, button').count()).toBe(0)
  // AND IN CHINESE, the label and the value follow the page; the title is still the variable.
  await openThePanel('zh')
  expect(await line.locator('.tcp-key').innerText()).toBe(createI18n('zh').t('settingsPanel.computer.refuseUnanswered'))
  expect(await line.locator('.tcp-val').innerText()).toBe(createI18n('zh').t('settingsPanel.computer.refuseUnanswered.on'))
  expect(await line.getAttribute('title')).toBe(SETTING)
  // THE SAME LINE IN NORMAL MODE, in the Chat and messages category, where "This computer" is not drawn.
  for (const lang of ['en', 'zh'] as const) {
    const words = createI18n(lang).t
    await openTheNormalPanel(lang)
    const normal = app.page.locator(`${NORMAL_PANEL} .tcp-pair[data-setting]`)
    expect(await normal.count()).toBe(1)
    expect(await normal.locator('.tcp-key').innerText()).toBe(words('settingsPanel.computer.refuseUnanswered'))
    expect(await normal.locator('.tcp-val').innerText()).toBe(words('settingsPanel.computer.refuseUnanswered.on'))
    expect(await normal.getAttribute('title')).toBe(SETTING)
    expect(await app.page.locator('.set .sf-cat[data-category="chat"] [data-settings-panel="settings.messagedoor"]').count()).toBe(1)
    expect(await app.page.locator('[data-settings-panel="settings.thiscomputer"]').count()).toBe(0)
    expect(await app.page.locator(NORMAL_PANEL).locator('input, select, textarea, button').count()).toBe(0)
  }
}, 180_000)

it('the picker\'s sentence is in the page\'s language, names the setting by the words the line draws, and never the variable', async () => {
  const people = (await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { people: { id: string; name: string }[] }
  const personName = people.people.find((one) => one.id === THE_PERSON)?.name ?? ''
  expect(personName.length, 'the test office holds a name for the person').toBeGreaterThan(0)
  await openTheNormalPanel('en')
  const label = await app.page.locator(`${NORMAL_PANEL} .tcp-pair[data-setting] .tcp-key`).innerText()
  const cannot = await openThePicker('en')
  expect(await cannot.innerText()).toContain(createI18n('en').t('contactsInOrder.cannotReceive'))
  const sentence = (await cannot.getAttribute('title')) ?? ''
  // THE AGENT BY ITS REGISTERED NAME, never its handle (wave 13n round 33).
  expect(sentence).toContain(`The agent "${FILER.name}" cannot get messages now`)
  expect(sentence).not.toContain(FILER.handle)
  expect(sentence).toContain(`The setting "${label}" is on`)
  expect(sentence).toContain('Settings, Chat and messages')
  expect(sentence, 'the picker is drawn for the person, so its sentence never names the person').not.toContain(personName)
  for (const inside of [SETTING, 'developer mode', 'no run recorded', 'No process', 'the person']) expect(sentence).not.toContain(inside)
  // IN CHINESE, the same sentence in Chinese, naming the Chinese label as the normal-mode panel draws it.
  await openTheNormalPanel('zh')
  const chineseLabel = await app.page.locator(`${NORMAL_PANEL} .tcp-pair[data-setting] .tcp-key`).innerText()
  const inChinese = (await (await openThePicker('zh')).getAttribute('title')) ?? ''
  expect(inChinese, 'the picker is drawn for the person, so its sentence never names the person').not.toContain(personName)
  expect(inChinese).toContain(`智能体“${FILER.name}”现在收不到消息`)
  expect(inChinese).toContain(`“${chineseLabel}”`)
  expect(inChinese).toContain('设置，聊天和消息')
  const rest = [personName, FILER.name, 'Mole Office'].reduce((text, name) => text.replaceAll(name, ''), inChinese)
  expect(rest, inChinese).not.toMatch(/[A-Za-z]/)
}, 180_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs both lines and the picker at four widths in both looks, in English and in Chinese', async () => {
  const views: { lang: 'en' | 'zh'; width: number; look: string }[] = []
  for (const lang of ['en', 'zh'] as const) for (const width of [1440, 990, 660, 390]) for (const look of ['light', 'dark']) views.push({ lang, width, look })
  for (const { lang, width, look } of views) {
    await openThePanel(lang, width, look)
    await app.page.locator('.tcp-pair[data-setting]').scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: `${shots}/this-computer-${lang}-${String(width)}-${look}.png` })
    await openTheNormalPanel(lang, width, look)
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${String(width)} ${look}`).toBe(true)
    await app.page.locator(NORMAL_PANEL).scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: `${shots}/messages-to-offline-agents-${lang}-${String(width)}-${look}.png` })
  }
  for (const { lang, width, look } of views) {
    const cannot = await openThePicker(lang, width, look)
    await cannot.scrollIntoViewIfNeeded()
    await cannot.hover()
    await app.page.screenshot({ path: `${shots}/picker-hover-${lang}-${String(width)}-${look}.png` })
    // A HEADLESS BROWSER DRAWS NO TOOLTIP, so the picture above cannot show the hover text. This second
    // picture is made by the test, not by the page: it shows the row's off-screen copy of the same
    // sentence in place, so a person can read what the pointer shows. Its name says "test-revealed".
    await app.page.addStyleTag({
      content: '.px-pick-cannot .px-sr { position: static !important; width: auto !important; height: auto !important; clip-path: none !important; white-space: normal !important; display: block; }',
    })
    await cannot.scrollIntoViewIfNeeded()
    await app.page.screenshot({ path: `${shots}/picker-sentence-test-revealed-${lang}-${String(width)}-${look}.png` })
  }
}, 900_000)
