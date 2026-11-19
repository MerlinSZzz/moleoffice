// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRODUCT'S MARK SHOWS THE OWNER'S OWN PNG LOGO, AND SO DOES THE BROWSER TAB.
 *
 * Criterion M31 of design/messages/ACCEPTANCE.md: the logo appears beside the words "Mole Office" at
 * the top left. It is also the tab's icon, because a product with no favicon is a grey globe in the tab
 * strip and round eleven's report already said so.
 *
 * Since a message and a decision, the mark is the owner's PNG logo, assets/mole-office.png, in place of the drawing
 * that had been traced from it by hand. The traced drawing's eyes were
 * plain and pale; the owner's logo's are dark with small white highlights.
 *
 * THE HOME SCREEN HAD NO ICON. The page named only the two tab icons and the manifest named none, so
 * an iPhone that added the page to its Home Screen showed a blank tile. The page now names a
 * 180-pixel apple-touch-icon in src/web/logo, and public/manifest.webmanifest names a 192, a 512 and
 * a 512 maskable copy in public/logo. They are the owner's picture, made the same way as the tab
 * copies, and each has the office's light page colour behind it: an iPhone draws a see-through
 * apple-touch-icon on black, and a phone fills a maskable icon's clear parts with a colour of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS EXISTS TO CATCH
 * ---------------------------------------------------------------------------------------
 *
 * THE APP SHOWS SMALL COPIES OF THE OWNER'S PNG, NOT THE PNG ITSELF. They are in src/web/logo, because Vite
 * only serves and hashes what is inside its own root and assets/ is outside it. A copy can drift
 * from the picture it was made from, or be replaced by another picture, with nothing else failing.
 * So this file reads each copy's pixels and compares them with the owner's PNG, region by region.
 *
 * The copies were made with sharp 0.34.4 (libvips 8.17.2), by resizing assets/mole-office.png with
 * the lanczos3 filter; the two tab icons were fitted into a square with a clear border. The commit
 * that added them names the command.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { inflateSync } from 'node:zlib'

/** This checkout, found from this file rather than from the working directory. */
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const THE_OWNERS_LOGO = join(ROOT, 'assets', 'mole-office.png')
const LOGO_FOLDER = join(ROOT, 'src', 'web', 'logo')
const PUBLIC_LOGO_FOLDER = join(ROOT, 'public', 'logo')

/**
 * THE OFFICE'S OWN LIGHT PAGE BACKGROUND, from --bg in src/web/tokens.css: #f3efe4.
 *
 * The Home Screen copies have this colour behind the owner's picture, because an iPhone draws a
 * see-through apple-touch-icon on black and a phone fills a maskable icon's clear parts with a
 * colour of its own. The comparison below treats this colour as clear, so each copy is compared as
 * the picture it holds rather than as the square it fills.
 */
const PAPER = { r: 243, g: 239, b: 228 }

/**
 * THE COPIES AND THE SIZES CHOSEN FOR THEM, in pixels.
 *
 * The mark is drawn 1.25em tall beside the word, which is 20 pixels at the sidebar's 16-pixel text,
 * so it has a copy 20 pixels tall and one twice that for double-density screens. Its width is what
 * the owner's picture's shape, 477 by 406, gives at that height. A browser tab draws its icon in a
 * 16-pixel square, so the tab has a 16-pixel copy and a 32-pixel one.
 */
const COPIES = [
  { file: 'mole-office-mark-20.png', width: 23, height: 20 },
  { file: 'mole-office-mark-40.png', width: 47, height: 40 },
  { file: 'mole-office-tab-16.png', width: 16, height: 16 },
  { file: 'mole-office-tab-32.png', width: 32, height: 32 },
] as const

/**
 * THE HOME SCREEN COPIES AND THE SIZES CHOSEN FOR THEM, in pixels.
 *
 * A phone's Home Screen draws an icon in a square. The page's apple-touch-icon is 180 pixels, the
 * size an iPhone asks for, and the manifest names a 192-pixel and a 512-pixel copy for the phones
 * that read it. The maskable copy is for a launcher that cuts the icon to its own shape: its picture
 * is smaller so all of it stays inside the middle 80 per cent of the square, the safe zone.
 */
const HOME_SCREEN_COPIES = [
  { file: 'mole-office-touch-180.png', width: 180, height: 180, folder: LOGO_FOLDER, maskable: false },
  { file: 'mole-office-icon-192.png', width: 192, height: 192, folder: PUBLIC_LOGO_FOLDER, maskable: false },
  { file: 'mole-office-icon-512.png', width: 512, height: 512, folder: PUBLIC_LOGO_FOLDER, maskable: false },
  { file: 'mole-office-icon-512-maskable.png', width: 512, height: 512, folder: PUBLIC_LOGO_FOLDER, maskable: true },
] as const

/**
 * THE CORNER RADIUS AN IPHONE DRAWS on a Home Screen icon, in pixels: 40 pixels, which is
 * 22.37 per cent of the 180-pixel side. iOS clips an app icon to a rounded square, so a picture
 * that reaches into the corners is cut with them.
 */
const IPHONE_CORNER_RADIUS = 40


/**
 * HOW FAR A COPY'S REGION MAY BE FROM THE OWNER'S PICTURE'S, out of 255.
 *
 * Measured on 25 September 2026 on a 4 by 4 grid: the four copies differ from the owner's picture by at
 * most 28.4 (the 16-pixel tab icon, where each region is only a few pixels). The traced drawing this
 * replaced, drawn at 23 by 20, differs by 55.3; the copy turned upside down, by 145.8; another
 * picture from assets/, by 126.9. 40 sits between the copies and the nearest picture that is not.
 *
 * Measured again on 14 November 2026: the four Home Screen copies, read as the picture over the
 * office's light page colour, differ by at most 4.9.
 */
const GRID = 4
const LIMIT = 40

type UI = typeof import('../src/web/components/ui.tsx')
let ui: UI

/** A picture as its size and its pixels, four bytes each: red, green, blue, opacity. */
interface Pixels {
  width: number
  height: number
  rgba: Buffer
}

/**
 * READ A PNG'S PIXELS, for the one kind of PNG these files are: 8 bits per channel, colour with
 * opacity, not interlaced. Any other kind is refused with a sentence rather than read wrongly.
 */
function readPng(path: string): Pixels {
  const bytes = readFileSync(path)
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${path} is not a PNG`)
  let at = 8
  let width = 0
  let height = 0
  let kind = ''
  const data: Buffer[] = []
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at)
    const name = bytes.toString('latin1', at + 4, at + 8)
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (name === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      kind = `depth ${String(body[8])}, colour type ${String(body[9])}, interlace ${String(body[12])}`
    }
    if (name === 'IDAT') data.push(body)
    at += 12 + length
  }
  if (kind !== 'depth 8, colour type 6, interlace 0') {
    throw new Error(`${path} is a PNG this reader was not written for (${kind}); it reads 8-bit colour with opacity only`)
  }
  const raw = inflateSync(Buffer.concat(data))
  const row = width * 4
  const rgba = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (row + 1)]
    for (let x = 0; x < row; x++) {
      const left = x >= 4 ? (rgba[y * row + x - 4] ?? 0) : 0
      const up = y > 0 ? (rgba[(y - 1) * row + x] ?? 0) : 0
      const corner = x >= 4 && y > 0 ? (rgba[(y - 1) * row + x - 4] ?? 0) : 0
      let value = raw[y * (row + 1) + 1 + x] ?? 0
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const guess = left + up - corner
        const [a, b, c] = [Math.abs(guess - left), Math.abs(guess - up), Math.abs(guess - corner)]
        value += a <= b && a <= c ? left : b <= c ? up : corner
      } else if (filter !== 0) throw new Error(`${path} has a row with filter ${String(filter)}, which PNG does not define`)
      rgba[y * row + x] = value & 255
    }
  }
  return { width, height, rgba }
}

/** Whether this pixel is the office's page colour behind a Home Screen copy. */
function isPaper(picture: Pixels, at: number, paper: { r: number; g: number; b: number }): boolean {
  return (
    Math.abs((picture.rgba[at] ?? 0) - paper.r) <= 8 &&
    Math.abs((picture.rgba[at + 1] ?? 0) - paper.g) <= 8 &&
    Math.abs((picture.rgba[at + 2] ?? 0) - paper.b) <= 8
  )
}

/**
 * THE PICTURE AS A GRID OF REGIONS: the mean colour and opacity of each, over the part of the
 * picture that is not clear. Measured over that part, and not the whole file, because the tab icons
 * have a clear border above and below that the owner's picture does not.
 *
 * `paper` is the colour a Home Screen copy has behind the picture. Those pixels are read as clear,
 * so a filled square is compared as the picture it holds, on the same grid as the owner's PNG.
 */
function regions(picture: Pixels, paper: { r: number; g: number; b: number } | null = null): { shape: number; cells: number[][] } {
  const { width, height, rgba } = picture
  const clearAt = (at: number): boolean => (rgba[at + 3] ?? 0) < 128 || (paper !== null && isPaper(picture, at, paper))
  let [left, top, right, bottom] = [width, height, -1, -1]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (clearAt((y * width + x) * 4)) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  const [w, hi] = [right - left + 1, bottom - top + 1]
  const sums = Array.from({ length: GRID * GRID }, () => [0, 0, 0, 0, 0])
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 4
      // On the owner's picture and the see-through copies this is the original reading: every
      // pixel's colour weighted by its own opacity. On a filled copy the page colour is clear and
      // every other pixel is as opaque as the copy makes it.
      const clear = paper !== null && ((rgba[i + 3] ?? 0) < 128 || isPaper(picture, i, paper))
      const alpha = clear ? 0 : (rgba[i + 3] ?? 0)
      const opacity = clear ? 0 : paper === null ? alpha / 255 : 1
      const cell = sums[Math.floor(((y - top) * GRID) / hi) * GRID + Math.floor(((x - left) * GRID) / w)] ?? []
      for (let k = 0; k < 3; k++) cell[k] = (cell[k] ?? 0) + (clear ? 0 : (rgba[i + k] ?? 0) * opacity)
      cell[3] = (cell[3] ?? 0) + alpha
      cell[4] = (cell[4] ?? 0) + 1
    }
  }
  return { shape: w / hi, cells: sums.map((cell) => cell.slice(0, 4).map((sum) => sum / (cell[4] ?? 1))) }
}

/**
 * HOW FAR THE PICTURE'S FURTHEST PIXEL IS FROM THE CENTRE OF ITS SQUARE, in pixels. A maskable
 * icon keeps every part of its picture inside a circle whose diameter is 80 per cent of the icon's
 * width, because a phone may cut the rest of the square away.
 */
function furthestOpaquePixel(picture: Pixels, paper: { r: number; g: number; b: number }): number {
  const { width, height } = picture
  const [cx, cy] = [(width - 1) / 2, (height - 1) / 2]
  let furthest = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if ((picture.rgba[at + 3] ?? 0) < 128 || isPaper(picture, at, paper)) continue
      furthest = Math.max(furthest, Math.hypot(x - cx, y - cy))
    }
  }
  return furthest
}

/**
 * HOW MANY LOGO PIXELS LIE OUTSIDE A ROUNDED SQUARE of this picture's size and the given corner
 * radius. A logo pixel is an opaque pixel that is not the paper colour, read as `isPaper` and
 * `furthestOpaquePixel` read one. A pixel counts as outside when its centre is outside the curve:
 * the four straight edges bound it, and each corner is a quarter circle of the radius.
 */
function logoPixelsOutsideRoundedSquare(
  picture: Pixels,
  paper: { r: number; g: number; b: number },
  radius: number,
): number {
  const { width, height } = picture
  const [cx, cy] = [width / 2, height / 2]
  let outside = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if ((picture.rgba[at + 3] ?? 0) < 128 || isPaper(picture, at, paper)) continue
      const [dx, dy] = [Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy)]
      const [beyondX, beyondY] = [dx - (cx - radius), dy - (cy - radius)]
      if (beyondX > 0 && beyondY > 0 && Math.hypot(beyondX, beyondY) > radius) outside++
    }
  }
  return outside
}

/** Every `src` and `srcset` address of every image in a piece of markup. */
function addressesIn(markup: string): string[] {
  const found: string[] = []
  for (const [, value] of markup.matchAll(/\s(?:src|srcSet|srcset)="([^"]+)"/g)) {
    for (const part of (value ?? '').split(',')) found.push(part.trim().split(/\s+/)[0] ?? '')
  }
  return found
}

beforeAll(async () => {
  // src/web/api.ts reads browser storage as it loads, and the component library imports it for one
  // error helper, so importing the components needs a window to exist. Nothing here is under test.
  const held = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    },
  }
  ui = await import('../src/web/components/ui.tsx')
})

describe('the mark at the top left shows the owner\'s PNG logo', () => {
  it('shows it beside the whole name, beside the two initials and alone in the collapsed rail, once each, with its name', () => {
    for (const [which, form] of [
      ['the whole name', 'full'],
      ['the two initials', 'short'],
      ['the collapsed rail', 'icon'],
    ] as const) {
      const markup = renderToStaticMarkup(h(ui.Wordmark, { form }))
      expect(markup.match(/<img[^>]*class="px-wordmark-icon"/g), `${which} does not show the logo exactly once`).toHaveLength(1)
      const image = /<img[^>]*class="px-wordmark-icon"[^>]*>/.exec(markup)?.[0] ?? ''
      expect(image, `${which} shows a logo with no words for it`).toMatch(/\salt="[^"]{8,}"/)
      // Its width and height are there before the picture is, so the word does not move as it loads.
      expect(image, `${which} shows a logo with no width and height of its own`).toMatch(/\swidth="23"/)
      expect(image).toMatch(/\sheight="20"/)
      const named = addressesIn(image).map((address) => fileURLToPath(address))
      expect(named, `${which} does not name the two copies of the owner's logo made for the mark`).toEqual([
        join(LOGO_FOLDER, 'mole-office-mark-20.png'),
        join(LOGO_FOLDER, 'mole-office-mark-20.png'),
        join(LOGO_FOLDER, 'mole-office-mark-40.png'),
      ])
      expect(image, 'the double-density copy is not offered for double-density screens').toMatch(/mole-office-mark-40\.png 2x/)
    }
  })

  it('is set at the height of the word beside it, in em, so it follows every size the mark is drawn at', () => {
    const rule = /\.px-wordmark-icon\s*\{([^}]*)\}/.exec(ui.UI_CSS)?.[1] ?? ''
    expect(rule, 'there is no rule for the logo at all').not.toBe('')
    // In em and not in pixels: the sidebar sets the mark at one size and the collapsed rail at
    // another, and neither should have to know this rule exists.
    expect(rule).toMatch(/width:\s*[\d.]+em/)
    expect(rule).toMatch(/height:\s*[\d.]+em/)
    expect(rule).not.toMatch(/(width|height):\s*[\d.]+px/)
  })

  it('stays in the sidebar when it narrows to icons', async () => {
    // The rail is what is left when the words go: `.shell-brand-full` is hidden and the icon form is
    // shown. The logo is inside every form, so it survives — unless a rule takes it away, which is
    // the thing this asks about.
    const sidebar = await import('../src/web/components/Sidebar.tsx')
    for (const [selector, body] of sidebar.SIDEBAR_CSS.matchAll(/([^{}]*px-wordmark-icon[^{}]*)\{([^}]*)\}/g)) {
      expect(body ?? '', `${String(selector).trim()} takes the logo off the screen`).not.toMatch(/display:\s*none/)
    }
  })
})

describe('the copies are the owner\'s PNG, at the sizes chosen for them', () => {
  const theirs = regions(readPng(THE_OWNERS_LOGO))

  for (const copy of COPIES) {
    it(`${copy.file} is ${String(copy.width)} by ${String(copy.height)} pixels and is the owner's picture`, () => {
      const path = join(LOGO_FOLDER, copy.file)
      expect(existsSync(path), `${path} is missing`).toBe(true)
      const picture = readPng(path)
      expect([picture.width, picture.height], `${copy.file} is not the size chosen for it`).toEqual([copy.width, copy.height])
      const mine = regions(picture)
      // One pixel either way at the smallest copy is 7% of its shape, so the shape is allowed 0.07.
      expect(Math.abs(mine.shape - theirs.shape), `${copy.file} is not the shape of the owner's picture`).toBeLessThanOrEqual(0.07)
      let furthest = 0
      mine.cells.forEach((cell, i) =>
        cell.forEach((value, k) => {
          furthest = Math.max(furthest, Math.abs(value - (theirs.cells[i]?.[k] ?? 0)))
        }),
      )
      expect(furthest, `${copy.file} is not a copy of assets/mole-office.png`).toBeLessThanOrEqual(LIMIT)
    })
  }
})

describe('the Home Screen shows the owner\'s PNG logo too', () => {
  const theirs = regions(readPng(THE_OWNERS_LOGO))

  for (const copy of HOME_SCREEN_COPIES) {
    it(`${copy.file} is ${String(copy.width)} by ${String(copy.height)} pixels and is the owner's picture`, () => {
      const path = join(copy.folder, copy.file)
      expect(existsSync(path), `${path} is missing`).toBe(true)
      const picture = readPng(path)
      expect([picture.width, picture.height], `${copy.file} is not the size chosen for it`).toEqual([copy.width, copy.height])
      // The light page colour is behind the picture, so a phone never draws it on black.
      expect([...picture.rgba.subarray(0, 3)], `${copy.file} has no light page background`).toEqual([PAPER.r, PAPER.g, PAPER.b])
      const mine = regions(picture, PAPER)
      expect(Math.abs(mine.shape - theirs.shape), `${copy.file} is not the shape of the owner's picture`).toBeLessThanOrEqual(0.07)
      let furthest = 0
      mine.cells.forEach((cell, i) =>
        cell.forEach((value, k) => {
          furthest = Math.max(furthest, Math.abs(value - (theirs.cells[i]?.[k] ?? 0)))
        }),
      )
      expect(furthest, `${copy.file} is not a copy of assets/mole-office.png`).toBeLessThanOrEqual(LIMIT)
    })
  }

  it('the maskable copy keeps the whole picture inside the middle 80 per cent', () => {
    const copy = HOME_SCREEN_COPIES.find((one) => one.maskable)
    expect(copy, 'no Home Screen copy is declared maskable').toBeDefined()
    if (copy === undefined) return
    const picture = readPng(join(copy.folder, copy.file))
    expect(furthestOpaquePixel(picture, PAPER), `${copy.file} is cut by a phone's shape`).toBeLessThanOrEqual(copy.width * 0.4)
  })

  it('the 180 copy keeps every logo pixel inside the rounded square an iPhone draws', () => {
    const copy = HOME_SCREEN_COPIES.find((one) => one.file === 'mole-office-touch-180.png')
    expect(copy, 'no 180-pixel Home Screen copy is declared').toBeDefined()
    if (copy === undefined) return
    const picture = readPng(join(copy.folder, copy.file))
    const outside = logoPixelsOutsideRoundedSquare(picture, PAPER, IPHONE_CORNER_RADIUS)
    expect(outside, `${copy.file} is cut by the iPhone's rounded corners`).toBe(0)
  })
})


