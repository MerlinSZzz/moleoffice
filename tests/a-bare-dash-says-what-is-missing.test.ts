// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BARE DASH SAYS WHAT IS MISSING, TO A SCREEN READER.
 *
 * `Absence` draws an em dash for an ordinary emptiness. With no `title`, the dash is all there is:
 * a screen reader announces nothing after the heading. Each empty state below drew exactly that.
 * Each now passes a sentence, which becomes the dash's hover and its screen-reader text.
 *
 * Every sentence is read from its word key, so a change of words changes nothing here.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { PlanGraphReply } from '../src/server/api/plan-graph.ts'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { WorkListReply } from '../src/server/lib/worklist.ts'
import type { PanelRecord } from '../src/shared/types.ts'

let work: typeof import('../src/web/pages/family/WorkPage.tsx')
let plans: typeof import('../src/web/pages/plans/PlansPage.tsx')
let modules: typeof import('../src/web/pages/family/ModulesPage.tsx')
let graph: typeof import('../src/web/components/graph/PlanGraph.tsx')
let pipelines: typeof import('../src/web/pages/PipelinePage.tsx')
let flow: typeof import('../src/web/components/PipelineFlow.tsx')

beforeAll(async () => {
  // The pages reach src/web/api.ts and src/web/lib/mode.ts, which touch `window` at module scope.
  // The smallest stand-in that lets them load; nothing here is under test.
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
  work = await import('../src/web/pages/family/WorkPage.tsx')
  plans = await import('../src/web/pages/plans/PlansPage.tsx')
  modules = await import('../src/web/pages/family/ModulesPage.tsx')
  graph = await import('../src/web/components/graph/PlanGraph.tsx')
  pipelines = await import('../src/web/pages/PipelinePage.tsx')
  flow = await import('../src/web/components/PipelineFlow.tsx')
})

/** The same escaping React gives an attribute and a text node. */
function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Each dash in the markup, with its hover and its screen-reader text (null when it has none). */
function dashes(markup: string): { title: string | null; read: string | null }[] {
  return [...markup.matchAll(/<span class="px-absent"( title="([^"]*)")?>(.*?)<\/span>(<\/span>)?/g)].map((m) => {
    const read = /<span class="px-sr">(.*)$/.exec(m[3] ?? '')
    return { title: m[2] ?? null, read: read === null ? null : (read[1] ?? null) }
  })
}

/** The markup says `sentence` as a dash's hover and as its screen-reader text. */
function expectTheDashToSay(markup: string, sentence: string): void {
  expect(dashes(markup)).toContainEqual({ title: escaped(sentence), read: escaped(sentence) })
}

function pipelineRecord(id: string, title: string, data: Record<string, unknown>): PanelRecord {
  return {
    id,
    kind: 'pipeline',
    title,
    summary: null,
    data,
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-08 09:00:00',
    deletedAt: null,
  } as unknown as PanelRecord
}

describe('a bare dash says what is missing', () => {
  it('Work to do with no work in any project', () => {
    const reply = { rows: [], counted: 0, returned: 0, leftOut: 0, note: '' } as unknown as WorkListReply
    const projects = { workspaces: [] } as unknown as WorkspacesReply
    const markup = renderToStaticMarkup(h(work.WorkList, { reply, projects, now: Date.parse('2026-11-03T08:00:00Z') }))
    expectTheDashToSay(markup, sayInEnglish('g7a.work.none'))
  })

  it('Modules with no module in the project', () => {
    const markup = renderToStaticMarkup(h(modules.ModulesPage, { records: [], links: [], onFiled: () => {} }))
    expectTheDashToSay(markup, sayInEnglish('g7a.modules.none'))
  })

  it('Plans with no open plan, and the ended plans with none', () => {
    const open = renderToStaticMarkup(h(plans.PlansGrid, { reply: { plans: [], closed: 0, note: '' } }))
    expectTheDashToSay(open, sayInEnglish('g8.shelf.noOpenPlan'))
    const ended = renderToStaticMarkup(h(plans.ClosedPlans, { plans: [] }))
    expectTheDashToSay(ended, sayInEnglish('g8.shelf.noEndedPlan'))
  })

  it('the Goals drawing with nothing to draw', () => {
    const reply: PlanGraphReply = {
      horizon: 'month',
      period: '2026-11',
      from: '2026-11-01',
      to: '2026-11-30',
      workspaceId: 'empty',
      workspaceTitle: 'Empty',
      nodes: [],
      edges: [],
      elsewhere: [],
      omitted: [],
      note: 'The server note, drawn in developer mode only.',
    }
    const markup = renderToStaticMarkup(h(graph.PlanGraphView, { reply }))
    expectTheDashToSay(markup, sayInEnglish('g8.graph.nothingDrawn'))
  })

  // CRITERION CHANGE, as decided: the row has no WHY IT IS HERE part any more. The stepless row's
  // dash stands where the row says how far the pipeline stands, and the broken row draws its
  // problem and the word for an unreadable pipeline, with no dash.
  it("a pipeline's row, broken and with no step", () => {
    const broken = flow.readPipeline(pipelineRecord('b', 'Broken', {}), [], [])
    const stepless = flow.readPipeline(pipelineRecord('s', 'Stepless', { blockIds: [] }), [], [])
    // What each case is, read as it is: one cannot be drawn, the other can and holds no step.
    expect([broken.problem === null, broken.steps.length]).toEqual([false, 0])
    expect([stepless.problem === null, stepless.steps.length]).toEqual([true, 0])
    const byTitle = new Map(pipelines.orderPipelines([broken, stepless], new Map()).map((entry) => [entry.reading.record.title, entry]))
    const row = (title: string): string => {
      const entry = byTitle.get(title)
      if (entry === undefined) throw new Error(`no index entry for ${title}`)
      return renderToStaticMarkup(h(pipelines.IndexRow, { entry, current: false, onPick: () => {} }))
    }
    expect(dashes(row('Broken'))).toEqual([])
    expect(row('Broken')).toContain(sayInEnglish('g7b.PipelinePage.unreadable'))
    expectTheDashToSay(row('Stepless'), sayInEnglish('g7b.PipelinePage.it_has_no_step'))
  })
})
