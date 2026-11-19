// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FREE PORT BELOW THE EPHEMERAL RANGE, for a test that starts a server of its own on a port it chose.
 *
 * Linux hands a port of its ephemeral range to every listen on port 0 and every outgoing connection. A port in that
 * range that a test found free and let go of can be taken by any other program before the test's server binds it, and
 * a port a server let go of can be taken before the same server starts on it again: problem TwxvC6hW0dY2, where a
 * restart found port 41615 taken by something its own office had never registered. A port below the range is taken only
 * by a program that names it.
 *
 * The port is picked at random in the lower half of the ports below the range, as tests/stable-upgrade-fixture.ts picks
 * its band, and is never a port the live-office guard refuses, as tools/live-office-ports.mjs reads them. It is checked free and
 * let go of, so the caller binds it.
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'

function isFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer()
    probe.on('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })
}

/** A free port below the ephemeral range, never one of `exclude`. */
export async function aFreePortBelowTheEphemeralRange(exclude: number[] = []): Promise<number> {
  // The lowest port of the machine's ephemeral range, from which Linux picks a port for a listen on port 0.
  const rangeStarts = Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
  if (!Number.isInteger(rangeStarts) || rangeStarts <= 2048) {
    throw new Error('The ephemeral range could not be read, so no port below it can be picked.')
  }
  const lowest = Math.floor(rangeStarts / 2)
  const guarded = new Set([...thePortsATestKeepsOff(), ...exclude])
  for (let tries = 0; tries < 200; tries++) {
    const port = lowest + Math.floor(Math.random() * (rangeStarts - lowest))
    if (!guarded.has(port) && (await isFree(port))) return port
  }
  throw new Error(`No free port was found below the ephemeral range, from ${String(lowest)} to ${String(rangeStarts - 1)}, in 200 tries.`)
}
