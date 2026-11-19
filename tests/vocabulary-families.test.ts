// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SECTION 4 OF THE BRIEF: THE SIX FAMILIES, AND THE WORDS THAT COME OUT OF THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 * `KIND_FAMILIES` used to hold five families, and one of them — `belief` — held four kinds under
 * one name. On the live corpus that was three settled choices, four open questions and seventeen
 * measurements on one page, and no name covers those without going abstract. It is now six: `work`,
 * `structure`, `decisions`, `findings`, `ideas`, `notes`.
 *
 * The keys are not only keys. `familyPath` in the router is `/${key}`, so a family key is an
 * address a person pastes to a colleague; the rail row, the page heading, the facet button on
 * Everything and the record breadcrumb all print the family's LABEL. Six surfaces read one table,
 * which is the arrangement this repository's recurring defect cannot get into — and this file pins
 * that the surfaces really do read it.
 *
 * Each test below was proved by mutation, with an unmutated control run first.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { KIND_FAMILIES } from '../src/shared/work.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type Parts = typeof import('../src/web/components/family/parts.tsx')

let recordPage: RecordPage
let parts: Parts

beforeAll(async () => {
  // The pages reach src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` at module
  // scope. The smallest stand-in that lets them load; nothing in it is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  recordPage = await import('../src/web/pages/RecordPage.tsx')
  parts = await import('../src/web/components/family/parts.tsx')
})

/** Markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

// ============================================================================ the table itself

// ============================================================================ the breadcrumb

describe('the record breadcrumb says where you are and offers two ways back', () => {
  /**
   * IT READ *all records / decision*, AND NEITHER CRUMB WAS A PLACE.
   *
   * The first went to `#/`, which is Needs you — not a list of records — and printed a third name
   * for the Everything page. The second printed the record's KIND, which is not a page and not a
   * list, and it was not a link, so pressing it did nothing at all.
   */
  it('leads with All records (the sidebar row\'s word), then the family, then this record', () => {
    const html = body(
      h(recordPage.Crumbs, { record: { kind: 'decision', title: 'Never change the GPU driver' } }),
    )
    expect(html).toContain('>All records<')
    expect(html).toContain('href="#/records"')
    // The family's own label out of KIND_FAMILIES, so the crumb, the rail row and the family
    // page's heading are one string.
    expect(html).toContain(`>${KIND_FAMILIES.decisions.label}<`)
    expect(html).toContain('href="#/decisions"')
    // A decision finally has a way back to the other decisions.
    expect(html).toContain('Never change the GPU driver')
    // The old words are gone from the screen.
    expect(html).not.toContain('all records')
  })

  it('ends on the record and does not offer it as somewhere to go', () => {
    // A breadcrumb ends where you are. The last crumb used to be the kind, which was also not a
    // link — but for the wrong reason: there was nowhere for it to point.
    const html = body(h(recordPage.Crumbs, { record: { kind: 'claim', title: 'A measured claim' } }))
    expect(html).toContain('<span class="rp-crumb-here">A measured claim</span>')
    expect(html).not.toContain('href="#/r/')
  })

  it('says so when no family covers the kind, rather than guessing one or dropping a crumb', () => {
    // Criterion change: 7FEOshq3mBGG keeps the raw kind out of the normal breadcrumb.
    const html = body(h(recordPage.Crumbs, { record: { kind: 'telemetry', title: 'A stray row' } }))
    expect(html).toContain('No reading group')
    expect(html).not.toContain('telemetry')
    expect(html).toContain('>All records<')
  })
})

// ============================================================================ the folds

describe('a collapsed section says what you get, not which fields are in it', () => {
  /**
   * THE LABELS WERE *"costs, what it is"*, *"measured on, method, confidence, what it is"* and
   * *"reopen when, turned down"* — stored field names, joined with commas, on the rows a person
   * reads most. docs/UX-CONTRACT.md: name a thing on screen after what it is to the reader.
   */
  const facts = [
    { label: 'costs', value: 'two days of somebody else’s time' },
    { label: 'what it is', value: 'the summary nobody needs while scanning' },
  ]

  it('prints the caller’s phrase on the front of the fold', () => {
    const html = body(h(parts.MoreFacts, { summary: 'What it costs, and what it is', facts }))
    expect(html).toContain('What it costs, and what it is')
    // The field names are still inside it. Nothing was deleted; it stopped being on the front.
    expect(html).toContain('>costs<')
    expect(html).toContain('two days of somebody else’s time')
  })

  it('still labels a fold whose caller gave no phrase, so nothing goes silent', () => {
    // The joined labels are the fallback and they stay the fallback. A fold with no words on it is
    // a fold nobody opens, which would hide a stored field somebody wrote — and that is worse than
    // an ugly label.
    const html = body(h(parts.MoreFacts, { facts }))
    expect(html).toContain('costs, what it is')
  })

  it('draws nothing at all when every fact inside it is empty', () => {
    // An empty fold and a missing one look identical, and only one of them is a record somebody has
    // not finished. This is the existing rule and the phrase must not have given it a way out.
    expect(body(h(parts.MoreFacts, { summary: 'Something', facts: [{ label: 'costs', value: null }] }))).toBe('')
  })
})

// ============================================================================ a flow run's place

/**
 * A FLOW RUN'S CRUMB NAMES THE RUN IT RECORDS, AND ITS TITLE IS IN THE PAGE'S LANGUAGE (wave 13k
 * round 42, on wave 13p's message 37_narX7Zh3s). Its crumb said "Reports and notes", which is the
 * family list it is filed in and not where it belongs, and its title read "Flow run" on a Chinese page.
 */
describe("a flow run's breadcrumb leads to its run, in the page's language", () => {
  const flowRun = { kind: 'flow_run', title: 'Flow run', data: { run: 'vq8lKlwGaCsu', stepsTaken: [] } }

  for (const language of ['en', 'zh'] as const) {
    it(`${language}: the middle crumb goes to the run, and the last one is the kind's own word`, async () => {
      const i18n = await import('../src/shared/i18n.ts')
      i18n.setWordLanguage(language)
      try {
        const html = body(h(recordPage.Crumbs, { record: flowRun }))
        const words = language === 'en' ? { run: 'The run it records', here: 'Flow run' } : { run: '它记录的运行', here: '流程记录' }
        expect(html).toContain(`href="#/r/vq8lKlwGaCsu">${words.run}<`)
        expect(html).toContain(`<span class="rp-crumb-here">${words.here}</span>`)
        expect(html, 'the crumb names the family list instead of the run').not.toContain('#/notes')
        expect(recordPage.titleToDraw(flowRun)).toBe(words.here)
        // A title somebody wrote is that person's words, and is drawn as stored.
        expect(recordPage.titleToDraw({ kind: 'flow_run', title: 'Round 42, by hand' })).toBe('Round 42, by hand')
      } finally {
        i18n.setWordLanguage('en')
      }
    })
  }
})
