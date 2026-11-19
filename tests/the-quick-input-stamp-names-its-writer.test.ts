// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STAMP ON THE LIST OF QUICK INPUTS NAMES ITS WRITER IN WORDS. Wave 13u round 31, item 11.
 *
 * THE OLD WORDING. `whoWroteIt` drew the stored stamp as it is: the row's kind and id, so the panel said 'Set by
 * owner (human) at ...' or 'Cleared by owner (human) at ...' - a raw actor type in the middle of an English sentence,
 * and an id where a person expects a name.
 *
 * THE NEW WORDING. The stamp is drawn in words, the way the address card draws whose hand set an address
 * (src/web/pages/ProfilePage.tsx, `HowToAddress`): the writer of a row is the person reading the page ('You set this
 * list at ...'), a person or an agent the office knows, named by name, a person or an agent the office cannot name,
 * said by kind, or a writer whose kind the page has no words for, said to be of a kind it does not know. The starting
 * list's stamp (migration 0272) keeps its own sentence, and a row nobody stamped still says so.
 *
 * WHAT IS MADE UP HERE. The office, the person, the agent, and the three rows this test writes straight into the test
 * office's own database, as an older release or a hand edit could leave them. The door refuses every writer but the
 * person (`whyThisCallerMayNotSetTheList`), so a row stamped by an agent, or by a person the office cannot name, or
 * by a kind with no sentence, can only be made this way; the test's name says so.
 *
 * MUTATIONS (each after a control run; the report has the runs and the logs):
 *   - `theWriterInWords` returns the stored id and kind again: the saved, cleared and named-writer cases go red.
 *   - the unknown-kind sentence draws the kind: the last case goes red on 'system' appearing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { stampToTheMinute } from '../src/web/lib/minute.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { photographWithNothingOver, testShots } from './where-shots-go.ts'

let app: LiveApp
let db: TestDb

const shots = testShots('quick-inputs-stamp')
const keepTheShots = (process.env['TEST_SHOTS'] ?? '') !== ''
const en = createI18n('en')
/** The agent the office knows, registered below so the page can name it. */
const AGENT = { handle: 'stamp-writer', name: 'Made-up Stamp Writer', id: '' }
/** A writer the office cannot name: an id no person and no agent of the office has. */
const A_PERSON_IT_CANNOT_NAME = 'a-person-the-office-does-not-know'
const AN_AGENT_IT_CANNOT_NAME = 'an-agent-the-office-does-not-know'

beforeAll(async () => {
  db = await freshDb()
  app = await liveApp({ name: 'quick-input-stamp', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(
    ({ person }) => {
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
      localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    },
    { person: THE_TEST_OFFICES_OWNER.id },
  )
  const made = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    body: JSON.stringify({ handle: AGENT.handle, name: AGENT.name, role: 'worker', runtime: 'claude-code' }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  AGENT.id = String(((await made.json()) as { agent: { id: string } }).agent.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

/** Open Settings with the quick inputs panel open, at one width and theme. */
async function open(width = 1440, theme = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${theme}&mode=normal#/settings`)
  await waitForThePage(app.page, 60_000)
  await openSettingsPanel(app.page, 'settings.quickinputs')
  await app.page.locator('.qin-box').waitFor()
}

/**
 * Open Settings as above, and wait until the page has its answer to the read of the names and has drawn from it. The
 * panel draws a writer it has no name for yet as one whose name is unavailable, so a stamp read before that answer
 * would pass a no-name case whatever the lookup did with the names.
 */
async function openOnceTheNamesAreRead(): Promise<void> {
  const names = app.page.waitForResponse((reply) => reply.url().includes('/api/participants?shape=page') && reply.ok())
  await open()
  await (await names).finished()
  await app.page.evaluate(async () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

/** The stamp lines the panel draws, as words. */
async function theStamp(): Promise<string[]> {
  return (await app.page.locator('[data-testid="quick-inputs-set-by"]').allInnerTexts()).map((one) => one.trim())
}

/** The stored stamp of the one row, as the page read it. */
function theStoredStamp(): { at: string; kind: string; id: string; inputs: string | null } {
  const held = db.client.sqlite.prepare('SELECT inputs, updated_at, updated_by_kind, updated_by_id FROM quick_input_list WHERE only_row = 1').get() as
    | { inputs: string | null; updated_at: string; updated_by_kind: string; updated_by_id: string }
    | undefined
  expect(held, 'the quick_input_list row is there').toBeDefined()
  return { at: held!.updated_at, kind: held!.updated_by_kind, id: held!.updated_by_id, inputs: held!.inputs }
}

/** Write a stamp into the test office's own row, the way an older release or a hand edit could leave it. */
function writeTheStamp(inputs: string | null, kind: string, id: string, at: string): void {
  const changed = db.client.sqlite
    .prepare('UPDATE quick_input_list SET inputs = ?, updated_at = ?, updated_by_kind = ?, updated_by_id = ? WHERE only_row = 1')
    .run(inputs, at, kind, id)
  expect(changed.changes).toBe(1)
}

describe('the stamp names its writer', () => {
  it('keeps the starting list its own sentence, and names nobody for it', async () => {
    await open()
    const at = stampToTheMinute(theStoredStamp().at)
    expect(await theStamp()).toEqual([en.t('quickInputs.fromStart'), en.t('quickInputs.writtenAt', { at })])
  })

  it('says you set the list, after the person saves one', async () => {
    await open()
    await app.page.locator('.qin-box').fill('/context\n/compact\n/a-made-up-input')
    await app.page.getByRole('button', { name: en.t('quickInputs.save'), exact: true }).click()
    await app.page.locator('[data-testid="quick-inputs-stored"]').waitFor()
    const held = theStoredStamp()
    expect({ kind: held.kind, id: held.id }).toEqual({ kind: 'human', id: THE_TEST_OFFICES_OWNER.id })
    // THE STAMP COMES FROM THE LIST READ AGAIN AFTER THE SAVE, and the stored section shows before that read answers. In
    // a whole run of the suite on 21 October 2026 it had not answered yet, and the case read the starting list's stamp
    // (wave 13y round 58). So the stamp is waited for, as in the cleared case below.
    await expect
      .poll(async () => theStamp(), { timeout: 15_000 })
      .toEqual([en.t('quickInputs.setBy', { who: en.t('quickInputs.who.you'), at: stampToTheMinute(held.at) })])
  })

  it('says you cleared the list, after the person clears it', async () => {
    await open()
    await app.page.getByRole('button', { name: en.t('quickInputs.clear'), exact: true }).click()
    const question = app.page.locator('.tiered-question')
    await question.waitFor()
    await question.getByRole('button', { name: en.t('quickInputs.clear'), exact: true }).click()
    await expect.poll(async () => theStoredStamp().inputs).toBeNull()
    await expect.poll(async () => (await theStamp()).join('\n')).toBe(en.t('quickInputs.clearedBy', { who: en.t('quickInputs.who.you'), at: stampToTheMinute(theStoredStamp().at) }))
  })

  it('names an agent the office knows, for a row the door cannot make', async () => {
    writeTheStamp(JSON.stringify(['/context']), 'agent', AGENT.id, '2026-10-19 04:30:00')
    await openOnceTheNamesAreRead()
    const at = stampToTheMinute(theStoredStamp().at)
    await expect.poll(async () => theStamp()).toEqual([en.t('quickInputs.setBy', { who: AGENT.name, at })])
  })

  it('says a person or an agent the office cannot name by kind, and never draws its id', async () => {
    writeTheStamp(JSON.stringify(['/context']), 'human', A_PERSON_IT_CANNOT_NAME, '2026-10-19 04:31:00')
    await openOnceTheNamesAreRead()
    let drawn = (await theStamp()).join('\n')
    expect(drawn).toBe(en.t('quickInputs.setBy', { who: en.t('quickInputs.who.aPersonWithNoName'), at: stampToTheMinute('2026-10-19 04:31:00') }))
    expect(drawn).not.toContain(A_PERSON_IT_CANNOT_NAME)

    writeTheStamp(JSON.stringify(['/context']), 'agent', AN_AGENT_IT_CANNOT_NAME, '2026-10-19 04:32:00')
    await openOnceTheNamesAreRead()
    drawn = (await theStamp()).join('\n')
    expect(drawn).toBe(en.t('quickInputs.setBy', { who: en.t('quickInputs.who.anAgentWithNoName'), at: stampToTheMinute('2026-10-19 04:32:00') }))
    expect(drawn).not.toContain(AN_AGENT_IT_CANNOT_NAME)
  })

  it('says a kind the page has no words for is of a kind it does not know, and never draws the kind', async () => {
    writeTheStamp(JSON.stringify(['/context']), 'system', 'mole-office', '2026-10-19 04:33:00')
    await open()
    const drawn = (await theStamp()).join('\n')
    expect(drawn).toBe(en.t('quickInputs.setBy', { who: en.t('quickInputs.who.anUnknownKind'), at: stampToTheMinute('2026-10-19 04:33:00') }))
    expect(drawn).not.toContain('system')
    expect(drawn).not.toContain('mole-office')
  })
})

describe('the stamp as pictures', () => {
  it('draws the starting list, a saved list and a cleared list at four widths in both themes', async () => {
    if (!keepTheShots) return
    // THE STARTING LIST, as migration 0272 leaves it: the rows the cases above wrote are put back to the migration's
    // inputs and stamp by an UPDATE of the test office's own row, once for each width and theme.
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        writeTheStamp(JSON.stringify(['/context', '/compact']), 'migration', '0272', '2026-10-19 04:00:00')
        await open(width, theme)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${String(width)} ${theme}`).toBe(true)
        await photographWithNothingOver(app.page, '[data-settings-panel="settings.quickinputs"]', `${shots}/starting-list-${String(width)}-${theme}.png`)

        // SAVED BY THE PERSON.
        await app.page.locator('.qin-box').fill('/context\n/compact\n/a-made-up-input')
        await app.page.getByRole('button', { name: en.t('quickInputs.save'), exact: true }).click()
        await app.page.locator('[data-testid="quick-inputs-stored"]').waitFor()
        await photographWithNothingOver(app.page, '[data-settings-panel="settings.quickinputs"]', `${shots}/saved-list-${String(width)}-${theme}.png`)

        // CLEARED BY THE PERSON.
        await app.page.getByRole('button', { name: en.t('quickInputs.clear'), exact: true }).click()
        const question = app.page.locator('.tiered-question')
        await question.waitFor()
        await question.getByRole('button', { name: en.t('quickInputs.clear'), exact: true }).click()
        await expect.poll(async () => theStoredStamp().inputs).toBeNull()
        await app.page.locator('.tiered-question').waitFor({ state: 'detached' }).catch(() => undefined)
        await photographWithNothingOver(app.page, '[data-settings-panel="settings.quickinputs"]', `${shots}/cleared-list-${String(width)}-${theme}.png`)
      }
    }
  }, 300_000)
})
