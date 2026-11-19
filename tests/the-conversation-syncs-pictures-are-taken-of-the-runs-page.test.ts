// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PICTURES OF THE RUNS PAGE WITH THE CONVERSATION SYNC PANEL.
 *
 * The panel's criteria are in tests/the-conversation-sync-is-drawn-with-its-tool-tag.test.ts. This file takes the eight
 * pictures chapter 6 asks for: the Sessions page with the panel at 1440, 990, 660 and 390, in light and dark. They are
 * taken only when CONVERSATION_SYNC_PICTURES names a folder, from a made-up office of this test's own — never the live
 * office — and the made-up label is drawn above the page in every picture.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'conversation-sync-pictures', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  page = app.page
}, 120_000)

afterAll(async () => { await app?.stop() })

const PICTURES = process.env['CONVERSATION_SYNC_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const CALLED = 'conversation-sync-pictures'

const asPerson = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
})

async function send(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers: asPerson(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const said = (await reply.json()) as Record<string, unknown>
  expect(reply.status, `${method} ${path}: ${JSON.stringify(said).slice(0, 300)}`).toBeLessThan(300)
  return said
}

/** Three made-up runs, each with a made-up conversation copy already on its record. */
async function fillTheOffice(): Promise<void> {
  const copies: [string, string, string][] = [
    ['claude-code', 'made-up-claude', 'A made-up Claude Code run'],
    ['codex', 'made-up-codex', 'A made-up Codex run'],
    ['opencode', 'made-up-opencode', 'A made-up OpenCode run'],
  ]
  for (const [runtime, providerSession, title] of copies) {
    await send('POST', '/api/records', {
      kind: 'session',
      title,
      data: {
        state: 'finished',
        runtime,
        providerSession,
        workingDirectory: '/home/made-up/project',
        conversationSync: {
          state: 'synced',
          runtime,
          providerSession,
          source: `<home>/.transcripts/${providerSession}.jsonl`,
          sha256: 'a'.repeat(64),
          bytes: 1234,
          capturedAt: '2026-11-16 10:00:00',
          lastChangedAt: '2026-11-16 10:00:00',
          secretsRemoved: 0,
          secretShapes: [],
          pathsMapped: 1,
          says: 'The file was copied.',
          text: 'Made-up words for a picture.',
        },
      },
    })
  }
  await send('POST', '/api/conversations/sync', { enabled: true })
}

/** A window of its own for the pictures, in the theme asked for, with the chat shut. */
async function aWindow(theme: 'light' | 'dark'): Promise<BrowserContext> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await context.addInitScript((look) => {
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  page = await context.newPage()
  return context
}

/** Opens the runs page at a width for a picture, once the panel's copies have drawn, with the made-up label above it. */
async function openForAPicture(width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 })
  await page.goto(`${app.site}/#/sessions`)
  await waitForThePage(page, 60_000)
  await page.locator('[data-conversation-run]').first().waitFor({ timeout: 30_000 })
  await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *:not([data-made-up-label]):not(style)').first(), CALLED)
  await page.waitForTimeout(1_000)
}

it.skipIf(PICTURES === undefined)('takes the pictures of the runs page with the panel at four widths in light and dark', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  await fillTheOffice()
  for (const theme of ['light', 'dark'] as const) {
    const context = await aWindow(theme)
    try {
      for (const width of [1440, 990, 660, 390]) {
        await openForAPicture(width)
        expect(await page.evaluate(() => document.documentElement.lang), 'the language the page is drawn in').toBe('en')
        await page.screenshot({
          path: join(folder, `sessions-conversation-sync-${String(width)}-${theme}.png`),
          fullPage: true,
        })
      }
    } finally {
      page = app.page
      await context.close()
    }
  }
}, 900_000)
