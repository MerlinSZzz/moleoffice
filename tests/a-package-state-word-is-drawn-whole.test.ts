// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE'S STATE WORD IS DRAWN WHOLE, ON ITS PLAN CARD, IN THE PLAN'S LIST AND ON THE TASKS PAGE, AND THE TASK PAGE
 * OF A PACKAGE KEPT INSIDE THE OFFICE DRAWS ITS PACKAGE PANEL WITH THAT WORD.
 *
 * Round 166 gave every package one of six state words, drawn on the tasks page and on the plan card of the block that
 * names the package. Two things were left. The plan cut "returned to the taker" short. And the task page of a package
 * kept inside the office drew no package panel at all, so it did not say the state the tasks page gave the same
 * package: the panel was drawn only for a package for outside work, the one kind that stores where its work is.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own, in the light and the dark theme at 1440,
 * 990, 660 and 390. Six made-up packages are walked to the six states, each linked to a block of one made-up plan.
 *   1. The plan, drawn as the graph and as the list: each of the six state words is drawn on a chip, and no chip's word
 *      is cut or runs past the edge of its chip.
 *   2. The tasks page: each of the six state words is drawn, and none is cut.
 *   3. The task page of each inside package (all six at 1440, the package returned to its taker at the other widths):
 *      it draws the package panel, and the panel's state is the word the tasks page draws for that package, whole.
 *
 * MUTATION: take out the line that lets the package's chip wrap, `.gx-package-state .px-chip { white-space: normal; }`
 * in src/web/components/graph/CardFace.tsx, and part 1 goes red: the word is held to one line and runs past its chip.
 * Draw the record page's panel only for a package for outside work again, with `packageOnTask` in place of
 * `taskHasAPackage` in src/web/pages/RecordPage.tsx, and part 3 goes red at its first package.
 *
 * WHAT ROUND 230 OF LINE 13U CHANGED HERE, AND WHY. A filed pipeline's address now draws its graph side as look 2b, the
 * lanes drawing (`[data-drawing="lanes"]`, src/web/components/graph/lanes/). That drawing has no `.px-chip-word` and no
 * `.gx-canvas-bar`, so part 1 read nothing there. On the graph side part 1 now reads the chip (`.e-chip`) on each card
 * (`.e-card`, by its `data-id`), and the drawing's own controls (`.lanes-controls`) at 660. At 390 the drawing is an
 * outline of cards with no controls, so part 1 reads the outline's pressable cards there. On the graph side part 1 also
 * proves the rule the drawing must keep: the step that exactly one package names draws that package's word on a chip
 * whose `data-state` and colours are the step's own stored state; a step that no package names, and a step that two
 * packages name, draw the step's own state word. Those two steps are added after every package has reached its state,
 * so no acceptance writes their state. The "List" side, parts 2 and 3, and the last two cases are unchanged.
 *
 * ROUND 230'S MUTATION: take out the line in src/web/components/graph/lanes/from-records.ts that gives a step its
 * package state, `...(role === 'step' ? thePackageStateOn(packages, record.id) : {}),`, build, and part 1 goes red on
 * the graph side in all eight cases of width and theme. Each fails on the word "to do": every step then says its own
 * state, so no chip says it. Put back with cp and checked with cmp, the file is green again. Round 230 did not run the
 * two mutations above again.
 */
import { aMadeUpModuleForPackage, httpPackageFixture } from './module-package-fixture.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { BLOCK_KIND } from '../src/shared/blocks.ts'
import { PACKAGE_STATES, type PackageState } from '../src/shared/delegation.ts'
import { count, t } from '../src/shared/i18n.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { packageStateWord, stateWord } from '../src/shared/words.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { DRAWING, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const asThePerson = (): Record<string, string> => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })
const asAgent = (handle: string): Record<string, string> => ({ ...asThePerson(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let app: LiveApp
let plan = ''
const outsideTasks: string[] = []
const makerNames = ['made-up-maker', `made-up-${'a'.repeat(32)}`] as const
/** Each made-up package's task, by the state it was walked to. */
const taskIn = {} as Record<PackageState, string>
/** Round 230: the block each package names, by the package's state; and the block no package names and two do. */
const blockIn = {} as Record<PackageState, string>
const stepNamedBy = { none: '', two: '' }

async function send(path: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `${path}: ${text}`).toBe(201)
  return JSON.parse(text) as Record<string, unknown>
}

async function file(kind: string, title: string, data: Record<string, unknown>, headers = asThePerson()): Promise<string> {
  return String(((await send('/api/records', headers, { kind, title, data })).record as { id: string }).id)
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-package-state-word-is-drawn-whole', viewport: { width: 1440, height: 900 } })
  for (const handle of ['made-up-maker', 'made-up-worker']) await send('/api/agents/started', asThePerson(), { handle, name: handle })
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: asThePerson() })).json()) as { agents: { id: string; handle: string }[] }
  const workerId = listed.agents.find((one) => one.handle === 'made-up-worker')?.id ?? ''
  expect(workerId, 'the made-up worker is listed').not.toBe('')
  // THE OFFICE FILES THE WORKER'S RUN, so the run has the key a hand-back needs. The keys file is the test office's own,
  // beside its database in the live app's directory.
  const office = (JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office
  const filed = await send('/api/records', { ...asAgent(THE_MESSAGE_WORKER_ID), 'x-mole-office-key': office }, {
    kind: 'session', title: 'A made-up run of the worker', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: workerId },
  })
  const run = { ...asAgent('made-up-worker'), 'x-mole-office-session': String((filed.record as { id: string }).id), 'x-mole-office-key': String((filed.runKey as { key?: string } | undefined)?.key ?? '') }
  const maker = asAgent('made-up-maker')
  await send('/api/agents/started', asThePerson(), { handle: makerNames[1], name: makerNames[1] })
  const outsideModule = await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))
  for (const name of makerNames) {
    const who = asAgent(name)
    const task = await file('task', 'A made-up outside package', {}, who)
    outsideTasks.push(task)
    await send(`/api/delegation/${task}/package`, who, {
      ...WORDS, moduleIds: [outsideModule], suits: 'own_module', acceptanceSource: { file: 'made-up/ACCEPTANCE.md', criterion: 'Made-up F1', commit: 'made-up' },
    })
  }
  const worker = asAgent('made-up-worker')
  const door = (task: string, name: string, headers: Record<string, string>, body: unknown) => send(`/api/delegation/${task}/${name}`, headers, body)

  const decision = await file('decision', 'A made-up decision above the packages', { replaces: [] })
  const parent = await file('task', 'A made-up parent task of six packages', {}, maker)
  const points = {} as Record<PackageState, [string, string]>
  for (const state of PACKAGE_STATES) {
    const two: string[] = []
    for (const n of [1, 2]) two.push(await file('backlog_item', `A made-up point ${String(n)} of the package walked to ${state}`, {
      line: 'a-made-up-line', number: `${state} ${String(n)}`, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo',
    }))
    points[state] = two as [string, string]
  }
  const insideModule = await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))
  await door(parent, 'package', maker, { ...WORDS, moduleIds: [insideModule], parent: { kind: 'decision', id: decision }, pointIds: Object.values(points).flat() })
  plan = await file('pipeline', 'A made-up plan of six packages', { blockIds: [] })
  for (const state of PACKAGE_STATES) {
    const [one, two] = points[state]
    const task = await file('task', `A made-up package walked to ${state}`, {}, maker)
    taskIn[state] = task
    const added = await send(`/api/records/${plan}/blocks`, asThePerson(), { name: `A made-up block linked to the package walked to ${state}`, state: 'doing' })
    const block = String((added.block as { id?: string } | undefined)?.id ?? (added.record as { id: string }).id)
    blockIn[state] = block
    await send('/api/links', asThePerson(), { fromId: block, toId: task, type: 'relates_to' })
    await door(task, 'package', maker, { ...WORDS, moduleIds: [insideModule], parent: { kind: 'task', id: parent }, pointIds: [one, two] })
    if (state === 'to_do') continue
    await door(task, 'take-inside', worker, {})
    if (state === 'taken') continue
    await door(task, 'align', worker, { restated: 'I will do the two made-up points.', plan: 'Do them.' })
    await door(task, 'align-answer', maker, { answer: 'aligned', words: 'Yes.' })
    if (state === 'aligned') continue
    await door(task, 'hand-back', run, { points: [one, two].map((pointId) => ({ pointId, outcome: 'done', words: 'Built.' })) })
    if (state === 'handed_back') continue
    await door(task, 'accept', maker, { points: state === 'returned'
      ? [{ pointId: one, answer: 'accepted' }, { pointId: two, answer: 'returned', words: 'The second made-up point draws nothing.' }]
      : [{ pointId: one, answer: 'accepted' }, { pointId: two, answer: 'accepted' }] })
  }
  // ROUND 230: TWO MORE STEPS, added after every package reached its state, because an accept writes the state of each
  // block linked to its task. No package names the first; the packages walked to "to_do" and "taken" both name the second.
  const step = async (name: string, state: string) => {
    const added = await send(`/api/records/${plan}/blocks`, asThePerson(), { name, state })
    return String((added.block as { id?: string } | undefined)?.id ?? (added.record as { id: string }).id)
  }
  stepNamedBy.none = await step('A made-up block no package names', 'doing')
  stepNamedBy.two = await step('A made-up block two packages name', 'blocked')
  for (const state of ['to_do', 'taken'] as const) await send('/api/links', asThePerson(), { fromId: stepNamedBy.two, toId: taskIn[state], type: 'relates_to' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The six state words, as the pages draw them. */
const SIX = PACKAGE_STATES.map((state) => packageStateWord(state).text)

/**
 * Each word drawn in these places on the page, and the ones whose drawing is cut: the word does not fit its own box, or
 * its box runs past the edge of the chip it is drawn on. A word whose box is let out wider than its chip is not drawn on
 * the chip, even when nothing of it is hidden.
 */
function theWords(page: Page, selector: string): Promise<{ words: string[]; cut: string[] }> {
  return page.evaluate((selector) => {
    const drawn = [...document.querySelectorAll<HTMLElement>(selector)].filter((one) => one.checkVisibility())
    return {
      words: drawn.map((one) => (one.textContent ?? '').trim()),
      cut: drawn.filter((one) => {
        const chip = one.closest('.px-chip')?.getBoundingClientRect()
        const box = one.getBoundingClientRect()
        const pastTheChip = chip !== undefined && (box.left < chip.left - 0.5 || box.right > chip.right + 0.5)
        return one.scrollWidth > one.clientWidth + 0.5 || one.scrollHeight > one.clientHeight + 0.5 || pastTheChip
      }).map((one) => (one.textContent ?? '').trim()),
    }
  }, selector)
}

/** A block's own state, as the office stores it. */
async function theStoredState(block: string): Promise<string> {
  const answer = await fetch(`${app.api}/api/records/${block}`, { headers: asThePerson() })
  expect(answer.status, `the block ${block} is read`).toBe(200)
  return String(((await answer.json()) as { record: { data: { state?: unknown } } }).record.data.state)
}

/**
 * Round 230. The lanes drawing's chips: each step whose block exactly one package names says that package's state word,
 * on the colours of the step's own state; the steps no package or two packages name say their own state word. A word is
 * cut when its text runs outside its chip, the chip runs outside its card, or the chip's text does not fit its box. A
 * card's state mark, where it has one, is named by the chip's word.
 */
async function theLanesChipsSayThePackages(page: Page, where: string): Promise<void> {
  const drawn = await page.evaluate((drawing) => {
    const on: Record<string, { word: string; state: string; colours: string; mark: string | null }[]> = {}
    const cut: string[] = []
    for (const chip of document.querySelectorAll<HTMLElement>(`#main ${drawing} .e-card .e-chip`)) {
      if (!chip.checkVisibility()) continue
      const card = chip.closest<HTMLElement>('.e-card')!
      const word = (chip.textContent ?? '').trim()
      const style = getComputedStyle(chip)
      const range = document.createRange()
      range.selectNodeContents(chip)
      const text = range.getBoundingClientRect()
      const box = chip.getBoundingClientRect()
      const holder = card.getBoundingClientRect()
      const outside = (inner: DOMRect, outer: DOMRect) => inner.left < outer.left - 0.5 || inner.right > outer.right + 0.5 || inner.top < outer.top - 0.5 || inner.bottom > outer.bottom + 0.5
      if (outside(text, box) || outside(box, holder) || chip.scrollWidth > chip.clientWidth + 0.5) cut.push(word)
      const id = card.dataset['id'] ?? ''
      on[id] = [...(on[id] ?? []), {
        word,
        state: chip.dataset['state'] ?? '',
        colours: [style.color, style.backgroundColor, style.borderTopColor, style.borderTopStyle].join(' '),
        mark: card.querySelector(':scope > .e-head .e-mark')?.getAttribute('aria-label') ?? null,
      }]
    }
    return { on, cut }
  }, DRAWING)
  const words = Object.values(drawn.on).flat().map((chip) => chip.word)
  for (const word of SIX) expect(words, `the lanes drawing at ${where}: the word "${word}"`).toContain(word)
  expect(drawn.cut, `the lanes drawing at ${where}: chips whose word is cut`).toEqual([])
  for (const chip of Object.values(drawn.on).flat()) if (chip.mark !== null) expect(chip.mark, `the lanes drawing at ${where}: the mark beside "${chip.word}"`).toBe(chip.word)

  const none = drawn.on[stepNamedBy.none] ?? []
  expect(none.map((chip) => chip.word), `${where}: the step no package names says its own state`).toEqual([stateWord('doing', 'normal', BLOCK_KIND).text])
  const two = drawn.on[stepNamedBy.two] ?? []
  expect(two.map((chip) => chip.word), `${where}: the step two packages name says its own state`).toEqual([stateWord('blocked', 'normal', BLOCK_KIND).text])
  for (const state of PACKAGE_STATES) {
    const chips = drawn.on[blockIn[state]] ?? []
    const own = await theStoredState(blockIn[state])
    expect(chips.map((chip) => chip.word), `${where}: the step the package walked to ${state} names`).toEqual([packageStateWord(state).text])
    expect(chips.map((chip) => chip.state), `${where}: that step's chip keeps the step's own state`).toEqual([own])
    if (own === 'doing') expect(chips.map((chip) => chip.colours), `${where}: that step's chip is on the colours of its own state`).toEqual(none.map((chip) => chip.colours))
  }
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.mouse.move(0, 0)
}

/**
 * Shows the plan as the graph or the list, by its own press, and waits for the drawing to be laid out. The graph is the
 * lanes drawing (round 230): at 390 it is an outline of cards.
 */
async function asThe(page: Page, view: 'graph' | 'list', width: number): Promise<void> {
  const press = page.getByRole('button', { name: t(view === 'graph' ? 'g7b.model.graph' : 'g7b.model.list'), exact: true }).first()
  if ((await press.count()) > 0 && (await press.getAttribute('aria-disabled')) !== 'true') await press.click({ timeout: 10_000 })
  if (view === 'graph') return theDrawingIsDrawn(page, { outline: width <= 480 })
  await page.waitForFunction(() => document.querySelector('.gx-canvas-state') === null, undefined, { timeout: 60_000 })
  await page.locator('#main .px-chip-word').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(600)
}

for (const theme of THEMES) for (const width of WIDTHS) {
  it(`draws each package's state word whole, and the panel on an inside package's page, at ${width} in the ${theme} theme`, async () => {
    const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 }, reducedMotion: 'reduce' })
    await context.addInitScript((look) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.chat.open', 'no')
    }, theme)
    const page = await context.newPage()
    try {
      // 1. THE PLAN, AS THE GRAPH AND AS THE LIST.
      for (const view of ['graph', 'list'] as const) {
        await open(page, `/pipeline/${plan}`)
        expect(await page.evaluate(() => document.documentElement.dataset['theme']), 'the theme drawn').toBe(theme)
        await asThe(page, view, width)
        if (view === 'graph' && width === 660) {
          const clipped = await page.locator('#main .lanes-drawing .lanes-controls').evaluate((bar) => {
            const parent = bar.getBoundingClientRect()
            return [...bar.querySelectorAll<HTMLElement>('button, span')].filter((el) => {
              const box = el.getBoundingClientRect()
              return box.left < parent.left - 0.5 || box.right > parent.right + 0.5 || box.left < 0 || box.right > window.innerWidth || el.scrollWidth > el.clientWidth + 0.5
            }).map((el) => el.textContent?.trim() ?? '')
          })
          expect(clipped, `the drawing's controls are cut at ${width} in ${theme}`).toEqual([])
        }
        if (view === 'graph' && width === 390) {
          const clipped = await page.locator(`#main ${DRAWING} .e-card[role="button"]`).evaluateAll((cards) => cards.filter((el) => {
            const box = el.getBoundingClientRect()
            return box.left < 0 || box.right > window.innerWidth || el.scrollWidth > el.clientWidth + 0.5
          }).map((el) => el.dataset['id'] ?? ''))
          expect(clipped, `the outline's cards, its controls at 390, are cut in ${theme}`).toEqual([])
        }
        if (view === 'graph') {
          await theLanesChipsSayThePackages(page, `${width} in ${theme}`)
          continue
        }
        const chips = await theWords(page, '#main .px-chip-word')
        for (const word of SIX) expect(chips.words, `the plan as the ${view}: the word "${word}"`).toContain(word)
        expect(chips.cut, `the plan as the ${view}: chips whose word is cut`).toEqual([])
      }

      // 2. THE TASKS PAGE.
      await open(page, '/tasks-to-take')
      await page.locator('#main .px-tag').first().waitFor({ timeout: 30_000 })
      const tags = await theWords(page, '#main .px-tag')
      const states = { words: tags.words.filter((word) => SIX.includes(word)), cut: tags.cut.filter((word) => SIX.includes(word)) }
      for (const word of SIX) expect(states.words, `the tasks page: the word "${word}"`).toContain(word)
      expect(states.cut, 'the tasks page: state words that are cut').toEqual([])

      // 3. THE TASK PAGE OF EACH INSIDE PACKAGE.
      for (const state of width === 1440 ? PACKAGE_STATES : (['returned'] as const)) {
        await open(page, recordPath(taskIn[state]))
        const panel = page.locator('#main [data-target="uiSurface/package.here"]')
        await panel.first().waitFor({ timeout: 30_000 }).catch(() => undefined)
        expect(await panel.count(), `the task page of the package walked to ${state} draws its package panel`).toBe(1)
        await panel.locator('.tpp-state .px-tag').first().waitFor({ timeout: 30_000 })
        const word = await theWords(page, '#main [data-target="uiSurface/package.here"] .tpp-state .px-tag')
        expect(word, `the panel's state for the package walked to ${state}`).toEqual({ words: [packageStateWord(state).text], cut: [] })
      }
    } finally {
      await context.close()
    }
  }, 240_000)
}

it('uses a singular word for one pipeline and the plural for two, in the index', async () => {
  for (const amount of [1, 2]) {
    if (amount === 2) await file('pipeline', 'A made-up second plan', { blockIds: [] })
    for (const theme of THEMES) for (const width of [1440, 990, 660]) {
      const context = await app.browser.newContext({ viewport: { width, height: 900 } })
      await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      try {
        const page = await context.newPage()
        await open(page, `/pipeline/${plan}`)
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
        const index = page.locator('[data-target="uiSurface/pipeline.index"]')
        await index.waitFor({ timeout: 60_000 })
        const word = t(amount === 1 ? 'g7b.PipelinePage.pipeline_on_file' : 'g7b.PipelinePage.pipelines_on_file')
        await expect.poll(() => index.innerText(), { message: `${amount}, ${width}, ${theme}` }).toContain(`${count(amount)} ${word}`)
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)

it('keeps a fitting handle whole and a longer handle inside its box at 390', async () => {
  for (const theme of THEMES) {
    const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } })
    await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
    try {
      const page = await context.newPage()
      for (const [at, task] of outsideTasks.entries()) {
        await open(page, recordPath(task))
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
        const facts = page.locator('.tpp-facts').first().locator('dd').nth(1)
        await expect.poll(() => facts.textContent()).toContain(makerNames[at])
        const measured = await facts.evaluate((el, name) => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          let word: Node | null = null
          while (walker.nextNode()) if (walker.currentNode.textContent?.includes(name)) { word = walker.currentNode; break }
          if (word === null) throw new Error('The name has no text node')
          const start = word.textContent!.indexOf(name)
          const range = document.createRange()
          range.setStart(word, start)
          range.setEnd(word, start + name.length)
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
          const box = el.getBoundingClientRect()
          return { lines: new Set(rects.map((rect) => Math.round(rect.top))).size, fits: rects.every((rect) => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5) }
        }, makerNames[at]!)
        expect(measured.fits, `${theme}: the handle extends outside its box`).toBe(true)
        if (at === 0) expect(measured.lines, `${theme}: a fitting handle breaks`).toBe(1)
      }
    } finally {
      await context.close()
    }
  }
}, 180_000)
