// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNTIME PAGE DRAWS EACH PATH ON A ROW OF ITS OWN, and no sentence holds one.
 *
 * WHAT THIS PROVES
 *
 *   1. When the database this server has open is not the canonical one, the database panel's row for the canonical one
 *      says no, and the canonical file is drawn on a labelled row of its own in the office's code style.
 *   2. The freshness panel's row for the newest file the server is built from says its time, and the file is drawn on
 *      a labelled row of its own in the code style.
 *   3. When a script answers every message instead of an agent tool, the worker panel's row says so with yes, and the
 *      script is drawn on a labelled row of its own in the code style.
 *
 * In each panel no other value and no sentence holds the path. Before, each path sat inside the value of a row, in a
 * sentence: "no — the canonical one is …", "…, changed at …" and "every message is answered by … instead of an agent
 * tool, so nothing an agent says here came from a model". Those sentences go, and none is added.
 *
 * THE WORLD. A throwaway office from tests/helpers.ts, its page in the shared Chromium, in English. The runtime read
 * goes to the test's own office with page.route, and only its body is changed: the three paths are made up. Nothing is
 * written. Every word is read by its key.
 */
import type { Locator } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { liveApp, type LiveApp } from './helpers.ts'

const en = createI18n('en')
const THE_RUNTIME_READ = '**/api/runtime'
const A_CANONICAL_FILE = '/srv/made-up/canonical/panelx.db'
const A_NEWEST_FILE = 'src/shared/made-up-newest-file.ts'
const A_NEWEST_TIME = '2026-11-21 01:00:00'
const AN_ANSWERING_SCRIPT = 'tools/made-up-answering-script.mjs'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'runtime-paths-on-rows', viewport: { width: 1440, height: 1000 } })
  await app.page.route(THE_RUNTIME_READ, async (route) => {
    const response = await route.fetch()
    const read = (await response.json()) as RuntimeRecord
    await route.fulfill({
      response,
      json: {
        ...read,
        database: { ...read.database, canonical: false, canonicalPath: A_CANONICAL_FILE },
        freshness: { ...read.freshness, newestOnDisk: A_NEWEST_TIME, newestOnDiskFile: A_NEWEST_FILE },
        worker: { ...read.worker, runsAreFaked: AN_ANSWERING_SCRIPT },
      },
    })
  })
  await app.page.goto(`${app.site}/?lang=en#/runtime`)
  await app.page.waitForSelector('.rt-again', { timeout: 30_000 })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** One panel of the page, by the surface it declares. */
function thePanel(surface: string): Locator {
  return app.page.locator(`[data-target="uiSurface/${surface}"]`)
}

/** Each code row in this panel: its label, and the tag and text of the first element on its row. */
async function theCodeRows(panel: Locator): Promise<{ label: string; tag: string; value: string }[]> {
  return panel.evaluate((holder) =>
    [...holder.querySelectorAll('dl.code-rows dt')].map((term) => {
      const first = term.nextElementSibling?.firstElementChild ?? null
      return { label: term.textContent ?? '', tag: first?.tagName ?? 'none', value: first?.textContent ?? '' }
    }),
  )
}

/** The value this panel's facts give beside one label. */
async function theFact(panel: Locator, label: WordKey): Promise<string> {
  return panel.evaluate((holder, name) => {
    const term = [...holder.querySelectorAll('.rt-facts dt')].find((one) => one.textContent === name)
    return term?.nextElementSibling?.textContent ?? 'no such row'
  }, en.t(label))
}

/** The text of every fact's value and every sentence in this panel. */
async function theFactsAndSentences(panel: Locator): Promise<string[]> {
  return [...(await panel.locator('.rt-facts dd').allTextContents()), ...(await panel.locator('p').allTextContents())]
}

/** The path on its own code row under its label, and in no fact's value and no sentence. */
async function aRowOfItsOwn(panel: Locator, label: WordKey, path: string): Promise<void> {
  expect(await theCodeRows(panel)).toContainEqual({ label: en.t(label), tag: 'CODE', value: path })
  for (const said of await theFactsAndSentences(panel)) expect(said, 'a value or a sentence holds the path').not.toContain(path)
}

describe('the runtime page draws each path on a row of its own', () => {
  it('draws the canonical database file on its own row, and the canonical row says no', async () => {
    const panel = thePanel('runtime.database')
    await panel.locator('dl.code-rows code').first().waitFor({ timeout: 30_000 })
    expect(await theFact(panel, 'dev.runtime.theCanonicalOne')).toBe(en.t('dev.runtime.no'))
    await aRowOfItsOwn(panel, 'runtime.row.canonicalFile' as WordKey, A_CANONICAL_FILE)
  }, 120_000)

  it('draws the newest file the server is built from on its own row, and its row says the time', async () => {
    const panel = thePanel('runtime.freshness')
    await panel.locator('dl.code-rows code').first().waitFor({ timeout: 30_000 })
    expect(await theFact(panel, 'dev.runtime.theNewestFileTheServerIsBuilt')).toBe(A_NEWEST_TIME)
    await aRowOfItsOwn(panel, 'runtime.row.newestServerFile' as WordKey, A_NEWEST_FILE)
  }, 120_000)

  it('draws the script that answers every message on its own row, and the row that says runs are not real says yes', async () => {
    const panel = thePanel('runtime.worker')
    await panel.locator('dl.code-rows code').first().waitFor({ timeout: 30_000 })
    expect(await theFact(panel, 'dev.runtime.runsAreNotReal')).toBe(en.t('dev.runtime.yes'))
    await aRowOfItsOwn(panel, 'runtime.row.answeredBy' as WordKey, AN_ANSWERING_SCRIPT)
  }, 120_000)
})
