// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { THEMES } from '../src/shared/themes.ts'
import { RETIRED_THEMES, THEME_LABELS } from '../src/web/components/PresetBar.tsx'

// FOUR LOOKS ARE RETIRED, AND A FIFTH CAME BACK. 'hc' was High contrast's saved word, and High contrast
// is one of the six themes now, so a saved 'hc' opens it, with no notice. Coffee, Futuristic, Monochrome
// and Muted are still gone. A person who saved one is told which look the page is drawn in until they
// choose, which is true now that there are more than three looks to choose from. The sentence and the
// names in it are read from the code, and High contrast is found among the six by the name 'hc' was
// shown with, so the case does not depend on the id the code maps 'hc' to.
//
// ONE CASE FOR EACH RETIRED LOOK, ON ONE PAGE, IN THE ORDER THEY WERE ONE CASE. The bundle is built and
// the browser started once, in a hook, which gets four minutes in this file. Each look loads the page
// three times and adds the 20 MB bundle to it twice, about 3.5 s at a load of 4. When all five and the
// unknown word were one case, they shared its 30 s: the case took 23.5 s alone, and on 1 November 2026
// it ran out of time in a suite on 20 workers at a load of 33. Each case below still runs on the page the
// one before it left, as the steps did.
let script = ''
let browser: Browser | undefined
let page: Page
let server: Server | undefined
let site = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import { PresetBar } from './src/web/components/PresetBar.tsx';
        let root = createRoot(document.getElementById('app'));
        root.render(createElement(PresetBar));
        window.remountBar = () => {
          root.unmount();
          root = createRoot(document.getElementById('app'));
          root.render(createElement(PresetBar));
        };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const text = built.outputFiles[0]?.text
  if (text === undefined) throw new Error('The appearance bar did not build.')
  script = text
  // SERVE ONE DOCUMENT AND THE BUNDLE OVER HTTP FROM THIS PROCESS, on a port of its own, and the page fetches the
  // bundle, where it was handed to the page through Playwright. No office is involved. The bundle is a classic script
  // and the document names no encoding, so its answer names UTF-8. Nothing is kept in the browser's cache.
  const serving = createServer((asked, answer) => {
    if (asked.url === '/appearance-bar.js') {
      answer.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      answer.end(script)
      return
    }
    answer.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
    answer.end('<!doctype html><div id="app"></div>')
  })
  await new Promise<void>((resolve) => serving.listen(0, '127.0.0.1', resolve))
  server = serving
  site = `http://127.0.0.1:${String((serving.address() as AddressInfo).port)}`
  browser = await chromium.launch()
  page = await browser.newPage()
  await page.goto(`${site}/`)
})

afterAll(async () => {
  await browser?.close()
  const serving = server
  serving?.closeAllConnections()
  if (serving !== undefined) await new Promise<void>((resolve) => serving.close(() => resolve()))
})

describe('shows the replacement and notice for every retired look, keeping the saved word until a choice is saved', () => {
  it.each(['coffee', 'futuristic', 'mono', 'muted'])('the retired look %s is drawn as its replacement, and the notice names both', async (saved) => {
    const retired = RETIRED_THEMES.find((one) => one.value === saved)
    expect(retired, saved).toBeDefined()
    const replacement = retired!.replacement
    await page.evaluate((value) => {
      localStorage.clear()
      localStorage.setItem('mole-office.preset.theme', value)
    }, saved)
    await page.reload()
    await page.addScriptTag({ url: `${site}/appearance-bar.js` })
    await page.locator('#preset-theme').waitFor()
    const notice = sayInEnglish('settingsPanel.look.retiredNow', { label: sayInEnglish(retired!.label), replacement: sayInEnglish(THEME_LABELS[replacement]) })
    expect(await page.getAttribute('html', 'data-theme')).toBe(replacement)
    expect(await page.locator('#preset-theme').inputValue()).toBe(replacement)
    expect(await page.locator('option').allTextContents()).toEqual([...Object.values(THEME_LABELS).map((key) => sayInEnglish(key)), ...THEMES.map((theme) => theme.name.en)])
    expect(await page.locator('[role="status"]').innerText()).toContain(notice)
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBe(saved)
    await page.getByRole('button', { name: 'Sharp', exact: true }).click()
    expect(await page.locator('[role="status"]').innerText()).toContain(notice)
    // A refused write leaves the old word and the notice. The notice makes no claim about
    // which look is now drawn, since the unsaved choice still applies to this page.
    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new Error('storage is blocked') }
    })
    await page.locator('#preset-theme').selectOption(replacement === 'light' ? 'dark' : 'light')
    expect(await page.locator('.presetbar').innerText()).toContain(notice)
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBe(saved)
    await page.reload()
    await page.addScriptTag({ url: `${site}/appearance-bar.js` })
    await page.locator('#preset-theme').selectOption('auto')
    expect(await page.getAttribute('html', 'data-theme')).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBe('auto')
    expect(await page.locator('.presetbar').innerText()).not.toContain(notice)
    await page.evaluate(() => (window as unknown as { remountBar: () => void }).remountBar())
    await page.locator('#preset-theme').waitFor()
    expect(await page.locator('.presetbar').innerText()).not.toContain(notice)
  })

  it("a saved 'hc' opens High contrast, one of the six themes now, and says nothing is gone", async () => {
    const highContrast = THEMES.find((theme) => theme.name.en === sayInEnglish('settingsPanel.look.retiredHighContrast'))
    expect(highContrast).toBeDefined()
    expect(RETIRED_THEMES.map((one) => one.value)).not.toContain('hc')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('mole-office.preset.theme', 'hc')
    })
    await page.reload()
    await page.addScriptTag({ content: script })
    await page.locator('#preset-theme').waitFor()
    expect(await page.getAttribute('html', 'data-theme')).toBe(highContrast!.id)
    expect(await page.getAttribute('html', 'data-theme-from')).toBe('data')
    expect(await page.locator('#preset-theme').inputValue()).toBe(highContrast!.id)
    expect(await page.locator('[role="status"]').count()).toBe(0)
  })

  it('and an unknown word still follows the existing refusal path; it is not a retired look', async () => {
    await page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'not-a-look'))
    await page.reload()
    await page.addScriptTag({ url: `${site}/appearance-bar.js` })
    await page.locator('#preset-theme').waitFor()
    expect(await page.getAttribute('html', 'data-theme')).toBeNull()
    // Normal mode names the axis and not the stored word, which developer mode adds.
    expect(await page.locator('.presetbar').innerText()).toContain('Theme: ignored a saved setting that this build does not have.')
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBeNull()
  })
})
