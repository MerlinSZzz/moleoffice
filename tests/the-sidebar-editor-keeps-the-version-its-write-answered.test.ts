// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { SHIPPED_SIDEBAR } from '../src/shared/sidebar-arrangement.ts'

// The panel reads the sidebar again after a write and after a 409. A settings event that arrives while that read
// is out starts a newer read, and only the newest read is installed. The panel must still know the version its own
// write or its own read answered, or the next Apply sends an old version and is refused although nobody else wrote.
// The made-up server below holds the reads so that the event's read overtakes the panel's read every time.
let browser: Browser, page: Page
const errors: string[] = []
let office = { arrangement: SHIPPED_SIDEBAR, shipped: SHIPPED_SIDEBAR, version: 'v1', changed: false, reminders: [] as string[], storedButNotUsed: null }
let holding = false
const held: (() => void)[] = []
const writes: { version: string; status: number }[] = []
beforeAll(async () => {
  const bundle = await build({ stdin: { sourcefile: 'sidebar-version-browser.tsx', resolveDir: process.cwd(), loader: 'tsx', contents: `
    import './tests/a-page-of-a-test-office.ts';
    import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
    import { aChangeWasHeard, setActor } from './src/web/api.ts';
    import { theApiIsOnPort } from './src/web/lib/api-address.ts';
    import { installSidebarArrangement, readSidebarArrangement } from './src/web/lib/sidebar-arrangement.ts';
    import { SidebarArrangementPanel } from './src/web/components/SidebarArrangement.tsx';
    import { UI_CSS } from './src/web/components/ui.tsx';
    theApiIsOnPort(null);
    setActor({ type: 'human', id: 'made-up-caretaker' });
    const root=createRoot(document.getElementById('test')); let serial=0;
    window.draw=(setting)=>{installSidebarArrangement(setting);flushSync(()=>root.render(<><style>{UI_CSS}</style><SidebarArrangementPanel key={++serial} /></>))};
    // What the event stream does when a settings event arrives: it counts the event, then the listener reads again.
    window.anEventArrives=()=>{aChangeWasHeard();window.eventRead=readSidebarArrangement()};
  ` }, loader: { '.css': 'empty' }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' } })
  browser = await chromium.launch(); page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://sidebar.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="test"></div></body></html>' }))
  await page.route('http://sidebar.test/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/sidebar' && request.method() === 'GET') {
      if (holding) await new Promise<void>(release => held.push(release))
      return route.fulfill({ json: office })
    }
    if (path === '/api/sidebar/preview') return route.fulfill({ json: { problems: [], reminders: [], moves: [] } })
    if (path === '/api/sidebar' && request.method() === 'POST') {
      const asked = request.postDataJSON() as { version: string; arrangement: typeof SHIPPED_SIDEBAR }
      if (asked.version !== office.version) {
        writes.push({ version: asked.version, status: 409 })
        return route.fulfill({ status: 409, json: { error: 'The sidebar arrangement changed after you read it. Nothing was changed.' } })
      }
      office = { ...office, arrangement: asked.arrangement, version: `v${Number(office.version.slice(1)) + 1}`, changed: true }
      writes.push({ version: asked.version, status: 200 })
      return route.fulfill({ json: { ...office, written: true } })
    }
    return route.fulfill({ status: 404, json: { error: `The made-up server has no ${request.method()} ${path}.` } })
  })
  await page.goto('http://sidebar.test/')
  await page.addStyleTag({ content: readFileSync('src/web/tokens.css', 'utf8') })
  await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0]!.text })
  await page.waitForFunction(() => typeof (window as any).draw === 'function')
  expect(errors).toEqual([])
})
afterAll(async () => { await browser?.close() })
async function press(name: string) { await page.getByRole('button', { name, exact: true }).click(); expect(errors).toEqual([]) }
async function move() { await page.getByRole('button', { name: /^Move .+ down$/ }).first().click() }
async function heldReads(count: number) { await expect.poll(() => held.length).toBe(count) }
/** The panel's own read is released first and the event's read second, so only the event's read is installed. */
async function letTheEventsReadWin(panelDone: () => Promise<unknown>) {
  await heldReads(1)
  await page.evaluate(() => (window as any).anEventArrives())
  await heldReads(2)
  held.shift()!()
  await panelDone()
  held.shift()!()
  await page.evaluate(() => (window as any).eventRead)
  holding = false
}

it('keeps the version its own write answered when a settings event reads the sidebar at the same time', async () => {
  office = { ...office, arrangement: SHIPPED_SIDEBAR, version: 'v1' }
  await page.evaluate(setting => (window as any).draw(setting), office)
  await move(); await press('Preview')
  await page.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up first change.')
  holding = true
  await press('Apply')
  await letTheEventsReadWin(() => page.getByText('The sidebar arrangement was saved for everybody.', { exact: true }).waitFor())
  expect(writes.at(-1)).toEqual({ version: 'v1', status: 200 })
  expect(await page.getByText('The sidebar arrangement changed after you read it. Apply will ask you to read it again.', { exact: true }).count()).toBe(0)

  await move(); await press('Preview')
  await page.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up second change.')
  await press('Apply')
  await page.getByText('The sidebar arrangement was saved for everybody.', { exact: true }).waitFor()
  expect(writes.at(-1)).toEqual({ version: 'v2', status: 200 })
}, 60_000)

it('keeps the version its own read answered after a refusal when a settings event reads at the same time', async () => {
  office = { ...office, arrangement: SHIPPED_SIDEBAR, version: 'v5' }
  await page.evaluate(setting => (window as any).draw(setting), office)
  // Somebody else writes after this page read the sidebar.
  office = { ...office, version: 'v6' }
  await move(); await press('Preview')
  await page.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up change after somebody else.')
  holding = true
  await press('Apply')
  await letTheEventsReadWin(() => page.getByRole('button', { name: 'Preview', exact: true, disabled: false }).waitFor())
  expect(writes.at(-1)).toEqual({ version: 'v5', status: 409 })
  expect(await page.getByText('The sidebar arrangement changed after you read it. Apply will ask you to read it again.', { exact: true }).count()).toBe(0)

  await move(); await press('Preview')
  await press('Apply')
  await page.getByText('The sidebar arrangement was saved for everybody.', { exact: true }).waitFor()
  expect(writes.at(-1)).toEqual({ version: 'v6', status: 200 })
}, 60_000)
