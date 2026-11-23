// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S NEEDS YOU CARD NAMES A LINK'S WORDS AND AN AGENT'S DISPLAY NAME, AND CUTS A LONG TITLE AT A WORD.
 *
 * Item 97. In every picture of Home the first card read
 * "Please read 98Olu2I3070Z and t": a message's link drawn as its raw record id, and the title cut in
 * the middle of a word with no mark that it was cut. The same card named a test registration by its
 * handle, "<handle> registers itself", where the person looked for the name they had given it.
 *
 * The office is this test's own (liveApp), filled through its real doors:
 *   - a module with a label written through the short-forms door, and a message from an agent whose
 *     title holds that module's id, so the link must be drawn as the label;
 *   - a session that registers itself and waits, so a row names an agent by its display name;
 *   - a second session that registers itself with a name of spaces, which the door trims to blank,
 *     so its row has no name to draw and must be called by its handle.
 *
 * HOME DRAWS ONLY THE FIRST ROWS OF NEEDS YOU, so no more than two of these rows wait at once and each
 * case's row is among the rows Home draws. The message and the first registration are filed before the
 * cases. The case that reads the blank name first has the person refuse the first registration, which
 * the case before it has finished with, and then files the second one. Each case waits only for the
 * row it reads, and the picture case waits for the Needs you card, which Home always draws.
 *
 * WHAT IS PROVED
 *   1. The message row draws the link's label, not the id, and the long title is cut at a word with
 *      the shortening mark.
 *   2. The self-registration row draws the display name the session gave, on its title and on its
 *      small line.
 *   3. A self-registration with a blank name is called by its handle on both lines, read from the
 *      row's word key.
 *
 * PICTURES are taken only when TEST_SHOTS names a folder: the Needs you card at 1440 and 390, light
 * and dark, before the change and after it. A dark picture equal to its light one fails.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the row draws the title as stored again                  → case 1
 *   the title is cut in the middle of a word again           → case 1
 *   the row is named by the stored handle again              → case 2
 *   the small line is named by the stored handle again       → case 2
 *   a blank name is drawn instead of the handle              → case 3
 *   a refused registration still waits on the person         → case 3
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import type { HomePart } from '../src/shared/home-layout.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CUT_MARK, shortenToWords } from '../src/shared/shortening.ts'
import { t } from '../src/shared/i18n.ts'
import { A_HOME_ROW_TITLE_AT_MOST } from '../src/web/components/home/HomeSections.tsx'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const HANDLE = 'claude-walk-b5'
const SELF_NAME = 'Quill’s helper'
const BLANK_HANDLE = 'claude-walk-b6'
const LABEL = 'Clamp mount load test'
const TITLE_AFTER_THE_LINK = `Please read ${LABEL} and then look at the whole bench before noon, because the mount has to hold twenty newtons`

let app: LiveApp
let person: Record<string, string>
let labelled = ''
let messageId = ''
let requestId = ''
let blankRequestId = ''
let agentKey = ''
const shots = testShots('home-needs-you')
const PICTURE_WIDTHS = [1440, 390] as const
const PICTURE_THEMES = ['light', 'dark'] as const

const asPerson = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  ...person,
})
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})
const asKeyedAgent = (handle: string): Record<string, string> => ({ ...asAgent(handle), 'x-mole-office-key': agentKey })

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  return { status: res.status, json: text === '' ? {} : (JSON.parse(text) as Record<string, any>) }
}

const NEEDS: HomePart = 'needs'
/** Home's Needs you card, which Home always draws. */
const theNeeds = () => app.page.locator(`[data-home-section="${NEEDS}"]`).first()
/** The row Home's Needs you draws for one waiting item. */
const theRow = (id: string) => app.page.locator(`[data-home-section="${NEEDS}"] [data-home-waiting-id="${id}"]`).first()

/** Open Home in one look, waiting for the one thing the case reads. */
async function openHome(theme: 'light' | 'dark', width: number, shown: Locator): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  await app.page.emulateMedia({ colorScheme: theme })
  await app.page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await shown.waitFor({ state: 'visible', timeout: 30_000 })
}

/** The person refuses a waiting registration, and it no longer waits on them. */
async function refuseTheRegistration(id: string): Promise<void> {
  const refused = await call('POST', `/api/roles/requests/${id}/refuse`, asPerson(), {})
  expect(refused.status, JSON.stringify(refused.json)).toBe(200)
  expect(refused.json['answer'], 'the door did not answer the registration as refused').toBe('refused')
  const waiting = await call('GET', '/api/waiting', asPerson())
  expect((waiting.json['items'] as { id: string }[]).map((one) => one.id), 'a refused registration still waits on the person').not.toContain(id)
}

/**
 * A NAME OF SPACES IS A BLANK NAME: the door trims it, so the row is filed with nothing to call the agent by and the
 * handle is the only name it has.
 */
async function registerWithABlankName(): Promise<void> {
  const unnamed = await call('POST', '/api/agents/register-myself', asAgent(BLANK_HANDLE), {
    handle: BLANK_HANDLE,
    name: ' ',
    workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    requestedRole: 'worker',
  })
  expect(unnamed.status, JSON.stringify(unnamed.json)).toBe(202)
  blankRequestId = String(unnamed.json['request'])
}

const wordsOf = async (id: string): Promise<string> =>
  (await theRow(id).locator('.hm-row-title').innerText()).replace(/\s+/g, ' ').trim()

beforeAll(async () => {
  app = await liveApp({ name: 'home-needs-you-words', viewport: { width: 1440, height: 900 } })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))

  const module = await call('POST', '/api/records', asPerson(), {
    kind: 'module',
    title: 'The clamp mount that has to hold twenty newtons',
    data: { context: 'A mount that has to hold twenty newtons.', parts: [] },
  })
  expect(module.status, JSON.stringify(module.json)).toBe(201)
  labelled = String(module.json['record'].id)
  const ledger = await call('GET', `/api/records/${labelled}/revisions`, asPerson())
  const newest = (ledger.json['revisions'] as { seq: number; contentHash: string }[])[0]
  const form = await call('POST', `/api/records/${labelled}/short-forms`, asPerson(), {
    madeFrom: { seq: newest?.seq, contentHash: newest?.contentHash },
    forms: { label: LABEL },
  })
  expect(form.status, JSON.stringify(form.json)).toBe(200)

  const started = await call('POST', '/api/agents/started', asPerson(), {
    handle: 'home-needs-guide',
    name: 'Home Needs Guide',
    role: 'worker',
    runtime: 'claude-code',
  })
  expect(started.status, JSON.stringify(started.json)).toBe(201)
  agentKey = String(started.json['whatToGiveIt']?.key)
  const sent = await call('POST', '/api/records', asKeyedAgent('home-needs-guide'), {
    kind: 'message',
    title: `Please read ${labelled} and then look at the whole bench before noon, because the mount has to hold twenty newtons`,
    data: { body: 'Made-up words about the clamp mount.', to: [{ kind: 'person', id: THE_PERSON }] },
  })
  expect(sent.status, JSON.stringify(sent.json)).toBe(201)
  messageId = String(sent.json['record'].id)

  const asked = await call('POST', '/api/agents/register-myself', asAgent(HANDLE), {
    handle: HANDLE,
    name: SELF_NAME,
    workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    requestedRole: 'worker',
  })
  expect(asked.status, JSON.stringify(asked.json)).toBe(202)
  requestId = String(asked.json['request'])
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('Home names a link and an agent, and cuts a long title at a word', () => {
  it('takes the before and after pictures of the Needs you card', async () => {
    if (process.env[TEST_SHOTS] === undefined || process.env[TEST_SHOTS] === '') return
    for (const theme of PICTURE_THEMES) for (const width of PICTURE_WIDTHS) {
      await openHome(theme, width, theNeeds())
      await theNeeds().screenshot({ path: join(shots, `needs-you-${String(width)}-${theme}.png`) })
    }
    for (const width of PICTURE_WIDTHS) {
      const light = readFileSync(join(shots, `needs-you-${String(width)}-light.png`))
      const dark = readFileSync(join(shots, `needs-you-${String(width)}-dark.png`))
      expect(dark.equals(light), `the dark picture at ${String(width)} is its light one`).toBe(false)
    }
  }, 590_000)

  it('draws the link as its label and cuts the long title at a word with a mark', async () => {
    await openHome('light', 1440, theRow(messageId))
    const shown = await wordsOf(messageId)
    expect(shown, 'the row still draws the raw record id').not.toContain(labelled)
    expect(shown, 'the row does not draw the link’s label').toContain(LABEL)
    const cut = shortenToWords(TITLE_AFTER_THE_LINK, A_HOME_ROW_TITLE_AT_MOST)
    expect(cut.shortened, 'this title is not long enough to prove a cut').toBe(true)
    expect(shown).toBe(`${cut.words}${CUT_MARK}`)
    expect(TITLE_AFTER_THE_LINK[cut.words.length], 'the title was cut inside a word').toBe(' ')
  }, 240_000)

  it('draws the registered agent by the name it gave on both lines of its row', async () => {
    await openHome('light', 1440, theRow(requestId))
    expect(await wordsOf(requestId)).toBe(t('decisions.selfRegistrationRow', { name: SELF_NAME }))
    const meta = (await theRow(requestId).locator('.hm-row-meta').innerText()).replace(/\s+/g, ' ').trim()
    expect(meta, 'the row small line does not draw the office name').toContain(SELF_NAME)
    expect(meta, 'the row small line still draws the handle').not.toContain(HANDLE)
  }, 240_000)

  it('calls a self-registration with a blank name by its handle on both lines', async () => {
    // The case before has finished with the first registration, so the person refuses it and only the message and
    // this row wait.
    await refuseTheRegistration(requestId)
    await registerWithABlankName()
    await openHome('light', 1440, theRow(blankRequestId))
    expect(await wordsOf(blankRequestId)).toBe(t('decisions.selfRegistrationRow', { name: BLANK_HANDLE }))
    const meta = (await theRow(blankRequestId).locator('.hm-row-meta').innerText()).replace(/\s+/g, ' ').trim()
    expect(meta, 'the row small line does not fall back to the handle').toContain(BLANK_HANDLE)
  }, 240_000)
})
