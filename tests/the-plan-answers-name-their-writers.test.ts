// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN'S ANSWERS NAME THEIR WRITER AND MOMENT, AND THE PAGE COUNTS THE ANSWERS IT DRAWS.
 *
 * Requirement row: option A was chosen. A `realises` or
 * `instead_of` link is an answer to a planned state, and the link row already stores who wrote it
 * and when. This file reads those facts through the page's own pure reading and draws the page with
 * no server, so the reading and the drawing can be checked without a browser.
 *
 * THE DATA IS MADE UP. Two agents answer one part, a third answer uses `instead_of`, and a
 * `relates_to` link and an answer on a planned state no trajectory names are present to prove they
 * are not counted.
 *
 * MUTATIONS, each one product line, proved after a green control and restored:
 *   - `writerOf` returns null always: the writer-and-moment case goes red;
 *   - `answersDrawn` returns 0: the count case goes red;
 *   - `writerOf` guesses a writer when the row records none: the no-guess case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  answersDrawn,
  readHorizons,
  type HorizonLink,
  type HorizonRecord,
  type HorizonsInput,
} from '../src/shared/horizons.ts'
import type { TheGoalSpans } from '../src/shared/goal-spans.ts'
import { setActor, type ParticipantOnTheWire } from '../src/web/api.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

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

function record(kind: string, id: string, title: string, data: Record<string, unknown>): HorizonRecord {
  return { id, kind, title, data }
}

const GOAL = record('goal', 'goal-1', 'The clamp holds a pot', {
  horizon: 'short',
  what: 'The clamp holds a 60 mm pot through twenty trials.',
  owner: THE_TEST_OFFICES_OWNER.id,
  state: 'open',
})
const TRAJECTORY = record('trajectory', 'trj-1', 'Tray clamp, step by step', { plannedStateIds: ['part-1'] })
const PART = record('planned_state', 'part-1', 'The clamp closes without slipping', {
  what: 'The clamp closes on a 60 mm pot without slipping.',
})
const ORPHAN = record('planned_state', 'part-orphan', 'A part no plan names', { what: 'A part nobody planned.' })
const WORK_A = record('task', 'work-a', 'Reprint the jaw', { state: 'done' })
const WORK_B = record('task', 'work-b', 'Print the jaw at setting 13', { state: 'done' })
const WORK_C = record('task', 'work-c', 'Polish the jaw', { state: 'done' })
const WORK_RELATED = record('task', 'work-related', 'An unrelated note', { state: 'done' })
const WORK_ORPHAN = record('task', 'work-orphan', 'A build nobody planned', { state: 'done' })

const PERCEPTION = { kind: 'agent', id: 'agent-perception', name: 'Perception', handle: 'perception' } as ParticipantOnTheWire
const KILN = { kind: 'agent', id: 'agent-kiln', name: 'Kiln', handle: 'kiln' } as ParticipantOnTheWire

const PARTICIPANTS = {
  people: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name, handle: THE_TEST_OFFICES_OWNER.id } as ParticipantOnTheWire],
  agents: [PERCEPTION, KILN],
}

// THE SPANS ARE NOT WHAT THIS FILE IS ABOUT, so no default number is copied here: the three are
// unreadable, which the page draws with its own word, and the values are not asserted.
const SPANS: TheGoalSpans = {
  distantHasNoLimit: 'A distant goal has no limit in this made-up reading.',
  spans: [
    { key: 'shortGoalDays', horizon: 'short', label: '', means: '', nobodyChose: true, inForce: null, from: 'unreadable', says: '' },
    { key: 'mediumGoalDays', horizon: 'medium', label: '', means: '', nobodyChose: true, inForce: null, from: 'unreadable', says: '' },
    { key: 'longGoalDays', horizon: 'long', label: '', means: '', nobodyChose: true, inForce: null, from: 'unreadable', says: '' },
  ],
}

/** The three answers, a link of another type, and an answer on a part the trajectory does not name. */
function linksWithoutTheUnknown(onPart: HorizonLink[] = []): HorizonLink[] {
  return [
    { fromId: 'trj-1', toId: 'goal-1', type: 'serves' },
    { fromId: 'work-a', toId: 'part-1', type: 'realises', createdAt: '2026-09-01 09:00:00', createdBy: 'perception', createdByType: 'agent' },
    { fromId: 'work-b', toId: 'part-1', type: 'realises', createdAt: '2026-09-02 10:00:00', createdBy: 'kiln', createdByType: 'agent' },
    { fromId: 'work-c', toId: 'part-1', type: 'instead_of', createdAt: '2026-09-03 11:00:00', createdBy: 'perception', createdByType: 'agent' },
    { fromId: 'work-related', toId: 'part-1', type: 'relates_to', createdAt: '2026-09-04 12:00:00', createdBy: 'perception', createdByType: 'agent' },
    { fromId: 'work-orphan', toId: 'part-orphan', type: 'realises', createdAt: '2026-09-05 13:00:00', createdBy: 'kiln', createdByType: 'agent' },
    ...onPart,
  ]
}

function input(links: HorizonLink[] = linksWithoutTheUnknown()): HorizonsInput {
  return {
    goals: [GOAL],
    trajectories: [TRAJECTORY],
    plannedStates: [PART, ORPHAN],
    modules: [],
    links,
    presenceByRecord: {},
    windows: [],
    droppedLines: [],
    titlesById: {
      'trj-1': 'Tray clamp, step by step',
      'work-a': 'Reprint the jaw',
      'work-b': 'Print the jaw at setting 13',
      'work-c': 'Polish the jaw',
      'work-related': 'An unrelated note',
      'work-orphan': 'A build nobody planned',
    },
    today: '2026-09-10',
  }
}

const readingOf = (links: HorizonLink[] = linksWithoutTheUnknown()) => {
  const options = input(links)
  return {
    levels: readHorizons(options),
    actual: { lateWindows: [], droppedLines: [], partsBuilt: [] },
    spans: SPANS,
    partsRead: options.plannedStates.length,
    today: options.today,
    participants: PARTICIPANTS,
    projectOf: {},
  }
}

const drawing = async (links: HorizonLink[] = linksWithoutTheUnknown()): Promise<string> => {
  const page = await import('../src/web/pages/HorizonsPage.tsx')
  return renderToStaticMarkup(h(page.TheHorizons, { reading: readingOf(links) })).replace(/<style[\s\S]*?<\/style>/g, ' ')
}

describe('the plan answers', () => {
  it('reads each answer’s type, writer and moment from the link row, and counts only the drawn parts', () => {
    const [short] = readHorizons(input())
    const part = short!.goals.find((g) => g.id === 'goal-1')!.clusters[0]!.parts[0]!
    expect(part.answers.map((one) => one.type)).toEqual(['realises', 'realises', 'instead_of'])
    expect(part.answers.map((one) => one.by)).toEqual([
      { actorType: 'agent', actorId: 'perception' },
      { actorType: 'agent', actorId: 'kiln' },
      { actorType: 'agent', actorId: 'perception' },
    ])
    expect(part.answers.map((one) => one.at)).toEqual([
      '2026-09-01 09:00:00',
      '2026-09-02 10:00:00',
      '2026-09-03 11:00:00',
    ])
    expect(part.answers.map((one) => one.title)).toEqual(['Reprint the jaw', 'Print the jaw at setting 13', 'Polish the jaw'])
    // The other-type link and the answer on the part the trajectory does not name are not drawn.
    expect(answersDrawn(readHorizons(input()))).toBe(3)
  })

  it('draws every answer with its writer and moment, and counts the three answers it draws', async () => {
    setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const markup = await drawing()
    expect(markup.match(/class="hz-answer"/g)).toHaveLength(3)
    expect(markup).toContain('3 answers')
    expect(markup).toContain('Perception')
    expect(markup).toContain('Kiln')
    expect(markup).toContain('dateTime="2026-09-01 09:00:00"')
    expect(markup).toContain('dateTime="2026-09-02 10:00:00"')
    expect(markup).toContain('dateTime="2026-09-03 11:00:00"')
    expect(markup).toContain('realises')
    expect(markup).toContain('instead of')
    // A link of another type is not an answer, so it is not in the answer list.
    expect(markup).not.toContain('An unrelated note')
  })

  it('says the writer or the moment is not recorded, and never guesses at either', async () => {
    setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const markup = await drawing([
      { fromId: 'trj-1', toId: 'goal-1', type: 'serves' },
      { fromId: 'work-a', toId: 'part-1', type: 'realises' },
      { fromId: 'work-c', toId: 'part-1', type: 'instead_of', createdAt: '' },
      // A kind with no id cannot name a writer, and a moment with no words is not a moment.
      { fromId: 'work-b', toId: 'part-1', type: 'realises', createdAt: '2026-09-02 10:00:00', createdBy: 'perception', createdByType: null },
    ])
    expect(markup.match(/class="hz-answer"/g)).toHaveLength(3)
    expect(markup).toContain('3 answers')
    expect(markup.match(/who wrote this is not recorded/g)).toHaveLength(3)
    expect(markup.match(/when it was written is not recorded/g)).toHaveLength(2)
    // The row that records a time still draws it; the rows with no writer never borrow a name.
    expect(markup).toContain('dateTime="2026-09-02 10:00:00"')
    expect(markup).not.toContain('Perception')
    expect(markup).not.toContain('Kiln')
  })
})
