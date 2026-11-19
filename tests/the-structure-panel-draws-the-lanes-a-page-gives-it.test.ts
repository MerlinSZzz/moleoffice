// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STRUCTURE PANEL DRAWS THE LANES A PAGE GIVES IT, AND HANDS THE PAGE EACH ANSWER ABOUT WHAT IS STORED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * On a filed pipeline's address the "Graph" side draws the pipeline's lanes where it drew the canvas, and the
 * panel around it stays: its title, Edit and the drawer, "Which drawing", "Graph" and "List", and its reading,
 * problem and absence states. The page makes the lanes drawing and gives it to `StructureView` as one optional
 * prop, `lanes`. The drawing is made from what is stored about how the drawing is shown, and `StructureView` is
 * what reads that, so it hands each answer up through `lanes.onIntent`: the page draws a lane stored through the
 * editor without a read of its own. With no `lanes` prop, everything is as before.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, in Chromium, from made-up records, a stand-in drawing and a stand-in canvas
 * ---------------------------------------------------------------------------------------
 *
 * The page's code is bundled for the browser. The canvas module is replaced by a stand-in that counts its own
 * loading, and the reads of what is stored, what restricts a record and who is working on one are answered here.
 *
 *   1. given lanes, the "Graph" side draws the page's drawing and the canvas is not loaded; the count says
 *      "N cards", N being the records the drawing draws; and the panel hands up what restricts those records and
 *      who is working on them, by title, and not its own omissions;
 *   2. with no lanes, the same drawing loads the canvas, counts the drawing's own cards, and hands up the canvas's
 *      words and the omission said in the body, as before;
 *   3. given lanes, it opens on the "Graph" side at 390 pixels wide; with no lanes it opens on "List" there;
 *   4. given lanes, "Show all", the isolated fold and the fold on what is stored are not shown; with no lanes, on
 *      the same drawing, all three are;
 *   5. given lanes, "How this is shown" offers which card, its lane and its order, and none of direction, room,
 *      emphasis, folded or kept beside; with no lanes it offers all of them;
 *   6. given lanes, it hands the page an answer each time the answer changes: "reading" with nothing kept, then
 *      "read" with what is stored; drawn again with nothing changed, it hands nothing more; a lane stored through
 *      the editor reaches the page as "reading" with the old answer kept and then "read" with the lane, while
 *      the drawer says it is reading again, and the page's drawing shows the lane with no read of the page's
 *      own; a read again that fails reaches the page as "failed" with the problem and the last answer kept, and
 *      the panel says the problem itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Each in src/web/components/graph/StructureView.tsx or Edit.tsx, copied first and restored with cp and checked
 * with cmp:
 *   draw the canvas on the "Graph" side whether lanes are given or not → case 1 goes red.
 *   count the drawing's own cards when lanes are given → case 1 goes red.
 *   hand up the omissions when lanes are given → case 1 goes red.
 *   open on "List" at a narrow width whether lanes are given or not → case 3 goes red.
 *   offer "Show all" whether lanes are given or not → case 4 goes red.
 *   give the editor every field whether lanes are given or not → case 5 goes red.
 *   hand the page an answer on every drawing, with `lanes` among the effect's dependencies → case 6 goes red.
 *   keep nothing while reading again → case 6 goes red.
 *   keep nothing when a read again fails → case 6 goes red.
 *   hand the page only the first answer → case 6 goes red.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Plugin } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { t } from '../src/shared/i18n.ts'
import { pipelineScope } from '../src/shared/presentation.ts'
import { RESTRICTION_KINDS, RESTRICTION_SEVERITY } from '../src/shared/restriction.ts'
import { targetAttributes } from '../src/shared/targets.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { PRESENCE_STATES, STAGE_SAYS, type DomainStage } from '../src/shared/workdomain.ts'
import type { RestrictionReading } from '../src/web/api.ts'
import type { PresenceHere } from '../src/web/components/graph/Presence.tsx'
import type { GraphLink, Scope } from '../src/web/components/graph/model.ts'

// ============================================================================ made-up records

const STAMP = '2026-11-15 10:00:00'
const NOW = Date.parse('2026-11-15T12:00:00')

function record(over: Partial<PanelRecord> & Pick<PanelRecord, 'id' | 'kind' | 'title'>): PanelRecord {
  return { workspaceId: 'default', ownerId: THE_TEST_OFFICES_OWNER.id, summary: null, data: {}, createdAt: STAMP, updatedAt: STAMP, deletedAt: null, ...over }
}

function link(over: Partial<GraphLink> & Pick<GraphLink, 'linkId' | 'fromId' | 'toId'>): GraphLink {
  return { type: 'relates_to', inferred: false, broken: false, gate: { at: 'not-a-dependency' }, ...over }
}

const FIRST_STEP = 'Made-up pipeline › Made-up first step'
const SECOND_STEP = 'Made-up pipeline › Made-up second step'

/** One pipeline of two steps, which also lists a step that is not on file: the omission said in the body. */
const PIPELINE = {
  records: [
    record({ id: 'pipeline-one', kind: 'pipeline', title: 'Made-up pipeline', data: { blockIds: ['step-one', 'step-two', 'step-gone'] } }),
    record({ id: 'step-one', kind: 'block', title: FIRST_STEP, data: { state: 'done' } }),
    record({ id: 'step-two', kind: 'block', title: SECOND_STEP, data: { state: 'todo' } }),
  ],
  links: [link({ linkId: 'link-one', fromId: 'step-one', toId: 'step-two', type: 'blocks', gate: { at: 'gate', gate: { kind: 'hard' } } })],
  scope: { at: 'pipeline', recordId: 'pipeline-one' } satisfies Scope,
  lanes: ['step-one', 'step-two'],
}

/** Four modules, one link between two of them: the other two are isolated, so "Show all" has something to add. */
const MODULES = {
  records: ['one', 'two', 'three', 'four'].map((n) =>
    record({ id: `module-${n}`, kind: 'module', title: `Made-up module ${n}`, data: { context: 'made-up context', parts: [] } }),
  ),
  links: [link({ linkId: 'link-two', fromId: 'module-one', toId: 'module-two' })],
  scope: { at: 'modules' } satisfies Scope,
  lanes: ['module-one', 'module-two', 'module-three', 'module-four'],
}

const ACTIVE: RestrictionReading = {
  restrictionId: 'restriction-one',
  kind: RESTRICTION_KINDS[0],
  title: 'Made-up restriction',
  severity: RESTRICTION_SEVERITY[0],
  allowedUses: [],
  disallowedClaims: [],
  holdsField: null,
  reach: { how: 'direct' },
  standing: { state: 'active' },
}

const WORKING: PresenceHere = {
  domainId: 'domain-one',
  domainTitle: 'Made-up domain',
  agentId: 'agent-one',
  objective: 'made-up objective',
  stage: (Object.keys(STAGE_SAYS) as DomainStage[])[0] ?? 'filed',
  presence: PRESENCE_STATES[0],
  quietForMinutes: 3,
  lastSignFrom: 'made-up sign',
  worstOverlapRank: null,
}

const FIXTURE = {
  now: NOW,
  attention: { visible: [], remainder: [], total: 0 },
  drawings: { pipeline: PIPELINE, modules: MODULES },
  restrictions: { 'step-one': [ACTIVE] },
  presence: { 'step-two': [WORKING] },
}

// ============================================================================ the page

/** The canvas, stood in for: it counts its own loading and says one made-up fact. */
const standInCanvas: Plugin = {
  name: 'a-stand-in-canvas',
  setup(build) {
    build.onResolve({ filter: /^\.\/Canvas\.tsx$/ }, (args) =>
      args.importer.endsWith('StructureView.tsx') ? { path: 'canvas', namespace: 'stand-in' } : undefined,
    )
    build.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
      loader: 'js',
      resolveDir: process.cwd(),
      contents: `import { createElement as h, useEffect } from 'react';
        window.canvasLoaded = (window.canvasLoaded ?? 0) + 1;
        export default function StandInCanvas({ onSays }) {
          useEffect(() => { onSays(['made-up canvas fact']); }, [onSays]);
          return h('div', { id: 'stand-in-canvas' }, 'A stand-in canvas');
        }`,
    }))
  },
}

let browser: Browser
let script = ''
let server: Server | undefined
let site = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h, useCallback, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { api } from './src/web/api.ts';
        import { presentation } from './src/web/components/graph/Edit.tsx';
        import { StructureView } from './src/web/components/graph/StructureView.tsx';
        const F = ${JSON.stringify(FIXTURE)};
        const t8 = { reads: [], writes: [], answers: [], said: [], asked: [], renders: 0, hold: false, failNext: false, held: [] };
        window.t8 = t8;
        const kept = new Map();
        const storeOf = (scope) => {
          if (!kept.has(scope)) kept.set(scope, { scope, intent: { nodes: {} }, targets: [], report: { honoured: [], unhonoured: [] }, note: 'made-up note' });
          return kept.get(scope);
        };
        presentation.read = (scope) => {
          t8.reads.push(scope);
          const answer = () => {
            if (t8.failNext) { t8.failNext = false; return Promise.reject(new Error('made-up problem')); }
            return Promise.resolve(structuredClone(storeOf(scope)));
          };
          if (!t8.hold) return answer();
          return new Promise((done, failed) => { t8.held.push(() => answer().then(done, failed)); });
        };
        presentation.putNode = (scope, target, intent) => {
          t8.writes.push({ scope, target, intent });
          const now = storeOf(scope);
          now.intent = { ...now.intent, nodes: { ...now.intent.nodes, [target]: intent } };
          return Promise.resolve({ note: 'made-up note' });
        };
        api.restrictionsOnThese = (ids) => {
          t8.asked.push('restrictions ' + ids.join(','));
          return Promise.resolve({ byRecord: Object.fromEntries(ids.map((id) => [id, F.restrictions[id] ?? []])), couldNotCheck: [], note: '' });
        };
        api.presenceOnThese = (ids) => {
          t8.asked.push('presence ' + ids.join(','));
          return Promise.resolve({ byRecord: Object.fromEntries(ids.map((id) => [id, F.presence[id] ?? []])), domainsRead: 1, couldNotCheck: [], note: '' });
        };
        const onSays = (facts) => { t8.said.push([...facts]); };
        const lanesIn = (stored) => stored === null ? '' : Object.entries(stored.intent.nodes ?? {})
          .map(([id, node]) => id + ' ' + (node.lane ?? '') + ' ' + (node.order ?? '')).sort().join('; ');
        function Page({ which, withLanes }) {
          t8.renders += 1;
          const [answer, setAnswer] = useState(null);
          const onIntent = useCallback((next) => { t8.answers.push(next); setAnswer(next); }, []);
          const one = F.drawings[which];
          const drawing = answer === null ? null : h('div', {
            id: 'stand-in-drawing',
            'data-at': answer.at,
            'data-lanes': lanesIn(answer.at === 'read' ? answer.stored : answer.kept),
          }, 'A stand-in drawing');
          return h(StructureView, {
            records: one.records, links: one.links, attention: F.attention, scope: one.scope,
            hrefFor: () => '#/', onChanged: () => {}, now: F.now, onSays,
            ...(withLanes ? { lanes: { drawing, records: one.lanes, onIntent } } : {}),
          });
        }
        const root = createRoot(document.getElementById('app'));
        let last = null;
        t8.draw = (props) => { last = props; root.render(h(Page, props)); };
        t8.again = () => { root.render(h(Page, { ...last })); };
        t8.release = () => { for (const go of t8.held.splice(0)) go(); };`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    // A module, as ui.tsx reads its own address at load.
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [standInCanvas],
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  // THE PAGE AND ITS BUNDLE ARE SERVED OVER HTTP FROM THIS PROCESS, on a port of its own, and each page fetches the
  // bundle, where it was handed to each page through Playwright. Every other address answers what the page's route
  // answered before: the office's addresses a 404, and the rest the empty page. Nothing is kept in the browser's cache.
  const serving = createServer((asked, answer) => {
    const path = new URL(asked.url ?? '/', 'http://127.0.0.1').pathname
    if (path === '/structure-panel.js') {
      answer.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
      answer.end(script)
    } else if (path.startsWith('/api/')) {
      answer.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      answer.end(JSON.stringify({ error: 'This test serves no office.' }))
    } else {
      answer.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
      answer.end('<!doctype html><div id="app"></div>')
    }
  })
  await new Promise<void>((resolve) => serving.listen(0, '127.0.0.1', resolve))
  server = serving
  site = `http://127.0.0.1:${String((serving.address() as AddressInfo).port)}`
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
  const serving = server
  serving?.closeAllConnections()
  if (serving !== undefined) await new Promise<void>((resolve) => serving.close(() => resolve()))
})

// ============================================================================ reading the page

interface Stored {
  scope: string
  intent: { nodes?: Record<string, { lane?: string; order?: number }> }
}
interface Answer {
  at: 'reading' | 'read' | 'failed'
  kept?: Stored | null
  stored?: Stored
  problem?: string
}
interface Hooks {
  reads: string[]
  writes: { scope: string; target: string; intent: unknown }[]
  answers: Answer[]
  said: string[][]
  asked: string[]
  renders: number
  hold: boolean
  failNext: boolean
  draw: (props: { which: 'pipeline' | 'modules'; withLanes: boolean }) => void
  again: () => void
  release: () => void
}
type TheWindow = { t8: Hooks; canvasLoaded?: number }

/** A page of the test, at a width, with the bundle loaded and one drawing drawn. */
async function open(width: number, which: 'pipeline' | 'modules', withLanes: boolean, options: { inspect?: boolean; hold?: boolean } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${site}/${options.inspect === true ? '?mode=inspect' : ''}`)
  await page.addScriptTag({ type: 'module', url: `${site}/structure-panel.js` })
  await page.waitForFunction(() => 't8' in window, undefined, { timeout: 10_000 }).catch(() => undefined)
  if (!(await page.evaluate(() => 't8' in window))) throw new Error(`The test page did not load: ${errors.join(' | ')}`)
  await page.evaluate((hold) => {
    ;(window as unknown as TheWindow).t8.hold = hold
  }, options.hold === true)
  await page.evaluate((props) => (window as unknown as TheWindow).t8.draw(props), { which, withLanes })
  return page
}

/** What the hooks hold now, and how many times the canvas was loaded. */
function state(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as TheWindow
    return { ...w.t8, canvasLoaded: w.canvasLoaded ?? 0 }
  })
}

/** Wait for a condition on the page, then let the assertions after it say what is wrong if it never came. */
async function until(page: Page, condition: string): Promise<void> {
  await page.waitForFunction(condition, undefined, { timeout: 10_000 }).catch(() => undefined)
}

/** Two animation frames, so every render a finished promise started has been painted. */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

const countTag = (page: Page) => page.locator('.gx .px-panel-actions .px-tag').innerText()

function surface(id: 'structure.isolated' | 'structure.stored'): string {
  const [[name, value] = ['', '']] = Object.entries(targetAttributes({ kind: 'uiSurface', surfaceId: id }))
  return `[${name}="${value}"]`
}

/** Open the drawer and its "How this is shown" form, and give back the labels of the form's fields. */
async function theFormsFields(page: Page): Promise<string[]> {
  await page.locator('.gx .px-panel-actions button', { hasText: t('g7b.StructureView.edit') }).click()
  await page.locator('.gx-drawer button.gx-act', { hasText: t('g7b.Edit.how_this_is_shown') }).click()
  await page.locator('.gx-drawer').getByLabel(t('g7b.Edit.which_card_you_are_arranging'), { exact: true }).waitFor({ timeout: 10_000 })
  return page.$$eval('.gx-drawer .gx-form label.px-label', (labels) => labels.map((one) => one.textContent?.trim() ?? ''))
}

const OMISSION = `1 ${t('g7b.model.stored_steps_that_could_not_be_read')}`
const RESTRICTED = t('drawingWithNoMarks.restricted', { n: 1, titles: `“${FIRST_STEP}”` })
const WORKED_ON = t('drawingWithNoMarks.workDomain', { n: 1, titles: `“${SECOND_STEP}”` })

const LANE_AND_ORDER = [
  t('g7b.Edit.which_card_you_are_arranging'),
  t('g7b.Edit.which_lane_it_belongs_in'),
  t('g7b.Edit.its_order_within_that_lane'),
]
const NOT_READ_BY_LANES = [
  t('g7b.Edit.which_way_this_drawing_runs'),
  t('g7b.Edit.how_much_room_it_gets'),
  t('g7b.Edit.its_emphasis'),
  t('g7b.Edit.drawn_folded'),
  t('g7b.Edit.kept_beside'),
]

// ============================================================================ the cases

describe('the structure panel, given the lanes a page draws', () => {
  it('1. draws the page’s drawing and not the canvas, counts its records, and hands up what restricts them and who is on them, not its omissions', async () => {
    const page = await open(1440, 'pipeline', true)
    await until(page, `document.querySelector('#stand-in-drawing[data-at="read"]') !== null`)
    await until(page, `JSON.stringify(window.t8.said.at(-1)) === ${JSON.stringify(JSON.stringify([RESTRICTED, WORKED_ON]))}`)
    const now = await state(page)
    expect(await page.locator('#stand-in-drawing').count(), 'the page’s drawing is on the "Graph" side').toBe(1)
    expect(now.canvasLoaded, 'the canvas was loaded although the page gave a drawing').toBe(0)
    expect(await page.locator('#stand-in-canvas').count()).toBe(0)
    expect(await countTag(page), 'the count is the records the drawing draws').toBe(t('g7b.StructureView.cards', { v1: PIPELINE.lanes.length }))
    expect(now.said.at(-1), 'what restricts the records and who is on them, by title, and no omission').toEqual([RESTRICTED, WORKED_ON])
    expect(now.said.flat(), 'the omission is the page’s to say when it gives lanes').not.toContain(OMISSION)
    expect(now.asked, 'one read of each, for the drawing’s records').toEqual(['restrictions step-one,step-two', 'presence step-one,step-two'])
    await page.close()
  }, 60_000)

  it('2. with no lanes, the same drawing loads the canvas, counts its own cards and hands up the canvas’s words and the omission, as before', async () => {
    const page = await open(1440, 'pipeline', false)
    await until(page, `document.querySelector('#stand-in-canvas') !== null`)
    await until(page, `JSON.stringify(window.t8.said.at(-1)) === ${JSON.stringify(JSON.stringify(['made-up canvas fact', OMISSION]))}`)
    const now = await state(page)
    expect(now.canvasLoaded, 'the canvas is loaded on a drawing given no lanes').toBe(1)
    expect(await countTag(page), 'the drawing’s own count is not the lanes’ count').not.toBe(t('g7b.StructureView.cards', { v1: PIPELINE.lanes.length }))
    expect(now.said.at(-1)).toEqual(['made-up canvas fact', OMISSION])
    expect(now.answers, 'no page was handed an answer').toEqual([])
    await page.close()
  }, 60_000)

  it('3. given lanes it opens on the drawing at 390 pixels wide; with no lanes it opens on the list there', async () => {
    const given = await open(390, 'pipeline', true)
    await until(given, `document.querySelector('#stand-in-drawing') !== null`)
    expect(await given.locator('#stand-in-drawing').count(), 'the page’s drawing at 390 pixels').toBe(1)
    expect(await given.locator('.gx-outline').count(), 'the list is not what opens when lanes are given').toBe(0)
    await given.close()
    const none = await open(390, 'pipeline', false)
    await until(none, `document.querySelector('.gx-outline') !== null`)
    expect(await none.locator('.gx-outline').count(), 'the list at 390 pixels with no lanes, as before').toBe(1)
    expect((await state(none)).canvasLoaded).toBe(0)
    await none.close()
  }, 60_000)

  it('4. given lanes, "Show all", the isolated fold and the fold on what is stored are not shown; with no lanes all three are', async () => {
    const showAll = t('g7b.StructureView.show_all', { v1: MODULES.records.length })
    const none = await open(1440, 'modules', false, { inspect: true })
    await until(none, `document.querySelector('#stand-in-canvas') !== null`)
    expect(await none.locator('.gx-switch button', { hasText: showAll }).count(), '"Show all" with no lanes, as before').toBe(1)
    expect(await none.locator(surface('structure.isolated')).count(), 'the isolated fold with no lanes, as before').toBe(1)
    expect(await none.locator(surface('structure.stored')).count(), 'the fold on what is stored with no lanes, as before').toBe(1)
    await none.close()
    const given = await open(1440, 'modules', true, { inspect: true })
    await until(given, `document.querySelector('#stand-in-drawing[data-at="read"]') !== null`)
    expect(await given.locator('#stand-in-drawing').count()).toBe(1)
    expect(await given.locator('.gx-switch button', { hasText: showAll }).count(), '"Show all" is not offered beside a drawing of every record').toBe(0)
    expect(await given.locator(surface('structure.isolated')).count(), 'no isolated fold when lanes are given').toBe(0)
    expect(await given.locator(surface('structure.stored')).count(), 'no fold on the canvas’s stored places when lanes are given').toBe(0)
    expect(await countTag(given)).toBe(t('g7b.StructureView.cards', { v1: MODULES.lanes.length }))
    await given.close()
  }, 60_000)

  it('5. given lanes, "How this is shown" offers the card, its lane and its order only; with no lanes it offers every field', async () => {
    const given = await open(1440, 'pipeline', true)
    await until(given, `document.querySelector('#stand-in-drawing[data-at="read"]') !== null`)
    const lanesFields = await theFormsFields(given)
    expect(lanesFields, 'the card, its lane and its order').toEqual(expect.arrayContaining(LANE_AND_ORDER))
    for (const label of NOT_READ_BY_LANES) expect(lanesFields, `${label} is not offered beside a drawing that does not read it`).not.toContain(label)
    await given.close()
    const none = await open(1440, 'pipeline', false)
    await until(none, `document.querySelector('#stand-in-canvas') !== null`)
    const everyField = await theFormsFields(none)
    expect(everyField, 'every field with no lanes, as before').toEqual(expect.arrayContaining([...LANE_AND_ORDER, ...NOT_READ_BY_LANES]))
    await none.close()
  }, 60_000)

  it('6. hands the page each answer as it changes, a lane stored through the editor included, and nothing more when drawn again', async () => {
    const page = await open(1440, 'pipeline', true, { hold: true })
    const lane = 'Made-up lane'

    // ---- the first read, held: the panel says it is reading, and the page has been told nothing is read yet ----
    await until(page, `window.t8.reads.length === 1`)
    await twoFrames(page)
    expect(await page.locator('.gx-loading').innerText(), 'the panel’s own words while the first read runs').toBe(t('g7b.StructureView.reading_how_this_drawing_was_asked_to'))
    const whileReading = await state(page)
    expect(whileReading.answers.length, 'the page is told the answer is being read').toBeGreaterThan(0)
    for (const answer of whileReading.answers) expect(answer).toEqual({ at: 'reading', kept: null })

    // ---- the answer ----
    await page.evaluate(() => (window as unknown as TheWindow).t8.release())
    await until(page, `document.querySelector('#stand-in-drawing[data-at="read"]') !== null`)
    const read = await state(page)
    const first = read.answers.at(-1)
    expect(first?.at).toBe('read')
    expect(first?.stored?.intent, 'the stored answer, as it was read').toEqual({ nodes: {} })

    // ---- drawn again with nothing changed ----
    await page.evaluate(() => (window as unknown as TheWindow).t8.again())
    await twoFrames(page)
    const again = await state(page)
    expect(again.renders, 'the page was drawn again').toBeGreaterThan(read.renders)
    expect(again.answers.length, 'drawn again with nothing changed, the page was handed an answer').toBe(read.answers.length)

    // ---- a lane stored through the editor ----
    await theFormsFields(page)
    const drawer = page.locator('.gx-drawer')
    await drawer.getByLabel(t('g7b.Edit.which_card_you_are_arranging'), { exact: true }).selectOption('step-one')
    await drawer.getByLabel(t('g7b.Edit.which_lane_it_belongs_in'), { exact: true }).fill(lane)
    await drawer.locator('button', { hasText: t('g7b.Edit.store_how_this_card_is_shown') }).click()
    await until(page, `window.t8.reads.length === 2`)
    await twoFrames(page)
    expect(await page.locator('.gx-drawer-rereading').innerText(), 'the drawer says it is reading again').toBe(t('g7b.StructureView.re_reading_the_arrangement_after_that_write'))
    const rereading = await state(page)
    expect(rereading.writes).toEqual([{ scope: pipelineScope('pipeline-one'), target: 'step-one', intent: { lane } }])
    expect(rereading.answers.at(-1), 'reading again, with the last answer kept').toEqual({ at: 'reading', kept: first?.stored })
    await page.evaluate(() => (window as unknown as TheWindow).t8.release())
    await until(page, `document.querySelector('#stand-in-drawing[data-at="read"]')?.dataset.lanes === 'step-one ${lane} '`)
    const stored = await state(page)
    expect(stored.answers.at(-1)?.at).toBe('read')
    expect(stored.answers.at(-1)?.stored?.intent.nodes?.['step-one'], 'the answer holds the lane').toEqual({ lane })
    expect(await page.locator('#stand-in-drawing').getAttribute('data-lanes'), 'the page’s drawing shows the lane').toBe(`step-one ${lane} `)
    expect(stored.reads, 'two reads, both the panel’s: none of the page’s own').toEqual([pipelineScope('pipeline-one'), pipelineScope('pipeline-one')])

    // ---- a read again that fails, answered at once: a held read would never fail ----
    await page.evaluate(() => {
      const { t8 } = window as unknown as TheWindow
      t8.hold = false
      t8.failNext = true
    })
    await drawer.getByLabel(t('g7b.Edit.its_order_within_that_lane'), { exact: true }).fill('2')
    await drawer.locator('button', { hasText: t('g7b.Edit.store_how_this_card_is_shown') }).click()
    await until(page, `document.querySelector('#stand-in-drawing[data-at="failed"]') !== null`)
    await twoFrames(page)
    const failed = await state(page)
    expect(failed.answers.at(-1), 'failed, with the problem and the last answer kept').toEqual({
      at: 'failed',
      problem: 'made-up problem',
      kept: stored.answers.at(-1)?.stored,
    })
    expect(await page.locator('.gx-intent[data-tone="problem"]').innerText(), 'the panel says the problem itself').toBe(
      `${t('g7b.StructureView.what_was_stored_about_how_this_drawing')}made-up problem`,
    )
    await page.close()
  }, 120_000)
})
