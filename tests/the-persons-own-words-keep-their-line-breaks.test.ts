// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S OWN WORDS IN A REPORT'S QUESTION TAKE LINE BREAKS, AND KEEP THEM EVERYWHERE THEY GO.
 * A choice's own-words box could not take a line break, which made typing and editing hard.
 *
 * In a browser paired as the person's:
 *   1. typing three lines into a choice's own-words box keeps all three in the box, Enter sends nothing,
 *      and all three can be seen without scrolling the box; a fill-in box of one line takes two lines too;
 *   2. the kept answer holds the line breaks on the server;
 *   3. once sent, the line breaks are in the report's answers field, in the decision recorded from the
 *      choice and in the message to the agent, and the report page, the decision's page and the
 *      message's page each draw the words on three lines.
 *
 * Everybody and everything here is made up. `liveApp` starts its own API and site with a database of
 * their own; nothing touches the owner's server.
 *
 * MUTATIONS, proved on 11 October 2026 (wave 13p round 38):
 *   - the choice's own-words box in ReportQuestions.tsx put back to a one-line TextInput: case 1 goes red;
 *   - `keepAnAnswer` in src/server/lib/answers.ts keeping the words with each line break turned into a
 *     space: case 2 goes red;
 *   - `oneAnswerInWords` in src/server/lib/answers.ts writing the words with each line break turned into a
 *     space: case 3 goes red on the message;
 *   - `white-space: pre-wrap` taken off the px-gov-took rule in Governance.tsx: case 3 goes red on the
 *     decision's page;
 *   - `white-space: pre-wrap` taken off the rq-sent-words rule in ReportQuestions.tsx: case 3 goes red on
 *     the report page.
 *
 * MUTATIONS, proved on 23 October 2026 (wave 13s round 88), once case 3 read the decision's sentence and the
 * label from src/shared/answers.ts instead of copying them:
 *   - `oneAnswerInWords` writing the words with each line break turned into a space: case 3 goes red on the
 *     message;
 *   - `theWordsOfAChoice` writing the words with each line break turned into a space: case 3 goes red on the
 *     decision's page;
 *   - the label `whoseOwnWords` gives the person changed to other words: case 3 stays green, because it reads
 *     the label and does not copy it.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { theWordsOfAChoice, whoseOwnWords } from '../src/shared/answers.ts'
import type { ChoiceBlock } from '../src/shared/types.ts'
import { messagePath, recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const KILN = { name: 'Kiln planning agent', handle: 'kiln-planner' }

/** The three lines the person types beside the choice, and the two in the fill-in box of one line. */
const THREE = ['Celadon on the bowls.', 'Tenmoku on the tall jars only.', 'Ask me again before the autumn batch.']
const TWO = ['Wax the feet first.', 'Leave the lids off.']

let app: LiveApp
let reportId = ''
const sends: string[] = []

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const reply = await fetch(app.api + path, { headers: PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return (await reply.json()) as T
}

type Answer = { chosen?: string[]; words?: string }
type Answers = Record<string, { draft?: { answer: Answer }; sent?: { answer: Answer; decision?: string; message: string } }>
async function answers(): Promise<Answers> {
  return (await get<{ record: { data: { answers?: Answers } } }>(`/api/records/${reportId}`)).record.data.answers ?? {}
}

async function openTheReport(width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${look}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.rq-choice').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'own-words-line-breaks', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  app.page.on('request', (request) => {
    if (request.url().endsWith('/answers/send')) sends.push(request.url())
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

it('1. typing three lines into a choice\'s own words keeps all three, Enter sends nothing, and all three are seen', async () => {
  await openTheReport()
  await app.page.locator('.rq-choice .rq-option', { hasText: 'Celadon, as last spring' }).click()
  const box = app.page.locator('.rq-choice .rq-own textarea')
  await box.click()
  await app.page.keyboard.type(THREE[0]!)
  for (const line of THREE.slice(1)) {
    await app.page.keyboard.press('Enter')
    await app.page.keyboard.type(line)
  }
  expect(await box.inputValue()).toBe(THREE.join('\n'))
  // EVERY LINE CAN BE SEEN without scrolling the box: it is as tall as its lines, up to 16 of them.
  const { scroll, client } = await box.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(scroll, 'the box hides some of its lines').toBeLessThanOrEqual(client + 1)

  const note = app.page.locator('.rq-fillin textarea')
  await note.click()
  await app.page.keyboard.type(TWO[0]!)
  await app.page.keyboard.press('Enter')
  await app.page.keyboard.type(TWO[1]!)
  expect(await note.inputValue(), 'a fill-in box of one line does not take a line break').toBe(TWO.join('\n'))
  expect(sends, 'Enter sent the answers').toEqual([])
}, 120_000)

it('2. the kept answer holds the line breaks on the server', async () => {
  // Leaving a box keeps its words at once; a pause in typing keeps them too, so either may have kept them.
  await app.page.locator('.rq-fillin textarea').blur()
  await expect.poll(async () => (await answers())['q-glaze']?.draft?.answer.words, { timeout: 15_000 }).toBe(THREE.join('\n'))
  await expect.poll(async () => (await answers())['q-note']?.draft?.answer.words, { timeout: 15_000 }).toBe(TWO.join('\n'))

  // THE BOX AFTER A RELOAD is checked in tests/a-kept-answer-comes-back-after-a-reload.test.ts (problem
  // AJGgg93KaQ5p), and the kept pictures below are taken after a reload.
  expect(sends, 'keeping an answer sent it').toEqual([])
}, 120_000)

it('3. once sent, the answers field, the decision and the message hold the lines, and each page draws them on three lines', async () => {
  await openTheReport()
  const sent = app.page.waitForResponse((reply) => reply.url().endsWith('/answers/send'))
  await app.page.locator('.rq-report-submit .px-btn').click()
  expect((await sent).status()).toBe(201)

  const now = await answers()
  const glaze = now['q-glaze']?.sent
  expect(glaze?.answer.words).toBe(THREE.join('\n'))
  expect(now['q-note']?.sent?.answer.words).toBe(TWO.join('\n'))

  // THE REPORT PAGE draws the sent words on their lines.
  const choice = app.page.locator('.rq-choice')
  await choice.locator('.rq-sent-words').waitFor()
  expect(await choice.locator('.rq-sent-words').innerText()).toBe(THREE.join('\n'))
  expect(await app.page.locator('.rq-fillin .rq-sent-words').innerText()).toBe(TWO.join('\n'))

  // THE DECISION keeps the lines, and its page draws them.
  const decision = await get<{ record: { data: { option_taken?: string } } }>(`/api/records/${glaze!.decision!}`)
  // The decision's sentence is asked of the one function that writes it, with the block the report holds
  // and the person's own three lines, never written out here.
  const held = await get<{ record: { data: { blocks: ChoiceBlock[] } } }>(`/api/records/${reportId}`)
  const block = held.record.data.blocks.find((one) => one.id === 'q-glaze')!
  const person = { kind: 'person', id: THE_PERSON } as const
  expect(decision.record.data.option_taken).toBe(theWordsOfAChoice(block, { chosen: ['a'], words: THREE.join('\n') }, person))
  await app.page.goto(`${app.site}/?lang=en#${recordPath(glaze!.decision!, 'decision')}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-gov-took').waitFor({ timeout: 30_000 })
  expect(await app.page.locator('.px-gov-took').innerText()).toContain(THREE.join('\n'))

  // THE MESSAGE keeps the lines, and its page draws them.
  const message = await get<{ record: { data: { body: string } } }>(`/api/records/${glaze!.message}`)
  // Whose words a line carries is read from the one function that writes it, never written out here.
  const whose = whoseOwnWords(person)
  expect(message.record.data.body).toContain(`${whose}: ${THREE.join('\n')}`)
  expect(message.record.data.body).toContain(`${whose}: ${TWO.join('\n')}`)
  await app.page.goto(`${app.site}/?lang=en#${messagePath(glaze!.message)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.mp-body').waitFor({ timeout: 30_000 })
  const drawn = await app.page.locator('.mp-body').innerText()
  expect(drawn).toContain(THREE.join('\n'))
  expect(drawn).toContain(TWO.join('\n'))
}, 120_000)
