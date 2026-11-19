// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COLLISION CENSUS OVER EVERY TOKEN THE COLOUR ROLE REGISTER NAMES, IN BOTH LOOKS.
 *
 *     node tools/colour-role-census.mjs
 *
 * WHY THIS EXISTS BESIDE `design/round-ten/baseline/r10sg-collisions.mjs`. That script carries a
 * hand-written list of twenty-one token names. A hand-written list goes stale the moment the
 * register gains a row, and the register gained sixteen in wave 14 — ten review rows, four work
 * states and two of the three Placeholder rows named a rank rather than a hue. This one reads the
 * token list OUT OF `src/shared/colourroles.ts`, so the census covers whatever the register
 * actually names and the count is measured rather than remembered. The build plan said 24 tokens;
 * the number this prints is the one to believe.
 *
 * THE PARSER CARRIES THE SENTINEL THAT CAUGHT IT READING THE WRONG PALETTE. `tokens.css` repeats
 * the whole dark palette inside `@media (prefers-color-scheme: dark)` after the last `data-theme`
 * block. A slice that ran to the end of the file read dark twice and published dark's hexes under
 * another look's name — it invented one collision and hid another. Before it compares anything it
 * asserts that light's `--accent` is light's own declared value and dark's is dark's. A
 * parser that runs past a palette's closing brace fails there instead of publishing a wrong table.
 *
 * WHAT IT MEASURED ON 26 AUGUST 2026, AND ONE OF THE NUMBERS IS NOT THE PLAN'S. The build plan
 * said the sweep runs over 24 tokens. The register names 31, of which 29 are hues and 2 are the
 * non-colour channels of role 9. 24 was never a number this corpus held.
 *
 * AND THE TWO REVIEW ACCENTS COLLIDE ON PURPOSE. `--review-local` is the palette's own blue and
 * `--review-global` its own amber, which are also `--st-doing`'s and `--st-inferred`'s values, in
 * all seven. That is recorded rather than repaired, for the reason §2.5 records `--st-failed` =
 * `--st-overdue` in all seven: the colour is not what carries the distinction. A local mark draws
 * one edge and a global mark draws a doubled edge, which says the same thing in greyscale, and
 * moving the hex two per cent away would leave a reader looking at the same colour while letting
 * the census claim they were apart.
 *
 * IT PRINTS AND EXITS 0 unless the sentinel fails, in which case it exits 1. It is a measurement,
 * not a gate.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(root + 'src/web/tokens.css', 'utf8')

// The register is TypeScript. Read the token names out of it with the same runner the tests use,
// rather than keeping a second copy of the list here — a second copy is the defect this file
// exists to remove.
const tokens = JSON.parse(
  execFileSync(
    'npx',
    [
      'tsx',
      '-e',
      "import { tokensTheRegisterNames } from './src/shared/colourroles.ts'; console.log(JSON.stringify(tokensTheRegisterNames()))",
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim(),
)

const names = ['light', 'dark']
const starts = names
  .map((n) => ({
    n,
    i: n === 'light' ? css.indexOf(":root,\n:root[data-theme='light']") : css.indexOf(`:root[data-theme='${n}']`),
  }))
  .filter((x) => x.i >= 0)
  .sort((a, b) => a.i - b.i)

const firstAtRuleAfter = (from) => {
  const i = css.indexOf('\n@media', from)
  return i >= 0 ? i : css.length
}

const palettes = {}
for (let k = 0; k < starts.length; k++) {
  const body = css.slice(starts[k].i, k + 1 < starts.length ? starts[k + 1].i : firstAtRuleAfter(starts[k].i))
  const t = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) t[m[1]] = m[2]
  palettes[starts[k].n] = t
}

// The sentinel. These two values are declared inside their own palette's block; if the parser ran
// past a closing brace one of them would be the other's.
const sentinels = { light: '#432dd7', dark: '#7dbbf2' }
let bad = false
for (const [palette, want] of Object.entries(sentinels)) {
  const got = palettes[palette]?.['--accent']
  if (got !== want) {
    console.error(`SENTINEL FAILED: ${palette} --accent parsed as ${got}, declared ${want}`)
    bad = true
  }
}
if (bad) process.exit(1)

// Two of the names the register holds are not hues at all — `--st-failed-glyph` is a string and
// `--st-failed-weight` is a number, both declared once in the base block. They are channels, which
// is the point of them, and a census of colliding COLOURS has nothing to say about either.
const hues = tokens.filter((token) => Object.values(palettes).some((t) => t[token] !== undefined))
const channels = tokens.filter((token) => !hues.includes(token))
console.log(`tokens the register names: ${tokens.length}`)
console.log(`  of those, hues in the palettes: ${hues.length}`)
console.log(`  of those, non-colour channels: ${channels.length} (${channels.join(', ')})`)
console.log(`palettes read: ${Object.keys(palettes).length}`)
const missing = []
for (const [palette, t] of Object.entries(palettes)) {
  for (const token of hues) if (t[token] === undefined) missing.push(`${palette} ${token}`)
}
console.log(`every hue declared in every palette: ${missing.length === 0 ? 'yes' : 'NO — ' + missing.join(', ')}`)

// The two channels a colour never carries alone: contrast against every surface it may sit on, and
// which tokens collapse to one value.
const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const d = hex.slice(1)
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(d.slice(at, at + 2), 16) / 255)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

let pairs = 0
for (const [palette, t] of Object.entries(palettes)) {
  const byValue = {}
  for (const k of hues) if (t[k]) (byValue[t[k]] ??= []).push(k)
  const dup = Object.entries(byValue).filter(([, v]) => v.length > 1)
  console.log(`\n== ${palette} ==`)
  if (dup.length === 0) console.log('  (no token pair collides)')
  for (const [value, ks] of dup) {
    pairs += (ks.length * (ks.length - 1)) / 2
    console.log(`  ${value} = ${ks.join(' + ')}`)
  }
  // The two review accents are new in wave 14. Their contrast is what decides whether they may be
  // a default at all, so it is printed rather than assumed.
  for (const token of ['--review-local', '--review-global']) {
    if (t[token] && t['--panel']) {
      console.log(`  ${token} on --panel: ${ratio(t[token], t['--panel']).toFixed(2)}`)
    }
  }
}
console.log(`\ncolliding pairs across all palettes: ${pairs}`)
