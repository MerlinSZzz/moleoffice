// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEPARTMENTS PAGE'S CLASSES ARE STYLED BY ITS OWN STYLE SHEET ALONE. Wave 13s, departments step 1b.
 *
 * WHAT THIS CATCHES, AND WHY IT MATTERS
 *
 * A page's style is drawn into the document's head, and a browser keeps it there after the page is left. So a class
 * name that two pages use is a rule one page meant for itself reaching the other page's rows, in any tab where the
 * first page has been opened. The departments tree and the record page both used the same row class, and the record
 * page's rule for it is not scoped to that page, so opening a record page changed the tree's rows. This file keeps a
 * class the departments page's sheet defines from being named, as a selector, by any other file under src/web.
 *
 * HOW IT READS THE CLASSES
 *
 * It reads the departments page as text, takes the template string that follows DEPARTMENTS_PAGE_CSS, and reads every
 * class its sheet defines: a dot, then a letter, underscore or hyphen, then letters, digits, underscores and hyphens.
 * Every other file under src/web whose name ends in .ts, .tsx, .css or .html is then read. A style sheet or a page is
 * read whole; a TypeScript file is read only through its string pieces, so a property such as `x.dp` in code is not
 * mistaken for a selector. A class is named where its dot, its name and a character that is not a letter, digit,
 * underscore or hyphen are found, so `.dp-rows` is not `.dp-row`.
 * The line a message names is the line of the match itself, found from where its string starts in the file.
 *
 * WHAT THIS FILE DOES NOT CATCH
 *
 * - a class used by the departments page that its own sheet does not define, such as a shared class from another
 *   file;
 * - a class added to the departments page's rows by code at run time;
 * - a collision between two other pages;
 * - a class selector built in code from parts, which no string holds whole.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { piecesOf } from './the-pieces-of-a-source.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WEB = join(ROOT, 'src', 'web')
const THE_PAGE = join(WEB, 'pages', 'DepartmentsPage.tsx')
const THE_DECLARATION = 'const DEPARTMENTS_PAGE_CSS = '

/** Every file under src/web that could carry a style, except the departments page itself. */
function otherFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!['.ts', '.tsx', '.css', '.html'].includes(extname(path))) continue
      if (path !== THE_PAGE) out.push(path)
    }
  }
  walk(WEB)
  return out.sort()
}

/** The template string that follows the declaration of the departments page's style sheet. */
function theSheet(text: string): string {
  const at = text.indexOf(THE_DECLARATION)
  expect(
    at,
    `the departments page holds no "${THE_DECLARATION.trim()}" to read its style sheet from`,
  ).toBeGreaterThanOrEqual(0)
  const after = at + THE_DECLARATION.length
  const starts = piecesOf(text).filter(
    (piece) => piece.what === 'string' && piece.at >= after && text.slice(after, piece.at).trim() === '',
  )
  expect(
    starts.length,
    starts.length === 0
      ? 'no string piece starts after the departments page style sheet declaration, so its sheet was not read'
      : `more than one string piece starts after the departments page style sheet declaration ` +
        `(${starts.length}), so its sheet is ambiguous`,
  ).toBe(1)
  const piece = starts[0]
  return piece === undefined ? '' : piece.body
}

/** Every class a style sheet defines, as CSS reads one. */
function theClasses(sheet: string): string[] {
  const found = new Set<string>()
  for (const match of sheet.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)) {
    if (match[1] !== undefined) found.add(match[1])
  }
  return [...found]
}

interface Naming {
  file: string
  line: number
  className: string
}

/** What can hold a selector in one file, and where the first character of its body is in the file. */
function theTextsToRead(path: string, text: string): { start: number; body: string }[] {
  if (extname(path) === '.css' || extname(path) === '.html') return [{ start: 0, body: text }]
  return piecesOf(text)
    .filter((piece) => piece.what === 'string')
    .map((piece) => ({ start: piece.at + 1, body: piece.body }))
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1
  return line
}

/** Each place one file names one of the classes as a selector. */
function everyNaming(path: string, classes: readonly string[]): Naming[] {
  const text = readFileSync(path, 'utf8')
  const out: Naming[] = []
  for (const piece of theTextsToRead(path, text)) {
    for (const className of classes) {
      const pattern = new RegExp(`\\.${className}(?![A-Za-z0-9_-])`, 'g')
      for (const match of piece.body.matchAll(pattern)) {
        out.push({ file: relative(ROOT, path), line: lineAt(text, piece.start + match.index), className })
      }
    }
  }
  return out
}

describe('the departments page styles its own classes alone', () => {
  it('names no class of its style sheet in another file under src/web', () => {
    const classes = theClasses(theSheet(readFileSync(THE_PAGE, 'utf8')))
    expect(
      classes.length,
      `the departments page's style sheet was not read: it defines ${classes.length} class(es), ` +
        `and a sheet defines at least 2`,
    ).toBeGreaterThanOrEqual(2)
    const namings = otherFiles().flatMap((path) => everyNaming(path, classes))
    const said = namings.map((naming) => `${naming.file}:${naming.line} names .${naming.className}`).join('\n')
    expect(
      namings,
      `Another file under src/web names a class the departments page's style sheet defines:\n${said}`,
    ).toEqual([])
  })
})
