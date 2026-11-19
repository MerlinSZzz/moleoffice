// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S PAGE IN DEVELOPER MODE DOES NOT SCROLL SIDEWAYS. Problem 64NQ16zegyMP.
 *
 * The page was about 1,727 pixels wide at every window width. The cause: the Stored fields panel draws FieldList from
 * src/web/components/ModuleView.tsx, and FieldList brought no stylesheet of its own, so outside a ModuleView the JSON
 * of a nested value (pre.mv-field-json) kept `white-space: pre` and its longest line widened the document. No element's
 * box reached past the edge, because the pre's box stayed inside; its text did not.
 *
 * Opened at 1440 and 390 in the light theme, with a made-up run carrying a check with long nested evidence. The
 * Stored fields fold is opened before the page is measured, because it is closed on load.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-run-page-in-developer-mode-does-not-scroll-sideways.test.ts
 * Mutation: in src/web/components/ModuleView.tsx, FieldList's `<style href="mole-office-module" ...>` element removed:
 * the 390 case goes red. Restored with cp and checked with cmp.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, thePersonsKeyHeader } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

let app: LiveApp
let run = ''

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string) => ({ ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function request<T>(path: string, method = 'GET', body?: unknown, headers = asPerson): Promise<T> {
  const response = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`)
  return JSON.parse(text) as T
}

async function open(width: number, theme: 'light' | 'dark'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.emulateMedia({ colorScheme: theme })
  await app.page.goto(`${app.site}/?mode=inspect#/r/${run}`, { waitUntil: 'domcontentloaded' })
  await app.page.reload()
  await waitForThePage(app.page)
  // THE STORED FIELDS ARE A CLOSED FOLD IN DEVELOPER MODE, and a closed fold
  // lays nothing out, so the fold is opened here: a person who opens it must not get a page wider
  // than the window.
  await app.page.evaluate(() => {
    for (const fold of document.querySelectorAll('article.rp details')) {
      if (fold.querySelector('.mv-fields') !== null) (fold as HTMLDetailsElement).open = true
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'run-page-width', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await request('/api/agents/started', 'POST', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await request('/api/agents/started', 'POST', { handle: 'synthetic-inspector', name: 'Synthetic Inspector', runtime: 'claude-code', role: 'inspector' })
  await request('/api/agents/started', 'POST', { handle: 'synthetic-builder', name: 'Synthetic Builder', runtime: 'claude-code', role: 'worker' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
  const log = join(app.dir, 'runs', 'synthetic-check', 'inspection.log')
  const made = await request<{ record: { id: string } }>('/api/records', 'POST', {
    kind: 'session',
    title: 'Synthetic run with check evidence for page-width test',
    data: {
      state: 'running',
      runtime: 'inspection-tool',
      servingAgent: 'synthetic-builder',
      doing: 'Synthetic check evidence for the page-width browser test.',
      workingDirectory: app.dir,
      cutFrom: 'main',
      tip: 'synthetic-test-tip',
      theCheck: {
        askedAt: '2026-09-29 09:00:00',
        askedOf: 'synthetic-inspector',
        message: 'synthetic-check-message',
        checkout: { directory: app.dir, cutFrom: 'main' },
        execution: { session: 'synthetic-check-run', log, model: 'synthetic-inspection-model', minutes: 0.01 },
        says: 'The office asked a synthetic inspector to check this run.',
      },
    },
  }, { ...asPerson, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) })
  run = made.record.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('a run page in developer mode', () => {
  for (const width of [1440, 390]) for (const theme of ['light'] as const) {
    it(`fits the ${width}px window in ${theme}`, async () => {
      await open(width, theme)
      const evidence = await app.page.locator('.chk').innerText()
      expect(evidence).toContain('synthetic-check-run')
      expect(evidence).toContain(join(app.dir, 'runs', 'synthetic-check', 'inspection.log'))

      const size = await app.page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      const shots = process.env['MOLE_RUN_PAGE_WIDTH_SHOTS']
      if (shots) {
        mkdirSync(shots, { recursive: true })
        await app.page.screenshot({ path: join(shots, `developer-${width}-${theme}.png`), fullPage: true })
      }
      expect(
        size.scrollWidth,
        `viewport ${width}px in ${theme}: scrollWidth=${size.scrollWidth}px, clientWidth=${size.clientWidth}px, overflow=${size.scrollWidth - size.clientWidth}px`,
      ).toBeLessThanOrEqual(size.clientWidth)
    })
  }
})
