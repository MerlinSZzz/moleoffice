// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME AND THE CHAT DO ONLY THE WORK THAT CHANGES WHAT IS ON SCREEN.
 *
 * Round 18 of wave 13w, on a decision. Home froze the owner's browser on another machine while
 * the server's CPU was low, so the page did too much work in the browser.
 * A measurement made in that round found where the work went, on an office the size of the live
 * one. Two causes were changed, and this file holds each of them by what the page
 * does, never by how long it took:
 *   - the chat asked for every agent's picture on its first open, 746 requests in the measurement,
 *     though some thirty rows are on screen. A picture is now asked for when its row comes near the
 *     screen (Avatar.tsx, `loading="lazy"`). Since round 20 of wave 13u the chat reads its contacts
 *     a page of 25 rows at a time and draws the rows it has read (src/web/lib/the-contact-list-held.ts);
 *     from round 9 of wave 13x until then a group drew 30 rows and 30 more when its end was scrolled to;
 *   - Home reads its lists again every minute, and each answer was put in place as a new object
 *     though it said the same thing, so every section drew itself again. An answer the same as the
 *     one on screen is now kept as it is (ui.tsx, `useAsync` and `theSameAnswer`).
 *
 * The agent column and the project cards on Home are also drawn again only when what they are handed
 * changed (HomeSections.tsx, `memo`). This file does not hold that: with it undone, the minute drew
 * 413 components again, which is under the bound below.
 *
 * It runs on tests/an-office-of-the-live-shape.ts: 400 agents and 1,500 open runs.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { anOfficeOfTheLiveShape } from './an-office-of-the-live-shape.ts'

let app: LiveApp
let remove: () => void = () => {}

beforeAll(async () => {
  const office = await anOfficeOfTheLiveShape()
  remove = office.remove
  app = await liveApp({ name: 'only-the-work-on-screen', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: office.file })
}, 600_000)

afterAll(async () => {
  await app?.stop()
  remove()
}, 60_000)

/**
 * A stand-in for React's developer-tools hook, which React calls after every commit in a built page
 * too. It keeps, for each commit, how many components drew themselves again (a first draw is not
 * counted), as that round's measurement counted them.
 */
function countTheRenders(): void {
  const w = window as unknown as Record<string, unknown>
  const counted = { commits: 0, rendered: 0 }
  w.counted = counted
  const walk = (fiber: Record<string, unknown> | null): void => {
    const stack: (Record<string, unknown> | null)[] = [fiber]
    while (stack.length > 0) {
      const one = stack.pop()
      if (one === null || one === undefined) continue
      const before = one.alternate as Record<string, unknown> | null
      const tag = one.tag as number
      // 0 a function, 1 a class, 11 forwardRef, 14 and 15 memo. Flag 1 is React's PerformedWork.
      if (before !== null && (tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15) && ((one.flags as number) & 1) === 1) counted.rendered += 1
      stack.push(one.sibling as Record<string, unknown> | null)
      if (before !== null && one.child === before.child) continue
      stack.push(one.child as Record<string, unknown> | null)
    }
  }
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Record<string, unknown> }) => {
      counted.commits += 1
      walk(root.current.child as Record<string, unknown> | null)
    },
  }
}

it('the chat asks for the pictures of the rows near the screen, not of every agent', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    let asked = 0
    page.on('request', (request) => {
      if (request.url().startsWith('data:')) return
      if (request.resourceType() === 'image' || new URL(request.url()).pathname.startsWith('/api/assets')) asked += 1
    })
    const contacts = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/messages/contact-list', { timeout: 60_000 })
    await page.goto(`${app.site}/?lang=en#/chat`)
    // EVERY ROW THE LIST HOLDS, read or not: the chat reads its contacts a page at a time since round 20 of wave 13u
    // and the door says how many there are in all.
    const handed = ((await (await contacts).json()) as { total: number }).total
    await page.locator('.px-chat-contact').first().waitFor({ state: 'visible', timeout: 60_000 })
    await page.waitForTimeout(5_000)
    const rows = await page.locator('.px-chat-list > li').count()
    console.log(`the chat: ${String(handed)} contacts in the list, ${String(rows)} rows drawn, ${String(asked)} pictures asked`)
    // THE OFFICE IS BIG ENOUGH THAT A PICTURE FOR EVERY CONTACT WOULD BREAK THE BOUND. The office has
    // 400 agents, and the chat is handed 442 contacts. This used to count the rows drawn,
    // 258 when every row was drawn at once; a group now draws 30 rows at a time, so the count is
    // taken from the contacts the chat was handed. The measurement asked for 746 pictures before
    // wave 13w's change and 194 after it; with 30 rows drawn it asks for 92. Since round 20 of wave
    // 13u the chat is handed a page of 25 rows, and the count is the list's own `total`. The chosen pictures in
    // this office do not exist, so a row near the screen makes three requests: its picture, the
    // second ask for it and the default picture.
    expect(handed).toBeGreaterThan(200)
    expect(asked).toBeLessThanOrEqual(250)
  } finally {
    await context.close()
  }
}, 120_000)

it('Home\'s minute re-read that answers what Home holds draws at most 450 components again', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    await page.clock.install()
    await page.addInitScript(countTheRenders)
    await page.goto(`${app.site}/?lang=en#/`)
    await page.locator('[data-home-section="agents"] [data-agent-count]').first().waitFor({ state: 'visible', timeout: 60_000 })
    // LET THE FIRST OPEN SETTLE: the page's own timers run for 20 s of its clock, a second at a time,
    // with real time between for the reads they start to answer.
    const settle = async (): Promise<void> => {
      for (let second = 0; second < 20; second += 1) {
        await page.clock.runFor(1_000)
        await page.waitForTimeout(250)
      }
    }
    await settle()
    const before = await page.evaluate(() => ({ ...(window as unknown as { counted: { commits: number; rendered: number } }).counted }))
    // THE MINUTE: nothing in the office changed, so every list Home reads again answers what it holds.
    await page.clock.runFor(40_000)
    await settle()
    const after = await page.evaluate(() => ({ ...(window as unknown as { counted: { commits: number; rendered: number } }).counted }))
    const commits = after.commits - before.commits
    const rendered = after.rendered - before.rendered
    console.log(`Home's minute: ${String(commits)} commits, ${String(rendered)} components drawn again; the first open drew ${String(before.rendered)} again`)
    expect(commits).toBeGreaterThan(0)
    // HOW MANY COMPONENTS HOME'S MINUTE MAY DRAW AGAIN. The time under the page changes each minute and
    // the frame reads its lists again, so the page and the side rail are drawn again: 357 at this round's
    // code. Before it, every answer the same as the one on screen was put in place as a new object, and
    // 655 were drawn again; with only that change undone, 578.
    expect(rendered).toBeLessThanOrEqual(450)
  } finally {
    await context.close()
  }
}, 180_000)

