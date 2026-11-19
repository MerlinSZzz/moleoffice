// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON READS EVERY AGENT BY ITS OFFICE NAME, WHEREVER THE OFFICE NAMES WHO FILED, WROTE OR DID SOMETHING.
 *
 * Criterion, written before the change. A made-up agent is registered under the handle `glaze-tally`
 * with the office name `Glaze Tally`, and it files a report, writes a record and has a run whose
 * finish asks for a check. Every person-facing place that names it must draw `Glaze Tally` and must
 * not draw `glaze-tally`; the records keep storing the handle.
 *
 * OLD:
 *   - the office's own notices to a person named an agent by the handle it stores
 *     (`theNameAPersonReads` in src/server/lib/inspection.ts reads the registry row's handle, and the
 *     titles around it interpolate `worker?.handle`, `inspector.handle` and `secretary.handle`);
 *   - the report page and the record page already named a writer through `writerNamed`, which finds
 *     a registry row by its id or by its one handle and draws its name.
 *
 * NEW:
 *   - one server reader names an agent by the office name, found by its registry id or by its one
 *     handle, as `writerNamed` does, and an agent no registry row holds is said the way
 *     `writerNamed` says it;
 *   - every notice this flow writes about the agent names it by that reader.
 *
 * WHAT THE CASES READ. The report's page and the task's page as a browser draws them in normal
 * mode, and every message the person may read in the test office, by its title and body. A person
 * may read every message in the project, so a notice addressed to an inspector is a notice the
 * person can read. The four sentences a person reads about a card ask are read where the person
 * reads them: the Needs you list, the waiting list, the words of the press, and the answer's note.
 * The title and the small line of a waiting registration's Needs you row are read too, and the
 * handle it stores is checked on the record and in the waiting reading, so the display name and the
 * stored reference cannot be confused.
 *
 * PICTURES: only when AGENT_NAME_SHOTS names a folder. The Needs you page of the made-up office,
 * with the admission and the card ask on it, at 1440, 990, 660 and 390 pixels wide, in the light
 * and the dark theme.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { deleteTheCopiedDefaultChapters, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

const HANDLE = 'glaze-tally'
const NAME = 'Glaze Tally'
const INSPECTOR_HANDLE = 'glaze-inspector'
const INSPECTOR_NAME = 'Glaze Inspector'
const WORKSPACE = 'default'
const SHOTS_FOLDER = 'AGENT_NAME_SHOTS'
const SELF_HANDLE = 'beacon-shuffle'
const SELF_NAME = 'Beacon Shuffle'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** The agent's own key, which it is given when the person registers it. The key proves the name. */
let AS_THE_AGENT: Record<string, string> = {}

/** One message the person may read, by the fields that can name somebody. */
type PersonRead = { id: string; title: string; body: string; notice: unknown }

let app: LiveApp
let browser: Page
let reportId = ''
let taskId = ''
let selfAskId = ''
let cardAskId = ''
let onePressId = ''

/** One request to the test office, with a JSON reply. */
async function ask(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await reply.text()
  expect(reply.status, `${method} ${path}: ${text}`).toBeLessThan(400)
  return { status: reply.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

/** Files one record as the made-up agent and answers with its id. */
async function fileAsTheAgent(body: Record<string, unknown>): Promise<string> {
  const reply = await ask('POST', '/api/records', AS_THE_AGENT, body)
  expect(reply.status, JSON.stringify(reply.body)).toBe(201)
  return String((reply.body['record'] as { id: string }).id)
}

/** Finishes a made-up run of the agent, with a records submission, so the office asks for a check. */
async function finish(run: string): Promise<Record<string, unknown>> {
  const note = await ask('POST', '/api/records', AS_THE_AGENT, { kind: 'note', title: `A made-up note that run ${run} submits` })
  const finished = await ask('PATCH', `/api/records/${run}`, AS_THE_AGENT, {
    dataPatch: { state: 'finished', submission: { kind: 'records', records: [String((note.body['record'] as { id: string }).id)] } },
  })
  expect(finished.status, JSON.stringify(finished.body)).toBe(200)
  return finished.body
}

/** A made-up run of the agent, finished by the person when this is called. */
async function runOfTheAgent(title: string): Promise<string> {
  return fileAsTheAgent({
    kind: 'session',
    title,
    data: { state: 'running', servingAgent: HANDLE, runtime: 'codex', doing: 'A made-up run that files a report and a record.' },
  })
}

/** Every message the person may read in the test office, its words whole. */
async function whatThePersonMayRead(): Promise<PersonRead[]> {
  const reply = await ask('GET', '/api/messages?full=1&limit=25', AS_THE_PERSON)
  const messages = (reply.body['messages'] ?? []) as Record<string, unknown>[]
  return messages.map((one) => ({
    id: String(one['id']),
    title: String(one['title'] ?? ''),
    body: String(one['body'] ?? ''),
    notice: one['notice'],
  }))
}

/** Opens one record's page in English, in the normal mode, and waits for it to be drawn. */
async function open(id: string): Promise<void> {
  await browser.setViewportSize({ width: 1440, height: 1000 })
  await browser.goto(`${app.site}/?lang=en#${recordPath(id)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await browser.evaluate(() => {
    localStorage.setItem('mole-office.mode', 'normal')
    localStorage.setItem('mole-office.preset.theme', 'light')
  })
  await browser.reload({ timeout: 60_000 })
  await waitForThePage(browser, 60_000)
  await browser.locator('.rd-changed').waitFor({ timeout: 30_000 })
}

/** The words the page draws, in its own body. */
async function pageWords(): Promise<string> {
  return browser.locator('main.page').innerText()
}

/** Opens Home in English, in the normal mode and the light theme, and waits for the admission's row. */
async function openHomeAtTheAdmission(): Promise<void> {
  await browser.setViewportSize({ width: 1440, height: 1000 })
  await browser.goto(`${app.site}/?lang=en#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await browser.evaluate(() => {
    localStorage.setItem('mole-office.mode', 'normal')
    localStorage.setItem('mole-office.preset.theme', 'light')
  })
  await browser.reload({ timeout: 60_000 })
  await waitForThePage(browser, 60_000)
  await browser
    .locator(`[data-home-section="needs"] [data-home-waiting-id="${selfAskId}"]`)
    .waitFor({ timeout: 30_000 })
}

describe('the office name a stored participant is read by', () => {
  it('finds a writer by its id or by its one handle, and leaves an agent no registry holds as writerNamed does', async () => {
    const { writerNamed } = await import('../src/web/lib/participant-lookup.ts')
    const registry = {
      people: [{ id: 'person-record', handle: 'the-person', name: 'The Person' }],
      agents: [
        { id: 'agent-registry-id', handle: HANDLE, name: NAME },
        { id: 'two-ways-agent', handle: 'two-ways', name: 'Two Ways' },
      ],
    }
    expect(writerNamed({ actorType: 'agent', actorId: 'agent-registry-id' }, registry)).toBe(NAME)
    expect(writerNamed({ actorType: 'agent', actorId: HANDLE }, registry)).toBe(NAME)
    expect(writerNamed({ actorType: 'agent', actorId: 'nobody-registered-this' }, registry)).toBe(
      createI18n('en').t('record.writer.unregisteredAgent'),
    )
  })
})

describe('the report page, the record page and the office notices a person reads', () => {
  let messages: PersonRead[] = []

  beforeAll(async () => {
    app = await liveApp({ name: 'agent-names', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
    browser = app.page
    await deleteTheCopiedDefaultChapters(app.api)
    // THE AGENT IS STARTED BY THE PERSON, so the office's own line about its run is a line to the person.
    const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: HANDLE, name: NAME, runtime: 'codex' })
    expect(started.status, JSON.stringify(started.body)).toBe(201)
    AS_THE_AGENT = {
      ...AS_THE_PERSON,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': HANDLE,
      'x-mole-office-key': String((started.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? ''),
    }
    expect(AS_THE_AGENT['x-mole-office-key'], 'the registration gave the agent no key').not.toBe('')
    reportId = await fileAsTheAgent({
      kind: 'report',
      title: 'The made-up glaze tests for November',
      summary: 'Nine made-up tiles fired, two crawled.',
      data: {
        for: 'The person waiting on the made-up tiles',
        date: '2026-11-17',
        blocks: [{ id: 'one', type: 'text', text: 'Nine made-up glaze tiles were fired.' }],
      },
    })
    taskId = await fileAsTheAgent({ kind: 'task', title: 'Order the made-up cone pack', data: {} })
    // THE FIRST RUN, FINISHED WHILE NO INSPECTOR IS APPOINTED: the office tells the run's starter, the person.
    const first = await runOfTheAgent('The made-up run that asks for a check with no inspector appointed')
    await finish(first)
    // THEN AN INSPECTOR IS APPOINTED, and a second finished run has its check queued to that agent. The person may
    // read every message, so both notices are person-facing readings.
    const inspector = await ask('POST', '/api/agents/started', AS_THE_PERSON, {
      handle: INSPECTOR_HANDLE,
      name: INSPECTOR_NAME,
      role: 'inspector',
    })
    expect(inspector.status, JSON.stringify(inspector.body)).toBe(201)
    const second = await runOfTheAgent('The made-up run whose check is queued to an inspector')
    const answer = await finish(second)
    expect(answer['theCheck'], 'the office asked for no check at the finish').not.toBeNull()
    messages = await whatThePersonMayRead()
    // A SESSION THAT REGISTERED ITSELF, WITH A NAME THAT IS NOT ITS HANDLE, WAITS FOR THE PERSON'S ADMISSION.
    const registered = await fetch(`${app.api}/api/agents/register-myself`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': WORKSPACE,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': SELF_HANDLE,
      },
      body: JSON.stringify({
        handle: SELF_HANDLE,
        name: SELF_NAME,
        workingDirectory: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
        requestedRole: 'worker',
      }),
    })
    const registeredText = await registered.text()
    expect(registered.status, registeredText).toBe(202)
    selfAskId = String((JSON.parse(registeredText) as { request: string }).request)
    // AND AN AGENT THE PERSON STARTED ASKS FOR A CARD. Its ask waits, and a request for one press shows the words of
    // the person's press without answering it.
    const card = await ask('POST', '/api/roles/requests', AS_THE_AGENT, { asking: 'supervisor', because: 'Made-up: to lead a wave.' })
    cardAskId = String(card.body['request'])
    const press = await ask('POST', '/api/one-press', AS_THE_AGENT, {
      act: 'answer-an-ask-at-the-door',
      inputs: { request: cardAskId, answer: 'grant' },
      because: 'Made-up: the person should press.',
    })
    onePressId = String((press.body['request'] as { id: string }).id)
  }, 300_000)

  afterAll(async () => {
    await app?.stop()
  }, 120_000)

  it('draws the office name for the agent that filed the report, and never its handle', async () => {
    await open(reportId)
    const words = await pageWords()
    expect(words, 'the report page draws the handle').not.toContain(HANDLE)
    expect(words, 'the report page does not draw the filer by name').toContain(NAME)
  }, 300_000)

  it('draws the office name for the agent that wrote the record, and never its handle', async () => {
    await open(taskId)
    const words = await pageWords()
    expect(words, 'the record page draws the handle').not.toContain(HANDLE)
    expect(words, 'the record page does not draw the writer by name').toContain(NAME)
  }, 300_000)

  it('writes every notice the person may read with the office name, and never the handle', async () => {
    // THE SENTENCES THAT NAME SOMEBODY: the title and the body. A notice whose sender is the agent names it by
    // its stored address elsewhere, which is not a person-facing sentence.
    const said = messages.map((one) => `${one.title}\n${one.body}`).join('\n\n')
    // THE FLOW WROTE A NOTICE ABOUT THIS AGENT AND THE PERSON'S READ REACHED IT. At the cutoff it names the
    // handle; after the fix it names the office name. Either way this is the notice the cases below judge.
    const aboutTheAgent = messages.filter((one) => `${one.title}\n${one.body}`.includes(HANDLE) || `${one.title}\n${one.body}`.includes(NAME))
    expect(aboutTheAgent.length, 'the person read no notice about the agent the flow filed and finished').toBeGreaterThan(0)
    expect(said, 'a notice draws the run agent by its handle').not.toContain(HANDLE)
    expect(said, 'a notice draws the inspector by its handle').not.toContain(INSPECTOR_HANDLE)
    expect(said, 'an office notice names no agent by the office name at all').toContain(NAME)
    expect(said, 'a notice draws no inspector by the office name').toContain(INSPECTOR_NAME)
  }, 300_000)

  it('names a waiting registration by the name it registered, never its handle, on the Needs you list', async () => {
    const reply = await ask('GET', '/api/needs-you', AS_THE_PERSON)
    const actions = (reply.body['actions'] ?? []) as { recordId: string; act: string; title: string; because: string }[]
    const item = actions.find((one) => one.recordId === selfAskId)
    expect(item, 'the waiting registration is not on the Needs you list').toBeDefined()
    expect(item?.act).toBe('admit-agent')
    expect(item?.title).toContain(SELF_NAME)
    expect(item?.title).not.toContain(SELF_HANDLE)
    // THE SENTENCE OF WHAT THE PRESS DOES names the registration by the same office name.
    expect(item?.because, 'the admission sentence draws the handle').not.toContain(SELF_HANDLE)
    expect(item?.because, 'the admission sentence does not draw the office name').toContain(SELF_NAME)
  }, 120_000)

  it('names the waiting registration by its office name on both lines of its Needs you row, and keeps the stored handle', async () => {
    // THE STORED IDENTITY STAYS THE HANDLE, on the record and in the waiting reading. The name is a
    // second field the row draws, so neither surface may lose the handle it stores.
    const stored = await ask('GET', `/api/records/${selfAskId}`, AS_THE_PERSON)
    const record = stored.body['record'] as { data: Record<string, unknown> }
    const extra = record.data['extra'] as { selfRegistration: { handle: string; name: string } }
    expect((record.data['asker'] as { id: string }).id, 'the record stopped storing the handle as its asker').toBe(SELF_HANDLE)
    expect(extra.selfRegistration.handle, 'the record stopped storing the handle').toBe(SELF_HANDLE)
    expect(extra.selfRegistration.name, 'the record stopped storing the name').toBe(SELF_NAME)

    const waiting = await ask('GET', '/api/waiting', AS_THE_PERSON)
    const items = (waiting.body['items'] ?? []) as {
      id: string
      selfRegistration?: { name: string; handle: string }
      because?: { what: string }
    }[]
    const item = items.find((one) => one.id === selfAskId)
    expect(item, 'the waiting registration is not on the waiting list').toBeDefined()
    expect(item?.selfRegistration?.handle, 'the waiting reading lost the stored handle').toBe(SELF_HANDLE)
    expect(item?.selfRegistration?.name, 'the waiting reading lost the name').toBe(SELF_NAME)
    expect(item?.because?.what, 'the waiting sentence draws the handle').not.toContain(SELF_HANDLE)
    expect(item?.because?.what, 'the waiting sentence does not draw the office name').toContain(SELF_NAME)

    // THE ASK'S OWN PAGE SAYS WHAT THE PRESS DOES WITH THE OFFICE NAME, in the server's English and in the page's own
    // reading: the page had everything it needed except the name, and rebuilt the sentence from the stored handle.
    const press = stored.body['waitingForThePersonsPress'] as { press: string; name: string; says: string } | undefined
    expect(press?.press, 'the ask page carries no admission press').toBe('admit')
    expect(press?.name, 'the press carries the stored handle instead of the office name').toBe(SELF_NAME)
    expect(press?.says, 'the press sentence draws the handle').not.toContain(SELF_HANDLE)
    expect(press?.says, 'the press sentence does not draw the office name').toContain(SELF_NAME)
    await open(selfAskId)
    await browser.locator('.tc-ask').waitFor({ state: 'visible', timeout: 30_000 })
    const askWords = (await browser.locator('.tc-ask').innerText()).replace(/\s+/g, ' ').trim()
    expect(askWords, 'the ask page sentence draws the handle').not.toContain(SELF_HANDLE)
    expect(askWords, 'the ask page sentence does not draw the office name').toContain(SELF_NAME)

    // THE PAGE'S HEADING AND ITS BREADCRUMB draw the autogenerated title "<handle> registers itself"; both read the
    // office name instead, and the record's stored title is left exactly as it was written.
    expect((stored.body['record'] as { title: string }).title, 'the stored title was rewritten').toBe(`${SELF_HANDLE} registers itself`)
    const heading = (await browser.locator('.rp-title').innerText()).replace(/\s+/g, ' ').trim()
    const crumb = (await browser.locator('.rp-crumb-here').innerText()).replace(/\s+/g, ' ').trim()
    expect(heading, 'the page heading draws the stored handle').not.toContain(SELF_HANDLE)
    expect(heading, 'the page heading does not draw the office name').toContain(SELF_NAME)
    expect(crumb, 'the page breadcrumb draws the stored handle').not.toContain(SELF_HANDLE)
    expect(crumb, 'the page breadcrumb does not draw the office name').toContain(SELF_NAME)

    await openHomeAtTheAdmission()
    const row = browser.locator(`[data-home-section="needs"] [data-home-waiting-id="${selfAskId}"]`)
    const title = (await row.locator('.hm-row-title').innerText()).replace(/\s+/g, ' ').trim()
    const small = (await row.locator('.hm-row-meta').innerText()).replace(/\s+/g, ' ').trim()
    expect(title, 'the row title draws the handle').not.toContain(SELF_HANDLE)
    expect(title, 'the row title does not draw the office name').toContain(SELF_NAME)
    expect(small, 'the row small line draws the handle').not.toContain(SELF_HANDLE)
    expect(small, 'the row small line does not draw the office name').toContain(SELF_NAME)
  }, 300_000)

  it('names the asking agent by its office name on the Needs you list, never its handle', async () => {
    const reply = await ask('GET', '/api/needs-you', AS_THE_PERSON)
    const actions = (reply.body['actions'] ?? []) as { recordId: string; act: string; because: string }[]
    const item = actions.find((one) => one.recordId === cardAskId && one.act === 'give-card')
    expect(item, 'the card ask is not on the Needs you list').toBeDefined()
    expect(item?.because).toContain(`"${NAME}" was started by you and asks for the supervisor card.`)
    expect(item?.because).not.toContain(HANDLE)
  }, 120_000)

  it('names the asking agent by its office name on the waiting list, never its handle', async () => {
    const reply = await ask('GET', '/api/waiting', AS_THE_PERSON)
    const items = (reply.body['items'] ?? []) as { id: string; why: string }[]
    const item = items.find((one) => one.id === cardAskId)
    expect(item, 'the card ask is not on the waiting list').toBeDefined()
    expect(item?.why).toContain(`The agent "${NAME}" asks you for the supervisor card. Only you can give it.`)
    expect(item?.why).not.toContain(HANDLE)
  }, 120_000)

  it('names the asking agent by its office name in the words of the person\'s press, never its handle', async () => {
    const reply = await ask('GET', `/api/one-press/${onePressId}`, AS_THE_PERSON)
    const request = reply.body['request'] as { shows: string }
    expect(request.shows).toBe(`Give "${NAME}" the supervisor card it asked for.`)
    expect(request.shows).not.toContain(HANDLE)
    // THE REQUEST WAS FILED TO READ THE PRESS'S WORDS, NOT TO WAIT ON THE PERSON. Withdraw it so the picture of the
    // made-up office shows the admission and the card ask it is meant to show, and no test-only request beside them.
    const withdrawn = await ask('POST', `/api/one-press/${onePressId}/withdraw`, AS_THE_AGENT)
    expect(withdrawn.status, 'the asker withdrew its own press request').toBe(200)
  }, 120_000)

  it.skipIf(!process.env[SHOTS_FOLDER])(
    'photographs the Needs you page of the made-up office, with both waiting items, at four widths in both themes',
    async () => {
      const shots = process.env[SHOTS_FOLDER] as string
      mkdirSync(shots, { recursive: true })
      const waitForBoth = async (): Promise<void> => {
        await browser
          .locator(`[data-home-section="needs"] a.hm-needs-link[data-home-waiting-id="${selfAskId}"]`)
          .waitFor({ timeout: 30_000 })
        await browser
          .locator(`[data-home-section="needs"] a.hm-needs-link[data-home-waiting-id="${cardAskId}"]`)
          .waitFor({ timeout: 30_000 })
      }
      for (const width of [1440, 990, 660, 390]) {
        const taken: Partial<Record<'light' | 'dark', Buffer>> = {}
        for (const theme of ['light', 'dark'] as const) {
          await browser.setViewportSize({ width, height: 1000 })
          await browser.goto(`${app.site}/?lang=en#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
          await browser.evaluate((chosen) => {
            localStorage.setItem('mole-office.mode', 'normal')
            localStorage.setItem('mole-office.preset.theme', chosen)
          }, theme)
          await browser.reload({ timeout: 60_000 })
          await waitForThePage(browser, 60_000)
          await waitForBoth()
          await browser.locator('[data-home-section="needs"]').scrollIntoViewIfNeeded()
          await browser.waitForTimeout(300)
          const sideways = await browser.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(sideways, `the Needs you page is wider than the window at ${String(width)} in the ${theme} theme`).toBe(0)
          taken[theme] = await browser.screenshot({ path: join(shots, `needs-${String(width)}-${theme}.png`), fullPage: true })
        }
        expect(taken.dark!.equals(taken.light!), `Needs you at ${String(width)}: the dark picture is the light one`).toBe(false)
      }
    },
    900_000,
  )

  it('names the asking agent by its office name in the answer of the press that grants it, never its handle', async () => {
    const reply = await ask('POST', `/api/roles/requests/${cardAskId}/grant`, AS_THE_PERSON, {})
    const said = reply.body as { agent?: string; note?: string }
    expect(said.agent, 'the answer still returns the handle in its agent field').toBe(HANDLE)
    expect(String(said.note)).toContain(`${NAME} holds the supervisor card`)
    expect(String(said.note)).not.toContain(HANDLE)
  }, 120_000)

})
