// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Browser isolation, declared views and worker boundaries stay in a real frame. Refusal wording
 * and sidebar labels render the production components with one office reading. The readiness
 * case advances the browser clock through the shipped ten-second interval.
 */

import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Frame, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createI18n, setWordLanguage, type WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PLUGIN_READY_WITHIN_MS, whyAPluginHasNoPage, type PluginReading, type PluginsReading } from '../src/shared/plugins.ts'
import { chineseWords, englishWords } from '../src/shared/words/joined.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

let app: LiveApp
let componentPage: Page
let pluginReading: PluginsReading
let noPage: typeof import('../src/web/pages/PluginPage.tsx')
let sidebar: typeof import('../src/web/components/Sidebar.tsx')
let mode: typeof import('../src/web/lib/mode.ts')
const en = englishWords()
/**
 * THE CHINESE A PAGE DRAWS, read through the page's own reader so the values and the office's spacing are the page's.
 * The word must be in zh.ts: a key that is missing would read back in English, and this file must not pass that as
 * Chinese.
 */
const zhAsWritten = chineseWords() as unknown as Record<string, string | undefined>
function inChinese(key: string, values: Record<string, string> = {}): string {
  expect(zhAsWritten[key], `zh.ts has no word for ${key}`).toBeDefined()
  return createI18n('zh').t(key as WordKey, values)
}
const scratch = aTestDatabaseFolder('plugin-slot')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_PANEL = '[data-target="uiSurface/plugins.page"]'
const THE_FRAME = `${THE_PANEL} iframe.plgp-frame`

/** One of the office's sentences with its blanks filled in, as the page draws it. */
function said(key: keyof typeof en, blanks: Record<string, string> = {}): string {
  return Object.entries(blanks).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), String(en[key]))
}

/*
 * THE MADE-UP PLUGIN'S OWN FILES. Its script tries each thing a page in the frame must not reach and writes down what
 * happened, says it is ready, and keeps every message the slot sends it in `window.told`. On its first context it reads
 * the projects and lists them, which is what the pictures show.
 *
 * IT STARTS THREE WORKERS and keeps what became of each in `window.workers`: one from a blob: address it made, which
 * tries what the page tried and posts back what it reached, and one each from a data: address and from the plugin's
 * own file, which only post that they started. 'refused' is a throw, a rejection or an error event, 'absent' is a
 * store the worker does not have at all, and 'no answer' is a worker that said nothing in five seconds.
 */
const THE_SCRIPT = `
const INTERFACE = 'office-read/1'
const told = []
const probes = {}
window.told = told
window.probes = probes
const show = () => { document.getElementById('probes').textContent = 'What this page could reach: ' + JSON.stringify(probes) }
const tryIt = (name, read) => { try { probes[name] = String(read()) } catch { probes[name] = 'refused' } }
probes.origin = String(self.origin)
tryIt('parent', () => window.parent.document.title)
tryIt('top', () => window.top.location.href)
tryIt('cookie', () => document.cookie)
tryIt('storage', () => window.localStorage.length)
show()
fetch('/api/plugins').then(() => { probes.fetch = 'answered' }, () => { probes.fetch = 'refused' }).finally(show)
const workers = {}
window.workers = workers
function theWorker(page) {
  const settle = (there, start) => {
    if (!there) return Promise.resolve('absent')
    try { return Promise.resolve(start()).then(() => 'reached', () => 'refused') } catch { return Promise.resolve('refused') }
  }
  const opened = (asking) => new Promise((done, failed) => { asking.onsuccess = done; asking.onerror = failed })
  const names = ['office', 'ownFile', 'indexedDB', 'caches', 'fileSystem', 'importOwn', 'importOutside']
  Promise.all([
    settle(true, () => fetch(new URL('/api/plugins', page))),
    settle(true, () => fetch(new URL('assets/look.css', page))),
    settle('indexedDB' in self, () => opened(self.indexedDB.open('made-up'))),
    settle('caches' in self, () => self.caches.open('made-up')),
    settle('storage' in navigator, () => navigator.storage.getDirectory()),
    settle(true, () => { importScripts(new URL('assets/made-up-lib.js', page).href); if (self.madeUpLib !== 'loaded') throw new Error('not run') }),
    settle(true, () => { importScripts(new URL('/api/plugins/made-up-silent/files/assets/made-up-elsewhere.js', page).href); if (self.madeUpElsewhere !== 'loaded') throw new Error('not run') }),
  ]).then((settled) => {
    const reached = { origin: String(self.origin), secureContext: String(self.isSecureContext) }
    names.forEach((name, at) => { reached[name] = settled[at] })
    postMessage(reached)
  })
}
const startAWorker = (name, address) => {
  const done = (what) => { if (workers[name] === undefined) workers[name] = what }
  window.setTimeout(() => done('no answer'), 5000)
  try {
    const worker = new Worker(address)
    worker.addEventListener('message', (event) => { done(event.data); worker.terminate() })
    worker.addEventListener('error', () => { done('refused'); worker.terminate() })
  } catch {
    done('refused')
  }
}
startAWorker('blob', URL.createObjectURL(new Blob(['(' + theWorker.toString() + ')(' + JSON.stringify(location.href) + ')'], { type: 'text/javascript' })))
startAWorker('data', 'data:text/javascript,postMessage("started")')
startAWorker('file', new URL('assets/worker.js', location.href).href)
let asked = false
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  told.push(event.data)
  const message = event.data
  if (message.kind === 'context') {
    document.documentElement.dataset.theme = message.theme
    document.getElementById('context').textContent = 'The office says: language ' + message.language + ', theme ' + message.theme + ', project ' + message.project + '.'
    if (!asked) {
      asked = true
      window.parent.postMessage({ interface: INTERFACE, ask: 'read', id: 'shown', view: 'projects' }, '*')
    }
  }
  if (message.kind === 'answer' && message.id === 'shown' && message.status === 200) {
    document.getElementById('projects').replaceChildren(...message.body.projects.map((project) => {
      const row = document.createElement('li')
      row.textContent = project.name + ' (' + project.id + ')'
      return row
    }))
  }
})
window.parent.postMessage({ interface: INTERFACE, ask: 'ready' }, '*')
`

const THE_LOOK = `
:root { color-scheme: light; --made-up-bg: #fbfaf7; --made-up-text: #1d1d1b; --made-up-line: #d8d4ca; }
:root[data-theme="dark"] { color-scheme: dark; --made-up-bg: #1b1c1f; --made-up-text: #ecebe6; --made-up-line: #3a3b40; }
body { margin: 0; padding: 16px; background: var(--made-up-bg); color: var(--made-up-text); font: 14px/1.5 system-ui, sans-serif; }
h1 { margin: 0 0 8px; font-size: 18px; }
#probes { white-space: pre-wrap; overflow-wrap: anywhere; border-top: 1px solid var(--made-up-line); padding-top: 8px; font-size: 12px; }
`

function aPage(title: string, withScript: boolean): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${title}</title>`,
    '<link rel="stylesheet" href="assets/look.css">',
    withScript ? '<script type="module" src="assets/app.js"></script>' : '',
    '</head><body>',
    `<h1>${title}</h1>`,
    '<p>A made-up plugin, drawn for a test. It is not a real plugin, and what it lists is what the slot read for it.</p>',
    '<p id="context">Waiting for the office.</p>',
    '<ul id="projects"></ul>',
    '<p id="probes"></p>',
    '</body></html>',
  ].join('\n')
}

function putAPlugin(id: string, manifest: object, files: Record<string, string>): void {
  mkdirSync(join(scratch, 'plugins', id, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(scratch, 'plugins', id, 'plugin.json'), JSON.stringify(manifest))
  for (const [path, text] of Object.entries(files)) writeFileSync(join(scratch, 'plugins', id, 'dist', path), text)
}

function aManifest(id: string, name: string, pages: { slug: string; title: string }[]): object {
  return {
    id,
    name: { en: name },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: pages.map((one) => ({ slug: one.slug, title: { en: one.title } })),
    reads: ['projects'],
    budget: { builtKilobytes: 20 },
  }
}

async function switchIt(id: string, on: boolean): Promise<void> {
  const res = await fetch(`${app.api}/api/plugins/${id}/switch`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify({ on }) })
  expect(res.status, await res.clone().text()).toBe(200)
}

/** The office's own reading of one made-up plugin, one id at a time, as GET /api/plugins answers it. */
async function theReadingOf(id: string): Promise<PluginReading> {
  const res = await fetch(`${app.api}/api/plugins`, { headers: AS_THE_OWNER })
  expect(res.status, await res.clone().text()).toBe(200)
  const reading = (await res.json()) as PluginsReading
  const plugin = reading.plugins.find((one) => one.id === id)
  if (plugin === undefined) throw new Error(`The office has no reading for the made-up plugin "${id}".`)
  return plugin
}

async function open(path: string, mode: 'normal' | 'inspect' = 'normal', language: 'en' | 'zh' = 'en'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${language}&mode=${mode}#${path}`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
}

/** Render the actual refusal component using the office's reading, in either language or mode. */
async function componentOpen(path: string, view: 'normal' | 'inspect' = 'normal', language: 'en' | 'zh' = 'en') {
  const [, , id, slug] = path.split('/')
  const why = whyAPluginHasNoPage(pluginReading, id!, slug!)
  if (why === null) throw new Error('This component fixture needs an address with no page.')
  setWordLanguage(language)
  mode.setMode(view)
  await componentPage.setContent(renderToStaticMarkup(h(noPage.NoPage, {
    id: id!, slug: slug!, plugin: pluginReading.plugins.find(one => one.id === id), why,
  })))
}

/** The frame's document, once the page in it has said it is ready and been told its context. */
async function theFramesPage(): Promise<Frame> {
  const element = await app.page.waitForSelector(THE_FRAME, { timeout: 20_000 })
  const frame = await element.contentFrame()
  if (frame === null) throw new Error('The plugin frame has no document.')
  await frame.waitForFunction(() => (window as unknown as { told?: { kind: string }[] }).told?.some((one) => one.kind === 'context') === true, undefined, { timeout: 20_000 })
  return frame
}

/** Every message the slot has sent the page in the frame. */
async function told(frame: Frame): Promise<Record<string, unknown>[]> {
  return frame.evaluate(() => (window as unknown as { told: Record<string, unknown>[] }).told)
}

/** The page in the frame asks the slot, and the answer with that id is waited for. */
async function ask(frame: Frame, message: Record<string, unknown>, id: string | null): Promise<Record<string, unknown>> {
  await frame.evaluate((one) => {
    window.parent.postMessage(one, '*')
  }, message)
  await frame.waitForFunction((wanted) => (window as unknown as { told: { id?: unknown }[] }).told.some((one) => one.id === wanted), id, { timeout: 20_000 })
  const all = await told(frame)
  const answer = all.filter((one) => one['id'] === id).at(-1)
  if (answer === undefined) throw new Error(`No answer with the id ${String(id)}.`)
  return answer
}

async function photograph(name: string): Promise<void> {
  const dir = process.env['PLUGIN_SLOT_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      // THE SIDEBAR'S PLUGIN ROWS are below the other groups, so they are scrolled into the picture where it shows them.
      await app.page.evaluate(() => document.querySelector('[data-group="plugins"]')?.scrollIntoView({ block: 'nearest' }))
      // THE PAGE IN THE FRAME REDRAWS IN THE THEME IT IS TOLD, so the picture waits for the slot to tell it.
      await app.page.waitForTimeout(400)
      await app.page.screenshot({ path: `${dir}/${name}-${String(width)}-${theme}.png` })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  putAPlugin('made-up-clock', aManifest('made-up-clock', 'Made-up clock', [{ slug: 'main', title: 'Main' }, { slug: 'week', title: 'Week' }]), {
    'main.html': aPage('Made-up clock', true),
    'week.html': aPage('Made-up clock, the week', true),
    'assets/app.js': THE_SCRIPT,
    'assets/look.css': THE_LOOK,
    'assets/worker.js': 'postMessage("started")',
    'assets/made-up-lib.js': 'self.madeUpLib = "loaded"',
  })
  // NEVER SAYS IT IS READY: its page has no script. Its made-up-elsewhere.js is loaded by no page of its own; it is
  // there only for made-up-clock's worker to try (case 8).
  putAPlugin('made-up-silent', aManifest('made-up-silent', 'Made-up silent page', [{ slug: 'main', title: 'Main' }]), {
    'main.html': aPage('Made-up silent page', false),
    'assets/look.css': THE_LOOK,
    'assets/made-up-elsewhere.js': 'self.madeUpElsewhere = "loaded"',
  })
  // NOT BUILT: a manifest and no page file.
  putAPlugin('made-up-unbuilt', aManifest('made-up-unbuilt', 'Made-up unbuilt plugin', [{ slug: 'main', title: 'Main' }]), {})
  // OFF, because nobody has switched it on.
  putAPlugin('made-up-calendar', aManifest('made-up-calendar', 'Made-up calendar', [{ slug: 'month', title: 'Month' }]), {
    'month.html': aPage('Made-up calendar', true),
    'assets/app.js': THE_SCRIPT,
    'assets/look.css': THE_LOOK,
  })
  // REFUSED: it names no version.
  const broken = aManifest('made-up-broken', 'Made-up broken plugin', [{ slug: 'main', title: 'Main' }]) as Record<string, unknown>
  delete broken['version']
  putAPlugin('made-up-broken', broken, { 'main.html': aPage('Made-up broken plugin', true) })
  // REFUSED: a good plugin kept outside the plugins folder, and a link to it inside.
  const away = join(scratch, 'away', 'made-up-linked')
  mkdirSync(join(away, 'dist'), { recursive: true })
  writeFileSync(join(away, 'plugin.json'), JSON.stringify(aManifest('made-up-linked', 'Made-up linked plugin', [{ slug: 'main', title: 'Main' }])))
  writeFileSync(join(away, 'dist', 'main.html'), aPage('Made-up linked plugin', false))
  symlinkSync(join('..', 'away', 'made-up-linked'), join(scratch, 'plugins', 'made-up-linked'))
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  app = await liveApp({ name: 'plugin-slot', viewport: { width: 1440, height: 1000 } })
  for (const id of ['made-up-clock', 'made-up-silent', 'made-up-unbuilt']) await switchIt(id, true)
  const reading = await fetch(`${app.api}/api/plugins`, { headers: AS_THE_OWNER })
  expect(reading.status).toBe(200)
  pluginReading = await reading.json() as PluginsReading
  componentPage = await app.page.context().newPage()
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) } }
  vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage,
    location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} })
  vi.doMock('../src/web/components/ui.tsx', async importOriginal => ({
    ...await importOriginal<typeof import('../src/web/components/ui.tsx')>(),
    useAsync: () => [{ status: 'ready', value: pluginReading }, () => {}],
  }))
  noPage = await import('../src/web/pages/PluginPage.tsx')
  sidebar = await import('../src/web/components/Sidebar.tsx')
  mode = await import('../src/web/lib/mode.ts')
}, 240_000)

afterAll(async () => {
  await componentPage?.close()
  vi.doUnmock('../src/web/components/ui.tsx')
  vi.unstubAllGlobals()
  setWordLanguage('en')
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  rmSync(scratch, { recursive: true, force: true })
}, 60_000)

describe('a plugin page is drawn in a frame that holds no key', () => {
  it('1. draws the page under its title in a frame sandboxed to scripts alone, which reaches nothing of the office', async () => {
    await open('/plugin/made-up-clock/main')
    const frame = await theFramesPage()
    expect(await app.page.$eval('.plgp-title', (el) => el.textContent ?? '')).toBe('Main')
    expect(await app.page.$eval(`${THE_PANEL} .px-panel-title`, (el) => (el.textContent ?? '').trim())).toBe('Made-up clock')
    const drawn = await app.page.$eval(THE_FRAME, (el) => ({
      sandbox: el.getAttribute('sandbox'),
      referrer: el.getAttribute('referrerpolicy'),
      title: el.getAttribute('title'),
      src: el.getAttribute('src'),
    }))
    expect(drawn).toEqual({
      sandbox: 'allow-scripts',
      referrer: 'no-referrer',
      title: said('pluginPage.frameName', { name: 'Made-up clock', page: 'Main' }),
      src: `${app.api}/api/plugins/made-up-clock/files/main.html`,
    })

    await frame.waitForFunction(() => (window as unknown as { probes: { fetch?: string } }).probes.fetch !== undefined, undefined, { timeout: 20_000 })
    const probes = await frame.evaluate(() => (window as unknown as { probes: Record<string, string> }).probes)
    expect(probes).toEqual({ origin: 'null', parent: 'refused', top: 'refused', cookie: 'refused', storage: 'refused', fetch: 'refused' })
    const served = await app.page.request.get(`${app.api}/api/plugins/made-up-clock/files/main.html`)
    expect(served.headers()['content-security-policy']).toContain("connect-src 'none'")
  }, 120_000)

  it('2. tells the page its context, reads only the views its manifest names, and answers nothing but the frame', async () => {
    await open('/plugin/made-up-clock/main')
    const frame = await theFramesPage()
    const context = (await told(frame)).find((one) => one['kind'] === 'context')
    expect(context).toEqual({
      interface: 'office-read/1',
      kind: 'context',
      plugin: 'made-up-clock',
      page: 'main',
      language: 'en',
      theme: 'light',
      reducedMotion: false,
      project: 'default',
    })
    // THE PAGE'S OWN FIRST READ, so that the next one is not refused as a second asking of the same view.
    await frame.waitForFunction(() => (window as unknown as { told: { id?: string }[] }).told.some((one) => one.id === 'shown'), undefined, { timeout: 20_000 })

    const first = await ask(frame, { interface: 'office-read/1', ask: 'read', id: 'first', view: 'projects' }, 'first')
    expect(first).toMatchObject({ kind: 'answer', view: 'projects', status: 200 })
    expect(typeof first['tag']).toBe('string')
    expect((first['body'] as { projects: { id: string }[] }).projects.map((one) => one.id)).toContain('default')

    const again = await ask(frame, { interface: 'office-read/1', ask: 'read', id: 'again', view: 'projects', tag: first['tag'] }, 'again')
    expect(again).toMatchObject({ kind: 'answer', view: 'projects', status: 304, tag: first['tag'], body: null })

    const people = await ask(frame, { interface: 'office-read/1', ask: 'read', id: 'people', view: 'people' }, 'people')
    expect(people).toMatchObject({ kind: 'refused', view: 'people', why: 'not-in-the-manifest' })
    const secrets = await ask(frame, { interface: 'office-read/1', ask: 'read', id: 'secrets', view: 'secrets' }, 'secrets')
    expect(secrets).toMatchObject({ kind: 'refused', view: 'secrets', why: 'not-a-view' })
    const nonsense = await ask(frame, { hello: 'office' }, null)
    expect(nonsense).toMatchObject({ kind: 'refused', why: 'not-understood' })

    // A MESSAGE FROM ANOTHER WINDOW IS NOT ANSWERED. The office's own page asks first; the frame's asking of the same
    // view right after is answered, and nothing ever answers the other.
    await app.page.evaluate(
      () =>
        new Promise<void>((done) => {
          window.postMessage({ interface: 'office-read/1', ask: 'read', id: 'not-the-frame', view: 'projects' }, '*')
          window.setTimeout(done, 50)
        }),
    )
    const after = await ask(frame, { interface: 'office-read/1', ask: 'read', id: 'after', view: 'projects' }, 'after')
    expect(after).toMatchObject({ kind: 'answer', status: 200 })
    await app.page.waitForTimeout(500)
    expect((await told(frame)).filter((one) => one['id'] === 'not-the-frame')).toEqual([])

    // TOLD AGAIN when the theme and the motion change.
    await app.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await frame.waitForFunction(
      () => (window as unknown as { told: { kind: string; theme?: string; reducedMotion?: boolean }[] }).told.some((one) => one.kind === 'context' && one.theme === 'dark' && one.reducedMotion === true),
      undefined,
      { timeout: 20_000 },
    )
    await app.page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
    // ONE DOCUMENT, so the page was never taken for one that moved.
    expect(await app.page.$$('.plgp-moved')).toHaveLength(0)
    await photograph('plugin-page')
  }, 180_000)

  // Test change (wave 13y round 165): a plugin's pages are listed in a group of their own on the All pages page, not in
  // the sidebar, and a plugin page on screen lights the All pages entry, as every page listed there does.
  it('3. has a row on All pages for each page of a plugin that is on, and lights All pages on a plugin page', async () => {
    setWordLanguage('en')
    await componentPage.setContent(renderToStaticMarkup(h(() => h(sidebar.PluginPages, { plugins: sidebar.usePluginPageRows() }))))
    const rows = await componentPage.$$eval('[data-group="plugins"] a.ap-page', (links) =>
      links.map((one) => ({ label: one.textContent ?? '', href: one.getAttribute('href') })),
    )
    expect(rows).toEqual([
      { label: said('pluginPage.frameName', { name: 'Made-up clock', page: 'Main' }), href: '#/plugin/made-up-clock/main' },
      { label: said('pluginPage.frameName', { name: 'Made-up clock', page: 'Week' }), href: '#/plugin/made-up-clock/week' },
      { label: 'Made-up silent page', href: '#/plugin/made-up-silent/main' },
      { label: 'Made-up unbuilt plugin', href: '#/plugin/made-up-unbuilt/main' },
    ])
    expect(await componentPage.$eval('[data-group="plugins"] .ap-cap', (el) => el.textContent ?? '')).toBe(en['pluginPage.sidebar'])
    await open('/plugin/made-up-clock/week')
    await app.page.waitForSelector('#shell-side a.shell-link.shell-all-pages[aria-current="true"]', { state: 'attached', timeout: 20_000 })
    expect(await app.page.$$('#shell-side a.shell-link:not(.shell-all-pages)[aria-current]')).toHaveLength(0)
  }, 120_000)

  // Test change (as decided, the page draws no explanation): the state is the plugin's name and a short state word,
  // where it was a sentence saying why.
  it('4. draws the plugin and a short state word for an address with no page, and draws no frame', async () => {
    const cases: { path: string; state: string; reason?: string; toSettings: boolean; pages?: string[] }[] = [
      { path: '/plugin/made-up-calendar/month', state: `Made-up calendar · ${said('pluginState.neverSwitchedOn')}`, toSettings: true },
      { path: '/plugin/made-up-broken/main', state: `made-up-broken · ${said('pluginState.refused')}`, reason: 'version', toSettings: true },
      { path: '/plugin/made-up-linked/main', state: `made-up-linked · ${said('pluginState.refused')}`, reason: 'is a link to another place', toSettings: true },
      { path: '/plugin/made-up-nothing/main', state: `made-up-nothing · ${said('pluginState.notFound')}`, toSettings: false },
      { path: '/plugin/made-up-clock/year', state: `Made-up clock · ${said('pluginPage.state.noSuchPage', { slug: 'year' })}`, toSettings: false, pages: ['Main', 'Week'] },
    ]
    for (const one of cases) {
      await componentOpen(one.path)
      await componentPage.waitForSelector('.plgp-none', { timeout: 20_000 })
      expect(await componentPage.$eval('.plgp-none h1', (el) => el.textContent ?? ''), one.path).toBe(en['pluginPage.noPage'])
      expect(await componentPage.$eval('.plgp-state', (el) => el.textContent ?? ''), one.path).toBe(one.state)
      if (one.reason !== undefined) expect(await componentPage.$eval('.plgp-reason', (el) => el.textContent ?? ''), one.path).toContain(one.reason)
      expect((await componentPage.$$('.plgp-way a')).length, one.path).toBe(one.toSettings ? 1 : 0)
      if (one.pages !== undefined) expect(await componentPage.$$eval('.plgp-pages a', (links) => links.map((a) => a.textContent ?? '')), one.path).toEqual(one.pages)
      expect(await componentPage.$$('iframe'), one.path).toHaveLength(0)
    }
  }, 180_000)

  it('4b. says a refused plugin\'s reason in plain words, and draws the raw text only in Developer mode', async () => {
    const broken = await theReadingOf('made-up-broken')
    const linked = await theReadingOf('made-up-linked')
    // THE READER'S OWN TEXT, read from the office rather than typed here, so the test says what it really draws.
    const brokenRefusal = broken.refusal ?? ''
    const linkedRefusal = linked.refusal ?? ''
    expect(brokenRefusal, 'the office writes its own reason for made-up-broken').not.toBe('')
    expect(linkedRefusal, 'the office writes its own reason for made-up-linked').not.toBe('')

    // NORMAL MODE, ENGLISH: the words table's sentence, and never the reader's own text.
    await componentOpen('/plugin/made-up-broken/main')
    await componentPage.waitForSelector('.plgp-reason', { timeout: 20_000 })
    expect(await componentPage.$$eval('.plgp-reason', (all) => all.map((one) => one.textContent ?? ''))).toEqual([
      said('settingsPanel.plugins.why.missing', { field: 'version' }),
    ])
    expect(await componentPage.$$('.plgp-raw')).toHaveLength(0)
    expect(await componentPage.evaluate(() => document.body.textContent ?? '')).not.toContain(brokenRefusal)

    await componentOpen('/plugin/made-up-linked/main')
    await componentPage.waitForSelector('.plgp-reason', { timeout: 20_000 })
    expect(await componentPage.$$eval('.plgp-reason', (all) => all.map((one) => one.textContent ?? ''))).toEqual([
      said('settingsPanel.plugins.why.folderIsALink', { id: 'made-up-linked' }),
    ])
    // THE FOLDER CAUSES' PLAIN SENTENCE IS THE READER'S OWN ENGLISH, so no `.plgp-raw` is the whole check here.
    expect(await componentPage.$$('.plgp-raw')).toHaveLength(0)

    // NORMAL MODE, CHINESE: the same sentence in the page's language, and no reader's text.
    await componentOpen('/plugin/made-up-broken/main', 'normal', 'zh')
    await componentPage.waitForSelector('.plgp-reason', { timeout: 20_000 })
    expect(await componentPage.$eval('.plgp-reason', (one) => one.textContent ?? '')).toBe(
      inChinese('settingsPanel.plugins.why.missing', { field: 'version' }),
    )
    expect(await componentPage.$$('.plgp-raw')).toHaveLength(0)

    // DEVELOPER MODE, ENGLISH: the reader's own text exactly, in English, under the sentence.
    await componentOpen('/plugin/made-up-broken/main', 'inspect')
    await componentPage.waitForSelector('.plgp-raw', { timeout: 20_000 })
    expect(await componentPage.$$eval('.plgp-raw', (all) => all.map((one) => ({ text: one.textContent ?? '', lang: one.getAttribute('lang') })))).toEqual([
      { text: brokenRefusal, lang: 'en' },
    ])

    // A LINK'S READER TEXT SAYS NO MORE THAN THE SENTENCE, so Developer mode draws no `.plgp-raw` for it.
    await componentOpen('/plugin/made-up-linked/main', 'inspect')
    await componentPage.waitForSelector('.plgp-reason', { timeout: 20_000 })
    expect(await componentPage.$$('.plgp-raw')).toHaveLength(0)

    // DEVELOPER MODE, CHINESE: the Chinese sentence, and the reader's own English under it.
    await componentOpen('/plugin/made-up-broken/main', 'inspect', 'zh')
    await componentPage.waitForSelector('.plgp-raw', { timeout: 20_000 })
    expect(await componentPage.$eval('.plgp-reason', (one) => one.textContent ?? '')).toBe(
      inChinese('settingsPanel.plugins.why.missing', { field: 'version' }),
    )
    expect(await componentPage.$eval('.plgp-raw', (one) => one.textContent ?? '')).toBe(brokenRefusal)
  }, 240_000)

  // Test change (as decided, the page draws no explanation): a page that could not load is "not loaded", and the
  // office's own sentence about it is Developer mode's; it was a sentence with the office's words inside it.
  it('5. draws not loaded for a page the office could not load, and not ready for a page which never says it is ready', async () => {
    await open('/plugin/made-up-unbuilt/main')
    await app.page.waitForSelector(`${THE_PANEL} .plgp-said[role="alert"]`, { timeout: 20_000 })
    expect(await app.page.$eval(`${THE_PANEL} .plgp-said`, (el) => el.textContent ?? '')).toBe(said('pluginPage.state.notLoaded'))
    expect(await app.page.$$('iframe')).toHaveLength(0)

    expect(PLUGIN_READY_WITHIN_MS).toBe(10_000)
    await app.page.clock.install()
    await open('/plugin/made-up-silent/main')
    await app.page.waitForSelector(THE_FRAME, { timeout: 20_000 })
    // THE CONTROL: before the time is up, nothing is said.
    expect(await app.page.$$(`${THE_PANEL} .plgp-said`)).toHaveLength(0)
    await app.page.clock.fastForward(PLUGIN_READY_WITHIN_MS)
    await app.page.waitForSelector(`${THE_PANEL} .plgp-said[role="status"]`, { timeout: 25_000 })
    expect(await app.page.$eval(`${THE_PANEL} .plgp-said`, (el) => el.textContent ?? '')).toBe(said('pluginPage.state.notAnswering', { seconds: '10' }))
    // THE FRAME STAYS, because a slow page may still answer.
    expect(await app.page.$$(THE_FRAME)).toHaveLength(1)
    await photograph('plugin-page-not-answering')
  }, 120_000)

  it('6. takes the frame away when it loads another document, and opens the page again when asked', async () => {
    await open('/plugin/made-up-clock/main')
    const frame = await theFramesPage()
    await frame.evaluate(() => {
      window.setTimeout(() => {
        window.location.href = 'week.html'
      }, 0)
    })
    await app.page.waitForSelector(`${THE_PANEL} .plgp-moved`, { timeout: 20_000 })
    expect(await app.page.$eval(`${THE_PANEL} .plgp-moved .plgp-said`, (el) => el.textContent ?? '')).toBe(said('pluginPage.state.frameClosed'))
    expect(await app.page.$$('iframe')).toHaveLength(0)
    await photograph('plugin-page-moved')

    await app.page.click(`${THE_PANEL} .plgp-again`)
    const opened = await theFramesPage()
    expect(await opened.evaluate(() => window.location.pathname)).toBe('/api/plugins/made-up-clock/files/main.html')
    expect(await app.page.$$('.plgp-moved')).toHaveLength(0)
  }, 120_000)

  it('7. gives a plugin switched on in Settings its sidebar row at once, and switched off it has no page', async () => {
    await open('/settings/plugins')
    const theSwitch = '[data-target="uiSurface/settings.plugins"] [data-plugin="made-up-calendar"] [role="switch"]'
    await app.page.waitForSelector(theSwitch, { timeout: 20_000 })
    // THE CONTROL: no row before the switch. Test change (wave 13y round 165): the rows are on the All pages page, read
    // there after the switch, and no longer in the sidebar.
    await open('/all-pages')
    await app.page.waitForSelector('#main .ap-group', { state: 'attached', timeout: 20_000 })
    expect(await app.page.$$('[data-group="plugins"] a[href="#/plugin/made-up-calendar/month"]')).toHaveLength(0)
    await open('/settings/plugins')
    await app.page.waitForSelector(theSwitch, { timeout: 20_000 })
    await app.page.click(theSwitch)
    await app.page.waitForSelector(`${theSwitch}[aria-checked="true"]`, { timeout: 20_000 })
    await app.page.evaluate(() => { location.hash = '#/all-pages' })
    await app.page.waitForSelector('#main [data-group="plugins"] a[href="#/plugin/made-up-calendar/month"]', { state: 'attached', timeout: 20_000 })

    await open('/plugin/made-up-calendar/month')
    await theFramesPage()
    expect(await app.page.$eval('.plgp-title', (el) => el.textContent ?? '')).toBe('Month')

    await switchIt('made-up-calendar', false)
    await open('/plugin/made-up-calendar/month')
    await app.page.waitForSelector('.plgp-none', { timeout: 20_000 })
    expect(await app.page.$eval('.plgp-state', (el) => el.textContent ?? '')).toBe(`Made-up calendar · ${said('shortcuts.off')}`)
    expect(await app.page.$$('iframe')).toHaveLength(0)
  }, 120_000)

  it('8. starts a worker from a blob: address the page made, and the worker reaches nothing the page cannot', async () => {
    await open('/plugin/made-up-clock/main')
    const frame = await theFramesPage()
    await frame.waitForFunction(() => (window as unknown as { workers: { blob?: unknown } }).workers.blob !== undefined, undefined, { timeout: 20_000 })
    const blob = await frame.evaluate(() => (window as unknown as { workers: { blob: unknown } }).workers.blob)
    // NOT A SECURE CONTEXT in this office, so the browser gives the worker no Cache Storage and no file system at all:
    // they are absent, not refused. indexedDB is there, and refused.
    expect(blob).toEqual({
      origin: 'null',
      secureContext: 'false',
      office: 'refused',
      ownFile: 'refused',
      indexedDB: 'refused',
      caches: 'absent',
      fileSystem: 'absent',
      // The control loads the plugin's own script. The other plugin is on and serves JavaScript,
      // so refusing that import proves the content policy rather than a missing or wrong-type file.
      importOwn: 'reached',
      importOutside: 'refused',
    })
  }, 120_000)

  it('9. refuses a worker from any address but blob:, a data: address and the plugin\'s own file alike', async () => {
    await open('/plugin/made-up-clock/main')
    const frame = await theFramesPage()
    await frame.waitForFunction(
      () => {
        const workers = (window as unknown as { workers: Record<string, unknown> }).workers
        return workers['blob'] !== undefined && workers['data'] !== undefined && workers['file'] !== undefined
      },
      undefined,
      { timeout: 20_000 },
    )
    const workers = await frame.evaluate(() => (window as unknown as { workers: Record<string, unknown> }).workers)
    // THE CONTROL: this page can start a worker at all, so a refusal below is the address's and not the page's.
    expect(typeof workers['blob']).toBe('object')
    expect({ data: workers['data'], file: workers['file'] }).toEqual({ data: 'refused', file: 'refused' })
  }, 120_000)
})
