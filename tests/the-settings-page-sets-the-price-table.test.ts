// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE SETS THE PRICE TABLE, AND THE USAGE PAGE ESTIMATES FROM IT. Criterion U3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   1. The panel lists the model a usage receipt names, by its exact name, with empty price boxes,
 *      and its state word says no table is set.
 *   2. A price typed into those boxes and saved is what the server holds afterwards. The save is
 *      waited for by its own answer, and then the server is read, not the boxes.
 *   3. The Usage page then draws an estimate in the table's currency, and no longer draws the
 *      sentence saying no table is set.
 *
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN, RESTORED BYTE-IDENTICAL: take
 * `<PriceTablePanel />` off the Settings page and case 1 finds no panel to fill.
 *
 * THE PICTURES, WHEN `PRICE_TABLE_SHOTS` NAMES A DIRECTORY: the Settings panel and the Usage page
 * with the table set, at 1440, 990, 660 and 390, light and dark. Ordinary runs take none.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { theNoPriceTableSentence } from '../src/shared/price-table.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

let live: LiveApp
let database: TestDb

const OWNER_HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': 'person',
}

const PANEL = '[data-target="uiSurface/settings.prices"]'

/** Open the Settings page and wait for the price table panel, and its receipt models, to be drawn. */
async function openTheSettings(): Promise<void> {
  await live.page.goto(`${live.site}/?mode=inspect#/settings/prices`)
  await live.page.reload()
  await waitForThePage(live.page, 60_000)
  await live.page.waitForSelector(`${PANEL} .ptb`, { timeout: 30_000 })
}

beforeAll(async () => {
  database = await freshDb()
  historicalSession(database, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'd-price-panel-test' },
    kind: 'session',
    title: 'A run the panel names the model of',
    data: {
      state: 'finished', servingAgent: 'price-agent', model: 'model-one', runtime: 'claude-code',
      usageReceipt: {
        runtime: 'claude-code', model: 'model-one', inputTokens: 100, cachedInputTokens: 1000,
        cacheCreationInputTokens: 200, outputTokens: 50, inputIncludesCached: false, costUsd: 1.25,
      },
    },
  })
  live = await liveApp({ name: 'price-table-panel', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: database.file })
}, 240_000)

afterAll(async () => {
  if (live) await live.stop()
  database?.close()
})

describe('the price table is set on the Settings page', () => {
  it('lists the model the receipts name, saves a price typed for it, and the server holds it', async () => {
    await openTheSettings()
    // THE CONTROL: no table yet, and the receipt's model is offered by its exact name, unpriced.
    const unpriced = live.page.locator(`${PANEL} [data-testid="price-table-unpriced"] [data-model="model-one"]`)
    await unpriced.waitFor({ timeout: 30_000 })
    // Test change (as decided, the panel draws no explanation): the state is the word "not set", where it was the
    // sentence saying no table is set.
    expect(await live.page.locator(`${PANEL} .ptb-state`).allInnerTexts()).toContain(t('settingsState.notSet'))

    await live.page.locator(`${PANEL} .ptb-currency input`).fill('GBP')
    await unpriced.getByLabel('Input price for model-one', { exact: true }).fill('3')
    await unpriced.getByLabel('Output price for model-one', { exact: true }).fill('15')
    await unpriced.getByLabel('Cached input price for model-one', { exact: true }).fill('0.3')

    // THE SAVE IS WAITED FOR BY ITS OWN ANSWER, then the server is read rather than the boxes.
    const saved = live.page.waitForResponse(
      (reply) => new URL(reply.url()).pathname === '/api/office/price-table' && reply.request().method() === 'POST',
    )
    await live.page.getByRole('button', { name: 'Save the price table' }).click()
    expect((await saved).status()).toBe(200)

    const reply = await fetch(`${live.api}/api/office/price-table`, { headers: OWNER_HEADERS })
    expect(reply.status, await reply.clone().text()).toBe(200)
    const said = (await reply.json()) as { reading: unknown }
    expect(said.reading).toEqual({
      state: 'set',
      table: { currency: 'GBP', prices: { 'model-one': { input: 3, output: 15, cachedInput: 0.3 } } },
    })

    // AND THE PAGE, read again, draws it as a priced row with who set it.
    await openTheSettings()
    await live.page.locator(`${PANEL} [data-testid="price-table-priced"] [data-model="model-one"]`).waitFor()
    await live.page.locator(`${PANEL} [data-testid="price-table-set-by"]`).waitFor()
    expect(await live.page.locator(`${PANEL} .ptb-state`).allInnerTexts()).not.toContain(t('settingsState.notSet'))
  }, 180_000)

  it('the Usage page then draws the estimate in the table currency', async () => {
    await live.page.goto(`${live.site}/#/agent-use`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(live.page, 60_000)
    const totals = live.page.getByTestId('receipt-totals')
    await totals.getByText('0.00195 GBP').first().waitFor({ timeout: 30_000 })
    const words = await totals.innerText()
    // (100 + 200) * 3 + 1000 * 0.3 + 50 * 15 = 1950 over one million tokens.
    expect(words).toContain('0.00195 GBP')
    expect(words).not.toContain(theNoPriceTableSentence())
    expect(words).toContain('1.25 USD')
  }, 120_000)

  it.skipIf(!process.env['PRICE_TABLE_SHOTS'])('photographs the panel and the Usage page with a table set', async () => {
    const shots = process.env['PRICE_TABLE_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    for (const theme of ['light', 'dark'] as const) {
      await live.page.emulateMedia({ colorScheme: theme })
      for (const width of [1440, 990, 660, 390]) {
        await live.page.setViewportSize({ width, height: 1000 })
        await openTheSettings()
        await live.page.locator(`${PANEL} [data-testid="price-table-priced"]`).waitFor()
        const overflow = await live.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `the Settings page scrolls sideways at ${width}`).toBeLessThanOrEqual(1)
        await live.page.locator(PANEL).screenshot({ path: `${shots}/settings-price-table-${String(width)}-${theme}.png` })
        await live.page.goto(`${live.site}/#/agent-use`, { waitUntil: 'domcontentloaded' })
        await waitForThePage(live.page, 60_000)
        await live.page.getByTestId('receipt-totals').waitFor()
        await live.page.screenshot({ path: `${shots}/usage-with-table-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
  }, 600_000)
})
