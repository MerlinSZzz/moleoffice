// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION OR A REPORT OPENED BEFORE IS DRAWN AT ONCE, AND READ AGAIN BEHIND.
 *
 * Going back to a conversation already opened, or to a report already opened, draws what the page already holds at
 * once: within 100 ms of the press, with no waiting light around the pressed row and no loading rows. Its door is asked
 * again behind it, and what changed meanwhile comes in without moving the place being read. The first opening is as it
 * was: the pressed row keeps its light until the door answers, and nothing of the conversation or the report is drawn
 * before. The ring that the "Refreshing…" mark draws round the sidebar's disc, or round the menu press on a phone, is not
 * a waiting light here. It says that a read is going on behind, and that is what a second opening does.
 *
 * WHAT WAITED, measured before the change on a made-up office of the live office's size, at 1440, three times each. A
 * press on a contact asked for the conversation and the contact's presence, and changed nothing on the screen until
 * both answered, even when the page held that conversation from before: 369 to 391 ms behind the light. A press on a
 * row of the records list asked for the five reads of the record page before it changed the address, even when the
 * record page had kept its answer: 415 to 461 ms behind the light. The Reports page links its rows plainly, and a report
 * opened a second time from there was drawn from the kept answer in 41 to 43 ms. The browser's Back to a report opened
 * before was drawn from the kept answer in 22 to 58 ms, and case 5 keeps it so. And the chat held what it had read of
 * each conversation in memory only, so after a reload every conversation but the open one was read as if for the first
 * time.
 *
 * In a real browser against a Mole Office of its own, each case holds back the door of the conversation or the record
 * being opened, and reads the page in every frame the browser paints from the press:
 *  1. A conversation opened a second time from the chat page's list is drawn within 100 ms. No frame has the row's
 *     light or a loading row. When the door answers, the message written meanwhile is drawn, and the list stays at its
 *     end in every frame, so the newest message stays in view.
 *  2. The same, with the reader scrolled up by the wheel before the door answers: the message across the middle of the
 *     list stays within one pixel of where it was in the window, in every frame, and the list is not put back at its end.
 *  3. The same as case 1, for a conversation opened before the page was reloaded.
 *  4. A report opened a second time from the records list is drawn within 100 ms, its title and its blocks, with no
 *     light and no loading rows. When the door answers, the words changed meanwhile are drawn, and the block across the
 *     middle of the window stays within one pixel of where it was, in every frame.
 *  5. The same, for a report gone back to by the browser's Back from another page.
 *  6. A conversation opened for the first time waits as before: the row's light is drawn, and none of its messages
 *     until the door answers.
 *  7. A report opened for the first time from the records list waits as before: the list stays, with the row's light,
 *     and the report is drawn only after the door answers.
 *
 * Everything here is made up.
 */
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor, recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const RETURNING = { name: 'Made-up Returning Agent', handle: 'made-up-returning-agent', words: 'Made-up returning line' }
const OTHER = { name: 'Made-up Other Agent', handle: 'made-up-other-agent', words: 'Made-up other line' }
const FIRST_TIME = { name: 'Made-up First-time Agent', handle: 'made-up-first-time-agent', words: 'Made-up first-time line' }
const REPORT = 'A made-up report opened twice'
const BACK_REPORT = 'A made-up report gone back to'
const FIRST_TIME_REPORT = 'A made-up report opened once'
/** Enough messages and blocks that the conversation and the report both scroll at 1440 by 900. */
const MESSAGES = 40
const BLOCKS = 24
/** The owner's bound for a second opening. */
const AT_ONCE_MS = 100
/** Eight pixels is the bottom, as the chat itself counts it. */
const BOTTOM_PX = 8
const LONG = ' The made-up log for this line runs on, so the row takes two or three lines and the list is long enough to scroll.'

let app: LiveApp
let report = ''
let backReport = ''
let firstTimeReport = ''

async function write(headers: Record<string, string>, record: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(record) })
  const body = await made.text()
  expect(made.status, body).toBe(theAnswerToAWriteInATestOffice(headers, record))
  return (JSON.parse(body) as { record?: { id: string } }).record?.id ?? ''
}

const asThe = (agent: { handle: string }): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle })

async function say(agent: { handle: string }, fromTheAgent: boolean, body: string): Promise<void> {
  const data = fromTheAgent ? { body, to: [{ kind: 'person', id: THE_PERSON }] } : { body, to: [{ kind: 'agent', id: agent.handle }] }
  await write(fromTheAgent ? asThe(agent) : PERSON, { kind: 'message', title: body.slice(0, 30), data })
}

const theBlocks = (changed: string | null): { id: string; type: string; text: string }[] =>
  Array.from({ length: BLOCKS }, (_, i) => ({ id: `b-${String(i + 1)}`, type: 'text', text: i + 1 === 20 && changed !== null ? changed : `Made-up paragraph ${String(i + 1)}.${LONG}` }))

beforeAll(async () => {
  app = await liveApp({ name: 'opened-before-is-drawn-at-once', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  for (const agent of [RETURNING, OTHER, FIRST_TIME]) {
    await write(PERSON, { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
    for (let n = 1; n <= MESSAGES; n += 1) await say(agent, n % 2 === 0, `${agent.words} ${String(n)}.${n % 3 === 0 ? LONG : ''}`)
  }
  report = await write(PERSON, { kind: 'report', title: REPORT, data: { for: 'A made-up reader', date: '2026-11-14', blocks: theBlocks(null) } })
  backReport = await write(PERSON, { kind: 'report', title: BACK_REPORT, data: { for: 'A made-up reader', date: '2026-11-14', blocks: theBlocks(null) } })
  firstTimeReport = await write(PERSON, { kind: 'report', title: FIRST_TIME_REPORT, data: { for: 'A made-up reader', date: '2026-11-14', blocks: theBlocks(null) } })
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one painted frame shows, read from the press on. */
type Frame = { t: number; light: boolean; ring: boolean; loading: boolean; drawn: boolean; gap: number | null; followed: number | null; changed: boolean }
/** What a case looks for: every [selector, words] pair drawn, the row followed, and words that come only from the door. */
type Look = { drawn: [string, string][]; follow: [string, string] | null; changed: [string, string] }

/**
 * READ THE PAGE IN EVERY FRAME, IMMEDIATELY BEFORE IT IS PAINTED, from the first press after this is put in: a resize
 * observer made in the frame's callback is the newest, so the browser calls it after the frame's layout, and no task
 * runs between it and the paint.
 */
function theWatcher(look: Look): void {
  const w = window as unknown as { pressFrames: unknown[]; pressAt: number | null; pressWatched: boolean; pressLook: Look }
  w.pressFrames = []
  w.pressAt = null
  w.pressLook = look
  addEventListener('pointerdown', () => { if (w.pressAt === null) w.pressAt = performance.now() }, { capture: true, once: true })
  if (w.pressWatched) return
  w.pressWatched = true
  const holding = (selector: string, words: string): HTMLElement | undefined =>
    [...document.querySelectorAll<HTMLElement>(selector)].find((one) => (one.textContent ?? '').includes(words))
  const read = (): void => {
    if (w.pressAt === null) return
    const l = w.pressLook
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    const followed = l.follow === null ? undefined : holding(l.follow[0], l.follow[1])
    // A light is drawn centred on the part it frames, so a light whose centre is the disc's, or the menu press's, is
    // the refreshing ring.
    const marks = [...document.querySelectorAll<HTMLElement>('.sbp-disc, .shell-menu')].map((one) => one.getBoundingClientRect())
    const aRing = (canvas: Element): boolean => {
      const box = canvas.getBoundingClientRect()
      return marks.some((mark) => Math.abs(mark.left + mark.width / 2 - (box.left + box.width / 2)) < 2 && Math.abs(mark.top + mark.height / 2 - (box.top + box.height / 2)) < 2)
    }
    const lights = [...document.querySelectorAll('canvas[data-wait-light]')]
    w.pressFrames.push({
      t: Math.round(performance.now() - w.pressAt),
      light: lights.some((one) => !aRing(one)),
      ring: lights.some(aRing),
      loading: document.querySelector('.px-loading') !== null,
      drawn: l.drawn.every(([selector, words]) => holding(selector, words) !== undefined),
      gap: list === null ? null : Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
      followed: followed === undefined ? null : Math.round(followed.getBoundingClientRect().top),
      changed: holding(l.changed[0], l.changed[1]) !== undefined,
    })
  }
  const tick = (): void => {
    if (!w.pressWatched) return
    const atThePaint = new ResizeObserver(() => {
      atThePaint.disconnect()
      read()
    })
    atThePaint.observe(document.documentElement)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function theFrames(page: Page): Promise<Frame[]> {
  return (await page.evaluate(() => (window as unknown as { pressFrames: unknown[] }).pressFrames)) as Frame[]
}

/** Follow this row from now on, and say where it is. */
async function follow(page: Page, selector: string, words: string): Promise<number> {
  return page.evaluate(([selector, words]) => {
    const w = window as unknown as { pressLook: Look }
    w.pressLook = { ...w.pressLook, follow: [selector, words] }
    const row = [...document.querySelectorAll<HTMLElement>(selector)].find((one) => (one.textContent ?? '').includes(words))
    if (row === undefined) throw new Error(`nothing drawn holds ${words}`)
    return Math.round(row.getBoundingClientRect().top)
  }, [selector, words] as const)
}

/** The frames as lines, one for each change, for a failure to show what was painted. */
function told(frames: Frame[]): string {
  const out: string[] = []
  let last = ''
  for (const f of frames) {
    const one = `${f.drawn ? 'drawn' : 'not drawn'}${f.light ? ', light' : ''}${f.ring ? ', the refreshing ring' : ''}${f.loading ? ', loading rows' : ''}, gap ${String(f.gap)}, followed row at ${String(f.followed)}${f.changed ? ', the change drawn' : ''}`
    if (one !== last) out.push(`@${String(f.t)}ms ${one}`)
    last = one
  }
  return out.join('\n')
}

/** A door held back until the case lets it go, for the requests `which` picks once `arm` is called. */
function holdTheDoor(page: Page, url: string, which: (request: URL) => boolean): { arm: () => Promise<void>; letGo: () => void; asked: () => number } {
  let letGo!: () => void
  const gate = new Promise<void>((resolve) => { letGo = resolve })
  let asked = 0
  return {
    arm: async () => {
      await page.route(url, async (route) => {
        if (!which(new URL(route.request().url()))) return route.continue()
        asked += 1
        await gate
        await route.continue()
      })
    },
    letGo: () => letGo(),
    asked: () => asked,
  }
}

async function aWindow(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.language', 'en')
  })
  const page = await context.newPage()
  return { page, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }); await context.close() } }
}

const contactRow = (page: Page, agent: { name: string }) => page.locator('.px-chat-page-lists .px-chat-contact').filter({ hasText: agent.name })
/** The agent's id, as its row on the chat page names it. */
const theIdOf = async (page: Page, agent: { name: string }): Promise<string> =>
  ((await contactRow(page, agent).getAttribute('data-contact', { timeout: 30_000 })) ?? '').split(':').slice(1).join(':')
const aMessage = (page: Page, words: string) => page.locator('.px-chat-said .px-chat-one').filter({ hasText: words })
const newest = (agent: { words: string }): string => `${agent.words} ${String(MESSAGES)}.`

/** The chat page, with the returning agent's conversation opened once and then the other agent's. */
async function openedOnceAndLeft(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await contactRow(page, RETURNING).click()
  await aMessage(page, newest(RETURNING)).waitFor({ timeout: 30_000 })
  await waitForThePage(page, 60_000)
  await contactRow(page, OTHER).click()
  await aMessage(page, newest(OTHER)).waitFor({ timeout: 30_000 })
  await waitForThePage(page, 60_000)
}

const theConversationDoor = (id: () => string) => (request: URL): boolean =>
  request.pathname === '/api/messages/conversation' && request.searchParams.get('id') === id()

/** Whether some answer the page has copied into IndexedDB for the next load holds these words. */
async function theCopyForTheNextLoadHolds(page: Page, words: string): Promise<boolean> {
  return page.evaluate(
    async (wanted) =>
      new Promise<boolean>((resolve) => {
        const opened = indexedDB.open('mole-office-page-cache')
        opened.onerror = () => resolve(false)
        opened.onsuccess = () => {
          const db = opened.result
          if (!db.objectStoreNames.contains('answers')) {
            db.close()
            resolve(false)
            return
          }
          const all = db.transaction('answers', 'readonly').objectStore('answers').getAll()
          all.onsuccess = () => {
            db.close()
            resolve((all.result as { value: unknown }[]).some((one) => JSON.stringify(one.value).includes(wanted)))
          }
          all.onerror = () => {
            db.close()
            resolve(false)
          }
        }
      }),
    words,
  )
}

const CONVERSATION_CASES = [
  { number: 1, where: 'at its end', reload: false },
  { number: 2, where: 'scrolled up', reload: false },
  { number: 3, where: 'at its end', reload: true },
] as const

for (const { number, where, reload } of CONVERSATION_CASES) {
  it(`${String(number)}. a conversation opened ${reload ? 'before a reload' : 'a second time'} is drawn at once, and what came meanwhile comes in with the reader ${where}`, async () => {
    const { page, close } = await aWindow()
    let id = ''
    const door = holdTheDoor(page, '**/api/messages/conversation?**', theConversationDoor(() => id))
    try {
      await openedOnceAndLeft(page)
      id = await theIdOf(page, RETURNING)
      expect(id).not.toBe('')
      if (reload) {
        // The page copies what it keeps 400 ms after a change, in the order kept. Once the copy holds the other agent's
        // conversation, opened last, everything kept before it has been copied as well.
        await expect.poll(() => theCopyForTheNextLoadHolds(page, `${OTHER.words} 12.`), { timeout: 10_000, message: 'the copy for the next load did not catch up with the conversation opened last' }).toBe(true)
        await page.evaluate(() => Object.assign(window, { beforeTheReload: true }))
        await page.reload({ timeout: 60_000 })
        await waitForThePage(page, 60_000)
        expect(await page.evaluate(() => 'beforeTheReload' in window), 'the page was loaded again').toBe(false)
        await contactRow(page, RETURNING).waitFor({ timeout: 30_000 })
      }
      const meanwhile = `Made-up line written meanwhile, in case ${String(number)}.`
      // Held from before the line is written, so no read of the conversation can bring it before the case lets go.
      await door.arm()
      await say(RETURNING, true, meanwhile)
      await page.evaluate(theWatcher, { drawn: [['.px-chat-said .px-chat-one', newest(RETURNING)]], follow: null, changed: ['.px-chat-said .px-chat-one', meanwhile] } satisfies Look)
      await contactRow(page, RETURNING).click()
      await expect.poll(async () => (await theFrames(page)).some((one) => one.drawn), { timeout: 10_000, message: 'the conversation was not drawn while its door was held' }).toBe(true)
      await expect.poll(() => door.asked(), { timeout: 10_000, message: 'the conversation was not asked again behind its drawing' }).toBeGreaterThan(0)
      let place: number | null = null
      if (where === 'scrolled up') {
        // The reader's own steps up, as a trackpad sends them.
        const box = (await page.locator('.px-chat-said').boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        for (let n = 0; n < 40; n += 1) {
          await page.mouse.wheel(0, -15)
          await page.waitForTimeout(16)
        }
        await page.waitForTimeout(400)
        const middle = await page.evaluate(() => {
          const list = document.querySelector<HTMLElement>('.px-chat-said')!
          const box = list.getBoundingClientRect()
          const across = [...list.querySelectorAll<HTMLElement>('.px-chat-one')].find((row) => row.getBoundingClientRect().bottom >= box.top + box.height / 2)
          return /Made-up returning line \d+\./.exec(across?.textContent ?? '')?.[0] ?? ''
        })
        expect(middle).not.toBe('')
        place = await follow(page, '.px-chat-said .px-chat-one', middle)
      }
      const before = (await theFrames(page)).length
      door.letGo()
      if (where === 'at its end') await aMessage(page, meanwhile).waitFor({ timeout: 30_000 })
      else await expect.poll(async () => (await theFrames(page)).at(-1)?.changed ?? false, { timeout: 30_000 }).toBe(true)
      await page.waitForTimeout(800)
      const frames = await theFrames(page)
      const first = frames.find((one) => one.drawn)
      expect(first?.t ?? Number.POSITIVE_INFINITY, told(frames)).toBeLessThanOrEqual(AT_ONCE_MS)
      expect(frames.filter((one) => one.light || one.loading), told(frames)).toEqual([])
      expect(frames.slice(frames.indexOf(first!)).filter((one) => !one.drawn), told(frames)).toEqual([])
      expect(frames.slice(0, before).filter((one) => one.changed), 'the line written meanwhile was drawn before the door answered').toEqual([])
      const after = frames.slice(before)
      expect(after.length, 'no frame was painted after the door answered').toBeGreaterThan(0)
      if (where === 'at its end') expect(after.filter((one) => one.gap === null || one.gap > BOTTOM_PX), told(after)).toEqual([])
      else expect(after.filter((one) => one.followed === null || Math.abs(one.followed - place!) > 1 || one.gap === null || one.gap <= BOTTOM_PX), told(after)).toEqual([])
    } finally {
      door.letGo()
      await close()
    }
  }, 180_000)
}

/**
 * THE RECORDS LIST NARROWED TO REPORTS, with this report's row drawn and no light left. The list draws 50 rows at a time,
 * the newest change first, and by the time these cases run a made-up report can be below the first 50. The kind is the
 * list's own and not in its address, so a list drawn again lists every kind until it is narrowed again.
 */
async function theReportsOnTheList(page: Page, title: string): Promise<Locator> {
  const kind = page.locator('.rec-filters select.px-select').filter({ has: page.locator('option[value="report"]') })
  if ((await kind.inputValue({ timeout: 30_000 })) !== 'report') await kind.selectOption('report')
  const row = page.locator('tr').filter({ has: page.getByText(title, { exact: true }) }).locator('a.rec-cell-title')
  await row.waitFor({ timeout: 30_000 })
  await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 30_000 }).toBe(0)
  return row
}

/**
 * THE SECOND DRAWING OF A REPORT, from a page that has drawn it once: its door is held, its words are changed, `press`
 * opens it again, and what is drawn is read in every frame.
 */
async function aReportDrawnAgain(page: Page, id: string, title: string, changed: string, press: () => Promise<void>): Promise<void> {
  const door = holdTheDoor(page, `**/api/records/${id}**`, (request) => request.pathname === `/api/records/${id}`)
  try {
    // Held from before the change, so no read of the report can bring it before the case lets go.
    await door.arm()
    const patched = await fetch(`${app.api}/api/records/${id}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ dataPatch: { blocks: theBlocks(changed) } }) })
    expect(patched.status, await patched.text()).toBe(200)
    await page.evaluate(theWatcher, { drawn: [['.rp-title', title], ['.sb-text', 'Made-up paragraph 1.']], follow: null, changed: ['.sb-text', changed] } satisfies Look)
    await press()
    await expect.poll(async () => (await theFrames(page)).some((one) => one.drawn), { timeout: 10_000, message: 'the report was not drawn while its door was held' }).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${recordPath(id, 'report')}`)
    await expect.poll(() => door.asked(), { timeout: 10_000, message: 'the report was not asked again behind its drawing' }).toBeGreaterThan(0)
    await page.locator('.sb-text').filter({ hasText: 'Made-up paragraph 12.' }).evaluate((block) => block.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(400)
    const place = await follow(page, '.sb-text', 'Made-up paragraph 12.')
    const before = (await theFrames(page)).length
    door.letGo()
    await page.locator('.sb-text').filter({ hasText: changed }).waitFor({ timeout: 30_000 })
    await page.waitForTimeout(800)
    const frames = await theFrames(page)
    const first = frames.find((one) => one.drawn)
    expect(first?.t ?? Number.POSITIVE_INFINITY, told(frames)).toBeLessThanOrEqual(AT_ONCE_MS)
    expect(frames.filter((one) => one.light || one.loading), told(frames)).toEqual([])
    expect(frames.slice(0, before).filter((one) => one.changed), 'the changed words were drawn before the door answered').toEqual([])
    const after = frames.slice(before)
    expect(after.length, 'no frame was painted after the door answered').toBeGreaterThan(0)
    expect(after.filter((one) => one.followed === null || Math.abs(one.followed - place) > 1), told(after)).toEqual([])
    expect(after.at(-1)?.changed, told(after)).toBe(true)
  } finally {
    door.letGo()
  }
}

it('4. a report opened a second time from the records list is drawn at once, and what changed meanwhile comes in where the reader is', async () => {
  const { page, close } = await aWindow()
  try {
    await page.goto(`${app.site}/?lang=en#${pathFor('records')}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const title = await theReportsOnTheList(page, REPORT)
    await title.click()
    await page.locator('.rp-title', { hasText: REPORT }).waitFor({ timeout: 30_000 })
    await waitForThePage(page, 60_000)
    await page.goBack()
    await waitForThePage(page, 60_000)
    await theReportsOnTheList(page, REPORT)
    await aReportDrawnAgain(page, report, REPORT, 'Made-up paragraph 20, changed while the report was closed.', () => title.click())
  } finally {
    await close()
  }
}, 180_000)

it('5. a report gone back to by the browser\'s Back is drawn at once, and what changed meanwhile comes in where the reader is', async () => {
  const { page, close } = await aWindow()
  try {
    await page.goto(`${app.site}/?lang=en#${recordPath(backReport, 'report')}`, { timeout: 60_000 })
    await page.locator('.rp-title', { hasText: BACK_REPORT }).waitFor({ timeout: 30_000 })
    await waitForThePage(page, 60_000)
    // Away to the records list, as a link to it goes.
    await page.evaluate((to) => { location.hash = to }, `#${pathFor('records')}`)
    await page.locator('a.rec-cell-title').first().waitFor({ timeout: 30_000 })
    await waitForThePage(page, 60_000)
    await aReportDrawnAgain(page, backReport, BACK_REPORT, 'Made-up paragraph 20, changed while the reader was away.', () =>
      // Back has no pointer press, so its time is taken where it is asked.
      page.evaluate(() => {
        ;(window as unknown as { pressAt: number | null }).pressAt = performance.now()
        history.back()
      }),
    )
  } finally {
    await close()
  }
}, 180_000)

it('6. a conversation opened for the first time keeps the row\'s light, and draws nothing of it, until its door answers', async () => {
  const { page, close } = await aWindow()
  let id = ''
  const door = holdTheDoor(page, '**/api/messages/conversation?**', theConversationDoor(() => id))
  try {
    await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    id = await theIdOf(page, FIRST_TIME)
    expect(id).not.toBe('')
    await door.arm()
    await page.evaluate(theWatcher, { drawn: [['.px-chat-said .px-chat-one', newest(FIRST_TIME)]], follow: null, changed: ['.px-chat-said .px-chat-one', newest(FIRST_TIME)] } satisfies Look)
    await contactRow(page, FIRST_TIME).click()
    await expect.poll(() => door.asked(), { timeout: 30_000 }).toBeGreaterThan(0)
    await page.waitForTimeout(600)
    const waiting = await theFrames(page)
    expect(waiting.filter((one) => one.drawn), told(waiting)).toEqual([])
    expect(waiting.at(-1)?.light, told(waiting)).toBe(true)
    door.letGo()
    await aMessage(page, newest(FIRST_TIME)).waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000 }).toBe(0)
  } finally {
    door.letGo()
    await close()
  }
}, 120_000)

it('7. a report opened for the first time from the records list keeps the list and the row\'s light until its door answers', async () => {
  const { page, close } = await aWindow()
  const door = holdTheDoor(page, `**/api/records/${firstTimeReport}**`, (request) => request.pathname === `/api/records/${firstTimeReport}`)
  try {
    await page.goto(`${app.site}/?lang=en#${pathFor('records')}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const title = await theReportsOnTheList(page, FIRST_TIME_REPORT)
    await door.arm()
    await page.evaluate(theWatcher, { drawn: [['.rp-title', FIRST_TIME_REPORT]], follow: null, changed: ['.rp-title', FIRST_TIME_REPORT] } satisfies Look)
    await title.click()
    await expect.poll(() => door.asked(), { timeout: 30_000 }).toBeGreaterThan(0)
    await page.waitForTimeout(600)
    const waiting = await theFrames(page)
    expect(waiting.filter((one) => one.drawn), told(waiting)).toEqual([])
    expect(waiting.at(-1)?.light, told(waiting)).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    door.letGo()
    await page.locator('.rp-title', { hasText: FIRST_TIME_REPORT }).waitFor({ timeout: 30_000 })
    expect(new URL(page.url()).hash).toBe(`#${recordPath(firstTimeReport, 'report')}`)
  } finally {
    door.letGo()
    await close()
  }
}, 120_000)
