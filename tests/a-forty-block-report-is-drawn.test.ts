// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { flatten, regionsOf } from '../src/shared/regions.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
let app: LiveApp
const blocks: SummaryBlock[] = Array.from({ length: 40 }, (_, i) => [
 { id: `text-${i}`, type: 'text' as const, heading: `Measurement ${i}`, text: 'Measured fixture prose. '.repeat(145) + 'A fixture single-row pipe table reproduces the measured cycle.\n\n| one | two |\n\n```text\nfixture\n```' },
 { id: `table-${i}`, type: 'table' as const, columns: [{ label: 'Fixture measurement' }], rows: [{ cells: [`Fixture table ${i}`] }] },
]).flat()
const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
async function file(held: unknown[]) {
 const response = await fetch(app.api + '/api/records', { method: 'POST', headers, body: JSON.stringify({ kind: 'report', title: 'Fixture forty-block report', data: { blocks: held, for: 'Browser test', date: '2026-09-08' } }) })
 return { status: response.status, body: await response.json() }
}
beforeAll(async () => { app = await liveApp({ opensAt: 'full', name: 'forty-blocks', viewport: { width: 1440, height: 1000 } }) }, 120_000)
afterAll(async () => { await app?.stop() })
it('a-forty-block-report-is-drawn', async () => {
 const report = await file(blocks)
 expect(report.status, JSON.stringify(report.body)).toBe(201)
 const regions = flatten(regionsOf({ field: 'blocks', blocks }))
 expect(new Set(regions.map((r) => r.id)).size).toBe(regions.length)
 expect(regions.filter((r) => r.role === 'table')).toHaveLength(80)
 expect(regions.filter((r) => r.role === 'tableRow')).toHaveLength(80)
 expect(regions.filter((r) => r.role === 'tableCell')).toHaveLength(120)
 for (const region of regions) expect(region.children.some((child) => child.id === region.id)).toBe(false)
 await app.page.goto(app.site + '/#/r/' + report.body.record.id)
 await waitForThePage(app.page)
 await app.page.getByText('Fixture table 39', { exact: true }).waitFor({ timeout: 5000 })
 expect(await app.page.locator('.sb-table').count()).toBeGreaterThanOrEqual(40)
 const tooMany = await file(Array.from({ length: 201 }, (_, i) => ({ id: `over-${i}`, type: 'text', text: 'Fixture limit measurement.' })))
 expect(tooMany.status).toBe(400)
 expect(tooMany.body.error).toContain('200 blocks')
 const tooLong = await file([{ id: 'too-long', type: 'text', text: 'x'.repeat(4001) }])
 expect(tooLong.status).toBe(400)
 expect(tooLong.body.error).toContain('4000')
})
