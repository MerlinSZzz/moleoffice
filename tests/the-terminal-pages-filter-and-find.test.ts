// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE TERMINAL PAGES WORK OUT FROM THE LIST, AND WHAT THE SELF-CHECK SAYS OF A HOLDER. Wave 13u, round 2.
 *
 * Terminal management filters the terminals by words, agent, project, state and when they opened, newest
 * first (theTerminalsShown). An agent's profile page shows its own terminal and the ones it opened
 * (theAgentsTerminals), and, since round 11, the office's views of its tmux pane apart from both. Both are pure, in src/shared/terminals.ts, so they are asked here without a page.
 *
 * The self-check (src/config/the-self-check.mjs, theAnswerInWords) names a terminal holder that is not
 * running, with the office's own sentence, and does not make the office unhealthy for it: the
 * decision for round 2, that a holder which cannot start says so where the person sees it.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import { NO_FILTERS, theAgentsTerminals, theTerminalsShown, type ListedTerminal } from '../src/shared/terminals.ts'
import { theAnswerInWords } from '../src/config/the-self-check.mjs'

/** One terminal, with the fields a test names and plain values for the rest. */
function aTerminal(fields: Partial<ListedTerminal> & { id: string }): ListedTerminal {
  return {
    who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    agent: null,
    project: 'panelx',
    command: '/bin/bash',
    args: [],
    folder: '/work',
    envNames: [],
    state: 'running',
    pid: 1,
    cols: 80,
    rows: 24,
    openedAt: '2026-10-04 09:00:00',
    endedAt: null,
    exit: null,
    keeping: true,
    paneView: null,
    ...fields,
  }
}

const NOW = new Date(2026, 9, 4, 12, 0, 0)

const ALL = [
  aTerminal({ id: 'a', command: 'claude', args: ['--resume'], folder: `${THE_TEST_FIXTURE_ROOT}/robotics`, agent: { kind: 'agent', id: 'ag-1' }, openedAt: '2026-10-04 11:30:00' }),
  aTerminal({ id: 'b', folder: `${THE_TEST_FIXTURE_ROOT}/panelx`, project: 'robotics', openedAt: '2026-10-04 08:00:00', state: 'ended', exit: { code: 0, signal: null } }),
  aTerminal({ id: 'c', command: 'codex', who: { kind: 'agent', id: 'ag-1' }, openedAt: '2026-09-30 10:00:00' }),
  aTerminal({ id: 'd', openedAt: 'not a stamp' }),
]

/** A terminal the agent opened and works in, beside the list above. */
const OPENED_AND_WORKED_IN = aTerminal({ id: 'e', who: { kind: 'agent', id: 'ag-1' }, agent: { kind: 'agent', id: 'ag-1' } })

/** The office's view of the agent's tmux pane, which the person opened and the agent does not work in (round 11). */
const A_VIEW_OF_ITS_PANE = aTerminal({ id: 'v', agent: { kind: 'agent', id: 'ag-1' }, paneView: { pane: '%7', session: 'work' } })

const ids = (list: ListedTerminal[]) => list.map((one) => one.id)

describe('Terminal management lets through what its filters say', () => {
  it('shows every terminal with no filter, newest first', () => {
    expect(ids(theTerminalsShown(ALL, NO_FILTERS, NOW))).toEqual(['d', 'a', 'b', 'c'])
  })

  it('finds words in the command line or the folder, whatever their case', () => {
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, words: 'RESUME' }, NOW))).toEqual(['a'])
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, words: 'panelx' }, NOW))).toEqual(['b'])
  })

  it('narrows by the agent working in a terminal, and by no agent', () => {
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, agent: 'ag-1' }, NOW))).toEqual(['a'])
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, agent: 'none' }, NOW))).toEqual(['d', 'b', 'c'])
  })

  it('narrows by project and by state', () => {
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, project: 'robotics' }, NOW))).toEqual(['b'])
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, state: 'ended' }, NOW))).toEqual(['b'])
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, state: 'running' }, NOW))).toEqual(['d', 'a', 'c'])
  })

  it('narrows by when a terminal opened, and lets one whose time cannot be read through rather than hide it', () => {
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, time: 'hour' }, NOW))).toEqual(['d', 'a'])
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, time: 'today' }, NOW))).toEqual(['d', 'a', 'b'])
    expect(ids(theTerminalsShown(ALL, { ...NO_FILTERS, time: 'week' }, NOW))).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe("an agent's profile page finds its terminals", () => {
  it('takes the terminal it works in as its own, and the ones it opened as opened', () => {
    const found = theAgentsTerminals(ALL, 'ag-1')
    expect(ids(found.own)).toEqual(['a'])
    expect(ids(found.opened)).toEqual(['c'])
    expect(theAgentsTerminals(ALL, 'somebody-else')).toEqual({ own: [], views: [], opened: [] })
  })

  it(`lists a terminal it opened and works in once, as its own (${THE_TEST_OFFICES_SECRETARY.handle}'s review of round 2, point 5)`, () => {
    const found = theAgentsTerminals([...ALL, OPENED_AND_WORKED_IN], 'ag-1')
    expect(ids(found.own)).toEqual(['a', 'e'])
    expect(ids(found.opened)).toEqual(['c'])
  })

  // MUTATION (round 11; the commit message has the runs): theAgentsTerminals takes every terminal naming the agent as its
  // own, paneView unread. This case is red, the view listed as its own terminal.
  it('lists a view of its tmux pane as a view, and not as a terminal it works in (round 11)', () => {
    const found = theAgentsTerminals([...ALL, A_VIEW_OF_ITS_PANE], 'ag-1')
    expect(ids(found.own)).toEqual(['a'])
    expect(ids(found.views)).toEqual(['v'])
    expect(ids(found.opened)).toEqual(['c'])
  })
})

describe('the self-check names a terminal holder that is not running', () => {
  const world = { database: 'db', repository: '/r', port: '1', head: '', standing: 'scratch' }
  const healthy = (holder: { running: boolean; says: string } | null) =>
    ({ answer: 'healthy', address: 'http://127.0.0.1:1', world, holder }) as Parameters<typeof theAnswerInWords>[0]

  it("adds one line with the office's own sentence, in English and in Chinese", () => {
    const said = 'No terminal holder is running for this office: there is no socket at /x.sock.'
    const en = theAnswerInWords(healthy({ running: false, says: said }), 'en')
    expect(en[0]).toContain('its health check says ok')
    expect(en).toContain(`No terminal holder runs, so the office cannot open, read or type into a terminal. ${said}`)
    expect(theAnswerInWords(healthy({ running: false, says: said }), 'zh')).toContain(`没有终端托管程序在运行，所以办公室不能打开、查看或输入终端。办公室的说明：${said}`)
  })

  it('says nothing of a holder that runs, or of an office that said nothing of one', () => {
    expect(theAnswerInWords(healthy({ running: true, says: 'The terminal holder is process 7.' }), 'en')).toHaveLength(2)
    expect(theAnswerInWords(healthy(null), 'en')).toHaveLength(2)
  })
})
