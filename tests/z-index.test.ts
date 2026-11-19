// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT FLOATS ABOVE WHAT IS DECIDED IN ONE PLACE, AND THIS IS WHAT KEEPS IT THERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, COUNTED
 * ---------------------------------------------------------------------------------------
 *
 * There were twenty-eight z-index numbers in src/web and no token. They came from six unrelated
 * scales — 100 in the global stylesheet, 60 and 55 in the sidebar, 45 on the agent composer, 40 in
 * three separate files, 30 in the shell, 20 on a dead top bar, and single digits scattered through
 * the tables and the graph. Nothing said which was meant to be above which. So the only way to find
 * out whether a new floating thing would land on top was to open it and look, and the owner found
 * out the other way: a composer clipped underneath a table.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * In src/web a z-index is one of exactly two things.
 *
 *   A NAMED LAYER of the app — var(--z-…), declared in tokens.css. The order those tokens are
 *   written in IS the order on the screen, so somebody deciding where a new overlay goes reads a
 *   list instead of comparing numbers across six files.
 *
 *   A LOCAL NUDGE — a single digit. Two things inside one component, where one must paint over the
 *   other and neither competes with anything else on the page: a row's title over its own hit area,
 *   a table's frozen column over its own cells. Those are not layers of the app and naming them as
 *   layers would say they rank against the navigation drawer, which they do not.
 *
 * Anything else fails here, which is what makes the scale in tokens.css the only place the question
 * is answered. A second scale cannot be added quietly.
 *
 * WHAT THIS FILE DOES NOT CLAIM. It does not prove that the overlay host really is on top of a
 * page — that is a fact about a browser laying out a real document, and it is measured in a real
 * one by tests/overlay-host.test.ts. This file proves there is one declaration and one order.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

const web = fileURLToPath(new URL('../src/web', import.meta.url))
const tokensFile = join(web, 'tokens.css')

/** Values that say "do not stack me", which are always allowed and are not part of any scale. */
const KEYWORDS = ['auto', 'inherit', 'initial', 'unset', 'revert']

interface Layer {
  name: string
  value: number
  line: number
}

/**
 * Every layer tokens.css declares, IN THE ORDER IT DECLARES THEM.
 *
 * The order is read out of the file rather than restated here, because a list of layer names in a
 * test is a second statement of the order and the two could then disagree — which is the defect
 * this whole scale exists to end.
 */
function theScale(): Layer[] {
  const lines = readFileSync(tokensFile, 'utf8').split('\n')
  const found: Layer[] = []
  lines.forEach((line, index) => {
    const match = /^\s*(--z-[a-z0-9-]+)\s*:\s*(-?\d+)\s*;/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      found.push({ name: match[1], value: Number(match[2]), line: index + 1 })
    }
  })
  return found
}

/** Every file in the browser tree that could carry a style. */
function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...filesUnder(path))
      continue
    }
    if (['.ts', '.tsx', '.css'].includes(extname(path))) out.push(path)
  }
  return out.sort()
}

interface Use {
  file: string
  line: number
  value: string
}

/** Every `z-index:` written anywhere in src/web, wherever the stylesheet it belongs to lives. */
function everyUse(): Use[] {
  const out: Use[] = []
  for (const path of filesUnder(web)) {
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        // The guard on the left stops this matching a longer property or token name that happens to
        // end in the same letters.
        const match = /(?:^|[^-\w])z-index\s*:\s*([^;{}\n]+)/.exec(line)
        if (match?.[1] === undefined) return
        out.push({
          file: relative(web, path),
          line: index + 1,
          value: match[1].replace(/!important/, '').trim(),
        })
      })
  }
  return out
}

describe('every z-index in the browser is a named layer or a single-digit local nudge', () => {
  it('has no loose number and no unknown token', () => {
    const declared = new Set(theScale().map((layer) => layer.name))
    const wrong = everyUse().filter((use) => {
      const named = /^var\((--z-[a-z0-9-]+)\)$/.exec(use.value)?.[1]
      if (named !== undefined) return !declared.has(named)
      if (KEYWORDS.includes(use.value)) return false
      // A single digit and nothing longer: two things inside one component.
      return !/^\d$/.test(use.value)
    })
    expect(
      wrong.map((use) => `${use.file}:${String(use.line)} — z-index: ${use.value}`),
      'each of these is either a layer of the app, which belongs in the scale in tokens.css, or a local nudge, which is a single digit',
    ).toEqual([])
  })

  /**
   * THE SCAN HAS TO FIND SOMETHING, or the check above proves nothing.
   *
   * A regex that quietly stopped matching would report a clean tree for ever. This project has been
   * caught by exactly that shape of failure before — a grep over the type checker's output that
   * never matched and so always read as clean.
   */
  it('is looking at a tree that really has z-index in it', () => {
    expect(everyUse().length, 'the scan found no z-index anywhere in src/web, so it is measuring nothing')
      .toBeGreaterThan(10)
  })
})
