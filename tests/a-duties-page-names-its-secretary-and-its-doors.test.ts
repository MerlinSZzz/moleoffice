// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DUTIES RECORD'S PAGE NAMES ITS SECRETARY AND SAYS EACH DOOR IN WORDS.
 *
 * Every value this file makes up is labelled as made up: the secretary's handle and name, the duties' area, the decision
 * they rest on, and the door the list does not name. The two doors the record stores are read from
 * THE_DOORS_THE_LIST_NAMES rather than written here, so a renamed door cannot leave this test reading an old id.
 *
 * What is proved, in a browser against a test office of its own, at 1440 and in English:
 *   1. the body's Secretary section holds the name the registry gives the agent the record names, and the registry id is
 *      nowhere in normal mode;
 *   2. the Doors section holds whatThisDoorDoes(door).en for each stored door, and neither stored id is drawn;
 *   3. a door the list of what the grant carries does not name is drawn as its id and a sentence saying so, with no
 *      error. The write guard refuses such a door, so it is written into this test office's own database and the page
 *      is loaded again;
 *   4. developer mode draws the stored participant reference and each stored door id;
 *   5. once a newer decision of the person's replaces the decision the duties rest on, the Rests on section draws the
 *      words that say so beside it, and the newer decision's title as a link to it (wave 13s round 101, item 12). The
 *      duties still name the decision they named: nothing moves them onto the newer one;
 *   6. a decision filed before case 5's newer one, linked afterwards as replacing the same decision, and then replaced in
 *      turn: the decision's own page and the duties page both name the last of that first filed decision's line, as the
 *      one answer to which decision replaced a decision gives it (wave 13s round 102, item 13).
 *
 * The last case takes pictures only when TEST_SHOTS names a folder. Everything else is read from the code that defines
 * it: the section headings from their word keys, the door words from whatThisDoorDoes, and the doors themselves from
 * THE_DOORS_THE_LIST_NAMES.
 *
 * Three-run proof on 24 October 2026, this whole file each time: red before the code because the page drew no secretary
 * and drew the door ids, then green, then green again after every mutation was restored. Mutations, one at a time, each
 * a run of this file:
 *   A. the participant arm removed from drawableAsWords: cases 1 and 4 red (no Secretary fold on the page);
 *   B. the participant's stored id drawn in normal mode: case 1 red;
 *   C. each door drawn as its stored id: case 2 red;
 *   D. a door the list does not name sent through whatThisDoorDoes: case 3 red.
 * tests/sections.test.ts, with a key in PARTICIPANT_FIELDS the kind does not declare: its declared-field case red.
 * Case 5 was added on 24 October 2026 (round 101) and was red on round 100's code, at the words that say the decision was
 * replaced. Its mutations, each run alone on round 100's tip b1516b751 with round 101's code, after a control run with
 * every case green, and restored before the next:
 *   E. the record's reply carries no restsOnReplacedBy (src/server/api/records.ts): case 5 red, at those words;
 *   F. the Rests on list draws no mark beside a replaced decision (src/web/pages/RecordPage.tsx): case 5 red, at those
 *      words.
 * Case 6 was added on 24 October 2026 (round 102) and was red on round 101's code, at the decision page's mark, which
 * named case 5's decision. Its mutations, each run alone on round 101's tip cc307856b with round 102's code, after a
 * control run with every case green, and restored before the next:
 *   G. the first filed among those that supersede a decision taken as the newest filed
 *      (src/server/lib/replaced-decisions.ts): case 6 red, at the decision page's mark;
 *   H. whatSupersedes answers the first of the line, not the last (replaced-decisions.ts): case 6 red, at that mark;
 *   I. the decision's page works out the replacement from its own links again, as it did before round 102
 *      (src/web/pages/RecordPage.tsx): case 6 red, at that mark;
 *   J. the duties' restsOnReplacedBy reads only the first of the line (src/server/lib/grant/secretary-duties.ts): case 6
 *      red, at the duties page's Rests on section;
 *   K. the decision's own reply reads only the first of the line (src/server/api/records.ts): case 6 red, at the
 *      decision page's mark.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import { THE_DOORS_THE_LIST_NAMES, whatThisDoorDoes } from '../src/shared/what-the-grant-carries-words.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
let page: Page
let dutiesId = ''
let decisionId = ''
let secretaryId = ''
let secretaryName = ''
let doors: string[] = []
const errors: string[] = []
const shots = testShots('a-duties-page-names-its-secretary-and-its-doors')

/** The made-up decision the duties rest on, and the made-up decision case 5 files to replace it. */
const THE_DECISION_TITLE = 'Fixture decision the duties rest on'
const THE_NEWER_TITLE = 'Fixture decision that replaced the one the duties rest on'
/** The made-up decisions case 6 files: one filed before case 5's and linked as replacing the same one, and its replacement. */
const THE_FIRST_FILED_TITLE = 'Fixture decision filed first, linked as replacing it afterwards'
const THE_LAST_TITLE = 'Fixture decision replacing the first filed in turn'
let newerId = ''

/** A door no list names, made up for the case that writes one straight into the test office's database. */
const A_DOOR_THE_LIST_DOES_NOT_NAME = 'made-up.door-the-list-does-not-name'

const headers: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The least a secretary's duties hold, for one made-up secretary registered here (wave 13s round 92). */
async function theLeastDutiesOf(handle: string, decision: string): Promise<Record<string, unknown>> {
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ handle, name: `Fixture ${handle}`, role: THE_SECRETARY }),
  })
  expect(started.status, await started.clone().text()).toBe(201)
  const agent = (await started.json()).agent.id as string
  return { secretary: { kind: 'agent', id: agent }, area: `Fixture the greenhouse, kept by ${handle}.`, restsOn: [decision] }
}

/** A made-up decision of the owner's, replacing the decisions named. */
async function aDecision(title: string, replaces: string[]): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'decision',
      title,
      data: { option_taken: 'Fixture the secretaries keep the greenhouse.', because: 'Fixture a reason.', decided_by: THE_OWNER, replaces },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return (await filed.json()).record.id as string
}

beforeAll(async () => {
  app = await liveApp({ name: 'duties-page', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // THE FOLD'S OPENING IS A 240 MS ANIMATION. These cases read the content behind a fold, so the
  // animation is off and the content is there the moment the press opens it.
  await app.page.emulateMedia({ reducedMotion: 'reduce' })
  page = await app.context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => errors.push(error.message))

  decisionId = await aDecision(THE_DECISION_TITLE, [])
  // PICKED FROM THE DECLARATION, so a door renamed there cannot leave this test reading an old id.
  doors = Object.keys(THE_DOORS_THE_LIST_NAMES).slice(0, 2)
  expect(doors.length, 'the list of what the grant carries names two doors to draw').toBe(2)
  const data = await theLeastDutiesOf('fixture-duties-page-secretary', decisionId)
  data['doors'] = [...doors]
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'secretary_duties', title: 'Fixture the duties of the greenhouse secretary', data }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  dutiesId = (await filed.json()).record.id as string

  secretaryId = (data['secretary'] as { id: string }).id
  const everybody = (await (await fetch(`${app.api}/api/participants`, { headers })).json()) as {
    agents: { id: string; name: string }[]
  }
  secretaryName = everybody.agents.find((one) => one.id === secretaryId)?.name ?? ''
  expect(secretaryName, 'the registry names the secretary this test registered').not.toBe('')
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** The duties record's page in English, normal mode, with every body fold opened. */
async function openTheDutiesPage(): Promise<void> {
  await openTheRecordPage(dutiesId)
}

/** One record's page in English, normal mode, with every body fold opened. */
async function openTheRecordPage(id: string): Promise<void> {
  // A DOCUMENT OF ITS OWN, so a page already at this address really asks the office again (the same reason every
  // browser test that changes the database before reading it starts from about:blank).
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/r/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(() => {
    document.querySelectorAll('main.page details.rd-fold').forEach((one) => {
      (one as HTMLDetailsElement).open = true
    })
  })
  await page.locator('details.rd-fold-body').first().waitFor({ timeout: 30_000 })
}

/** One body fold, found by the heading the reader sees. */
async function theFoldNamed(heading: string) {
  const folds = page.locator('details.rd-fold-body')
  for (let at = 0; at < (await folds.count()); at += 1) {
    const fold = folds.nth(at)
    if ((await fold.locator('summary').first().innerText()).trim() === heading) {
      // THE PAGE MAY DRAW AGAIN AFTER THE FOLDS WERE OPENED, and a drawn-again <details> is closed.
      // Open this one again just before it is read, so the case reads its body and never its heading.
      await fold.evaluate((el) => { (el as HTMLDetailsElement).open = true })
      return fold
    }
  }
  throw new Error(`the page draws no body fold headed "${heading}"`)
}

it('1: the Secretary section holds the registered name, and the registry id is not drawn in normal mode', async () => {
  const words = createI18n('en')
  await openTheDutiesPage()
  const fold = await theFoldNamed(words.t('record.section.secretary'))
  const said = await fold.innerText()
  expect(said).toContain(secretaryName)
  expect(said).not.toContain(secretaryId)
  expect(await page.locator('main').innerText()).not.toContain(secretaryId)
}, 180_000)

it('2: the Doors section says what each stored door does and draws neither stored id', async () => {
  const words = createI18n('en')
  await openTheDutiesPage()
  const fold = await theFoldNamed(words.t('record.section.doors'))
  const said = await fold.innerText()
  for (const door of doors) {
    expect(said).toContain(whatThisDoorDoes(door).en)
    expect(said).not.toContain(door)
  }
  const pageText = await page.locator('main').innerText()
  for (const door of doors) expect(pageText).not.toContain(door)
}, 180_000)

it('3: a door the list does not name is drawn as its id with the sentence that says so, and no error', async () => {
  const words = createI18n('en')
  // THE GUARD REFUSES THIS DOOR ON A WRITE, so the test office's own database is changed instead.
  const held = new Database(join(app.dir, 'panelx.db'))
  try {
    const row = held.prepare('SELECT data FROM records WHERE id = ?').get(dutiesId) as { data: string }
    const data = JSON.parse(row.data) as Record<string, unknown>
    data['doors'] = [...doors, A_DOOR_THE_LIST_DOES_NOT_NAME]
    held.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), dutiesId)
  } finally {
    held.close()
  }
  // THE OFFICE READS THE SAME ROW THE TEST WROTE, before the page is asked to draw it.
  const stored = (await (await fetch(`${app.api}/api/records/${dutiesId}`, { headers })).json()) as {
    record: { data: { doors?: string[] } }
  }
  expect(stored.record.data.doors).toContain(A_DOOR_THE_LIST_DOES_NOT_NAME)

  await openTheDutiesPage()
  const fold = await theFoldNamed(words.t('record.section.doors'))
  const said = await fold.innerText()
  expect(said).toContain(A_DOOR_THE_LIST_DOES_NOT_NAME)
  expect(said).toContain(words.t('record.body.doorTheListDoesNotName'))
  expect(await page.locator('.px-error').count(), 'the page draws no error for the unnamed door').toBe(0)
  expect(errors).toEqual([])
}, 180_000)

it('4: developer mode draws the stored participant reference and each stored door id', async () => {
  const words = createI18n('en')
  // THE CONTROL THE PAGE OFFERS: the Developer choice on Settings, pressed as a reader presses it.
  await page.goto(`${app.site}/?lang=en#/settings`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await openSettingsPanel(page, 'settings.mode')
  await page.locator('.viewswitch').getByRole('button', { name: words.t('settingsPanel.mode.developer'), exact: true }).click()

  await openTheDutiesPage()
  const secretary = await theFoldNamed(words.t('record.section.secretary'))
  expect(await secretary.innerText()).toContain(secretaryId)
  const theDoors = await theFoldNamed(words.t('record.section.doors'))
  const said = await theDoors.innerText()
  for (const door of [...doors, A_DOOR_THE_LIST_DOES_NOT_NAME]) expect(said).toContain(door)
}, 180_000)

it('5: a decision the duties rest on that a newer one replaced is drawn with the words that say so and the newer one, as a link', async () => {
  const words = createI18n('en')
  // THE PERSON'S NEWER DECISION GOES IN; the duties still name the one it replaced.
  newerId = await aDecision(THE_NEWER_TITLE, [decisionId])
  // BACK TO NORMAL MODE, which case 4 left on Developer, by the same stored choice the photographs set.
  await page.goto(`${app.site}/?lang=en#/settings`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => localStorage.setItem('mole-office.mode', 'normal'))

  await openTheDutiesPage()
  const fold = await theFoldNamed(words.t('record.section.restsOn'))
  const said = await fold.innerText()
  expect(said).toContain(THE_DECISION_TITLE)
  expect(said).toContain(`${words.t('record.body.replacedBy')} ${THE_NEWER_TITLE}`)
  const link = fold.getByRole('link', { name: THE_NEWER_TITLE, exact: true })
  expect(await link.count()).toBe(1)
  expect(await link.getAttribute('href')).toContain(newerId)
  expect(said).not.toContain(newerId)
  expect(errors).toEqual([])
}, 180_000)

it("6: a decision filed before case 5's is linked as replacing the same one, and replaced in turn: the decision's page and the duties page name the same decision", async () => {
  const words = createI18n('en')
  // FILED NOW, AND MADE THE FIRST FILED of the two that replace the decision: the times are written into this test
  // office's own database, in order, before the person links it as replacing the decision through the links door.
  const firstId = await aDecision(THE_FIRST_FILED_TITLE, [])
  const held = new Database(join(app.dir, 'panelx.db'))
  try {
    for (const [i, id] of [decisionId, firstId, newerId].entries()) {
      held.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2026-10-01 10:${String(10 + i)}:00`, id)
    }
  } finally {
    held.close()
  }
  const linked = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fromId: firstId, toId: decisionId, type: 'supersedes' }),
  })
  expect(linked.status, await linked.clone().text()).toBe(201)
  const lastId = await aDecision(THE_LAST_TITLE, [firstId])

  // THE DECISION'S OWN PAGE names the last of the first filed one's line as the decision that stands.
  await openTheRecordPage(decisionId)
  const mark = page.locator('.px-gov-superseded')
  expect(await mark.count(), 'the decision page draws the mark of a replaced decision').toBe(1)
  expect(await mark.innerText()).toContain(THE_LAST_TITLE)
  expect(await mark.innerText()).not.toContain(THE_NEWER_TITLE)
  expect(await mark.getByRole('link', { name: THE_LAST_TITLE, exact: true }).getAttribute('href')).toContain(lastId)

  // THE DUTIES PAGE names the same one beside the decision they rest on.
  await openTheDutiesPage()
  const fold = await theFoldNamed(words.t('record.section.restsOn'))
  const said = await fold.innerText()
  expect(said).toContain(`${words.t('record.body.replacedBy')} ${THE_LAST_TITLE}`)
  expect(said).not.toContain(THE_NEWER_TITLE)
  expect(await fold.getByRole('link', { name: THE_LAST_TITLE, exact: true }).getAttribute('href')).toContain(lastId)
  expect(errors).toEqual([])
}, 180_000)

it.skipIf(!process.env['TEST_SHOTS'])(
  'photographs the duties page and the decision they rest on in English at four widths in both looks',
  async () => {
    for (const [name, id] of [['duties-page', dutiesId], ['replaced-decision-page', decisionId]] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const look of ['light', 'dark']) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(`${app.site}/?lang=en#/r/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await page.evaluate((chosen) => {
            localStorage.setItem('mole-office.mode', 'normal')
            localStorage.setItem('mole-office.preset.theme', chosen)
          }, look)
          await page.reload({ timeout: 60_000 })
          await waitForThePage(page, 60_000)
          await page.evaluate(() => {
            document.querySelectorAll('main.page details.rd-fold').forEach((one) => {
              (one as HTMLDetailsElement).open = true
            })
          })
          await page.screenshot({ path: join(shots, `${name}-en-${String(width)}-${look}.png`), fullPage: true })
        }
      }
    }
  },
  600_000,
)
