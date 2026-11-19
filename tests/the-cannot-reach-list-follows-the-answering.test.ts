// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIST OF AGENTS NOTHING IS ANSWERING AS FOLLOWS THE ANSWERING, WHILE IT IS OPEN.
 *
 * Problem KH2cuddacYXJ: `useAgentsNobodyAnswersFor` (src/web/components/StartANewAgent.tsx) read the
 * list once, when the place drawing it opened. An agent that began to answer stayed on the list, and
 * the list offered to start a new agent for it, until the place was closed and opened again.
 *
 * WHAT IS PROVED HERE, in a real browser against a real server. No message worker runs, so a message
 * the person wrote waits for its agent for as long as a case needs. Two made-up agents each have one
 * such message, so both are on the list at the start of each case.
 *
 *   1. In the right-click panel, behind More, the count says two and the list names both. When a
 *      hold is taken on one agent's handle, the list drops that agent and the count says one, with
 *      the panel left open and the page not loaded again. When the hold is let go, the agent is back
 *      and the count says two. Nothing reads the list again in five quiet seconds before the hold.
 *   2. In the chat, the New agent chooser does the same for the other agent, with the chooser left
 *      open.
 *
 * Taking and letting go of a hold announce `answering.changed` (src/server/lib/handles.ts), and that
 * event is the only thing that can make an open list read again. The page's clock is not moved.
 *
 * ---------------------------------------------------------------------------------------
 * THE RUNS, recorded in the commit message and the report with their log paths
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: both cases green. MUTATION 1, the hook put back as it was before this problem, reading
 * the list once in an effect with no dependencies: both cases red, on the agent that answers still
 * being listed. MUTATION 2, the list also read every second on a timer: case 1 red, because the reads
 * never stop long enough for the quiet seconds to begin. RESTORE: both cases green.
 *
 * PICTURES, when CANNOT_REACH_LIST_SHOTS names a folder: the chat with the New agent chooser open,
 * before and after one agent answers again, at 1440, 990, 660 and 390, light and dark, in English.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeTranscript, liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface MadeUpAgent {
  handle: string
  name: string
  /** The registry id, read back once the agent is filed. */
  id: string
}

const PLOVER: MadeUpAgent = { handle: 'plover-ledger', name: 'Plover Ledger', id: '' }
const TERN: MadeUpAgent = { handle: 'tern-counter', name: 'Tern Counter', id: '' }

/** Every read the page sends for the carryable list. */
let readsOfThePress = 0
/** When the last of those reads was sent. */
let lastReadAtMs = 0

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function theAgents(): Promise<{ id: string; handle: string; name: string }[]> {
  const res = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  return ((await res.json()) as { agents: { id: string; handle: string; name: string }[] }).agents
}

/** The office's key file names a key the hold door takes for an agent with no key of its own. Never printed. */
function theOfficesKey(): string {
  return (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office
}

function asTheAgent(agent: MadeUpAgent): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': agent.handle,
    'x-mole-office-key': theOfficesKey(),
  }
}

/**
 * MAKE ONE AGENT ANSWER AGAIN: a running session whose transcript grew just now, with a hold taken on
 * its handle, asked as tools/hold-the-handle.mjs asks it. Copied from
 * tests/a-second-press-makes-no-second-agent.test.ts. Returns the session the hold is on.
 */
async function itAnswersAgain(agent: MadeUpAgent): Promise<string> {
  const session = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({
      kind: 'session',
      title: `A session of ${agent.handle}`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        servingAgent: agent.handle,
        ranAs: [{ workspaceId: 'default', agentId: agent.id }],
        extra: { discovered: { tool: 'claude-code', externalId: agent.handle, logPath: fakeTranscript(agent.handle), resumeCommand: null, startedAt: null, entryPoint: null } },
      },
    }),
  })
  expect(session.status, await session.clone().text()).toBe(201)
  const sessionId = ((await session.json()) as { record: { id: string } }).record.id
  const held = await fetch(`${app.api}/api/handles/${agent.handle}/hold`, {
    method: 'POST',
    headers: asTheAgent(agent),
    body: JSON.stringify({ session: sessionId, machine: 'a-machine', runtime: 'claude-code' }),
  })
  expect(held.status, await held.clone().text()).toBe(201)
  return sessionId
}

/** Let the hold go, as the waiter does when its session ends. */
async function itStopsAnswering(agent: MadeUpAgent, session: string): Promise<void> {
  const gone = await fetch(`${app.api}/api/handles/${agent.handle}/release`, {
    method: 'POST',
    headers: asTheAgent(agent),
    body: JSON.stringify({ session, because: 'The made-up session ended.' }),
  })
  expect(gone.status, await gone.clone().text()).toBe(200)
}

/** Wait until the list drawn inside `scope` names exactly these agents, or fail saying what it named. */
async function theListNames(scope: string, agents: MadeUpAgent[], what: string): Promise<void> {
  const wanted = agents.map((one) => one.name).sort()
  const named = (): Promise<string[]> =>
    app.page.$$eval(`${scope} .px-start-agent-here-name`, (rows) => rows.map((row) => (row.textContent ?? '').trim()).sort())
  await app.page
    .waitForFunction(
      ({ scope, wanted }) =>
        JSON.stringify([...document.querySelectorAll(`${scope} .px-start-agent-here-name`)].map((row) => (row.textContent ?? '').trim()).sort()) ===
        JSON.stringify(wanted),
      { scope, wanted },
      { timeout: 10_000 },
    )
    .catch(() => undefined)
  expect(await named(), what).toEqual(wanted)
}

/** What the More line's count says now, or null when the line is not drawn. */
async function theCount(): Promise<string | null> {
  return app.page.$eval('.px-talk-more-line .px-talk-more-count', (el) => (el.textContent ?? '').trim()).catch(() => null)
}

/**
 * WAIT UNTIL NO READ OF THE LIST HAS BEEN SENT FOR TWO SECONDS. Each place that opens reads the list once
 * (src/web/components/StartANewAgent.tsx), so the More line and the list it opens read twice, and a quiet
 * window starts after both.
 */
async function untilTheReadsSettle(): Promise<void> {
  const giveUpAt = Date.now() + 15_000
  while (Date.now() - lastReadAtMs < 2_000) {
    if (Date.now() > giveUpAt) throw new Error('the list was still being read after fifteen seconds')
    await sleep(200)
  }
}

const notAnswering = (n: number): string => t('talk.notAnswering', { n })

/** Open the chat panel at its contacts, from wherever the page is. */
async function openTheContacts(): Promise<void> {
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-contact', { timeout: 30_000 })
}

/** Open the New agent chooser, unless it is open already. */
async function openTheChooser(): Promise<void> {
  if ((await app.page.$('.px-chat-new-agent-ask')) !== null) return
  await openTheContacts()
  await app.page.click('.px-chat-top-group[data-side="agent"] .px-chat-top-heading .px-chat-new-agent')
  await app.page.waitForSelector('.px-chat-new-agent-ask', { timeout: 20_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'cannot-reach-list', viewport: { width: 1440, height: 1000 } })
  for (const agent of [PLOVER, TERN]) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
    agent.id = (await theAgents()).find((one) => one.handle === agent.handle)?.id ?? ''
    expect(agent.id, `no registry id for ${agent.handle}`).not.toBe('')
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'message', title: 'Count the shore birds', data: { body: 'Count the shore birds, please.', to: [{ kind: 'agent', id: agent.id }] } }),
    })
    // THE UNHELD 409 (decision 60sbc5I-bwKx): the person's line is stored and the contact row is made, which is what
    // this fixture wants; the answer is the error.
    expect(said.status, await said.clone().text()).toBe(409)
  }
  app.page.on('request', (request) => {
    if (request.method() !== 'GET' || !request.url().includes('/api/messages/carryable-agent-ids')) return
    readsOfThePress += 1
    lastReadAtMs = Date.now()
  })
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('problem KH2cuddacYXJ: the list follows the answering while it is open', () => {
  it('1: the right-click panel drops an agent that answers again, and takes it back when it stops', async () => {
    await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.click('body', { button: 'right' })
    await app.page.click('.px-talk-more-btn')
    await app.page.waitForSelector('.px-talk-more-line', { timeout: 20_000 })
    await app.page.click('.px-talk-more-line')
    await theListNames('.px-talk-more', [PLOVER, TERN], 'the panel did not open on both agents')
    expect(await theCount()).toBe(notAnswering(2))

    // NOTHING READS THE LIST AGAIN WHILE NOTHING CHANGES: it is read on the event, not on a timer.
    await untilTheReadsSettle()
    const readsBefore = readsOfThePress
    await sleep(5_000)
    expect(readsOfThePress - readsBefore, 'the list was read again with nothing announced').toBe(0)

    // THE HOLD IS LET GO EVEN WHEN THE CASE FAILS, so the next case starts with both agents on the list.
    const session = await itAnswersAgain(PLOVER)
    let letGo = false
    try {
      await theListNames('.px-talk-more', [TERN], 'the open panel still lists an agent that answers again')
      expect(await theCount()).toBe(notAnswering(1))
      letGo = true
      await itStopsAnswering(PLOVER, session)
      await theListNames('.px-talk-more', [PLOVER, TERN], 'the open panel did not take back an agent that stopped answering')
      expect(await theCount()).toBe(notAnswering(2))
    } finally {
      if (!letGo) await itStopsAnswering(PLOVER, session)
    }

    await app.page.keyboard.press('Escape')
    await app.page.waitForFunction(() => document.querySelector('.px-talk') === null, undefined, { timeout: 30_000 })
  }, 180_000)

  it('2: the chat\'s New agent chooser does the same, while it stays open', async () => {
    await app.page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await openTheChooser()
    await theListNames('.px-chat-new-agent-ask', [PLOVER, TERN], 'the chooser did not open on both agents')

    const session = await itAnswersAgain(TERN)
    let letGo = false
    try {
      await theListNames('.px-chat-new-agent-ask', [PLOVER], 'the open chooser still lists an agent that answers again')
      letGo = true
      await itStopsAnswering(TERN, session)
      await theListNames('.px-chat-new-agent-ask', [PLOVER, TERN], 'the open chooser did not take back an agent that stopped answering')
    } finally {
      if (!letGo) await itStopsAnswering(TERN, session)
    }

    await app.page.click('.px-chat-new-agent-close')
    await app.page.waitForFunction(() => document.querySelector('.px-chat-new-agent-ask') === null, undefined, { timeout: 20_000 })
  }, 180_000)
})

describe('pictures', () => {
  it.skipIf(!process.env['CANNOT_REACH_LIST_SHOTS'])('photographs the chooser before and after an agent answers again', async () => {
    const shots = process.env['CANNOT_REACH_LIST_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const widths = [1440, 990, 660, 390]
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.goto(`${app.site}/#/`, { timeout: 60_000 })
      // A GOTO THAT CHANGES ONLY THE HASH LOADS NOTHING, so the page is loaded again to take the look.
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      for (const width of widths) {
        await app.page.setViewportSize({ width, height: 1000 })
        await openTheChooser()
        await theListNames('.px-chat-new-agent-ask', [PLOVER, TERN], `the ${theme} chooser at ${String(width)} did not list both`)
        await app.page.waitForTimeout(400)
        await app.page.screenshot({ path: join(shots, `cannot-reach-list-${String(width)}-${theme}-before.png`) })
      }
      const session = await itAnswersAgain(PLOVER)
      for (const width of widths) {
        await app.page.setViewportSize({ width, height: 1000 })
        await openTheChooser()
        await theListNames('.px-chat-new-agent-ask', [TERN], `the ${theme} chooser at ${String(width)} still listed the agent that answers`)
        await app.page.waitForTimeout(400)
        await app.page.screenshot({ path: join(shots, `cannot-reach-list-${String(width)}-${theme}-after.png`) })
      }
      await itStopsAnswering(PLOVER, session)
      await theListNames('.px-chat-new-agent-ask', [PLOVER, TERN], `the ${theme} chooser did not take the agent back`)
    }
  }, 600_000)
})
