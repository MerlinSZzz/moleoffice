// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The text on each card stays within its border in the made-up master. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { prepareThePage, storeTheAreas, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
import { MASTER, storeTheMadeUpMaster } from './a-made-up-master-at-real-shape.ts'

const PROJECT = { id: 'test-master-shape', title: 'Example office for a master (made up)' }
let db: TestDb
let app: LiveApp
let stored: ReturnType<typeof storeTheMadeUpMaster>
const largest = MASTER.blockPipelines.reduce((a, b) => a.boxes.length >= b.boxes.length ? a : b)
const drawings = [
  { name: 'master boxes', key: MASTER.pipeline.key, level: 'boxes', atLeast: 34 },
  { name: 'master steps', key: MASTER.pipeline.key, level: 'steps', atLeast: 13 },
  { name: 'largest block', key: largest.key, level: 'steps', atLeast: largest.boxes.length + new Set(MASTER.links.filter((link) => link.type === 'implements' && largest.boxes.includes(link.to)).map((link) => link.from)).size },
] as const

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace(PROJECT)
  stored = storeTheMadeUpMaster(db, PROJECT.id)
  app = await liveApp({ name: 'master-shape', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: stored.master })
  const lanes = Array.from({ length: 6 }, (_, n) => ({ name: `Example area ${n + 1} (made up)`, arrange: 'row', order: n, tint: `--area-${n + 1}` }))
  const nodes = Object.fromEntries(largest.boxes.map((box, n) => [stored.id[box]!, { lane: lanes[n % lanes.length]!.name, order: n }]))
  const areas = await storeTheAreas(write, stored.id[largest.key]!, { lanes, nodes })
  expect(areas.ok, `example areas were stored: ${areas.text}`).toBe(true)
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => { await app?.stop(); db?.close() }, 120_000)

let opens = 0
async function open(drawing: typeof drawings[number], theme: 'light' | 'dark') {
  const started = performance.now()
  let outcome = 'complete'
  try {
    await app.page.goto(`${app.site}/?lang=en&theme=${theme}&open=${++opens}#${pipelinePath(stored.id[drawing.key]!)}`, { waitUntil: 'commit', timeout: 300_000 })
  } catch (error) {
    outcome = 'failed'
    throw error
  } finally {
    console.log(`OPEN_TIMING ${JSON.stringify({ width: app.page.viewportSize()?.width, level: drawing.level, drawing: drawing.name, milliseconds: Math.round((performance.now() - started) * 100) / 100, outcome })}`)
  }
  const root = app.page.locator('[data-drawing="lanes"]')
  await app.page.locator('[data-drawing="lanes"][data-fit]').waitFor({ timeout: 300_000 })
  if (drawing.key === MASTER.pipeline.key && drawing.level === 'steps') {
    await app.page.locator('[data-level-control] button[data-level="steps"]').click()
    await app.page.locator('[data-drawing="lanes"][data-level="steps"][data-fit]').waitFor({ timeout: 300_000 })
  }
  const own = drawing.name === 'master boxes' ? MASTER.blockPipelines.flatMap((block) => block.boxes) : drawing.name === 'master steps' ? MASTER.steps.map((step) => step.key) : largest.boxes
  await app.page.waitForFunction(({ level, ids }) => {
    const drawing = document.querySelector('[data-drawing="lanes"][data-fit]')
    return drawing?.getAttribute('data-level') === level && ids.every((id) => [...drawing.querySelectorAll('.e-card')].some((card) => card.getAttribute('data-id') === id))
  }, { level: drawing.level, ids: own.map((key) => stored.id[key]!) }, { timeout: 300_000 })
  expect(await root.getAttribute('data-level')).toBe(drawing.level)
}

// The longest case took 174,861 ms and navigation may wait 300,000 ms; 900,000 ms is about five and three times those, while 2,000,000 ms could hold a seat for 33 minutes.
const caseAllowance = 900_000

// One theme: where a card's words lie does not change with the theme.
const theme = 'light'
for (const width of [1440, 390]) for (const drawing of drawings) {
  it(`${width}px ${drawing.name} ${theme}: every card keeps its text inside`, async () => {
    await app.page.setViewportSize({ width, height: 1000 })
    await open(drawing, theme)
    const result = await app.page.locator('[data-drawing="lanes"]').evaluate((root) => {
      const cards = [...root.querySelectorAll<HTMLElement>('.e-card')]
      const failures: string[] = []
      let texts = 0
      for (const card of cards) {
        const border = card.getBoundingClientRect()
        const title = card.querySelector('.e-title')?.textContent?.trim() || card.getAttribute('data-id') || '(unnamed card)'
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode as Text
          const words = node.textContent?.trim() ?? ''
          if (!words || !node.parentElement || getComputedStyle(node.parentElement).visibility !== 'visible') continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rect of range.getClientRects()) {
            if (rect.width === 0 || rect.height === 0) continue
            texts++
            const left = Math.max(0, border.left - rect.left)
            const right = Math.max(0, rect.right - border.right)
            const top = Math.max(0, border.top - rect.top)
            const bottom = Math.max(0, rect.bottom - border.bottom)
            if (left > 0 || right > 0 || top > 0 || bottom > 0) {
              failures.push(`${title}: "${words}" leaves the card by left ${left.toFixed(2)}, right ${right.toFixed(2)}, top ${top.toFixed(2)}, bottom ${bottom.toFixed(2)} px`)
            }
          }
          range.detach()
        }
      }
      return { cards: cards.length, texts, failures }
    })
    console.log(`${width}px ${drawing.name} ${theme}: ${result.cards} cards, ${result.texts} text rectangles, ${result.failures.length} outside their cards`)
    expect(result.cards, `${drawing.name}: cards drawn`).toBeGreaterThanOrEqual(drawing.atLeast)
    expect(result.texts, `${drawing.name}: text drawn`).toBeGreaterThan(0)
    expect(result.failures, `${width}px ${drawing.name} ${theme}: card text outside its border`).toEqual([])
  }, caseAllowance)
}
