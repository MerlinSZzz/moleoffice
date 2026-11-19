// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESENTATION-INTENT PROOF IN tools/review.mjs RESTS ITS CLAIMS ON WHAT WAS STORED AND ON A MEASURE (wave 13y round 52).
 *
 * Round 43 measured two canvases of one arrangement drawn twice: an edge blend changed 426 pixels by 1 level. A real
 * change of arrangement changed 111,616 pixels by up to 228 levels. A proof that compares fingerprints calls the first
 * a change, so a reload that blends one edge differently reads as an arrangement that did not survive.
 *
 * 1. CLAIM 2 RESTS ON THE STORE. The lane, order and emphasis of the three cards read back after the reload are compared
 *    with what was sent. An arrangement the store did not keep is not proved by a picture that came back the same.
 * 2. CLAIM 1 COUNTS TWO CANVASES AS DIFFERENT only when more than 0.5% of their pixels differ by more than 8 levels.
 *    A pixel's difference is the largest difference of its channels.
 * 3. THE PICTURES STAY EVIDENCE, and the counts are printed beside the verdict: the pixels that differ and the largest
 *    difference, for each comparison the line makes.
 * 4. THE OPTIONS AND OUTPUTS STAY. The six pictures keep their names, and the line starts with PROVED or NOT PROVED.
 * 5. THE CONSOLE PRINTS THE COUNTS TOO (round 53). The proof's console line is the verdict, then the counts of the three
 *    comparisons, so a reader of the console sees what the verdict rests on.
 *
 * The proof runs as written in tools/review.mjs, cut out of the file and run in a context with stand-ins for the
 * browser and the office. Every picture is made here: a 640 by 640 canvas, so 0.5% of its pixels is 2,048. Every
 * record and every answer of the stand-in office is invented for the test.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { crc32, deflateSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'

import * as review from '../tools/review.mjs'

const source = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')
const cut = /^async function provePresentationIntent\(browser, records, shots, pageAddress\) \{\n[\s\S]*?\n\}\n/m.exec(source)
const outDir = mkdtempSync(join(tmpdir(), 'review-intent-'))

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- pictures

const SIDE = 640
const PIXELS = SIDE * SIDE

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

/** An 8-bit PNG of `channels` 3 (RGB) or 4 (RGBA), each row unfiltered. */
function png(width: number, height: number, channels: 3 | 4, pixels: Uint8Array): Buffer {
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** A run of `count` pixels from `from` whose red is raised by `by` levels. */
interface Change { from: number; count: number; by: number }
const ARRANGED = { from: 0, count: 111_616, by: 228 }
const ARRANGED_OTHERWISE = { from: 200_000, count: 111_616, by: 228 }
const A_BLEND = { from: 400_000, count: 426, by: 1 }
const near = (count: number, by: number): Change => ({ from: 330_000, count, by })

/** The made-up canvas: red at 20 everywhere, so a raise of 228 still fits a byte, and a pattern in green and blue. */
function canvas(changes: Change[] = [], channels: 3 | 4 = 3, side = SIDE): Buffer {
  const pixels = new Uint8Array(side * side * channels)
  for (let at = 0; at < side * side; at += 1) {
    pixels[at * channels] = 20
    pixels[at * channels + 1] = ((at % side) + Math.floor(at / side)) % 256
    pixels[at * channels + 2] = (at * 7) % 256
    if (channels === 4) pixels[at * channels + 3] = 255
  }
  for (const change of changes) for (let at = change.from; at < change.from + change.count; at += 1) pixels[at * channels] = pixels[at * channels]! + change.by
  return png(side, side, channels, pixels)
}

// ---------------------------------------------------------------------------- the stand-ins

const FILES = {
  nothing: 'intent-1-nothing-arranged-light-F.png',
  first: 'intent-2-lane-order-emphasis-light-F.png',
  whole: 'intent-2b-the-whole-arrangement-light-F.png',
  reloaded: 'intent-3-after-a-reload-light-F.png',
  second: 'intent-4-a-different-arrangement-light-F.png',
  unshowable: 'intent-5-arranged-but-not-drawn-light-F.png',
} as const
type Shot = keyof typeof FILES

const RECORDS = [
  { kind: 'module', id: 'm1', title: 'One' },
  { kind: 'module', id: 'm2', title: 'Two' },
  { kind: 'module', id: 'm3', title: 'Three' },
  { kind: 'module', id: 'm4', title: 'Four' },
  { kind: 'decision', id: 'd1', title: 'Not a module' },
]

/** What the made-up office's GET gives back of what was stored. */
type Store = 'keeps it' | 'keeps nothing' | 'drops the emphasis' | 'moves an order'

interface Scenario { pictures?: Partial<Record<Shot, Buffer>>; store?: Store }

const thePictures = (changes: Partial<Record<Shot, Buffer>> = {}): Record<Shot, Buffer> => ({
  nothing: canvas(),
  first: canvas([ARRANGED]),
  whole: canvas([ARRANGED]),
  reloaded: canvas([ARRANGED]),
  second: canvas([ARRANGED, ARRANGED_OTHERWISE]),
  unshowable: canvas(),
  ...changes,
})

type Nodes = Record<string, Record<string, unknown>>

function theOffice(store: Store) {
  let nodes: Nodes = {}
  const gaveBack = (): Nodes => {
    if (store === 'keeps nothing') return {}
    if (store === 'drops the emphasis') return Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'emphasis'))]))
    if (store === 'moves an order') return { ...nodes, m2: { ...nodes['m2'], order: Number(nodes['m2']?.['order']) + 1 } }
    return nodes
  }
  return async (url: string, init: { method: string; body?: string }) => {
    const path = new URL(url).pathname.slice('/api/presentation/structure'.length)
    const body = init.body === undefined ? undefined : JSON.parse(init.body) as { intent: Record<string, unknown> }
    const answer = (status: number, json: unknown) => ({ status, json: async () => structuredClone(json) })
    if (init.method === 'PUT' && path === '') {
      nodes = structuredClone(body!.intent['nodes'] as Nodes)
      return answer(200, { intent: { nodes } })
    }
    if (init.method === 'PUT' && path.startsWith('/nodes/')) {
      const id = decodeURIComponent(path.slice('/nodes/'.length))
      const refused = Object.keys(body!.intent).find(key => key === 'width' || key === 'colour')
      if (refused !== undefined) return answer(400, { error: `${refused} is never stored: the drawing works out its own geometry and colour.` })
      nodes = { ...nodes, [id]: { ...nodes[id], ...body!.intent } }
      return answer(200, { intent: { nodes } })
    }
    if (init.method === 'GET') return answer(200, { intent: { nodes: gaveBack() } })
    if (init.method === 'DELETE') {
      nodes = {}
      return answer(200, { intent: null })
    }
    throw new Error(`The made-up office has no ${init.method} ${path}.`)
  }
}

async function prove(scenario: Scenario = {}): Promise<{ line: string; files: string[]; logged: string[] }> {
  if (cut === null) throw new Error('tools/review.mjs has no provePresentationIntent(browser, records, shots, pageAddress) to cut out.')
  const pictures = thePictures(scenario.pictures)
  const byFile = new Map(Object.entries(FILES).map(([shot, file]) => [file as string, pictures[shot as Shot]]))
  const tab = {
    goto: async () => null,
    waitForSelector: async () => null,
    waitForTimeout: async () => null,
    evaluate: async (fn: () => unknown) => {
      const text = String(fn)
      if (text.includes('.react-flow__node')) return ['mod:m1', 'mod:m2', 'mod:m3', 'sec:s1']
      if (text.includes('.gx-report')) return 'The canvas could not apply the hints stored for “Four” (m4): no line touches it.'
      throw new Error(`The stand-in tab was asked to run something it does not know: ${text.slice(0, 80)}`)
    },
    locator: () => ({
      screenshot: async ({ path }: { path: string }) => {
        const picture = byFile.get(basename(path))
        if (picture === undefined) throw new Error(`The stand-in tab has no picture for ${basename(path)}.`)
        writeFileSync(path, picture)
      },
    }),
  }
  const shots: { file: string }[] = []
  const logged: string[] = []
  const context = {
    ...review,
    reviewContext: async () => ({ newPage: async () => tab, close: async () => null }),
    waitForReviewPage: async () => null,
    waitForReviewSettled: async (_tab: unknown, _name: string, capture: () => Promise<unknown>) => {
      await capture()
      return null
    },
    pressFitAll: async () => ({ pressed: true }),
    theBrowsersFixedInstant: null,
    webPort: 1,
    apiPort: 2,
    outDir,
    join,
    readFileSync,
    createHash,
    fetch: theOffice(scenario.store ?? 'keeps it'),
    console: { log: (said: unknown) => { logged.push(String(said)) } },
  }
  const provePresentationIntent = runInNewContext(`(${cut[0]})`, context) as (browser: unknown, records: unknown, shots: unknown, address: string) => Promise<string>
  const line = await provePresentationIntent({}, RECORDS, shots, '#/made-up-drawing')
  return { line, files: shots.map(one => one.file), logged }
}

const SIX = [FILES.nothing, FILES.first, FILES.whole, FILES.reloaded, FILES.second, FILES.unshowable]

// ---------------------------------------------------------------------------- the criterion

describe('the presentation-intent proof rests on what was stored and on a measure', () => {
  it('1. counts a pixel as differing by more than 8 levels by its largest channel, and prints the counts', () => {
    const { theCanvasesDiffer } = review as unknown as { theCanvasesDiffer: (a: Buffer, b: Buffer) => unknown }
    expect(theCanvasesDiffer(canvas([ARRANGED]), canvas([ARRANGED, ARRANGED_OTHERWISE]))).toEqual({
      compared: true, differ: true, pixels: PIXELS, differing: 111_616, overLevels: 111_616, largest: 228,
      said: '111616 of 409600 pixels differ, 111616 by more than 8 levels, the largest by 228',
    })
    expect(theCanvasesDiffer(canvas(), canvas([A_BLEND]))).toEqual({
      compared: true, differ: false, pixels: PIXELS, differing: 426, overLevels: 0, largest: 1,
      said: '426 of 409600 pixels differ, 0 by more than 8 levels, the largest by 1',
    })
    expect(theCanvasesDiffer(canvas(), canvas([], 4))).toMatchObject({ compared: true, differ: false, differing: 0, largest: 0 })
  })

  it('2. counts two canvases as different only when more than 0.5% of their pixels differ by more than 8 levels', () => {
    const { theCanvasesDiffer } = review as unknown as { theCanvasesDiffer: (a: Buffer, b: Buffer) => { differ: boolean; overLevels: number } }
    expect(theCanvasesDiffer(canvas(), canvas([near(2_048, 9)]))).toMatchObject({ differ: false, overLevels: 2_048 })
    expect(theCanvasesDiffer(canvas(), canvas([near(2_049, 9)]))).toMatchObject({ differ: true, overLevels: 2_049 })
    expect(theCanvasesDiffer(canvas(), canvas([near(2_049, 8)]))).toMatchObject({ differ: false, overLevels: 0 })
  })

  it('3. says a picture it cannot read, and two sizes, rather than counting them', () => {
    const { theCanvasesDiffer } = review as unknown as { theCanvasesDiffer: (a: Buffer, b: Buffer) => unknown }
    expect(theCanvasesDiffer(canvas(), Buffer.from('not a picture'))).toEqual({ compared: false, why: 'the second picture could not be read: the file is not a PNG' })
    expect(theCanvasesDiffer(canvas(), canvas([], 3, 320))).toEqual({ compared: true, differ: true, said: 'the two canvases are 640 by 640 and 320 by 320 pixels' })
  })

  it('4. proves an arrangement whose reload blends one edge differently, and prints that blend', async () => {
    const { line, files } = await prove({ pictures: { reloaded: canvas([ARRANGED, A_BLEND]), unshowable: canvas([A_BLEND]) } })
    expect(line).toMatch(/^PROVED — /)
    expect(line).toContain('Read back after the reload: the store gave back the lane, order and emphasis sent for all 3 cards.')
    expect(line).toContain('first arrangement against the second, 111616 of 409600 pixels differ, 111616 by more than 8 levels, the largest by 228, so different')
    expect(line).toContain('first arrangement against after a reload, 426 of 409600 pixels differ, 0 by more than 8 levels, the largest by 1, so the same')
    expect(line).toContain('which is the unarranged picture')
    expect(files).toEqual(SIX)
  })

  it('5. does not prove an arrangement the store did not keep, however the pictures came back', async () => {
    const nothing = await prove({ store: 'keeps nothing' })
    expect(nothing.line).toMatch(/^NOT PROVED — the arrangement did not survive a reload/)
    expect(nothing.line).toContain('m1: lane "the arm" was sent and nothing came back, order 1 was sent and nothing came back, emphasis "safety" was sent and nothing came back')
    const emphasis = await prove({ store: 'drops the emphasis' })
    expect(emphasis.line).toMatch(/^NOT PROVED — the arrangement did not survive a reload/)
    expect(emphasis.line).toContain('m1: emphasis "safety" was sent and nothing came back')
    const order = await prove({ store: 'moves an order' })
    expect(order.line).toMatch(/^NOT PROVED — the arrangement did not survive a reload/)
    expect(order.line).toContain('m2: order 2 was sent and 3 came back')
    for (const one of [nothing, emphasis, order]) expect(one.files).toEqual(SIX)
  })

  it('6. does not prove two arrangements whose canvases differ by a blend or by 0.5% exactly', async () => {
    const blend = await prove({ pictures: { second: canvas([ARRANGED, A_BLEND]) } })
    expect(blend.line).toMatch(/^NOT PROVED — two arrangements with the lanes swapped and the orders reversed drew the SAME canvas/)
    expect(blend.line).toContain('first arrangement against the second, 426 of 409600 pixels differ, 0 by more than 8 levels, the largest by 1, so the same')
    const verdicts: string[] = []
    for (const change of [near(2_048, 9), near(2_049, 9), near(2_049, 8)]) {
      verdicts.push((await prove({ pictures: { second: canvas([ARRANGED, change]) } })).line.split(' — ')[0]!)
    }
    expect(verdicts).toEqual(['NOT PROVED', 'PROVED', 'NOT PROVED'])
  })

  it('7. proves a whole honest run, and says when it could not compare two pictures', async () => {
    const honest = await prove()
    expect(honest.line).toMatch(/^PROVED — /)
    expect(honest.files).toEqual(SIX)
    const unreadable = await prove({ pictures: { second: Buffer.from('not a picture') } })
    expect(unreadable.line.startsWith(
      `NOT PROVED — the canvases could not be compared: ${FILES.first} against ${FILES.second}: the second picture could not be read: the file is not a PNG.`)).toBe(true)
    expect(unreadable.files).toEqual(SIX)
  })

  it('8. prints the verdict and then the counts of the three comparisons on the console', async () => {
    const DIFFERENT = '111616 of 409600 pixels differ, 111616 by more than 8 levels, the largest by 228, so different'
    const SAME = '0 of 409600 pixels differ, 0 by more than 8 levels, the largest by 0, so the same'
    const BLEND = '426 of 409600 pixels differ, 0 by more than 8 levels, the largest by 1, so the same'
    /** What the console line says after the verdict the contact sheet's line starts with. */
    const afterTheVerdict = ({ line, logged }: { line: string; logged: string[] }): string => {
      const said = logged.filter(one => one.startsWith('review: presentation intent — '))
      expect(said).toHaveLength(1)
      const head = `review: presentation intent — ${line.slice(0, line.indexOf(' The three cards arranged'))}`
      expect(said[0]!.startsWith(head)).toBe(true)
      return said[0]!.slice(head.length)
    }
    expect(afterTheVerdict(await prove())).toBe(
      ` Canvases compared: first arrangement against the second, ${DIFFERENT}; first arrangement against after a reload, ${SAME}; nothing arranged against the first arrangement, ${DIFFERENT}.`)
    expect(afterTheVerdict(await prove({ pictures: { second: canvas([ARRANGED, A_BLEND]) } }))).toBe(
      ` Canvases compared: first arrangement against the second, ${BLEND}; first arrangement against after a reload, ${SAME}; nothing arranged against the first arrangement, ${DIFFERENT}.`)
    expect(afterTheVerdict(await prove({ pictures: { second: Buffer.from('not a picture') } }))).toBe(
      ` Canvases compared: first arrangement against the second, not compared: the second picture could not be read: the file is not a PNG; first arrangement against after a reload, ${SAME}; nothing arranged against the first arrangement, ${DIFFERENT}.`)
  })
})
