// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DERIVED-LAYOUT PROOF IN tools/review.mjs COUNTS TWO CANVASES AS DIFFERENT BY A MEASURE (wave 13y round 53).
 *
 * The proof photographs the canvas, adds one stored `blocks` link, photographs it again, removes the link and
 * photographs it a third time. The layout is derived when the second picture differs from the first and the third is
 * the same as the first. Both halves compared the files' sha256, so one pixel moved by one level was a change. Round 43
 * measured one arrangement drawn twice: an edge blend changed 426 pixels by 1 level.
 *
 * 1. THE FIRST HALF COUNTS BY THE MEASURE. A second picture that differs from the first by an edge blend alone is the
 *    same canvas, so the link changed nothing and the proof is NOT PROVED.
 * 2. THE SECOND HALF COUNTS BY THE MEASURE. A third picture that differs from the first by an edge blend alone is the
 *    same canvas, so the proof is PROVED.
 * 3. A REAL CHANGE STILL COUNTS in each half: a link that moved the drawing, and a third picture that did not come back.
 * 4. THE MEASURE IS theCanvasesDiffer's: more than 0.5% of the pixels by more than 8 levels. The counts of both
 *    comparisons are printed on the line, and a picture that cannot be read is said.
 * 5. THE OPTIONS AND OUTPUTS STAY. The three pictures keep their names, the line starts with PROVED or NOT PROVED, the
 *    link is the one it was, and the console line is the verdict alone.
 *
 * The proof runs as written in tools/review.mjs, cut out of the file and run in a context with stand-ins for the
 * browser and the office. Every picture is made here: a 200 by 200 canvas, so 0.5% of its pixels is 200. Every record
 * and every answer of the stand-in office is invented for the test.
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
const cut = /^async function proveLayoutIsDerived\(browser, records, shots, pageAddress\) \{\n[\s\S]*?\n\}\n/m.exec(source)
const outDir = mkdtempSync(join(tmpdir(), 'review-derived-'))

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- pictures

const SIDE = 200

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

/** A run of `count` pixels from `from` whose red is raised by `by` levels. */
interface Change { from: number; count: number; by: number }
const LINKED = { from: 0, count: 10_000, by: 200 }
const NOT_BACK = { from: 20_000, count: 4_000, by: 120 }
const A_BLEND = { from: 30_000, count: 426, by: 1 }
const near = (count: number, by: number): Change => ({ from: 35_000, count, by })

/** The made-up canvas, an 8-bit RGB PNG: red at 20 everywhere, so a raise of 200 still fits a byte, and a pattern in green and blue. */
function canvas(changes: Change[] = []): Buffer {
  const pixels = new Uint8Array(SIDE * SIDE * 3)
  for (let at = 0; at < SIDE * SIDE; at += 1) {
    pixels[at * 3] = 20
    pixels[at * 3 + 1] = ((at % SIDE) + Math.floor(at / SIDE)) % 256
    pixels[at * 3 + 2] = (at * 7) % 256
  }
  for (const change of changes) for (let at = change.from; at < change.from + change.count; at += 1) pixels[at * 3] = pixels[at * 3]! + change.by
  const raw = Buffer.alloc((SIDE * 3 + 1) * SIDE)
  for (let y = 0; y < SIDE; y += 1) Buffer.from(pixels.subarray(y * SIDE * 3, (y + 1) * SIDE * 3)).copy(raw, y * (SIDE * 3 + 1) + 1)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIDE, 0)
  header.writeUInt32BE(SIDE, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ---------------------------------------------------------------------------- the stand-ins

const FILES = {
  before: 'derived-1-before-light-F.png',
  withLink: 'derived-2-with-a-new-link-light-F.png',
  after: 'derived-3-link-removed-light-F.png',
} as const
type Shot = keyof typeof FILES
const THREE = [FILES.before, FILES.withLink, FILES.after]

const RECORDS = [
  { kind: 'module', id: 'm2', title: 'Two' },
  { kind: 'module', id: 'm1', title: 'One' },
  { kind: 'module', id: 'm3', title: 'Three' },
  { kind: 'decision', id: 'd1', title: 'Not a module' },
]

interface Asked { method: string; path: string; body: unknown }

async function prove(pictures: Partial<Record<Shot, Buffer>> = {}): Promise<{ line: string; files: string[]; logged: string[]; asked: Asked[] }> {
  if (cut === null) throw new Error('tools/review.mjs has no proveLayoutIsDerived(browser, records, shots, pageAddress) to cut out.')
  const taken: Record<Shot, Buffer> = { before: canvas(), withLink: canvas([LINKED]), after: canvas(), ...pictures }
  const byFile = new Map(Object.entries(FILES).map(([shot, file]) => [file as string, taken[shot as Shot]]))
  const tab = {
    goto: async () => null,
    waitForSelector: async () => null,
    waitForTimeout: async () => null,
    locator: () => ({
      screenshot: async ({ path }: { path: string }) => {
        const picture = byFile.get(basename(path))
        if (picture === undefined) throw new Error(`The stand-in tab has no picture for ${basename(path)}.`)
        writeFileSync(path, picture)
      },
    }),
  }
  const asked: Asked[] = []
  const office = async (url: string, init: { method: string; body?: string }) => {
    const path = new URL(url).pathname
    asked.push({ method: init.method, path, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    if (init.method === 'POST' && path === '/api/links') return { ok: true, status: 201, json: async () => ({ id: 'made-up-link' }) }
    if (init.method === 'DELETE' && path === '/api/links/made-up-link') return { ok: true, status: 200, json: async () => ({}) }
    throw new Error(`The made-up office has no ${init.method} ${path}.`)
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
    theBrowsersFixedInstant: null,
    webPort: 1,
    apiPort: 2,
    outDir,
    join,
    readFileSync,
    createHash,
    fetch: office,
    console: { log: (said: unknown) => { logged.push(String(said)) } },
  }
  const proveLayoutIsDerived = runInNewContext(`(${cut[0]})`, context) as (browser: unknown, records: unknown, shots: unknown, address: string) => Promise<string>
  const line = await proveLayoutIsDerived({}, RECORDS, shots, '#/made-up-drawing')
  return { line, files: shots.map(one => one.file), logged, asked }
}

const MEASURE = 'Canvases compared, counting two as different when more than 0.5% of their pixels differ by more than 8 levels: '
const SAME = '0 of 40000 pixels differ, 0 by more than 8 levels, the largest by 0, so the same'
const MOVED = '10000 of 40000 pixels differ, 10000 by more than 8 levels, the largest by 200, so different'
const BLEND = '426 of 40000 pixels differ, 0 by more than 8 levels, the largest by 1, so the same'
const PROVED = 'PROVED — adding one stored `blocks` link redrew the canvas, and removing it gave back the same canvas by the measure below. No position was set by hand and none was saved.'
const NOTHING_CHANGED = 'NOT PROVED — adding a stored link changed nothing on the canvas, which means either the drawing did not re-read the records or the link was not drawn.'
const NOT_RETURNED = 'NOT PROVED — the canvas came back different after the link was removed, so the picture is not a pure function of the records.'

/** The counts the line ends with, for the second picture and then the third, each against the first. */
const counts = (withLink: string, after: string): string =>
  `${MEASURE}before against with the link, ${withLink}; before against after removing it, ${after}.`
const theCounts = (line: string): string => line.slice(line.indexOf(MEASURE))
/** Asks that the line opens with these words and a space, and shows the opening it found when it does not. */
const opens = (line: string, words: string): void => { expect(line.slice(0, words.length + 1)).toBe(`${words} `) }

// ---------------------------------------------------------------------------- the criterion

describe('the derived-layout proof counts two canvases as different by a measure', () => {
  it('1. counts an edge blend after the link was added as no change, so the link changed nothing', async () => {
    const { line, files } = await prove({ withLink: canvas([A_BLEND]) })
    opens(line, NOTHING_CHANGED)
    expect(theCounts(line)).toBe(counts(BLEND, SAME))
    expect(files).toEqual(THREE)
  })

  it('2. counts an edge blend after the link was removed as no change, so the proof holds', async () => {
    const { line, files } = await prove({ after: canvas([A_BLEND]) })
    opens(line, PROVED)
    expect(theCounts(line)).toBe(counts(MOVED, BLEND))
    expect(files).toEqual(THREE)
  })

  it('3. proves a link that moved the drawing, and not a third picture that did not come back', async () => {
    const honest = await prove()
    opens(honest.line, PROVED)
    expect(theCounts(honest.line)).toBe(counts(MOVED, SAME))
    const notBack = await prove({ after: canvas([NOT_BACK]) })
    opens(notBack.line, NOT_RETURNED)
    expect(theCounts(notBack.line)).toBe(counts(MOVED, '4000 of 40000 pixels differ, 4000 by more than 8 levels, the largest by 120, so different'))
  })

  it('4. counts by theCanvasesDiffer: 200 pixels by 9 levels are the same canvas, 201 are not', async () => {
    const verdicts: string[] = []
    for (const pictures of [
      { withLink: canvas([near(200, 9)]) },
      { withLink: canvas([near(201, 9)]) },
      { after: canvas([near(200, 9)]) },
      { after: canvas([near(201, 9)]) },
    ]) verdicts.push((await prove(pictures)).line.split(' — ')[0]!)
    expect(verdicts).toEqual(['NOT PROVED', 'PROVED', 'PROVED', 'NOT PROVED'])
  })

  it('5. says a picture it cannot read, with the two pictures it was comparing', async () => {
    const second = await prove({ withLink: Buffer.from('not a picture') })
    opens(second.line, `NOT PROVED — the canvases could not be compared: ${FILES.before} against ${FILES.withLink}: the second picture could not be read: the file is not a PNG.`)
    expect(theCounts(second.line)).toBe(counts('not compared: the second picture could not be read: the file is not a PNG', SAME))
    const third = await prove({ after: Buffer.from('not a picture') })
    opens(third.line, `NOT PROVED — the canvases could not be compared: ${FILES.before} against ${FILES.after}: the second picture could not be read: the file is not a PNG.`)
    for (const one of [second, third]) expect(one.files).toEqual(THREE)
  })

  it('6. keeps its three pictures, its link, its fingerprints and a console line of the verdict alone', async () => {
    const { line, files, logged, asked } = await prove({ after: canvas([A_BLEND]) })
    expect(files).toEqual(THREE)
    expect(asked).toEqual([
      { method: 'POST', path: '/api/links', body: { fromId: 'm1', toId: 'm3', type: 'blocks', gate: { kind: 'hard' } } },
      { method: 'DELETE', path: '/api/links/made-up-link', body: undefined },
    ])
    const print = (picture: Buffer): string => createHash('sha256').update(picture).digest('hex').slice(0, 12)
    expect(line).toBe(
      `${PROVED} Link: “One” blocks “Three”, hard. ` +
        `Canvas fingerprints ${print(canvas())} → ${print(canvas([LINKED]))} → ${print(canvas([A_BLEND]))}. ${counts(MOVED, BLEND)}`)
    expect(logged).toEqual([`review: derived layout — ${PROVED}`])
  })
})
