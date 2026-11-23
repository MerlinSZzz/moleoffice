// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT ASKS THE PERSON, AND THE PAGE DRAWS THE QUESTIONS AND WHAT WAS ANSWERED. Two
 * decisions, wave 13k rounds 29 and 30.
 *
 * WHAT THIS FILE PROVES, in a real browser:
 *   1. a report holding a choice with a recommended option, a fill-in box, a button and a box with
 *      questions of its own draws all four and ONE submit, the whole report's, at 1440 and at 390. No
 *      box draws a submit of its own. The whole report's submit sits in the report, straight after the
 *      last choice or fill-in box, or after the box that holds it, and not at the report's foot. At 390
 *      nothing is drawn past the window and every control is a finger's size;
 *   2. with nothing answered, each submit is off and says nothing has been answered yet, which is a
 *      different fact from everything having been sent, and the line at the top counts the questions
 *      nobody has answered;
 *   3. a sent answer is drawn as words and not as an input: the chosen option marked, the person's
 *      own words quoted, who sent it, when and the decision it was recorded as. No input is drawn for
 *      it until "Change this answer" is pressed, which opens the inputs with the sent answer in them.
 *      A sent answer changed since is drawn with its inputs and the sent answer read-only beside them;
 *   4. the line at the top says how many questions are not answered and how many have answers not
 *      sent yet, and says every question is answered and sent when that is true;
 *   5. a report whose every choice and fill-in box sits in a box draws one whole-report submit, after
 *      its last box, and no submit in the box;
 *   6. in Chinese, the whole report's submit reads the page's own word;
 *   7. read as an agent, every input and submit is off and the submit says only the person answers;
 *   8. a choice a secretary sent under the person's grant names the secretary and says in words that it
 *      was sent under the person's grant. The grant's id is drawn nowhere on the page: the person can
 *      neither read nor follow it, and no page opens one grant (the check of round 81). Its
 *      tags say only that it was chosen and which words were sent with it. "Your choice" and "Your own
 *      words" are drawn only where the person chose the answer; an older answer that recorded nobody
 *      as its chooser is tagged in the plain words too, and the line saying nobody recorded the chooser
 *      is a part of its own after the time (wave 13s round 81). The secretary's name is drawn at 1440
 *      and 390, in the light look, in English.
 *
 * ONE SEND PRESS FOR THE WHOLE REPORT, in wave 13u round 19. A report of nine
 * boxes had a send press in every one, which was hard work for whoever answered it.
 * Decided: a report's answers are sent together with
 * one press, for people and agents alike. So cases 1 to 5 changed:
 *   - case 1 said: the box's submit and the whole report's submit are drawn, and the whole report's
 *     submit follows the last question in no box (the budget). It now says: one submit is drawn, the
 *     whole report's, none in the box, and it follows the box that holds the last question.
 *   - cases 2, 3 and 5 read the box's submit beside the whole report's. They now read the whole
 *     report's alone, and case 2 finds no submit in the box.
 *   - case 4 said: a report whose every question is in a box draws no whole-report submit, and the
 *     box's submit reads the Chinese word for "send the answers in this box". It now says: that
 *     report draws one whole-report submit after its box, and in Chinese it reads the page's word
 *     for "send all the answers".
 *
 * THE ANSWERS ARE WRITTEN STRAIGHT INTO THIS TEST'S OWN DATABASE, as only the answer door would write
 * them, so the drawing can be held over every state without pressing through each one. They are
 * stamped with the time the test runs, so a picture never shows a time the page did not live
 * through. Everybody and everything here is made up. `liveApp` starts its own API with a database of
 * its own; nothing touches the owner's server.
 *
 * MUTATIONS THAT PROVED IT:
 *   - round 29: the `choice` arm of `Block()` in src/web/components/SummaryBlocks.tsx taken out, so a
 *     choice falls to the refusal for a type this build cannot draw. Every case went red.
 *   - round 30: `answering` in ReportQuestions.tsx made always true, so a sent answer keeps its
 *     inputs: cases 2 and 3 go red (a sent answer is drawn as answering, with inputs), and cases 4
 *     and 5 go red waiting for a "Change this answer" press that is never drawn.
 *   - round 30: the count at the top reading a kept answer as sent: cases 2 and 4 go red on the
 *     line's words, in English and in Chinese.
 *   - round 30: the whole report's submit drawn again under the report rather than after the last
 *     question in no box: case 1 goes red (nothing follows the fill-in box) and case 4 goes red (a
 *     whole-report submit is drawn where every question is in a box).
 *   - round 30: the box's submit given the English word whatever the page's language: case 4 goes
 *     red on the Chinese page.
 *   - round 33: the greyed submit drawn again when everything is sent: case 3 goes red.
 *   - round 33: the Recommended badge put back beside the option's words (the option a flex row):
 *     case 11 goes red, the words squeezed to under three quarters of the row at 390.
 *   - round 33: the title card pulled up under the phone bar (.rp-head margin-top -120px): case 11 goes red.
 *   - wave 13s round 81: the tags "Your choice" and "Your own words" drawn whoever chose the answer:
 *     case 12 goes red.
 *   - wave 13s round 81: the sentence about the chooser drawn inside the sender's name again: case 12
 *     goes red.
 *   - wave 13s round 81, after the check: the grant's id drawn again after the words on the sent line:
 *     case 12 goes red, the id found on the page.
 *   - wave 13s round 81, after the check: the id put back into the word, as "{grant}", and handed to it
 *     by the line: case 12 goes red on the words.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { gapBetween } from '../src/shared/spacing.ts'
import { nowStamp } from '../src/shared/time.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
const en = createI18n('en').t
const zh = createI18n('zh').t

/** Two sentences of the count line, joined as the page joins them. */
const joined = (one: string, other: string): string => one + gapBetween(one, other) + other

/** The questions of one report, made up: a pottery studio choosing a kiln. Four choices and fill-in boxes, and one button. */
const BLOCKS = [
  { id: 'b-lead', type: 'text', text: 'The studio needs a second kiln before the spring orders. Three questions decide which one.' },
  {
    id: 'q-kiln',
    type: 'choice',
    question: 'Which kiln should the studio buy?',
    options: [
      { id: 'a', label: 'The electric kiln, which fits the current wiring', recommended: true },
      { id: 'b', label: 'The gas kiln, which needs a new flue' },
      { id: 'c', label: 'No second kiln this year' },
    ],
  },
  { id: 'q-budget', type: 'fillin', asks: 'What is the most the studio should spend on it?' },
  { id: 'q-order', type: 'button', label: 'Ask the supplier for a quote', confirm: 'Ask the supplier for a quote now?' },
  {
    id: 'box-delivery',
    type: 'box',
    title: 'The delivery',
    blocks: [
      {
        id: 'q-day',
        type: 'choice',
        question: 'Which days may the kiln be delivered on?',
        many: true,
        options: [
          { id: 'mon', label: 'Monday' },
          { id: 'wed', label: 'Wednesday' },
          { id: 'fri', label: 'Friday' },
        ],
      },
      { id: 'q-notes', type: 'fillin', asks: 'What should the driver know about the yard?', lines: 'many' },
    ],
  },
]

/** A report whose every choice and fill-in box sits in a box. */
const BOXED_ONLY = [
  { id: 'b-lead', type: 'text', text: 'One question about the shelves, in a box of its own.' },
  {
    id: 'box-shelves',
    type: 'box',
    title: 'The shelves',
    blocks: [{ id: 'q-shelves', type: 'fillin', asks: 'How many shelves should the kiln room hold?' }],
  },
  { id: 'q-call', type: 'button', label: 'Call the carpenter' },
]

/**
 * A REPORT OF NARROW CHOICES AND A NUMBERED LIST THAT KEEPS COUNTING (problem
 * wcvJmktc4VAL), made up: a choice of short options, a choice of four long Chinese options as the owner
 * saw in a real report, and a numbered list of the shape that restarted at 1.
 */
const NARROW = [
  {
    id: 'b-asks',
    type: 'text',
    text: [
      '1. **Which kiln goes in first?** The electric one fits today.',
      '2. **Clear the old glaze shelf?** Two kinds of jar are spare:',
      '   - the ones with cracked lids;',
      '   - the ones nobody has opened in a year.',
      '',
      '   The recommendation is to clear both, after a count.',
      '3. **Who signs the delivery note?**',
    ].join('\n'),
  },
  {
    id: 'q-short',
    type: 'choice',
    question: 'Fire on Saturday?',
    options: [
      { id: 'y', label: 'Yes', recommended: true },
      { id: 'n', label: 'No' },
    ],
  },
  {
    id: 'q-long',
    type: 'choice',
    question: '春季窑炉的釉料该怎么定？',
    options: [
      { id: 'a', label: '沿用去年春天的青瓷釉，配方和烧成曲线都不变，先烧一窑试片，确认颜色和去年一致后再整批上釉。', recommended: true },
      { id: 'b', label: '改用天目釉，需要重新试烧三次，交货会推迟大约两周，但更适合今年订单里那批深色的茶碗。' },
      { id: 'c', label: '一半用青瓷釉、一半用天目釉，两种都要试烧，工作量最大，但能同时满足两类订单的要求。' },
      { id: 'd', label: '先不定，等下周和三位老客户谈过以后再决定，期间窑炉只烧素坯。' },
    ],
  },
]

/** File a report holding the questions, as the person. */
async function aReport(title: string, blocks: unknown[] = BLOCKS): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ kind: 'report', title, summary: 'Questions about the second kiln.', data: { date: '2026-10-02', blocks } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** A made-up secretary, and the made-up grant it sent an answer under. */
const SECRETARY = { id: 'studio-secretary', name: 'The studio secretary' }
const GRANT = 'grantKiln001'

/** Write the made-up secretary into this test's own database, so the page has its name to draw. */
function theSecretaryIsRegistered(): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const at = '2026-10-02 09:00:00'
    db.prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    ).run(`avatar-default-agent-${SECRETARY.id}`, at)
    db.prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) ' +
        "VALUES (?, ?, ?, ?, 0, ?, 'person', ?)",
    ).run(SECRETARY.id, SECRETARY.name, SECRETARY.id, `avatar-default-agent-${SECRETARY.id}`, at, THE_PERSON)
  } finally {
    db.close()
  }
}

/** Write answers into the report's data the way only the answer door would. */
function keepTheseAnswers(id: string, answers: Record<string, unknown>): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const row = db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string } | undefined
    if (row === undefined) throw new Error(`no record ${id}`)
    const data = JSON.parse(row.data) as Record<string, unknown>
    const changed = db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data, answers }), id)
    expect(changed.changes).toBe(1)
  } finally {
    db.close()
  }
}

async function open(id: string, { lang = 'en', width = 1440, look = 'light', as = 'human' }: { lang?: string; width?: number; look?: string; as?: 'human' | 'agent' } = {}): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}&as=${as}#${recordPath(id)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.rq-count').waitFor({ timeout: 30_000 })
}

let unanswered = ''
let answered = ''
let allSent = ''
let boxedOnly = ''
let narrow = ''
let narrowSent = ''
let underTheGrant = ''
/** The time the answers were seeded, which is the time this test runs. */
let seededAt = ''

beforeAll(async () => {
  app = await liveApp({ name: 'a-report-asks-the-person', viewport: { width: 1440, height: 1000 }, workspace: 'default', opensAt: 'full' })
  // THE PAGE READS AS THE PERSON, OR AS AN AGENT, in the look the address names.
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    const actor = query.get('as') === 'agent' ? { type: 'agent', id: 'kiln-helper' } : { type: 'human', id: person }
    localStorage.setItem('mole-office.actor', JSON.stringify(actor))
  }, { person: THE_PERSON })
  unanswered = await aReport('Choosing the second kiln')
  answered = await aReport('Choosing the second kiln, partly answered')
  allSent = await aReport('Choosing the second kiln, every answer sent')
  boxedOnly = await aReport('The kiln room shelves', BOXED_ONLY)
  narrow = await aReport('Narrow choices for the spring kiln', NARROW)
  narrowSent = await aReport('Narrow choices for the spring kiln, answered', NARROW)
  underTheGrant = await aReport('Choosing the second kiln, sent by the secretary')
  theSecretaryIsRegistered()
  seededAt = nowStamp()
  // THE PERSON'S OWN SEND, as the answer door writes it: the person sent it and chose it.
  const sent = (answer: Record<string, unknown>, message: string, decision?: string) => ({
    answer,
    by: THE_PERSON,
    chosenBy: { kind: 'person', id: THE_PERSON },
    at: seededAt,
    to: 'kiln-helper',
    message,
    ...(decision === undefined ? {} : { decision }),
  })
  keepTheseAnswers(answered, {
    'q-kiln': { sent: sent({ chosen: ['a'], words: 'Only if it arrives before March' }, 'msgKiln00001', 'decKiln00001') },
    'q-budget': { draft: { answer: { words: 'Four thousand pounds' }, at: seededAt } },
    'q-notes': {
      sent: sent({ words: 'The gate is narrow.' }, 'msgKiln00002'),
      draft: { answer: { words: 'The gate is narrow; use the back lane.' }, at: seededAt },
    },
  })
  keepTheseAnswers(narrowSent, {
    'q-short': { sent: sent({ chosen: ['y'] }, 'msgKiln00005', 'decKiln00004') },
    'q-long': { sent: sent({ chosen: ['a'], words: '先烧试片' }, 'msgKiln00005', 'decKiln00005') },
  })
  keepTheseAnswers(underTheGrant, {
    // THE SECRETARY'S SEND UNDER THE GRANT, of an answer it chose.
    'q-kiln': {
      sent: {
        answer: { chosen: ['a'], words: 'Only if it arrives before March' },
        by: SECRETARY.id,
        underTheGrant: GRANT,
        chosenBy: { kind: 'agent', id: SECRETARY.id },
        at: seededAt,
        to: 'kiln-helper',
        message: 'msgKiln00006',
        decision: 'decKiln00006',
      },
    },
    // AN OLDER ANSWER: the person sent it, and nobody recorded who chose it.
    'q-day': { sent: { answer: { chosen: ['mon'] }, by: THE_PERSON, at: seededAt, to: 'kiln-helper', message: 'msgKiln00007', decision: 'decKiln00007' } },
  })
  keepTheseAnswers(allSent, {
    'q-kiln': { sent: sent({ chosen: ['a'] }, 'msgKiln00003', 'decKiln00002') },
    'q-budget': { sent: sent({ words: 'Four thousand pounds' }, 'msgKiln00003') },
    'q-day': { sent: sent({ chosen: ['mon', 'fri'] }, 'msgKiln00004', 'decKiln00003') },
    'q-notes': { sent: sent({ words: 'The gate is narrow; use the back lane.' }, 'msgKiln00004') },
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('1. draws the questions, the box with no submit of its own, and the one whole-report submit after the box that holds the last question, at 1440 and at 390', async () => {
  for (const width of [1440, 390]) {
    await open(unanswered, { width })
    const page = app.page
    const here = `at ${String(width)}`
    for (const selector of ['.rq-choice', '.rq-fillin', '.rq-button', '.rq-box', '.rq-report-submit .rq-submit']) {
      expect(await page.locator(selector).count(), `${here}: nothing drawn as ${selector}`).toBeGreaterThan(0)
    }
    expect(await page.locator('.sb-fail').count(), `${here}: a question was refused rather than drawn`).toBe(0)
    const kiln = page.locator('.rq-choice', { hasText: 'Which kiln should the studio buy?' })
    expect(await kiln.locator('input[type="radio"]').count()).toBe(3)
    expect(await kiln.locator('.rq-option', { hasText: 'The electric kiln' }).locator('.rq-recommended').innerText()).toBe(en('rq.choice.recommended'))
    expect(await kiln.locator('.rq-own textarea').count(), `${here}: a choice offers no box of several lines for the person's own words`).toBe(1)
    expect(await page.locator('.rq-box .rq-choice input[type="checkbox"]').count()).toBe(3)
    expect(await page.locator('.rq-box .rq-fillin textarea').count()).toBe(1)
    expect(await page.locator('.rq-box .rq-own textarea').count()).toBe(1)
    expect(await page.locator('.rq-button .px-btn').innerText()).toBe('Ask the supplier for a quote')
    expect(await page.locator('.rq-report-submit .px-btn').innerText()).toBe(en('rq.submit.report'))

    // ONE SEND PRESS FOR THE WHOLE REPORT: the box draws none of its own.
    expect(await page.locator('.rq-box .rq-submit').count(), `${here}: the box draws a submit of its own`).toBe(0)
    expect(await page.locator('.rq-submit').count(), `${here}: more than one submit is drawn`).toBe(1)

    // THE WHOLE REPORT'S SUBMIT IS WHERE THE PERSON ANSWERS: straight after the box that holds the
    // last choice or fill-in box, and nowhere in the report's foot.
    const delivery = page.locator('.rq-box', { hasText: 'What should the driver know about the yard?' })
    expect(
      await delivery.evaluate((el) => el.nextElementSibling?.classList.contains('rq-report-submit') === true),
      `${here}: the whole report's submit does not follow the box that holds the last question`,
    ).toBe(true)
    expect(await page.locator('.rq-report-submit').count(), `${here}: the whole report's submit is drawn more than once`).toBe(1)
    expect(await page.locator('.sb-foot .rq-submit, .rq-report-foot').count(), `${here}: a submit is still drawn at the report's foot`).toBe(0)

    // NOTHING ANSWERED IS NOT EVERYTHING SENT.
    expect(await page.locator('.rq-report-submit .px-btn').getAttribute('aria-disabled')).toBe('true')
    expect(await page.locator('.rq-report-submit .rq-submit-state').innerText()).toBe(en('rq.submit.nothingAnswered'))
    expect(await page.locator('.rq-count').innerText(), `${here}: the line at the top`).toBe(en('rq.count.noneAnswered', { n: 4 }))
    if (width === 390) {
      const drawn = await page.evaluate(() => {
        const edge = document.documentElement.clientWidth
        const past = [...document.querySelectorAll('.rq, .rq *, .rq-report-submit, .rq-report-submit *, .rq-count')]
          .filter((el) => el.closest('dialog') === null)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.right > edge + 0.5 || r.left < -0.5))
          .map(({ el }) => el.className || el.tagName)
        const small = [...document.querySelectorAll('.rq-option, .rq .px-btn, .rq .px-input, .rq-report-submit .px-btn')]
          .map((el) => ({ name: el.className, h: el.getBoundingClientRect().height }))
          .filter(({ h }) => h < 44)
        return { scroll: document.documentElement.scrollWidth, edge, past, small }
      })
      expect(drawn.scroll, 'the page scrolls sideways at 390').toBe(drawn.edge)
      expect(drawn.past, 'something in the questions is drawn past the window at 390').toEqual([])
      expect(drawn.small, 'a control in the questions is smaller than a finger at 390').toEqual([])
    }
  }
}, 240_000)

it('2. draws a sent answer as words with no input until it is changed, and a changed answer with its inputs and the sent one beside them', async () => {
  await open(answered)
  const page = app.page
  const kiln = page.locator('.rq-choice', { hasText: 'Which kiln should the studio buy?' })
  // A SENT ANSWER IS NOT AN INPUT.
  expect(await kiln.getAttribute('data-state')).toBe('sent')
  expect(await kiln.locator('input, textarea').count(), 'a sent choice still draws an input').toBe(0)
  const chosen = kiln.locator('.rq-sent-options li[data-chosen="yes"]')
  expect(await chosen.count()).toBe(1)
  expect(await chosen.innerText()).toContain('The electric kiln, which fits the current wiring')
  expect(await kiln.locator('.rq-sent-options li:not([data-chosen])').count(), 'the options not chosen are not drawn beside it').toBe(2)
  expect(await kiln.locator('q.rq-sent-words').innerText()).toBe('Only if it arrives before March')
  const sent = kiln.locator('.rq-said[data-answer="sent"]')
  expect(await sent.count()).toBe(1)
  expect(await sent.innerText()).toContain(en('rq.sent'))
  expect(await sent.locator('time').getAttribute('datetime'), 'the sent time is not the time it was seeded').toBe(seededAt)
  expect(await sent.locator('.rq-who').innerText(), 'nobody is named as having sent it').not.toBe('')
  expect(await sent.locator('a.rq-decision').getAttribute('href')).toBe(`#${recordPath('decKiln00001', 'decision')}`)

  // "CHANGE THIS ANSWER" OPENS THE INPUTS, WITH THE SENT ANSWER IN THEM, and the sent answer stays beside them.
  const change = kiln.locator('.rq-change .px-btn')
  expect(await change.innerText()).toBe(en('rq.change'))
  await change.click()
  await kiln.locator('input[value="a"]').waitFor()
  expect(await kiln.getAttribute('data-state')).toBe('answering')
  expect(await kiln.locator('input[value="a"]').isChecked()).toBe(true)
  expect(await kiln.locator('input[value="a"]').isEnabled()).toBe(true)
  expect(await kiln.locator('.rq-own textarea').inputValue()).toBe('Only if it arrives before March')
  expect(await kiln.locator('.rq-said[data-answer="sent"]').innerText()).toContain('The electric kiln, which fits the current wiring')

  const budget = page.locator('.rq-fillin', { hasText: 'What is the most the studio should spend on it?' })
  expect(await budget.getAttribute('data-state')).toBe('answering')
  expect(await budget.locator('.rq-said[data-answer="sent"]').count()).toBe(0)
  const kept = budget.locator('.rq-said[data-answer="kept"]')
  expect(await kept.innerText()).toContain(en('rq.kept'))
  expect(await kept.innerText()).toContain('Four thousand pounds')
  expect(await budget.locator('textarea').inputValue()).toBe('Four thousand pounds')

  // A SENT ANSWER CHANGED SINCE: its inputs are drawn, with the sent answer read-only beside them.
  const notes = page.locator('.rq-fillin', { hasText: 'What should the driver know about the yard?' })
  expect(await notes.getAttribute('data-state')).toBe('answering')
  expect(await notes.locator('textarea').isEnabled()).toBe(true)
  expect(await notes.locator('textarea').inputValue()).toBe('The gate is narrow; use the back lane.')
  expect(await notes.locator('.rq-said[data-answer="sent"]').innerText()).toContain('The gate is narrow.')
  expect(await notes.locator('.rq-said[data-answer="kept"]').innerText()).toContain('use the back lane')

  // THE LINE AT THE TOP COUNTS QUESTIONS: one of four nobody answered, two with answers not sent.
  expect(await page.locator('.rq-count').innerText()).toBe(joined(en('rq.count.notAnswered', { n: 1, total: 4 }), en('rq.count.notSent', { n: 2 })))

  // THE ONE SUBMIT IS ON WHILE SOMETHING IS UNSENT, and counts what is unsent in the box with the rest.
  expect(await page.locator('.rq-report-submit .px-btn').getAttribute('aria-disabled')).toBe(null)
  expect(await page.locator('.rq-report-submit .rq-submit-state').innerText()).toBe(en('rq.submit.unsent', { n: 2 }))
  expect(await page.locator('.rq-box .rq-submit').count(), 'the box draws a submit of its own').toBe(0)
}, 180_000)

it('3. with every answer sent, no input is enabled anywhere and the line at the top says every question is answered and sent', async () => {
  await open(allSent)
  const page = app.page
  expect(await page.locator('.rq-count').innerText()).toBe(en('rq.count.allSent', { n: 4 }))
  expect(await page.locator('.rq[data-state="sent"]').count()).toBe(4)
  const enabled = await page.locator('.rq input:not([disabled]), .rq textarea:not([disabled])').count()
  expect(enabled, 'an input is drawn for an answer already sent').toBe(0)
  const days = page.locator('.rq-choice', { hasText: 'Which days may the kiln be delivered on?' })
  expect(await days.locator('.rq-sent-options li[data-chosen="yes"]').allInnerTexts()).toEqual([
    expect.stringContaining('Monday'),
    expect.stringContaining('Friday'),
  ])
  const notes = page.locator('.rq-fillin', { hasText: 'What should the driver know about the yard?' })
  expect(await notes.locator('.rq-sent-words').innerText()).toBe('The gate is narrow; use the back lane.')
  expect(await page.locator('.rq-report-submit .rq-submit-state').innerText()).toBe(en('rq.submit.allSent'))
  // ROUND 33: with nothing left to send, no greyed press is drawn, only the line.
  expect(await page.locator('.rq-report-submit .px-btn').count(), 'a press that can never be pressed').toBe(0)
  // CHANGING ONE OPENS THAT ONE ONLY.
  await notes.locator('.rq-change .px-btn').click()
  await notes.locator('textarea').waitFor()
  expect(await notes.locator('textarea').inputValue()).toBe('The gate is narrow; use the back lane.')
  expect(await page.locator('.rq input:not([disabled]), .rq textarea:not([disabled])').count()).toBe(1)
}, 180_000)

it('4. draws one whole-report submit after the box when every question is in a box, and it reads the page’s own word in Chinese', async () => {
  await open(boxedOnly)
  const page = app.page
  expect(await page.locator('.rq-submit').count(), 'a report whose every question is in a box draws other than one submit').toBe(1)
  expect(await page.locator('.rq-box .rq-submit').count(), 'the box draws a submit of its own').toBe(0)
  expect(
    await page.locator('.rq-box').evaluate((el) => el.nextElementSibling?.classList.contains('rq-report-submit') === true),
    'the whole report\'s submit does not follow the box',
  ).toBe(true)
  expect(await page.locator('.rq-report-submit .px-btn').innerText()).toBe(en('rq.submit.report'))
  expect(await page.locator('.rq-count').innerText()).toBe(en('rq.count.noneAnswered', { n: 1 }))

  await open(unanswered, { lang: 'zh' })
  expect(await page.locator('.rq-submit').count()).toBe(1)
  expect(await page.locator('.rq-report-submit .px-btn').innerText()).toBe(zh('rq.submit.report'))
  expect(await page.locator('.rq-count').innerText()).toBe(zh('rq.count.noneAnswered', { n: 4 }))
  await open(answered, { lang: 'zh' })
  expect(await page.locator('.rq-count').innerText()).toBe(joined(zh('rq.count.notAnswered', { n: 1, total: 4 }), zh('rq.count.notSent', { n: 2 })))
  expect(await page.locator('.rq-change .px-btn').first().innerText()).toBe(zh('rq.change'))
}, 180_000)

it('5. read as an agent, every input and submit is off and says only the person answers', async () => {
  await open(answered, { as: 'agent' })
  const page = app.page
  const inputs = page.locator('.rq input, .rq textarea')
  expect(await inputs.count()).toBeGreaterThan(5)
  for (const one of await inputs.all()) expect(await one.isDisabled()).toBe(true)
  expect(await page.locator('.rq-report-submit .px-btn').getAttribute('aria-disabled')).toBe('true')
  expect(await page.locator('.rq-report-submit .rq-submit-state').innerText()).toBe(en('rq.onlyThePerson'))
  expect(await page.locator('.rq-button .px-btn').getAttribute('aria-disabled')).toBe('true')
  expect(await page.locator('.rq-change .px-btn').first().getAttribute('aria-disabled')).toBe('true')
}, 180_000)

it('9. draws a choice as wide as its words: a short option is well under the block, a long one wraps at the measure, sent or not', async () => {
  const MOST = 36 * 16
  for (const id of [narrow, narrowSent]) {
    await open(id, { width: 1440 })
    const widths = await app.page.evaluate(() => {
      const box = (selector: string): number[] => Array.from(document.querySelectorAll(selector)).map((one) => one.getBoundingClientRect().width)
      return {
        block: box('[data-target$="/q-short"], .rq-choice')[0] ?? 0,
        shortOptions: box('.rq-choice:has(.rq-q) .rq-option, .rq-choice:has(.rq-q) .rq-sent-options li').slice(0, 2),
        allOptions: [...box('.rq-option'), ...box('.rq-sent-options li')],
      }
    })
    expect(widths.block, JSON.stringify(widths)).toBeGreaterThan(600)
    expect(widths.shortOptions.length, JSON.stringify(widths)).toBe(2)
    // UNDER A QUARTER OF THE BLOCK. A half would hold even a full-width option, which the 36rem measure caps at 576 px
    // on a 1,164 px block; a short option is drawn at about 190 px.
    for (const one of widths.shortOptions) expect(one, `a short option at 1440: ${JSON.stringify(widths)}`).toBeLessThan(widths.block / 4)
    for (const one of widths.allOptions) expect(one, `no option past the measure: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(MOST + 1)
  }
}, 120_000)

it('11. at 390 the Recommended badge never narrows a long option\'s words, in English and in Chinese, and nothing covers the title card', async () => {
  for (const lang of ['en', 'zh']) {
    await open(narrow, { lang, width: 390 })
    const seen = await app.page.evaluate(() => {
      const option = [...document.querySelectorAll('.rq-option')].find((one) => one.querySelector('.rq-recommended') !== null && (one.textContent ?? '').length > 30)!
      const words = option.querySelector('.rq-option-words')!.getBoundingClientRect()
      const box = option.getBoundingClientRect()
      const bar = document.querySelector('.shell-bar')?.getBoundingClientRect()
      const card = document.querySelector('.rp-head')?.getBoundingClientRect()
      return { words: words.width, option: box.width, barBottom: bar?.bottom ?? 0, cardTop: card?.top ?? -1, scroll: window.scrollY }
    })
    expect(seen.words / seen.option, `${lang}: the long option's words were squeezed: ${JSON.stringify(seen)}`).toBeGreaterThan(0.75)
    // THE TITLE CARD, AT THE TOP OF THE PAGE: the phone bar ends above it. (The bar is sticky, so it
    // lies over what scrolls under it, which a full-page picture taken after scrolling shows.)
    expect(seen.scroll).toBe(0)
    expect(seen.barBottom, `${lang}: the phone bar covers the title card: ${JSON.stringify(seen)}`).toBeLessThanOrEqual(seen.cardTop)
  }
}, 120_000)

it('12. a choice a secretary sent under the grant names the secretary and says the grant in words, never by its id, and is tagged in words that name nobody; "Your choice" is drawn only where the person chose', async () => {
  await open(underTheGrant)
  const page = app.page
  const kiln = page.locator('.rq-choice', { hasText: 'Which kiln should the studio buy?' })
  expect(await kiln.locator('.rq-chosen').allInnerTexts(), 'the tag on a choice the secretary made').toEqual([en('rq.sent.chosenAsSent')])
  expect(await kiln.locator('.rq-own-label').innerText(), 'the label on words the secretary sent').toBe(en('rq.sent.wordsSent'))
  const who = kiln.locator('.rq-said[data-answer="sent"] .rq-who')
  await expect.poll(async () => who.innerText(), { timeout: 30_000 }).toContain(SECRETARY.name)
  // THE GRANT IN WORDS, NEVER BY ITS ID. The id is asked of the whole page, so it is not drawn beside the line either.
  expect(await who.innerText()).toContain(en('rq.sent.underTheGrant'))
  expect(await page.locator('body').innerText(), "the grant's id is drawn on the page").not.toContain(GRANT)
  // AN OLDER ANSWER WITH NO CHOOSER RECORDED is tagged in the same plain words, and its line marks who
  // chose it as not recorded, in a part of its own and not run on from the sender's name.
  const days = page.locator('.rq-choice', { hasText: 'Which days may the kiln be delivered on?' })
  expect(await days.locator('.rq-chosen').allInnerTexts(), 'the tag on a choice nobody recorded the chooser of').toEqual([en('rq.sent.chosenAsSent')])
  expect(await days.locator('.rq-said[data-answer="sent"] .rq-chooser').innerText()).toBe(en('rq.sent.chooserUnrecorded'))
  expect(await days.locator('.rq-who').innerText(), 'the words about the chooser run on from the sender').not.toContain(en('rq.sent.chooserUnrecorded'))

  // THE PERSON'S OWN CHOICE KEEPS "YOUR CHOICE" AND "YOUR OWN WORDS".
  await open(answered)
  const theirs = app.page.locator('.rq-choice', { hasText: 'Which kiln should the studio buy?' })
  expect(await theirs.locator('.rq-chosen').allInnerTexts()).toEqual([en('rq.sent.chosen')])
  expect(await theirs.locator('.rq-own-label').innerText()).toBe(en('rq.sent.ownWords'))

  for (const width of [1440, 390]) {
    await open(underTheGrant, { width, look: 'light' })
    await expect.poll(async () => app.page.locator('.rq-choice .rq-who').first().innerText(), { timeout: 30_000 }).toContain(SECRETARY.name)
  }
}, 300_000)
