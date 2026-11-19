// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD'S STORED JSON STAYS INSIDE ITS COLUMN, with the Stored fields fold opened, at 1440, 990,
 * 660 and 390.
 *
 * Mutation: in src/web/components/ModuleView.tsx, FieldList's `<style href="mole-office-module" ...>`
 * element removed: the case goes red, because the JSON scrolls sideways.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const longParagraph = Array.from({ length: 25 }, (_, index) =>
  `Made-up paragraph word ${index + 1} describes how the synthetic report was read and what the test measures.`,
).join(' ')
const shots = process.env.W13K_CX15_SHOTS
let app: LiveApp
let recordId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'stored-fields-json-width', workspace: 'default', viewport: { width: 1440, height: 990 } })
  const response = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'report',
      title: 'Made-up report with a long stored paragraph',
      data: {
        for: 'A made-up project',
        date: '2026-09-29',
        blocks: [{ id: 'b-1', type: 'text', text: longParagraph }],
      },
    }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  recordId = (await response.json()).record.id as string
}, 180_000)

afterAll(async () => { await app?.stop() })

it('keeps stored JSON inside its column at four widths and measures each box', async () => {
  const measurements: unknown[] = []
  const violations: string[] = []

  for (const width of [1440, 990, 660, 390]) {
    await app.page.setViewportSize({ width, height: 990 })
    await app.page.goto(`${app.site}/?mode=inspect#/r/${recordId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    // THE STORED FIELDS ARE A CLOSED FOLD IN DEVELOPER MODE. The fold is
    // opened here, the way a person opens it, so what is measured is the list they would read.
    await app.page.evaluate(() => {
      for (const fold of document.querySelectorAll('article.rp details')) {
        if (fold.querySelector('.mv-fields') !== null) (fold as HTMLDetailsElement).open = true
      }
    })
    const fields = app.page.locator('.mv-fields').first()
    await fields.waitFor()
    const measure = await fields.evaluate((list) => {
      const asElement = (element: Element | null) => element as HTMLElement | null
      const panel = asElement(list.closest('.px-panel'))
      const column = asElement(list.closest('article.rp'))
      const row = asElement(list.querySelector('.mv-field'))
      const key = asElement(list.querySelector('.mv-field-key'))
      const value = asElement(list.querySelector('.mv-field-value'))
      const json = asElement(list.querySelector('.mv-field-json'))
      const describe = (element: HTMLElement | null) => {
        if (element === null) return null
        const rect = element.getBoundingClientRect()
        const css = getComputedStyle(element)
        return {
          element: element.tagName.toLowerCase(),
          className: element.className,
          rect: { left: rect.left, right: rect.right, width: rect.width },
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          display: css.display,
          minWidth: css.minWidth,
          whiteSpace: css.whiteSpace,
          overflowWrap: css.overflowWrap,
        }
      }
      const ancestors: HTMLElement[] = []
      for (let current = panel; current !== null; current = current.parentElement) {
        ancestors.push(current)
        if (current === column || current.tagName.toLowerCase() === 'article') break
      }
      return {
        panel: describe(panel),
        column: describe(column),
        fields: describe(list as HTMLElement),
        row: describe(row),
        key: describe(key),
        value: describe(value),
        json: describe(json),
        ancestors: ancestors.map((element) => describe(element)),
      }
    })
    measurements.push({ width, ...measure })

    const sizes = measure as {
      panel: { rect: { width: number }; clientWidth: number; scrollWidth: number } | null
      column: { rect: { width: number }; clientWidth: number; scrollWidth: number } | null
      fields: { clientWidth: number; scrollWidth: number } | null
      row: { clientWidth: number; scrollWidth: number } | null
      key: { clientWidth: number; scrollWidth: number } | null
      value: { clientWidth: number; scrollWidth: number } | null
      json: { clientWidth: number; scrollWidth: number } | null
      ancestors: { element: string; className: string; clientWidth: number; scrollWidth: number }[]
    }
    if (sizes.panel === null || sizes.column === null) violations.push(`${width}: panel or record column was not found`)
    else if (sizes.panel.rect.width > sizes.column.rect.width + 1) {
      violations.push(`${width}: Stored fields panel ${sizes.panel.rect.width}px exceeds record column ${sizes.column.rect.width}px`)
    }
    for (const [name, box] of Object.entries({ panel: sizes.panel, column: sizes.column, fields: sizes.fields, row: sizes.row, key: sizes.key, value: sizes.value, json: sizes.json })) {
      if (box !== null && box.scrollWidth > box.clientWidth + 1) violations.push(`${width}: ${name} scrolls ${box.scrollWidth}px inside ${box.clientWidth}px`)
    }
    for (const box of sizes.ancestors) {
      if (box.scrollWidth > box.clientWidth + 1) violations.push(`${width}: ${box.element}.${box.className} scrolls ${box.scrollWidth}px inside ${box.clientWidth}px`)
    }

    if (shots) {
      mkdirSync(shots, { recursive: true })
      for (const theme of ['light', 'dark']) {
        await app.page.evaluate((name) => { document.documentElement.dataset.theme = name }, theme)
        await app.page.waitForTimeout(30)
        await app.page.screenshot({ path: join(shots, `stored-fields-${theme}-${width}.png`), fullPage: true })
      }
    }
  }

  if (shots) writeFileSync(join(shots, 'stored-fields-measurements.json'), JSON.stringify(measurements, null, 2))
  console.info(`STORED_FIELDS_MEASUREMENTS ${JSON.stringify(measurements)}`)
  expect(violations, 'stored fields must fit its column and its values must not scroll sideways').toEqual([])
}, 180_000)
