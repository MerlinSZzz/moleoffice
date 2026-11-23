// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING PAGE (选角表), IN A REAL BROWSER AGAINST A THROWAWAY OFFICE.
 *
 *   1. The page draws a press for each role card and, for the role picked, a tab for every project and for each
 *      project with castings of its own; it draws the picked list only. The one casting the tools take carries
 *      the mark "The tools take this one". A cell names where its value came from, with a link to the decision,
 *      and the cells a row does not show on its line are one press away, under More; an empty cell says so in
 *      words, never as a dash; a role nobody has cast says so. The page draws one list at a time and no explanatory
 *      sentence, so this case presses the role and
 *      the project it reads; the labels and the rules are in the-casting-work-groups-in-the-browser.
 *   2. The person changes a casting with the press on it, and the office reads the change back; the
 *      casting's history shows it.
 *   3. The person moves the mark with the press on another casting. Removing the marked casting while
 *      another remains is refused, in words, under the row; removing one that is not marked works.
 *   4. A page acting as an agent that only names the secretary, with no key, is refused, and the refusal is drawn
 *      in words where the press was. The card it names is the one the server read from the role cards, sent as the
 *      refusal's value and drawn in the page language: at ?lang=zh it is 秘书, not the stored word secretary (problem
 *      XCvn6ypadyMT). MUTATION: CastingPage handing the value to ErrorNote untranslated turns the Chinese check red.
 *      The supervisor has no casting then, so its list draws no table, only the words that say nobody is cast.
 *   5. A page acting as the secretary with its own key draws the same presses, adds a
 *      casting with them and moves the mark, and the casting's history names the secretary by its name.
 *   6. The same page at ?lang=zh draws its words in Chinese, including the translated probability heading.
 *
 * Every casting here is the test's own sample: the models are called sample-model-a, -b and -c, and the
 * reason says it is the test's own sample. No width or theme scrolls the page sideways, and at every width a drawn
 * table's head is as tall as its words, with no empty band under them. With CASTING_SHOTS
 * set to a folder, the page is photographed at 1440, 990, 660 and 390 in light and dark, and at 1440 in
 * Chinese, into it, as the person sees it and as the secretary sees it. No model is called.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { cardWord } from '../src/shared/card-words.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let decision = ''
/** The test's three sample castings of the worker role. */
let first = 0
let second = 0
let own = 0
/** The fixture secretary's own key, as its registration answered it. */
let argusKey = ''
const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
const PAGE = '.cast'

const headers = (type: 'human' | 'agent', id: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })

async function post(path: string, body: unknown, as = headers('human', THE_PERSON)): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: as, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function read(path: string): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { headers: headers('human', THE_PERSON) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function open(address: string): Promise<void> {
  await app.page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(`${PAGE} .cast-table`, { timeout: 30_000 })
}

const row = (id: number) => app.page.locator(`${PAGE} tbody[data-casting="${String(id)}"]`)
const role = (name: string) => app.page.locator(`${PAGE} section.cast-role[data-role="${name}"]`)

/** Opens one role's list with its press; the page draws only the list picked. */
async function pickRole(name: string): Promise<void> {
  await app.page.locator(`${PAGE} .cast-pick button[data-role="${name}"]`).click()
  await app.page.waitForSelector(`${PAGE} section.cast-role[data-role="${name}"]`, { timeout: 20_000 })
}

/** Opens one project's list of the picked role with its tab: '' is every project. */
async function pickProject(project: string): Promise<void> {
  await app.page.locator(`${PAGE} .cast-projects button[role="tab"][data-project="${project}"]`).click()
  await app.page.waitForSelector(`${PAGE} section.cast-role .cast-scope[data-project="${project}"]`, { timeout: 20_000 })
}

/** Opens the cells a row does not show on its line. */
async function more(id: number): Promise<void> {
  await row(id).getByRole('button', { name: createI18n('en').t('casting.more') }).click()
  await row(id).locator('.cast-more').waitFor({ state: 'visible', timeout: 15_000 })
}

/**
 * THE FIRST TABLE HEAD ON THE PAGE, MEASURED AGAINST ITS WORDS.
 *
 * `height` is the head's height. `needed` is what its words need: for each of its two rows, the tallest
 * words in a cell that starts and ends in that row (its lines times the line height), with that cell's
 * padding and bottom border, added up. A cell that spans
 * both rows needs no more than that. `below` is the most empty space any two-row cell leaves under its words,
 * which is the band a person saw at 390 in round 2: the words at the top and an empty strip under them.
 * `spare` is how much taller than two rows' worth a two-row cell is: its own line of words, plus the first
 * row's height, and anything past that is empty space a wrapped word in the second row put there.
 */
async function measureTheHead(): Promise<{ height: number; needed: number; below: number; spare: number }> {
  return app.page.evaluate(() => {
    const head = document.querySelector('.cast .cast-table thead')
    if (head === null) throw new Error('the Casting page draws no table head')
    const words = (cell: Element): DOMRect => {
      const range = document.createRange()
      range.selectNodeContents(cell)
      return range.getBoundingClientRect()
    }
    const padding = (cell: Element): { top: number; bottom: number } => {
      const style = getComputedStyle(cell)
      return { top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth) }
    }
    /** The height of a cell's lines of words: how many lines they take, times the line height. */
    const lines = (cell: Element): number => {
      const range = document.createRange()
      range.selectNodeContents(cell)
      const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      return Math.max(1, tops.size) * parseFloat(getComputedStyle(cell).lineHeight)
    }
    let needed = 0
    let below = 0
    let spare = 0
    const firstRow = head.querySelector('tr')?.getBoundingClientRect().height ?? 0
    for (const row of head.querySelectorAll('tr')) {
      let tallest = 0
      for (const cell of row.querySelectorAll('th')) {
        const pad = padding(cell)
        if ((cell as HTMLTableCellElement).rowSpan === 1) {
          tallest = Math.max(tallest, lines(cell) + pad.top + pad.bottom)
          continue
        }
        const box = cell.getBoundingClientRect()
        below = Math.max(below, box.bottom - pad.bottom - words(cell).bottom)
        // A two-row cell holds one row of words, so it may be empty for the height of the other row, and no more.
        spare = Math.max(spare, box.height - pad.top - pad.bottom - lines(cell) - firstRow)
      }
      needed += tallest
    }
    return {
      height: Math.round(head.getBoundingClientRect().height),
      needed: Math.round(needed),
      below: Math.round(below),
      spare: Math.round(spare),
    }
  })
}

/**
 * No sideways scrolling at any width or theme, and a picture of each when a folder is named. `aTable` is false when the
 * picked list has no casting, so the page draws no table and there is no head to measure.
 */
async function lookAtEveryWidth(what: string, readableStatus?: ReturnType<typeof row>, aTable = true): Promise<void> {
  const dir = process.env['CASTING_SHOTS']
  if (dir) mkdirSync(dir, { recursive: true })
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(sideways, `${what} scrolls sideways at ${String(width)} in ${theme}`).toBe(0)
      if(readableStatus) {
        const bounds=await readableStatus.boundingBox()
        expect(bounds?.width,`the native refusal needs a readable line at ${width} in ${theme}`).toBeGreaterThanOrEqual(Math.min(300,width-80))
      }
      // THE TABLE'S HEAD IS AS TALL AS ITS WORDS, with no empty band under them (round 3, piece 4).
      if (aTable) {
        const head = await measureTheHead()
        expect(head.height, `the head is ${String(head.height)}px tall at ${String(width)} in ${theme}, and its words need ${String(head.needed)}px`).toBeLessThanOrEqual(head.needed + 3)
        expect(head.below, `a two-row cell leaves ${String(head.below)}px empty under its words at ${String(width)} in ${theme}`).toBeLessThanOrEqual(3)
        expect(head.spare, `a two-row cell is ${String(head.spare)}px taller than its words and one row at ${String(width)} in ${theme}`).toBeLessThanOrEqual(3)
      }
      if (dir) await app.page.screenshot({ path: `${dir}/${what}-${String(width)}-${theme}.png`, fullPage: true })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-casting-page', viewport: { width: 1440, height: 1000 } })
  argusKey = String((await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: 'Fixture secretary', runtime: 'claude-code', role: 'secretary' }))['whatToGiveIt']?.key ?? '')
  expect(argusKey, 'the registration answered a key').not.toBe('')
  await post('/api/workspaces', { id: 'sample-project', title: 'A sample project' })
  const filed = await post('/api/records', { kind: 'decision', title: 'A sample decision the test files', data: { governs: [{ wholeProject: true }], replaces: [] } })
  decision = filed['record'].id as string
  first = (await post('/api/casting/worker', {
    program: { value: 'dsh', decision },
    model: { value: 'sample-model-a', decision },
    difficulty: { value: 'simple to hard (sample)', decision },
    probability: { value: '30%' },
    why: { value: "The test's own sample casting." },
  }))['casting'].id as number
  second = (await post('/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: 'sample-model-c' },
    difficulty: { value: 'hard (sample)' },
    cost: { value: 'dear for what it gives (sample)' },
    why: { value: "The test's own second sample casting." },
  }))['casting'].id as number
  own = (await post('/api/casting/worker', { project: 'sample-project', model: { value: 'sample-model-b' } }))['casting'].id as number
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Casting page, in the browser', () => {
  it('draws each role with its castings in groups, the mark, each source, and absence in words', async () => {
    await open('#/casting')
    expect((await app.page.locator(`${PAGE} h1`).textContent())?.trim()).toBe('Casting')
    const roles = await app.page.locator(`${PAGE} .cast-pick button`).evaluateAll((all) => all.map((one) => one.getAttribute('data-role')))
    // NO MAILER SINCE 1 OCTOBER 2026: the mail tool is off the role cards.
    expect(roles).toEqual(['worker', 'supervisor', 'secretary', 'inspector'])
    await pickRole('worker')
    const groups = await app.page.locator(`${PAGE} .cast-projects button[role="tab"]`).evaluateAll((all) => all.map((one) => one.getAttribute('data-project')))
    expect(groups).toEqual(['', 'sample-project'])
    await pickProject('')
    const castings = await role('worker').locator('tbody').evaluateAll((all) => all.map((one) => `${one.getAttribute('data-casting') ?? ''}/${one.getAttribute('data-marked') ?? ''}`))
    expect(castings).toEqual([`${String(first)}/yes`, `${String(second)}/no`])

    // THE MARK IS NAMED PLAINLY, and the other casting offers the press that moves it.
    expect(await row(first).locator('.cast-tools .cast-mark').textContent()).toBe('The tools take this one')
    expect(await row(second).locator('.cast-tools').getByRole('button', { name: 'Make the tools take this one' }).count()).toBe(1)

    // A CELL NAMES THE DECISION IT CAME FROM, AS A LINK, and the Decision column gathers it once.
    // THE LINK READS THE DECISION'S NAME, NEVER ITS ID (an id is a machine word). Nobody wrote a label for the test's
    // decision, so its title stands in. The name arrives after the page draws, so the test waits for it.
    const link = row(first).locator('.cast-cell-model a')
    await app.page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent === 'A sample decision the test files',
      `${PAGE} tbody[data-casting="${String(first)}"] .cast-cell-model a`,
      { timeout: 15_000 },
    )
    expect(await link.textContent()).not.toContain(decision)
    expect(await link.getAttribute('href')).toContain(decision)
    expect(await row(first).locator('.cast-cell-program .cast-value').textContent()).toBe('DeepSeek through dsh')
    await more(first)
    expect(await row(first).locator('.cast-decisions a').textContent()).toBe('A sample decision the test files')
    expect(await row(first).locator('.cast-decisions a').count()).toBe(1)
    expect(await row(first).locator('.cast-cell-difficulty .cast-value').textContent()).toBe('simple to hard (sample)')
    expect(await row(first).locator('.cast-cell-why .cast-from').textContent()).toContain('Set here by')

    // AN EMPTY CELL SAYS SO IN WORDS, a casting with no decision says so, and a role nobody has cast says so.
    expect(await row(first).locator('.cast-cell-effort').textContent()).toBe('Nothing is written here yet.')
    await more(second)
    expect(await row(second).locator('.cast-decisions').textContent()).toBe('No cell of this casting names a decision.')
    await lookAtEveryWidth('casting')
    await pickProject('sample-project')
    expect(await role('worker').locator('tbody').evaluateAll((all) => all.map((one) => `${one.getAttribute('data-casting') ?? ''}/${one.getAttribute('data-marked') ?? ''}`))).toEqual([`${String(own)}/yes`])
    expect(await row(own).locator('.cast-cell-program').textContent()).toBe('Nothing is written here yet.')
    await pickRole('supervisor')
    expect(await role('supervisor').textContent()).toContain(createI18n('en').t('casting.glance.nobody'))
  }, 240_000)

  it('shows a set probability as a percentage in English and Chinese, and keeps the empty cells in words', async () => {
    await open('#/casting')
    expect(await row(first).locator('.cast-cell-probability .cast-value').textContent()).toBe('30%')
    expect(await row(second).locator('.cast-cell-probability').textContent()).toBe('Nothing is written here yet.')
    const englishHead = await role('worker').locator('thead').first().textContent()
    expect(englishHead).toContain(createI18n('en').t('casting.col.probability'))

    await open('?lang=zh#/casting')
    expect(await row(first).locator('.cast-cell-probability .cast-value').textContent()).toBe('30%')
    expect(await row(second).locator('.cast-cell-probability').textContent()).toBe('这里还没有写。')
    const chineseHead = await role('worker').locator('thead').first().textContent()
    expect(chineseHead).toContain(createI18n('zh').t('casting.col.probability'))
  }, 120_000)

  it('changes a casting with its press, and the history shows the change', async () => {
    await open('#/casting')
    await row(first).getByRole('button', { name: 'Change' }).click()
    await row(first).locator('input[id$="-effort"]').fill('high')
    await row(first).getByRole('button', { name: 'Save' }).click()
    await app.page.waitForFunction((id) => document.querySelector(`tbody[data-casting="${id}"] .cast-cell-effort .cast-value`)?.textContent === 'high', String(first), { timeout: 20_000 })
    const stored = await read('/api/casting/for/worker')
    expect(stored['effort']).toBe('high')
    // A CELL THE PERSON LEFT ALONE KEEPS ITS DECISION.
    expect(stored['cells']['model']['from']['decision']['id']).toBe(decision)

    await row(first).getByRole('button', { name: 'History' }).click()
    await app.page.waitForSelector(`tbody[data-casting="${String(first)}"] .cast-history li.cast-entry`, { timeout: 20_000 })
    expect(await row(first).locator('.cast-history > li').count()).toBe(2)
    const newest = (await row(first).locator('.cast-history > li').first().textContent()) ?? ''
    expect(newest).toContain('Changed')
    expect(newest).toContain('empty → high')
  }, 180_000)

  it('moves the mark with a press, refuses to remove the marked casting in words, and removes another', async () => {
    await open('#/casting')
    await row(second).getByRole('button', { name: 'Make the tools take this one' }).click()
    await app.page.waitForSelector(`tbody[data-casting="${String(second)}"][data-marked="yes"]`, { timeout: 20_000 })
    expect((await read('/api/casting/for/worker'))['casting']['id']).toBe(second)
    expect(await row(first).getAttribute('data-marked')).toBe('no')

    await row(second).getByRole('button', { name: 'Remove' }).click()
    await row(second).getByRole('button', { name: 'Remove it' }).click()
    await app.page.waitForSelector(`tbody[data-casting="${String(second)}"] .cast-refuse`, { timeout: 20_000 })
    expect(await row(second).locator('.cast-refuse').textContent()).toContain('Mark another casting first, then remove this one.')
    expect((await read('/api/casting/for/worker'))['casting']['id']).toBe(second)

    await open('#/casting')
    await row(first).getByRole('button', { name: 'Remove' }).click()
    expect(await row(first).locator('.cast-said').textContent()).toBe(`Remove casting ${String(first)}? Its history is kept.`)
    await row(first).getByRole('button', { name: 'Remove it' }).click()
    await app.page.waitForFunction((id) => document.querySelector(`tbody[data-casting="${id}"]`) === null, String(first), { timeout: 20_000 })
    const history = await read(`/api/casting/worker/history?casting=${String(first)}`)
    expect(history['changes'][0]['what']).toBe('remove')
  }, 180_000)

  it('refuses a page acting as an agent that names the secretary with no key, and says so where the press was', async () => {
    await app.page.evaluate((handle) => window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: handle })), THE_TEST_OFFICES_SECRETARY.handle)
    try {
      await open('#/casting')
      await pickRole('supervisor')
      await role('supervisor').getByRole('button', { name: 'Add a casting' }).click()
      await role('supervisor').locator('input[id$="-model"]').fill('an-agents-own-choice')
      await role('supervisor').getByRole('button', { name: 'Save' }).click()
      await app.page.waitForSelector('section.cast-role[data-role="supervisor"] .cast-refuse', { timeout: 20_000 })
      expect(await role('supervisor').locator('.cast-refuse').textContent()).toContain('Only the owner, or an agent holding the secretary card, may change the Casting table.')
      expect((await read('/api/casting/for/supervisor'))['casting']).toBeNull()
      // THE SUPERVISOR HAS NO CASTING, so its list draws no table and says so in words. Mutation N1: the page draws
      // nothing for a role nobody has cast. Red: the words are missing.
      expect(await role('supervisor').textContent()).toContain(createI18n('en').t('casting.glance.nobody'))
      await lookAtEveryWidth('refused', undefined, false)
      // THE CARD IN THE PAGE LANGUAGE: the value the server sent is the card's stored name, and the page draws its word.
      // The check reads that word as the page does, through cardWord from the word table, and never writes it out.
      await open('?lang=zh#/casting')
      await pickRole('supervisor')
      await role('supervisor').getByRole('button', { name: '添加一种选角' }).click()
      await role('supervisor').locator('input[id$="-model"]').fill('an-agents-own-choice')
      await role('supervisor').getByRole('button', { name: '保存' }).click()
      await app.page.waitForSelector('section.cast-role[data-role="supervisor"] .cast-refuse', { timeout: 20_000 })
      const zh = String(await role('supervisor').locator('.cast-refuse').textContent())
      const zhWords = createI18n('zh')
      expect(zh).toContain(zhWords.t('server.castingNotOwnerOrSecretary', { card: cardWord(THE_SECRETARY, (key) => zhWords.t(key)) }))
      expect(zh).not.toContain('secretary')
      const dir = process.env['CASTING_SHOTS']
      if (dir) {
        mkdirSync(dir, { recursive: true })
        await app.page.setViewportSize({ width: 1440, height: 1000 })
        await app.page.screenshot({ path: `${dir}/refused-1440-zh-light.png`, fullPage: true })
      }
      expect((await read('/api/casting/for/supervisor'))['casting']).toBeNull()
    } finally {
      await app.page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
    }
  }, 180_000)

  it('lets a page acting as the secretary with its own key press, and the history names the secretary', async () => {
    // THE OWNER'S CASTING OF THE INSPECTOR FIRST, so the one the secretary adds is not the one the tools take.
    const theirs = (await post('/api/casting/inspector', { model: { value: 'sample-model-p' }, why: { value: "The test's own sample, added as the person." } }))['casting'].id as number
    await app.page.evaluate((handle) => window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: handle })), THE_TEST_OFFICES_SECRETARY.handle)
    await app.page.setExtraHTTPHeaders({ 'x-mole-office-key': argusKey })
    try {
      await open('#/casting')
      await pickRole('inspector')
      // THE SAME PRESSES AS THE OWNER'S: add on every role, and on each casting its history, change, remove, and the mark.
      await role('inspector').getByRole('button', { name: 'Add a casting' }).click()
      await role('inspector').locator('input[id$="-model"]').fill('sample-model-s')
      await role('inspector').locator('textarea[id$="-why"]').fill("The test's own sample, added as the secretary.")
      await role('inspector').getByRole('button', { name: 'Save' }).click()
      await app.page.waitForFunction(() => document.querySelectorAll('section.cast-role[data-role="inspector"] tbody').length === 2, undefined, { timeout: 20_000 })
      const castings = (await read('/api/casting'))['roles'].find((card: { role: string }) => card.role === 'inspector')['scopes'][0]['castings'] as { id: number; cells: { model: { value: string } } }[]
      const mine = castings.find((one) => one.cells.model.value === 'sample-model-s')
      expect(mine, 'the secretary added its casting').toBeDefined()
      const id = Number(mine?.id)
      // THE ROW'S LAST CHANGE NAMES THE SECRETARY BY ITS NAME, and the owner's row names the owner.
      await more(id)
      await more(theirs)
      expect(await row(id).locator('.cast-changed').textContent()).toContain('Fixture secretary')
      expect(await row(theirs).locator('.cast-changed').textContent()).not.toContain('Fixture secretary')
      // THE MARK MOVES WITH THE SECRETARY'S PRESS, as with the owner's.
      await row(id).getByRole('button', { name: 'Make the tools take this one' }).click()
      await app.page.waitForSelector(`tbody[data-casting="${String(id)}"][data-marked="yes"]`, { timeout: 20_000 })
      expect((await read('/api/casting/for/inspector'))['casting']['id']).toBe(id)
      // AND ITS HISTORY NAMES THE SECRETARY on each change.
      await row(id).getByRole('button', { name: 'History' }).click()
      await app.page.waitForSelector(`tbody[data-casting="${String(id)}"] .cast-history li.cast-entry`, { timeout: 20_000 })
      const entries = await row(id).locator('.cast-history > li').allTextContents()
      expect(entries.length).toBe(2)
      expect(entries[0]).toContain('Marked: the tools take this one')
      expect(entries[1]).toContain('Added')
      for (const entry of entries) expect(entry).toContain('Fixture secretary')
      await lookAtEveryWidth('secretary')
      const dir = process.env['CASTING_SHOTS']
      if (dir) {
        await open('?lang=zh#/casting')
        await pickRole('inspector')
        mkdirSync(dir, { recursive: true })
        await app.page.setViewportSize({ width: 1440, height: 1000 })
        await app.page.screenshot({ path: `${dir}/secretary-1440-zh-light.png`, fullPage: true })
      }
    } finally {
      await app.page.setExtraHTTPHeaders({})
      await app.page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
    }
  }, 240_000)
})

// Synthetic row data and a reported refusal; no native model process is started by this page proof.
it('shows the exact native tuple and its persistent refusal on the Casting row', async () => {
  const native = {model:'sample-native-model',provider:'sample-native-provider',variant:'sample-native-variant'}
  const added = await post('/api/casting/worker',{program:{value:'opencode'},model:{value:'sample-office-label'},effort:{value:'sample-effort'},native})
  const id = added.casting.id
  const selected = (await read(`/api/casting/rows/${id}/selection`)).selection
  const run = await post('/api/records',{kind:'session',title:'Synthetic native refusal for the page',data:{state:'running',runtime:'opencode',model:selected.model,extra:{launcherSelection:selected}}})
  const said = 'Synthetic native program refused this selected option.'
  await post(`/api/casting/rows/${id}/hold`,{revision:selected.casting.revision,run:run.record.id,refusal:{kind:'option',code:'invalid_option',said}})
  await open('?lang=en#/casting')
  for(const value of [...Object.values(native),said]) expect(await row(id).textContent()).toContain(value)
  await lookAtEveryWidth('native-selection',row(id).getByRole('status'))
},180_000)
