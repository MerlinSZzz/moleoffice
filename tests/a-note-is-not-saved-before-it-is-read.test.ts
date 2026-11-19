// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** An existing note left before its read answers must send no save built on the empty sheet. */
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const NOTE_ID = 'MadeUpDelayed01'
let browser: Browser
let script = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h } from 'react';
        import { createRoot } from 'react-dom/client';
        import { theApiIsOnPort } from './src/web/lib/api-address.ts';
        import { QuickNote } from './src/web/components/QuickNote.tsx';
        theApiIsOnPort(null);
        const root = createRoot(document.getElementById('app'));
        window.openNote = (id) => root.render(h(QuickNote, { id }));
        window.leaveNote = () => root.unmount();`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (!script) throw new Error('The note page did not build.')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => { await browser?.close() })

type NoteStand = { openNote(id: string): void; leaveNote(): void }

it('sends no PATCH when an existing note is left before its read answers', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const patches: unknown[] = []
  let readStarted = false
  let releaseRead: () => void = () => {}
  const held = new Promise<void>((resolve) => { releaseRead = resolve })
  try {
    await page.route('http://note.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
    await page.route(`http://note.test/api/records/${NOTE_ID}`, async (route) => {
      if (route.request().method() === 'GET') {
        readStarted = true
        await held
        await route.fulfill({ json: { record: { id: NOTE_ID, kind: 'quick_note', workspaceId: 'default', title: 'Made-up delayed note', data: { parts: [{ id: 'w-1', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up delayed note' }] } }, version: 'made-up-version' } })
      } else if (route.request().method() === 'PATCH') {
        patches.push(route.request().postDataJSON())
        await route.fulfill({ status: 400, json: { error: 'Made-up refusal' } })
      } else {
        await route.abort()
      }
    })
    await page.goto('http://note.test/')
    await page.addScriptTag({ content: script, type: 'module' })
    await page.waitForFunction(() => 'openNote' in window)
    await page.evaluate((id) => (window as unknown as NoteStand).openNote(id), NOTE_ID)
    await page.locator('.qn-reading').waitFor()
    expect(await page.locator('.qn-reading').textContent()).toBe(t('quickNote.reading'))
    await expect.poll(() => readStarted).toBe(true)
    await page.evaluate(() => (window as unknown as NoteStand).leaveNote())
    await page.waitForTimeout(500)
    expect(patches, 'no save is sent before the note has been read').toEqual([])
  } finally {
    releaseRead()
    await page.close()
  }
}, 120_000)
