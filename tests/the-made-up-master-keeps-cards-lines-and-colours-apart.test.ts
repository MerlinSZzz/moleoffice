// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The measured shape of a made-up master at 1440 in the production page. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { pipelinePath } from '../src/web/components/router.tsx'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { aPlaceOnTheCard, prepareThePage, storeTheAreas, writerFor } from './a-made-up-office-drawn-in-lanes.ts'
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
async function open(drawing: typeof drawings[number]) {
  const started = performance.now()
  let outcome = 'complete'
  try {
    await app.page.goto(`${app.site}/?lang=en&theme=light&open=${++opens}#${pipelinePath(stored.id[drawing.key]!)}`, { waitUntil: 'commit', timeout: 300_000 })
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

let opened = ''
async function ensureOpen(drawing: typeof drawings[number], width: number) {
  const key = `${width}:${drawing.name}`
  if (opened === key) return
  await app.page.setViewportSize({ width, height: 1000 })
  await open(drawing)
  opened = key
}

type Rect = { x: number; y: number; w: number; h: number; name: string; id: string }
const intersect = (a: Rect, b: Rect) => ({ w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) })
const contains = (a: Rect, b: Rect) => a.x <= b.x + 0.01 && a.y <= b.y + 0.01 && a.x + a.w >= b.x + b.w - 0.01 && a.y + a.h >= b.y + b.h - 0.01

async function checkLines(drawing: typeof drawings[number], width: number, selected = '') {
    const links = Object.fromEntries([...stored.linkNamed].map(([id, name]) => {
      const [from, type, to] = name.split(' ')
      const titles = new Map([...MASTER.steps, ...MASTER.records, ...MASTER.blockPipelines, ...MASTER.extras, MASTER.session].map((item) => [item.key, item.title]))
      return [id, { name: `${titles.get(from!) ?? from} ${type} ${titles.get(to!) ?? to}`, from: stored.id[from!]!, to: stored.id[to!]! }]
    }))
  const read = await app.page.locator('[data-drawing="lanes"]').evaluate((root, { linksById, excluded }) => {
      const cards = [...root.querySelectorAll('.e-card')].map((el) => ({ id: el.getAttribute('data-id')!, name: el.querySelector('.e-title')?.textContent ?? '', box: el.getBoundingClientRect() }))
      const failures: string[] = []
      const unknown: string[] = []
      let skipped = 0
      let checked = 0
      const paths = root.querySelectorAll<SVGPathElement>('path.e-path')
      const outline = JSON.parse(root.getAttribute('data-fit') ?? '{}').outline === true
      for (const path of paths) {
        const id = path.dataset.link!, link = linksById[id]
        if (excluded.includes(id)) { skipped++; continue }
        if (!link) { unknown.push(id ?? '(no id)'); continue }
        checked++
        const matrix = path.getScreenCTM()
        if (!matrix) { failures.push(`${link.name} has no screen geometry`); continue }
        const length = path.getTotalLength()
        const scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
        const samples = Math.max(1, Math.ceil(length * scale * 2))
        const hit = new Set<string>()
        for (let i = 0; i <= samples; i++) {
          const point = path.getPointAtLength(length * i / samples).matrixTransform(matrix)
          for (const card of cards) {
            if (card.id === link.from || card.id === link.to || hit.has(card.id)) continue
            if (point.x > card.box.left + 2 && point.x < card.box.right - 2 && point.y > card.box.top + 2 && point.y < card.box.bottom - 2) {
              failures.push(`${link.name} through ${card.name} (${card.id})`)
              hit.add(card.id)
            }
          }
        }
      }
      return { failures, unknown, skipped, checked, outline, total: paths.length }
    }, { linksById: links, excluded: stored.containmentIds })
    if (read.outline) {
      console.log(`${width}px ${drawing.name}: outline, links shown as words, no line drawn`)
      expect(read.total, `${width}px ${drawing.name}${selected ? ` selected ${selected}` : ''}: outline paths`).toBe(0)
      return
    }
    console.log(`${width}px ${drawing.name}${selected ? ` selected ${selected}` : ''}: ${read.checked} paths checked, ${read.failures.length} lines through unrelated cards; ${read.skipped} excluded containment paths; ${read.unknown.length} unknown paths`)
    expect(read.checked, `${width}px ${drawing.name}${selected ? ` selected ${selected}` : ''}: checked paths`).toBeGreaterThan(0)
    expect(read.unknown, `${width}px ${drawing.name}${selected ? ` selected ${selected}` : ''}: ${read.skipped} excluded containment paths, ${read.unknown.length} unknown paths`).toEqual([])
    expect(read.failures, `${width}px ${drawing.name}${selected ? ` selected ${selected}` : ''} lines through cards; ${read.skipped} excluded containment paths, ${read.unknown.length} unknown paths`).toEqual([])

}

// The longest case took 174,861 ms and navigation may wait 300,000 ms; 900,000 ms is about five and three times those, while 2,000,000 ms could hold a seat for 33 minutes.
const caseAllowance = 900_000

for (const width of [1440, 990, 660, 390]) for (const drawing of drawings) {
  it(`${width}px ${drawing.name}: cards and areas do not overlap and all records are drawn`, async () => {
    await ensureOpen(drawing, width)
    const data = await app.page.locator('[data-drawing="lanes"]').evaluate((root) => {
      const rect = (el: Element, index: number) => {
        const r = el.getBoundingClientRect()
        const name = el.matches('.e-outline-area')
          ? el.querySelector(':scope > h3, :scope > h4')?.textContent ?? `Area ${index + 1}`
          : el.querySelector('.e-title')?.textContent ?? el.getAttribute('data-key') ?? `Area ${index + 1}`
        return { x: r.x, y: r.y, w: r.width, h: r.height, name: name.trim(), id: el.getAttribute('data-id') ?? el.getAttribute('data-key') ?? `area-${index + 1}` }
      }
      return { cards: [...root.querySelectorAll('.e-card')].map(rect), areas: [...root.querySelectorAll('.e-area, .e-outline-area')].map(rect) }
    })
    const expected = drawing.name === 'master boxes' ? MASTER.blockPipelines.flatMap((block) => block.boxes) : drawing.name === 'master steps' ? MASTER.steps.map((step) => step.key) : [...largest.boxes, ...new Set(MASTER.links.filter((link) => link.type === 'implements' && largest.boxes.includes(link.to)).map((link) => link.from))]
    const missing = expected.filter((key) => !data.cards.some((card) => card.id === stored.id[key]))
    const titles = new Map([...MASTER.steps, ...MASTER.records].map((item) => [stored.id[item.key], item.title]))
    for (const area of data.areas) area.name = titles.get(area.id) ?? area.name
    const conflicts: string[] = []
    for (const [kind, rects] of [['card', data.cards], ['area', data.areas]] as const) {
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!, overlap = intersect(a, b)
        if (overlap.w > 0.01 && overlap.h > 0.01 && !(kind === 'area' && (contains(a, b) || contains(b, a)))) conflicts.push(`${kind} ${a.name} (${a.id}) and ${b.name} (${b.id}): ${overlap.w.toFixed(2)} by ${overlap.h.toFixed(2)} px`)
      }
    }
    console.log(`${width}px ${drawing.name}: ${data.cards.length} cards, ${data.areas.length} areas, ${conflicts.length} overlaps`)
    expect(data.cards.length, `${drawing.name} cards`).toBeGreaterThanOrEqual(drawing.atLeast)
    expect(missing, `${drawing.name} missing records`).toEqual([])
    expect(conflicts, `${drawing.name} overlapping pairs`).toEqual([])
  }, caseAllowance)
  it(`${width}px ${drawing.name}: no line enters a card it does not join`, async () => {
    await ensureOpen(drawing, width)
    await checkLines(drawing, width)
  }, caseAllowance)
  it(`${width}px ${drawing.name}: visible badges and tinted areas have their computed colours`, async () => {
    await ensureOpen(drawing, width)
    const read = await app.page.locator('[data-drawing="lanes"]').evaluate((root) => {
      const colour = (token: string) => {
        const sample = document.createElement('span')
        sample.style.backgroundColor = `var(${token})`
        document.body.append(sample)
        const result = getComputedStyle(sample).backgroundColor
        sample.remove()
        return result
      }
      const background = getComputedStyle(document.body).backgroundColor
      const badges = [...root.querySelectorAll<HTMLElement>('.e-card .e-badge')].map((badge) => ({
        card: badge.closest('.e-card')?.querySelector('.e-title')?.textContent ?? '',
        id: badge.closest('.e-card')?.getAttribute('data-id') ?? '',
        text: badge.textContent ?? '', tone: badge.dataset.module ?? '',
        fill: getComputedStyle(badge).backgroundColor,
        cardFill: getComputedStyle(badge.closest('.e-card')!).backgroundColor,
        expected: colour(`--lanes-badge-${badge.dataset.module ?? ''}`),
      }))
      const areas = [...root.querySelectorAll<HTMLElement>('[data-tint]')].map((area) => ({ name: area.dataset.key ?? area.dataset.bandOf ?? area.querySelector(':scope > h3, :scope > h4')?.textContent?.trim() ?? '(unnamed area)', token: area.dataset.tint!, fill: getComputedStyle(area).backgroundColor, expected: colour(area.dataset.tint!) }))
      return { background, badges, areas }
    })
    const invisible = (fill: string) => fill === 'rgba(0, 0, 0, 0)' || fill === 'transparent' || fill === read.background
    const bad = read.badges.filter((badge) => invisible(badge.fill) || badge.fill === badge.cardFill || badge.fill !== badge.expected).map((badge) => `${badge.card}: ${badge.text} (${badge.tone}) is ${badge.fill}, expected ${badge.expected}`)
    bad.push(...read.areas.filter((area) => invisible(area.fill) || area.fill !== area.expected).map((area) => `${area.name}: ${area.token} is ${area.fill}, expected ${area.expected}`))
    if (drawing.name === 'master boxes') {
      for (let i = 0; i < MASTER.blockPipelines.length; i++) for (const key of MASTER.blockPipelines[i]!.boxes) {
        if (!read.badges.some((badge) => badge.id === stored.id[key] && badge.tone === String(i) && badge.text.trim() === `M${i}`)) bad.push(`${key}: no badge of block ${i}`)
      }
    }
    if (drawing.name === 'largest block') expect(read.areas.length, 'all example area tints are drawn').toBe(6)
    console.log(`${width}px ${drawing.name}: ${read.badges.length} badges, ${read.areas.length} tints, ${bad.length} colour failures`)
    expect(bad, `${drawing.name} missing or incorrect colours`).toEqual([])
  }, caseAllowance)
  if (drawing.key === MASTER.pipeline.key) it(`${width}px ${drawing.name}: selecting the most connected card keeps lines out of unrelated cards`, async () => {
    await ensureOpen(drawing, width)
    const links = Object.fromEntries([...stored.linkNamed].map(([id, name]) => {
      const [from, , to] = name.split(' ')
      return [id, { from: stored.id[from!]!, to: stored.id[to!]! }]
    }))
    const choice = await app.page.locator('[data-drawing="lanes"]').evaluate((root, { linksById, excluded }) => {
      const atRest: string[] = JSON.parse(root.getAttribute('data-drawn-links') ?? '[]')
      const onSelection: Record<string, string[]> = JSON.parse(root.getAttribute('data-on-selection') ?? '{}')
      const ids = new Set([...atRest, ...Object.values(onSelection).flat()].filter((id) => !excluded.includes(id)))
      const cards = [...root.querySelectorAll('.e-card')].map((card) => ({ id: card.getAttribute('data-id')!, name: card.querySelector('.e-title')?.textContent?.trim() ?? '' }))
      const ranked = cards.map((card) => ({ ...card, count: [...ids].filter((id) => linksById[id] && (linksById[id]!.from === card.id || linksById[id]!.to === card.id)).length }))
      ranked.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      return ranked[0] ?? null
    }, { linksById: links, excluded: stored.containmentIds })
    expect(choice, `${width}px ${drawing.name} has a card to select`).not.toBeNull()
    expect(choice!.count, `${width}px ${drawing.name}: selected card has links`).toBeGreaterThan(0)
    const selected = `${choice!.name} (${choice!.id}; ${choice!.count} links)`
    const selectionIds = await app.page.locator('[data-drawing="lanes"]').evaluate((root, { id, excluded }) => {
      const groups: Record<string, string[]> = JSON.parse(root.getAttribute('data-on-selection') ?? '{}')
      return (groups[id] ?? []).filter((link) => !excluded.includes(link))
    }, { id: choice!.id, excluded: stored.containmentIds })
    const at = await aPlaceOnTheCard(app.page, choice!.id)
    await app.page.mouse.click(at.x, at.y)
    await app.page.waitForFunction((id) => document.querySelector('[data-drawing="lanes"]')?.getAttribute('data-selected') === id, choice!.id, { timeout: 300_000 })
    const outline = await app.page.locator('[data-drawing="lanes"]').evaluate((root) => JSON.parse(root.getAttribute('data-fit') ?? '{}').outline === true)
    console.log(`${width}px ${drawing.name}: pressed ${selected}; ${selectionIds.length} selection paths expected${outline ? ' in outline words' : ''}`)
    if (!outline) {
      try {
        await app.page.waitForFunction((ids) => {
          const present = new Set([...document.querySelectorAll<SVGPathElement>('[data-drawing="lanes"] path.e-path')].map((path) => path.dataset.link))
          return ids.every((id) => present.has(id))
        }, selectionIds, { timeout: 300_000 })
      } catch {
        throw new Error(`${width}px ${drawing.name} selected ${selected}: expected selection paths ${selectionIds.join(', ')} were not all drawn`)
      }
      const present = await app.page.locator('[data-drawing="lanes"] path.e-path').evaluateAll((paths) => paths.map((path) => path.getAttribute('data-link')))
      expect(selectionIds.filter((id) => !present.includes(id)), `${width}px ${drawing.name} selected ${selected}: selection paths not drawn`).toEqual([])
    }
    await checkLines(drawing, width, selected)
  }, caseAllowance)
}
