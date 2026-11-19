// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE USAGE PAGE DRAWS THE MEASURED COST, THE ESTIMATE AND THE FOUR FIELDS THAT WERE SUMMED AND
 * NEVER SHOWN. Criterion U3, second half — the screen.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 *   · The seven fields `receiptsFromRuns` sums are all drawn now, not three: cache creation,
 *     reasoning, wall time and the runtime's own cost join tokens in, cached and tokens out.
 *   · The cost the runtime reported and the cost estimated from the person's table are drawn
 *     SIDE BY SIDE, each named for what it is. Neither replaces the other.
 *   · With no table set the page says so, in the one sentence declared in
 *     `src/shared/price-table.ts`, and the measured cost is still drawn.
 *   · Nothing scrolls sideways at 390: the wide totals fold into a wrapping grid rather than a
 *     fixed-width table, so the estimate is not taken off the edge of the screen.
 *
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN, RESTORED BYTE-IDENTICAL. Draw only the
 * three original totals columns in `src/web/components/UsageReceipt.tsx` and the assertion that
 * names "Cache written", "Reasoning", "Time", the runtime's cost and the estimate goes red.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { theNoPriceTableSentence } from '../src/shared/price-table.ts'

let live: LiveApp
let database: TestDb

beforeAll(async () => {
  database = await freshDb()
  historicalSession(database, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'd-price-test' },
    kind: 'session',
    title: 'A run priced from a table',
    data: {
      state: 'finished', servingAgent: 'price-agent', model: 'model-one', runtime: 'claude-code',
      usageReceipt: {
        runtime: 'claude-code', model: 'model-one', inputTokens: 100, cachedInputTokens: 1000,
        cacheCreationInputTokens: 200, outputTokens: 50, reasoningTokens: 10, durationMs: 65_000,
        inputIncludesCached: false, costUsd: 1.25,
      },
    },
  })
  historicalSession(database, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'd-price-test' },
    kind: 'session',
    title: 'A second run on another model',
    data: {
      state: 'finished', servingAgent: 'price-agent', model: 'model-two', runtime: 'claude-code',
      usageReceipt: {
        runtime: 'claude-code', model: 'model-two', inputTokens: 2000, outputTokens: 100,
        reasoningTokens: 20, durationMs: 30_000, inputIncludesCached: true, costUsd: 2.5,
      },
    },
  })
  live = await liveApp({ name: 'price-estimate', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: database.file })
}, 180_000)

afterAll(async () => {
  if (live) await live.stop()
  database?.close()
})

describe('the usage page draws the four fields and both costs, and folds', () => {
  it('draws the four newly summed fields, the missing count and both costs, at 1440 and at 390', async () => {
    await live.page.goto(`${live.site}/#/agent-use`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(live.page, 60_000)
    await live.page.getByTestId('receipt-totals').waitFor()
    await live.page.getByTestId('receipt-totals').getByText('Cache written').first().waitFor()
    const words = await live.page.getByTestId('receipt-totals').innerText()
    for (const label of ['Cache written', 'Reasoning', 'Time', 'Cost reported by the runtime', 'Cost estimated from your price table']) {
      expect(words, `the totals do not draw ${label}`).toContain(label)
    }
    expect(words).toContain('Without a receipt:')
    // NO TABLE IS SET IN THIS WORLD, SO THE PAGE SAYS SO AND THE MEASURED COST IS STILL DRAWN.
    expect(words).toContain(theNoPriceTableSentence())
    expect(words).toContain('1.25 USD')

    for (const width of [1440, 390]) {
      await live.page.setViewportSize({ width, height: 1000 })
      const overflow = await live.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `the page scrolls sideways at ${width}`).toBeLessThanOrEqual(1)
      const atWidth = await live.page.getByTestId('receipt-totals').innerText()
      expect(atWidth, `a field is missing at ${width}`).toContain('Cost estimated from your price table')
    }
  }, 120_000)

  /**
   * THE PICTURES, WHEN A DIRECTORY IS NAMED. Four widths, both themes. `PRICE_SHOT_STATE` names
   * which state the world is in ("no-table" by default, "with-table" when the seam is temporarily
   * pointed at a table for the picture). The ordinary runs leave the variable unset and take none.
   */
  it.skipIf(!process.env['PRICE_SHOTS'])('photographs the page at every width in both themes', async () => {
    const shots = process.env['PRICE_SHOTS'] as string
    const state = process.env['PRICE_SHOT_STATE'] ?? 'no-table'
    mkdirSync(shots, { recursive: true })
    await live.page.goto(`${live.site}/#/agent-use`, { waitUntil: 'domcontentloaded' })
    await waitForThePage(live.page, 60_000)
    await live.page.getByTestId('receipt-totals').waitFor()
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await live.page.setViewportSize({ width, height: 1000 })
        await live.page.emulateMedia({ colorScheme: theme })
        await live.page.screenshot({ path: `${shots}/price-${state}-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
  }, 300_000)
})
