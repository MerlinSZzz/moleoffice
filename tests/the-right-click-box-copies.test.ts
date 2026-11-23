// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RIGHT-CLICK BOX COPIES, AND SAYS WHETHER IT DID.
 *
 * The right-click box has a Copy press. It copies the selected words, or, with nothing selected, the text of the
 * thing that was right-clicked. In a test office of its own, with made-up records, this file proves in Chromium:
 *
 *   1. Words are selected and right-clicked, and Copy is pressed. The clipboard holds exactly those words, and the box
 *      says Copied.
 *   2. Nothing is selected and a paragraph is right-clicked. The clipboard holds that thing's text: the drawn text of
 *      the nearest element that names a thing, which is the element the box is about.
 *   3. The clipboard refuses the write. The box says in one line that nothing was copied, and why. It says Copied
 *      nowhere, and the clipboard still holds what it held.
 *   4. Copy changes nothing else. The box's subject and the words half written in it stay as they were.
 *
 * Every address here is 127.0.0.1. In the sandbox this runs in, the machine's own name is 127.0.0.1 too, so a test
 * that opened ports on that name could not start.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let page: Page
let reportId = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What the clipboard is set to before each press, so a press that writes nothing is told apart from one that does. */
const NOTHING_COPIED_YET = 'nothing has been copied yet'

/** The reason the made-up refusal gives. It is the browser's own words, and the box keeps them. */
const THE_REFUSAL = 'Test: the clipboard is held by another window'

const FIRST = '[data-text-field="data.blocks[#b-1].text"]'
const SECOND = '[data-text-field="data.blocks[#b-2].text"]'

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'the-right-click-box-copies', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // THE CLIPBOARD IS ASKED FOR RATHER THAN ASSUMED. A headless Chromium refuses a clipboard write by default.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })
  const body = {
    kind: 'report',
    title: 'What the garden showed',
    data: {
      for: 'Robin Vale',
      date: '2026-11-21',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The tomatoes ripened slowly through a cold September.' },
        { id: 'b-2', type: 'text', text: 'The watering times were never written down.' },
      ],
    },
  }
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, body))
  reportId = (JSON.parse(text) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the report fresh, with no box left over, and set the clipboard to the marker. */
async function openTheReport(): Promise<void> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(SECOND).waitFor({ timeout: 30_000 })
  await page.evaluate(async (marker) => navigator.clipboard.writeText(marker), NOTHING_COPIED_YET)
}

/** Wait for the box, its presses drawn. */
async function waitForTheBox(): Promise<void> {
  await page.locator('.px-talk').waitFor({ timeout: 20_000 })
  await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
}

/** Select the characters `from` to `to` of the first paragraph, right-click them, and answer the selected words. */
async function rightClickSelectedWords(from: number, to: number): Promise<string> {
  const at = await page.evaluate(
    ({ sel, from, to }) => {
      const el = document.querySelector<HTMLElement>(sel)
      if (el === null) throw new Error('the paragraph is not drawn')
      el.scrollIntoView({ block: 'center' })
      const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
      const range = document.createRange()
      range.setStart(node, from)
      range.setEnd(node, to)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(range)
      const r = range.getClientRects()[0]
      if (r === undefined) throw new Error('the words have no box')
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), words: s?.toString() ?? '' }
    },
    { sel: FIRST, from, to },
  )
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await waitForTheBox()
  return at.words
}

/**
 * Right-click the second paragraph with nothing selected, and answer the drawn text of the thing under the pointer.
 *
 * THE THING IS THE NEAREST ELEMENT THAT NAMES A THING, the one carrying `data-target`. That is the element the box is
 * about, so its drawn text, read before the box opens, is what Copy has to put on the clipboard.
 */
async function rightClickWithNothingSelected(): Promise<string> {
  const at = await page.evaluate((sel) => {
    window.getSelection()?.removeAllRanges()
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.selectNodeContents(node)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    const x = Math.round(r.left + Math.min(40, r.width / 2))
    const y = Math.round(r.top + r.height / 2)
    const thing = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-target]') ?? null
    if (thing === null) throw new Error('nothing under the pointer names a thing')
    return { x, y, text: thing.innerText.trim() }
  }, SECOND)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await waitForTheBox()
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? ''), 'the right-click selected nothing').toBe('')
  return at.text
}

/** The Copy press in the open box. */
const theCopyPress = () => page.locator('.px-talk').getByRole('button', { name: 'Copy', exact: true })

/** What the clipboard holds now, read through the page. */
async function theClipboard(): Promise<string> {
  return await page.evaluate(async () => navigator.clipboard.readText())
}

/** The box's subject as the reader sees it: the kind word and the words of its quote bar. */
async function theSubject(): Promise<string> {
  return (await page.locator('.px-talk .px-talk-head .px-talk-quote').innerText()).replace(/\s+/g, ' ').trim()
}

describe('the right-click box copies', () => {
  it('copies exactly the selected words, and says Copied', async () => {
    await openTheReport()
    const words = await rightClickSelectedWords(4, 27)
    expect(words, 'the selection this case made').toBe('tomatoes ripened slowly')
    await theCopyPress().click()
    await expect.poll(theClipboard, { timeout: 15_000 }).not.toBe(NOTHING_COPIED_YET)
    expect(await theClipboard()).toBe(words)
    await page.locator('.px-talk').getByText('Copied', { exact: true }).waitFor({ timeout: 15_000 })
    await page.keyboard.press('Escape')
  }, 180_000)

  it('copies the text of the thing right-clicked when nothing is selected', async () => {
    await openTheReport()
    const thingsText = await rightClickWithNothingSelected()
    expect(thingsText, 'the thing under the pointer holds the paragraph').toContain('The watering times were never written down.')
    await theCopyPress().click()
    await expect.poll(theClipboard, { timeout: 15_000 }).not.toBe(NOTHING_COPIED_YET)
    expect(await theClipboard()).toBe(thingsText)
    await page.locator('.px-talk').getByText('Copied', { exact: true }).waitFor({ timeout: 15_000 })
    await page.keyboard.press('Escape')
  }, 180_000)

  it('says that nothing was copied, and why, when the clipboard refuses', async () => {
    await openTheReport()
    await rightClickSelectedWords(4, 27)
    // THE BROWSER'S WRITE IS MADE TO REFUSE, as a browser does when the page is not in front or the permission is
    // withheld. The page is loaded again by the next case, so the refusal does not outlive this one.
    await page.evaluate((reason) => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: () => Promise.reject(new Error(reason)),
      })
    }, THE_REFUSAL)
    await theCopyPress().click()
    const said = page.locator('.px-talk').getByText(/Nothing was copied/)
    await said.waitFor({ timeout: 15_000 })
    expect(await said.count(), 'one line says it').toBe(1)
    expect(await said.innerText(), 'the line gives the reason').toContain(THE_REFUSAL)
    expect(await page.locator('.px-talk').getByText('Copied', { exact: true }).count(), 'nothing is shown as copied').toBe(0)
    expect(await theClipboard(), 'the clipboard holds what it held').toBe(NOTHING_COPIED_YET)
    await page.keyboard.press('Escape')
  }, 180_000)

  it('changes nothing else: the subject and the half written words stay', async () => {
    await openTheReport()
    await rightClickSelectedWords(4, 27)
    const half = 'Check whether the tomatoes were'
    await page.locator('.px-talk textarea').fill(half)
    const subjectBefore = await theSubject()
    expect(subjectBefore, 'the box is about the selected words').toContain('tomatoes ripened slowly')
    await theCopyPress().click()
    await page.locator('.px-talk').getByText('Copied', { exact: true }).waitFor({ timeout: 15_000 })
    expect(await page.locator('.px-talk').count(), 'the box stays open').toBe(1)
    expect(await theSubject(), 'the subject stays').toBe(subjectBefore)
    expect(await page.locator('.px-talk textarea').inputValue(), 'the half written words stay').toBe(half)
    await page.keyboard.press('Escape')
  }, 180_000)
})
