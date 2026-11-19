// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S QUICK-INPUT ASKS KEPT UNDER ITS OLD REGISTRY ID ARE ITS OWN (item 30c, part 2b-4). quick_input_asks keeps
 * one row for each ask, under the id of the agent the run served. A row written before an alias was filed may hold the
 * agent's old id, and it keeps those bytes. So the agent's list of asks holds those rows, the ten minutes between inputs
 * count an input typed under the old id, and a new ask from a run that still stores the old id is kept under the
 * canonical id. With no alias filed each statement is asked as before; with one filed it is asked by the same index.
 *
 * Every agent, alias and ask here is made up, in a throwaway office. The old rows are put in place by a direct write,
 * because the office writes an ask only when an agent asks from a terminal.
 *
 * MUTATIONS, after a control run: list one agent's asks by the id asked alone, and the first case and the statements go
 * red. Count the ten minutes by the id asked alone, and the second case and the statements go red. Keep a new ask under
 * the id the run stored, and the third case goes red. Ask every id of every agent, and the fourth case goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { inventedRegistry } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

// The fixture's live agent, and an old id of it that this file files as an alias.
const live = { id: 'CanonicalB2', handle: 'archived-cobalt' }
const liveOldId = 'old-id-of-the-live-agent'
const other = { id: 'CanonicalA1', handle: 'current-cobalt' }
// The list counts the ten minutes from the clock, so the asks are placed by it too.
const now = new Date()

const lib = () => import('../src/server/lib/quick-inputs.ts')
async function fileTheOldId(): Promise<void> {
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: liveOldId, canonicalId: live.id }])
}
let serial = 0
/** An ask kept under `agentId`, `ago` milliseconds before now, as an old row holds it. */
function keptAsk(agentId: string, ago: number, outcome = 'typed'): string {
  const id = `made-up-ask-${++serial}`
  t.client.sqlite
    .prepare('INSERT INTO quick_input_asks (id, at_ms, agent_id, run, terminal, input, outcome, says, asked_by_kind, asked_by_id, proved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, now.getTime() - ago, agentId, 'made-up-run', 'made-up-terminal', '/context', outcome, 'Made-up words.', 'agent', agentId, null)
  return id
}
const asks = () => t.client.sqlite.prepare('SELECT * FROM quick_input_asks ORDER BY id').all() as { id: string; agent_id: string }[]
const anAsk = (agentId: string) => ({ agentId, run: 'made-up-run', terminal: 'made-up-terminal', input: '/context', key: 'the-runs-own' as const, askedBy: { kind: 'agent', id: agentId, provedBy: null } })

describe('the quick-input asks of an agent with an old registry id', () => {
  it('lists an ask kept under the old id among the agent\'s asks, and counts it', async () => {
    await fileTheOldId()
    const old = keptAsk(liveOldId, 30 * 60_000, 'not-on-the-list')
    const mine = keptAsk(live.id, 20 * 60_000, 'not-on-the-list')
    keptAsk(other.id, 10 * 60_000, 'not-on-the-list')
    const before = asks()
    const read = (await lib()).theQuickInputsOf(live, 1)
    expect(read.asks.map(one => one.id)).toEqual([mine])
    expect(read.left).toBe(1)
    expect((await lib()).theQuickInputsOf(live, 25).asks.map(one => one.id)).toEqual([mine, old])
    expect(asks()).toEqual(before)
  })

  it('counts the ten minutes from an input typed under the old id', async () => {
    await fileTheOldId()
    keptAsk(liveOldId, 60_000)
    const { decideAnAsk, theQuickInputsOf } = await lib()
    expect(theQuickInputsOf(live, 25).nextAllowedAt).not.toBeNull()
    expect(decideAnAsk(anAsk(live.id), now).ask.outcome).toBe('too-soon')
  })

  it('keeps a new ask from a run that stores the old id under the canonical id, named by its handle', async () => {
    await fileTheOldId()
    const old = keptAsk(liveOldId, 60 * 60_000, 'not-on-the-list')
    const kept = (await lib()).decideAnAsk(anAsk(liveOldId), now)
    expect(kept.ask.outcome).toBe('typed')
    expect(kept.ask.agent).toEqual(live)
    expect(asks().find(one => one.id === kept.ask.id)?.agent_id).toBe(live.id)
    expect(asks().find(one => one.id === old)?.agent_id).toBe(liveOldId)
  })

  it('does not count another agent\'s asks, or an old id filed for another agent', async () => {
    await fileTheOldId()
    keptAsk(other.id, 60_000)
    const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
    fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: 'old-id-of-the-other-agent', canonicalId: other.id }])
    keptAsk('old-id-of-the-other-agent', 60_000)
    const { decideAnAsk, theQuickInputsOf } = await lib()
    expect(theQuickInputsOf(live, 25).asks).toEqual([])
    expect(decideAnAsk(anAsk(live.id), now).ask.outcome).toBe('typed')
  })
})

describe('the statements', () => {
  /** Each statement prepared while `act` runs that `which` matches, with the plan SQLite makes for it. */
  function planned(act: () => unknown, which: RegExp): { text: string; plan: string[] }[] {
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    const seen: string[] = []
    ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
      if (which.test(text)) seen.push(text)
      return prepare(text)
    }
    try { act() } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
    return [...new Set(seen)].map(text => ({
      text,
      plan: (prepare(`EXPLAIN QUERY PLAN ${text}`).all(...Array((text.match(/\?/g) ?? []).length).fill('made-up')) as { detail: string }[]).map(row => row.detail),
    }))
  }

  it('asks by `= ?` with no alias filed, and by the same index with one filed', async () => {
    const { decideAnAsk, theQuickInputsOf } = await lib()
    const readers = (): void => {
      theQuickInputsOf(live, 25)
      decideAnAsk(anAsk(live.id), now)
    }
    const byAgent = /FROM quick_input_asks WHERE agent_id /
    const before = planned(readers, byAgent)
    // The asks, their count, and the ten minutes, which the list and the ask ask in the same words.
    expect(before, before.map(one => one.text).join('\n')).toHaveLength(3)
    for (const one of before) {
      expect(one.text).toMatch(/agent_id = \?/)
      expect(one.plan.join('\n'), one.text).toMatch(/USING (COVERING )?INDEX quick_input_asks_agent_at_idx/)
    }
    await fileTheOldId()
    const after = planned(readers, byAgent)
    expect(after).toHaveLength(before.length)
    for (const [i, one] of after.entries()) {
      expect(one.text, one.text).toMatch(/agent_id IN \(\?, \?\)/)
      // The same index, searched for each of the two ids. Where the rows are asked newest first, SQLite sorts the
      // rows of the two ids together, which is the one step added.
      expect(one.plan.filter(line => !/TEMP B-TREE FOR ORDER BY/.test(line)), one.text).toEqual(before[i]!.plan)
      expect(one.plan.join('\n'), one.text).not.toMatch(/SCAN quick_input_asks\b/)
    }
  })
})
