// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN STORED UNDER AN AGENT'S OLD REGISTRY ID IS THAT AGENT'S RUN WHEN THE OFFICE ASKS WHICH RUNS ARE INTERRUPTED
 * (item 30c, part 2b-4). A paused or crashed run the office started for a message is interrupted until a newer run for
 * the same message and the same agent takes it up again. A run written before an alias was filed may hold the agent's
 * old id, and it keeps those bytes. So two runs are of the same agent when their ids have the same canonical id.
 *
 * Every agent, alias, message and run here is made up, in a throwaway office. The old ids are put in place by a direct
 * write, because the office writes a run's agent under its canonical id.
 *
 * MUTATIONS, after a control run: compare the stored ids as they are, and the first two cases go red. Compare the
 * message alone, and the third case goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { inventedRegistry } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
// The fixture's two agents, and an old id of the live one that this file files as an alias.
const live = { id: 'CanonicalB2', handle: 'archived-cobalt' }
const other = { id: 'CanonicalA1', handle: 'current-cobalt' }
const liveOldId = 'old-id-of-the-live-agent'

async function fileTheOldId(): Promise<void> {
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: liveOldId, canonicalId: live.id }])
}
function aMessageTo(id: string): string {
  return t.api.createRecord({ kind: 'message', workspaceId: 'default', title: 'Made-up message', origin: 'fixture', data: { body: 'Made-up words.', to: [{ kind: 'agent', id }] }, actor }).id
}
/** A run the office started for `message`, serving `agentId` as it is stored, in `state`. */
function aRunFor(message: string, agentId: string, state: string): string {
  const run = t.api.createRecord({
    kind: 'session', workspaceId: 'default', title: 'Made-up run', origin: 'fixture', actor,
    data: { state, runtime: 'opencode', startedByMoleOffice: true, deliveringMessage: message, providerSession: 'made-up-conversation', workingDirectory: REPO_ROOT },
  }).id
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgentId', ?) WHERE id = ?").run(agentId, run)
  return run
}
async function interrupted(): Promise<{ session: string; agent: { id: string; handle: string } | null }[]> {
  const { theInterruptedRuns } = await import('../src/server/lib/interrupted.ts')
  return theInterruptedRuns('default', { readsEveryMessage: true, because: 'the owner', who: null })
}

describe('the interrupted runs of an agent with an old registry id', () => {
  it('leaves out a paused run under the old id that a newer run under the canonical id took up', async () => {
    await fileTheOldId()
    const message = aMessageTo(live.id)
    const paused = aRunFor(message, liveOldId, 'paused')
    aRunFor(message, live.id, 'running')
    expect((await interrupted()).map(one => one.session)).not.toContain(paused)
  })

  it('leaves out a crashed run under the canonical id that a newer run under the old id took up', async () => {
    await fileTheOldId()
    const message = aMessageTo(live.id)
    const crashed = aRunFor(message, live.id, 'crashed')
    aRunFor(message, liveOldId, 'running')
    expect((await interrupted()).map(one => one.session)).not.toContain(crashed)
  })

  it('keeps a paused run that only another agent\'s newer run follows', async () => {
    await fileTheOldId()
    // The message is to the live agent alone: a run is interrupted whether or not its message can still be read.
    const message = aMessageTo(live.id)
    const paused = aRunFor(message, other.id, 'paused')
    aRunFor(message, liveOldId, 'running')
    expect((await interrupted()).map(one => one.session)).toContain(paused)
  })

  it('lists a paused run under the old id that nothing took up, naming the agent by its canonical id', async () => {
    await fileTheOldId()
    const message = aMessageTo(live.id)
    const paused = aRunFor(message, liveOldId, 'paused')
    expect((await interrupted()).find(one => one.session === paused)?.agent).toEqual(live)
  })
})
