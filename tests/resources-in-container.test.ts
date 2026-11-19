// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROCESS INSIDE A CONTAINER IS REGISTERED UNDER THE PID THIS MACHINE GIVES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * A process in a sandbox knows only the pid its container gives it. It registers itself with
 * `{"type":"process","container":…,"pidInContainer":…}`, and the ledger row must hold the HOST pid,
 * the host process group and the host start time, because the release door, the worker's `endGroup`
 * and every liveness reading signal and read host processes. With those stored, the existing paths
 * work across the container boundary unchanged, and no container needs `--pid=host`.
 *
 * The match is made by `theHostPidOfAProcessInAContainer` in src/server/lib/resources.ts: the host
 * process that is in the container's pid namespace and whose innermost pid is the one asked for. The
 * namespace comparison is the part that matters, and the fake machine below is built so that without
 * it the answer is wrong: pid 8 exists on the host, inside container A and inside container B.
 *
 * ---------------------------------------------------------------------------------------
 * TWO KINDS OF TEST
 * ---------------------------------------------------------------------------------------
 *
 * The FAKE PROBE tests need no Docker. They describe the machine exactly, including the cases a real
 * machine cannot be put into on demand: the daemon down, a first process that has just exited, a
 * probe that cannot look inside a container at all.
 *
 * The REAL tests use the Linux probe. One reads this test's own pid namespace and needs nothing. The
 * other starts a real container and is OPT-IN: it runs only when CONTAINER_PID_IMAGE names a local
 * image that has `sleep` and `sh` (for example `CONTAINER_PID_IMAGE=ubuntu:24.04`), because the suite
 * must not pull an image or depend on a Docker daemon. The container it starts carries the label
 * `mole-office.sv1=resources` and is removed by its exact id.
 */

import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type OsPidNamespace = NonNullable<ReturnType<NonNullable<OsProbe['pidNamespaceOf']>>>

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

/** A throwaway database, the ledger loaded against it, and the resource routes over it. */
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

beforeEach(async () => {
  h = await freshLedger()
})

afterEach(async () => {
  h.res.useOsProbe(h.res.LINUX_PROBE)
  await h.app.close()
  h.t.close()
})

/** A session record that owns the rows here, and its id. */
function session(state = 'running'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the session that started the process in the sandbox',
    data: { state, runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

// ---------------------------------------------------------------------------- the fake machine

const HOST_NS = 'pid:[4026531836]'
const A_NS = 'pid:[4026533021]'
const B_NS = 'pid:[4026533099]'
const A_ID = 'a'.repeat(64)
const B_ID = 'b'.repeat(64)

/** One process on the fake machine: what `processById` says, and its pid namespace. */
interface FakeProcess {
  proc: OsProcess
  ns: OsPidNamespace
}

function onHost(pid: number, command: string): FakeProcess {
  return {
    proc: { pid, pgid: pid, ppid: 1, command, startedAt: '2026-09-21 08:00:00' },
    ns: { namespace: HOST_NS, nspid: [pid] },
  }
}

function inContainer(ns: string, hostPid: number, innerPid: number, command: string, startedAt: string): FakeProcess {
  return {
    proc: { pid: hostPid, pgid: hostPid, ppid: 1, command, startedAt },
    ns: { namespace: ns, nspid: [hostPid, innerPid] },
  }
}

/** The stored stamp `seconds` after `from`. */
function secondsAfter(from: number, seconds: number): string {
  return localStamp(new Date(from + seconds * 1000))
}

/** When container A's sleep, pid 8 there and 5040 here, started on the last machine `fakeProbe` made. */
let aSleepStarted = ''

/**
 * THE MACHINE EVERY FAKE TEST STANDS ON. Pid 8 is taken three times over: by a shell on the host, by
 * a sleep inside container A and by a different sleep inside container B. Pid 9 is taken only on the
 * host. A lookup that forgot which namespace it was in could not tell these apart.
 *
 * The containers' processes start in the seconds after the machine is made, so after the session each
 * test files. The sandbox's start script starts them after its session was filed, and the door refuses
 * a process older than the session that registers it unless the request adopts it (decision
 * AOwsOHMVq6Ce).
 */
function theMachine(): FakeProcess[] {
  const made = Date.now()
  aSleepStarted = secondsAfter(made, 5)
  return [
    onHost(8, 'bash'),
    onHost(9, 'a host daemon'),
    inContainer(A_NS, 5001, 1, '/sbin/docker-init -- sleep infinity', secondsAfter(made, 2)),
    inContainer(A_NS, 5040, 8, 'sleep 100', aSleepStarted),
    inContainer(B_NS, 6001, 1, '/sbin/docker-init -- sleep infinity', secondsAfter(made, 3)),
    inContainer(B_NS, 6040, 8, 'sleep 200', secondsAfter(made, 6)),
  ]
}

interface FakeOptions {
  processes?: FakeProcess[]
  containers?: ReturnType<OsProbe['containers']>
  /** Host pid of each container's first process, by full id. A missing id answers "not running". */
  firstProcess?: Record<string, number>
  /** Pids whose namespace this user may not read, as another user's process. */
  unreadable?: number[]
}

interface FakeProbe extends OsProbe {
  signals: { pgid: number; signal: string }[]
  live: Map<number, FakeProcess>
}

function fakeProbe(opts: FakeOptions = {}): FakeProbe {
  const live = new Map<number, FakeProcess>()
  for (const p of opts.processes ?? theMachine()) live.set(p.proc.pid, p)
  const unreadable = new Set(opts.unreadable ?? [])
  const firstProcess = opts.firstProcess ?? { [A_ID]: 5001, [B_ID]: 6001 }
  const probe: FakeProbe = {
    platform: 'fake',
    // Process state is synthetic; avatar uploads still use the real bounded fixture codec.
    runAvatarCodec: input => h.res.LINUX_PROBE.runAvatarCodec!(input),
    signals: [],
    live,
    processById: (pid) => live.get(pid)?.proc ?? null,
    processesInGroup: (pgid) => [...live.values()].map((p) => p.proc).filter((p) => p.pgid === pgid),
    processTable: () => ({
      ok: true,
      processes: [...live.values()].map((p) => ({ pid: p.proc.pid, command: p.proc.command, cwd: null })),
    }),
    pidNamespaceOf: (pid) => {
      if (unreadable.has(pid)) throw new Error(`EACCES reading /proc/${pid}/ns/pid`)
      return live.get(pid)?.ns ?? null
    },
    containerFirstProcess: (id) => {
      const pid = firstProcess[id]
      return pid === undefined ? { ok: false, reason: `docker says container ${id} is not running` } : { ok: true, pid }
    },
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () =>
      opts.containers ?? {
        available: true,
        containers: [
          { id: A_ID, name: 'sandbox-a', image: 'mole-office-dev', status: 'Up 5 minutes' },
          { id: B_ID, name: 'sandbox-b', image: 'mole-office-dev', status: 'Up 4 minutes' },
        ],
      },
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: (pgid, signal) => {
      probe.signals.push({ pgid, signal })
      for (const [pid, p] of live) if (p.proc.pgid === pgid) live.delete(pid)
    },
    stopContainer: () => {
      throw new Error('this test never stops a container')
    },
  }
  return probe
}

/** POST /api/resources with a body, as the sandbox's start script will. */
async function register(payload: Record<string, unknown>) {
  return h.app.inject({ method: 'POST', url: '/api/resources', payload })
}

// ============================================================================ the fake machine

describe('a process named by its pid inside a container is written down as this machine numbers it', () => {
  it('stores the host pid, the host process group and the host start time, and says where it was named', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()

    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode, r.body).toBe(201)
    const { resource, howTheWorldWasGot } = r.json()
    // Host 5040, not the host's own pid 8 and not container B's 6040.
    expect(resource.key).toBe('5040')
    expect(resource.pgid).toBe(5040)
    expect(resource.osStartedAt).toBe(aSleepStarted)
    // The row shows what was made of the caller's words: the container, the pid there, and the host pid.
    expect(resource.detail).toBe('pid 8 inside container sandbox-a (aaaaaaaaaaaa), which is pid 5040 on this machine — sleep 100')
    expect(howTheWorldWasGot).toContain('inside a container')
  })

  it('finds each container its own process when both call it pid 8', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()

    const b = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-b', pidInContainer: '8' })
    expect(b.statusCode, b.body).toBe(201)
    expect(b.json().resource.key).toBe('6040')

    // By its full id as well as its name: the two things docker ps --no-trunc prints.
    const a = await register({ sessionRecordId: s, type: 'process', container: A_ID, pidInContainer: 8 })
    expect(a.statusCode, a.body).toBe(201)
    expect(a.json().resource.key).toBe('5040')
  })

  it('refuses a pid the container does not have, although this machine has a process with that number', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()

    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 9 })
    expect(r.statusCode).toBe(400)
    expect(String(r.json().error)).toContain('No process in container sandbox-a has pid 9')
    // Nothing was written against the host's pid 9.
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('says a refused match may be among the processes it could not read, rather than that there is none', async () => {
    // Container A's pid 8 runs as another user here, so its namespace cannot be read.
    h.res.useOsProbe(fakeProbe({ unreadable: [5040] }))
    const s = session()

    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode).toBe(400)
    const error = String(r.json().error)
    expect(error).toContain('could not read 1 more')
    expect(error).toContain('a match may be among those')
  })

  it('keeps the existing paths working: the row reads alive, and a release signals the host process group', async () => {
    const probe = fakeProbe()
    h.res.useOsProbe(probe)
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode, r.body).toBe(201)
    const id = String(r.json().resource.id)

    const [row] = h.res.listResources({ workspaceId: 'default' })
    expect(row?.liveness.state).toBe('alive')

    const released = await h.res.releaseResource(id, { actor: HUMAN, force: true }, 'default')
    expect(released.acted).toBe(true)
    // The host group, and nothing else: not group 8, which on this machine is the host's own shell.
    expect(probe.signals).toEqual([{ pgid: 5040, signal: 'SIGTERM' }])
    expect(probe.live.has(8)).toBe(true)
    expect(probe.live.has(6040)).toBe(true)
  })

  it('checks a caller start time against the host process it found', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()

    const wrong = await register({
      sessionRecordId: s,
      type: 'process',
      container: 'sandbox-a',
      pidInContainer: 8,
      osStartedAt: '2026-09-21 07:00:00',
    })
    expect(wrong.statusCode).toBe(400)
    expect(String(wrong.json().error)).toContain('not the same process')

    const right = await register({
      sessionRecordId: s,
      type: 'process',
      container: 'sandbox-a',
      pidInContainer: 8,
      osStartedAt: aSleepStarted,
    })
    expect(right.statusCode, right.body).toBe(201)
  })
})

describe('what the container door refuses, and how it says so', () => {
  it('names a container that is not running, and writes nothing', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-z', pidInContainer: 8 })
    expect(r.statusCode).toBe(400)
    expect(String(r.json().error)).toContain('No running container is called "sandbox-z"')
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('says it could not look when docker cannot be asked, rather than that there is no such container', async () => {
    h.res.useOsProbe(
      fakeProbe({ containers: { available: false, reason: 'docker is not installed on this machine, so running containers could not be listed. This is not a reading of none.' } }),
    )
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode).toBe(503)
    const error = String(r.json().error)
    expect(error).toContain('could not look for container "sandbox-a"')
    expect(error).not.toContain('No running container')
  })

  it('refuses when the container stopped between being listed and being looked inside', async () => {
    h.res.useOsProbe(fakeProbe({ firstProcess: { [B_ID]: 6001 } }))
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode).toBe(409)
    expect(String(r.json().error)).toContain('is not running')
  })

  /**
   * THE FIRST PROCESS RUNS AS ROOT. Problem HqDLmh0yFT4G: in an isolated run the container's first process is
   * docker-init running as root, the kernel will not show its namespace to this server's user, and the read threw
   * out of the door as a 500. The stand-in throws EACCES for that pid, as the Linux probe does.
   * MUTATION (wave 13k round 7): take away the guard around the first process's read; this answers 500 again.
   */
  it('refuses in words when the container\'s first process may not be read, and writes nothing', async () => {
    const probe = fakeProbe()
    probe.pidNamespaceOf = (pid) => {
      if (pid === 5001) {
        throw Object.assign(new Error(`Process 5001 exists but /proc/5001/ns/pid could not be read (EACCES), so which pid namespace it is in is unknown.`), { code: 'EACCES' })
      }
      return probe.live.get(pid)?.ns ?? null
    }
    h.res.useOsProbe(probe)
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode, r.body).toBe(409)
    const error = String(r.json().error)
    expect(error).toContain("Container sandbox-a's first process, pid 5001 on this machine (/sbin/docker-init -- sleep infinity), could not be read")
    expect(error).toContain('(EACCES)')
    expect(error).toContain('nothing was written')
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('refuses a probe that cannot look inside a container, rather than taking the pid as a host pid', async () => {
    const probe: OsProbe = fakeProbe()
    delete probe.pidNamespaceOf
    h.res.useOsProbe(probe)
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 8 })
    expect(r.statusCode).toBe(501)
    expect(String(r.json().error)).toContain('(fake) cannot look inside a container')
    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('refuses a body that names the process two ways, or half of one', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()

    const both = await register({ sessionRecordId: s, type: 'process', key: '5040', container: 'sandbox-a', pidInContainer: 8 })
    expect(both.statusCode).toBe(400)
    expect(String(both.json().error)).toContain('not both')

    const half = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a' })
    expect(half.statusCode).toBe(400)
    expect(String(half.json().error)).toContain('sent only container')

    const gpu = await register({ sessionRecordId: s, type: 'gpu', container: 'sandbox-a', pidInContainer: 8 })
    expect(gpu.statusCode).toBe(400)
    expect(String(gpu.json().error)).toContain('nvidia-smi already reports pids')

    const flag = await register({ sessionRecordId: s, type: 'process', container: '--help', pidInContainer: 8 })
    expect(flag.statusCode).toBe(400)
    expect(String(flag.json().error)).toContain('is not a container name or id')

    const fraction = await register({ sessionRecordId: s, type: 'process', container: 'sandbox-a', pidInContainer: 1.5 })
    expect(fraction.statusCode).toBe(400)
    expect(String(fraction.json().error)).toContain('pidInContainer')

    expect(h.res.listResources({ workspaceId: 'default' })).toHaveLength(0)
  })

  it('still says key is required when a body names the process neither way', async () => {
    h.res.useOsProbe(fakeProbe())
    const s = session()
    const r = await register({ sessionRecordId: s, type: 'process' })
    expect(r.statusCode).toBe(400)
    const error = String(r.json().error)
    expect(error).toContain('key is required')
    expect(error).toContain('container and pidInContainer')
  })
})

// ============================================================================ the real machine

describe('the Linux probe reads pid namespaces', () => {
  it('reads this very process: a pid namespace, and its own pid last', () => {
    const read = h.res.LINUX_PROBE.pidNamespaceOf?.(process.pid)
    expect(read).toBeDefined()
    expect(read?.namespace).toMatch(/^pid:\[\d+\]$/)
    // The innermost pid is the one the process knows itself by, which is what process.pid is.
    expect(read?.nspid.at(-1)).toBe(process.pid)
  })

  it('answers null for a pid nothing is running under', () => {
    // Above the kernel's largest pid (4194304), so nothing can be running under it.
    expect(h.res.LINUX_PROBE.pidNamespaceOf?.(4_194_305)).toBeNull()
  })
})

const IMAGE = process.env['CONTAINER_PID_IMAGE']

function docker(args: string[]): string {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 })
  if (r.status !== 0) throw new Error(`docker ${args.join(' ')} exited ${String(r.status)}: ${r.stderr}`)
  return r.stdout.trim()
}

describe('a real container, opt-in', () => {
  let containerId: string | null = null

  afterEach(() => {
    // Removed by its exact id, and only the one this test started.
    if (containerId !== null) spawnSync('docker', ['rm', '-f', containerId], { encoding: 'utf8', timeout: 60_000 })
    containerId = null
  })

  it.skipIf(IMAGE === undefined)(
    'registers a process started inside a container under its host pid, and a release stops it by group',
    async () => {
      if (IMAGE === undefined) return
      const user = `${String(process.getuid?.())}:${String(process.getgid?.())}`
      containerId = docker([
        'run', '-d', '--init', '--user', user, '--label', 'mole-office.sv1=resources',
        '--entrypoint', 'sleep', IMAGE, '300',
      ])
      // A process started by docker exec, as the sandbox's start script will be: it joins the
      // container's pid namespace but is not a child of the container's first process.
      const inner = Number(docker(['exec', containerId, 'sh', '-c', 'sleep 290 >/dev/null 2>&1 & echo $!']))
      expect(Number.isInteger(inner) && inner > 1).toBe(true)

      const s = session()
      const r = await register({ sessionRecordId: s, type: 'process', container: containerId, pidInContainer: inner })
      expect(r.statusCode, r.body).toBe(201)
      const hostPid = Number(r.json().resource.key)
      expect(hostPid).not.toBe(inner)

      // Checked by a second reader: docker top lists the container's processes by HOST pid.
      const top = docker(['top', containerId, '-eo', 'pid,args'])
      const line = top.split('\n').find((l) => l.trim().startsWith(`${String(hostPid)} `))
      expect(line, top).toContain('sleep 290')

      const [row] = h.res.listResources({ workspaceId: 'default' })
      expect(row?.liveness.state).toBe('alive')

      const released = await h.res.releaseResource(String(r.json().resource.id), { actor: HUMAN, force: true }, 'default')
      expect(released.outcome).toContain('it is gone')
      // Gone inside the container too: kill -0 on its container pid now fails.
      const probe = spawnSync('docker', ['exec', containerId, 'sh', '-c', `kill -0 ${String(inner)}`], { encoding: 'utf8' })
      expect(probe.status).not.toBe(0)
    },
    60_000,
  )
})
