// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK INSIDE THE COMPOSER IS ABOUT THE COMPOSER, AND IT KEEPS WHAT YOU WERE WRITING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 20 August 2026, on a clean load: right-click a block of a report, type an instruction into the
 * composer, then right-click the composer's own intents row. The chip went from `Block of a report`
 * to `Page Record`, the box emptied, and the draft id changed. Six of the seven regions a person can
 * hit did that. Only the instruction box itself answered, because it was the one element in the
 * whole popup that said what it was: the walk up the tree ran past everything else and stopped at
 * the page behind the composer.
 *
 * The words were not deleted — this browser keeps one instruction per thing, and the old one was
 * still stored under the block. But they were off the screen, and nothing said where they had gone.
 * That is the loss this whole feature exists to prevent, and it is the owner's own finding: *the
 * popup itself cannot reliably become context*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Two things, both about what is on the screen and neither about what is stored.
 *
 *   1. NO REGION OF THE COMPOSER TAKES THE INSTRUCTION AWAY. For each region: the quote bar is
 *      unchanged, and the box still holds the instruction, character for character.
 *
 *      CRITERION CHANGE, 27 SEPTEMBER 2026. Until then a right-click on a region also drew a strip
 *      naming the region, with two presses: talk about that instead, or keep writing this. A decision took
 *      that strip off the panel. The check that stays is the one the strip was
 *      built for: pointing inside the composer never re-aims it and never empties its box. The
 *      assertion that the strip is not drawn is here too, so the strip cannot come back unnoticed.
 *
 *   2. THE PANEL THAT CHANGES AN INSTRUCTION SAYS WHICH OF ITS TWO ANSWERS IT GAVE, AND THE CHANGE
 *      IT RECORDS IS THE ONE IT DREW. A phrase gets a quotation and no state word; no phrase gets
 *      the state word, no quotation, and no cut of the instruction anywhere in the panel — asserted
 *      over the panel's whole text rather than over one class name, because the audit of 20 August
 *      2026 defeated the class-name version by putting the same cut back in a different element.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH OF THESE GO RED
 * ---------------------------------------------------------------------------------------
 *
 * Proved by mutation with a control run first; the table is in
 * `design/round-nine/closing-the-audit-composer.md`.
 *
 *   let a press inside the composer replace the subject again  → the region cases
 *   take the declaration off one region                        → that region's case
 *   draw `Whole instruction` in every panel                    → the phrase case
 *   quote sixty characters of the instruction in a `px-talk-note` → the no-cut case
 *   record the change against a collapsed caret                → the case that ties the two
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and
 * the ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

/** Wait for the two frames a drawn change needs before it can be read. */
async function twoFrames(): Promise<void> {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

const REPORT_TITLE = 'What the second calibration run showed'
const PROSE =
  'The mount holds calibration through a full handover, and the reprojection error stayed inside a ' +
  'quarter of a pixel across forty frames.'
const INSTRUCTION = 'Please create a Problem for the missing width contract and link it to round nine.'
const PHRASE = 'create a Problem'

let app: LiveApp
let page: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'inside-composer', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify({
      kind: 'report',
      title: REPORT_TITLE,
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-20', blocks: [{ id: 'b-1', type: 'text', text: PROSE }] },
    }),
  })
  if (!res.ok) throw new Error(`seeding the report answered ${String(res.status)}: ${await res.text()}`)
  reportId = ((await res.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/** What a person can read in the composer at this moment. */
interface OnScreen {
  /** What the composer says it is about, as the chip draws it. */
  subject: string | null
  /** What the strip says was pointed at inside the box, or null when no strip is drawn. */
  pointedAt: string | null
  /** What is in the instruction box, exactly. */
  instruction: string | null
  /** The name of the unsent instruction, so a new box can be told from the same one. */
  draft: string | null
  /** Every frame the composer has open, by the part of Mole Office each one says it is. */
  frames: string[]
}

async function onScreen(): Promise<OnScreen> {
  return page.evaluate(() => {
    const frames = [...document.querySelectorAll<HTMLElement>('.px-talk')]
    const talk = frames.find((one) => one.getAttribute('data-target') === 'uiSurface/composer') ?? null
    const words = (e: Element | null) => (e === null ? null : (e.textContent ?? '').trim())
    const chip = talk?.querySelector('[data-target$="composer.subject"] .px-talk-quote') ?? null
    const strip = talk?.querySelector('.px-talk-offer') ?? null
    return {
      subject: words(chip?.querySelector('.px-talk-chip-what') ?? null),
      pointedAt: strip === null ? null : words(strip.querySelector('.px-talk-chip-what')),
      instruction: talk?.querySelector('textarea')?.value ?? null,
      draft: talk?.querySelector('[data-target^="draft"]')?.getAttribute('data-target') ?? null,
      frames: frames.map((one) => one.getAttribute('data-target') ?? 'says nothing'),
    }
  })
}

/**
 * Start every case the same way: a clean load, a composer opened on the report's one block, and the
 * instruction typed into it.
 *
 * THE STORE IS EMPTIED FIRST. An instruction kept from the case before would refill the next box and
 * the assertion would be about the wrong thing.
 */
async function aComposerWithAnInstruction(): Promise<void> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(() => {
    window.localStorage.clear()
    // THIS CASE POINTS AT A REPORT BLOCK, WHICH IS DRAWN AT FULL. Since the owner's act 3a of 15 September
    // 2026 a report page opens at its summary, so the level under test is set here rather than left
    // to the opening default. The opening default has its own test in
    // tests/a-reader-goes-no-lower-than-conclusion.test.ts.
    window.localStorage.setItem('mole-office.detail.reportContent', 'full')
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-target^="reportBlock/"]').first().waitFor({ timeout: 30_000 })
  await page.locator('[data-target^="reportBlock/"]').first().click({ button: 'right' })
  await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await page.locator('.px-talk textarea').first().fill(INSTRUCTION)
  await page.waitForFunction(
    (words) => document.querySelector<HTMLTextAreaElement>('.px-talk textarea')?.value === words,
    INSTRUCTION,
    { timeout: 15_000 },
  )
  await twoFrames()
}

/** Right-click one region of the composer, in its top left corner, and read the screen after. */
async function rightClick(where: string): Promise<OnScreen> {
  const at = page.locator(where).first()
  await at.click({ button: 'right', position: { x: 4, y: 4 } })
  await twoFrames()
  return onScreen()
}

// ============================================================ 1. every region of the composer

/**
 * The regions, by what a person would call them and how the browser finds each one.
 *
 * THE INSTRUCTION BOX IS NOT ON THIS LIST and has a case of its own below: it is the one region
 * that is not a part of Mole Office's own screen. It carries a `draft` target, so pointing at it opens
 * the panel that changes an instruction, which is the whole of the self-referential case.
 */
const REGIONS: readonly { region: string; where: string }[] = [
  { region: 'the close press', where: '.px-talk-close' },
  { region: 'the quote bar', where: '[data-target$="composer.subject"]' },
  { region: 'the recipient control', where: '.px-talk-to' },
  { region: 'the action row', where: '.px-talk-do' },
]

/**
 * TWO REGIONS ARE NOT ON THAT LIST AND CANNOT BE, and it is said here rather than left to be found.
 *
 * The agent Mole Office proposes, and the fold beside it saying why that agent, are drawn only when
 * Mole Office has an agent to propose. This test's database is a throwaway with one report in it and no
 * agent has ever touched anything, so the composer draws the plain `To` control instead — which is
 * the same region, `Recipient`, and is the row asserted above.
 *
 * Both were measured by hand against a copy of the owner's own corpus, where Mole Office does propose an
 * agent: the proposal answered `Recipient` and the fold answered `More`, with the instruction still
 * in the box. That measurement is in design/round-nine/closing-the-audit-composer.md.
 */

describe('a right-click on a part of the composer keeps the instruction and draws no strip', () => {
  for (const { region, where } of REGIONS) {
    it(`${region} answers, and the box still holds the instruction`, async () => {
      await aComposerWithAnInstruction()
      const before = await onScreen()
      expect(before.instruction, 'the case did not start with an instruction in the box').toBe(INSTRUCTION)
      const after = await rightClick(where)
      expect(after.pointedAt, `${region} drew the strip a decision took away`).toBe(null)
      expect(after.subject, 'the case read no quote bar').not.toBe(null)
      expect(after.instruction, `${region} took the instruction off the screen`).toBe(INSTRUCTION)
      expect(after.subject, `${region} re-aimed the composer`).toBe(before.subject)
      expect(after.draft, `${region} started a different instruction`).toBe(before.draft)
    }, 120_000)
  }

  it('the list of everybody it could go to is drawn inside the recipient region, and the instruction is kept', async () => {
    await aComposerWithAnInstruction()
    const before = await onScreen()
    await page.getByRole('button', { name: 'Choose a contact' }).click()
    await page.locator('.px-talk-chooser').waitFor({ timeout: 15_000 })
    const after = await rightClick('.px-talk-chooser')
    expect(after.pointedAt).toBe(null)
    expect(after.instruction).toBe(INSTRUCTION)
    expect(after.subject).toBe(before.subject)
  }, 120_000)

  it('the panel that changes an instruction is a second frame, and a right-click on it keeps both', async () => {
    await aComposerWithAnInstruction()
    await page.locator('.px-talk textarea').first().click({ button: 'right' })
    await page.locator('.px-talk[data-target$="composer.change"]').waitFor({ timeout: 15_000 })
    const both = await onScreen()
    expect(both.frames, 'pointing at the instruction should open a second, lighter panel').toEqual([
      'uiSurface/composer',
      'uiSurface/composer.change',
    ])
    const after = await rightClick('.px-talk[data-target$="composer.change"] .px-talk-head')
    expect(after.pointedAt).toBe(null)
    expect(after.instruction).toBe(INSTRUCTION)
    expect(after.frames, 'a right-click on the change panel closed or replaced a frame').toEqual([
      'uiSurface/composer',
      'uiSurface/composer.change',
    ])
  }, 120_000)
})

// ============================================================ 2. what the change panel is about

/** Everything the change panel draws, as one string, so no assertion here knows a class name. */
async function everythingThePanelSays(): Promise<string> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.px-talk[data-target$="composer.change"]')
    return panel === null ? '' : (panel.textContent ?? '')
  })
}

/** The change this browser has recorded against the instruction, read back out of the store. */
async function whatWasRecorded(): Promise<{ quote: string; from: number; to: number } | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('mole-office.talk.drafts')
    if (raw === null) return null
    const held = JSON.parse(raw) as { changes?: { quote: string; from: number; to: number }[] }[]
    for (const one of held) {
      const first = (one.changes ?? [])[0]
      if (first !== undefined) return { quote: first.quote, from: first.from, to: first.to }
    }
    return null
  })
}

/**
 * Select a phrase inside the instruction box and raise the menu on it, from the keyboard.
 *
 * THE KEYBOARD AND NOT THE MOUSE, and that is measured rather than preferred. Chromium moves the
 * caret on right-mouse-DOWN, so a right-click that lands outside the selected characters collapses
 * the selection before any Mole Office code runs — and a textarea's value is not in the document, so
 * there are no rectangles to aim a click at from a test. `Shift+F10` on the focused box keeps the
 * box's own selection in Chromium and reports `button: -1`, which is the keyboard route
 * `whatTheMenuDoes` answers first. Claim `wKR0jkvl_7sz`, and open.ts says the same thing at length.
 */
async function pointAtThePhrase(): Promise<void> {
  await page.evaluate(
    ({ phrase }) => {
      const box = document.querySelector<HTMLTextAreaElement>('.px-talk textarea')
      if (box === null) throw new Error('the composer draws no instruction box')
      const from = box.value.indexOf(phrase)
      box.focus()
      box.setSelectionRange(from, from + phrase.length)
    },
    { phrase: PHRASE },
  )
  await page.keyboard.press('Shift+F10')
  await page.locator('.px-talk[data-target$="composer.change"]').waitFor({ timeout: 15_000 })
}

describe('the panel says which of its two answers it gave, and records the one it said', () => {
  it('a phrase quotes the phrase, says no state word, and records those exact characters', async () => {
    await aComposerWithAnInstruction()
    await pointAtThePhrase()
    const said = await everythingThePanelSays()
    expect(said, 'the panel did not quote the phrase that was pointed at').toContain(`“${PHRASE}”`)
    expect(said, 'a panel that quotes a phrase must not also claim the whole instruction').not.toContain(
      'Whole instruction',
    )

    await page.locator('.px-talk[data-target$="composer.change"] textarea').fill('Say which contract it is.')
    await page
      .locator('.px-talk[data-target$="composer.change"]')
      .getByRole('button', { name: 'Change it' })
      .click()
    await expect.poll(whatWasRecorded, { timeout: 15_000 }).not.toBe(null)
    const recorded = await whatWasRecorded()
    expect(recorded, 'nothing was recorded').not.toBe(null)
    expect(recorded?.quote, 'the change was recorded against words the panel did not name').toBe(PHRASE)
    expect(recorded?.from).toBe(INSTRUCTION.indexOf(PHRASE))
    expect(recorded?.to).toBe(INSTRUCTION.indexOf(PHRASE) + PHRASE.length)
  }, 120_000)

  it('no phrase says the state word, quotes nothing of the instruction, and records all of it', async () => {
    await aComposerWithAnInstruction()
    await page.locator('.px-talk textarea').first().click({ button: 'right' })
    await page.locator('.px-talk[data-target$="composer.change"]').waitFor({ timeout: 15_000 })
    const said = await everythingThePanelSays()
    expect(said, 'the panel did not say it is about the whole instruction').toContain('Whole instruction')
    // THE CUT IS LOOKED FOR IN THE PANEL'S WHOLE TEXT, not in one element. The audit of 20 August
    // 2026 defeated the class-name version of this by putting the same sixty-character cut back in
    // a different element, and the proof went on passing. Twenty characters is short enough that no
    // rewording of the instruction can slip a cut of it past this line.
    expect(said, 'the panel drew a cut of the instruction as though it were a chosen phrase').not.toContain(
      INSTRUCTION.slice(0, 20),
    )

    await page.locator('.px-talk[data-target$="composer.change"] textarea').fill('Say which contract it is.')
    await page
      .locator('.px-talk[data-target$="composer.change"]')
      .getByRole('button', { name: 'Change it' })
      .click()
    await expect.poll(whatWasRecorded, { timeout: 15_000 }).not.toBe(null)
    const recorded = await whatWasRecorded()
    expect(recorded?.quote, 'the panel said the whole instruction and recorded something else').toBe(INSTRUCTION)
    expect(recorded?.from).toBe(0)
    expect(recorded?.to).toBe(INSTRUCTION.length)
  }, 120_000)
})
