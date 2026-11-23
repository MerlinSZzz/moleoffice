// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIST OF ATTACHMENTS ASKED FOR RUNS THAT NAME AN AGENT KEEPS EVERY RUN THAT NAMES ONE. Wave 13y round 143, item 82.
 *
 * The page about who is working asks this list in three places, and drops every run with no agent each time. Each
 * asking read every run of the project. `listAttachments` with `namingAnAgentOnly` reads only the runs two indexes say
 * could name an agent, and `ranAsIn` still decides. So a run the indexes left out, that names an agent, would be
 * missing from the page, and nothing else would fail.
 *
 * WHAT IS HELD HERE: for runs whose `ranAs` takes each shape a stored run can have, the list with `namingAnAgentOnly`
 * holds every run the whole list gives an agent, each with the same view, and leaves out the runs that name no agent of
 * this project; with `openOnly` too, it leaves out a closed run as the whole list does.
 *
 * THE MUTATIONS THAT TURN IT RED, each after a green control run: in src/server/lib/attachments.ts, take out the
 * second half of `theRunsThatCouldNameAnAgent` (the run whose agent is its second entry goes missing); or ask the first
 * half for a first entry that is the empty text (every run named by its first entry goes missing).
 *
 * Every value is made up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CLOSED_HOW } from '../src/shared/lifecycle.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AGENT = 'made-up-agent-id'

let t: TestDb
let attachments: typeof import('../src/server/lib/attachments.ts')

/** Each run, by its id: the data it is stored with. */
const RUNS: Record<string, string> = {
  'made-up-first-entry': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: AGENT }] }),
  // ITS FIRST ENTRY NAMES NO AGENT, so only the second half of the narrowing finds it.
  'made-up-second-entry': JSON.stringify({ ranAs: [{ workspaceId: 'made-up-other-project' }, { workspaceId: PROJECT, agentId: AGENT }] }),
  'made-up-odd-characters': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: 'made-up agent with spaces' }] }),
  'made-up-closed': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: AGENT }], closedAt: '2026-11-04 10:05:00', closedHow: CLOSED_HOW[0] }),
  'made-up-no-ran-as': JSON.stringify({}),
  'made-up-empty-ran-as': JSON.stringify({ ranAs: [] }),
  'made-up-empty-agent': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: '' }] }),
  'made-up-number-agent': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: 7 }] }),
  'made-up-other-project-only': JSON.stringify({ ranAs: [{ workspaceId: 'made-up-other-project', agentId: AGENT }] }),
  'made-up-not-a-list': JSON.stringify({ ranAs: { workspaceId: PROJECT, agentId: AGENT } }),
}

/** The runs that name no agent of this project, and that neither index holds, so the list asked for agents leaves them out. */
const NAMING_NONE = ['made-up-no-ran-as', 'made-up-empty-ran-as', 'made-up-empty-agent', 'made-up-number-agent']

beforeAll(async () => {
  t = await freshDb()
  attachments = await import('../src/server/lib/attachments.ts')
  const write = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'session', ?, ?, 'authored')`,
  )
  for (const [id, data] of Object.entries(RUNS)) write.run(id, PROJECT, THE_TEST_OFFICES_OWNER.id, '2026-11-04 10:00:00', '2026-11-04 10:00:00', `A made-up run, ${id}`, data)
})

afterAll(() => {
  t?.close()
})

describe('the attachment list asked for runs that name an agent', () => {
  it('keeps every run the whole list gives an agent, with the same view, and leaves out runs that name none', () => {
    const whole = attachments.listAttachments({ workspaceId: PROJECT }).filter((one) => Object.hasOwn(RUNS, one.id))
    const named = attachments.listAttachments({ workspaceId: PROJECT, namingAnAgentOnly: true }).filter((one) => Object.hasOwn(RUNS, one.id))
    expect(whole.map((one) => one.id).sort(), 'the whole list holds every made-up run').toEqual(Object.keys(RUNS).sort())
    // WHAT THE WHOLE LIST GIVES AN AGENT, so the comparison below is of runs that say something.
    expect(whole.filter((one) => one.agentId !== null).map((one) => one.id).sort()).toEqual(
      ['made-up-closed', 'made-up-first-entry', 'made-up-odd-characters', 'made-up-second-entry'],
    )
    for (const run of whole.filter((one) => one.agentId !== null)) {
      expect(named.find((one) => one.id === run.id), `the run ${run.id}, which names ${String(run.agentId)}`).toEqual(run)
    }
    expect(named.map((one) => one.id).filter((id) => NAMING_NONE.includes(id)), 'runs that name no agent, kept').toEqual([])
    for (const run of named) expect(run, `the run ${run.id} as the whole list gives it`).toEqual(whole.find((one) => one.id === run.id))
  })

  it('with open runs only, leaves out a closed run that names an agent, as the whole list does', () => {
    const open = attachments.listAttachments({ workspaceId: PROJECT, openOnly: true, namingAnAgentOnly: true }).map((one) => one.id)
    expect(open).not.toContain('made-up-closed')
    expect(open).toContain('made-up-first-entry')
    expect(open).toContain('made-up-second-entry')
  })
})

// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and srwXywF1oYIs): the list asked for the runs that could
// serve an active agent of the project.
// The roster drops every run whose agent is not active, so it asks the list for those runs alone. The case below holds
// that option to the whole list. It keeps each run the whole list gives an active agent, whether the run's first entry or
// its second names the agent. It leaves out the same two shapes for a retired agent, and every run above, whose agent
// has no record.
// Before, no case held a list that leaves out the runs of agents that are not active.

/** The agents the case below writes, by state: each one's id. */
const AGENT_IN_STATE = { active: 'made-up-active-agent', retired: 'made-up-retired-agent' } as const

/** The runs the case below writes, by id: the data each is stored with. Each is open. */
const SERVING_RUNS: Record<string, string> = {
  'made-up-active-first-entry': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: AGENT_IN_STATE.active }] }),
  'made-up-retired-first-entry': JSON.stringify({ ranAs: [{ workspaceId: PROJECT, agentId: AGENT_IN_STATE.retired }] }),
  // THIS PROJECT'S ENTRY IS THE SECOND, so only the second half of the narrowing finds these two.
  'made-up-active-second-entry': JSON.stringify({ ranAs: [{ workspaceId: 'made-up-other-project' }, { workspaceId: PROJECT, agentId: AGENT_IN_STATE.active }] }),
  'made-up-retired-second-entry': JSON.stringify({ ranAs: [{ workspaceId: 'made-up-other-project' }, { workspaceId: PROJECT, agentId: AGENT_IN_STATE.retired }] }),
}

/** The runs of `SERVING_RUNS` whose agent is active. */
const SERVING_AN_ACTIVE_AGENT = ['made-up-active-first-entry', 'made-up-active-second-entry']

describe('the attachment list asked for runs that could serve an active agent', () => {
  it("keeps every run the whole list gives an active agent, by its first entry or its second, and leaves out a retired agent's", async () => {
    const { AGENT_KIND } = await import('../src/server/lib/inbox.ts')
    const write = t.client.sqlite.prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'authored')`,
    )
    const at = '2026-11-21 09:00:00'
    for (const [state, id] of Object.entries(AGENT_IN_STATE)) {
      write.run(id, PROJECT, THE_TEST_OFFICES_OWNER.id, at, at, AGENT_KIND, `A made-up agent, ${state}`, JSON.stringify({ handle: id, state }))
    }
    for (const [id, data] of Object.entries(SERVING_RUNS)) write.run(id, PROJECT, THE_TEST_OFFICES_OWNER.id, at, at, 'session', `A made-up run, ${id}`, data)

    const written = (one: { id: string }): boolean => Object.hasOwn(SERVING_RUNS, one.id)
    const whole = attachments.listAttachments({ workspaceId: PROJECT }).filter(written)
    expect(Object.fromEntries(whole.map((one) => [one.id, one.agentId])), 'the agent the whole list gives each run written here').toEqual({
      'made-up-active-first-entry': AGENT_IN_STATE.active,
      'made-up-retired-first-entry': AGENT_IN_STATE.retired,
      'made-up-active-second-entry': AGENT_IN_STATE.active,
      'made-up-retired-second-entry': AGENT_IN_STATE.retired,
    })
    const served = attachments.listAttachments({ workspaceId: PROJECT, servingAnActiveAgentOnly: true })
    expect(served.filter(written).map((one) => one.id).sort(), 'the runs written here that are kept').toEqual(SERVING_AN_ACTIVE_AGENT)
    for (const run of served.filter(written)) expect(run, `the run ${run.id} as the whole list gives it`).toEqual(whole.find((one) => one.id === run.id))
    expect(served.map((one) => one.id).filter((id) => Object.hasOwn(RUNS, id)), 'the runs above, kept').toEqual([])
    const withOpenIds = attachments.listAttachmentsAndOpenIds({ workspaceId: PROJECT, servingAnActiveAgentOnly: true })
    expect(withOpenIds.runs.filter(written).map((one) => one.id).sort(), 'the runs written here that are kept, read with the open rule').toEqual(SERVING_AN_ACTIVE_AGENT)
    expect(SERVING_AN_ACTIVE_AGENT.filter((id) => withOpenIds.openIds.has(id)), 'the kept runs the SQL open rule calls open').toEqual(SERVING_AN_ACTIVE_AGENT)
  })
})
