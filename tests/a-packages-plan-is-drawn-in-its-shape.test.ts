// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S PLAN IS DRAWN IN ITS SHAPE, AND AN OLDER PLAN IS DRAWN AS IT WAS.
 *
 * The package's own page draws the newest restatement's plan: one line for each worker with its whole outcome, its
 * points, the files or area it changes, its difficulty and model with their reasons; then the package's waves and
 * what each later wave waits for; then the office's hints, as the align door stored them. There is no place for a
 * worker's own steps. A plan written before this shape existed is drawn as the words it was, and an alignment written
 * before the office stored hints says they were not stored rather than that there was no hint.
 *
 * THE HINT WORDS ARE STORED, NOT WORKED OUT HERE. This test deletes the Casting row that gave one hint after the align
 * door wrote it, so a page that worked the hints out again would draw different words from the stored ones.
 *
 * Everything here is made up. The test office is this file's own, and the pictures go to the folder named by
 * `W13N_FQ_A_PICTURES` when it is set; the ordinary run takes no picture.
 *
 * MUTATION: remove `<PackageAlignmentPlan record={record} />` from src/web/components/TaskPackagePanel.tsx. Every case
 * goes red because the plan's part is not on the page.
 */

import { aMadeUpModuleForPackage, httpPackageFixture } from './module-package-fixture.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const asThePerson = (): Record<string, string> => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })
const asAgent = (handle: string): Record<string, string> => ({ ...asThePerson(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let app: LiveApp
let shapedTask = ''
let oldTask = ''
let recordedRun = ''
let castHard = 0
const OLD_PLAN = 'First read the made-up file. Then change it. Then test it. Then report.'
const HARD_ROW_MODEL = 'a-made-up-row-model'

async function send(path: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `${path}: ${text}`).toBe(201)
  return JSON.parse(text) as Record<string, unknown>
}

async function file(kind: string, title: string, data: Record<string, unknown>, headers = asThePerson()): Promise<string> {
  return String(((await send('/api/records', headers, { kind, title, data })).record as { id: string }).id)
}

async function aPoint(name: string): Promise<string> {
  return file('backlog_item', name, {
    line: 'a-made-up-line', number: name, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo',
  })
}

/** Read or write one made-up record's data straight in this test office's own database. */
function readData(id: string): Record<string, any> {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const row = db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    return JSON.parse(row.data) as Record<string, any>
  } finally {
    db.close()
  }
}

function writeData(id: string, data: Record<string, any>): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-packages-plan-is-drawn-in-its-shape', viewport: { width: 1440, height: 900 } })
  const recorded = await send('/api/agents/started', asThePerson(), { handle: 'made-up-recorded-worker', name: 'Ann, a made-up recorded worker' })
  const recordedId = String((recorded['agent'] as { id: string }).id)
  const recordedKey = String((recorded['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(recordedKey).toMatch(/^[0-9a-f]{64}$/)
  const asRecorded = { ...asAgent('made-up-recorded-worker'), 'x-mole-office-key': recordedKey }
  for (const handle of ['made-up-plan-maker', 'made-up-plan-worker']) {
    await send('/api/agents/started', asThePerson(), { handle, name: handle })
  }
  const maker = asAgent('made-up-plan-maker')
  const worker = asAgent('made-up-plan-worker')
  const parent = await file('task', 'A made-up parent task of the plans', {}, maker)
  const door = (task: string, name: string, headers: Record<string, string>, body: unknown) => send(`/api/delegation/${task}/${name}`, headers, body)

  for (const name of ['hard', 'simple']) await send('/api/casting/labels', asThePerson(), { name })

  // ONE HARD ROW, WHICH THE HINT READS, AND WHICH IS REMOVED AFTER THE DOOR STORED ITS HINTS.
  const casting = await send('/api/casting/worker', asThePerson(), {
    project: 'default', program: { value: 'claude-code' }, model: { value: HARD_ROW_MODEL }, effort: { value: 'high' }, labels: { value: 'hard' },
  })
  castHard = Number((casting['casting'] as { id: number }).id)

  const firstPoint = await aPoint('A made-up point of the shaped plan')
  const secondPoint = await aPoint('A second made-up point of the shaped plan')
  shapedTask = await file('task', 'A made-up package with a plan in its shape', {}, maker)
  await door(shapedTask, 'package', maker, { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))], parent: { kind: 'task', id: parent }, pointIds: [firstPoint, secondPoint] })
  await door(shapedTask, 'take-inside', worker, {})
  await door(shapedTask, 'align', worker, {
    restated: 'I will make the made-up outcomes whole.',
    plan: {
      workers: [
        {
          worker: 'made-up-plan-worker',
          outcome: 'The whole made-up outcome',
          points: [firstPoint],
          files: ['src/made-up/'],
          difficulty: 'hard',
          difficultyWhy: 'One made-up line changes in one made-up file.',
          model: 'a-made-up-plan-model',
          modelWhy: '',
        },
        {
          worker: 'made-up-plan-second',
          outcome: 'The other whole made-up outcome',
          points: [secondPoint],
          files: ['src/made-up/one.ts'],
          difficulty: 'simple',
          difficultyWhy: 'It is one made-up file.',
          model: 'a-made-up-simple-plan-model',
          modelWhy: '',
        },
        {
          worker: 'made-up-plan-third',
          outcome: 'A third whole made-up outcome',
          points: [secondPoint],
          files: ['src/other/'],
          difficulty: 'middling',
          difficultyWhy: 'The supervisor wrote this word, so it is shown as they wrote it.',
          model: 'a-made-up-third-model',
          modelWhy: 'The supervisor chose this made-up model.',
        },
      ],
      waves: 2,
      waits: [''],
    },
    goOnWhy: 'The second wave waits for the made-up landing, and that is outside this line.',
  })

  // A FINISHED RUN NAMING THIS PACKAGE, so the page draws the worker list beside the plan. The office alone writes
  // `workerPackage`; this test office is made up, so the field is put on the record directly.
  const run = await file('session', 'A made-up running worker run', {
    state: 'running', runtime: 'claude-code', model: 'a-made-up-worker-model', servingAgent: 'made-up-recorded-worker',
    servingAgentId: recordedId, startedAt: '2026-11-18 08:00:00',
  }, asRecorded)
  recordedRun = run
  const runData = readData(run)
  runData['workerPackage'] = {
    task: shapedTask, points: [firstPoint], difficulty: 'hard', why: 'This worker was given the made-up point.', askedAt: '2026-11-18 09:00:00',
  }
  writeData(run, runData)

  // THE ROW THE STORED HINT NAMES IS TAKEN AWAY. A page that works the hints out again would say the hard label has no
  // model, not that it gives HARD_ROW_MODEL.
  const removed = await fetch(`${app.api}/api/casting/rows/${String(castHard)}`, { method: 'DELETE', headers: asThePerson() })
  expect(removed.status, await removed.text()).toBe(200)

  const oldPoint = await aPoint('A made-up point of the older plan')
  oldTask = await file('task', 'A made-up package with an older plan', {}, maker)
  await door(oldTask, 'package', maker, { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))], parent: { kind: 'task', id: parent }, pointIds: [oldPoint] })
  await door(oldTask, 'take-inside', worker, {})
  await door(oldTask, 'align', worker, { restated: 'I will do the made-up work in four stages.', plan: OLD_PLAN })
  // AN ALIGNMENT WRITTEN BEFORE HINTS WERE STORED has no `hints` key. The page must say they were not stored rather than
  // say there was no hint.
  const oldData = readData(oldTask)
  delete oldData['package']['alignments'].at(-1).hints
  writeData(oldTask, oldData)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.mouse.move(0, 0)
}

async function thePicture(page: Page, name: string): Promise<void> {
  const folder = process.env['W13N_FQ_A_PICTURES']
  if (folder === undefined || folder === '') return
  mkdirSync(folder, { recursive: true })
  await page.screenshot({ path: join(folder, name), fullPage: true })
}

for (const theme of THEMES) for (const width of WIDTHS) {
  it(`draws the stored plan, its stored hints and its workers at ${width} in the ${theme} theme`, async () => {
    const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 }, reducedMotion: 'reduce' })
    await context.addInitScript((look) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.chat.open', 'no')
    }, theme)
    const page = await context.newPage()
    try {
      await open(page, recordPath(shapedTask))
      const plan = page.locator('#main [data-target="uiSurface/package.plan"]')
      await plan.waitFor({ timeout: 60_000 })
      const said = await plan.innerText()
      expect(said).toContain('made-up-plan-worker')
      expect(said).toContain('The whole made-up outcome')
      expect(said).toContain('src/made-up/one.ts')
      // THE DIFFICULTY IS THE SUPERVISOR'S WORD, NOT A WORD THE PAGE PICKS FROM A LIST.
      expect(said).toContain('middling')
      expect(said, 'the page spelled the difficulty from its own list').not.toContain('Middling')
      expect(said).toContain('simple')
      expect(said).not.toContain('Simple')
      expect(said).toContain('a-made-up-plan-model')
      expect(said).toContain('2 waves')
      expect(said).toContain('the made-up landing')
      // THE HINTS ARE THE ONES THE DOOR STORED. The deleted row is still named, and the simple label still says its rows
      // give no model; both would change if this page worked them out again.
      expect(said).toContain(`The rows for that label give ${HARD_ROW_MODEL}`)
      expect(said).toContain('The rows for that label give no model')
      expect(said).toContain('is not a label')
      expect(said).toContain('middling')
      expect(said).toContain('The package takes 2 waves.')
      const hintItems = plan.locator('.pap-hint-list li')
      expect(await hintItems.count()).toBe(9)
      for (let index = 1; index < 9; index += 1) {
        const above = await hintItems.nth(index - 1).boundingBox()
        const below = await hintItems.nth(index).boundingBox()
        expect(above, `hint ${String(index)} is not drawn`).not.toBeNull()
        expect(below, `hint ${String(index + 1)} is not drawn`).not.toBeNull()
        if (above === null || below === null) continue
        expect(
          below.y - (above.y + above.height),
          `hint ${String(index + 1)} sits on the hint above it at ${String(width)} in the ${theme} theme`,
        ).toBeGreaterThanOrEqual(2)
      }

      const workers = page.locator('section.px-panel').filter({ hasText: 'Its workers' }).last()
      await workers.getByText('made-up-recorded-worker').first().waitFor({ timeout: 60_000 })
      const workersSaid = await workers.innerText()
      expect(workersSaid).toContain('made-up-recorded-worker')
      expect(workersSaid).toContain('running')
      expect(workersSaid).toContain('a-made-up-worker-model')
      await thePicture(page, `joined-package-${width}-${theme}.png`)

      if (width === 1440) {
        await open(page, recordPath(oldTask))
        const older = page.locator('#main [data-target="uiSurface/package.plan"]')
        await older.waitFor({ timeout: 60_000 })
        expect(await older.innerText()).toContain('This plan was written before plans had a fixed shape')
        expect(await older.locator('pre.pap-text').innerText()).toBe(OLD_PLAN)
        expect(await older.innerText()).toContain("The office's hints were not stored with this alignment")
        expect(await older.innerText(), 'an alignment with no stored hints was said to have no hint').not.toContain(enWave13n['planShape.noHints'])
      }
    } finally {
      await context.close()
    }
  }, 240_000)
}
