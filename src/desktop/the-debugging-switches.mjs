// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WINDOW REFUSES TO START WITH A DEBUGGING SWITCH (wave 13t, round 23).
 *
 * A program running as the same user could start the window with --remote-debugging-port or --inspect,
 * and then drive the real window through Chromium's or Node's debugger: read its pages, and press what a
 * person presses. The check MwbO4MkkQOGi judged that inside the office's existing boundary, and asked for
 * this refusal as hardening. So the window refuses to start, in words, on a Mac and on Linux alike, when
 * it is given any switch below, or when Node's inspector is already open (NODE_OPTIONS=--inspect opens
 * it with no switch on the command line). The developer setting MOLE_OFFICE_WINDOW_DEBUGGING=on allows
 * them; the tests that drive the window through Playwright or the inspector set it.
 *
 * WHAT IT DOES NOT CLOSE. A program of the same user can set that setting too, change the checkout's
 * code, or read the window's memory. This removes one easy door, not the boundary: on Linux a same-user
 * program is still taken as the owner's own (src/server/lib/from-a-sandbox.ts), and on a Mac it can do
 * the same things outside the window. Chromium opens its debugging port before this code runs, so the
 * port is open for the moment between the start and the refusal; and --inspect-brk stops before this
 * code runs at all. An installed app has Node's inspector switches turned off by its fuse as well
 * (scripts/package-linux.mjs, ELECTRON'S FUSES).
 *
 * IT IMPORTS NO ELECTRON, so a test can stand the platform in and ask it directly.
 */

/**
 * THE SWITCHES THE WINDOW REFUSES, as Chromium's command line names them (without dashes). Chromium also
 * reads a switch written with one dash, and `app.commandLine.hasSwitch` answers for both, measured on
 * Electron in this checkout on 6 October 2026.
 *
 * - remote-debugging-port, remote-debugging-pipe: Chromium's DevTools protocol, which drives every page.
 * - inspect, inspect-brk, inspect-wait: Node's inspector in the window's main process.
 * - inspect-port: where Node's inspector listens once a signal opens it.
 * - inspect-brk-node: Electron's own form of inspect-brk.
 */
export const THE_DEBUGGING_SWITCHES = Object.freeze([
  'remote-debugging-port',
  'remote-debugging-pipe',
  'inspect',
  'inspect-brk',
  'inspect-wait',
  'inspect-port',
  'inspect-brk-node',
])

/** The developer setting that allows them, declared in src/config/settings.mjs. */
export const THE_DEBUGGING_SETTING = 'MOLE_OFFICE_WINDOW_DEBUGGING'

/**
 * WHY THE WINDOW REFUSES TO START, in words, or null when it may start.
 *
 * @param {{
 *   platform: string,
 *   hasSwitch: (name: string) => boolean,
 *   inspectorUrl: string | undefined,
 *   setting: string,
 *   envFile: string,
 * }} asked `hasSwitch` is Electron's `app.commandLine.hasSwitch`; `inspectorUrl` is `inspector.url()`;
 *   `setting` is the value of MOLE_OFFICE_WINDOW_DEBUGGING; `envFile` is the .env file the settings read.
 * @returns {string | null}
 */
export function whyTheWindowRefusesToStart({ platform, hasSwitch, inspectorUrl, setting, envFile }) {
  if (setting === 'on') return null
  const given = THE_DEBUGGING_SWITCHES.filter((name) => hasSwitch(name)).map((name) => `--${name}`)
  const open = inspectorUrl !== undefined
  if (given.length === 0 && !open) return null
  const what =
    given.length > 0
      ? `it was given ${given.length === 1 ? 'the debugging switch' : 'the debugging switches'} ${given.join(', ')}`
      : `Node's inspector is already open at ${inspectorUrl} (NODE_OPTIONS can open it with no switch)`

  return (
    `Mole Office will not start, because ${what}. A debugging switch lets any program on this computer read ` +
    `and press everything in the window. Start it without the switch. To allow debugging, use Settings. Open Office controls on the Settings page, find ${THE_DEBUGGING_SETTING}, choose on and press Save value. Then open the window again.`
  )
}

/**
 * KEEP THE INSPECTOR SHUT WHILE THE WINDOW RUNS. Node opens its inspector when the process is sent
 * SIGUSR1, unless something listens for that signal; measured on Electron in this checkout on 6 October
 * 2026: the inspector opened at 127.0.0.1:9229 without a listener, and stayed shut with one. So the
 * window listens, and says each time that it kept the inspector shut. Not called when the setting allows
 * debugging.
 *
 * @param {NodeJS.Process} proc
 */
export function keepTheInspectorShut(proc) {
  proc.on('SIGUSR1', () => {
    proc.stderr.write(`Mole Office was sent SIGUSR1, which opens Node's inspector, and kept it shut. ${THE_DEBUGGING_SETTING}=on allows it.\n`)
  })
}
