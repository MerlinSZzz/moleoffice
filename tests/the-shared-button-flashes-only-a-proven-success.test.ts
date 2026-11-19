// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHARED BUTTON FLASHES ONLY A PROVEN SUCCESS. The direction aqhbTofhUQ6q, on the audit XIHE6Qc5EGNd: Btn read
 * every wait that ended without pendingFailed as a success, so 139 presses whose answer failed would have drawn the
 * whole-frame flash that means "it worked".
 *
 * The rule, from the motion standard and answer IDNh6s8eOlRn:
 *   - a proven success (pendingSucceeded) lights the whole frame once and fades over --motion-settle;
 *   - a failure fades over --motion-quick with no flash. A failure is pendingFailed, an action that throws, or an
 *     action whose promise rejects; a failure wins over a success the caller also claimed. A promise is anything with
 *     a then method, so a thenable and a promise made in another window are waited for and their rejection is a failure.
 *     A then that throws when it is read is a failure too, said beside the press like any throw;
 *   - an answer nobody proved ends plainly: the light is taken away at once, with no flash and no fade. A wait that
 *     merely ended and a promise that resolved are both this, because many actions catch their own refusal and
 *     resolve anyway.
 *
 * THE BUTTON IS DRAWN ON A PAGE OF ITS OWN, bundled with esbuild from src/web/components/ui.tsx and served from
 * loopback, one case to a page. Each case presses its button, waits until the light is drawn, then watches the
 * light's canvas: roundRect is the whole-frame flash, and animate is the fade, whose duration names the token. Then the
 * case ends the wait the way it is named.
 *
 * THE LAST CASE IS A REAL PAGE. New record on the records page passes no outcome to its button, like the 139 presses
 * of the audit. Its refused create must end plainly, and the page must still say the refusal.
 */

import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'

/** Each case: what its press does, and how the test ends the wait it started. */
const HARNESS = `import './tests/a-page-of-a-test-office.ts';
  import React, {useRef, useState} from 'react'; import {createRoot} from 'react-dom/client';
  import {setWordLanguage} from './src/shared/i18n.ts';
  import {Btn, UI_CSS} from './src/web/components/ui.tsx';
  setWordLanguage('en');
  const ends = {};
  window.endTheWait = (name) => ends[name]();
  // ANOTHER WINDOW, whose Promise and Error are not this page's, for the case of a promise made in another realm.
  const other = document.body.appendChild(document.createElement('iframe')).contentWindow;
  window.theOtherWindowIsAnotherRealm = other.Promise !== Promise && other.Error !== Error;
  function Case({name}) {
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [succeeded, setSucceeded] = useState(false);
    const [presses, setPresses] = useState(0);
    const held = useRef(null);
    const hold = () => new Promise((resolve, reject) => { held.current = {resolve, reject}; });
    const press = {
      'proven-success': () => { setPending(true); setSucceeded(false); },
      'no-proof': () => { setPending(true); },
      'failure-and-success-said': () => { setPending(true); },
      'resolved': () => hold(),
      'rejected': () => hold(),
      'thrown-in-the-action': async () => { await hold(); throw new Error('An invented fault after a wait.'); },
      'thrown-at-once': () => { setPending(true); throw new Error('An invented fault at once.'); },
      'thenable-rejected': () => { const waiting = hold(); return { then: (ok, fail) => waiting.then(ok, fail) }; },
      'other-realm-rejected': () => new other.Promise((resolve, reject) => { held.current = {resolve, reject}; }),
      'then-getter-throws': () => { setPending(true); return { get then() { throw new Error('An invented fault reading then.'); } }; },
    }[name];
    ends[name] = {
      'proven-success': () => { setPending(false); setSucceeded(true); },
      'no-proof': () => { setPending(false); },
      'failure-and-success-said': () => { setPending(false); setFailed(true); setSucceeded(true); },
      'resolved': () => held.current.resolve(),
      'rejected': () => held.current.reject(new Error('An invented refusal.')),
      'thrown-in-the-action': () => held.current.resolve(),
      'thrown-at-once': () => { setPending(false); },
      'thenable-rejected': () => held.current.reject(new Error('An invented refusal of a thenable.')),
      'other-realm-rejected': () => held.current.reject(new other.Error('An invented refusal from another window.')),
      'then-getter-throws': () => { setPending(false); },
    }[name];
    return <div data-case={name} data-presses={presses}>
      <Btn variant="primary" pending={pending} pendingFailed={failed} pendingSucceeded={succeeded} onClick={() => { setPresses((n) => n + 1); return press(); }}>Press</Btn>
    </div>;
  }
  createRoot(document.getElementById('test')).render(<><style>{UI_CSS}</style><Case name={new URLSearchParams(location.search).get('case')} /></>);`

let app: LiveApp
let harnessServer: Server | undefined
let harnessSite: string

beforeAll(async () => {
  app = await liveApp({ name: 'shared-button-outcomes', viewport: { width: 1440, height: 900 }, theDevServerBecause: 'The shared button is checked before the production build.' })
  const bundled = await bundlePageCode({
    stdin: { resolveDir: process.cwd(), sourcefile: 'shared-button-harness.tsx', loader: 'tsx', contents: HARNESS },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const script = bundled.outputFiles[0]!.text
  const style = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '') + '\nbody { padding: 48px; }'
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
  const server = harnessServer
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  harnessSite = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}, 240_000)

afterAll(async () => {
  // CLOSING WAITS FOR EVERY CONNECTION, and the browser may hold one that has sent nothing, so each is ended once the
  // server takes no new ones (problem 2mWb9nJCUUoA).
  await new Promise<void>((done) => {
    if (harnessServer === undefined) {
      done()
      return
    }
    harnessServer.close(() => done())
    harnessServer.closeAllConnections()
  })
  await app?.stop()
})

/** Wait until the press's light is drawn, then note any whole-frame flash and the duration of any fade. */
async function watchTheLight(page: Page): Promise<void> {
  const light = page.locator('canvas[data-wait-light]')
  await expect.poll(() => light.count(), { timeout: 10_000, message: 'the press draws its waiting light' }).toBe(1)
  await light.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!
    context.roundRect = new Proxy(context.roundRect, { apply(target, thisArg, args) { document.documentElement.dataset.testFlash = 'yes'; return Reflect.apply(target, thisArg, args) } })
    const animate = element.animate.bind(element)
    element.animate = (frames, options) => { const fade = animate(frames, options); document.documentElement.dataset.testFade = String(fade.effect?.getTiming().duration); return fade }
  })
}

/** How the light ended: whether the whole frame was lit, the fade's duration if it faded, and whether it has gone. */
async function howTheLightEnded(page: Page): Promise<{ flash: string | null; fade: string | null }> {
  const html = page.locator('html')
  return { flash: await html.getAttribute('data-test-flash'), fade: await html.getAttribute('data-test-fade') }
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return String(Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000))
  }, name)
}

async function openTheCase(name: string, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion })
  const page = await context.newPage()
  await page.goto(`${harnessSite}/?case=${name}`, { timeout: 60_000 })
  await page.locator(`[data-case="${name}"] .px-btn`).waitFor({ timeout: 30_000 })
  return { page, close: () => context.close() }
}

async function endTheWait(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => (window as unknown as { endTheWait: (name: string) => void }).endTheWait(name), name)
}

it('lights the whole frame and settles when the caller proves the success', async () => {
  const { page, close } = await openTheCase('proven-success')
  try {
    await page.locator('.px-btn').click()
    await watchTheLight(page)
    await endTheWait(page, 'proven-success')
    const settle = await token(page, '--motion-settle')
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(settle)
    expect((await howTheLightEnded(page)).flash, 'a proven success lights the whole frame').toBe('yes')
  } finally {
    await close()
  }
}, 120_000)

for (const name of ['no-proof', 'resolved'] as const) {
  it(`ends plainly, with no flash and no fade, when nobody proved the answer: ${name}`, async () => {
    const { page, close } = await openTheCase(name)
    try {
      const press = page.locator('.px-btn')
      await press.click()
      await watchTheLight(page)
      if (name === 'resolved') {
        // WHILE THE ACTION'S PROMISE RUNS, THE BUTTON IS WAITING: it says so to a screen reader, and a second press
        // starts nothing.
        expect(await press.getAttribute('data-pending')).toBe('1')
        expect(await press.locator('.px-sr').textContent()).toBe(t('sheet.button.saving'))
        await press.click()
        expect(await page.locator('[data-case]').getAttribute('data-presses')).toBe('1')
      }
      await endTheWait(page, name)
      await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000 }).toBe(0)
      expect(await howTheLightEnded(page), 'an unproved answer is neither a success nor a failure').toEqual({ flash: null, fade: null })
      expect(await press.getAttribute('data-pending')).toBeNull()
    } finally {
      await close()
    }
  }, 120_000)
}

for (const name of ['rejected', 'thrown-in-the-action', 'thrown-at-once', 'thenable-rejected', 'other-realm-rejected', 'then-getter-throws', 'failure-and-success-said'] as const) {
  it(`fades quickly with no flash when the answer failed: ${name}`, async () => {
    const { page, close } = await openTheCase(name)
    try {
      if (name === 'other-realm-rejected') expect(await page.evaluate(() => (window as unknown as { theOtherWindowIsAnotherRealm: boolean }).theOtherWindowIsAnotherRealm), 'the promise comes from another realm').toBe(true)
      await page.locator('.px-btn').click()
      await watchTheLight(page)
      await endTheWait(page, name)
      const quick = await token(page, '--motion-quick')
      await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(quick)
      expect((await howTheLightEnded(page)).flash, 'a failure never lights the whole frame').toBeNull()
      await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000 }).toBe(0)
      // A FAULT THE ACTION RAISED IS SAID BESIDE THE PRESS, a rejection as much as a throw.
      const said = {
        'rejected': 'An invented refusal.',
        'thrown-in-the-action': 'An invented fault after a wait.',
        'thrown-at-once': 'An invented fault at once.',
        'thenable-rejected': 'An invented refusal of a thenable.',
        'other-realm-rejected': 'An invented refusal from another window.',
        'then-getter-throws': 'An invented fault reading then.',
      }
      if (name !== 'failure-and-success-said') expect(await page.locator('[data-case] .fault').innerText()).toContain(said[name])
    } finally {
      await close()
    }
  }, 120_000)
}

it('takes the light away at once under reduced motion, even after a proven success', async () => {
  const { page, close } = await openTheCase('proven-success', 'reduce')
  try {
    await page.locator('.px-btn').click()
    await watchTheLight(page)
    await endTheWait(page, 'proven-success')
    await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000 }).toBe(0)
    expect((await howTheLightEnded(page)).fade, 'reduced motion draws no fade').toBeNull()
  } finally {
    await close()
  }
}, 120_000)

it('ends a refused New record plainly on the records page, which says the refusal itself', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  let release!: () => void
  let held = false
  const gate = new Promise<void>((resolve) => { release = resolve })
  try {
    await page.goto(`${app.site}/#/records`)
    await waitForThePage(page)
    await page.locator('main.page .rec-head-act .px-btn[data-variant="primary"]').click()
    const form = page.locator('main.page form.rec-form')
    await form.waitFor({ timeout: 30_000 })
    await form.locator('input').first().fill('An invented record nobody keeps')
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await gate
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'An invented refusal.' }) })
    })
    const create = form.locator('button[type="submit"]')
    await create.click()
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page)
    release()
    await form.getByRole('alert').first().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000 }).toBe(0)
    expect(await howTheLightEnded(page), 'a refused create on a page that reports no outcome is not drawn as a success').toEqual({ flash: null, fade: null })
    expect(await create.isVisible()).toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await context.close()
  }
}, 120_000)
