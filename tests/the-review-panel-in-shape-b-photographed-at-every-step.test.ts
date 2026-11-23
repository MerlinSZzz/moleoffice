// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANEL IN SHAPE B, PHOTOGRAPHED AT EVERY STEP OF ONE REVIEW, AT FOUR WIDTHS, IN BOTH LOOKS AND IN BOTH
 * LANGUAGES. Wave 13r round 15.
 *
 * The steps, each a picture named `<step>-<width>-<look>-<lang>.png`:
 *   1. `first-comment`: words on the report selected and right-clicked, and a comment written in the box.
 *   2. `start-review`: Start review pressed; the review is collecting and the column shows it. On a phone the box's
 *      sheet saying so covers the bar; the picture keeps it, and Back to reading is pressed after it.
 *   3. `choosing`: Change pressed on who the review goes to, with the list of contacts open.
 *   4. `send`: a second agent chosen, then Send pressed, with what Mole Office said about the send.
 *   5. `leave-question`: another page whose review holds a comment not sent, left by a change of the address.
 *
 * Each step also checks what it photographs is there, and that the page never scrolls sideways.
 *
 * IT RUNS ONLY WITH TEST_SHOTS SET, which names the folder the pictures are kept in, under `r15-pictures`.
 * `R15_PICTURE_LANGS` may name one language (`en` or `zh`) to photograph only that one. THE OFFICE IS THIS TEST'S OWN:
 * `liveApp` starts its own API and database, and every name and comment in the pictures is made up.
 *
 * Three-run proof, with TEST_SHOTS set and R15_PICTURE_LANGS=en:
 * - The leave question not drawn: in src/web/components/agent/ReviewBar.tsx, `LeaveQuestion` begins with
 *   `if (Math.random() < 2) return null`. Step 5 goes red: the question is never drawn.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
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
const LANGS = (process.env['R15_PICTURE_LANGS'] ?? 'en,zh').split(',').filter((one): one is 'en' | 'zh' => one === 'en' || one === 'zh')
const shots = testShots('r15-pictures')

let app: LiveApp
let otherId = ''

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A made-up report the kiln agent wrote, so the review goes to it by default. */
async function aReport(title: string): Promise<string> {
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report', title,
    data: {
      for: 'Robin Vale', date: '2026-10-04',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What I found', text: 'The second firing held its temperature for the whole hour.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The left shelf sagged by two millimetres between the firings.' },
      ],
    },
  }, AS(WRITER.handle))
  return report.record.id
}

async function settle(): Promise<void> {
  await app.page.waitForTimeout(700)
}

async function noSideways(name: string): Promise<void> {
  expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: the page scrolls sideways`).toBe(true)
}

async function shoot(step: string, width: number, look: string, lang: string): Promise<void> {
  const name = `${step}-${String(width)}-${look}-${lang}`
  await settle()
  await noSideways(name)
  await app.page.screenshot({ path: `${shots}/${name}.png` })
}

/** Opens the report and writes a comment on words of its second paragraph, through the right-click box. */
async function writeAComment(reportId: string, lang: 'en' | 'zh', look: string, words: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await app.page.locator(run).waitFor({ timeout: 30_000 })
  const at = await app.page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    el.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await app.page.mouse.click(at.x, at.y, { button: 'right' })
  await app.page.locator('.px-talk textarea').waitFor({ timeout: 20_000 })
  await app.page.locator('.px-talk textarea').fill(words)
}

beforeAll(async () => {
  app = await liveApp({ name: 'r15-pictures', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.addInitScript(() => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
  })
  for (const agent of [WRITER, OTHER]) {
    const made = await post<{ record: { id: string } }>('/api/records', { kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } })
    if (agent === OTHER) otherId = made.record.id
    // EACH HAS WRITTEN TO THE PERSON, so each is a contact.
    await post('/api/records', { kind: 'message', title: 'A note', data: { body: `${agent.name} has a made-up note.`, to: [{ kind: 'person', id: THE_PERSON }] } }, AS(agent.handle))
  }
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the panel at every step of one review, at four widths, in both looks and languages', async () => {
  let n = 0
  for (const lang of LANGS) {
    const t = createI18n(lang).t
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        n += 1
        await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
        const phone = width === 390
        const reportId = await aReport(`Made-up kiln report ${String(n)}`)

        // 1. THE FIRST COMMENT, written in the box and not yet kept.
        await writeAComment(reportId, lang, look, lang === 'zh' ? '编造的评论：哪一块搁板下沉了？' : 'Made-up comment: which shelf sagged?')
        await shoot('first-comment', width, look, lang)

        // 2. START REVIEW: the comment is kept and this page's review starts, going to the page's writer.
        await app.page.locator('.px-talk').getByRole('button', { name: t('talk.startReview'), exact: true }).click()
        await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
        const review = app.page.locator('[data-part="your-review"]')
        await review.waitFor({ timeout: 30_000 })
        await shoot('start-review', width, look, lang)
        // ON A PHONE THE BOX IS A SHEET STANDING ON THE BAR (round 16), and it says the review has started. The picture
        // above keeps it, because that is what the owner sees first; Back to reading puts it away.
        if (phone) {
          await app.page.locator('.px-talk').getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
          await app.page.locator('.px-talk').waitFor({ state: 'detached', timeout: 30_000 })
        }

        // 3. CHOOSING who it goes to: Change, with the contacts open. On a phone the bar's Change opens the sheet.
        if (phone) await app.page.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.b.change'), exact: true }).click()
        else await review.locator('[data-part="goes-to"]').getByRole('button', { name: t('review.b.change'), exact: true }).click()
        const contacts = review.locator('.px-review-contacts')
        await contacts.locator('.px-talk-contact').first().waitFor({ timeout: 30_000 })
        await contacts.scrollIntoViewIfNeeded()
        await shoot('choosing', width, look, lang)

        // 4. SEND, to the second agent chosen in that list.
        const chosen = app.page.waitForResponse((r) => r.url().includes('/recipient') && r.request().method() === 'POST')
        await contacts.locator('.px-talk-contact', { hasText: OTHER.name }).first().click()
        expect((await chosen).status()).toBe(200)
        await review.locator('[data-part="goes-to"]').getByText(t('review.b.goingTo', { name: OTHER.name }), { exact: true }).waitFor({ timeout: 30_000 })
        const sent = app.page.waitForResponse((r) => r.url().includes('/send') && r.request().method() === 'POST')
        // ON A PHONE SEND IS ON THE BAR ONLY: the open list shows each press once (round 16).
        await review.locator(phone ? '[data-part="your-review-bar"]' : '.px-b-do').getByRole('button', { name: t('review.b.send', { n: 1 }), exact: true }).click()
        expect((await sent).status()).toBe(200)
        await app.page.locator('.px-pane .px-send-said').first().waitFor({ timeout: 30_000 })
        // WHAT MOLE OFFICE SAID is under the review's lists; at 990 and narrower it starts below the window's foot. The
        // pane is drawn again once the send is read back, so it is found and scrolled to after that, in one step.
        await settle()
        // FROM ITS FIRST LINE (round 16): the step is shown from "This review has gone" down, clear of the top bar.
        expect(await app.page.evaluate(() => {
          const said = [...document.querySelectorAll('.px-pane .px-send-said')].at(-1)
          const head = said?.closest('[data-part="send-the-review"]')?.querySelector('.px-org-head')
          head?.scrollIntoView({ block: 'start' })
          return said !== undefined && head !== null && head !== undefined
        }), 'what Mole Office said about the send is gone').toBe(true)
        await shoot('send', width, look, lang)

        // 5. THE QUESTION ON LEAVING a page whose review holds a comment not sent.
        const second = await aReport(`Made-up kiln report ${String(n)}, second page`)
        await writeAComment(second, lang, look, lang === 'zh' ? '编造的评论：第二次烧窑用了多久？' : 'Made-up comment: how long was the second firing?')
        // THE BOX HAS SHOWN WHO IT WILL CARRY, BEFORE START REVIEW IS PRESSED. The box picks the page's writer through
        // the ranking, and Start review stores the shown recipient only once that read has answered; pressed before it
        // answers, nothing is carried and the review falls back to the page's writer. The drawn name is the visible
        // state that says the ranking has answered.
        await app.page.locator('.px-talk .px-talk-to-btn').getByText(WRITER.name, { exact: true }).waitFor({ timeout: 30_000 })
        await app.page.locator('.px-talk').getByRole('button', { name: t('talk.startReview'), exact: true }).click()
        await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
        await settle()
        await app.page.evaluate(() => { location.hash = '#/records' })
        const question = app.page.locator('[data-part="leave-question"]')
        await question.waitFor({ timeout: 30_000 })
        await question.getByText(t('review.leave.recipient', { name: WRITER.name }), { exact: true }).waitFor()
        // ON TOP OF THE COMMENT BOX, which is still open from Start review: the question's corner is the question's.
        expect(await question.evaluate((box) => box.contains(document.elementFromPoint(box.getBoundingClientRect().left + 8, box.getBoundingClientRect().top + 8))), 'something is drawn over the question').toBe(true)
        await shoot('leave-question', width, look, lang)
        await question.getByRole('button', { name: t('review.leave.keep'), exact: true }).click()
        await question.waitFor({ state: 'detached' })
      }
    }
  }
  expect(otherId).not.toBe('')
}, 900_000)
