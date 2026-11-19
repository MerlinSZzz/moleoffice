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
