// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE'S PAGE SAYS WHERE ITS PLAN STANDS IN THE PLANNING FLOW. Wave 13j round 49.
 *
 * `ModulePlanningPanel` reads `module.planning`, which only the office writes. These render it to static markup, as the
 * other page tests do, and check what must be in it: who the planner is or that nobody is named; that nobody said the
 * plan step is done; that the office waits for the submit; the four questions in the office's order with the planner's
 * answers under them; and that a hand tick says the plan was not questioned through the door. A flow run's page draws
 * the planning flow's own step sentences from the word list, so a Chinese page can translate them.
 *
 * PROVED BY CHAPTER 5'S THREE RUNS. CONTROL: 5 passed. Each mutation below, alone, turned the named cases red, and was
 * restored; RESTORE: 5 passed.
 *   M1. the panel draws the answers in the order of the stored object, not the office's order: case 3 goes red.
 *   M2. the panel draws a hand-ticked planning as waiting: case 4 goes red.
 *   M3. FlowRunSteps no longer looks up the planning steps: case 5 goes red.
 *   M4 (round 49b). the empty plan step is drawn as a sentence again (`say` on its Absence): case 1 goes red.
 *   M5 (round 49b). the empty planner is drawn as a sentence again: case 1 goes red.
 *
 * Every name and id below is made up.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The page component asks for the office's id, and a page with no server behind it cannot read it: the
// test office's page module registers the test office's id.
import './a-page-of-a-test-office.ts'
import { PLAN_QUESTIONS, PLAN_QUESTION_KEYS, PLANNING_STEP_DOES } from '../src/shared/planning-flow.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { ParticipantsReply } from '../src/web/api.ts'

type Panel = typeof import('../src/web/components/ModulePlanningPanel.tsx')
type Steps = typeof import('../src/web/components/FlowRunSteps.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
let panel: Panel
let steps: Steps
let i18n: I18n

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window ??= {
    localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {}, removeEventListener: () => {},
  }
  panel = await import('../src/web/components/ModulePlanningPanel.tsx')
  steps = await import('../src/web/components/FlowRunSteps.tsx')
  i18n = await import('../src/shared/i18n.ts')
})
afterAll(() => {
  i18n.setWordLanguage('en')
})

const PARTICIPANTS = {
  agents: [{ id: 'synthetic-planner-id', handle: 'synthetic-planner', name: 'Synthetic Planner', kind: 'agent' }],
  people: [{ id: 'synthetic-person-id', name: 'Synthetic Person', kind: 'human' }],
} as unknown as ParticipantsReply

const PLANNER = { kind: 'agent', id: 'synthetic-planner-id' }

function aModule(data: Record<string, unknown>): PanelRecord {
  return { id: 'synthetic-module', kind: 'module', workspaceId: 'default', ownerId: 'nobody', title: 'Synthetic module', data } as unknown as PanelRecord
}

const OPEN = {
  pipeline: 'synthetic-pipeline',
  flowRun: 'synthetic-flow-run',
  planStepDoneAt: '2026-10-10 21:00:00',
  planStepDoneBy: PLANNER,
  prompt: 'synthetic-prompt',
  checklistItem: { checklist: 'synthetic-checklist', item: 'i-1' },
}

/** The answers written in the reverse of the office's order, so a panel that drew the stored order would be caught. */
const ANSWERS = Object.fromEntries([...PLAN_QUESTION_KEYS].reverse().map((key) => [key, `Answer to ${key}.`]))

function drawn(data: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(panel.ModulePlanningPanel, { record: aModule(data), participants: PARTICIPANTS, declares: { surface: null }, plannerDeclares: { surface: null } }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe("a module's page says where its plan stands", () => {
  it('1. draws the ordinary mark for no planner and no plan step, and keeps the sentences as what the mark means', () => {
    const html = drawn({})
    expect(html).toContain('No planner is named on this module.')
    expect(html).toContain('Nobody has said the plan step is done for this module.')
    // ORDINARY EMPTINESS IS THE SHORT MARK (round 49b): both are ordinarily empty on a module, so neither is drawn as a sentence.
    expect(html.match(/class="px-absent" title="[^"]+">—/g)?.length).toBe(2)
    expect(html).not.toContain('px-absent-said')
  })

  it('2. names the planner, the plan step and its records, and says the office waits for the submit', () => {
    const html = drawn({ planner: PLANNER, planning: OPEN })
    expect(html).toContain('Planner: Synthetic Planner.')
    expect(html).toContain('Synthetic Planner said the plan step was done')
    for (const id of ['synthetic-pipeline', 'synthetic-prompt', 'synthetic-checklist', 'synthetic-flow-run']) expect(html).toContain(id)
    expect(html).toContain('The office waits for the planner to question the plan and submit it.')
  })

  it("3. draws the four questions in the office's order, each with the planner's answer under it", () => {
    const html = drawn({
      planner: PLANNER,
      planning: { ...OPEN, questioned: { at: '2026-10-10 21:30:00', by: PLANNER, answers: ANSWERS }, ended: { at: '2026-10-10 21:30:00', how: 'submitted', by: PLANNER } },
    })
    expect(html).toContain('Synthetic Planner questioned the plan and submitted it')
    expect(html).not.toContain('The office waits')
    const at = PLAN_QUESTION_KEYS.flatMap((key) => [html.indexOf(PLAN_QUESTIONS[key].replace(/'/g, '&#x27;')), html.indexOf(`Answer to ${key}.`)])
    expect(at.every((n) => n >= 0), html).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('4. says a hand tick did not question the plan through the door', () => {
    const html = drawn({
      planner: PLANNER,
      planning: { ...OPEN, ended: { at: '2026-10-10 21:40:00', how: 'ticked by hand', by: { kind: 'human', id: 'synthetic-person-id' } } },
    })
    expect(html).toContain('Synthetic Person ticked the checklist item by hand')
    expect(html).toContain('The plan was not questioned through the submit door.')
    expect(html).not.toContain('The office waits')
  })

  it("5. a flow run's page draws the planning steps from the word list", () => {
    i18n.setWordLanguage('en')
    const record = {
      id: 'synthetic-flow-run', kind: 'flow_run', workspaceId: 'default', ownerId: 'nobody', title: 'Planning flow run',
      data: { run: 'synthetic-run', module: 'synthetic-module', noFlow: 'synthetic', stepsTaken: [{ does: PLANNING_STEP_DOES.submitted, actor: PLANNER, endedAt: '2026-10-10 21:30:00', how: 'by an agent', outcome: 'done' }] },
    } as unknown as PanelRecord
    // A WORD LIST THAT SAYS SOMETHING ELSE FOR THE STEP proves the page read the list and not the stored sentence.
    const words = i18n.WORD_LISTS.en as unknown as Record<string, unknown>
    const kept = words['w13j.planning.step.submitted']
    words['w13j.planning.step.submitted'] = 'SYNTHETIC WORD FOR THE SUBMITTED STEP'
    try {
      const html = renderToStaticMarkup(h(steps.FlowRunSteps, { record, participants: PARTICIPANTS }))
      expect(html).toContain('SYNTHETIC WORD FOR THE SUBMITTED STEP')
    } finally {
      words['w13j.planning.step.submitted'] = kept
    }
  })
})
