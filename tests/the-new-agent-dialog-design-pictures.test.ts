// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEW AGENT DIALOG, AND WHAT ITS CREATE SHOWS. It lands with the dialog, and takes pictures only with TEST_SHOTS
 * set. Without it, every case still checks the dialog, and no picture is taken.
 *
 * The chat's New agent press opens src/web/components/NewAgentDialog.tsx. This test opens the chat's contacts,
 * presses New agent, and checks that the dialog draws every list from the office with more than one entry, that the
 * lists hold the office's own values, and that each choice starts on its default: the marked Casting row's agent tool,
 * model and effort, the worker card, the project being read, and the office's own terminal.
 *
 * CREATE IS CHECKED WITH THE DOOR'S ANSWER WRITTEN BY THE TEST. The page's POST /api/agents/new is answered by the test
 * and never reaches the office, so no agent is made and no terminal is opened. Create sends the values the dialog
 * shows: the defaults when nothing is changed, and the chosen ones when they are changed. While the answer is out,
 * the dialog says creating and Create cannot be pressed. A made agent whose terminal opened is said as made and
 * opened; a made agent whose terminal did not open is said as made, not opened. A refused value, a taken name, a
 * system that cannot open a terminal outside and any other failure each have their own short state, Create can be
 * pressed again, and nothing says opened.
 *
 * WITH TEST_SHOTS SET it takes 12 pictures:
 *   new-agent-1440-light.png, new-agent-390-light.png, new-agent-1440-dark.png and new-agent-390-dark.png;
 *   new-agent-grid-light.png and new-agent-grid-dark.png;
 *   new-agent-creating-<width>-light.png, new-agent-done-<width>-light.png and new-agent-failed-<width>-light.png, at
 *   1440 and 390: Create while it works, when the agent is made and opened, and when the system cannot open a
 *   terminal outside.
 * Each of the first four, and each of Create's six, is one picture of the window with the dialog open and a made-up
 * label in the dialog: 1440 by 1000, or 390 by 844. Each grid is one full-page picture of a blank page holding that theme's 1440 and 390 pictures
 * side by side at their full size, under one line saying that the office is a test office, its data is made up, and
 * the pictures are of the new agent dialog.
 *
 * THE LABEL IS IN THE DIALOG'S OWN FLOW, under the dialog's heading and above its first field, the name. It is not a
 * strip along the window's top. The checklists press is fixed to the window's top right, and the label helper refuses
 * a strip over any element fixed to the window. In the dialog the label is in the picture, and it takes its own height,
 * so it covers no part of the dialog. The helper still checks that. Where the helper refuses the label in the dialog
 * too, that picture is not taken: the helper's words are written to `<the picture's name>-refused.txt` beside the
 * pictures, and the test's output says so. A grid that lacks one of its two pictures is not taken either, and
 * `new-agent-grid-<theme>-left-out.txt` says which picture it lacks.
 *
 * THE OFFICE IS THIS TEST'S OWN. `freshDb` makes its database, everything is written through the office's own doors
 * as the test office's owner, and `liveApp` then serves that database. Everything in it is made up.
 *   - One made-up agent, a worker on Claude Code, so the contacts list has an agent.
 *   - Two made-up projects beside the default one, so the project list holds three.
 *   - Five Casting rows of the worker card in the default project, the first of them marked: three on Claude Code
 *     across two models, one of the two models at two efforts, one on Codex and one on OpenCode. The model names of
 *     the last two are made up. One Casting row of the worker card in the made-up garden project, on Codex.
 *   - The role cards are the office's built-in four.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t as say } from '../src/shared/i18n.ts'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'

const SHOTS = (process.env[TEST_SHOTS] ?? '') === '' ? null : testShots('the-new-agent-dialog-design-pictures')

/** One line in the dialog, so the label is about 34 pixels tall. */
const THE_LABEL = 'Made-up data, in a test office.'
/** The one line above a whole grid. */
const GRID_LINE = '测试办公室，编造的数据 · 新建智能体'

type Theme = 'light' | 'dark'
type Width = 1440 | 390

const WIDTHS: readonly Width[] = [1440, 390]
const HEIGHTS: Record<Width, number> = { 1440: 1000, 390: 844 }

/** The Casting rows of the worker card in the default project, in the order they are added. The first is marked. */
const CASTINGS: readonly { program: string; model: string; effort: string }[] = [
  { program: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh' },
  { program: 'claude-code', model: 'claude-opus-5-5', effort: 'high' },
  { program: 'claude-code', model: 'claude-sonnet-5', effort: 'high' },
  { program: 'codex', model: 'made-up-codex-model', effort: 'high' },
  { program: 'opencode', model: 'made-up-opencode-model', effort: 'medium' },
]

/** The one Casting row of the worker card in the made-up garden project. */
const GARDEN_CASTING = { project: 'made-up-garden', program: 'codex', model: 'made-up-codex-model', effort: 'low' } as const

/** What each of the dialog's six lists starts on, in the order the dialog draws them. */
const DEFAULTS = ['claude-code', 'claude-opus-5-5', 'xhigh', 'worker', 'default', 'office']

let t: TestDb
let api: FastifyInstance
let live: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function send(url: string, body: object): Promise<Record<string, any>> {
  const reply = await api.inject({ method: 'POST', url, headers: PERSON, payload: body })
  expect(reply.statusCode, `POST ${url}: ${reply.body}`).toBeLessThan(300)
  return reply.json() as Record<string, any>
}

beforeAll(async () => {
  t = await freshDb()
  api = (await apiApp()).app
  await api.ready()

  await send('/api/agents/started', { handle: 'made-up-builder', name: 'Made-up builder', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  await send('/api/workspaces', { id: 'made-up-garden', title: 'Made-up garden project' })
  await send('/api/workspaces', { id: 'made-up-shop', title: 'Made-up shop project' })
  for (const one of CASTINGS) {
    await send('/api/casting/worker', { project: 'default', program: { value: one.program }, model: { value: one.model }, effort: { value: one.effort } })
  }
  await send('/api/casting/worker', {
    project: GARDEN_CASTING.project,
    program: { value: GARDEN_CASTING.program },
    model: { value: GARDEN_CASTING.model },
    effort: { value: GARDEN_CASTING.effort },
  })

  live = await liveApp({ name: 'the-new-agent-dialog-design-pictures', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
}, 300_000)

afterAll(async () => {
  await live?.stop()
  await api?.close()
  t?.close()
}, 60_000)

/** Open the chat's contacts at one width in one theme, press New agent, and wait until every list in the dialog is read. */
async function openTheDialog(page: Page, width: Width, theme: Theme): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHTS[width] })
  if (!page.url().startsWith(live.site)) {
    await page.goto(`${live.site}/?lang=en#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
  }
  await page.evaluate((theme) => {
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  await page.goto('about:blank')
  await page.goto(`${live.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  expect(await page.evaluate(() => document.documentElement.dataset['theme']), `${String(width)}-${theme}: the page is not in the ${theme} theme`).toBe(theme)

  if ((await page.$('.px-chat')) === null) {
    await page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await page.click('.px-chat-circle')
  }
  await page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  const back = await page.$('.px-chat-back')
  if (back !== null) await back.click()
  await page.click('.px-chat-tab[data-tab="contacts"]')
  const press = '.px-chat-top-group[data-side="agent"] .px-chat-new-agent'
  await page.waitForSelector(press, { timeout: 20_000 })
  await page.click(press)

  await page.waitForSelector('.px-new-agent-dialog', { timeout: 20_000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.px-new-agent-dialog select').length === 6 && document.querySelector('.px-new-agent-dialog-state') === null,
    undefined,
    { timeout: 30_000 },
  )
  expect(await page.textContent('.px-new-agent-dialog-heading')).toBe(say('chat.contact.newAgent'))
  const lists = await page.$$eval('.px-new-agent-dialog select', (all) => all.map((one) => ({ value: (one as HTMLSelectElement).value, entries: (one as HTMLSelectElement).options.length })))
  expect(lists.map((one) => one.value), `${String(width)}-${theme}: the dialog's choices start on their defaults`).toEqual(DEFAULTS)
  for (const [n, one] of lists.entries()) expect(one.entries, `${String(width)}-${theme}: list ${String(n + 1)} holds more than one entry`).toBeGreaterThan(1)

  // THE LISTS HOLD THE OFFICE'S OWN VALUES: the Casting rows this test added, and the projects it made.
  const values = await page.$$eval('.px-new-agent-dialog select', (all) => all.map((one) => [...(one as HTMLSelectElement).options].map((option) => option.value)))
  const ofTheTool = CASTINGS.filter((one) => one.program === DEFAULTS[0])
  expect(values[0], `${String(width)}-${theme}: the agent tools`).toEqual([...new Set(CASTINGS.map((one) => one.program))])
  expect(values[1], `${String(width)}-${theme}: the models`).toEqual([...new Set(ofTheTool.map((one) => one.model))])
  expect(values[2], `${String(width)}-${theme}: the efforts`).toEqual(ofTheTool.filter((one) => one.model === DEFAULTS[1]).map((one) => one.effort))
  expect(values[3], `${String(width)}-${theme}: the roles`).toContain('worker')
  expect(values[4], `${String(width)}-${theme}: the projects`).toEqual(expect.arrayContaining(['default', 'made-up-garden', 'made-up-shop']))
  expect(values[5], `${String(width)}-${theme}: where it opens`).toEqual(['office', 'outside'])
}

/** Whether an error is the label helper's refusal, which is written down rather than thrown. */
const aRefusal = (error: unknown): error is Error => error instanceof Error && error.message.startsWith('putTheMadeUpLabelIn(')

/**
 * ONE PICTURE OF THE WINDOW with the dialog open and the made-up label in the dialog's flow above its first field, and
 * its bytes for the grid. Where the helper refuses the label, its words are written down and no picture is taken.
 */
async function photograph(page: Page, name: string): Promise<Buffer | null> {
  if (SHOTS === null) return null
  try {
    await putTheMadeUpLabelIn(page, THE_LABEL, page.locator('.px-new-agent-dialog .px-field'), name)
  } catch (error) {
    if (!aRefusal(error)) throw error
    await takeTheMadeUpLabelOut(page)
    writeFileSync(join(SHOTS, `${name}-refused.txt`), `${error.message}\n`)
    console.warn(`${name}: the helper refused the made-up label, so this picture is not taken: ${error.message}`)
    return null
  }
  await page.mouse.move(0, 0)
  const bytes = await page.screenshot({ path: join(SHOTS, `${name}.png`) })
  await takeTheMadeUpLabelOut(page)
  return bytes
}

/** ONE GRID OF A THEME'S TWO PICTURES, side by side at their full size on a blank page, taken as one full-page picture. */
async function photographTheGrid(theme: Theme, pictures: ReadonlyMap<Width, Buffer>): Promise<void> {
  if (SHOTS === null) return
  const cells = WIDTHS.map((width) => {
    const bytes = pictures.get(width)
    expect(bytes, `${String(width)}-${theme}: the picture for the grid was taken`).toBeDefined()
    return `<figure><figcaption>${String(width)}</figcaption><img alt="" style="width: ${String(width)}px" src="data:image/png;base64,${bytes!.toString('base64')}"></figure>`
  }).join('')
  const grid = await live.context.newPage()
  try {
    await grid.setViewportSize({ width: 1974, height: 1000 })
    await grid.setContent(
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>' +
        "html, body { margin: 0; background: #ffffff; color: #111111; } " +
        "body { width: 1974px; font-family: 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', 'PingFang SC', sans-serif; } " +
        'h1 { margin: 0; padding: 32px 48px; font-size: 56px; font-weight: 700; line-height: 1.3; } ' +
        '.grid { display: flex; align-items: flex-start; gap: 48px; padding: 0 48px 48px; } ' +
        'figure { margin: 0; } ' +
        'figcaption { padding: 16px 0; border-top: 4px solid #111111; font-size: 48px; font-weight: 700; line-height: 1.2; } ' +
        'img { display: block; height: auto; outline: 2px solid #111111; outline-offset: -2px; }' +
        `</style></head><body><h1>${GRID_LINE}</h1><div class="grid">${cells}</div></body></html>`,
    )
    await grid.waitForFunction(() => [...document.images].every((one) => one.complete && one.naturalWidth > 0), undefined, { timeout: 30_000 })
    await grid.mouse.move(0, 0)
    await grid.screenshot({ path: join(SHOTS, `new-agent-grid-${theme}.png`), fullPage: true })
  } finally {
    await grid.close()
  }
}

/**
 * The dialog at both widths in one theme, one picture each, and then the grid of the two. A grid that lacks a picture
 * the helper refused is not taken, and a file beside the pictures says which picture it lacks.
 */
async function drawTheTheme(theme: Theme): Promise<void> {
  const pictures = new Map<Width, Buffer>()
  for (const width of WIDTHS) {
    await openTheDialog(live.page, width, theme)
    const bytes = await photograph(live.page, `new-agent-${String(width)}-${theme}`)
    if (bytes !== null) pictures.set(width, bytes)
  }
  if (SHOTS !== null) {
    const lacking = WIDTHS.filter((width) => !pictures.has(width))
    if (lacking.length > 0) {
      const which = `The ${lacking.map(String).join(' and ')} ${lacking.length === 1 ? 'picture was' : 'pictures were'}`
      const line = `${which} not taken: the helper refused the made-up label. So the grid is not taken.`
      writeFileSync(join(SHOTS, `new-agent-grid-${theme}-left-out.txt`), `${line}\n`)
      console.warn(`new-agent-grid-${theme}: ${line}`)
      return
    }
  }
  await photographTheGrid(theme, pictures)
}

it('draws the new agent dialog at 1440 and 390 wide in the light theme, every list read and on its default', async () => {
  await drawTheTheme('light')
}, 300_000)

it('draws the new agent dialog at 1440 and 390 wide in the dark theme, every list read and on its default', async () => {
  await drawTheTheme('dark')
}, 300_000)

// ---------------------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------------------

/** The door's answer the test writes for one press of Create. */
interface AnAnswer {
  status: number
  body: Record<string, unknown>
}

const MADE_AND_OPENED: AnAnswer = {
  status: 201,
  body: {
    agent: { id: 'madeUpAgent1', handle: 'made-up-heron', name: 'Made-up heron', runtime: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh', role: 'worker', project: 'default' },
    terminal: { opened: true, where: 'office', id: 'made-up-terminal', session: 'madeUpRun001' },
    says: "made-up-heron was made, and opened in the office's own terminal.",
  },
}

const MADE_NOT_OPENED: AnAnswer = {
  status: 201,
  body: {
    agent: { id: 'madeUpAgent2', handle: 'made-up-heron', name: 'Made-up heron', runtime: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh', role: 'worker', project: 'default' },
    terminal: { opened: false, where: 'outside', says: 'gnome-terminal ended with 1: # Failed to parse arguments' },
    says: 'made-up-heron was made. Its terminal outside was not opened: gnome-terminal ended with 1.',
  },
}

/** Each failure of Create, the answer the test writes for it, and the state the dialog says. */
const FAILURES: readonly { answer: AnAnswer; word: Parameters<typeof say>[0]; picture: boolean }[] = [
  { answer: { status: 400, body: { error: 'The agent tool "made-up-tool" is not one the office knows. Nothing was made.' } }, word: 'newAgentDialog.refused', picture: false },
  { answer: { status: 409, body: { error: 'An agent is called "made-up-heron" already. Nothing was made.' } }, word: 'newAgentDialog.nameTaken', picture: false },
  { answer: { status: 501, body: { error: 'This made-up system cannot open a terminal outside the office. Nothing was made.' } }, word: 'newAgentDialog.notOnThisSystem', picture: true },
  { answer: { status: 500, body: { error: 'A made-up failure. Nothing was made.' } }, word: 'newAgentDialog.notMade', picture: false },
]

/**
 * ANSWER THE PAGE'S POST /api/agents/new WITH THE TEST'S OWN ANSWERS, one for each press, and keep each body the page
 * sent. An answer may be held until the test lets it go. The answer carries the office's own headers, read from a
 * harmless read of the same office, because the page reads only what the office's cross-origin headers allow.
 */
async function answerTheDoor(page: Page): Promise<{
  bodies: unknown[]
  next: (answer: AnAnswer, held?: Promise<void>) => void
  stop: () => Promise<void>
}> {
  const bodies: unknown[] = []
  const waiting: { answer: AnAnswer; held: Promise<void> }[] = []
  const handler = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'POST') return route.fallback()
    bodies.push(route.request().postDataJSON())
    const one = waiting.shift()
    if (one === undefined) throw new Error('Create was pressed once more than this test answers')
    await one.held
    const real = await route.fetch({ method: 'GET', url: `${live.api}/api`, postData: '' })
    await route.fulfill({ response: real, status: one.answer.status, contentType: 'application/json', body: JSON.stringify(one.answer.body) })
  }
  await page.route('**/api/agents/new', handler)
  return {
    bodies,
    next: (answer, held = Promise.resolve()) => {
      waiting.push({ answer, held })
    },
    stop: () => page.unroute('**/api/agents/new', handler),
  }
}

/** What the dialog says about Create, once it says `word`. */
async function untilCreateSays(page: Page, word: string): Promise<void> {
  await page.waitForFunction((word) => document.querySelector('.px-new-agent-dialog-outcome')?.textContent === word, word, { timeout: 20_000 })
}

/** Type a name and press Create. */
async function create(page: Page, name: string | null): Promise<void> {
  if (name !== null) await page.locator('.px-new-agent-dialog input').first().fill(name)
  await page.click('.px-new-agent-dialog-create')
}

const createIsOff = (page: Page): Promise<boolean> => page.isDisabled('.px-new-agent-dialog-create')

it('Create sends the defaults, says creating while the answer is out, and made and opened when it is done', async () => {
  const page = live.page
  for (const width of WIDTHS) {
    await openTheDialog(page, width, 'light')
    const door = await answerTheDoor(page)
    try {
      let letGo = (): void => undefined
      door.next(MADE_AND_OPENED, new Promise<void>((resolve) => { letGo = resolve }))
      await create(page, 'Made-up heron')
      await untilCreateSays(page, say('newAgentDialog.creating'))
      expect(await createIsOff(page), `${String(width)}: Create cannot be pressed while the answer is out`).toBe(true)
      await photograph(page, `new-agent-creating-${String(width)}-light`)
      letGo()
      await untilCreateSays(page, say('newAgentDialog.opened'))
      expect(await createIsOff(page), `${String(width)}: Create cannot be pressed again once the agent is made`).toBe(true)
      await photograph(page, `new-agent-done-${String(width)}-light`)
      expect(door.bodies).toEqual([{ name: 'Made-up heron', harness: 'claude-code', model: 'claude-opus-5-5', effort: 'xhigh', role: 'worker', project: 'default', opensIn: 'office' }])
    } finally {
      await door.stop()
    }
  }
}, 300_000)

it('Create sends the values chosen in the dialog', async () => {
  const page = live.page
  await openTheDialog(page, 1440, 'light')
  const door = await answerTheDoor(page)
  try {
    const lists = page.locator('.px-new-agent-dialog select')
    await lists.nth(4).selectOption(GARDEN_CASTING.project)
    await page.waitForFunction(
      (model) => (document.querySelectorAll('.px-new-agent-dialog select')[1] as HTMLSelectElement | undefined)?.value === model,
      GARDEN_CASTING.model,
      { timeout: 20_000 },
    )
    await lists.nth(5).selectOption('outside')
    door.next({ ...MADE_AND_OPENED, body: { ...MADE_AND_OPENED.body, terminal: { opened: true, where: 'outside', how: 'gnome-terminal' } } })
    await create(page, 'Garden heron')
    await untilCreateSays(page, say('newAgentDialog.opened'))
    expect(door.bodies).toEqual([
      { name: 'Garden heron', harness: GARDEN_CASTING.program, model: GARDEN_CASTING.model, effort: GARDEN_CASTING.effort, role: 'worker', project: GARDEN_CASTING.project, opensIn: 'outside' },
    ])
  } finally {
    await door.stop()
  }
}, 300_000)

it('Create says each failure in its own short state, can be pressed again, and never says opened when nothing opened', async () => {
  const page = live.page
  for (const width of WIDTHS) {
    await openTheDialog(page, width, 'light')
    const door = await answerTheDoor(page)
    try {
      await page.locator('.px-new-agent-dialog input').first().fill('Made-up heron')
      for (const one of FAILURES) {
        door.next(one.answer)
        await create(page, null)
        await untilCreateSays(page, say(one.word))
        expect(await createIsOff(page), `${String(width)}: ${String(one.answer.status)}: Create can be pressed again`).toBe(false)
        expect(await page.textContent('.px-new-agent-dialog')).not.toContain(say('newAgentDialog.opened'))
        if (one.picture) await photograph(page, `new-agent-failed-${String(width)}-light`)
      }
      door.next(MADE_NOT_OPENED)
      await create(page, null)
      await untilCreateSays(page, say('newAgentDialog.madeNotOpened'))
      expect(await createIsOff(page), `${String(width)}: Create cannot be pressed again once the agent is made`).toBe(true)
      expect(await page.textContent('.px-new-agent-dialog')).not.toContain(say('newAgentDialog.opened'))
      expect(door.bodies).toHaveLength(FAILURES.length + 1)
    } finally {
      await door.stop()
    }
  }
}, 300_000)
