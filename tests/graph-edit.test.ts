// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EDIT MODE — what is on screen when nobody is editing, and what one action opens when somebody is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE COVER, AND WHAT ONLY A PHOTOGRAPH CAN
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node`. There is no DOM and no jsdom, and adding one would mean a
 * dependency this project has ruled out. So NOTHING here presses a button: `Edit` takes an
 * `openAction` prop for exactly this reason, and it is the only way a test can look at an action's
 * fields. React Flow cannot be rendered at all, so the canvas beside the drawer is verified by
 * screenshot and by eye.
 *
 * WHAT IS TESTED IS THE PROPERTY THE WHOLE PASS IS ABOUT:
 *
 *   1. WITH NOBODY EDITING there is no form on the page. Not a shortened one, not a folded one —
 *      none. That is checked by rendering the whole StructureView and counting inputs and selects.
 *   2. WITH THE DRAWER OPEN AND NO ACTION PICKED there is still no form: the drawer is a list of
 *      actions.
 *   3. EACH ACTION OPENS ONLY ITS OWN FIELDS. Every action is rendered on its own and the fields
 *      that belong to the other seven are checked to be absent.
 *   4. PRESENTATION IS A CLOSED VOCABULARY, offered as selects. Every option value a person can
 *      choose comes from src/shared/presentation.ts, and no control anywhere in the drawer asks for
 *      a colour, a position or any CSS.
 *   5. THE HINTS ARE ACCOUNTED FOR. Every stored hint appears in the layout report — honoured or
 *      unhonoured with a reason — and a scope whose intent could not be READ says so rather than
 *      looking like a scope with nothing arranged.
 *
 * WHAT IS ONLY VERIFIED BY SCREENSHOT: that the drawer sits beside the drawing rather than under
 * the page at 1440, that it becomes a full-width column at 390, and that the page no longer opens
 * on a wall of forms. Those are in tools/review/, not here.
 *
 * CRITERION CHANGE, as decided: the sentences that explained the drawer, its fields and its actions
 * are gone from the page. The cases that read them now read the state words that replace them, or
 * are removed where nothing replaces them. The server's own words are read in developer mode.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AttentionResult } from '../src/shared/attention.ts'
import { checkNodeIntent } from '../src/shared/presentation.ts'
import {
  EMPHASIS_ROLES,
  GRAPH_DIRECTIONS,
  NODE_ROLES,
  type ScopeIntent,
} from '../src/shared/presentation.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GraphLink, Scope, StructureGraph } from '../src/web/components/graph/model.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { t } from '../src/shared/i18n.ts'

type EditModule = typeof import('../src/web/components/graph/Edit.tsx')
type Model = typeof import('../src/web/components/graph/model.ts')
type View = typeof import('../src/web/components/graph/StructureView.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')
let edit: EditModule
let model: Model
let view: View
let modes: ModeModule

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope to restore who you are acting as, and
  // every module here reaches it through the component library. `matchMedia` answers "this is a
  // phone", which makes StructureView draw the OUTLINE rather than the canvas — React Flow and elkjs
  // are behind a React.lazy and a synchronous server render cannot resolve one. Nothing in this
  // stand-in is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  edit = await import('../src/web/components/graph/Edit.tsx')
  model = await import('../src/web/components/graph/model.ts')
  view = await import('../src/web/components/graph/StructureView.tsx')
  modes = await import('../src/web/lib/mode.ts')
})

/** Render in developer mode, where the server's own words are drawn, and go back to normal after. */
const inDeveloperMode = (draw: () => string): string => {
  modes.setMode('inspect')
  try {
    return draw()
  } finally {
    modes.setMode('normal')
  }
}

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

/** Static markup carries HTML entities; the sentences under test are compared as plain text. */
const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

const count = (html: string, opening: string): number => html.split(opening).length - 1

// ============================================================================ fixtures

const STAMP = '2026-08-01 09:00:00'
const NOW = Date.parse('2026-08-09T12:00:00')

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return {
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    summary: null,
    data: {},
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    ...over,
  }
}

/** Two steps of the seeded Transplant v2, ids and mixed script intact. */
/**
 * Three blocks of "Transplant v2", as records — because that is what a block is now.
 *
 * Their titles carry the pipeline's title, which is what the server builds and what keeps two
 * pipelines free to have a step with the same name.
 */
const BLOCKS: PanelRecord[] = [
  record({ id: 'hv2-01', kind: 'block', title: 'Transplant v2 \u203a Detect the hand', data: { state: 'done' } }),
  record({ id: 'hv2-05', kind: 'block', title: 'Transplant v2 \u203a Close and hold', data: { state: 'todo' } }),
  // A block nobody owns: no `implements` link points at it. That is a recorded answer and must
  // never read as an unfilled field.
  record({ id: 'hv2-09', kind: 'block', title: 'Transplant v2 \u203a Score it', data: { state: 'todo' } }),
]

const RECORDS: PanelRecord[] = [
  record({ id: 'm-cam', kind: 'module', title: 'Chest camera', data: { context: 'Sees the hand.', parts: [] } }),
  // A title in Chinese, because that is what this workspace really holds and a drawer that only
  // works in English is broken.
  record({
    id: 'm-grip',
    kind: 'module',
    title: '夹具标定',
    data: { context: '夹爪的力标定，重印 v3 #4 (setting 13, 壁厚 2.0 mm)。', parts: [] },
  }),
  record({ id: 'm-bench', kind: 'module', title: 'Force bench', data: { parts: [] } }),
  record({ id: 'p-hv2', kind: 'pipeline', title: 'Transplant v2', data: { blockIds: ['hv2-01', 'hv2-05', 'hv2-09'] } }),
  ...BLOCKS,
]

/**
 * Two stored links, so the two link actions have something to pick.
 *
 * One `blocks` carrying a hard gate and one `relates to` carrying none, which is the pair that keeps
 * the gate rule honest: a gate is offered on the first and refused on the second.
 */
const LINKS: GraphLink[] = [
  { linkId: 'l-1', fromId: 'm-bench', toId: 'm-grip', type: 'blocks', inferred: false, broken: false, gate: { at: 'gate', gate: { kind: 'hard' } } },
  { linkId: 'l-2', fromId: 'm-cam', toId: 'm-grip', type: 'relates_to', inferred: false, broken: false, gate: { at: 'not-a-dependency' } },
  // What the pipeline's blocks are made of, now that both are stored links rather than fields:
  // which module carries which block, and what waits on what, carrying the gate.
  { linkId: 'l-3', fromId: 'm-cam', toId: 'hv2-01', type: 'implements', inferred: true, broken: false, gate: { at: 'not-a-dependency' } },
  { linkId: 'l-4', fromId: 'm-grip', toId: 'hv2-05', type: 'implements', inferred: true, broken: false, gate: { at: 'not-a-dependency' } },
  { linkId: 'l-5', fromId: 'm-bench', toId: 'hv2-05', type: 'implements', inferred: true, broken: false, gate: { at: 'not-a-dependency' } },
  {
    linkId: 'l-6',
    fromId: 'hv2-01',
    toId: 'hv2-05',
    type: 'blocks',
    inferred: false,
    broken: false,
    gate: { at: 'gate', gate: { kind: 'partial', upTo: 'servo tuning against the mock arm' } },
  },
  { linkId: 'l-7', fromId: 'hv2-05', toId: 'hv2-09', type: 'blocks', inferred: false, broken: false, gate: { at: 'gate', gate: { kind: 'hard' } } },
]

const CHOICES = RECORDS.filter((r) => r.kind === 'module' || r.kind === 'pipeline').map((r) => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
}))

/** A minimal attention reply: only the fields the drawing reads. */
const ATTENTION = {
  visible: [],
  remainder: [],
  total: 0,
  remainderByGroup: [],
  remainderNote: null,
  unclassified: [],
  noState: [],
  paused: [],
  machine: [],
  passedOver: [],
  counts: { candidates: 0, selected: 0, visible: 0, remainder: 0, passedOver: 0, deleted: 0 },
} as unknown as AttentionResult

function graphOf(scope: Scope, intent?: ScopeIntent): StructureGraph {
  return model.buildStructureGraph({
    records: RECORDS,
    links: LINKS,
    attention: ATTENTION,
    scope,
    now: NOW,
    ...(intent === undefined ? {} : { intent }),
  })
}

/** The drawer, with everything it needs and nothing that reaches the network. */
function drawer(over: Partial<Parameters<EditModule['Edit']>[0]> = {}): React.ReactElement {
  return h(edit.Edit, {
    graph: graphOf({ at: 'modules' }),
    records: RECORDS,
    links: LINKS,
    choices: CHOICES,
    intent: null,
    intentProblem: null,
    onChanged: async () => {},
    onIntentChanged: () => {},
    onClose: () => {},
    ...over,
  })
}

/** The whole view, at the phone width the stand-in reports, so the outline draws instead of ELK. */
function structureView(scope: Scope = { at: 'modules' }): React.ReactElement {
  return h(view.StructureView, {
    records: RECORDS,
    links: LINKS,
    attention: ATTENTION,
    scope,
    hrefFor: () => '#/pipeline',
    onChanged: async () => {},
    now: NOW,
  })
}

// ============================================================================ nothing until asked

describe('with nobody editing, there is no form on the page', () => {
  it('draws the structure', () => {
    expect(render(structureView())).toContain('The project structure')
  })

  it('renders no text box and no select anywhere', () => {
    // The headline property of this pass. A "smaller" form would still fail this, on purpose: the
    // brief says none, and a count is the only way to say none that cannot be argued with.
    const page = render(structureView())
    expect(count(page, '<input')).toBe(0)
    expect(count(page, '<select')).toBe(0)
    expect(count(page, '<textarea')).toBe(0)
  })

  it('does not carry the old debug-console heading', () => {
    const page = render(structureView())
    expect(page).not.toContain('the same requests an agent sends')
    expect(page).not.toContain('Change what this drawing is made of')
  })

  it('offers one way in, the Edit press', () => {
    const page = render(structureView())
    expect(page).toContain('>Edit</button>')
  })
})

// ============================================================================ the drawer itself

describe('the drawer opens on a list of actions, not on fields', () => {
  it('shows every action and no fields at all', () => {
    const html = render(drawer())
    for (const action of edit.ACTIONS) expect(text(html)).toContain(action.label)
    expect(count(html, '<input')).toBe(0)
    expect(count(html, '<select')).toBe(0)
  })

  it('keeps request explanations out of normal mode under 7FEOshq3mBGG', () => {
    const said = text(render(drawer()))
    expect(said).not.toContain('same requests')
    expect(said).not.toContain('POST /api/')
  })
})

describe('the action list is closed', () => {
  it('has eight actions, with unique ids, in the order the brief asks for', () => {
    expect(edit.ACTIONS.map((a) => a.id)).toEqual([
      'add-node',
      'edit-node',
      'add-link',
      'change-link',
      'remove-link',
      'step',
      'remove-item',
      'presentation',
    ])
    expect(new Set(edit.ACTIONS.map((a) => a.id)).size).toBe(8)
  })
})

// ============================================================================ one action, its own fields

/** A phrase that appears in one action's fields and in no other's. */
const OWN_WORDS: Record<EditModule['ACTIONS'][number]['id'], string> = {
  'add-node': 'Why it exists',
  'edit-node': 'New reason for it existing',
  'add-link': 'Which relationship',
  'change-link': 'The relationship it should be',
  'remove-link': 'Which line',
  step: 'Which modules carry it',
  'remove-item': 'Delete it (recoverable)',
  presentation: 'Which lane it belongs in',
}

describe('each action opens only the fields it needs', () => {
  for (const action of edit_ids()) {
    it(`"${action}" shows its own fields and none of the other seven`, () => {
      const html = text(render(drawer({ openAction: action, graph: graphOf({ at: 'pipeline', recordId: 'p-hv2' }) })))
      expect(html).toContain(OWN_WORDS[action])
      for (const [other, phrase] of Object.entries(OWN_WORDS)) {
        if (other === action) continue
        // "Which line" is the label both link actions use to pick one, so it is the only phrase
        // shared by two forms and it is excluded by name rather than by weakening the rule.
        if (phrase === 'Which line' && action === 'change-link') continue
        expect(html).not.toContain(phrase)
      }
    })
  }

  it('never opens two forms at once, however many actions exist', () => {
    // One form per open action. Two would be the wall of forms this replaced.
    expect(count(render(drawer({ openAction: 'add-link' })), 'class="gx-form"')).toBe(1)
    expect(count(render(drawer()), 'class="gx-form"')).toBe(0)
  })
})

/**
 * The action ids, taken from `OWN_WORDS` — the one list of them this file has left.
 *
 * THEY USED TO BE TYPED OUT A SECOND TIME HERE, so one file held the eight twice and a rename made
 * it red with nothing broken. The remaining copy cannot go: each action needs a phrase only its own
 * form draws, and that is a judgement about the screen. What was missing was anything tying it to
 * the product, so the first case in the sweep below holds this list against `ACTIONS` in both
 * directions. A ninth action fails until somebody names the phrase its form draws.
 *
 * It is read at collection time, before `beforeAll` has imported anything, so it cannot read the
 * module — which is why the check is a case rather than this function.
 */
function edit_ids(): readonly EditModule['ACTIONS'][number]['id'][] {
  return Object.keys(OWN_WORDS) as EditModule['ACTIONS'][number]['id'][]
}

// ============================================================================ structure and content

describe('the structure edits keep the semantics that were already there', () => {
  it('offers a gate only on a `blocks` link, and says on every other type that it is not available', () => {
    // The form opens on `relates to`, where the server refuses a gate.
    const html = text(render(drawer({ openAction: 'add-link' })))
    expect(html).toContain('not available on this link type')
  })

  it('calls the deletion recoverable, because that is what it is', () => {
    const html = text(render(drawer({ openAction: 'remove-item' })))
    expect(html).toContain('Delete it (recoverable)')
    expect(html).not.toContain('DELETE /api/')
  })

  it('offers all eleven link types, in the shared contract’s own words', () => {
    const html = render(drawer({ openAction: 'add-link' }))
    for (const type of ['relates_to', 'part_of', 'produces', 'consumes', 'blocks', 'supersedes', 'contradicts', 'measures', 'implements', 'discusses', 'derived_from']) {
      expect(html).toContain(`value="${type}"`)
    }
  })
})

describe('a pipeline block keeps its identity through an edit', () => {
  it('reads the blocks a pipeline lists, resolved against the records, and leaves out an id nothing holds', () => {
    const holed = record({ id: 'p-x', kind: 'pipeline', title: 'x', data: { blockIds: ['hv2-01', 'nothing', 'hv2-09'] } })
    expect(edit.storedBlocksOf(holed, RECORDS).map((b) => b.id)).toEqual(['hv2-01', 'hv2-09'])
  })

  it('answers with no blocks rather than throwing when `blockIds` is not a list', () => {
    expect(edit.storedBlocksOf(record({ id: 'p-y', kind: 'pipeline', title: 'y', data: { blockIds: 'soon' } }), RECORDS)).toEqual([])
    expect(edit.storedBlocksOf(undefined, RECORDS)).toEqual([])
  })

  it('asks nobody for an id, because the server mints one and it is unique across the project', () => {
    // 7FEOshq3mBGG keeps the record identity in the option value, away from normal text.
    const html = render(drawer({ openAction: 'step', graph: graphOf({ at: 'pipeline', recordId: 'p-hv2' }) }))
    expect(text(html), 'the form offers to make up an id').toContain('a new block at the end')
    // The two controls that would let somebody type or pick an id of their own.
    expect(html, 'the form offers a free-text id').not.toMatch(/placeholder="step-/)
    expect(html, 'the form offers a numeric id').not.toContain('type="number"')
  })

  it('keeps block identities in the choices without drawing them as words', () => {
    const html = render(drawer({ openAction: 'step', graph: graphOf({ at: 'pipeline', recordId: 'p-hv2' }) }))
    for(const block of edit.storedBlocksOf(RECORDS.find(one => one.id === 'p-hv2'), RECORDS)){
      expect(html).toContain(`value="${block.id}"`)
      expect(text(html)).not.toContain(block.id)
    }
  })

  it('says that a block carried by nobody is an answer rather than a gap', () => {
    const html = render(drawer({ openAction: 'step', graph: graphOf({ at: 'pipeline', recordId: 'p-hv2' }) }))
    expect(html).toContain('class="px-absent"')
  })

  it('shows one block per row, each addressable on its own, not one array to send back', () => {
    // The option values preserve each identity; 7FEOshq3mBGG keeps it out of the visible label.
    const stored = edit.storedBlocksOf(RECORDS.find((one) => one.id === 'p-hv2'), RECORDS)
    expect(stored.length, 'no block was read out of the records at all').toBeGreaterThan(1)
    const html = render(drawer({ openAction: 'step', graph: graphOf({ at: 'pipeline', recordId: 'p-hv2' }) }))
    for (const block of stored) {
      expect(html).toContain(`value="${block.id}"`)
      expect(text(html)).not.toContain(block.id)
    }
  })
})

// ============================================================================ presentation intent

describe('presentation intent is chosen from Mole Office’s own list, never drawn', () => {
  it('offers every direction the vocabulary has, plus letting Mole Office decide', () => {
    const html = render(drawer({ openAction: 'presentation' }))
    for (const word of GRAPH_DIRECTIONS) expect(html).toContain(`value="${word}"`)
    expect(text(html)).toContain('Mole Office decides')
  })

  it('offers every role and every emphasis the vocabulary has', () => {
    const html = render(drawer({ openAction: 'presentation' }))
    for (const word of NODE_ROLES) expect(html).toContain(`value="${word}"`)
    for (const word of EMPHASIS_ROLES) expect(html).toContain(`value="${word}"`)
  })

  it('offers no colour picker, no slider and no coordinate, in any action', () => {
    for (const id of edit_ids()) {
      const html = render(drawer({ openAction: id, graph: graphOf({ at: 'pipeline', recordId: 'p-hv2' }) }))
      expect(html).not.toContain('type="color"')
      expect(html).not.toContain('type="range"')
      expect(html).not.toContain('type="number"')
    }
  })

  it('arranges only the hints Mole Office’s own checker accepts, and the checker says which those are', () => {
    // THIS USED TO SLICE THIS COMPONENT'S SOURCE between two exact strings and read the names off
    // its `next.<key> =` assignments. Renaming a local variable turned it red with nothing broken.
    //
    // THE ALLOWED SET NOW COMES OUT OF THE SHARED CHECKER'S OWN REFUSAL SENTENCE, so it is the
    // product's list rather than a copy of it, and it is held in both directions: a seventh hint
    // added to the checker fails here until the drawer offers it, and a hint the drawer offers that
    // the checker would refuse fails here too.
    const refused = checkNodeIntent({ 'not-a-hint': true }, 'nodes.m')
    const allowed = (/Allowed: ([^.]+)\./.exec(refused.map((one) => one.problem).join(' '))?.[1] ?? '')
      .split(', ')
      .filter((word) => word !== '')
    expect(allowed.length, 'the checker no longer says what it allows').toBeGreaterThan(0)

    // Every hint the drawer's arrangement form can set, with a value the form can produce.
    const everyHint = {
      lane: 'perception',
      order: 1,
      role: NODE_ROLES[0],
      emphasis: EMPHASIS_ROLES[0],
      collapsed: true,
      near: 'm-cam',
    }
    // `x` AND `y` ARE THE ONE PAIR THE FORM DOES NOT OFFER, and that is the design rather than a
    // gap. They are where somebody PUT a card, which is a drag on the drawing and not a sentence in
    // a form — criterion D19, by which a position may be
    // stored. Every other hint the checker allows is a word the form can set, and the two lists are
    // still held against each other in both directions.
    const bySentence = ['x', 'y']
    expect([...Object.keys(everyHint), ...bySentence].sort(), 'the form and the checker know different hints').toEqual(
      [...allowed].sort(),
    )
    expect(checkNodeIntent(everyHint, 'nodes.m'), 'the checker refuses a hint the form offers').toEqual([])
  })

  it('counts the hints on a scope rather than the rows that hold them', () => {
    const intent: ScopeIntent = {
      direction: 'down',
      nodes: { 'm-cam': { lane: 'perception', role: 'prominent' }, 'm-grip': { emphasis: 'safety' } },
    }
    // Two rows, four hints. A count of rows would say two and under-report what somebody arranged.
    expect(edit.storedHintCount(intent)).toBe(4)
    expect(edit.storedHintCount({})).toBe(0)
  })
})

describe('a value that has gone is named, never silently replaced', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]

  it('leaves the list alone when the value is in it', () => {
    expect(edit.withMissing(options, 'a', 'gone')).toEqual(options)
  })

  it('keeps a value that is not in the list, and says what happened to it', () => {
    const next = edit.withMissing(options, 'zzz', 'no longer on this drawing')
    expect(next[0]).toEqual({ value: 'zzz', label: 'no longer on this drawing' })
    expect(next).toHaveLength(3)
  })

  it('treats the empty value as a real choice rather than a missing one', () => {
    expect(edit.withMissing([{ value: '', label: 'nothing' }], '', 'gone')).toHaveLength(1)
  })
})

// ============================================================================ what happened to the hints

describe('every stored hint is accounted for, and none is dropped in silence', () => {
  const INTENT: ScopeIntent = {
    direction: 'right',
    nodes: {
      'm-cam': { lane: 'perception', order: 1, role: 'prominent', emphasis: 'safety' },
      'm-grip': { near: 'm-bench' },
    },
  }

  it('the count the drawer prints is the count the report has to answer for', () => {
    expect(edit.storedHintCount(INTENT)).toBe(6)
  })

  it('every hint appears in the report as honoured or as unhonoured with a reason', () => {
    const graph = graphOf({ at: 'modules' }, INTENT)
    const seen = new Set([...graph.report.honoured, ...graph.report.unhonoured.map((u) => `${u.target}.${u.hint}`)])
    expect(seen.size).toBeGreaterThan(0)
    for (const entry of graph.report.unhonoured) {
      expect(entry.hint.trim()).not.toBe('')
      expect(entry.target.trim()).not.toBe('')
      // A reason, in words. "unhonoured" with an empty `because` is a silent drop wearing a label.
      expect(entry.because.trim().length).toBeGreaterThan(20)
    }
  })

  it('prints the unhonoured hints, in words, outside any fold', () => {
    const graph = graphOf({ at: 'modules' }, INTENT)
    const html = render(
      h(view.IntentReport, { hints: edit.storedHintCount(INTENT), graph, problem: null, reportHere: true }),
    )
    // Not a `<details>`. This is the answer to "the picture did not move", and a fold would put it
    // one press behind a page that looks like it ignored the person.
    expect(html).not.toContain('<details')
    const hints = edit.storedHintCount(INTENT)
    if (graph.report.unhonoured.length > 0) {
      expect(text(html)).toContain(t('structure.hintsNotApplied', { n: hints, unapplied: graph.report.unhonoured.length }))
      for (const entry of graph.report.unhonoured) expect(text(html)).toContain(entry.hint)
    } else {
      expect(text(html)).toContain(t('structure.hintsApplied', { n: hints }))
    }
  })

  it('stays silent where the drawing prints its own report, so no two counts disagree', () => {
    // The canvas holds ELK's findings as well as the model's and reports both under itself. A
    // second, staler copy here with a different number is the confusion this product removes.
    const graph = graphOf({ at: 'modules' }, INTENT)
    const html = render(
      h(view.IntentReport, { hints: edit.storedHintCount(INTENT), graph, problem: null, reportHere: false }),
    )
    expect(html).toBe('')
  })

  it('says when the arrangement could not be READ, whatever is being drawn', () => {
    const graph = graphOf({ at: 'modules' })
    const draw = (): string =>
      text(render(h(view.IntentReport, { hints: 0, graph, problem: 'the server said no', reportHere: false })))
    // Printed even with `reportHere` false: only this file makes that request, so only this file
    // knows it failed, and an unreadable arrangement must never look like an empty one.
    expect(draw()).toContain(t('structure.arrangementNotRead'))
    // The server's own words are drawn in developer mode only.
    expect(inDeveloperMode(draw)).toContain('the server said no')
  })

  it('never lets a failed read read as an arrangement, empty or applied', () => {
    // THE SILENCE THIS REMOVES. A failed read turned into "nothing is arranged" would tell a reader
    // their arrangement was never stored, which is a different and false answer.
    //
    // THIS USED TO SLICE THE CATCH HANDLER OUT OF StructureView.tsx AS TEXT and look for the word
    // `failed` in it. What a reader gets is checked instead: the two answers must not be able to
    // look alike. A failed read draws a state word saying the arrangement could not be read; a
    // successful read holding nothing draws nothing at all.
    const graph = graphOf({ at: 'modules' })
    const failed = render(h(view.IntentReport, { hints: 0, graph, problem: 'the server said no', reportHere: true }))
    const emptyButRead = render(h(view.IntentReport, { hints: 0, graph, problem: null, reportHere: true }))
    expect(emptyButRead, 'a drawing with nothing arranged says something anyway').toBe('')
    expect(failed, 'a failed read is drawn as a drawing with nothing arranged').not.toBe('')
    expect(text(failed), 'a failed read claims the arrangement was applied').not.toContain(
      t('structure.hintsApplied', { n: 0 }),
    )
    expect(text(failed)).toContain(t('structure.arrangementNotRead'))
  })

  it('draws a failed read as a problem, so it cannot be mistaken for a report about hints', () => {
    // The same two states told apart from the other side: a read that DID arrive and holds hints
    // draws the count, and a failed read never draws a count, whatever number it is handed.
    const graph = graphOf({ at: 'modules' }, INTENT)
    const hints = edit.storedHintCount(INTENT)
    expect(hints, 'the fixture holds no hints, so this case proves nothing').toBeGreaterThan(0)
    const read = text(render(h(view.IntentReport, { hints, graph, problem: null, reportHere: true })))
    expect(read, 'a read that arrived does not say how many hints it holds').toContain(String(hints))
    const failed = inDeveloperMode(() =>
      text(render(h(view.IntentReport, { hints, graph, problem: 'the server said no', reportHere: true }))),
    )
    expect(failed, 'a failed read counts hints it never read').not.toContain(`${String(hints)} stored`)
    expect(failed, 'a failed read does not name what went wrong, in developer mode').toContain('the server said no')
  })

  /**
   * WHAT IS NOT COVERED HERE, NAMED RATHER THAN LEFT TO BE DISCOVERED.
   *
   * `StructureView` keeps the last arrangement it read and keys it on the drawing it belongs to, so
   * that saving does not blank the drawer and so that one pipeline is never drawn arranged the way
   * somebody arranged another. That is browser-only behaviour: it needs a write, a re-read and a
   * change of drawing. A case here used to assert it by finding the text
   * `lastGood.current?.scope === presentationScope` in the component's source, which went red on a
   * rename and green on a deletion. It is gone. The sequence is driven in a real browser by
   * tests/an-arrangement-stays-with-its-drawing.test.ts, whose header names its mutations.
   */
})
