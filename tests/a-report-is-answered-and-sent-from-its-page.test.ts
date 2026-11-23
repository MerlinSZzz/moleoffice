// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON ANSWERS A REPORT'S QUESTIONS ON ITS PAGE, AND THE PRESSES REACH THE ANSWER DOOR, as two
 * decisions say.
 *
 * tests/the-person-answers-the-questions-in-a-report.test.ts holds the door on its own, and
 * tests/a-report-asks-the-person-in-place.test.ts holds the drawing over answers written straight into
 * the database. This file is the two together, in a browser paired as the person's:
 *   1. choosing an option in the box and writing in the fill-in box outside it keeps each as a draft,
 *      and the one send press sends both: the agent receives ONE message holding both answers, the
 *      choice is recorded as the person's decision linked to the report, and the proposal the question
 *      is about is settled. The box draws no submit of its own;
 *   2. a sent answer changed afterwards is sent again by the same press, alone: the second message
 *      holds the changed words and not the choice, which has gone already;
 *   3. the button asks once more, and its press is sent at once, on its own;
 *   4. (round 30) once sent, the choice and the fill-in box are drawn as words with no input, and
 *      "Change this answer" opens the inputs again with the sent answer in them; the whole report's
 *      submit sits straight after the fill-in box, the last question, and not at the foot.
 *
 * WHAT CHANGED IN WAVE 13U ROUND 19. A report's answers are sent together with
 * one press, for people and agents alike. Case 1 said: the box's submit sends the choice alone, and
 * the words in the fill-in box stay unsent. Case 2 said: the whole report's submit then sends only the
 * fill-in box. There is no box submit now, so case 1 says the one press sends both in one message, and
 * case 2 holds "only what is unsent" with an answer changed after it was sent.
 *
 * MUTATIONS, proved on 2 October 2026:
 *   - `keepAnAnswer` in src/web/api.ts sending to a wrong path: case 1 goes red (nothing is kept, nothing sent);
 *   - the box's SubmitPress in ReportQuestions.tsx given the whole report as its scope: case 1 goes red
 *     (the fill-in box's words leave with the box's answer, so the first message holds two answers).
 * MUTATIONS, proved on 3 October 2026 (round 30):
 *   - `answering` in ReportQuestions.tsx made always true: case 1 goes red (the sent choice still
 *     draws its options as inputs) and case 2 goes red (the sent fill-in box still draws its box);
 *   - the whole report's submit drawn under the report again, as in round 29: case 2 goes red (no
 *     submit follows the fill-in box), and case 3 with it, because nothing was sent in case 2.
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

let app: LiveApp
let reportId = ''
let proposalId = ''

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

/** The messages the person has sent the kiln agent, as the chat reads them. */
async function sentToTheAgent(): Promise<string[]> {
  const read = await get<{ messages: { body: string; fromMe?: boolean }[] }>(
    `/api/messages/conversation?kind=agent&id=${encodeURIComponent(KILN.handle)}`,
  )
  return read.messages.map((one) => one.body).filter((body) => body.includes('answered questions in the report'))
}

type Answers = Record<string, { draft?: unknown; sent?: { answer: { chosen?: string[]; words?: string; pressed?: boolean }; decision?: string; message: string } }>
async function answers(): Promise<Answers> {
  return (await get<{ record: { data: { answers?: Answers } } }>(`/api/records/${reportId}`)).record.data.answers ?? {}
}

async function openTheReport(width = 1440, look = 'light', lang = 'en'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/r/${reportId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.rq-report-submit .rq-submit').waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'report-answered-from-page', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  await post('/api/records', { kind: 'agent', title: KILN.name, data: { handle: KILN.handle, runtime: 'claude-code', state: 'active' } })
  await post('/api/records', { kind: 'message', title: 'A note', data: { body: 'The kiln plan is ready.', to: [{ kind: 'person', id: THE_PERSON }] } }, AS(KILN.handle))
  const proposal = await post<{ record: { id: string } }>('/api/records', {
    kind: 'proposal',
    title: 'Which glaze the spring batch uses',
    data: { question: 'Which glaze should the spring batch use?', options: ['Celadon', 'Tenmoku'], who_settles_it: 'the owner' },
  }, AS(KILN.handle))
  proposalId = proposal.record.id
  const report = await post<{ record: { id: string } }>('/api/records', {
    kind: 'report',
    title: 'The spring kiln: three questions',
    data: {
      for: 'The person who runs the studio',
      date: '2026-10-02',
      blocks: [
        { id: 'b-1', type: 'text', text: 'The kiln is ready for the spring batch. Three things are yours to decide.' },
        {
          id: 'box-glaze',
          type: 'box',
          title: 'The glaze',
          blocks: [
            {
              id: 'q-glaze',
              type: 'choice',
              question: 'Which glaze should the spring batch use?',
              about: proposalId,
              options: [
                { id: 'a', label: 'Celadon, as last spring', recommended: true },
                { id: 'b', label: 'Tenmoku' },
              ],
            },
          ],
        },
        { id: 'q-note', type: 'fillin', asks: 'Anything the glazer should know?', lines: 'many' },
        { id: 'q-fire', type: 'button', label: 'Fire the kiln tonight', confirm: 'Fire the kiln tonight at 22:00?' },
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

it('1. keeps a choice in the box and words outside it, and the one send press sends both in one message, the choice as a decision that settles the proposal', async () => {
  await openTheReport()
  const kept = app.page.waitForResponse((reply) => reply.url().includes(`/answers/q-glaze`) && reply.request().method() === 'PUT')
  await app.page.locator('.rq-choice .rq-option', { hasText: 'Celadon, as last spring' }).click()
  expect((await kept).status()).toBe(200)
  expect((await answers())['q-glaze']?.draft, 'the choice is kept as a draft').toBeDefined()

  // Words in the fill-in box outside the box are kept too.
  const words = app.page.waitForResponse((reply) => reply.url().includes(`/answers/q-note`) && reply.request().method() === 'PUT')
  await app.page.locator('.rq-fillin textarea').fill('Wax the feet first.')
  await app.page.locator('.rq-fillin textarea').blur()
  expect((await words).status()).toBe(200)

  // ONE SEND PRESS: the box has none of its own, and the one press counts both.
  expect(await app.page.locator('.rq-box .rq-submit').count(), 'the box draws a submit of its own').toBe(0)
  expect(await app.page.locator('.rq-submit').count(), 'more than one submit is drawn').toBe(1)
  expect(await app.page.locator('.rq-report-submit .rq-submit-state').innerText()).toBe('2 answers are not sent yet.')
  const sent = app.page.waitForResponse((reply) => reply.url().endsWith('/answers/send'))
  await app.page.locator('.rq-report-submit .px-btn').click()
  expect((await sent).status()).toBe(201)

  const now = await answers()
  const glaze = now['q-glaze']?.sent
  expect(glaze?.answer.chosen).toEqual(['a'])
  expect(glaze?.decision, 'the choice was recorded as a decision').toBeDefined()
  expect(now['q-note']?.sent?.answer.words, 'the words outside the box went with the choice').toBe('Wax the feet first.')
  expect(now['q-note']?.sent?.message, 'the two answers went in two messages').toBe(glaze?.message)

  const messages = await sentToTheAgent()
  expect(messages).toHaveLength(1)
  expect(messages[0]).toContain('Celadon, as last spring')
  expect(messages[0]).toContain('Wax the feet first.')

  const decision = await get<{ record: { kind: string; data: { option_taken?: string } } }>(`/api/records/${glaze!.decision!}`)
  expect(decision.record.kind).toBe('decision')
  expect(decision.record.data.option_taken).toContain('Celadon, as last spring')
  const proposal = await get<{ resolution?: unknown }>(`/api/records/${proposalId}`)
  expect(proposal.resolution, 'the proposal the question was about is settled').toBeDefined()

  // ONCE SENT, THE CHOICE IS WORDS AND NOT AN INPUT, until the person asks to change it.
  const glazeChoice = app.page.locator('.rq-choice')
  await glazeChoice.locator('.rq-said[data-answer="sent"]').waitFor()
  expect(await glazeChoice.getAttribute('data-state')).toBe('sent')
  expect(await glazeChoice.locator('input').count(), 'the sent choice still draws an input').toBe(0)
  expect(await glazeChoice.locator('.rq-sent-options li[data-chosen="yes"]').innerText()).toContain('Celadon, as last spring')
  await glazeChoice.locator('.rq-change .px-btn').click()
  await glazeChoice.locator('input[value="a"]').waitFor()
  expect(await glazeChoice.locator('input[value="a"]').isChecked(), 'the inputs do not start from the sent answer').toBe(true)
}, 120_000)

it('2. the one press sends only what is unsent: an answer changed after it was sent goes again alone, not the glaze', async () => {
  await openTheReport()
  // THE WHOLE REPORT'S SUBMIT IS WHERE THE PERSON ANSWERS: straight after the fill-in box, the last question.
  const note = app.page.locator('.rq-fillin')
  expect(
    await note.evaluate((el) => el.nextElementSibling?.classList.contains('rq-report-submit') === true),
    'the whole report\'s submit does not follow the fill-in box',
  ).toBe(true)
  // ONCE SENT, THE FILL-IN BOX IS THE WORDS, not a box to write in.
  await note.locator('.rq-sent-words').waitFor()
  expect(await note.getAttribute('data-state')).toBe('sent')
  expect(await note.locator('textarea').count(), 'the sent fill-in box still draws its box').toBe(0)
  expect(await note.locator('.rq-sent-words').innerText()).toBe('Wax the feet first.')

  await note.locator('.rq-change .px-btn').click()
  await note.locator('textarea').waitFor()
  const words = app.page.waitForResponse((reply) => reply.url().includes(`/answers/q-note`) && reply.request().method() === 'PUT')
  await note.locator('textarea').fill('Wax the feet first, and dry them overnight.')
  await note.locator('textarea').blur()
  expect((await words).status()).toBe(200)
  const sent = app.page.waitForResponse((reply) => reply.url().endsWith('/answers/send'))
  await app.page.locator('.rq-report-submit .px-btn').click()
  expect((await sent).status()).toBe(201)
  const messages = await sentToTheAgent()
  expect(messages).toHaveLength(2)
  const second = messages.find((body) => body.includes('dry them overnight'))
  expect(second, 'the second message carries the changed fill-in box').toBeDefined()
  expect(second).not.toContain('Celadon')
  expect((await answers())['q-note']?.sent?.answer.words).toBe('Wax the feet first, and dry them overnight.')
}, 120_000)

it('3. the button asks once more, then sends its press at once, on its own', async () => {
  await openTheReport()
  await app.page.locator('.rq-button .px-btn').first().click()
  await app.page.getByText('Fire the kiln tonight at 22:00?', { exact: true }).waitFor()
  const sent = app.page.waitForResponse((reply) => reply.url().endsWith('/answers/send'))
  await app.page.getByRole('button', { name: 'Yes, send it', exact: true }).click()
  expect((await sent).status()).toBe(201)
  expect((await answers())['q-fire']?.sent?.answer.pressed).toBe(true)
  const messages = await sentToTheAgent()
  expect(messages).toHaveLength(3)
  expect(messages.find((body) => body.includes('Fire the kiln tonight'))).toBeDefined()
}, 120_000)
