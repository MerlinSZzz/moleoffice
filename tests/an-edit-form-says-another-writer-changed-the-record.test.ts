// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EDIT FORM SAYS ANOTHER WRITER CHANGED THE RECORD, AND ASKS ON SAVE. Decision rhiQ7o-ynte-, choice A, built
 * in wave 13y round 146 (src/web/components/AnotherWriter.tsx).
 *
 * The decision: while the person edits, a change by another writer does not touch the form. A line above the form says
 * who changed the record and when, with a press to see their version. When the person saves, the office asks them to
 * choose between their change and the other, so neither is lost.
 *
 * In a test office of its own, with the gate `writes-from-a-stale-copy` at its default of block, this file opens a
 * record's edit address as the person, types, and has a registered agent change the record through the doors. Each
 * case files its own record, so no case leans on what another left.
 *
 * 1. THE LINE NAMES THE OTHER WRITER, and what the person typed stays.
 * 2. SEE THEIR VERSION SHOWS THEIR TITLE.
 * 3. SAVE ASKS FIRST. Back to the form stores nothing and keeps the typing.
 * 4. SAVE MINE STORES THE PERSON'S TITLE, and the other writer's version stays in the record's history.
 * 5. KEEP THEIRS PUTS THEIR TITLE IN THE BOX and stores nothing of the person's.
 * 6. THE PERSON'S OWN CHANGE ELSEWHERE DRAWS NO LINE AND ASKS NOTHING, as from another tab.
 * 7. A MODULE'S TICK SAVED OVER ANOTHER WRITER'S CHANGE KEEPS THEIR CHANGE TO ANOTHER LINE.
 *
 * Four more saves on the record page write the same way, in wave 13y round 147:
 *
 * 9. A KEPT LINE DELETED AFTER THE TERMINAL KEPT ANOTHER KEEPS THE NEW ONE. A terminal keeps its lines as the person,
 *    so the newer version is the person's own: nothing is asked, and the delete is written on it.
 * 10. THE CLOSE FORM ASKS when another writer changed the problem after the person opened the form. This case opens the
 *     problem's record page, `#/r/<id>`, where the close form is drawn beside the state.
 * 11. THE PIN ASKS FIRST, and Back to the form stores nothing.
 * 12. WORDS ADDED TO A DECISION ASK FIRST, and Save mine keeps the words the person added in another tab.
 *
 * Four more, in wave 13y round 148:
 *
 * 13. SAVE MINE SENDS ONLY WHAT THE PERSON CHANGED. The person changed only the title and the kiln writer only the
 *     summary, so Save mine stores the person's title and keeps the kiln writer's summary.
 * 14. THE CLOSE FORM ON THE PROBLEM'S OWN PAGE, `#/problem/<id>`, ASKS as it does on the record page, and nothing is
 *     stored before the person answers.
 * 16. THE GOAL'S CONFIRM PRESS ASKS FIRST, and Back to the form stores nothing. Save mine then confirms the goal and
 *     keeps the kiln writer's change.
 * 17. A COMMENT'S NEW WORDS ASK when the kiln writer put a reading beside the words after the person opened the box.
 *     Nothing is stored before the person answers, and Save mine stores the person's words and keeps the reading.
 *
 * Case names name the source mutation tried against each. The server's refusal of a write from a stale copy, with 409
 * and nothing stored, is tests/patch.test.ts; this file is the screen.
 *
 * Set W13Y_ANOTHER_WRITER_SHOTS to a folder outside the checkout, and W13Y_ANOTHER_WRITER_LOOK to light or dark, to
 * photograph the line, with their version shown, and the question, at 1440, 990, 660 and 390 in that look. Case 15
 * photographs the screens round 147 changed, in the same look and at the same widths: the kept lines, the close form on
 * both of a problem's pages and the question it asks, and the questions the pin and a decision's words ask. One run
 * takes one look, so each look is taken in a test office of its own. The ordinary run takes none. Every record here is
 * made up, and every picture says so: above the block it shows, and inside the question above its heading, since the
 * question covers the page.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { notReloaded, open as openIn, type HeardOffice } from './a-page-that-hears-changes.ts'
import { putTheMadeUpLabelIn, THE_MADE_UP_LABEL_MARKER } from './the-made-up-label-above-the-page.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const WRITER_HANDLE = 'kiln-writer'
const WRITER_NAME = 'Kiln Writer'
const AN_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WRITER_HANDLE }

const shots = process.env['W13Y_ANOTHER_WRITER_SHOTS']
/** The one look a picture run takes. */
const look = process.env['W13Y_ANOTHER_WRITER_LOOK']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
/** How long a change may take to be drawn. */
const DRAWN_WITHIN_MS = 8_000
/** How long a case waits to see that nothing was drawn. Over four times the half second a page waits. */
const NOTHING_DRAWN_IN_MS = 2_500

const TITLE_BOX = 'form.rp-edit input'
const SAVE = 'form.rp-edit button[type="submit"]'
const LINE = '.aw-line'
const QUESTION = 'dialog.aw-question[open]'
const TYPED = 'The kiln report, as the person is retitling it'
const THEIRS = 'The kiln report, retitled by the kiln writer'

async function send(method: string, url: string, body: object | null, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === null ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

function heard(): HeardOffice {
  return { api: app.api, site: app.site, headers: PERSON }
}

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await openIn(heard(), page, hash, waitFor)
}

async function aReport(title: string): Promise<string> {
  const made = await send('POST', '/api/records', { kind: 'report', title, data: { for: 'A made-up reader', date: '2026-11-07', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report.' }] } }, AN_AGENT)
  return made['record'].id as string
}

async function stored(id: string): Promise<Record<string, any>> {
  return (await send('GET', `/api/records/${id}`, null, PERSON))['record'] as Record<string, any>
}

/** The record's versions, newest first, with who wrote each. */
async function versions(id: string): Promise<Array<{ seq: number; who: { actorType: string; actorId: string } }>> {
  return (await send('GET', `/api/records/${id}/revisions`, null, PERSON))['revisions'] as Array<{ seq: number; who: { actorType: string; actorId: string } }>
}

async function byThePerson(id: string): Promise<number> {
  return (await versions(id)).filter((one) => one.who.actorType === 'human').length
}

/** Wait until the element `within` names holds these words. */
async function drawn(page: Page, within: string, words: string): Promise<void> {
  await page.waitForFunction(
    ([where, what]) => (document.querySelector(where ?? '')?.textContent ?? '').includes(what ?? ''),
    [within, words],
    { timeout: DRAWN_WITHIN_MS },
  )
}

/** Open the report's edit address, type a title, and have the kiln writer store theirs; wait for the line. */
async function typedThenTheirs(page: Page, report: string): Promise<void> {
  await open(page, `/r/${report}/edit`, TITLE_BOX)
  await page.locator(TITLE_BOX).first().fill(TYPED)
  await send('PATCH', `/api/records/${report}`, { title: THEIRS }, AN_AGENT)
  await drawn(page, LINE, WRITER_NAME)
}

async function press(page: Page, within: string, words: string): Promise<void> {
  await page.locator(within).getByRole('button', { name: words, exact: true }).click()
}

/**
 * THE LABEL IN THE QUESTION SITS AT ITS TOP, WITH NO MARGIN ABOVE IT. The question is drawn in the browser's top layer,
 * in the middle of the window, and it does not scroll. The label helper pushes its label down by the distance a scroll
 * could not make, measured from the bars stuck at the top of the page under the question. In the question that margin
 * is an empty band the question does not draw, so it is taken off here. The helper's checks are then made again: the
 * label is whole inside the window and above the question's heading. Nothing in the page is drawn over the top layer.
 */
async function labelAtTheQuestionsTop(page: Page, called: string): Promise<void> {
  const label = page.locator(`${QUESTION} ${THE_MADE_UP_LABEL_MARKER}`)
  if ((await label.count()) !== 1) throw new Error(`${called}: the made-up label is not in the question`)
  const after = await label.evaluate((element) => {
    ;(element as HTMLElement).style.marginTop = '0px'
    const box = element.getBoundingClientRect()
    const heading = element.parentElement?.querySelector('h2')?.getBoundingClientRect()
    return {
      whole: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
      above: heading !== undefined && heading.top >= box.bottom - 0.5,
    }
  })
  if (!after.whole) throw new Error(`${called}: the made-up label is cut off by the window`)
  if (!after.above) throw new Error(`${called}: the made-up label is not above the question's heading`)
}

beforeAll(async () => {
  app = await liveApp({ name: 'an-edit-form-says-another-writer', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: WRITER_HANDLE, name: WRITER_NAME, role: 'worker' }, PERSON)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it("1. while the person edits, another writer's change draws a line naming them, and the typing stays: without the listener in WritingThisRecord no line comes", async () => {
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  expect(await app.page.locator(LINE).textContent()).toContain(`${WRITER_NAME} changed this record`)
  expect(await app.page.locator(TITLE_BOX).first().inputValue()).toBe(TYPED)
  expect((await stored(report))['title']).toBe(THEIRS)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('2. See their version shows their title: without the comparison under the press, nothing is shown', async () => {
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  await press(app.page, LINE, 'See their version')
  await drawn(app.page, LINE, THEIRS)
  await press(app.page, LINE, 'Hide their version')
  expect(await app.page.locator(LINE).textContent()).not.toContain(THEIRS)
}, 120_000)

it("3. Save asks first, and Back to the form stores nothing and keeps the typing: a form written as one drawn alone, with no version, stores the person's title over theirs and asks nothing", async () => {
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  await app.page.locator(SAVE).click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  expect(await app.page.locator(QUESTION).textContent()).toContain(`${WRITER_NAME} changed it`)
  await press(app.page, QUESTION, 'Back to the form')
  await expect.poll(() => app.page.locator(QUESTION).count()).toBe(0)
  expect(await app.page.locator(TITLE_BOX).first().inputValue()).toBe(TYPED)
  expect((await stored(report))['title']).toBe(THEIRS)
  expect(await byThePerson(report), 'versions the person wrote').toBe(0)
}, 120_000)

it("4. Save mine stores the person's title, and theirs stays in the record's history: Save mine sent on the version the form was opened from is refused and asked again", async () => {
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  const theirSeq = (await versions(report))[0]?.seq
  await app.page.locator(SAVE).click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Save mine')
  await expect.poll(async () => (await stored(report))['title'], { timeout: DRAWN_WITHIN_MS }).toBe(TYPED)
  expect(await app.page.locator(QUESTION).count()).toBe(0)
  const theirVersion = await send('GET', `/api/records/${report}/revisions/${String(theirSeq)}`, null, PERSON)
  expect(theirVersion['content']['title']).toBe(THEIRS)
  // THE LINE GOES ONCE THE PERSON HAS ANSWERED IT.
  await expect.poll(() => app.page.locator(LINE).count()).toBe(0)
}, 120_000)

it("5. Keep theirs puts their title in the box and stores nothing of the person's: a Keep theirs that only went back to the form leaves the person's typing in the box", async () => {
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  await app.page.locator(SAVE).click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Keep theirs')
  await expect.poll(() => app.page.locator(TITLE_BOX).first().inputValue(), { timeout: DRAWN_WITHIN_MS }).toBe(THEIRS)
  expect(await app.page.locator(QUESTION).count()).toBe(0)
  expect(await app.page.locator(SAVE).count(), 'a Save press, which only a changed box draws').toBe(0)
  expect((await stored(report))['title']).toBe(THEIRS)
  expect(await byThePerson(report), 'versions the person wrote').toBe(0)
  await expect.poll(() => app.page.locator(LINE).count()).toBe(0)
}, 120_000)

it("6. the person's own change made elsewhere draws no line and asks nothing: if every writer counted as another, the person's change in another tab would be asked about", async () => {
  const report = await aReport('The kiln report')
  await open(app.page, `/r/${report}/edit`, TITLE_BOX)
  await app.page.locator(TITLE_BOX).first().fill(TYPED)
  await send('PATCH', `/api/records/${report}`, { title: 'The kiln report, retitled by the person in another tab' }, PERSON)
  await app.page.waitForTimeout(NOTHING_DRAWN_IN_MS)
  expect(await app.page.locator(LINE).count(), 'lines above the form').toBe(0)
  await app.page.locator(SAVE).click()
  await expect.poll(async () => (await stored(report))['title'], { timeout: DRAWN_WITHIN_MS }).toBe(TYPED)
  expect(await app.page.locator(QUESTION).count()).toBe(0)
  // BOTH VERSIONS ARE THE PERSON'S, the one from the other tab and the one from this form.
  expect((await versions(report)).slice(0, 2).map((one) => `${one.who.actorType} ${one.who.actorId}`)).toEqual([`human ${THE_PERSON}`, `human ${THE_PERSON}`])
}, 120_000)

it("7. a module's tick saved over another writer's change keeps their change to another line: without `again`, Save mine writes back the list the page drew and loses theirs", async () => {
  const parts = [{ id: 'p-1', name: 'The firing', items: [{ id: 'i-1', text: 'Load the kiln', state: 'todo' }, { id: 'i-2', text: 'Fire the kiln', state: 'todo' }] }]
  const made = await send('POST', '/api/records', { kind: 'module', title: 'The kiln module', data: { state: 'active', parts } }, PERSON)
  const module = made['record'].id as string
  await open(app.page, `/r/${module}/edit`, '.mv-items button.px-chip-btn')
  const theirParts = [{ ...parts[0], items: [parts[0]!.items[0], { id: 'i-2', text: 'Fire the kiln twice', state: 'todo' }] }]
  // THE KILN WRITER SAYS WHICH VERSION IT REWRITES THE LIST ON, since the office refuses a rewritten line without one.
  const version = (await send('GET', `/api/records/${module}`, null, AN_AGENT))['version'] as string
  await send('PATCH', `/api/records/${module}`, { dataPatch: { parts: theirParts }, ifVersion: version }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  // THE FIRST LINE IS TICKED DONE, the third state, by its key.
  await app.page.locator('.px-row', { hasText: 'Load the kiln' }).locator('button.px-chip-btn').focus()
  await app.page.keyboard.press('3')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Save mine')
  await expect
    .poll(async () => {
      const items = ((await stored(module))['data']['parts'] as Array<{ items: Array<{ id: string; text: string; state: string }> }>)[0]?.items ?? []
      return items.map((item) => `${item.id} ${item.state} ${item.text}`)
    }, { timeout: DRAWN_WITHIN_MS })
    .toEqual(['i-1 done Load the kiln', 'i-2 todo Fire the kiln twice'])
}, 120_000)

it.runIf(shots)('8. photographs the line, with their version shown, and the question, at four widths in one look', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_ANOTHER_WRITER_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_ANOTHER_WRITER_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  const report = await aReport('The kiln report')
  await typedThenTheirs(app.page, report)
  // THE PAGE IS DRAWN IN THE LOOK THIS RUN NAMES, so a dark picture is never a light page by another name.
  expect(await app.page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(look)
  await press(app.page, LINE, 'See their version')
  await drawn(app.page, LINE, THEIRS)
  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await app.page.waitForTimeout(300)
    await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(THE_PAGE_TOP).first(), `another-writer-line-${look}-${String(width)}`)
    await app.page.screenshot({ path: join(shots, `another-writer-line-${look}-${String(width)}.png`) })
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.locator(SAVE).click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'See their version')
  await drawn(app.page, QUESTION, THEIRS)
  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await app.page.waitForTimeout(300)
    await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(`${QUESTION} h2`), `another-writer-question-${look}-${String(width)}`)
    await labelAtTheQuestionsTop(app.page, `another-writer-question-${look}-${String(width)}`)
    await app.page.screenshot({ path: join(shots, `another-writer-question-${look}-${String(width)}.png`) })
  }
  await press(app.page, QUESTION, 'Back to the form')
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}, 300_000)

it("9. a kept line deleted after the terminal kept another keeps the new one: without building the list again on the person's own newer version, the delete writes back the lines the page drew and loses it", async () => {
  const made = await send('POST', '/api/records', { kind: 'note', title: 'Lines typed in the kiln room', data: { body: 'echo load the kiln\necho fire the kiln', kept_from_terminal: 'a-made-up-terminal' } }, PERSON)
  const note = made['record'].id as string
  await open(app.page, `/r/${note}/edit`, '.kl-line')
  // THE TERMINAL KEEPS ONE MORE LINE, written as the person, as src/server/lib/terminal-keeping.ts writes every kept line.
  await send('PATCH', `/api/records/${note}`, { dataPatch: { body: 'echo load the kiln\necho fire the kiln\necho cool the kiln' } }, PERSON)
  await app.page.locator('.kl-line', { hasText: 'echo load the kiln' }).getByRole('button', { name: 'Delete this line', exact: true }).click()
  await expect.poll(async () => (await stored(note))['data']['body'], { timeout: DRAWN_WITHIN_MS }).toBe('echo fire the kiln\necho cool the kiln')
  expect(await app.page.locator(QUESTION).count()).toBe(0)
}, 120_000)

it('10. the close form asks when another writer changed the problem after the person opened it: a form that writes on the version the page draws now asks nothing, since the page has redrawn their change', async () => {
  const made = await send('POST', '/api/records', { kind: 'problem', title: 'The kiln log stops at midnight', data: { symptom: 'The kiln log stops at midnight and starts again at six.', why_it_hurts: 'Six hours of firing go unrecorded every night.', state: 'open', whose_move: 'person' } }, AN_AGENT)
  const problem = made['record'].id as string
  await open(app.page, `/r/${problem}`, '.rp-standing .pp-close button')
  await app.page.locator('.rp-standing .pp-close').getByRole('button', { name: 'Close this problem', exact: true }).click()
  await app.page.locator('.pp-close-choice[data-choice="fixed"] input').check()
  await send('PATCH', `/api/records/${problem}`, { title: 'The kiln log stops at midnight, retitled by the kiln writer' }, AN_AGENT)
  await drawn(app.page, 'h1.rp-title', 'retitled by the kiln writer')
  await press(app.page, '.pp-close-form', 'Close it')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  expect(await app.page.locator(QUESTION).textContent()).toContain(`${WRITER_NAME} changed it`)
  await press(app.page, QUESTION, 'Save mine')
  await expect.poll(async () => (await stored(problem))['data']['state'], { timeout: DRAWN_WITHIN_MS }).toBe('fixed')
  expect((await stored(problem))['title']).toBe('The kiln log stops at midnight, retitled by the kiln writer')
}, 120_000)

it('11. the pin asks first, and Back to the form stores nothing: a pin written with no version is stored over the change the person has not seen', async () => {
  const made = await send('POST', '/api/records', { kind: 'proposal', title: 'Should the kiln be fired twice?', data: { question: 'Should the kiln be fired twice?', options: ['a — Fire it twice.', 'b — Fire it once.'], who_settles_it: 'the owner' } }, AN_AGENT)
  const fork = made['record'].id as string
  await open(app.page, `/r/${fork}/edit`, '.px-pin button')
  await send('PATCH', `/api/records/${fork}`, { title: 'Should the kiln be fired twice this week?' }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await app.page.locator('.px-pin button').first().click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Back to the form')
  await expect.poll(() => app.page.locator(QUESTION).count()).toBe(0)
  expect((await stored(fork))['data']['pinned']).toBeUndefined()
  expect(await byThePerson(fork), 'versions the person wrote').toBe(0)
}, 120_000)

it("12. words added to a decision ask first, and Save mine keeps the words the person added in another tab: without building the list again on the version stored now, Save mine writes back the list the page drew", async () => {
  const words = await send('POST', '/api/records', { kind: 'note', title: 'What the person said about the kiln', data: { body: 'Fire it twice.' } }, PERSON)
  const made = await send('POST', '/api/records', {
    kind: 'decision',
    title: 'Fire the kiln twice',
    data: { ...governsTheWholeProject(), replaces: [], option_taken: 'a — Fire it twice.', because: 'The glaze needs a second firing.', decided_by: 'the owner', authority: 'the owner said so', authority_reference: words['record'].id },
  }, PERSON)
  const decision = made['record'].id as string
  await open(app.page, `/r/${decision}/edit`, '.px-gov-m83')
  await send('PATCH', `/api/records/${decision}`, { dataPatch: { words_since: [{ at: '2026-11-08 09:00', words: 'Said in another tab.' }] } }, PERSON)
  // WHEN TO REVISIT IT is a note around the decision, which any agent may change.
  await send('PATCH', `/api/records/${decision}`, { dataPatch: { revisit_when: 'the kiln is replaced' } }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await press(app.page, '.px-gov-m83', 'Add words')
  await app.page.locator('.px-gov-m83-form textarea').fill('Said on this page.')
  await press(app.page, '.px-gov-m83-form', 'Add words')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Save mine')
  await expect
    .poll(async () => ((await stored(decision))['data']['words_since'] as Array<{ words: string }> | undefined)?.map((one) => one.words), { timeout: DRAWN_WITHIN_MS })
    .toEqual(['Said in another tab.', 'Said on this page.'])
  expect((await stored(decision))['data']['revisit_when']).toBe('the kiln is replaced')
}, 120_000)

it("13. Save mine after the person changed only the title keeps the other writer's summary: a Save mine that sends both boxes writes the summary the form opened over theirs", async () => {
  const theirSummary = 'The kiln writer summary'
  const report = await aReport('The kiln report')
  await open(app.page, `/r/${report}/edit`, TITLE_BOX)
  await app.page.locator(TITLE_BOX).first().fill(TYPED)
  await send('PATCH', `/api/records/${report}`, { summary: theirSummary }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await app.page.locator(SAVE).click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Save mine')
  await expect.poll(async () => (await stored(report))['title'], { timeout: DRAWN_WITHIN_MS }).toBe(TYPED)
  expect((await stored(report))['summary']).toBe(theirSummary)
  // THE SUMMARY BOX SHOWS WHAT IS STORED NOW, which is their summary.
  await expect.poll(() => app.page.locator(TITLE_BOX).nth(1).inputValue()).toBe(theirSummary)
}, 120_000)

it("14. the close form on the problem's own page asks when another writer changed the problem after the person opened it: drawn outside WritingThisRecord, the close is stored over their change and nothing is asked", async () => {
  const made = await send('POST', '/api/records', { kind: 'problem', title: 'The kiln door sticks', data: { symptom: 'The kiln door sticks when the kiln is hot.', why_it_hurts: 'A hot kiln cannot be checked.', state: 'open', whose_move: 'person' } }, AN_AGENT)
  const problem = made['record'].id as string
  await open(app.page, `/problem/${problem}`, '.pp-standing .pp-close button')
  await app.page.locator('.pp-standing .pp-close').getByRole('button', { name: 'Close this problem', exact: true }).click()
  await app.page.locator('.pp-close-choice[data-choice="fixed"] input').check()
  await send('PATCH', `/api/records/${problem}`, { title: 'The kiln door sticks, retitled by the kiln writer' }, AN_AGENT)
  await drawn(app.page, 'h1.pp-title', 'retitled by the kiln writer')
  await press(app.page, '.pp-close-form', 'Close it')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  expect(await app.page.locator(QUESTION).textContent()).toContain(`${WRITER_NAME} changed it`)
  expect((await stored(problem))['data']['state'], 'the state before the person answers').toBe('open')
  await press(app.page, QUESTION, 'Save mine')
  await expect.poll(async () => (await stored(problem))['data']['state'], { timeout: DRAWN_WITHIN_MS }).toBe('fixed')
  expect((await stored(problem))['title']).toBe('The kiln door sticks, retitled by the kiln writer')
}, 120_000)

it.runIf(shots)("15. photographs the kept lines, the close form on both of a problem's pages and the question it asks, and the questions the pin and a decision's words ask, at four widths in one look", async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_ANOTHER_WRITER_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_ANOTHER_WRITER_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  /** Photograph what the page draws now at the four widths, with the label above `above`, or inside the question. */
  async function fourWidths(name: string, above: string): Promise<void> {
    for (const width of [1440, 990, 660, 390]) {
      await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await app.page.waitForTimeout(300)
      const called = `${name}-${look}-${String(width)}`
      await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(above), called)
      if (above.startsWith(QUESTION)) await labelAtTheQuestionsTop(app.page, called)
      await app.page.screenshot({ path: join(shots!, `${called}.png`) })
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }

  // THE KEPT LINES, on the edit address of a note a terminal kept.
  const kept = await send('POST', '/api/records', { kind: 'note', title: 'Lines typed in the kiln room', data: { body: 'echo load the kiln\necho fire the kiln\necho cool the kiln', kept_from_terminal: 'a-made-up-terminal' } }, PERSON)
  await open(app.page, `/r/${kept['record'].id as string}/edit`, '.kl-line')
  // THE PAGE IS DRAWN IN THE LOOK THIS RUN NAMES, so a dark picture is never a light page by another name.
  expect(await app.page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(look)
  await fourWidths('kept-lines', '.kl')

  // THE CLOSE FORM, opened with a closing word chosen, on the record page and on the problem's own page.
  const made = await send('POST', '/api/records', { kind: 'problem', title: 'The kiln door sticks', data: { symptom: 'The kiln door sticks when the kiln is hot.', why_it_hurts: 'A hot kiln cannot be checked.', state: 'open', whose_move: 'person' } }, AN_AGENT)
  const problem = made['record'].id as string
  for (const [page, standing] of [['r', '.rp-standing'], ['problem', '.pp-standing']] as const) {
    await open(app.page, `/${page}/${problem}`, `${standing} .pp-close button`)
    await app.page.locator(`${standing} .pp-close`).getByRole('button', { name: 'Close this problem', exact: true }).click()
    await app.page.locator('.pp-close-choice[data-choice="fixed"] input').check()
    await fourWidths(`close-form-${page === 'r' ? 'record-page' : 'problem-page'}`, standing)
  }
  // THE QUESTION THE CLOSE FORM ASKS on the problem's own page, after the kiln writer retitled the problem.
  await send('PATCH', `/api/records/${problem}`, { title: 'The kiln door sticks, retitled by the kiln writer' }, AN_AGENT)
  await drawn(app.page, 'h1.pp-title', 'retitled by the kiln writer')
  await press(app.page, '.pp-close-form', 'Close it')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await fourWidths('close-question', `${QUESTION} h2`)
  await press(app.page, QUESTION, 'Back to the form')

  // THE QUESTION THE PIN ASKS, after the kiln writer retitled the question.
  const proposal = await send('POST', '/api/records', { kind: 'proposal', title: 'Should the kiln be fired twice?', data: { question: 'Should the kiln be fired twice?', options: ['a — Fire it twice.', 'b — Fire it once.'], who_settles_it: 'the owner' } }, AN_AGENT)
  const fork = proposal['record'].id as string
  await open(app.page, `/r/${fork}/edit`, '.px-pin button')
  await send('PATCH', `/api/records/${fork}`, { title: 'Should the kiln be fired twice this week?' }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await app.page.locator('.px-pin button').first().click()
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await fourWidths('pin-question', `${QUESTION} h2`)
  await press(app.page, QUESTION, 'Back to the form')

  // THE QUESTION A DECISION'S WORDS ASK, after the kiln writer said when to revisit it.
  const words = await send('POST', '/api/records', { kind: 'note', title: 'What the person said about the kiln', data: { body: 'Fire it twice.' } }, PERSON)
  const decided = await send('POST', '/api/records', {
    kind: 'decision',
    title: 'Fire the kiln twice',
    data: { ...governsTheWholeProject(), replaces: [], option_taken: 'a — Fire it twice.', because: 'The glaze needs a second firing.', decided_by: 'the owner', authority: 'the owner said so', authority_reference: words['record'].id },
  }, PERSON)
  const decision = decided['record'].id as string
  await open(app.page, `/r/${decision}/edit`, '.px-gov-m83')
  await send('PATCH', `/api/records/${decision}`, { dataPatch: { revisit_when: 'the kiln is replaced' } }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await press(app.page, '.px-gov-m83', 'Add words')
  await app.page.locator('.px-gov-m83-form textarea').fill('Said on this page.')
  await press(app.page, '.px-gov-m83-form', 'Add words')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await fourWidths('words-question', `${QUESTION} h2`)
  await press(app.page, QUESTION, 'Back to the form')
}, 300_000)

it("16. the goal's confirm press asks first, and Back to the form stores nothing: a press that writes with no version confirms the goal over the change the person has not seen", async () => {
  const made = await send('POST', '/api/records', { kind: 'goal', title: 'Every kiln shelf is checked before a firing', data: { horizon: 'medium', what: 'Every kiln shelf is checked before a firing, and anybody can check it.', owner: THE_PERSON, state: 'open' } }, AN_AGENT)
  const goal = made['record'].id as string
  const theirs = 'Every kiln shelf is checked before a firing, and the kiln writer checks the top one.'
  await open(app.page, `/r/${goal}/edit`, '.goal-mark button')
  await send('PATCH', `/api/records/${goal}`, { dataPatch: { what: theirs } }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await press(app.page, '.goal-mark', 'Confirm this goal')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Back to the form')
  await expect.poll(() => app.page.locator(QUESTION).count()).toBe(0)
  expect((await stored(goal))['data']['confirmed_by'], 'the goal after Back to the form').toBeUndefined()
  expect(await byThePerson(goal), 'versions the person wrote').toBe(0)
  await press(app.page, '.goal-mark', 'Confirm this goal')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  await press(app.page, QUESTION, 'Save mine')
  await expect.poll(async () => (await stored(goal))['data']['confirmed_by']?.['by'], { timeout: DRAWN_WITHIN_MS }).toBe(THE_PERSON)
  expect((await stored(goal))['data']['what']).toBe(theirs)
}, 120_000)

it("17. a comment's new words ask when another writer put a reading beside them after the person opened the box: words written with no version are stored at once, beside a reading the person has not seen", async () => {
  const report = await aReport('The kiln report the person commented on')
  const first = 'The kiln report misses the second firing.'
  const typed = 'The kiln report misses the second firing on Tuesday.'
  const reading = 'The kiln writer read this as: add the second firing to the report.'
  const made = await send('POST', '/api/records', { kind: 'annotation', title: 'On the kiln report', data: { body: first, context: { target: { kind: 'record', recordId: report, workspaceId: 'default' } } } }, PERSON)
  const comment = made['record'].id as string
  await open(app.page, `/r/${comment}/edit`, '.rd-change button')
  await press(app.page, '.rd-change', 'Change what you wrote')
  await app.page.locator('.rd-comment-write textarea').fill(typed)
  await send('PATCH', `/api/records/${comment}`, { dataPatch: { interpretation: reading } }, AN_AGENT)
  await drawn(app.page, LINE, WRITER_NAME)
  await press(app.page, '.rd-comment-write', 'Save these words')
  await app.page.waitForSelector(QUESTION, { timeout: DRAWN_WITHIN_MS })
  expect(await app.page.locator(QUESTION).textContent()).toContain(`${WRITER_NAME} changed it`)
  expect((await stored(comment))['data']['body'], 'the words before the person answers').toBe(first)
  await press(app.page, QUESTION, 'Save mine')
  await expect.poll(async () => (await stored(comment))['data']['body'], { timeout: DRAWN_WITHIN_MS }).toBe(typed)
  expect((await stored(comment))['data']['interpretation']).toBe(reading)
}, 120_000)
