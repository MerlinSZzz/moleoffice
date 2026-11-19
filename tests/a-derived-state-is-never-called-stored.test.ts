// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Criterion, before the correction (wtl6mbb8aqN5, forwarded by the starter).
 * OLD: stateOf returned a work word without its source; StateSays and StoredState called a
 * namespace-derived word stored. Normal tooltips only repeated the shown word.
 * NEW: stateOf stays literal (X0AsCcI2hTQO); the canonical work reading carries its source;
 * the stored audit keeps absence; derived work chips
 * name their derivation, and every state tooltip distinguishes stored from derived.
 * WHY: a valid mainSuiteFix is evidence for a work reading, never a stored data.state.
 * Existing assertions in other files are retained. These casts let this criterion compile on
 * the starting source; missing provenance fails inside a test body, never in a setup hook.
 */
import { createElement as h } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { transformSync } from 'esbuild'
import { parseSync } from 'rolldown/utils'
import { MAIN_SUITE_FIX_EXAMPLE, mainSuiteFixSchema, type MainSuiteFix } from '../src/shared/main-suite-fix.ts'
import { progressOf, stateOfWork, unclassifiedNote } from '../src/shared/work.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { OpenLoop, OpenLoops } from '../src/server/lib/openloops.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n, setWordLanguage, WORD_LISTS } from '../src/shared/i18n.ts'

type Source = 'stored' | 'derived from mainSuiteFix' | null
type Family = typeof import('../src/web/components/family/read.ts')
type Page = typeof import('../src/web/pages/RecordPage.tsx')
type Ui = typeof import('../src/web/components/ui.tsx')
let family: Family
let page: Page
let ui: Ui
let mode: typeof import('../src/web/lib/mode.ts')

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  Object.assign(globalThis, { window: {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    addEventListener: () => {}, removeEventListener: () => {},
  } })
  family = await import('../src/web/components/family/read.ts')
  page = await import('../src/web/pages/RecordPage.tsx')
  ui = await import('../src/web/components/ui.tsx')
  mode = await import('../src/web/lib/mode.ts')
})
afterEach(() => { mode?.setMode('normal'); setWordLanguage('en') })

function repair(extra: Partial<MainSuiteFix> = {}): MainSuiteFix {
  return mainSuiteFixSchema.parse({ ...structuredClone(MAIN_SUITE_FIX_EXAMPLE), ...extra })
}
const examples = () => [
  { word: 'open', mainSuiteFix: repair({ pending: { phase: 'takeout', says: 'Synthetic take-out has not landed.' } }) },
  { word: 'fixed', mainSuiteFix: repair({ outcome: { fixed: 'c'.repeat(40) }, fixedReceipt: { recordId: 'synthetic-original-green', seq: 1, contentHash: '1'.repeat(16) } }) },
  { word: 'worked_around', mainSuiteFix: repair({ outcome: { returned: 'synthetic-returned-change' } }) },
]
function synthetic(data: Record<string, unknown>): PanelRecord {
  return { id: 'synthetic-state-provenance', workspaceId: 'default', ownerId: THE_TEST_OFFICES_OWNER.id,
    kind: 'problem', title: 'Synthetic state provenance specimen', summary: 'Made-up data for the state provenance criterion.',
    origin: 'fixture', data, createdAt: '2026-10-15 10:00:00', updatedAt: '2026-10-15 10:00:00', deletedAt: null }
}
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) frozen(child)
    Object.freeze(value)
  }
  return value
}
function html(element: React.ReactElement): string {
  return renderToStaticMarkup(element).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

it('the literal state and canonical work provenance stay distinct without changing synthetic data', async () => {
  const work = await import('../src/shared/work.ts')
  const reader = (work as unknown as { readWorkState?: (data: unknown) => { state: unknown; source: Source } }).readWorkState
  expect(reader, 'the canonical work reader carries provenance').toBeTypeOf('function')
  for (const example of examples()) {
    const record = frozen(synthetic({ mainSuiteFix: example.mainSuiteFix }))
    const before = JSON.stringify(record)
    const read = family.stateOf(record)
    expect(read.word).toBeNull()
    expect(read.progress).toBeNull()
    expect(reader!(record.data)).toEqual({ state: example.word, source: 'derived from mainSuiteFix' })
    expect(stateOfWork(record.data)).toBe(example.word)
    expect(Object.hasOwn(record.data, 'state')).toBe(false)
    expect(JSON.stringify(record)).toBe(before)
  }
  const mainSuiteFix = examples()[2]!.mainSuiteFix
  for (const state of ['open', 'accepted', 'chasing', '', null, 0, false, undefined]) {
    const record = frozen(synthetic({ state, mainSuiteFix }))
    const before = JSON.stringify(record)
    const read = family.stateOf(record)
    expect(read.word).toBe(typeof state === 'string' && state.trim() !== '' ? state : null)
    expect(read.progress).toBe(progressOf(state))
    expect(reader!(record.data)).toEqual({ state, source: 'stored' })
    expect(JSON.stringify(record)).toBe(before)
  }
  for (const data of [{}, { mainSuiteFix: {} }, { mainSuiteFix: { ...mainSuiteFix, extra: true } }]) {
    const record = frozen(synthetic(data))
    const read = family.stateOf(record)
    expect(read.word).toBeNull()
    expect(read.progress).toBeNull()
    expect(reader!(record.data)).toEqual({ state: undefined, source: null })
  }
})

// Exact-wording criterion, before production (T0K2hpzm-4mR):
// OLD: "Records of this kind carry a state, and none was written here, so Mole Office cannot tell whether this stopped short."
// NEW: "Records of this kind carry a state, and none was written here, so the stored state does not say whether this stopped short."
// WHY: storage absence limits what the stored state says, while another reader may know work progress.
it('StateSays reports stored absence for derived states and preserves explicit stored controls', async () => {
  const { en } = await import('../src/shared/words/en.ts')
  expect(en['sheet.noState.unwrittenDetail']).toBe('Records of this kind carry a state, and none was written here, so the stored state does not say whether this stopped short.')
  mode.setMode('inspect')
  for (const example of examples()) {
    const record = frozen(synthetic({ mainSuiteFix: example.mainSuiteFix }))
    const before = JSON.stringify(record)
    const drawn = html(h(page.StateSays, { record }))
    const auditText = drawn.replace(/<[^>]*>/g, ' ')
    expect(drawn).toContain('No state written')
    expect(drawn).not.toContain('The stored state word is')
    expect(drawn).not.toContain('px-chip-stored-word')
    expect(drawn).not.toContain('cannot tell whether this stopped short')
    expect(auditText).toContain('No state word is stored. The work state is derived from mainSuiteFix.')
    expect(JSON.stringify(record)).toBe(before)
    expect(Object.hasOwn(record.data, 'state')).toBe(false)
  }
  const mainSuiteFix = examples()[2]!.mainSuiteFix
  const explicit = html(h(page.StateSays, { record: frozen(synthetic({ state: 'open', mainSuiteFix })) }))
  expect(explicit.replace(/<[^>]*>/g, ' ')).toContain('The stored word is “open”')
  expect(explicit).toContain('The stored state word is &quot;open&quot;')
  expect(explicit).not.toContain('No state written')
  const unclassified = html(h(page.StateSays, { record: frozen(synthetic({ state: 'chasing', mainSuiteFix })) }))
  expect(unclassified).toContain('Not classified')
  expect(unclassified).toContain(unclassifiedNote('chasing').replaceAll('"', '&quot;'))
  for (const data of [{}, { state: null, mainSuiteFix }, { mainSuiteFix: {} }]) {
    expect(html(h(page.StateSays, { record: frozen(synthetic(data)) }))).toContain('No state written')
  }
})

// Criterion, before the correction (Q8hs3eC8EZWo, whole in report ANirei54JQD-).
// OLD: StoredState defaulted an omitted source to 'stored', so a generic chip drew the same
// "Stored state: {word}" Normal title as a caller that said 'stored' on purpose.
// NEW: an omitted source keeps the bare Normal title; an explicit 'stored' keeps "Stored state: {word}";
// an explicit 'derived from mainSuiteFix' keeps "Derived state: {word}". The Developer title,
// explanation and the qualifier's own-line layout are unchanged.
// WHY: only the explicit source-aware callers (Work and Planning) get the "Stored state:" /
// "Derived state:" title; a generic chip that does not say where its word comes from keeps its old
// title. The production change that meets this criterion follows in its own commit.
it('StoredState distinguishes derived and stored words in its actual labels and tooltips', () => {
  const derived = { state: 'worked_around', progress: progressOf('worked_around'), source: 'derived from mainSuiteFix' } as
    Parameters<Ui['StoredState']>[0] & { source: Source }
  for (const inspect of [false, true]) {
    mode.setMode(inspect ? 'inspect' : 'normal')
    const drawn = html(h(ui.StoredState, derived))
    expect(drawn).toContain('Derived state')
    expect(drawn).not.toContain('The stored state word is')
    expect(drawn).not.toContain('stored as worked_around')
    if (inspect) {
      expect(drawn).toContain('derived from mainSuiteFix')
      expect(drawn).toContain('worked_around')
    } else {
      expect(drawn).toContain('title="Derived state: worked around"')
    }
    const omitted = html(h(ui.StoredState, { state: 'idle', progress: progressOf('idle') }))
    expect(omitted).toContain(inspect ? 'The stored state word is &quot;idle&quot;' : 'title="waiting for you"')
    expect(omitted).not.toContain('Stored state:')
    expect(omitted).not.toContain('derived from mainSuiteFix')
    const explicit = html(h(ui.StoredState, { state: 'idle', progress: progressOf('idle'), source: 'stored' }))
    expect(explicit).toContain(inspect ? 'The stored state word is &quot;idle&quot;' : 'title="Stored state: waiting for you"')
    expect(explicit).not.toContain('Derived state')
    const absent = html(h(ui.StoredState, { state: null, progress: null }))
    expect(absent).toContain('no state')
    expect(absent).not.toContain('Derived state')
  }
})

// Criterion first: U3sKBmfkPgq7 and u7VfWBKsLFVx, forwarded whole in C4tuNb6JK5tP.
// The optional structural field compiles before production adds it to LeftOutGroup.
type FinishedReason = OpenLoops['leftOut'][number] & { stateSource?: Exclude<Source, null> }
// NOTHING OPEN AROUND A RECORD DRAWS NO SECTION, in either mode (decision 8SkQQo1x69IV, revision 3). So each reading
// below carries one made-up open record by default, and the left-out groups are read under it.
const ONE_OPEN: OpenLoop = { id: 'synthetic-open-one', kind: 'problem', says: 'Synthetic open problem beside the finished groups.',
  from: 'title', state: 'open', progress: progressOf('open'), whoseMove: null, hops: 1, lastChanged: '2026-10-15 10:00:00', modules: [] }
function finishedReading(groups: FinishedReason[], loops: OpenLoop[]): OpenLoops {
  const count = groups.reduce((sum, group) => sum + group.count, 0)
  return { workspaceId: 'default', standingAt: null, reach: null,
    rung: { asked: 'full', drew: 'full', why: null }, loops, leftOut: groups,
    counts: { candidates: count + loops.length, carried: loops.length, leftOut: count, outsideThePopulation: 0 },
    attachment: { openLoopsInProject: loops.length, attachedToNoModule: loops.length, sentence: 'Synthetic open population.' },
    whoseMove: { person: 0, agent: 0, either: 0, nobodyHasSaid: loops.length },
    size: { budgetBytes: 16384, fits: true }, note: 'Synthetic finished-reason reading.' }
}
function drawFinished(groups: FinishedReason[], inspect: boolean, loops: OpenLoop[] = [ONE_OPEN]): string {
  mode.setMode(inspect ? 'inspect' : 'normal')
  const record = frozen(synthetic({}))
  const answer = frozen(finishedReading(groups, loops))
  const before = JSON.stringify({ record, answer })
  const drawn = html(h(page.StillOpenHere, { record, relations: [], reading: { status: 'ready', value: answer } }))
  expect(JSON.stringify({ record, answer })).toBe(before)
  return drawn
}

it('StillOpenHere renders the derived finished reason in both languages, distinct from stored provenance', async () => {
  const derived: FinishedReason = { bucket: 'finished', stateSource: 'derived from mainSuiteFix',
    sentence: 'the work has reached its end, as worked out from its fix-round record', count: 3,
    ids: ['synthetic-fixed-one', 'synthetic-fixed-two', 'synthetic-returned'] }
  expect(drawFinished([derived], true, []), 'nothing is open around it, and the section is drawn').toBe('')
  const drawn = drawFinished([derived], true)
  expect(drawn).toContain('the work has reached its end, as worked out from its fix-round record')
  expect(drawn).toContain('<span class="num">3</span>')
  expect(drawn).not.toContain('its own state word says the work reached its end')
  expect(drawFinished([derived], false)).not.toContain('rp-open-cut-one')
  const { theWaitingList } = await import('./words-waiting-for-translation.ts')
  const key = 'g2b.open.leftOut.finishedDerived'
  expect(theWaitingList().waiting.filter(one => one.key === key && one.reason === 'noChinese')).toEqual([])
  expect(WORD_LISTS.zh[key]).toBeDefined()
  setWordLanguage('zh')
  const { t } = createI18n('zh')
  const chinese = drawFinished([derived], true)
  expect(chinese).toContain(t(key))
  expect(chinese).not.toContain(t('g2b.open.leftOut.finished'))
})

it('StillOpenHere keeps the exact stored finished reason with absent or explicit stored provenance beside a derived group', () => {
  for (const provenance of [{}, { stateSource: 'stored' as const }]) {
    const stored: FinishedReason = { bucket: 'finished', ...provenance,
      sentence: 'its own state word says the work reached its end', count: 2, ids: ['synthetic-done', 'synthetic-accepted'] }
    const drawn = drawFinished([stored, { bucket: 'finished', stateSource: 'derived from mainSuiteFix',
      sentence: 'the work has reached its end, as worked out from its fix-round record', count: 1, ids: ['synthetic-returned'] }], true)
    expect(drawn).toContain('<span class="num">2</span> its own state word says the work reached its end')
    expect(drawn.match(/class="rp-open-cut-one"/g)).toHaveLength(2)
    expect(drawFinished([stored], false)).not.toContain('rp-open-cut-one')
  }
})

// Scope addition C5fkfgDaxSsh: only the BundlePanel preview row key changes.
// Execute that actual JSX branch without adding a production export or launching a browser.
// OLD: bucket alone gives both finished rows the same React identity.
// NEW: their identities are distinct and stable when their order changes; words stay exact.
it('the bundle preview gives stored and derived finished rows distinct stable React identities', async () => {
  const source = readFileSync(new URL('../src/web/components/BundlePanel.tsx', import.meta.url), 'utf8')
  const parsed = parseSync('BundlePanel.tsx', source)
  const branches: string[] = []
  function visit(value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    const node = value as { type?: string; start?: number; end?: number; callee?: { start: number; end: number } }
    if (node.type === 'CallExpression' && node.callee && source.slice(node.callee.start, node.callee.end) === 'preview.leftOut.map') {
      branches.push(source.slice(node.start, node.end))
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (typeof child === 'object') visit(child)
    }
  }
  visit(parsed.program)
  expect(branches).toHaveLength(1)
  const compiled = transformSync(`const draw = (preview, inspect, t) => (${branches[0]!});`,
    { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', target: 'es2022' }).code
  type Row = React.ReactElement<{ children: React.ReactNode }>
  const draw = new Function('h', `${compiled}; return draw;`)(h) as
    (preview: { leftOut: { bucket: string; says: string; count: number }[] }, inspect: boolean, t: (key: string, values?: unknown) => string) => Row[]
  const stored = { bucket: 'finished', says: 'its own state word says the work reached its end', count: 2 }
  const derived = { bucket: 'finished', says: 'the work has reached its end, as worked out from its fix-round record', count: 3 }
  const { createI18n } = await import('../src/shared/i18n.ts')
  const translate = createI18n('en').t as (key: string, values?: unknown) => string
  for (const inspect of [false, true]) {
    const rows = draw({ leftOut: [stored, derived] }, inspect, translate)
    expect(rows.map(row => row.key).every(key => key !== null)).toBe(true)
    expect(new Set(rows.map(row => row.key)).size).toBe(2)
    const reversed = draw({ leftOut: [derived, stored] }, inspect, translate)
    expect(reversed.map(row => row.key)).toEqual(rows.map(row => row.key).reverse())
    if (inspect) expect(html(h('ul', null, rows))).toBe(
      '<ul><li>its own state word says the work reached its end</li><li>the work has reached its end, as worked out from its fix-round record</li></ul>')
    else expect(html(h('ul', null, rows))).toBe(html(h('ul', null,
      h('li', null, translate('g7a.bundles.leftOut', { n: 2 })), h('li', null, translate('g7a.bundles.leftOut', { n: 3 })))))
  }
})
