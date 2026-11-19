// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTHING IS DRAWN OVER THE REVIEW COLUMN OR OVER WHAT A COMMENT IS ABOUT. Wave 13r round 17, piece 2, from round 16's
 * pictures:
 *
 * 1. The corner chat button covered the column's last lines. At 1440, with the page at its top and NOT at its end (the
 *    report is longer than the window, so the column is held to the window's foot), no line of the column's text may
 *    lie under the button wherever the column is scrolled. Design D draws that circle only while the chat is shut, a
 *    message waits and the window is 1024 pixels or wider: one made-up message waits here, so 1440 measures the room
 *    and 990, 660 and 390 check that no circle is drawn. The old expectation was a corner button at all four widths;
 *    the new one is the room at 1440 and no button at the narrower widths. At 390 the collecting sheet's state is
 *    still read, but a button that is not drawn cannot cover its last row. Round 18 (check omqAWsT5yd19):
 *    the 990 case passed without its fix, because the report was shorter than the window and the row's own foot
 *    held the column clear, and the 390 case measured the finished band after the send instead of the sheet.
 * 2. The comment box covered its paragraph at 1440, 990 and 660: placed at the pointer, its top lay on the line of
 *    words the person had just picked. The box, and the box that says the comment was written down, may not overlap
 *    the paragraph (`placeClearOfTheThing` in src/web/components/agent/TalkBox.tsx).
 * 3. The dashed tags in the send step (更早, 在另一次评审中) were tight in light Chinese: the dashed edge touched the
 *    characters. Each tag keeps at least 2 pixels between its edge and its words above and below, and 4 at the sides.
 *
 * Measured on a Chinese page in the light look, the case the pictures showed. Three-run proof (control, mutation,
 * restore) for each of the three is in round 17's report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putThePageAt, thePageScroller } from './the-page-scroller.ts'
import { THE_SPLIT_FROM } from '../src/web/lib/chat-split.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const WRITER = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const OTHER = { name: 'Glaze Reader', handle: 'glaze-reader' }
const RUN = '[data-text-field="data.blocks[#b-2].text"]'
/** The width from which the chat sits beside the page, taken out of its one home rather than copied. */
const WIDE_FROM = Number(/\d+/.exec(THE_SPLIT_FROM)?.[0])
const t = createI18n('zh').t

type Box = { left: number; top: number; right: number; bottom: number }

let app: LiveApp
/** What each width measured, read by the cases below. */
const seen = new Map<number, { talk: { talk: Box; paragraph: Box }[]; state: string; underTheButton: string[]; tags: { word: string; room: number[] }[]; circleDrawn: boolean }>()

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

async function aReport(title: string): Promise<string> {
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title,
    data: {
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The second firing held its temperature for the whole hour.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings, and the right one held.' },
        // LONGER THAN THE WINDOW AT EVERY WIDTH, so the page at its top is not at its end and the column is held to the
        // window's foot, where the button is. A shorter page ends the row above the button and proves nothing.
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `b-${String(i + 3)}`, type: 'text', heading: `Made-up firing ${String(i + 1)}`,
          text: 'The kiln was loaded with the same twelve test tiles, fired to the same cone, and left to cool overnight with the door shut; nothing about this firing was measured, it is made up to make the page long.',
        })),
      ],
    },
  }, AS(WRITER.handle))
  return report.record.id
}

/** The comment box and the paragraph it is about, measured in one frame. */
async function talkAndParagraph(): Promise<{ talk: Box; paragraph: Box }> {
  return app.page.evaluate((sel) => {
    const box = (el: Element | null): Box => {
      if (el === null) throw new Error('the comment box or its paragraph is not drawn')
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return { talk: box(document.querySelector('.px-talk')), paragraph: box(document.querySelector(sel)) }
  }, RUN)
}

/**
 * Every line of the column's text that is in view and lies under the corner button, with the column scrolled to each
 * place in `places` (a share of how far it scrolls: 0 its top, 1 its end). The page is put at its top first, and two
 * frames pass so the column has read where it fits again (useWhereThePaneFits reads on the frame after a scroll).
 */
async function textUnderTheButton(places: number[]): Promise<string[]> {
  await putThePageAt(app.page, 0)
  return app.page.evaluate(async (shares) => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const pane = document.querySelector<HTMLElement>('.px-pane')
    const button = document.querySelector('.px-chat-circle')
    if (pane === null) throw new Error('the review column is not drawn')
    if (button === null) throw new Error('the corner chat button is not drawn')
    const out: string[] = []
    for (const share of shares) {
      pane.scrollTop = share * (pane.scrollHeight - pane.clientHeight)
      const b = button.getBoundingClientRect()
      const shown = pane.getBoundingClientRect()
      const walk = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT)
      for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
        if ((node.textContent ?? '').trim() === '') continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) {
          // ONLY THE PART OF A LINE THE COLUMN SHOWS. A line cut by the column's foot is hidden below it, and round
          // 19 found one at 990 whose hidden part reached 0.375 pixels into the button's box.
          const top = Math.max(r.top, shown.top)
          const bottom = Math.min(r.bottom, shown.bottom)
          if (r.width === 0 || bottom <= top) continue
          if (r.left < b.right && r.right > b.left && top < b.bottom && bottom > b.top) out.push(`scrolled ${String(share)}: ${(node.textContent ?? '').trim().slice(0, 40)}`)
        }
      }
    }
    return out
  }, places)
}

/**
 * Wait for the column to be drawn with nothing in it still loading, and for the two frames on which it reads where it
 * fits again (`useWhereThePaneFits` reads on the frame after a scroll or a change).
 *
 * NOTHING STILL LOADING (wave 13r round AF). The comments a review did not take come from a second request, asked
 * again after every read of the review, and the column draws a loading line until it answers. On a slower machine the
 * state was measured while that line was there: the column held none of the six earlier comments, did not scroll, and
 * every desk width failed its precondition. Run on one core of this machine, it failed the same way, and the rows came
 * a few milliseconds later. After a send, call it only once the column drawn from the review read again is there: the
 * column before that read has no loading line either, and the one built after it starts with one.
 */
async function theColumnHasReadWhereItFits(): Promise<void> {
  await app.page.locator('.px-pane').waitFor({ timeout: 30_000 })
  await app.page.waitForFunction(() => document.querySelector('.px-pane .px-loading') === null, undefined, { timeout: 30_000 })
  await twoFrames()
}

/** The box is drawn where it fits once the words are in it, and that is read on the next frame. */
async function theBoxHasReadWhereItFits(words: string): Promise<void> {
  await app.page.waitForFunction(
    (text) => document.querySelector<HTMLTextAreaElement>('.px-talk textarea')?.value === text,
    words,
    { timeout: 15_000 },
  )
  await twoFrames()
}

async function twoFrames(): Promise<void> {
  await app.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

/** One review on a new report at this width: a comment through the right-click box, Start review, and Send. */
async function oneReviewAt(width: number): Promise<void> {
  const phone = width === 390
  await app.page.setViewportSize({ width, height: phone ? 844 : 1000 })
  const reportId = await aReport(`Made-up kiln report at ${String(width)}`)
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=zh#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  // THE BREAKPOINT IS READ FROM ITS ONE HOME, not copied as a number that can change, and in the browser after the page
  // has its size. Where it is wide the room under the circle is measured; where it is not, the case checks there is none.
  const wide = await app.page.evaluate((query) => window.matchMedia(query).matches, THE_SPLIT_FROM)
  await app.page.locator(RUN).waitFor({ timeout: 30_000 })
  const at = await app.page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, RUN)
  await app.page.mouse.click(at.x, at.y, { button: 'right' })
  await app.page.locator('.px-talk textarea').waitFor({ timeout: 20_000 })
  await app.page.locator('.px-talk textarea').fill('编造的评论：哪一块搁板下沉了？')
  await theBoxHasReadWhereItFits('编造的评论：哪一块搁板下沉了？')
  const talk = [await talkAndParagraph()]
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.startReview'), exact: true }).click()
  await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  await theColumnHasReadWhereItFits()
  talk.push(await talkAndParagraph())
  await app.page.locator('.px-talk').getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
  await app.page.locator('.px-talk').waitFor({ state: 'detached', timeout: 30_000 })

  const review = app.page.locator('[data-part="your-review"]')
  await review.waitFor({ timeout: 30_000 })
  // THE TRAY'S ROW CARRIES CHANGE AT EVERY WIDTH, and that press also opens the list, where the contact picker is.
  await app.page.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.b.change'), exact: true }).click()
  const contacts = review.locator('.px-review-contacts')
  await contacts.locator('.px-talk-contact').first().waitFor({ timeout: 30_000 })
  const chosen = app.page.waitForResponse((r) => r.url().includes('/recipient') && r.request().method() === 'POST')
  await contacts.locator('.px-talk-contact', { hasText: OTHER.name }).first().click()
  expect((await chosen).status()).toBe(200)
  await review.locator('[data-part="goes-to"]').getByText(t('review.b.goingTo', { name: OTHER.name }), { exact: true }).waitFor({ timeout: 30_000 })
  await theColumnHasReadWhereItFits()

  // ON A PHONE, THE COLLECTING SHEET AT THE WINDOW'S FOOT, open, before the send, scrolled to its end only: half way
  // the button may cover a line, which a decision's point 4 permits.
  let state = ''
  let underTheButton: string[] = []
  if (phone) {
    await review.locator('.px-b-more > summary').click()
    await review.locator('.px-b-more-body').locator('*').first().waitFor({ timeout: 30_000 })
    await theColumnHasReadWhereItFits()
    state = await app.page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('.px-pane')
      if (pane === null) return 'no review column is drawn'
      const foot = pane.getBoundingClientRect().bottom
      return pane.querySelector('.px-b-bar') !== null && pane.dataset['sheet'] === '1' && getComputedStyle(pane).position === 'fixed' && Math.abs(foot - window.innerHeight) < 1 && pane.scrollHeight > pane.clientHeight
        ? 'the collecting sheet, open at the window\'s foot'
        : `not the open sheet that scrolls: bar ${String(pane.querySelector('.px-b-bar') !== null)}, sheet ${String(pane.dataset['sheet'])}, ${getComputedStyle(pane).position}, foot ${String(foot)} of ${String(window.innerHeight)}, ${String(pane.scrollHeight)} in ${String(pane.clientHeight)}`
    })
    if (wide) {
      underTheButton = await textUnderTheButton([1])
      // THE SHEET'S LAST ROW, scrolled to its end: the foot of every line of words and every control in view, against the
      // button's top.
      const lastRow = await app.page.evaluate(() => {
        const pane = document.querySelector<HTMLElement>('.px-pane')
        const button = document.querySelector('.px-chat-circle')
        if (pane === null || button === null) throw new Error('the sheet or the corner button is not drawn')
        pane.scrollTop = pane.scrollHeight
        const shown = pane.getBoundingClientRect()
        const feet: number[] = []
        const walk = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT)
        for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
          if ((node.textContent ?? '').trim() === '') continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const r of range.getClientRects()) if (r.width > 0 && r.bottom > shown.top && r.top < shown.bottom) feet.push(r.bottom)
        }
        for (const control of pane.querySelectorAll('button, input, textarea, select, summary')) {
          const r = control.getBoundingClientRect()
          if (r.width > 0 && r.bottom > shown.top && r.top < shown.bottom) feet.push(r.bottom)
        }
        return { foot: Math.max(...feet), buttonTop: button.getBoundingClientRect().top }
      })
      if (lastRow.foot > lastRow.buttonTop) underTheButton.push(`the sheet's last row ends at ${String(lastRow.foot)}, below the button's top at ${String(lastRow.buttonTop)}`)
    } else {
      expect(await app.page.locator('.px-chat-circle').count(), 'the corner circle was drawn below 1024 pixels').toBe(0)
    }
  }
  const sent = app.page.waitForResponse((r) => r.url().includes('/send') && r.request().method() === 'POST')
  await app.page.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.tray.send'), exact: true }).click()
  expect((await sent).status()).toBe(200)
  // THE SENT ROW IS SHUT, with Close beside Show comments. The review it sent is opened to read the receipt.
  const sentBar = app.page.locator('[data-part="your-review-bar"]')
  await sentBar.getByRole('button', { name: t('review.tray.close'), exact: true }).waitFor({ timeout: 30_000 })
  await sentBar.getByRole('button', { name: t('review.tray.show'), exact: true }).click()
  await app.page.locator('.px-pane .px-send-said').first().waitFor({ timeout: 30_000 })
  // The answer to the send is drawn at once; the review is then read again and the column built again, saying it was sent.
  await app.page.locator('.px-pane [data-part="send-the-review"] .px-org-head').filter({ hasText: t('review.pane.send.gone') }).waitFor({ timeout: 30_000 })
  await theColumnHasReadWhereItFits()

  // AT THE DESK, THE PAGE AT ITS TOP AND NOT AT ITS END, and every line of the column's text in view against the corner
  // button, with the column scrolled from its top to its end in twentieths. Round 16's picture caught it half way: the
  // column ran to the window's foot.
  if (!phone) {
    if (wide) {
      await putThePageAt(app.page, 0)
      const scroller = await thePageScroller(app.page)
      try {
        state = await app.page.evaluate(async (scroller) => {
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
          const pane = document.querySelector<HTMLElement>('.px-pane')
          const button = document.querySelector('.px-chat-circle')
          if (pane === null || button === null) return 'the column or the corner button is not drawn'
          const left = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
          const room = window.innerHeight - button.getBoundingClientRect().top
          if (pane.scrollHeight <= pane.clientHeight) return 'the column does not scroll'
          return left > room ? 'the page at its top, not at its end' : `the page is ${String(left)}px from its end, within the button's ${String(room)}px`
        }, scroller)
      } finally {
        await scroller.dispose()
      }
      underTheButton = await textUnderTheButton(Array.from({ length: 21 }, (_, i) => i / 20))
    } else {
      // THE PHONE'S BAR IS AT THE WINDOW'S TOP, and design D draws no circle in the corner below 1024 pixels.
      expect(await app.page.locator('.px-chat-circle').count(), 'the corner circle was drawn below 1024 pixels').toBe(0)
    }
  }

  // EVERY DASHED TAG IN THE COLUMN: the room between its edge and its words, top, right, bottom and left.
  const tags = await app.page.evaluate(() =>
    [...document.querySelectorAll('.px-pane .px-rev-why')].map((tag) => {
      const range = document.createRange()
      range.selectNodeContents(tag)
      const words = range.getBoundingClientRect()
      const edge = tag.getBoundingClientRect()
      const line = Number.parseFloat(getComputedStyle(tag).borderTopWidth)
      return {
        word: (tag.textContent ?? '').trim(),
        room: [words.top - edge.top - line, edge.right - line - words.right, edge.bottom - line - words.bottom, words.left - edge.left - line],
      }
    }),
  )
  const circleDrawn = (await app.page.locator('.px-chat-circle').count()) > 0
  seen.set(width, { talk, state, underTheButton, tags, circleDrawn })
}

beforeAll(async () => {
  app = await liveApp({ name: 'nothing-covers-the-review-column', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  await app.page.addInitScript(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  for (const agent of [WRITER, OTHER]) {
    await post('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
    await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${agent.name} has a made-up note.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(agent.handle))
  }
  // SIX EARLIER COMMENTS ON OTHER REPORTS, so the column is long enough to scroll from the first width on, as it was in
  // round 16's picture.
  for (let i = 1; i <= 6; i += 1) {
    const other = await aReport(`Made-up earlier kiln report ${String(i)}`)
    await post('/api/records', {
      kind: 'annotation',
      title: `earlier comment ${String(i)}`,
      data: { body: `编造的更早评论 ${String(i)}：搁板有没有裂开？`, context: { target: { kind: 'record', recordId: other, workspaceId: 'default' } } },
    })
  }
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
  for (const width of [1440, 990, 660, 390]) await oneReviewAt(width)
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

describe('nothing covers the review column, on a light Chinese page', () => {
  for (const width of [1440, 990, 660, 390]) {
    const wide = width >= WIDE_FROM
    const sheet = "the collecting sheet, open at the window's foot"
    const where = width === 390 ? sheet : 'the page at its top, not at its end'
    it(
      wide
        ? `at ${String(width)}, with ${where}, the column's last lines are clear of the corner button`
        : `at ${String(width)}, no corner button is drawn while a message waits`,
      () => {
        const one = seen.get(width)
        expect(one, `nothing was measured at ${String(width)}`).toBeDefined()
        expect(one?.circleDrawn, `the corner button drawn at ${String(width)} is not what the design says`).toBe(wide)
        if (wide) {
          expect(one?.state, `the state measured at ${String(width)}`).toBe(where)
          expect(one?.underTheButton, `text under the corner button at ${String(width)}`).toEqual([])
        } else if (width === 390) {
          // THE SHEET'S STATE IS STILL READ at 390, but the button that used to be measured against is not drawn.
          expect(one?.state, `the state measured at ${String(width)}`).toBe(sheet)
        }
      },
    )
  }

  for (const width of [1440, 990, 660]) {
    it(`at ${String(width)}, the comment box and the written-down box leave their paragraph in view`, () => {
      const one = seen.get(width)
      expect(one).toBeDefined()
      if (one === undefined) return
      one.talk.forEach((both, i) => {
        expect(overlaps(both.talk, both.paragraph), `${i === 0 ? 'the comment box' : 'the written-down box'} covers its paragraph at ${String(width)}: ${JSON.stringify(both)}`).toBe(false)
      })
    })
  }

  it('draws dashed tags in the send step, and each keeps room around its words', () => {
    const tags = [...seen.values()].flatMap((one) => one.tags)
    expect(tags.length, 'no dashed tag was drawn, so nothing was measured').toBeGreaterThan(0)
    for (const tag of tags) {
      const [top, right, bottom, left] = tag.room
      expect(Math.min(top ?? 0, bottom ?? 0), `${tag.word}: room above and below ${JSON.stringify(tag.room)}`).toBeGreaterThanOrEqual(2)
      expect(Math.min(left ?? 0, right ?? 0), `${tag.word}: room at the sides ${JSON.stringify(tag.room)}`).toBeGreaterThanOrEqual(4)
    }
  })
})
