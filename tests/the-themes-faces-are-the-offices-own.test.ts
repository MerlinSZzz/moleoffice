// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FACES THE SIX THEMES USE ARE THE OFFICE'S OWN FILES, EACH FAMILY WITH ITS LICENCE.
 *
 * The page asks the internet for no face and no stylesheet. Every `url(` in public/fonts/fonts.css is a
 * relative path to a file in public/fonts that is there. No `url(` and no `@import` in src/web, in
 * public, or in the page itself (src/web/index.html) names an http: or https: address. Each family's
 * folder holds its licence, OFL.txt.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const FONTS = join(ROOT, 'public', 'fonts')
const FONTS_CSS = readFileSync(join(FONTS, 'fonts.css'), 'utf8')

/** These are read as files, never as text; every other file in the scanned folders is read as text. */
const NOT_TEXT = new Set(['.png', '.webp', '.woff2'])

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** Each address a `url(` or an `@import` names in this text, without its quotes. */
function addressesIn(text: string): string[] {
  const urls = [...text.matchAll(/url\(\s*(['"]?)([^'")\s]*)\1\s*\)/g)].map((match) => match[2] ?? '')
  const imports = [...text.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]*)/g)].map((match) => match[2] ?? '')
  return [...urls, ...imports]
}

const FAMILY_FOLDERS = readdirSync(FONTS, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()

describe("the themes' faces", () => {
  it('are named in fonts.css only by relative paths to files in public/fonts that are there', () => {
    const addresses = [...FONTS_CSS.matchAll(/url\(\s*(['"]?)([^'")\s]*)\1\s*\)/g)].map((match) => match[2] ?? '')
    expect(addresses.length).toBeGreaterThan(0)
    const wrong = addresses.filter((address) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(address) || address.startsWith('/')) return true
      const file = resolve(FONTS, address)
      return !file.startsWith(FONTS + sep) || !existsSync(file) || !statSync(file).isFile()
    })
    expect(wrong).toEqual([])
  })

  it('never come from an http: or https: address, and nor does any stylesheet the page imports', () => {
    const files = [...filesUnder(join(ROOT, 'src', 'web')), ...filesUnder(join(ROOT, 'public'))]
    expect(files).toContain(join(ROOT, 'src', 'web', 'index.html'))
    expect(files).toContain(join(FONTS, 'fonts.css'))
    const remote = files
      .filter((file) => !NOT_TEXT.has(file.slice(file.lastIndexOf('.'))))
      .flatMap((file) => addressesIn(readFileSync(file, 'utf8'))
        .filter((address) => /^https?:/i.test(address))
        .map((address) => `${relative(ROOT, file)}: ${address}`))
    expect(remote).toEqual([])
  })

  it('come with each family\'s licence, OFL.txt, in the family\'s folder', () => {
    expect(FAMILY_FOLDERS.length).toBeGreaterThan(0)
    const missing = FAMILY_FOLDERS.filter((folder) => {
      const licence = join(FONTS, folder, 'OFL.txt')
      return !existsSync(licence) || readFileSync(licence, 'utf8').trim() === ''
    })
    expect(missing).toEqual([])
  })
})
