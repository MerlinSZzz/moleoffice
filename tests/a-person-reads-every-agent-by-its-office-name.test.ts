// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, decision mFgspTpVWJqy): the admission's Home case reads the admission among
// the rows Home draws.
// Since HD-2d, Home's Needs you draws only its first `NEEDS_SHOWN` rows. When this case read Home, four rows waited for
// the person, written in the same second: the one-press request, the card ask's message, the admission and the card
// ask. The waiting reading orders rows of one second by id, and the ids are random, so the admission was left out about
// one run in two. The press-words case now runs before the admission's Home case, so its request is withdrawn first.
// The Home case has the person read the card ask's message, so the admission and the card ask are the only rows
// waiting. It checks by `GET /api/waiting` that the admission is among the first `NEEDS_SHOWN` rows before it reads
// Home. Before, the admission's Home case was held to find the admission's row on Home whatever rows waited beside it.
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
 * Home is read once the press request is withdrawn and the person has read the card ask's message,
 * after the waiting reading shows the admission among the rows Home draws.
 *
 * THE MERGE QUEUE'S AND DELEGATION'S SENTENCES, in a throwaway office of their own (the last
 * describe). Made-up agents are registered with office names that are not their handles. Each case
 * reads one sentence the server makes about them, as a person reads it on an entry's page, a
 * door's answer or the packaged-tasks panel.
 *
 * OLD:
 *   - the merge queue's line for the secretary, its `Told ...` sentence at an entry's end and the
 *     answer of turning a line named each agent by its handle;
 *   - who is responsible for a task named the live creator, the live agent above it and the
 *     secretary by their handles, and a retired creator by the stamp its create row stores.
 *
 * NEW:
 *   - each of these sentences names each agent by its office name;
 *   - a stamp no single agent row answers is shown as the change log stores it, and is never said
 *     as an unregistered agent;
 *   - the stored fields keep what they stored: a run's agent and an entry's recipients by id.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { apiApp, deleteTheCopiedDefaultChapters, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { NEEDS_SHOWN } from '../src/web/components/home/HomeSections.tsx'

const HANDLE = 'glaze-tally'
const NAME = 'Glaze Tally'
const INSPECTOR_HANDLE = 'glaze-inspector'
const INSPECTOR_NAME = 'Glaze Inspector'
const WORKSPACE = 'default'
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
let cardAskMessageId = ''

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
    cardAskMessageId = String(card.body['message'])
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

  it('names the asking agent by its office name in the words of the person\'s press, never its handle', async () => {
    const reply = await ask('GET', `/api/one-press/${onePressId}`, AS_THE_PERSON)
    const request = reply.body['request'] as { shows: string }
    expect(request.shows).toBe(`Give "${NAME}" the supervisor card it asked for.`)
    expect(request.shows).not.toContain(HANDLE)
    const withdrawn = await ask('POST', `/api/one-press/${onePressId}/withdraw`, AS_THE_AGENT)
    expect(withdrawn.status, 'the asker withdrew its own press request').toBe(200)
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

    // THE PERSON READS THE CARD ASK'S MESSAGE. The press-words case has withdrawn its request, so the admission and the
    // card ask are the only rows waiting.
    await ask('POST', `/api/messages/${cardAskMessageId}/mark`, AS_THE_PERSON, { mark: 'seen' })
    // THE ADMISSION IS AMONG THE ROWS HOME DRAWS, or the case says what crowded it out.
    const beforeHome = await ask('GET', '/api/waiting', AS_THE_PERSON)
    const rows = (beforeHome.body['items'] ?? []) as { id: string; title: string }[]
    const place = rows.findIndex((one) => one.id === selfAskId)
    const ahead = (place < 0 ? rows : rows.slice(0, place)).map((one) => one.title)
    const why =
      `the admission's place in the waiting reading is ${String(place)} (-1 means it is not a row); Home draws the ` +
      `first ${String(NEEDS_SHOWN)}; the rows ahead of it, or every row when it is not one, are ` +
      JSON.stringify(ahead)
    expect(place, why).toBeGreaterThanOrEqual(0)
    expect(place, why).toBeLessThan(NEEDS_SHOWN)
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

  it('names the asking agent by its office name in the answer of the press that grants it, never its handle', async () => {
    const reply = await ask('POST', `/api/roles/requests/${cardAskId}/grant`, AS_THE_PERSON, {})
    const said = reply.body as { agent?: string; note?: string }
    expect(said.agent, 'the answer still returns the handle in its agent field').toBe(HANDLE)
    expect(String(said.note)).toContain(`${NAME} holds the supervisor card`)
    expect(String(said.note)).not.toContain(HANDLE)
  }, 120_000)

})

/** The made-up agents of the last describe, each with an office name that is not its handle. */
const LEAD = { handle: 'made-up-lead', name: 'Lead Of The Made-up Line' }
const BUILDER = { handle: 'made-up-builder', name: 'Builder On The Made-up Line' }
const LEAVER = { handle: 'made-up-leaver', name: 'Leaver Of The Made-up Line' }
const LONER = { handle: 'made-up-loner', name: 'Loner With No Live Starter' }
const KEEPER = { handle: 'made-up-keeper', name: 'Keeper Of The Made-up Cards' }
const EVERY_MADE_UP_AGENT = [LEAD, BUILDER, LEAVER, LONER, KEEPER]
/** A create row's stamp that no agent row answers. */
const A_STAMP_NO_AGENT_HAS = 'made-up-stamp-no-agent-has'
const AN_ENTRY_NOBODY_FILED = 'made-up-entry-not-filed'

describe("the merge queue's and delegation's sentences name each agent by its office name", () => {
  let t: TestDb
  let server: FastifyInstance
  const PERSON = { type: 'human', id: THE_PERSON } as const
  const asAgentHere = (handle: string): Record<string, string> => ({
    ...AS_THE_PERSON,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  })
  let builderRun = ''
  let leaverRun = ''
  let builderTask = ''
  let leaverTask = ''
  let lonerTask = ''
  let strangerTask = ''

  /** Registers an agent through the starter door and insists the door wrote it. */
  async function started(by: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
    const reply = await server.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(reply.statusCode, reply.body).toBe(201)
  }

  /** The registry id of the agent registered under this handle. */
  function idOf(handle: string): string {
    const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
    expect(row, `nothing is registered as ${handle}`).toBeDefined()
    return row!.id
  }

  /** A running run of the agent, filed through the record door as that agent. */
  async function aRunOf(handle: string, title: string): Promise<string> {
    const reply = await server.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgentHere(handle),
      payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd() } },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    return String((reply.json() as { record: { id: string } }).record.id)
  }

  /** A task whose create row is stamped with the agent's handle, as the agent's own write leaves it. */
  function aTaskBy(handle: string, title: string): string {
    return t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title, actor: { type: 'agent', id: handle }, data: {} }).id
  }

  /** The words hold no made-up agent's handle. */
  function holdsNoHandle(words: string): void {
    for (const agent of EVERY_MADE_UP_AGENT) expect(words, `the words draw ${agent.handle}`).not.toContain(agent.handle)
  }

  beforeAll(async () => {
    t = await freshDb()
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
    expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
    writeFileSync(
      join(dirname(t.file), 'keys.json'),
      `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
      { mode: 0o600 },
    )
    server = (await apiApp()).app
    await server.ready()
    await started(AS_THE_PERSON, { handle: KEEPER.handle, name: KEEPER.name, role: 'secretary' })
    await started(AS_THE_PERSON, { handle: LEAD.handle, name: LEAD.name, role: 'supervisor' })
    await started(asAgentHere(LEAD.handle), { handle: BUILDER.handle, name: BUILDER.name })
    await started(asAgentHere(LEAD.handle), { handle: LEAVER.handle, name: LEAVER.name })
    await started(AS_THE_PERSON, { handle: LONER.handle, name: LONER.name })
    builderRun = await aRunOf(BUILDER.handle, 'A made-up run whose merge entry ends')
    leaverRun = await aRunOf(LEAVER.handle, 'A made-up run of an agent that retires')
    builderTask = aTaskBy(BUILDER.handle, 'A made-up task a live agent made')
    leaverTask = aTaskBy(LEAVER.handle, 'A made-up task an agent made before it retired')
    lonerTask = aTaskBy(LONER.handle, 'A made-up task of an agent the person started, now retired')
    strangerTask = aTaskBy(BUILDER.handle, 'A made-up task whose stamp no agent has')
    // THE STAMP IS SET AT THE TABLE, since no write of an agent's own could leave a string no agent has.
    t.client.sqlite.prepare('UPDATE changes SET actor_id = ? WHERE record_id = ?').run(A_STAMP_NO_AGENT_HAS, strangerTask)
    t.client.sqlite.prepare('UPDATE revisions SET actor_id = ? WHERE record_id = ?').run(A_STAMP_NO_AGENT_HAS, strangerTask)
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE handle IN (?, ?)').run(LEAVER.handle, LONER.handle)
  }, 120_000)

  afterAll(async () => {
    await server?.close()
    t?.close()
  })

  /** An entry's reading as the line for the secretary reads it: no entry record is filed, so it counts no files. */
  const aReading = (state: string, more: Record<string, unknown> = {}): never =>
    ({
      id: AN_ENTRY_NOBODY_FILED,
      lane: '/made-up/lanes/lane-one',
      run: builderRun,
      state,
      submittedBy: { kind: 'person', id: THE_PERSON },
      changeset: { adapter: 'files' },
      ...more,
    }) as never

  it("names the run's agent by its office name in the merged, bounced and other lines for the secretary", async () => {
    const { oneLineForTheSecretary } = await import('../src/server/lib/merge-state-machine.ts')
    for (const state of ['merged', 'bounced', 'testing']) {
      const line = oneLineForTheSecretary(aReading(state))
      expect(line, state).toContain(`: ${BUILDER.name} #${AN_ENTRY_NOBODY_FILED}`)
      holdsNoHandle(line)
    }
    expect(oneLineForTheSecretary(aReading('bounced'))).toContain(`→ back to ${BUILDER.name}`)
    // A SUBMITTER NO RUN AND NO ROW ANSWERS is shown as the entry stores it.
    const nobodysRun = { run: 'made-up-run-not-filed', submittedBy: { kind: 'agent', id: A_STAMP_NO_AGENT_HAS } }
    const stored = oneLineForTheSecretary(aReading('testing', nobodysRun))
    expect(stored).toContain(`: ${A_STAMP_NO_AGENT_HAS} #${AN_ENTRY_NOBODY_FILED}`)
  }, 60_000)

  it("names the run's agent and the agent that withdrew the entry by their office names in the withdrawn line", async () => {
    const { oneLineForTheSecretary } = await import('../src/server/lib/merge-state-machine.ts')
    const withdrawn = { by: { kind: 'agent', id: idOf(LEAD.handle) }, because: 'Made up: the work moved.', at: '2026-11-21 21:00:00' }
    const line = oneLineForTheSecretary(aReading('withdrawn', { withdrawn }))
    expect(line).toContain(`: ${BUILDER.name} #${AN_ENTRY_NOBODY_FILED} by ${LEAD.name}: Made up: the work moved.`)
    holdsNoHandle(line)
  }, 60_000)

  it("names each agent told of an entry's end by its office name, and tells each by its registry id", async () => {
    const { whoIsToldOfAnEntrysEnd } = await import('../src/server/lib/merge-queue.ts')
    const told = whoIsToldOfAnEntrysEnd({ run: builderRun, submittedBy: { kind: 'person', id: THE_PERSON } } as never)
    expect(told.to).toContainEqual({ kind: 'agent', id: idOf(BUILDER.handle) })
    for (const agent of EVERY_MADE_UP_AGENT) {
      if (told.to.some((one) => one.kind === 'agent' && one.id === idOf(agent.handle))) expect(told.says).toContain(agent.name)
    }
    expect(told.says).toContain(BUILDER.name)
    holdsNoHandle(told.says)
  }, 60_000)

  it("names a retired run agent and the starter told in its place by their office names at an entry's end", async () => {
    const { whoIsToldOfAnEntrysEnd } = await import('../src/server/lib/merge-queue.ts')
    const told = whoIsToldOfAnEntrysEnd({ run: leaverRun, submittedBy: { kind: 'person', id: THE_PERSON } } as never)
    expect(told.to).toContainEqual({ kind: 'agent', id: idOf(LEAD.handle) })
    expect(told.says).toContain(LEAD.name)
    expect(told.says).toContain(`The agent ${LEAVER.name} is retired, so its starter is told in its place.`)
    holdsNoHandle(told.says)
  }, 60_000)

  it("names the line's agent by its office name when its line is turned off, and keeps its registry id", async () => {
    const { turnALine } = await import('../src/server/lib/merge-queue-at-the-seal.ts')
    const turned = turnALine({ workspaceId: WORKSPACE, agent: BUILDER.handle, on: false, because: 'Made up: the line waits.', actor: PERSON })
    expect(turned.agent).toBe(idOf(BUILDER.handle))
    expect(turned.says).toContain(`The line of ${BUILDER.name} is turned off`)
    holdsNoHandle(turned.says)
  }, 60_000)

  it('names a live creator by its office name as the agent responsible for its task (rule 3)', async () => {
    const { responsibleFor } = await import('../src/server/lib/delegation.ts')
    const said = responsibleFor(builderTask)
    expect(said.who).toEqual({ kind: 'agent', id: idOf(BUILDER.handle) })
    expect(said.why).toContain(`The agent "${BUILDER.name}" created this task and is still live`)
    holdsNoHandle(said.why)
  }, 60_000)

  it('names a retired creator and the live agent above it by their office names (rule 4)', async () => {
    const { responsibleFor } = await import('../src/server/lib/delegation.ts')
    const said = responsibleFor(leaverTask)
    expect(said.who).toEqual({ kind: 'agent', id: idOf(LEAD.handle) })
    expect(said.why).toContain(`The agent "${LEAVER.name}" created this task and is retired or gone`)
    expect(said.why).toContain(`up its starter chain to "${LEAD.name}", the first live agent above it (rule 4)`)
    holdsNoHandle(said.why)
  }, 60_000)

  it('names the secretary by its office name, and keeps a stamp no agent row answers as stored (rule 5)', async () => {
    const { responsibleFor } = await import('../src/server/lib/delegation.ts')
    const alone = responsibleFor(lonerTask)
    expect(alone.who).toEqual({ kind: 'agent', id: idOf(KEEPER.handle) })
    expect(alone.why).toContain(`The agent "${LONER.name}" created this task`)
    expect(alone.why).toContain(`the secretary "${KEEPER.name}" is responsible (rule 5)`)
    holdsNoHandle(alone.why)
    const stranger = responsibleFor(strangerTask)
    expect(stranger.who).toEqual({ kind: 'agent', id: idOf(KEEPER.handle) })
    expect(stranger.why).toContain(`The agent "${A_STAMP_NO_AGENT_HAS}" created this task`)
    expect(stranger.why).toContain(`the secretary "${KEEPER.name}" is responsible (rule 5)`)
    expect(stranger.why).not.toContain(createI18n('en').t('record.writer.unregisteredAgent'))
    holdsNoHandle(stranger.why)
  }, 60_000)
})
