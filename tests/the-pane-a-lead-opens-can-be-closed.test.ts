// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PANE A LEAD OPENS BESIDE THE CHAT CLOSES, AND IT STAYS INSIDE THE WINDOW. M95 AND M96.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO PROBLEMS
 * ---------------------------------------------------------------------------------------
 *
 * Problem `PVQI-FTYDRNG`:
 *
 *   A pop-up beside the chat could not be read or selected at its top.
 *
 * The message the secretary sent the owner popped up beside the chat, and it had so many lines that the top of it
 * could not be seen or selected. It was 69 lines of paths meant to be copied in one go, and the part
 * the owner needed most was the part that was off the screen.
 *
 * Problem `ELw0bZMLtmPf`, and a message:
 *
 *   The pop-up a lead opened had no close press, and only a reload closed it.
 *
 * The pane had no close press. Reloading the page was the only way to be rid of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE ANY OF THIS WAS BUILT
 * ---------------------------------------------------------------------------------------
 *
 * `.px-lead-here` in src/web/components/Leading.tsx is `position: fixed; bottom: 5rem` with no
 * height cap and no scrolling box, so a card taller than the window grows upward off the top of it
 * and a fixed box does not scroll with the page. And the pane the lead opens — `.px-lead-brought` —
 * carried exactly one press, the fold press, which the stylesheet hides above 60rem. So at a desk it
 * carried no press at all, and nothing but a reload or a project switch cleared the state behind it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * Both criteria are claims about what a person can see and reach: where the top of a fixed box lands
 * against the top of the window, whether the words inside it can be dragged over with a pointer, and
 * whether a press is drawn at a width. None of that can be read off markup. So this drives a real
 * browser, measures the boxes the browser really laid out, and selects with a real pointer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST WOULD CATCH
 * ---------------------------------------------------------------------------------------
 *
 *   1. Take the close press away — the state it was in until 9 September 2026 — and the first test
 *      fails at 1440, where the fold press beside it is not drawn.
 *   2. Stop Escape closing it and the second fails.
 *   3. Let closing send or unmark anything and the third fails: the pool changes.
 *   4. Drop the height cap and the fourth fails: the pane's top is above the top of the window.
 *   5. Drop the scrolling box and the fifth fails: the first line cannot be reached with a pointer
 *      and comes back unselected.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LEADING } from '../src/shared/messages.ts'

let app: LiveApp
let recordId = ''

/**
 * EIGHTY LINES, WHICH IS MORE THAN THE SIXTY-NINE THE OWNER WAS SENT. Each line says its own number, so a
 * test can name the line it looked at and a failure says which one it found instead.
 */
const HOW_MANY_LINES = 80
const LINES = Array.from(
  { length: HOW_MANY_LINES },
  (_, i) => `line ${String(i + 1).padStart(2, '0')}  ${THE_TEST_FIXTURE_ROOT}/PROJECTS/one/of/the/paths/to/copy-${String(i + 1)}`,
)
const WORDS = LINES.join('\n')
/** The first line, which is the one the owner could not see. */
const FIRST_LINE = LINES[0] as string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_GUIDE = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'lead-bot',
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** The guide offers to take the owner to the record, with eighty lines to say about it. */
async function lead(): Promise<string> {
  const said = await write(AS_THE_GUIDE, {
    kind: 'message',
    title: 'Come and read this',
    data: {
      body: WORDS,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId, workspaceId: 'default' } },
    },
  })
  const made = (await said.json()) as { record?: { id: string } }
  expect(said.status, JSON.stringify(made)).toBe(201)
  return made.record?.id ?? ''
}

/**
 * Open a page from nothing, at this width, and take the offer that is waiting.
 *
 * IT WAITS FOR EVERY EARLIER OFFER TO HAVE GONE, THEN LOADS THE PAGE FRESH. The press marks the
 * offer through the page, and a case moves on without waiting for that write. So an earlier case's
 * offer can still be drawn here when this one opens, and `.first()` pressed that earlier offer,
 * leaving the message this case is about unmarked. Waiting until the only message still waiting for
 * the reader is the one this case just made, and then loading the document again so the offers are
 * read at mount instead of held in a stale live list, is what makes the press certain.
 */
async function takeTheOffer(width: number): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  await expect
    .poll(async () => (await poolNow()).filter((one) => one.mark !== 'seen').length, {
      message: 'an earlier case left an offer waiting, so this case cannot tell which offer is its own',
      timeout: 15_000,
      interval: 50,
    })
    .toBe(1)
  await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
  await app.page.locator('.px-lead-go').first().click()
  await app.page.waitForSelector('.px-lead-brought', { timeout: 30_000 })
}

/** Every message in the pool, with the mark this reader has on it. Read from the server. */
async function poolNow(): Promise<{ id: string; mark: string; body: string }[]> {
  const res = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as {
    messages: { id: string; body: string; deliveries: { to: { kind: string; id: string }; mark: string }[] }[]
  }
  expect(res.status, JSON.stringify(held)).toBe(200)
  return held.messages.map((one) => ({
    id: one.id,
    body: one.body,
    mark: one.deliveries.find((d) => d.to.kind === 'person')?.mark ?? 'nobody',
  }))
}

/**
 * WHERE THE PANE IS, AND WHERE THE FIRST LINE OF ITS WORDS IS.
 *
 * The line's box is measured with a Range over its own characters, because a paragraph of eighty
 * pre-wrapped lines is one element and the first line of it has no box of its own to ask.
 */
async function whereItIs(firstLine: string): Promise<{
  paneTop: number
  paneBottom: number
  paneHeight: number
  windowHeight: number
  line: { top: number; bottom: number; left: number; height: number } | null
}> {
  return app.page.evaluate((first) => {
    const pane = document.querySelector('.px-lead-here')
    const rect = pane === null ? new DOMRect() : pane.getBoundingClientRect()
    const said = document.querySelector('.px-lead-brought .px-lead-said')
    const node = said?.firstChild ?? null
    let line: { top: number; bottom: number; left: number; height: number } | null = null
    if (node !== null && said instanceof HTMLElement && said.checkVisibility()) {
      // THE WORDS ARE SCROLLED BACK TO THE TOP FIRST, which is what a person does when they want the
      // beginning of a list. A box that cannot scroll ignores this and the measurement below says so.
      said.scrollTop = 0
      const range = document.createRange()
      range.setStart(node, 0)
      range.setEnd(node, first.length)
      const box = range.getBoundingClientRect()
      line = { top: box.top, bottom: box.bottom, left: box.left, height: box.height }
    }
    return {
      paneTop: rect.top,
      paneBottom: rect.bottom,
      paneHeight: rect.height,
      windowHeight: window.innerHeight,
      line,
    }
  }, firstLine)
}

/** Unfold the words where a narrow screen has folded them away. */
async function showTheWords(): Promise<void> {
  const said = app.page.locator('.px-lead-brought .px-lead-said').first()
  if (await said.isVisible()) return
  await app.page.locator('.px-lead-fold').first().click()
  await said.waitFor({ state: 'visible', timeout: 15_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'lead-pane', viewport: { width: 1440, height: 900 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Lead Bot',
    data: { handle: 'lead-bot', runtime: 'claude-code', state: 'active' },
  })
  expect(agent.status, await agent.text()).toBe(201)
  const note = await write(AS_THE_OWNER, {
    kind: 'note',
    title: 'The place the guide wants to show somebody',
    data: { date: '2026-09-09', body: 'A note the guide leads the reader to.' },
  })
  const made = (await note.json()) as { record?: { id: string } }
  expect(note.status, JSON.stringify(made)).toBe(201)
  recordId = made.record?.id ?? ''
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================================ M95, closing the pane

describe('the pane a lead opens can be closed', () => {
  it('draws a close press on it at 1440, where nothing else on the pane is drawn', async () => {
    await lead()
    await takeTheOffer(1440)

    const close = app.page.locator('.px-lead-brought .px-lead-close, .px-lead-following .px-lead-close').first()
    expect(await close.isVisible(), 'the pane a lead opened carries no close press at 1440').toBe(true)
    // WHAT IT IS CALLED ALOUD SAYS WHAT IT CLOSES, so a reader who cannot see it is not offered a
    // button called "Close" beside four other things that could be closed.
    expect(await close.getAttribute('aria-label')).toBe(LEADING.closeThePaneSaid('Lead Bot'))

    await close.click()
    await app.page.locator('.px-lead-brought').first().waitFor({ state: 'detached', timeout: 15_000 })
  }, 240_000)

  it('draws it at 390 as well, where the words themselves are folded away', async () => {
    await lead()
    await takeTheOffer(390)
    const close = app.page.locator('.px-lead-close').first()
    expect(await close.isVisible(), 'the pane carries no close press at 390').toBe(true)
    await close.click()
    await app.page.locator('.px-lead-brought').first().waitFor({ state: 'detached', timeout: 15_000 })
  }, 240_000)

  it('closes on Escape', async () => {
    await lead()
    await takeTheOffer(1440)
    await app.page.keyboard.press('Escape')
    await app.page.locator('.px-lead-brought').first().waitFor({ state: 'detached', timeout: 15_000 })
  }, 240_000)

  it('leaves the chat exactly as it was: nothing sent, nothing unmarked', async () => {
    const messageId = await lead()
    await takeTheOffer(1440)

    // THE CONTROL, READ FROM THE SERVER. Taking the offer marks it read; that has already happened
    // when the pane opens, and closing must not undo it or add anything beside it.
    //
    // THE MARK IS A ROUND TRIP BEHIND THE PANE, so this waits for it the way the rest of the file
    // waits for the pane rather than reading once and racing the write.
    await expect
      .poll(async () => (await poolNow()).find((one) => one.id === messageId)?.mark, {
        message: 'taking the offer did not mark it read',
        timeout: 15_000,
        interval: 50,
      })
      .toBe('seen')
    const before = await poolNow()

    await app.page.locator('.px-lead-close').first().click()
    await app.page.locator('.px-lead-brought').first().waitFor({ state: 'detached', timeout: 15_000 })
    // GIVEN TIME TO HAVE SENT SOMETHING, so "nothing was sent" is a measurement and not a race.
    await new Promise((r) => setTimeout(r, 1500))

    const after = await poolNow()
    expect(after.length, 'closing the pane sent a message').toBe(before.length)
    expect(after.find((one) => one.id === messageId)?.mark, 'closing the pane changed the mark on the message').toBe(
      'seen',
    )
  }, 240_000)
})

// ================================================================= M96, staying inside the window

describe('a long message beside the chat stays inside the window', () => {
  for (const width of [1440, 390]) {
    it(`keeps the pane inside the window at ${String(width)}, with eighty lines in it`, async () => {
      await lead()
      await takeTheOffer(width)
      await showTheWords()

      const { paneTop, paneHeight, windowHeight } = await whereItIs(FIRST_LINE)
      // THE TOP OF THE PANE IS ON THE SCREEN. Before the cap it was a negative number: the box is
      // fixed by its bottom edge and grew upward past the top of the window.
      expect(
        paneTop,
        `the pane's top is at ${String(Math.round(paneTop))}, above the top of the window`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        paneHeight,
        `the pane is ${String(Math.round(paneHeight))} tall in a window ${String(windowHeight)} tall`,
      ).toBeLessThanOrEqual(windowHeight)
    }, 240_000)

    it(`lets the first of the eighty lines be reached and selected at ${String(width)}`, async () => {
      await lead()
      await takeTheOffer(width)
      await showTheWords()

      const { line, paneTop } = await whereItIs(FIRST_LINE)
      expect(line, 'the words of the message are not on the page at all').not.toBeNull()
      const first = line as { top: number; bottom: number; left: number; height: number }
      expect(
        first.top,
        `the first line is at ${String(Math.round(first.top))}, off the top of the window`,
      ).toBeGreaterThanOrEqual(0)
      expect(first.top, 'the first line is not inside the pane').toBeGreaterThanOrEqual(paneTop - 1)

      // AND IT CAN BE SELECTED WITH A POINTER, which is the half of the problem that a box on the
      // screen does not answer on its own: it could not be seen and could not be
      // selected. A triple press selects the line under the pointer.
      await app.page.mouse.click(first.left + 8, first.top + first.height / 2, { clickCount: 3 })
      const selected = await app.page.evaluate(() => window.getSelection()?.toString() ?? '')
      expect(selected.trim(), `selecting the first line gave back "${selected.trim()}"`).toContain('line 01')
    }, 240_000)
  }
})
