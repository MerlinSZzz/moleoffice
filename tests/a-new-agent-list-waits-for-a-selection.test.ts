// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Opening the chat's chooser and refreshing its list must not ask the carry door for every row.
 * The browser holds a made-up office in memory, with hundreds of people and agents. It answers the
 * list reads locally and counts the carry reads; no server or database is started by this test.
 */
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { CANNOT_REACH_WORDS } from '../src/shared/messages.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

let browser: Browser
let script = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `
        import './tests/a-page-of-a-test-office.ts';
        import { createElement as h, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { api } from './src/web/api.ts';
        import { StartANewAgentFromHere } from './src/web/components/StartANewAgent.tsx';
        import { OverlayHost } from './src/web/components/ui.tsx';
        import { t } from './src/shared/i18n.ts';
        import { theApiIsOnPort } from './src/web/lib/api-address.ts';
        theApiIsOnPort(null);
        const agents = Array.from({length: 250}, (_, n) => ({id: 'agent-' + n, handle: 'agent-' + n, name: 'made-up agent ' + n}));
        const people = Array.from({length: 250}, (_, n) => ({id: 'person-' + n, name: 'made-up person ' + n}));
        const presence = agents.map(one => ({who: {kind: 'agent', id: one.id}, colour: 'grey'}));
        let asked = 0, pools = 0, stream;
        api.participants = async () => ({agents, people});
        api.presence = async () => ({presence, workspaceId: 'default'});
        api.presenceOf = async () => ({presence: [], workspaceId: 'default'});
        api.messagePool = async () => { throw new Error('The chooser read whole messages'); };
        api.carryableAgentIds = async () => { pools++; return {agentIds: agents.slice(0, 249).map(one => one.id)} };
        api.wouldThePressCarry = async id => { asked++; await new Promise(resolve => setTimeout(resolve, 500)); return {wouldCarry: id !== 'agent-1'} };
        globalThis.fetch = async (input) => {
          const url = new URL(typeof input === 'string' ? input : input.url, location.href);
          if (url.pathname === '/api/events') return new Response(new ReadableStream({start(controller) {
            stream = controller; controller.enqueue(new TextEncoder().encode(': open 0 missed\\n\\n'));
          }}), {headers: {'content-type': 'text/event-stream'}});
          return new Response(JSON.stringify({whileConnecting: {reached: 0}, workspaceId: 'default'}), {headers: {'content-type': 'application/json'}});
        };
        const root = createRoot(document.getElementById('app'));
        function ChatChooser() {
          const [open, setOpen] = useState(false);
          return h('main', null, h('button', {className: 'px-chat-new-agent', onClick: () => setOpen(true)}, t('chatLive.startANewAgent')),
            open ? h(StartANewAgentFromHere, {showLabelWhenEmpty: true}) : null, h(OverlayHost));
        }
        window.madeUpOffice = {
          open: () => root.render(h(ChatChooser)),
          rerender: () => root.render(h(ChatChooser)),
          asked: () => asked,
          pools: () => pools,
          announce: () => stream.enqueue(new TextEncoder().encode('id: 1\\ndata: ' + JSON.stringify({name: 'answering.changed', who: {kind: 'agent', id: 'agent-0'}, workspaceId: 'default', how: 'nobody', couldNotTell: false}) + '\\n\\n')),
          streamReady: () => stream !== undefined,
        };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The made-up page did not build.')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => { await browser?.close() })

it('reads a selected agent once, not every candidate on opening or an answering change', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://made-up-office.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  await page.goto('http://made-up-office.test/')
  await page.addScriptTag({ content: script, type: 'module' })
  await page.waitForFunction(() => (window as any).madeUpOffice !== undefined)
  await page.evaluate(() => (window as any).madeUpOffice.open())
  await page.locator('.px-chat-new-agent').click({ timeout: 30_000 })
  await page.waitForFunction(() => (window as any).madeUpOffice.pools() > 0, undefined, { timeout: 10_000 })
    .catch(async error => { throw new Error(`${errors.join('\n')}\n${await page.locator('body').innerText()}\n${String(error)}`) })
  await page.waitForTimeout(500)
  const counts = () => page.evaluate(() => ({ asked: (window as any).madeUpOffice.asked(), pools: (window as any).madeUpOffice.pools() }))
  expect((await counts()).asked, 'opening the chooser asks no per-agent carry reads').toBe(0)
  expect((await counts()).pools, 'opening the chooser asks for the list once').toBe(1)
  await page.waitForFunction(() => document.querySelectorAll('.px-start-agent-here-name').length === 249, undefined, { timeout: 30_000 })
  expect((await page.locator('.px-start-agent-here-label').textContent())?.trim()).toBe(CANNOT_REACH_WORDS.noneOfTheseIsAnswering)

  await page.evaluate(() => (window as any).madeUpOffice.rerender())
  await page.waitForFunction(() => (window as any).madeUpOffice.streamReady(), undefined, { timeout: 10_000 })
  const before = (await counts()).pools
  await page.evaluate(() => (window as any).madeUpOffice.announce())
  await page.waitForFunction((n) => (window as any).madeUpOffice.pools() > n, before, { timeout: 10_000 })
  expect((await counts()).asked, 'an answering change asks no per-agent carry reads').toBe(0)
  expect((await counts()).pools, 'an answering change asks for the list once').toBe(before + 1)

  const first = page.locator('.px-start-agent-here-list li').first()
  expect((await first.locator('button').textContent())?.trim()).toBe(t('chatLive.startANewAgent'))
  await first.locator('button').click()
  expect(await first.locator('button').isDisabled()).toBe(true)
  expect((await first.getByRole('status').textContent())?.trim()).toBe(t('newAgentKeys.checking' as Parameters<typeof t>[0]))
  await first.locator('button').evaluate((button: HTMLButtonElement) => button.click())
  await page.locator('.px-start-agent-yes').waitFor({ timeout: 10_000 })
  expect((await counts()).asked).toBe(1)
  await page.locator('.px-start-agent-no').click()
  const second = page.locator('.px-start-agent-here-list li').nth(1)
  await second.locator('button').click()
  await page.getByText(t('newAgentKeys.nothingToCarry' as Parameters<typeof t>[0]), { exact: true }).waitFor({ timeout: 10_000 })
  expect(await page.locator('.px-start-agent-yes').count()).toBe(0)
  expect((await counts()).asked).toBe(2)
  await page.close()
}, 120_000)
