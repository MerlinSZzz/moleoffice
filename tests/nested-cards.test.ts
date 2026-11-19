// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD ENLARGED PAST LEVEL 3 DRAWS THE RECORDS IT CONTAINS — D28, IN A REAL DRAWING.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND THE DECISION THAT LIFTED THE BLOCK
 * ---------------------------------------------------------------------------------------
 *
 * Record `63tiHrMe72oX`: when a block holds several child blocks, zooming in past the conclusion
 * starts to show them; an autograsp module zoomed in shows each of its sub-modules, such as
 * perception, segmentation, mapping, grasp generation, filtering and ik. A decision reads that as the
 * record's `part_of` children — a module's sub-modules — in the office's own parts order, drawn by
 * `partsOf`.
 *
 * THE AUTOGRASP MODULE IS BUILT HERE, because the criterion says no such module exists in the
 * Robotics project. The six names are the owner's; the drawing must show six level-1 cards in `partsOf`'s
 * order, which is title then id and is neither the order they were written in nor the owner's list order.
 *
 * THE EMPTY CASE IS A MODULE WITH WRITTEN PARTS AND NO CHILDREN: at level 4 it draws its parts and
 * no nested cards, no empty box and no sentence about an order.
 *
 * THE MANY CASE IS A MODULE WITH 32 `part_of` children, the shape of the reading surface that holds
 * 51 on the live office. All 32 are drawn and the parent grows; nothing is capped.
 *
 * THE CONTROL IS TODAY'S CODE, WHICH DRAWS NO CHILDREN. Run this file against the code before the
 * change and the child assertions are red. The mutations that also turn it red are listed in the
 * report that ships with the work.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'

let app: LiveApp
let page: Page
let autograsp = ''
let empty = ''
let many = ''
const subIds: string[] = []
const manyChildIds: string[] = []

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

async function join(fromId: string, toId: string, type: string): Promise<void> {
  const res = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ fromId, toId, type }),
  })
  if (!res.ok) throw new Error(`the link could not be made: ${await res.text()}`)
}

/** The six names from the rule above, created in an order that is not the order `partsOf` gives. */
const SUB_MODULES = ['segmentation', 'perception', 'mapping', 'inverse kinematics', 'grasp generation', 'filtering']

/** What `partsOf` must answer: title, then id. All six titles are distinct, so this is title order. */
const PARTS_ORDER = [...SUB_MODULES].sort()

const MIXED_PARTS = [
  'Perception of the grasp',
  'Segmentation of the pile',
  'Mapping the bench',
  'Inverse kinematics for the wrist',
  'Grasp generation',
  'Filtering the point cloud',
]

beforeAll(async () => {
  app = await liveApp({ name: 'nested-cards', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const grasp = await post('/api/records', {
    kind: 'module',
    title: 'autograsp module',
    summary: 'Turns a camera view into a grasp and puts it on the wrist.',
  })
  autograsp = grasp.record.id
  for (const title of SUB_MODULES) {
    const made = await post('/api/records', { kind: 'module', title, summary: `The ${title} sub-module.` })
    subIds.push(made.record.id)
    await join(made.record.id, autograsp, 'part_of')
  }

  // THE EMPTY CASE. A module with a written part and no `part_of` children, so the detail tick is
  // available and level 4 draws its part and nothing nested.
  const one = await post('/api/records', {
    kind: 'module',
    title: 'a module with a written part and nothing inside it',
    summary: 'It says one thing by part and contains no record at all.',
    data: {
      summaryBlocks: [
        {
          id: 'b-empty-1',
          type: 'text',
          text:
            'Otter the only thing this module has to say is written here, and it contains no record at all. ' +
            'It exists so that a card can be enlarged to level four with the detail tick while holding nothing ' +
            'inside it, which is the empty case of criterion D28. The card must draw its one written part and ' +
            'then draw no nested card and no empty box in place of the children it does not have. This block is ' +
            'long enough that a part written from it is shorter than the block itself, so the write door ' +
            'accepts the part without the record having to say more in a part than it says in its own body.',
        },
      ],
    },
  })
  empty = one.record.id
  const revisions = await fetch(`${app.api}/api/records/${empty}/revisions`, { headers: HEADERS })
  const list = (await revisions.json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...list.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the empty module has no revision')
  const wrote = await fetch(`${app.api}/api/records/${empty}/short-forms`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: {
        parts: [
          {
            id: 'p-empty-1',
            heading: 'What this module holds',
            text30: 'It holds one written part and no record of its own, and that is all it says.',
            text120:
              'It holds one written part and no record of its own, and that is all it says: there is ' +
              'nothing for the nested drawing to draw and nothing is drawn in its place.',
            covers: ['b-empty-1'],
          },
        ],
      },
    }),
  })
  if (!wrote.ok) throw new Error(`the empty module's part could not be written: ${await wrote.text()}`)
  await join(empty, autograsp, 'relates_to')

  // THE MANY CASE. 32 task records, not modules, so they are not top-level cards on a modules
  // drawing and the nested drawing is the only place they appear.
  const big = await post('/api/records', {
    kind: 'module',
    title: 'a module with thirty-two parts',
    summary: 'The shape of the reading surface, which holds 51 on the live office.',
  })
  many = big.record.id
  for (const title of [...MIXED_PARTS, ...Array.from({ length: 26 }, (_, at) => `part ${String(at + 10)}`)]) {
    const made = await post('/api/records', { kind: 'task', title, summary: `One part: ${title}.` })
    manyChildIds.push(made.record.id)
    await join(made.record.id, many, 'part_of')
  }
  await join(many, autograsp, 'relates_to')
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openTheDrawing(theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  // THE HOME PAGE ONLY WHEN THIS PAGE IS NOT ON THE APP YET. Its storage can be cleared only from a
  // page of the app. A page already on the drawing from the case before is on the app, and the
  // reload below starts it again from the cleared storage.
  if (!page.url().startsWith(app.site)) {
    await page.goto(`${app.site}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
  await page.evaluate(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('mole-office.detail')
    window.localStorage.removeItem('mole-office.detail.graph')
  })
  await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if ((page.viewportSize()?.width ?? 1440) < 660) {
    await page.getByRole('button', { name: 'Graph' }).first().click()
  }
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
  const fit = page.getByRole('button', { name: 'Fit all' })
  if (await fit.isEnabled()) {
    await fit.click()
    await theDrawingHasSettled(page)
  }
}

const cardOf = (id: string) => `.gx-card[data-target^="record/${id}/"]`

/** Press the card at its top-left corner, which is the card itself and not its name. */
async function selectTheCard(id: string): Promise<void> {
  const controls = `${cardOf(id)} .gx-card-corner .gx-card-tick`
  for (let tries = 0; tries < 4; tries += 1) {
    // A REAL POINTER FIRST, because that is what a person does. On a narrow screen the card can be
    // outside the window the canvas is drawn in, so this falls back to the pointer events React Flow
    // itself listens for, dispatched on the node wrapper it put round the card. Either way it is the
    // drawing that is being driven, through the same handlers a real press reaches.
    await page.locator(cardOf(id)).first().click({ position: { x: 3, y: 3 }, timeout: 8000 }).catch(() => undefined)
    await theDrawingHasSettled(page)
    if ((await page.locator(controls).count()) > 0) return
    await page.evaluate((selector) => {
      const card = document.querySelector(selector)
      const node = card?.closest('.react-flow__node') ?? card
      if (!(node instanceof HTMLElement)) return
      const box = node.getBoundingClientRect()
      const at = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: box.left + 3,
        clientY: box.top + 3,
        button: 0,
      }
      node.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }))
      node.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }))
      node.dispatchEvent(new MouseEvent('click', at))
    }, cardOf(id))
    await theDrawingHasSettled(page)
    if ((await page.locator(controls).count()) > 0) return
  }
  throw new Error(`the card for ${id} never showed its own controls`)
}

async function tickTheCard(id: string): Promise<void> {
  const selector = `${cardOf(id)} .gx-card-corner .gx-card-tick`
  await page.locator(selector).first().click({ timeout: 20_000 }).catch(async () => {
    await page.evaluate((one) => {
      const el = document.querySelector(one)
      if (el instanceof HTMLElement) el.click()
    }, selector)
  })
  await theDrawingHasSettled(page)
}

async function roomPress(id: string, label: 'More room for this card' | 'Less room for this card'): Promise<void> {
  const selector = `${cardOf(id)} button[aria-label="${label}"]`
  await page.locator(selector).first().click({ timeout: 20_000 }).catch(async () => {
    await page.evaluate((one) => {
      const el = document.querySelector(one)
      if (el instanceof HTMLElement) el.click()
    }, selector)
  })
  await theDrawingHasSettled(page)
}

/** How many nested cards one card draws, their names in order, and how big the card is. */
async function nested(id: string): Promise<{ count: number; names: string[]; height: number; width: number }> {
  return page.evaluate((recordId) => {
    const card = document.querySelector(`.gx-card[data-target^="record/${recordId}/"]`)
    if (card === null) return { count: -1, names: [], height: 0, width: 0 }
    const box = card.getBoundingClientRect()
    const cards = [...card.querySelectorAll('.gx-nested-card')]
    return {
      count: cards.length,
      names: cards.map((one) => (one.querySelector('.gx-nested-name')?.textContent ?? '').trim()),
      height: Math.round(box.height),
      width: Math.round(box.width),
    }
  }, id)
}

/** Grow a card to level 4, pressing More room until the nested cards are there or the cap is hit. */
async function growToLevel4(id: string): Promise<void> {
  await selectTheCard(id)
  await tickTheCard(id)
  for (let step = 0; step < 4; step += 1) {
    if ((await nested(id)).count > 0) return
    const more = page.locator(`${cardOf(id)} button[aria-label="More room for this card"]`).first()
    if (!(await more.isEnabled())) return
    await roomPress(id, 'More room for this card')
  }
}

/**
 * WHAT ONE CARD DRAWS UNDER ITS TITLE LINE, byte for byte, and its drawn size.
 *
 * `gx-card-words` is where every word and every nested card lives; the controls are a sibling of it.
 * So two readings that are equal are the same card back, to the pixel, and the size beside it is
 * the second half of that claim.
 */
async function cardWords(id: string): Promise<{ html: string; width: number; height: number }> {
  return page.evaluate((recordId) => {
    const card = document.querySelector(`.gx-card[data-target^="record/${recordId}/"]`)
    if (card === null) return { html: 'no card', width: 0, height: 0 }
    const box = card.getBoundingClientRect()
    return {
      html: card.querySelector('.gx-card-words')?.innerHTML ?? '',
      width: Math.round(box.width),
      height: Math.round(box.height),
    }
  }, id)
}

for (const theme of ['light'] as const) {
  describe(`a card draws the records it contains, in ${theme}`, () => {
    it('draws the six autograsp sub-modules, in `partsOf` order, and hides them again', async () => {
      await openTheDrawing(theme)
      const before = await nested(autograsp)
      const beforeWords = await cardWords(autograsp)
      expect(before.count, 'nothing nested before the card is enlarged').toBe(0)
      await growToLevel4(autograsp)
      const open = await nested(autograsp)
      expect(open.count, 'the six sub-modules are drawn').toBe(6)
      expect(open.names, 'in the office parts order, which is title then id').toEqual(PARTS_ORDER)
      // SHRINKING HIDES THEM AGAIN, and the card comes back to exactly what it drew — the same
      // words under the title line and the same drawn size, to the pixel.
      await roomPress(autograsp, 'Less room for this card')
      await tickTheCard(autograsp)
      const shut = await nested(autograsp)
      expect(shut.count, 'shrinking below level 3 hides the children').toBe(0)
      expect(await cardWords(autograsp), 'and the card is what it was, to the pixel').toEqual(beforeWords)
    }, 240_000)

    it('draws no child and no empty box for a module with nothing inside it', async () => {
      await openTheDrawing(theme)
      await growToLevel4(empty)
      const drawn = await nested(empty)
      expect(drawn.count, 'a module with no part_of children draws none').toBe(0)
      const boxes = await page.locator(`${cardOf(empty)} .gx-nested`).count()
      expect(boxes, 'and it draws no empty box for them').toBe(0)
    }, 240_000)

    it('draws all thirty-two parts and grows the parent', async () => {
      await openTheDrawing(theme)
      const before = await nested(many)
      await growToLevel4(many)
      const drawn = await nested(many)
      expect(drawn.count, 'all thirty-two parts are drawn, none capped').toBe(32)
      expect(drawn.height, 'and the parent grows to hold them').toBeGreaterThan(before.height + 40)
    }, 240_000)

    it('moves no other node, and one press on a child opens its record', async () => {
      await openTheDrawing(theme)
      await selectTheCard(autograsp)
      const othersBefore = await otherTransforms(autograsp)
      await tickTheCard(autograsp)
      if ((await nested(autograsp)).count === 0) await roomPress(autograsp, 'More room for this card')
      expect((await nested(autograsp)).count, 'the children are drawn on this card').toBe(6)
      const othersAfter = await otherTransforms(autograsp)
      expect(othersAfter, 'no other card or box moved').toEqual(othersBefore)
      // A CHILD CARD IS A CARD: its own press opens its record.
      const child = page.locator(`${cardOf(autograsp)} .gx-nested-card`).first()
      await child.click()
      // WAIT FOR THE ADDRESS TO NAME ONE OF THEM, for as long as a page load may take. A press that
      // opened nothing is not an error here: the line below says so in its own words.
      await page.waitForURL((url) => subIds.some((id) => url.href.includes(id)), { timeout: 20_000 }).catch(() => undefined)
      const opened = subIds.find((id) => page.url().includes(id))
      expect(opened, 'the child press opened one of the sub-modules').toBeDefined()
    }, 240_000)
  })
}

/** Every node's transform except the card under test. */
async function otherTransforms(id: string): Promise<Record<string, string>> {
  return page.evaluate((recordId) => {
    const out: Record<string, string> = {}
    for (const node of document.querySelectorAll('.react-flow__node')) {
      const nodeId = node.getAttribute('data-id') ?? ''
      if (node.querySelector(`[data-target^="record/${recordId}/"]`) !== null) continue
      out[nodeId] = (node as HTMLElement).style.transform
    }
    return out
  }, id)
}


