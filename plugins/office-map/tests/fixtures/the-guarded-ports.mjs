// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Which ports a test world of this plugin may not use: the ones the live office guard refuses.
 *
 * WHAT IT IS FOR. The test worlds and the browser fixture must never take a live office's port. They
 * ask this file, so no live office's port number is written anywhere in the plugin.
 *
 * WHERE THE RECORD COMES FROM. The live office guard, tools/live-office-guard.mjs at the repository
 * root, keeps its list at globalThis[Symbol.for('mole-office.live-office-guard')] as
 * { ports: [{ port, said }] }, where `said` is the sentence saying where that port came from. The
 * plugin's test command and tools/check-a-plugin.mjs install the guard in every test process. The
 * record is read each time a port is asked about, never when this file loads, because a second
 * install of the guard replaces the list.
 *
 * WHAT A NULL MEANS. A port that is null is one the guard's source named but could not read. The
 * guard then refuses every port on this machine, and this file refuses every port too.
 *
 * WHY IT IMPORTS NOTHING. The plugin may import nothing from outside its own folder, so it cannot
 * import the guard. The record is on globalThis, so this file needs no import to read it.
 */

const GUARD = Symbol.for('mole-office.live-office-guard')

/** The guard's list, read now. It throws when no guard is installed, or when its record is not { ports: [{ port, said }] }. */
function theGuardedPorts() {
  const record = globalThis[GUARD]
  if (record === undefined) {
    throw new Error('No live office guard is installed in this process, so it cannot tell which ports belong to a live office. A plugin tool started by hand runs as `node --import tools/live-office-guard-preload.mjs <the tool>`, from the repository root.')
  }
  const ports = record?.ports
  // An empty list is refused as the guard refuses one handed down to it: a guard with no port cannot say what it guards.
  const whole = Array.isArray(ports) && ports.length > 0 &&
    ports.every(one => one !== null && typeof one === 'object' && (one.port === null || Number.isInteger(one.port)) && typeof one.said === 'string')
  if (!whole) {
    throw new Error("The live office guard's record in this process is not a list of ports, each { port, said }, so it cannot tell which ports belong to a live office.")
  }
  return ports
}

/** Throw when the live office guard refuses `port`, and return when it does not. The guard refuses a port its
 * list holds, and every port when its list holds a null. The error begins with `message` and carries the
 * `said` of each entry that refused the port. */
export function refuseALiveOfficePort(port, message) {
  if (!Number.isInteger(port)) throw new TypeError(`${message}: ${String(port)} is not a whole number, so it cannot be checked against the live office guard.`)
  const because = theGuardedPorts().filter(one => one.port === null || one.port === port)
  if (because.length === 0) return
  const why = because.some(one => one.port === null)
    ? "the live office guard could not read one of a live office's ports, so it refuses every port"
    : `port ${port} is a live office's port, so the live office guard refuses it`
  throw new Error(`${message}: ${why}. ${because.map(one => one.said).join(' ')}`)
}
