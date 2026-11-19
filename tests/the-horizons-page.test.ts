// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change: plan 7FEOshq3mBGG replaces ordinary empty sentences and hides machine details in normal mode.
// Criterion change (wave 13j round 11, on goals): the owner is a labelled fact, every dash carries its reason, a module draws no dash, and the waiting goals share one sentence.
// Criterion change (wave 13j round 14, on goals): Goals reads across projects because of a decision, so a part built
// that no plan named is said of "the projects shown", not "this project".
/**
 * THE HORIZONS, THE CLUSTERS, THE PARTS AND PLANNED AGAINST ACTUAL. Criterion P5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS, AND WHY IT DOES NOT NEED A SERVER
 * ---------------------------------------------------------------------------------------
 *
 * The whole reading of P5's page is a pure function in `src/shared/horizons.ts`, so it is proved
 * here with plain objects: which goal sits at which horizon, which cluster serves it, which parts a
 * trajectory names, who is on a part and the three sentences that put planned beside actual. The
 * page's own drawing is rendered to a string with `TheHorizons`, which fetches nothing.
 *
 * A BROWSER TEST COVERS THE REST. `tests/horizons-in-a-browser.test.ts` drives the real page at four
 * widths in both themes; this file answers the questions a rendered string can answer on its own,
 * and it is the file the mutation proofs below are written against.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS, EACH ONE LINE OF PRODUCT CODE
 * ---------------------------------------------------------------------------------------
 *
 *   horizons.ts: `link.type !== 'serves'` becomes `link.type !== 'relates_to'`
 *       → "a cluster serves its goal" and the drawn page go red.
 *   horizons.ts: the late-window filter's `window.endsOn < input.today` becomes `>`
 *       → "a late window is named" goes red.
 *   horizons.ts: `!namedByATrajectory.has(partId)` becomes `namedByATrajectory.has(partId)`
 *       → "a part built that no plan named" goes red.
 *   windowowner.ts: `type === 'agent'` becomes `type === 'person'`
 *       → "an agent's window says so" goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  againstActual,
  readHorizons,
  type HorizonLink,
  type HorizonRecord,
  type HorizonsInput,
} from '../src/shared/horizons.ts'
import { ownerOfWindow, NOBODY_RECORDED_THE_WINDOW_OWNER } from '../src/shared/windowowner.ts'
import type { TheGoalSpans } from '../src/shared/goal-spans.ts'
import { setActor, type ParticipantOnTheWire, type WebActor } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

// The page imports the rail's own name reader through Sidebar, which reads storage as it is
// imported — the smallest stand-in that lets the import finish, the same one other page tests use.
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

const NOW = '2026-09-10 09:00:00'

function record(kind: string, id: string, title: string, data: Record<string, unknown>): HorizonRecord {
  return { id, kind, title, data }
}

const GOAL_SHORT = record('goal', 'goal-1', 'The clamp holds a pot', {
  horizon: 'short',
  what: 'The clamp holds a 60 mm pot through twenty trials.',
  owner: THE_TEST_OFFICES_OWNER.id,
  state: 'open',
})
const GOAL_LONELY = record('goal', 'goal-2', 'Every trial is measured', {
  horizon: 'short',
  what: 'Every trial records the force it met.',
  owner: THE_TEST_OFFICES_OWNER.id,
  state: 'open',
})
/** An agent-filed goal the person has not confirmed: this is the mark P1 draws and the press clears. */
const GOAL_AGENT_FILED = record('goal', 'goal-3', 'Every transplant is measured by the rig', {
  horizon: 'medium',
  what: 'Every transplant is measured without anything written by hand.',
  owner: THE_TEST_OFFICES_OWNER.id,
  state: 'open',
  filed_by: 'perception',
})
const TRAJECTORY = record('trajectory', 'trj-1', 'Tray clamp, step by step', {
  plannedStateIds: ['part-2', 'part-1'],
  because: 'The shape is right before the force can be measured.',
})
const PART_1 = record('planned_state', 'part-1', 'The clamp closes without slipping', {
  what: 'The clamp closes on a 60 mm pot without slipping.',
})
const PART_2 = record('planned_state', 'part-2', 'The force is measured', {
  what: 'The holding force is measured on every trial.',
})
const MODULE_SERVES = record('module', 'mod-1', 'Force bench', { state: 'active' })
const WORK = record('task', 'task-1', 'Reprint the jaw', { state: 'doing' })

/** A world with one serving cluster of each kind, one lonely goal, and people and windows. */
function input(over: Partial<HorizonsInput> = {}): HorizonsInput {
  const links: HorizonLink[] = [
    { fromId: 'trj-1', toId: 'goal-1', type: 'serves' },
    { fromId: 'mod-1', toId: 'goal-1', type: 'serves' },
    { fromId: 'task-1', toId: 'part-1', type: 'realises' },
  ]
  return {
    goals: [GOAL_SHORT, GOAL_LONELY],
    trajectories: [TRAJECTORY],
    plannedStates: [PART_1, PART_2],
    modules: [MODULE_SERVES],
    links,
    presenceByRecord: {
      'part-1': [
        {
          domainId: 'dom-1',
          domainTitle: 'Clamp force scope',
          agentTitle: 'perception',
          objective: 'Measure the holding force.',
          presence: 'live',
          quietForMinutes: 2,
        },
      ],
    },
    windows: [
      {
        id: 'win-1',
        recordId: 'task-1',
        startsOn: '2026-09-01',
        endsOn: '2026-09-03',
        state: 'planned',
        note: null,
        createdBy: 'agent:perception',
      },
    ],
    droppedLines: [
      {
        id: 'alloc-1',
        workTitle: 'Reprint the jaw',
        period: '2026-09',
        plannedHours: 3,
        note: 'the reprint slipped',
        createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      },
    ],
    titlesById: { 'task-1': 'Reprint the jaw', 'mod-1': 'Force bench', 'trj-1': 'Tray clamp, step by step' },
    today: '2026-09-10',
    ...over,
  }
}

const SPANS: TheGoalSpans = {
  distantHasNoLimit: 'A distant goal has no time limit.',
  spans: [
    { key: 'shortGoalDays', horizon: 'short', label: 'Short', means: '', nobodyChose: true, inForce: 14, from: 'the default', says: 'within 14 days' },
    { key: 'mediumGoalDays', horizon: 'medium', label: 'Medium', means: '', nobodyChose: true, inForce: 60, from: 'the default', says: 'within 60 days' },
    { key: 'longGoalDays', horizon: 'long', label: 'Long', means: '', nobodyChose: true, inForce: 365, from: 'the default', says: 'within 365 days' },
  ],
}

/** Everybody registered in this made-up world: one person, whose handle a goal's `owner` names. */
const PARTICIPANTS = {
  people: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name, handle: THE_TEST_OFFICES_OWNER.id } as ParticipantOnTheWire],
  agents: [],
}

const drawing = async () => {
  const page = await import('../src/web/pages/HorizonsPage.tsx')
  const options = input()
  const reading = {
    levels: readHorizons(options),
    actual: againstActual(options),
    spans: SPANS,
    partsRead: options.plannedStates.length,
    today: options.today,
    participants: PARTICIPANTS,
    projectOf: {},
  }
  return renderToStaticMarkup(h(page.TheHorizons, { reading })).replace(/<style[\s\S]*?<\/style>/g, ' ')
}

/** The same drawing, with one agent-filed goal nobody has confirmed in the world. */
const drawingWithAnAgentsGoal = async () => {
  const page = await import('../src/web/pages/HorizonsPage.tsx')
  const options = input({ goals: [GOAL_SHORT, GOAL_LONELY, GOAL_AGENT_FILED] })
  const reading = {
    levels: readHorizons(options),
    actual: againstActual(options),
    spans: SPANS,
    partsRead: options.plannedStates.length,
    today: options.today,
    participants: PARTICIPANTS,
    projectOf: {},
  }
  return renderToStaticMarkup(h(page.TheHorizons, { reading })).replace(/<style[\s\S]*?<\/style>/g, ' ')
}

// ============================================================================ the reading

describe('the four horizons are all drawn', () => {
  it('returns every horizon the goal kind declares, in order, including the empty ones', () => {
    const levels = readHorizons(input())
    expect(levels.map((l) => l.horizon)).toEqual(['short', 'medium', 'long', 'distant'])
    expect(levels[0]!.goals.map((g) => g.id)).toEqual(['goal-1', 'goal-2'])
    expect(levels[1]!.goals).toEqual([])
  })
})

describe('a cluster serves a goal', () => {
  it('puts a trajectory and a module under the goal a serves link points at', () => {
    const [short] = readHorizons(input())
    const goal = short!.goals.find((g) => g.id === 'goal-1')!
    expect(goal.clusters.map((c) => c.id)).toEqual(['trj-1', 'mod-1'])
    expect(goal.clusters[0]!.isTrajectory).toBe(true)
    expect(goal.clusters[1]!.isTrajectory).toBe(false)
    expect(goal.clusters[1]!.parts).toEqual([])
  })

  it('draws a goal nothing serves as a goal with no clusters rather than dropping it', () => {
    const [short] = readHorizons(input())
    const lonely = short!.goals.find((g) => g.id === 'goal-2')!
    expect(lonely.clusters).toEqual([])
  })

  it('keeps the parts in the order the trajectory stores them, and says what would be true', () => {
    const [short] = readHorizons(input())
    const parts = short!.goals.find((g) => g.id === 'goal-1')!.clusters[0]!.parts
    expect(parts.map((p) => p.id)).toEqual(['part-2', 'part-1'])
    expect(parts[1]!.what).toBe('The clamp closes on a 60 mm pot without slipping.')
  })
})

describe('who is on a part, and the window it carries', () => {
  it('draws the live work domain about a part, and the window on the work that realises it', () => {
    const [short] = readHorizons(input())
    const part = short!.goals.find((g) => g.id === 'goal-1')!.clusters[0]!.parts.find((p) => p.id === 'part-1')!
    expect(part.people.map((p) => p.agentTitle)).toEqual(['perception'])
    expect(part.builtBy.map((b) => b.title)).toEqual(['Reprint the jaw'])
    expect(part.windows.map((w) => w.id)).toEqual(['win-1'])
    expect(part.windows[0]!.owner.kind).toBe('agent')
    // A part nobody is on keeps an empty list rather than a made-up person.
    const other = short!.goals.find((g) => g.id === 'goal-1')!.clusters[0]!.parts.find((p) => p.id === 'part-2')!
    expect(other.people).toEqual([])
  })
})

describe('whose window it is', () => {
  it('reads the person, an agent and a stamp it cannot read apart, and never guesses', () => {
    expect(ownerOfWindow(`human:${THE_TEST_OFFICES_OWNER.id}`)).toMatchObject({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id, isThePerson: true })
    expect(ownerOfWindow('agent:perception')).toMatchObject({ kind: 'agent', id: 'perception', word: "perception's window" })
    expect(ownerOfWindow('system:migration')).toMatchObject({ kind: 'other' })
    expect(ownerOfWindow(null)).toMatchObject({ kind: 'unreadable', word: NOBODY_RECORDED_THE_WINDOW_OWNER })
    expect(ownerOfWindow('jemie')).toMatchObject({ kind: 'unreadable' })
  })
})

// ============================================================================ planned against actual

describe('planned against actual, each named in words', () => {
  const facts = againstActual(input())

  it('names a late window in a sentence that carries the work and the last day', () => {
    expect(facts.lateWindows).toHaveLength(1)
    expect(facts.lateWindows[0]!.said).toBe(
      '"Reprint the jaw" was meant to be worked on until 2026-09-03, and that window is still planned. ' +
        "It is perception's window.",
    )
  })

  it('names a dropped line in a sentence that carries the work, the hours and the period', () => {
    expect(facts.droppedLines).toHaveLength(1)
    expect(facts.droppedLines[0]!.said).toContain('giving "Reprint the jaw" 3 hours in 2026-09 was dropped')
    expect(facts.droppedLines[0]!.said).toContain(`It is ${THE_TEST_OFFICES_OWNER.id}'s window`)
    expect(facts.droppedLines[0]!.said).toContain('the reprint slipped')
  })

  it('names a part something made real that no trajectory writes down', () => {
    const built = againstActual(
      input({ trajectories: [record('trajectory', 'trj-2', 'Another future', { plannedStateIds: [] })] }),
    )
    expect(built.partsBuilt).toHaveLength(1)
    expect(built.partsBuilt[0]!.said).toBe(
      '"Reprint the jaw" made "The clamp closes on a 60 mm pot without slipping." real, and no trajectory in ' +
        'the projects shown names it as a part.',
    )
  })

  it('says nothing when the plan and the record agree', () => {
    const quiet = againstActual(
      input({
        trajectories: [record('trajectory', 'trj-1', 'Tray clamp, step by step', { plannedStateIds: ['part-1', 'part-2'] })],
      }),
    )
    expect(quiet.partsBuilt).toEqual([])
  })
})

// ============================================================================ what the page draws

describe('the page draws every state, empty ones in words', () => {
  it('draws a goal at each horizon, the serving clusters, the parts, who is on one and its window', async () => {
    const markup = await drawing()
    for (const word of ['Short goals', 'Medium goals', 'Long goals', 'Distant goals']) {
      expect(markup, word).toContain(word)
    }
    expect(markup).toContain('The clamp holds a pot')
    expect(markup).toContain('The clamp closes on a 60 mm pot without slipping.')
    expect(markup).toContain('perception')
    expect(markup).toContain('perception&#x27;s window')
  })

  it('names the goal owner by the registry’s own name, never the stored handle', async () => {
    // Report dbPgS8ooliII, block b-6: every goal drew the raw handle, the owner's id. Both goals here are
    // owned by THE_TEST_OFFICES_OWNER's id, which PARTICIPANTS registers as the person with its name.
    const markup = await drawing()
    expect(markup).toContain(`<span class="hz-owner">Owner: ${THE_TEST_OFFICES_OWNER.name}</span>`)
    expect(markup).not.toMatch(new RegExp(`class="hz-owner"[^>]*>[^<]*${THE_TEST_OFFICES_OWNER.id}`))
  })

  it('marks a goal with nothing serving it, with the reason on hover', async () => {
    const markup = await drawing()
    expect(markup).toContain('<span class="px-absent" title="Nothing is linked to this goal as serving it.">—')
  })

  it('marks a part with nobody on it with the reason, and draws no mark under a module', async () => {
    const markup = await drawing()
    expect(markup).toContain(`<span class="px-absent" title="${sayInEnglish('goals.nobodyOnPart')}">—`)
    // A module has no parts by design, so nothing under it is missing (problem HO6m_XXWJgtM).
    const module = markup.slice(markup.indexOf('Force bench'))
    const underModule = module.slice(0, module.indexOf('</li>'))
    expect(underModule).not.toContain('px-absent')
    // No dash on the page is drawn without its reason.
    expect(markup).not.toContain('<span class="px-absent">')
  })

  it('says in one sentence that a horizon holds no goal', async () => {
    const markup = await drawing()
    expect(markup).toContain('No goal is filed at the medium horizon.')
    expect(markup).toContain('No goal is filed at the distant horizon.')
  })

  it('draws all three planned-against-actual headings and their sentences', async () => {
    const markup = await drawing()
    expect(markup).toContain('A late window')
    expect(markup).toContain('A dropped line')
    expect(markup).toContain('A part built that no plan named')
    expect(markup).toContain('was meant to be worked on until 2026-09-03')
    expect(markup).toContain('was dropped, so that time did not happen')
  })
})

// ============================================================================ the confirm press

describe('the confirm press is the person’s alone (criterion P1)', () => {
  it('draws the mark and the press beside it when the reader is the person', async () => {
    setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const markup = await drawingWithAnAgentsGoal()
    expect(markup).toContain('An agent filed each goal here. You have not confirmed it yet.')
    expect(markup).toContain('Confirm this goal')
  })

  it('draws the mark and no press when the reader is an agent', async () => {
    setActor({ type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle } satisfies WebActor)
    const markup = await drawingWithAnAgentsGoal()
    expect(markup).toContain('An agent filed each goal here. The person has not confirmed it yet.')
    expect(markup).not.toContain('Confirm this goal')
  })

  it('draws no mark and no press on a goal the person filed or has confirmed', async () => {
    setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const plain = await drawing()
    expect(plain).not.toContain('An agent filed each goal here.')
    expect(plain).not.toContain('Confirm this goal')
  })
})
