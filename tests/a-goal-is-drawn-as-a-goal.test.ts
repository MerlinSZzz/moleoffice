// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GOAL IS DRAWN AS A GOAL — criterion P1's drawing half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHAT IT IS MEASURED AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P1 of design/planning/ACCEPTANCE.md puts a goal at the root of the plan graph beside the
 * obligations and directions, says the work that serves it hangs below it, and says an agent-filed
 * goal is marked as the agent's until the person confirms it. The route half of that landed first
 * (`plan-graph.ts` made `goal` an anchor kind); this file holds the DRAWING half, where the goal had
 * been wearing the `work` role and the work colour — the control run this file is written against
 * measured exactly that.
 *
 * Four things are checked and each of them is a claim about the picture:
 *
 *   1. THE GOAL'S OWN ROLE. `roleOf('goal')` is `goal`, the key and the cards read one table
 *      (`ROLE_KEY`), and the full card's role line says "goal", not "work" or the word "goal" twice.
 *   2. THE GOAL AT THE ROOT, THE SERVING TRAJECTORY BELOW IT. The band's anchor and the panel's top
 *      anchor are the goal, and the `serves` edge that joins the trajectory to it is drawn in the
 *      intent family. A trajectory is not one of the kinds the ordinary one-link rule calls work, and
 *      without the route's `serves` rule the goal would read as one with nothing under it.
 *   3. THE MARK AND THE STATE, READ AND NOT RESTATED. The unconfirmed line comes from
 *      `goalIsConfirmed`, the one reader of the two stored fields; a met goal draws the ended state
 *      drawing through the product's one state drawing table.
 *   4. ITS OWN INK IN EVERY PALETTE. The browser reads the card's real colour in all eight.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS, EACH ONE LINE OF PRODUCT CODE, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   plan-graph.ts: `if (kind === 'goal') return 'goal'` deleted
 *       → "says role goal for a goal" (route) and the role cases here go red.
 *   plan-graph.ts: the `servesThisGoal` clause deleted
 *       → "draws the trajectory that serves it" and this file's band case go red.
 *   PlanGraph.tsx: `goalIsConfirmed` ignored, `goalMark` always null
 *       → "says so on its card" goes red.
 *
 * The report carries the sha256 of each file before and after the restore.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { PlanGraphEdge, PlanGraphNode, PlanGraphReply } from '../src/server/api/plan-graph.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'

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
  // read again. The same reason tests/plan-graph-drawing.test.ts does it.
  vi.resetModules()
  return (await import('../src/web/components/graph/PlanGraph.tsx')) as PlanGraphModule
}

const GOAL_ID = 'goal-1'
const TRAJECTORY_ID = 'trajectory-1'
const TASK_ID = 'task-1'

/** The record the route would have read, so `words` and `levels` are what the shared readers say. */
function recordFor(
  id: string,
  kind: RecordKind,
  title: string,
  data: Record<string, unknown> = {},
): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-01 09:00:00',
    deletedAt: null,
  }
}

function node(over: Partial<PlanGraphNode> & { recordId: string; kind: RecordKind; data?: Record<string, unknown> }): PlanGraphNode {
  const { data, ...rest } = over
  const title = rest.title ?? over.recordId
  return {
    role: 'work',
    title,
    name: title,
    within: null,
    state: null,
    depth: null,
    effortHours: null,
    due: null,
    settled: null,
    record: recordFor(over.recordId, over.kind, title, data ?? {}),
    drawn: 'anchor',
    oneLinkFrom: [],
    allocations: [],
    ...rest,
  }
}

/** A goal as the route serves it: its own role, its state whole, and the data the drawing reads. */
function goalNode(extra: Record<string, unknown> = {}, over: Partial<PlanGraphNode> = {}): PlanGraphNode {
  return node({
    recordId: GOAL_ID,
    kind: 'goal',
    role: 'goal',
    title: 'The export survives a large report',
    state: 'open',
    data: {
      horizon: 'short',
      what: 'A report of any size exports without the browser tab running out of memory.',
      owner: THE_TEST_OFFICES_OWNER.id,
      state: 'open',
      ...extra,
    },
    ...over,
  })
}

function edge(id: string, from: string, to: string, type: PlanGraphEdge['type'], label: string): PlanGraphEdge {
  return { id, from, to, type, label, gateLabel: null, gateProblem: null, broken: false, gate: null }
}

function replyOf(nodes: PlanGraphNode[], edges: PlanGraphEdge[] = []): PlanGraphReply {
  return {
    horizon: 'week',
    period: '2026-W33',
    from: '2026-08-10',
    to: '2026-08-16',
    workspaceId: 'panelx',
    workspaceTitle: 'Mole Office',
    nodes,
    edges,
    elsewhere: [],
    omitted: [],
    note: 'a drawing this test made',
  }
}

/** A goal and the trajectory that serves it, joined by the stored `serves` link. */
function servedReply(goalExtra: Record<string, unknown> = {}): PlanGraphReply {
  const trajectory = node({
    recordId: TRAJECTORY_ID,
    kind: 'trajectory',
    title: 'The intended future',
    drawn: 'one link from an anchor',
    oneLinkFrom: [GOAL_ID],
  })
  return replyOf([goalNode(goalExtra), trajectory], [
    edge('e-serves', TRAJECTORY_ID, GOAL_ID, 'serves', 'serves'),
  ])
}

// ============================================================================ the role

describe('a goal is a role of its own, and the key and the cards read one table', () => {
  it('calls it goal in the key and on the card, and never work', async () => {
    const pg = await boot()
    // The one table the key and the cards both read. Two string literals that have to agree is the
    // defect CLAUDE.md names, and this is the test that would not see it if there were two.
    expect(pg.ROLE_KEY.goal.word, 'the role is not named goal').toBe('goal')
    const key = renderToStaticMarkup(h(pg.Legend))
    expect(key, 'the key has no goal entry').toContain(pg.ROLE_KEY.goal.word)
    expect(key, 'the key draws no goal swatch').toContain('data-role="goal"')

    // The full card is where a record's role is printed as a word at all — the canvas card is a
    // mark, a title and one state chip on purpose. The list is what a reply with no edges lands on.
    const flat = servedReply()
    flat.edges = []
    const drawing = renderToStaticMarkup(h(pg.PlanGraphView, { reply: flat }))
    expect(drawing, 'the goal card does not say goal').toMatch(/<p class="pg-card-role"[^>]*>goal<\/p>/)
    // And a trajectory serving it is still named for what it is, not promoted to a goal.
    expect(drawing).toMatch(/<p class="pg-card-role"[^>]*>planned future<\/p>/)
    // The canvas card carries the role in its own attribute, which the stylesheet strokes from.
    expect(drawing, 'no canvas card carries the goal role').toContain('data-plan-role="goal"')
  })

  it('draws a met goal through the one state drawing table, where met is the ended mark', async () => {
    const pg = await boot()
    // The state is read out of the FULL CARD's own state row, not the canvas card's chip: the canvas
    // card is drawn twice in the rack and its chip would make this pass even if the full card
    // stopped using the one drawing table.
    const stateDrawingOnTheCard = (markup: string): string | undefined =>
      /<dd><span class="px-chip[^>]*data-drawing="([^"]+)"/.exec(markup)?.[1]
    const met = replyOf([goalNode({ state: 'met' }, { state: 'met' })])
    // `StoredState` writes the drawing it worked out, from `STATE_DRAWING_BY_WORD` in ui.tsx — the
    // one table where `met` maps to `ended`. Nothing here restates that mapping.
    expect(stateDrawingOnTheCard(renderToStaticMarkup(h(pg.PlanGraphView, { reply: met }))), 'a met goal does not draw the ended mark').toBe('ended')
    const dropped = replyOf([goalNode({ state: 'dropped' }, { state: 'dropped' })])
    expect(stateDrawingOnTheCard(renderToStaticMarkup(h(pg.PlanGraphView, { reply: dropped })))).toBe('ended-empty')
  })
})

// ============================================================================ the root, and what serves it

describe('the goal sits at the root, and the trajectory that serves it hangs below through a serves edge', () => {
  it('names the goal as the panel’s top anchor and as its band’s anchor', async () => {
    const pg = await boot()
    const model = pg.planModel(servedReply())
    expect(model.goals, 'the goal was not counted as a goal').toBe(1)
    // THE ROOT IS THE GOAL. Criterion P1 starts the drawing from goals, so a goal outranks a
    // deadline for the one record the panel is about.
    expect(model.topAnchorId, 'the goal is not the record the panel is about').toBe(GOAL_ID)
    expect(model.bands, 'the goal and its trajectory are not one group').toHaveLength(1)
    expect(model.bands[0]?.anchor?.recordId, 'the band is not anchored on the goal').toBe(GOAL_ID)
    expect(model.bands[0]?.nodes.map((n) => n.recordId).sort()).toEqual([GOAL_ID, TRAJECTORY_ID].sort())
  })

  it('draws the goal card and the serves line between it and the trajectory, in the intent family', async () => {
    const pg = await boot()
    const model = await import('../src/web/components/graph/model.ts')
    const card = await import('../src/web/components/graph/card.ts')
    const reply = servedReply()
    // NOT a straight run: a run is drawn as a row of chips with no lines at all, so the serves edge
    // would never reach the plane. The band's own model is used and only that is overridden.
    const band = { ...pg.planModel(reply).bands[0]!, run: null }
    const drawn = {
      placements: new Map([
        [GOAL_ID, { x: 0, y: 0, width: 200, height: 60 }],
        [TRAJECTORY_ID, { x: 0, y: 120, width: 200, height: 60 }],
      ]),
      routes: new Map([
        [
          'e-serves',
          { points: [{ x: 100, y: 60 }, { x: 100, y: 120 }], label: null },
        ],
      ]),
      width: 200,
      height: 180,
    }
    const graph = model.buildStructureGraph({ scope: { at: 'plan', period: reply.period }, now: 0, plan: reply })
    const cardPlan = card.planCanvas(graph, 'title')
    const props = {
      reply,
      graph,
      model: pg.planModel(reply),
      cardFor: (n: PlanGraphNode) => {
        const one = graph.nodes.find((d) => d.recordId === n.recordId)
        if (one === undefined) throw new Error(`no card for ${n.recordId}`)
        return {
          node: one,
          onOpen: () => {},
          flow: 'RIGHT' as const,
          lit: false,
          restriction: null,
          here: [],
          says: 'title' as const,
          plan: card.planFor(cardPlan, one.id),
          choice: card.NOTHING_PRESSED,
          onChoose: () => {},
        }
      },
      sizes: { sizes: null, unmeasured: [], rack: null },
      selected: null,
      onSelect: () => {},
      hoveredEdge: null,
      onHoverEdge: () => {},
      folded: new Set<string>(),
      onToggleBand: () => {},
      inspect: false,
    }
    const markup = renderToStaticMarkup(h(pg.BandBody, { band, drawn, props } as never))
    // The goal's own box, and the trajectory's, both on the plane.
    expect(markup, 'the goal is not drawn as a goal').toContain('data-plan-role="goal"')
    expect(markup, 'the trajectory that serves it is not drawn').toContain('data-plan-role="work"')
    // The stored `serves` link is drawn in the intent family: the head of the line has not happened.
    const family = /class="pg-line"[^>]*data-family="([^"]+)"/.exec(markup)
    expect(family?.[1], 'the serves line is not drawn in the intent family').toBe('intent')
  })
})

// ============================================================================ the agent's mark

describe("an agent's goal says so until the person confirms it", () => {
  it('reads the mark through goalIsConfirmed from the two stored fields', async () => {
    const pg = await boot()
    const filed = goalNode({ filed_by: THE_TEST_OFFICES_SECRETARY.handle })
    expect(pg.goalMark(filed)).toBe('An agent filed this goal. The person has not confirmed it yet.')
    // The person's press clears it.
    expect(pg.goalMark(goalNode({ filed_by: THE_TEST_OFFICES_SECRETARY.handle, confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16 07:00:00' } }))).toBeNull()
    // A goal the person filed is not marked at all.
    expect(pg.goalMark(goalNode())).toBeNull()
    // And no other card wears the line.
    expect(pg.goalMark(node({ recordId: TASK_ID, kind: 'task' }))).toBeNull()
  })

  it('draws the line on an agent-filed goal and not on a confirmed one', async () => {
    const pg = await boot()
    const unconfirmed = renderToStaticMarkup(h(pg.PlanGraphView, { reply: replyOf([goalNode({ filed_by: THE_TEST_OFFICES_SECRETARY.handle })]) }))
    expect(unconfirmed, 'an agent-filed goal does not say the person has not confirmed it').toContain(
      'An agent filed this goal. The person has not confirmed it yet.',
    )
    const confirmed = renderToStaticMarkup(
      h(pg.PlanGraphView, {
        reply: replyOf([goalNode({ filed_by: THE_TEST_OFFICES_SECRETARY.handle, confirmed_by: { by: THE_TEST_OFFICES_OWNER.id, at: '2026-09-16 07:00:00' } })]),
      }),
    )
    expect(confirmed, 'a confirmed goal still wears the agent mark').not.toContain('An agent filed this goal.')
    const persons = renderToStaticMarkup(h(pg.PlanGraphView, { reply: replyOf([goalNode()]) }))
    expect(persons, 'a goal the person filed wears the agent mark').not.toContain('An agent filed this goal.')
  })
})

// ============================================================================ its own ink, in every palette

describe('the goal card has an ink of its own in every palette', () => {
  it('draws the goal card in a colour of its own in all the palettes', async () => {
    const pg = await boot()
    const shell = renderToStaticMarkup(h(pg.PlanGraph, { period: '2026-W33' }))
    const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(shell)?.[1] ?? ''
    const reply = replyOf([
      goalNode(),
      node({ recordId: TASK_ID, kind: 'task', title: 'Fix the export', state: 'doing' }),
    ])
    const cards = renderToStaticMarkup(h(pg.PlanGraphView, { reply }))
    const { drawInABrowser } = await import('./what-the-browser-draws.ts')
    const browser = await drawInABrowser(`<style>${css}</style>${cards}`)
    try {
      const { PALETTES } = await import('./what-the-browser-draws.ts')
      expect(PALETTES.length, 'no palettes were found in tokens.css, so this measures nothing').toBe(2)
      for (const theme of [null, ...PALETTES]) {
        await browser.palette(theme)
        const named = theme ?? 'the default palette'
        const ink = await browser.styleOf('.pg-cc[data-plan-role="goal"]', 'border-left-color')
        // The ordinary work card is drawn in the structural border, so a palette that declared no
        // goal ink would draw the two the same colour.
        const work = await browser.styleOf('.pg-cc[data-plan-role="work"]', 'border-left-color')
        expect(ink, `${named} draws no goal colour at all`).not.toBe('rgba(0, 0, 0, 0)')
        expect(ink, `${named} draws the goal in the work border, so it has no colour of its own`).not.toBe(work)
      }
      await browser.palette(null)
    } finally {
      await browser.close()
    }
  }, 120_000)
})
