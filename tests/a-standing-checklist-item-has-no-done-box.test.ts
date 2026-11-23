// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STANDING CHECKLIST ITEM HAS NO DONE BOX, IS NEVER MARKED DONE AND IS NEVER COUNTED AS OPEN WORK. Wave 13j round
 * loop-5, item 0 part a. A decision, in a message the secretary sent on, says a checklist
 * item can be set to have no done box. It is a standing entry (such as an
 * experiment manual opened every session), is never marked done, and is never counted as open work.
 *
 * An item says so with `standing: true`, through the item doors. A standing item is "open" until a later message
 * supersedes it: "done" is refused, and so are "in progress" and "waiting on the owner", because those are states of work
 * still to do and a standing item is never work still to do. To mark one done, take `standing` away in the same change.
 *
 * In a real browser, on this test's own office. The browser is the person: `liveApp`'s key window covers a caller on
 * this machine, which is what `thePersonIsProved` in src/server/lib/records.ts reads. Every checklist, agent, run and
 * message here is made up, and nothing is asked in the owner's name of the live office (chapter 8, rule 3).
 *
 * What is proved:
 *   1. The doors take `standing` on a new checklist, a new item and a change; `false` takes it away, so it is stored only
 *      as true.
 *   2. A standing item is refused "done", by the person's press, by an agent with evidence and as a new item; and it is
 *      refused "in progress" and "waiting on the owner". The refused press writes nothing and tells nobody. A done item
 *      cannot be made standing. `standing: false` with "done" in one change marks it done; a standing item may be
 *      superseded.
 *   3. The counts leave it out of the open items and count it as standing; a superseded standing item is counted as
 *      superseded only. The brief an agent reads names its open items without its standing ones.
 *   4. In the checklists window a standing item has no box and no "Mark done", says in words that it is a standing
 *      item, stays among the items shown, and is left out of the count on the press and of the progress.
 *   5. The checklist's card on the page says the same in words, and its progress number leaves it out.
 *   6. On a phone, where the box takes 44 pixels, the window starts the words of a standing item, and of a done item,
 *      where the words beside a box start, and the facts of a standing item where the facts of a boxed item start.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/shared/checklists.ts, the rule on a standing item's state taken out: cases 2 to 5 go red, because the press
 *      then marks the manual done and the later cases read it.
 *   B. src/shared/checklists.ts, `isOpenWork` reads the state alone: cases 3, 4 and 5 go red.
 *   C. src/server/lib/checklists.ts, a new item's `standing` not stored: cases 1 to 5 go red.
 *   D. src/server/lib/checklists.ts, `openItemsOf` counts by the state alone: case 3 goes red.
 *   E. src/web/components/ChecklistsWindow.tsx, the box and "Mark done" drawn whatever `standing` says: case 4 goes red.
 *   F. src/web/components/ChecklistParts.tsx, `Progress` keeps standing items in its total: cases 4 and 5 go red.
 *   G. src/web/components/ChecklistParts.tsx, `ItemFacts` draws no words for a standing item: cases 4 and 5 go red.
 *   H. src/web/components/ChecklistsWindow.tsx, on a phone the mark of a row without a box keeps no room for one: case 6
 *      goes red.
 *   I. src/web/components/ChecklistsWindow.tsx, on a phone the facts of a row without a box keep no room for one: case 6
 *      goes red.
 *
 * Test change (wave 13y round 175): the page and the window draw design E, as decided. Each checklist is a card, and
 * its progress is a number such as "1 / 3", read here from its word key. Case 5 reads the card the address
 * `#/checklists/<id>` marks and no longer asks the counts line ("2 still to do, 1 of them waiting on the owner"),
 * because that line went. Before, the window drew each checklist as a group and its progress in words ("1 of 3 done"),
 * and the page drew the one opened checklist with its counts line.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function ask(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<{ status: number; body: Record<string, any>; error: string }> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  const read = JSON.parse(text) as Record<string, any>
  return { status: reply.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : text.slice(0, 600) }
}

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await ask(method, url, body, headers)
  const aLetterNothingHolds = method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds) expect(reply.status, `${method} ${url}: ${reply.error}`).toBe(409)
  else expect(reply.status, `${method} ${url}: ${reply.error}`).toBeLessThan(300)
  return reply.body
}

const MANUAL = 'My experiment manual'
/** The progress of the robot checklist: one done of three, the standing item left out. */
const ONE_OF_THREE = t('checklists.progressNumber', { done: 1, total: 3 })
let robot = ''
let doors = ''
let larkId = ''
let aRun = ''
let laterMessage = ''

async function theList(id: string): Promise<Record<string, any>> {
  return (await send('GET', `/api/checklists/${id}`, undefined))['checklist'] as Record<string, any>
}

async function theItem(list: string, words: string): Promise<Record<string, any>> {
  return ((await theList(list))['items'] as Record<string, any>[]).find((one) => one['words'] === words)!
}

/** How many lines the office wrote to say the person marked an item done. */
function personsDoneLines(): number {
  const db = new Database(join(app.dir, 'panelx.db'), { readonly: true })
  try {
    return (
      db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'thePersonMarkedAnItemDone'").get() as { n: number }
    ).n
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-standing-checklist-item', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  larkId = (await send('POST', '/api/agents/started', { handle: 'lark', name: 'Lark', role: 'worker' }))['agent'].id as string
  robot = (
    await send('POST', '/api/checklists', { title: 'Robot checklist', items: [{ words: MANUAL, standing: true }, { words: 'Calibrate the camera' }] })
  )['checklist'].id as string
  await send('POST', `/api/checklists/${robot}/items`, { words: 'Tighten the gripper bolts', state: 'waiting on the owner' }, AS('lark'))
  const batteries = (await send('POST', `/api/checklists/${robot}/items`, { words: 'Charge the batteries' }))['item'].id as string
  await send('PATCH', `/api/checklists/${robot}/items/${batteries}`, { state: 'done' })
  doors = (await send('POST', '/api/checklists', { title: 'Door checklist' }))['checklist'].id as string
  await send('POST', '/api/checklists', { title: "Lark's list", items: [{ words: 'Read the kiln manual', standing: true }, { words: 'Write the firing log' }] }, AS('lark'))
  aRun = (await send('POST', '/api/records', { kind: 'session', title: 'Made-up run: Lark tightens the bolts', data: { state: 'running', runtime: 'claude-code' } }))['record'].id as string
  laterMessage = (
    await send('POST', '/api/records', { kind: 'message', title: 'The firing notes are in the manual now', data: { body: 'The firing notes are in the manual now.', to: [{ kind: 'agent', id: larkId }] } })
  )['record'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('a standing checklist item has no done box, is never marked done and is never counted as open work', () => {
  it('1. the doors take standing on a new checklist, a new item and a change, and store it only as true', async () => {
    const manual = await theItem(robot, MANUAL)
    expect(manual['standing']).toBe(true)
    expect(manual['state']).toBe('open')
    expect(Object.hasOwn(await theItem(robot, 'Calibrate the camera'), 'standing'), 'an ordinary item has no standing key').toBe(false)

    const added = await send('POST', `/api/checklists/${doors}/items`, { words: 'The glaze recipes', standing: true }, AS('lark'))
    expect(added['item'].standing).toBe(true)
    const id = added['item'].id as string
    const off = await send('PATCH', `/api/checklists/${doors}/items/${id}`, { standing: false })
    expect(Object.hasOwn(off['item'], 'standing'), 'false takes it away').toBe(false)
    const on = await send('PATCH', `/api/checklists/${doors}/items/${id}`, { standing: true }, AS('lark'))
    expect(on['item'].standing).toBe(true)
    await send('POST', `/api/checklists/${doors}/items`, { words: 'The old firing notes', standing: true })
  }, 60_000)

  it('2. a standing item is never done, nor work in progress or waiting; standing:false with done marks it done', async () => {
    const manual = (await theItem(robot, MANUAL))['id'] as string
    const before = (await theList(robot))['version'] as string
    const linesBefore = personsDoneLines()

    const pressed = await ask('PATCH', `/api/checklists/${robot}/items/${manual}`, { state: 'done' })
    expect(pressed.status, pressed.error).toBe(400)
    expect(pressed.error).toContain('is a standing item and cannot be "done"')
    expect(pressed.error).toContain('"standing": false')
    expect((await theList(robot))['version'], "the person's refused press writes nothing").toBe(before)
    expect(personsDoneLines(), "the person's refused press tells nobody").toBe(linesBefore)

    const withEvidence = await ask('PATCH', `/api/checklists/${robot}/items/${manual}`, { state: 'done', evidence: [{ kind: 'run', record: aRun }] }, AS('lark'))
    expect(withEvidence.status, withEvidence.error).toBe(400)
    expect(withEvidence.error).toContain('is a standing item and cannot be "done"')
    for (const state of ['in progress', 'waiting on the owner']) {
      const refused = await ask('PATCH', `/api/checklists/${robot}/items/${manual}`, { state }, AS('lark'))
      expect(refused.status, refused.error).toBe(400)
      expect(refused.error).toContain(`is a standing item and cannot be "${state}"`)
    }
    const born = await ask('POST', `/api/checklists/${robot}/items`, { words: 'A manual born done', standing: true, state: 'done', evidence: [{ kind: 'run', record: aRun }] }, AS('lark'))
    expect(born.status, born.error).toBe(400)
    const batteries = (await theItem(robot, 'Charge the batteries'))['id'] as string
    const doneMadeStanding = await ask('PATCH', `/api/checklists/${robot}/items/${batteries}`, { standing: true })
    expect(doneMadeStanding.status, doneMadeStanding.error).toBe(400)
    expect((await theList(robot))['version'], 'nothing refused wrote anything').toBe(before)

    const glaze = (await theItem(doors, 'The glaze recipes'))['id'] as string
    const wayOut = await send('PATCH', `/api/checklists/${doors}/items/${glaze}`, { standing: false, state: 'done' })
    expect(wayOut['item'].state).toBe('done')
    expect(Object.hasOwn(wayOut['item'], 'standing')).toBe(false)
    const notes = (await theItem(doors, 'The old firing notes'))['id'] as string
    const replaced = await send('PATCH', `/api/checklists/${doors}/items/${notes}`, { state: 'superseded', supersededBy: laterMessage }, AS('lark'))
    expect(replaced['item'].state).toBe('superseded')
    expect(replaced['item'].standing).toBe(true)
  }, 60_000)

  it('3. the counts leave a standing item out of the open items, and the brief does too', async () => {
    expect((await theList(robot))['counts']).toEqual({ open: 2, waitingOnTheOwner: 1, done: 1, superseded: 0, standing: 1 })
    expect((await theList(doors))['counts']).toEqual({ open: 0, waitingOnTheOwner: 0, done: 1, superseded: 1, standing: 0 })
    const brief = await send('GET', '/api/brief', undefined, AS('lark'))
    expect(brief['head'] as string).toContain('Your checklists have 1 open item.')
  }, 60_000)

  it('4. the window draws no box and no Mark done for a standing item, says what it is, and leaves it out of the counts', async () => {
    const page = app.page
    await openTheWindow(page)
    expect(await page.locator('.ckw-count').innerText(), 'the press counts the open items alone').toBe('2')
    const group = page.locator('.ckw-panel .cks-card', { hasText: 'Robot checklist' })
    expect(await group.locator('.cks-progress').innerText()).toBe(ONE_OF_THREE)
    const manual = group.locator('.ckp-item', { hasText: MANUAL })
    expect(await manual.isVisible(), 'the standing item is among the items shown').toBe(true)
    expect(await manual.getByRole('button', { name: `Mark as done: ${MANUAL}`, exact: true }).count(), 'no box').toBe(0)
    expect(await manual.getByRole('button', { name: 'Mark done', exact: true }).count(), 'no Mark done').toBe(0)
    const camera = group.locator('.ckp-item', { hasText: 'Calibrate the camera' })
    expect(await camera.getByRole('button', { name: 'Mark as done: Calibrate the camera', exact: true }).count(), 'an ordinary item keeps its box').toBe(1)
    await manual.locator('summary').click()
    await expect.poll(() => manual.innerText(), { timeout: 10_000 }).toContain('A standing item: it is never marked done, and it is not counted as open work.')
    expect(await manual.locator('.ckp-state').count(), 'no state is said of an open standing item').toBe(0)
    await page.keyboard.press('Escape')
  }, 120_000)

  it("5. the checklist's card on the page says it is a standing item, and its progress leaves it out", async () => {
    const page = app.page
    await page.goto('about:blank')
    await page.goto(`${app.site}/?lang=en#/checklists/${robot}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const one = page.locator('.cks-card[data-marked="yes"]')
    await one.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
    expect(await one.locator('.cks-progress').innerText()).toBe(ONE_OF_THREE)
    const manual = one.locator('.ckp-item', { hasText: MANUAL })
    await manual.locator('summary').click()
    await expect.poll(() => manual.innerText(), { timeout: 10_000 }).toContain('A standing item: it is never marked done, and it is not counted as open work.')
  }, 120_000)

  it('6. on a phone the window starts the words and facts of a row without a box where they start beside a box', async () => {
    const page = app.page
    await page.setViewportSize({ width: 390, height: 844 })
    try {
      await openTheWindow(page)
      const group = page.locator('.ckw-panel .cks-card', { hasText: 'Robot checklist' })
      await group.locator('.ckp-fold').click()
      const row = (words: string) => group.locator('.ckp-item', { hasText: words })
      const leftOf = async (words: string, what: string): Promise<number> => (await row(words).locator(what).first().boundingBox())!.x
      const besideABox = await leftOf('Calibrate the camera', '.ckp-words')
      for (const [words, which] of [['Tighten the gripper bolts', 'an item waiting on the owner'], [MANUAL, 'the standing item'], ['Charge the batteries', 'a done item']] as const) {
        expect(Math.abs((await leftOf(words, '.ckp-words')) - besideABox), `${which}: its words`).toBeLessThanOrEqual(1)
      }
      await row(MANUAL).locator('summary').click()
      await row('Calibrate the camera').locator('summary').click()
      await row(MANUAL).locator('.ckp-standing').waitFor({ timeout: 10_000 })
      expect(Math.abs((await leftOf(MANUAL, '.ckp-facts')) - (await leftOf('Calibrate the camera', '.ckp-facts'))), 'the standing item: its facts').toBeLessThanOrEqual(1)
      await page.keyboard.press('Escape')
    } finally {
      await page.setViewportSize({ width: 1440, height: 900 })
    }
  }, 120_000)
})

async function openTheWindow(page: Page): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.ckw-press', { timeout: 30_000 })
  await page.click('.ckw-press')
  await page.waitForSelector('.ckw-panel .cks-card', { timeout: 30_000 })
}
