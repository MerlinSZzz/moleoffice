// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright'
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
// @ts-expect-error The database-free screen shell is shared with the JS browser tools.
import { screenWorld } from './fixtures/screen-read-world.mjs'
// @ts-expect-error Generated fixtures are deliberately shared with the JS browser executor.
import { screenFixture } from './fixtures/screen-read-fixtures.mjs'
import { readFailureWords, words } from '../src/words.ts'
import { REFRESH_GRACE_MS } from '../src/screen-facts.ts'

// On the built page, the lines at the top of the map say only what a person acts on. One line gives the
// oldest time at which Projects, Roster, People and Work were read. A part has a line of its own only
// when it was never read, its last read failed or its data was narrowed, and never while it re-reads
// normally. The count line leaves out the unmatched work clause while there is no such work to count.
// A listener that runs before the shell's own can hold a read unanswered and release it later, and the
// plugin's clock is fixed, so each test knows every time the page could show.
type Language = 'en' | 'zh'
type Part = 'projects' | 'rosterView' | 'peopleView' | 'workView'
type Fact = { status: string; error: unknown; receivedAt?: number; pending?: boolean }
type Hooks = { __officeMapScreenTest?: { renderedFacts?: Record<string, { people: Fact; work: Fact }> } }
type Lines = { hold: string[]; language: Language; held: () => string[]; release: (view: string) => void }
type Shell = { configure: (value: unknown) => void; openPlugin: () => void; __lines: Lines; __screenWorld: { errors: string[] } }
const plugin = resolve(import.meta.dirname, '..')
const FIRST = Date.UTC(2026, 10, 14, 9, 5, 7), LATER = FIRST + 3_723_000
const control = `
if (location.pathname.endsWith('/plugin/main.html')) {
  const real = Date.now; window.__readClock = ${FIRST}; Date.now = () => window.__readClock ?? real()
} else if (location.pathname === '/') {
  const held = []
  const lines = window.__lines = { hold: [], language: 'en', held: () => held.map(one => one.data.view),
    release: view => {
      lines.hold = lines.hold.filter(one => one !== view)
      const now = held.filter(one => one.data.view === view)
      held.splice(0, held.length, ...held.filter(one => one.data.view !== view))
      for (const one of now) window.dispatchEvent(new MessageEvent('message', { data: one.data, source: one.source }))
    } }
  window.addEventListener('message', event => {
    const message = event.data
    if (message?.interface !== 'office-read/1') return
    if (message.ask === 'ready' && lines.language !== 'en') {
      event.stopImmediatePropagation()
      event.source.postMessage({ interface: 'office-read/1', kind: 'context', plugin: 'office-map', page: 'main', language: lines.language, theme: 'light', reducedMotion: true, project: 'synthetic-project-0' }, '*')
    } else if (message.ask === 'read' && lines.hold.includes(message.view)) { event.stopImmediatePropagation(); held.push({ data: message, source: event.source }) }
  }, true)
}`
let world: { url: string; close: () => Promise<void> }, browser: BrowserContext, profile: string, built: string, page: Page | undefined
beforeAll(async () => {
  built = mkdtempSync('/dev/shm/office-map-top-lines-')
  // A production page, as the office builds it (tools/build-a-plugin.mjs), into a folder of its own.
  const callers = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    await build({ root: plugin, base: './', configFile: false, envDir: false, logLevel: 'warn',
      build: { outDir: built, emptyOutDir: true, rolldownOptions: { input: { main: join(plugin, 'main.html') } } } })
  } finally { if (callers === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = callers }
  world = await screenWorld({ built })
  profile = mkdtempSync('/dev/shm/office-map-top-lines-profile-')
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 } })
}, 120000)
afterAll(async () => {
  await browser?.close(); await world?.close()
  for (const folder of [profile, built]) if (folder) rmSync(folder, { recursive: true, force: true })
})

const whole = () => screenFixture(100)
// The made-up world with no Projects view, so every Projects read is answered 404.
const withoutProjects = () => { const fixture = whole(); delete fixture.views.projects; return fixture }
async function open({ fixture = whole(), hold = [] as string[], language = 'en' as Language } = {}): Promise<Frame> {
  await page?.close(); page = await browser.newPage()
  await page.addInitScript({ content: control })
  await page.goto(world.url)
  await page.evaluate(({ fixture, hold, language }) => {
    const shell = window as unknown as Shell
    shell.__lines.hold = hold; shell.__lines.language = language; shell.configure({ fixture }); shell.openPlugin()
  }, { fixture, hold, language })
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null)
  const frame = page.frames().find(one => one.url().endsWith('/plugin/main.html'))!
  await frame.waitForSelector('.read-status', { state: 'attached' })
  return frame
}
const held = () => page!.evaluate(() => (window as unknown as Shell).__lines.held().sort())
const release = (view: string) => page!.evaluate(view => (window as unknown as Shell).__lines.release(view), view)
const holdNext = (views: string[]) => page!.evaluate(views => { (window as unknown as Shell).__lines.hold = views }, views)
const reconfigure = (fixture: unknown) => page!.evaluate(fixture => (window as unknown as Shell).configure({ fixture }), fixture)
const shellErrors = () => page!.evaluate(() => (window as unknown as Shell).__screenWorld.errors)
// The lines the status block shows, in order. A line with no words, or hidden, is not shown.
const lines = (frame: Frame) => frame.evaluate(() => [...document.querySelector('.read-status')!.children]
  .filter(line => line.textContent !== '' && line.checkVisibility()).map(line => line.textContent))
const countLine = (frame: Frame) => frame.textContent('.source-count')
const counted = (language: Language) => new RegExp(`^${words[language].supplied}: \\d+ · ${words[language].people}: \\d+$`)
// What stands between the status block and the count line.
const between = (frame: Frame) => frame.evaluate(() => {
  const found: string[] = []
  for (let node = document.querySelector('.read-status')!.nextElementSibling; node && !node.classList.contains('source-count'); node = node.nextElementSibling) found.push(node.id || node.className)
  return found
})
const clock = (frame: Frame, at: number, language: Language = 'en') => frame.evaluate(([at, language]) => new Date(at).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-GB'), [at, language] as const)
const setClock = (frame: Frame, at: number) => frame.evaluate(at => { (window as unknown as { __readClock: number }).__readClock = at }, at)
const readTime = (time: string, language: Language = 'en') => `${words[language].ready} · ${time}`
const partLine = (language: Language, part: Part, ...said: string[]) => [words[language][part], ...said].join(' · ')
// Every agent on the map has People and Work loaded from a read that named it, and the page has drawn them.
// With `at`, both were read at that time, so the page has taken in a read made after the clock moved.
const factsRead = (frame: Frame, at?: number) => frame.evaluate(at => {
  const facts = Object.values((window as unknown as Hooks).__officeMapScreenTest?.renderedFacts ?? {})
  const supplied = Number(/: (\d+)/.exec(document.querySelector('.source-count')?.textContent ?? '')?.[1] ?? -1)
  return supplied > 0 && facts.length === supplied && facts.every(fact => [fact.people, fact.work].every(one =>
    one.status === 'loaded' && one.error === null && !one.pending && (at === null || one.receivedAt === at)))
}, at ?? null)
const factsPending = (frame: Frame) => frame.evaluate(() => {
  const facts = Object.values((window as unknown as Hooks).__officeMapScreenTest?.renderedFacts ?? {})
  return facts.length > 0 && facts.every(fact => fact.people.pending && fact.work.pending)
})
const press = (frame: Frame, name: string) => frame.getByRole('button', { name, exact: true }).click()
const { en, zh } = words

it('shows one read line when every part is read', async () => {
  const frame = await open()
  await expect.poll(() => factsRead(frame), { timeout: 60000 }).toBe(true)
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(await clock(frame, FIRST))])
  expect(await frame.getAttribute('.read-status', 'role')).toBe('status')
  expect(await shellErrors()).toEqual([])
}, 120000)

it('names a part whose last read failed, whether it kept its earlier data or had none', async () => {
  const never = await open({ fixture: withoutProjects() })
  await expect.poll(() => factsRead(never), { timeout: 60000 }).toBe(true)
  const first = await clock(never, FIRST)
  await expect.poll(() => lines(never), { timeout: 20000 }).toEqual([readTime(first), partLine('en', 'projects', en.unavailable, en.never, readFailureWords('en'))])
  const kept = await open()
  await expect.poll(() => factsRead(kept), { timeout: 60000 }).toBe(true)
  await expect.poll(() => lines(kept), { timeout: 20000 }).toEqual([readTime(first)])
  await reconfigure(withoutProjects())
  await press(kept, en.refresh)
  await expect.poll(() => lines(kept), { timeout: 20000 }).toEqual([readTime(first), partLine('en', 'projects', en.stale, first, readFailureWords('en'))])
}, 120000)

it('names a part whose data was narrowed by permission', async () => {
  const fixture = whole()
  fixture.views.projects.narrowedByPermission = [{ cause: 'permission', bucket: 'projects', count: 2, ids: null }]
  const frame = await open({ fixture })
  await expect.poll(() => factsRead(frame), { timeout: 60000 }).toBe(true)
  const first = await clock(frame, FIRST)
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(first), partLine('en', 'projects', en.ready, first, en.restricted)])
}, 120000)

it('shows one Reading line before any part is read, then names each part that was never read', async () => {
  const frame = await open({ hold: ['projects', 'roster', 'people', 'work'] })
  await expect.poll(held, { timeout: 30000 }).toEqual(['projects', 'roster'])
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([en.loading])
  await release('projects'); await release('roster')
  // The roster's answer lets the page ask for People and Work, which stay held.
  await expect.poll(held, { timeout: 30000 }).toEqual(['people', 'work'])
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(await clock(frame, FIRST)),
    partLine('en', 'peopleView', en.loading, en.never), partLine('en', 'workView', en.loading, en.never)])
}, 120000)

it('names no part while every part re-reads normally', async () => {
  const frame = await open()
  await expect.poll(() => factsRead(frame), { timeout: 60000 }).toBe(true)
  const first = await clock(frame, FIRST)
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(first)])
  await holdNext(['projects', 'roster', 'people', 'work']); await setClock(frame, LATER)
  await press(frame, en.refresh)
  // Every part is asked again and left unanswered, and the page has drawn its facts as pending.
  await expect.poll(held, { timeout: 30000 }).toEqual(['people', 'projects', 'roster', 'work'])
  // A refresh shows the previous facts for the grace, and the page's clock stands still, so move it past the grace.
  await setClock(frame, LATER + REFRESH_GRACE_MS)
  await expect.poll(() => factsPending(frame), { timeout: 20000 }).toBe(true)
  expect(await lines(frame)).toEqual([readTime(first)])
}, 120000)

it('keeps the read time out of what a screen reader is told, and tells it a failed part', async () => {
  const frame = await open({ fixture: withoutProjects() })
  await expect.poll(() => factsRead(frame), { timeout: 60000 }).toBe(true)
  await expect.poll(() => lines(frame), { timeout: 20000 }).toHaveLength(2)
  // ARIA: inside a live region, the nearest element that sets aria-live decides whether a change is told.
  const told = await frame.evaluate(([ready, projects]) => {
    const block = document.querySelector('.read-status')!, shown = [...block.children]
    const live = (start: string) => { const line = shown.find(one => one.textContent?.startsWith(start)); return line ? line.closest('[aria-live]')?.getAttribute('aria-live') ?? 'inherited' : 'missing' }
    return { role: block.getAttribute('role'), time: live(ready), failed: live(projects) }
  }, [en.ready, en.projects] as const)
  expect(told).toEqual({ role: 'status', time: 'off', failed: 'inherited' })
}, 120000)

it('shows the oldest of the four read times', async () => {
  const frame = await open()
  await expect.poll(() => factsRead(frame), { timeout: 60000 }).toBe(true)
  const first = await clock(frame, FIRST), later = await clock(frame, LATER)
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(first)])
  await holdNext(['roster']); await setClock(frame, LATER)
  await press(frame, en.refresh)
  // Projects, People and Work are read again at the later time; the Roster's answer is held, so its time is the first.
  await expect.poll(held, { timeout: 30000 }).toEqual(['roster'])
  await expect.poll(() => factsRead(frame, LATER), { timeout: 30000 }).toBe(true)
  expect(await lines(frame)).toEqual([readTime(first)])
  await release('roster')
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(later)])
}, 120000)

it('leaves out the unmatched work clause at 0 and while Work is unread', async () => {
  // The page reads Work only for the agents on the roster, so its count of work without a roster match is 0.
  const frame = await open()
  await expect.poll(() => factsRead(frame), { timeout: 60000 }).toBe(true)
  await expect.poll(() => countLine(frame), { timeout: 20000 }).toMatch(counted('en'))
  const unread = await open({ hold: ['work'] })
  await expect.poll(held, { timeout: 30000 }).toEqual(['work'])
  await expect.poll(() => lines(unread), { timeout: 20000 }).toEqual([readTime(await clock(unread, FIRST)), partLine('en', 'workView', en.loading, en.never)])
  expect(await countLine(unread)).toMatch(counted('en'))
}, 120000)

it('follows the same rules in Chinese', async () => {
  const frame = await open({ fixture: withoutProjects(), hold: ['projects', 'roster', 'people', 'work'], language: 'zh' })
  await expect.poll(held, { timeout: 30000 }).toEqual(['projects', 'roster'])
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([zh.loading])
  await release('projects'); await release('roster')
  await expect.poll(held, { timeout: 30000 }).toEqual(['people', 'work'])
  const first = await clock(frame, FIRST, 'zh'), failed = partLine('zh', 'projects', zh.unavailable, zh.never, readFailureWords('zh'))
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(first, 'zh'), failed,
    partLine('zh', 'peopleView', zh.loading, zh.never), partLine('zh', 'workView', zh.loading, zh.never)])
  await release('people')
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(first, 'zh'), failed, partLine('zh', 'workView', zh.loading, zh.never)])
  expect(await countLine(frame)).toMatch(counted('zh'))
  expect(await between(frame)).toEqual(['art-error'])
  await release('work')
  await expect.poll(() => factsRead(frame), { timeout: 30000 }).toBe(true)
  await expect.poll(() => lines(frame), { timeout: 20000 }).toEqual([readTime(first, 'zh'), failed])
  expect(await countLine(frame)).toMatch(counted('zh'))
  expect(await shellErrors()).toEqual([])
}, 120000)
