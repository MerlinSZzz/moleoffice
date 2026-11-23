// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON FILES WORDS SAID ELSEWHERE AS THEIR OWN, AND AN OLD DECISION NOT BASED ON THEIR WORDS IS MARKED ON ITS
 * PAGES. A decision chose option C on problem bXW3UpEsrsoZ. It also took the six points of
 * The review of round 11's pictures (report lwzz__d186xM, block b-argus-review).
 *
 * In a real browser against a Mole Office of its own:
 *   1. a note a secretary prepared for the person to file draws the person's press, and does not quote the words again
 *      above the note's own body; one press files them as the person's own note, and the page then names that note;
 *   2. the same page, read as an agent, draws no press under its heading for others;
 *   3. an old decision in the person's name that cites a note a secretary wrote carries the mark and what the reader
 *      can do, on its own page, and the same page says the decision may be changed by whoever made it "and you"
 *      (the review of round 11b, report dCtqt9ETTmco); the Decisions page lists every marked decision, each with
 *      who recorded it and what it cites by name, and the "?" hint for "What you decided" stays above that list.
 * The marked decisions cover every wording the mark can give. What they cite: a note somebody else wrote, a deleted
 * record, a reference no record answers to, a message an agent sent, a note whose words an agent changed, and nothing
 * at all. Who recorded them: the secretary, an agent nobody registered, Mole Office itself, and nobody the change log
 * records.
 * With OWN_WORDS_SHOTS naming a folder, it photographs the door, the Decisions page's list, the marked decision's own
 * page and who may change it, at 1440, 990, 660 and 390, light and dark, in English and Chinese.
 *
 * Everybody and everything here is made up.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice, governsTheWholeProject } from './helpers.ts'

let app: LiveApp
let prepared = ''
const marked: { id: string; title: string; says: string }[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_QUILL = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' }

const WORDS = 'Fire the kiln on Friday, not Monday. Keep the celadon for the spring batch.'

async function post<T>(path: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, body))
  return (await reply.json()) as T
}

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  return (await post<{ record: { id: string } }>('/api/records', headers, { kind, title, data })).record.id
}

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function openRecord(id: string, query: string): Promise<void> {
  await app.page.goto(`${app.site}/${query}#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'own-words', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  prepared = await file(AS_QUILL, 'note', 'The person, in the terminal, about the kiln', { body: WORDS, for_the_person_to_file: true })

  // OLD DECISIONS: each written by the secretary on the person's message, then given a reference that is not the
  // person's own words, as decisions could be before 4 October. The doors now refuse those writes, so the database is
  // changed directly, and so are the changes made before this round's rule.
  const message = await file(AS_THE_PERSON, 'message', 'About the glaze', { body: 'Use the celadon.', to: [{ kind: 'agent', id: 'quill' }] })
  const agentsNote = await file(AS_QUILL, 'note', 'The glaze, as the secretary wrote it down', { body: 'Celadon.' })
  const goneNote = await file(AS_QUILL, 'note', 'The kiln log, as the secretary kept it', { body: 'Fired twice.' })
  const gone = await fetch(`${app.api}/api/records/${goneNote}`, { method: 'DELETE', headers: AS_QUILL })
  expect(gone.ok, await gone.clone().text()).toBe(true)
  const agentsMessage = await file(AS_QUILL, 'message', 'The shelves are ordered', { body: 'Ordered.', to: [{ kind: 'person', id: THE_PERSON }] })
  const changedNote = await file(AS_THE_PERSON, 'note', 'About the clay', { body: 'Use the red clay.' })
  // WHO RECORDED EACH ONE: the secretary, an agent nobody registered (the change log names an agent id no agent answers
  // to), Mole Office itself (the change log credits the office), or nobody (no row in the change log says who wrote
  // it). Every wording the mark can give appears once.
  const WHO = {
    quill: 'Quill recorded this decision in your name. ',
    unregistered: 'An agent recorded this decision in your name. ',
    office: 'Mole Office recorded this decision in your name. ',
    nobody: 'This decision is in your name; its writer is not recorded. ',
  } as const
  const glaze = 'It cites the note “The glaze, as the secretary wrote it down”, which you did not write.'
  const cases: { title: string; cites: string; by: keyof typeof WHO; says: string }[] = [
    { title: 'The spring batch takes the celadon', cites: agentsNote, by: 'quill', says: glaze },
    { title: 'The kiln fires twice a week', cites: goneNote, by: 'quill', says: 'It cites “The kiln log, as the secretary kept it”, which has been deleted.' },
    { title: 'The glaze test waits for September', cites: 'the-glaze-test-of-12-september', by: 'quill', says: 'It cites “the-glaze-test-of-12-september”, and Mole Office has no such record.' },
    { title: 'Two more shelves for the kiln room', cites: agentsMessage, by: 'quill', says: 'It cites the message “The shelves are ordered”, which an agent sent, not you.' },
    { title: 'The red clay for the bowls', cites: changedNote, by: 'quill', says: 'It cites the note “About the clay”, whose words were changed after it was written, not by you.' },
    { title: 'The kiln room is swept on Mondays', cites: '', by: 'quill', says: 'It cites no record of your words.' },
    { title: 'The bowls are glazed in pairs', cites: agentsNote, by: 'office', says: glaze },
    { title: 'The kiln is cleaned in May', cites: agentsNote, by: 'unregistered', says: glaze },
    { title: 'The shelves hold the bisque ware', cites: agentsNote, by: 'nobody', says: glaze },
  ]
  for (const one of cases) {
    const id = await file(AS_QUILL, 'decision', one.title, {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: message,
      option_taken: 'As the person said.',
      because: 'The person said so.',
    })
    marked.push({ id, title: one.title, says: `${WHO[one.by]}${one.says}` })
  }
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    cases.forEach((one, at) => {
      const id = marked[at]!.id
      db.prepare("UPDATE records SET data = json_set(data, '$.authority_reference', ?) WHERE id = ?").run(one.cites, id)
      if (one.by === 'office') {
        db.prepare("UPDATE changes SET actor_type = 'system', actor_id = 'mole-office/the-api-server' WHERE record_id = ? AND op = 'create'").run(id)
      }
      if (one.by === 'unregistered') {
        db.prepare("UPDATE changes SET actor_id = 'a-run-nobody-registered' WHERE record_id = ? AND op = 'create'").run(id)
      }
      if (one.by === 'nobody') db.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(id)
    })
    db.prepare("UPDATE records SET data = json_set(data, '$.body', ?) WHERE id = ?").run('Use the white clay.', changedNote)
    db.prepare(
      "INSERT INTO changes (id, record_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, 'update', 'agent', 'quill', 'data.body', ?, ?, '2026-10-03 09:00:00')",
    ).run(nanoid(12), changedNote, 'Use the red clay.', 'Use the white clay.')
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the person files words said elsewhere as their own', () => {
  it('draws no press for an agent, under the heading for others', async () => {
    // WHO THIS BROWSER WRITES AS, set the way the actor picker in the sidebar sets it, and put back afterwards.
    await app.page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await app.page.evaluate(() => {
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'quill' }))
    })
    try {
      await openRecord(prepared, '')
      await app.page.getByText(en['ownWords.door.headingForOthers'], { exact: true }).waitFor({ timeout: 30_000 })
      expect(await app.page.getByText(en['ownWords.door.headingForOthers'], { exact: true }).count()).toBe(1)
      expect(await app.page.getByRole('button', { name: en['ownWords.door.press'] }).count()).toBe(0)
    } finally {
      await app.page.evaluate(() => {
        window.localStorage.removeItem('mole-office.actor')
      })
    }
  }, 180_000)

  it('draws the person\'s press, shows the words once, and files them on the person\'s press', async () => {
    await openRecord(prepared, '')
    await app.page.getByRole('button', { name: en['ownWords.door.press'] }).waitFor({ timeout: 30_000 })
    expect(await app.page.getByText(en['ownWords.door.heading'], { exact: true }).count()).toBe(1)
    // THE WORDS ONCE: in the note's own body, and not again in the panel above it.
    expect(await app.page.getByText(WORDS, { exact: true }).count()).toBe(1)
    await app.page.getByRole('button', { name: en['ownWords.door.press'] }).click()
    await app.page.locator('[data-part="filed-as-their-own-words"]').waitFor({ timeout: 30_000 })
    const reply = await fetch(`${app.api}/api/records/${prepared}`, { headers: AS_THE_PERSON })
    const filed = ((await reply.json()) as { filedAsThePersonsWords: { id: string } | null }).filedAsThePersonsWords
    expect(filed).not.toBeNull()
  }, 180_000)
})

describe('an old decision not based on the person\'s own words is marked', () => {
  it('carries the mark and what to do on its own page, and every marked decision is listed by name', async () => {
    const first = marked[0]!
    await openRecord(first.id, '')
    const mark = app.page.locator('[data-part="not-on-their-own-words"]')
    await mark.waitFor({ timeout: 30_000 })
    expect(await mark.innerText()).toBe(first.says)
    expect(await app.page.getByText(en['ownWords.mark.whatYouCanDoHere'].replace('{press}', en['ownWords.door.press'])).count()).toBe(1)
    // THE SAME PAGE ADDRESSES ITS READER ONE WAY: who may change the decision is "you", under a mark that says "your name".
    expect(await app.page.getByText('Only whoever made this decision, and you, may change it.', { exact: true }).count()).toBe(1)

    await app.page.goto(`${app.site}/#/governance`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const listed = app.page.locator('[data-part="decisions-not-on-their-own-words"] li')
    await listed.first().waitFor({ timeout: 30_000 })
    expect(await listed.count()).toBe(marked.length)
    const rows = await listed.allInnerTexts()
    for (const one of marked) expect(rows).toContain(`${one.title}\n${one.says}`)
    expect(await app.page.getByText(en['ownWords.mark.whatYouCanDoFromTheList'].replace('{press}', en['ownWords.door.press'])).count()).toBe(1)

    // THE "?" FOR "WHAT YOU DECIDED" STANDS ABOVE THE LIST, not under it where it would read as the list's own help.
    const hint = app.page.locator('summary[aria-label="' + en['decisions.whyOnlyYouLabel'] + '"]')
    const hintAt = (await hint.boundingBox())?.y ?? Number.NaN
    const listAt = (await app.page.locator('[data-part="decisions-not-on-their-own-words"]').boundingBox())?.y ?? Number.NaN
    expect(hintAt).toBeLessThan(listAt)

    // IN CHINESE, NO SPACE FOLLOWS A CHINESE STOP OR COMMA anywhere in the list: its sentences are drawn apart rather
    // than joined with a space.
    await app.page.goto(`${app.site}/?lang=zh#/governance`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const panel = app.page.locator('[data-part="decisions-not-on-their-own-words"]').locator('xpath=ancestor::section[1]')
    await panel.waitFor({ timeout: 30_000 })
    expect(await panel.innerText()).not.toMatch(/[。，：；] /u)
  }, 180_000)

  it.skipIf(!process.env['OWN_WORDS_SHOTS'])('photographs the door, the list, a marked decision and who may change it at 1440, 990, 660 and 390, light and dark, in English and Chinese', async () => {
    const shots = process.env['OWN_WORDS_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    // A SECOND PREPARED NOTE, so the door is pictured before anybody presses it.
    const second = await file(AS_QUILL, 'note', 'The person, in the terminal, about the shelves', {
      body: 'Order two more shelves for the kiln room. The old ones are cracked.',
      for_the_person_to_file: true,
    })
    const pagesWidth = async (width: number) => {
      const drawn = await app.page.evaluate(() => document.documentElement.scrollWidth)
      expect(drawn, `drawn ${String(drawn)} wide in a window ${String(width)} wide`).toBeLessThanOrEqual(width)
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        for (const language of ['en', 'zh'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          const name = `${String(width)}-${theme}-${language}.png`

          await openRecord(second, `?lang=${language}`)
          await app.page.locator('.tow-acts').waitFor({ timeout: 30_000 })
          await pagesWidth(width)
          await app.page.locator('.tow-acts').scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: join(shots, `door-${name}`) })

          // A WINDOW TALL ENOUGH FOR THE WHOLE LIST: nine marked decisions, one for each wording the mark can give.
          await app.page.setViewportSize({ width, height: 2400 })
          await app.page.goto(`${app.site}/?lang=${language}#/governance`, { timeout: 60_000 })
          await waitForThePage(app.page, 60_000)
          const band = app.page.locator('[data-part="decisions-not-on-their-own-words"]')
          await band.waitFor({ timeout: 30_000 })
          await pagesWidth(width)
          // THE WHOLE LIST PANEL IN THE MIDDLE OF THE WINDOW, as a person sees it. A full-page capture would draw the
          // fixed header and the chat button where the window was, over the page's own words.
          await band.locator('xpath=ancestor::section[1]').evaluate((panel) => panel.scrollIntoView({ block: 'center' }))
          await app.page.screenshot({ path: join(shots, `decisions-${name}`) })

          await app.page.setViewportSize({ width, height: 1000 })
          await openRecord(marked[0]!.id, `?lang=${language}`)
          const mark = app.page.locator('[data-part="not-on-their-own-words"]')
          await mark.waitFor({ timeout: 30_000 })
          await pagesWidth(width)
          await mark.scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: join(shots, `decision-page-${name}`) })
          // WHO MAY CHANGE THE DECISION, further down the same page, said to "you" as the mark is.
          const rule = app.page.getByText(language === 'en' ? 'Only whoever made this decision, and you, may change it.' : '只有作出这条决定的人或智能体，以及你，可以修改决定本身。', { exact: true })
          await rule.evaluate((line) => line.scrollIntoView({ block: 'center' }))
          await app.page.screenshot({ path: join(shots, `decision-rule-${name}`) })
        }
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 2_400_000)
})
