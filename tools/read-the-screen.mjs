// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READ EVERY PAGE AND REPORT THE MACHINE WORDS A PERSON CAN SEE ON IT.
 *
 * The gate in tests/ reads source and renders components. This opens the running product, at two
 * widths, in Normal mode, and reads the text off the page — which is the only instrument that
 * answers for a word arriving through the server, through three helpers and through a fold.
 *
 *     node tools/read-the-screen.mjs <base-url> [--widths 1440,390]
 *
 * It prints, per page and width, every run of visible text holding a leak as tools/screen-leaks.mjs
 * reads one: an internal name, an ISO week, a record id or a path into a record anywhere, and a stored
 * machine word in a run that is not a sentence (problem LDFm8FKJURox). It writes nothing and changes
 * nothing.
 *
 * WHAT IT LEAVES OUT, and each one is a thing a person WROTE rather than the interface talking:
 * the classes tests/drawn.ts lists as content (CONTENT_CLASSES, read from there, not copied), code and
 * file paths, which hold such shapes legitimately, and the record id shown on
 * every record's page (rid-text). Everything else is the product's own words.
 *
 * WHAT IT CANNOT SEE: a leak that is none of these shapes and no stored word, a fold that is closed,
 * and a page state that needs a press. A run with nothing found is not a page shown to be clean.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { waitForThePage } from './the-page-is-ready.mjs'
import { LEAK_SHAPES, leaksIn } from './screen-leaks.mjs'

const base = process.argv[2]
if (base === undefined) {
  console.error('Give the base URL of a running Mole Office, e.g. http://127.0.0.1:44437')
  process.exit(2)
}
const widths = (process.argv.includes('--widths')
  ? process.argv[process.argv.indexOf('--widths') + 1]
  : '1440,390'
)
  .split(',')
  .map((n) => Number(n))

// The pages, read from the router so this list cannot fall behind it.
// THE ADDRESSES AND THE ROUTER ARE READ AS ONE SOURCE, and that is not laziness. The address
// grammar — FLAT_ROUTES and the `Route` union — moved to src/shared/addresses.ts on 9 September 2026
// so the write door could read it too (criterion M97); `recordPath` and the other builders stayed in
// src/web/components/router.tsx. Every pattern below wants one string, and the two files are one
// declaration split by which program may import it.
const routerSource = ['../src/shared/addresses.ts', '../src/web/components/router.tsx']
  .map((file) => readFileSync(fileURLToPath(new NodeURL(file, import.meta.url)), 'utf8'))
  .join('\n\n')
const block = routerSource.match(/const FLAT_ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/)
if (block === null) throw new Error('Could not find FLAT_ROUTES in src/shared/addresses.ts')
const pages = [{ name: 'home', address: '#/' }]
// A KEY IN QUOTES IS STILL A KEY. `'agent-use'` cannot be written bare — a hyphen is not allowed
// in a JavaScript identifier — and the pattern used to require a bare one, so the page it names
// would have been skipped in silence and the review would have photographed a shorter app while
// reporting success. The coverage check below is what caught it; the quote is now optional here.
for (const found of block[1].matchAll(/^\s*'?([a-zA-Z0-9_$-]+)'?:\s*'([^']+)'/gm)) {
  pages.push({ name: found[1], address: `#/${found[2]}` })
}
for (const family of ['work', 'findings', 'ideas', 'notes', 'structure']) {
  pages.push({ name: `family-${family}`, address: `#/f/${family}` })
}

/**
 * THE CLOSED VOCABULARY, and nothing wider.
 *
 * An earlier draft matched any lowercase token with an underscore and reported 370 runs, almost
 * all of them WORDS SOMEBODY WROTE — a decision naming `agent_messages`, a session row printing the
 * command that started it, a report quoting a column name. Those are content, not the interface
 * talking, and counting them buries the thing being looked for. So this is the five vocabularies
 * only, read out of the shared declarations at run time.
 */
const { RECORD_KINDS, ACTOR_TYPES, LINK_TYPES } = await import('../src/shared/types.ts')
const { PROGRESS, STATE_MEANING } = await import('../src/shared/work.ts')
const words = new Set([
  ...RECORD_KINDS,
  ...ACTOR_TYPES,
  ...Object.keys(LINK_TYPES),
  ...PROGRESS,
  ...Object.keys(STATE_MEANING),
])
// Only the ones a reader could not mistake for English. `human`, `block` and `note` are stored
// words too and they are ordinary words as well; a page saying "note" is not this defect.
for (const word of [...words]) if (!word.includes('_') && word !== 'todo') words.delete(word)
// THE CONTENT CLASSES AND THE SENTENCE TEST ARE THE GATE'S OWN, read from tests/, so the two cannot drift: until
// 5 October 2026 this file kept its own copy of the list, which had fallen behind tests/drawn.ts.
const { CONTENT_CLASSES } = await import('../tests/drawn.ts')
const { readsAsASentence } = await import('../tests/sentences.ts')
const skip = [...CONTENT_CLASSES, 'px-note-body', 'px-block-body', 'px-code', 'px-path', 'px-sr', 'rid-text']

const browser = await chromium.launch()
const findings = []
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } })
  await context.addInitScript(() => {
    // Normal mode, and the workspace the corpus is in. Both are read at module scope.
    window.localStorage.setItem('mole-office.mode', 'normal')
    window.localStorage.setItem('mole-office.workspace', 'panelx')
  })
  const page = await context.newPage()
  for (const one of pages) {
    await page.goto(`${base}/${one.address}`)
    await waitForThePage(page)
    await page.waitForTimeout(500)
    const runs = await page.evaluate((skip) => {
      const out = []
      const walk = (node) => {
        if (node.nodeType === 3) {
          const text = node.textContent.trim()
          if (text !== '') out.push(text)
          return
        }
        if (node.nodeType !== 1) return
        const tag = node.tagName.toLowerCase()
        if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'textarea') return
        if (skip.some((c) => node.classList.contains(c))) return
        for (const child of node.childNodes) walk(child)
      }
      walk(document.body)
      return out
    }, skip)
    for (const run of runs) {
      const hits = leaksIn(run, words, readsAsASentence)
      if (hits.length > 0) findings.push({ width, page: one.name, words: hits.map((hit) => `${hit.kind}: ${hit.piece}`), run: run.slice(0, 200) })
    }
  }
  await context.close()
}
await browser.close()

console.log(`pages read: ${pages.length}, widths: ${widths.join(', ')}, mode: normal`)
console.log(`looked for: ${LEAK_SHAPES.map((shape) => shape.kind).join(', ')}, anywhere; and ${String(words.size)} stored words, in runs that are not sentences`)
// NOTHING FOUND IS NOT A CLEAN PAGE (problem LDFm8FKJURox): it is what these shapes and words found, on the pages as
// they stood, with their folds closed.
if (findings.length === 0) console.log('none of these was found on the pages as read; what this instrument cannot see is listed at the top of tools/read-the-screen.mjs.')
for (const f of findings) console.log(`  ${f.page} @${f.width}  [${f.words.join(', ')}]  ${f.run}`)
console.log(`total runs holding one: ${findings.length}`)
