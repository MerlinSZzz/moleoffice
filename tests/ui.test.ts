// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Tests for the component library in src/web/components/ui.tsx.
 *
 * WHY THEY LOOK LIKE THIS. There is no DOM in this repository's test runner -- the environment
 * is `node`, there is no jsdom, and adding one would mean a new dependency this project has
 * ruled out. So these tests render the components to static markup with react-dom/server and
 * read the result. That covers exactly what matters most here and cannot be checked by eye on a
 * screenshot: that the affordance grammar is in the MARKUP (underline at rest, enclosure,
 * inertness), that the severity column is always reserved, that every state carries a word and a
 * distinct shape, that mistakes throw instead of rendering something plausible and wrong, and
 * that the stylesheet contains no colour or size that a theme swap cannot reach.
 *
 * What they do NOT cover: pressing keys. The menu's Escape/1-5/arrow behaviour needs a real DOM
 * and is verified by hand and by screenshot instead. That gap is stated here rather than papered
 * over with a test that only pretends to press a key.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { KIND_FAMILIES } from '../src/shared/work.ts'

type UI = typeof import('../src/web/components/ui.tsx')
let ui: UI

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as.
  // The component library imports it for one error helper, so the import needs a window to
  // exist. This is the smallest stand-in that lets the module load; nothing here is under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  ui = await import('../src/web/components/ui.tsx')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

async function renderInDeveloper(el: React.ReactElement): Promise<string> {
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('inspect')
  try { return render(el) } finally { setMode('normal') }
}

// --------------------------------------------------------------------------- the token contract

// --------------------------------------------------------------------------- the product mark

/**
 * ONE MARK, DRAWN IN ONE PLACE, AND TOLD APART BY MORE THAN A COLOUR.
 *
 * The mark had drifted to a single flat accent-coloured "Mole Office" in the frame, with a second
 * forgotten copy of its two rules in styles.css for a bar nothing renders. What is checked here is
 * what a screenshot cannot check for every theme at once: that the X is distinguished on three
 * channels rather than on colour, which is the one channel the mono theme and a greyscale print
 * both take away; and that no font was imported to draw it with.
 */
describe('the Mole Office wordmark', () => {
  /** The declarations of one rule in the component stylesheet. */
  const rule = (selector: string): string =>
    new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(ui.UI_CSS)?.[1] ?? ''

  it('draws the name whole, with Mole as its own element', () => {
    const html = render(h(ui.Wordmark, {}))
    // The name, exactly as it is written everywhere else, to a reader and to a screen reader:
    // nothing separates the two halves but the space that is part of the name.
    expect(html.replace(/<[^>]+>/g, '')).toBe('Mole Office')
    // The logo joined the mark on 4 September 2026, at the owner's asking, and it comes before the
    // word. Since 25 September 2026 it is the owner's PNG logo, an image whose name is its alt text, so it
    // adds no text to the reading above.
    expect(html).toMatch(/<span class="px-wordmark"><img[^>]*class="px-wordmark-icon"/)
    expect(html).toContain('<span class="px-wordmark-lead">Mole</span> Office</span>')
  })

  it('collapses to the two initials from the same component, not a second logo', () => {
    const short = render(h(ui.Wordmark, { form: 'short' }))
    expect(short.replace(/<[^>]+>/g, '')).toBe('MO')
    expect(short).toMatch(/<span class="px-wordmark"><img[^>]*class="px-wordmark-icon"/)
    expect(short).toContain('<span class="px-wordmark-lead">M</span>O</span>')
  })

  it('draws the collapsed rail an icon and no letters at all', () => {
    // W5, THE RULE: when the rail is narrowed the top of it shows the icon
    // and no "MO" text. The icon form is one drawing of the mark, and it carries no letters.
    const icon = render(h(ui.Wordmark, { form: 'icon' }))
    expect(icon).toMatch(/<span class="px-wordmark"><img[^>]*class="px-wordmark-icon"/)
    expect(icon).not.toContain('px-wordmark-lead')
    expect(icon.replace(/<[^>]+>/g, '').trim()).toBe('')
  })

  it('tells the lead apart on three channels, so it survives losing the colour', () => {
    // The mono theme sets --accent to the text colour deliberately, and greyscale takes the colour
    // everywhere. Weight and size are what is left, so the lead carries all three and not just a hue.
    const word = rule('.px-wordmark')
    const lead = rule('.px-wordmark-lead')
    expect(word).toContain('color: var(--text)')
    expect(word).toContain('font-weight: 600')
    expect(lead).toContain('color: var(--accent)')
    expect(lead).toMatch(/font-weight:\s*[789]00/)
    // 4-8% larger, in em so the ratio holds at every size the mark is drawn at. The range was
    // 8-12% while the highlighted half was the single letter X. It is a whole word now, and a word
    // set 12% larger than the word beside it reads as a typographic mistake rather than as a mark.
    const size = Number(/font-size:\s*([\d.]+)em/.exec(lead)?.[1])
    expect(size).toBeGreaterThanOrEqual(1.04)
    expect(size).toBeLessThanOrEqual(1.08)
  })

  it('imports no font for it and takes the interface font role', () => {
    // --font-ui is a role a preset re-aims. A mark set in its own family would be the one piece of
    // the interface a font preset could not reach.
    expect(rule('.px-wordmark')).toContain('font-family: var(--font-ui)')
    expect(ui.UI_CSS).not.toContain('@font-face')
    expect(ui.UI_CSS).not.toContain('@import')
  })
})

// --------------------------------------------------------------------------- one vocabulary

// --------------------------------------------------------------------------- states

describe('states carry more than colour', () => {
  it('gives every state a word', () => {
    for (const state of ui.PANEL_STATES) {
      expect(ui.STATE_WORDS[state].length).toBeGreaterThan(0)
    }
  })

  it('gives every state a different shape', () => {
    const shapes = ui.PANEL_STATES.map((state) => render(h(ui.StateGlyph, { state })))
    expect(new Set(shapes).size).toBe(ui.PANEL_STATES.length)
  })

  it('shows the word, the shape and the state name together in a chip', () => {
    const html = render(h(ui.StateChip, { state: 'failed' }))
    expect(html).toContain('Failed')
    expect(html).toContain('<svg')
    expect(html).toContain('data-state="failed"')
  })

  it('marks severe states so the row can spine them, and leaves work-in-progress alone', () => {
    expect(ui.isSevere('failed')).toBe(true)
    expect(ui.isSevere('broken')).toBe(true)
    expect(ui.isSevere('overdue')).toBe(true)
    // If `doing` were severe the tint would mean "in progress" and people would learn to
    // ignore it, which is how a real failure becomes invisible.
    expect(ui.isSevere('doing')).toBe(false)
    expect(ui.isSevere('done')).toBe(false)
  })

  it('points a chip at the semantic tokens for its own state', () => {
    const html = render(h(ui.StateChip, { state: 'overdue' }))
    expect(html).toContain('var(--st-overdue)')
    expect(html).toContain('var(--st-overdue-bg)')
    expect(html).toContain('var(--st-overdue-line)')
  })
})

// --------------------------------------------------------------------------- the state chip

describe('StateChip', () => {
  it('is an inert label with no change handler', () => {
    const html = render(h(ui.StateChip, { state: 'done' }))
    expect(html).toContain('<span')
    expect(html).not.toContain('<button')
  })

  it('is a menu button when it can write', () => {
    const html = render(h(ui.StateChip, { state: 'todo', onChange: () => undefined }))
    expect(html).toContain('<button')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('tells the reader the 1-5 accelerators exist', () => {
    const html = render(h(ui.StateChip, { state: 'todo', onChange: () => undefined }))
    expect(html).toContain('press 1 to 5')
  })

  it('falls back to a label when read only, even with a handler', () => {
    const html = render(h(ui.StateChip, { state: 'doing', onChange: () => undefined, readOnly: true }))
    expect(html).not.toContain('<button')
  })

  it('refuses to make a computed state editable', () => {
    // `broken` is worked out from a deleted target. Offering a menu would let the UI write a
    // value the server would never agree with.
    expect(() => render(h(ui.StateChip, { state: 'broken', onChange: () => undefined }))).toThrow(/computed state/)
  })

  it('shows a count in place of the word when asked', () => {
    const html = render(h(ui.StateChip, { state: 'overdue', label: 'Overdue 4d' }))
    expect(html).toContain('Overdue 4d')
  })
})

// --------------------------------------------------------------------------- rows

describe('Row', () => {
  it('reserves the severity column even when there is no state', () => {
    // This is what makes stuck work read as a vertical line: the column never disappears, so
    // titles stay aligned whether or not their neighbour has a chip.
    const html = render(h(ui.Row, { title: 'A row with nothing wrong with it' }))
    expect(html).toContain('px-row-sev')
  })

  it('underlines a navigating title at rest, not only on hover', () => {
    const html = render(h(ui.Row, { title: 'Mount design', href: '#/r/abc' }))
    expect(html).toContain('class="px-row-title px-nav"')
    expect(html).toContain('href="#/r/abc"')
    // The underline itself is a resting rule, with hover only thickening it.
    expect(ui.UI_CSS).toMatch(/\.px-nav\s*\{[^}]*text-decoration:\s*underline/)
  })

  it('leaves an inert title bare', () => {
    const html = render(h(ui.Row, { title: 'Just a fact' }))
    expect(html).toContain('class="px-row-title"')
    expect(html).not.toContain('px-nav')
  })

  it('stays a real link rather than a click handler, so middle-click still works', () => {
    const html = render(h(ui.Row, { title: 'Mount design', href: '#/r/abc' }))
    expect(html).toContain('<a ')
    expect(html).not.toContain('role="button"')
  })

  it('makes a click-only row reachable from the keyboard', () => {
    const html = render(h(ui.Row, { title: 'Expand', onClick: () => undefined }))
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
  })

  it('tints and spines a severe row, and leaves a healthy one plain', () => {
    expect(render(h(ui.Row, { title: 'x', state: 'failed' }))).toContain('data-severe="1"')
    expect(render(h(ui.Row, { title: 'x', state: 'done' }))).not.toContain('data-severe="1"')
  })

  it('lets a caller declare its own columns', () => {
    const html = render(h(ui.Row, { title: 'x', cols: '80px minmax(0,1fr) 56px' }))
    expect(html).toContain('--cols:80px minmax(0,1fr) 56px')
  })
})

// --------------------------------------------------------------------------- panels

describe('Panel', () => {
  it('spines and tints an alarm panel with a state token, not a colour', () => {
    const html = render(h(ui.Panel, { declares: { surface: null }, title: 'Owed and broken', rank: 0, children: 'x' }))
    expect(html).toContain('data-rank="0"')
    expect(html).toContain('var(--st-failed)')
  })

  it('lets the alarm say which state it is alarmed about', () => {
    const html = render(h(ui.Panel, { declares: { surface: null }, title: 'Overdue', rank: 0, tone: 'overdue', children: 'x' }))
    expect(html).toContain('var(--st-overdue)')
  })

  it('leaves a normal panel untinted', () => {
    const html = render(h(ui.Panel, { declares: { surface: null }, title: 'In flight', children: 'x' }))
    expect(html).toContain('data-rank="1"')
    expect(html).not.toContain('--px-tone')
  })
})

// --------------------------------------------------------------------------- buttons

describe('Btn', () => {
  it('renders each variant as a data attribute so the CSS, not JavaScript, decides how it looks', () => {
    for (const variant of ['primary', 'secondary', 'danger', 'ghost'] as const) {
      expect(render(h(ui.Btn, { variant, children: 'Go' }))).toContain(`data-variant="${variant}"`)
    }
  })

  it('keeps a disabled button in the tab order and able to explain itself', () => {
    const html = render(h(ui.Btn, { disabled: true, reason: 'Add link needs a title.', children: 'Add link' }))
    expect(html).toContain('aria-disabled="true"')
    // The real `disabled` attribute would take it out of the tab order and it could never be
    // asked why it is off.
    expect(html).not.toMatch(/\sdisabled=""/)
  })

  it('draws a press that is off with no reason as off, and says so without being pressed', async () => {
    // IT THREW WHILE DRAWING UNTIL NOVEMBER 2026, and a throw while drawing stops the whole page. So
    // each press that was off only while its own answer was awaited stopped its page when pressed.
    const { t } = await import('../src/shared/i18n.ts')
    const offWithNoReason = t('sheet.button.offWithNoReason')
    const html = render(h(ui.Btn, { disabled: true, children: 'Add link' }))
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain(offWithNoReason)
    // A press that gives its reason says that reason when pressed, and never this line.
    expect(render(h(ui.Btn, { disabled: true, reason: 'Add link needs a title.', children: 'Add link' }))).not.toContain(offWithNoReason)
  })

  it('announces a write in flight to a screen reader as well as drawing it', () => {
    const html = render(h(ui.Btn, { pending: true, children: 'Save' }))
    expect(html).toContain('data-pending="1"')
    expect(html).toContain('saving')
  })
})

// --------------------------------------------------------------------------- tags

describe('Tag', () => {
  it('shows a record kind', () => {
    expect(render(h(ui.Tag, { kind: 'module' }))).toContain('module')
  })

  it('prints the word a person reads, never the word Mole Office stores', () => {
    // "block" is stored and "step" is what a pipeline is drawn as; "wanna_try" holds an underscore
    // and nobody says it out loud. The choice is `kindWord`'s, in src/web/lib/words.ts, so the same
    // stored word cannot come out one way here and another way on a page.
    const step = render(h(ui.Tag, { kind: 'block' }))
    expect(step).toContain('step')
    expect(step).not.toContain('block<')
    expect(render(h(ui.Tag, { kind: 'wanna_try' }))).toContain('worth a try')
  })

  it('marks a kind Mole Office has no word for instead of drawing it as normal', () => {
    const html = render(h(ui.Tag, { kind: 'mystery' }))
    expect(html).toContain('data-tone="warn"')
    // Said out loud in the tag itself, not only in a title a phone cannot show.
    expect(html).toContain('unknown kind: mystery')
    // And no family, because guessing which of the six an unrecognised kind belongs to is the
    // silent substitution the invariants forbid.
    expect(html).not.toContain('data-family')
  })

  it('gives a kind its family as a glyph and a rail, so sixteen kinds read as six families', () => {
    for (const [kind, family] of [
      ['task', 'work'],
      ['module', 'structure'],
      ['decision', 'decisions'],
      ['claim', 'findings'],
      ['idea', 'ideas'],
      ['note', 'notes'],
    ] as const) {
      const html = render(h(ui.Tag, { kind }))
      expect(html, `${kind} has no family`).toContain(`data-family="${family}"`)
      expect(html, `${kind} has no glyph`).toContain('<svg')
    }
    // The rail is drawn from the stylesheet, at the width every other rail in the product uses, so
    // the high-contrast theme's doubled rail reaches it.
    expect(ui.UI_CSS).toMatch(/\.px-tag\[data-family\][^{]*\{[^}]*border-left: var\(--rail\)/)
  })

  it('gives the six families six different silhouettes, so greyscale still separates them', () => {
    const glyphs = (['task', 'module', 'decision', 'claim', 'idea', 'note'] as const).map(
      (kind) => (/<svg[^>]*>(.*?)<\/svg>/s.exec(render(h(ui.Tag, { kind }))) ?? ['', ''])[1],
    )
    expect(new Set(glyphs).size).toBe(6)
  })

  it('leaves a caller that passes its own words alone', () => {
    expect(render(h(ui.Tag, { tone: 'quiet' }, '12 links'))).toContain('12 links')
  })

  it('carries the two tones the graph badge and the decision chip were drawn by hand with', () => {
    // Three drawings of one object folded into one. The alarm tone is the graph badge's urgent
    // level; the ask tone is the decision tile's "somebody already suggested an answer".
    expect(render(h(ui.Tag, { tone: 'alarm' }, '2 blocked'))).toContain('data-tone="alarm"')
    expect(render(h(ui.Tag, { tone: 'ask' }, '3 options'))).toContain('data-tone="ask"')
    expect(ui.UI_CSS).toMatch(/\.px-tag\[data-tone="alarm"\][^{]*\{[^}]*var\(--st-failed\)/)
    expect(ui.UI_CSS).toMatch(/\.px-tag\[data-tone="ask"\][^{]*\{[^}]*var\(--ask\)/)
  })

  it('refuses to render nothing', () => {
    expect(() => render(h(ui.Tag, {}))).toThrow(/hole in the page/)
  })
})

// --------------------------------------------------------------------------- how much is done

/**
 * ONE COMPLETION PRIMITIVE, AND THE NUMBERS ARE PART OF IT.
 *
 * Completion existed on two surfaces out of fourteen, and the one that drew it — the step strip on
 * Home — was a component private to that page. The strip plus its exact count was wanted on Work,
 * Plans, Everything and the family pages, and a second drawing of it would be this repository's
 * recurring defect. What these pin is the half a screenshot cannot: that the count is always there,
 * that the state is in the markup rather than only in a colour, and that an empty strip throws
 * rather than drawing a claim nobody made.
 */
describe('Completion', () => {
  const parts = [
    { key: 'a', name: 'Calibrate', state: 'done' as const },
    { key: 'b', name: 'Record', state: 'done' as const },
    { key: 'c', name: 'Train', state: 'doing' as const },
    { key: 'd', name: 'Measure', state: 'todo' as const },
    { key: 'e', name: 'Write up', state: 'blocked' as const },
  ]

  it('draws the exact count beside the strip, always', () => {
    // A bar without its numbers is a feeling rather than a fact: two thirds of six parts and two
    // thirds of sixty are different situations and the strip alone cannot tell them apart.
    const html = render(h(ui.Completion, { parts }))
    expect(html).toContain('2 of 5 done')
  })

  it('gives every part its own segment, in order, carrying its state in the markup', () => {
    const html = render(h(ui.Completion, { parts }))
    const states = [...html.matchAll(/class="px-done-seg" data-state="([a-z]+)"/g)].map((m) => m[1])
    expect(states).toEqual(['done', 'done', 'doing', 'todo', 'blocked'])
  })

  it('says the whole sentence in words as well, for a reader who cannot see the strip', () => {
    const html = render(h(ui.Completion, { parts }))
    expect(html).toContain('5 steps: 1 to do, 1 doing, 2 done, 1 blocked.')
    // "todo" is the stored spelling and "to do" is the word. The vocabulary layer decides, here as
    // everywhere else, so the strip cannot spell a state differently from the row beside it.
    expect(html).not.toContain('1 todo')
  })

  it('carries the state by height and pattern as well as by colour', () => {
    // Print the page in greyscale and the five part states are still four silhouettes and two
    // hatch angles. Nothing in this product states anything by colour alone.
    expect(ui.UI_CSS).toMatch(/\.px-done-seg\[data-state="todo"\][^}]*height: 3px/)
    expect(ui.UI_CSS).toMatch(/\.px-done-seg\[data-state="doing"\][^}]*height: 7px/)
    expect(ui.UI_CSS).toMatch(/\.px-done-seg\[data-state="failed"\][^}]*repeating-linear-gradient\(135deg/)
    expect(ui.UI_CSS).toMatch(/\.px-done-seg\[data-state="blocked"\][^}]*repeating-linear-gradient\(0deg/)
  })

  it('is one fixed width whatever the part count, so a column of them can be compared', () => {
    expect(ui.UI_CSS).toMatch(/\.px-done-bar\s*\{[^}]*width: 84px/)
  })

  it('refuses to draw a strip with no parts', () => {
    expect(() => render(h(ui.Completion, { parts: [] }))).toThrow(/picture of a claim nobody made/)
  })

  it('counts and words come from one place, so a caller cannot print a different number', () => {
    expect(ui.completionCount(parts)).toEqual({ done: 2, total: 5 })
    expect(ui.completionSentence(parts, 'item')).toContain('5 items:')
  })
})

// --------------------------------------------------------------------------- fields

describe('Field', () => {
  it('wires its label, hint and error to the control by id', () => {
    const html = render(
      h(Field2, {}),
    )
    const forId = /for="([^"]+)"/.exec(html)?.[1]
    const inputId = /id="([^"]+)"[^>]*class="px-input"|class="px-input"[^>]*id="([^"]+)"/.exec(html)
    expect(forId).toBeDefined()
    expect(html).toContain(`id="${forId}"`)
    expect(inputId).not.toBeNull()
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('aria-invalid="true"')
  })

  it('folds the hint behind the question mark instead of printing it under the box', () => {
    // 34 of the 62 pieces of helper text in the product were this one prop, drawn as a permanent
    // sentence. `px-hint-mark` is the small round question mark this library already owns and
    // `px-hint` is the always-on sentence it replaces. Both halves are asserted, because passing
    // only the first would also pass for a Field that draws the mark AND keeps the sentence.
    const html = render(h(Field2, {}))
    expect(html, 'the hint is not behind a mark').toContain('px-hint-mark')
    expect(html, 'the always-on sentence is back under the box').not.toContain('class="px-hint"')
    expect(html, 'the hint was deleted rather than moved').toContain('Unique within the workspace')
  })

  it('keeps the hint in the control’s description, so a screen reader still hears it', () => {
    // This is what makes the fold safe. The words move behind a press for a reader who can see
    // them; a node named directly by aria-describedby is part of the description whether or not it
    // is on screen, so the reader who cannot see them hears exactly what they heard before.
    const html = render(h(Field2, {}))
    const described = /aria-describedby="([^"]+)"/.exec(html)?.[1] ?? ''
    const hintId = described.split(' ')[0] ?? ''
    expect(hintId, 'the control names nothing as its description').not.toBe('')
    expect(html, 'aria-describedby points at an id the hint text is not on').toMatch(
      new RegExp(`<span id="${hintId}">Unique within the workspace`),
    )
  })

  it('says a field may be left out in a word beside the label, and says nothing when it may not', () => {
    // WHY FIELD CARRIES THIS. Callers used to type it into the label or into the hint --
    // RecordsPage says "One line. Optional -- most kinds generate it later." -- and the hint now
    // folds. A reader must not have to press a question mark to find out they did not have to
    // answer, so the one fact a fold must not hide is drawn by the Field itself.
    const box = h(ui.TextInput, { value: '', onChange: () => undefined })
    const may = render(h(ui.Field, { label: 'Report path', optional: true, children: box }))
    expect(may).toContain('px-field-optional')
    expect(may).toContain('optional')

    const must = render(h(ui.Field, { label: 'Report path', children: box }))
    expect(must.toLowerCase(), 'a required field says something about being optional').not.toContain('optional')
  })
})

// --------------------------------------------------------------------------- geometry that lines up

/**
 * Every declaration that reaches a selector from a rule naming it EXACTLY, in source order.
 *
 * Exactly, so that a rule for the alarm panel is read and the rules for its rail, its title and
 * its hover state are left out -- each of those has its own opinion. Comments come out first: this
 * stylesheet documents itself heavily and a comment sits between a section header and the rule it
 * introduces, which would otherwise be read as part of the selector.
 */
const declarationsFor = (css: string, selector: string): string => {
  const parts: string[] = []
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((s) => s.trim())
    if (selectors.some((s) => s === selector)) parts.push(rule[2] ?? '')
  }
  if (parts.length === 0) throw new Error(`No rule in the stylesheet names ${selector} on its own.`)
  return parts.join('\n')
}

describe('the left edge of a column of panels', () => {
  it('starts an alarm panel’s contents where an ordinary panel’s contents start', () => {
    // WHAT WENT WRONG. The alarm panel added the rail's width to its left padding, so its text sat
    // 3px right of every ordinary panel stacked with it -- 273px against 270px, measured on Home at
    // 1440 on 15 August 2026, and the same split down Reports and notes and down Work to do. 3px is
    // too small to read as an indent and big enough to break the left edge of a column. The alarm
    // is already said by the tint, the border colour, the raised shadow, the heavier title and the
    // rail itself, and the rail is drawn inside the 8px padding without needing room of its own.
    expect(
      declarationsFor(ui.UI_CSS, '.px-panel[data-rank="0"]'),
      'the alarm panel sets its own padding again, so its contents no longer line up with the ' +
        'ordinary panels above and below it.',
    ).not.toMatch(/padding/)
  })

  it('lets a scan row’s lead give way instead of pushing the page sideways', () => {
    // WHAT WENT WRONG. The lead refused to shrink, so a lead holding a kind tag and an origin mark
    // stayed 236px wide inside a 190px column and took Agent runs to 421px at a 390px viewport, in
    // both themes. The chip inside is already capped at 100% of this box and ellipsises its word;
    // capped against a box that never shrinks, the cap could never bite.
    const decls = declarationsFor(ui.UI_CSS, '.px-scan-lead')
    expect(decls, 'the lead cannot shrink, so a wide one overflows its column').not.toMatch(/flex:\s*none/)
    expect(decls, 'without min-width 0 a flex item will not shrink below its content').toMatch(/min-width:\s*0/)
  })
})

/** A Field with everything switched on, so one render can show all of the wiring at once. */
function Field2() {
  return h(ui.Field, {
    label: 'Title',
    hint: 'Unique within the workspace',
    error: 'No record titled “x”.',
    children: h(ui.TextInput, { value: 'x', onChange: () => undefined }),
  })
}

// --------------------------------------------------------------------------- feedback

describe('Empty, ErrorNote and Loading', () => {
  it('draws a refusal heading once when its sentence is already in the message', () => {
    for (const message of [
      'Nothing was sent. This request did not prove it comes from the person.',
      'Nothing was sent. Starting an agent run needs a key that proves you may act for the owner.',
      'This message has no words to carry to the new agent. Nothing was sent.',
    ]) {
      const html = render(h(ui.ErrorNote, { message, label: 'Nothing was sent.' }))
      expect(html.match(/Nothing was sent\./g)).toHaveLength(1)
      expect(html).toContain(message)
      expect(html).toContain('role="alert"')
    }
    expect(render(h(ui.ErrorNote, { message: 'Choose an agent first.', label: 'Nothing was sent.' }))).toContain('<strong>Nothing was sent.</strong>')
  })

  it('leaves the heading out when a coded refusal already says it, in the page language', async () => {
    // E1 draws a coded refusal from the word list; 13n's round 14 leaves the heading out when the
    // refusal already says it. The words compared are the ones drawn, so in Chinese a Chinese heading
    // is left out, although the server's English message says the same thing in English.
    const i18n = await import('../src/shared/i18n.ts')
    const fault = {
      code: 'recordFieldWouldBeEmptied' as const, values: {}, kind: 'refused' as const,
      message: 'This change would empty a saved field. Nothing was written.',
      said: 'This change would empty a saved field. Nothing was written.', path: '/api/records/lake-books-1',
      status: 409, reason: null, detail: null, stored: null, elsewhere: null,
    }
    try {
      for (const [language, heading, other] of [['en', 'Nothing was written.', 'Not saved.'], ['zh', '没有写入任何内容。', '未保存。']] as const) {
        i18n.setWordLanguage(language)
        const html = render(h(ui.ErrorNote, { message: fault.message, label: heading, fault }))
        expect(html, language).toContain(i18n.createI18n(language).t('server.recordFieldWouldBeEmptied'))
        expect(html.split(heading).length - 1, `${language}: the heading is drawn twice`).toBe(1)
        expect(html).not.toContain(`<strong>${heading}</strong>`)
        // A heading the drawn words do not say is still drawn.
        expect(render(h(ui.ErrorNote, { message: fault.message, label: other, fault }))).toContain(`<strong>${other}</strong>`)
      }
    } finally {
      i18n.setWordLanguage('en')
    }
  })

  it('refuses to render a blank region', () => {
    expect(() => render(h(ui.Empty, {}))).toThrow(/needs a message/)
  })

  it('renders an empty state with its way out', () => {
    const html = render(h(ui.Empty, { message: 'No records yet.', action: h(ui.Btn, { children: 'New record' }) }))
    expect(html).toContain('No records yet.')
    expect(html).toContain('New record')
  })

  it('shows a failure in the server’s own words, out loud', () => {
    const html = render(h(ui.ErrorNote, { message: 'record "abc" has been deleted', retry: () => undefined }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('record &quot;abc&quot; has been deleted')
    expect(html).toContain('Retry')
  })

  it('still accepts the older children form the pages use', () => {
    expect(render(h(ui.ErrorNote, { message: 'gone' }, 'extra'))).toContain('extra')
    expect(render(h(ui.Empty, {}, 'nothing here yet'))).toContain('nothing here yet')
    expect(render(h(ui.Loading, { what: 'records' }))).toContain('Loading records')
  })

  it('loads in the final geometry rather than as a centred spinner', () => {
    const html = render(h(ui.Loading, { label: 'records', rows: 4 }))
    expect(html).toContain('role="status"')
    // Same row class as the real list, so nothing shifts when the data lands.
    expect(html.match(/px-row px-skel/g)?.length).toBe(4)
  })
})

// --------------------------------------------------------------------------- the alarm scale

/**
 * The scale exists because everything severe used to be drawn at one strength, so a checklist item
 * that failed thirteen days ago shouted as loudly as an obligation five days past a date somebody
 * agreed. These tests pin the two halves of the fix: that only the top step gets the state colour
 * at full strength, and that the bottom step drops the hue entirely instead of being a slightly
 * paler alarm.
 *
 * THE RED BUDGET IS THE SECOND HALF, AND IT REVERSES ONE THING THIS FILE USED TO ASSERT. The level
 * used to reach every object on its row, so an urgent row drew its state word, its age, its rail,
 * its tint and its borders in the alarm colour at once — on the live corpus, four of the top six
 * rows at maximum beside the two rows about a person being hurt, which is a page with no first
 * place. `urgent` still means the same thing; what it PAINTS is now a budget. A mark keeps the
 * tone, and so does the rail; the chips that print facts about the row — the stored word, the age,
 * the kind — give it up at every step and keep the weight.
 */
describe('the alarm scale', () => {
  /** The rule for an ordinary chip: a fact printed on a row, not a statement about it. */
  const blockFor = (level: string): string => {
    const notMark = level === 'urgent' ? ':not\\(\\.px-mark\\)' : ''
    const found = new RegExp(`\\.px-chip\\[data-alarm="${level}"\\]${notMark}\\s*\\{([^}]*)\\}`).exec(ui.UI_CSS)
    expect(found, `no chip rule for the "${level}" level`).not.toBeNull()
    return found?.[1] ?? ''
  }
  /** The rule for a MARK at the top step — a safety floor, a recorded consequence. */
  const urgentMark = (): string => {
    const found = /\.px-mark\[data-alarm="urgent"\]\s*\{([^}]*)\}/.exec(ui.UI_CSS)
    expect(found, 'no mark rule for the "urgent" level').not.toBeNull()
    return found?.[1] ?? ''
  }

  it('fills the ground of a mark at the top step, and of nothing else', () => {
    // The fallback is the default and the token is the override -- see D-W1 above. Asserted with
    // the fallback rather than without it, because without it this background measured transparent
    // in six of the seven themes.
    expect(urgentMark()).toContain('background: var(--alarm-urgent-fill, var(--px-tone-bg))')
    for (const level of ui.ALARM_LEVELS) {
      expect(blockFor(level), `${level} must not be filled`).toContain('background: transparent')
    }
  })

  it('keeps the state colour for a mark and takes it off every other chip', () => {
    // A mark is a statement ABOUT the row — somebody could be hurt — and it is one of the four
    // objects the budget spends strong red on.
    expect(urgentMark()).toContain('color: var(--px-tone)')
    // Everything else prints a fact ON the row, and the loudest of those is text colour. This is
    // the single rule that stops the word "open" being red.
    expect(blockFor('urgent')).toContain('color: var(--alarm-urgent-ink)')
    expect(blockFor('urgent')).not.toContain('var(--px-tone)')
    expect(blockFor('raised')).toContain('color: var(--alarm-raised-ink)')
    expect(blockFor('raised')).not.toContain('var(--px-tone)')
  })

  it('drops the state colour entirely at the quietest step', () => {
    // Not a paler red: no hue at all. An old failure recedes and is carried by its word, its
    // shape and the number beside it, which is the whole of the second approved decision.
    expect(blockFor('faded')).not.toContain('--px-tone')
    expect(blockFor('faded')).toContain('var(--alarm-faded-ink)')
  })

  it('steps the weight down as the colour comes off', () => {
    for (const level of ui.ALARM_LEVELS) {
      expect(blockFor(level)).toContain(`font-weight: var(--alarm-${level}-weight)`)
    }
    expect(urgentMark()).toContain('font-weight: var(--alarm-urgent-weight)')
  })

  it('spines an urgent row in the alarm colour and a raised one in the neutral rail', () => {
    const alarmRail = /\.px-row\[data-alarm="urgent"\]::before, \.px-scan\[data-alarm="urgent"\]::before\s*\{([^}]*)\}/.exec(
      ui.UI_CSS,
    )?.[1]
    expect(alarmRail, 'no rule painting the urgent rail in the state colour').toBeDefined()
    expect(alarmRail).toContain('background: var(--px-tone)')
    // Every step that has a spine draws it from one shape, and the quieter one is neutral: a rail
    // says WHERE a row ranks, and only the top step says it in the alarm colour.
    expect(ui.UI_CSS).toContain('background: var(--alarm-raised-rail)')
  })

  it('fills a row only for safety, so the tint means one thing', () => {
    // The change the whole pass is for. Every row past its date used to be tinted as well as
    // railed; the fill is now spent on the one fact a reader cannot infer from the order.
    const tint = /([^{}]*)\{\s*\n?\s*background: var\(--px-tone-row\);\s*\n?\s*\}/g
    const tinted = [...ui.UI_CSS.matchAll(tint)].map((m) => (m[1] ?? '').trim())
    expect(tinted.length, 'more than one rule fills a row').toBe(1)
    expect(tinted[0]).toContain('[data-alarm="urgent"][data-safety="1"]')
    expect(tinted[0]).toContain('.px-row')
    expect(tinted[0]).toContain('.px-scan')
  })

  /**
   * D12. The ladder was written three times — once for .px-row, once for .px-scan, and a third
   * time for the older ungated `data-severe="1"` path that drew the same picture with no level
   * gate at all. Change one and there was no type error, no failing test and no symptom on the
   * page you were looking at, which is this repository's recurring defect exactly.
   */
  it('writes the spine once, in one selector list naming both row shapes', () => {
    const rules = [...ui.UI_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    const spines = rules.filter(([, selector, body]) => /::before/.test(selector ?? '') && /width: var\(--rail\)/.test(body ?? ''))
    // One for the row ladder. The other is .px-panel[data-rank="0"], which is a panel and not a row.
    const rowSpines = spines.filter(([, selector]) => /\.px-row|\.px-scan/.test(selector ?? ''))
    expect(rowSpines.length, 'the alarm spine is drawn by more than one rule').toBe(1)
    const selector = rowSpines[0]?.[1] ?? ''
    expect(selector).toContain('.px-row[data-alarm="urgent"]')
    expect(selector).toContain('.px-row[data-alarm="raised"]')
    expect(selector).toContain('.px-scan[data-alarm="urgent"]')
    expect(selector).toContain('.px-scan[data-alarm="raised"]')
    // The old ungated path is drawn by the same rule now, as what it is: the raised picture.
    expect(selector).toContain('.px-row[data-severe="1"]')
  })

  it('puts a person being hurt at the top, whatever else is true', () => {
    // The rank floor, drawn. A safety row filed one minute ago is not allowed to be quieter than
    // a stale one, which is exactly the failure the shared rule was rewritten to remove.
    expect(ui.alarmFor({ safety: true, lateMs: null, satDays: null })).toBe('urgent')
    expect(ui.alarmFor({ safety: true, lateMs: -90 * 86400_000, satDays: 0 })).toBe('urgent')
  })

  it('puts a passed date at the top and a near date one below', () => {
    expect(ui.alarmFor({ safety: false, lateMs: 5 * 86400_000, satDays: 0 })).toBe('urgent')
    expect(ui.alarmFor({ safety: false, lateMs: -3600_000, satDays: 40 })).toBe('raised')
    // Beyond the 48-hour window, being owed earns no level of its own; age decides.
    expect(ui.alarmFor({ safety: false, lateMs: -30 * 86400_000, satDays: 1 })).toBe('raised')
    expect(ui.alarmFor({ safety: false, lateMs: -30 * 86400_000, satDays: 30 })).toBe('faded')
  })

  it('makes a thirteen-day-old failure obviously quieter than a five-day-late promise', () => {
    // The two rows the brief names. They must not come out at the same weight.
    const oldFailure = ui.alarmFor({ safety: false, lateMs: null, satDays: 13 })
    const latePromise = ui.alarmFor({ safety: false, lateMs: 5 * 86400_000, satDays: 5 })
    expect(oldFailure).toBe('faded')
    expect(latePromise).toBe('urgent')
    expect(oldFailure).not.toBe(latePromise)
  })

  it('never quietens a row it cannot date', () => {
    // "Mole Office cannot tell how long this has sat" is not evidence that it has sat a long time.
    expect(ui.alarmFor({ safety: false, lateMs: null, satDays: null })).toBe('plain')
  })

  it('grows the number rather than the colour', () => {
    // Three rows getting steadily worse. Same level, same colour, three different numbers -- and
    // there is deliberately no step above `urgent` for them to escalate into.
    const two = render(h(ui.StoredState, { state: 'open', progress: 'stopped_short', alarm: 'urgent', count: '2 days late' }))
    const eighteen = render(h(ui.StoredState, { state: 'open', progress: 'stopped_short', alarm: 'urgent', count: '18 days late' }))
    expect(two).toContain('2 days late')
    expect(eighteen).toContain('18 days late')
    expect(two).toContain('data-alarm="urgent"')
    expect(eighteen).toContain('data-alarm="urgent"')
    expect(ui.ALARM_LEVELS.indexOf('urgent')).toBe(0)
  })

  it('says in words what earns each level', () => {
    for (const level of ui.ALARM_LEVELS) {
      expect(ui.ALARM_NOTES[level].length).toBeGreaterThan(40)
    }
  })

  it('lets a Row take a level, and stops it also taking the old severe treatment', () => {
    const html = render(h(ui.Row, { title: 'x', state: 'failed' }))
    expect(html).toContain('data-severe="1"')
    const scaled = render(h(ui.Row, { title: 'x', alarm: 'faded' }))
    expect(scaled).toContain('data-alarm="faded"')
    expect(scaled).not.toContain('data-severe="1"')
  })

  // ---- the level reaches the chip, not just the row ---------------------------------------
  //
  // THE DEFECT THIS PINS, which four pages had at once and which only a photograph found: the row
  // faded with age and the chip inside it did not, so one line said two different things about how
  // urgent it is. Every one of them went through Row or through StateChip, so the fix is in both
  // and these are the tests that stop it coming back.

  it('gives its own chip the level the row was drawn at', () => {
    const faded = render(h(ui.Row, { title: 'x', state: 'crashed', alarm: 'faded' }))
    // Twice: once on the row, once on the chip inside it.
    expect(faded.match(/data-alarm="faded"/g)?.length).toBe(2)
    // And the chip drops the severe treatment with the row, rather than keeping it alone.
    expect(faded).not.toContain('data-severe="1"')
  })

  it('lets a StateChip be drawn at a level on its own, for a list that has no Row', () => {
    const quiet = render(h(ui.StateChip, { state: 'crashed', alarm: 'faded' }))
    expect(quiet).toContain('data-alarm="faded"')
    expect(quiet).not.toContain('data-severe="1"')
    // The word is still there. Quieter is never "gone".
    expect(quiet).toContain('Crashed')
    // Left out, nothing changes for the checklist chips that have used this for months.
    const plain = render(h(ui.StateChip, { state: 'crashed' }))
    expect(plain).not.toContain('data-alarm')
    expect(plain).toContain('data-severe="1"')
  })

  it('says why a chip is drawn at the level it is, in the words the sheet uses', () => {
    // The tooltip is the only place a reader can ask "why is this one grey". It quotes ALARM_NOTES
    // rather than a second wording, so the sheet and the chip cannot drift apart.
    const html = render(h(ui.StateChip, { state: 'crashed', alarm: 'faded' }))
    expect(html).toContain(ui.ALARM_NOTES.faded.slice(0, 30))
  })
})

/**
 * The fallback for a page that has no attention data.
 *
 * The home page ranks rows the server selected and knows who is hurt and how late a promise is.
 * The records list and the sessions list know a record and a stamp, and until this existed they
 * drew every stopped word at FULL alarm strength — so a session that crashed forty-nine days ago
 * was exactly as loud as an emergency stop filed this morning, which is half of approved decision
 * 2 failed on two pages out of four.
 */
describe('the age-only fallback', () => {
  it('can never reach the top of the scale, because it cannot see a consequence or a date', () => {
    // Whatever stamp it is given. Shouting on a guess is the silent default this product bans.
    for (const days of [0, 1, 3, 8, 400]) {
      const stamp = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
      expect(ui.ageAlarm('stopped_short', stamp, Date.now()), `${days} days`).not.toBe('urgent')
    }
  })

  it('fades an old stop and keeps a fresh one loud', () => {
    const now = Date.parse('2026-08-09T12:00:00')
    // `localStamp` and NOT `toISOString`. `ageAlarm` reads its stamp as the operator's wall clock,
    // because that is what Mole Office stores, so a fixture built from the UTC clock hands it a time
    // that is out by the machine's offset. Two sibling files failed exactly that way at +14:00.
    const stamp = (days: number) => localStamp(new Date(now - days * 86400_000))
    expect(ui.ageAlarm('stopped_short', stamp(0), now)).toBe('raised')
    expect(ui.ageAlarm('stopped_short', stamp(4), now)).toBe('plain')
    expect(ui.ageAlarm('stopped_short', stamp(30), now)).toBe('faded')
  })

  it('says nothing at all about work that has not stopped short', () => {
    const now = Date.now()
    for (const progress of ['not_started', 'in_flight', 'finished', 'paused', 'unknown', 'unclassified'] as const) {
      expect(ui.ageAlarm(progress, '2026-08-01', now), progress).toBeUndefined()
    }
    // And nothing about a record with no state word at all.
    expect(ui.ageAlarm(null, '2026-08-01', now)).toBeUndefined()
  })

  it('does not quieten a stop it cannot date', () => {
    // Same promise `alarmFor` makes: "Mole Office cannot tell how long this has sat" is not evidence
    // that it has sat a long time.
    expect(ui.ageAlarm('stopped_short', null, Date.now())).toBe('plain')
    expect(ui.ageAlarm('stopped_short', 'not a date', Date.now())).toBe('plain')
  })
})

// --------------------------------------------------------- the same fact, two surface emphases

/**
 * THE SAME SEMANTIC FACT, DIFFERENT SURFACE EMPHASIS.
 *
 * The red budget was right and it reached every surface, because it was applied through the shared
 * chip rules. On Home, which is scanned, that is exactly what was wanted. On the sessions list,
 * which is compared, it meant four of six states drawn as the same grey chip. Measured in Chromium
 * before the fix: `Idle`, `Crashed` and `Orphaned` all computed to rgb(69, 75, 85) on a transparent
 * ground in the `light` theme, differing only in a word and a 16px shape.
 *
 * These tests hold four things: that the family vocabulary exists and says the same thing
 * everywhere, that a surface has to ASK for the analytical drawing, that Home -- which asks for
 * nothing -- cannot be REACHED by any of it, and that the drawing each family is handed is the one
 * it is entitled to. The fourth is the one the first version of this block did not hold, and two
 * defects went out under it: the fault took the filled ground a safety mark means, and the family
 * with no hue of its own was left to the alarm greys at every level but one. Both are pinned below,
 * with the measurement that found them.
 *
 * "CANNOT BE REACHED" IS NARROWER THAN "IS UNCHANGED", deliberately. The wave that added this block
 * also fixed --alarm-urgent-fill, which is gated on nothing, and Home's safety marks went from a
 * transparent ground to a filled one in six of the seven themes. What these tests can promise is
 * that no rule HERE reaches a surface that declares no emphasis. They cannot promise Home never
 * moved, and they should not be read as promising it.
 */
describe('surface emphasis', () => {
  /**
   * Every rule in the stylesheet, as a selector and a body.
   *
   * Comments are stripped FIRST. Half the reasoning in that stylesheet lives in a comment directly
   * above the rule it explains, and a selector read with its comment still attached matches every
   * word somebody wrote about it -- which would let a rule pass this file by being described
   * correctly rather than by being written correctly.
   */
  const rules = (): { selector: string; body: string }[] =>
    [...ui.UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: (m[1] ?? '').trim(),
      body: m[2] ?? '',
    }))

  /** The rule that hands every other family its colour back. */
  const generalRule = () => rules().find((r) => r.selector.includes(':not([data-state-family="warning"])'))
  /** The rule for the family that has no colour to hand back. */
  const warningRule = () => rules().find((r) => r.selector.includes('.px-chip[data-state-family="warning"]'))
  /** The rule for the family that gets its hue and not its fill. */
  const dangerRule = () => rules().find((r) => r.selector.includes('.px-chip[data-state-family="danger"]'))

  /** The five drawings a chip can be asked for: no level at all, and the four steps of the scale. */
  const LEVELS = ['none', 'faded', 'plain', 'raised', 'urgent'] as const

  /**
   * WHICH ANALYTICAL RULES REACH A CHIP with this family at this level.
   *
   * NOT A CSS ENGINE, and it must not become one -- a second implementation of the cascade is the
   * defect this repository keeps producing. It reads only the four things these selectors use to
   * say "not you": a required family, an excluded family, a required level and an excluded level.
   * Everything it cannot read it treats as matching, so a selector that grew a condition this does
   * not understand shows up as a rule matching too often, which the tests below fail on.
   */
  const analyticalMatches = (family: string, alarm: (typeof LEVELS)[number]) =>
    rules().filter((rule) => {
      const selector = rule.selector
      if (!selector.includes('[data-px-emphasis="analytical"]')) return false
      const nots = [...selector.matchAll(/:not\(([^)]*)\)/g)].map((m) => m[1] ?? '')
      const bare = selector.replace(/:not\([^)]*\)/g, '')
      // A rule that only ever draws marks is not drawing this chip.
      if (bare.includes('.px-mark')) return false
      const needsFamily = /\[data-state-family="(\w+)"\]/.exec(bare)?.[1]
      const noFamily = nots.flatMap((n) => [...n.matchAll(/\[data-state-family="(\w+)"\]/g)].map((m) => m[1] as string))
      const needsLevel = /\[data-alarm="(\w+)"\]/.exec(bare)?.[1]
      const noLevel = nots.some((n) => n.trim() === '[data-alarm]')
      if (needsFamily !== undefined && needsFamily !== family) return false
      if (noFamily.includes(family)) return false
      if (needsLevel !== undefined && needsLevel !== alarm) return false
      if (noLevel && alarm !== 'none') return false
      return true
    })

  it('names the attribute in exactly one place, so six surfaces cannot spell it six ways', () => {
    // A misspelt attribute is a page that silently draws at the other emphasis, with no type
    // error and nothing failing -- which is this repository's recurring defect in one word.
    expect(ui.surfaceEmphasis('analytical')).toEqual({ 'data-px-emphasis': 'analytical' })
    expect(ui.surfaceEmphasis('perceptual')).toEqual({ 'data-px-emphasis': 'perceptual' })
    expect(ui.SURFACE_EMPHASES).toEqual(['perceptual', 'analytical'])
  })

  it('lets only the stored word past the gate, and it takes no colour with it', () => {
    // WHAT THIS TEST USED TO SAY, AND WHY IT SAYS SOMETHING ELSE NOW. It used to require EVERY
    // family rule to be gated on the emphasis attribute, so that none of them could reach Home.
    // Its reasoning was the red budget: an ungated family rule reaches the attention list, where
    // the whole budget lives. THAT REASONING IS UNCHANGED and is still checked, on the values.
    //
    // What changed is that four family rules are now ungated on purpose. A stored state word is a
    // fact about a record, not an opinion of the page it is drawn on, and while its ladder was
    // scoped to the six family pages the same word came out three ways -- measured in Chromium in
    // `light`, "open" was ink rgb(69,75,85) on Home, ink rgb(22,24,28) on #/records, and white on
    // a filled rgb(22,24,28) block on #/work. One stored fact, three drawings.
    //
    // So the gate is replaced, for the stored word only, by a check on what the rules SPEND. The
    // budget is about a filled state tint, and none of these four names one.
    const ungated = rules().filter(
      (r) => /data-state-family|data-drawing/.test(r.selector) && !/\[data-px-emphasis=/.test(r.selector),
    )
    expect(ungated.length, 'the stored word ladder is gone from this sheet').toBeGreaterThan(0)
    for (const rule of ungated) {
      expect(
        rule.selector,
        'an ungated family rule reaches something that is not a stored word, so it reaches Home',
      ).toContain('.px-chip-stored')
      // A filled --px-tone-bg on an unlevelled danger chip is exactly how a crashed chip came out
      // byte-identical to the urgent safety mark. No ungated rule may ask for one.
      expect(rule.body, 'an ungated rule fills a chip from a state tint').not.toContain('--px-tone-bg')
      expect(rule.body, 'an ungated rule takes the tone the alarm scale spends').not.toContain('--px-tone-line')
      // NOT ONE STATE HUE, AND --st-done IS NO LONGER THE EXCEPTION. The green that used to ink the
      // ended states sat on a withdrawn measurement, an abandoned promise and a retired subsystem,
      // and it reads as "good, trust this". A state word is told apart by shape here and by nothing
      // else, which is the UX contract's own rule.
      expect(rule.body, 'a state hue is back on a stored word').not.toMatch(/var\(--st-|--ask/)
    }
  })

  it('draws a stored word by what the reader should do about it, and gives every drawing a rule', () => {
    // THE EIGHT TREATMENTS, read out of the sheet by drawing. They answer the need for tags such as
    // open, under a day and property to differ in colour, as text, block or outline. The answer is
    // stated once for the whole product instead of once per page.
    const stored = (drawing: string) =>
      rules()
        .filter((r) => r.selector.includes(`.px-chip.px-chip-stored[data-drawing="${drawing}"]:not(.px-mark)`))
        .map((r) => r.body)
        .join(' ')
    // THE FILLED BLOCK IS THE SCARCE ONE and it is on the drawing that means somebody is waiting on
    // you now. Keyed on the classification instead, it was on 20 of Home's 20 chips.
    expect(stored('waiting-on-you'), 'the wait lost its filled block').toContain('background: var(--text)')
    for (const drawing of ['not-started', 'under-way', 'held-up', 'broke']) {
      expect(stored(drawing), `${drawing} lost its outline`).toContain('background: transparent')
      expect(stored(drawing), `${drawing} took the filled block the wait is spent on`).not.toContain(
        'background: var(--text);',
      )
    }
    for (const drawing of ['ended', 'ended-empty']) {
      expect(stored(drawing), 'an ended word got its box back').toContain('border-color: transparent')
      expect(stored(drawing), 'the green is back on an ended word').not.toContain('--st-done')
    }
    // ABSENCE BEATS A GUESS. "Nobody has classified this word" has to stay tellable from every
    // asserted drawing, and the broken edge is what none of them has.
    expect(stored('nobody-can-say'), 'the unclassified word lost the one channel that says nobody looked').toContain(
      'border-style: dashed',
    )
    for (const drawing of ['waiting-on-you', 'not-started', 'under-way', 'held-up', 'broke', 'ended', 'ended-empty']) {
      expect(stored(drawing), `${drawing} borrowed the dashed edge`).not.toContain('dashed')
    }
    // EVERY DRAWING THE COMPONENT CAN EMIT HAS A RULE. A drawing with none falls through to the
    // alarm scale's greys, which is how the collapse this pass undid was invisible for a wave.
    for (const drawing of ui.STATE_DRAWINGS) {
      expect(stored(drawing), `nothing in the stylesheet draws ${drawing}`).not.toBe('')
    }
  })

  it('out-weighs the alarm scale, so a levelled stored word is not drawn two ways', () => {
    // MEASURED FIRST, PINNED SECOND, BECAUSE THE FAILURE IS SILENT. The ladder has to beat
    // .px-chip[data-alarm="..."]:not(.px-mark), which is three class-level pieces. Written without
    // its leading .px-chip it TIES with that and wins only by sitting later in the file -- a
    // promise nobody can see when they move a block. The predecessor of this rule was written
    // .fam.fam.fam for the same reason, and the triple was found by reading getComputedStyle out
    // of Chromium after a two-class version had been READ as winning: "todo" still computed its
    // filled grey ground. 13 of the 13 stored chips on #/work and 20 of the 20 on Home carry a
    // level, so this is not a corner case.
    /** Class-level specificity: classes, attributes and :not() arguments all count as one. */
    const weight = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length
    const alarm = rules().filter((r) => /\.px-chip\[data-alarm="\w+"\]/.test(r.selector))
    expect(alarm.length, 'the alarm scale is gone').toBeGreaterThan(0)
    const theirs = Math.max(...alarm.map((r) => weight(r.selector)))
    const mine = weight('.px-chip.px-chip-stored[data-drawing="waiting-on-you"]:not(.px-mark)')
    expect(mine, 'the stored ladder ties with the alarm scale or loses to it').toBeGreaterThan(theirs)
    expect(ui.UI_CSS).toContain('.px-chip.px-chip-stored[data-drawing="waiting-on-you"]:not(.px-mark)')
  })

  it('keeps the emphasis off the stored word, which is what stopped it being drawn three ways', () => {
    // The other half of the same fix. The analytical block still draws this interface's OWN state
    // chips -- Running, Crashed, Idle, Orphaned -- and measured in Chromium there are 63 of those
    // on #/records and #/sessions across all six families, so the block is not redundant and was
    // not deleted. What it may no longer touch is a word somebody wrote on a record.
    for (const rule of rules().filter((r) => r.selector.includes('[data-px-emphasis='))) {
      if (!/data-state-family|\.px-chip/.test(rule.selector)) continue
      expect(rule.selector, 'the emphasis reaches the stored word again').toContain(':not(.px-chip-stored)')
    }
  })

  it('says which of the two emphases each surface is asking for, in words', () => {
    for (const emphasis of ui.SURFACE_EMPHASES) {
      expect(ui.EMPHASIS_NOTES[emphasis].length).toBeGreaterThan(40)
    }
    // The perceptual note has to name the default, or the six surfaces after this cannot tell
    // which one they get by doing nothing.
    expect(ui.EMPHASIS_NOTES.perceptual).toContain('default')
  })

  it('hands the state colour back on an analytical surface, and takes nothing from the row', () => {
    const analytical = rules().filter((r) => r.selector.includes('[data-px-emphasis='))
    expect(analytical.length, 'no analytical rules at all').toBeGreaterThan(0)
    // The chip gets its own tone again -- the drawing it has when no level is given. Nothing is
    // invented: no analytical rule may reach for a colour the state did not already have.
    expect(generalRule()?.body).toContain('color: var(--px-tone)')
    expect(generalRule()?.body).toContain('background: var(--px-tone-bg)')
    // THE ROW LADDER IS THE SAME AT BOTH EMPHASES. The rail, the safety tint and the faded title
    // say how much a row needs a person, which does not change with what the page is for. If the
    // emphasis reached them, an analytical page would be quietly re-ranking its own rows.
    for (const rule of analytical) {
      expect(rule.selector, 'the emphasis reaches a row').not.toMatch(/\.px-row|\.px-scan/)
    }
  })

  it('withholds the colour from the one family that has none of its own', () => {
    // `warning` borrows the `failed` tone because there is no fifth hue to give it, so handing the
    // tone back would print "open", "idle" and "chasing" in the alarm colour down a whole
    // catalogue -- the exact reading the red budget removed.
    const warning = warningRule()
    expect(warning, 'no rule for the family with no colour').toBeDefined()
    expect(warning?.body).not.toContain('var(--px-tone)')
    expect(warning?.body).toContain('color: var(--text)')
    // And the general rule has to step aside for it, or the tone would come back through there.
    expect(generalRule(), 'the general rule does not exclude the family with no colour').toBeDefined()
    expect(generalRule()?.selector).toContain('[data-px-emphasis=')
  })

  /**
   * THE INVARIANT THIS WHOLE BLOCK EXISTS TO HOLD, and the one defect that got through it.
   *
   * tokens.css spends the filled ground of the top alarm step on two objects and says why: "ONLY
   * MARKS TAKE IT -- a safety mark and a recorded consequence -- so the fill means 'a person is in
   * this row'." The first version of the analytical rule handed the filled ground back to every
   * family including `danger`, and measured in Chromium on #/sessions in `light`, a `crashed` chip
   * computed ink rgb(179,67,53) on fill rgb(247,234,233) -- byte-identical to the urgent safety
   * mark on the same page, which differed only in a font weight and the alpha on its edge. One
   * drawing then meant either "a person could be hurt" or "a background process died".
   */
  it('never hands the filled ground back to the danger family, at any level', () => {
    for (const alarm of LEVELS) {
      const matched = analyticalMatches('danger', alarm)
      expect(matched.map((r) => r.selector), `danger at ${alarm} is drawn by ${matched.length} rules`).toHaveLength(1)
      const body = matched[0]?.body ?? ''
      // The fill is the half that is refused. --px-tone-bg here is the same tint the urgent mark
      // fills with, so asking for it is asking to be drawn as a person in danger.
      expect(body, `danger at ${alarm} takes a fill`).toContain('background: transparent')
      expect(body, `danger at ${alarm} takes the mark's tint`).not.toContain('--px-tone-bg')
      // And the hue is the half that is kept, or the emphasis has stopped telling states apart.
      expect(body, `danger at ${alarm} lost its ink`).toContain('color: var(--px-tone)')
      expect(body, `danger at ${alarm} lost its edge`).toContain('border-color: var(--px-tone-line)')
    }
    expect(dangerRule(), 'no rule for the family that keeps the hue and gives up the fill').toBeDefined()
  })

  /**
   * DEFECT B: THE TWO GREYS. The warning family used to be drawn by this block only when it
   * carried NO level; a levelled one fell through to the alarm scale, which inks it from the same
   * greys the neutral family's tone is mixed from. Measured on #/sessions in `light`: `orphaned` at
   * the faded level computed ink rgb(92,99,110) on a transparent ground, and `idle` computed the
   * SAME ink, rgb(92,99,110), on fill rgb(237,238,239) -- 18/255 of luminance apart and nothing
   * else. In `dark` both were rgb(152,160,175). 21 of that page's 38 orphaned rows are drawn at
   * that level, so the most common state on the page was the one that could not be named without
   * reading it.
   */
  it('draws the warning family the same way at every level, so no level falls back to the greys', () => {
    const drawn = LEVELS.map((alarm) => {
      const matched = analyticalMatches('warning', alarm)
      expect(matched.map((r) => r.selector), `warning at ${alarm} is drawn by ${matched.length} rules`).toHaveLength(1)
      return matched[0]?.body
    })
    expect(new Set(drawn).size, 'a level escapes the warning rule and falls back to the alarm scale').toBe(1)
    expect(drawn[0]).toContain('color: var(--text)')
    expect(drawn[0]).toContain('background: transparent')
  })

  it('draws the neutral family unlike the warning family, on the ink AND on the ground', () => {
    // These two are `idle` and `orphaned` on the sessions page. One channel between them is not
    // enough -- the fill they used to differ by is 18/255 -- so they are separated by their ink
    // (a state tone against full text colour) and by fill against outline, at every level.
    for (const alarm of LEVELS) {
      const neutral = analyticalMatches('neutral', alarm)[0]
      const warning = analyticalMatches('warning', alarm)[0]
      expect(neutral?.body, `no neutral drawing at ${alarm}`).toBeDefined()
      expect(warning?.body, `no warning drawing at ${alarm}`).toBeDefined()
      expect(neutral?.body, `idle and orphaned are drawn identically at ${alarm}`).not.toBe(warning?.body)
      expect(neutral?.body).toContain('background: var(--px-tone-bg)')
      expect(neutral?.body).toContain('color: var(--px-tone)')
    }
  })

  it('draws every family at every level with exactly one rule, so nothing falls through', () => {
    // A family and level nothing here matches is drawn by the alarm scale instead -- which is
    // Home's drawing, on a page that asked for the other one, and is exactly how `orphaned` came
    // out as the same grey as `idle`. Two matches is the other half of the same fault: the general
    // rule stopped excluding a family that has its own.
    for (const family of ui.STATE_FAMILIES) {
      for (const alarm of LEVELS) {
        const matched = analyticalMatches(family, alarm)
        expect(matched.map((r) => r.selector), `${family} at ${alarm} is drawn by ${matched.length} rules`).toHaveLength(
          1,
        )
      }
    }
  })

  it('leaves a mark alone at either emphasis, because a mark is the budget spending itself', () => {
    // A safety mark and a recorded consequence are what strong red is FOR. The emphasis decides
    // how a chip prints a fact, never whether a person being hurt is drawn.
    for (const rule of rules().filter((r) => r.selector.includes('[data-px-emphasis='))) {
      expect(rule.selector, 'the emphasis reaches a mark').toContain(':not(.px-mark)')
    }
  })

  it('writes the quiet chip edge once, so restoring it cannot restore a stale copy', () => {
    // Four rules have an opinion about this edge and the analytical rule needs to put it back
    // after a level painted over it. Written as five border-colors, four would go on drawing the
    // old edge the day the fifth changed, with nothing failing.
    const copies = [...ui.UI_CSS.matchAll(/color-mix\(in srgb, var\(--px-tone-line\) 55%/g)]
    expect(copies.length, 'the chip edge is written more than once').toBe(1)
    expect(ui.UI_CSS).toContain('border-color: var(--px-edge)')
  })
})

describe('state families', () => {
  it('gives every state and every classification a family, all from the same six', () => {
    for (const state of ui.PANEL_STATES) {
      expect(ui.STATE_FAMILIES, `no family for the state ${state}`).toContain(ui.STATE_FAMILY[state])
    }
    for (const progress of Object.keys(ui.PROGRESS_FAMILY) as (keyof typeof ui.PROGRESS_FAMILY)[]) {
      expect(ui.STATE_FAMILIES, `no family for ${progress}`).toContain(ui.PROGRESS_FAMILY[progress])
    }
    for (const family of ui.STATE_FAMILIES) {
      expect(ui.STATE_FAMILY_MEANINGS[family].length, `no sentence for ${family}`).toBeGreaterThan(20)
    }
  })

  it('is not the record families, and cannot be mistaken for them in the markup', () => {
    // KIND_FAMILIES groups the record KINDS and is drawn monochrome by FamilyTag. This groups the
    // STATES. One file with two things called "family" is a file the next reader gets wrong, so
    // the attribute is spelt in full and the two vocabularies share no word.
    const html = render(h(ui.StateChip, { state: 'crashed' }))
    expect(html).toContain('data-state-family="danger"')
    expect(html).not.toMatch(/\sdata-family=/)
    for (const family of ui.STATE_FAMILIES) {
      expect(Object.keys(KIND_FAMILIES), `"${family}" is both a state family and a record family`).not.toContain(family)
    }
  })

  it('says a fault is a fault and a missed date is not, which is the one entry worth arguing about', () => {
    // Something is broken.
    for (const state of ['failed', 'blocked', 'broken', 'crashed'] as const) {
      expect(ui.STATE_FAMILY[state], state).toBe('danger')
    }
    // A promise that has passed its date needs keeping; nothing is broken. Home still prints the
    // lateness in the alarm colour, because there the red is on the NUMBER and not on the word --
    // which is the whole principle: one fact, two emphases, no second meaning.
    expect(ui.STATE_FAMILY.overdue).toBe('warning')
    expect(ui.UI_CSS).toContain('.px-chip-stored .px-chip-count[data-count="late"]')
    // Ordinary, and the reason a catalogue does not read as an alarm.
    expect(ui.PROGRESS_FAMILY.stopped_short).toBe('warning')
    expect(ui.STATE_FAMILY.done).toBe('success')
    expect(ui.STATE_FAMILY.running).toBe('active')
    expect(ui.STATE_FAMILY.doing).toBe('active')
    expect(ui.STATE_FAMILY.todo).toBe('neutral')
    expect(ui.STATE_FAMILY.inferred).toBe('unknown')
  })

  /*
   * WHERE THE SESSIONS BORROWS ARE CHECKED, AND WHY NOT HERE. A test in this file used to hold its
   * own copy of SESSION_CHIP -- the map in SessionPanel.tsx that says which chip each of the six
   * session states borrows -- and assert that the six landed in five families. The copy drifted the
   * day the real map changed `idle` from `doing` to `todo`: the real six now land in SIX families,
   * this file went on asserting five, and nothing failed, because it was asking its own copy.
   *
   * That is this repository's recurring defect, and the prescribed fix is to delete one of the two.
   * The copy is the one that goes, because the real map is already pinned against the real
   * families, the real markup and the real stylesheet in tests/sessions-ui.test.ts -- "lands the
   * six session states in six different state families" and the two beside it. This file tests
   * ui.tsx, which is where the families are declared; which page borrows which chip belongs to the
   * page's own tests, and importing a page component in here to check it would only recreate the
   * coupling in the other direction.
   */

  it('puts the family on every chip that draws a state, including the stored words', () => {
    // A chip with no family attribute is a chip an analytical surface cannot draw, and it would
    // fail silently: the general rule would still hand it a colour, and only the one family that
    // must NOT get one would be wrong.
    expect(render(h(ui.StateChip, { state: 'overdue' }))).toContain('data-state-family="warning"')
    expect(render(h(ui.StateChip, { state: 'todo', onChange: () => undefined }))).toContain(
      'data-state-family="neutral"',
    )
    expect(render(h(ui.StoredState, { state: 'open', progress: 'stopped_short' }))).toContain(
      'data-state-family="warning"',
    )
    expect(render(h(ui.StoredState, { state: 'arrived', progress: 'finished' }))).toContain(
      'data-state-family="success"',
    )
    // Nobody has said, which is not the same as nothing being wrong.
    expect(render(h(ui.StoredState, { state: null, progress: null }))).toContain('data-state-family="unknown"')
  })
})

describe('durations', () => {
  it('counts whole days and says so in words', () => {
    expect(ui.dayPhrase(13 * 86400_000)).toBe('13 days')
    expect(ui.dayPhrase(86400_000)).toBe('1 day')
    expect(ui.dayPhrase(3600_000)).toBe('under a day')
  })

  // A date due by the end of 10 September 2026 in London (23:59:59 BST), and moments around it. The days are
  // calendar days in the zone given (tests/a-deadline-counts-calendar-days.test.ts holds the clock changes).
  const LONDON = 'Europe/London'
  const endOf10September = Date.UTC(2026, 8, 10, 22, 59, 59)
  const noonOn = (day: number) => Date.UTC(2026, 8, day, 11, 0, 0)

  it('refuses to word a date nobody agreed', () => {
    // Null rather than a phrase, so the caller has to say "no date was ever agreed" itself
    // instead of printing something that looks like a schedule.
    expect(ui.latePhrase(null, noonOn(16), LONDON)).toBeNull()
    expect(ui.latePhrase(endOf10September, noonOn(16), LONDON)?.text).toBe('6 days late')
    expect(ui.latePhrase(endOf10September, noonOn(7), LONDON)?.text).toBe('due in 3 days')
    expect(ui.latePhrase(endOf10September, noonOn(10), LONDON)?.text).toBe('due today')
  })

  it('says which of the two answers it gave, so nothing downstream reads the words back', () => {
    // The threshold is applied HERE and nowhere else. A caller that wanted to draw a missed date
    // differently from one still ahead would otherwise count the days again, and two places
    // deciding one thing is how this codebase's recurring defect gets made.
    expect(ui.latePhrase(endOf10September, noonOn(16), LONDON)?.kind).toBe('late')
    // The day the date falls on is the last moment the promise can be kept, so it is `late` too --
    // and those two are the pair the red budget spends its colour on.
    expect(ui.latePhrase(endOf10September, noonOn(10), LONDON)?.kind).toBe('late')
    // A date still ahead is not lateness, and must not be drawn as any part of it.
    expect(ui.latePhrase(endOf10September, noonOn(7), LONDON)?.kind).toBe('due')
  })

  it('gives no age at all to a stamp it cannot read', () => {
    expect(ui.daysSince(null)).toBeNull()
    expect(ui.daysSince('not a date')).toBeNull()
    expect(ui.daysSince('2026-08-07 12:00:00', new Date('2026-08-10T12:00:00').getTime())).toBe(3)
  })
})

// --------------------------------------------------------------------------- stored state words

describe('StoredState', () => {
  it('prints the word the record carries, where nothing renames it', () => {
    const html = render(h(ui.StoredState, { state: 'open', progress: 'stopped_short' }))
    expect(html).toContain('open')
    // The stored word is never changed, only sometimes shown differently. `open` is not one of the
    // six the display table renames, so the tooltip has nothing extra to say about it.
    expect(html).not.toContain('shown as')
  })

  it('shows the six renamed words as a person reads them, and says so in the tooltip in developer mode', async () => {
    // `idle` means an agent stopped and needs an answer, and the fix takes seconds. Drawn as
    // "idle" it reads as "nothing is happening here", which is the opposite instruction.
    const html = await renderInDeveloper(h(ui.StoredState, { state: 'idle', progress: 'stopped_short' }))
    expect(html).toContain('waiting for you')
    expect(html).toContain('shown as')
    // The stored word is still what the tooltip names first, so nobody has to guess what is in the
    // database to write a query about it.
    expect(html).toContain('idle')
  })

  it('draws a word no fixed vocabulary contains', () => {
    // The ten PANEL_STATES are words this interface computes. A record says `open`, `chasing`,
    // `重印中`, and before this there was nowhere for one of them to go.
    for (const word of ['open', 'chasing', '重印中']) {
      expect(render(h(ui.StoredState, { state: word, progress: 'unclassified' }))).toContain(word)
    }
  })

  it('draws a record with no state at all as a value rather than as a blank', () => {
    const html = render(h(ui.StoredState, { state: null, progress: null }))
    expect(html).toContain('no state')
    expect(html).toContain('data-progress="none"')
  })

  it('gives all eight drawings a different shape', () => {
    const shapes = ui.STATE_DRAWINGS.map((drawing) => render(h(ui.StateDrawingGlyph, { drawing })))
    expect(new Set(shapes).size).toBe(ui.STATE_DRAWINGS.length)
  })

  it('asks the shared contract what an unclassified word means, rather than wording it again in developer mode', async () => {
    const { unclassifiedNote } = await import('../src/shared/work.ts')
    const html = await renderInDeveloper(h(ui.StoredState, { state: 'chasing', progress: 'unclassified' }))
    // The tooltip is the SAME sentence the server puts in its unclassified list. Two wordings for
    // one fact is how a screen and an API start disagreeing in front of a reader.
    expect(html).toContain(unclassifiedNote('chasing').replace(/"/g, '&quot;'))
  })

  it('says what each classification means in plain words', () => {
    expect(ui.PROGRESS_WORDS.stopped_short).toBe('the work began and did not finish')
    for (const phrase of Object.values(ui.PROGRESS_WORDS)) {
      expect(phrase.length).toBeGreaterThan(10)
    }
  })
})

// ------------------------------------------------------- how loud the normal answer has to be

describe('the origin mark, drawn on every row of every list', () => {
  /** The stylesheet rule for one origin, without the comments above it. */
  const originRule = (key: string): string => {
    const bare = ui.UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const found = new RegExp(`\\.px-chip\\.px-origin\\[data-origin="${key}"\\]\\s*\\{([^}]*)\\}`).exec(bare)
    return found?.[1] ?? ''
  }

  it('draws the normal answer without an enclosure, and keeps every other channel', () => {
    // Almost every record is `authored`, so this was an enclosed, uppercase, letter-spaced badge
    // repeated down a whole page, arguing at chip strength for the one answer a reader never has
    // to act on. It gives up the box and nothing else: the word, the nib silhouette and its own
    // ink are three channels, and all three survive greyscale.
    expect(originRule('authored')).toContain('border-color: transparent')
    const html = render(h(ui.OriginMark, { record: { origin: 'authored' } }))
    expect(html).toContain('Authored')
    expect(html).toContain('<svg')
    expect(originRule('authored')).toContain('color: var(--text-2)')
  })

  it('keeps fixture loud in four channels, and now it is the only origin in a box', () => {
    // Getting this one wrong in either direction has already cost two agents — three, now. The
    // 2026-08-13 UX pass quietened this mark on the observation that it is the heaviest object in a
    // row whose state is "orphaned", which is true and is not this chip's fault: an old row's state
    // chip is drawn at the faded alarm weight on purpose. This test refused the change and the
    // change was reverted. Quietening the normal answer is what makes the exceptional one
    // exceptional rather than merely different, so the gap between them is the whole mechanism.
    const fixture = originRule('fixture')
    expect(fixture).toContain('background: var(--panel-3)')
    expect(fixture).toContain('border-color: var(--border-strong)')
    expect(fixture).toContain('font-weight: 700')
    expect(fixture).toContain('color: var(--text)')
    // THE WORD IS "Made-up example" AND THE MARK IS NOT ONE STEP QUIETER FOR IT. The four
    // channels above are the loudness and they are unchanged; only the word a reader decodes
    // changed. "Fixture" was decodable on one table and this badge sits on 290 of 385 rows.
    expect(render(h(ui.OriginMark, { record: { origin: 'fixture' } }))).toContain('Made-up example')
    expect(render(h(ui.OriginMark, { record: { origin: 'fixture' } }))).not.toContain('>Fixture<')
  })

  it('leaves the three cases where Mole Office cannot say inside their boxes', () => {
    // They are questions, and a question is not the normal case either. Only `authored` is.
    for (const key of ['unrecorded', 'unknown-word', 'unserved']) {
      expect(originRule(key), `${key} has a rule of its own that this test did not expect`).toBe('')
    }
    // So all three take the shared origin rule, which still draws an edge. Asserted here as well,
    // because "no rule of their own" would also be true of three origins drawn with no box at all.
    //
    // IT IS --border-strong AND IT USED TO BE --border, WHICH IS WHY THE BOX WAS NOT THERE. This
    // line pinned the hairline, and tools/legibility.mjs measured the result at 1.16:1 in light and
    // 1.45:1 in dark on 15 August 2026 — so the test passed on a box no reader could see, which is
    // the same as the box being absent and is exactly what the line above tries to refuse.
    // tests/legibility.test.ts holds the ratio this token is kept to.
    expect(ui.UI_CSS.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(
      /\.px-chip\.px-origin\s*\{[^}]*border-color: var\(--border-strong\)/,
    )
    expect(originRule('authored')).toContain('border-color: transparent')
  })
})

// --------------------------------------------------------------------------- the reason

describe('ReasonLine and FactorBreakdown', () => {
  const FACTORS = [
    { name: 'harm', points: 20, why: 'property is hurt if this is left: the print bed is tied up' },
    { name: 'owed', points: 0, why: 'nobody outside this project is waiting for it' },
  ] as const

  it('prints the server’s sentence word for word', () => {
    const html = render(h(ui.ReasonLine, { because: 'The ESA grant review is waiting for this' }))
    expect(html).toContain('The ESA grant review is waiting for this')
    expect(html).toContain('Why it is here')
  })

  it('refuses a row with no reason', () => {
    // A ranked row whose reason is missing is a bug in the rule, and a blank line hides it.
    expect(() => render(h(ui.ReasonLine, { because: '   ' }))).toThrow(/needs the reason/)
  })

  it('keeps the sentence visible and puts only the arithmetic behind a press', () => {
    const html = render(h(ui.ReasonLine, { because: 'it stopped short', factors: FACTORS, score: 20 }))
    expect(html).toContain('it stopped short')
    expect(html).toContain('<details')
    expect(html).toContain('Score 20')
    // Nothing is revealed by hover anywhere in this library: half the readers hold a phone.
    expect(ui.UI_CSS).not.toMatch(/:hover[^{]*\{[^}]*display:\s*block/)
  })

  it('shows the factors worth nothing, with their reason', () => {
    const html = render(h(ui.FactorBreakdown, { factors: FACTORS }))
    expect(html).toContain('nobody outside this project is waiting for it')
    expect(html).toContain('data-zero="1"')
  })

  it('draws each bar against that factor’s real maximum from the shared rule', async () => {
    const { FACTOR_MAX } = await import('../src/shared/attention.ts')
    const html = render(h(ui.FactorBreakdown, { factors: [{ name: 'harm', points: FACTOR_MAX.harm / 2, why: 'x' }] }))
    // Half of what harm could have given, so the bar means "half of its range" and not "half of
    // the widest bar on screen".
    expect(html).toContain('width:50%')
    expect(html).toContain(`of ${FACTOR_MAX.harm}`)
  })

  it('says so out loud when the score and the factors disagree', () => {
    const html = render(h(ui.FactorBreakdown, { factors: FACTORS, score: 99 }))
    expect(html).toContain('One of the two is wrong')
  })

  it('refuses an empty breakdown', () => {
    expect(() => render(h(ui.FactorBreakdown, { factors: [] }))).toThrow(/ranked by nothing/)
  })

  it('draws the safety floor as a statement about the ranking, inventing no sentence', () => {
    const html = render(h(ui.ReasonLine, { because: 'its state word is "open"', safetyFloor: true }))
    expect(html).toContain('Safety')
    expect(html).toContain('Age cannot move it')
  })
})

// --------------------------------------------------------------------------- standing explanation

/**
 * StandingNote is the one component in this library that draws DIFFERENT MARKUP at two widths, so
 * it is the one that needs a test saying nothing is lost at either.
 *
 * The width is read from `window.matchMedia`, so these tests answer that question themselves. The
 * stub is put in place for the length of one render and taken away again: leaving it behind would
 * make every later test in this file believe it was running on a phone.
 */
function atWidth<T>(narrow: boolean | 'no-matchmedia', run: () => T): T {
  const win = globalThis.window as unknown as { matchMedia?: unknown }
  const before = 'matchMedia' in win ? win.matchMedia : undefined
  if (narrow === 'no-matchmedia') delete win.matchMedia
  else win.matchMedia = () => ({ matches: narrow, addEventListener: () => {}, removeEventListener: () => {} })
  try {
    return run()
  } finally {
    if (before === undefined) delete win.matchMedia
    else win.matchMedia = before
  }
}

const STANDING = () =>
  h(ui.StandingNote, {
    summary: h('span', null, '2 say a person could be hurt · 61 of 360 need you'),
    opens: 'Why this order, and the rule',
    children: h('p', { className: 'prose' }, 'Something needs you when it is owed to somebody outside this project.'),
  })

describe('StandingNote', () => {
  it('adds nothing at all on a desk, so the wide layout is what it always was', () => {
    const html = atWidth(false, () => render(STANDING()))
    expect(html).toContain('owed to somebody outside this project')
    // No wrapper, no disclosure, no line of counts -- the children and only the children.
    expect(html).not.toContain('<details')
    expect(html).not.toContain('px-standing')
    expect(html).not.toContain('61 of 360 need you')
  })

  it('folds the same children behind a native disclosure on a phone, and loses none of them', () => {
    const html = atWidth(true, () => render(STANDING()))
    expect(html).toContain('<details')
    expect(html).toContain('61 of 360 need you')
    // The words are still on the page, inside the fold. Nothing was deleted to buy the space.
    expect(html).toContain('owed to somebody outside this project')
    // The counts come before the prose they stand for, which is the whole point of the swap.
    expect(html.indexOf('61 of 360 need you')).toBeLessThan(html.indexOf('owed to somebody outside this project'))
  })

  it('names what is behind the fold rather than saying “more”', () => {
    const html = atWidth(true, () => render(STANDING()))
    expect(html).toContain('Why this order, and the rule')
    expect(html).not.toMatch(/>\s*more\s*</i)
  })

  it('refuses a fold that cannot say what it holds', () => {
    expect(() =>
      atWidth(true, () => render(h(ui.StandingNote, { summary: '3 things', opens: '  ', children: 'prose' }))),
    ).toThrow(/name what is behind the fold/)
  })

  it('shows everything where the width cannot be asked, rather than folding on a guess', () => {
    // The uncertain answer has to be the one that hides nothing: a test runner, an old browser or
    // any window without matchMedia gets the whole explanation, never a fold nobody can see.
    const html = atWidth('no-matchmedia', () => render(STANDING()))
    expect(html).not.toContain('<details')
    expect(html).toContain('owed to somebody outside this project')
  })

  it('gives the disclosure a focus ring and a caret, since it is a real control', () => {
    expect(ui.UI_CSS).toContain('.px-standing-sum:focus-visible')
    expect(ui.UI_CSS).toMatch(/\.px-standing-open::after\s*\{\s*content/)
    expect(ui.UI_CSS).toMatch(/\.px-standing-sum\s*\{[^}]*min-height:\s*44px/)
  })
})

// --------------------------------------------------------------------------- the hidden count

describe('HiddenCount', () => {
  const GROUPS = [
    { label: 'things that happened and stopped short', count: 19 },
    { label: 'checklist items that stopped short', count: 14 },
    { label: 'pipeline steps that stopped short', count: 8 },
    { label: 'owed to somebody outside', count: 7 },
    { label: 'work that stopped short', count: 6 },
  ]

  it('states the exact count, names every hidden group, and gives a route to all of it', () => {
    const html = render(h(ui.HiddenCount, { shown: 7, total: 61, what: 'rows', href: '#/records', groups: GROUPS }))
    expect(html).toContain('7 of 61 rows shown')
    expect(html).toContain('the other 54 are')
    for (const group of GROUPS) expect(html).toContain(group.label)
    expect(html).toContain('href="#/records"')
  })

  it('never says “more”', () => {
    // The word this component exists to make impossible. "54 more" is a count with no content:
    // it cannot be acted on and it turns a complete archive into a feeling that something is gone.
    const html = render(h(ui.HiddenCount, { shown: 7, total: 61, what: 'rows', href: '#/records', groups: GROUPS }))
    expect(html.toLowerCase()).not.toMatch(/\bmore\b/)
  })

  it('refuses to fold a list without saying what is in the fold', () => {
    expect(() => render(h(ui.HiddenCount, { shown: 7, total: 61, what: 'rows', href: '#/x' }))).toThrow(/never the bare word/)
  })

  it('refuses a fold whose arithmetic does not balance', () => {
    // A line that says "the other 54 are: 3 sessions" is a list quietly losing fifty-one rows.
    expect(() =>
      render(h(ui.HiddenCount, { shown: 7, total: 61, what: 'rows', href: '#/x', groups: [{ label: 'sessions', count: 3 }] })),
    ).toThrow(/add up to 3/)
  })

  it('refuses a fold with no way out', () => {
    expect(() => render(h(ui.HiddenCount, { shown: 7, total: 61, what: 'rows', href: '  ', groups: GROUPS }))).toThrow(
      /route to the complete list/,
    )
  })

  it('answers “is this everything?” when the answer is yes', () => {
    // A different sentence, not a missing one. Nothing hidden is a real answer and is worth
    // reading before a word of the list below it.
    const html = render(h(ui.HiddenCount, { shown: 6, total: 6, what: 'paused records', href: '#/records' }))
    expect(html).toContain('6 of 6 paused records shown')
    expect(html).toContain('nothing is hidden')
  })

  it('refuses counts that are not counts', () => {
    expect(() => render(h(ui.HiddenCount, { shown: 9, total: 6, what: 'rows', href: '#/x' }))).toThrow(/is not a count/)
  })
})

// --------------------------------------------------------------------------- scan first

/**
 * The three disclosures that carry "scan first, explain on demand".
 *
 * WHAT THESE CAN AND CANNOT CHECK. There is no DOM here, so nothing below presses anything: the
 * open and closed states are read out of the markup `<details>` renders, which is exactly the
 * reason these components use the native element rather than a state variable. What IS checked is
 * the semantic layer -- that the scannable part is in the summary and the detail is not, that the
 * fold names what it holds and counts it, that nothing is deleted to buy the space, and that a
 * fold which cannot say what it holds refuses to render at all.
 */

describe('ScanRow', () => {
  const ROW = (extra: Record<string, unknown> = {}) =>
    h(ui.ScanRow, {
      title: 'Trial report: clamp holding-force section',
      sev: h(ui.StoredState, { state: 'open', progress: 'stopped_short', alarm: 'urgent', count: '6 days late' }),
      alarm: 'urgent',
      age: '6d late',
      opens: 'Why it is here',
      holds: { count: 5, what: 'rank factors' },
      href: '#/r/esa',
      children: h('p', null, 'The ESA grant review is waiting for this, and the date agreed was 2026-08-03'),
      ...extra,
    })

  it('puts the four things a scan needs in the summary and everything else below it', () => {
    const html = render(ROW())
    const summaryEnds = html.indexOf('</summary>')
    const summary = html.slice(0, summaryEnds)
    // what it is, what is wrong, how old -- all above the fold line
    expect(summary).toContain('Trial report: clamp holding-force section')
    expect(summary).toContain('open')
    expect(summary).toContain('6d late')
    // and the explanation is not
    expect(summary).not.toContain('The ESA grant review is waiting')
    expect(html).toContain('The ESA grant review is waiting')
  })

  it('uses the native disclosure, so opening it is the platform’s job and not a state variable', () => {
    const html = render(ROW())
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    // Closed at rest. A row that opened itself would be the wall of text this replaces.
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    expect(render(ROW({ open: true }))).toMatch(/<details[^>]*\sopen/)
  })

  it('names what opens and says exactly how much is behind it', () => {
    const html = render(ROW())
    expect(html).toContain('Why it is here')
    expect(html).toContain('5 rank factors')
  })

  it('refuses the bare word “more”, in every spelling of it', () => {
    for (const words of ['more', 'More', '5 more', 'Show more', 'see more…']) {
      expect(() => render(ROW({ opens: words })), words).toThrow(/Name what is behind the fold/)
    }
    expect(() => render(ROW({ opens: '  ' }))).toThrow(/name what is behind the fold/)
    // A label that CONTAINS the word is a sentence and is allowed.
    expect(render(ROW({ opens: '3 more sessions than yesterday' }))).toContain('3 more sessions than yesterday')
  })

  it('refuses a count with no noun after it', () => {
    expect(() => render(ROW({ holds: { count: 5, what: '  ' } }))).toThrow(/with no noun after it/)
    expect(() => render(ROW({ holds: { count: -1, what: 'factors' } }))).toThrow(/is not a count/)
  })

  it('keeps a count of zero rather than dropping it, because zero is an answer', () => {
    expect(render(ROW({ holds: { count: 0, what: 'rank factors' } }))).toContain('0 rank factors')
  })

  it('lets a fold with no meaningful count leave it out, and still names what opens', () => {
    const html = render(ROW({ holds: undefined }))
    expect(html).toContain('Why it is here')
    expect(html).not.toMatch(/px-scan-holds/)
  })

  it('takes the route to the record out of the summary, so one press does one thing', () => {
    // A link inside <summary> is pressed by the same click that opens the fold, and a control
    // that both navigates and expands is one the reader can never aim.
    const html = render(ROW())
    const summary = html.slice(0, html.indexOf('</summary>'))
    expect(summary).not.toContain('<a ')
    expect(html).toContain('href="#/r/esa"')
    expect(html).toContain('Open the whole record')
    // And the title is bare text, which is this library's word for "this does not navigate".
    expect(summary).not.toContain('px-nav')
  })

  it('draws the same severity column and the same alarm scale a Row does', () => {
    const html = render(ROW())
    expect(html).toContain('px-scan-sev')
    expect(html).toContain('data-alarm="urgent"')
    // The alarm colour is the state token, never a hard-coded red: in the mono theme it is
    // near-black and that is correct.
    expect(html).toContain('var(--st-failed)')
  })

  it('gives its own chip the level the row was drawn at, when it builds the chip', () => {
    // The defect that was on four pages at once: a row faded with age whose chip was still at
    // full alarm strength, so one line said two things about how urgent it is.
    const html = render(ROW({ sev: undefined, state: 'crashed', alarm: 'faded' }))
    expect(html.match(/data-alarm="faded"/g)?.length).toBe(2)
  })

  it('refuses two things in the severity column', () => {
    expect(() => render(ROW({ state: 'failed' }))).toThrow(/not both/)
  })

  it('carries a title in any script, uncut and unrecased', () => {
    const html = render(ROW({ title: '把借来的 SoilPen Mini 还给湿度组' }))
    expect(html).toContain('把借来的 SoilPen Mini 还给湿度组')
    expect(ui.UI_CSS).not.toMatch(/\.px-scan-title\s*\{[^}]*text-transform/)
    expect(ui.UI_CSS).not.toMatch(/\.px-scan-title\s*\{[^}]*letter-spacing/)
  })

  it('works for a row with no state and no age, which is what a query result is', () => {
    const html = render(
      h(ui.ScanRow, {
        title: '夹具标定 — gripper calibration',
        opens: 'What is missing, and who wanted it',
        holds: { count: 2, what: 'broken consumes links' },
        children: h('p', null, 'two links point at records that are not there'),
      }),
    )
    // The column stays reserved, so a mixed list still lines up down its left edge.
    expect(html).toContain('px-scan-sev')
    expect(html).toContain('2 broken consumes links')
    expect(html).not.toContain('data-alarm')
  })
})

describe('Explain', () => {
  const RULE = (extra: Record<string, unknown> = {}) =>
    h(ui.Explain, {
      declares: { surface: null },
      meaning: 'Something needs you when it is owed to somebody outside, or when its state says it stopped short.',
      opens: 'the whole rule, and what it leaves out',
      children: h('p', null, 'A promise recorded as kept is no longer owed.'),
      ...extra,
    })

  it('keeps one line of meaning visible and folds the paragraphs behind it', () => {
    const html = render(RULE())
    const summary = html.slice(0, html.indexOf('</summary>'))
    expect(summary).toContain('owed to somebody outside')
    expect(summary).not.toContain('A promise recorded as kept')
    // Nothing is deleted: the paragraphs are on the page, one press away.
    expect(html).toContain('A promise recorded as kept is no longer owed.')
  })

  it('says plainly that the control opens, and what it opens', () => {
    const html = render(RULE())
    expect(html).toContain('the whole rule, and what it leaves out')
    expect(ui.UI_CSS).toMatch(/\.px-explain-opens::after\s*\{\s*content/)
  })

  it('folds at every width, which is the whole difference from StandingNote', () => {
    // StandingNote renders its children and no wrapper above 480px. This one does not: the prose
    // it holds is furniture on a 1440px screen too.
    const wide = atWidth(false, () => render(RULE()))
    expect(wide).toContain('<details')
    expect(wide).toContain('the whole rule, and what it leaves out')
  })

  it('takes a count where one is meaningful and leaves it out where one is not', () => {
    expect(render(RULE({ holds: { count: 3, what: 'known gaps' } }))).toContain('3 known gaps')
    // One paragraph of prose has no meaningful count, and "1 explanation" is noise pretending
    // to be arithmetic.
    expect(render(RULE())).not.toContain('px-explain-holds')
  })

  it('refuses a fold that cannot say what it holds', () => {
    expect(() => render(RULE({ opens: '' }))).toThrow(/name what is behind the fold/)
    expect(() => render(RULE({ opens: 'Show more' }))).toThrow(/Name what is behind the fold/)
  })

  it('opens at rest when asked, so a screenshot can show the open state', () => {
    expect(render(RULE({ open: true }))).toMatch(/<details[^>]*\sopen/)
  })
})

describe('DataHealth', () => {
  const GROUPS = [
    {
      label: 'state words nobody has classified',
      count: 21,
      note: 'Mole Office cannot tell whether these stopped short, because nobody has said what the word means.',
      detail: h('p', null, 'seven problems that are “fixed”, nine ideas, three purchases'),
      href: '#/records',
    },
    {
      label: 'records with no state word',
      count: 97,
      note: 'Three different answers, kept apart.',
      detail: h('p', null, 'nine sessions, eighty-six notes, two of a kind Mole Office does not know'),
    },
    {
      label: 'put down on purpose',
      count: 6,
      note: 'A pause is a decision, not a failure, so none of these is on the attention list.',
      detail: h('p', null, 'each keeps the reason it was put down'),
    },
  ]
  const STRIP = (extra: Record<string, unknown> = {}) => h(ui.DataHealth, { groups: GROUPS, what: 'records', ...extra })

  it('states the exact total and every group by name, before any detail is opened', () => {
    const html = render(STRIP())
    expect(html).toContain('124')
    expect(html).toContain('in 3 groups')
    for (const group of GROUPS) expect(html).toContain(group.label)
    for (const group of GROUPS) expect(html).toContain(String(group.count))
  })

  it('adds its own total up rather than being told one, so the strip cannot disagree with itself', () => {
    const html = render(h(ui.DataHealth, { what: 'records', groups: [{ ...GROUPS[0]!, count: 3 }, { ...GROUPS[1]!, count: 4 }] }))
    expect(html).toContain('7')
    expect(html).toContain('in 2 groups')
  })

  it('holds each group’s detail behind its own count and nowhere else', () => {
    // Every detail is one press away -- nothing is deleted -- and each sits inside its own fold. A
    // closed fold draws its count and its sentence, and mounts its detail when it is opened (round 19
    // of wave 13w), so the detail is read here with every fold open.
    const opened = render(h(ui.DataHealth, { groups: GROUPS.map((group) => ({ ...group, open: true })), what: 'records' }))
    const folds = opened.split('<details').slice(1)
    expect(folds.length).toBe(3)
    expect(folds[0]).toContain('seven problems that are “fixed”')
    expect(folds[0]).not.toContain('nine sessions, eighty-six notes')
    expect(folds[1]).toContain('nine sessions, eighty-six notes')
    expect(folds[1]).not.toContain('seven problems that are “fixed”')
    // Closed, each fold is there with its count, and its detail is not drawn until it is opened.
    const closed = render(STRIP())
    expect(closed.match(/<details/g)?.length).toBe(3)
    expect(closed).not.toContain('seven problems that are “fixed”')
  })

  it('says why each group is a question rather than work', () => {
    const html = render(STRIP())
    expect(html).toContain('nobody has said what the word means')
    expect(html).toContain('A pause is a decision, not a failure')
    // And says it once for the whole strip too, in the words every surface shares.
    expect(html).toContain('None of these is on the attention list')
    expect(ui.DATA_HEALTH_LEAD.length).toBeGreaterThan(60)
  })

  it('prints a group with nothing in it as its count and its name, and does not offer to open it', () => {
    const html = render(
      h(ui.DataHealth, {
        what: 'records',
        groups: [GROUPS[0]!, { label: 'records of a kind Mole Office does not know', count: 0, note: 'a kind outside the fourteen would be reported here.' }],
      }),
    )
    expect(html).toContain('records of a kind Mole Office does not know')
    // The zero is the answer. Its sentence used to print inline and uncollapsed underneath it --
    // about forty-five words explaining a group with nothing in it to explain -- and it is read
    // where the group has members and opens onto them.
    expect(html).not.toContain('a kind outside the fourteen would be reported here')
    // One fold, not two. A disclosure onto nothing is a dead end.
    expect(html.match(/<details/g)?.length).toBe(1)
  })

  it('still requires the sentence of a group that has none in it, because the group may fill', () => {
    expect(() =>
      render(h(ui.DataHealth, { what: 'records', groups: [{ label: 'unknown kinds', count: 0, note: '  ' }] })),
    ).toThrow(/why it is a question rather than work/)
  })

  it('lets a page that says the strip’s own sentence in its heading stop the strip repeating it', () => {
    const spoken = render(STRIP())
    const quoted = render(STRIP({ leadSaidAbove: true }))
    expect(spoken).toContain('None of these is on the attention list')
    expect(quoted).not.toContain('None of these is on the attention list')
    // Every count and every group is still there: what is suppressed is one repeated sentence.
    for (const group of GROUPS) expect(quoted).toContain(group.label)
  })

  it('refuses a count with no way to the records behind it', () => {
    expect(() =>
      render(h(ui.DataHealth, { what: 'records', groups: [{ label: 'paused', count: 6, note: 'a decision, not a failure.' }] })),
    ).toThrow(/gives no way to see them/)
  })

  it('refuses a group that cannot say why it is a question', () => {
    expect(() =>
      render(h(ui.DataHealth, { what: 'records', groups: [{ label: 'paused', count: 6, note: '  ', detail: 'x' }] })),
    ).toThrow(/why it is a question rather than work/)
  })

  it('refuses an unlabelled group, an unreal count and an empty strip', () => {
    expect(() => render(h(ui.DataHealth, { what: 'records', groups: [] }))).toThrow(/needs its groups/)
    expect(() =>
      render(h(ui.DataHealth, { what: 'records', groups: [{ label: ' ', count: 1, note: 'x', detail: 'y' }] })),
    ).toThrow(/no label/)
    expect(() =>
      render(h(ui.DataHealth, { what: 'records', groups: [{ label: 'paused', count: 1.5, note: 'x', detail: 'y' }] })),
    ).toThrow(/not a count/)
    expect(() => render(h(ui.DataHealth, { what: ' ', groups: GROUPS }))).toThrow(/counts of/)
  })

  it('never says “more”', () => {
    expect(render(STRIP()).toLowerCase()).not.toMatch(/\bmore\b/)
  })

  it('opens one group at rest when asked, so a screenshot can show both states', () => {
    const html = render(h(ui.DataHealth, { what: 'records', groups: [{ ...GROUPS[0]!, open: true }, GROUPS[1]!] }))
    expect(html.match(/<details[^>]*\sopen/g)?.length).toBe(1)
  })
})

// --------------------------------------------------------------------------- the review surface

/**
 * THE COMPONENT SHEET IS HOW THIS VOCABULARY IS REVIEWED, so a primitive that is not on it is a
 * primitive nobody will find and every page will re-invent.
 *
 * The sheet reads two things a node runner does not have: `document.documentElement`, for the
 * preset bar that switches theme and density, and `getComputedStyle`, for the check that says
 * loudly when tokens.css has not loaded. Both are stubbed for the length of one render and put
 * back, the same way the width is stubbed above. Nothing about either stub is under test.
 */
function withSheetGlobals<T>(run: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>
  const hadDocument = 'document' in g
  const hadComputed = 'getComputedStyle' in g
  const document = g['document']
  const computed = g['getComputedStyle']
  g['document'] = { documentElement: { getAttribute: () => null } }
  g['getComputedStyle'] = () => ({ getPropertyValue: () => 'a value' })
  try {
    return run()
  } finally {
    if (hadDocument) g['document'] = document
    else delete g['document']
    if (hadComputed) g['getComputedStyle'] = computed
    else delete g['getComputedStyle']
  }
}

describe('the component sheet carries the whole disclosure vocabulary', () => {
  let sheet = ''
  beforeAll(() => {
    sheet = withSheetGlobals(() => render(h(ui.ComponentSheet)))
  })

  it('draws all four folds this library has', () => {
    for (const cls of ['px-scan', 'px-explain', 'px-health', 'px-reason']) {
      expect(sheet, `${cls} is not on the sheet`).toContain(cls)
    }
  })

  it('draws each fold both open and closed, so one photograph carries both states', () => {
    // There is no DOM here and nothing presses anything. "Open" means the attribute in the markup,
    // which is exactly what the screenshot tool sees, so this is the same fact the picture shows.
    const count = (pattern: string): number => (sheet.match(new RegExp(pattern, 'g')) ?? []).length
    for (const cls of ['px-scan', 'px-explain', 'px-health-group']) {
      const drawn = count(`<details class="${cls}"`)
      const opened = count(`<details class="${cls}"[^>]*\\sopen[=> ]`)
      expect(opened, `${cls} is never drawn open on the sheet`).toBeGreaterThan(0)
      expect(drawn - opened, `${cls} is never drawn closed on the sheet`).toBeGreaterThan(0)
    }
  })

  it('shows the scan row carrying all three shapes it has to serve', () => {
    // An attention item, a session and a query result. If the sheet only ever showed one of them,
    // the next page to need a different shape would build a second row component instead.
    expect(sheet).toContain('Archive report: scanner reading section')
    expect(sheet).toContain('catalogue — PageTrace at the desk')
    expect(sheet).toContain('broken consumes links')
  })

  it('shows a row title in Chinese, uncut, in the same list as the English ones', () => {
    expect(sheet).toContain('把借来的 PageReader Mini 还给灯笼档案组')
    expect(sheet).toContain('重印目录第 4 页（字号 13，页边距 2.0 cm）')
  })

  it('shows a health group with nothing in it, which is the state a real strip will spend most of', () => {
    // Its count and its name, and no note: the zero is the answer, and the sentence is read on the
    // day the group has members and opens onto them.
    expect(sheet).toContain('records of a kind Mole Office does not know')
    expect(sheet).not.toContain('would be reported here rather than filed under the nearest one')
  })

  it('shows the same six states at both emphases, so the difference can be photographed', () => {
    // Six agents apply this after me and the sheet is the only place the two drawings sit side by
    // side. A section that named the rule without drawing both would leave them guessing.
    expect(sheet).toContain('data-px-emphasis="analytical"')
    // The six are words THIS INTERFACE computes. They used to be the six session words borrowed
    // onto these chips; that borrow is deleted and a session state is a stored word now, drawn by
    // StoredState like every other word on a record.
    // `To do`, NOT `Todo`, and that is this commit. STATE_WORDS in src/web/components/ui.tsx was a
    // second table of readings for stored state words — it said `todo` reads "Todo" where the one
    // table in src/shared/words.ts says "to do" — and it is now derived from the one table, with
    // only `broken`, `inferred` and `overdue` declared beside it, because Mole Office stores none of
    // those three.
    for (const word of ['Running', 'To do', 'Done', 'Crashed', 'Overdue', 'Inferred']) {
      expect(sheet, `the sheet does not draw ${word}`).toContain(word)
    }
    // And the records case beside it: the same stored words, and the one row that changes.
    expect(sheet).toContain('chasing')
    for (const emphasis of ui.SURFACE_EMPHASES) {
      // Quotes are escaped in the markup, as they are wherever a sentence with a quoted question
      // is printed -- the note asks 'what needs me?' in as many words.
      expect(sheet, `the sheet does not say what ${emphasis} is`).toContain(
        ui.EMPHASIS_NOTES[emphasis].replace(/"/g, '&quot;'),
      )
    }
  })

  it('carries StandingNote, and shows it in the state a 1440 photograph can show', () => {
    // It is the one component here that draws different markup at two widths: above 480px it is
    // its children and no wrapper, which is what this render is. Its folded state lives in the
    // 390 picture of the same section, and the caption beside it on the sheet says so.
    // Wording only this component's children carry, so the check cannot pass on the Explain above
    // it that opens with a shortened version of the same rule.
    expect(sheet).toContain('anything recorded as able to hurt a person sits above')
    expect(sheet).not.toContain('px-standing')
    // And the sheet says in words where the other state is, since no picture at this width has it.
    expect(sheet).toContain('390 picture of this same section to see the fold')
  })
})

// --------------------------------------------------------------------------- how absence is drawn

/**
 * ONE WAY TO DRAW AN ABSENCE, AT THREE WEIGHTS — and the pair that may never be collapsed.
 *
 * These tests are about the fifth invariant surviving a round whose whole point was to make absence
 * quieter. Quiet is not blank and it is not one picture for two facts, so what is checked here is:
 * every tier draws SOMETHING, ordinary emptiness draws no sentence, and "nobody looked" and "there
 * are none" differ in the markup by more than their word.
 */
describe('absence, at three weights', () => {
  it('draws a dimmed dash for ordinary emptiness, and never a blank', () => {
    const html = render(h(ui.Absence, {}))
    expect(html).toContain('px-absent')
    // A blank region is the one thing this may not be: it would read as "there is none" on a screen
    // where the truth might be "nobody looked".
    expect(html).toMatch(/>[^<]*\S[^<]*</)
  })

  it('takes the reader’s own short word instead of the dash, and keeps the sentence on the tooltip', () => {
    const html = render(h(ui.Absence, { word: 'not sized', title: 'Nobody has said how long this takes.' }))
    expect(html).toContain('not sized')
    // The weight goes and the distinction stays: the sentence is not deleted, it is one hover away.
    expect(html).toContain('Nobody has said how long this takes.')
  })

  it('reads the sentence out even where it draws a dash, so quiet is not silence', () => {
    // A dash announces as nothing at all. Without this a reader using a screen reader meets the
    // heading and then silence, which is the blank this component exists to avoid — arriving
    // through the one channel no screenshot shows.
    const html = render(h(ui.Absence, { title: 'Nothing is scheduled for today.' }))
    expect(html).toContain('px-sr')
    expect(html).toContain('>Nothing is scheduled for today.<')
    // And it is the same string as the tooltip, never a second wording of it.
    expect(html).toContain('title="Nothing is scheduled for today."')
  })

  it('draws “nobody looked” and “there are none” apart in the markup, not only in the word', () => {
    const unlooked = render(h(ui.Absence, { tier: 'told-apart', looked: false, title: 'Nobody swept the machine.' }))
    const none = render(h(ui.Absence, { tier: 'told-apart', looked: true, title: 'The sweep found none.' }))
    // A GAP SOMEBODY CAN CLOSE IS ENCLOSED IN A DASHED EDGE. An answer is enclosed in nothing.
    // Strip the words and the two are still different pictures — which is the whole test, because a
    // reader scanning a column reads the shape before the word.
    expect(unlooked).toContain('data-edge="dashed"')
    expect(none).toContain('data-edge="none"')
    const shape = (html: string) => html.replace(/>[^<>]*</g, '><')
    expect(shape(unlooked)).not.toBe(shape(none))
    // And each still says it in words, so nothing is carried by shape alone.
    expect(unlooked).toContain('not looked at')
    expect(none).toContain('none')
  })

  it('refuses to draw a told-apart absence without saying which of the two it is', () => {
    // The type checker is the real guard — `looked` is required on that arm of the union — so this
    // is the runtime half: a caller reaching past the types still gets one of the two drawings and
    // never a third, merged one. `undefined` is not a third answer and is drawn as "nobody looked",
    // which is the safe side: it claims nothing was established.
    const html = render(h(ui.Absence, { tier: 'told-apart', looked: undefined, title: 'x' } as never))
    expect(html).toContain('data-edge="dashed"')
    expect(html).toContain('not looked at')
  })

  it('gives a sentence and a box only to an absence the reader must act on', () => {
    const loud = render(
      h(ui.Absence, { tier: 'must-act-on', sentence: 'Nobody has sized any of this work, so there is no size column.' }),
    )
    expect(loud).toContain('data-tier="must-act-on"')
    expect(loud).toContain('so there is no size column')
    // The quiet tiers do not get that box, which is what stops ordinary emptiness being the loudest
    // object in a column.
    expect(render(h(ui.Absence, { word: 'none' }))).not.toContain('must-act-on')
  })

  it('draws an untiered Empty quietly, and does not drop a word of it', () => {
    const html = render(h(ui.Empty, { message: 'Nothing points at this record yet.' }))
    // Every word survives: shortening needs somebody to have decided the tier, and this caller has
    // not. What goes is the dashed box, the second background and the extra padding.
    expect(html).toContain('Nothing points at this record yet.')
    expect(html).not.toContain('data-tier="must-act-on"')
  })

  it('keeps the quiet drawings out of the loud one’s clothes, in the stylesheet', () => {
    // The box is what made ordinary emptiness shout, so it is spent on exactly one selector.
    const loud = ui.UI_CSS.match(/\.px-empty\[data-tier="must-act-on"\]\s*\{[^}]*\}/)?.[0] ?? ''
    expect(loud).toContain('dashed')
    expect(loud).toContain('--panel-2')
    const quiet = ui.UI_CSS.match(/\n\.px-empty\s*\{[^}]*\}/)?.[0] ?? ''
    expect(quiet, 'the untiered empty state still draws a box').not.toContain('dashed')
    expect(quiet, 'the untiered empty state still paints a second background').not.toContain('--panel-2')
  })
})

// --------------------------------------------------------------------------- the new marks

describe('marks for the new semantics', () => {
  it('draws a stored safety consequence at the top of the alarm scale, with its own word', () => {
    const html = render(h(ui.ConsequenceMark, { consequence: { bearer: 'person', what: 'the arm keeps moving' } }))
    expect(html).toContain('Safety')
    expect(html).toContain('data-alarm="urgent"')
    expect(html).toContain('the arm keeps moving')
  })

  it('draws the five other bearers quietly, because only one of them is an emergency', () => {
    for (const bearer of ['outside', 'property', 'dependent', 'owner', 'none'] as const) {
      const html = render(h(ui.ConsequenceMark, { consequence: { bearer, what: 'x' } }))
      expect(html, bearer).not.toContain('data-alarm="urgent"')
    }
  })

  it('says out loud when nobody has recorded who is hurt', () => {
    // The difference between a row that scored zero for harm because it is harmless and one that
    // scored zero because nobody looked. A blank would make those two identical.
    const html = render(h(ui.ConsequenceMark, { consequence: null, withSentence: true }))
    expect(html).toContain('No consequence recorded')
    expect(html).toContain('Nobody has said who is hurt')
  })

  it('draws a pause with its reason and what brings it back', () => {
    const html = render(
      h(ui.PauseMark, {
        pause: { since: '2026-08-01', why: 'The gauge went back to the lab.', until: { date: '2026-09-01' } },
        note: 'put down on 2026-08-01: The gauge went back to the lab. it resumes on 2026-09-01',
      }),
    )
    expect(html).toContain('Paused')
    expect(html).toContain('it resumes on 2026-09-01')
  })

  it('marks an open-ended pause as open-ended rather than as one that is still waiting', () => {
    const html = render(h(ui.PauseMark, { pause: { since: '2026-06-02', why: 'no gauge' } }))
    expect(html).toContain('open-ended')
  })

  it('lifts a pause whose date has passed, and only that one', () => {
    const expired = render(h(ui.PauseMark, { pause: { since: '2026-05-20', why: 'x', until: { date: '2026-08-01' } }, dueToResume: true }))
    const live = render(h(ui.PauseMark, { pause: { since: '2026-05-20', why: 'x', until: { date: '2026-09-01' } }, dueToResume: false }))
    expect(expired).toContain('data-alarm="raised"')
    expect(expired).toContain('due to resume')
    expect(live).not.toContain('data-alarm="raised"')
    // A pause is not bad news, so nothing about it is ever drawn at the top of the scale.
    expect(expired).not.toContain('data-alarm="urgent"')
  })

  it('shows a pause that has no reason as the gap it is', () => {
    expect(render(h(ui.PauseMark, { pause: null }))).toContain('Paused, no reason')
  })

  it('draws an unclassified word as a question and never as a verdict', async () => {
    const { unclassifiedNote } = await import('../src/shared/work.ts')
    const html = render(h(ui.UnclassifiedMark, { state: 'fixed', withSentence: true }))
    expect(html).toContain('Not classified')
    expect(html).toContain('fixed')
    expect(html).toContain(unclassifiedNote('fixed').replace(/"/g, '&quot;'))
    // Not an alarm. Mole Office has not decided the record is in trouble; it has found it cannot tell.
    expect(html).not.toContain('data-alarm="urgent"')
  })

  it('gives “no state at all” three different words for three different answers', () => {
    expect(render(h(ui.NoStateMark, { expected: true }))).toContain('No state written')
    expect(render(h(ui.NoStateMark, { expected: false }))).toContain('No state field')
    expect(render(h(ui.NoStateMark, { expected: null }))).toContain('Kind unknown')
  })

  it('takes a gate’s words from the shared contract', async () => {
    const { gateLabel } = await import('../src/shared/work.ts')
    const hard = render(h(ui.GateMark, { gate: { kind: 'hard' } }))
    const partial = render(h(ui.GateMark, { gate: { kind: 'partial', upTo: 'bench tuning without the arm' } }))
    expect(hard).toContain(gateLabel({ kind: 'hard' }))
    expect(partial).toContain('bench tuning without the arm')
    expect(partial).toContain('Partial gate')
    // A partial gate is a different fact, not a weaker hard gate, so it gets a different shape.
    expect(hard).not.toBe(partial)
  })

  it('shows a gate it cannot read rather than falling back to “hard”', () => {
    const html = render(h(ui.GateMark, { gate: { kind: 'partial' }, problem: 'no stage was recorded' }))
    expect(html).toContain('Gate unreadable')
    expect(html).toContain('no stage was recorded')
  })

  it('separates an inferred link from a confirmed one on four channels', () => {
    const confirmed = render(h(ui.LinkMark, { type: 'consumes' }))
    const inferred = render(h(ui.LinkMark, { type: 'consumes', inferred: true }))
    // the word
    expect(inferred).toContain('inferred')
    expect(confirmed).not.toContain('inferred')
    // the border style, which is the convention this app already had
    expect(inferred).toContain('data-inferred="1"')
    expect(ui.UI_CSS).toMatch(/\.px-chip\[data-inferred="1"\]\s*\{\s*border-style:\s*dashed/)
    // the colour
    expect(inferred).toContain('var(--st-inferred)')
    // the shape
    expect(inferred).toContain('stroke-dasharray')
    expect(confirmed).not.toContain('stroke-dasharray')
  })

  it('keeps a link whose far end was deleted, rather than dropping it', () => {
    const html = render(h(ui.LinkMark, { type: 'produces', broken: true }))
    expect(html).toContain('broken')
    expect(html).toContain('has been deleted')
  })
})

// --------------------------------------------------------------------------- families

describe('FamilyTag', () => {
  it('names all six families from the shared contract, and no seventh', async () => {
    const { KIND_FAMILIES } = await import('../src/shared/work.ts')
    const families = Object.keys(KIND_FAMILIES) as (keyof typeof KIND_FAMILIES)[]
    expect(families.length).toBe(6)
    for (const family of families) {
      expect(render(h(ui.FamilyTag, { family }))).toContain(KIND_FAMILIES[family].label)
    }
  })

  it('resolves a family from a kind with the one function that owns that mapping', () => {
    expect(render(h(ui.FamilyTag, { kind: 'obligation' }))).toContain('Work')
    expect(render(h(ui.FamilyTag, { kind: 'session' }))).toContain(KIND_FAMILIES.notes.label)
  })

  it('reports a kind no family covers instead of filing it under the nearest one', () => {
    const html = render(h(ui.FamilyTag, { kind: 'telemetry' }))
    expect(html).toContain('no family covers')
    expect(html).toContain('telemetry')
  })

  it('names its family in an attribute, so the rail can be drawn from the stylesheet', () => {
    const html = render(h(ui.FamilyTag, { family: 'findings', count: 24 }))
    expect(html).toContain('data-family="findings"')
    expect(ui.UI_CSS).toMatch(/\.px-family\[data-family="findings"\]/)
    expect(html).toContain('24')
  })

  it('carries no state, which is the half of the old restriction that still holds', () => {
    // A family is a place to read. It is not something a record can be IN, so it never takes the
    // state tone variables — a family colour sitting where a state colour goes would make two
    // different things look like one.
    const html = render(h(ui.FamilyTag, { family: 'findings' }))
    expect(html).not.toContain('--px-tone')
  })

  it('draws a family the same way a kind tag in that family does', () => {
    // A heading saying "Findings" and a tag saying "claim" under it are the same family. Two
    // drawings of one fact is this repository's recurring defect, so both read the same table.
    const heading = render(h(ui.FamilyTag, { family: 'findings' }))
    const tag = render(h(ui.Tag, { kind: 'claim' }))
    const glyph = (html: string): string => (/<svg[^>]*>(.*?)<\/svg>/s.exec(html) ?? ['', ''])[1] ?? ''
    expect(glyph(heading)).not.toBe('')
    expect(glyph(tag)).toBe(glyph(heading))
    expect(tag).toContain('data-family="findings"')
  })

  it('refuses to render an unnamed family', () => {
    expect(() => render(h(ui.FamilyTag, {}))).toThrow(/heading with no words/)
  })
})

// --------------------------------------------------------------------------- the six family rails

// --------------------------------------------------------------------------- the severity column

describe('the severity column holds one thing', () => {
  it('lets a stored state word sit in it, so the fixed column survives the new vocabulary', () => {
    const html = render(
      h(ui.Row, { title: 'obj — object detection session', sev: h(ui.StoredState, { state: 'idle', progress: 'stopped_short' }) }),
    )
    expect(html).toContain('px-row-sev')
    expect(html).toContain('waiting for you')
  })

  it('refuses two things in it', () => {
    expect(() => render(h(ui.Row, { title: 'x', state: 'failed', sev: 'also this' }))).toThrow(/not both/)
  })
})

// --------------------------------------------------------------------------- timestamps

/**
 * THIS BLOCK USED TO ASSERT THE OPPOSITE, AND IT WAS WRONG. Kept as a note because the way it was
 * wrong is worth more than the test is.
 *
 * It read:
 *
 *     it('reads the server’s UTC stamp as UTC, not as local time', () => {
 *       expect(ui.parseStamp('2026-08-07 12:00:00')?.toISOString()).toBe('2026-08-07T12:00:00.000Z')
 *     })
 *
 * The server does not write UTC stamps. `localStamp` writes LOCAL wall-clock time, deliberately,
 * so that a day means the operator's day — it is the loudest decision in the project and it is
 * written at the top of shared/time.ts. So this test asserted a premise that was never true, and
 * in doing so it PINNED the defect: `parseStamp` appended a `Z`, the browser read every stamp an
 * hour off, and the one test covering it agreed with the mistake and went green.
 *
 * It was also machine-dependent in the same way the bug was. On a machine set to UTC it passes
 * whichever way `parseStamp` behaves, because at offset zero local and UTC are the same thing.
 * That is why nothing caught this in two months: the assertion and the code were both wrong, and
 * the only machine that could have told them apart was not the one being used.
 *
 * The replacement asserts wall-clock fields rather than an ISO string, so it means the same thing
 * in every timezone. tests/time.test.ts is the full version — it runs in six.
 */
describe('timestamps', () => {
  it('reads a stored stamp as LOCAL time, which is what the server writes', () => {
    const parsed = ui.parseStamp('2026-08-07 12:00:00')
    expect(parsed).not.toBeNull()
    // Local getters on purpose: "12:00:00" means midday where the operator is standing.
    expect(parsed?.getHours()).toBe(12)
    expect(parsed?.getMinutes()).toBe(0)
    expect(parsed?.getDate()).toBe(7)
  })

  it('still honours a stamp that states its own timezone', () => {
    // Mole Office never writes these; other tools do, and a string that says Z means Z.
    expect(ui.parseStamp('2026-08-07T12:00:00Z')?.toISOString()).toBe('2026-08-07T12:00:00.000Z')
  })

  it('says so plainly when a stamp is unreadable', () => {
    expect(ui.parseStamp('not a date')).toBeNull()
    expect(ui.relativeTime('not a date')).toBe('not a date')
  })
})
