// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EVOLUTION DRAWING CURVES EACH BRANCH OFF THE TRUNK OF THE RECORD IT WAS LINKED FROM. Wave 13k round 40,
 * piece 2 (problem _b3XYAYKrZsC).
 *
 * The evolution drawing on a module's page (src/web/components/graph/Evolution.tsx) is not the shared drawing
 * in src/web/components/graph. It lays out its own tree: each direction is a row, with a dot, a curve from the
 * trunk of the record it was linked from, and straight rules that carry a trunk down to its next branch.
 * tests/module-evolution.test.ts checks the curves as path text and the rows as markup. Nothing looked at where
 * they land in a browser, so a curve that leaves the wrong trunk, or a trunk that stops before its branch,
 * passed every test.
 *
 * WHAT IS CLAIMED: on the module's page, in light, in English at 1440 and 390 and in Chinese at 1440:
 *   - there is one row and one dot per record on the drawing: the module and each direction it reaches;
 *   - each direction's curve ends on its own dot, and starts on the trunk of the record it was linked from.
 *     That record is the nearest row above whose dot is on the curve's starting line, and ink runs on that line
 *     from its dot down to the curve, broken by no gap wider than a pixel and a half;
 *   - so the pairs the drawing joins are exactly the stored links of the tree.
 *
 * MADE-UP RECORDS: one module and five directions the test office's person files, linked as a tree two deep,
 * so one trunk carries on past a deeper branch to a later one.
 *
 * WHAT IT FOUND: written against main, every case was red. Each row's space below it was padding on the row,
 * and the line strip stretches only to the row's content, so every trunk broke for that height between two
 * rows and no branch reached the trunk it came from. The space is now the body's, inside the row.
 *
 * MUTATIONS, after a control run (the commit that added this file names the logs): in Evolution.tsx, (1) the
 * space put back on the row, and (2) a trunk that carries on past a row no longer drawn through that row.
 * The cases go red under each.
 *
 * PICTURES: only when TEST_SHOTS names a folder, the drawing at each width, look and language.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LANGUAGES = ['en', 'zh'] as const
// LIGHT ONLY. The curves do not depend on the colour scheme, so the dark looks go.
const LOOKS = ['light'] as const
const WIDTHS = { en: [1440, 390], zh: [1440] } as const

const MODULE = 'Pot gripper'
/** Each direction, and the record it is linked from. */
const TREE: [string, string][] = [
  ['Grip by the handle', MODULE],
  ['Grip by the rim', MODULE],
  ['Find the handle by touch', 'Grip by the handle'],
  ['Learn the handle from one try', 'Find the handle by touch'],
  ['Find the handle by eye', 'Grip by the handle'],
]
const STORED = TREE.map(([child, parent]) => `${parent} > ${child}`).sort()

let app: LiveApp
let page: Page
let moduleId = ''
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('evolution-branches')

async function post(path: string, body: unknown): Promise<{ record?: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record?: { id: string } }
}

interface Seen {
  rows: number
  dots: number
  joined: string[]
  offTheirDot: string[]
}

/** Open the module's page and measure the evolution drawing. */
async function look(language: 'en' | 'zh', theme: string, width: number): Promise<Seen> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}&look=${theme}#/r/${moduleId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.ev-rows').first().waitFor({ timeout: 30_000 })
  await page.locator('.ev-rows').first().scrollIntoViewIfNeeded()
  return page.evaluate(() => {
    const NEAR = 1.5
    const rows = [...document.querySelectorAll('.ev-rows').item(0).querySelectorAll(':scope > li.ev-row')]
    const titleOf = (row: Element) => (row.querySelector('.ev-title')?.textContent ?? '').trim()
    const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const dots = rows.map((row) => row.querySelectorAll('.ev-dot'))
    const at = dots.map((list) => centre((list[0] as Element).getBoundingClientRect()))
    const upright = rows
      .flatMap((row) => [...row.querySelectorAll('.ev-through, .ev-tail')])
      .filter((one) => one.checkVisibility())
      .map((one) => one.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    /** True when ink at x covers every y from y1 to y2, with no gap wider than a pixel and a half. */
    const runs = (x: number, y1: number, y2: number): boolean => {
      const spans = upright
        .filter((r) => Math.abs(r.left + r.width / 2 - x) <= NEAR)
        .map((r) => [r.top, r.bottom] as const)
        .sort((a, b) => a[0] - b[0])
      let reached = y1
      for (const [top, bottom] of spans) {
        if (top > reached + NEAR) break
        reached = Math.max(reached, bottom)
      }
      return reached >= y2 - NEAR
    }
    /** A point on a path, on the page. */
    const onPage = (path: SVGPathElement, length: number) => {
      const p = path.getPointAtLength(length)
      const m = path.getScreenCTM() as DOMMatrix
      return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
    }
    const joined: string[] = []
    const offTheirDot: string[] = []
    rows.forEach((row, i) => {
      const path = row.querySelector('path.ev-curve') as SVGPathElement | null
      if (path === null) return
      const start = onPage(path, 0)
      const end = onPage(path, path.getTotalLength())
      const dot = at[i]!
      if (Math.abs(end.x - dot.x) > NEAR || Math.abs(end.y - dot.y) > NEAR) offTheirDot.push(titleOf(row))
      for (let k = i - 1; k >= 0; k -= 1) {
        const above = at[k]!
        if (Math.abs(above.x - start.x) > NEAR) continue
        if (runs(start.x, above.y, start.y)) joined.push(`${titleOf(rows[k]!)} > ${titleOf(row)}`)
        break
      }
    })
    return {
      rows: rows.length,
      dots: dots.reduce((n, list) => n + list.length, 0),
      joined: joined.sort(),
      offTheirDot,
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'evolution-branches', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  const ids = new Map<string, string>()
  moduleId = (await post('/api/records', { kind: 'module', title: MODULE, data: {} })).record!.id
  ids.set(MODULE, moduleId)
  for (const [child, parent] of TREE) {
    const made = await post('/api/records', {
      kind: 'direction',
      title: child,
      data: { depth: 'read', depth_reason: 'Written down, and nothing was run.' },
    })
    ids.set(child, made.record!.id)
    await post('/api/links', { fromId: ids.get(parent), toId: made.record!.id, type: 'relates_to' })
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('the evolution drawing joins a direction to the record it was linked from, and to no other', () => {
  for (const language of LANGUAGES) {
    it.each(WIDTHS[language])(`${language}: at %i, light and dark, every curve leaves its own trunk and ends on its own dot`, async (width) => {
      for (const theme of LOOKS) {
        const seen = await look(language, theme, width)
        if (KEEP) {
          await page.locator('.ev-rows').first().screenshot({ path: join(SHOTS, `evolution-${language}-${width}-${theme}.png`) })
        }
        expect(seen.rows, `${theme}: one row per record on the drawing`).toBe(TREE.length + 1)
        expect(seen.dots, `${theme}: one dot per row`).toBe(TREE.length + 1)
        expect(seen.offTheirDot, `${theme}: curves that end off their own dot`).toEqual([])
        expect(seen.joined, `${theme}: the pairs the drawing joins`).toEqual(STORED)
      }
    }, 240_000)
  }
})
