// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER SENDS A REVIEW FROM A REPORT, PRESS BY PRESS. Problem IsfgDzJ2yrAB, wave 13r round 20, piece 1. On 3 and
 * 4 October the owner reviewed a report and could not send their review: at choosing who gets it, pressing a contact did
 * nothing, and their comments stayed collected and unsent. The owner also found every press in the column slow to open.
 *
 * In a real browser against a Mole Office of its own, this does what the owner did, with nothing written through the API on
 * their behalf: on a report, it selects words and right-clicks them, writes a comment, presses "Start review" and "Back
 * to reading", presses "Change" beside who the review goes to, presses an agent in the contacts, and presses "Send". The
 * review is then sent, to that agent. At 1440 and at 390 in English, the page the owner used; light.
 *
 * EACH PRESS IS TIMED, from the press to the thing it opens being drawn, and the times are printed. The time includes
 * the test driver's own round trip to the browser. They are taken on an office of thirty contacts and twenty earlier
 * reviews, not on an empty one. Nothing here fails on a time: round 20's report says what they were.
 *
 * With TEST_SHOTS set, the last case does the same at 1440, 990, 660 and 390, light and dark, in English, and
 * photographs the window at each step into the folder `r20-send` under it.
 *
 * AFTER SEND, WHAT HAPPENED IS IN SIGHT. The pictures of this round showed the line "This review has gone" at the
 * column's foot, with the sentence saying what was sent below it and out of sight, and on a phone the band's first line
 * alone. Each case now asks, once the pane has settled, that the line and that sentence are drawn in the window, and at
 * a desk that the page the owner was reading has not moved.
 *
 * Three-run proofs (control, mutation, restore) are in round 20's report. The first mutation: a contact press stores
 * nothing, which is the owner's symptom (`choose` in ReviewBar.tsx no longer asks the server), and every case fails at
 * the press. The second: the line after a send is brought only into the nearest view again, without the pane being
 * scrolled first, and every case fails at what is in sight.
 *
 * Everything here is made up.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { whereThePageIs } from './the-page-scroller.ts'
import { setTheReviewTraysList } from './the-review-trays-list.ts'
import { testShots } from './where-shots-go.ts'

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
const SHOTS = testShots('r20-send')

type Lang = 'en' | 'zh'
type Look = 'light' | 'dark'
/** One press: what was pressed, and how long until what it opens was drawn, in milliseconds. */
type Timed = { press: string; ms: number }

let app: LiveApp

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
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `b-${String(i + 3)}`, type: 'text', heading: `Made-up firing ${String(i + 1)}`,
          text: 'The kiln was loaded with the same twelve test tiles, fired to the same cone, and left to cool overnight with the door shut; nothing about this firing was measured.',
        })),
      ],
    },
  }, AS(WRITER.handle))
  return report.record.id
}

/**
 * One review sent from a new report, as the owner sends one. Answers the review's id, as the press on a contact named
 * it, and the time of each press. `shot`, when given, photographs the window at each step.
 */
async function sendOne(width: number, lang: Lang, look: Look, shot?: (step: string) => Promise<void>): Promise<{ reviewId: string; times: Timed[] }> {
  const t = createI18n(lang).t
  const phone = width <= 390
  const page = app.page
  const times: Timed[] = []
  const timed = async (press: string, act: () => Promise<void>, drawn: () => Promise<unknown>): Promise<void> => {
    const from = performance.now()
    await act()
    await drawn()
    times.push({ press, ms: Math.round(performance.now() - from) })
  }

  await page.setViewportSize({ width, height: phone ? 844 : 1000 })
  const reportId = await aReport(`Made-up kiln report, ${String(width)} ${lang} ${look}`)
  await page.goto(`${app.site}/#/`)
  await waitForThePage(page, 60_000)
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${lang}#/r/${reportId}`)
  await waitForThePage(page, 60_000)
  await page.locator(RUN).waitFor({ timeout: 30_000 })

  // SOME WORDS OF THE SECOND PARAGRAPH, SELECTED AND RIGHT-CLICKED, as a person comments on a report.
  const at = await page.evaluate((sel) => {
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
  const talk = page.locator('.px-talk')
  await timed('right-click the words', () => page.mouse.click(at.x, at.y, { button: 'right' }), () => talk.locator('textarea').waitFor({ timeout: 20_000 }))
  await talk.locator('textarea').fill(lang === 'zh' ? '编造的评论：哪一块搁板下沉了？' : 'A made-up comment: which shelf sagged?')
  await shot?.('1-comment-written')

  await timed(
    'Start review',
    () => talk.getByRole('button', { name: t('talk.startReview'), exact: true }).click(),
    () => page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 }),
  )
  await shot?.('2-review-started')

  const review = page.locator('[data-part="your-review"]')
  await timed(
    'Back to reading',
    () => talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click(),
    async () => {
      await talk.waitFor({ state: 'detached', timeout: 30_000 })
      await review.waitFor({ timeout: 30_000 })
    },
  )
  await shot?.('3-the-column')

  // WHO THE REVIEW GOES TO: Change, on the tray's row at the window's foot at every width (wave 13y round 146, item
  // 73a). It opens the tray's list with the contacts in it; the Change beside the recipient line is not drawn in the tray.
  const contacts = review.locator('.px-review-contacts')
  const row = page.locator('[data-part="your-review-bar"]')
  const change = row.getByRole('button', { name: t('review.b.change'), exact: true })
  await timed('Change', () => change.click(), () => contacts.locator('.px-talk-contact', { hasText: OTHER.name }).first().waitFor({ timeout: 30_000 }))
  await shot?.('4-contacts')

  const chosen = page.waitForResponse((r) => /\/api\/reviews\/[^/]+\/recipient$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
  await timed(
    `the contact ${OTHER.name}`,
    () => contacts.locator('.px-talk-contact', { hasText: OTHER.name }).first().click(),
    () => review.locator('[data-part="goes-to"]').getByText(t('review.b.goingTo', { name: OTHER.name }), { exact: true }).waitFor({ timeout: 30_000 }),
  )
  const answered = await chosen
  expect(answered.status(), await answered.text()).toBe(200)
  const reviewId = new URL(answered.url()).pathname.split('/')[3] ?? ''
  await shot?.('5-contact-chosen')

  const readingAt = Math.round(await whereThePageIs(page))
  const sent = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/reviews/${reviewId}/send` && r.request().method() === 'POST')
  // THE TRAY'S OWN SEND REVIEW, at every width, once its row says the review holds the one comment. Send N at the foot
  // of the list is not drawn in the tray.
  expect(await row.locator('.px-b-bar-says').textContent()).toContain(t('review.b.comments', { n: 1 }))
  await timed(
    'Send',
    () => row.getByRole('button', { name: t('review.tray.send'), exact: true }).click(),
    () => page.locator('[data-part="your-review-sent"] [data-part="your-review-bar"]').waitFor({ timeout: 30_000 }),
  )
  expect((await sent).status()).toBe(200)
  // THE SENT REVIEW STAYS IN THE TRAY AS ONE ROW (wave 13y round 146, item 73a); its Show comments opens the whole sent
  // review, with the line "This review has gone" and the sentence saying what was sent.
  await setTheReviewTraysList(page, 'open')
  // WHAT HAPPENED IS IN SIGHT: the line "This review has gone" and the sentence under it saying what was sent, each
  // drawn on top at its own middle, so inside the window and the column and under nothing. At a desk the page the owner was
  // reading has not moved; on a phone the band above the page is brought into the window. ASKED ONCE THE PANE HAS
  // SETTLED: the column draws its list of comments not in the review a moment after the send, and the line is kept in
  // view for two seconds while it does. Asked before then, the list was not drawn yet and the column was short.
  await page.waitForTimeout(2500)
  await expect
    .poll(
      async () => ({
        ...(await page.evaluate(() => {
          const seen = (el: Element | null): boolean => {
            if (el === null) return false
            const r = el.getBoundingClientRect()
            const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + Math.min(10, r.height / 2))
            return r.top >= 0 && r.top < window.innerHeight && hit !== null && el.contains(hit)
          }
          return {
            head: seen(document.querySelector('[data-part="send-the-review"] .px-org-head')),
            said: seen(document.querySelector('.px-pane .px-send-said')),
          }
        })),
        pageAt: Math.round(await whereThePageIs(page)),
      }),
      { timeout: 10_000 },
    )
    .toEqual({ head: true, said: true, pageAt: phone ? expect.any(Number) : readingAt })
  await shot?.('6-sent')
  console.log(`[press times] ${String(width)} ${lang} ${look}: ${times.map((one) => `${one.press} ${String(one.ms)} ms`).join('; ')}`)
  return { reviewId, times }
}

/** What the office says of the review: its state, and who it went to. */
async function stored(reviewId: string): Promise<{ state: string; to: string | null }> {
  const reply = (await (await fetch(`${app.api}/api/reviews/${reviewId}`, { headers: PERSON })).json()) as {
    review: { state: string }
    goesTo: { name: string | null }
  }
  return { state: reply.review.state, to: reply.goesTo.name }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-owner-sends-a-review', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // AN OFFICE WITH SOME LIFE IN IT, so the times are not taken on an empty one: thirty contacts who have written to the
  // person, and twenty earlier reviews, each of three comments on a report of its own, collected and with an agent
  // chosen, and not sent, as the owner's were. Sending needs the paired browser, so they are not sent here. The owner's own
  // office is larger than this, and the sandbox this was written in cannot read it.
  const others = Array.from({ length: 28 }, (_, i) => ({ name: `Made-up Agent ${String(i + 1)}`, handle: `made-up-agent-${String(i + 1)}` }))
  const agentRecords: string[] = []
  for (const agent of [WRITER, OTHER, ...others]) {
    agentRecords.push((await post<{ record: { id: string } }>('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })).record.id)
    await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${agent.name} has a made-up note.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(agent.handle))
  }
  for (let i = 1; i <= 20; i += 1) {
    const on = { target: { kind: 'record', recordId: await aReport(`Made-up earlier kiln report ${String(i)}`), workspaceId: 'default' } }
    const earlier = (await post<{ review: { id: string } }>('/api/reviews', { entry: on })).review.id
    for (let j = 1; j <= 3; j += 1) {
      await post('/api/records', { kind: 'annotation', title: `earlier comment ${String(j)}`, data: { body: `Made-up earlier comment ${String(i)}.${String(j)}.`, context: on } })
    }
    await post(`/api/reviews/${earlier}/finish-collecting`, {})
    await post(`/api/reviews/${earlier}/recipient`, { recipient: { kind: 'agent', agentId: agentRecords[i % agentRecords.length] } })
  }
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the owner comments on a report, chooses who gets the review, and sends it', () => {
  it.each([
    [1440, 'en'],
    [390, 'en'],
  ] as const)('at %i in %s, light: the review is sent to the agent the person pressed', async (width, lang) => {
    const { reviewId, times } = await sendOne(width, lang, 'light')
    expect(await stored(reviewId)).toEqual({ state: 'sent', to: OTHER.name })
    expect(times.map((one) => one.press)).toEqual(['right-click the words', 'Start review', 'Back to reading', 'Change', `the contact ${OTHER.name}`, 'Send'])
  }, 240_000)
})

it.skipIf(!process.env['TEST_SHOTS'])('photographs each step at four widths, in both looks, in English', async () => {
  for (const look of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      const { reviewId } = await sendOne(width, 'en', look, async (step) => {
        await app.page.waitForTimeout(400)
        await app.page.screenshot({ path: join(SHOTS, `${String(width)}-${look}-${step}.png`) })
      })
      expect((await stored(reviewId)).state).toBe('sent')
    }
  }
}, 600_000)
