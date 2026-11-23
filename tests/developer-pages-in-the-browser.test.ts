// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { patternFoundBy } from '../src/shared/ops.ts'
import { START_STEPS, TOKENS_ARE_WHOLE_START } from '../src/shared/start-cost.ts'
import type { World } from '../src/shared/worlds.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { WhatTheOfficeSays } from '../src/web/api.ts'
import type { FolderReading } from '../src/shared/folderreading.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { FOLDER_REJECTION_UNDO_MS } from '../src/shared/danger-tiers.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { type PageLanguage } from '../src/shared/i18n.ts'
import type { developerBrowser } from './developer-pages-browser.tsx'
import { missingAndNotWaiting, notWaitingForTranslation } from './words-waiting-for-translation.ts'

declare global { interface Window { g9: typeof developerBrowser } }
let app: LiveApp
let bundle: string
let server: Server | undefined
let bundleAt = ''
let readings: Record<string, any>
let emptyReadings: Record<string, any>
let draft: FolderReading
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const at = '2026-09-20 09:00:00'
const shots = process.env.W13Q_G9_SHOTS
const measurements: unknown[] = []
const pages = ['runtime', 'usage', 'worlds', 'worldhere', 'queries', 'folderreading'] as const
type PageName = (typeof pages)[number]
const headings = {
  runtime: 'dev.runtime.whatIsRunning', usage: 'nav.usage', worlds: 'nav.worlds',
  worldhere: 'dev.worldhere.thisWorld', queries: 'nav.queries',
  folderreading: 'dev.folderreading.aFolderAnAgentRead',
} as const

async function get(path: string) {
  const reply = await fetch(`${app.api}${path}`, { headers })
  expect(reply.status, await reply.clone().text()).toBe(200)
  return reply.json()
}

// Server prose is fixture content; structural words keep the branches they select.
function runtimeContent(value: any, key = ''): any {
  if (Array.isArray(value)) return value.map(one => runtimeContent(one, key))
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, one]) => [name, runtimeContent(one, name)]))
  if (typeof value !== 'string') return value
  if (['kind', 'state', 'status', 'stage', 'from', 'name'].includes(key)) return value
  if (/^\d{4}-\d\d-\d\d/.test(value)) return at
  if (value.startsWith('/')) return '/made-up/elm/reading'
  if (value.startsWith('http')) return 'http://elm.example:1234'
  return 'Fixture server content.'
}

function record(id: string, kind: PanelRecord['kind'], title: string): PanelRecord {
  return { id, kind, title, workspaceId: 'default', ownerId: 'elm-person', summary: null,
    createdAt: at, updatedAt: at, deletedAt: null, origin: 'fixture', data: { state: 'proposed' } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'developer-pages-g9', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const entries = await Promise.all([
    ['runtime', '/api/runtime'], ['usageSummary', '/api/usage/summary'], ['usageTraces', '/api/usage/traces'],
    ['usageOperations', '/api/usage/operations'], ['usageOutsideReads', '/api/usage/outside-reads'],
    ['usagePatterns', '/api/usage/patterns'], ['usageSequences', '/api/usage/sequences'],
    ['usageAgents', '/api/usage/agents'], ['workDomainOverlaps', '/api/work-domains/overlaps'],
    ['trustedMachines', '/api/office/trusted-machines'], ['officeLoad', '/api/office/load'],
  ].map(async ([name, path]) => [name, await get(path!)]))
  readings = Object.fromEntries(entries)
  readings.runtime = runtimeContent(readings.runtime)
  readings.runtime.fromOtherMachines = []
  const world: World = { id: 'elm-copy', name: 'Elm copy', purpose: 'Compare the made-up observatory notes.',
    kind: 'agent-made', startedBy: { kind: 'agent', id: 'elm-reader' }, checkout: '/made-up/elm',
    head: '1234567', databaseIdentity: 'elm-copy-database', address: 'http://127.0.0.1:1234',
    addressForOtherMachines: null, standing: 'scratch', parentWorld: 'elm-home', bornAt: at,
    diedAt: null, diedBecause: null, installation: 'elm-installation', handback: 'elm-report' }
  readings.worlds = { worlds: [
    { ...world, id: 'elm-home', name: 'Elm home', kind: 'home', purpose: null, databaseIdentity: 'elm-home-database' },
    world,
    { ...world, id: 'elm-old', name: 'Elm old copy', diedAt: at, diedBecause: 'The made-up review ended.' },
  ], from: 'the mirror', mirrorWrittenAt: at, mirrorFile: '/made-up/elm/mirror', mirrorNote: 'Fixture server content.',
  isTheOffice: false, theHomeRowBelongsTo: null, thisWorld: 'elm-copy-database', office: 'elm-home' } satisfies WhatTheOfficeSays
  readings.visits = { visits: [] }
  readings.unconsumed = { records: [record('elm-unused', 'claim', 'Elm result waiting for a reader')], counted: 1 }
  readings.unmet = [
    { consumer: record('elm-missing', 'claim', 'Elm observation missing an input'), missingTitle: 'A carefully named missing observation with enough words to fill the right column.' },
    { consumer: record('elm-task', 'task', 'Elm task waiting for the same observation'), missingTitle: 'A second missing observation with a deliberately long name for the narrow page.' },
  ]
  emptyReadings = structuredClone(readings)
  emptyReadings.unmet = []
  emptyReadings.unconsumed = { records: [], counted: 0 }
  readings.runtime.starts.recent = [
    { sessionId: 'elm-start', title: 'Elm reader start', cost: { measured: true, tokens: 16000, minutes: 3,
      over: ['tokens', 'minutes'], tokensSays: TOKENS_ARE_WHOLE_START,
      steps: START_STEPS.map((step, index) => ({ name: step.name, says: step.says, operations: step.operations,
        requests: index + 1, firstAt: at, lastAt: at, spentMs: index * 1100, tokens: null, tokensSays: TOKENS_ARE_WHOLE_START })) } },
    { sessionId: 'elm-unmeasured', title: 'Elm start without a measurement', cost: { measured: false, why: 'Fixture server content.' } },
  ]
  readings.runtime.starts.overCeilingCount = 1
  readings.runtime.starts.unmeasuredCount = 1
  readings.usageTraces.stretches = [{ traceId: 'elm-trace', seq: 0, purpose: 'reading', startedAt: at,
    minutes: 2, endedBecause: 'idle', calls: 4, reads: 3, writes: 1, refused: 1, bytes: 1500,
    distinctOperations: 2, outsideReads: 1, gapVerdicts: 1, localCalls: 1, remoteCalls: 2, unknownCalls: 1,
    actorId: 'elm-reader', sessionId: 'elm-start' }]
  readings.usageOperations.operations = [{ operation: 'elm.read', calls: 4, foldedCalls: 2, refused: 1,
    bytes: 1500, msMedian: 12, readBackShare: 0.5, readBackOf: 4 }]
  readings.usageOutsideReads.questions = [{ wanted: 'project-files', question: 'Where are the made-up notes?',
    answeredBy: null, boundary: 1, boundaryDisputed: 1, capabilityGap: 2, notFound: 1,
    machineNotRecorded: 1, unsure: 1, traces: 2 }]
  readings.usageOutsideReads.withNoWordYet = [{ what: 'A made-up unanswered question.', wantedOther: null, at }]
  readings.usagePatterns.patterns = [
    { key: 'chain:elm.read', crossed: true, saw: 10, needs: 5, traces: 3, needsTraces: 2, survivesPrune: true, says: 'Fixture pattern content.' },
    { key: 'gap:elm.missing', crossed: false, saw: 3, needs: 5, traces: 1, needsTraces: 2, survivesPrune: false, says: 'Fixture gap content.' },
  ]
  readings.usageSequences.sequences = [{ from: 'elm.read', to: 'elm.write', occurrences: 3, stretches: 2, traces: 2 }]
  const registration = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers,
    body: JSON.stringify({ handle: 'elm-reader', name: 'Elm reader' }) })
  expect(registration.status).toBe(201)
  const filed = await fetch(`${app.api}/api/import/draft`, { method: 'POST', headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'elm-reader' }, body: JSON.stringify({
    folder: '/made-up/elm-observatory', pieces: [0, 1].map(n => ({ kind: 'note', title: `Elm observation ${n}`,
      summary: 'A made-up observation for this page.', data: {}, from: ['NOTES.md'],
      quote: 'These are made-up words quoted from the observatory notes.' })),
  }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  draft = (await filed.json()).draft
  const built = await build({ entryPoints: ['tests/developer-pages-browser.tsx'], write: false, bundle: true, loader: { '.css': 'empty' },
    format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })
  bundle = built.outputFiles[0]!.text
  // THE BUNDLE IS SERVED OVER HTTP FROM THIS PROCESS, and each page fetches it, where it was handed to each page through
  // Playwright. It is a module from another port than the page's, so its answer allows any origin. Nothing is kept in
  // the browser's cache. Every other address answers 404, so nothing but the bundle comes from this port.
  const serving = createServer((asked, answer) => {
    if (asked.url !== '/developer-pages.js') {
      answer.writeHead(404, { 'content-type': 'text/plain' })
      answer.end('This test serves only the bundle.')
      return
    }
    answer.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
    answer.end(bundle)
  })
  await new Promise<void>((resolve) => serving.listen(0, '127.0.0.1', resolve))
  server = serving
  bundleAt = `http://127.0.0.1:${String((serving.address() as AddressInfo).port)}/developer-pages.js`
  if (shots) mkdirSync(shots, { recursive: true })
}, 180_000)

afterAll(async () => {
  if (shots) writeFileSync(join(shots, 'measurements.json'), JSON.stringify(measurements, null, 2))
  await app?.stop()
  const serving = server
  serving?.closeAllConnections()
  if (serving !== undefined) await new Promise<void>((resolve) => serving.close(() => resolve()))
})

// liveApp owns the browser and server. This helper opens a tab in that browser.
async function open(theme = 'light', language: PageLanguage = 'xx'): Promise<{ page: Page; context: BrowserContext }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  // The page below is written by a route, so the browser does not count it as on this computer, and it refuses the
  // page a script from another port of this computer unless the page's origin may reach the local network. Other
  // tests grant the same for the page they open.
  await context.grantPermissions(['local-network-access'], { origin: app.api })
  await context.addInitScript(theme => localStorage.setItem('mole-office.preset.theme', theme), theme)
  const page = await context.newPage()
  page.setDefaultTimeout(8_000)
  page.on('pageerror', error => { throw error })
  await page.route('**' + '/g9-pages*', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test" style="padding:var(--gut);max-width:1400px;margin:auto"></main></body></html>' }))
  await page.goto(`${app.api}/g9-pages?lang=${language}`)
  await page.addStyleTag({ content: readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8') +
    readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '') })
  await page.evaluate(fixtures => { (window as any).g9Fixtures = fixtures }, { port: app.apiPort, address: app.api, readings, emptyReadings })
  await page.addScriptTag({ type: 'module', url: bundleAt })
  await page.waitForFunction(() => Boolean(window.g9))
  return { page, context }
}

async function draw(page: Page, name: PageName, language: PageLanguage, inspect = false, empty = false) {
  await page.evaluate(({ name, language, inspect, empty }) => window.g9.draw(name, language, inspect, empty), { name, language, inspect, empty })
  try {
    await page.waitForFunction(() => document.querySelectorAll('.px-loading').length === 0 && document.querySelector('.px-panel') !== null)
  } catch (error) { throw new Error(await page.locator('#test').innerText(), { cause: error }) }
  await expect.poll(() => page.locator('#test').innerText()).not.toMatch(/Reading|⟦Loading|正在读取/)
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsIn)
  return []
}

async function scan(page: Page) {
  const allowed = [...stringsIn(readings), ...stringsIn(emptyReadings), ...stringsIn(draft), 'elm.read', 'elm.missing', patternFoundBy('chain:elm.read')]
  return page.evaluate(allowed => {
    // These shared components belong to later pieces; their page titles stay in the scan.
    const outside = '[data-target="uiSurface/worlds.trusted"] .px-panel-body, [data-testid="receipt-totals"], .px-explain summary, .pxc-data summary, .pxc-data th:first-child, .pxc desc, .px-stamp, .px-origin, .px-origin-note'
    const unmarked = (text: string) => {
      let depth = 0, result = ''
      for (const char of text) {
        if (char === '⟦') depth++
        else if (char === '⟧') depth--
        else if (depth === 0) result += char
      }
      for (const content of allowed.sort((a, b) => b.length - a.length)) if (content) result = result.split(content).join('')
      return result.replace(/[^\p{L}]/gu, '')
    }
    const leaks: string[] = []
    const walker = document.createTreeWalker(document.querySelector('#test')!, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const parent = node.parentElement!
      if (parent.closest('style,script') || parent.closest(outside)) continue
      if (unmarked(node.textContent ?? '')) leaks.push(node.textContent ?? '')
    }
    for (const node of document.querySelectorAll<HTMLElement>('#test [title],#test [aria-label],#test [placeholder]')) {
      if (node.closest(outside + ', .rid-text, .px-chip, .px-tag')) continue
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const text = node.getAttribute(attr)
        if (text && unmarked(text)) leaks.push(`${attr}: ${text}`)
      }
    }
    return { leaks, words: window.g9.check() }
  }, allowed)
}

it.each(pages)('%s draws its words from both lists without a fallback and keeps content as written', async name => {
  const { page, context } = await open()
  try {
    await draw(page, name, 'xx')
    expect(await page.locator('h1').innerText()).toMatch(/^⟦.+·⟧$/)
    const checked = await scan(page)
    expect(checked.leaks).toEqual([])
    expect(missingAndNotWaiting(checked.words.missingByLanguage)).toEqual({ en: [], zh: [] })
    expect(checked.words.fallbacks).toEqual([])
    if (name === 'worlds' || name === 'worldhere') {
      // THE WORLDS PAGE A WORLD SERVED HAS NO STOP, and these readings are a world's. A page on a trip was served by
      // the office and keeps its Stop, so the Worlds page is put on a trip before its Stop is pressed.
      if (name === 'worlds') {
        await page.evaluate(() => window.g9.away())
        await draw(page, name, 'xx')
      }
      await page.getByRole('button', { name: /Stop/ }).first().click()
      await expect.poll(() => page.getByRole('dialog').isVisible()).toBe(true)
      expect((await scan(page)).leaks).toEqual([])
      await page.keyboard.press('Escape')
    }
    if (name === 'folderreading') {
      await page.getByRole('button', { name: /Edit the title/ }).first().click()
      expect((await scan(page)).leaks).toEqual([])
    }
    await draw(page, name, 'xx', false, true)
    expect((await scan(page)).leaks).toEqual([])
    await draw(page, name, 'xx')
    if (shots) await page.screenshot({ path: join(shots, `${name}-1440-light-xx.png`), fullPage: true })
    await draw(page, name, 'zh')
    expect(await page.locator('h1').innerText()).toBe(zh[headings[name]])
    expect(notWaitingForTranslation((await page.evaluate(() => window.g9.check().fallbacks)).map((one) => one.key))).toEqual([])
    if (name === 'folderreading') expect(await page.locator('.fr-title').first().innerText()).toBe('Elm observation 0')
    if (name === 'queries') expect(await page.locator('.px-row-title').first().innerText()).toContain('Elm observation')
    if (shots) {
      for (const theme of ['light']) for (const language of ['en', 'zh'] as const) {
        const { page: picture, context: pictures } = await open(theme, language)
        try {
          for (const width of language === 'zh' ? [1440] : [1440, 390]) {
            await picture.setViewportSize({ width, height: 1000 })
            await draw(picture, name, language)
            const file = `${name}-${width}-${theme}-${language}.png`
            const size = await picture.evaluate(() => ({ width: innerWidth, drawn: document.documentElement.scrollWidth }))
            measurements.push({ file, ...size })
            await picture.screenshot({ path: join(shots, file), fullPage: true })
          }
        } finally { await pictures.close() }
      }
    }
  } finally { await context.close() }
}, 60_000)

it.each(['worlds', 'worldhere'] as const)('%s asks before Stop, names the world, and cancels without an act', async name => {
  const { page, context } = await open()
  try {
    // A WORLDS PAGE A WORLD SERVED HAS NO STOP, and these readings are a world's, so the Worlds page is on a trip: a page
    // on a trip was served by the office and keeps its Stop.
    if (name === 'worlds') await page.evaluate(() => window.g9.away())
    await draw(page, name, 'en')
    const label = name === 'worlds' ? en['dev.worlds.stop'] : en['dev.worldhere.stop']
    const press = page.getByRole('button', { name: label, exact: true }).first()
    await press.click()
    const dialog = page.getByRole('dialog')
    await expect.poll(() => dialog.isVisible()).toBe(true)
    expect(await dialog.locator('blockquote').innerText()).toBe('Elm copy')
    expect(await page.evaluate(() => window.g9.stops)).toEqual([])
    await dialog.getByRole('button', { name: en['dev.worlds.cancel'], exact: true }).click()
    expect(await dialog.count()).toBe(0)
    await press.click()
    await page.keyboard.press('Escape')
    expect(await dialog.count()).toBe(0)
    expect(await page.evaluate(() => window.g9.stops)).toEqual([])
    await press.click()
    await dialog.getByRole('button', { name: label, exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.g9.stops)).toEqual(['elm-copy'])
  } finally { await context.close() }
})

it('Reject offers Undo immediately, restores the proposal through the server, and expires on the page', async () => {
  const { page, context } = await open()
  try {
    await draw(page, 'folderreading', 'en')
    const row = page.locator(`[data-piece="${draft.pieces[0]!.id}"]`)
    const state = async () => (await get('/api/import/drafts')).drafts.find((one: FolderReading) => one.id === draft.id).pieces[0].state
    await row.getByRole('button', { name: en['dev.folderreading.reject'], exact: true }).click()
    expect(await page.getByRole('dialog').count()).toBe(0)
    await expect.poll(state).toBe('rejected')
    const undo = row.getByRole('button', { name: /^Undo/ })
    await expect.poll(() => undo.isVisible()).toBe(true)
    await undo.click()
    await expect.poll(state).toBe('proposed')
    await expect.poll(() => undo.count()).toBe(0)
    await page.clock.install()
    await row.getByRole('button', { name: en['dev.folderreading.reject'], exact: true }).click()
    await expect.poll(() => undo.isVisible()).toBe(true)
    await page.clock.fastForward(FOLDER_REJECTION_UNDO_MS + 100)
    await expect.poll(() => undo.count()).toBe(0)
    expect(await state()).toBe('rejected')
  } finally { await context.close() }
})

it('leaving the title edit asks nothing and discards only the unfiled edit', async () => {
  const { page, context } = await open()
  try {
    await draw(page, 'folderreading', 'en')
    const row = page.locator(`[data-piece="${draft.pieces[1]!.id}"]`)
    await row.getByRole('button', { name: en['dev.folderreading.editTitle'], exact: true }).click()
    await row.locator('textarea').fill('An unfiled edit')
    await row.getByRole('button', { name: en['dev.folderreading.leaveTitle'], exact: true }).click()
    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(await row.locator('textarea').count()).toBe(0)
    await row.getByRole('button', { name: en['dev.folderreading.editTitle'], exact: true }).click()
    expect(await row.locator('textarea').inputValue()).toBe('Elm observation 1')
  } finally { await context.close() }
})

it('Return home ends the visit with one press and no confirmation', async () => {
  const { page, context } = await open()
  try {
    await page.evaluate(() => window.g9.away())
    await draw(page, 'worlds', 'en')
    await page.getByRole('button', { name: en['dev.worlds.returnHome'], exact: true }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('g9-returned'))).toBe('yes')
    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(await page.evaluate(() => localStorage.getItem('mole-office.visiting'))).toBe(null)
  } finally { await context.close() }
})

it('Missing and unused gives every title at least eight characters at 660 pixels', async () => {
  const { page, context } = await open()
  try {
    await page.setViewportSize({ width: 660, height: 1000 })
    await draw(page, 'queries', 'en')
    const widths = await page.locator('.px-row-main').evaluateAll(nodes => nodes.map(node => {
      const context = document.createElement('canvas').getContext('2d')!
      context.font = getComputedStyle(node).font
      return { width: node.getBoundingClientRect().width, eight: context.measureText('00000000').width }
    }))
    expect(widths.length).toBeGreaterThan(1)
    for (const one of widths) expect(one.width).toBeGreaterThanOrEqual(one.eight)
    if (shots) writeFileSync(join(shots, 'title-widths-660.json'), JSON.stringify(widths, null, 2))
  } finally { await context.close() }
})
