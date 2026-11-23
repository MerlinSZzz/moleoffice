// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for the module page: ModuleView.tsx and the panels it exports for RecordPage.tsx.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node` — there is no DOM, and adding
 * one would be a new dependency this project has ruled out. So there are two kinds of test:
 *
 *   - `parseModule` is pure and is called directly. It is the whole substance of this view:
 *     everything the page draws is what parseModule decided it could read, and everything it
 *     could NOT read is a line in `problems` that the page prints. Nothing about it needs a
 *     browser.
 *   - the components are rendered to static markup with react-dom/server, which is enough to
 *     check what must be IN the markup: the full path, the word "Broken" next to a dead link,
 *     the restore button, every stored field of a kind with no bespoke view.
 *
 * What these do NOT cover: how it looks. Whether the severity column lines up and whether the
 * chart is legible in dark are screenshot questions, and they were checked that way rather
 * than papered over with a test that only pretends to look.
 *
 * THE ONE RULE EVERY TEST BELOW IS REALLY CHECKING: nothing is dropped quietly. A field of the
 * wrong shape, a key this view has never heard of, and a link whose far end was deleted all
 * have to end up as words on the page.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { ITEM_STATES, type Change, type ResolvedLink } from '../src/shared/types.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { filledWithChineseSpacing } from '../src/shared/spacing.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

// ModuleView reaches api.ts (for the link and restore calls), which reads window.localStorage
// the moment it is imported. This is the smallest stand-in that lets the module load; nothing
// here is under test.
type MV = typeof import('../src/web/components/ModuleView.tsx')
type SB = typeof import('../src/web/components/SummaryBlocks.tsx')
let mv: MV
let sb: SB

beforeAll(async () => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  mv = await import('../src/web/components/ModuleView.tsx')
  sb = await import('../src/web/components/SummaryBlocks.tsx')
})

/** The markup with the hoisted <style> blocks removed, so a class name mentioned in the CSS
 *  cannot be mistaken for evidence that something used it. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const noSave = async () => {
  throw new Error('the test never saves')
}

/**
 * DRAWN IN DEVELOPER MODE, where a module's claimed source, its `extra` and its undeclared keys are
 * drawn (plan 7FEOshq3mBGG, G2c). The mode goes back to normal afterwards.
 */
async function inDeveloperMode(draw: () => string): Promise<string> {
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('inspect')
  try {
    return draw()
  } finally {
    setMode('normal')
  }
}

// ============================================================================ parseModule

describe('parseModule reads what it can', () => {
  it('reads a well-formed module and reports nothing', () => {
    const parsed = mv.parseModule({
      context: 'why it exists',
      summary: 'the one-paragraph version',
      parts: [{ id: 'p1', name: 'Shape', items: [{ id: 'i1', text: 'Print it', state: 'failed', hours: 2 }] }],
      paths: [{ id: 'd1', label: 'report', path: `${THE_TEST_FIXTURE_ROOT}/x`, kind: 'dir' }],
      summaryBlocks: [{ id: 'b1', type: 'text', text: 'hello' }],
    })
    expect(parsed.problems).toEqual([])
    expect(parsed.context).toBe('why it exists')
    expect(parsed.summary).toBe('the one-paragraph version')
    expect(parsed.parts[0]?.items[0]?.state).toBe('failed')
    expect(parsed.paths[0]?.kind).toBe('dir')
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.extras).toEqual([])
  })

  it('reports an unrecognised state with the selected page words instead of drawing it as done', () => {
    const data = {
      parts: [{ id: 'p1', name: 'Shape', items: [{ id: 'i1', text: 'Print it', state: 'finished' }] }],
    }
    const key = 'moduleView.problem.badItemState'
    const values = {
      where: 'Part "Shape" item 1',
      state: JSON.stringify('finished'),
      allowed: ITEM_STATES.join(', '),
    }
    const fromWords = (template: string) =>
      template.replace(/\{(where|state|allowed)\}/g, (_match, name: keyof typeof values) => values[name])
    // A CHINESE WORD FILLS ITS VALUES BY THE OFFICE'S SPACING RULE (wave 13q's round 30).
    const fromChineseWords = (template: string) => filledWithChineseSpacing(template, values)

    // The item is still shown -- losing the text would be worse than showing it as todo --
    // but the substitution is stated in the selected language.
    try {
      setWordLanguage('en')
      const english = mv.parseModule(data)
      expect(english.parts[0]?.items[0]?.state).toBe('todo')
      expect(english.problems[0]).toBe(fromWords(en[key]))

      setWordLanguage('zh')
      const chinese = mv.parseModule(data)
      expect(chinese.parts[0]?.items[0]?.state).toBe('todo')
      expect(chinese.problems[0]).toBe(fromChineseWords(zh[key]))
    } finally {
      setWordLanguage('en')
    }
  })

  it('reports a path kind it does not recognise rather than folding it into "other"', () => {
    const parsed = mv.parseModule({ paths: [{ id: 'd1', path: '/tmp/x', kind: 'spreadsheet' }] })
    expect(parsed.paths[0]?.kind).toBe('other')
    expect(parsed.problems.join(' ')).toContain('"spreadsheet"')
  })

  it('refuses a path with nothing to point at, and says so', () => {
    const parsed = mv.parseModule({ paths: [{ id: 'd1', label: 'report' }] })
    expect(parsed.paths).toHaveLength(0)
    expect(parsed.problems.join(' ')).toContain('has no path')
  })

  it('names every field that is the wrong type', () => {
    const parsed = mv.parseModule({ context: 42, summary: [], parts: 'nope', paths: {}, summaryBlocks: 7 })
    expect(parsed.problems).toHaveLength(5)
    for (const field of ['`context`', '`summary`', '`parts`', '`paths`', '`summaryBlocks`']) {
      expect(parsed.problems.join(' ')).toContain(field)
    }
  })

  it('keeps a key it has never heard of rather than dropping it', () => {
    const parsed = mv.parseModule({ context: 'c', owner_initials: 'JC' })
    expect(parsed.extras).toEqual([['owner_initials', 'JC']])
  })

  it('passes an unknown block type through so SummaryBlocks can refuse it visibly', () => {
    // Checking the block type here as well as in SummaryBlocks is how the two end up
    // disagreeing. Only the structure is this file's business.
    const parsed = mv.parseModule({ summaryBlocks: [{ id: 'b', type: 'hologram' }] })
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.problems).toEqual([])
  })

  it('reports a block that is not an object, because nothing downstream can draw it', () => {
    const parsed = mv.parseModule({ summaryBlocks: ['just a string', { type: 'text', text: 'ok' }] })
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.problems.join(' ')).toContain('Summary block 1')
  })
})

// ============================================================================ ModuleView

describe('ModuleView draws what it read', () => {
  const gripper = {
    context: 'Two-finger printed gripper.',
    summary: 'v3 geometry is right; the blocker is print quality.',
    parts: [
      {
        id: 'p1',
        name: 'Tray clamp Shape',
        items: [
          { id: 'i1', text: 'Model the v3 shell', state: 'done', hours: 6 },
          { id: 'i2', text: 'Print v3 at effort 15', state: 'failed', note: 'Effort 15 broke the gripper', hours: 2 },
        ],
      },
    ],
    paths: [
      {
        id: 'd1',
        label: 'Tray clamp report, CAD and print logs',
        path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs`,
        kind: 'dir',
      },
    ],
    summaryBlocks: [{ id: 'b1', type: 'math', tex: 'F \\ge \\frac{m g}{2 \\mu}' }],
  }

  it('shows the checklist text, its state word and the reason it failed', () => {
    const html = body(h(mv.ModuleView, { title: 'Two-finger printed gripper', summary: null, data: gripper, relations: [], editable: true, onSave: noSave }))
    expect(html).toContain('Print v3 at effort 15')
    expect(html).toContain('Failed')
    expect(html).toContain('Effort 15 broke the gripper')
    expect(html).toContain('2h')
  })

  it('shows the path in full, with its copy press', () => {
    const html = body(h(mv.ModuleView, { title: 'Two-finger printed gripper', summary: null, data: gripper, relations: [], editable: true, onSave: noSave }))
    expect(html).toContain(`${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs`)
    expect(html).toContain('copy path')
  })

  it('renders the curated summary rather than the raw block', async () => {
    // MathText draws with KaTeX, and loads it the first time a formula is drawn. Static markup runs
    // no effects and waits for nothing, so the drawing code is loaded first, with the function
    // MathText itself uses.
    const { loadMathsDrawing } = await import('../src/web/components/MathText.tsx')
    await loadMathsDrawing()
    const html = body(h(mv.ModuleView, { title: 'Two-finger printed gripper', summary: null, data: gripper, relations: [], editable: true, onSave: noSave }))
    // KaTeX draws the fraction as markup: `mfrac` is its class for one. The LaTeX source survives
    // only as the accessible name, which is where it belongs -- a screen reader gets the
    // expression, the eye gets the typeset version, and neither gets a backslash where a fraction
    // should be.
    expect(html).toContain('class="mfrac"')
    expect(html).not.toContain(t('pageWords.MathText.001'))
    expect(html).toContain('aria-label="F \\ge \\frac{m g}{2 \\mu}"')
    expect(html).toContain('in one paragraph')
  })

  it('prints every problem at the top instead of showing a shorter list', async () => {
    const draw = () =>
      body(
        h(mv.ModuleView, {
          title: 'Two-finger printed gripper',
          summary: null,
          data: { ...gripper, parts: 'nope', extra_field: 1 },
          relations: [],
          editable: true,
          onSave: noSave,
        }),
      )
    const html = draw()
    expect(html).toContain('could not be read')
    expect(html).toContain('`parts` is present but is not a list.')
    // THE UNDECLARED KEY IS A STORED FIELD, drawn as stored in developer mode and not in normal mode.
    expect(html).not.toContain('extra_field')
    expect(await inDeveloperMode(draw)).toContain('extra_field') // shown as stored, underscore and all
  })

  // ASKED FOR THE SENTENCE THE PRODUCT ACTUALLY USES, not for a phrase copied out of it. These two
  // pinned the words "No curated summary yet", and `curated` was the storage layer's word for
  // hand-written blocks as against derived ones — it told a reader nothing, and finding 21 of the
  // language audit had it changed. Reading the same constant the component reads means the claim,
  // which is that a module with no long version SAYS SO, survives the next rewording too.
  it('has a sentence to say, so the two checks below are about words and not about nothing', () => {
    // WITHOUT THIS, THE PAIR BELOW CAN BE SATISFIED BY AN EMPTY STRING: `toContain('')` is true of
    // every page and `not.toContain('')` is true of none, so blanking the constant would turn one
    // red for the wrong reason and leave the other passing over a screen that says nothing at all.
    expect(sb.NO_SUMMARY.trim().split(/\s+/).length).toBeGreaterThan(3)
  })

  it('says a module has no parts rather than leaving the region blank', () => {
    const html = body(h(mv.ModuleView, { title: 'A module with only a context', summary: null, data: { context: 'c' }, relations: [], editable: true, onSave: noSave }))
    expect(html).toContain('has no parts yet')
    expect(html).toContain(sb.NO_SUMMARY)
  })

  it('does not claim a summary is missing when the paragraph is there', () => {
    const html = body(h(mv.ModuleView, { title: 'A module with one paragraph', summary: null, data: { summary: 'the paragraph' }, relations: [], editable: true, onSave: noSave }))
    expect(html).toContain('the paragraph')
    expect(html).not.toContain(sb.NO_SUMMARY)
  })

  it('puts where the module stands between the context and the checklist it was counted from', () => {
    // THE PLACEMENT IS THE ARGUMENT, not decoration. Context stays first, because it is the one
    // paragraph that says why any of the rest exists. The standing panel then sits DIRECTLY ABOVE
    // Parts, because the condition on it was counted from the panel underneath — a reader who
    // doubts the clause can check the arithmetic without leaving the screen. Below Parts it would
    // be a summary of something already scrolled past, which is how a derived figure stops being
    // checked and starts being believed.
    const html = body(h(mv.ModuleView, { title: 'Two-finger printed gripper', summary: null, data: gripper, relations: [], editable: true, onSave: noSave }))
    const context = html.indexOf('Context')
    const standing = html.indexOf('Where this module stands')
    const parts = html.indexOf('Parts')
    expect(context).toBeGreaterThan(-1)
    expect(standing).toBeGreaterThan(context)
    expect(parts).toBeGreaterThan(standing)
  })

  it('drops the state control on a deleted record', () => {
    const html = body(h(mv.ModuleView, { title: 'Two-finger printed gripper', summary: null, data: gripper, relations: [], editable: false, onSave: noSave }))
    // The editable chip is a <button aria-haspopup="menu">; the label form is a <span>.
    expect(html).not.toContain('aria-haspopup')
  })
})

// ============================================================================ links

describe('LinksPanel keeps a dead link visible', () => {
  const link = (over: Partial<ResolvedLink>): ResolvedLink => ({
    linkId: 'l1',
    type: 'consumes',
    label: 'consumes',
    isBacklink: false,
    inferred: false,
    other: { id: 'r2', kind: 'claim', title: 'Effort 12 grip force is enough', summary: 'retracted' },
    broken: false,
    ...over,
  })

  const render = (links: ResolvedLink[], editable = true) =>
    body(
      h(mv.LinksPanel, {
        recordId: 'r1',
        links,
        knownTitles: ['Tray clamp'],
        editable,
        onChanged: () => undefined,
      }),
    )

  it('shows a broken link with the word, the count and a way to undo the deletion', () => {
    const html = render([link({ broken: true })])
    expect(html).toContain('Effort 12 grip force is enough')
    expect(html).toContain('Broken')
    expect(html).toContain('1 broken')
    expect(html).toContain('Restore')
  })

  it('ranks the whole panel as an alarm when any link is broken, and not otherwise', () => {
    expect(render([link({ broken: true })])).toContain('data-rank="0"')
    expect(render([link({})])).toContain('data-rank="1"')
  })

  it('does not send the reader to a record that is no longer there', () => {
    // A broken row keeps its title as text. Linking to a deleted record would be a click that
    // lands on an error page, which is a worse answer than the sentence next to it.
    expect(render([link({ broken: true })])).not.toContain('href="#/r/r2"')
    expect(render([link({})])).toContain('href="#/r/r2"')
  })

  it('splits the two directions under Outgoing and Incoming', () => {
    const html = render([link({}), link({ linkId: 'l2', isBacklink: true, label: 'consumed by' })])
    expect(html).toContain('Outgoing')
    expect(html).toContain('Incoming')
  })

  it('says both empties in words', () => {
    const html = render([])
    expect(html).toContain('does not point at anything yet')
    expect(html).toContain('Nothing points at this record yet')
  })

  it('keeps the inferred fact when a link is both inferred and broken', () => {
    // `broken` takes the severity column, so `inferred` has to survive somewhere else.
    const html = render([link({ broken: true, inferred: true })])
    expect(html).toContain('Broken')
    expect(html).toContain('inferred')
  })

  it('offers no link form on a deleted record', () => {
    const html = render([], false)
    expect(html).not.toContain('Add link')
  })
})

// ============================================================================ other kinds

describe('FieldList shows a kind with no bespoke view honestly', () => {
  it('shows every stored key', () => {
    const html = body(
      h(mv.FieldList, {
        data: {
          state: 'blocked',
          command: 'make run-yumi-50mm-wizard',
          trials: 240,
          alternatives_rejected: ['swap to a dedicated IK service now'],
          measured: null,
          nested: { a: 1 },
        },
      }),
    )
    expect(html).toContain('command')
    expect(html).toContain('make run-yumi-50mm-wizard')
    expect(html).toContain('240')
    expect(html).toContain('swap to a dedicated IK service now')
    expect(html).toContain('&quot;a&quot;: 1') // the JSON, escaped by the renderer
  })

  it('draws a stored `state` with the same chip the checklists use', () => {
    const html = body(h(mv.FieldList, { data: { state: 'blocked' } }))
    expect(html).toContain('Blocked')
    expect(html).toContain('px-chip')
  })

  it('says a stored null is stored, not missing', () => {
    const html = body(h(mv.FieldList, { data: { measured_on: null } }))
    expect(html).toContain('stored empty, not missing')
  })

  it('says so when there are no fields at all', () => {
    expect(body(h(mv.FieldList, { data: {} }))).toContain('no extra fields')
  })
})

// ============================================================================ stored paragraphs

/**
 * THE PARAGRAPH BREAKS A READER WROTE HAVE TO REACH THE SCREEN.
 *
 * `FieldValue` rendered every stored string as one `<span class="prose wrap-anywhere">`. HTML
 * collapses whitespace, so the blank lines that ten live records hold in `data.body` and
 * `data.detail` were destroyed on the way to the page: note QC9gUUj2FqpC stores ten newlines and
 * arrived as one run-on block. Every kind with no bespoke view renders through here, so that was
 * most of the prose in the product. `max-width` is also a no-op on an inline span, which is why the
 * reading measure had never applied to any of it.
 *
 * The fixtures below are the shapes those records hold -- a wrapped bilingual paragraph, a blank
 * line, a second paragraph -- rather than a copy of the record, which the runner cannot reach.
 */
describe('a stored paragraph keeps the shape it was written in', () => {
  const paragraphs = (value: string): string[] => {
    const html = body(h(mv.FieldList, { data: { body: value } }))
    return [...html.matchAll(/<p class="[^"]*mv-prose[^"]*">([\s\S]*?)<\/p>/g)].map((m) => m[1] ?? '')
  }

  it('draws a blank line as a paragraph break, not as one run-on block', () => {
    const stored = 'The gel pads arrived warped.\n\nThe silicone order is still out, so this is parked.'
    expect(paragraphs(stored)).toEqual([
      'The gel pads arrived warped.',
      'The silicone order is still out, so this is parked.',
    ])
  })

  it('treats a newline inside a paragraph as whitespace, in both scripts', () => {
    // The stored data has none of these -- 84 newlines in the database and every one of them part
    // of a blank-line pair -- and that is exactly why a single one must never become a line break:
    // if one is ever written it is somebody's editor wrapping, at a width that is not this column.
    expect(paragraphs('the wrist\ncamera was not moved')).toEqual(['the wrist camera was not moved'])
    expect(paragraphs('视觉\n组')).toEqual(['视觉组'])
  })

  it('draws prose as blocks, because a measure on an inline span is a no-op', () => {
    const html = body(h(mv.FieldList, { data: { body: 'one.\n\ntwo.' } }))
    expect(html).toContain('<p class="prose wrap-anywhere mv-prose">')
    expect(html, 'a stored newline drawn as a break would pin the wrap column to the author\'s editor')
      .not.toContain('<br')
  })

  it('leaves a one-paragraph value as one paragraph', () => {
    expect(paragraphs('make run-yumi-50mm-wizard')).toEqual(['make run-yumi-50mm-wizard'])
  })
})
