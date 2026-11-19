// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOOR AND THE FRAME: THE SIX REGIONS THAT ARE DRAWN BY HAND, AND WHETHER EACH SAYS WHAT IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS COVERS THAT NOTHING ELSE CAN
 * ---------------------------------------------------------------------------------------
 *
 * `Panel`, `Explain` and `NavRow` take a required `declares` prop, so a panel drawn without an
 * address is a build error and the type checker is the gate for all 156 of them. That gate cannot
 * see the regions below, because none of them is a component call: they are `<div>`, `<header>` and
 * `<aside>` written by hand in the shell, in the rail and in the review column, and a hand-written
 * element has no props anybody can make required.
 *
 * They are also the regions that matter most. `design/ROUND-NINE-INTERACTION-CONTRACT.md` §3.1
 * calls them the frame, and §3.2 calls the first of them the floor. The floor is what answers a
 * right-click that finds nothing more precise — the rail's gutter, the gap between two panels, the
 * space under the last row. Without it a comment about the page has nowhere to be drawn when
 * somebody comes back to it, because the mark layer builds `[data-target="…"]` selectors and no
 * element carried a page key.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST STARTS INCOMPLETE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * Two of the six declare today. The other four are named in `tests/frame-allowlist.json` with the
 * reason each does not, and the gate enforces EQUALITY both ways: a region that starts declaring
 * fails until its entry is deleted, and a region that stops declaring fails until somebody says so.
 * The list can only shrink by a decision somebody wrote down.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT READS TEXT AND NOT A SYNTAX TREE
 * ---------------------------------------------------------------------------------------
 *
 * The same reason `tests/sentences.ts` gives: the TypeScript package here is version 7, which ships
 * a compiler binary and no JavaScript parser API, so `createSourceFile` is not a function in this
 * repository. The scanner below is hand written.
 *
 * IT DOES NOT SHARE `tests/sentences.ts`'s TOKENIZER, and it should. That file's `piecesOf` and
 * `withoutComments` are not exported and the file belongs to another step that is being edited
 * while this lands. The two are the same idea written twice, which is the defect this repository
 * keeps finding; it is recorded as work owed in `design/round-nine/step15-floor-and-frame.md`
 * rather than left to be discovered.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SCANNER CANNOT SEE
 * ---------------------------------------------------------------------------------------
 *
 * 1. Whether the element is really on the screen. It reads source. A region can declare in a file
 *    and be inside a branch nothing takes. The browser proof
 *    `design/round-nine/proof-p7-floor-and-frame.mjs` is what reads the live document.
 * 2. Which element an address ended up on, for a region built by `document.createElement` rather
 *    than written as a tag. The overlay host is one. Those rows fall back to asking whether the
 *    file names the region's own surface id at all, which is weaker, and the browser proof is what
 *    closes the gap.
 * 3. Whether a declaration is HONEST — whether a container that draws a record's title declared the
 *    record rather than a part of Mole Office's own screen. That is step 16's P4, in a browser.
 * 4. A declaration written inside a prop rather than on the tag itself. `declarationIn` reads the
 *    whole opening tag, so `actions={<Chip {...targetAttributes(t)} />}` would be read as the
 *    tag declaring. None of the six regions below takes an element as a prop, and the browser proof
 *    reads the element itself, so this is named rather than guarded.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { tidy } from './sentences.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/**
 * THE SPELLINGS THAT PUT AN ADDRESS ON A HAND-WRITTEN ELEMENT.
 *
 * Every one of them ends at `targetAttributes` in `src/shared/targets.ts`, which is the single
 * writer of `data-target`. They are listed as names rather than found by following imports because
 * this scanner reads text; a new spelling that nothing here knows about reads as "does not declare"
 * and fails loudly, which is the right way round.
 */
export const DECLARING_CALLS: readonly string[] = [
  'floorDeclaration',
  'frameDeclaration',
  'declaredAttributes',
  'surfaceAttributes',
  'targetAttributes',
]

/**
 * HOW ONE REGION IS FOUND IN ITS FILE.
 *
 * `tag` is the ordinary case: a string that appears exactly once in the file and inside the
 * region's own opening tag, so the tag can be read and asked whether it declares.
 *
 * `named` is for a region that is not written as a tag at all — the overlay host is built with
 * `document.createElement`, and the review strip does not exist yet — so there is nothing to read
 * attributes off. The question those rows can answer is narrower and is stated rather than dressed
 * up: does the file that will draw the region name the region's own surface id anywhere? That is
 * weaker than reading an element, and the browser proof is what closes the gap.
 */
export type HowToFind = { kind: 'tag'; anchor: string } | { kind: 'named' }

/** One region of the frame: what it is, where it is drawn, and how to find it in that file. */
export interface FrameRegion {
  /**
   * The name the allowlist uses. For the five named parts of the screen it is the `SurfaceId`; the
   * floor is not a part of the screen — it is the page — so it is called `page` here.
   */
  id: string
  /** What a person would call this region. */
  what: string
  /** The file that draws it, relative to `src`. */
  file: string
  /** How to find it in that file. */
  find: HowToFind
}

/**
 * THE FRAME, FROM CONTRACT §3.1, PLUS THE FLOOR FROM §3.2.
 *
 * Six rows and not five: the contract counts the frame's five regions and states the floor
 * separately, and a list that left the floor out would let the one region every page depends on be
 * deleted with nothing going red.
 */
export const FRAME_REGIONS: readonly FrameRegion[] = [
  {
    id: 'page',
    what: 'the whole page, which is what a press with nothing under it points at',
    file: 'web/App.tsx',
    find: { kind: 'tag', anchor: 'className="shell"' },
  },
  {
    id: 'header',
    what: "the phone's top bar",
    file: 'web/App.tsx',
    find: { kind: 'tag', anchor: 'className="shell-bar"' },
  },
  {
    id: 'rail',
    what: 'the left rail, where navigation lives',
    file: 'web/components/Sidebar.tsx',
    find: { kind: 'tag', anchor: 'id="shell-side"' },
  },
  {
    id: 'overlays',
    what: 'where every popup, menu and composer is drawn',
    file: 'web/components/ui.tsx',
    // Built with `document.createElement`, so there is no opening tag whose attributes can be read.
    find: { kind: 'named' },
  },
  {
    id: 'review.pane',
    what: 'the column listing what you have written in this review',
    file: 'web/components/agent/ReviewBar.tsx',
    find: { kind: 'tag', anchor: 'className="px-pane"' },
  },
]

/** The file with every comment replaced by spaces, so positions are unchanged. */
export function withoutComments(text: string): string {
  const chars = text.split('')
  const blank = (at: number, end: number) => {
    for (let i = at; i < end && i < chars.length; i += 1) if (chars[i] !== '\n') chars[i] = ' '
  }
  let i = 0
  let previous = ''
  while (i < text.length) {
    const c = text[i]
    if (c === undefined) break
    if (c === '/' && text[i + 1] === '/') {
      const stop = text.indexOf('\n', i)
      const end = stop === -1 ? text.length : stop
      blank(i, end)
      i = end
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const stop = text.indexOf('*/', i + 2)
      const end = stop === -1 ? text.length : stop + 2
      blank(i, end)
      i = end
      continue
    }
    // A regular expression can hold an unmatched quote — `/['"]/` is real code in this tree — so a
    // slash that follows an operator or an opening bracket is read as one and skipped whole.
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]/.test(previous)) {
      let j = i + 1
      let inClass = false
      while (j < text.length) {
        const d = text[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) break
        else if (d === '\n') break
        j += 1
      }
      i = j + 1
      previous = '/'
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      let depth = 0
      while (j < text.length) {
        const d = text[j]
        if (d === '\\') {
          j += 2
          continue
        }
        // `${` inside a template literal opens code again, and code can hold a slash pair that is
        // not a comment and a quote that is not the end of the string.
        if (c === '`' && d === '$' && text[j + 1] === '{') {
          depth += 1
          j += 2
          continue
        }
        if (c === '`' && depth > 0 && d === '}') {
          depth -= 1
          j += 1
          continue
        }
        if (depth === 0 && d === c) break
        if (c !== '`' && d === '\n') break
        j += 1
      }
      i = j + 1
      previous = c
      continue
    }
    if (!/\s/.test(c)) previous = c
    i += 1
  }
  return chars.join('')
}

/**
 * The opening tag that starts at `at`, whitespace collapsed.
 *
 * It walks rather than stopping at the first `>`, because a prop holds an expression and an
 * expression holds `>` — `rank={n > 2 ? 0 : 1}` is real here — and because a prop can hold a whole
 * element, as `actions={<Button />}` does. Quotes, braces, brackets and parentheses are counted and
 * the tag ends at the first `>` outside all of them.
 */
export function openingTagAt(code: string, at: number): string | null {
  let i = at
  let depth = 0
  while (i < code.length) {
    const c = code[i]
    if (c === undefined) break
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') j += 1
        j += 1
      }
      i = j + 1
      continue
    }
    if (c === '{' || c === '[' || c === '(') depth += 1
    else if (c === '}' || c === ']' || c === ')') depth -= 1
    else if (c === '>' && depth === 0) return tidy(code.slice(at, i + 1))
    i += 1
  }
  return null
}

/** How many times a string appears in a file, with comments taken out first. */
export function timesIn(code: string, anchor: string): number {
  let count = 0
  let at = code.indexOf(anchor)
  while (at !== -1) {
    count += 1
    at = code.indexOf(anchor, at + 1)
  }
  return count
}

/** The opening tag that carries this anchor, or null when the anchor is not in the file. */
export function tagCarrying(code: string, anchor: string): string | null {
  const at = code.indexOf(anchor)
  if (at === -1) return null
  const opens = code.lastIndexOf('<', at)
  if (opens === -1) return null
  return openingTagAt(code, opens)
}

/**
 * The spelling this opening tag declares itself with, or null when it declares nothing.
 *
 * A hand-written element declares by spreading the attributes a declaration produces, so this looks
 * for a spread of one of the known calls, or for the attribute written out by hand.
 */
export function declarationIn(tag: string): string | null {
  if (/data-target\s*=/.test(tag)) return 'data-target'
  for (const call of DECLARING_CALLS) {
    if (new RegExp(`\\{\\s*\\.\\.\\.\\s*${call}\\s*\\(`).test(tag)) return call
  }
  return null
}

/**
 * WHERE A FILE NAMES A SURFACE ID, built from the id itself so there is no second list of names.
 *
 * Three spellings, because all three are honest and all three are in this tree:
 * `{ surface: 'overlays' }` is the declaration a container passes, `{ kind: 'uiSurface', surfaceId:
 * 'overlays' }` is the target an element built by hand spreads, and `frameDeclaration('overlays')`
 * is the shell's own shorthand for the second. A fourth spelling nobody here knows about reads as
 * "does not name it" and fails loudly with the tag printed, which is the right way round.
 */
export function namesTheSurface(id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(surfaceId|surface)\\s*:\\s*['"]${escaped}['"]|\\(\\s*['"]${escaped}['"]\\s*\\)`)
}

/** One region's source, with comments taken out. */
export function sourceOf(region: FrameRegion): string {
  return withoutComments(readFileSync(`${SRC}/${region.file}`, 'utf8'))
}

/** Does this region say what it is? */
export function regionDeclares(region: FrameRegion): boolean {
  const code = sourceOf(region)
  if (region.find.kind === 'named') return namesTheSurface(region.id).test(code)
  const tag = tagCarrying(code, region.find.anchor)
  return tag === null ? false : declarationIn(tag) !== null
}
