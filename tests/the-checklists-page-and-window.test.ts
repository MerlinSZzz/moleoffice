// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS PAGE AND THE CHECKLISTS WINDOW, AS CHOSEN. Wave 13n round 52, from a decision. In a real browser,
 * on this test's own office.
 *
 * Test change (wave 13y round 175): the page and the window draw design E, as decided. The page is one section per
 * person, and each checklist is a card; the window has a row of names across its top. The table grouped by project or
 * by owner went, and with it case 1, which held that the page had no section of the reader's own. The window's full
 * view of whose checklists went, and with it cases 7 and 8. Case 6 now holds the row of names. The other cases ask what
 * they asked before, of the card that holds the checklist: on the page the card the address marks, in the window the
 * card of the reader's own checklist. Before, they asked it of the one opened checklist on the page and of a group in
 * the window. tests/the-checklists-page-and-window-draw-a-section-per-person.test.ts holds the sections and the adding.
 *
 * Test change (wave 13y round 175, the names behind Back): the window's names are folded behind a Back press at the
 * start of its head, as decided. Back shows the names in the cards' place, and choosing a name shows that person's
 * cards and folds the names again. The names are plain presses, and the press of the person shown is marked with
 * aria-current, not aria-selected. Case 6 presses Back, found by its words, each time before it reads or chooses a
 * name, and reads aria-current where it read aria-selected. It reads the cards before Back, and asks for no select
 * on both screens. Before, the names were tabs drawn above the cards. What the case checks is unchanged.
 *
 * 2. DONE ITEMS ARE FOLDED AND OPEN WITH ONE PRESS. In the window, a checklist's done item is not drawn until its
 *    press is pressed once; then it is, and the press says it hides them. Closing the window folds them again.
 *    MUTATION: in src/web/components/ChecklistsWindow.tsx, `isOpen` read `!unfolded.has(list.id)`, so done items
 *    started open. This case went red.
 * 3. AN ITEM NEVER CUTS ITS TEXT. A long item, with a word too long for any line, is drawn whole on the page and in
 *    the window, at 1440 and at 390: every character is there, nothing overflows its box, and nothing is clamped.
 *    MUTATION: `.ckp-words` in src/web/components/ChecklistParts.tsx was clamped to two lines, as an earlier
 *    picture had it. This case went red.
 * 4. A SPECIAL ITEM'S LEFT BOX OPENS THE PICKER, WHICH DRAWS A BOX FOR THE OWNER'S OWN WORDS, AND WORDS ALONE MARK
 *    THE ITEM DONE. The right-hand "Mark done" is gone, as a message of wave 14a says. The
 *    left box shows a special icon for an item that needs evidence or a passage, and pressing it opens what the
 *    right-hand control opened. The picker's boxes are a search by words, the choices to pick, and the words box;
 *    words typed there are stored whole as the item's response, with the owner's mark, and drawn under the item when
 *    it is opened.
 *    MUTATION: the picker's search box was a plain text box. This case went red.
 * 4b. THE SAME LEFT BOX STILL COMPLETES AN ITEM WITH A PICKED REPORT: the search finds the project's report, picking
 *    it and pressing the picker's "Mark done" stores that report as the item's evidence and draws it under the row.
 *    MUTATION: the picker's Save sent no addEvidence. This case went red.
 * 5. A SOURCE LINE IS NOT DRAWN ON EACH ROW. "From a message" is drawn under an item only when that item is opened,
 *    on the page and in the window.
 *    MUTATION: in ChecklistParts.tsx each item's `<details>` was drawn open. This case went red.
 * 6. THE WINDOW OPENS ON THE READER'S OWN NAME. The reader's checklist is drawn and another person's is not. Back
 *    shows the names, the reader's first and current, and no select. Choosing another name draws that person's
 *    checklists, and that name is the current one; a window closed on another name opens again on the reader's.
 *
 * The mutation lines above were run when each case was written, before round 175.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every checklist, message and report
 * here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const LONG =
  'Run the kiln trial at the slow ramp and write down the temperature every ten minutes for the whole firing, then ' +
  'compare it with the curve printed on the box, including the hour it holds at the top: ' +
  'kilnloggerfilenamewithoutanyspacesinitatall'.repeat(3)

async function send(method: string, url: string, body: object, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, body: JSON.stringify(body) })
  const text = await reply.text()
  const aLetterNothingHolds = method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds) expect(reply.status, `${method} ${url}: ${text}`).toBe(409)
  else expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

let own = ''
let trialReport = ''

beforeAll(async () => {
  app = await liveApp({ name: 'checklists-page-and-window', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'quill', name: 'Quill', role: 'worker' })
  const ask = async (words: string): Promise<string> =>
    (await send('POST', '/api/records', { kind: 'message', title: words, data: { body: words, to: [{ kind: 'agent', id: 'quill' }] } }))['record'].id as string
  const report = async (title: string): Promise<string> =>
    (await send('POST', '/api/records', { kind: 'report', title, data: { for: 'The owner', date: '2026-10-09', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  const tilesAsk = await ask('Make me a checklist for the kiln trials.')
  const glazeAsk = await ask('Ask me which glaze the tiles get.')
  const tiles = await report('Test tiles fired')
  trialReport = await report('Kiln trial report')
  const made = await send('POST', '/api/checklists', {
    title: 'Kiln checklist',
    items: [
      { words: 'Fire the test tiles', state: 'done', evidence: [{ kind: 'report', record: tiles }] },
      { words: LONG, fromMessage: tilesAsk },
      { words: 'Write how the kiln is loaded', style: 'evidence-or-words' },
      { words: 'Choose the glaze for the tiles', state: 'waiting on the owner', fromMessage: glazeAsk },
    ],
  })
  own = made['checklist'].id as string
  await send('POST', '/api/checklists', { title: "Quill's shelf list", items: [{ words: 'Clear the top shelf' }] }, AS('quill'))
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await page.goto('about:blank')
  // A PLAIN GO, NOT `goKeeping`: no review is ever collecting here, so no question about leaving can come.
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(waitFor, { timeout: 30_000 })
}

async function openTheWindow(page: Page): Promise<void> {
  await open(page, '/decisions', '.ckw-press')
  await page.click('.ckw-press')
  await page.waitForSelector('.ckw-panel .cks-card', { timeout: 30_000 })
}

/** The card the address `#/checklists/<id>` marks on the page. */
const MARKED = '.cks-card[data-marked="yes"]'

/** Every item's words on screen that are cut, clamped or overflow their box, with why. */
async function cutWords(page: Page, within: string): Promise<string[]> {
  return page.evaluate(
    ([within, long]) => {
      const box = document.querySelector(within)
      if (box === null) return [`nothing matches ${within}`]
      const edge = box.getBoundingClientRect()
      const out: string[] = []
      const words = [...box.querySelectorAll<HTMLElement>('.ckp-words')]
      if (!words.some((one) => (one.textContent ?? '').includes(long))) out.push('the long item is not drawn whole')
      for (const one of words) {
        const style = getComputedStyle(one)
        const at = one.getBoundingClientRect()
        const name = (one.textContent ?? '').slice(0, 30)
        if (one.scrollWidth > one.clientWidth + 1) out.push(`${name}: wider than its box`)
        if (one.scrollHeight > one.clientHeight + 1) out.push(`${name}: taller than its box`)
        if (style.textOverflow === 'ellipsis') out.push(`${name}: ends in an ellipsis`)
        if (style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '') out.push(`${name}: clamped to ${style.webkitLineClamp} lines`)
        if (at.right > edge.right + 1 || at.left < edge.left - 1) out.push(`${name}: outside ${within}`)
      }
      return out
    },
    [within, LONG] as const,
  )
}

describe('the checklists page and window', () => {
  it('2. done items are folded in the window, and open with one press', async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const group = page.locator('.ckw-panel .cks-card', { hasText: 'Kiln checklist' })
    const fold = group.locator('.ckp-fold')
    await expect.poll(() => fold.getAttribute('aria-expanded')).toBe('false')
    expect(await fold.innerText()).toContain('Show 1 done')
    expect(await group.getByText('Fire the test tiles').count()).toBe(0)
    await fold.click()
    await group.getByText('Fire the test tiles').waitFor({ state: 'visible', timeout: 5_000 })
    expect(await fold.getAttribute('aria-expanded')).toBe('true')
    expect(await fold.innerText()).toContain('Hide the done items')
    await page.keyboard.press('Escape')
    await page.click('.ckw-press')
    await page.waitForSelector('.ckw-panel .cks-card')
    expect(await page.locator('.ckw-panel .cks-card', { hasText: 'Kiln checklist' }).getByText('Fire the test tiles').count()).toBe(0)
    await page.keyboard.press('Escape')
  }, 90_000)

  it('3. an item never cuts its text, on the page and in the window, at 1440 and at 390', async () => {
    const page = app.page
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await open(page, `/checklists/${own}`, `${MARKED} .ckp-words`)
      expect(await cutWords(page, MARKED), `the page at ${String(width)}`).toEqual([])
      await page.click('.ckw-press')
      await page.waitForSelector('.ckw-panel .ckp-words')
      expect(await cutWords(page, '.ckw-panel'), `the window at ${String(width)}`).toEqual([])
      await page.keyboard.press('Escape')
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }, 90_000)

  it("4. a special item's left box opens the picker; words typed there are stored whole with the owner's mark and drawn under the item", async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const item = page.locator('.ckw-panel .ckp-item', { hasText: 'Write how the kiln is loaded' })
    const box = item.getByRole('button', { name: 'Mark done with evidence or words: Write how the kiln is loaded', exact: true })
    expect(await box.count(), "the special item's left box").toBe(1)
    expect(await item.locator('.ckp-mark[data-special="yes"]').count(), 'the special icon in that box').toBe(1)
    const plain = page.locator('.ckw-panel .ckp-item', { hasText: 'Fire the test tiles' })
    expect(await plain.locator('.ckp-mark[data-special="yes"]').count(), 'a plain item keeps the plain box').toBe(0)
    await box.click({ timeout: 10_000 })
    const picker = item.locator('.ckw-picker')
    await picker.locator('.ckw-choice').first().waitFor({ timeout: 20_000 })
    expect(await picker.locator('.ckw-kind').allInnerTexts()).toEqual(['Report', 'Run', 'Landed commit', 'Manual section'])
    const boxes = await picker.locator('input, textarea, [contenteditable="true"]').evaluateAll((els) =>
      els.map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        said: `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`,
      })),
    )
    const others = boxes.filter((one) => !(one.tag === 'input' && (one.type === 'search' || one.type === 'radio')))
    expect(others.length, 'one box besides the search and the choices').toBe(1)
    expect(others[0]!.tag, "the owner's words box").toBe('textarea')
    expect(others[0]!.said).toContain('Your own words (optional)')
    expect(boxes.filter((one) => /\bid\b|hash|paste/i.test(one.said))).toEqual([])
    // THE EXISTING PICKER IS STILL REACHED: its search finds the project's report from the special box.
    await picker.locator('input[type="search"]').fill('trial', { timeout: 10_000 })
    await expect.poll(() => picker.locator('.ckw-choice').allInnerTexts(), { timeout: 10_000 }).toEqual([expect.stringContaining('Kiln trial report')])
    await picker.locator('input[type="search"]').fill('', { timeout: 10_000 })
    const words = 'The tiles came out blue.\nSecond line: the glaze is 3.'
    await picker.locator('textarea').fill(words, { timeout: 10_000 })
    await picker.getByRole('button', { name: 'Mark done' }).click({ timeout: 10_000 })
    const read = async (): Promise<Record<string, any>> => {
      const reply = await (await fetch(`${app.api}/api/checklists/${own}`, { headers: PERSON })).json()
      return (reply.checklist.items as Record<string, any>[]).find((one) => one.words === 'Write how the kiln is loaded')!
    }
    await expect.poll(async () => (await read())['state'], { timeout: 15_000 }).toBe('done')
    const stored = await read()
    expect(stored['response'], 'the words are stored exactly as typed').toBe(words)
    expect(stored['doneByThePerson']?.by?.kind, "the owner's own mark").toBe('person')
    expect(stored['evidence'], 'no evidence was needed or stored').toBeUndefined()
    await item.locator('summary').click()
    await expect.poll(() => item.locator('.ckp-response').innerText(), { timeout: 10_000 }).toContain('Written response:')
    expect(await item.locator('.ckp-response').innerText(), 'the words are drawn under the item, whole').toContain(words)
    await page.keyboard.press('Escape')
    await send('PATCH', `/api/checklists/${own}/items/i-3`, { state: 'open', evidence: [] })
  }, 90_000)

  it("4b. the special left box still completes an item with a picked report, stored and drawn as its evidence", async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const item = page.locator('.ckw-panel .ckp-item', { hasText: 'Write how the kiln is loaded' })
    await item
      .getByRole('button', { name: 'Mark done with evidence or words: Write how the kiln is loaded', exact: true })
      .click({ timeout: 10_000 })
    const picker = item.locator('.ckw-picker')
    await picker.locator('.ckw-choice').first().waitFor({ timeout: 20_000 })
    await picker.locator('input[type="search"]').fill('trial', { timeout: 10_000 })
    await expect.poll(() => picker.locator('.ckw-choice').allInnerTexts(), { timeout: 10_000 }).toEqual([expect.stringContaining('Kiln trial report')])
    await picker.locator('.ckw-choice', { hasText: 'Kiln trial report' }).click({ timeout: 10_000 })
    expect(await picker.locator('.ckw-choice', { hasText: 'Kiln trial report' }).locator('input').isChecked()).toBe(true)
    await picker.getByRole('button', { name: 'Mark done' }).click({ timeout: 10_000 })
    await item.locator('.ckw-done-with').waitFor({ timeout: 20_000 })
    const read = await (await fetch(`${app.api}/api/checklists/${own}`, { headers: PERSON })).json()
    const stored = (read.checklist.items as Record<string, any>[]).find((one) => one.words === 'Write how the kiln is loaded')!
    expect(stored.state).toBe('done')
    expect(stored.evidence).toEqual([{ kind: 'report', record: trialReport }])
    expect(stored.response, 'no words were written').toBeUndefined()
    expect(await item.locator('.ckw-done-with').innerText(), 'the evidence is drawn whole').toContain('Kiln trial report')
    await page.keyboard.press('Escape')
    await send('PATCH', `/api/checklists/${own}/items/i-3`, { state: 'open', evidence: [] })
  }, 90_000)

  it('5. "From a message" is drawn under an item only when it is opened, on the page and in the window', async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    const shown = (within: string) => page.locator(within).getByRole('link', { name: 'From a message' }).filter({ visible: true })
    await open(page, `/checklists/${own}`, `${MARKED} .ckp-words`)
    expect(await page.locator(MARKED).getByRole('link', { name: 'From a message', includeHidden: true }).count()).toBe(2)
    expect(await shown(MARKED).count()).toBe(0)
    await page.locator(`${MARKED} .ckp-summary`, { hasText: 'Choose the glaze' }).click()
    await expect.poll(() => shown(MARKED).count()).toBe(1)
    expect(await page.locator(`${MARKED} .ckp-item`, { hasText: 'Choose the glaze' }).getByRole('link', { name: 'From a message' }).isVisible()).toBe(true)
    await page.click('.ckw-press')
    await page.waitForSelector('.ckw-panel .ckp-words')
    expect(await shown('.ckw-panel').count()).toBe(0)
    await page.locator('.ckw-panel .ckp-summary', { hasText: 'Choose the glaze' }).click()
    await expect.poll(() => shown('.ckw-panel').count()).toBe(1)
    await page.keyboard.press('Escape')
  }, 90_000)

  it("6. the window opens on the reader's own name, first among its names behind Back, and another name draws that person's checklists", async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const panel = page.locator('.ckw-panel')
    const back = panel.getByRole('button', { name: t('checklists.window.back'), exact: true })
    const names = panel.locator('.ckw-names .ckw-name')
    expect(await panel.locator('select').count()).toBe(0)
    expect(await panel.locator('.cks-card', { hasText: "Quill's shelf list" }).count()).toBe(0)
    expect(await panel.locator('.cks-card', { hasText: 'Kiln checklist' }).count()).toBe(1)
    await back.click()
    await expect.poll(() => names.count(), { message: 'the reader and Quill', timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    expect(await names.first().getAttribute('aria-current'), "the reader's name is first and current").toBe('true')
    expect(await panel.locator('select').count()).toBe(0)
    const theirs = names.filter({ hasText: 'Quill' })
    await theirs.click()
    await panel.locator('.cks-card', { hasText: "Quill's shelf list" }).waitFor({ timeout: 20_000 })
    expect(await panel.locator('.cks-card', { hasText: 'Kiln checklist' }).count()).toBe(0)
    await back.click()
    await theirs.waitFor({ timeout: 10_000 })
    expect(await theirs.getAttribute('aria-current')).toBe('true')
    await page.keyboard.press('Escape')
    await page.click('.ckw-press')
    await panel.locator('.cks-card', { hasText: 'Kiln checklist' }).waitFor({ timeout: 20_000 })
    expect(await panel.locator('.cks-card', { hasText: "Quill's shelf list" }).count()).toBe(0)
    await back.click()
    await names.first().waitFor({ timeout: 10_000 })
    expect(await names.first().getAttribute('aria-current'), 'closing goes back to the reader').toBe('true')
    await page.keyboard.press('Escape')
  }, 90_000)
})
