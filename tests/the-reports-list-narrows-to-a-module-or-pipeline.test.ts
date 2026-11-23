// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { g7bFixture, g7bHeaders, g7bRequest } from './g7b-fixture.ts'

const { t } = createI18n('en')
let office: LiveApp
let moduleId = ''
let pipelineId = ''
let unrelatedId = ''
let direct = ''
let runReport = ''
let otherReport = ''
let pipelineReport = ''
let deepReport = ''
let blockReport = ''

beforeAll(async () => {
  office = await liveApp({ name: 'reports-scope', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const f = await g7bFixture(office)
  moduleId = f.shelf.id
  pipelineId = f.pipe.id
  unrelatedId = f.direction.id
  const file = async (kind: string, title: string, data: object, links: object[] = []) =>
    (await g7bRequest(office, '/api/records', 'POST', { kind, title, data, links })).record.id as string
  const run = await file('session', 'Made-up run', {}, [{ type: 'part_of', toId: moduleId }])
  const report = (title: string, toId: string) => file('report', title, { for: 'Readers', date: '2026-01-01', read: 'read' }, [{ type: 'about', toId }])
  direct = await report('Made-up module report', moduleId)
  runReport = await report('Made-up run report', run)
  pipelineReport = await report('Made-up pipeline report', pipelineId)
  otherReport = await report('Made-up unrelated report', unrelatedId)
  // A PART OF A PART, AND A BLOCK: the list reads the module's sub-modules at every depth, and the pipeline's blocks.
  const inner = await file('module', 'Made-up inner module', { context: 'A made-up part of the shelf.', parts: [] }, [{ type: 'part_of', toId: moduleId }])
  const innermost = await file('module', 'Made-up innermost module', { context: 'A made-up part of a part.', parts: [] }, [{ type: 'part_of', toId: inner }])
  deepReport = await report('Made-up deep report', innermost)
  blockReport = await report('Made-up block report', f.first.id)
}, 300_000)
afterAll(async () => { await office?.stop() })

async function list(scope: string) {
  const response = await fetch(`${office.api}/api/records/reports-and-notes?show=reports&scope=${encodeURIComponent(scope)}`, { headers: g7bHeaders })
  return { response, body: await response.json() as { rows: { id: string }[]; matched: number; error?: string } }
}

it('counts reports about the record and its parts at every depth, including pipeline blocks and their modules', async () => {
  const module = await list(moduleId)
  expect(module.response.status).toBe(200)
  expect(module.body.rows.map(row => row.id).sort()).toEqual([direct, runReport, deepReport].sort())
  const pipeline = await list(pipelineId)
  expect(pipeline.response.status).toBe(200)
  expect(pipeline.body.rows.map(row => row.id).sort()).toEqual([direct, runReport, pipelineReport, deepReport, blockReport].sort())
  expect(pipeline.body.rows.map(row => row.id)).not.toContain(otherReport)
  expect((await list('missing-record')).response.status).toBe(404)
  const wrong = await list(unrelatedId)
  expect(wrong.response.status).toBe(400)
  expect(wrong.body.error).toBeTruthy()
})

it('shows recent reports and a link to the same narrowed list on each page', async () => {
  for (const [path, title, expected] of [[`/r/${moduleId}`, 'Made-up run report', 3], [`/pipeline/${pipelineId}`, 'Made-up pipeline report', 5]] as const) {
    await office.page.goto(`${office.site}/?lang=en#${path}`)
    await waitForThePage(office.page, 60_000)
    const panel = office.page.locator('.reports-scope')
    await panel.getByText(title, { exact: true }).waitFor({ timeout: 60_000 })
    expect(await panel.locator('p').allTextContents()).toContain(t('reports.scope.total', { n: expected }))
    await panel.getByRole('link', { name: t('reports.scope.view' as never) }).click()
    await office.page.locator('.rpts-row').first().waitFor({ timeout: 60_000 })
    expect(office.page.url()).toContain(`scope=${path.includes('/pipeline/') ? pipelineId : moduleId}`)
    expect(await office.page.locator('.rpts-scope h2').count()).toBe(1)
    await office.page.getByRole('link', { name: t('reports.scope.clear' as never) }).click()
    expect(office.page.url()).not.toContain('scope=')
  }
}, 180_000)
