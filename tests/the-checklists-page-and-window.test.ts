// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS PAGE AND THE CHECKLISTS WINDOW, AS CHOSEN. Wave 13n round 52, from a decision,
 * on design nukmat0TERRF. In a real browser, on this test's own office:
 *
 * 1. THE PAGE HAS NO SECTION OF THE READER'S OWN. It is the table grouped by project or owner, and nothing else:
 *    every heading on it is a group's, and the reader's own checklist is one row in it, once.
 *    MUTATION: `TheList` in src/web/pages/ChecklistsPage.tsx drew a "Mine" section above the table, holding the
 *    reader's own checklists. This case went red.
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
 *
 * CONTROL: 5 passed. Each mutation alone: 1 failed, 4 passed. RESTORE: 5 passed. The logs are named in the round's
 * report.
 *
 * Wave 13n round 53: the window opens on the reader's own checklists, and one press opens the full
 * view where the reader chooses whose.
 *
 * 6. THE DEFAULT VIEW HAS NO CHOICE OF WHOSE. The open window is headed "My checklists"; it has no select and no
 *    "Whose" label, and nobody else's checklist is drawn in it.
 *    MUTATION: the "Whose" label in ChecklistsWindow.tsx was drawn in both views (`{full ? (` read `{true ? (`).
 *    Cases 6 and 8 went red; 8 also looks for the choice after the way back.
 * 7. THE PRESS OPENS THE FULL VIEW. "All checklists" in the window's top line, whose hover text is its name, opens a
 *    view with the "Whose" choice, everyone's checklists each naming its owner, the read-only note and no "Mark
 *    done"; choosing an owner shows only that owner's checklists.
 *    MUTATION: the press's onClick read `setFull(false)`. Cases 7 and 8 went red; 8 opens the full view first.
 *    MUTATION: the owner line under each of everyone's checklists was not drawn. Case 7 went red, alone.
 * 8. THE WAY BACK RETURNS TO THE READER'S OWN. "My checklists" in the full view's top line brings back the default
 *    view, with the left boxes (a plain one and a special one) and without the choice; a window closed in the full
 *    view opens again on the reader's own.
 *    MUTATION: the back press's onClick read `setFull(true)`. Case 8 went red, alone.
 *
 * CONTROL: 8 passed. MUTATIONS: 2 failed, 2 failed, 1 failed and 1 failed, as above. RESTORE: 8 passed.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every checklist, message and report
 * here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
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
  await page.waitForSelector('.ckw-panel .ckw-group', { timeout: 30_000 })
}

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
  it("1. the page has no section of the reader's own: every heading is a group's, and the reader's checklist is one row", async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/checklists', '.ckb-row')
    const heads = await page.locator('.ckl h2, .ckl h3').evaluateAll((els) => els.map((el) => `${el.className}: ${el.textContent ?? ''}`))
    expect(heads.length).toBeGreaterThan(0)
    expect(heads.filter((one) => !one.startsWith('ckb-head:'))).toEqual([])
    const text = await page.locator('.ckl').innerText()
    expect(text.split('Kiln checklist').length - 1).toBe(1)
    expect(await page.locator('.ckb-row', { hasText: "Quill's shelf list" }).count()).toBe(1)
  }, 90_000)

  it('2. done items are folded in the window, and open with one press', async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const group = page.locator('.ckw-group', { hasText: 'Kiln checklist' })
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
    await page.waitForSelector('.ckw-panel .ckw-group')
    expect(await page.locator('.ckw-group', { hasText: 'Kiln checklist' }).getByText('Fire the test tiles').count()).toBe(0)
    await page.keyboard.press('Escape')
  }, 90_000)

  it('3. an item never cuts its text, on the page and in the window, at 1440 and at 390', async () => {
    const page = app.page
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await open(page, `/checklists/${own}`, '.ck1-items .ckp-words')
      expect(await cutWords(page, '.ck1'), `the page at ${String(width)}`).toEqual([])
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
    const item = page.locator('.ckw-group .ckp-item', { hasText: 'Write how the kiln is loaded' })
    const box = item.getByRole('button', { name: 'Mark done with evidence or words: Write how the kiln is loaded', exact: true })
    expect(await box.count(), "the special item's left box").toBe(1)
    expect(await item.locator('.ckp-mark[data-special="yes"]').count(), 'the special icon in that box').toBe(1)
    const plain = page.locator('.ckw-group .ckp-item', { hasText: 'Fire the test tiles' })
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
    const item = page.locator('.ckw-group .ckp-item', { hasText: 'Write how the kiln is loaded' })
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
    await open(page, `/checklists/${own}`, '.ck1-items .ckp-words')
    expect(await page.locator('.ck1').getByRole('link', { name: 'From a message', includeHidden: true }).count()).toBe(2)
    expect(await shown('.ck1').count()).toBe(0)
    await page.locator('.ck1 .ckp-summary', { hasText: 'Choose the glaze' }).click()
    await expect.poll(() => shown('.ck1').count()).toBe(1)
    expect(await page.locator('.ck1 .ckp-item', { hasText: 'Choose the glaze' }).getByRole('link', { name: 'From a message' }).isVisible()).toBe(true)
    await page.click('.ckw-press')
    await page.waitForSelector('.ckw-panel .ckp-words')
    expect(await shown('.ckw-panel').count()).toBe(0)
    await page.locator('.ckw-panel .ckp-summary', { hasText: 'Choose the glaze' }).click()
    await expect.poll(() => shown('.ckw-panel').count()).toBe(1)
    await page.keyboard.press('Escape')
  }, 90_000)

  it('6. the window opens on the reader\'s own checklists, with no choice of whose', async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const panel = page.locator('.ckw-panel')
    expect(await panel.locator('.ckw-title').innerText()).toBe('My checklists')
    expect(await panel.locator('select').count()).toBe(0)
    expect(await panel.getByText('Whose', { exact: true }).count()).toBe(0)
    expect(await panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).count()).toBe(0)
    expect(await panel.locator('.ckw-group', { hasText: 'Kiln checklist' }).count()).toBe(1)
    await page.keyboard.press('Escape')
  }, 90_000)

  it('7. "All checklists" in the top line opens the full view, where the reader chooses whose and marks nothing', async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const panel = page.locator('.ckw-panel')
    const press = panel.locator('.ckw-head').getByRole('button', { name: 'All checklists', exact: true })
    expect(await press.getAttribute('title')).toBe('All checklists')
    await press.click()
    // THE CHOICE IS NAMED BY ITS LABEL; the name a browser gives a select in its label also holds the chosen option.
    const whose = panel.getByRole('combobox', { name: /^Whose\b/ })
    await whose.waitFor({ timeout: 10_000 })
    await panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).waitFor({ timeout: 20_000 })
    expect(await panel.locator('.ckw-group', { hasText: 'Kiln checklist' }).count()).toBe(1)
    expect(await panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).locator('.ckw-owner').innerText()).toBe('Quill, agent')
    expect(await panel.locator('.ckw-title').innerText()).toBe('All checklists')
    expect(await panel.getByText('Shown to read. Items are marked done on your own checklists.').count()).toBe(1)
    expect(await panel.getByRole('button', { name: 'Mark done' }).count()).toBe(0)
    await whose.selectOption({ label: 'Quill, agent' })
    await expect.poll(() => panel.locator('.ckw-group').count(), { timeout: 20_000 }).toBe(1)
    expect(await panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).count()).toBe(1)
    expect(await panel.locator('.ckw-title').innerText()).toBe("Quill's checklists")
    await page.keyboard.press('Escape')
  }, 90_000)

  it('8. "My checklists" in the full view goes back to the reader\'s own, and the window opens there again after closing', async () => {
    const page = app.page
    await page.setViewportSize({ width: 1440, height: 900 })
    await openTheWindow(page)
    const panel = page.locator('.ckw-panel')
    await panel.locator('.ckw-head').getByRole('button', { name: 'All checklists', exact: true }).click()
    await panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).waitFor({ timeout: 20_000 })
    const back = panel.locator('.ckw-head').getByRole('button', { name: 'My checklists', exact: true })
    expect(await back.getAttribute('title')).toBe('My checklists')
    await back.click()
    await expect.poll(() => panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).count(), { timeout: 10_000 }).toBe(0)
    expect(await panel.locator('.ckw-title').innerText()).toBe('My checklists')
    expect(await panel.locator('select').count()).toBe(0)
    expect(await panel.locator('.ckw-mark').count(), 'no right-hand "Mark done"').toBe(0)
    expect(await panel.locator('.ckw-group', { hasText: 'Kiln checklist' }).getByRole('button', { name: /^Mark done with evidence or words:/ }).count()).toBeGreaterThan(0)
    await panel.locator('.ckw-head').getByRole('button', { name: 'All checklists', exact: true }).click()
    await panel.locator('.ckw-group', { hasText: "Quill's shelf list" }).waitFor({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await page.click('.ckw-press')
    await page.waitForSelector('.ckw-panel .ckw-group')
    expect(await panel.locator('.ckw-title').innerText()).toBe('My checklists')
    expect(await panel.locator('select').count()).toBe(0)
    await page.keyboard.press('Escape')
  }, 90_000)
})
