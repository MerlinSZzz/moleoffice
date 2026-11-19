// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAST THREE READINGS OF GET /api/working, EACH MADE ONCE OR CARRIED FORWARD.
 *
 * On a copy of the 13 November office the warm read spent 120.7 ms reading the project's runs twice
 * (once open only, once every run), 108.3 ms grouping every agent's rows in the 1,020,194-row change
 * ledger, and 44.9 ms testing every live record of the project to find that no work domain is open.
 * These cases pin what the three reads must still answer while they are made once, carried forward,
 * or narrowed to the work-domain rows first:
 *
 *   - the roster reads the runs once, and a stored `closedAt` that is not text keeps BOTH readings
 *     it had: the SQL open rule calls it closed, `theAttachmentIsOpen` calls it open;
 *   - a second reading of unregistered actors asks the ledger only for rows appended since the last
 *     one, and a registration, a handle change or a freeing is right on the very next reading;
 *   - the open-domain read asks the work-domain ids before it reads any work-domain data, in the
 *     order the answer has always had.
 *
 * Counted are the statements each reading asks and the answers it gives, never a duration and never
 * an index.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
let t: TestDb
let working: typeof import('../src/server/lib/working.ts')
let attachments: typeof import('../src/server/lib/attachments.ts')
let presence: typeof import('../src/server/lib/presence.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let workdomain: typeof import('../src/server/lib/workdomain.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let caseNumber = 0
let workspace = ''

beforeAll(async () => {
  t = await freshDb()
  working = await import('../src/server/lib/working.ts')
  attachments = await import('../src/server/lib/attachments.ts')
  presence = await import('../src/server/lib/presence.ts')
  participants = await import('../src/server/lib/participants.ts')
  workdomain = await import('../src/server/lib/workdomain.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

afterAll(() => t.close())

beforeEach(() => {
  caseNumber += 1
  workspace = `last-reads-${String(caseNumber)}`
  createWorkspace({ id: workspace, title: `Last reads ${String(caseNumber)}` })
})

function anAgent(handle: string): string {
  return t.api.createRecord({
    kind: 'agent',
    title: `the ${handle} agent`,
    workspaceId: workspace,
    data: { handle, state: 'active' },
    actor: PERSON,
  }).id
}

function aRun(agentId: string, title: string): string {
  return attachments.openAttachment({ workspaceId: workspace, actor: PERSON, title, agentId }).attachment.id
}

/** Every statement a synchronous read asks, in the order it asks them. */
function statementsAsked<T>(read: () => T): { answer: T; asked: string[] } {
  const sqlite = t.client.sqlite as unknown as { prepare: (source: string) => unknown }
  const original = sqlite.prepare.bind(sqlite)
  const asked: string[] = []
  sqlite.prepare = (source: string) => {
    asked.push(source)
    return original(source)
  }
  try {
    return { answer: read(), asked }
  } finally {
    sqlite.prepare = original
  }
}

describe('the roster reads the project’s runs once', () => {
  it('keeps the SQL open rule and the attachment rule apart, and asks for the runs once', () => {
    const agent = anAgent('run-holder')
    const openRun = aRun(agent, 'the open run')
    // The newest run carries a closing moment the store refuses: a number. The SQL filter calls it
    // closed (its `closedAt` is not null); `theAttachmentIsOpen` calls it open (it is not text).
    const oddRun = aRun(agent, 'the run with a number for a closing moment')
    // The two runs are opened in the same second, and the newer one is the odd one for this case.
    t.client.sqlite
      .prepare("UPDATE records SET created_at = '2026-11-18 10:00:01', updated_at = '2026-11-18 10:00:01' WHERE id = ?")
      .run(openRun)
    t.client.sqlite
      .prepare("UPDATE records SET created_at = '2026-11-18 10:00:02', updated_at = '2026-11-18 10:00:02' WHERE id = ?")
      .run(oddRun)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.closedAt', 7) WHERE id = ?").run(oddRun)

    const now = new Date()
    const { answer: roster, asked } = statementsAsked(() => working.whoIsWorking(workspace, now))
    const row = roster.rows.find((one) => one.agentId === agent)
    expect(row, 'the roster drew no row for the agent').toBeDefined()

    // ONE read of the project's runs, not two.
    expect(asked.filter((one) => one.includes('providerSession')).length).toBe(1)

    // The run kept each treatment it had: presence reads the SQL-open list, which leaves the odd run
    // out; the run serving the agent is chosen from every run by `theAttachmentIsOpen`, which calls
    // the odd run open, and it is the newest.
    expect(row?.attachment?.id).toBe(oddRun)
    expect(row?.attachment?.open).toBe(true)
    expect(row?.presence.openAttachments).toEqual([openRun])
    expect(JSON.stringify(row?.presence)).toBe(JSON.stringify(presence.presenceOf(agent, workspace, now)))
  })
})

describe('the unregistered actors are carried forward from the ledger’s own order', () => {
  const ghostOne = 'made-up-ghost-one'
  const ghostTwo = 'made-up-ghost-two'

  function aChange(recordId: string, actorId: string, at: string): void {
    t.client.sqlite
      .prepare(
        "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, at) VALUES (?, ?, 'default', 'update', 'agent', ?, ?)",
      )
      .run(`a-made-up-change-${String(Math.random())}`, recordId, actorId, at)
  }

  function register(id: string, handle: string): void {
    const avatar = t.client.sqlite.prepare('SELECT avatar_asset_id AS id FROM agents LIMIT 1').get() as { id: string }
    t.client.sqlite
      .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, `the ${handle} agent`, handle, avatar.id, '2026-11-18 09:00:00')
  }

  function free(id: string): void {
    t.client.sqlite.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }

  it('reads only what was appended since, and is right after every registry write', () => {
    const written = t.api.createRecord({
      kind: 'note',
      title: 'The note the ghost wrote',
      workspaceId: 'default',
      data: {},
      actor: PERSON,
    })
    const registered = t.api.createRecord({
      kind: 'agent',
      title: 'the registered agent',
      workspaceId: 'default',
      data: { handle: 'made-up-registered', state: 'active' },
      actor: PERSON,
    })
    const mapped = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(registered.id) as { id: string }
    const registeredBy = { id: mapped.id, handle: 'made-up-registered' }

    aChange(written.id, ghostOne, '2026-11-18 07:00:00')
    aChange(written.id, ghostOne, '2026-11-18 07:01:00')
    aChange(written.id, ghostTwo, '2026-11-18 07:02:00')
    aChange(written.id, registeredBy.id, '2026-11-18 07:03:00')
    aChange(written.id, registeredBy.handle, '2026-11-18 07:04:00')

    const first = participants.unregisteredAgentsSeen()
    const byId = new Map(first.map((one) => [one.id, one]))
    expect(byId.get(ghostOne)?.writes).toBe(2)
    expect(byId.get(ghostTwo)?.writes).toBe(1)
    expect(byId.has(registeredBy.id), 'a registered id was called unregistered').toBe(false)
    expect(byId.has(registeredBy.handle), 'a registered handle was called unregistered').toBe(false)

    // One more write, read with the cursor the ledger already carries.
    aChange(written.id, ghostOne, '2026-11-18 07:05:00')
    const { answer: second, asked } = statementsAsked(() => participants.unregisteredAgentsSeen())
    expect(asked.some((one) => /append_order\s*>/i.test(one)), 'the second reading did not use the ledger’s order').toBe(true)
    expect(
      asked.some((one) => /NOT IN \(SELECT id FROM agents\)/i.test(one)),
      'the second reading grouped the whole ledger again',
    ).toBe(false)
    expect(second.find((one) => one.id === ghostOne)?.writes).toBe(3)

    // A registration hides it by id, and by handle.
    register(ghostOne, 'made-up-ghost-one-handle')
    register('made-up-ghost-two-id', ghostTwo)
    const hidden = participants.unregisteredAgentsSeen()
    expect(hidden.some((one) => one.id === ghostOne)).toBe(false)
    expect(hidden.some((one) => one.id === ghostTwo)).toBe(false)

    // A write made while registered is counted, and both names come back when the rows are freed.
    aChange(written.id, ghostOne, '2026-11-18 07:06:00')
    free(ghostOne)
    free('made-up-ghost-two-id')
    const back = new Map(participants.unregisteredAgentsSeen().map((one) => [one.id, one]))
    expect(back.get(ghostOne)?.writes).toBe(4)
    expect(back.get(ghostTwo)?.writes).toBe(1)
  })
})

describe('the open domains are found by kind before their data is read', () => {
  function aDomain(agentId: string, runId: string, title: string): string {
    return t.api.createRecord({
      kind: 'work_domain',
      title,
      workspaceId: workspace,
      data: { objective: title, agent: agentId, session: runId },
      actor: PERSON,
    }).id
  }

  it('asks the work-domain ids first, then reads only those, in the answer’s own order', () => {
    const agent = anAgent('domain-holder')
    const run = aRun(agent, 'the domain’s run')
    const newer = aDomain(agent, run, 'the newer domain')
    const older = aDomain(agent, run, 'the older domain')
    t.client.sqlite.prepare("UPDATE records SET updated_at = '2026-11-18 08:00:00' WHERE id = ?").run(older)
    t.client.sqlite.prepare("UPDATE records SET updated_at = '2026-11-18 09:00:00' WHERE id = ?").run(newer)
    const closed = aDomain(agent, run, 'the closed domain')
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.closedAt', '2026-11-18 09:30:00') WHERE id = ?").run(closed)
    const deleted = aDomain(agent, run, 'the deleted domain')
    t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-11-18 09:30:00' WHERE id = ?").run(deleted)

    const { answer, asked } = statementsAsked(() => workdomain.openDomainsIn(workspace))
    expect(answer.map((one) => one.id)).toEqual([newer, older])
    expect(
      asked.some((one) => /SELECT id, updated_at FROM records/i.test(one)),
      'the reading did not ask which work-domain rows there are',
    ).toBe(true)
    expect(asked.filter((one) => one.includes("json_extract(data, '$.closedAt')")).length).toBe(1)
  })

  it('answers nothing, and reads no domain data, when the project has no work domain', () => {
    const { answer, asked } = statementsAsked(() => workdomain.openDomainsIn(workspace))
    expect(answer).toEqual([])
    expect(asked.some((one) => /SELECT id, updated_at FROM records/i.test(one))).toBe(true)
    expect(asked.filter((one) => one.includes("json_extract(data, '$.closedAt')")).length).toBe(1)
  })
})
