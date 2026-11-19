// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMPTY GROUP OF A USAGE RECEIPT SAYS WHY IT HAS NO ROWS (wave 13y round 142, item 66).
 *
 * The receipt totals on Agent use and on an agent's page have four groups: by model, by runtime, by
 * agent and by record worked on. An empty one drew a bare dash, with no word and nothing on its hover.
 * The server puts every run into every group (receiptsFromRuns, src/server/lib/usage-receipts.ts), so
 * a group is empty only when no run was counted, and each group now says "none" and that sentence.
 *
 * THE READING IS WRITTEN OUT: it is the shape receiptsFromRuns returns for no runs. That module opens
 * the database when it is imported, and this file is about the drawing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { USAGE_NUMBERS } from '../src/config/usage.mjs'
import type { ReceiptTotal, ReceiptUsage } from '../src/shared/usage-receipts.ts'

/** The same stand-in for a window tests/usage-page.test.ts installs, since src/web/api.ts reads one when it loads. */
beforeAll(() => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

const NO_RUNS_ROW: ReceiptTotal = {
  name: null,
  runs: [],
  missingReceipts: 0,
  values: {},
  supplied: Object.fromEntries(USAGE_NUMBERS.map((key) => [key, 0])) as ReceiptTotal['supplied'],
  estimate: { total: null, currency: null, pricedRuns: 0, unpricedRuns: 0, incompleteRuns: 0, says: null, said: null },
}

const NO_RUNS: ReceiptUsage = { runs: 0, missingReceipts: 0, overall: NO_RUNS_ROW, byModel: [], byRuntime: [], byAgent: [], byRecord: [] }

describe('an empty group of a usage receipt', () => {
  it('says "none" in each of the four groups, with why on its hover and for a screen reader', async () => {
    const { ReceiptTotals } = await import('../src/web/components/UsageReceipt.tsx')
    const html = renderToStaticMarkup(createElement(ReceiptTotals, { reading: NO_RUNS }))
    const why = sayInEnglish('devWords.receipt.noRunCounted')
    // EACH GROUP IS FOUND BY ITS HEADING, since the counting rules above them fold in a <details> too.
    for (const title of ['byModel', 'byRuntime', 'byAgent', 'byRecord'] as const) {
      const start = html.indexOf(`<summary>${sayInEnglish(`devWords.receipt.${title}`)}</summary>`)
      expect(start, `no group is headed ${title}`).toBeGreaterThan(-1)
      const group = html.slice(start, html.indexOf('</details>', start))
      // WHAT A READER SEES: the screen reader's copy and every tag taken out.
      const seen = group.replace(/<span class="px-sr">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '')
      expect(seen, `the ${title} group does not say none`).toContain(sayInEnglish('absence.none'))
      expect(group, `the ${title} group has no reason on its hover`).toContain(`title="${why}"`)
      expect(group, `the ${title} group has no reason for a screen reader`).toContain(`<span class="px-sr">${why}</span>`)
    }
  })
})
