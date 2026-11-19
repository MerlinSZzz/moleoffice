// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
let task: string
let person: Record<string, string>
let point: string
const title = 'A made-up point about a package'
const reason = 'A made-up guard was more than asked.'
const pictures = process.env['W13Y_HAND_BACK_PICTURES']

async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const answer = await fetch(`${app.api}/api/records`, { method: 'POST', headers: person, body: JSON.stringify({ kind, title, data }) })
  expect(answer.status, await answer.clone().text()).toBe(201)
  return String((await answer.json()).record.id)
}
async function setInspection(enabled: boolean): Promise<void> {
  const answer = await fetch(`${app.api}/api/workspaces/default`, { method: 'PATCH', headers: person, body: JSON.stringify({ packageInspection: enabled }) })
  expect(answer.status, await answer.clone().text()).toBe(200)
}
async function taskPage(theme = 'light'): Promise<void> {
  const url = `${app.site}/?lang=en&mode=normal&look=${theme}#/r/${task}`
  if (app.page.url() === url) await app.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  else await app.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.tpp-state, .tpp-unreadable').first().waitFor({ timeout: 60_000 })
}

beforeAll(async () => {
  const memory = () => Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim())
  let used = memory()
  console.log(`${new Date().toISOString()} browser memory ${used}`)
  if (used > 20 * 1024 ** 3) {
    await new Promise((resolve) => setTimeout(resolve, 120_000))
    used = memory()
    console.log(`${new Date().toISOString()} browser memory ${used}`)
    expect(used).toBeLessThanOrEqual(20 * 1024 ** 3)
  }
  app = await liveApp({ name: 'made-up-handback-pictures', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const theme = await bundlePageCode({ stdin: { contents: "localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') || 'light')", loader: 'js' }, bundle: true, write: false, platform: 'browser' })
  await app.page.addInitScript({ content: theme.outputFiles[0]!.text })
  person = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader(join(app.dir, 'keys.json')) }
  const parent = await file('task', 'A made-up parent task')
  task = await file('task', 'A made-up handed-back package')
  point = await file('backlog_item', title, { line: 'made-up-line', number: 'made-up-point', placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up.', doneWhen: 'Made up.', state: 'todo' })
  const db = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    const row = db.prepare('SELECT data FROM records WHERE id = ?').get(task) as { data: string }
    const data = JSON.parse(row.data) as Record<string, unknown>
    // The package and check are made up for the page; separate door tests write real hand-backs and verdicts.
    data.package = {
      bundleId: 'made-up-bundle', forTheOutside: 'Made-up work.', acceptance: 'Made-up acceptance.',
      parent: { kind: 'task', id: parent }, lines: ['made-up-line'], pointIds: [point],
      materials: [{ kind: 'point', ref: point, says: title }], at: '2026-01-01 12:00:00', by: { actorType: 'human', actorId: THE_PERSON },
      handedBack: [{ by: { actorType: 'agent', actorId: 'made-up-worker' }, at: '2026-01-01 12:01:00', order: 1, points: [{ pointId: point, outcome: 'done', words: 'Made-up work is done.' }] }],
      checks: [{ by: { actorType: 'agent', actorId: 'made-up-inspector' }, at: '2026-01-01 12:02:00', order: 2, answer: 'refused', words: reason, points: [{ pointId: point, judged: 'more_than_asked', holds: false, why: reason, rulesKept: false, outcome: 'not' }] }],
    }
    db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), task)
  } finally { db.close() }
}, 300_000)

afterAll(async () => {
  if (app !== undefined) {
    const bytes = execFileSync('du', ['-sb', app.dir], { encoding: 'utf8' }).split('\t')[0]
    console.log(`${new Date().toISOString()} made-up office bytes ${bytes}`)
    await app.stop()
  }
}, 60_000)

it('shows the opinion beside its point only when the project enables inspection', async () => {
  const times: number[] = []
  const goSettings = await bundlePageCode({ stdin: { contents: `location.hash = ${JSON.stringify('#/settings/reviewlevel')}`, loader: 'js' }, bundle: true, write: false, platform: 'browser' })
  const goTask = await bundlePageCode({ stdin: { contents: `location.hash = ${JSON.stringify(`#/r/${task}`)}`, loader: 'js' }, bundle: true, write: false, platform: 'browser' })
  const projectReads: string[] = []
  app.page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/workspaces') projectReads.push(request.url())
  })
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    await taskPage()
    times.push(Math.round(performance.now() - start))
    if (i === 0) expect(projectReads).toHaveLength(2)
  }
  console.log(`${new Date().toISOString()} task page takes in ms ${times.join(', ')}`)
  await setInspection(false)
  await taskPage()
  expect(await app.page.locator('.tpp-points').count()).toBe(0)
  await app.page.evaluate(goSettings.outputFiles[0]!.text)
  const inspection = app.page.locator('.rvl-package-inspection')
  await inspection.getByRole('button', { name: t('delegation.inspection.on'), exact: true }).click()
  await inspection.locator('button[aria-pressed="true"]').filter({ hasText: t('delegation.inspection.on') }).waitFor()
  await app.page.evaluate(goTask.outputFiles[0]!.text)
  const row = app.page.locator('.tpp-points li').first()
  await row.waitFor()
  expect(await row.textContent()).toContain(title)
  expect(await row.textContent()).toContain(t('delegation.inspection.judged.more_than_asked'))
  expect(await row.textContent()).toContain(t('delegation.inspection.rulesNotKept'))
  expect(await row.textContent()).toContain(reason)
  await app.page.evaluate(goSettings.outputFiles[0]!.text)
  await inspection.getByRole('button', { name: t('delegation.inspection.off'), exact: true }).click()
  await inspection.locator('button[aria-pressed="true"]').filter({ hasText: t('delegation.inspection.off') }).waitFor()
  await app.page.evaluate(goTask.outputFiles[0]!.text)
  await app.page.locator('.tpp-state, .tpp-unreadable').first().waitFor()
  expect(await app.page.locator('.tpp-points').count()).toBe(0)
  if (pictures === undefined) return
  mkdirSync(pictures, { recursive: true })
  for (const enabled of [false, true]) {
    await setInspection(enabled)
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
      await app.page.setViewportSize({ width, height: 1000 })
      await taskPage(theme)
      expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
      const block = app.page.locator(enabled ? '.tpp-points' : '.tpp-state, .tpp-unreadable').first()
      await block.waitFor()
      await putTheMadeUpLabelIn(app.page, 'Made-up data — an invented package and point', block, 'handed-back package')
      await app.page.mouse.move(0, 0)
      await app.page.screenshot({ path: join(pictures, `task-${enabled ? 'on' : 'off'}-${width}-${theme}.png`) })
    }
  }
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
    await app.page.setViewportSize({ width, height: 1000 })
    await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/settings/reviewlevel`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    const block = app.page.locator('.rvl-package-inspection')
    await block.waitFor({ timeout: 60_000 })
    expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
    await putTheMadeUpLabelIn(app.page, 'Made-up data — an invented project', block, 'package inspection setting')
    await app.page.mouse.move(0, 0)
    await app.page.screenshot({ path: join(pictures, `settings-${width}-${theme}.png`) })
  }
}, 600_000)
