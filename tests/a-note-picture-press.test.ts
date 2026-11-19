// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The add-picture press shows an icon, and names itself to assistive technology and in its tip. */
import { readFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

let browser: Browser
let script = ''
let styles = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h } from 'react';
        import { createRoot } from 'react-dom/client';
        import { QuickNote } from './src/web/components/QuickNote.tsx';
        createRoot(document.getElementById('app')).render(h(QuickNote));`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The note did not build')
  styles = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => { await browser?.close() })

it('shows only the picture icon while keeping its accessible name and tooltip', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.route('http://note.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app" style="height:100dvh"></div>' }))
    await page.goto('http://note.test/')
    await page.addStyleTag({ content: styles })
    await page.addScriptTag({ content: script, type: 'module' })
    const press = page.getByRole('button', { name: t('quickNote.addAPicture'), exact: true })
    await press.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await press.innerText()).toBe('')
    expect(await press.locator('svg').count()).toBe(1)
    expect(await press.getAttribute('title')).toBe(t('quickNote.addAPicture'))
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), press.click()])
    expect(chooser.isMultiple()).toBe(true)
  } finally { await page.close() }
}, 60_000)
