// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE NEVER SAYS IT HAS FINISHED DRAWING WHILE IT IS STILL ABOUT TO ASK FOR MORE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, AND WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `src/web/lib/ready.ts` puts `data-mole-office-ready` on the html element, holding the address the
 * page has finished drawing, and every browser test and every photographing tool waits on it. A
 * mark written early is a photograph of a half-drawn page, or an assertion made against one, and it
 * looks like a layout fault rather than a timing one.
 *
 * It was written early. Measured on 4 September 2026 over twenty hash navigations, each from a
 * document freshly loaded on another page: NINE marked ready and then drew the page. A record page
 * went from 1,215 characters at the mark to 2,108 two seconds later. It is on the record as a
 * problem.
 *
 * Three separate ways, all of them the same shape:
 *
 *   1. The mark went on in the gap after the address changed and before the new page had asked for
 *      anything, because "nothing is in flight" is true of a page that has not started either.
 *   2. The page marked, then asked for something else — a plan page for `/api/work`, a record page
 *      for its history — because the two turns of the event loop it waited were not enough for
 *      React to get from one reply to the effect that starts the next request.
 *   3. The page marked and then grew or shrank while asking for NOTHING, which is React finishing a
 *      render on the far side of a paint.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS FILE TELLS AN EARLY MARK FROM A LATE ONE
 * ---------------------------------------------------------------------------------------
 *
 * Two cases remain, each in a browser of its own:
 *
 *   - THE STREAM'S LATE ANSWER. The page asks the server whether it missed any event while its
 *     stream was connecting. The test forces that answer to say yes and to come late, and then
 *     checks that the page asked for nothing after it put its mark on. No other test forces a late
 *     stream answer.
 *   - THE ADDRESS RULE. A page that had to ask for something for an address cannot have finished
 *     drawing it before it asked. The test opens a record page from another page, with the browser
 *     slowed down, and checks that at least one request was made for the new address by the time
 *     the mark names it.
 *
 * The twenty-first-visit sweep was taken out: its own notes record that cutting the quiet wait from
 * 60 ms to 1 ms left all twenty visits green, so it proved nothing these two cases do not.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, READY_ATTRIBUTE, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let reportId = ''

/** How long after the mark the page is watched for it asking for more. */
const WATCH_FOR_MS = 1200

/**
 * How late the stream's first question is answered in the stream case. It is longer than the whole
 * of a first visit on a quiet machine, so a mark that does not wait for the answer goes on first.
 */
const THE_ANSWER_COMES_AFTER_MS = 1500

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  app = await liveApp({ name: 'mark-never-early', viewport: { width: 1440, height: 972 } })
  const report = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report to open from cold',
      data: {
        for: 'the check that the mark is not early',
        date: '2026-09-04',
        blocks: [
          { id: 'b-1', type: 'text', heading: 'One', text: 'A paragraph with enough words in it to matter.' },
          { id: 'b-2', type: 'text', heading: 'Two', text: 'A second paragraph with enough words in it.' },
        ],
      },
    }),
  })
  const written = (await report.json()) as { record?: { id: string } }
  expect(report.status, JSON.stringify(written)).toBe(201)
  reportId = written.record?.id ?? ''
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the mark on the html element', () => {
  it('waits for the stream to say whether it missed anything, however late that answer comes', async () => {
    /**
     * THE DOOR A PROBLEM FOUND OPEN, FORCED SHUT.
     *
     * When a page's event stream opens, the page asks the server whether it missed any event while
     * it was connecting (`GET /api/events/state`). If the answer is yes, or nobody can say, every
     * list panel reads its list once more. Neither the stream nor that question goes through the
     * app's one transport, so the mark used to go on without them. On a quiet machine the answer came
     * 30 to 100 ms before the mark; on a busy one it can come after, and the page then asks for more
     * after it said it had finished.
     *
     * HERE THE ANSWER IS FORCED LATE AND FORCED TO BE YES. This is a stand-in reply written by the
     * test, not the server's: it says one event reached the page while it connected, which is the
     * answer that makes the panels read again. The page must put its mark on only after those reads.
     */
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 972 } })
    await context.addInitScript(() => {
      const asked: string[] = []
      ;(window as unknown as { ASKED: string[] }).ASKED = asked
      const was = window.fetch.bind(window)
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const url = String(args[0])
        if (!url.includes('/api/events')) asked.push(url.slice(url.lastIndexOf('/api')))
        return was(...args)
      }
    })
    const page = await context.newPage()
    let answered = 0
    await page.route('**/api/events/state**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, THE_ANSWER_COMES_AFTER_MS))
      answered += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ whileConnecting: { reached: 1 } }),
      })
    })
    try {
      await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
      await page.waitForFunction(
        (attribute) => document.documentElement.getAttribute(attribute) === window.location.hash,
        READY_ATTRIBUTE,
        { timeout: 30_000 },
      )
      const atTheMark = await page.evaluate(() => (window as unknown as { ASKED: string[] }).ASKED.length)
      const answeredAtTheMark = answered
      // WATCHED UNTIL AFTER THE LATE ANSWER, and then through the quiet watch. A mark that did not
      // wait is only caught once the answer has come and the reads it causes have left.
      const watchUntil = Date.now() + THE_ANSWER_COMES_AFTER_MS * 4
      while (answered === 0 && Date.now() < watchUntil) await page.waitForTimeout(50)
      expect(answered, 'the page never asked whether it missed anything, so this case proved nothing').toBeGreaterThan(0)
      await page.waitForTimeout(WATCH_FOR_MS)
      const asked = await page.evaluate(() => (window as unknown as { ASKED: string[] }).ASKED)
      const askedAfter = asked.slice(atTheMark)
      expect(
        askedAfter,
        `the page said it had finished, and then asked for more once the late answer came ` +
          `(${String(answeredAtTheMark)} answer${answeredAtTheMark === 1 ? '' : 's'} had come by the mark)`,
      ).toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it('says an address only once the page has asked for something for it', async () => {
    /**
     * THE CONTRACT THE FIRST OF THE THREE FAULTS BROKE, WRITTEN DOWN.
     *
     * A page that asks for something for an address has finished drawing it only once it has asked.
     * The gap is between the address changing and the new page's first request, and the mark went on
     * inside it. A move that the shell draws with the page already on screen asks for nothing, and
     * is marked once the shell has drawn the new address; that case is
     * tests/a-page-that-asks-for-nothing-is-marked-without-the-machine-read.test.ts. This one opens
     * a record page, which asks for its record.
     *
     * The flag that stands for "the shell drew the new address" never cleared at the address
     * change: this stayed green, for the reason below.
     *
     * WHAT THIS TEST CATCHES AND WHAT IT DOES NOT, MEASURED. Taking the rule out of `ready.ts` and
     * leaving the quiet wait in does NOT make this go red, even with the browser slowed down twenty
     * times: React crosses that gap in well under the sixty milliseconds the quiet wait allows, so
     * the wait closes the same door. The twenty-visit sweep this file used to hold was said to
     * catch the quiet wait's mutation. Measured again on 29 September 2026, it did not: with
     * `QUIET_MS` cut from 60 to 1, all twenty stayed green, and so they did with the browser slowed
     * down six and twenty times.
     * This states the contract so that a change which reopens the gap further — a slower mount, a
     * route that waits before asking — is caught rather than measured again by hand.
     */
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 972 } })
    await context.addInitScript(() => {
      const asked: string[] = []
      ;(window as unknown as { ASKED: string[] }).ASKED = asked
      const was = window.fetch.bind(window)
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const url = String(args[0])
        if (!url.includes('/api/events')) asked.push(url.slice(url.lastIndexOf('/api')))
        return was(...args)
      }
    })
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const slow = await context.newCDPSession(page)
      await slow.send('Emulation.setCPUThrottlingRate', { rate: 20 })
      const before = await page.evaluate(() => (window as unknown as { ASKED: string[] }).ASKED.length)
      await page.evaluate((to) => {
        window.location.hash = to.slice(1)
      }, `#/r/${reportId}`)
      const whenItSaidSo = await page.waitForFunction(
        ([attribute, since]) => {
          if (document.documentElement.getAttribute(attribute as string) !== window.location.hash) return null
          return { askedSince: (window as unknown as { ASKED: string[] }).ASKED.length - (since as number) }
        },
        [READY_ATTRIBUTE, before] as [string, number],
        { polling: 5, timeout: 60_000 },
      )
      const said = (await whenItSaidSo.jsonValue()) as { askedSince: number }
      // The mark is the new address, so the page says it has finished drawing it. It cannot have
      // finished drawing a page it never asked for anything for.
      expect(said.askedSince).toBeGreaterThan(0)
      await slow.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    } finally {
      await context.close()
    }
  }, 180_000)
})
