// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PLANNING GRAPH DRAWS, as opposed to what the route serves.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS SEPARATE FROM tests/plan-graph.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * That file is the ROUTE: the boundary, the promotion rule, `due` as stored, and no rendering in the
 * reply. This one is the DRAWING, and it exists because an independent audit measured the drawing at
 * 1440x900 and found six faults that no type and no route test can see:
 *
 *   1. THE PANE WAS 1,144x760 OVER A 2,645x980 PLANE with THREE of FOURTEEN cards fully visible,
 *      and the one deadline — the subject of the panel's own title — was at x=1138 in a 1,144px
 *      pane, so it was off screen at rest.
 *   2. THE DRAWING WAS TWO COMPONENTS sharing zero links, separated by 78px of grey and nothing
 *      else. A gap that size reads as a tier, as if the lower half were subordinate.
 *   3. A FIVE-STEP CHAIN was drawn as five full-size ELK layers — 2,062 of the plane's 2,645px —
 *      each card repeating the same pipeline title.
 *   4. ELEVEN OF FOURTEEN CARDS ended with the sentence "not in this period's plan", which the
 *      hollow □ and the missing rail had already said twice.
 *   5. 134px OF SERVER PROSE sat between the panel title and the drawing, restating counts the tags
 *      beside the title already carried.
 *   6. THE KEY GAVE FIVE BOX SWATCHES AND NO LINE SAMPLE — the one thing on the drawing a newcomer
 *      cannot name was the only thing it did not cover.
 *
 * Every one of those is a fact about the MARKUP, so every one of them is provable here. The runner's
 * environment is `node` and this project has ruled out jsdom, so the components are rendered to
 * static markup against a window stand-in — the same arrangement tests/planning-surfaces.test.ts
 * uses. `document` is deliberately absent, which is also what proves
 * this drawing does not need one to say what it is.
 *
 * THE GEOMETRY ITSELF is in tests/graph-layout.test.ts, where it is arithmetic over boxes. What is
 * here is what the arithmetic is WIRED to: that the model splits the bands, that a run becomes a
 * row, that a canvas card carries three things, and that nothing was deleted on the way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED IN THE TEST AUDIT OF 3 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * THE KEY'S COUNTS WERE FROZEN AND ARE NOW DERIVED. Three assertions here said nine entries, nine
 * tooltips and five line samples. Every one of those numbers moves when a link family is added,
 * which is an honest thing to do — `intent` was added in wave 10 and each number had to be edited
 * by hand. They are read off `LINK_FAMILIES` now, so a new family is drawn and checked rather than
 * reported as a failure, and what is asserted is the property each count stood for: every entry
 * carries its own explanation, and every family has a stroke of its own.
 *
 * THREE ASSERTIONS READ THE COMPONENT'S SOURCE FILE. They opened `PlanGraph.tsx` with `readFileSync`
 * and matched CSS in it. They read the sheet the component SERVES now — the string inside the
 * `<style>` element in its own markup — so a rule written and never served fails, which the old
 * shape could not see.
 *
 * AND THEY ARE STILL STYLESHEET FACTS, WHICH IS SAID HERE RATHER THAN HIDDEN. Whether a bullet is
 * painted, whether the key is two columns wide, and whether a press reaches the box under the key
 * are all pixels. Nothing in this repository opens this drawing in a browser and measures them, so
 * deleting these would leave the rules unguarded. A browser test that opens the plan graph, reads
 * the marker on a list item and clicks through the key is what would replace them, and is owed.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Allocation } from '../src/shared/planning.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { PlanGraphEdge, PlanGraphNode, PlanGraphReply } from '../src/server/api/plan-graph.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

type PlanGraphModule = typeof import('../src/web/components/graph/PlanGraph.tsx')

/** A window stand-in and the drawing imported against it, with the address it should read. */
async function boot(search = ''): Promise<PlanGraphModule> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  // mode.ts reads its setting ONCE, at import, so the module cache has to go for the address to be
  // read again. The same reason tests/mode.test.ts does it.
  vi.resetModules()
  return (await import('../src/web/components/graph/PlanGraph.tsx')) as PlanGraphModule
}

/**
 * THE STYLESHEET THE DRAWING SERVES, taken out of its own markup.
 *
 * This used to be `readFileSync` on `PlanGraph.tsx` and a slice from the word `PLAN_GRAPH_CSS`. The
 * sheet is rendered inside a `<style>` element by `PlanGraph` itself, so taking it from there reads
 * the same string a browser is handed, and a rule that is written and never served fails.
 */
async function servedSheet(): Promise<string> {
  const pg = await boot()
  const markup = renderToStaticMarkup(h(pg.PlanGraph, { period: '2026-W33' }))
  const found = /<style[^>]*>([\s\S]*?)<\/style>/.exec(markup)
  if (found === null) throw new Error('the plan graph served no stylesheet at all')
  return found[1] ?? ''
}

/** The `list-style` the served sheet sets on a selector, or null when it sets none. */
async function listStyleOf(selector: string): Promise<string | null> {
  const rule = new RegExp(`\\${selector} \\{([^}]*)\\}`).exec(await servedSheet())
  const found = rule === null ? null : /list-style:\s*([a-z-]+)/.exec(rule[1] ?? '')
  return found?.[1] ?? null
}

// ---------------------------------------------------------------------------- a drawing to draw
//
// SHAPED LIKE THE LIVE CORPUS, because the faults above are facts about that shape: one deadline
// with a cluster round it, a linear wave chain of one link type sharing one pipeline, and a third
// group the period gives nothing to. Every field is what the route actually serves.

/**
 * THE RECORD THE ROUTE WOULD HAVE READ, so `words` and `levels` on a fixture node are what the two
 * shared readers really answer rather than a hand-written pair. The route calls the same two.
 */
function recordFor(kind: PlanGraphNode['kind'], id: string, title: string): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data: {},
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-01 09:00:00',
    deletedAt: null,
  }
}

function node(over: Partial<PlanGraphNode> & { recordId: string }): PlanGraphNode {
  const kind = over.kind ?? 'task'
  const record = recordFor(kind, over.recordId, over.title ?? over.recordId)
  return {
    kind,
    role: 'work',
    title: over.recordId,
    name: over.recordId,
    within: null,
    state: null,
    depth: null,
    effortHours: null,
    due: null,
    settled: null,
    record,
    drawn: 'one link from an anchor',
    oneLinkFrom: [],
    allocations: [],
    ...over,
  }
}

function edge(id: string, from: string, to: string, type: PlanGraphEdge['type'], label: string): PlanGraphEdge {
  return { id, from, to, type, label, gateLabel: null, gateProblem: null, broken: false, gate: null }
}

const HOURS: Allocation = {
  id: 'alloc-1',
  recordId: 'wave-6',
  horizon: 'week',
  period: '2026-W33',
  plannedHours: 6,
  actualHours: null,
  state: 'planned',
  note: null,
  createdAt: '2026-08-12 09:00:00',
  updatedAt: '2026-08-12 09:00:00',
}

const CAMPAIGN = 'Mole Office development campaign — waves 4A to 9, from 2026-08-12'

function reply(): PlanGraphReply {
  return {
    horizon: 'week',
    period: '2026-W33',
    from: '2026-08-10',
    to: '2026-08-16',
    workspaceId: 'panelx',
    // The stored TITLE, which is not the id. The line over the plane draws this one, so a reply
    // that carried only `panelx` would print a second spelling of the project the rail calls Mole Office.
    workspaceTitle: 'Mole Office',
    nodes: [
      node({
        recordId: 'deadline-1',
        kind: 'obligation',
        role: 'deadline',
        title: 'The destructive-restore proof cannot stand until the UTC stamp defaults are dropped',
        name: 'The destructive-restore proof cannot stand until the UTC stamp defaults are dropped',
        state: 'fulfilled',
        drawn: 'anchor',
      }),
      node({
        recordId: 'direction-1',
        kind: 'direction',
        role: 'direction',
        title: 'Can a cold agent run the week off Mole Office alone',
        name: 'Can a cold agent run the week off Mole Office alone',
        depth: 'measured',
        drawn: 'anchor',
      }),
      node({ recordId: 'schema', kind: 'module', title: 'Mole Office — database schema', name: 'Mole Office — database schema' }),
      node({ recordId: 'wiring', kind: 'module', title: 'Mole Office — server wiring', name: 'Mole Office — server wiring' }),
      // the wave chain: one link type, one pipeline, three of them with hours
      node({ recordId: 'wave-4b', kind: 'block', title: `${CAMPAIGN} — Wave 4B`, name: 'Wave 4B', within: CAMPAIGN, state: 'done' }),
      node({ recordId: 'wave-5', kind: 'block', title: `${CAMPAIGN} — Wave 5`, name: 'Wave 5', within: CAMPAIGN, state: 'doing' }),
      node({
        recordId: 'wave-6',
        kind: 'block',
        title: `${CAMPAIGN} — Wave 6`,
        name: 'Wave 6',
        within: CAMPAIGN,
        state: 'doing',
        allocations: [HOURS],
      }),
      // a group this period gives nothing to and that holds no anchor
      node({ recordId: 'quiet-a', kind: 'problem', title: 'A quiet problem', name: 'A quiet problem', state: 'open' }),
      node({ recordId: 'quiet-b', kind: 'module', title: 'A quiet module', name: 'A quiet module' }),
    ],
    edges: [
      edge('e1', 'deadline-1', 'schema', 'part_of', 'part of'),
      edge('e2', 'direction-1', 'wiring', 'about', 'about'),
      edge('e3', 'schema', 'wiring', 'implements', 'implements'),
      edge('e4', 'wave-4b', 'wave-5', 'blocks', 'blocks'),
      edge('e5', 'wave-5', 'wave-6', 'blocks', 'blocks'),
      edge('e6', 'quiet-a', 'quiet-b', 'implements', 'implements'),
    ],
    elsewhere: [],
    omitted: [
      { count: 2, what: 'session records beside something drawn here', why: 'A session is not one of the kinds this drawing calls work.' },
      { count: 137, what: 'other records in "panelx"', why: 'Nothing joins them to this question.' },
    ],
    note: 'THE SERVER PARAGRAPH. 1 deadline, and it does not record when it is owed. 1 future direction.',
  }
}

// ---------------------------------------------------------------------------- the model

describe('the split that was asked about, measured and then stated', () => {
  it('finds the bands nothing links, names each from its own records, and counts the crossings', async () => {
    const pg = await boot()
    const model = pg.planModel(reply())
    expect(model.bands).toHaveLength(3)

    // THE BAND HOLDING THE SUBJECT OF THE PANEL COMES FIRST, whatever order the server listed in.
    expect(model.topAnchorId).toBe('deadline-1')
    expect(model.bands[0]?.nodes.map((n) => n.recordId)).toContain('deadline-1')
    expect(model.bands[0]?.heading).toContain('Toward: The destructive-restore proof')

    // THE PIPELINE TITLE, HOISTED. It was printed on every card in the run and is now said once.
    const run = model.bands.find((band) => band.run !== null)
    expect(run?.heading).toBe(CAMPAIGN)
    expect(run?.run?.order).toEqual(['wave-4b', 'wave-5', 'wave-6'])
    expect(run?.run?.type).toBe('blocks')

    // ZERO, SAID OUT LOUD RATHER THAN LEFT TO 78px OF GREY.
    for (const band of model.bands) expect(band.crossings).toBe(0)
  })

  it('folds a band this period gives nothing to, and NEVER the one holding the panel’s own subject', async () => {
    const pg = await boot()
    const model = pg.planModel(reply())
    const quiet = model.bands.find((band) => band.nodes.some((n) => n.recordId === 'quiet-a'))
    const anchored = model.bands.find((band) => band.nodes.some((n) => n.recordId === 'deadline-1'))

    expect(quiet?.allocated).toBe(0)
    expect(quiet?.foldedAtRest, 'a band the plan does not touch was left open').toBe(true)

    // The exception that is not optional: this band ALSO has nothing allocated, and folding it would
    // open "What this period is working toward" with the thing it is working toward behind a press.
    expect(anchored?.allocated).toBe(0)
    expect(anchored?.foldedAtRest, 'the band holding the deadline was folded away').toBe(false)
  })

  it('falls back through deadline, then allocated work, then direction — and to nothing when there is none', async () => {
    const pg = await boot()
    const bare = reply()
    bare.nodes = bare.nodes.filter((n) => n.role !== 'deadline')
    expect(pg.planModel(bare).topAnchorId).toBe('wave-6')

    const noHours = reply()
    noHours.nodes = noHours.nodes
      .filter((n) => n.role !== 'deadline')
      .map((n) => ({ ...n, allocations: [] }))
    expect(pg.planModel(noHours).topAnchorId).toBe('direction-1')

    const nothing = reply()
    nothing.nodes = nothing.nodes
      .filter((n) => n.role === 'work')
      .map((n) => ({ ...n, allocations: [] }))
    // Absence beats a guess: the first card the server happened to list is not an answer to
    // "what is this working toward", so nothing is given primacy.
    expect(pg.planModel(nothing).topAnchorId).toBeNull()
  })
})

// ---------------------------------------------------------------------------- what a card carries

describe('a canvas card is a mark, a title and one word', () => {
  it('drops the four lines the shape already said, and keeps every one of them in the reading layer', async () => {
    const pg = await boot()
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: reply() }))

    // The card that is DRAWN (the measuring rack renders the same component the canvas does).
    const cards = markup.slice(markup.indexOf('pg-measure'), markup.indexOf('pg-canvas-wrap'))
    // THE TITLE IS THE SHARED CARD'S, so the class name is the shared card's. A plan card is drawn
    // by `CardFace`, the same component the module and pipeline drawings draw, which is what gives
    // a plan node the ladder it had none of; the card it replaced was called `pg-cc-title`. What
    // this test pins has not changed: a card is a mark, a name and one word, and the four lines
    // below stay off it.
    expect(cards).toContain('gx-card-title')
    expect(cards).toContain('pg-cc-chip')
    expect(cards, 'the sentence the hollow square already says is back on the canvas card').not.toContain(
      'not in this period',
    )
    // The pipeline title is no longer a LINE on every card in the run — it is the band's heading.
    // It is still the card's own tooltip, because a `title` attribute is not first-glance space and
    // a block's full title is what a reader needs when the name alone is "Wave 5".
    expect(cards, 'the pipeline line is back on every card in the run').not.toContain('pg-card-within')
    expect(cards).not.toContain(`>in ${CAMPAIGN}<`)
    expect(cards).toContain(`title="${CAMPAIGN} — Wave 5"`)
    expect(cards).not.toContain('<dt>depth</dt>')
    expect(cards).not.toContain('<dt>est</dt>')

    // NOTHING WAS DELETED FROM THE PRODUCT. The reading layer still prints all of it.
    const reading = renderToStaticMarkup(h(pg.PlanGraphView, { reply: reply() }))
    expect(reading).toContain('pg-measure')
    expect(pg.chipWords(node({ recordId: 'x', state: 'open' }))).toBe('open')
  })

  it('never invents the one word, and marks ordinary absence', async () => {
    const pg = await boot()
    // A module with no state word is not a module in an unnamed state, and a deadline nobody dated
    // is not a deadline due today. 7FEOshq3mBGG gives ordinary absence the short mark.
    expect(pg.chipWords(node({ recordId: 'm', kind: 'module' }))).toBe('—')
    expect(pg.chipWords(node({ recordId: 'd', kind: 'obligation', role: 'deadline' }))).toBe('—')
    expect(pg.chipWords(node({ recordId: 'x', kind: 'direction', role: 'direction' }))).toBe('—')
    // And a deadline that was kept says so rather than printing a date that has gone.
    expect(
      pg.chipWords(node({ recordId: 'd', kind: 'obligation', role: 'deadline', due: '2026-08-05', settled: { at: '2026-08-04', note: null } })),
    ).toBe('settled')
    expect(pg.chipWords(node({ recordId: 'd', kind: 'obligation', role: 'deadline', due: '2026-08-05' }))).toBe('2026-08-05')
  })
})

// ---------------------------------------------------------------------------- first-glance space

describe('what is above the drawing', () => {
  it('replaces the server paragraph with a summary block, and keeps the paragraph in Inspect', async () => {
    const normal = await boot()
    const plain = renderToStaticMarkup(h(normal.PlanGraphView, { reply: reply() }))
    expect(plain, 'the 134px paragraph is still in first-glance space').not.toContain('THE SERVER PARAGRAPH')
    // THE OWNER'S BLOCKQUOTE. The counts are a summary of the drawing and are marked as one — grey
    // ground, a rule down the left, the word that names the block — rather than set as another row
    // of content in the same ink as the rows underneath.
    const summary = /<div class="px-sum"><p class="px-sum-line"[^>]*><span class="px-sum-key">Sum<\/span>(.*?)<\/p>/s
    const said = summary.exec(plain)
    expect(said, 'the counts are not inside the summary block').not.toBeNull()
    expect(said?.[1]).toContain('deadline')
    // Every count is a count of an array the drawing is built from.
    expect(plain).toMatch(/1<\/b> deadline/)
    expect(plain).toMatch(/1<\/b> direction/)
    expect(plain).toMatch(/1<\/b> of <b class="num">9<\/b> on the plan/)
    expect(plain).toMatch(/3<\/b> groups/)

    const inspect = await boot('?mode=inspect')
    const deep = renderToStaticMarkup(h(inspect.PlanGraphView, { reply: reply() }))
    expect(deep, 'the paragraph became unreachable rather than moving').toContain('THE SERVER PARAGRAPH')
  })

  it('says the period once, not three times, and says what is on the plane rather than what it read', async () => {
    const normal = await boot()
    const plain = renderToStaticMarkup(h(normal.PlanGraphView, { reply: reply() }))
    const where = plain.slice(plain.indexOf('pg-where'), plain.indexOf('pg-switch'))
    expect(where, 'the period code is stated a third time above the drawing').not.toContain('2026-W33')
    expect(where).toContain('2026-08-10')
    /**
     * THE LINE SAID "project: panelx", AND THE PAGE'S OWN CHIP FOUR INCHES ABOVE SAYS "all
     * projects". A reader has no way to tell that both are true of different things: the plan's
     * hours are person-level and cover every project, and this DRAWING is one project's records and
     * links. Read together they are a contradiction, and a first-time tester read them that way.
     *
     * So the line is about the drawing and says so. The page chip stopped claiming the panel at the
     * same time: it reads "hours from every project", which is true of the hours and of nothing else.
     *
     * AND IT NAMES THE PROJECT THE WAY EVERY OTHER SCREEN DOES. It read "only panelx is drawn" — the
     * stored id — while the rail four inches away read "Mole Office". `GET /api/plan-graph` sends the
     * registry's title beside the id now, so `projectName` has one to print. The second assertion is
     * what fails if the reply stops carrying it: `projectName` falls back to the id in silence.
     */
    expect(where, 'the panel claims to be about a project rather than to draw one').not.toContain('project: panelx')
    expect(where).toContain('only Mole Office is drawn')
    expect(where, 'the drawing is naming the project by its stored id again').not.toContain('panelx is drawn')

    const inspect = await boot('?mode=inspect')
    const deep = renderToStaticMarkup(h(inspect.PlanGraphView, { reply: reply() }))
    expect(deep.slice(deep.indexOf('pg-where'), deep.indexOf('pg-switch'))).toContain('2026-W33')
  })

  it('draws a line for every family in the key, with its name', async () => {
    const pg = await boot()
    const { LINK_FAMILIES, LINE_FAMILY_STYLE } = await import('../src/web/components/graph/lines.ts')
    const markup = renderToStaticMarkup(h(pg.Legend))
    for (const family of LINK_FAMILIES) {
      const style = LINE_FAMILY_STYLE[family]
      // CRITERION CHANGE, as decided: the key no longer says what a line means, in a tooltip or
      // anywhere else. It names the line and draws it.
      expect(markup, `the key has no sample for "${style.label}"`).toContain(style.label)
      // DRAWN, NOT DESCRIBED: a real stroke in this family's own drawing, not a word for it.
      expect(markup, `"${style.label}" is named in the key and not drawn in it`).toContain(
        `data-family="${family}"`,
      )
    }
    /**
     * ONE STROKE PER FAMILY, AND ONE MORE SHOWING WHAT AN ARROW HEAD MEANS.
     *
     * This said five. Five was right on the day it was written and became wrong the moment a family
     * was added, which is a thing somebody may do — `intent` was added in wave 10 and this number
     * had to be edited by hand to keep the file green. It is read from the declaration now, so the
     * claim is the one that matters: every family is drawn, the head is explained, and nothing else
     * is spending a stroke.
     */
    expect([...markup.matchAll(/pg-key-line/g)]).toHaveLength(LINK_FAMILIES.length + 1)
    // And the marks on a box are still there.
    expect(markup).toContain('deadline')
    expect(markup).toContain('no time')
  })

  /**
   * THE OWNER'S FIRST NOTE ON THIS PAGE, AS A TEST.
   *
   * *"'future direction — planned, not adopted' is bad, it is too much for a block or type
   * description"*. A key entry names a thing. Anything longer is an explanation, and the key draws
   * none.
   *
   * The measure is deliberately crude and deliberately strict: at most two words of visible text
   * per entry, and no dash joining two clauses. The old key fails on both counts, five times.
   */
  it('gives every key entry a name of one or two words, and no tooltip', async () => {
    const pg = await boot()
    const { LINK_FAMILIES } = await import('../src/web/components/graph/lines.ts')
    const markup = renderToStaticMarkup(h(pg.Legend))
    const items = [...markup.matchAll(/<li[^>]*>(.*?)<\/li>/gs)]
    const entries = items.map((found) =>
      (found[1] ?? '')
        .replace(/<svg.*?<\/svg>/gs, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    /**
     * A FLOOR, NOT A FIXED NUMBER, AND HERE IS THE REASON.
     *
     * This said nine, and nine was the four link families plus the five entries that are not
     * families: a deadline, a direction, has time, no time, and what an arrow head means. Adding a
     * link family is an honest thing to do and it broke this line every time. What the number was
     * really guarding is that the key did not quietly lose its entries, so it is a floor with the
     * five named in it, and every entry is then checked one at a time.
     */
    expect(entries.length, 'the key lost its entries').toBeGreaterThanOrEqual(LINK_FAMILIES.length + 5)
    for (const entry of entries) {
      expect(entry, `"${entry}" is a sentence, not a name`).not.toMatch(/—|--/)
      // The square and the arrow are marks, not words, so they are not counted as any.
      const words = entry.split(' ').filter((word) => /\p{Letter}/u.test(word))
      expect(words.length, `"${entry}" is longer than two words`).toBeLessThanOrEqual(2)
      expect(words.length, `"${entry}" has no name at all`).toBeGreaterThan(0)
    }
    // CRITERION CHANGE, as decided: the explanations behind the entries are gone, so no entry of the
    // key, and nothing inside one, carries a title.
    for (const [at, item] of items.entries()) {
      expect(item[0], `the key entry "${entries[at]}" carries a tooltip`).not.toContain('title=')
    }
  })

  /**
   * The key and a card said the same clause about a direction from two separate string literals.
   * They now read one table, so the two cannot come apart — the defect CLAUDE.md names.
   */
  it('names a role once, and the key and the boxes both read that one name', async () => {
    const pg = await boot()
    const key = renderToStaticMarkup(h(pg.Legend))
    // The written-out layer, because that is where a record's role is printed as a word at all.
    const flat = reply()
    flat.edges = []
    const drawing = renderToStaticMarkup(h(pg.PlanGraphView, { reply: flat }))
    for (const role of ['deadline', 'direction'] as const) {
      const said = pg.ROLE_KEY[role].word
      expect(said.split(' ').length, `ROLE_KEY.${role} is not a name`).toBe(1)
      expect(key, `the key does not use ROLE_KEY.${role}`).toContain(said)
      // The role line on a written-out record is the same word, out of the same table.
      expect(drawing, `no record is labelled with ROLE_KEY.${role}`).toMatch(
        new RegExp(`<p class="pg-card-role"[^>]*>${said}</p>`),
      )
    }
  })

  it('keeps what is left out as a count in first-glance space, with each kind listed under it', async () => {
    // USER.md's fifth invariant outranks the density test: a number that could not count everything
    // still says so. The audit asked for this list to move to Inspect; the COUNT stays.
    const pg = await boot()
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: reply() }))
    expect(markup).toContain('139')
    expect(markup).toContain('records in this project are not on this drawing')
    expect(markup).toContain('session records beside something drawn here')
    expect(markup).toContain('other records in')
    // The server's reasons are drawn in developer mode only.
    expect(markup).not.toContain('A session is not one of the kinds this drawing calls work.')
  })
})

// ---------------------------------------------------------------------------- lists, and the key

/**
 * THE OWNER, ON THE AREA UNDER THE FIRST GROUP'S NAME: *"the text below are tooooo much with
 * strange line breaks and no numerical render like the '1. 2.' or '-' or '*' in markdown to make
 * those lists look organized."*
 *
 * Three lists on this panel were drawn with `list-style: none` — the reasons a record is not on the
 * drawing, the work in another project, and the links under a record. Every one of them ran
 * together as a paragraph that had been broken oddly, which is exactly what a list with its markers
 * taken away looks like.
 */
describe('a list is drawn as a list', () => {
  it('numbers the reasons a record is left out, and gives the reason its own line', async () => {
    const pg = await boot('?mode=inspect')
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: reply() }))
    // A NUMBERED LIST IS WHAT AN `ol` IS. The reasons were drawn as a `div` of paragraphs before,
    // so a browser had nothing to number, and each reason ran into the next.
    expect(markup, 'the reasons are still an unmarked list').toContain('<ol class="pg-omitted">')
    expect(markup).toContain('pg-omitted-what')
    expect(markup).toContain('A session is not one of the kinds this drawing calls work.')
    // And what is in it is one item per reason, each with its own words.
    const list = /<ol class="pg-omitted">([\s\S]*?)<\/ol>/.exec(markup)
    expect(list, 'the numbered list of reasons is never closed').not.toBeNull()
    expect(
      [...(list?.[1] ?? '').matchAll(/<li/g)].length,
      'the reasons are one item, so the numbering has nothing to number',
    ).toBe(reply().omitted.length)
    // The markers themselves are painted by the browser, so this half is a stylesheet fact: nothing
    // in the sheet takes them off again. See the note at the head of this file.
    expect(await listStyleOf('.pg-omitted'), 'the reasons have no markers').toBe('decimal')
  })

  /**
   * These two rows are flex lines, so that a long record name wraps without the words beside it
   * being pulled apart — and a flex item draws no marker of its own, whatever `list-style` says.
   * So the bullet is drawn, and this is the check that it is really there. A `list-style: disc` on
   * these two was tried first, photographed, and drew nothing at all.
   *
   * A STYLESHEET FACT, AND IT IS READ OFF THE SHEET THE DRAWING SERVES. A bullet in a `::before`
   * cannot appear in markup at all, so there is nothing about it a person can read here.
   */
  it('marks the links under a record and the work in another project', async () => {
    const rule = /\.pg-row-links li::before, \.pg-elsewhere-list li::before \{[^}]*content: '•'/
    expect(rule.exec(await servedSheet()), 'the two flex lists have no bullet drawn on them').not.toBeNull()
  })
})

/**
 * *"we could move these drawing related labels into the graph like the matplotlib labels and list
 * them in one or two column."* So the key is a box in the corner of the drawing, and it is only a
 * block above the content when there is no drawing to sit in.
 */
describe('where the key sits', () => {
  it('puts the key inside the drawing, in two columns', async () => {
    const pg = await boot()
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: reply() }))
    const frame = markup.slice(markup.indexOf('pg-canvas-wrap'), markup.indexOf('pg-canvas '))
    expect(frame, 'the key is not inside the drawing frame').toContain('pg-legend-placed')

    // TWO STYLESHEET FACTS, off the sheet the drawing serves. How many columns the key is drawn in
    // and whether a press passes through it are both pixels, and nothing here opens a browser —
    // see the note at the head of this file.
    const css = await servedSheet()
    expect(/\.pg-legend \{[^}]*grid-template-columns: repeat\(2, auto\)/.exec(css), 'the key is not two columns').not
      .toBeNull()
    // It floats over the drawing, so it must never swallow a press meant for a box beneath it.
    expect(/\.pg-legend-placed \{[^}]*pointer-events: none/.exec(css)).not.toBeNull()
  })

  /**
   * FOUND BY PRESSING THE BUTTON AT 390, NOT BY READING THE CODE.
   *
   * The hidden boxes that get measured were rendered by the two drawing arrangements. On a phone the
   * written-out list is what you land on, so at the moment the measuring ran there was nothing on the
   * page to measure — and pressing *Graph* mounted them too late, because the measurement does not
   * run a second time. The drawing then refused itself, correctly and uselessly: "14 boxes were never
   * drawn" over an empty pane. They are rendered whatever is showing now.
   */
  it('keeps the boxes it measures on the page even while the written-out list is showing', async () => {
    const pg = await boot()
    const flat = reply()
    flat.edges = []
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: flat }))
    expect(markup).toContain('pg-list')
    expect(markup, 'there is nothing to measure, so pressing Graph would refuse').toContain('pg-measure')
    expect([...markup.matchAll(/pg-measure-card/g)]).toHaveLength(flat.nodes.length)
  })

  it('puts the key above the written-out records when there is no drawing to sit in', async () => {
    const pg = await boot()
    const flat = reply()
    flat.edges = []
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: flat }))
    expect(markup).toContain('pg-list')
    expect(markup).toContain('pg-legend')
    expect(markup, 'the key is floating over a drawing that is not there').not.toContain('pg-legend-placed')
  })
})

// ---------------------------------------------------------------------------- the grouping

/**
 * HOW THE GROUPS ARE ARRANGED, WHICH IS ONE ANSWER AND WAS TWO.
 *
 * A second arrangement drew the same groups as tinted regions with a colour rail, packed side by
 * side with no reading direction, so the owner could compare it against stacked bands. Round four
 * kept the bands and it was deleted.
 */
describe('the groups, arranged as stacked bands', () => {
  it('draws a straight run as ONE ROW OF CHIPS, rather than as five full-size layers', async () => {
    const pg = await boot('')
    const markup = renderToStaticMarkup(h(pg.PlanGraphView, { reply: reply() }))
    expect(markup, 'the run was not compacted').toContain('pg-chain-row')
    expect(markup).toContain('steps in order, each')
    // The arrow between two chips is the link type the run actually is, said once.
    expect(markup).toContain('<b>blocks</b>')
    expect([...markup.matchAll(/pg-chain-step/g)].length).toBeGreaterThanOrEqual(3)
  })

  it('states its counts from the model it was handed, never counting for itself', async () => {
    const bands = renderToStaticMarkup(h((await boot('')).PlanGraphView, { reply: reply() }))
    const counts = (markup: string): string[] =>
      [...markup.matchAll(/<p class="pg-band-counts[^"]*">(.*?)<\/p>/g)].map((found) => found[1] ?? '')
    expect(counts(bands)).toHaveLength(3)
    // The one number the whole question turned on is in it.
    expect(counts(bands)[0]).toContain('lines to another group')
    // IT IS A SUMMARY AND IT IS MARKED AS ONE. This is the line directly under a group's own name,
    // and it was set in the same ink and at the same size as the drawing beneath it.
    expect(counts(bands)[0]).toContain('px-sum-key')
    expect(bands).toContain('class="pg-band-counts px-sum"')
  })

  it('draws stacked bands and nothing of the packed regions that lost', async () => {
    const bands = renderToStaticMarkup(h((await boot('')).PlanGraphView, { reply: reply() }))
    expect(bands).toContain('class="pg-bands"')
    // The deleted arrangement's own marks: the wrapper it packed into and the colour rail it used
    // to say which region you were in. Both were reachable at `?ux=plan-graph:clusters`.
    expect(bands, 'the packed regions are being drawn again').not.toContain('pg-clusters')
    expect(bands).not.toContain('pg-cluster')
  })

  it('cannot be sent to a design that no longer exists by the address', async () => {
    const asked = renderToStaticMarkup(h((await boot('?ux=plan-graph:clusters')).PlanGraphView, { reply: reply() }))
    const plain = renderToStaticMarkup(h((await boot('')).PlanGraphView, { reply: reply() }))
    expect(asked).toBe(plain)
  })
})

/**
 * A GATE ON A LINE IS WORDED IN THE PAGE'S LANGUAGE. The route sends `gateLabel`, the shared
 * contract's English for an agent reading raw text, and the drawing printed it as it came, so a
 * Chinese page read "must finish first" under every gated link (wave 13k round 41's list, round 42).
 * The drawing now words the gate itself through `gateWordsForReader`, as the gate mark does.
 */
describe('a gate is worded in the page language', () => {
  function gated(): PlanGraphReply {
    const r = reply()
    r.edges = r.edges.map((one) =>
      one.id === 'e4' ? { ...one, gate: { kind: 'hard' }, gateLabel: 'must finish first' }
      : one.id === 'e5' ? { ...one, gate: { kind: 'partial', upTo: 'review' }, gateLabel: 'only as far as review until this finishes' }
      : one)
    return r
  }
  const gates = (markup: string): string[] => [...markup.matchAll(/class="pg-row-gate">([^<]*)</g)].map((m) => m[1] ?? '')
  // A narrow window, so the drawing prints its written-out list, where every gate is on the page.
  async function narrow(search: string): Promise<PlanGraphModule> {
    const pg = await boot(search)
    ;(globalThis as unknown as { window: { matchMedia: unknown } }).window.matchMedia = () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    return pg
  }

  it('says the two gates in English on an English page', async () => {
    const markup = renderToStaticMarkup(h((await narrow('')).PlanGraphView, { reply: gated() }))
    expect(gates(markup)).toContain('must finish first')
    expect(gates(markup)).toContain('only as far as review until this finishes')
  })

  it('says the two gates in Chinese on a Chinese page, and no English is left on them', async () => {
    const markup = renderToStaticMarkup(h((await narrow('?lang=zh')).PlanGraphView, { reply: gated() }))
    const drawn = gates(markup)
    expect(drawn.length, 'no gate was drawn at all, so nothing here was checked').toBeGreaterThan(0)
    expect(drawn).toContain('必须先完成')
    expect(drawn).toContain('在此项完成之前只能推进到 review')
    expect(drawn.join(' ')).not.toMatch(/must finish|only as far as/)
  })
})
