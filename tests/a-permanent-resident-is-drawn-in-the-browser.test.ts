// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PERMANENT RESIDENTS ON THE PAGES OF A REAL OFFICE. Wave 13r round 4, on the proposal report
 * GsGFiDygATd5 blocks b-4 to b-8.
 *
 * A throwaway office of this test's own (liveApp) is filled through its real doors: a secretary proposes, the person
 * confirms, the resident writes files, replaces one, voids one, gives leave and has one ended, session records are
 * filed for it, and another resident is retired. Then the pages are read in a browser:
 *
 *   1. Home's waiting band draws an open proposal with Confirm and Not now; pressing Confirm makes the row say the
 *      resident has a space and the door made one; pressing Not now makes the row say so, and no space is made. The
 *      project card's number is read where the card is now, the projects page one press from Home, after
 *      wave 13w round 21 moved the cards off Home.
 *   2. The Embassy draws the resident mark on each resident's row, the count at the Agents heading, and the open
 *      proposal beside the asks at the door.
 *   3. The resident section, drawn for the person: the void file struck through with its reason, the earlier version
 *      under its file, the session-origin table, a live grant with its End press and an ended one. For a retired
 *      resident, the press that names a successor. For another agent, only "This space is private."
 *   Every page is checked for sideways scrolling at each width it is drawn at.
 *
 * THE SECTION IS DRAWN ON A HARNESS PAGE THIS TEST MOUNTS, because the agent's own page (ProfilePage.tsx) is wave
 * 13k's and does not draw it yet. The harness is the component itself, bundled with esbuild from
 * src/web/components/ResidentSection.tsx, given the agent's row from GET /api/participants of this office.
 *
 * PICTURES. With R4_SHOTS set to a folder, every page above is photographed at 1440, 990, 660 and 390 pixels wide in
 * light and dark, and at 1440 in Chinese. Without it, each is drawn and checked at 1440 and 390 in light only.
 *
 * THE THREE RUNS ARE IN THE COMMIT MESSAGE that added this file.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { build } from 'esbuild'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { theResizeIsDrawn, liveApp, thePersonsKeyHeader, type LiveApp, waitForThePage } from './helpers.ts'

const SHOTS = process.env['R4_SHOTS'] ?? null
const WIDTHS = SHOTS === null ? [1440, 390] : [1440, 990, 660, 390]
const THEMES = SHOTS === null ? (['light'] as const) : (['light', 'dark'] as const)

let app: LiveApp
let page: Page
/** What the page threw, so a wait that runs out says why. */
const pageErrors: string[] = []

/**
 * WAIT FOR WHAT A PAGE SHOULD DRAW, and when it never comes, fail saying what the page drew instead and what it threw.
 */
async function see(selector: string): Promise<void> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    const drawn = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.slice(0, 1500).replace(/\s+/g, ' '))
    throw new Error(`${selector} was not drawn. The page threw: ${pageErrors.join(' | ') || 'nothing'}. It drew: ${drawn}`)
  }
}
let person: Record<string, string>
const agents = new Map<string, { id: string; key: string }>()

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

const asPerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person })
const as = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': agents.get(handle)!.key,
})

async function started(handle: string, name: string, role: string): Promise<void> {
  const reply = await call('POST', '/api/agents/started', asPerson(), { handle, name, role, runtime: 'claude-code' })
  agents.set(handle, { id: String(reply['agent'].id), key: String(reply['whatToGiveIt']?.key) })
}

async function propose(handle: string, because: string): Promise<string> {
  const reply = await call('POST', '/api/residents/proposals', as('sec-test'), { agentId: handle, because })
  return String(reply['proposal'].id)
}

async function aSession(handle: string, data: Record<string, unknown>): Promise<void> {
  await call('POST', '/api/records', asPerson(), {
    kind: 'session',
    title: `A test run of ${handle}`,
    data: { state: 'finished', servingAgentId: agents.get(handle)!.id, ...data },
  })
}

async function write(handle: string, path: string, text: string): Promise<void> {
  await call('PUT', `/api/residents/${agents.get(handle)!.id}/space/file?path=${encodeURIComponent(path)}`, as(handle), { text })
}

/** Open a page of the app, in a width, a look and a language. */
async function open(where: string, theme: 'light' | 'dark', width: number, language = 'en'): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=${language}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Look again at the page as it is now, in another width and look, without reading it again. */
async function lookAgain(theme: 'light' | 'dark', width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await theResizeIsDrawn(page)
}

/** No page scrolls sideways; then the picture, when pictures are asked for. */
async function picture(name: string, theme: string, width: number, language: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `${name} at ${String(width)} in ${theme}, ${language}, scrolls sideways`).toBeLessThanOrEqual(0)
  if (SHOTS !== null) await page.screenshot({ path: join(SHOTS, `${name}-${String(width)}-${theme}-${language}.png`), fullPage: true })
}

/** Every look the pictures ask for: four widths in two looks, then whatever `andChinese` does at 1440. */
async function everyLook(name: string, draw: (theme: 'light' | 'dark', width: number, language: string) => Promise<void>): Promise<void> {
  for (const width of WIDTHS) for (const theme of THEMES) {
    await draw(theme, width, 'en')
    await picture(name, theme, width, 'en')
  }
  await draw('light', 1440, 'zh')
  await picture(name, 'light', 1440, 'zh')
}

beforeAll(async () => {
  if (SHOTS !== null) mkdirSync(SHOTS, { recursive: true })
  app = await liveApp({ name: 'residents-drawn', workspace: 'default', viewport: { width: 1440, height: 900 } })
  page = app.page
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()) })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  await started('sec-test', 'Test secretary Sable', 'secretary')
  for (const [handle, name] of [
    ['lark-test', 'Test agent Lark'],
    ['wren-test', 'Test agent Wren'],
    ['fennel-test', 'Test agent Fennel'],
    ['quarry-test', 'Test agent Quarry'],
    ['moth-test', 'Test agent Moth'],
    ['reed-test', 'Test agent Reed'],
    ['sorrel-test', 'Test agent Sorrel'],
    ['ivy-test', 'Test agent Ivy'],
    ['yarrow-test', 'Test agent Yarrow'],
  ] as const) {
    await started(handle, name, 'worker')
  }

  // LARK: two runs, proposed, confirmed, with files, a replaced file, a void file, and leave given and ended.
  await aSession('lark-test', {
    runtime: 'claude-code', model: 'claude-opus-5-5', machine: 'test-machine', workingDirectory: '/work/test-lark', cutFrom: 'main',
    // WHAT DISCOVERY RECORDS ABOUT A CONVERSATION: the office reads the resume command and the start from here.
    extra: { discovered: { tool: 'claude-code', externalId: 'test-conversation', logPath: '/work/test-lark/test.jsonl',
      resumeCommand: 'claude --resume test-conversation', startedAt: '2026-09-30 09:15:00', entryPoint: 'cli' } },
  })
  const lark = await propose('lark-test', 'Test: Lark has built the report pages and keeps notes on how they are read.')
  await call('POST', `/api/residents/proposals/${lark}/confirm`, asPerson())
  // ITS PICTURE AND NAME ARE CHOSEN, so the confirm's reminder is not on Home's list below.
  await call('POST', `/api/residents/${agents.get('lark-test')!.id}/named`, asPerson())
  await aSession('lark-test', { runtime: 'codex', workingDirectory: '/work/test-lark-again' })
  await write('lark-test', 'memory/who-i-am.md', '# Who I am\n\nA test resident. This is the first version.\n')
  await write('lark-test', 'memory/who-i-am.md', '# Who I am\n\nA test resident. This is the second version.\n')
  await write('lark-test', 'memory/the-build-uses-node-20.md', 'The build uses Node 20.\n')
  await write('lark-test', 'poems/autumn-in-the-office.md', 'Leaves on the desk.\n')
  const larkId = agents.get('lark-test')!.id
  await call('POST', `/api/residents/${larkId}/space/void`, as('lark-test'), { path: 'memory/the-build-uses-node-20.md', because: 'Test: wrong, the office uses Node 22.' })
  await call('POST', `/api/residents/${larkId}/grants`, as('lark-test'), { readerAgentId: 'fennel-test', until: '2099-12-31 18:00' })
  const ended = await call('POST', `/api/residents/${larkId}/grants`, as('lark-test'), { readerAgentId: 'quarry-test', until: '2099-12-31 18:00' })
  await call('POST', `/api/residents/${larkId}/grants/${String(ended['grant'].id)}/end`, asPerson())

  // WREN: a resident, then retired, with no successor yet.
  const wren = await propose('wren-test', 'Test: Wren kept the schedule for a month.')
  await call('POST', `/api/residents/proposals/${wren}/confirm`, asPerson())
  await call('POST', '/api/participants/agent/wren-test/retire', asPerson(), { because: 'Test: its work here is done.' })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * WHAT HOME'S NEEDS YOU SAYS: its number, whether it says nothing needs the person, and how many generic rows it lists.
 * Read after the waiting list has been read again, which a press asks for.
 */
async function needsYou(): Promise<{ count: string; nothing: boolean; genericRows: number }> {
  return page.evaluate(() => ({
    count: (document.querySelector('.hm-needs-count')?.textContent ?? '').trim(),
    nothing: (document.querySelector('.hm-needs')?.textContent ?? '').includes('Nothing needs you.'),
    genericRows: document.querySelectorAll('.hm-needs-list > li').length,
  }))
}

/**
 * THE NUMBER ON THE PROJECT CARD, read on the projects page. The cards left Home for that page in wave 13w round 21
 * . It is read in a second tab, so Home keeps its answered rows for the pictures that follow.
 * The card is drawn from its own read of each project, which can come after the page's first draw, so it is polled.
 */
async function projectCardSays(expected: string): Promise<void> {
  const tab = await page.context().newPage()
  try {
    await tab.goto(`${app.site}/?lang=en#/projects`, { timeout: 60_000 })
    await waitForThePage(tab, 60_000)
    await expect
      .poll(async () => ((await tab.locator('.hm-project-waiting').first().textContent({ timeout: 5_000 }).catch(() => '')) ?? '').trim(), { timeout: 30_000 })
      .toBe(expected)
  } finally {
    await tab.close()
  }
}

/** The proposal rows on the page, by the agent each names in its title. */
async function proposalTitles(): Promise<string[]> {
  return page.locator('.resident-proposal-title').allInnerTexts()
}

describe('Home’s waiting band', () => {
  it('draws a proposal with the person\'s two presses, and after Confirm and after Not now says what was done', async () => {
    await propose('moth-test', 'Test: Moth answers the chat every evening.')
    await propose('reed-test', 'Test: Reed tidied the regulations.')
    // BEFORE: both rows wait, each with Confirm and Not now.
    await everyLook('home-before', async (theme, width, language) => {
      await open('/', theme, width, language)
      await see('.resident-proposal')
    })
    await open('/', 'light', 1440)
    await see('.resident-proposal')
    expect(await proposalTitles()).toEqual([
      'Make Test agent Moth a permanent resident of this office',
      'Make Test agent Reed a permanent resident of this office',
    ])
    // THE TWO PROPOSALS WAIT ON THE PERSON, SO NEEDS YOU SAYS 2 AND NEVER "NOTHING NEEDS YOU". They are counted in the one
    // waiting reading and drawn once each, as the rows with the person's presses: no generic row stands for them.
    // THE PROJECT CARD COUNTS THEM TOO, on the projects page where the card is now.
    await expect
      .poll(async () => await needsYou(), { timeout: 30_000 })
      .toEqual({ count: '2', nothing: false, genericRows: 0 })
    await projectCardSays('2waiting on you')

    // CONFIRM, IN CHINESE AND THEN IN ENGLISH. A row answered stays until the page is read again, so each language
    // gets its own pair of proposals.
    await page.goto(`${app.site}/?lang=zh#/`, { timeout: 60_000 })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('[data-resident-proposal]').first().locator('button', { hasText: '确认' }).click()
    await page.locator('[data-answered="confirm"] .resident-proposal-done').waitFor({ timeout: 30_000 })
    await picture('home-after-confirm', 'light', 1440, 'zh')
    await page.locator('[data-answered="no"]').first().locator('button', { hasText: '暂不' }).click()
    await page.locator('[data-answered="no"]').first().locator('button', { hasText: '确定暂不' }).click()
    await page.locator('[data-answered="decline"] .resident-proposal-done').waitFor({ timeout: 30_000 })
    await picture('home-after-not-now', 'light', 1440, 'zh')

    await propose('sorrel-test', 'Test: Sorrel reviews every plan.')
    await propose('ivy-test', 'Test: Ivy files the incidents.')
    await open('/', 'light', 1440)
    const sorrel = page.locator('[data-resident-proposal]', { hasText: 'Test agent Sorrel' })
    await sorrel.locator('button', { hasText: 'Confirm' }).click()
    const done = sorrel.locator('.resident-proposal-done')
    await done.waitFor({ timeout: 30_000 })
    expect(await done.innerText()).toMatch(/^Confirmed by you at .+\. Test agent Sorrel has a personal space now\.$/)
    for (const width of WIDTHS) for (const theme of THEMES) {
      await lookAgain(theme, width)
      await picture('home-after-confirm', theme, width, 'en')
    }
    // THE DOOR MADE THE SPACE: the resident's reading answers it, with the size used and the limit.
    const sorrelReading = await call('GET', `/api/residents/${agents.get('sorrel-test')!.id}`, asPerson())
    expect(sorrelReading['space'].mayRead).toBe(true)
    expect(typeof sorrelReading['space'].used).toBe('number')

    const ivy = page.locator('[data-resident-proposal]', { hasText: 'Test agent Ivy' })
    await ivy.locator('button', { hasText: 'Not now' }).click()
    await ivy.locator('textarea').fill('Test: not yet, ask again in a month.')
    await ivy.locator('button', { hasText: 'Say not now' }).click()
    const declined = ivy.locator('.resident-proposal-done')
    await declined.waitFor({ timeout: 30_000 })
    expect(await declined.innerText()).toBe('Not now is recorded. The secretary may propose Test agent Ivy again later.')
    // NO PROPOSAL WAITS ON THE PERSON NOW. What waits is the two reminders the two confirms left, one for each new
    // resident's picture and name, each drawn as a plain row that leads to the agent's page.
    // The project card, on the projects page, counts the same two.
    await expect
      .poll(async () => await needsYou(), { timeout: 30_000 })
      .toEqual({ count: '2', nothing: false, genericRows: 2 })
    const reminders = (await page.locator('.hm-needs-list > li').allInnerTexts()).map((one) => one.replace(/\s+/g, ' '))
    expect(reminders.filter((one) => /Choose a picture and a name for Test agent (Moth|Reed|Sorrel)/.test(one))).toHaveLength(2)
    await projectCardSays('2waiting on you')
    for (const width of WIDTHS) for (const theme of THEMES) {
      await lookAgain(theme, width)
      await picture('home-after-not-now', theme, width, 'en')
    }
    const list = await call('GET', '/api/residents', asPerson())
    expect(list['residents'].map((one: { handle: string }) => one.handle)).not.toContain('ivy-test')
  }, 600_000)
})

describe('the Embassy', () => {
  it('marks each resident’s row, counts them at the Agents heading, and draws the open proposal', async () => {
    await propose('yarrow-test', 'Test: Yarrow keeps the backups.')
    const residents = (await call('GET', '/api/residents', asPerson()))['residents'] as unknown[]
    await everyLook('embassy', async (theme, width, language) => {
      await open('/embassy', theme, width, language)
      await see('.emb-list')
      await see('.resident-proposal')
    })
    await open('/embassy', 'light', 1440)
    await see('.resident-proposal')
    // THE EMBASSY SHOWS CONTACTS FIRST; every citizen is asked for, so each resident's row is on the page.
    const showEveryone = page.locator('.emb-show', { hasText: 'Show everyone' })
    if ((await showEveryone.count()) > 0) await showEveryone.click()
    const live = residents.filter((one) => !(one as { retired: boolean }).retired).length
    expect(await page.locator('.emb-group[data-group="agent"] .resident-mark').count()).toBe(live)
    expect(await page.locator('.emb-resident-count').getAttribute('data-residents')).toBe(String(live))
    expect(await proposalTitles()).toEqual(['Make Test agent Yarrow a permanent resident of this office'])
  }, 600_000)
})

describe('the resident section', () => {
  /**
   * THE HARNESS IS SERVED FROM A SERVER OF ITS OWN ON LOOPBACK, because a page the browser was handed by the test
   * (page.route) is not on loopback, and the browser refuses it the API on loopback ("local network access").
   */
  let harnessServer: Server
  let harnessSite: string

  beforeAll(async () => {
    // THE SECTION ON A PAGE OF ITS OWN, from the component's source, against this office's API.
    const bundled = await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: 'r4-harness.tsx',
        loader: 'tsx',
        contents: `import './tests/a-page-of-a-test-office.ts';
          import React from 'react'; import {createRoot} from 'react-dom/client';
          import {setWordLanguage} from './src/shared/i18n.ts';
          import {theApiIsOnPort} from './src/web/lib/api-address.ts';
          import {api, setActor} from './src/web/api.ts';
          import {ResidentSection} from './src/web/components/ResidentSection.tsx';
          import {UI_CSS} from './src/web/components/ui.tsx';
          theApiIsOnPort(${String(app.apiPort)});
          const asked = new URLSearchParams(location.search);
          setWordLanguage(asked.get('lang') === 'zh' ? 'zh' : 'en');
          if (asked.get('as')) setActor({type: 'agent', id: asked.get('as')});
          api.participants().then((all) => {
            const agent = all.agents.find((one) => one.id === asked.get('agent'));
            createRoot(document.getElementById('test')).render(<><style>{UI_CSS}</style><ResidentSection agent={agent} /></>);
          }).catch((err) => { document.getElementById('test').textContent = 'HARNESS: ' + err.message + ' ' + (err.fault?.detail ?? ''); });`,
      },
      loader: { '.css': 'empty' },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    const script = bundled.outputFiles[0]!.text
    const style = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') + '\nbody { padding: var(--gut); }'
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      `<style>${style}</style></head><body><main id="test" class="page"></main><script type="module" src="/harness.js"></script></body></html>`
    harnessServer = createServer((req, res) => {
      if (req.url?.startsWith('/harness.js')) {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
        res.end(script)
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    await new Promise<void>((done) => harnessServer.listen(0, '127.0.0.1', done))
    harnessSite = `http://127.0.0.1:${String((harnessServer.address() as AddressInfo).port)}`
  }, 240_000)

  afterAll(async () => {
    // CLOSING WAITS FOR EVERY CONNECTION, and the browser, still open here, may hold one that has sent nothing, which
    // no idle close ends. So each is ended once the server has stopped taking new ones (problem 2mWb9nJCUUoA).
    await new Promise<void>((done) => {
      if (harnessServer === undefined) {
        done()
        return
      }
      harnessServer.close(() => done())
      harnessServer.closeAllConnections()
    })
  })

  async function section(agent: string, theme: 'light' | 'dark', width: number, language: string, asAgent?: string): Promise<void> {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: theme })
    const query = `agent=${agents.get(agent)!.id}&lang=${language}${asAgent === undefined ? '' : `&as=${asAgent}`}`
    await page.goto(`${harnessSite}/?${query}`, { timeout: 60_000 })
  }

  it('draws a resident’s space for the person: a void file, an earlier version, the origins and the grants', async () => {
    await everyLook('section-person', async (theme, width, language) => {
      await section('lark-test', theme, width, language)
      await see('[data-origin="read"]')
    })
    await section('lark-test', 'light', 1440, 'en')
    await see('[data-origin="read"]')
    expect(await page.locator('tr[data-file="memory/the-build-uses-node-20.md"] s.resident-path').count()).toBe(1)
    expect(await page.locator('tr[data-file="memory/the-build-uses-node-20.md"]').innerText()).toContain('void: Test: wrong, the office uses Node 22.')
    expect(await page.locator('tr[data-version=".versions/memory/who-i-am.md/1"]').count()).toBe(1)
    expect(await page.locator('[data-origin="read"]').count()).toBe(2)
    expect(await page.locator('[data-origin="read"]').first().innerText()).toContain('claude --resume test-conversation')
    expect(await page.locator('[data-grant="live"]').count()).toBe(1)
    expect(await page.locator('[data-grant="ended"]').count()).toBe(1)
    // AN EARLIER VERSION READS, AND SAYS WHAT IT HELD.
    await page.locator('tr[data-version=".versions/memory/who-i-am.md/1"] button', { hasText: 'Read' }).click()
    await expect.poll(async () => page.locator('.resident-text').innerText(), { timeout: 30_000 }).toContain('This is the first version.')
  }, 600_000)

  it('offers the person a successor press for a retired resident', async () => {
    await everyLook('section-retired', async (theme, width, language) => {
      await section('wren-test', theme, width, language)
      await see('.resident-successor-form, .resident-readers button')
      await page.locator('.resident-readers button').first().click()
      await page.locator('.resident-successor-form').waitFor({ state: 'visible', timeout: 30_000 })
    })
  }, 600_000)

  it('tells another agent only that the space is private', async () => {
    await everyLook('section-another-agent', async (theme, width, language) => {
      await section('lark-test', theme, width, language, 'yarrow-test')
      await see('[data-space="private"], .px-error, [role="alert"]')
    })
    await section('lark-test', 'light', 1440, 'en', 'yarrow-test')
    await see('[data-space="private"]')
    expect(await page.locator('tr[data-file]').count()).toBe(0)
  }, 600_000)
})
