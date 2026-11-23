// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP STABLE OFFICE OF tests/stable-upgrade-fixture.ts ANSWERS ON A PORT OF ITS OWN, OR THE FIXTURE STOPS.
 *
 * WHAT WENT WRONG, MEASURED. tests/a-crashed-stable-upgrade-resumes-while-it-migrates-and-checks.test.ts went red in a
 * whole-suite run and was green alone on the same tree. Its upgrade never reached its crash point: the upgrade's first
 * check of the configuration read /proc/<the recorded group>/stat and found nothing. The fixture's port() let Linux
 * pick a port for a listen on port 0 and let it go at once. Linux picks that port from its ephemeral range, which it
 * also hands every other listen on port 0 and every outgoing connection. Under load another office took the port before
 * the made-up office listened, so the made-up office ended. The fixture's wait took the other office's answer as its
 * own and went on with a group that had ended. A scratch run that put another office on the fixture's first port gave
 * the same error, from the same lines of tools/stable/stable-upgrade-transaction.mjs.
 *
 * WHAT IS CLAIMED HERE.
 *   1. The fixture's two ports are below the machine's ephemeral range, where no listen on port 0 and no outgoing
 *      connection lands, and neither is a port the live-office guard refuses. The made-up office answers on its port,
 *      and its answer names the fixture's own database.
 *   2. When another office answers on the fixture's port, the fixture stops and says so. It never returns a
 *      configuration whose recorded office is not the one answering.
 *   3. Another program that listens on the release-check port once the upgrade has checked that it is free is refused,
 *      and the upgrade publishes. Where nothing holds the port, that listen takes it, the release check reaches that
 *      program instead of the new version, and the upgrade ends "unchanged".
 *   4. A port another address of this machine listens on is never the fixture's: the holder is not handed it, and
 *      neither the holder nor the probe returns it. The upgrade asks ss for a listener on any address, so a port a
 *      loopback bind takes can still be one it refuses as "still occupied". When the machine has no IPv4 address but
 *      its loopback, the case is skipped and says so.
 *
 * WHAT IS SIMULATED. Only the moment another office takes the port, and case 4's draws of Math.random.
 * node:child_process's spawn is wrapped so that, when case 2 asks, the next program the fixture starts to hold a port
 * is another office instead. It listens without reusePort on the first of the holder's ports it can, says that port as
 * the holder does, and answers /api/health as a made-up office does, naming another database, and nothing else. The
 * made-up office, its supervisor and the port check are real. Case 3's other program is a plain listen in this process,
 * made when the upgrade's first step starts; the upgrade is the real one. Case 4 gives two picks the same draws of
 * Math.random, so the second pick draws the ports of the first. Between them, the port the first holder took is let go
 * and a plain listen in this process takes it on the machine's first IPv4 address that is not its loopback. The holder,
 * the probe and the listen are real.
 *
 * MUTATIONS (each after a control run, then restored):
 *   1. theBand takes its ports from the ephemeral range → case 1 goes red on the service port.
 *   2. startOld takes any healthy answer on its port → case 2 goes red: the fixture goes on, and fails later on the
 *      other office's missing runtime answer, not with the sentence about another office.
 *   3. The fixture's holder lets its port go once it has said it → case 3 goes red: the other program's listen takes the
 *      release-check port, and the upgrade ends "unchanged".
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import type { Server } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createServer as createAnHttpServer } from 'node:http'
import { theHandedDownPorts } from '../tools/live-office-guard.mjs'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { heldPort, port, remember, stableUpgradeFixture } from './stable-upgrade-fixture.ts'

/** Case 2 arms this; the next program the fixture starts to hold a port is then `ANOTHER_OFFICE`, on `port`. */
const taken = vi.hoisted(() => ({ armed: false, port: 0 }))

/** Each holder the fixture started in this case, in order: the ports it was handed and the holder itself. */
const holders = vi.hoisted(() => [] as Array<{ ports: number[], child: ChildProcess }>)

/** The database the other office names in its answer. It is never opened. */
const ANOTHER_DATABASE = vi.hoisted(() => '/nonexistent/another-office.sqlite')

/** Another office, handed the holder's ports. It ends when its standard input ends, as the holder does. */
const ANOTHER_OFFICE = vi.hoisted(() => `const http=require('node:http'),ports=process.argv.slice(1).map(Number);
const next=i=>{if(i>=ports.length){console.log('none');process.exit(1)}
const office=http.createServer((request,response)=>{response.setHeader('content-type','application/json');if(request.url!=='/api/health'){response.statusCode=404;return response.end('{}')}
response.end(JSON.stringify({ok:true,diagnostic:'schema ready',world:{database:${JSON.stringify(ANOTHER_DATABASE)},port:ports[i]}}))});
office.once('error',()=>next(i+1));office.listen(ports[i],'127.0.0.1',()=>console.log(ports[i]))};
next(0);process.stdin.resume();process.stdin.on('end',()=>process.exit(0));`)

vi.mock('node:child_process', async (importOriginal) => {
  const childProcess = await importOriginal<typeof import('node:child_process')>()
  const spawn = ((command: string, args: readonly string[], options: SpawnOptions) => {
    if (!taken.armed || command !== 'python3') {
      const child = childProcess.spawn(command, args, options)
      if (command === 'python3') holders.push({ ports: args.slice(2).map(Number), child })
      return child
    }
    taken.armed = false
    const office = childProcess.spawn(process.execPath, ['-e', ANOTHER_OFFICE, ...args.slice(2)], options)
    office.stdout?.once('data', (chunk: Buffer) => { taken.port = Number(String(chunk).split('\n')[0]) })
    return office
  }) as typeof childProcess.spawn
  return { ...childProcess, default: { ...childProcess, spawn }, spawn }
})

/** The lowest port of the machine's ephemeral range, from which Linux picks a port for a listen on port 0. */
const THE_EPHEMERAL_RANGE_STARTS = Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])

/** Case 3's plain listens that were not refused. */
const listening: Server[] = []

afterEach(async () => {
  taken.armed = false
  holders.length = 0
  for (const server of listening.splice(0)) await new Promise<void>((done) => server.close(() => done()))
})

/** Another program's plain listen on `port` at `address`: 'listening', or the code of its refusal. */
function aPlainListenOn(port: number, address = '127.0.0.1') {
  const server = createAnHttpServer((_, response) => response.end('{}'))
  return new Promise<string>((done) => {
    server.once('error', (error: NodeJS.ErrnoException) => done(String(error.code)))
    server.listen(port, address, () => { listening.push(server); done('listening') })
  })
}

/** The first IPv4 address of this machine that is not its loopback, or null when it has none. */
function anotherAddressOfThisMachine(): string | null {
  for (const one of Object.values(networkInterfaces()).flat()) if (one !== undefined && one.family === 'IPv4' && !one.internal) return one.address
  return null
}

/** `pick`, with Math.random drawing from `seed` from its start, so two picks given one seed draw the same ports. */
async function withTheDrawsOf<T>(seed: number, pick: () => Promise<T>): Promise<T> {
  let state = seed >>> 0
  const random = vi.spyOn(Math, 'random').mockImplementation(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  })
  try { return await pick() } finally { random.mockRestore() }
}

it('gives the made-up office a port below the ephemeral range, and the office answering there is its own', async () => {
  expect(Number.isInteger(THE_EPHEMERAL_RANGE_STARTS), 'the ephemeral range could not be read').toBe(true)
  const f = await stableUpgradeFixture()
  const guarded = (theHandedDownPorts() ?? []).map((one) => one.port)
  for (const port of [f.config.servicePort, f.config.releaseCheckPort]) {
    expect(port).toBeGreaterThan(1024)
    expect(port).toBeLessThan(THE_EPHEMERAL_RANGE_STARTS)
    expect(guarded).not.toContain(port)
  }
  expect(f.config.releaseCheckPort).not.toBe(f.config.servicePort)
  const health = await (await fetch(`http://127.0.0.1:${f.config.servicePort}/api/health`)).json()
  expect(health.world.database).toBe(f.config.database)
}, 120_000)

it('stops, and says another office answered, when another office takes the port before the made-up office listens', async () => {
  taken.armed = true
  const error = await stableUpgradeFixture().then(
    () => null,
    (thrown: unknown) => thrown,
  )
  expect(taken.port).toBeGreaterThan(0)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toContain(`Another office answered on port ${String(taken.port)}`)
  expect((error as Error).message).toContain(ANOTHER_DATABASE)
}, 120_000)

it('refuses another program that listens on the release-check port once the upgrade has checked it, and publishes', async () => {
  const f = await stableUpgradeFixture()
  let other = ''
  const result = remember(await upgradeStable(f.config, { ...f.options, onStep: async (event: { phase: string }) => {
    f.options.onStep(event)
    if (other === '' && event.phase === 'before') other = await aPlainListenOn(f.config.releaseCheckPort)
  } }))
  expect(result.state, JSON.stringify(result)).toBe('published')
  expect(other, `another program's listen on the release-check port ${String(f.config.releaseCheckPort)}`).toBe('EADDRINUSE')
}, 120_000)

it('never takes a port another address of this machine listens on, from the holder or the probe', async (context) => {
  const address = anotherAddressOfThisMachine()
  if (address === null) {
    context.skip('This machine has no IPv4 address but its loopback, so no listener on another of its addresses can be made here.')
    return
  }
  const seed = Math.floor(Math.random() * 2 ** 32)
  const first = await withTheDrawsOf(seed, () => heldPort())
  expect(holders, 'the holders the first pick started').toHaveLength(1)
  const before = holders[0]!
  expect(before.ports, 'the ports the first holder was handed').toContain(first)
  await new Promise<void>((done) => { if (before.child.exitCode !== null || before.child.signalCode !== null) done(); else { before.child.once('exit', () => done()); before.child.stdin!.end() } })
  expect(await aPlainListenOn(first, address), `another program's listen on port ${String(first)} at another address of this machine`).toBe('listening')

  const second = await withTheDrawsOf(seed, () => heldPort())
  expect(holders, 'the holders the two picks started').toHaveLength(2)
  const after = holders[1]!
  expect(after.ports.filter((one) => before.ports.includes(one)).length, 'the second pick drew the first pick\'s ports').toBeGreaterThan(before.ports.length / 2)
  expect(after.ports, `the ports the second holder was handed, while another address listens on ${String(first)}`).not.toContain(first)
  expect(second, 'the port the second holder holds').not.toBe(first)
  expect(await withTheDrawsOf(seed, () => port()), 'the port the probe returns').not.toBe(first)
}, 60_000)
