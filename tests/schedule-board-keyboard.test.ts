// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ARROW KEYS THE BOARD ADVERTISES WORK MORE THAN ONCE, AND A BLOCK THAT LEAVES SAYS WHERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED IN CHROMIUM ON 18 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The board prints its own instructions: *"Move one with the left and right arrow keys; hold Shift
 * to move its last day."* A tester clicked a block, pressed ArrowLeft twice, and it moved once.
 * `document.activeElement` was the block button before the first press and BODY after it, so the
 * second and third presses reached nothing. A keyboard user got one nudge per mouse click, and the
 * tester nearly wrote the Shift gesture up as broken.
 *
 * The cause was the write, not the key. Every change on the board reads the week again, `useAsync`
 * goes back to its loading state while it does, and the whole board came off the screen for about
 * fifteen milliseconds — taking the focused button with it.
 *
 * The second defect is in the same gesture. Moving a block right until it crossed Sunday took it off
 * this week, and the board answered "Nothing is placed across this week yet." The work was on the
 * next week and it was correct, and nothing on the screen said so.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * There is no other way to ask the question. `document.activeElement` is a browser fact; so is what
 * a re-render does to the element holding focus. Rendering the board to markup would pass with
 * every part of this fix removed, because markup has no focus and never re-renders.
 * `tests/read-before-edit.test.ts` makes the same argument. Both use `liveApp` in
 * tests/helpers.ts, which is the one place the lifecycle of a test server is written down.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY EACH ONE WOULD HAVE CAUGHT THE DEFECT
 *
 *   focus is on a block after each of three presses    it was on BODY after the first
 *   it is the SAME block, named, at its new day        a lookalike would satisfy a weaker check
 *   the stored span moved one day per press            proves each press wrote, not just kept focus
 *   the board is never off the screen during a write   this is the mechanism that lost the focus
 *   a block pushed off the week says where it went     the board said the week held nothing
 *   that sentence carries the way to follow it         the tester had to guess where to look
 *   focus lands on that sentence                       the press that moved it went with it
 *
 * THE THIRD PRESS IS THE ONE THAT MATTERS MOST. The two blocks are placed so that the third press
 * moves the driven block in front of the other one, which changes the order the list is drawn in.
 * React then MOVES that button in the document, and moving a focused element blurs it — so a fix
 * that only stopped the board unmounting would pass presses one and two and fail this one.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { parsePeriod, periodKey } from '../src/shared/planning.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The week this test plans in, and the seven days it covers. */
const THIS_WEEK = periodKey('week', new Date())
const MONDAY = parsePeriod(THIS_WEEK)?.from
if (MONDAY === undefined) throw new Error(`${THIS_WEEK} is not a period this test can place on a calendar`)

/** One of this week's days, counted from its Monday. */
function dayOfWeek(n: number): string {
  const at = new Date(`${MONDAY}T00:00:00`)
  at.setDate(at.getDate() + n)
  return periodKey('day', at)
}

/**
 * WHERE THE TWO BLOCKS START, AND THE THIRD PRESS IS WHY.
 *
 * `DRIVEN` starts on Friday and `OTHER` sits on Wednesday. Three presses of ArrowLeft walk the
 * driven block Thursday, Wednesday, Tuesday — and on the third it starts before the other one, so
 * the board draws it first and React moves its button in the document. That is the press a fix that
 * only keeps the board mounted would still fail.
 */
const DRIVEN_FROM = 4
const OTHER_FROM = 2
const DRIVEN_TITLE = 'Test the gripper on the bench'
const OTHER_TITLE = 'Write up the calibration run'

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
/** The window id of the block the arrow keys drive, so its stored days can be read back. */
let drivenWindow = ''

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`)
  return res.json()
}

/** The span this window is stored with right now, straight from the server. */
async function storedSpan(id: string): Promise<{ startsOn: string; endsOn: string }> {
  const res = await fetch(
    `http://127.0.0.1:${apiPort}/api/planning/windows?from=${dayOfWeek(-7)}&to=${dayOfWeek(13)}`,
  )
  if (!res.ok) throw new Error(`reading the windows back answered ${res.status}`)
  const reply = (await res.json()) as { windows: { window: { id: string; startsOn: string; endsOn: string } }[] }
  const found = reply.windows.find((one) => one.window.id === id)
  if (found === undefined) throw new Error(`window ${id} is not stored on any of the three weeks around this one`)
  return { startsOn: found.window.startsOn, endsOn: found.window.endsOn }
}

beforeAll(async () => {
  app = await liveApp({ name: 'board-keys', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = async (title: string): Promise<string> => {
    const reply = (await post('/api/records', { kind: 'task', title, data: { state: 'doing' } })) as {
      record: { id: string }
    }
    return reply.record.id
  }
  const placed = async (recordId: string, from: number, to: number): Promise<string> => {
    const reply = (await post('/api/planning/windows', {
      recordId,
      startsOn: dayOfWeek(from),
      endsOn: dayOfWeek(to),
    })) as { window: { id: string } }
    return reply.window.id
  }

  drivenWindow = await placed(await made(DRIVEN_TITLE), DRIVEN_FROM, DRIVEN_FROM)
  await placed(await made(OTHER_TITLE), OTHER_FROM, OTHER_FROM)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What has the focus, said the way a failure message can be read. */
async function focused(): Promise<{ tag: string; className: string; label: string }> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (el === null) return { tag: 'nothing at all', className: '', label: '' }
    return {
      tag: el.tagName,
      className: String(el.className),
      label: el.getAttribute('aria-label') ?? (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  })
}

/** Open the week, and click the block the arrow keys will drive. */
async function openTheBoardAndClickTheDrivenBlock(): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/#/plan/${THIS_WEEK}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.px-pl-block', { timeout: 30_000 })
  await sleep(500)
  await page.locator('.px-pl-block', { hasText: DRIVEN_TITLE }).click()
  await sleep(300)
}

describe('the arrow keys the board prints in its own help line', () => {
  it('keeps the same block in focus across three presses, and moves it a day each time', async () => {
    await openTheBoardAndClickTheDrivenBlock()

    const first = await focused()
    expect(first.className, 'clicking a block did not put the focus on it').toContain('px-pl-block')
    expect(first.label).toContain(DRIVEN_TITLE)

    const seen: string[] = []
    for (const press of [1, 2, 3]) {
      await page.keyboard.press('ArrowLeft')
      // The write, the read that follows it, and the render. Long enough that a slow reply is not
      // read as a press that did nothing.
      await sleep(900)
      const now = await focused()
      seen.push(`${press}: ${now.tag}.${now.className} — ${now.label}`)
      expect(
        now.className,
        `after ArrowLeft press ${press} the focus is not on a block. What each press left:\n${seen.join('\n')}`,
      ).toContain('px-pl-block')
      expect(
        now.label,
        `after ArrowLeft press ${press} the focus is on a block, but not the one that was moved`,
      ).toContain(DRIVEN_TITLE)
    }

    // EVERY PRESS WROTE, and that is a separate fact from every press keeping the focus. A board
    // that held the focus and wrote nothing would satisfy the assertions above.
    expect(await storedSpan(drivenWindow), `three presses did not move the block three days.\n${seen.join('\n')}`).toEqual({
      startsOn: dayOfWeek(DRIVEN_FROM - 3),
      endsOn: dayOfWeek(DRIVEN_FROM - 3),
    })

    // And the two blocks are both still drawn, so nothing was lost to make the focus work.
    expect(await page.locator('.px-pl-block').count()).toBe(2)
  }, 120_000)

  it('never takes the board off the screen while it writes, so a fast press has something to land on', async () => {
    await openTheBoardAndClickTheDrivenBlock()

    await page.evaluate(() => {
      const seen: { inPage: boolean; board: boolean }[] = []
      const held = document.activeElement as HTMLElement
      const w = window as unknown as { __seen: typeof seen; __timer: ReturnType<typeof setInterval> }
      w.__seen = seen
      w.__timer = setInterval(() => {
        seen.push({ inPage: held.isConnected, board: document.querySelector('.px-pl-board') !== null })
      }, 5)
    })
    await page.keyboard.press('ArrowRight')
    await sleep(900)
    const watched = await page.evaluate(() => {
      const w = window as unknown as { __seen: { inPage: boolean; board: boolean }[]; __timer: ReturnType<typeof setInterval> }
      clearInterval(w.__timer)
      return {
        samples: w.__seen.length,
        withoutTheBlock: w.__seen.filter((one) => !one.inPage).length,
        withoutTheBoard: w.__seen.filter((one) => !one.board).length,
      }
    })

    // The watcher has to have watched. A run that sampled nothing would report zero of everything.
    expect(watched.samples, 'nothing was sampled while the write was in flight').toBeGreaterThan(40)
    expect(
      watched.withoutTheBoard,
      `the board came off the screen for ${watched.withoutTheBoard} of ${watched.samples} samples while it wrote`,
    ).toBe(0)
    expect(
      watched.withoutTheBlock,
      `the focused block left the document for ${watched.withoutTheBlock} of ${watched.samples} samples`,
    ).toBe(0)
  }, 120_000)
})

describe('a block pushed off the week says where it went', () => {
  it('names the work, names the week it landed on, and offers the way to follow it', async () => {
    await openTheBoardAndClickTheDrivenBlock()

    // Walk it left until it is off this week. It starts inside, so this is a real gesture and not a
    // written date: the same key the help line advertises, pressed until the block leaves.
    let said: { sentence: string; href: string | null; focusOnTheSentence: boolean; blocksLeft: number } | null = null
    for (let press = 0; press < 10; press += 1) {
      said = await page.evaluate(() => {
        const p = document.querySelector('.px-pl-wentto')
        if (p === null) return null
        const link = p.querySelector('a')
        return {
          sentence: (p.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: link === null ? null : link.getAttribute('href'),
          focusOnTheSentence: document.activeElement === p,
          blocksLeft: document.querySelectorAll('.px-pl-block').length,
        }
      })
      if (said !== null) break
      await page.keyboard.press('ArrowLeft')
      await sleep(900)
    }

    expect(said, 'the block left this week and the board said nothing about where it went').not.toBeNull()
    const answer = said as NonNullable<typeof said>

    // THE WORK, BY NAME. "A block has moved" would leave a person with two blocks to check.
    expect(answer.sentence).toContain(DRIVEN_TITLE)
    // WHERE IT WENT, against the week on screen rather than against today, because this board is
    // not told what day it is and "next week" would be false the moment you are reading October.
    expect(answer.sentence).toContain('the week before this one')
    // AND THE WAY TO FOLLOW IT, which is the half the tester had to guess.
    expect(answer.href, 'the sentence saying where the work went carries no way to get there').toBe(
      `#/plan/${periodKey('week', new Date(`${dayOfWeek(-7)}T00:00:00`))}`,
    )
    // THE PRESS THAT MOVED IT WENT WITH IT, so the keyboard has to be put somewhere it can read.
    expect(answer.focusOnTheSentence, 'focus was dropped when the block left the week').toBe(true)
    expect(answer.blocksLeft, 'the block is still drawn on a week it is no longer on').toBe(1)
  }, 120_000)
})
