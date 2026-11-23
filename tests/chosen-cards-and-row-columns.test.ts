// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, writeFileSync } from 'node:fs'
import { en } from '../src/shared/words/en.ts'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Mode } from '../src/shared/mode.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { chooseTheCategoryThatDraws, openSettingsPanel } from './settings-folds.ts'

let app: LiveApp
let pipelineId: string
let reportId: string
const pipelineTitle = 'Made-up paper lantern assembly'
const shots = process.env.W13Q_FAULTS_SHOTS
const measurements: unknown[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'chosen-cards-and-row-columns', workspace: 'default', opensAt: 'full', viewport: { width: 1440, height: 1000 } })
  await app.page.addInitScript(() => {
    const theme = new URL(location.href).searchParams.get('look')
    if (theme) localStorage.setItem('mole-office.preset.theme', theme)
  })
  const headers = {
    'content-type': 'application/json', 'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
  }
  const person = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name: 'River' }),
  })
  expect(person.status, await person.clone().text()).toBe(200)
  const reader = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST', headers, body: JSON.stringify({ handle: 'lantern-reader', name: 'River', role: 'secretary', runtime: 'codex' }),
  })
  expect(reader.status, await reader.clone().text()).toBe(201)
  const writtenBy = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'lantern-reader' }
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: writtenBy, body: JSON.stringify({
      kind: 'pipeline', title: pipelineTitle, data: { blockIds: [] },
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  pipelineId = (await made.json()).record.id
  const block = await fetch(`${app.api}/api/records/${pipelineId}/blocks`, {
    method: 'POST', headers: writtenBy, body: JSON.stringify({ name: 'Fold the lantern paper', state: 'doing' }),
  })
  expect(block.status, await block.clone().text()).toBe(201)
  const report = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: writtenBy, body: JSON.stringify({
      kind: 'report', title: 'Made-up paper lantern checks', data: { for: 'River', date: '2026-09-27', blocks: [
        { id: 'b-paper', type: 'text', heading: 'Paper folds', text: 'Made-up example: The folded paper held its shape on the display shelf.' },
      ] },
    }),
  })
  expect(report.status, await report.clone().text()).toBe(201)
  reportId = (await report.json()).record.id
  if (shots) mkdirSync(shots, { recursive: true })
})

afterAll(async () => { await app?.stop() })

async function open(page: Page, path: string, language = 'en', theme = 'light', mode: Mode = 'normal') {
  // A document of its own, so a mode named in the address is read again rather than kept from the
  // page already loaded. Going from one hash to another does not reload the app by itself.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}&look=${theme}&mode=${mode}#${path}`)
  await waitForThePage(page, 30_000)
  expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
  // Settings draws one category at a time (wave 13y round 125); each check below chooses the category it reads.
  if (path.startsWith('/pipeline/')) await openThePipelineIndex(page)
}

/**
 * CHANGE THE ADDRESS IN THIS SAME PAGE, without a reload. The app is a hash router, so a route this
 * test has already loaded is reached with no second start of the page.
 */
async function goTo(page: Page, path: string) {
  await page.evaluate((to) => { window.location.hash = `#${to}` }, path)
  await waitForThePage(page, 30_000)
}

/** Switch Normal and Developer by the switch on Settings, in the page already loaded. */
async function switchMode(page: Page, mode: Mode) {
  if (!page.url().includes('#/settings')) await goTo(page, '/settings')
  // The switch is inside the mode panel, and Settings draws one category at a time, so the panel's is chosen first.
  await openSettingsPanel(page, 'settings.mode')
  await page.locator('.viewswitch').getByRole('button', { name: mode === 'inspect' ? 'Developer' : 'Normal', exact: true }).click()
}

/**
 * THE PIPELINE PAGE'S INDEX, OPENED. It is the page these row checks read since the approved Home
 * stopped drawing pipelines in Row: its index draws each pipeline in Row
 * with the default columns, inside a fold that starts closed.
 */
async function openThePipelineIndex(page: Page) {
  const fold = page.locator('details[data-target="uiSurface/pipeline.index"]')
  await fold.waitFor({ state: 'attached', timeout: 30_000 })
  if (await fold.getAttribute('open') === null) await fold.locator(':scope > summary').click()
  await fold.locator('.px-row').first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** The one pipeline's page, whose index is where the rows below are read. */
const pipelinePage = () => `/pipeline/${pipelineId}`

async function appearance(card: Locator) {
  return card.evaluate(node => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, border: style.borderColor, shadow: style.boxShadow, ink: style.color }
  })
}

function contrast(ink: string, paper: string) {
  const luminance = (rgb: string) => {
    const channels = rgb.match(/[\d.]+/g)?.slice(0, 3).map(Number)
    if (channels?.length !== 3) throw new Error(`Cannot read the computed colour ${rgb}`)
    return channels.reduce((sum, c, i) => {
      const channel = c / 255
      return sum + [0.2126, 0.7152, 0.0722][i]! * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    }, 0)
  }
  const a = luminance(ink), b = luminance(paper)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

it('distinguishes a chosen Settings card from rest and hover in both looks, with readable text', async () => {
  expect(contrast('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(21)
  for (const theme of ['light', 'dark']) {
    await open(app.page, '/settings', 'en', theme)
    for (const [selector, attribute, yes, no] of [
      ['.mlk-choice', 'aria-pressed', 'true', 'false'],
      ['.rvl-choice', 'aria-pressed', 'true', 'false'],
      ['.cpx-one', 'data-chosen', 'yes', 'no'],
      ['.ctsz-one', 'data-chosen', 'yes', 'no'],
      ['.qv-one', 'data-chosen', 'yes', 'no'],
      ['.ml-one', 'data-chosen', 'yes', 'no'],
      ['.ccl-choice', 'aria-pressed', 'true', 'false'],
    ]) {
      await chooseTheCategoryThatDraws(app.page, selector!)
      const chosen = app.page.locator(`${selector}[${attribute}="${yes}"]`).first()
      const unchosen = app.page.locator(`${selector}[${attribute}="${no}"]`).first()
      await chosen.waitFor({ state: 'visible' })
      await unchosen.waitFor({ state: 'visible' })
      await app.page.mouse.move(0, 0)
      const selected = await appearance(chosen), resting = await appearance(unchosen)
      expect(selected.background !== resting.background || selected.shadow !== resting.shadow,
        `${theme} ${selector}: chosen ${JSON.stringify(selected)}; resting ${JSON.stringify(resting)}`).toBe(true)
      await unchosen.hover()
      const hovered = await appearance(unchosen)
      expect(selected.background !== hovered.background || selected.shadow !== hovered.shadow,
        `${theme} ${selector}: chosen ${JSON.stringify(selected)}; hovered ${JSON.stringify(hovered)}`).toBe(true)
      await chosen.hover()
      expect(await appearance(chosen), `${theme} ${selector}: hover keeps the chosen mark`).toEqual(selected)
      // Each text is measured against the background it is drawn on: the card's own, or that of a
      // drawn sample inside it (the chat circle's number choice holds two small pills).
      const inks = await chosen.evaluate(node => [node, ...node.querySelectorAll('*')]
        .filter(el => [...el.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
        .map(el => {
          let under: Element | null = el
          while (under !== null && under !== node && getComputedStyle(under).backgroundColor === 'rgba(0, 0, 0, 0)') under = under.parentElement
          return { ink: getComputedStyle(el).color, on: under === null || under === node ? null : getComputedStyle(under).backgroundColor }
        }))
      for (const { ink, on } of [{ ink: selected.ink, on: null }, ...inks]) {
        expect(contrast(ink, on ?? selected.background), `${theme} ${selector}: ${ink} on ${on ?? selected.background}`).toBeGreaterThanOrEqual(4.5)
      }
      measurements.push({ theme, selector, selected, resting, hovered })
    }
  }
  await app.page.goto(`${app.site}/?lang=zh&mode=inspect&look=light#/settings`)
  await waitForThePage(app.page, 30_000)
  await openSettingsPanel(app.page, 'settings.words')
  const words = await app.page.locator('[data-target="uiSurface/settings.words"]').innerText()
  console.log('The Chinese page word check:', words)
  measurements.push({ wordCheck: words })
}, 120_000)

it('previews a message link without its record id in normal mode, as the chat draws it', async () => {
  // One Settings page, loaded in Normal mode, and the mode changed on it. The preview is read
  // after it has redrawn in each mode, so no second page load is made.
  await open(app.page, '/settings', 'en', 'light', 'normal')
  await chooseTheCategoryThatDraws(app.page, '.mlk-example')
  const examples = app.page.locator('.mlk-example')
  await examples.first().waitFor()
  const normal = await examples.allInnerTexts()
  expect(normal.length).toBeGreaterThan(0)
  for (const text of normal) expect(text, 'the normal-mode preview shows an id the chat does not draw').not.toContain('#')
  await switchMode(app.page, 'inspect')
  // The switch is in another category, so the examples' category is chosen again.
  await chooseTheCategoryThatDraws(app.page, '.mlk-example')
  await expect.poll(async () => {
    const drawn = await app.page.locator('.mlk-example').allInnerTexts()
    return drawn.length > 0 && drawn.every((text) => text.includes('#hUEy7xTi6amC'))
  }, { message: 'the developer preview lost the id the chat draws there' }).toBe(true)
}, 120_000)

it('keeps Row record ids out of normal mode and draws them in developer mode', async () => {
  // One pipeline page, in the light theme, loaded in Normal mode, then the mode changed on it and the
  // pipeline address reached again in the same page. Whether an id is drawn does not depend on the colours.
  const theme = 'light'
  await open(app.page, pipelinePage(), 'en', theme, 'normal')
  const row = app.page.locator(`.px-row[data-target^="record/${pipelineId}"]`)
  await row.first().waitFor()
  expect(await app.page.locator('.px-row .rid-text').count()).toBe(0)
  for (const text of await row.allInnerTexts()) expect(text).not.toContain(pipelineId)
  await switchMode(app.page, 'inspect')
  await goTo(app.page, pipelinePage())
  await openThePipelineIndex(app.page)
  await row.first().locator('.rid-text').waitFor()
  expect(await row.first().locator('.rid-text').isVisible()).toBe(true)
  expect(await row.locator('.rid-text').allTextContents()).toEqual(Array(await row.count()).fill(pipelineId))
  if (shots) await app.page.screenshot({ path: join(shots, `pipeline-developer-1440-${theme}-en.png`), fullPage: true })
}, 60_000)

async function columns(page: Page, selector = '.px-row:not(.px-skel), .px-scan-sum') {
  return page.locator(selector).evaluateAll(rows => rows.filter(row => row.checkVisibility()).map(row => {
    const title = row.querySelector<HTMLElement>('.px-row-title, .px-scan-title')
    const main = row.querySelector<HTMLElement>('.px-row-main, .px-scan-main')
    if (!title || !main) throw new Error(`A drawn row has no title cell: ${row.outerHTML}`)
    const probe = document.createElement('span')
    probe.style.cssText = `position:absolute;visibility:hidden;width:8ch;font:${getComputedStyle(title).font}`
    document.body.append(probe)
    const eightCharacters = probe.getBoundingClientRect().width
    probe.remove()
    return {
      title: title.textContent, columns: getComputedStyle(row).gridTemplateColumns.split(' ').map(Number.parseFloat),
      titleWidth: main.getBoundingClientRect().width, eightCharacters,
      custom: (row as HTMLElement).style.getPropertyValue('--cols'),
    }
  }))
}

/** Check the rows on one already loaded page at one width, and keep its measurement. */
async function checkColumnsAt(path: string, theme: string, width: number) {
  if (path === '/ui') await app.page.locator('.px-scan-title').filter({ hasText: en['sheet.catalogueCheck'] }).waitFor()
  else await app.page.locator('.px-row-title').filter({ hasText: pipelineTitle }).first().waitFor()
  const found = await columns(app.page)
  expect(found.length).toBeGreaterThan(0)
  if (path !== '/ui') expect(found.find(row => row.title === pipelineTitle)?.custom).toBe('')
  for (const row of found) {
    expect(row.columns.every(Number.isFinite), `${path}: ${JSON.stringify(row)}`).toBe(true)
    expect(row.titleWidth, `${theme} ${width} ${path}: ${JSON.stringify(row)}`).toBeGreaterThanOrEqual(row.eightCharacters)
  }
  measurements.push({ theme, width, path, rows: found })
}

it('keeps the title column at least eight characters wide on the sheet and a default-row page at 660 and 990', async () => {
  // One sheet and one pipeline page, in the light theme: a column's width does not depend on the colours. The two
  // widths are reached by resizing that page, and Developer mode by the switch, rather than loading each combination again.
  const theme = 'light'
  await app.page.setViewportSize({ width: 660, height: 1000 })
  await open(app.page, '/ui', 'en', theme)
  await checkColumnsAt('/ui', theme, 660)
  await app.page.setViewportSize({ width: 990, height: 1000 })
  await checkColumnsAt('/ui', theme, 990)
  await goTo(app.page, pipelinePage())
  await openThePipelineIndex(app.page)
  await checkColumnsAt(pipelinePage(), theme, 990)
  await app.page.setViewportSize({ width: 660, height: 1000 })
  await checkColumnsAt(pipelinePage(), theme, 660)
  await switchMode(app.page, 'inspect')
  await goTo(app.page, pipelinePage())
  await openThePipelineIndex(app.page)
  await app.page.locator(`.px-row[data-target^="record/${pipelineId}"]`).first().waitFor()
  for (const width of [990, 660]) {
    await app.page.setViewportSize({ width, height: 1000 })
    const withId = await columns(app.page, `.px-row[data-target^="record/${pipelineId}"]`)
    expect(withId.length).toBeGreaterThan(0)
    for (const row of withId) expect(row.titleWidth, `${theme} inspect ${width}: ${JSON.stringify(row)}`).toBeGreaterThanOrEqual(row.eightCharacters)
    measurements.push({ theme, width, path: pipelinePage(), mode: 'inspect', rows: withId })
  }
  if (shots) {
    for (const theme of ['light', 'dark']) for (const width of [1440, 990, 660, 390]) {
      await app.page.setViewportSize({ width, height: 1000 })
      for (const language of width === 1440 ? ['en', 'zh', 'xx'] : ['en']) {
        for (const [name, path] of [['settings', '/settings'], ['role-new', '/roles/new'], ['sheet', '/ui'], ['pipeline', pipelinePage()], ['report-regions', `/r/${reportId}`]]) {
          await open(app.page, path!, language, theme)
          if (name === 'pipeline') await app.page.locator('.px-row-title').filter({ hasText: pipelineTitle }).first().waitFor()
          if (name === 'settings') await chooseTheCategoryThatDraws(app.page, '.rvl-choice')
          if (name === 'role-new') await app.page.locator('.rnc-pic-none').waitFor()
          if (name === 'report-regions') {
            const regions = app.page.locator('.sb-regions')
            await regions.waitFor()
            const resting = await appearance(regions)
            await regions.hover()
            const hovered = await appearance(regions)
            await regions.click()
            measurements.push({ theme, width, language, selector: '.sb-regions', resting, hovered, selected: await appearance(regions) })
          }
          const file = `${name}-${width}-${theme}-${language}.png`
          await app.page.screenshot({ path: join(shots, file), fullPage: true })
          const text = await app.page.locator('main').innerText()
          measurements.push({ file, pipelineId, viewport: width,
            page: await app.page.evaluate(() => document.documentElement.scrollWidth),
            text, rows: name === 'sheet' || name === 'pipeline' ? await columns(app.page) : undefined,
            focus: await app.page.locator('.mlk-choices, .rvl-choices, .cpx, .ctsz, .qv, .ml, .rnc-pics, .px-scan, .px-row')
              .evaluateAll(nodes => nodes.filter(node => !node.matches('.px-scan, .px-row') || /夹具标定|paper lantern assembly/.test(node.textContent ?? ''))
                .filter(node => node.getClientRects().length > 0).map(node => {
                  const rect = node.getBoundingClientRect()
                  return { name: node.className, x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height }
                })),
          })
        }
      }
    }
    writeFileSync(join(shots, 'measurements.json'), JSON.stringify(measurements, null, 2))
  }
}, 240_000)
