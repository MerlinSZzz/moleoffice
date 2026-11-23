// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODEL EACH RUN USES IS SET IN THE BROWSER AND READ BACK. Criterion U2.
 *
 * A real browser against a throwaway office:
 *
 *   1. On the Settings page the person sets the model a run answering a message gets, presses Save,
 *      and the office's door reads it back. Where the builder rows were, a link leads to the Casting
 *      page.
 *   2. On an agent's profile the person presses Change, types the agent's own model, presses Set,
 *      and the office's door reads it back.
 *   3. The Runtime page names the model the role's builders go to, from the Casting table.
 *   4. A page acting as an agent is refused, and the refusal is drawn in words where the press was.
 *   5. With a runtime that takes a reasoning effort chosen, the Runtime, Model and effort boxes and
 *      the Save and Clear presses lie inside the row, and the row inside the panel, at 390, 660
 *      and 1440 in light. Putting flex none back on the control group, so it
 *      keeps its one-line width, turns this case red at 660.
 *
 * Every screen is checked for sideways scrolling at 1440 and 390 in light. With
 * RUN_MODELS_SHOTS set to a folder, each of the three surfaces is photographed at those widths and
 * themes into it. No model is called.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { theRuntimesTheAdaptersGive } from './the-runtimes-the-adapters-give.ts'

let app: LiveApp
const WIDTHS = [1440, 390] as const
const CONTROL_WIDTHS = [390, 660, 1440] as const
const THEMES = ['light'] as const
const PANEL = '[data-target="uiSurface/settings.runmodels"]'

const headers = (type: 'human' | 'agent', id: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })

async function post(path: string, body: unknown, as = headers('human', THE_PERSON)): Promise<void> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: as, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
}

async function read(path: string): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { headers: headers('human', THE_PERSON) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as Record<string, any>
}

async function open(address: string, waitFor: string): Promise<void> {
  await app.page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(waitFor, { timeout: 30_000 })
}

/** No sideways scrolling at any width or theme, and a picture of each when a folder is named. */
async function lookAtEveryWidth(what: string, selector: string): Promise<void> {
  const dir = process.env['RUN_MODELS_SHOTS']
  if (dir) mkdirSync(dir, { recursive: true })
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      const sideways = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(sideways, `${what} scrolls sideways at ${String(width)} in ${theme}`).toBe(0)
      if (dir) await app.page.locator(selector).first().screenshot({ path: `${dir}/${what}-${String(width)}-${theme}.png` })
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-model-each-run-uses', viewport: { width: 1440, height: 1000 } })
  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: 'Fixture secretary', runtime: 'claude-code', role: 'secretary' })
  await post('/api/agents/started', { handle: 'browser-builder', name: 'Browser builder', runtime: 'claude-code', role: 'supervisor', workArea: ['src'] }, headers('agent', THE_TEST_OFFICES_SECRETARY.handle))
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the model each run uses, in the browser', () => {
  it('sets the model a run answering a message gets on the Settings page, and points to Casting for the rest', async () => {
    await open('?mode=inspect#/settings/runmodels', `${PANEL} .rm`)
    const panel = app.page.locator(PANEL)
    expect((await panel.locator('.px-panel-title').first().textContent())?.trim()).toBe('The model each run uses')
    // WHERE THE BUILDER ROWS AND THE CHECK WERE: a link to the Casting page.
    expect(await panel.getByRole('link', { name: 'Open Casting' }).getAttribute('href')).toBe('#/casting')
    expect(await panel.locator('[data-slot^="builders."]').count()).toBe(0)
    expect(await panel.locator('[data-slot="places.conversation"] .rm-set').textContent()).toContain('nothing set')

    const row = panel.locator('[data-slot="places.conversation"]')
    await row.locator('select').selectOption('claude-code')
    await row.locator('input').first().fill('claude-opus-5-5')
    await row.getByRole('button', { name: 'Save' }).click()
    await app.page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.includes('claude-opus-5-5 on claude-code') === true,
      `${PANEL} [data-slot="places.conversation"] .rm-set`,
      { timeout: 20_000 },
    )
    const stored = await read('/api/office/run-models')
    expect(stored['places'].find((one: any) => one.slot.name === 'conversation').set).toEqual({ runtime: 'claude-code', model: 'claude-opus-5-5' })
    await lookAtEveryWidth('settings-panel', PANEL)
  }, 180_000)

  it('keeps the run-models controls inside the row and the panel at the widest and the narrowest width and at 660', async () => {
    await open('?mode=inspect#/settings/runmodels', `${PANEL} .rm`)
    const theAdapters = theRuntimesTheAdaptersGive()
    const clearPress = () => app.page.locator(`${PANEL} [data-slot="places.conversation"] .tiered-press button`)
    // Clear is drawn only when the row has a stored choice. Give it one through the door the first case writes through.
    if ((await clearPress().count()) === 0) {
      await post('/api/office/run-models', {
        places: { conversation: { runtime: theAdapters.aModelTo[0], model: 'a-made-up-model' } },
      })
      await open('?mode=inspect#/settings/runmodels', `${PANEL} .rm`)
    }
    const runtimeWithAnEffort = theAdapters.aModelTo.find((runtime) => theAdapters.aVariantTo.includes(runtime))
    expect(runtimeWithAnEffort, 'no runtime is given both a model and a reasoning effort').toBeDefined()
    const row = app.page.locator(`${PANEL} [data-slot="places.conversation"]`)
    await row.locator('select.rm-select').selectOption(runtimeWithAnEffort as string)
    await row.locator('input.rm-short').waitFor({ state: 'attached', timeout: 20_000 })
    for (const width of CONTROL_WIDTHS) {
      for (const theme of THEMES) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.emulateMedia({ colorScheme: theme })
        const failures = await app.page.evaluate(
          ({ panel, slot, width, theme }) => {
            const failures: string[] = []
            const name = (element: Element): string => {
              const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
              return [element.tagName.toLowerCase(), ...classes].join('.')
            }
            const box = (element: Element): DOMRect => element.getBoundingClientRect()
            const drawn = (element: Element): boolean => {
              const rect = box(element)
              const style = getComputedStyle(element)
              return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
            }
            const insideTheRow = (element: Element, row: Element): void => {
              const inner = box(element)
              const outer = box(row)
              if (inner.left < outer.left - 1) {
                failures.push(`${name(element)} left ${inner.left} is left of the row left ${outer.left} at ${width} in ${theme}`)
              }
              if (inner.right > outer.right + 1) {
                failures.push(`${name(element)} right ${inner.right} is right of the row right ${outer.right} at ${width} in ${theme}`)
              }
            }
            const panelElement = document.querySelector(panel)
            if (panelElement === null) {
              failures.push(`the panel is not drawn at ${width} in ${theme}`)
              return failures
            }
            const rowElement = panelElement.querySelector(`[data-slot="${slot}"]`)
            if (rowElement === null) {
              failures.push(`the row is not drawn at ${width} in ${theme}`)
              return failures
            }
            const rowBox = box(rowElement)
            const panelBox = box(panelElement)
            if (rowBox.left < panelBox.left - 1) {
              failures.push(`the row left ${rowBox.left} is left of the panel left ${panelBox.left} at ${width} in ${theme}`)
            }
            if (rowBox.right > panelBox.right + 1) {
              failures.push(`the row right ${rowBox.right} is right of the panel right ${panelBox.right} at ${width} in ${theme}`)
            }
            const control = rowElement.querySelector('.rm-control')
            if (control === null) {
              failures.push(`the control group is not drawn at ${width} in ${theme}`)
              return failures
            }
            const controls = Array.from(control.querySelectorAll('select, input, button'))
            if (controls.length === 0) failures.push(`the control group draws no control at ${width} in ${theme}`)
            for (const element of controls) {
              if (!drawn(element)) failures.push(`${name(element)} is not visible at ${width} in ${theme}`)
              insideTheRow(element, rowElement)
            }
            for (const [what, element] of [
              ['input.rm-short', control.querySelector('input.rm-short')],
              ['button.rm-press', control.querySelector('button.rm-press')],
              ['the Clear press', control.querySelector('.tiered-press button')],
            ] as const) {
              if (element === null) failures.push(`${what} is not drawn at ${width} in ${theme}`)
              else if (!drawn(element)) failures.push(`${what} is not visible at ${width} in ${theme}`)
            }
            return failures
          },
          { panel: PANEL, slot: 'places.conversation', width, theme },
        )
        expect(failures, `the run-models controls at ${width} in ${theme}`).toEqual([])
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.emulateMedia({ colorScheme: 'light' })
  }, 180_000)

  it('sets an agent’s own model on its profile, and the office reads it back', async () => {
    // CRITERION CHANGE, plan 7FEOshq3mBGG (G6b): an agent's runtime and model are Developer mode's on
    // its profile, so the page is opened in that mode. The press and what it stores are unchanged.
    await open('?mode=inspect#/who/agent/browser-builder', '.tmr')
    expect(await app.page.locator('.tmr .prof-value > span').first().textContent()).toBe('None set on this profile.')
    await app.page.locator('.tmr').getByRole('button', { name: 'Change' }).click()
    await app.page.locator('.tmr input').first().fill('claude-fable-5-1')
    await app.page.locator('.tmr').getByRole('button', { name: 'Set' }).click()
    await app.page.waitForSelector('.tmr[data-agent-model="claude-fable-5-1"]', { timeout: 20_000 })
    expect(await app.page.locator('.tmr .prof-value > span').first().textContent()).toBe('claude-fable-5-1 on claude-code, set on this profile.')
    const stored = await read('/api/office/run-models/agent/browser-builder')
    expect(stored['model']).toBe('claude-fable-5-1')
    expect(stored['builder']).toMatchObject({ model: 'claude-fable-5-1', from: 'the agent' })
    await lookAtEveryWidth('profile-with-a-model', '[data-target="uiSurface/profile.facts"]')
  }, 180_000)

  it('names on the Runtime page the model a role’s builders go to, from the Casting table', async () => {
    await post('/api/casting/supervisor', { program: { value: 'claude-code' }, model: { value: 'claude-opus-5-5' } })
    await open('#/runtime', '[data-target="uiSurface/runtime.places"]')
    const places = (await app.page.locator('[data-target="uiSurface/runtime.places"]').textContent()) ?? ''
    expect(places).toContain('a builder with the supervisor card')
    expect(places).toContain('claude-opus-5-5 — The Casting table names claude-opus-5-5 for supervisor.')
    await lookAtEveryWidth('runtime-page', '[data-target="uiSurface/runtime.places"]')
  }, 180_000)

  it('refuses a page acting as an agent, and says so where the press was', async () => {
    await app.page.evaluate((id) => window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id })), THE_TEST_OFFICES_SECRETARY.handle)
    try {
      await open('?mode=inspect#/settings/runmodels', `${PANEL} .rm`)
      const row = app.page.locator(`${PANEL} [data-slot="places.conversation"]`)
      await row.locator('input').first().fill('an-agents-own-choice')
      await row.getByRole('button', { name: 'Save' }).click()
      await app.page.waitForSelector(`${PANEL} [data-slot="places.conversation"] .rm-refuse`, { timeout: 20_000 })
      expect(await row.locator('.rm-refuse').textContent()).toContain("Which model a run gets is the owner's own setting")
      const stored = await read('/api/office/run-models')
      expect(stored['places'].find((one: any) => one.slot.name === 'conversation').set).toEqual({ runtime: 'claude-code', model: 'claude-opus-5-5' })
    } finally {
      await app.page.evaluate(() => window.localStorage.removeItem('mole-office.actor'))
    }
  }, 180_000)
})
