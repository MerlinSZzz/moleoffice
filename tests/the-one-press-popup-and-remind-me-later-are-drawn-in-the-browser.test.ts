// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE-PRESS POPUP AND REMIND ME LATER, DRAWN IN A BROWSER ON A THROWAWAY OFFICE. Wave 13n round 45: the owner's
 * decisions on a request for one press and on Remind me later.
 *
 * The office is this test's own (liveApp), filled through its real doors:
 *   1. An agent files a request for one press. Home's Needs you lists it with Agree and Refuse, and the popup shows
 *      the same request on Home and on another page. The person presses Agree in the popup; the popup says what was
 *      done, the setting is changed, and the request leaves Needs you.
 *   2. An agent sends the person a message with an offer to take them to a page. The chat draws Take me there and
 *      Remind me later; the person chooses "In 30 minutes" and the chat says when it comes back. The time is then
 *      moved into the past in this office's own database, and the office's timer brings the message back as a line
 *      from Mole Office that carries the same offer. Home's Needs you lists it, the lead card and the chat both say the
 *      offer is the guide's, and the chat draws the line under the guide's message.
 *   3. The same press in a browser whose clock is in another time zone than the office's, and on another date. The
 *      chat names the day by the office's date, because the sentence says it is the office's clock (round 45c).
 * No page scrolls sideways at any width it is drawn at.
 *
 * MUTATIONS, each run red and then restored (round 45's report says so):
 *   - the lead card's `offersWaitingFor` names the line's writer and not `offerMadeBy`: the lead card says "Mole Office
 *     wants to take you", and part 2 fails;
 *   - the chat's `whoFirstSentIt` names the line's writer: the chat names the guide once, not twice, and part 2 fails.
 *   - the rule that puts a line's offer under it (`data-carries-an-offer` in Chat.tsx's styles) is taken out: the offer
 *     is drawn beside the line, and part 2 fails.
 *   - Chat.tsx's `whenItComesBackInWords` counts the days from the browser's own date and not from the door's
 *     `pressedAt`: the chat names the day the browser is on, and part 3 fails (round 45c's report says so).
 *
 * Every state above is drawn and checked at 1440 and 390 in the light look.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { calendarDaysBetweenDayKeys, localStamp } from '../src/shared/time.ts'
import { theResizeIsDrawn, liveApp, thePersonsKeyHeader, type LiveApp, waitForThePage } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

const WIDTHS = [1440, 390] as const
const THEMES = ['light'] as const
type Theme = 'light' | 'dark'

let app: LiveApp
let page: Page
const pageErrors: string[] = []
let person: Record<string, string>
const keys = new Map<string, string>()

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

const asPerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person })
const as = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

/** Wait for what a page should draw, and when it never comes, say what it drew instead and what it threw. */
async function see(selector: string): Promise<void> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    // THE CHAT PANEL FIRST, when it is open, since it is drawn last on the page and would be cut off.
    const drawn = await page.evaluate(() => ((document.querySelector('.px-chat') ?? document.body) as HTMLElement).innerText.slice(0, 1500).replace(/\s+/g, ' '))
    throw new Error(`${selector} was not drawn. The page threw: ${pageErrors.join(' | ') || 'nothing'}. It drew: ${drawn}`)
  }
}

async function open(where: string, theme: Theme, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=en#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Look again at the page as it is now, in another width and look, without reading it again. */
async function lookAgain(theme: Theme, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await theResizeIsDrawn(page)
}

async function picture(name: string, theme: Theme, width: number): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `${name} at ${String(width)} in ${theme} scrolls sideways`).toBeLessThanOrEqual(0)
}

async function everyLook(name: string, draw: (theme: Theme, width: number) => Promise<void>): Promise<void> {
  for (const width of WIDTHS) for (const theme of THEMES) {
    await draw(theme, width)
    await picture(name, theme, width)
  }
}

/** Open the chat with one contact, by the name its row shows. */
async function chatWith(name: string): Promise<void> {
  await openTheChat(page)
  await see('.px-chat')
  if ((await page.$('.px-chat-back')) !== null) await page.click('.px-chat-back')
  await see('.px-chat-contact')
  await page.locator('.px-chat-contact', { hasText: name }).first().click()
  await see('.px-chat-words')
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-press-drawn', workspace: 'default', viewport: { width: 1440, height: 900 }, remindMeLaterEverySeconds: 1 })
  page = app.page
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  for (const [handle, name] of [['guide-test', 'Test agent Guide'], ['quill-test', 'Test agent Quill']] as const) {
    const reply = await call('POST', '/api/agents/started', asPerson(), { handle, name, role: 'worker', runtime: 'claude-code' })
    keys.set(handle, String(reply['whatToGiveIt']?.key))
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a request for one press, in the browser', () => {
  it('is listed on Home and shown in the popup, and after Agree the popup says what was done', async () => {
    const filed = await call('POST', '/api/one-press', as('quill-test'), {
      act: 'change-a-setting',
      inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 14 },
      because: 'Test: the backups folder has room for more.',
    })
    const id = String(filed['request'].id)

    await everyLook('one-press-1-home', async (theme, width) => {
      await open('/', theme, width)
      await see(`.hm-needs [data-one-press="${id}"]`)
      await see(`.one-press [data-one-press="${id}"]`)
    })
    // THE OFFICE'S OWN SENTENCE, with the comma that closes "the default nobody chose" before "to".
    expect(await page.textContent('.one-press .one-press-shows')).toMatch(/^Change "Backups to keep" from \d+, the default nobody chose, to 14\.$/)
    await everyLook('one-press-2-popup-on-records', async (theme, width) => {
      await open('/records', theme, width)
      await see(`.one-press [data-one-press="${id}"]`)
    })

    await open('/', 'light', 1440)
    await page.locator('.one-press .one-press-presses button', { hasText: 'Agree' }).click()
    await see('.one-press-after')
    // THE VALUE IS READ AGAIN AT THE PRESS, and the outcome says what it was (round 45b).
    expect(await page.textContent('.one-press-after .one-press-shows')).toMatch(/^Done\. "Backups to keep" was \d+, the default nobody chose, and is now 14\.$/)
    await page.locator(`.hm-needs [data-one-press="${id}"]`).waitFor({ state: 'detached', timeout: 30_000 })
    await everyLook('one-press-3-after-the-press', async (theme, width) => {
      await lookAgain(theme, width)
      await see('.one-press-after')
    })
    const kept = await call('GET', '/api/office/what-is-kept', asPerson())
    const backups = (kept['numbers'] as { key: string; inForce: unknown }[]).find((one) => one.key === 'keepBackups')
    expect(backups?.inForce).toBe(14)
    expect(pageErrors).toEqual([])
  }, 590_000)
})

describe('Remind me later, in the browser', () => {
  it('draws both presses, says when the message comes back, and brings it back as a line with the same offer', async () => {
    const note = await call('POST', '/api/records', asPerson(), {
      kind: 'note',
      title: 'Test: the note the guide offers to show',
      data: { date: '2026-10-07', body: 'A test note to be led to.' },
    })
    const sent = await call('POST', '/api/records', as('guide-test'), {
      kind: 'message',
      title: 'Test: come and look at the note',
      data: {
        body: 'Test: come and look at the note when you have a moment.',
        to: [{ kind: 'person', id: THE_PERSON }],
        lead: { target: { kind: 'record', recordId: String(note['record'].id), workspaceId: 'default' } },
      },
    })
    const messageId = String(sent['record'].id)

    await everyLook('remind-1-both-presses', async (theme, width) => {
      await open('/', theme, width)
      await chatWith('Test agent Guide')
      await see('.px-chat-lead-go')
      await see('.px-chat-lead-later')
    })

    await open('/', 'light', 1440)
    await chatWith('Test agent Guide')
    await page.click('.px-chat-lead-later')
    await see('.px-chat-lead-choice')
    // THE 07:00 CHOICE NAMES THE CLOCK IT IS READ ON (round 45b).
    expect(await page.locator('.px-chat-lead-choice').allTextContents()).toContain("At the next 07:00 on the office computer's clock")
    await everyLook('remind-1b-the-three-choices', async (theme, width) => {
      await lookAgain(theme, width)
      await see('.px-chat-lead-choice')
    })
    await page.locator('.px-chat-lead-choice', { hasText: 'In 30 minutes' }).click()
    await see('.px-chat-lead-said')
    expect(await page.textContent('.px-chat-lead-said')).toMatch(/^This message comes back (today|tomorrow) at \d\d:\d\d, by the clock of the computer Mole Office runs on\.$/)
    await everyLook('remind-2-after-the-choice', async (theme, width) => {
      await lookAgain(theme, width)
      await see('.px-chat-lead-said')
    })

    // THE CHAT IS CLOSED FIRST, so the line is not read the moment it comes and Home can be seen listing it.
    await page.click('.px-chat-close')
    await page.locator('.px-chat').waitFor({ state: 'detached', timeout: 30_000 })

    // THE TIME IS MOVED INTO THE PAST IN THIS OFFICE'S OWN DATABASE, so the office's timer brings it back. This office's
    // timer looks every second (`remindMeLaterEverySeconds` above), so the wait is a second or two and not up to a minute.
    const database = new Database(join(app.dir, 'panelx.db'))
    let line: string | null = null
    try {
      const moved = database
        .prepare("UPDATE message_delivery SET remind_at = '2026-01-01 00:00:00' WHERE message_id = ? AND recipient_kind = 'person' AND reminded_at IS NULL")
        .run(messageId)
      expect(moved.changes).toBe(1)
      const theLine = database.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutMessage') = ?")
      for (let tries = 0; tries < 40 && line === null; tries += 1) {
        line = (theLine.get(messageId) as { id: string } | undefined)?.id ?? null
        if (line === null) await page.waitForTimeout(250)
      }
    } finally {
      database.close()
    }
    expect(line, 'the office did not bring the message back within 10 seconds, though its timer looks every second').not.toBeNull()
    const waiting = await call('GET', '/api/waiting', asPerson())
    expect(JSON.stringify(waiting), 'Needs you does not list the line').toContain(String(line))

    await everyLook('remind-3-it-comes-back-on-home', async (theme, width) => {
      await open('/', theme, width)
      if ((await page.$('.px-chat')) !== null) await page.click('.px-chat-close')
      await see(`.hm-needs [data-home-waiting-id="${String(line)}"]`)
      // THE LEAD CARD NAMES THE GUIDE, as the chat does: the offer the line carries is still the guide's.
      const card = page.locator(`.px-lead-offer[data-lead-message="${String(line)}"] .px-lead-words`)
      expect(await card.textContent(), 'the lead card names somebody other than the first sender').toMatch(/^Test agent Guide wants to take you /)
    })

    await everyLook('remind-4-it-comes-back-in-the-chat', async (theme, width) => {
      await open('/', theme, width)
      // A LINE ABOUT A MESSAGE IS DRAWN IN THAT MESSAGE'S CONVERSATION, so it is under the guide's name.
      await chatWith('Test agent Guide')
      // A NOTICE ABOUT A MESSAGE IS DRAWN UNDER THAT MESSAGE, not as a row of its own, so it is found by its words.
      const back = page.locator('.px-chat').getByText('Back, as you asked')
      await back.waitFor({ state: 'visible', timeout: 30_000 })
      await back.scrollIntoViewIfNeeded()
      expect(await page.locator('.px-chat .px-chat-lead-go').count(), 'the line does not carry the offer').toBe(2)
      // THE OFFER IS UNDER THE LINE'S WORDS, not beside them, so the words are not squeezed or cut off at any width.
      const theLine = page.locator('.px-chat .px-chat-system[data-carries-an-offer="yes"]')
      const words = await theLine.locator('.px-chat-system-block').boundingBox()
      const offer = await theLine.locator('.px-chat-lead').boundingBox()
      expect(words !== null && offer !== null && offer.y >= words.y + words.height - 1, 'the offer is beside the line, not under it').toBe(true)
      const offers = await page.locator('.px-chat .px-chat-lead-words').allTextContents()
      expect(offers.filter((words) => words.startsWith('Test agent Guide wants to take you ')), 'the chat names another sender').toHaveLength(2)
    })
    expect(pageErrors).toEqual([])
  }, 590_000)

  it('names the day by the office\'s date when the browser is in another time zone and on another date', async () => {
    // THE OFFICE IS STARTED WITH THIS PROCESS'S ENVIRONMENT, so its zone is this process's and its date is read here.
    const officeDay = (): string => localStamp(new Date()).slice(0, 10)
    const dayIn = (zone: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    // UTC+14 and UTC-11 are 25 hours apart, so at any moment at least one of them is on another date than the office.
    const zone = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find((one) => dayIn(one) !== officeDay())
    expect(zone, 'neither zone is on another date than the office').toBeDefined()
    const started = await call('POST', '/api/agents/started', asPerson(), { handle: 'zone-test', name: 'Test agent Zone', role: 'worker', runtime: 'claude-code' })
    keys.set('zone-test', String(started['whatToGiveIt']?.key))
    const note = await call('POST', '/api/records', asPerson(), {
      kind: 'note',
      title: 'Test: the note the zone agent offers to show',
      data: { date: '2026-10-07', body: 'A test note to be led to.' },
    })
    const sent = await call('POST', '/api/records', as('zone-test'), {
      kind: 'message',
      title: 'Test: come and look at the note, from another zone',
      data: {
        body: 'Test: come and look at the note when you have a moment.',
        to: [{ kind: 'person', id: THE_PERSON }],
        lead: { target: { kind: 'record', recordId: String(note['record'].id), workspaceId: 'default' } },
      },
    })
    const messageId = String(sent['record'].id)

    const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: zone })
    try {
      await context.addCookies(await app.context.cookies())
      const before = page
      page = await context.newPage()
      try {
        page.on('pageerror', (error) => pageErrors.push(error.message))
        await open('/', 'light', 1440)
        const browserDay = await page.evaluate(() => {
          const now = new Date()
          return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        })
        const dayBefore = officeDay()
        expect(browserDay, `the browser in ${String(zone)} is on the office's date`).not.toBe(dayBefore)
        await chatWith('Test agent Zone')
        await page.click('.px-chat-lead-later')
        await page.locator('.px-chat-lead-choice', { hasText: 'In 30 minutes' }).click()
        await see('.px-chat-lead-said')
        const dayAfter = officeDay()
        const database = new Database(join(app.dir, 'panelx.db'), { readonly: true })
        let remindAt: string
        try {
          const row = database
            .prepare("SELECT remind_at FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'")
            .get(messageId) as { remind_at: string | null } | undefined
          remindAt = String(row?.remind_at)
        } finally {
          database.close()
        }
        // THE WORDS THE OFFICE'S DATE GIVES, for the date before the press and after it, in case midnight fell between.
        const said = (officeDate: string): string => {
          const days = calendarDaysBetweenDayKeys(officeDate, remindAt.slice(0, 10))
          const when = days === 0 ? `today at ${remindAt.slice(11, 16)}` : days === 1 ? `tomorrow at ${remindAt.slice(11, 16)}` : remindAt.slice(0, 16)
          return `This message comes back ${when}, by the clock of the computer Mole Office runs on.`
        }
        expect([said(dayBefore), said(dayAfter)], `the browser is on ${browserDay} in ${String(zone)}`).toContain(await page.textContent('.px-chat-lead-said'))
        await picture('remind-5-another-time-zone', 'light', 1440)
      } finally {
        await page.close()
        page = before
      }
    } finally {
      await context.close()
    }
    expect(pageErrors).toEqual([])
  }, 240_000)
})
