// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT PAGE IS DRAWN AS PROPOSED. The owner's decision takes the proposal of report bBeOH2QwTAcJ, all seven
 * answers as recommended. The page is ProfilePage.tsx for an agent; the raise and the card are
 * TheirCard.tsx; the end of a raise is chosen in RaiseEndChoice.tsx.
 *
 * In a browser, against a test office of this file's own, with the browser paired as the person (the two halves the pairing
 * press gives a browser). The browser's clock stands at 09:00 tomorrow on this process's clock, which is the office's
 * clock too: the test server and the browser are started from this process and read the same zone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The order (answers 3 and 7): the raise stands above the card, the card above the facts, and the keys with their
 *      Revoke presses and Retire stand together, last on the page.
 *   2. One primary press (answer 1): the page draws exactly one, the raise's own, at the foot of its form, under the
 *      line that says when it ends; the head draws none.
 *   3. The lengths (answer 2): 15 minutes, 1 hour, 4 hours, end of today, a day and another time, a day chosen first,
 *      each length showing the time it would end; and for every choice, another time too, one line says when it ends
 *      and how long that is, and the line under it names the office's time zone. In English and in Chinese.
 *   4. The office's zone (answer 5): in a browser whose clock is on another zone, every time drawn and the stamp sent
 *      are on the office's clock, and a second line names the browser's own zone.
 *   5. A past time is refused on the page (answer 6): another time at 08:00 today is said in the failed colour and the
 *      press cannot be pressed. In English.
 *   6. A refusal from the door is drawn with its fault: with the browser's clock two days behind, 1 hour sends a time the
 *      office has passed, and the Chinese page draws the door's coded refusal in Chinese.
 *   7. The card (answer 4): no How it works and no duties on the page, and a row that opens the Role cards page. In
 *      English.
 *   9. Wave 13u's parts: under the agent's terminals, its live terminal, and under
 *      that the way back. This agent has no run, so each says so in one sentence and no steps are drawn.
 *
 * Set W13K_AGENT_PARTS_SHOTS to a folder to also photograph the page with its live parts at 1440, 990, 660 and 390,
 * light and dark, in English (case 10).
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the proofs are in the round's proofs file)
 * ---------------------------------------------------------------------------------------
 *
 *   - `<TheRaise …/>` moved under `<TheirCard …/>` in ProfilePage.tsx: case 1 goes red on "the raise stands above the card".
 *   - `variant="primary"` taken off the raise's press in TheirCard.tsx: case 2 goes red on "exactly one primary press".
 *   - RaiseEndChoice.tsx working on this computer's zone (`officeZone = theClockZone()` as the first line of its body): case 4 goes red.
 *   - `fault: faultOf(err)` replaced by `fault: null` in TheirCard.tsx's TheElevation: case 6 goes red on the Chinese words.
 *   - the acting-for-you line in TheirCard.tsx put back as one template with a space after 直到: case 4 (zh) goes red.
 *   - the row to the Role cards page taken out of TheirCard.tsx: case 7 goes red.
 *   - `<AgentWayBack …/>` moved above `<AgentTerminals …/>` in ProfilePage.tsx: case 9 goes red on the order.
 *   - RaiseEndChoice.tsx's onChange effect delayed 400 ms by a setTimeout, with case 5's single read of aria-disabled put
 *     back: case 5 (en) goes red on "the press cannot be pressed: expected null to be 'true'". The same delay with the
 *     waiting read: every case passes.
 *
 * Every read of a part the page draws or changes is a waiting read; see SETTLES below. Case 5's read of aria-disabled is
 * the one problem dNvyRXzujNRz names: the press is disabled by RaiseEndChoice.tsx's effect, which runs after the passed
 * line is drawn, so a single read can come before it. Machine load alone did not show this here; the delayed effect
 * above does, with no load needed (wave 13k round 45b).
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'

import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { carryThePairing, pairTheContext, type APairedContext } from './a-paired-context.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { thePress } from '../src/shared/the-press.ts'
import { createI18n } from '../src/shared/i18n.ts'

const THEIR = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE ZONE IS SET, NOT THE MACHINE'S. A day is a length of 24 hours (RaiseEndChoice.tsx), and case 3 expects it to end
 * at 09:00, which holds only when no change of clocks falls between 09:00 tomorrow and 09:00 the day after. Run in
 * Europe/London with tomorrow's date as on 23 October 2026, case 3 went red in both languages on the day's end drawn
 * "08:00" for "09:00"; as on 26 March 2027, "10:00". So this process, the test server it starts and the browser it
 * starts are on Asia/Shanghai, which has not changed its clocks since 1991. It is set before anything below reads the
 * clock, and the server and the browser inherit it.
 */
process.env.TZ = 'Asia/Shanghai'

/** 09:00 tomorrow on this process's clock, which is the office's clock. */
const tomorrowAtNine = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0).getTime()
})()
const thatDay = localStamp(new Date(tomorrowAtNine)).slice(0, 10)
/** The office's zone, as the server started from this process reads it. */
const OFFICE = Intl.DateTimeFormat().resolvedOptions().timeZone
/** A zone that is not the office's, at least seven hours from it all year. */
const ELSEWHERE = /^Asia\//.test(OFFICE) ? 'America/New_York' : 'Asia/Tokyo'

let live: LiveApp
let key = ''
/** The pairing the person's browser was given, carried into each context of its own. */
let paired: APairedContext | undefined

/** A folder to photograph the agent page's live parts into (case 10), or nothing. */
const SHOTS = process.env.W13K_AGENT_PARTS_SHOTS

/** A word as the English page says it. */
const EN = createI18n('en').t

const RAISE = '[data-target="uiSurface/profile.raise"]'
const CARD = '[data-target="uiSurface/profile.theircard"]'

async function call(path: string, method: string, body?: unknown, withKey = false): Promise<{ status: number; json: unknown }> {
  const reply = await fetch(`${live.api}${path}`, {
    method,
    headers: withKey ? { ...THEIR, 'x-mole-office-key': key } : THEIR,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await reply.text()
  return { status: reply.status, json: text === '' ? null : (JSON.parse(text) as unknown) }
}

/** The raise as the office holds it now, or null. */
async function theRaiseHeld(): Promise<{ until: string | null } | null> {
  const said = await call('/api/participants/agent/wren/profile', 'GET')
  const reply = said.json as { theCardTheyHold: { elevation: { holding: { until: string | null } | null } } }
  return reply.theCardTheyHold.elevation.holding
}

/** Give a context of its own the pairing of the person's browser: its cookie half and the header half its pages read. */
async function pairedAsThePersonsBrowser(context: BrowserContext): Promise<void> {
  if (paired === undefined) throw new Error('the person’s browser was not paired before this context')
  await carryThePairing(live.context, context, paired)
}

/** A paired page of its own, its clock standing at `at`, on `zone` when one is named. */
async function aPage(at: number, zone?: string): Promise<{ page: Page; context: BrowserContext }> {
  const context = await live.browser.newContext({ viewport: { width: 1440, height: 1000 }, ...(zone === undefined ? {} : { timezoneId: zone }) })
  await pairedAsThePersonsBrowser(context)
  const page = await context.newPage()
  await page.clock.setFixedTime(at)
  return { page, context }
}

async function openTheAgent(page: Page, lang: 'en' | 'zh' | 'xx' = 'en', waitFor = '.rec'): Promise<void> {
  await page.goto(`${live.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/who/agent/wren`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(waitFor).first().waitFor({ timeout: 60_000 })
}

/**
 * HOW LONG A READ WAITS FOR THE PAGE TO SETTLE. Every read below of something the page draws or changes is a waiting
 * read (expect.poll), never one read right after the thing appears: under load the page draws a part, then updates it a
 * moment later, and a single read then sees the moment before (problem dNvyRXzujNRz, case 5's aria-disabled read null).
 * Playwright Test's toHaveAttribute is not installed here, so expect.poll is this file's waiting assertion. Vitest's
 * poll gives up after one second unless told otherwise, which a loaded machine also outlasts.
 */
const SETTLES = { timeout: 15_000 }

/** The top of the first element a selector names. */
async function topOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox()
  expect(box, `${selector} is drawn`).not.toBeNull()
  return box!.y
}

beforeAll(async () => {
  live = await liveApp({ name: 'agent-page-as-proposed', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  key = thePersonsKeyHeader(join(live.dir, 'keys.json'))['x-mole-office-key'] as string
  const started = await call('/api/agents/started', 'POST', { handle: 'wren', name: 'Wren', role: 'secretary' })
  expect(started.status, JSON.stringify(started.json)).toBe(201)
  paired = await pairTheContext(live.context, live.api)
  await live.page.clock.setFixedTime(tomorrowAtNine)
}, 180_000)

afterEach(async () => {
  await call('/api/roles/elevation/wren', 'DELETE', undefined, true)
})

afterAll(async () => {
  await live?.stop()
})

describe('the agent page, drawn as the owner’s decision took it', () => {
  it('1: the raise stands above the card, the card above the facts, and Revoke and Retire together at the foot', async () => {
    const page = live.page
    await openTheAgent(page)
    await page.locator('[data-target="uiSurface/profile.keys"]').waitFor({ timeout: 30_000 })
    const [raise, card, facts] = [await topOf(page, RAISE), await topOf(page, CARD), await topOf(page, '[data-target="uiSurface/profile.facts"]')]
    expect(raise, 'the raise stands above the card').toBeLessThan(card)
    expect(card, 'the card stands above the facts').toBeLessThan(facts)
    // THE FOOT: the last part of the page holds the keys and Retire, and nothing else.
    const foot = await page.locator('.prof-one').evaluate((one) => {
      const last = one.lastElementChild
      return {
        isTheFoot: last?.getAttribute('data-part') === 'take-access-away',
        holds: [...(last?.children ?? [])].map((child) => child.getAttribute('data-target')),
      }
    })
    expect(foot.isTheFoot, 'the last part of the page is the one that takes access away').toBe(true)
    expect(foot.holds).toEqual(['uiSurface/profile.keys', 'uiSurface/profile.retire'])
  })

  it('2: exactly one primary press, the raise’s own, at the foot of its form, and none in the head', async () => {
    const page = live.page
    await openTheAgent(page)
    const primaries = page.locator('main .px-btn[data-variant="primary"]')
    await expect.poll(() => primaries.count(), { ...SETTLES, message: 'exactly one primary press on the page' }).toBe(1)
    await expect.poll(() => primaries.first().textContent(), SETTLES).toBe(thePress('Wren'))
    await expect.poll(() => page.locator(`${RAISE} .tc-elev-foot .px-btn[data-variant="primary"]`).count(), { ...SETTLES, message: 'it is the raise form’s foot' }).toBe(1)
    expect(await page.locator('.prof-head .px-btn').count(), 'the head holds no press').toBe(0)
    const press = await primaries.first().boundingBox()
    const line = await page.locator(`${RAISE} .rec-clock`).boundingBox()
    expect(press!.y, 'the press stands under the line that says when it ends').toBeGreaterThan(line!.y + line!.height - 1)
  })

  for (const lang of ['en', 'zh'] as const) {
    it(`3 (${lang}): each length shows its end, a day is chosen first, and one line always says when and on which clock`, async () => {
      const page = live.page
      await openTheAgent(page, lang)
      await expect.poll(() => page.locator('.rec-choice[data-chosen="yes"]').getAttribute('data-choice'), { ...SETTLES, message: 'a day is chosen first' }).toBe('day')
      const ends = { '15m': '09:15', '1h': '10:00', '4h': '13:00', today: '23:59', day: '09:00' } as const
      const lines = {
        en: { '15m': 'Ends today at 09:15, in 15 minutes.', '1h': 'Ends today at 10:00, in 1 hour.', '4h': 'Ends today at 13:00, in 4 hours.', today: 'Ends today at 23:59, in 14 h 59 min.', day: 'Ends tomorrow at 09:00, in 24 hours.' },
        zh: { '15m': '今天 09:15 结束，还有 15 分钟。', '1h': '今天 10:00 结束，还有 1 小时。', '4h': '今天 13:00 结束，还有 4 小时。', today: '今天 23:59 结束，还有 14 小时 59 分钟。', day: '明天 09:00 结束，还有 24 小时。' },
      }[lang]
      const clock = lang === 'en' ? `By the office's clock (${OFFICE}).` : `按办公室的时钟（${OFFICE}）。`
      for (const [choice, at] of Object.entries(ends)) {
        await expect.poll(() => page.locator(`.rec-choice[data-choice="${choice}"] .rec-at`).textContent(), { ...SETTLES, message: `${choice} shows its end` }).toBe(at)
        await page.locator(`.rec-choice[data-choice="${choice}"]`).click()
        await expect.poll(async () => page.locator('.rec-line').textContent(), SETTLES).toBe(lines[choice as keyof typeof lines])
        await expect.poll(() => page.locator('.rec-clock').textContent(), { ...SETTLES, message: `the clock under ${choice}` }).toBe(clock)
      }
      // ANOTHER TIME, TOO: the line is there under it.
      await page.locator('.rec-choice[data-choice="another"]').click()
      await page.locator('.rec-day').fill(thatDay)
      await page.locator('.rec-hour').selectOption('18')
      await page.locator('.rec-minute').selectOption('30')
      await expect.poll(async () => page.locator('.rec-line').textContent(), SETTLES).toBe(lang === 'en' ? 'Ends today at 18:30, in 9 h 30 min.' : '今天 18:30 结束，还有 9 小时 30 分钟。')
      await expect.poll(() => page.locator('.rec-clock').textContent(), SETTLES).toBe(clock)
    })
  }

  it('4: from a browser on another zone, every time and the stamp sent are on the office’s clock, and both zones are named', async () => {
    const { page, context } = await aPage(tomorrowAtNine, ELSEWHERE)
    try {
      await openTheAgent(page)
      await expect.poll(() => page.locator('.rec-choice[data-choice="4h"] .rec-at').textContent(), { ...SETTLES, message: 'the office’s 13:00' }).toBe('13:00')
      await expect.poll(() => page.locator('.rec-choice[data-choice="today"] .rec-at').textContent(), { ...SETTLES, message: 'the office’s end of today' }).toBe('23:59')
      await expect.poll(() => page.locator('.rec-clock').textContent(), SETTLES).toBe(`By the office's clock (${OFFICE}). This computer's clock is on ${ELSEWHERE}, so these times are not its own.`)
      await page.locator('.tc-elev-reason-box textarea').fill('Tidy the notes tonight')
      await page.locator('.rec-choice[data-choice="4h"]').click()
      await page.getByRole('button', { name: thePress('Wren') }).click()
      await page.locator('.tc-elev-on').waitFor({ timeout: 30_000 })
      expect((await theRaiseHeld())?.until, 'the stamp is the office’s 13:00').toBe(`${thatDay} 13:00:00`)
      await expect.poll(() => page.locator('.tc-elev-line').textContent(), SETTLES).toContain('until today at 13:00')
      await expect.poll(() => page.locator('.tc-elev-left').textContent(), SETTLES).toContain('It ends in 4 hours.')
    } finally {
      await context.close()
    }
  })

  it('4 (zh): the acting-for-you line spaces its parts the Chinese way', async () => {
    // THE SPACES COME FROM src/shared/spacing.ts: a space between a Chinese character and a Latin
    // name, none between two Chinese characters. The line used to read '直到 今天 13:00'.
    const { page, context } = await aPage(tomorrowAtNine)
    try {
      await openTheAgent(page, 'zh')
      await page.locator('.tc-elev-reason-box textarea').fill('整理笔记')
      await page.locator('.rec-choice[data-choice="4h"]').click()
      await page.locator(`${RAISE} .tc-elev-foot .px-btn`).click()
      await page.locator('.tc-elev-on').waitFor({ timeout: 30_000 })
      await expect.poll(() => page.locator('.tc-elev-line').textContent(), { ...SETTLES, message: 'the end follows 直到 with no space' }).toContain('直到今天 13:00')
      const line = (await page.locator('.tc-elev-line').textContent()) ?? ''
      expect(line, 'a Latin name is spaced from the Chinese around it').toMatch(/^正在代替 [A-Za-z][^ ]* .*直到今天/)
    } finally {
      await context.close()
    }
  })

  // ENGLISH ONLY. A past time is refused the same way in either language, and the row keeps one language for it.
  for (const lang of ['en'] as const) {
    it(`5 (${lang}): a time that has passed is refused on the page`, async () => {
      const page = live.page
      await openTheAgent(page, lang)
      await page.locator('.tc-elev-reason-box textarea').fill('Tidy the notes tonight')
      await page.locator('.rec-choice[data-choice="another"]').click()
      await page.locator('.rec-day').fill(thatDay)
      await page.locator('.rec-hour').selectOption('8')
      await page.locator('.rec-passed').waitFor()
      await expect.poll(() => page.locator('.rec-passed').textContent(), SETTLES).toBe(lang === 'en' ? 'That time has passed. Choose a later one.' : '这个时间已经过去了。请选一个更晚的时间。')
      const press = page.locator(`${RAISE} .tc-elev-foot .px-btn`)
      await expect.poll(() => press.getAttribute('aria-disabled'), { ...SETTLES, message: 'the press cannot be pressed' }).toBe('true')
      await press.click({ force: true })
      expect(await theRaiseHeld(), 'nothing was sent').toBeNull()
    })
  }

  it('6: the door’s refusal is drawn with its fault, in the page’s language', async () => {
    // TWO DAYS BEHIND: an hour from the browser's now is a time the office has passed, so the door refuses it by its code.
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60_000
    const { page, context } = await aPage(twoDaysAgo)
    try {
      await openTheAgent(page, 'zh')
      await page.locator('.tc-elev-reason-box textarea').fill('整理笔记')
      await page.locator('.rec-choice[data-choice="1h"]').click()
      await page.locator(`${RAISE} .tc-elev-foot .px-btn`).click()
      const refusal = page.locator(`${RAISE} .tc-elev-foot`)
      await expect.poll(async () => refusal.textContent(), { timeout: 15_000 }).toContain('已经过去。请选择更晚的时间。没有写入任何内容。')
      expect(await refusal.textContent(), 'not the door’s English sentence').not.toContain('has already passed')
      expect(await theRaiseHeld(), 'nothing was written').toBeNull()
    } finally {
      await context.close()
    }
  })

  // ENGLISH ONLY. The card draws the same parts in either language, and the row keeps one language for it.
  for (const lang of ['en'] as const) {
    it(`7 (${lang}): the card draws no How it works and no duties, and a row opens the Role cards page`, async () => {
      const page = live.page
      await openTheAgent(page, lang)
      const card = page.locator(CARD)
      await card.locator('.tc-card').waitFor()
      expect(await page.locator('main .hiw').count(), 'no How it works on the page').toBe(0)
      expect(await page.locator('main .tc-card-duties').count(), 'no duties on the page').toBe(0)
      const row = card.locator('.tc-card-all a[href="#/roles"]')
      await expect.poll(() => row.count(), { ...SETTLES, message: 'one row opens the Role cards page' }).toBe(1)
      await expect.poll(() => row.textContent(), SETTLES).toBe(
        lang === 'en' ? 'What the secretary card does' : '秘书角色卡做什么',
      )
      await row.click()
      await expect.poll(() => page.url(), SETTLES).toContain('#/roles')
    })
  }

  it('9: its live terminal and the way back stand under its terminals, and with no run of it each says so in one sentence', async () => {
    const page = live.page
    await openTheAgent(page, 'en', '[data-target="uiSurface/profile.wayback"] .al-back-state')
    const pane = '[data-target="uiSurface/profile.pane"]'
    const wayBack = '[data-target="uiSurface/profile.wayback"]'
    await page.locator(`${pane} .al-state`).waitFor({ timeout: 30_000 })
    const [terminals, itsPane, back] = [await topOf(page, '[data-target="uiSurface/profile.terminals"]'), await topOf(page, pane), await topOf(page, wayBack)]
    expect(terminals, 'the terminals stand above the live terminal').toBeLessThan(itsPane)
    expect(itsPane, 'the live terminal stands above the way back').toBeLessThan(back)
    await expect.poll(() => page.locator(`${pane} .al-state`).textContent(), SETTLES).toBe(EN('agentLive.pane.noRun'))
    await expect.poll(() => page.locator(`${wayBack} .al-back-state`).textContent(), SETTLES).toBe(EN('agentLive.back.noRunWord'))
    expect(await page.locator('[data-target="uiSurface/profile.steps"]').count(), 'no steps: it has no run in a sandbox').toBe(0)
  })

  it.skipIf(!SHOTS)('pictures of the agent page with its live parts, English, four widths, light and dark', async () => {
    mkdirSync(SHOTS!, { recursive: true })
    for (const theme of ['light', 'dark'] as const) for (const width of [1440, 990, 660, 390]) {
      const context = await live.browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
      try {
        await pairedAsThePersonsBrowser(context)
        await context.addInitScript(`localStorage.setItem('mole-office.preset.theme', '${theme}')`)
        const page = await context.newPage()
        await page.clock.setFixedTime(tomorrowAtNine)
        await openTheAgent(page, 'en', '[data-target="uiSurface/profile.wayback"] .al-back-state')
        await page.waitForTimeout(800)
        await page.screenshot({ path: join(SHOTS!, `agent-page-live-parts-${width}-${theme}-en.png`), fullPage: true })
      } finally {
        await context.close()
      }
    }
  }, 600_000)
})
