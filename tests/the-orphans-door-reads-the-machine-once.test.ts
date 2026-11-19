// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ORPHANS DOOR READS EACH LIST OF THE MACHINE ONCE (wave 13y round 67).
 *
 * `GET /api/resources/orphans` makes its report from one reading of each list of the machine: the listening sockets,
 * the running containers and the GPU's processes (`oneReadingPerListing` in lib/resources.ts). Until this round the door
 * then handed each orphan's view the machine itself, and not that reading. So a port orphan's view read every listening
 * socket again, and a container orphan's view asked docker again. The sweep of what no row claims (`unclaimedSweep`) made
 * its own probe as well, and read the sockets, the containers and the GPU again. With N port orphans the sockets were read
 * N + 2 times in one answer.
 *
 * WHAT IS PINNED. With 3 port orphans and with 30, beside one container orphan and one GPU orphan, one answer asks the
 * machine for the listening sockets once, for the containers once and for the GPU once. And the answer still says what the
 * machine holds: each port orphan's view names the process holding its port, the container orphan's view finds its
 * container, and the sweep lists the socket and the container no row claims.
 *
 * THE MACHINE IS MADE UP, in a few lines below, so the same office always holds these orphans. Nothing is signalled.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THIS CASE CAN FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   the views' own machine    `orphansResponse` hands `viewOf` `osProbe()` again, as before: the sockets are read once
 *                             for the report, once for each port orphan and once for the sweep, and docker twice.
 *   the sweep's own machine   `orphanReport` lets `unclaimedSweep` make its own probe again, as before: the sockets,
 *                             the containers and the GPU are each read twice.
 *
 * Each is run against a control first and then restored with `cp` and `cmp`; the report records what was seen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsPort = ReturnType<OsProbe['listeningPorts']>[number]

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/** The first made-up port a row holds, and the made-up port no row claims. */
const FIRST_PORT = 61_000
const UNCLAIMED_PORT = 61_999

function finishedSession(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a made-up session that has finished',
    data: { state: 'finished', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
}

function proc(pid: number, command: string): OsProcess {
  return { pid, pgid: pid, ppid: 1, command, startedAt: '2026-08-01 09:00:00' }
}

/**
 * A made-up machine with `ports` servers, each holding one port, one more server holding a port no row claims, one running
 * container and one more nobody claims, and one process on the GPU. `asked` gets the name of each list it is asked for.
 */
function aMachine(ports: number, asked: string[]): OsProbe {
  const live = new Map<number, OsProcess>()
  const sockets: OsPort[] = []
  for (let i = 0; i < ports; i++) {
    live.set(500 + i, proc(500 + i, `node port-server-${String(i)}.js`))
    sockets.push({ port: FIRST_PORT + i, address: '127.0.0.1', protocol: 'tcp', pid: 500 + i })
  }
  live.set(900, proc(900, 'node nobody-wrote-me-down.js'))
  sockets.push({ port: UNCLAIMED_PORT, address: '127.0.0.1', protocol: 'tcp', pid: 900 })
  live.set(901, proc(901, 'python train.py'))
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => {
      asked.push('listeningPorts')
      return sockets.map((one) => ({ ...one }))
    },
    gpu: () => {
      asked.push('gpu')
      return { available: true, processes: [{ pid: 901, usedMib: 2048, name: 'python' }] }
    },
    containers: () => {
      asked.push('containers')
      return {
        available: true,
        containers: [
          { id: 'c0ffee000001', name: 'made-up-sim', image: 'made-up/sim:1', status: 'Up 2 hours' },
          { id: 'c0ffee000002', name: 'made-up-stranger', image: 'made-up/other:1', status: 'Up 3 hours' },
        ],
      }
    },
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('this test never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test never stops anything')
    },
  }
}

/** One answer of the door, with `ports` port orphans, and the lists of the machine it asked for. */
async function theDoorWith(ports: number): Promise<{ asked: string[]; body: { orphans: { kind: string; key: string; describe: string }[]; unclaimed: { resources: { type: string; key: string }[] } } }> {
  const registering: string[] = []
  res.useOsProbe(aMachine(ports, registering))
  const ended = finishedSession()
  for (let i = 0; i < ports; i++) {
    res.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'port', key: String(FIRST_PORT + i), actor: HUMAN })
  }
  res.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'container', key: 'made-up-sim', actor: HUMAN })
  res.registerResource({ workspaceId: 'default', sessionRecordId: ended, type: 'gpu', key: '901', actor: HUMAN })
  // A FRESH MACHINE FOR THE ANSWER, so only the answer's questions are counted.
  const asked: string[] = []
  res.useOsProbe(aMachine(ports, asked))
  const answer = await app.inject({ method: 'GET', url: '/api/resources/orphans' })
  expect(answer.statusCode, answer.body.slice(0, 400)).toBe(200)
  return { asked: asked.sort(), body: answer.json() }
}

describe('the orphans door reads each list of the machine once', () => {
  for (const ports of [3, 30]) {
    it(`asks for the sockets, the containers and the GPU once each, with ${String(ports)} port orphans`, async () => {
      const { asked, body } = await theDoorWith(ports)

      // NOT VACUOUS: every row is an orphan, and each view says what the machine holds.
      const portOrphans = body.orphans.filter((one) => one.kind === 'port')
      expect(portOrphans.map((one) => Number(one.key)).sort((a, b) => a - b)).toEqual(Array.from({ length: ports }, (_, i) => FIRST_PORT + i))
      for (const orphan of portOrphans) {
        const i = Number(orphan.key) - FIRST_PORT
        expect(orphan.describe, `the view of port ${orphan.key}`).toContain(`port-server-${String(i)}.js`)
        expect(orphan.describe, `the view of port ${orphan.key}`).toContain(`holding port ${orphan.key}`)
      }
      const container = body.orphans.find((one) => one.kind === 'container')
      expect(container?.describe, 'the view of the container').not.toContain('not running any more')
      expect(body.orphans.some((one) => one.kind === 'gpu'), 'the GPU row is an orphan').toBe(true)
      const unclaimed = body.unclaimed.resources.map((one) => `${one.type} ${one.key}`)
      expect(unclaimed, 'the sweep').toContain(`port ${String(UNCLAIMED_PORT)}`)
      expect(unclaimed, 'the sweep').toContain('container made-up-stranger')

      // THE WHOLE ASSERTION: one reading of each list for the whole answer.
      expect(asked, 'the lists of the machine one answer of the door asked for').toEqual(['containers', 'gpu', 'listeningPorts'])
    })
  }
})
