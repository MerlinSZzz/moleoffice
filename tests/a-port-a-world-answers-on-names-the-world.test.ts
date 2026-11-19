// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A port a known world records names that world and its recorded starter. Problem FD4zPRpR449V.
 * A world record supplies an ownership claim, while a ledger row alone permits the stop checks.
 * The fixture has a listening socket and no ledger row. It proves the world brings the port into
 * the list, names its starter without UNOWNED, leaves an ended world out, and names this search.
 * Mutation: return an empty map from liveWorldsByPort; the ownership case goes red.
 * Mutation: remove the worlds entry from lookedFor; the search case goes red.
 * Mutation: include ended worlds; the ended-world case goes red.
 * Mutation: skip the known-world sentence; the ownership case goes red on UNOWNED.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'

const PORT = 39_517
const PID = 4_000_017

/** A machine with one process listening on loopback, whose command line is not a Mole Office's. */
function oneListener(): OsProbe {
  const holder: OsProcess = { pid: PID, pgid: PID, ppid: 1, command: 'node server.js', startedAt: '2026-09-30 09:00:00' }
  const nothing = (): never => {
    throw new Error('this fake machine answers only who is listening and who a process is')
  }
  return {
    platform: 'fake',
    processById: (pid) => (pid === PID ? holder : null),
    listeningPorts: () => [{ port: PORT, address: '127.0.0.1', protocol: 'tcp', pid: PID }],
    processesInGroup: () => [],
    gpu: nothing,
    containers: nothing,
    locks: nothing,
    ownProcessGroup: nothing,
    killProcessGroup: nothing,
    stopContainer: nothing,
  }
}

describe('a port a known world answers on', () => {
  let t: TestDb

  beforeEach(async () => {
    t = await freshDb()
    const resources = await import('../src/server/lib/resources.ts')
    resources.useOsProbe(oneListener())
    // A cold start of the modules a fresh database loads takes more than the ten seconds vitest gives a hook.
  }, 60_000)

  afterEach(async () => {
    const resources = await import('../src/server/lib/resources.ts')
    resources.useOsProbe(resources.LINUX_PROBE)
    t.close()
  })

  async function aWorldOnThePort(): Promise<string> {
    const { registerWorldHere } = await import('../src/server/lib/office.ts')
    return registerWorldHere({
      name: 'w13r-helper’s scratch world',
      kind: 'agent-made',
      startedBy: { kind: 'agent', id: 'w13r-helper' },
      checkout: '/somewhere/else',
      head: 'abc1234',
      databaseIdentity: 'a1b2c3d4e5f60718',
      address: `http://127.0.0.1:${String(PORT)}`,
      addressForOtherMachines: null,
      standing: 'scratch',
      parentWorld: null,
      installation: '',
    }).id
  }

  it('names the world and its recorded starter without calling its port UNOWNED', async () => {
    await aWorldOnThePort()
    const { listenersOnThisMachine } = await import('../src/server/lib/listeners.ts')
    const listener = listenersOnThisMachine('default').listeners.find((one) => one.port === PORT)
    expect(listener, 'the port a live world answers on is not in the list').toBeDefined()
    expect(listener?.registered).toBe(false)
    expect(listener?.says).not.toContain('UNOWNED')
    expect(listener?.says).toContain('w13r-helper’s scratch world')
    expect(listener?.says).toContain('started by the agent w13r-helper')
    expect(listener?.says).toContain('an agent started it')
    expect(listener?.caughtBy).toContain('a live world in the list of worlds this server keeps says it answers on this port')
    expect(listener?.worldsOnThisPort.map((one) => one.name)).toEqual(['w13r-helper’s scratch world'])
    expect(listener?.stoppable).toBe(false)
    expect(listener?.notStoppableBecause).toContain('never stops what it did not start')
  })

  it('leaves out a world that has ended', async () => {
    const id = await aWorldOnThePort()
    const { closeWorldHere } = await import('../src/server/lib/office.ts')
    closeWorldHere(id, 'the test ended it')
    const { listenersOnThisMachine } = await import('../src/server/lib/listeners.ts')
    expect(listenersOnThisMachine('default').listeners.find((one) => one.port === PORT)).toBeUndefined()
  })

  it('says it looked for the ports worlds answer on', async () => {
    const { listenersOnThisMachine } = await import('../src/server/lib/listeners.ts')
    expect(listenersOnThisMachine('default').lookedFor).toContain(
      'every port a live world in the list of worlds this server keeps says it answers on',
    )
  })
})
