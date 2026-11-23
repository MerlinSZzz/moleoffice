// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING PAGE: ONE LIST AT A TIME, LABELS ON ITS ROWS, AND A RULES TAB, IN A REAL BROWSER.
 *
 * The page draws a table of every list at a glance,
 * a press for each role and a tab for each project, and only the picked list under them. A row says what it is for
 * through its labels. The meanings of the labels and the fixed rules of the roll are on one tab of their own.
 *
 *   1. The page holds no explanatory sentence: not the old lede, not the old rule and not the sentence that said a
 *      project's list replaces the every-project list, and no fold. Those words are read from the word list.
 *   2. The glance table has a row for each role and a column for every project and each project with a list. A cell
 *      names the row the tools take and, for workers, the rows the roll draws for each label. A cell with no list
 *      says so. Pressing a cell opens that list below.
 *   3. The role presses and the project tabs open one list. A row shows its labels by name, its probability, a 0 as
 *      "Not drawn", and an empty Out until as nothing at all. The worker list says, for each label, which rows the
 *      roll draws and how often, as the roll itself answers it: a row still out is not among them, a label whose rows
 *      are all at 0 takes the marked row, and a label no row carries takes none.
 *   4. A row's difficulty, quota, cost and reason are one press away, under More.
 *   5. The change panel offers every label as a tick box and an Out until field, and saving them changes the row.
 *   6. The Rules tab lists each label with its meaning, or says that nobody has written one, and its rows. A label is
 *      made there, behind its own press as every box on this page is, and the page shows the name it was stored as. A meaning is written there. A removal asks first, and
 *      a label a row carries is refused in words. Under the labels are the fixed rules, one line each, read through
 *      the word list from the code's own list.
 *   7. A row's history that reaches back before migration 0349 still opens. A change written then holds the row's
 *      work group, and the history shows that group as it was stored, with no label guessed for it.
 *
 * Every casting and every label here is the test's own made-up sample. No width or theme scrolls the page sideways.
 * With CASTING_SHOTS set to a folder, the page is photographed at 1440 and 390 in light: the
 * picked list with a change panel open, and the Rules tab. No model is called.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CASTING_LABEL_RULES } from '../src/shared/casting.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
/** The test's own labels: one with a meaning, one without, and one no row carries. */
let hardLabel = 0
let simpleLabel = 0
/** The test's own castings of the worker role in every project, one in the sample project, and one inspector's. */
let marked = 0
let drawn = 0
let out = 0
let zero = 0
let own = 0
let inspector = 0
const WIDTHS = [1440, 390] as const
const THEMES = ['light'] as const
const PAGE = '.cast'
const PROJECT = 'sample-project'
const MEANING = "The test's own made-up meaning of hard work."
const en = createI18n('en').t

const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function post(path: string, body: unknown): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function read(path: string): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { headers })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

/** A row as the Casting door stores it, read back from GET /api/casting and never from the page. */
async function stored(id: number): Promise<Record<string, any>> {
  for (const card of (await read('/api/casting'))['roles'] as Record<string, any>[]) {
    for (const scope of card['scopes'] as Record<string, any>[]) {
      const row = (scope['castings'] as Record<string, any>[]).find((one) => one['id'] === id)
      if (row !== undefined) return row
    }
  }
  throw new Error(`The test's own office holds no casting row ${String(id)}.`)
}

async function open(address = '#/casting'): Promise<void> {
  await app.page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(`${PAGE} .cast-glance-table`, { timeout: 30_000 })
}

/** Opens one role's list: the role's press, then the project's tab. */
async function pick(role: string, project = ''): Promise<void> {
  await app.page.locator(`${PAGE} .cast-pick button[data-role="${role}"]`).click()
  await app.page.locator(`${PAGE} .cast-projects button[role="tab"][data-project="${project}"]`).click()
  await app.page.waitForSelector(`${PAGE} section.cast-role[data-role="${role}"] .cast-scope[data-project="${project}"]`, { timeout: 20_000 })
}

const row = (id: number) => app.page.locator(`${PAGE} tbody[data-casting="${String(id)}"]`)
const label = (id: number) => app.page.locator(`${PAGE} .cast-labels tr[data-label="${String(id)}"]`)
const view = (name: 'rows' | 'rules') => app.page.locator(`${PAGE} .cast-views button[role="tab"][data-view="${name}"]`)

/** No sideways scrolling, and no list, form or label table wider than its box, at any width or theme; a picture of each. */
async function lookAtEveryWidth(what: string): Promise<void> {
  const dir = process.env['CASTING_SHOTS']
  if (dir) mkdirSync(dir, { recursive: true })
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(sideways, `${what} scrolls sideways at ${String(width)} in ${theme}`).toBe(0)
      const wider = await app.page.evaluate(() =>
        [...document.querySelectorAll('.cast .cast-role, .cast .cast-form, .cast .cast-rules')]
          .filter((box) => box.scrollWidth > box.clientWidth)
          .map((box) => `${box.className} is ${String(box.scrollWidth)}px wide in a box of ${String(box.clientWidth)}px`),
      )
      expect(wider, `at ${String(width)} in ${theme}`).toEqual([])
      if (dir) await app.page.screenshot({ path: `${dir}/${what}-${String(width)}-${theme}.png`, fullPage: true })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-casting-labels-and-rules', viewport: { width: 1440, height: 1000 } })
  await post('/api/workspaces', { id: PROJECT, title: 'A sample project' })
  hardLabel = (await post('/api/casting/labels', { name: 'hard', meaning: { value: MEANING } }))['label'].id as number
  simpleLabel = (await post('/api/casting/labels', { name: 'simple' }))['label'].id as number
  await post('/api/casting/labels', { name: 'nobody-carries-it' })
  // THE FIRST ROW ADDED TO A LIST CARRIES THE MARK, as the Casting door marks it.
  marked = (await post('/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: 'sample-model-marked' },
    labels: { value: 'simple, hard' },
    probability: { value: '0' },
    why: { value: "The test's own sample casting, marked and at 0." },
  }))['casting'].id as number
  drawn = (await post('/api/casting/worker', {
    program: { value: 'codex' },
    model: { value: 'sample-model-drawn' },
    labels: { value: 'hard' },
    probability: { value: '70%' },
    difficulty: { value: 'long plans (sample)' },
    why: { value: "The test's own sample casting the roll draws for hard work." },
  }))['casting'].id as number
  out = (await post('/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: 'sample-model-out' },
    labels: { value: 'hard' },
    probability: { value: '30%' },
    out_until: { value: '2099-01-02 09:30' },
    why: { value: "The test's own sample casting, out until a made-up time." },
  }))['casting'].id as number
  zero = (await post('/api/casting/worker', {
    program: { value: 'dsh' },
    model: { value: 'sample-model-zero' },
    labels: { value: 'simple' },
    probability: { value: '0' },
    why: { value: "The test's own sample casting at 0." },
  }))['casting'].id as number
  own = (await post('/api/casting/worker', { project: PROJECT, program: { value: 'claude-code' }, model: { value: 'sample-model-project' }, labels: { value: 'hard' }, probability: { value: '1' } }))['casting'].id as number
  inspector = (await post('/api/casting/inspector', { program: { value: 'codex' }, model: { value: 'sample-model-inspector' } }))['casting'].id as number
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Casting page, in the browser', () => {
  it('holds no explanatory sentence, and shows every list at a glance with a press to open each', async () => {
    await open()
    const text = String(await app.page.locator(PAGE).textContent())
    for (const key of ['casting.lede', 'casting.rule', 'casting.projectReplaces'] as const) expect(text, key).not.toContain(en(key))
    expect(await app.page.locator(`${PAGE} details`).count()).toBe(0)

    // A ROW FOR EACH ROLE, A COLUMN FOR EVERY PROJECT AND FOR THE PROJECT WITH A LIST OF ITS OWN.
    const glance = app.page.locator(`${PAGE} .cast-glance-table`)
    expect(await glance.locator('tbody tr').evaluateAll((all) => all.map((one) => one.getAttribute('data-role')))).toEqual(['worker', 'supervisor', 'secretary', 'inspector'])
    expect(await glance.locator('tbody tr[data-role="worker"] td').evaluateAll((all) => all.map((one) => one.getAttribute('data-project')))).toEqual(['', PROJECT])
    const workers = String(await glance.locator('tr[data-role="worker"] td[data-project=""]').textContent())
    expect(workers).toContain('sample-model-marked')
    expect(workers).toContain('sample-model-drawn')
    expect(String(await glance.locator(`tr[data-role="worker"] td[data-project="${PROJECT}"]`).textContent())).toContain('sample-model-project')
    expect(await glance.locator('tr[data-role="supervisor"] td[data-project=""]').textContent()).toBe(en('casting.glance.nobody'))
    expect(await glance.locator(`tr[data-role="inspector"] td[data-project="${PROJECT}"]`).textContent()).toBe(en('casting.glance.takesEvery'))

    // PRESSING A CELL OPENS THAT LIST BELOW, and only that list.
    await glance.locator(`tr[data-role="worker"] td[data-project="${PROJECT}"] button`).click()
    await app.page.waitForSelector(`${PAGE} section.cast-role[data-role="worker"] .cast-scope[data-project="${PROJECT}"]`, { timeout: 20_000 })
    expect(await app.page.locator(`${PAGE} section.cast-role`).count()).toBe(1)
    expect(await app.page.locator(`${PAGE} tbody[data-casting]`).evaluateAll((all) => all.map((one) => one.getAttribute('data-casting')))).toEqual([String(own)])
    expect(await app.page.locator(`${PAGE} .cast-pick button[data-role="worker"]`).getAttribute('aria-pressed')).toBe('true')
    expect(await app.page.locator(`${PAGE} .cast-projects button[data-project="${PROJECT}"]`).getAttribute('aria-selected')).toBe('true')
  }, 240_000)

  it('shows one list at a time, each row with its labels, and what the roll draws for each label', async () => {
    await open()
    await pick('inspector')
    expect(await app.page.locator(`${PAGE} tbody[data-casting]`).evaluateAll((all) => all.map((one) => one.getAttribute('data-casting')))).toEqual([String(inspector)])
    await pick('worker')
    expect(await app.page.locator(`${PAGE} tbody[data-casting]`).evaluateAll((all) => all.map((one) => one.getAttribute('data-casting')))).toEqual([marked, drawn, out, zero].map(String))

    // A ROW SAYS WHAT IT IS FOR THROUGH ITS LABELS, by name.
    expect(await row(drawn).locator('.cast-cell-labels .cast-value').textContent()).toBe('hard')
    expect(await row(marked).locator('.cast-cell-labels .cast-value').textContent()).toBe('hard, simple')
    expect(await row(drawn).locator('.cast-cell-probability .cast-value').textContent()).toBe('70%')
    // A 0 IS ONLY "NOT DRAWN", and an empty Out until is blank.
    expect(await row(zero).locator('.cast-cell-probability .cast-value').textContent()).toBe(en('casting.notDrawn'))
    expect(await row(zero).locator('.cast-cell-out_until').textContent()).toBe('')
    expect(String(await row(out).locator('.cast-cell-out_until .cast-value').textContent())).toContain('2099-01-02 09:30')

    // FOR EACH LABEL, WHAT THE ROLL DRAWS: the row still out is not among the hard rows, the simple rows are all at 0
    // so the marked row is taken, and a label no row carries takes no row.
    const summary = app.page.locator(`${PAGE} .cast-summary`)
    const hard = String(await summary.locator(`li[data-label="${String(hardLabel)}"]`).textContent())
    expect(hard).toContain('sample-model-drawn')
    expect(hard).toContain('100%')
    expect(hard).not.toContain('sample-model-out')
    const simple = String(await summary.locator(`li[data-label="${String(simpleLabel)}"]`).textContent())
    expect(simple).toContain('sample-model-marked')
    expect(simple).not.toContain('sample-model-zero')
    expect(await summary.locator('li[data-label]').last().textContent()).toContain(en('casting.notDrawn'))

    // THE OTHER CELLS ARE ONE PRESS AWAY, an empty one saying so.
    expect(await row(drawn).locator('.cast-cell-difficulty').count()).toBe(0)
    await row(drawn).getByRole('button', { name: en('casting.more') }).click()
    expect(await row(drawn).locator('.cast-cell-difficulty .cast-value').textContent()).toBe('long plans (sample)')
    expect(await row(drawn).locator('.cast-cell-quota').textContent()).toContain(en('casting.noDecision'))
  }, 240_000)

  it('changes a row’s labels with tick boxes and its Out until in the change panel', async () => {
    await open()
    await pick('worker')
    await row(zero).getByRole('button', { name: en('casting.change') }).click()
    const boxes = row(zero).locator('.cast-form input[type="checkbox"]')
    expect(await boxes.evaluateAll((all) => all.map((one) => `${(one as HTMLInputElement).value}/${String((one as HTMLInputElement).checked)}`))).toEqual([
      'hard/false', 'simple/true', 'nobody-carries-it/false',
    ])
    await row(zero).locator('.cast-form input[type="checkbox"][value="hard"]').check()
    await row(zero).locator('.cast-form input[type="checkbox"][value="simple"]').uncheck()
    await row(zero).locator('.cast-form input[id$="-out_until"]').fill('2099-03-04 10:15')
    await lookAtEveryWidth('labels-change')
    await row(zero).getByRole('button', { name: en('casting.save') }).click()
    await app.page.waitForFunction((id) => document.querySelector(`tbody[data-casting="${id}"] .cast-cell-labels .cast-value`)?.textContent === 'hard', String(zero), { timeout: 20_000 })
    const after = await stored(zero)
    expect(after['cells']['labels']['value']).toBe(JSON.stringify([hardLabel]))
    expect(after['cells']['out_until']['value']).not.toBeNull()
    expect(String(await row(zero).locator('.cast-cell-out_until .cast-value').textContent())).toContain('2099-03-04 10:15')
  }, 240_000)

  it('adds a row with the labels chosen in the form', async () => {
    await open()
    await pick('worker')
    const add = app.page.locator(`${PAGE} section.cast-role[data-role="worker"] .cast-add`)
    await add.getByRole('button', { name: en('casting.add') }).click()
    expect(await add.locator('input[type="checkbox"]').evaluateAll((all) => all.map((one) => (one as HTMLInputElement).value))).toEqual([
      'hard', 'simple', 'nobody-carries-it',
    ])
    await add.locator('input[id$="-model"]').fill('sample-model-added-with-labels')
    await add.locator('input[type="checkbox"][value="hard"]').check()
    await add.locator('input[type="checkbox"][value="simple"]').check()
    await add.getByRole('button', { name: en('casting.save') }).click()
    await app.page.waitForFunction(() => document.querySelector('.cast-role')?.textContent?.includes('sample-model-added-with-labels') === true, undefined, { timeout: 20_000 })
    const castings = (await read('/api/casting'))['roles'].find((card: { role: string }) => card.role === 'worker')['scopes'][0]['castings'] as Record<string, any>[]
    const added = castings.find((one) => one['cells']['model']['value'] === 'sample-model-added-with-labels')
    expect(added, 'the form added its casting').toBeDefined()
    expect(added!['cells']['labels']['value']).toBe(JSON.stringify([hardLabel, simpleLabel]))
    expect(await row(Number(added!['id'])).locator('.cast-cell-labels .cast-value').textContent()).toBe('hard, simple')
  }, 240_000)

  it('lists the labels and their meanings on the Rules tab, makes one, writes a meaning, and asks before a removal', async () => {
    await open()
    await view('rules').click()
    await app.page.waitForSelector(`${PAGE} .cast-rules .cast-labels`, { timeout: 20_000 })
    expect(await view('rules').getAttribute('aria-selected')).toBe('true')
    expect(await app.page.locator(`${PAGE} .cast-glance-table`).count()).toBe(0)
    expect(await label(hardLabel).locator('.cast-label-meaning .cast-value').textContent()).toBe(MEANING)
    expect(await label(simpleLabel).locator('.cast-label-meaning').textContent()).toContain(en('casting.label.noMeaning'))

    // THE FIXED RULES, one line each, in the code's order and the word list's words.
    const lines = app.page.locator(`${PAGE} .cast-rule-lines li`)
    expect(await lines.evaluateAll((all) => all.map((one) => one.getAttribute('data-rule')))).toEqual(CASTING_LABEL_RULES.map((rule) => rule.id))
    expect(await lines.allTextContents()).toEqual(CASTING_LABEL_RULES.map((rule) => en(`casting.rule.${rule.id}` as Parameters<typeof en>[0])))

    // A LABEL IS MADE HERE, behind its own press, and the page shows back the name it was stored as.
    expect(await app.page.locator(`${PAGE} .cast-rules input, ${PAGE} .cast-rules textarea`).count()).toBe(0)
    await app.page.locator(`${PAGE} .cast-rules`).getByRole('button', { name: en('casting.label.add') }).click()
    const form = app.page.locator(`${PAGE} .cast-label-add`)
    await form.locator('input[id$="-name"]').fill('  Long Plans ')
    await form.getByRole('button', { name: en('casting.save') }).click()
    await app.page.waitForSelector(`${PAGE} .cast-label-stored`, { timeout: 20_000 })
    expect(await app.page.locator(`${PAGE} .cast-label-stored`).textContent()).toBe(en('casting.label.storedAs', { name: 'long-plans' }))
    const made = ((await read('/api/casting'))['labels'] as { id: number; name: string }[]).find((one) => one.name === 'long-plans')
    expect(made, 'the form made its label').toBeDefined()
    const madeId = Number(made?.id)

    // A MEANING IS WRITTEN HERE.
    await label(madeId).getByRole('button', { name: en('casting.change') }).click()
    await label(madeId).locator('textarea[id$="-meaning"]').fill("The test's own made-up meaning of long plans.")
    await label(madeId).getByRole('button', { name: en('casting.save') }).click()
    await app.page.waitForFunction((id) => document.querySelector(`.cast-labels tr[data-label="${id}"] .cast-label-meaning .cast-value`)?.textContent === "The test's own made-up meaning of long plans.", String(madeId), { timeout: 20_000 })
    await lookAtEveryWidth('labels-rules')

    // A REMOVAL ASKS FIRST; a label a row carries is refused in words, and one no row carries goes.
    await label(hardLabel).getByRole('button', { name: en('casting.remove') }).click()
    expect(await label(hardLabel).locator('.cast-said').textContent()).toBe(en('casting.label.removeAsk', { name: 'hard' }))
    await label(hardLabel).getByRole('button', { name: en('casting.removeYes') }).click()
    await app.page.waitForSelector(`${PAGE} .cast-labels tr[data-label="${String(hardLabel)}"] .cast-refuse`, { timeout: 20_000 })
    expect(String(await label(hardLabel).locator('.cast-refuse').textContent())).toContain('hard')
    await label(madeId).getByRole('button', { name: en('casting.remove') }).click()
    await label(madeId).getByRole('button', { name: en('casting.removeYes') }).click()
    await app.page.waitForFunction((id) => document.querySelector(`.cast-labels tr[data-label="${id}"]`) === null, String(madeId), { timeout: 20_000 })
    expect(((await read('/api/casting'))['labels'] as { name: string }[]).map((one) => one.name)).not.toContain('long-plans')
  }, 240_000)

  it('opens a row’s history written before the labels, and shows the work group it stored', async () => {
    // A CHANGE WRITTEN BEFORE MIGRATION 0349 holds a work group and no labels or Out until. The test plants one in its
    // own office, in place of the newest image of the inspector's row.
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      const newest = db.prepare('SELECT id, "after" FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1').get(inspector) as { id: number; after: string }
      const { labels: _labels, out_until: _out, ...old } = JSON.parse(newest.after) as Record<string, unknown>
      const from = { at: '2026-10-30 10:00:00', by: { kind: 'migration', id: '0318' }, decision: null, decisionWords: 'The old list named this group.', moved: false, copied: false }
      db.prepare('UPDATE casting_row_changes SET what = ?, by_kind = ?, by_id = ?, "after" = ? WHERE id = ?')
        .run('migrate', 'migration', '0318', JSON.stringify({ ...old, work_group: { value: 'hard', from } }), newest.id)
      // The later label cell carries the old decision words, with migration 0349 as its writer.
      db.prepare('UPDATE casting_rows SET labels = ?, labels_from = ? WHERE id = ?')
        .run(JSON.stringify([hardLabel]), JSON.stringify({ ...from, by: { kind: 'migration', id: '0349' } }), inspector)
    } finally {
      db.close()
    }
    await open()
    await pick('inspector')
    const migratedCell = row(inspector).locator('.cast-cell-labels')
    expect(await migratedCell.locator('.cast-value').textContent()).toBe('hard')
    const source = String(await migratedCell.locator('.cast-from').textContent())
    expect(source).toContain(en('casting.by.migration', { id: '0349' }))
    expect(source).toContain(en('casting.from.theOldListSaid', { words: 'The old list named this group.' }))
    await row(inspector).getByRole('button', { name: en('casting.history') }).click()
    await app.page.waitForSelector(`${PAGE} tbody[data-casting="${String(inspector)}"] .cast-history li.cast-entry`, { timeout: 20_000 })
    // THE GROUP AS IT WAS STORED, beside the empty side of the add; and no label line, because no label is guessed.
    const lines = await row(inspector).locator('.cast-history .cast-entry-cells li').allTextContents()
    expect(lines).toContain(`${en('casting.col.work_group')} ${en('casting.emptyCell')} → hard`)
    expect(lines.filter((line) => line.startsWith(en('casting.col.labels')))).toEqual([])
    expect(await row(inspector).locator('.cast-history .cast-entry-what').first().textContent()).toBe(en('casting.what.migratedBy', { id: '0318' }))
  }, 240_000)
})
