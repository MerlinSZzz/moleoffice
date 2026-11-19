// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PORTRAIT IS DRAWN FROM A SMALL COPY, AND THE WHOLE PICTURE IS ONE PRESS AWAY.
 *
 * Round 10 of wave 13x: five role portraits of about 1 MB each made the Role cards page's first load
 * 14.0 MB on an office of the live size, and one made the Embassy's 10.8 MB. The pages draw them at
 * 156, 56 and 36 pixels. `GET /api/portraits/<set>/<of>/<name>?size=small` answers a copy
 * `SMALL_PORTRAIT_WIDTH` pixels wide, made once and kept beside the database.
 *
 * WHAT HOLDS:
 *   - the shrinking averages each block of pixels, weighted by how opaque each is, and a copy it writes
 *     reads back as the same pixels;
 *   - a file that is not a PNG this reads is not shrunk, and says why;
 *   - the small address answers a PNG of that width, says it made it, keeps it, and answers the kept one
 *     next time; the address without `?size` still answers the picture's own bytes;
 *   - the Role cards page and the Embassy draw the small address, and a press on the Role card's picture
 *     opens the whole picture.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { portraitAddress, SMALL_PORTRAIT_WIDTH, smallPortrait } from '../src/shared/portraits.ts'
import { smallPngOf } from '../src/server/lib/smallpicture.ts'

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A PNG of these pixels, every row unfiltered: the plainest a PNG can be, written here and not by the code under test. */
function aPng(width: number, height: number, channels: 3 | 4, pixels: number[]): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'latin1')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
    return Buffer.concat([head, body, tail])
  }
  const raw: number[] = []
  for (let y = 0; y < height; y += 1) raw.push(0, ...pixels.slice(y * width * channels, (y + 1) * width * channels))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A PNG's width and height, from its header. */
function sizeOf(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('the shrinking', () => {
  it('averages each block, weighted by how opaque each pixel is', () => {
    // 4 by 2, RGBA. The left block is red and green at full opacity; the right is blue, opaque, beside white that is not there at all.
    const pixels = [
      ...[255, 0, 0, 255], ...[0, 255, 0, 255], ...[0, 0, 255, 255], ...[255, 255, 255, 0],
      ...[255, 0, 0, 255], ...[0, 255, 0, 255], ...[0, 0, 255, 255], ...[255, 255, 255, 0],
    ]
    const small = smallPngOf(aPng(4, 2, 4, pixels), 2)
    expect(small.made).toBe(true)
    if (!small.made) return
    expect([small.width, small.height]).toEqual([2, 1])
    // Read back through the same reader at the same width: a picture no wider is not shrunk again, so read it by shrinking to 1.
    const one = smallPngOf(small.body, 1)
    expect(one.made).toBe(true)
    if (!one.made) return
    // The copy's two pixels: (128, 128, 0, 255) and (0, 0, 255, 128). Their weighted average is (85, 85, 85, 192), rounded.
    const again = smallPngOf(aPng(2, 1, 4, [128, 128, 0, 255, 0, 0, 255, 128]), 1)
    expect(again.made && again.body.equals(one.body)).toBe(true)
  })

  it('writes a copy that reads back as the pixels it averaged, whatever filter each row was given', () => {
    // 16 by 4, RGB, a gradient in both directions, so the encoder picks other filters than none.
    const width = 16
    const height = 4
    const pixels: number[] = []
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels.push(x * 16, y * 60, (x * y * 7) % 256)
    const small = smallPngOf(aPng(width, height, 3, pixels), 8)
    expect(small.made).toBe(true)
    if (!small.made) return
    expect([small.width, small.height]).toEqual([8, 2])
    // Each pixel of the copy, worked out here, as the average of its 2 by 2 block.
    const expected: number[] = []
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        for (let c = 0; c < 3; c += 1) {
          let sum = 0
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) sum += pixels[((y * 2 + dy) * width + x * 2 + dx) * 3 + c]!
          expected.push(Math.round(sum / 4))
        }
      }
    }
    // The copy, read back by shrinking it to 4: equal to shrinking the expected pixels, written plainly, to 4.
    const fromTheCopy = smallPngOf(small.body, 4)
    const fromTheExpected = smallPngOf(aPng(8, 2, 3, expected), 4)
    expect(fromTheCopy.made && fromTheExpected.made && fromTheCopy.body.equals(fromTheExpected.body)).toBe(true)
  })

  it('does not shrink what it cannot read, and says why', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])
    expect(smallPngOf(jpeg, 320)).toEqual({ made: false, why: 'the file is not a PNG' })
    const narrow = smallPngOf(aPng(2, 1, 3, [1, 2, 3, 4, 5, 6]), 320)
    expect(narrow).toEqual({ made: false, why: 'the picture is 2 pixels wide, which is no wider than 320' })
  })
})

describe('the small address', () => {
  let t: TestDb
  let app: FastifyInstance
  // Read after the test's own database is named: the module opens the database it is given.
  let lib: typeof import('../src/server/lib/portraits.ts')
  const address = portraitAddress('role', 'administrator', 'administrator-1')

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    lib = await import('../src/server/lib/portraits.ts')
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('answers a copy as wide as the pages need, made once and kept beside the database', async () => {
    const first = await app.inject({ method: 'GET', url: smallPortrait(address), headers: AS_THE_PERSON })
    expect(first.statusCode, first.body).toBe(200)
    expect(first.headers['content-type']).toBe('image/png')
    expect(first.headers['x-mole-office-picture']).toBe(`a small copy made now, ${String(SMALL_PORTRAIT_WIDTH)} of 1024 pixels wide`)
    expect(sizeOf(first.rawPayload)).toEqual({ width: SMALL_PORTRAIT_WIDTH, height: SMALL_PORTRAIT_WIDTH })
    const whole = readFileSync(join(lib.portraitDirectory('role', 'administrator'), 'administrator-1.png'))
    expect(first.rawPayload.length).toBeLessThan(whole.length / 5)

    expect(existsSync(join(lib.portraitCopyDirectory(), 'role', 'administrator'))).toBe(true)
    const second = await app.inject({ method: 'GET', url: smallPortrait(address), headers: AS_THE_PERSON })
    expect(second.headers['x-mole-office-picture']).toBe(`the kept small copy, ${String(SMALL_PORTRAIT_WIDTH)} pixels wide`)
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true)
  })

  it('still answers the picture itself without ?size, and refuses a size it does not make', async () => {
    const whole = await app.inject({ method: 'GET', url: address, headers: AS_THE_PERSON })
    expect(whole.statusCode).toBe(200)
    expect(whole.headers['x-mole-office-picture']).toBe('the whole picture')
    expect(whole.rawPayload.equals(readFileSync(join(lib.portraitDirectory('role', 'administrator'), 'administrator-1.png')))).toBe(true)
    const odd = await app.inject({ method: 'GET', url: `${address}?size=huge`, headers: AS_THE_PERSON })
    expect(odd.statusCode).toBe(400)
  })

  it('gives an address that is not a portrait back unchanged', () => {
    expect(smallPortrait('/api/avatars/drawn/a')).toBe('/api/avatars/drawn/a')
    expect(smallPortrait(smallPortrait(address))).toBe(`${address}?size=small`)
  })
})

describe('the pages draw the small copy', () => {
  let live: LiveApp

  beforeAll(async () => {
    live = await liveApp({ name: 'a-portrait-small-copy', viewport: { width: 1440, height: 1000 } })
    const filed = await fetch(`${live.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_PERSON, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'agent', title: 'Builder X', data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }, 300_000)

  afterAll(async () => {
    await live?.stop()
  }, 60_000)

  /** Every drawn picture of this class: where it came from and how wide its pixels are. */
  async function drawn(selector: string): Promise<{ src: string; width: number }[]> {
    await live.page.waitForSelector(selector, { timeout: 30_000 })
    await live.page.evaluate((sel) => {
      for (const img of document.querySelectorAll(sel)) (img as HTMLImageElement).loading = 'eager'
    }, selector)
    await live.page.waitForFunction((sel) => Array.from(document.querySelectorAll(sel)).every((one) => (one as HTMLImageElement).complete), selector, { timeout: 60_000 })
    return live.page.$$eval(selector, (images) => images.map((one) => ({ src: (one as HTMLImageElement).src, width: (one as HTMLImageElement).naturalWidth })))
  }

  it('draws the Role cards from the small copy, and a press opens the whole picture', async () => {
    await live.page.goto(`${live.site}/#/roles`, { timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    for (const selector of ['.rol-portrait', '.rol-tree-portrait']) {
      const pictures = await drawn(selector)
      expect(pictures.length, selector).toBeGreaterThan(0)
      for (const one of pictures) expect([one.src.endsWith('?size=small'), one.width], one.src).toEqual([true, SMALL_PORTRAIT_WIDTH])
    }
    await live.page.locator('.rol-face .sb-image-opens').first().click()
    const opened = await drawn('.sb-picture-large img')
    expect(opened).toHaveLength(1)
    expect(opened[0]!.src).toMatch(/\/api\/portraits\/role\/[^?]+$/)
    expect(opened[0]!.width).toBe(1024)
  })

  it('draws the Embassy from the small copy, and a press opens the whole picture', async () => {
    await live.page.goto(`${live.site}/#/embassy`, { timeout: 60_000 })
    await waitForThePage(live.page, 60_000)
    await live.page.waitForSelector('.emb-list', { timeout: 30_000 })
    const everyone = await live.page.$('button.emb-show:has-text("Show everyone")')
    if (everyone !== null) await everyone.click()
    const pictures = await drawn('.emb-portrait')
    expect(pictures.length).toBeGreaterThan(0)
    for (const one of pictures) expect([one.src.endsWith('?size=small'), one.width], one.src).toEqual([true, SMALL_PORTRAIT_WIDTH])
    await live.page.locator('.emb-row .sb-image-opens').first().click()
    const opened = await drawn('.sb-picture-large img')
    expect(opened[0]!.width).toBe(1024)
  })
})
