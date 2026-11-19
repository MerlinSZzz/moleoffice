// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A SIGNAL TO A PROCESS GROUP ON LINUX AND THE MAC.
 *
 * A negative pid signals every process in the group whose number it is. This is exactly what each caller did
 * itself before the layer: `process.kill(-group, signal)`, signal 0 included, which asks whether any process of
 * the group is left. Nothing is caught here. What `process.kill` throws (ESRCH when the group has gone, EPERM when
 * it is not this user's) goes back to the caller as it is, and each caller handles it as it did before.
 */

/**
 * A START IN A GROUP is Node's own: `detached: true` makes the program the leader of a new group,
 * whose number is its pid. The way to start it is handed back as it came, so every caller's spawn on
 * Linux and the Mac is exactly what it was before the layer. The gentle stop is SIGTERM.
 *
 * AN ASK TO STOP IS SIGTERM TO THE GROUP, the same call the stops made before the layer, and a
 * program hears it as SIGTERM, so it listens for nothing more.
 *
 * @returns {import('./the-system.mjs').Groups}
 */
export function posixGroups() {
  /** @type {import('./the-system.mjs').Groups} */
  const groups = {
    gentleStop: 'SIGTERM',
    howToStartInItsOwnGroup(way) {
      return { ...way, detached: true }
    },
    // A COMMAND IS STARTED AS ITS CALLER DECLARES IT, and a bare word is found on the PATH, as before the layer.
    theProgramToStart(command) {
      return command
    },
    signal(group, signal) {
      process.kill(-group, signal)
    },
    // What the signal throws is thrown back as it is, so a caller keeps its own handling of ESRCH and EPERM.
    async askToStop(group) {
      groups.signal(group, 'SIGTERM')
    },
    listenForAStopRequest() {
      return null
    },
    // THE PROCESS TABLE SAYS WHICH GROUP A PROCESS IS IN, and a program started in a group leads it, so nothing here asks.
    jobObjects: null,
  }
  return groups
}
