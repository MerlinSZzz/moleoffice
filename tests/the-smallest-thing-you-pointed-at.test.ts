// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK IS ABOUT THE SMALLEST THING THAT DRAWS ITS OWN WORDS, AND THE COMPOSER DRAWS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Right-click a sentence Mole Office wrote about itself and the composer answered the whole panel. On
 * 21 August 2026, at 1440, against a copy of the owner's corpus:
 *
 *   the sentence `Find work below and choose a day` -> `When work happens this week` (2,309 characters)
 *   the sentence `This week holds 40 hours and ...` -> `Today and this week` (1,083 characters)
 *   a card of the pipeline graph                    -> `The project structure`, the whole panel
 *
 * Selecting words first did not help. The words were stored on the comment as a quote and the
 * composer drew the panel's name over them: fourteen characters selected on Home still read
 * `Today and this week`.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Three clauses, all asserted here on what a person can read:
 *
 *   1. The composer draws the words the place holds. A place holds words when somebody selected
 *      them, and now also when the pointer was inside a smaller piece of a part of the interface.
 *   2. A press with nothing selected, on a part of Mole Office's own screen, is about the nearest piece
 *      the browser draws as its own block, whenever that piece says something the panel's name
 *      does not.
 *   3. It stops at anything Mole Office stores. A record's row draws a title, a state word and a count,
 *      and those are facts about the record rather than things of their own.
 *
 * Clause 2's second half is what keeps a press on a panel's own heading answering the panel: a
 * heading repeats the name, so it carries no meaning of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 * Proved by mutation, with a control run first. Five tests ran every time, and two were red on the
 * build before the fix. Each mutation below took the tests named beside it:
 *
 *   `ownWordsUnder` returns null always        -> 1 red: the press on a sentence
 *   `wordsNamedBy` stops reading a quote place -> 2 red: that one and the selected words
 *   `addsToTheName` returns true always        -> 2 red: the panel heading and the rail row
 *   rule 6 stops asking whether text is stored -> 1 red: the cell of the plan table (until wave 13q's
 *                                                round 16; see that case)
 *   a plan table's fact cell loses its target  -> 1 red: the cell of the plan table
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and
 * the ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { shortenToWords } from '../src/shared/shortening.ts'

let app: LiveApp
let page: Page
let site: string
let planId: string

/** Talk to the API the way the browser does, with a human's headers on every write. */
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': 'the pointing test',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? null : JSON.parse(text)
}

beforeAll(async () => {
  app = await liveApp({ name: 'smallest-thing', viewport: { width: 1440, height: 1000 } })
  page = app.page
  site = app.site
  const cut = await call('POST', '/api/records', {
    kind: 'task',
    title: 'Cut the plate',
    data: { state: 'todo', effort_hours: 14 },
  })
  const { day } = await call('GET', '/api/planning/today')
  await call('POST', '/api/planning/windows', { recordId: cut.record.id, startsOn: day, endsOn: day })
  const bolt = await call('POST', '/api/records', {
    kind: 'task',
    title: 'Bolt it on',
    data: { state: 'todo', effort_hours: 4 },
  })
  const plan = await call('POST', '/api/plans', { title: 'A plan with a rolled-up estimate' })
  planId = plan.plan.id
  // A heading whose two children are tracked work with hours on them, so the heading's own estimate
  // cell adds them up and says something the heading's words do not.
  await call('PUT', `/api/plans/${planId}/body`, {
    body: ['# Rebuild the mount', '## Cut the plate', '## Bolt it on'].join('\n'),
  })
  const read = await call('GET', `/api/plans/${planId}`)
  const lineFor = (words: string): string =>
    (read.lines as { line: { id: string; text: string } }[]).find((one) => one.line.text.includes(words))?.line.id ?? ''
  await call('PATCH', `/api/plans/${planId}/lines/${lineFor('Cut the plate')}`, { recordId: cut.record.id })
  await call('PATCH', `/api/plans/${planId}/lines/${lineFor('Bolt it on')}`, { recordId: bolt.record.id })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/**
 * What the composer's subject line draws: the kind of thing, and the words it names. The title is
 * the chip's tooltip. It holds the words before the chip shortens them, so it can hold more than
 * the chip draws.
 */
type Subject = { kind: string | null; words: string | null; title: string | null }
async function subject(): Promise<Subject> {
  return page.evaluate(() => {
    const talk = [...document.querySelectorAll<HTMLElement>('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    const chip = talk?.querySelector('[data-target$="composer.subject"] .px-talk-quote') ?? null
    const words = (e: Element | null) => (e === null ? null : (e.textContent ?? '').trim())
    const what = chip?.querySelector('.px-talk-chip-what') ?? null
    return {
      kind: words(chip?.querySelector('.px-talk-chip-kind') ?? null),
      words: words(what),
      title: what?.getAttribute('title') ?? null,
    }
  })
}

/** Close whatever is open, so the next case starts from nothing. */
async function closeIt(): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelector('.px-talk') === null, undefined, {
    timeout: 15_000,
  })
}

/**
 * Right-click the drawn element whose words contain `needle`, and answer what the composer drew.
 *
 * The deepest match is taken, because every ancestor of a sentence also contains it and the point
 * of this file is which element the press is about.
 */
async function rightClickOn(needle: string): Promise<Subject> {
  const at = await page.evaluate((needle) => {
    const main = document.getElementById('main')
    if (main === null) throw new Error('the page has not rendered')
    const found = [...main.querySelectorAll('*')].filter(
      (one) => one.children.length === 0 && (one.textContent ?? '').includes(needle),
    )
    const el = found[found.length - 1]
    if (el === undefined) throw new Error(`nothing on this page draws "${needle}"`)
    const box = el.getBoundingClientRect()
    return { x: box.x + Math.min(20, box.width / 2), y: box.y + box.height / 2 }
  }, needle)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect.poll(async () => (await subject()).words, { timeout: 15_000 }).not.toBe(null)
  return subject()
}

// Test change (wave 13y round 165): Work to do is listed on All pages now, and the sidebar draws Decisions in front
// on every page, so the page is taken as drawn once the Decisions row is there, and that row is the one pointed at.
async function go(route: string): Promise<void> {
  await page.goto(`${site}/#${route}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-target="uiSurface/rail.decisions"]').waitFor({ timeout: 30_000 })
}

/** The one sentence the board's heading holds behind its "?", opened the way a person opens it. */
const BOARD_KEYS = sayInEnglish('schedule.boardKeysHint')
async function openTheBoardHint(): Promise<void> {
  await page
    .locator('section', { has: page.locator('h2', { hasText: sayInEnglish('schedule.boardTitle') }) })
    .locator(`summary[aria-label="${sayInEnglish('ui.hintLabel')}"]`)
    .click()
}

// ---------------------------------------------------------------------------- the sentences

describe('a sentence Mole Office wrote about itself', () => {
  it('is what the composer names, not the panel around it', async () => {
    await go('/plan')
    const said = await subject()
    expect(said.words, 'no composer should be open before the press').toBe(null)
    // CRITERION CHANGE (wave 13j round 12): the sentence was drawn open above the board. It is a
    // closed fold at the foot of the board now (rule R7 of report n9Mjk3c_sJRu), so the fold is
    // opened first, the way a person reaches the sentence.
    // CRITERION CHANGE, as decided: the fold of help is gone. The one sentence left is the board
    // heading's hint on the keys, so that hint is opened and its sentence is the one pressed.
    await openTheBoardHint()
    const drawn = await rightClickOn(BOARD_KEYS)
    // CRITERION CHANGE: the chip draws a long sentence shortened and keeps what it has in its title.
    // A press keeps only the opening of a sentence this long, cut where the composer cuts it, so the
    // title holds that opening and not the whole sentence.
    expect(drawn.title).toBe(shortenToWords(BOARD_KEYS).words)
    expect(drawn.words).not.toBe(sayInEnglish('schedule.boardTitle'))
    await closeIt()
  }, 120_000)

  it('still answers the panel when the words under the pointer are the panel’s own name', async () => {
    await go('/plan')
    const drawn = await rightClickOn('When work happens this week')
    expect(drawn.words).toBe('When work happens this week')
    await closeIt()
  }, 120_000)
})

// ---------------------------------------------------------------------------- where it stops

describe('a cell of a plan table, which is a fact about a line Mole Office stores', () => {
  // UNTIL WAVE 13Q'S ROUND 16 THIS ANSWERED THE WHOLE LINE, because a fact cell claimed nothing of
  // its own and the walk up stopped at the row. Problem ON-vXSmgokHf asked that a right-click on a
  // fact beside a line single that fact out, so each fact cell now carries its own target, a
  // `planLineFact`. The composer draws the words that cell holds (clause 1), under the kind that
  // says they are a fact about a line of a plan.
  it('answers that fact, and draws the words the cell holds', async () => {
    await go(`/plans/${planId}/edit`)
    await page.getByRole('button', { name: 'Table', exact: true }).first().click()
    await page.waitForFunction(
      () => (document.getElementById('main')?.textContent ?? '').includes('18h from its parts'),
      undefined,
      { timeout: 30_000 },
    )
    const drawn = await rightClickOn('18h from its parts')
    expect(drawn.kind).toBe('Fact about a line of a plan')
    expect(drawn.words).toBe('“18h from its parts”')
    await closeIt()
  }, 120_000)
})

// ---------------------------------------------------------------------------- selected words

describe('words somebody selected on a part of Mole Office’s own screen', () => {
  it('are the words the composer draws', async () => {
    await go('/plan')
    // CRITERION CHANGE, as decided: the board's help paragraph is gone, so the words selected are
    // the first three of the hint on its heading, opened first.
    await openTheBoardHint()
    const firstWords = BOARD_KEYS.split(' ').slice(0, 3).join(' ')
    const at = await page.evaluate(({ sentence, length }) => {
      const main = document.getElementById('main')
      if (main === null) throw new Error('the page has not rendered')
      const found = [...main.querySelectorAll('*')].filter(
        (one) => one.children.length === 0 && (one.textContent ?? '').includes(sentence),
      )
      const el = found[found.length - 1]
      if (el === undefined) throw new Error('the board drew no sentence to select')
      const text = el.firstChild
      if (text === null) throw new Error('the sentence holds no text')
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, length)
      const selection = getSelection()
      if (selection === null) throw new Error('this browser reports no selection')
      selection.removeAllRanges()
      selection.addRange(range)
      const box = range.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, words: range.toString() }
    }, { sentence: BOARD_KEYS, length: firstWords.length })
    expect(at.words).toBe(firstWords)
    await page.mouse.click(at.x, at.y, { button: 'right' })
    await expect.poll(async () => (await subject()).words, { timeout: 15_000 }).not.toBe(null)
    const drawn = await subject()
    expect(drawn.words).toContain(firstWords)
    expect(drawn.words).not.toBe(sayInEnglish('schedule.boardTitle'))
    await closeIt()
  }, 120_000)
})

// ---------------------------------------------------------------------------- nothing got coarser

describe('the things that already named what was pointed at', () => {
  it('a rail row still answers the rail row', async () => {
    await go('/plan')
    const at = await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-target="uiSurface/rail.decisions"]')][0]
      if (row === undefined) throw new Error('the rail drew no row for decisions')
      const box = row.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    })
    await page.mouse.click(at.x, at.y, { button: 'right' })
    await expect.poll(async () => (await subject()).words, { timeout: 15_000 }).not.toBe(null)
    expect((await subject()).words).toBe('Decisions')
    await closeIt()
  }, 120_000)
})

// ---------------------------------------------------------------------------- a gap between pieces

describe('the gap between two closed folds of Settings', () => {
  // A PRESS ON A CONTAINER'S BACKGROUND IS ON NO WORDS. `DIV.sf-cat-panels` holds a category's folds with a gap
  // between them; a press in that gap quoted the whole text of every fold in the category (message
  // b2Qgh4uamL2A, wave 13q round 43). Nothing smaller than the page is under the pointer there, so the composer
  // names the page. Mutation: `pressedBetweenItsPieces` returns false always -> this case red.
  it('names the page, and quotes none of the folds around it', async () => {
    await go('/settings')
    const at = await page.evaluate(() => {
      for (const panels of document.querySelectorAll<HTMLElement>('#main .sf-cat-panels')) {
        const folds = [...panels.children] as HTMLElement[]
        for (let i = 0; i + 1 < folds.length; i++) {
          const above = folds[i]!.getBoundingClientRect()
          const below = folds[i + 1]!.getBoundingClientRect()
          if (below.top - above.bottom < 4) continue
          folds[i]!.scrollIntoView({ block: 'center' })
          const a = folds[i]!.getBoundingClientRect()
          const b = folds[i + 1]!.getBoundingClientRect()
          const x = Math.round(a.left + 40)
          const y = Math.round((a.bottom + b.top) / 2)
          if (document.elementFromPoint(x, y) !== panels) continue
          return { x, y }
        }
      }
      return null
    })
    if (at === null) throw new Error('no gap between two folds of Settings is under the pointer anywhere on the page')
    await page.mouse.click(at.x, at.y, { button: 'right' })
    await expect.poll(async () => (await subject()).words, { timeout: 15_000 }).not.toBe(null)
    expect(await subject()).toMatchObject({ kind: 'Page', words: 'Settings' })
    await closeIt()
  }, 120_000)
})
