// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE'S CONDITION IS DERIVED, AND THE SCREEN HAS TO SAY SO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ARE REALLY HOLDING
 * ---------------------------------------------------------------------------------------
 *
 * Two facts live on one panel and they are not the same fact:
 *
 *   LIFECYCLE — `data.state`, one of four words, written by a person, and usually absent. Absent is
 *   an ANSWER, not a default: Mole Office must never print `active` on a module nobody has posted a
 *   posture for.
 *
 *   CONDITION — counted from the checklist items, by nobody, on every read. It has to be named as
 *   counted, and it must not be served under a stored-sounding name — that constraint is the one
 *   thing `design/DECISIONS-PENDING.md` §4 fixes about the derive option, and it is the reason the
 *   condition wears no state chip and speaks in clauses rather than in a single word.
 *
 * And the third thing, which is what makes this honest rather than convenient: a module with no
 * parts has NOTHING to derive from, and the panel says that instead of naming a confident condition
 * from an empty record.
 *
 * The runner has no DOM, so the pure function is called directly and the panel is rendered to
 * static markup with react-dom/server — enough to check what must be in the words.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { MODULE_STATES } from '../src/shared/kinds.ts'
import { t } from '../src/shared/i18n.ts'
import type { ModulePart } from '../src/shared/types.ts'

type MV = typeof import('../src/web/components/ModuleView.tsx')
let mv: MV
/** The mode switch, imported after the window stand-in exists for the same reason ModuleView is. */
type MODE = typeof import('../src/web/lib/mode.ts')
let mode: MODE

beforeAll(async () => {
  // ModuleView reaches api.ts, which reads window.localStorage the moment it is imported.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  mv = await import('../src/web/components/ModuleView.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

/** The markup with the hoisted <style> blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

const noSave = async () => {
  throw new Error('the test never saves')
}

const part = (name: string, states: string[]): ModulePart => ({
  id: name,
  name,
  items: states.map((state, i) => ({ id: `${name}-${i}`, text: `item ${i}`, state: state as never })),
})

const render = (data: Record<string, unknown>) =>
  body(h(mv.ModuleView, { title: 'The checklist module', summary: null, data, relations: [], editable: true, onSave: noSave }))

/**
 * The same panel in Developer mode.
 *
 * The derived-versus-stored tag lives there now — the contract names it as one of the things that
 * belong in Inspect — so a test that only ever rendered Normal could no longer tell "moved" from
 * "deleted", and moved is what this pass did. Restored to Normal in the finally, because the mode
 * is module-level state and a leak would silently change every later test in this file.
 */
function renderInspect(data: Record<string, unknown>): string {
  mode.setMode('inspect')
  try {
    return render(data)
  } finally {
    mode.setMode('normal')
  }
}

// ============================================================================ the rule

describe('the condition is counted from the parts', () => {
  it('says something stopped short before anything else, because that is the actionable one', () => {
    const condition = mv.moduleCondition([part('a', ['done', 'doing', 'failed', 'todo'])])
    expect(condition.name).toBe('stopped-short')
    expect(condition.items).toBe(4)
    // Every classification is still counted, so the headline never hides the rest of the checklist.
    expect(condition.because).toContain('1 stopped short')
    expect(condition.because).toContain('1 finished')
  })

  it('reads `blocked` as stopped short, through the one classification table', () => {
    // Not a second opinion about what a state word means: `progressOf` is the same table the
    // attention list reads, so `blocked` cannot mean one thing there and another here.
    expect(mv.moduleCondition([part('a', ['blocked', 'done'])]).name).toBe('stopped-short')
  })

  it('separates every-item-finished from part-done from not-begun', () => {
    expect(mv.moduleCondition([part('a', ['done', 'done'])]).name).toBe('all-finished')
    expect(mv.moduleCondition([part('a', ['done', 'todo'])]).name).toBe('part-done')
    expect(mv.moduleCondition([part('a', ['todo', 'todo'])]).name).toBe('not-started')
    expect(mv.moduleCondition([part('a', ['doing', 'todo'])]).name).toBe('in-progress')
  })

  it('counts across every part, not one at a time', () => {
    const condition = mv.moduleCondition([part('a', ['done']), part('b', ['failed'])])
    expect(condition.parts).toBe(2)
    expect(condition.items).toBe(2)
    expect(condition.name).toBe('stopped-short')
  })
})

// ============================================================================ nothing to derive from

describe('a module with nothing to count says so', () => {
  it('names no condition at all when there are no parts', () => {
    const condition = mv.moduleCondition([])
    expect(condition.name).toBe('no-parts')
    expect(condition.phrase).toBe('nothing to work it out from')
  })

  it('still names no condition when the parts exist and hold no items', () => {
    // `parts: []` and `parts: [{items: []}]` are different records and both have nothing to count.
    // Neither may be answered with "not begun", which is a claim about work that was never made.
    const condition = mv.moduleCondition([part('a', []), part('b', [])])
    expect(condition.name).toBe('no-items')
    expect(condition.because).toContain('2 parts')
  })

  it('does not derive a confident condition from an empty record, on the page', () => {
    const html = render({ context: 'why it exists' })
    expect(html).toContain('nothing to work it out from')
    // The four confident answers must be nowhere near a module with no checklist.
    for (const phrase of ['not begun', 'work under way', 'every item finished', 'something stopped short']) {
      expect(html, `an empty module was given the condition "${phrase}"`).not.toContain(phrase)
    }
  })
})

// ============================================================================ named as derived

describe('the condition is named as derived, and never as stored', () => {
  const gripper = {
    context: 'Two-finger printed gripper.',
    parts: [part('Shape', ['done', 'failed', 'doing'])],
  }

  it('says on the page that it was worked out, from what, and that it is not stored', () => {
    const html = render(gripper)
    // THE EYEBROW SAYS IT IN NORMAL AND THE TAG SAYS IT IN DEVELOPER MODE. The tag was drawn in
    // both — `docs/UX-CONTRACT.md` lists derived-versus-stored diagnostics among the things that
    // belong in Inspect, by name — and it repeated the eyebrow directly above it. Finding 20 of the
    // language audit, 19 August 2026. Nothing is destroyed: it is one press away.
    expect(html).not.toContain('derived, not stored')
    expect(renderInspect(gripper)).toContain('derived, not stored')
    expect(html).toContain('worked out from the parts below')
    // THE COUNTS, one for each state the items are in, read in the page's own words.
    for (const progress of [t('g2b.progress.finished'), t('g2b.progress.stopped_short'), t('g2b.progress.in_flight')]) {
      expect(html).toContain(t('moduleView.condition.progressCount', { n: 1, progress }))
    }
    // "Nobody wrote this" used to be a third sentence under the arithmetic. It is carried by the
    // tag beside the phrase and by the tag's tooltip, which is where the words below come from --
    // so the page still says nobody wrote it, in one place instead of two. THE TAG IS IN DEVELOPER
    // MODE, so the tooltip is asserted there; in Normal the eyebrow says "worked out from the parts
    // below", which is the same fact in English. Finding 20, 19 August 2026.
    expect(renderInspect(gripper)).toContain('no agent wrote it')
  })

  it('gives it no state chip, because a chip is what a stored word wears in this app', () => {
    // The lifecycle beside it is a `px-chip-stored`. If the condition ever grew one, the two would
    // be indistinguishable and a counted answer would pass for an authored one.
    const html = render(gripper)
    const chips = html.split('px-chip-stored').length - 1
    expect(chips, 'the condition has been given the chip that means a stored word').toBe(1)
  })

  // THAT NO CONDITION PHRASE IS A LIFECYCLE WORD is pinned in tests/vocab-lifecycle.test.ts, beside
  // the four words it must not collide with. It is a fact about the vocabulary, so it lives with
  // the vocabulary rather than being asserted twice in two files that could then disagree.

  it('admits what it could not read rather than counting it silently', () => {
    const html = render({ parts: [part('Shape', ['done'])], summaryBlocks: 7 })
    expect(html).toContain(t('moduleView.condition.notCounted', { n: 1 }))
  })

  /**
   * THE PANEL USED TO CONTRADICT ITS OWN ARITHMETIC IN ONE PARAGRAPH.
   *
   * `parseItem` draws an item whose state word is not one of ITEM_STATES as `todo` and says so in
   * the alarm panel at the top. That item is on the checklist, so `moduleCondition` counts it like
   * every other one. The standing panel was handed `problems.length`, so under "Worked out from 1
   * checklist item in 1 part: 1 not started." it printed "1 thing in this record could not be read
   * at all and is counted in none of the above" — of that same item, which had just been counted.
   *
   * Nothing is hidden by the fix: the substitution is still named, in full, by the alarm panel that
   * the assertion below reads. What changed is that the derived condition now counts only what is
   * genuinely absent from its own arithmetic.
   */
  it('does not call an item it drew anyway uncounted, having just counted it', () => {
    const html = render({
      parts: [{ id: 'p1', name: 'Shape', items: [{ id: 'i1', text: 'Print it', state: 'finished' }] }],
    })
    // It was counted, as todo, which is what the arithmetic says.
    expect(html).toContain(t('moduleView.condition.progressCount', { n: 1, progress: t('g2b.progress.not_started') }))
    // And the substitution is named at the top of the page, in the alarm panel, not swallowed.
    expect(html).toContain('drawn as &quot;todo&quot; until it is fixed')
    // So the standing panel must not also claim it reached no count.
    expect(html, 'the panel counted the item and then said it was counted in nothing').not.toContain(
      t('moduleView.condition.notCounted', { n: 1 }),
    )
  })

  it('still counts a problem that really is in no tally, alongside one that is', () => {
    // Two problems, one of each kind: an unreadable `summaryBlocks` (in no tally, so it counts) and
    // an item drawn as todo (in the tally, so it does not). The sentence has to say one, not two.
    const html = render({
      summaryBlocks: 7,
      parts: [{ id: 'p1', name: 'Shape', items: [{ id: 'i1', text: 'Print it', state: 'finished' }] }],
    })
    expect(html).toContain('2 things in this record could not be read')
    expect(html).toContain(t('moduleView.condition.notCounted', { n: 1 }))
  })
})

// ============================================================================ the lifecycle beside it

describe('the lifecycle is the other fact, and absent is an answer', () => {
  it('draws no state when nobody wrote one, and does not pick a default', () => {
    const html = render({ context: 'c', parts: [part('Shape', ['done'])] })
    // The long form of this -- "Nobody has written a lifecycle word for this module" -- is on the
    // state panel at the top of the same page (RecordPage.tsx, pinned in tests/record-page.test.ts).
    // Here it is the empty-slot chip and nothing else. The stored spellings are never drawn in
    // monospace: `active`/`paused` are the database's words. Finding 19, 19 August 2026.
    expect(html).not.toContain('posture')
    for (const word of MODULE_STATES) expect(html).not.toContain(`<code>${word}</code>`)
    // Not one stored-word chip on the page: the empty-slot chip is what an unwritten lifecycle
    // wears, and `active` must not appear as though somebody had chosen it.
    expect(html).toContain('no state')
    expect(html).not.toContain('data-progress="in_flight"')
  })

  it('shows the word when somebody wrote one, and draws it as one a person chose', () => {
    const html = render({ context: 'c', state: 'stable', parts: [part('Shape', ['todo'])] })
    // THE CHIP AND THE COLUMN HEAD CARRY "a person wrote this", not a sentence naming the field
    // it is stored in. `Stored in data.state` was a raw field name printed in normal mode, which
    // the contract sends to Inspect -- and the record page's stored-fields panel lists it there.
    // What must not be lost is the distinction from the counted column beside it, and that is what
    // is asserted: the stored word wears the chip every stored state word in this app wears.
    // The head above it reads "Where you stand on this" rather than "Lifecycle — our posture toward
    // this subsystem".
    expect(html).toContain('Where you stand on this')
    expect(html).toContain('data-progress="finished"')
    expect(html).toContain('stable')
    expect(html).not.toContain('Nobody has written a lifecycle word')
  })

  it('keeps the two apart: a stable module can still have work outstanding', () => {
    // The whole reason they are two rows. A lifecycle word says what our posture is; it does not
    // say how much is done, and a page that let one stand for the other would be a second, coarser
    // copy of a figure counted from the checklist.
    const html = render({ context: 'c', state: 'stable', parts: [part('Shape', ['todo', 'failed'])] })
    expect(html).toContain('data-progress="finished"') // the stored word, `stable`
    expect(html).toContain('something stopped short') // what the checklist actually says
  })

  it('refuses a word that is not one of the four instead of drawing it as a lifecycle', () => {
    const parsed = mv.parseModule({ state: 'mostly done' })
    expect(parsed.lifecycle).toBeNull()
    expect(parsed.problems.join(' ')).toContain('"mostly done"')
    expect(parsed.problems.join(' ')).toContain('active, paused, stable, retired')
  })

  it('reads each of the four the schema publishes', () => {
    for (const word of MODULE_STATES) {
      expect(mv.parseModule({ state: word }).lifecycle).toBe(word)
      expect(mv.parseModule({ state: word }).problems).toEqual([])
    }
  })
})
