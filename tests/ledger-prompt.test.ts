// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The prompt to register, and the sweep that catches what nobody registered.
 *
 * Two things are tested here, and they are two halves of one failure.
 *
 * THE SWEEP. The ledger reports what a session wrote down. A process nobody wrote down has no
 * row, so it can never be an orphan, so "no orphans" from an empty ledger reads exactly like
 * "no orphans" from a machine that really is clear. `unclaimedSweep` in lib/resources.ts is what
 * tells those apart, and every test below is a way of getting the wrong one of those two
 * sentences on screen.
 *
 * A GROUP OF 0 IS NO CLAIM (wave 13q round 62). Windows has no process groups, and its reader gives every process the
 * group 0, so a row registered there stores 0. `claimsFrom` counted that 0 as a group the row claims, and the sweep then
 * passed over every GPU process on the machine as claimed. A Windows-shaped project is the case. Mutation: a group of 0
 * counted as a claim again, and that case goes red.
 *
 * THE SKILL. A mechanism nobody is told about is not a mechanism. The last tests read
 * .claude/skills/mole-office/SKILL.md and check that the trigger is in it, that it says why
 * registering happens before anything else, and — the standing constraint on that file — that
 * neither it nor reference.md has started naming fields the running API is supposed to own.
 *
 * WHY THE FAKE PROBE IS COPIED HERE. tests/resources.test.ts has one, and importing it would run
 * that file's own suite a second time. tests/helpers.ts is where a shared one belongs and it
 * belongs to another agent this phase, so this is a deliberately minimal copy — only the methods
 * the sweep calls have interesting behaviour. When helpers.ts is next open, both copies should
 * move there.
 *
 * PROCESS HYGIENE. The one test that starts a real process detaches it into its OWN group, keeps
 * the pid, watches its owner, and kills that group in afterEach. Nothing is matched by command-line
 * pattern.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { commandThatStopsWithItsOwner, freshDb, one, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsPort = ReturnType<OsProbe['listeningPorts']>[number]

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

/**
 * A throwaway database, the ledger loaded against it, and the routes wired to the same instance.
 *
 * Everything is a dynamic import for the reason helpers.ts gives: a normal top-level import
 * would open the wrong database before any test code ran. The app is here so one test can prove
 * the sweep reaches GET /api/resources/orphans, rather than only that the library computes it.
 */
async function freshLedger(): Promise<Harness> {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')

  const app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  return { t, res, app }
}

let h: Harness
let started: ChildProcess[]

beforeEach(async () => {
  h = await freshLedger()
  started = []
})

afterEach(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      // Negative pid = the whole group. These are our own detached children and nothing else.
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the normal case.
    }
  }
  await h.app.close()
  h.t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A session record in a given state, and its id. */
function session(state: string, title = 'the session under test'): string {
  return h.t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state, runtime: 'claude-code' }, actor: h.t.api.HUMAN })
    .id
}

// ---------------------------------------------------------------------------- the fake machine

interface FakeOptions {
  processes?: OsProcess[]
  ports?: OsPort[]
  gpu?: ReturnType<OsProbe['gpu']>
  containers?: ReturnType<OsProbe['containers']>
  ownGroup?: number
}

function fakeProbe(opts: FakeOptions = {}): OsProbe {
  const live = new Map<number, OsProcess>()
  for (const p of opts.processes ?? []) live.set(p.pid, p)
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => opts.ports ?? [],
    gpu: () => opts.gpu ?? { available: true, processes: [] },
    containers: () => opts.containers ?? { available: true, containers: [] },
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => opts.ownGroup ?? 999_999,
    killProcessGroup: () => undefined,
    stopContainer: () => undefined,
  }
}

function proc(pid: number, pgid: number, command: string, startedAt = '2026-08-08 09:00:00'): OsProcess {
  // `ppid` is 1 in every fake here: these processes stand for orphans and strays, which is what a
  // parent of 1 means, and nothing in this file walks upwards.
  return { pid, pgid, ppid: 1, command, startedAt }
}

function listening(port: number, pid: number | null): OsPort {
  return { port, address: '127.0.0.1', protocol: 'tcp', pid }
}

/** The one unclaimed thing of a given kind, or a clear failure. */
function unclaimedOf(type: 'port' | 'gpu' | 'container'): ReturnType<ResourcesLib['unclaimedSweep']>['resources'][number] {
  return one(
    h.res.unclaimedSweep('default').resources.filter((r) => r.type === type),
    `unclaimed ${type}`,
  )
}

// ============================================================================ the sweep

describe('what is running that nobody wrote down', () => {
  it('names a live port no ledger row claims, and says why that is worse news than "no orphans"', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(4242, 4200, 'node dev-server.js --port 8788')],
        ports: [listening(8788, 4242)],
      }),
    )

    const sweep = h.res.unclaimedSweep('default')
    const found = one(sweep.resources, 'unclaimed thing')
    expect(found.type).toBe('port')
    expect(found.key).toBe('8788')
    expect(found.detail).toContain('node dev-server.js')
    expect(found.holder?.pgid).toBe(4200)
    expect(found.note).toContain('no session in the ledger claims it')
    // The command a person needs is in the row, so the answer is actionable without a second look.
    expect(found.note).toContain('kill -TERM -4200')
    expect(sweep.summary).toContain('no session claims')
    expect(sweep.summary).toContain('never be reported as an orphan')
    // Where it looked, so an empty answer can be told from an unsearched one.
    expect(sweep.searched.join(' ')).toContain('listening socket')
  })

  it('says the ledger is empty when it is, which is not the same sentence as "nothing unclaimed"', () => {
    h.res.useOsProbe(fakeProbe())
    const sweep = h.res.unclaimedSweep('default')
    expect(sweep.resources).toHaveLength(0)
    expect(sweep.summary).toContain('Nothing is running on this machine that a live ledger row does not claim')
    expect(sweep.summary).toContain('no live rows at all')
  })

  it('takes one registration of a pid to cover the port that pid is holding', () => {
    // The whole cheapness argument: an agent that has just started a server knows its pid, and
    // one call with that pid must not leave the port it binds looking unclaimed. If it did, the
    // honest advice would be "register it twice", and the second call is the one that gets
    // skipped.
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(4242, 4200, 'node dev-server.js --port 8788')],
        ports: [listening(8788, 4242)],
      }),
    )
    const s = session('running')
    expect(h.res.unclaimedSweep('default').resources).toHaveLength(1)

    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'process', key: '4242', actor: HUMAN })
    expect(h.res.unclaimedSweep('default').resources).toHaveLength(0)
  })

  it('counts a socket it may not inspect instead of accusing it or dropping it', () => {
    h.res.useOsProbe(fakeProbe({ ports: [listening(22, null), listening(631, null)] }))
    const sweep = h.res.unclaimedSweep('default')
    expect(sweep.resources).toHaveLength(0)
    const skipped = one(sweep.skipped, 'skipped group')
    expect(skipped.what).toContain('22, 631')
    expect(skipped.reason).toContain('may not inspect')
    // A summary that says "nothing unclaimed" and nothing else would be a clean bill of health
    // over two sockets nobody could read.
    expect(sweep.summary).toContain('left out on purpose')
  })

  it('leaves Mole Office’s own listening port out, and says that is what it did', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(11, 10, 'node src/server/index.ts')],
        ports: [listening(8787, 11)],
        ownGroup: 10,
      }),
    )
    const sweep = h.res.unclaimedSweep('default')
    expect(sweep.resources).toHaveLength(0)
    expect(one(sweep.skipped, 'skipped group').reason).toContain('Mole Office itself')
  })

  it('names an unclaimed GPU process with the memory it is holding', () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(700, 700, 'python isaac_sim.py')],
        gpu: { available: true, processes: [{ pid: 700, usedMib: 14_336, name: 'python' }] },
      }),
    )
    const found = unclaimedOf('gpu')
    expect(found.key).toBe('700')
    expect(found.detail).toContain('14336 MiB')
    expect(found.detail).toContain('python isaac_sim.py')
    expect(found.note).toContain(h.res.NOTHING_WROTE_IT_DOWN)
  })

  it('names an unclaimed GPU process on Windows, where every process is in group 0, after a row of group 0 is registered', () => {
    // Windows has no process groups, and its reader gives every process the group 0. A row registered there stores 0,
    // and a group of 0 counted as a claim would cover every process on the machine, this one too.
    h.res.useOsProbe({
      ...fakeProbe({
        processes: [proc(4242, 0, 'node dev-server.js --port 8788'), proc(700, 0, 'python isaac_sim.py')],
        gpu: { available: true, processes: [{ pid: 700, usedMib: 14_336, name: 'python' }] },
      }),
      ownProcessGroup: () => {
        throw new Error('Windows has no process groups, so this server has no process group of its own to name.')
      },
    })
    const row = h.res.registerResource({ workspaceId: 'default', sessionRecordId: session('running'), type: 'process', key: '4242', actor: HUMAN })
    expect(row.pgid).toBe(0)
    expect(unclaimedOf('gpu').key).toBe('700')
  })

  it('will not call the machine clean when nvidia-smi could not be read', () => {
    h.res.useOsProbe(
      fakeProbe({
        gpu: {
          available: false,
          reason: 'nvidia-smi is not installed on this machine, so GPU memory could not be read. This is NOT a reading of zero.',
        },
      }),
    )
    const sweep = h.res.unclaimedSweep('default')
    expect(sweep.resources).toHaveLength(0)
    expect(one(sweep.unchecked, 'unchecked place')).toContain('NOT a reading of zero')
    expect(sweep.summary).toContain('could not be looked at at all')
    expect(sweep.searched.join(' ')).not.toContain('GPU compute processes')
  })

  it('names a container nobody registered, and stops naming it once somebody does', () => {
    h.res.useOsProbe(
      fakeProbe({
        containers: {
          available: true,
          containers: [{ id: 'abc123def456', name: 'isaac-sim', image: 'isaac:2026.1', status: 'Up 11 days' }],
        },
      }),
    )
    expect(unclaimedOf('container').detail).toContain('Up 11 days')

    const s = session('running')
    h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'container', key: 'isaac-sim', actor: HUMAN })
    expect(h.res.unclaimedSweep('default').resources).toHaveLength(0)
  })

  it('goes back to unclaimed once the registration is released, because nothing owns it again', async () => {
    h.res.useOsProbe(
      fakeProbe({
        processes: [proc(4242, 4200, 'node dev-server.js')],
        ports: [listening(8788, 4242)],
      }),
    )
    const s = session('finished')
    const id = h.res.registerResource({ workspaceId: 'default', sessionRecordId: s, type: 'port', key: '8788', actor: HUMAN }).id
    expect(h.res.unclaimedSweep('default').resources).toHaveLength(0)

    // Released, and the fake machine still has it listening: the row is closed but the thing is
    // there. A closed row must not go on claiming it, or a release would hide a live server.
    await h.res.releaseResource(id, { actor: HUMAN }, 'default')
    expect(unclaimedOf('port').key).toBe('8788')
  })

  it('carries the sweep in the orphan report, and out through GET /api/resources/orphans', async () => {
    h.res.useOsProbe(
      fakeProbe({ processes: [proc(4242, 4200, 'node dev-server.js')], ports: [listening(8788, 4242)] }),
    )
    const report = h.res.orphanReport('default')
    expect(report.orphans).toHaveLength(0)
    // The point of the whole feature in two lines: no orphans, and something is running anyway.
    expect(one(report.unclaimed.resources, 'unclaimed thing').key).toBe('8788')

    const reply = await h.app.inject({ method: 'GET', url: '/api/resources/orphans' })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { orphans: unknown[]; unclaimed: { summary: string; resources: { key: string }[] } }
    expect(body.orphans).toHaveLength(0)
    expect(body.unclaimed.resources.map((r) => r.key)).toEqual(['8788'])
    expect(body.unclaimed.summary).toContain('no session claims')
  })
})

// ============================================================================ against this machine

describe('the sweep against the real machine', () => {
  it('finds a real server nobody registered, and describes it well enough to deal with by hand', async () => {
    // A real listening socket in its own process group. Port 0 lets the kernel pick a free one
    // and the child prints it, so this test cannot collide with whatever else is on the machine.
    const watched = commandThatStopsWithItsOwner(
      process.execPath,
      [
        // process.stdout.write rather than console.log: console.log runs a number through
        // util.inspect, which wraps it in colour escapes that Number() then reads as NaN.
        '-e',
        "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port)+'\\n')});setInterval(()=>{},1000)",
      ],
    )
    const child = spawn(watched.command, watched.args, { detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
    started.push(child)

    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the child never printed a port')), 10_000)
      child.stdout?.on('data', (chunk: Buffer) => {
        const n = Number(chunk.toString().trim())
        if (Number.isInteger(n) && n > 0) {
          clearTimeout(timer)
          resolve(n)
        }
      })
    })

    // The default probe is the Linux one; this is deliberately not a fake.
    const found = h.res
      .unclaimedSweep('default')
      .resources.find((r) => r.type === 'port' && r.key === String(port))
    expect(found).toBeDefined()
    expect(found?.holder?.pid).toBe(child.pid)
    // Its own group, so it is not this test runner's and killing it could not take the runner
    // with it. That is also why it is not skipped as "Mole Office itself".
    expect(found?.holder?.pgid).toBe(child.pid)
    expect(found?.detail).toContain('createServer')
    expect(found?.upFor?.seconds).toBeGreaterThanOrEqual(0)
    expect(found?.note).toContain(`kill -TERM -${child.pid}`)
  })
})

// ============================================================================ the skill itself

const SKILL = fileURLToPath(new URL('../.claude/skills/mole-office/SKILL.md', import.meta.url))
const REFERENCE = fileURLToPath(new URL('../.claude/skills/mole-office/reference.md', import.meta.url))

describe('the skill tells an agent to register what it starts', () => {
  /**
   * The file with its line wrapping taken out.
   *
   * These are hand-wrapped prose files, so a sentence this test looks for is usually split
   * across two lines. Matching the wrapped text would make every reflow of a paragraph a test
   * failure, which teaches the next person to delete the test rather than read it.
   */
  const flat = (path: string): string => readFileSync(path, 'utf8').replace(/\s+/g, ' ')
  const skill = (): string => flat(SKILL)
  const reference = (): string => flat(REFERENCE)

  it('fires on starting something that outlives the command, from the description alone', () => {
    // The description is all a model sees when deciding whether to open the skill at all. A
    // trigger that only appears in the body is a trigger nobody reaches at the moment it matters.
    const front = skill().split('---')[1] ?? ''
    expect(front).toMatch(/outlives the command|holding a port/i)
  })

  it('says register first, and says why: the agent is not there for its own cleanup', () => {
    const body = skill()
    expect(body).toMatch(/Register it before you do anything else/i)
    // The reason has to be in the file. Without it this is one more rule, and a cleanup rule was
    // already written down every time a process was left running.
    expect(body).toMatch(/compacted, killed, or crashes mid-response/i)
    expect(body).toMatch(/A cleanup rule needs you alive; a registration does not/i)
    // THE REASON, NOT THE HISTORY (wave 13w round 2). The skill ships to every office, and the count
    // of incidents is the history of the office this product is developed in, so it is not there.
    expect(body).not.toMatch(/orphaned-process incidents/i)
    // Both ends: release it, or say that leaving it running was deliberate.
    expect(body).toMatch(/release its registration/i)
    expect(body).toMatch(/leaving it running on purpose/i)
  })

  it('keeps sending agents to the running API for shapes, and names no field of its own', () => {
    // The standing constraint on these two files. A schema copied into a document goes stale and
    // gets trusted anyway, so the test is a pattern rather than a list of today's field names:
    // anything that looks like a JSON key is a shape that has leaked out of the API.
    for (const [name, text] of [
      ['SKILL.md', skill()],
      ['reference.md', reference()],
    ] as const) {
      expect(text, `${name} has started naming JSON keys`).not.toMatch(/"[A-Za-z_][A-Za-z0-9_]*"\s*:/)
      expect(text, `${name} names a field of the resource endpoint`).not.toMatch(/sessionRecordId/)
    }
    expect(skill()).toContain('GET /api')
    // And the cheap way to learn the shape, which is one refused request and no reading.
    expect(reference()).toMatch(/refusal names every field/i)
  })

  it('tells the reader what the report cannot say about something nobody registered', () => {
    const text = reference()
    expect(text).toMatch(/no session claims it/i)
    expect(text).toMatch(/cannot tell you who started it/i)
  })
})
