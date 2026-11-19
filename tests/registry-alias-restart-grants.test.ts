// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTART GRANT GIVEN UNDER AN AGENT'S OLD REGISTRY ID IS THAT AGENT'S GRANT (item 30c, part 2b-4).
 * office_restart_grants keeps one row for each agent that may restart or pause the office, under the agent's id. A row
 * written before an alias was filed may hold the agent's old id, and it keeps those bytes. So the agent holds the grant
 * a row under its canonical id or an old id names. Where those rows name different decisions, nothing says which one
 * holds, so the agent holds none. Giving or removing the grant clears the rows under the old ids. With no alias filed
 * each statement is asked as before; with one filed it is asked by the same index.
 *
 * Every agent, alias, decision and grant here is made up, in a throwaway office. The old rows are put in place by a
 * direct write, because the office gives a grant under the canonical id.
 *
 * MUTATIONS, after a control run: read the grant under the id asked alone, and every case goes red. Take the first row
 * where the rows name different decisions, and the second case goes red. Give or remove the grant without clearing the
 * old ids' rows, and the third case and the statements go red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { inventedRegistry } from './registry-alias-fixture.ts'

let t: TestDb, app: FastifyInstance
beforeEach(async () => { t = await freshDb(); inventedRegistry(t); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app?.close(); t?.close() })

const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
// The fixture's live agent, and an old id of it that this file files as an alias.
const live = 'CanonicalB2'
const liveOldId = 'old-id-of-the-live-agent'
const retired = 'CanonicalA1'

async function fileTheOldId(aliasId = liveOldId, canonicalId = live): Promise<void> {
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId, canonicalId }])
}
const aDecision = () => t.api.createRecord({ kind: 'decision', workspaceId: 'default', title: 'Made-up operating choice', origin: 'fixture', data: { replaces: [] }, actor }).id
/** A grant row as an old row holds it. */
const keptGrant = (agentId: string, decision: string) => t.client.sqlite.prepare('INSERT INTO office_restart_grants (agent_id, decision_id) VALUES (?, ?)').run(agentId, decision)
const grants = () => t.client.sqlite.prepare('SELECT * FROM office_restart_grants ORDER BY agent_id').all()
async function mayRestart(agentId: string): Promise<boolean> {
  const { assertMayRestartOrPause } = await import('../src/server/lib/office-restart.ts')
  try { assertMayRestartOrPause({ type: 'agent', id: agentId, provedBy: 'an-agent-key', keyHolder: agentId }); return true }
  catch (error) { if ((error as { status?: number }).status === 403) return false; throw error }
}
const press = (decision: string | null) => app.inject({ method: 'POST', url: '/api/office/restart-grant', headers: owner, payload: { agent: live, decision, because: 'Made-up grant reason' } })

describe('the restart grant of an agent with an old registry id', () => {
  it('is held where it was given under the old id, and not where it was given under another agent\'s old id', async () => {
    await fileTheOldId()
    keptGrant(liveOldId, aDecision())
    expect(await mayRestart(live)).toBe(true)
    t.client.sqlite.prepare('DELETE FROM office_restart_grants').run()
    await fileTheOldId('old-id-of-the-other-agent', retired)
    keptGrant('old-id-of-the-other-agent', aDecision())
    expect(await mayRestart(live)).toBe(false)
  })

  it('is not held where the rows under its ids name different decisions', async () => {
    await fileTheOldId()
    const decision = aDecision()
    keptGrant(live, decision)
    keptGrant(liveOldId, decision)
    expect(await mayRestart(live)).toBe(true)
    t.client.sqlite.prepare('UPDATE office_restart_grants SET decision_id = ? WHERE agent_id = ?').run(aDecision(), liveOldId)
    expect(await mayRestart(live)).toBe(false)
  })

  it('is given and removed under the canonical id, and the rows under the old id are cleared', async () => {
    await fileTheOldId()
    const old = aDecision(), next = aDecision()
    keptGrant(liveOldId, old)
    const given = await press(next)
    expect(given.statusCode, given.body).toBe(200)
    expect(grants()).toEqual([{ agent_id: live, decision_id: next }])
    const written = t.client.sqlite.prepare('SELECT old_value FROM changes WHERE record_id = ? ORDER BY append_order').all(`setting:restart-grant:${live}`) as { old_value: string }[]
    expect(JSON.parse(written.at(-1)!.old_value)).toEqual({ decision: old })
    keptGrant(liveOldId, old)
    const removed = await press(null)
    expect(removed.statusCode, removed.body).toBe(200)
    expect(grants()).toEqual([])
    expect(await mayRestart(live)).toBe(false)
  })
})

describe('the statements', () => {
  /** Each statement prepared while `act` runs that `which` matches, with the plan SQLite makes for it. */
  async function planned(act: () => Promise<unknown>, which: RegExp): Promise<{ text: string; plan: string[] }[]> {
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    const seen: string[] = []
    ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
      if (which.test(text)) seen.push(text)
      return prepare(text)
    }
    try { await act() } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
    return [...new Set(seen)].map(text => ({
      text,
      plan: (prepare(`EXPLAIN QUERY PLAN ${text}`).all(...Array((text.match(/\?/g) ?? []).length).fill('made-up')) as { detail: string }[]).map(row => row.detail),
    }))
  }

  it('asks in the words it asked before with no alias filed, keeps the same rows, and asks by the same plan with one filed', async () => {
    const decision = aDecision()
    const readers = async (): Promise<unknown[]> => {
      expect((await press(decision)).statusCode).toBe(200)
      const given = grants()
      const may = await mayRestart(live)
      expect((await press(null)).statusCode).toBe(200)
      return [given, may, grants()]
    }
    const byAgent = /office_restart_grants WHERE agent_id/
    let rows: unknown[] = []
    const before = await planned(async () => { rows = await readers() }, byAgent)
    expect(rows).toEqual([[{ agent_id: live, decision_id: decision }], true, []])
    expect(before.map(one => one.text).sort()).toEqual([
      'DELETE FROM office_restart_grants WHERE agent_id=?',
      'SELECT decision_id FROM office_restart_grants WHERE agent_id=?',
    ])
    for (const one of before) expect(one.plan.join('\n'), one.text).toMatch(/USING (COVERING )?INDEX sqlite_autoindex_office_restart_grants_1/)
    await fileTheOldId()
    const after = await planned(async () => { rows = await readers() }, byAgent)
    expect(rows).toEqual([[{ agent_id: live, decision_id: decision }], true, []])
    // The reading and the removal ask by both ids; a grant also clears the old id's rows, by the same index.
    expect(after.map(one => one.text).sort()).toEqual([
      'DELETE FROM office_restart_grants WHERE agent_id IN (?,?)',
      'DELETE FROM office_restart_grants WHERE agent_id=?',
      'SELECT decision_id FROM office_restart_grants WHERE agent_id IN (?,?)',
    ])
    for (const one of after) expect(one.plan, one.text).toEqual(before.find(was => was.text.split(' WHERE ')[0] === one.text.split(' WHERE ')[0])!.plan)
  })
})
