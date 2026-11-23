// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELATED LISTS ON A MODULE'S AND A PIPELINE'S PAGE, AND WHAT A DECISION GOVERNS, ARE DRAWN IN WORDS.
 *
 * What is proved, rendered to markup with no server and no browser:
 *   1. a related row reached through a sub-module, a block or a run names it after the through word, and a row the
 *      scope holds itself and is also reached through a part names it after the also-through word;
 *   2. a row worked out from a decision's files carries the inferred word, with its sentence on the title;
 *   3. a reading that found nothing draws the none word, and a reading that could not run draws the not-read word;
 *   4. the list folds at the number it is given, says how many are behind the press, and counts what the door left
 *      out: the rows past the page and the replaced decisions;
 *   5. the governing lookup draws the inferred way with its own word, not the claims-it word;
 *   6. what a decision governs is drawn in its three parts: the pages, the files and what no page fits; an entry that
 *      could not be read is named for the reader by its part and its number counted from 1, never by a field path;
 *   7. a decision's Governs section is filled by its files or by what no page fits alone, and the files are not drawn
 *      again as a section of their own; a module declares a checklists section and a task does not;
 *   8. the governing lookup's labels name all the kinds of page or at most two, so a page of any kind can be looked up.
 *
 * Every word is read from the code: by the word keys each component exports, through `t()`, never a copied sentence.
 */
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { theKindsAPartListNames } from './the-page-kinds-a-sentence-names.ts'

type Related = typeof import('../src/web/components/RelatedHere.tsx')
type Governed = typeof import('../src/web/components/GovernedPlaces.tsx')
type Lookup = typeof import('../src/web/components/WhichDecisionsGovern.tsx')

const en = createI18n('en').t

/** A window, then the modules, in that order and freshly each time, as tests/absence-weight.test.ts does. */
async function boot(): Promise<{ related: Related; governed: Governed; lookup: Lookup }> {
  const store = new Map<string, string>([['mole-office.mode', 'normal']])
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
  vi.resetModules()
  return {
    related: (await import('../src/web/components/RelatedHere.tsx')) as Related,
    governed: (await import('../src/web/components/GovernedPlaces.tsx')) as Governed,
    lookup: (await import('../src/web/components/WhichDecisionsGovern.tsx')) as Lookup,
  }
}

beforeEach(() => {
  vi.resetModules()
})

const strip = (markup: string): string => markup.replace(/<style[\s\S]*?<\/style>/g, '')

/** What a reader sees: the markup with the tags taken out and the entities put back. */
function words(element: ReactElement): string {
  return strip(renderToStaticMarkup(element))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The markup with the entities put back, for reading an attribute. */
const markup = (element: ReactElement): string =>
  strip(renderToStaticMarkup(element)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

const WRIST = { id: 'mod-wrist', kind: 'module', title: 'Test: the wrist' }

function aRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'dec-1', kind: 'decision', title: 'Test: the lid stays shut', date: '2026-09-01', directly: true, through: [], inferred: false, ...over }
}

function anAnswer(rows: Record<string, unknown>[], over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scope: { id: 'mod-arm', kind: 'module', title: 'Test: the arm' },
    kind: 'decisions',
    rows,
    matched: rows.length,
    returned: rows.length,
    left: 0,
    offset: 0,
    limit: 25,
    replacedLeftOut: [],
    deletedLeftOut: 0,
    couldNotRead: [],
    ...over,
  }
}

function theList(related: Related, answer: Record<string, unknown>, fold = 8): ReactElement {
  return h(related.RelatedList, { reading: { status: 'ready', value: answer }, fold } as never)
}

describe('a related row says how it was reached', () => {
  it('1: names the part it came through after the through word, and after the also-through word when the scope holds it too', async () => {
    const { related } = await boot()
    const W = related.RELATED_WORDS
    const below = theList(related, anAnswer([aRow({ directly: false, through: [WRIST] })]))
    expect(words(below)).toContain(`${en(W.through)} ${WRIST.title}`)
    expect(markup(below)).toMatch(new RegExp(`href="[^"]*${WRIST.id}"`))
    expect(words(below)).not.toContain(en(W.alsoThrough))

    const both = theList(related, anAnswer([aRow({ directly: true, through: [WRIST] })]))
    expect(words(both)).toContain(`${en(W.alsoThrough)} ${WRIST.title}`)

    const own = words(theList(related, anAnswer([aRow()])))
    expect(own).toContain('Test: the lid stays shut')
    expect(own).not.toContain(en(W.through))
    expect(own).not.toContain(en(W.alsoThrough))
  })

  it('2: marks a row worked out from the files as inferred, with its sentence on the title', async () => {
    const { related } = await boot()
    const W = related.RELATED_WORDS
    const inferred = theList(related, anAnswer([aRow({ inferred: true })]))
    expect(words(inferred)).toContain(en(W.inferred))
    expect(markup(inferred)).toContain(`title="${en(W.inferredTitle)}"`)
    expect(words(theList(related, anAnswer([aRow()])))).not.toContain(en(W.inferred))
  })
})

describe('an empty list says which emptiness it is', () => {
  it('3: draws none when the reading found nothing, and not read when a way could not run', async () => {
    const { related } = await boot()
    const W = related.RELATED_WORDS
    const none = words(theList(related, anAnswer([])))
    expect(none).toContain(en(W.none))
    expect(none).not.toContain(en(W.notRead))

    const unread = words(theList(related, anAnswer([], { couldNotRead: ['The source index of this project is not built.'] })))
    expect(unread).toContain(en(W.notRead))
    expect(unread).not.toContain(en(W.none))

    const failed = words(h(related.RelatedList, { reading: { status: 'error', message: 'The office did not answer.' }, fold: 8 } as never))
    expect(failed).toContain(en(W.notRead))

    // ROWS AND A WAY NOT READ: the rows are drawn and the list still says a way was not read, so it is not taken for whole.
    const partly = words(theList(related, anAnswer([aRow()], { couldNotRead: ['The source index of this project is not built.'] })))
    expect(partly).toContain('Test: the lid stays shut')
    expect(partly).toContain(en(W.notRead))
  })
})

describe('a long list folds, and says what it left out', () => {
  it('4: folds at the number it is given, and counts the rows past the page and the replaced decisions', async () => {
    const { related } = await boot()
    const W = related.RELATED_WORDS
    const ten = Array.from({ length: 10 }, (_, i) => aRow({ id: `dec-${String(i)}`, title: `Test: decision ${String(i)}` }))
    const folded = theList(related, anAnswer(ten, { matched: 15, returned: 10, left: 5, replacedLeftOut: ['dec-old-1', 'dec-old-2'] }), 8)
    const drawn = markup(folded)
    expect(drawn.match(/class="rel-row"/g) ?? []).toHaveLength(8)
    const text = words(folded)
    expect(text).toContain(en(W.more, { n: 2 }))
    expect(text).toContain(en(W.left, { n: 5 }))
    expect(text).toContain(en(W.replacedLeftOut, { n: 2 }))

    const short = words(theList(related, anAnswer([aRow()]), 8))
    expect(short).not.toContain(en(W.more, { n: 0 }))
    expect(short).not.toContain(en(W.left, { n: 0 }))
  })
})

describe('the governing lookup draws the inferred way', () => {
  it('5: in its own words, naming the module and the claim, apart from the claims-it words', async () => {
    const { lookup } = await boot()
    const module = { id: 'mod-feeder', title: 'Test: the feeder' }
    const inferred = lookup.howItReachesInWords({ place: { path: 'src/feeder/a.ts' }, reaches: 'inferred', module, claim: 'src/feeder' } as never)
    expect(inferred).toBe(en(lookup.INFERRED_REACH_WORD, { place: 'src/feeder/a.ts', module: module.title, claim: 'src/feeder' }))
    const claims = lookup.howItReachesInWords({ place: { path: 'src/feeder/a.ts' }, reaches: 'claims-it', module } as never)
    expect(inferred).not.toBe(claims)
  })
})

describe('what a decision governs, in words', () => {
  it('6: draws the pages, the whole project, the files and what no page fits, and names a skipped entry by its part and number', async () => {
    const { governed } = await boot()
    const G = governed.GOVERNED_WORDS
    const drawn = h(governed.GovernedPlaces, {
      governs: [{ record: 'mod-lid' }, 42],
      governsFiles: ['src/lid/hinge.ts', 7],
      nothingFits: [{ missing: 'module', what: 'Test: the printer profiles' }],
      titleById: new Map([['mod-lid', 'Test: the lid']]),
    } as never)
    const text = words(drawn)
    expect(text).toContain('Test: the lid')
    expect(markup(drawn)).toMatch(/href="[^"]*mod-lid"/)
    expect(text).toContain('src/lid/hinge.ts')
    expect(text).toContain(en(G.nothingFits, { what: 'Test: the printer profiles' }))
    expect(text).toContain(en(G.skippedEntry, { n: 2, part: en(G.partRecords) }))
    expect(text).toContain(en(G.skippedEntry, { n: 2, part: en(G.partFiles) }))
    expect(markup(drawn)).not.toContain('governs[')
    expect(markup(drawn)).not.toContain('governsFiles[')

    const whole = words(h(governed.GovernedPlaces, { governs: [{ wholeProject: true }], governsFiles: 'src/lid', nothingFits: undefined } as never))
    expect(whole).toContain(en(G.wholeProject))
    expect(whole).toContain(en(G.skippedField, { part: en(G.partFiles) }))
  })

  it('6b: the one reader says which part and which entry, counted from 1, beside the field path', async () => {
    const { theGovernedPlaces } = await import('../src/shared/governs.ts')
    const parts = theGovernedPlaces([{ record: 'mod-lid' }, 42], ['src/lid/hinge.ts', 7])
    expect(parts.skipped).toMatchObject([
      { at: 'governs[1]', part: 'governs', entry: 2 },
      { at: 'governsFiles[1]', part: 'governsFiles', entry: 2 },
    ])
    expect(theGovernedPlaces('not a list', 'nor this').skipped).toMatchObject([
      { at: 'governs', part: 'governs', entry: null },
      { at: 'governsFiles', part: 'governsFiles', entry: null },
    ])
  })

  it('7: a decision with only files, or only what no page fits, fills its Governs section, and a module declares a checklists section', async () => {
    const sections = await import('../src/shared/sections.ts')
    const { GOVERNS_FIELD } = await import('../src/shared/governs.ts')
    const { GOVERNS_FILES_FIELD, NOTHING_FITS_FIELD } = await import('../src/shared/what-a-record-names.ts')
    const keys = (data: Record<string, unknown>): string[] =>
      sections.filledBodySections({ kind: 'decision', data } as never).map((section) => section.key)

    const filesOnly = keys({ option_taken: 'Test', because: 'Test', [GOVERNS_FILES_FIELD]: ['src/lid/hinge.ts'] })
    expect(filesOnly).toContain(GOVERNS_FIELD)
    expect(filesOnly).not.toContain(GOVERNS_FILES_FIELD)

    const nothingFitsOnly = keys({ option_taken: 'Test', because: 'Test', [NOTHING_FITS_FIELD]: [{ missing: 'module', what: 'Test: the printer profiles' }] })
    expect(nothingFitsOnly).toContain(GOVERNS_FIELD)
    expect(nothingFitsOnly).not.toContain(NOTHING_FITS_FIELD)

    expect(keys({ option_taken: 'Test', because: 'Test' })).not.toContain(GOVERNS_FIELD)

    expect(sections.titleOfSection('module', sections.CHECKLISTS_ABOUT_KEY)).not.toBeNull()
    expect(sections.titleOfSection('task', sections.CHECKLISTS_ABOUT_KEY)).toBeNull()
  })
})

describe("the governing lookup's labels", () => {
  it('8: name all the kinds of page or at most two, so a page of any kind can be looked up', async () => {
    const { lookup } = await boot()
    const labels = Object.values(lookup.LOOKUP_WORDS)
    expect(labels.length).toBeGreaterThan(0)
    for (const key of labels) {
      expect(await theKindsAPartListNames(en(key)), en(key)).toEqual([])
    }
  })
})
