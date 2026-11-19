// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOP BAR, THE PILL, THE CHAT'S NOTICE AND THE DECISIONS PAGE SAY WHAT IS SO.
 *
 * Wave 13q round 10, on the notes fixes, task sqEoIA8_ljea, plan 7FEOshq3mBGG row F1. In a test
 * office with made-up records, in a real browser:
 *
 *   1. The phone's top bar names the Reports page by the key its sidebar row reads, at 990 and 390,
 *      and names no project, because the sidebar lists that page under All projects.
 *   2. The chat's notice says the office could not tell for an agent whose session has a live
 *      process and no transcript, and "Cannot reach" for an agent nothing is answering as, in English
 *      and in the test language (problem TOoUy7fMbg1P, a note on wave 13j's round).
 *   3. The phone's top bar draws no "0 urgent" when nothing is urgent, and draws the pill with 2 when
 *      two things are (problem cslafTCFymQb).
 *   4. The Decisions page draws no "Project name unavailable" in normal mode: a project nobody could
 *      name is the short mark (problem Ab1IFMIvEYAf). The office's own answer has a null project
 *      title only when no project row holds the id, which the API refuses to make, so the page's read
 *      of /api/forks is given that null on its way in.
 *
 * THE THREE RUNS for each case are in the commit that adds this file.
 *
 * Set W13Q_NOTES_FIXES_SHOTS to a folder to photograph the top bar on Reports at 990 and 390 and the
 * chat's notice, in the light look. The ordinary run takes no picture.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheContact } from './a-contact-navigation-keeps-what-failed.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
const shots = process.env.W13Q_NOTES_FIXES_SHOTS
const contexts: BrowserContext[] = []
/** Every real child this file started, stopped by its group afterwards. */
const started: ChildProcess[] = []

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Made-up agents: one the office could not tell about, one nothing is answering as. */
const UNSURE = { handle: 'test-kestrel', name: 'Test Kestrel' }
const GONE = { handle: 'test-heron', name: 'Test Heron' }

async function request(path: string, body?: unknown, headers: Record<string, string> = HEADERS, answers?: 201 | 409): Promise<any> {
  const response = await fetch(`${app.api}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.clone().text()
  if (answers === undefined) expect(response.ok, `${path}: ${text}`).toBe(true)
  else expect(response.status, `${path}: ${text}`).toBe(answers)
  return response.json()
}

const file = async (kind: string, title: string, data: Record<string, unknown>, answers: 201 | 409 = 201): Promise<string> =>
  (await request('/api/records', { kind, title, data }, HEADERS, answers)).record.id as string

/** How many things the frame's pill counts now: the ranked rows the attention reading shows. */
async function urgentNow(): Promise<number> {
  return ((await request('/api/attention')) as { visible: unknown[] }).visible.length
}

/**
 * An agent whose handle is held by a session with a live process and NO transcript on record: the
 * reading behind the hold says the office could not tell (src/server/lib/answering.ts).
 */
async function anAgentTheOfficeCannotTellAbout(): Promise<void> {
  await file('agent', UNSURE.name, { handle: UNSURE.handle, runtime: 'claude-code', state: 'active' })
  const session = await file('session', 'A made-up session with no transcript', { state: 'running', runtime: 'claude-code' })
  const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below measures anything').toBeDefined()
  await request('/api/resources', { sessionRecordId: session, type: 'process', key: String(child.pid), detail: 'a made-up process' })
  // THE HOLD IS ASKED AS THE WAITER ASKS IT, under the agent's handle with this test office's key,
  // read from its own key file and never printed.
  const theOfficesKey = (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office
  await request(`/api/handles/${UNSURE.handle}/hold`, { session, machine: 'a-machine', runtime: 'claude-code' }, {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': UNSURE.handle,
    'x-mole-office-key': theOfficesKey,
  })
}

async function aWindow(width: number, theme: 'light' | 'dark' = 'light'): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
  contexts.push(context)
  await context.grantPermissions(['local-network-access'], { origin: app.site })
  await context.addInitScript(`localStorage.setItem('mole-office.preset.theme', '${theme}')`)
  return context.newPage()
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto(`${app.site}/${address}`)
  await waitForThePage(page, 30_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'notes-fixes', workspace: 'default', viewport: { width: 1440, height: 900 } })
  await anAgentTheOfficeCannotTellAbout()
  await file('agent', GONE.name, { handle: GONE.handle, runtime: 'claude-code', state: 'active' })
  // TEST KESTREL'S HANDLE IS HELD, so a send to it answers 201; nothing holds Test Heron's.
  await file('message', 'A made-up question', { body: 'Can you read the lighthouse log for me?', to: [{ kind: 'agent', id: UNSURE.handle }] })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  await file('message', 'A made-up question', { body: 'Can you read the lighthouse log for me?', to: [{ kind: 'agent', id: GONE.handle }] }, 409)
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => {
  for (const context of contexts) await context.close()
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone: nothing of it is left to stop.
    }
  }
  await app?.stop()
}, 60_000)

describe('the top bar', () => {
  it('names the Reports page by its sidebar key and names no project, at 990 and 390', async () => {
    for (const width of [990, 390]) {
      const page = await aWindow(width)
      await open(page, '#/notes')
      await expect.poll(() => page.locator('.shell-bar-page').innerText(), { timeout: 10_000 }).toBe(en['nav.notes'])
      expect(await page.locator('.shell-bar-project').count(), `${String(width)}px: the bar names a project on a page from every project`).toBe(0)
      if (shots) {
        const shot = await aWindow(width)
        await open(shot, '#/notes')
        await shot.screenshot({ path: join(shots, `reports-top-bar-${String(width)}-light.png`) })
      }
    }
    // A page of one project still names it, so the bar is not simply emptied.
    const page = await aWindow(390)
    await open(page, '#/findings')
    await page.locator('.shell-bar-project').waitFor({ timeout: 10_000 })
  }, 120_000)

  it('draws no "0 urgent" when nothing is urgent, and the pill when two things are', async () => {
    expect(await urgentNow(), 'the made-up office already has something urgent').toBe(0)
    const page = await aWindow(390)
    await open(page, '#/notes')
    await page.locator('.shell-bar-page').waitFor()
    // The count has been read once the checking state is gone.
    await expect.poll(() => page.locator('.shell-bar-status[data-tone="checking"]').count(), { timeout: 10_000 }).toBe(0)
    expect(await page.locator('.shell-bar').innerText()).not.toContain(en['frameWords.pill.urgentCount'].replace('{n} ', ''))
    expect(await page.locator('.shell-bar-status').count()).toBe(0)

    for (const title of ['Test lantern glass is cracked', 'Test fog bell is silent']) {
      await file('problem', title, { state: 'open', whose_move: 'person' })
    }
    expect(await urgentNow(), 'two open problems waiting on the person are not two urgent rows').toBe(2)
    await page.reload()
    await waitForThePage(page, 30_000)
    const pill = page.locator('a.shell-bar-status[data-count="urgent"]')
    await pill.waitFor({ timeout: 10_000 })
    expect((await pill.innerText()).replace(/\s+/g, ' ').trim()).toBe(en['frameWords.pill.urgentCount'].replace('{n}', '2'))
  }, 120_000)
})

describe('the chat notice', () => {
  it('keeps its contacts when the opening groups read is refused, and says that reason', async () => {
    const page = await aWindow(1440)
    const reason = 'The fixture group list is refused.'
    await page.route(/\/api\/groups(?:\?.*)?$/, async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, status: 403, json: { error: `${reason} This fixture diagnostic belongs in the details.`, reason } })
    })
    await open(page, '#/chat')
    expect.soft((await page.locator('.px-chat-notice', { hasText: reason }).first().innerText()).trim()).toBe(reason)
    for (const one of [UNSURE, GONE]) {
      expect.soft(await page.locator('.px-chat-contact', { hasText: one.name }).count(), `${one.name}: a refused group read must not discard contacts`).toBeGreaterThan(0)
    }
  }, 120_000)

  /** Open the chat page on one agent's conversation and read its notice. */
  async function theNotice(page: Page, language: string, name: string): Promise<{ words: string; couldNotTell: string | null }> {
    const words = page.locator('.px-chat-cannot-reach-words')
    await openTheContact(
      page,
      () => open(page, `?lang=${language}#/chat`),
      page.locator('.px-chat-contact', { hasText: name }).first(),
      words,
    )
    return { words: (await words.innerText()).trim(), couldNotTell: await words.getAttribute('data-could-not-tell') }
  }

  for (const language of ['en', 'xx'] as const) {
    it(`says the office could not tell, and Cannot reach only when it knows, in ${language}`, async () => {
      const words = createI18n(language)
      // A WINDOW EACH, so the second is not reading the first one's conversation, which the chat keeps.
      const unsure = await theNotice(await aWindow(1440), language, UNSURE.name)
      expect(unsure.words).toBe(words.t('notesFixes.chat.couldNotTell', { who: UNSURE.name }))
      expect(unsure.couldNotTell).toBe('yes')
      const gone = await theNotice(await aWindow(1440), language, GONE.name)
      expect(gone.words).toBe(words.t('chatLive.cannotReach', { who: GONE.name }))
      expect(gone.couldNotTell).toBe('no')
    }, 120_000)
  }

  it.runIf(shots !== undefined && shots !== '')('photographs the notice in the light look at 1440 and 390', async () => {
    for (const width of [1440, 390]) {
      const page = await aWindow(width)
      await open(page, '#/chat')
      await page.locator('.px-chat-contact', { hasText: UNSURE.name }).first().click()
      await page.locator('.px-chat-cannot-reach-words').waitFor({ timeout: 20_000 })
      await page.screenshot({ path: join(shots as string, `chat-could-not-tell-${String(width)}-light.png`) })
    }
    for (const language of ['zh', 'xx']) {
      const page = await aWindow(1440)
      await open(page, `?lang=${language}#/chat`)
      await page.locator('.px-chat-contact', { hasText: UNSURE.name }).first().click()
      await page.locator('.px-chat-cannot-reach-words').waitFor({ timeout: 20_000 })
      await page.screenshot({ path: join(shots as string, `chat-could-not-tell-1440-light-${language}.png`) })
    }
  }, 300_000)
})

describe('the Decisions page', () => {
  it('draws the short mark, not "Project name unavailable", for a project nobody could name', async () => {
    await file('proposal', 'Test choice: which lamp first', {
      question: 'Test question: which lamp is lit first?',
      options: ['a — The north lamp.', 'b — The south lamp.'],
      recommendation: 'Take (a). Test recommendation.',
      because: 'Test reason.',
      who_settles_it: 'the owner',
    })
    await file('decision', 'Test decision: the bell rings at dusk', { option_taken: 'The bell rings at dusk.', replaces: [] })
    const page = await aWindow(1440)
    // THE NULL THE SERVER SENDS FOR AN ID NO PROJECT ROW HOLDS, put on every row of the reply.
    await page.route('**/api/forks', async (route) => {
      const reply = await route.fetch()
      const body = (await reply.json()) as { forks: { workspaceTitle: string | null }[]; decisions: { workspaceTitle: string | null }[] }
      for (const one of [...body.forks, ...body.decisions]) one.workspaceTitle = null
      await route.fulfill({ response: reply, json: body })
    })
    await open(page, '#/governance')
    await page.locator('.dq-past-card').first().waitFor({ timeout: 20_000 })
    const main = page.locator('main')
    const seen = await main.evaluate((root) => {
      const found: string[] = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement
        if (parent === null || parent.closest('style, script, .px-sr') !== null) continue
        if (!parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
        found.push(walker.currentNode.textContent ?? '')
      }
      return found.join('\n')
    })
    expect(seen).not.toContain(en['decisions.unnamedProject'])
    // The decided card and the waiting row both draw the short mark in its place.
    expect(await page.locator('.dq-past-card .dq-where .px-absent').count()).toBeGreaterThan(0)
    expect(await page.locator('.dq-where .px-absent').count()).toBeGreaterThan(1)
    if (shots) {
      for (const width of [1440, 390]) {
        const shot = await aWindow(width)
        await shot.route('**/api/forks', async (route) => {
          const reply = await route.fetch()
          const body = (await reply.json()) as { forks: { workspaceTitle: string | null }[]; decisions: { workspaceTitle: string | null }[] }
          for (const one of [...body.forks, ...body.decisions]) one.workspaceTitle = null
          await route.fulfill({ response: reply, json: body })
        })
        await open(shot, '#/governance')
        await shot.locator('.dq-past-card').first().waitFor({ timeout: 20_000 })
        await shot.screenshot({ path: join(shots, `decisions-unnamed-project-${String(width)}-light.png`), fullPage: true })
      }
    }
  }, 300_000)
})
