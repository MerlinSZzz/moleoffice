// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW EDITOR, AS PROPOSAL 4MWRAEISTEE8 DRAWS IT. Wave 13p round 36, from two
 * decisions. In a real browser, on this test's own office:
 *
 * 1. THE CAUSE COMES FIRST, AND A CHANGE IS SAVED THROUGH THE DOORS. Edit turns one flow into the editor; the save bar
 *    asks for the cause before anything else; the cause, a finding, is picked as a record; Save writes the change and
 *    the cause.
 * 2. A NEW STAGE IS MARKED IN PLACE, AND THE SAVE BAR NAMES EACH THING BY ITS STAGE. Add opens an empty stage where it
 *    was pressed; its why and sources are dashed, with the sentence; the bar says "2 things" and names the stage.
 * 3. REMOVE SHOWS THE REASONS FIRST, AND "KEEP IT AFTER ALL" UNDOES IT. Then a removal with its one line is saved.
 * 4. A REFUSAL THE PAGE COULD NOT SEE IS PLACED BY ITS CODE, AND EVERY TYPED WORD IS KEPT. A source picked and then
 *    deleted before Save is refused by the server; the office's sentence is drawn beside that stage.
 * 5. A NEW FLOW IS FILED FROM THE SAME EDITOR, EMPTY, AND IS NOT ASKED FOR A CAUSE.
 * 6. WHO MAY EDIT IS THE DOORS' RULE. An agent the office has not registered sees no Edit, and the editor says why.
 *    Since round 37 the page asks GET /api/flows/may-i-write, and this case waits for that answer.
 * 7. EVERY AGENT THE DOORS ACCEPT SEES EDIT (round 37). The door the page asks answers from the function the five writes
 *    call: yes for a retired agent and for "claude-code", which needs no registration; no, with the doors' sentence, for
 *    an agent nobody registered. Both accepted agents see Edit and the editor. Round 36 asked the registry list, which
 *    holds no row for "claude-code", so that page hid Edit from an agent the doors accept.
 *
 * MUTATIONS, one at a time, each restored before the next:
 *   1. src/web/lib/flow-edit-plan.ts: `planAnEdit` never took the cause (`const cause = undefined`). Cases 1 to 4 went red,
 *      because no edit could become ready to save (.logs/named-tests-2026-10-11T03-13-27-484.log).
 *   2. src/web/pages/FlowEditor.tsx: `OpenStage` never drew the mark (`needs = false`). Case 2 went red
 *      (.logs/named-tests-2026-10-11T03-15-05-943.log).
 *   3. "Keep it after all" left the stage being taken out. Case 3 went red (.logs/named-tests-2026-10-11T03-16-11-045.log).
 *   4. `placeOfARefusal` sent flowStepRecordNotThere to the save bar. Case 4 went red
 *      (.logs/named-tests-2026-10-11T03-16-42-797.log).
 *   5. A new flow drew the cause section too. Case 5 went red (.logs/named-tests-2026-10-11T03-17-33-133.log).
 *   6. `useMayWriteFlows` answered yes for every agent. Case 6 went red (.logs/named-tests-2026-10-11T03-18-01-081.log).
 *   7. src/web/pages/FlowEditor.tsx: the cause kinds left out the Findings family (`CAUSE_KINDS = ['message',
 *      'decision']`), so the claim could not be picked. Cases 1 to 4 went red (.logs/named-tests-2026-10-11T03-28-41-479.log).
 *   8. (round 37) `useMayWriteFlows` asked the registry list again, as in round 36. Case 7 went red (Edit never drawn
 *      for "claude-code"), and case 6 with it, waiting for the new door (.logs/named-tests-2026-10-11T05-30-03-002.log).
 *   9. (round 37) GET /api/flows/may-i-write answered yes to everyone. Cases 6 and 7 went red
 *      (.logs/named-tests-2026-10-11T05-31-18-492.log).
 *
 * ROUND 37: CONTROL 7 passed (.logs/named-tests-2026-10-11T05-29-32-466.log); RESTORE 7 passed
 * (.logs/named-tests-2026-10-11T05-31-42-791.log).
 * CONTROL: 6 passed (.logs/named-tests-2026-10-11T03-12-37-824.log). RESTORE: 6 passed
 * (.logs/named-tests-2026-10-11T03-18-35-607.log). With the cause a claim: CONTROL 6 passed
 * (.logs/named-tests-2026-10-11T03-28-05-038.log), RESTORE after mutation 7 6 passed
 * (.logs/named-tests-2026-10-11T03-35-37-813.log).
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. Every flow and record here is made up.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
const en = createI18n('en')

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(url: string, body: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `POST ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function read(url: string): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { headers: PERSON })
  const text = await reply.text()
  expect(reply.status, `GET ${url}: ${text}`).toBe(200)
  return JSON.parse(text) as Record<string, any>
}

const aReport = async (title: string): Promise<string> =>
  (await send('/api/records', { kind: 'report', title, data: { for: 'The owner', date: '2026-10-11', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string

const aFlow = async (title: string, source: string): Promise<string> =>
  (
    await send('/api/records', {
      kind: 'flow',
      title,
      data: {
        declared_in: 'tools/test-pottery.mjs',
        runs: 'the test potter',
        trigger: 'A test order.',
        leaves_behind: 'a test pot',
        stages: [1, 2, 3].map((n) => ({ n, does: `Test stage ${n}.`, evidence: 'A test note.', why: `Test why ${n}.`, sources: [source] })),
      },
    })
  )['record'].id as string

const stagesOf = async (id: string): Promise<{ does: string; why?: string; sources?: string[] }[]> => (await read(`/api/flows/${id}?projects=all&secondLevel=show`))['stages']
const changesOf = async (id: string): Promise<Record<string, unknown>[]> => (await read(`/api/flows/${id}?projects=all&secondLevel=show`))['stepChanges'] ?? []

let source = ''
let cause = ''

beforeAll(async () => {
  app = await liveApp({ name: 'the-flow-editor', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  source = await aReport('Test pottery source: how a pot is thrown')
  // THE CAUSE IS A FINDING, a claim, which is a kind of the Findings family the cause picker searches.
  cause = (await send('/api/records', { kind: 'claim', title: 'Test pottery cause: the kiln cracked a pot', data: { evidence: ['A made-up cracked pot.'] } }))['record'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(waitFor, { timeout: 30_000 })
}

/** Type into a picker and press the record it finds by its title. */
async function pick(page: Page, within: ReturnType<Page['locator']>, words: string, title: string): Promise<void> {
  await within.locator('.rpk-box').fill(words)
  const found = within.locator('.rpk-one', { hasText: title })
  await found.waitFor({ timeout: 15_000 })
  await found.click()
}

const bar = (page: Page) => page.locator('.fle-bar')

it('1. asks for the cause first, picks it as a record, and saves a changed stage through the doors', async () => {
  const page = app.page
  const flow = await aFlow('Test: glazing a pot', source)
  await open(page, `/flows/${flow}`, '.flw-stage')
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForSelector('.fle-stage')
  expect(page.url()).toContain(`#/flows/${flow}/edit`)
  // The cause is asked before the stages, and nothing is written yet.
  const sections = await page.locator('.fle > section, .fle > fieldset').evaluateAll((all) => all.map((one) => one.className))
  expect(sections[0]).toBe('fle-cause')
  expect(await bar(page).locator('.fle-bar-head').first().textContent()).toBe('Nothing is changed yet.')
  // Unchanged stages are one line each.
  expect(await page.locator('.fle-line').count()).toBe(3)
  await page.locator('.fle-stage').nth(1).getByRole('button', { name: 'Change' }).click()
  await page.locator('.fle-stage').nth(1).getByLabel('What it does').fill('Test stage 2, glazed twice.')
  // The cause is the one thing missing, and Save waits for it.
  expect(await bar(page).textContent()).toContain(en.t('flowEditor.missing', { n: 1 }))
  expect(await bar(page).textContent()).toContain('Pick the record that caused this change.')
  expect(await page.getByRole('button', { name: 'Save the office flow' }).isDisabled()).toBe(true)
  await pick(page, page.locator('.fle-cause'), 'kiln cracked', 'Test pottery cause: the kiln cracked a pot')
  expect(await page.locator('.fle-cause .rpk-named').textContent()).toContain('Test pottery cause: the kiln cracked a pot')
  expect(await bar(page).textContent()).toContain('Ready to save.')
  await page.getByRole('button', { name: 'Save the office flow' }).click()
  await page.waitForFunction((id) => location.hash === `#/flows/${id}`, flow, { timeout: 15_000 })
  const stages = await stagesOf(flow)
  expect(stages.map((stage) => stage.does)).toEqual(['Test stage 1.', 'Test stage 2, glazed twice.', 'Test stage 3.'])
  const changes = await changesOf(flow)
  expect(changes.at(-1)?.['cause']).toBe(cause)
}, 120_000)

it('2. marks a new stage in place, and the save bar names each missing thing by its stage', async () => {
  const page = app.page
  const flow = await aFlow('Test: firing a pot', source)
  await open(page, `/flows/${flow}/edit`, '.fle-stage')
  await pick(page, page.locator('.fle-cause'), 'kiln cracked', 'Test pottery cause: the kiln cracked a pot')
  // "Add a stage here" after the first stage opens an empty stage second.
  await page.locator('.fle-add-press').nth(1).click()
  const added = page.locator('.fle-stage').nth(1)
  expect(await added.getAttribute('data-state')).toBe('new')
  await added.getByLabel('What it does').fill('Test stage: cool the kiln.')
  expect(await added.locator('.fle-mark').textContent()).toBe(en.t('flowEditor.markNew'))
  expect(await added.locator('.fle-field[data-lacking="yes"]').count()).toBe(2)
  const borderStyle = await added.getByLabel('Why it is here').evaluate((box) => getComputedStyle(box).borderTopStyle)
  expect(borderStyle).toBe('dashed')
  expect(await bar(page).locator('.fle-bar-head').first().textContent()).toBe(en.t('flowEditor.missing', { n: 2 }))
  expect(await bar(page).locator('.fle-bar-list li').allTextContents()).toEqual(['Stage 2: write why it is here.', 'Stage 2: pick at least one source.'])
  await added.getByLabel('Why it is here').fill('Test: a hot pot cracks.')
  await pick(page, added, 'thrown', 'Test pottery source: how a pot is thrown')
  expect(await added.locator('.fle-field[data-lacking="yes"]').count()).toBe(0)
  await page.getByRole('button', { name: 'Save the office flow' }).click()
  await page.waitForFunction((id) => location.hash === `#/flows/${id}`, flow, { timeout: 15_000 })
  expect((await stagesOf(flow)).map((stage) => stage.does)).toEqual(['Test stage 1.', 'Test stage: cool the kiln.', 'Test stage 2.', 'Test stage 3.'])
}, 120_000)

it('3. shows why a stage is there before it goes, undoes with "Keep it after all", and saves a removal', async () => {
  const page = app.page
  const flow = await aFlow('Test: packing a pot', source)
  await open(page, `/flows/${flow}/edit`, '.fle-stage')
  const third = page.locator('.fle-stage').nth(2)
  await third.getByRole('button', { name: 'Remove' }).click()
  expect(await third.getAttribute('data-state')).toBe('going')
  // The reasons stand before the question, and the source is drawn by its title.
  const going = third.locator('.fle-going')
  expect(await going.locator('.fle-going-reasons').textContent()).toContain('Test why 3.')
  // The source is named by its id through the search door, so the name arrives a moment after the page.
  await going.locator('.fle-going-reasons .rpk-named[data-named="named"]').waitFor({ timeout: 15_000 })
  expect(await going.locator('.fle-going-reasons .rpk-named').textContent()).toContain('Test pottery source: how a pot is thrown')
  const order = await going.evaluate((box) => {
    const reasons = box.querySelector('.fle-going-reasons')!
    const ask = box.querySelector('.fle-field')!
    return Boolean(reasons.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
  await third.getByRole('button', { name: 'Keep it after all' }).click()
  expect(await third.getAttribute('data-state')).toBe('still')
  expect(await bar(page).locator('.fle-bar-head').first().textContent()).toBe('Nothing is changed yet.')
  await third.getByRole('button', { name: 'Remove' }).click()
  await third.getByLabel('Why does it go?').fill('Test: the pots are carried, not packed.')
  await pick(page, page.locator('.fle-cause'), 'kiln cracked', 'Test pottery cause: the kiln cracked a pot')
  await page.getByRole('button', { name: 'Save the office flow' }).click()
  await page.waitForFunction((id) => location.hash === `#/flows/${id}`, flow, { timeout: 15_000 })
  expect((await stagesOf(flow)).map((stage) => stage.does)).toEqual(['Test stage 1.', 'Test stage 2.'])
  expect((await changesOf(flow)).at(-1)?.['why']).toBe('Test: the pots are carried, not packed.')
}, 120_000)

it('4. places a refusal the page could not see beside its stage, by its code, and keeps every typed word', async () => {
  const page = app.page
  const flow = await aFlow('Test: selling a pot', source)
  const doomed = await aReport('Test pottery doomed: a note that will be deleted')
  await open(page, `/flows/${flow}/edit`, '.fle-stage')
  await pick(page, page.locator('.fle-cause'), 'kiln cracked', 'Test pottery cause: the kiln cracked a pot')
  const first = page.locator('.fle-stage').nth(0)
  await first.getByRole('button', { name: 'Change' }).click()
  await first.getByLabel('What it does').fill('Test stage 1, priced by weight.')
  await pick(page, first, 'doomed', 'Test pottery doomed: a note that will be deleted')
  // THE RECORD GOES BEFORE SAVE, behind the page's back, so only the server can see it is not there.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare("UPDATE records SET deleted_at = datetime('now') WHERE id = ?").run(doomed)
  } finally {
    db.close()
  }
  await page.getByRole('button', { name: 'Save the office flow' }).click()
  await first.locator('.fle-refusal').waitFor({ timeout: 15_000 })
  expect(await first.locator('.fle-refusal').textContent()).toContain('A source or a cause names a record that is not there.')
  expect(await bar(page).textContent()).toContain(en.t('flowEditor.refused'))
  // Every typed word is kept, and nothing was written.
  expect(await first.getByLabel('What it does').inputValue()).toBe('Test stage 1, priced by weight.')
  expect(page.url()).toContain(`#/flows/${flow}/edit`)
  expect((await stagesOf(flow))[0]?.does).toBe('Test stage 1.')
}, 120_000)

it('5. files a new flow from the same editor, empty, without asking for a cause', async () => {
  const page = app.page
  await open(page, '/flows', '.flw-title')
  await page.getByRole('link', { name: '+ New office flow' }).click()
  await page.waitForSelector('.fle-facts')
  expect(page.url()).toContain('#/flows/new')
  expect(await page.locator('.fle-cause').count()).toBe(0)
  expect(await page.locator('.fle-stage').count()).toBe(0)
  const facts = page.locator('.fle-facts')
  await facts.getByLabel('Its name').fill('Test: a new pottery flow')
  await facts.getByLabel('What starts it').fill('A test order.')
  await facts.getByLabel(en.t('flows.fact.runsBy')).fill('the test potter')
  await facts.getByLabel('What it leaves behind').fill('a test pot')
  await facts.getByLabel('Where it is written down').fill('tools/test-pottery.mjs')
  await page.locator('.fle-add-press').first().click()
  const stage = page.locator('.fle-stage').first()
  await stage.getByLabel('What it does').fill('Test: throw the pot.')
  expect(await bar(page).locator('.fle-bar-list li').allTextContents()).toEqual(['Stage 1: write why it is here.', 'Stage 1: pick at least one source.'])
  await stage.getByLabel('Why it is here').fill('Test: a pot starts on the wheel.')
  await pick(page, stage, 'thrown', 'Test pottery source: how a pot is thrown')
  await page.getByRole('button', { name: 'Save the office flow' }).click()
  await page.waitForFunction(() => /^#\/flows\/[A-Za-z0-9_-]+$/.test(location.hash) && !location.hash.endsWith('/new'), null, { timeout: 15_000 })
  await page.waitForSelector('.flw-stage')
  expect(await page.locator('.flw-title').textContent()).toBe('Test: a new pottery flow')
}, 120_000)

it('6. shows an agent the office has not registered no Edit, and the editor says why', async () => {
  const page = app.page
  const flow = await aFlow('Test: a flow an unknown agent opens', source)
  await page.goto(`${app.site}/?lang=en#/flows`, { timeout: 60_000 })
  await page.evaluate(() => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'test-nobody-registered' })))
  try {
    // The doors' answer is asked before Edit is drawn; wait for it before saying Edit is absent.
    const asked = page.waitForResponse((reply) => reply.url().includes('/api/flows/may-i-write'), { timeout: 30_000 })
    await open(page, `/flows/${flow}`, '.flw-stage')
    await asked
    await page.waitForTimeout(200)
    expect(await page.getByRole('link', { name: 'Edit', exact: true }).count()).toBe(0)
    await open(page, `/flows/${flow}/edit`, '.fle-refused')
    expect(await page.locator('.fle-refused').textContent()).toContain('test-nobody-registered')
    expect(await page.getByRole('button', { name: 'Save the office flow' }).count()).toBe(0)
  } finally {
    await page.evaluate(() => localStorage.removeItem('mole-office.actor'))
  }
}, 120_000)

it('7. shows Edit and the editor to every agent the doors accept: a retired agent, and an id that needs no registration', async () => {
  const page = app.page
  const flow = await aFlow('Test: a flow the doors let these agents edit', source)
  const asThePerson = { ...PERSON, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }
  for (const [url, body] of [
    ['/api/agents/started', { handle: 'test-retired-potter', name: 'Test retired potter', role: 'worker', runtime: 'claude-code' }],
    ['/api/participants/agent/test-retired-potter/retire', { because: 'Test: its work here is done.' }],
  ] as const) {
    const reply = await fetch(app.api + url, { method: 'POST', headers: asThePerson, body: JSON.stringify(body) })
    expect(reply.status, `POST ${url}: ${await reply.text()}`).toBeLessThan(300)
  }
  // THE DOOR THIS PAGE ASKS answers from the rule the five writes apply, including for an agent it refuses.
  const askAs = async (id: string): Promise<Record<string, unknown>> =>
    (await fetch(app.api + '/api/flows/may-i-write', { headers: { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id } })).json() as Promise<Record<string, unknown>>
  expect(await askAs('test-retired-potter')).toMatchObject({ mayWrite: true, because: null })
  expect(await askAs('claude-code')).toMatchObject({ mayWrite: true, because: null })
  const refused = await askAs('test-nobody-registered')
  expect(refused['mayWrite']).toBe(false)
  expect(String(refused['because'])).toContain('Nothing is registered as the agent "test-nobody-registered"')
  // "claude-code" is in no registry row, so a page that asked the registry list would hide Edit from it.
  for (const id of ['test-retired-potter', 'claude-code']) {
    await page.goto(`${app.site}/?lang=en#/flows`, { timeout: 60_000 })
    await page.evaluate((who) => localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: who })), id)
    try {
      await open(page, `/flows/${flow}`, '.flw-stage')
      await page.getByRole('link', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
      await open(page, `/flows/${flow}/edit`, '.fle-stage')
      expect(await page.locator('.fle-refused').count(), id).toBe(0)
      expect(await page.getByRole('button', { name: 'Save the office flow' }).count(), id).toBe(1)
    } finally {
      await page.evaluate(() => localStorage.removeItem('mole-office.actor'))
    }
  }
}, 120_000)
