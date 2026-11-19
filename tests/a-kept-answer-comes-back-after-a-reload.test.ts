// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEPT ANSWER COMES BACK AFTER A RELOAD, AND PRESSING AN OPTION KEEPS THE WORDS. Problem AJGgg93KaQ5p,
 * found in wave 13p round 38: after a reload a question's boxes were empty though its answer was kept,
 * and pressing an option then kept the empty box's words over the person's.
 *
 * THE CAUSE. A record page opened again draws what it showed last time at once, from the page cache, and
 * reads the record again behind it (src/web/lib/pagecache.ts). Each question took its boxes' starting
 * state from the first answers it was handed, which were the cached ones, and never from the fresh read.
 *
 * HOW THE PAGE SETTLES A KEPT ANSWER AND A BOX THAT DIFFER (two tabs, or the cache): whenever the
 * page is handed newer kept answers, a question with no change of its own waiting or being kept takes
 * the kept answer into its boxes. A question whose own change is still waiting keeps the box, and that
 * change is kept over the other when it is kept: the last write wins, and the box shows what was kept.
 *
 * In a browser paired as the person's:
 *   1. type into a choice's own words and a fill-in box, reload, open the page afresh, and the option
 *      and both boxes are back, with their line breaks;
 *   2. after a reload, pressing another option keeps the words in the box and in the kept answer, and
 *      so does pressing an option straight after typing, before the pause keeps the words;
 *   3. an answer kept from elsewhere (another tab) comes into the box when the page is handed it, and a
 *      reply that lands while the person is still typing does not overwrite the typing;
 *   4. send, reload, and the sent answer is drawn as sent, with its line breaks.
 *
 * Everybody and everything here is made up. `liveApp` starts its own API and site with a database of
 * their own; nothing touches the owner's server.
 *
 * MUTATIONS: see the round 39 report; each is listed with the case it turned red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const KILN = { name: 'Kiln planning agent', handle: 'kiln-planner' }

const THREE = ['Celadon on the bowls.', 'Tenmoku on the tall jars only.', 'Ask me again before the autumn batch.']
const TWO = ['Wax the feet first.', 'Leave the lids off.']
const ELSEWHERE = ['Written in another tab.', 'Second line from there.']
const LATER = ['Kept on another visit.', 'Its second line.', 'Its third line.']
const MINE =['Typed here while the other tab wrote.', 'Still mine.']

let app: LiveApp
let reportId = ''

async function get<T>(path: string): Promise<T> {
  const reply = await fetch(app.api + path, { headers: PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as T
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON, method = 'POST'): Promise<T> {
  const reply = await fetch(app.api + path, { method, headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

type Answer = { chosen?: string[]; words?: string }
type Answers = Record<string, { draft?: { answer: Answer }; sent?: { answer: Answer } }>
async function answers(): Promise<Answers> {
  return (await get<{ record: { data: { answers?: Answers } } }>(`/api/records/${reportId}`)).record.data.answers ?? {}
}

const choiceBox = () => app.page.locator('.rq-choice .rq-own textarea')
const fillinBox = () => app.page.locator('.rq-fillin textarea')
const option = (label: string) => app.page.locator('.rq-choice .rq-option', { hasText: label }).locator('input')

async function openTheReport(width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.rq-choice').waitFor({ timeout: 30_000 })
}

/** Type lines into a box as a person does, pressing Enter between them. */
async function typeLines(box: ReturnType<typeof choiceBox>, lines: readonly string[]): Promise<void> {
  await box.click()
  await app.page.keyboard.press('Control+A')
  await app.page.keyboard.press('Delete')
  await app.page.keyboard.type(lines[0]!)
  for (const line of lines.slice(1)) {
    await app.page.keyboard.press('Enter')
    await app.page.keyboard.type(line)
  }
}

/** The page has drawn the fresh read: its re-read strip is gone and the boxes hold the kept answer. */
async function backFromTheServer(choice: readonly string[], note: readonly string[]): Promise<void> {
  await expect.poll(() => choiceBox().inputValue(), { timeout: 30_000 }).toBe(choice.join('\n'))
  await expect.poll(() => fillinBox().inputValue(), { timeout: 30_000 }).toBe(note.join('\n'))
}

beforeAll(async () => {
  app = await liveApp({ name: 'kept-answer-comes-back', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  await post('/api/records', { kind: 'agent', title: KILN.name, data: { handle: KILN.handle, runtime: 'claude-code', state: 'active' } })
  await post('/api/records', { kind: 'message', title: 'A note', data: { body: 'The kiln plan is ready.', to: [{ kind: 'person', id: THE_PERSON }] } }, AS(KILN.handle))
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report',
    title: 'The spring kiln: the glaze',
    data: {
      for: 'The person who runs the studio',
      date: '2026-10-11',
      blocks: [
        { id: 'b-1', type: 'text', text: 'Made-up data for a test. The kiln is ready for the spring batch.' },
        {
          id: 'q-glaze',
          type: 'choice',
          question: 'Which glaze should the spring batch use?',
          options: [
            { id: 'a', label: 'Celadon, as last spring', recommended: true },
            { id: 'b', label: 'Tenmoku' },
          ],
        },
        { id: 'q-note', type: 'fillin', asks: 'Anything the glazer should know?', lines: 'one' },
      ],
    },
  }, AS(KILN.handle))
  reportId = report.record.id

  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: 'Pair this browser', exact: true }).click()
  await app.page.getByText('This browser is paired.', { exact: true }).waitFor()
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

it('1. the option and the own words typed come back after a reload and after a fresh visit, with their line breaks', async () => {
  // THE PAGE IS OPENED BEFORE ANYTHING IS KEPT, so the page cache holds the report with no answers. That
  // is what a reload draws first.
  await openTheReport()
  await option('Celadon, as last spring').click()
  await typeLines(choiceBox(), THREE)
  await typeLines(fillinBox(), TWO)
  await fillinBox().blur()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer.words, { timeout: 15_000 }).toBe(THREE.join('\n'))
  await expect.poll(async () => (await answers())['q-note']?.draft?.answer.words, { timeout: 15_000 }).toBe(TWO.join('\n'))

  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await backFromTheServer(THREE, TWO)
  expect(await option('Celadon, as last spring').isChecked()).toBe(true)

  await openTheReport()
  await backFromTheServer(THREE, TWO)
  expect(await option('Celadon, as last spring').isChecked()).toBe(true)
}, 180_000)

it('2. pressing an option keeps the words, after a reload and straight after typing', async () => {
  // THE PAGE CACHE IS MADE OUT OF DATE, as it is whenever words were kept since the page was last drawn
  // (on another visit, or in another tab): it holds case 1's words, and the server holds others.
  await post(`/api/records/${reportId}/answers/q-glaze`, { answer: { chosen: ['a'], words: LATER.join('\n') } }, PERSON, 'PUT')
  await openTheReport()
  await backFromTheServer(LATER, TWO)
  await option('Tenmoku').click()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer, { timeout: 15_000 }).toEqual({ chosen: ['b'], words: LATER.join('\n') })
  expect(await choiceBox().inputValue()).toBe(LATER.join('\n'))

  // PRESSED BEFORE THE PAUSE KEEPS THE TYPING: the press keeps the words in the box, not the ones kept before.
  await typeLines(choiceBox(), TWO)
  await option('Celadon, as last spring').click()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer, { timeout: 15_000 }).toEqual({ chosen: ['a'], words: TWO.join('\n') })
  expect(await choiceBox().inputValue()).toBe(TWO.join('\n'))

  // Put back as case 1 left it, for the cases after this one.
  await typeLines(choiceBox(), THREE)
  await choiceBox().blur()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer.words, { timeout: 15_000 }).toBe(THREE.join('\n'))
}, 180_000)

it('3. an answer kept in another tab comes into the box, and a change still waiting in this one is not overwritten', async () => {
  await openTheReport()
  await backFromTheServer(THREE, TWO)

  // ANOTHER TAB keeps a different answer to the choice. This page is handed it in the reply to its next
  // keep, which carries the report's whole answers field.
  await post(`/api/records/${reportId}/answers/q-glaze`, { answer: { chosen: ['b'], words: ELSEWHERE.join('\n') } }, PERSON, 'PUT')
  await typeLines(fillinBox(), THREE)
  await fillinBox().blur()
  await expect.poll(() => choiceBox().inputValue(), { timeout: 15_000 }).toBe(ELSEWHERE.join('\n'))
  expect(await option('Tenmoku').isChecked()).toBe(true)

  // A CHANGE WAITING IN THIS TAB IS NOT OVERWRITTEN by a reply that comes back while the person types.
  // Leaving a box keeps it at once, so the reply that could land on a change still waiting is the one to
  // a keep made by a pause. The keep door is slowed by two seconds so it lands while the person types on.
  await app.page.route('**/answers/q-glaze', async (route) => {
    await new Promise((done) => setTimeout(done, 2000))
    await route.continue()
  })
  const first = app.page.waitForResponse((reply) => reply.url().endsWith('/answers/q-glaze'))
  await typeLines(choiceBox(), [MINE[0]!])
  await app.page.waitForTimeout(1300)
  await app.page.keyboard.press('Enter')
  await app.page.keyboard.type(MINE[1]!)
  await first
  await app.page.waitForTimeout(200)
  expect(await choiceBox().inputValue(), 'the reply to an earlier keep overwrote the typing').toBe(MINE.join('\n'))
  await choiceBox().blur()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer.words, { timeout: 15_000 }).toBe(MINE.join('\n'))
  expect(await choiceBox().inputValue()).toBe(MINE.join('\n'))
  await app.page.unroute('**/answers/q-glaze')

  // Put back as case 1 left it.
  await option('Celadon, as last spring').click()
  await typeLines(choiceBox(), THREE)
  await typeLines(fillinBox(), TWO)
  await fillinBox().blur()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer, { timeout: 15_000 }).toEqual({ chosen: ['a'], words: THREE.join('\n') })
  await expect.poll(async () => (await answers())['q-note']?.draft?.answer.words, { timeout: 15_000 }).toBe(TWO.join('\n'))
}, 180_000)

it('4. a sent answer is drawn as sent after a reload, with its line breaks', async () => {
  await openTheReport()
  await backFromTheServer(THREE, TWO)
  const sent = app.page.waitForResponse((reply) => reply.url().endsWith('/answers/send'))
  await app.page.locator('.rq-report-submit .px-btn').click()
  expect((await sent).status()).toBe(201)

  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  const choice = app.page.locator('.rq-choice[data-state="sent"]')
  await choice.waitFor({ timeout: 30_000 })
  expect(await choice.locator('.rq-sent-words').innerText()).toBe(THREE.join('\n'))
  expect(await app.page.locator('.rq-fillin[data-state="sent"] .rq-sent-words').innerText()).toBe(TWO.join('\n'))
  expect(await choice.locator('li[data-chosen="yes"]').innerText()).toContain('Celadon, as last spring')
}, 120_000)
