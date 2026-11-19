// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ISOLATED RUN'S GATE IN A REAL CONTAINER. OPT-IN: it needs a docker daemon and an image, and runs only when
 * ISOLATED_GATE_IMAGE names one, for example the image a sandbox runs (`docker inspect <sandbox container>`). The image
 * needs node, ip, setpriv and getent, and a user 1000. Nothing here builds an image or talks to an office.
 *
 * tests/an-isolated-run-cannot-reach-the-office.test.ts proves how tools/sandbox.mjs makes an isolated run's container,
 * with a stand-in docker that cannot set routes. This proves what only a real container can: that
 * tools/isolated-gate.mjs leaves the command no way to this machine, as T6 of a decision
 * says, with message D-8WG4Snxxga.
 *
 *   1. Gated as tools/sandbox.mjs gates a run: the command runs as 1000:1000 with no effective capability, cannot add a
 *      route, and reaches nothing on this machine: a listener this test opens on every address answers none of them.
 *   2. The control: the same image without the gate reaches that listener on every address, so case 1's silence is the
 *      gate's doing and not the network's.
 *   3. The gate fails closed: an address it is asked to find unreachable, and not asked to blackhole, answers, and the
 *      gate stops with exit 91 before the command runs.
 *   4. The gate fails closed when IPv6 is on in the container: exit 94, and the command does not run.
 *   5. The gate shuts out every other container on its own link (the inspector's note on run QfIZTxlPXcYQ): a
 *      neighbour on docker's default bridge that the same image with no gate reaches answers nothing to the gated
 *      command.
 *   6. The command's HOME is the folder the gate is handed with --home (the run's own empty home; the image's user 1000
 *      has /nonexistent, and T6's opencode runs failed on it, message uAD6Mzu7tWiA), and a --home that is not a
 *      folder stops the gate with 93 before the command runs. The command writes a file there.
 *   7. The first process in the container that runs as 1000 is the command, not docker-init or the gate, which run as
 *      root: what tools/sandbox.mjs files the run's process row by (theFirstProcessRunningAs in
 *      tools/sandbox-common.mjs; the office cannot read a root process, problem HqDLmh0yFT4G).
 *   8. This machine's ARP to a gated container is answered, so this machine can deliver the run's traffic (problem
 *      roHECcQU9Fmq: with the reverse-path filter on, the gateway's ARP was dropped and the run's connections stalled
 *      every ~45 s), while the gate still finds nothing of this machine answering, as in case 1.
 *   9. The gate fails closed when the reverse-path filter is on: exit 95, and the command does not run.
 *
 * MUTATION PROOF: with the gate's blackhole step and its read-back taken out, case 1 goes red: the listener answers the
 * gate's own check, which stops with 91 before the command runs. With the halves of the container's own link left out,
 * case 5 goes red. With --home ignored, case 6 goes red. With the walk answering the first process whatever its user,
 * case 7 goes red. With the reverse-path filter left on and the gate's check of it taken out, case 8 goes red (this
 * machine's entry for the container goes FAILED); with only the check taken out, case 9 goes red. The logs are in the
 * reports of the runs that added these cases.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theFirstProcessRunningAs, THE_REVERSE_PATH_FILTER_OFF } from '../tools/sandbox-common.mjs'

const IMAGE = process.env['ISOLATED_GATE_IMAGE'] ?? ''
const REPO = fileURLToPath(new URL('..', import.meta.url))
const GATE = join(REPO, 'tools', 'isolated-gate.mjs')
const INSIDE = ['10.0.0.0/8', '100.64.0.0/10', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']

let listener: Server | null = null
let port = 0
let own: string[] = []
/** This machine's addresses on interfaces that are not docker's bridges, which the gate's own-link halves never close. */
let offTheBridges: string[] = []

/** A command that says who it runs as, whether it can add a route, its capabilities, and what each address answers. */
function theProbe(targets: string[]): string[] {
  const script = [
    'const n = require("net"), fs = require("fs"), cp = require("child_process")',
    'const r = cp.spawnSync("ip", ["route", "add", "192.0.2.1/32", "dev", "eth0"], { encoding: "utf8" })',
    'const cap = fs.readFileSync("/proc/self/status", "utf8").split("\\n").find((l) => l.startsWith("CapEff:")).split(/\\s+/)[1]',
    'console.log(JSON.stringify({ uid: process.getuid(), routeAdded: r.status === 0, capEff: cap }))',
    ';(async () => { for (const x of process.argv.slice(1)) { const [h, p] = x.split(":"); await new Promise((done) => { const s = n.connect({ host: h, port: Number(p) }); s.setTimeout(2000, () => { console.log(JSON.stringify({ x, took: false })); s.destroy(); done() }); s.on("connect", () => { console.log(JSON.stringify({ x, took: true })); s.destroy(); done() }); s.on("error", () => { console.log(JSON.stringify({ x, took: false })); done() }) }) } })()',
  ].join('\n')
  return ['node', '-e', script, ...targets]
}

/**
 * THE SETTINGS A GATED CONTAINER IS MADE WITH, as tools/sandbox.mjs makes an isolated run's: IPv6 off, and the
 * reverse-path filter off from the same list the launcher reads (problem roHECcQU9Fmq). The gate stops with 94 or 95
 * without them.
 */
const THE_SYSCTLS = ['--sysctl', 'net.ipv6.conf.all.disable_ipv6=1', ...THE_REVERSE_PATH_FILTER_OFF.flatMap((one) => ['--sysctl', one])]

function docker(args: string[]): { status: number; out: string; err: string } {
  const ran = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 })
  return { status: ran.status ?? 1, out: ran.stdout ?? '', err: ran.stderr ?? '' }
}

const theGatedRun = (gate: string[], command: string[], extra: string[] = THE_SYSCTLS): { status: number; out: string; err: string } =>
  docker([
    'run', '--rm', '--init', '--user', '0', '--network', 'bridge', '--cap-add', 'NET_ADMIN', ...extra,
    '--dns', '1.1.1.1', '--dns', '8.8.8.8', '--mount', `type=bind,source=${GATE},target=/opt/mole-office/isolated-gate.mjs,readonly`,
    '--entrypoint', 'node', IMAGE, '/opt/mole-office/isolated-gate.mjs', '--as', '1000:1000', ...gate, '--', ...command,
  ])

const lines = (out: string): Record<string, unknown>[] =>
  out.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>]
    } catch {
      return []
    }
  })

beforeAll(async () => {
  if (IMAGE === '') return
  own = Object.values(networkInterfaces()).flatMap((one) => (one ?? []).filter((e) => e.family === 'IPv4' && !e.internal).map((e) => e.address))
  offTheBridges = Object.entries(networkInterfaces())
    .filter(([name]) => !/^(docker|br-|veth)/.test(name))
    .flatMap(([, one]) => (one ?? []).filter((e) => e.family === 'IPv4' && !e.internal).map((e) => e.address))
  listener = createServer((socket) => socket.end('a stand-in for the office\n'))
  await new Promise<void>((ok) => listener?.listen(0, '0.0.0.0', ok))
  port = (listener.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((ok) => (listener === null ? ok() : listener.close(() => ok())))
})

describe.skipIf(IMAGE === '')(`the isolated run's gate in a real container of ${IMAGE || 'an image ISOLATED_GATE_IMAGE names'}`, () => {
  it('1: runs the command as 1000:1000 with no capability, unable to add a route, and reaching nothing of this machine', () => {
    expect(own.length, 'this machine carries no address but loopback').toBeGreaterThan(0)
    const targets = own.map((address) => `${address}:${String(port)}`)
    const ran = theGatedRun(
      [...INSIDE.flatMap((r) => ['--blackhole', r]), ...own.flatMap((a) => ['--blackhole', `${a}/32`]), ...targets.flatMap((t) => ['--unreachable', t]), '--resolve', 'api.anthropic.com'],
      theProbe(targets),
    )
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).toContain('the command runs as 1000:1000 with no capabilities')
    const said = lines(ran.out)
    expect(said[0]).toMatchObject({ uid: 1000, routeAdded: false, capEff: '0000000000000000' })
    const answers = said.filter((one) => 'x' in one)
    expect(answers).toHaveLength(targets.length)
    expect(answers.filter((one) => one['took'] === true), 'this machine answered the isolated command').toEqual([])
  }, 180_000)

  it('2: the same image without the gate reaches the listener on every address (the control)', () => {
    const targets = own.map((address) => `${address}:${String(port)}`)
    const ran = docker(['run', '--rm', '--network', 'bridge', '--entrypoint', 'node', IMAGE, ...theProbe(targets).slice(1)])
    expect(ran.status, ran.err).toBe(0)
    const answers = lines(ran.out).filter((one) => 'x' in one)
    expect(answers.every((one) => one['took'] === true), `not every address answered without the gate: ${ran.out}`).toBe(true)
  }, 180_000)

  it('3: stops with 91 before the command when an address it must find unreachable answers', () => {
    // AN ADDRESS OFF DOCKER'S BRIDGES: one on the container's own link is closed by the gate whatever it is asked.
    const target = `${offTheBridges[0] ?? own[0] ?? '127.0.0.1'}:${String(port)}`
    const ran = theGatedRun(['--blackhole', '198.51.100.0/24', '--unreachable', target], ['sh', '-c', 'echo THE COMMAND RAN'])
    expect(ran.status).toBe(91)
    expect(ran.err).toContain('took a connection, so this machine could still be reached')
    expect(ran.out).not.toContain('THE COMMAND RAN')
  }, 180_000)

  it('4: stops with 94 before the command when IPv6 is on in the container', () => {
    const ran = theGatedRun(['--blackhole', '198.51.100.0/24'], ['sh', '-c', 'echo THE COMMAND RAN'], ['--sysctl', 'net.ipv6.conf.all.disable_ipv6=0'])
    expect(ran.status).toBe(94)
    expect(ran.out).not.toContain('THE COMMAND RAN')
  }, 180_000)

  it("5: shuts out every other container on its own link, which the same image with no gate reaches", () => {
    const neighbour = docker(['run', '-d', '--rm', '--network', 'bridge', '--entrypoint', 'node', IMAGE, '-e', "require('net').createServer((s) => s.end('a neighbour\\n')).listen(4567)"])
    expect(neighbour.status, neighbour.err).toBe(0)
    const id = neighbour.out.trim()
    try {
      // ITS ADDRESS ON THE BRIDGE, read per network: docker 29 no longer fills the top-level NetworkSettings.IPAddress.
      const at = docker(['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id]).out.trim()
      expect(at).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/)
      const target = `${at}:4567`
      // THE CONTROL FIRST, asked again until the neighbour listens: the same image with no gate reaches it.
      let reached = false
      for (let tries = 0; tries < 20 && !reached; tries += 1) {
        const control = docker(['run', '--rm', '--network', 'bridge', '--entrypoint', 'node', IMAGE, ...theProbe([target]).slice(1)])
        reached = lines(control.out).some((one) => one['x'] === target && one['took'] === true)
      }
      expect(reached, 'the neighbour never answered the same image with no gate').toBe(true)
      const ran = theGatedRun(['--blackhole', '198.51.100.0/24', '--resolve', 'api.anthropic.com'], theProbe([target]))
      expect(ran.status, ran.err).toBe(0)
      expect(ran.err).toContain("of them the container's own link")
      expect(lines(ran.out).filter((one) => 'x' in one), 'a neighbour on the same link answered the gated command').toEqual([{ x: target, took: false }])
    } finally {
      docker(['rm', '-f', id])
    }
  }, 180_000)

  it('6: gives the command the home it is handed, and stops with 93 when that is not a folder', () => {
    // IT WRITES THERE, as a run's tools do: a home it cannot write is what stopped T6's opencode runs.
    const probe = ['node', '-e', "require('fs').writeFileSync(require('path').join(process.env.HOME, 'written-by-the-command'), 'x'); console.log(JSON.stringify({ home: process.env.HOME, uid: process.getuid() }))"]
    const ran = theGatedRun(['--home', '/tmp', '--blackhole', '198.51.100.0/24'], probe)
    expect(ran.status, ran.err).toBe(0)
    expect(lines(ran.out)[0], 'the command does not run in the home it was handed').toEqual({ home: '/tmp', uid: 1000 })
    const missing = theGatedRun(['--home', '/no-such-folder', '--blackhole', '198.51.100.0/24'], ['sh', '-c', 'echo THE COMMAND RAN'])
    expect(missing.status).toBe(93)
    expect(missing.err).toContain('The home folder /no-such-folder is not there')
    expect(missing.out).not.toContain('THE COMMAND RAN')
  }, 180_000)

  it('7: the first process in the container that runs as 1000 is the command, not the root processes before it', () => {
    const started = docker([
      'run', '-d', '--rm', '--init', '--user', '0', '--network', 'bridge', '--cap-add', 'NET_ADMIN', ...THE_SYSCTLS,
      '--dns', '1.1.1.1', '--dns', '8.8.8.8', '--mount', `type=bind,source=${GATE},target=/opt/mole-office/isolated-gate.mjs,readonly`,
      '--entrypoint', 'node', IMAGE, '/opt/mole-office/isolated-gate.mjs', '--as', '1000:1000', '--home', '/tmp', '--blackhole', '198.51.100.0/24',
      '--', 'sleep', '60',
    ])
    expect(started.status, started.err).toBe(0)
    const id = started.out.trim()
    try {
      const first = Number(docker(['inspect', '--format', '{{.State.Pid}}', id]).out.trim())
      expect(first, 'docker names no first process').toBeGreaterThan(0)
      let command: number | null = null
      for (let tries = 0; tries < 50 && command === null; tries += 1) {
        command = theFirstProcessRunningAs(first, 1000)
        if (command === null) spawnSync('sleep', ['0.2'])
      }
      expect(command, 'no process in the container runs as 1000').not.toBeNull()
      expect(command, "the walk answered the container's own first process").not.toBe(first)
      expect(readFileSync(`/proc/${String(command)}/cmdline`, 'utf8').split('\0')[0]).toBe('sleep')
      expect(/^Uid:\s+0\s/m.test(readFileSync(`/proc/${String(first)}/status`, 'utf8')), "the container's first process does not run as root").toBe(true)
    } finally {
      docker(['rm', '-f', id])
    }
  }, 180_000)

  it("8: answers this machine's ARP, so this machine can deliver the run's traffic, while nothing of this machine answers the command", () => {
    // PROBLEM roHECcQU9Fmq. With the reverse-path filter on, the gated container dropped this machine's ARP requests,
    // because they come from the gateway, whose address is blackholed; this machine's entry for the container went to
    // FAILED, and every ~45 s the run's traffic was dropped until the container spoke first. Gated here exactly as case 1.
    const targets = own.map((address) => `${address}:${String(port)}`)
    const started = docker([
      'run', '-d', '--rm', '--init', '--user', '0', '--network', 'bridge', '--cap-add', 'NET_ADMIN', ...THE_SYSCTLS,
      '--dns', '1.1.1.1', '--dns', '8.8.8.8', '--mount', `type=bind,source=${GATE},target=/opt/mole-office/isolated-gate.mjs,readonly`,
      '--entrypoint', 'node', IMAGE, '/opt/mole-office/isolated-gate.mjs', '--as', '1000:1000', '--home', '/tmp',
      ...INSIDE.flatMap((r) => ['--blackhole', r]), ...own.flatMap((a) => ['--blackhole', `${a}/32`]), ...targets.flatMap((t) => ['--unreachable', t]),
      '--', 'sleep', '60',
    ])
    expect(started.status, started.err).toBe(0)
    const id = started.out.trim()
    try {
      // THE GATE HAS FINISHED once the command runs as 1000: its blackholes are in place and checked.
      const first = Number(docker(['inspect', '--format', '{{.State.Pid}}', id]).out.trim())
      let command: number | null = null
      for (let tries = 0; tries < 100 && command === null; tries += 1) {
        command = theFirstProcessRunningAs(first, 1000)
        if (command === null) spawnSync('sleep', ['0.2'])
      }
      expect(command, 'the gate never started the command').not.toBeNull()
      const address = docker(['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', id]).out.trim()
      // A PING MAKES THIS MACHINE ASK FOR THE CONTAINER'S ADDRESS. Its replies go into a blackhole; the ARP is what counts.
      spawnSync('ping', ['-c', '2', '-W', '1', address], { encoding: 'utf8' })
      // SETTLED, NOT THE STATES ON THE WAY. The entry this machine made from the container's own ARP starts STALE, and the
      // ping takes it through DELAY and PROBE; only then is it REACHABLE (the container answered) or FAILED (it did not).
      // The first version of this case stopped at STALE and passed with the filter on (isi-real.sh, round 1).
      let state = ''
      for (let tries = 0; tries < 80; tries += 1) {
        state = spawnSync('ip', ['neigh', 'show', address], { encoding: 'utf8' }).stdout ?? ''
        if (/REACHABLE|FAILED|INCOMPLETE/.test(state)) break
        spawnSync('sleep', ['0.25'])
      }
      expect(state, "this machine's ARP to the gated container went unanswered").toMatch(/REACHABLE/)
    } finally {
      docker(['rm', '-f', id])
    }
  }, 180_000)

  it('9: stops with 95 before the command when the reverse-path filter is on', () => {
    const ran = theGatedRun(['--blackhole', '198.51.100.0/24'], ['sh', '-c', 'echo THE COMMAND RAN'], ['--sysctl', 'net.ipv6.conf.all.disable_ipv6=1', '--sysctl', 'net.ipv4.conf.all.rp_filter=1'])
    expect(ran.status).toBe(95)
    expect(ran.err).toContain('The reverse-path filter is on for')
    expect(ran.out).not.toContain('THE COMMAND RAN')
  }, 180_000)
})

describe.skipIf(IMAGE !== '')("the isolated run's gate in a real container", () => {
  it('is not tried unless ISOLATED_GATE_IMAGE names an image', () => {
    expect(IMAGE).toBe('')
  })
})
